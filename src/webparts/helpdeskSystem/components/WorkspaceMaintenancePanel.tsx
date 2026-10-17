import * as React from 'react';
import { Checkbox, DefaultButton, Dialog, DialogFooter, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { maintenancePhrase } from '../services/WorkspaceMaintenanceService';
import type { MaintenanceAction, MaintenanceList } from '../services/WorkspaceMaintenanceService';
import { cancelButtonStyles } from './cancelButtonStyles';
const titles = {clear:'Clear list items', drop:'Delete application lists', reset:'Reset saved list bindings'};
export function WorkspaceMaintenancePanel(props: {service:ITicketDataSource}): React.ReactElement | null {
  const [lists,setLists] = React.useState<MaintenanceList[]>([]);
  const [selected,setSelected] = React.useState<string[]>([]);
  const [action,setAction] = React.useState<MaintenanceAction>();
  const [targets,setTargets] = React.useState<MaintenanceList[]>([]);
  const [phrase,setPhrase] = React.useState('');
  const [busy,setBusy] = React.useState(false);
  const [reviewed,setReviewed] = React.useState(false);
  const [finished,setFinished] = React.useState(false);
  const [error,setError] = React.useState('');
  const [messages,setMessages] = React.useState<string[]>([]);
  const lock = React.useRef(false);
  const service = props.service.workspaceMaintenance;
  if (!service || !props.service.access?.superAdmin) return null;
  const load = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSelected([]);
    try {setLists(await service.lists());} catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to load lists.');}
    finally {lock.current = false; setBusy(false);}
  };
  const review = async (value:MaintenanceAction): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setAction(value); setReviewed(false); setFinished(false); setPhrase(''); setError(''); setMessages([]); setTargets([]);
    try {setTargets(await service.inspect(value,selected)); setReviewed(true);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to review maintenance.');}
    finally {lock.current = false; setBusy(false);}
  };
  const run = async (): Promise<void> => {
    if (lock.current || !action || !reviewed || phrase !== maintenancePhrase(action)) return;
    lock.current = true; setBusy(true); setError(''); setReviewed(false);
    try {await service.run(action,targets.map(list => list.Id),phrase,message => setMessages(current => [...current,message])); setFinished(true);}
    catch (reason) {setError(`${reason instanceof Error ? reason.message : 'Maintenance failed.'} Some changes may already be complete. Reload DeskPilot before reviewing another operation.`);}
    finally {lock.current = false; setBusy(false);}
  };
  return <details style={{marginTop:28,borderTop:'1px solid #e0e7f1',paddingTop:16}} onToggle={event => {if (event.currentTarget.open) void load();}}>
    <summary style={{cursor:'pointer',color:'#647694'}}>Advanced workspace maintenance</summary>
    <details style={{marginTop:16}}><summary style={{cursor:'pointer',color:'#b42318'}}>Open destructive list operations</summary>
      <p>Only this site’s DeskPilot operational lists are included. Access settings, user roles, documents and system lists are protected.</p>
      {!action && error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {busy && !action ? <Spinner label="Checking application lists..." /> : <>
        {lists.map(list => <Checkbox key={list.Id} label={`${list.Title} (${list.ItemCount} items)`} checked={selected.includes(list.Id)} disabled={busy} onChange={(_,checked) => setSelected(current => checked ? [...current,list.Id] : current.filter(id => id !== list.Id))} styles={{root:{margin:'12px 0'}}} />)}
        {!lists.length && <p>No operational application lists found. You can reset saved bindings before initializing this workspace.</p>}
        <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{(['clear','drop','reset'] as MaintenanceAction[]).map(value => <DefaultButton key={value} text={titles[value]} styles={{...cancelButtonStyles,root:{border:0,background:'transparent',color:'#b42318',padding:0,fontSize:13}}} disabled={busy || (value !== 'reset' && !selected.length)} onClick={() => {void review(value);}} />)}</div>
      </>}
    </details>
    <Dialog hidden={!action} minWidth={Math.min(680,window.innerWidth - 32)} maxWidth={680} onDismiss={busy ? undefined : () => setAction(undefined)} modalProps={{isBlocking:true}} dialogContentProps={{title:action ? titles[action] : '',showCloseButton:!busy}}>
      <p><strong>Site:</strong> {props.service.access.siteUrl}</p>
      {action === 'reset' ? <p>This removes all saved list IDs from this workspace’s configuration. It does not delete lists, items, roles or users. Reload and initialize the workspace afterward.</p> : <>
        <MessageBar messageBarType={MessageBarType.severeWarning}>{action === 'drop' ? 'The selected lists and their columns and records will be removed from this site. Their saved bindings will also be cleared.' : 'Every item and its attachments in the selected lists will be removed. Columns and list bindings will remain.'} Connected forms, lookups and flows may stop working. Resources are recycled; recovery depends on SharePoint retention and permissions.</MessageBar>
        <table style={{width:'100%',margin:'16px 0'}}><thead><tr><th style={{textAlign:'left'}}>Selected list</th><th style={{textAlign:'right'}}>Items</th></tr></thead><tbody>{targets.map(list => <tr key={list.Id}><td>{list.Title}</td><td style={{textAlign:'right'}}>{list.ItemCount}</td></tr>)}</tbody></table>
      </>}
      {action && reviewed && !busy && <TextField label={`Type ${maintenancePhrase(action)} to confirm`} value={phrase} autoComplete="off" onChange={(_,value) => setPhrase(value || '')} />}
      {busy && <Spinner label={reviewed ? 'Reviewing resources...' : 'Working with SharePoint resources...'} />}
      {messages.length > 0 && <div role="log" aria-live="polite" style={{fontFamily:'Consolas, monospace',fontSize:14,maxHeight:'30vh',overflow:'auto',marginTop:16}}>{messages.map((message,index) => <p key={index}>{message}</p>)}</div>}
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {finished && <MessageBar messageBarType={MessageBarType.success}>Maintenance completed. Reload DeskPilot to use the updated configuration.</MessageBar>}
      <DialogFooter>
        {!busy && <DefaultButton text={finished ? 'Close' : 'Cancel'} styles={cancelButtonStyles} onClick={() => setAction(undefined)} />}
        {!busy && (finished || (!reviewed && messages.length > 0) || error)
          ? <PrimaryButton text="Reload DeskPilot" onClick={() => window.location.reload()} />
          : action && <PrimaryButton text="Confirm" disabled={busy || !reviewed || phrase !== maintenancePhrase(action)} styles={{root:{background:'#b42318',borderColor:'#b42318'}}} onClick={() => {void run();}} />}
      </DialogFooter>
    </Dialog>
  </details>;
}
