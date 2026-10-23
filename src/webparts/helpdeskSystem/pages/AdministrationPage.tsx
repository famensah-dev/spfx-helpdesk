import { HelpdeskSettingsHub, type IHelpdeskSettingLink } from '../components/HelpdeskSettingsHub';
import { AutoAssignmentSetting } from '../components/AutoAssignmentSetting';
import { SupportUnitsPage } from './SupportUnitsPage';
import { MissingWorkspaceNotice } from '../components/WorkspaceSetupPanel';
import { DepartmentMembersPage } from './DepartmentMembersPage';
import { canUse } from '../services/appRoleRules';
import { SlaPrioritiesPage } from './SlaPrioritiesPage';
import { TicketSchemaWorkspace } from '../components/TicketSchemaWorkspace';
import * as React from 'react';
import { DefaultButton, PrimaryButton, IconButton, TextField, Checkbox, Dialog, DialogType, MessageBar, MessageBarType, Spinner, SpinnerSize, SearchBox, Dropdown } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { AdminPage, IAdminData, IAdminColumn, IColumnInput, IClassificationInput, IClassificationEntry } from '../interfaces/IAdministration';
import { AdminColumnForm, newColumn } from '../components/AdminColumnForm';
import { SearchableSelect } from '../components/SearchableSelect';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import { FaqPage } from './FaqPage';
import styles from '../components/HelpdeskSystem.module.scss';

