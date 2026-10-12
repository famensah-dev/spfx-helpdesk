import * as React from 'react';
import { Checkbox, Panel, PanelType, DefaultButton, Icon, IconButton, MessageBar, MessageBarType, SearchBox, Spinner } from '@fluentui/react';
import { TicketDetails } from '../components/TicketDetails';
import { NewTicketForm, type INewTicketInput } from '../components/NewTicketForm';
import type { ITicketDataSource, TicketBulkAction, ITicketBulkResult } from '../interfaces/ITicketDataSource';
import type { ITicket } from '../interfaces/ITicket';
import { getGlobalSummary } from '../utils/globalDashboardUtils';
import styles from '../components/HelpdeskSystem.module.scss';
interface ITicketListPageProps { service?: ITicketDataSource; onBulkAction?: (ids: number[], action: TicketBulkAction) => Promise<ITicketBulkResult>; onCreate?: (input: INewTicketInput) => Promise<void>; title: string; tickets: ITicket[]; currentUserEmail?: string; assignmentIdentityAvailable?: boolean; loading: boolean; error: string | null; refresh: () => Promise<void>; }
const columns = ['ID', 'Subject', 'Status', 'Priority', 'Assigned to', 'Category', 'Created Date', 'Last Updated', 'Due Date'];
const defaultColumns = columns.slice(0, 5);
const columnValues = (ticket: ITicket): Array<string | number> => [ticket.Id, ticket.Title, ticket.Status, ticket.Priority, ticket.AssignedTo?.Title || 'Unassigned', ticket.Category || '—', new Date(ticket.Created).toLocaleDateString(), new Date(ticket.Modified).toLocaleDateString(), ticket.DueDate ? new Date(ticket.DueDate).toLocaleDateString() : '—'];
export const TicketListPage: React.FC<ITicketListPageProps> = ({ service, onBulkAction, onCreate, title, tickets, currentUserEmail, assignmentIdentityAvailable, loading, error, refresh }) => {
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [bulkMessage, setBulkMessage] = React.useState('');
  const [bulkFailed, setBulkFailed] = React.useState(false);
  const bulkLock = React.useRef(false);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [tab, setTab] = React.useState('All Tickets');
  const [duration, setDuration] = React.useState('all');
  const [status, setStatus] = React.useState('Total');
  const [visible, setVisible] = React.useState(defaultColumns);
  const [columnSearch, setColumnSearch] = React.useState('');
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
  React.useEffect(() => { setSelectedIds(new Set()); }, [title, tab, search, duration, status, tickets]);
  React.useEffect(() => { setTab(title === 'Tickets' ? 'All Tickets' : 'My Assigned Tickets'); setPage(0); }, [title]);
  const scoped = tickets.filter(ticket => {
    if (tab === 'My Assigned Tickets' && (!currentUserEmail || ticket.AssignedTo?.Email?.toLowerCase() !== currentUserEmail.toLowerCase())) return false;
    if (tab === 'Archive' ? !ticket.Archived : ticket.Archived) return false;
    const now = new Date();
    const start = duration === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : now.getTime() - 7 * 86400000;
    return (duration === 'all' || new Date(ticket.Created).getTime() >= start) && `${ticket.Id} ${ticket.Title}`.toLowerCase().includes(search.toLowerCase());
  });
  const summary = getGlobalSummary(scoped);
  const matching = scoped.filter(ticket => status === 'Total' || (status === 'Open' ? ticket.Status !== 'Completed' && ticket.Status !== 'Closed' : status === 'Escalated' ? ticket.Escalated || ticket.Status === 'Escalated' : ticket.Status === status));
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const firstVisiblePage = Math.max(0, Math.min(currentPage - 2, pageCount - 5));
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstVisiblePage + index);
  const pageTickets = matching.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selectedTickets = matching.filter(ticket => selectedIds.has(ticket.Id));
  const allPageSelected = pageTickets.length > 0 && pageTickets.every(ticket => selectedIds.has(ticket.Id));
  const somePageSelected = pageTickets.some(ticket => selectedIds.has(ticket.Id));
  const selectPage = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (selectPage.current) selectPage.current.indeterminate = somePageSelected && !allPageSelected; }, [somePageSelected, allPageSelected, loading]);
  const toggleSelection = (ids: number[], checked: boolean): void => {
    setSelectedIds(current => { const next = new Set(current); ids.forEach(id => { if (checked) next.add(id); else next.delete(id); }); return next; });
  };
  const exportCsv = (exportTickets: ITicket[] = matching): void => {
    const cell = (value: string | number): string => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const rows = exportTickets.map(columnValues);
    const csv = [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'DeskPilot-tickets.csv'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const assignees = tickets.map(ticket => ticket.AssignedTo).filter((person, index, all) => person?.Id && all.findIndex(other => other?.Id === person.Id) === index) as NonNullable<ITicket['AssignedTo']>[];
  const runBulk = async (action: TicketBulkAction): Promise<void> => {
    if (!onBulkAction || bulkLock.current) return;
    bulkLock.current = true; setBulkBusy(true); setBulkMessage('');
    try {
      const result = await onBulkAction(selectedTickets.map(ticket => ticket.Id), action);
      setBulkFailed(result.failed.length > 0);
      setBulkMessage(`${result.succeeded.length} ticket(s) updated.${result.failed.length ? ` ${result.failed.length} failed: ${result.failed.map(failure => `#${failure.id}`).join(', ')}. ${result.failed[0].message}` : ''}`);
      await refresh();
      setSelectedIds(new Set());
    } catch (reason) { setBulkFailed(true); setBulkMessage(reason instanceof Error ? reason.message : 'Unable to update selected tickets.'); }
    finally { bulkLock.current = false; setBulkBusy(false); }
  };
  const detailTicket = tickets.find(ticket => ticket.Id === detailId);
  if (detailTicket) return <TicketDetails key={detailTicket.Id} service={service} refresh={refresh} tickets={tickets} ticket={detailTicket} onBack={() => setDetailId(null)} />;
  return <section className={`${styles.pageContent} ${styles.ticketPage}`} aria-label={title}>
    <div className={styles.ticketTabs} role="group" aria-label="Ticket views">
      <h2 className={styles.toolbarTitle}>{title}</h2>
      {[
        { name: 'All Tickets', icon: 'BulletedList', disabled: title !== 'Tickets', hint: 'All accessible tickets' },
        { name: 'My Assigned Tickets', icon: 'Contact', disabled: !currentUserEmail || assignmentIdentityAvailable === false, hint: 'Tickets assigned to you' },
        { name: 'Created by Me', icon: 'Ticket', disabled: true, hint: 'Created-by filtering is not connected yet' },
        { name: 'Email Tickets', icon: 'Mail', disabled: true, hint: 'Email integration is not connected yet' },
        { name: 'Archive', icon: 'Lock', disabled: false, hint: 'Archived tickets' }
      ].map(item => <button key={item.name} type="button" disabled={item.disabled} title={item.hint} aria-pressed={tab === item.name} className={tab === item.name ? styles.activeNav : undefined} onClick={() => { setTab(item.name); setPage(0); }}><Icon iconName={item.icon} />{item.name}</button>)}
    </div>
    <div className={styles.ticketToolbar}>
      <div className={styles.ticketActions}>
        <DefaultButton text="New" iconProps={{ iconName: 'Add' }} disabled={!onCreate || loading || Boolean(error)} onClick={() => setCreating(true)} />
        <DefaultButton text="Columns" iconProps={{ iconName: 'Table' }} onClick={() => setColumnsOpen(true)} />
        <DefaultButton text="Import/Export" iconProps={{ iconName: 'Upload' }} menuProps={{ items: [{ key: 'export', text: 'Export filtered tickets (CSV)', disabled: loading || Boolean(error), onClick: () => exportCsv() }, { key: 'import', text: 'Import tickets (coming soon)', disabled: true }] }} />
      </div>
      <div className={styles.ticketControls}>
        <div className={styles.ticketCounts} role="group" aria-label="Filter tickets by status">
          {(['Open', 'Closed', 'Pending', 'Escalated', 'Total'] as const).map(label => <button key={label} type="button" aria-pressed={status === label} data-active={status === label} onClick={() => { setStatus(label); setPage(0); }}>{label}<strong data-status={label}>{loading || error ? '—' : summary[label.toLowerCase() as keyof typeof summary]}</strong></button>)}
        </div>
        <Icon iconName="Calendar" aria-hidden="true" />
        <select aria-label="Ticket creation duration" value={duration} onChange={event => { setDuration(event.target.value); setPage(0); }}><option value="all">Select Duration</option><option value="week">Last 7 days</option><option value="month">This month</option></select>
        <SearchBox ariaLabel="Search tickets by ID or subject" placeholder="Search" value={search} onChange={(_, value) => { setSearch(value || ''); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'ClearFilter' }} title="Clear filters" ariaLabel="Clear ticket filters" onClick={() => { setSearch(''); setDuration('all'); setStatus('Total'); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh" ariaLabel="Refresh tickets" disabled={loading} onClick={() => { refresh().catch(() => undefined); }} />
      </div>
    </div>
    <Panel isOpen={columnsOpen} type={PanelType.custom} customWidth="280px" headerText="Columns" closeButtonAriaLabel="Close columns" onDismiss={() => setColumnsOpen(false)} isLightDismiss styles={{ header: { padding: '20px 16px 16px' }, headerText: { fontSize: 14, fontWeight: 600 }, content: { padding: '0 16px 16px' }, navigation: { height: 40 }, closeButton: { color: '#7d8793' } }}>
      <div className={styles.columnPanelSearch}><SearchBox placeholder="Search" ariaLabel="Search columns" value={columnSearch} onChange={(_, value) => setColumnSearch(value || '')} styles={{ root: { height: 32, borderColor: '#dce2e9', borderRadius: 2 }, iconContainer: { order: 2 }, field: { fontSize: 12 } }} /></div>
      <div className={styles.columnPanelList}>
        {columns.filter(name => name.toLowerCase().includes(columnSearch.toLowerCase())).map(name => <Checkbox key={name} label={name === 'ID' ? 'Ticket ID' : name} checked={visible.includes(name)} disabled={visible.length === 1 && visible.includes(name)} styles={{ root: { padding: '3px 4px' }, checkbox: { width: 18, height: 18, borderRadius: 3, borderColor: visible.includes(name) ? '#1b385c' : '#d5dae1', background: visible.includes(name) ? '#1b385c' : '#fff' }, checkmark: { fontSize: 12, color: '#fff' }, text: { fontSize: 12, marginLeft: 8, color: '#283544' } }} onChange={(_, checked) => setVisible(current => checked ? current.includes(name) ? current : [...current, name] : current.length > 1 ? current.filter(value => value !== name) : current)} />)}
        {!columns.some(name => name.toLowerCase().includes(columnSearch.toLowerCase())) && <p>No matching columns.</p>}
      </div>
    </Panel>
    {creating && onCreate && <NewTicketForm onDismiss={() => setCreating(false)} onCreate={async input => { await onCreate(input); setCreated(true); await refresh(); }} />}
    {created && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setCreated(false)}>Ticket created successfully. Clear filters if it does not appear in this view.</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {bulkMessage && <MessageBar messageBarType={bulkFailed ? MessageBarType.error : MessageBarType.success} onDismiss={() => setBulkMessage('' )}>{bulkMessage}</MessageBar>}
    {loading ? <Spinner label="Loading tickets…" /> : <>
      <div className={styles.tableContainer}><table className={styles.ticketTable}><caption className={styles.ticketCountRow}><div className={styles.ticketCountContent}>{selectedTickets.length > 0 ? <div className={styles.bulkActions} role="group" aria-label="Selected ticket actions">
      <strong aria-live="polite">{selectedTickets.length} selected</strong>
      <DefaultButton text={bulkBusy ? 'Updating…' : 'Archive'} iconProps={{ iconName: 'Archive' }} disabled={bulkBusy || !onBulkAction || Boolean(error) || tab === 'Archive'} onClick={() => { void runBulk({kind: 'archive'}); }} />
      <DefaultButton text="Mark as" iconProps={{ iconName: 'Tag' }} disabled={bulkBusy || !onBulkAction || Boolean(error)} menuProps={{ items: (['New', 'Assigned', 'Completed', 'Closed', 'Escalated', 'Pending'] as const).map(value => ({key: value, text: value, onClick: () => { void runBulk({kind: 'status', status: value}); }})) }} />
      <DefaultButton text="Assign" iconProps={{ iconName: 'Contact' }} disabled={bulkBusy || !onBulkAction || Boolean(error)} menuProps={{ items: [{key: 'unassigned', text: 'Unassigned', onClick: () => { void runBulk({kind: 'assign', userId: null}); }}, ...assignees.map(person => ({key: String(person.Id), text: person.Title || person.Email || `User #${person.Id}`, onClick: () => { void runBulk({kind: 'assign', userId: person.Id!}); }}))] }} />
      <DefaultButton text="Export selected" iconProps={{ iconName: 'Download' }} disabled={bulkBusy || Boolean(error)} onClick={() => exportCsv(selectedTickets)} />
      <DefaultButton text={`Select all ${matching.length} matching`} disabled={bulkBusy || selectedTickets.length === matching.length} onClick={() => setSelectedIds(new Set(matching.map(ticket => ticket.Id)))} />
      <DefaultButton text="Clear selection" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())} />
    </div> : <span>{matching.length} tickets in this view</span>}</div></caption><thead><tr><th scope="col" className={styles.selectionCell}><input type="checkbox" ref={selectPage} aria-label="Select all tickets on this page" checked={allPageSelected} disabled={!pageTickets.length} onChange={event => toggleSelection(pageTickets.map(ticket => ticket.Id), event.target.checked)} /></th>{columns.filter(name => visible.includes(name)).map(name => <th scope="col" key={name}>{name}</th>)}</tr></thead><tbody>{pageTickets.map(ticket => <tr key={ticket.Id} data-selected={selectedIds.has(ticket.Id)}><td className={styles.selectionCell}><input type="checkbox" aria-label={`Select ticket #${ticket.Id}: ${ticket.Title}`} checked={selectedIds.has(ticket.Id)} onChange={event => toggleSelection([ticket.Id], event.target.checked)} /></td>{[ `#${ticket.Id}`, ticket.Title, ticket.Status, ticket.Priority, ticket.AssignedTo?.Title || 'Unassigned' ].map((value, index) => visible.includes(columns[index]) && <td key={columns[index]}>{columns[index] === 'Subject' ? <button type="button" className={styles.ticketSubjectLink} onClick={() => setDetailId(ticket.Id)}>{ticket.Title}</button> : columns[index] === 'Status' ? <span className={styles.statusPill} data-status={ticket.Status}>{ticket.Status}</span> : columns[index] === 'Priority' ? <span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span> : value}</td>)}</tr>)}</tbody></table></div>
      {matching.length === 0 && <p>No matching tickets.</p>}
      <nav className={styles.pagination} aria-label="Ticket pagination">
        <button type="button" aria-label="First page" disabled={currentPage === 0} onClick={() => setPage(0)}><Icon iconName="DoubleChevronLeft" /></button>
        <button type="button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><Icon iconName="ChevronLeft" /></button>
        {pageNumbers.map(index => <button type="button" key={index} aria-label={`Page ${index + 1}`} aria-current={currentPage === index ? 'page' : undefined} onClick={() => setPage(index)}>{index + 1}</button>)}
        <button type="button" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><Icon iconName="ChevronRight" /></button>
        <button type="button" aria-label="Last page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(pageCount - 1)}><Icon iconName="DoubleChevronRight" /></button>
        <span aria-live="polite">Showing {matching.length ? currentPage * pageSize + 1 : 0} to {Math.min((currentPage + 1) * pageSize, matching.length)} of {matching.length} tickets</span>
        <select aria-label="Tickets per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select>
      </nav>
    </>}
  </section>;
};
