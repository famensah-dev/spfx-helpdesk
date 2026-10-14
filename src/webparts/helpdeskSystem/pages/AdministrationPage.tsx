import * as React from 'react';
import { DefaultButton, PrimaryButton, IconButton, TextField, Checkbox, Dialog, DialogType, MessageBar, MessageBarType, Spinner, SpinnerSize } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { AdminPage, IAdminData, IAdminColumn, IColumnInput, IClassificationInput, IClassificationEntry } from '../interfaces/IAdministration';
import { AdminColumnForm, newColumn } from '../components/AdminColumnForm';
import { SearchableSelect } from '../components/SearchableSelect';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import { FaqPage } from './FaqPage';
import styles from '../components/HelpdeskSystem.module.scss';

const tabs: Array<{key: AdminPage | 'faqs'; text: string}> = [{key: 'schema', text: 'Ticket list schema'}, {key: 'categories', text: 'Categories'}, {key: 'subcategories', text: 'Subcategories'}, {key: 'issueTypes', text: 'Issue Types'}, {key: 'faqs', text: 'FAQs'}];
export function AdministrationPage(props: { service: ITicketDataSource }): React.ReactElement {
  const [page, setPage] = React.useState<AdminPage | 'faqs'>('schema');
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
  const lock = React.useRef(false);
  const version = React.useRef(0);
  const service = props.service.administration;
  const load = React.useCallback(async (): Promise<void> => {
    if (page === 'faqs') return;
    const current = ++version.current; setLoading(true); setError('');
    try { if (!service) throw new Error('Administration is not configured for this connection.'); const result = await service.getData(page); if (current === version.current) setData(result); }
    catch (reason) { if (current === version.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Unable to load administration data.'); } }
    finally { if (current === version.current) setLoading(false); }
  }, [service, page]);
  React.useEffect(() => { setData(null); setQuery(''); setMessage(''); setColumnInput(null); setEntryInput(null); void load(); return () => { version.current++; }; }, [load]);
  const run = async (action: () => Promise<void>, success: string): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); setColumnInput(null); setEntryInput(null); setDeleting(null); setMessage(success); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Administration change failed.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const editColumn = (column: IAdminColumn): void => { setColumnId(column.id); setColumnInput({name: column.name, displayName: column.displayName, description: column.description || '', required: Boolean(column.required), kind: 'text'}); setError(''); };
  const editEntry = (entry: IClassificationEntry): void => { setEntryId(entry.id); setEntryInput({title: entry.title, active: entry.active, sortOrder: entry.sortOrder, parentId: entry.parentId}); setError(''); };
  const modal = {isBlocking: true, styles: {main: {width: 'min(760px, calc(100vw - 32px))', maxWidth: 760, borderRadius: 6, selectors: {'@media (min-width: 480px)': {width: 'min(760px, calc(100vw - 32px))', maxWidth: 760}}}}};
  return <section className={styles.secondaryPage}>
    <div className={styles.administrationHeader}><h2 className={styles.toolbarTitle}>Administration</h2>
    <nav className={styles.adminTabs} aria-label="Administration pages">{tabs.map(tab => <button key={tab.key} type="button" disabled={busy} aria-current={page === tab.key ? 'page' : undefined} onClick={() => setPage(tab.key)}>{tab.text}</button>)}</nav></div>
    {page === 'faqs' ? <FaqPage service={props.service} manage /> : <>
      {error && !columnInput && !entryInput && !deleting && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
      <div className={styles.ticketListCard}>
        {loading ? <Spinner label="Loading administration…" /> : data?.canManage && <>
          <div className={styles.ticketToolbar}><div className={styles.ticketControls}><TextField ariaLabel="Search administration" placeholder={page === 'schema' ? 'Search columns' : 'Search entries'} value={query} onChange={(_, value) => setQuery(value || '')} /><IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh administration" disabled={busy} onClick={() => { void load(); }} /></div><div className={styles.ticketActions}><DefaultButton text={page === 'schema' ? 'New column' : 'New'} iconProps={{iconName: 'Add'}} disabled={busy} onClick={() => { setError(''); if (page === 'schema') { setColumnId(undefined); setColumnInput({...newColumn}); } else { setEntryId(undefined); setEntryInput({title: '', active: true, sortOrder: data.entries.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1}); } }} /></div></div>
          <p className={styles.adminHint}>{page === 'schema' ? `${data.listName}: columns and settings only. System-managed and core ticket columns are protected from deletion.` : page === 'subcategories' ? 'Each subcategory belongs to a category. Deactivate entries to preserve historical ticket references.' : page === 'issueTypes' ? 'Issue Types are independent. No parent category or subcategory is required.' : 'Manage category names, availability, and display order.'}</p>
          <div className={styles.tableContainer}>{page === 'schema' ? <table className={styles.ticketTable}><thead><tr><th>Name</th><th>Internal name</th><th>Type</th><th>Description</th><th>Required</th><th>Properties</th><th>Actions</th></tr></thead><tbody>{data.columns.filter(item => `${item.name} ${item.displayName} ${item.type}`.toLowerCase().includes(query.toLowerCase())).map(column => <tr key={column.id}><td>{column.displayName}</td><td>{column.name}</td><td>{column.type}</td><td>{column.description || '_'}</td><td>{column.required ? 'Yes' : 'No'}</td><td><DefaultButton text="View" onClick={() => setInspect(column)} /></td><td><DefaultButton text="Edit" disabled={busy || !column.canEdit} onClick={() => editColumn(column)} /><IconButton iconProps={{iconName: 'Delete'}} ariaLabel={`Delete ${column.displayName}`} disabled={busy || !column.canDelete} onClick={() => { setDeleting(column); setConfirmName(''); setError(''); }} /></td></tr>)}</tbody></table> : <table className={styles.ticketTable}><thead><tr><th>Name</th>{page === 'subcategories' && <th>Parent category</th>}<th>Status</th><th>Sort order</th><th>Actions</th></tr></thead><tbody>{data.entries.filter(item => `${item.title} ${item.parentName || ''}`.toLowerCase().includes(query.toLowerCase())).map(entry => <tr key={entry.id}><td><button type="button" className={styles.ticketSubjectLink} disabled={busy} onClick={() => editEntry(entry)}>{entry.title || `Item #${entry.id}`}</button></td>{page === 'subcategories' && <td>{entry.parentName || 'No category selected'}</td>}<td><span className={styles.faqStatusPill} data-active={entry.active}>{entry.active ? 'Active' : 'Inactive'}</span></td><td>{entry.sortOrder}</td><td><DefaultButton text={entry.active ? 'Deactivate' : 'Activate'} disabled={busy} onClick={() => { void run(() => service!.saveEntry(page, {...entry, active: !entry.active}, entry.id), 'Availability updated.'); }} /><DefaultButton text="Edit" disabled={busy} onClick={() => editEntry(entry)} /></td></tr>)}</tbody></table>}</div>
          {page !== 'schema' && !data.entries.length && <p>No entries yet. Use New to add one.</p>}
        </>}
      </div>
    </>}
    <Dialog hidden={!columnInput && !entryInput} onDismiss={busy ? undefined : () => {setColumnInput(null); setEntryInput(null); setError('');}} maxWidth={760} dialogContentProps={{type: DialogType.close, title: columnInput ? columnId ? 'Edit column properties' : 'New ticket column' : entryId ? 'Edit entry' : 'New entry', showCloseButton: !busy}} modalProps={modal}>
      <form onSubmit={event => { event.preventDefault(); if (columnInput) void run(() => service!.saveColumn(columnInput, columnId), 'Column saved.'); else if (entryInput && page !== 'schema' && page !== 'faqs') void run(() => service!.saveEntry(page, entryInput, entryId), 'Entry saved.'); }}>
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {columnInput && data && service && <AdminColumnForm value={columnInput} editing={Boolean(columnId)} disabled={busy} lists={data.lists} service={service} onChange={setColumnInput} onError={setError} />}
        {entryInput && <div className={styles.adminFormFields}><TextField label="Name" required maxLength={255} value={entryInput.title} disabled={busy} onChange={(_, value) => setEntryInput({...entryInput, title: value || ''})} />{page === 'subcategories' && <SearchableSelect label="Parent category" required value={entryInput.parentId ? String(entryInput.parentId) : ''} disabled={busy} options={(data?.parents || []).map(item => ({key: String(item.id), text: item.title + (item.active ? '' : ' (inactive)')}))} onChange={value => setEntryInput({...entryInput, parentId: Number(value)})} />}<TextField label="Sort order" type="number" min={0} value={String(entryInput.sortOrder)} disabled={busy} onChange={(_, value) => setEntryInput({...entryInput, sortOrder: Number(value)})} /><Checkbox label="Active" checked={entryInput.active} disabled={busy} onChange={(_, checked) => setEntryInput({...entryInput, active: Boolean(checked)})} /></div>}
        <div className={styles.faqModalFooter}><PrimaryButton type="submit" text={busy ? 'Saving…' : 'Save'} disabled={busy} onRenderIcon={busy ? () => <Spinner size={SpinnerSize.xSmall} /> : undefined} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => {setColumnInput(null); setEntryInput(null); setError('');}} /></div>
      </form>
    </Dialog>
    <Dialog hidden={!inspect} onDismiss={() => setInspect(null)} maxWidth={760} dialogContentProps={{title: 'Column properties'}} modalProps={modal}><pre className={styles.adminProperties}>{JSON.stringify(inspect?.properties, null, 2)}</pre><DefaultButton text="Close" onClick={() => setInspect(null)} /></Dialog>
    <Dialog hidden={!deleting} onDismiss={busy ? undefined : () => setDeleting(null)} dialogContentProps={{title: 'Delete ticket column?'}} modalProps={{isBlocking: true}}>
      <MessageBar messageBarType={MessageBarType.severeWarning}>Deleting a column removes its stored values and can break forms, reports, and workflows. Review dependencies and back up data first.</MessageBar>
      <p>Type the internal name <strong>{deleting?.name}</strong> to confirm.</p><TextField ariaLabel="Confirm column internal name" value={confirmName} disabled={busy} onChange={(_, value) => setConfirmName(value || '')} />
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <div className={styles.faqModalFooter}><PrimaryButton text={busy ? 'Deleting…' : 'Delete column'} disabled={busy || confirmName !== deleting?.name} onClick={() => { if (deleting) void run(() => service!.deleteColumn(deleting.id), 'Column deleted.'); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setDeleting(null)} /></div>
    </Dialog>
  </section>;
}
