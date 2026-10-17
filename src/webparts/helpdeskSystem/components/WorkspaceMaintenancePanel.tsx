import * as React from 'react';
import { Checkbox, DefaultButton, Dialog, DialogFooter, Icon, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { maintenancePhrase } from '../services/WorkspaceMaintenanceService';
import type { MaintenanceAction, MaintenanceList } from '../services/WorkspaceMaintenanceService';
import { cancelButtonStyles } from './cancelButtonStyles';
import styles from './WorkspaceMaintenancePanel.module.scss';
const titles = {clear:'Clear list items', drop:'Delete application lists', reset:'Reset saved list bindings'};
const icons = {clear:'Settings', drop:'Delete', reset:'Refresh'};
export function WorkspaceMaintenancePanel(props: {service:ITicketDataSource}): React.ReactElement | null {
  const [lists,setLists] = React.useState<MaintenanceList[]>([]);
  const [available,setAvailable] = React.useState<number>();
  const [selected,setSelected] = React.useState<string[]>([]);
  const [action,setAction] = React.useState<MaintenanceAction>();
  const [targets,setTargets] = React.useState<MaintenanceList[]>([]);
  const [query,setQuery] = React.useState('');
  const [phrase,setPhrase] = React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [reviewed,setReviewed] = React.useState(false);
  const [attempted,setAttempted] = React.useState(false);
  const [finished,setFinished] = React.useState(false);
  const [error,setError] = React.useState('');
  const [messages,setMessages] = React.useState<string[]>([]);
  const lock = React.useRef(false);
  const service = props.service.workspaceMaintenance;
  if (!service || !props.service.access?.superAdmin) return null;
  const checkAvailability = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {const values = await service.lists(); setAvailable(values.length);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to check application lists.');}
    finally {lock.current = false; setBusy(false);}
  };
  const open = async (value:MaintenanceAction): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setAction(value); setReviewed(false); setAttempted(false); setFinished(false); setPhrase(''); setQuery(''); setSelected([]); setTargets([]); setLists([]); setError(''); setMessages([]);
    try {
      if (value === 'reset') {await service.inspect(value,[]); setReviewed(true);}
      else {const values = await service.lists(); setLists(values); setAvailable(values.length);}
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to load application lists.');}
    finally {lock.current = false; setBusy(false);}
  };
  const review = async (): Promise<void> => {
    if (lock.current || !action || !selected.length) return;
    lock.current = true; setBusy(true); setError('');
    try {setTargets(await service.inspect(action,selected)); setReviewed(true);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to review maintenance.');}
    finally {lock.current = false; setBusy(false);}
  };
  const run = async (): Promise<void> => {
    if (lock.current || !action || !reviewed || phrase !== maintenancePhrase(action)) return;
    lock.current = true; setBusy(true); setError(''); setAttempted(true);
    try {await service.run(action,targets.map(list => list.Id),phrase,message => setMessages(current => [...current,message])); setFinished(true);}
    catch (reason) {setError(`${reason instanceof Error ? reason.message : 'Maintenance failed.'} Some changes may already be complete. Reload DeskPilot before reviewing another operation.`);}
    finally {lock.current = false; setBusy(false);}
  };
  const shown = (reviewed ? targets : lists).filter(list => reviewed || `${list.Title} ${list.Description || ''}`.toLowerCase().includes(query.toLowerCase()));
  const allSelected = shown.length > 0 && shown.every(list => selected.includes(list.Id));
  const selectShown = (checked:boolean): void => setSelected(current => checked ? [...new Set([...current,...shown.map(list => list.Id)])] : current.filter(id => !shown.some(list => list.Id === id)));
  const information = "Only this site's DeskPilot operational lists are included. Access settings, user roles, documents and system lists are protected.";
  const hasBindings = Boolean(props.service.workspaceSettings?.listId || Object.keys(props.service.workspaceSettings?.resourceIds || {}).length);
  const workspace = props.service.workspaceSettings;
  const bindingLabels: Record<string,string> = {tickets:workspace?.listName || 'Tickets',categories:'Ticket Categories',subcategories:'Ticket Subcategories',issueTypes:'Ticket Issue Types',priorities:'Ticket Priorities',faqs:'FAQs',access:'DeskPilot Access'};
  const bindings = [
    ...(workspace?.listId ? [{name:workspace.listName || 'Tickets',id:workspace.listId}] : []),
    ...Object.entries(workspace?.resourceIds || {}).filter(([key,id]) => key !== 'tickets' || id.toLowerCase() !== workspace?.listId?.toLowerCase()).map(([key,id]) => ({name:bindingLabels[key] || key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,letter => letter.toUpperCase()),id}))
  ];
  return <details className={styles.maintenance} onToggle={event => {if (event.currentTarget.open && available === undefined) void checkAvailability();}}>
    <summary>Advanced workspace maintenance</summary>
    {!action && <div style={{marginTop:16}}>
      {busy && <Spinner label="Checking application lists..." />}
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {available === 0 && <MessageBar>No operational application lists found. Clear and Delete are unavailable until lists exist.</MessageBar>}
    </div>}
    <div className={styles.actions}>
      {(['clear','drop','reset'] as MaintenanceAction[]).map(value => <DefaultButton key={value} text={titles[value]} iconProps={{iconName:icons[value]}} className={styles[value]} disabled={busy || (value === 'reset' ? !hasBindings : !available)} onClick={() => {void open(value);}} />)}
    </div>
    <Dialog hidden={!action} minWidth={Math.min(820,window.innerWidth - 32)} maxWidth={820} onDismiss={busy ? undefined : () => setAction(undefined)} modalProps={{isBlocking:true,styles:{main:{width:'min(820px, calc(100vw - 32px))',maxWidth:820,borderRadius:10}}}} dialogContentProps={{title:action ? <span className={styles.title}><span className={styles.titleIcon} data-danger={action === 'drop'}><Icon iconName={icons[action]} /></span><span><span className={styles.titleText}>{titles[action]}</span><span className={styles.subtitle}>{action === 'reset' ? 'Remove saved list references without deleting lists or records.' : action === 'clear' ? 'Select the lists you want to clear. Items and attachments will be moved to the SharePoint recycle bin.' : 'Select the application lists you want to delete. Lists, columns and records will be moved to the SharePoint recycle bin.'}</span></span></span> : '',showCloseButton:!busy}}>
      <div className={styles.body}>
        {finished ? <MessageBar messageBarType={MessageBarType.success}>Maintenance completed. Reload DeskPilot to use the updated configuration.</MessageBar> : <MessageBar>{information}</MessageBar>}
        {action === 'reset' ? <><h4>Saved Bindings to Be Reset</h4><div className={`${styles.tableScroll} ${styles.bindings}`}><table><thead><tr><th>List Name</th><th>List ID</th></tr></thead><tbody>{bindings.map((binding,index) => <tr key={index}><td>{binding.name}</td><td>{binding.id}</td></tr>)}</tbody></table></div>{!bindings.length && <p>No saved list IDs.</p>}</> : <>
          {!reviewed && <div className={styles.toolbar}><SearchBox placeholder="Search lists..." ariaLabel="Search application lists" value={query} disabled={busy} onChange={(_,value) => setQuery(value || '')} /><Checkbox label="Select all" ariaLabel="Select all matching lists" checked={allSelected} indeterminate={!allSelected && shown.some(list => selected.includes(list.Id))} disabled={busy || !shown.length} onChange={(_,checked) => selectShown(Boolean(checked))} /><span>{selected.length} of {lists.length} selected</span></div>}
          {reviewed && <h4>Lists that will be affected</h4>}
          <div className={styles.tableScroll}><table><thead><tr>{!reviewed && <th aria-label="Selection" />}<th aria-label="List icon" /><th>List name</th><th>Description</th><th>Items</th><th>Type</th></tr></thead><tbody>{shown.map(list => <tr key={list.Id} data-selected={reviewed || selected.includes(list.Id)}>{!reviewed && <td><Checkbox ariaLabel={`Select ${list.Title}`} checked={selected.includes(list.Id)} disabled={busy} onChange={(_,checked) => setSelected(current => checked ? [...current,list.Id] : current.filter(id => id !== list.Id))} /></td>}<td><Icon iconName="BulletedList" aria-hidden="true" /></td><td>{list.Title}</td><td>{list.Description || 'No description'}</td><td>{list.ItemCount}</td><td><span className={styles.badge}>Custom</span></td></tr>)}</tbody></table></div>
          {!busy && !shown.length && <MessageBar>No matching operational lists found. Use Reset saved list bindings if this workspace has stale IDs.</MessageBar>}
          {reviewed && <MessageBar messageBarType={MessageBarType.severeWarning}>{action === 'drop' ? 'The lists above, including their columns and records, will be deleted and their saved bindings cleared.' : 'All items and attachments in the lists above will be cleared; columns and bindings will remain.'} Connected forms, lookups and flows may be affected. Recovery depends on SharePoint retention and permissions.</MessageBar>}
        </>}
        {action && reviewed && !attempted && <TextField label={`Type ${maintenancePhrase(action)} to confirm`} value={phrase} disabled={busy} autoComplete="off" onChange={(_,value) => setPhrase(value || '')} />}
        {busy && <Spinner label={attempted ? 'Working with SharePoint resources...' : 'Checking application lists...'} />}
        {messages.length > 0 && <div role="log" aria-live="polite" className={styles.log}>{messages.map((message,index) => <p key={index}>{message}</p>)}</div>}
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      </div>
      <DialogFooter styles={{actions:{borderTop:'1px solid #e0e7f1',paddingTop:20,marginTop:20}}}>
        {!busy && <DefaultButton text={finished ? 'Close' : 'Cancel'} styles={cancelButtonStyles} onClick={() => setAction(undefined)} />}
        {!busy && attempted ? <PrimaryButton text="Reload DeskPilot" onClick={() => window.location.reload()} />
          : action && reviewed ? <PrimaryButton text={action === 'reset' ? 'Reset bindings' : action === 'clear' ? 'Clear selected lists' : 'Delete selected lists'} iconProps={{iconName:icons[action]}} disabled={busy || phrase !== maintenancePhrase(action)} styles={action === 'drop' ? {root:{background:'#b42318',borderColor:'#b42318'}} : undefined} onClick={() => {void run();}} />
          : <PrimaryButton text="Review selected lists" disabled={busy || !selected.length} onClick={() => {void review();}} />}
      </DialogFooter>
    </Dialog>
  </details>;
}