const tabs: Array<{key: AdminPage | 'faqs' | 'sla' | 'members' | 'units'; text: string}> = [{key: 'schema', text: 'Ticket list schema'}, {key: 'categories', text: 'Categories'}, {key: 'subcategories', text: 'Subcategories'}, {key: 'issueTypes', text: 'Issue Types'}, {key: 'sla', text: 'SLA & Priorities'}, {key: 'faqs', text: 'Knowledge Base'}, {key: 'members', text: 'Users'}, {key: 'units', text: 'Support Teams'}];
export function AdministrationPage(props: { service: ITicketDataSource; onSettingsChanged?: () => Promise<void>; onUsersAndRoles?:()=>void }): React.ReactElement {
  const availableTabs = tabs.filter(tab => (tab.key !== 'schema' || !props.service.access || props.service.access.superAdmin) && (tab.key !== 'members' || props.service.members) && (tab.key !== 'units' || props.service.supportUnits) && (tab.key === 'units' || tab.key === 'members' || tab.key === 'schema' || canUse(props.service, tab.key === 'sla' ? 'sla' : tab.key === 'faqs' ? 'manageFaqs' : 'classifications')));
  const [page, setPage] = React.useState<AdminPage | 'faqs' | 'sla' | 'members' | 'units' | 'home' | 'assignment'>('home');
  const [data, setData] = React.useState<IAdminData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [columnInput, setColumnInput] = React.useState<IColumnInput | null>(null);
  const [columnId, setColumnId] = React.useState<string | undefined>();
  const [entryInput, setEntryInput] = React.useState<IClassificationInput | null>(null);
  const [entryId, setEntryId] = React.useState<number | undefined>();
  const [inspect, setInspect] = React.useState<IAdminColumn | null>(null);
  const [deleting, setDeleting] = React.useState<IAdminColumn | null>(null);
  const [confirmName, setConfirmName] = React.useState('');
  const [selected, setSelected] = React.useState<number[]>([]);
  const [availability, setAvailability] = React.useState('all');
  const [parentFilter, setParentFilter] = React.useState('');
  const [availabilityChange, setAvailabilityChange] = React.useState<{entries: IClassificationEntry[]; active: boolean} | null>(null);
  const lock = React.useRef(false);
  const version = React.useRef(0);
  const service = props.service.administration;
  const load = React.useCallback(async (): Promise<void> => {
    if (page === 'faqs' || page === 'sla' || page === 'members' || page === 'units' || page === 'home' || page === 'assignment') return;
    const current = ++version.current; setLoading(true); setError('');
    try { if (!service) throw new Error('Administration is not configured for this connection.'); const result = await service.getData(page); if (current === version.current) setData(result); }
    catch (reason) { if (current === version.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load administration data.'); } }
    finally { if (current === version.current) setLoading(false); }
  }, [service, page]);
  React.useEffect(() => { setData(null); setQuery(''); setSelected([]); setAvailability('all'); setParentFilter(''); setAvailabilityChange(null); setMessage(''); setColumnInput(null); setEntryInput(null); void load(); return () => { version.current++; }; }, [load]);
  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); setColumnInput(null); setEntryInput(null); setDeleting(null); setMessage(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Administration change failed.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const editColumn = (column: IAdminColumn): void => { setColumnId(column.id); setColumnInput({name: column.name, displayName: column.displayName, description: column.description || '', required: Boolean(column.required), kind: column.properties.text ? (column.properties.text.allowMultipleLines ? 'multiline' : 'text') : column.type as IColumnInput['kind'], maxLength: column.properties.text?.maxLength || 255, richText: column.properties.text?.textType === 'richText', choices: column.properties.choice?.choices || [], allowTextEntry: Boolean(column.properties.choice?.allowTextEntry), defaultValue: column.properties.defaultValue?.value, defaultFormula: column.properties.defaultValue?.formula, minimum: column.properties.number?.minimum, maximum: column.properties.number?.maximum, decimals: column.properties.number?.decimalPlaces, dateOnly: column.properties.dateTime?.format === 'dateOnly', peopleOnly: column.properties.personOrGroup?.chooseFromType !== 'peopleAndGroups', multiple: column.properties.lookup?.allowMultipleValues || column.properties.personOrGroup?.allowMultipleSelection, lookupListId: column.properties.lookup?.listId, lookupColumnName: column.properties.lookup?.columnName}); setError(''); };
  const editEntry = (entry: IClassificationEntry): void => { setEntryId(entry.id); setEntryInput({title: entry.title, active: entry.active, sortOrder: entry.sortOrder, parentId: entry.parentId}); setError(''); };
  const entries = (data?.entries || []).filter(item => (availability === 'all' || item.active === (availability === 'active')) && (!parentFilter || String(item.parentId) === parentFilter) && `${item.title} ${item.parentName || ''}`.toLowerCase().includes(query.toLowerCase()));
  React.useEffect(() => { setSelected([]); }, [query, availability, parentFilter]);
  const settingDescriptions:Record<string,{description:string;icon:string;group:string}>={
    units:{description:'Create support teams, add members and choose a team lead.',icon:'People',group:'People & Teams'},
    members:{description:'Manage helpdesk users and their application access.',icon:'Contact',group:'People & Teams'},
    categories:{description:'Organize tickets and choose which team handles each category.',icon:'Tag',group:'Ticket Configuration'},
    subcategories:{description:'Manage the detailed classifications used on tickets.',icon:'BulletedTreeList',group:'Ticket Configuration'},
    issueTypes:{description:'Manage the issue types available when creating tickets.',icon:'BulletedList',group:'Ticket Configuration'},
    sla:{description:'Set priorities and response and resolution targets.',icon:'Clock',group:'Ticket Configuration'},
    faqs:{description:'Manage published answers and your support knowledge base.',icon:'ReadingMode',group:'Knowledge Base'},
    schema:{description:'Manage SharePoint ticket columns. Super Admin only.',icon:'Database',group:'Advanced'}
  };
  const hubLinks:IHelpdeskSettingLink[]=availableTabs.map(tab=>({key:tab.key,title:tab.text,...settingDescriptions[tab.key]}));
  if(props.service.supportUnits)hubLinks.push({key:'assignment',title:'Auto Assignment',description:'Enable category-based assignment through support teams.',icon:'Flow',group:'Automation'});
  if(props.service.roleManagement && props.onUsersAndRoles)hubLinks.push({key:'usersRoles',title:'Users & Roles',description:'Manage app access and role permissions. Super Admin only.',icon:'Permissions',group:'People & Teams'});
  if(page==='home')return <section className={styles.secondaryPage}><HelpdeskSettingsHub links={hubLinks} onOpen={key=>{if(key==='usersRoles')props.onUsersAndRoles?.();else setPage(key as typeof page);}} /></section>;
  const modal = {isBlocking: true, styles: {main: {width: 'min(760px, calc(100vw - 32px))', maxWidth: 760, borderRadius: 6, selectors: {'@media (min-width: 480px)': {width: 'min(760px, calc(100vw - 32px))', maxWidth: 760}}}}};
  return <section className={styles.secondaryPage}>
    <div className={styles.administrationHeader}><DefaultButton text="Helpdesk settings" iconProps={{iconName:'Back'}} styles={cancelButtonStyles} disabled={busy} onClick={()=>setPage('home')} /><h2 className={styles.toolbarTitle}>{hubLinks.find(link=>link.key===page)?.title || 'Helpdesk settings'}</h2></div>
    {page === 'assignment' ? <AutoAssignmentSetting service={props.service} /> : page === 'units' ? <SupportUnitsPage service={props.service} /> : page === 'members' ? <DepartmentMembersPage service={props.service} /> : page === 'sla' ? <SlaPrioritiesPage canSetup={!props.service.access || props.service.access.superAdmin} service={props.service.sla} onChanged={props.onSettingsChanged} /> : page === 'faqs' ? <FaqPage service={props.service} manage /> : <>
      <MissingWorkspaceNotice service={props.service} error={error} />
    {error && !columnInput && !entryInput && !deleting && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
      <div className={styles.ticketListCard}>
        {loading ? <Spinner label="Loading administration…" /> : data?.canManage && <>
          {page === 'schema' && service ? <TicketSchemaWorkspace data={data} service={service} busy={busy} input={columnInput} editing={Boolean(columnId)} error={error} onInput={value => { setColumnInput(value); if (!value) setError(''); }} onNew={() => { setColumnId(undefined); setColumnInput({...newColumn}); setError(''); }} onEdit={editColumn} onInspect={setInspect} onDelete={column => { setDeleting(column); setConfirmName(''); setError(''); }} onSave={() => { if (columnInput) void run(() => service.saveColumn(columnInput, columnId), 'Column saved.'); }} onRefresh={() => { void load(); }} onError={setError} /> : <>
          <div className={styles.ticketToolbar}><div className={styles.ticketControls}><SearchBox showIcon iconProps={{iconName: 'Search'}} ariaLabel="Search administration" placeholder={page === 'schema' ? 'Search columns' : 'Search entries'} value={query} onChange={(_, value) => setQuery(value || '')} /><Dropdown ariaLabel="Availability filter" selectedKey={availability} options={[{key: 'all', text: 'All statuses'}, {key: 'active', text: 'Active'}, {key: 'inactive', text: 'Inactive'}]} disabled={busy} onChange={(_, option) => setAvailability(String(option?.key || 'all'))} />{page === 'subcategories' && <Dropdown ariaLabel="Parent category filter" selectedKey={parentFilter} options={[{key: '', text: 'All categories'}, ...data.parents.map(item => ({key: String(item.id), text: item.title}))]} disabled={busy} onChange={(_, option) => setParentFilter(String(option?.key || ''))} />}<IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh administration" disabled={busy} onClick={() => { void load(); }} /></div><div className={styles.ticketActions}><a className={styles.adminSharePointLink} href={data.listUrl} target="_blank" rel="noopener noreferrer">View in SharePoint</a><DefaultButton text={page === 'schema' ? 'New column' : 'New'} iconProps={{iconName: 'Add'}} disabled={busy} onClick={() => { setError(''); if (page === 'schema') { setColumnId(undefined); setColumnInput({...newColumn}); } else { setEntryId(undefined); setEntryInput({title: '', active: true, sortOrder: data.entries.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1}); } }} /></div></div>
          <p className={styles.adminHint}>{page === 'schema' ? `${data.listName}: columns and settings only. System-managed and core ticket columns are protected from deletion.` : page === 'subcategories' ? 'Each subcategory belongs to a category. Deactivate entries to preserve historical ticket references.' : page === 'issueTypes' ? 'Issue Types are independent. No parent category or subcategory is required.' : 'Manage category names, availability, and display order.'}</p>
          {selected.length > 0 && <div className={styles.bulkActions}><span>{selected.length} selected</span><DefaultButton text="Activate" disabled={busy} onClick={() => setAvailabilityChange({entries: data.entries.filter(item => selected.includes(item.id)), active: true})} /><DefaultButton text="Deactivate" disabled={busy} onClick={() => setAvailabilityChange({entries: data.entries.filter(item => selected.includes(item.id)), active: false})} /><DefaultButton text="Clear selection" disabled={busy} onClick={() => setSelected([])} /></div>}
          <div className={styles.tableContainer}>{page === 'schema' ? <table className={styles.ticketTable}><thead><tr><th>Name</th><th>Internal name</th><th>Type</th><th>Description</th><th>Required</th><th>Properties</th><th>Actions</th></tr></thead><tbody>{data.columns.filter(item => `${item.name} ${item.displayName} ${item.type}`.toLowerCase().includes(query.toLowerCase())).map(column => <tr key={column.id}><td>{column.displayName}</td><td>{column.name}</td><td>{column.type}</td><td>{column.description || '_'}</td><td>{column.required ? 'Yes' : 'No'}</td><td><DefaultButton text="View" onClick={() => setInspect(column)} /></td><td><DefaultButton text="Edit" disabled={busy || !column.canEdit} onClick={() => editColumn(column)} /><IconButton iconProps={{iconName: 'Delete'}} ariaLabel={`Delete ${column.displayName}`} disabled={busy || !column.canDelete} onClick={() => { setDeleting(column); setConfirmName(''); setError(''); }} /></td></tr>)}</tbody></table> : <table className={styles.ticketTable}><thead><tr><th className={styles.selectionCell}><Checkbox ariaLabel="Select all filtered entries" checked={entries.length > 0 && entries.every(item => selected.includes(item.id))} indeterminate={entries.some(item => selected.includes(item.id)) && !entries.every(item => selected.includes(item.id))} disabled={busy || !entries.length} onChange={(_, checked) => setSelected(checked ? entries.map(item => item.id) : [])} /></th><th>Name</th>{page === 'subcategories' && <th>Parent category</th>}<th>Status</th><th>Sort order</th><th>Actions</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id} data-selected={selected.includes(entry.id)}><td className={styles.selectionCell}><Checkbox ariaLabel={`Select ${entry.title}`} checked={selected.includes(entry.id)} disabled={busy} onChange={(_, checked) => setSelected(current => checked ? [...current, entry.id] : current.filter(id => id !== entry.id))} /></td><td><button type="button" className={styles.ticketSubjectLink} disabled={busy} onClick={() => editEntry(entry)}>{entry.title || `Item #${entry.id}`}</button></td>{page === 'subcategories' && <td>{entry.parentName || 'No category selected'}</td>}<td><span className={styles.faqStatusPill} data-active={entry.active}>{entry.active ? 'Active' : 'Inactive'}</span></td><td>{entry.sortOrder}</td><td><button type="button" className={styles.adminAvailabilityLink} data-deactivate={entry.active} disabled={busy} onClick={() => setAvailabilityChange({entries: [entry], active: !entry.active})}>{entry.active ? 'Deactivate' : 'Activate'}</button><button type="button" className={styles.adminAvailabilityLink} disabled={busy} onClick={() => editEntry(entry)}>Edit</button></td></tr>)}</tbody></table>}</div>
          {!data.entries.length && <p>No entries yet. Use New to add one.</p>}
          </>}
        </>}
      </div>
    </>}
    <Dialog hidden={!entryInput} onDismiss={busy ? undefined : () => {setColumnInput(null); setEntryInput(null); setError('');}} maxWidth={760} dialogContentProps={{type: DialogType.close, title: columnInput ? columnId ? 'Edit column properties' : 'New ticket column' : entryId ? 'Edit entry' : 'New entry', showCloseButton: !busy}} modalProps={modal}>
      <form onSubmit={event => { event.preventDefault(); if (columnInput) void run(() => service!.saveColumn(columnInput, columnId), 'Column saved.'); else if (entryInput && page !== 'schema' && page !== 'faqs' && page !== 'sla' && page !== 'members' && page !== 'units' && page !== 'assignment' && (!entryId || data?.entries.find(item => item.id === entryId)?.active === entryInput.active || window.confirm('Change availability for this entry? This affects new ticket selections.'))) void run(() => service!.saveEntry(page, entryInput, entryId), 'Entry saved.'); }}>
        <MissingWorkspaceNotice service={props.service} error={error} />
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {columnInput && data && service && <AdminColumnForm value={columnInput} editing={Boolean(columnId)} disabled={busy} lists={data.lists} service={service} onChange={setColumnInput} onError={setError} />}
        {entryInput && <div className={styles.adminFormFields}><TextField label="Name" required maxLength={255} value={entryInput.title} disabled={busy} onChange={(_, value) => setEntryInput({...entryInput, title: value || ''})} />{page === 'subcategories' && <SearchableSelect label="Parent category" required value={entryInput.parentId ? String(entryInput.parentId) : ''} disabled={busy} options={(data?.parents || []).map(item => ({key: String(item.id), text: item.title + (item.active ? '' : ' (inactive)')}))} onChange={value => setEntryInput({...entryInput, parentId: Number(value)})} />}<TextField label="Sort order" type="number" min={0} value={String(entryInput.sortOrder)} disabled={busy} onChange={(_, value) => setEntryInput({...entryInput, sortOrder: Number(value)})} /><Checkbox label="Active" checked={entryInput.active} disabled={busy} onChange={(_, checked) => setEntryInput({...entryInput, active: Boolean(checked)})} /></div>}
        <div className={styles.faqModalFooter}><PrimaryButton type="submit" text={busy ? 'Saving…' : 'Save'} disabled={busy} onRenderIcon={busy ? () => <Spinner size={SpinnerSize.xSmall} /> : undefined} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => {setColumnInput(null); setEntryInput(null); setError('');}} /></div>
      </form>
    </Dialog>
    <Dialog hidden={!availabilityChange} onDismiss={busy ? undefined : () => setAvailabilityChange(null)} dialogContentProps={{title: availabilityChange?.active ? 'Activate entries?' : 'Deactivate entries?'}} modalProps={{isBlocking: true}}>
      <p>{availabilityChange?.active ? 'Make these entries available for new tickets?' : 'Hide these entries from new ticket selections? Existing ticket classifications will be preserved.'}</p>
      <p>{availabilityChange?.entries.length} selected: {availabilityChange?.entries.map(item => item.title).join(', ')}</p>
      <div className={styles.faqModalFooter}><PrimaryButton text="Confirm" disabled={busy} onClick={() => {
        if (!availabilityChange || page === 'schema' || page === 'faqs' || page === 'sla' || page === 'members' || page === 'units' || page === 'assignment') return;
        const change = availabilityChange; setAvailabilityChange(null);
        void run(async () => {
          const results = await Promise.allSettled(change.entries.map(entry => service!.saveEntry(page, {...entry, active: change.active}, entry.id)));
          setSelected([]);
          const failures = results.filter(result => result.status === 'rejected');
          if (failures.length) { await load(); throw new Error(`${results.length - failures.length} updated; ${failures.length} failed. ${(failures[0] as PromiseRejectedResult).reason instanceof Error ? (failures[0] as PromiseRejectedResult).reason.message : 'Check your permissions and retry.'}`); }
        }, 'Availability updated.');
      }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setAvailabilityChange(null)} /></div>
    </Dialog>
    <Dialog hidden={!inspect} onDismiss={() => setInspect(null)} maxWidth={760} dialogContentProps={{title: 'Column properties'}} modalProps={modal}><pre className={styles.adminProperties}>{JSON.stringify(inspect?.properties, null, 2)}</pre><DefaultButton text="Close" onClick={() => setInspect(null)} /></Dialog>
    <Dialog hidden={!deleting} onDismiss={busy ? undefined : () => setDeleting(null)} dialogContentProps={{title: 'Delete ticket column?'}} modalProps={{isBlocking: true}}>
      <MessageBar messageBarType={MessageBarType.severeWarning}>Deleting a column removes its stored values and can break forms, reports, and workflows. Review dependencies and back up data first.</MessageBar>
      <p>Type the internal name <strong>{deleting?.name}</strong> to confirm.</p><TextField ariaLabel="Confirm column internal name" value={confirmName} disabled={busy} onChange={(_, value) => setConfirmName(value || '')} />
      <MissingWorkspaceNotice service={props.service} error={error} />
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <div className={styles.faqModalFooter}><PrimaryButton text={busy ? 'Deleting…' : 'Delete column'} disabled={busy || confirmName !== deleting?.name} onClick={() => { if (deleting) void run(() => service!.deleteColumn(deleting.id), 'Column deleted.'); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setDeleting(null)} /></div>
    </Dialog>
  </section>;
}
