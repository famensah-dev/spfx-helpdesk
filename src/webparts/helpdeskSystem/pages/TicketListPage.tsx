import { calendarAppearance } from '../components/calendarAppearance';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import { canUse } from '../services/appRoleRules';
import { OrganizationUserPicker } from '../components/OrganizationUserPicker';
import * as React from 'react';
import { PersonaCoin, PersonaSize } from '@fluentui/react';
import { type IButton, type IButtonProps, DatePicker, Dialog, DialogFooter, PrimaryButton, Dropdown, Checkbox, Panel, PanelType, DefaultButton, Icon, IconButton, MessageBar, MessageBarType, SearchBox, Spinner, SpinnerSize } from '@fluentui/react';
import { TicketDetails } from '../components/TicketDetails';
import { NewTicketForm, type INewTicketInput } from '../components/NewTicketForm';
import type { ITicketDataSource, TicketBulkAction, ITicketBulkResult } from '../interfaces/ITicketDataSource';
import type { ITicket, TicketPriority } from '../interfaces/ITicket';

import { ticketStatuses, normalizeStatus, countStatus } from '../utils/ticketStatuses';
import { getTicketDateRange } from '../utils/ticketDateRanges';
import { isTicketCreatedBy } from '../utils/ticketRequester';
import styles from '../components/HelpdeskSystem.module.scss';
interface ITicketListPageProps { service?: ITicketDataSource; onBulkAction?: (ids: number[], action: TicketBulkAction) => Promise<ITicketBulkResult>; onCreate?: (input: INewTicketInput) => Promise<void>; title: string; tickets: ITicket[]; currentUserEmail?: string; assignmentIdentityAvailable?: boolean; loading: boolean; error: string | null; refresh: () => Promise<void>; }
// Pointer edits require a deliberate double-click; keyboard menu controls stay available.
const InlineEditButton: React.FC<IButtonProps> = props => {
  const button = React.useRef<IButton>(null);
  return <DefaultButton {...props} componentRef={button}
    onMenuClick={event => {
      if (event?.type === 'click' && (event as React.MouseEvent<HTMLElement>).detail > 0) event.preventDefault();
    }}
    onDoubleClick={() => { if (!props.disabled) button.current?.openMenu(true, true); }} />;
};
const AssigneeLabel: React.FC<{ person?: ITicket['AssignedTo'] }> = ({ person }) => {
  if (!person) return <span aria-label="Unassigned">_</span>;
  const name = person.Title || person.Email || 'Assigned user';
  return <span className={styles.ticketAssigneeLabel}><span aria-hidden="true"><PersonaCoin text={name} size={PersonaSize.size24} /></span><span>{name}</span></span>;
};
const columns = ['ID', 'Title', 'Description', 'Status', 'Priority', 'Assigned to', 'Issue Category', 'Issue Subcategory', 'Issue Type', 'Ticket Type', 'Requested By', 'Department / Unit', 'Created Date', 'Last Updated', 'Expected Resolution Date', 'Started At', 'Resolved At', 'Closed At', 'Resolution Summary'];
const durationOptions = [{key: 'today', text: 'Today'}, {key: 'thisWeek', text: 'This Week'}, {key: 'month', text: 'This Month'}, {key: 'year', text: 'This Year'}, {key: 'all', text: 'All Time'}];
const defaultColumns = ['ID', 'Title', 'Status', 'Priority', 'Assigned to', 'Created Date', 'Last Updated'];
const ticketDescription = (ticket: ITicket): string => ticket.Description ? new DOMParser().parseFromString(ticket.Description, 'text/html').body.textContent || '' : '';
const sortValue = (ticket: ITicket, column: string): string | number | null => {
  switch (column) {
    case 'ID': return ticket.Id;
    case 'Title': return ticket.Title;
    case 'Description': return ticketDescription(ticket) || null;
    case 'Status': return normalizeStatus(ticket.Status);
    case 'Priority': return ['Critical', 'High', 'Medium', 'Low'].indexOf(ticket.Priority);
    case 'Assigned to': return ticket.AssignedTo?.Title || null;
    case 'Issue Category': return ticket.Category || null;
    case 'Issue Subcategory': return ticket.Subcategory || null;
    case 'Issue Type': return ticket.IssueType || null;
    case 'Ticket Type': return ticket.TicketType || null;
    case 'Requested By': return ticket.Requester?.Title || null;
    case 'Department / Unit': return ticket.Department || null;
    case 'Resolution Summary': return ticket.ResolutionSummary || null;
    default: {
      const date = column === 'Created Date' ? ticket.Created : column === 'Last Updated' ? ticket.Modified : column === 'Started At' ? ticket.StartedAt : column === 'Resolved At' ? ticket.ResolvedAt : column === 'Closed At' ? ticket.ClosedAt : ticket.DueDate;
      const timestamp = date ? new Date(date).getTime() : NaN;
      return Number.isFinite(timestamp) ? timestamp : null;
    }
  }
};
const displayDate = (value?: string | null): string => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
const columnValues = (ticket: ITicket): Array<string | number> => [ticket.Id, ticket.Title, ticketDescription(ticket) || '—', normalizeStatus(ticket.Status), ticket.Priority, ticket.AssignedTo?.Title || '_', ticket.Category || '—', ticket.Subcategory || '—', ticket.IssueType || '—', ticket.TicketType || '—', ticket.Requester?.Title || '—', ticket.Department || '—', displayDate(ticket.Created), displayDate(ticket.Modified), displayDate(ticket.DueDate), displayDate(ticket.StartedAt), displayDate(ticket.ResolvedAt), displayDate(ticket.ClosedAt), ticket.ResolutionSummary || '—'];
export const TicketListPage: React.FC<ITicketListPageProps> = ({ service, onBulkAction, onCreate, title, tickets, currentUserEmail, assignmentIdentityAvailable, loading, error, refresh }) => {
  const agent = !service?.roleRules && service?.access?.agent === true;
  const canManageTicket = (ticket: ITicket): boolean => !agent || ticket.AssignedTo?.Email?.toLowerCase() === currentUserEmail?.toLowerCase();
  const [priorityOptions, setPriorityOptions] = React.useState<string[]>([]);
  React.useEffect(() => { let active = true; if (service?.getPriorities) service.getPriorities().then(values => {if (active) setPriorityOptions(values);}).catch(() => {if (active) setPriorityOptions([]);}); return () => {active = false;}; }, [service, tickets]);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [assigningIds, setAssigningIds] = React.useState<number[]>([]);
  const [savingCell, setSavingCell] = React.useState<{ id: number; kind: string } | null>(null);
  const [bulkMessage, setBulkMessage] = React.useState('');
  const [bulkFailed, setBulkFailed] = React.useState(false);
  const bulkLock = React.useRef(false);
  const [assignmentTicketIds, setAssignmentTicketIds] = React.useState<number[]>([]);
  const [assignAnchor, setAssignAnchor] = React.useState<HTMLElement | null>(null);
  const [assignTarget, setAssignTarget] = React.useState<ITicket | 'bulk' | null>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [created, setCreated] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [sort, setSort] = React.useState<{ column: string; descending: boolean } | null>(null);
  const [tab, setTab] = React.useState('All Tickets');
  const [duration, setDuration] = React.useState('all');
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState<Date>();
  const [customEnd, setCustomEnd] = React.useState<Date>();
  const [appliedRange, setAppliedRange] = React.useState<{start: number; end: number}>();
  const [status, setStatus] = React.useState('Total');
  const [visible, setVisible] = React.useState(defaultColumns);
  const [columnSearch, setColumnSearch] = React.useState('');
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
  React.useEffect(() => { setSelectedIds(new Set()); }, [title, tab, search, duration, status, tickets]);
  React.useEffect(() => { setTab(title === 'Tickets' ? 'All Tickets' : 'My Assigned Tickets'); setPage(0); }, [title]);
  const dateRange = duration === 'custom' && appliedRange ? appliedRange : getTicketDateRange(duration);
  const formatRangeDate = (value: number): string => new Date(value).toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'});
  const durationLabel = duration === 'all' ? 'All Time' : `${formatRangeDate(dateRange.start)} – ${formatRangeDate(dateRange.end - 1)}`;
  const scoped = tickets.filter(ticket => {
    if (tab === 'My Assigned Tickets' && (!currentUserEmail || ticket.AssignedTo?.Email?.toLowerCase() !== currentUserEmail.toLowerCase())) return false;
    if (tab === 'Created by Me' && !isTicketCreatedBy(ticket, currentUserEmail, service?.access?.oid)) return false;
    if (tab === 'Archive' ? !ticket.Archived : ticket.Archived) return false;
    const created = new Date(ticket.Created).getTime();
    return (duration === 'all' || (created >= dateRange.start && created < dateRange.end)) && `${ticket.Id} ${ticket.Title}`.toLowerCase().includes(search.toLowerCase());
  });

  const statusFilters = ['Total', ...ticketStatuses, ...(scoped.some(ticket => ticket.Status === 'Escalated') ? ['Escalated'] : [])];
  const matching = scoped.filter(ticket => status === 'Total' || normalizeStatus(ticket.Status) === status);
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const firstVisiblePage = Math.max(0, Math.min(currentPage - 2, pageCount - 5));
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => firstVisiblePage + index);
  const sorted = React.useMemo(() => !sort ? matching : [...matching].sort((a, b) => {
    const left = sortValue(a, sort.column);
    const right = sortValue(b, sort.column);
    if (left === null || right === null) return left === right ? a.Id - b.Id : left === null ? 1 : -1;
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
    return (sort.descending ? -comparison : comparison) || a.Id - b.Id;
  }), [matching, sort]);
  const pageTickets = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
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
  const updateRow = async (ticket: ITicket, action: TicketBulkAction): Promise<void> => {
    if (!onBulkAction || bulkLock.current) return;
    if (action.kind === 'assign' && (ticket.AssignedTo?.Id || null) === action.userId) return;
    if (action.kind === 'status' && normalizeStatus(ticket.Status) === action.status) return;
    if (action.kind === 'priority' && ticket.Priority === action.priority) return;
    bulkLock.current = true; setBulkBusy(true); setSavingCell({ id: ticket.Id, kind: action.kind }); setBulkMessage('');
    try {
      const result = await onBulkAction([ticket.Id], action);
      setBulkFailed(result.failed.length > 0);
      const field = action.kind === 'assign' ? 'Assignment' : action.kind === 'priority' ? 'Priority' : 'Status';
      setBulkMessage(result.failed.length ? `Ticket #${ticket.Id}: ${result.failed[0].message}` : `${field} updated for ticket #${ticket.Id}.`);
      if (result.succeeded.length) await refresh();
    } catch (reason) {
      setBulkFailed(true); setBulkMessage(reason instanceof Error ? reason.message : 'Unable to update ticket.');
    } finally { bulkLock.current = false; setBulkBusy(false); setSavingCell(null); }
  };
  if (creating && onCreate) return <NewTicketForm service={service} onDismiss={() => setCreating(false)} onCreate={async input => { await onCreate(input); setCreated(true); void refresh().catch(() => undefined); }} />;
  const detailTicket = tickets.find(ticket => ticket.Id === detailId);
  if (detailTicket) return <TicketDetails key={detailTicket.Id} service={service} refresh={refresh} tickets={tickets} ticket={detailTicket} onBack={() => setDetailId(null)} />;
  return <section className={`${styles.pageContent} ${styles.ticketPage}`} aria-label={title}>
    <div className={styles.ticketTabs} role="group" aria-label="Ticket views">
      <h2 className={styles.toolbarTitle}>{title}</h2>
      {[
        { name: 'All Tickets', icon: 'BulletedList', disabled: title !== 'Tickets', hint: 'All accessible tickets' },
        { name: 'My Assigned Tickets', icon: 'Contact', disabled: !currentUserEmail || assignmentIdentityAvailable === false, hint: 'Tickets assigned to you' },
        { name: 'Created by Me', icon: 'Ticket', disabled: false, hint: 'Tickets you created' },
        { name: 'Email Tickets', icon: 'Mail', disabled: true, hint: 'Email integration is not connected yet' },
        { name: 'Archive', icon: 'Lock', disabled: false, hint: 'Archived tickets' }
      ].map(item => <button key={item.name} type="button" disabled={item.disabled} title={item.hint} aria-pressed={tab === item.name} className={tab === item.name ? styles.activeNav : undefined} onClick={() => { setTab(item.name); setPage(0); }}><Icon iconName={item.icon} />{item.name}</button>)}
    </div>
    {(created || error || bulkMessage) && <div className={styles.pageAlerts}>
    {created && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setCreated(false)}>Ticket created successfully. Clear filters if it does not appear in this view.</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {bulkMessage && <MessageBar messageBarType={bulkFailed ? MessageBarType.error : bulkBusy ? MessageBarType.info : MessageBarType.success} onDismiss={() => setBulkMessage('' )}>{bulkMessage}</MessageBar>}
    </div>}
    {assignTarget && assignAnchor && <OrganizationUserPicker key={assignTarget === 'bulk' ? 'bulk' : assignTarget.Id} onStart={() => { setAssignTarget(null); setBulkBusy(true); setBulkFailed(false); setBulkMessage(''); setAssigningIds(assignmentTicketIds); }} onComplete={message => { setAssigningIds([]); setBulkBusy(false); setBulkFailed(Boolean(message)); setBulkMessage(message || 'Assignment updated successfully.'); }} currentUser={assignTarget === 'bulk' ? undefined : assignTarget.AssignedTo} target={assignAnchor} service={service} onDismiss={() => setAssignTarget(null)} onSelect={async person => {
      const action: TicketBulkAction = { kind: 'assign', userId: person?.Id || null };
      if (assignTarget === 'bulk') {
        if (!onBulkAction) throw new Error('Assignment is unavailable.');
        const result = await onBulkAction(assignmentTicketIds, action);
        await refresh();
        if (result.failed.length) throw new Error(result.failed.map(item => item.message).join('; '));
      } else {
        if (!onBulkAction) throw new Error('Assignment is unavailable.');
        const result = await onBulkAction(assignmentTicketIds, action);
        if (result.failed.length) throw new Error(result.failed[0].message);
        await refresh();
      }
    }} />}
    <div className={styles.ticketListCard}>
    <div className={styles.ticketToolbar}>
      <div className={styles.ticketActions}>
        <DefaultButton text="New" iconProps={{ iconName: 'Add' }} disabled={!onCreate || loading || Boolean(error)} onClick={() => setCreating(true)} />
        <DefaultButton text="Columns" iconProps={{ iconName: 'Table' }} onClick={() => setColumnsOpen(true)} />
        <DefaultButton text="Import/Export" iconProps={{ iconName: 'Upload' }} menuProps={{ items: [{ key: 'export', text: 'Export filtered tickets (CSV)', disabled: loading || Boolean(error), onClick: () => exportCsv() }, { key: 'import', text: 'Import tickets (coming soon)', disabled: true }] }} />
      </div>
      <div className={styles.ticketControls}>
        <div className={styles.ticketCounts} role="group" aria-label="Filter tickets by status">
          {statusFilters.map(label => <button key={label} type="button" aria-pressed={status === label} data-active={status === label} onClick={() => { setStatus(label); setPage(0); }}>{label}<strong data-status={label}>{loading || error ? '—' : label === 'Total' ? scoped.length : countStatus(scoped, label)}</strong></button>)}
        </div>
        <Dialog hidden={!rangeOpen} onDismiss={() => setRangeOpen(false)} dialogContentProps={{title: 'Custom date range'}}>
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created from" value={customStart} maxDate={customEnd} onSelectDate={date => setCustomStart(date || undefined)} />
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created to" value={customEnd} minDate={customStart} onSelectDate={date => setCustomEnd(date || undefined)} />
          <DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} onClick={() => setRangeOpen(false)} /><PrimaryButton text="Apply" disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => { if (!customStart || !customEnd) return; setAppliedRange({start: new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate()).getTime(), end: new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate() + 1).getTime()}); setDuration('custom'); setPage(0); setSelectedIds(new Set()); setRangeOpen(false); }} /></DialogFooter>
        </Dialog>
        <DefaultButton ariaLabel="Ticket creation duration" className={styles.dashboardDateRange} text={durationLabel} iconProps={{ iconName: 'Calendar' }} menuProps={{ items: [...durationOptions.map(option => ({ ...option, canCheck: true, checked: duration === option.key, onClick: () => { setDuration(option.key); setPage(0); } })), {key: 'custom', text: 'Custom Range…', onClick: () => setRangeOpen(true)}] }} />
        <SearchBox ariaLabel="Search tickets by ID or title" placeholder="Search" value={search} onChange={(_, value) => { setSearch(value || ''); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'ClearFilter' }} title="Clear filters" ariaLabel="Clear ticket filters" onClick={() => { setSearch(''); setDuration('all'); setStatus('Total'); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh" ariaLabel="Refresh tickets" disabled={loading} onClick={() => { refresh().catch(() => undefined); }} />
      </div>
    </div>
    <Panel isOpen={columnsOpen} type={PanelType.custom} customWidth="280px" headerText="Columns" closeButtonAriaLabel="Close columns" onDismiss={() => setColumnsOpen(false)} isLightDismiss styles={{ header: { padding: '20px 16px 16px' }, headerText: { fontSize: 14, fontWeight: 600 }, content: { padding: '0 16px 16px' }, navigation: { height: 40 }, closeButton: { color: '#7d8793' } }}>
      <div className={styles.columnPanelSearch}><SearchBox placeholder="Search" ariaLabel="Search columns" value={columnSearch} onChange={(_, value) => setColumnSearch(value || '')} styles={{ root: { height: 32, borderColor: '#dce2e9', borderRadius: 2 }, iconContainer: { order: 2 }, field: { fontSize: 14 } }} /></div>
      <p className={styles.columnPanelHint}>Select the fields to show. Unavailable values appear as —.</p><div className={styles.columnPanelList}>
        {columns.filter(name => name.toLowerCase().includes(columnSearch.toLowerCase())).map(name => <Checkbox key={name} label={name === 'ID' ? 'Ticket ID' : name} checked={visible.includes(name)} disabled={visible.length === 1 && visible.includes(name)} styles={{ root: { padding: '3px 4px' }, checkbox: { width: 18, height: 18, borderRadius: 3, borderColor: visible.includes(name) ? '#1b385c' : '#d5dae1', background: visible.includes(name) ? '#1b385c' : '#fff' }, checkmark: { fontSize: 12, color: '#fff' }, text: { fontSize: 14, fontWeight: 400, marginLeft: 8, color: '#283544' } }} onChange={(_, checked) => setVisible(current => checked ? current.includes(name) ? current : [...current, name] : current.length > 1 ? current.filter(value => value !== name) : current)} />)}
        {!columns.some(name => name.toLowerCase().includes(columnSearch.toLowerCase())) && <p>No matching columns.</p>}
      </div>
    </Panel>
    {loading ? <Spinner label="Loading tickets…" /> : <>
      <div className={styles.tableContainer}><table className={styles.ticketTable}><caption className={styles.ticketCountRow}><div className={styles.ticketCountContent}>{selectedTickets.length > 0 ? <div className={styles.bulkActions} role="group" aria-label="Selected ticket actions">
      <strong aria-live="polite">{selectedTickets.length} selected</strong>
      {canUse(service, 'archive') && canUse(service, 'assign') && !agent && <DefaultButton text={bulkBusy ? 'Updating…' : 'Archive'} iconProps={{ iconName: 'Archive' }} disabled={bulkBusy || !onBulkAction || Boolean(error) || tab === 'Archive'} onClick={() => { void runBulk({kind: 'archive'}); }} />}
      <DefaultButton text="Mark as" iconProps={{ iconName: 'Tag' }} disabled={!canUse(service, 'status') || bulkBusy || !onBulkAction || Boolean(error) || selectedTickets.some(ticket => !canManageTicket(ticket))} menuProps={{ items: ticketStatuses.filter(value => !agent || !selectedTickets.some(ticket => ['Resolved', 'Completed', 'Closed'].includes(ticket.Status)) || ['Resolved', 'Closed'].includes(value)).map(value => ({key: value, text: value, onClick: () => { void runBulk({kind: 'status', status: value}); }})) }} />
      {canUse(service, 'assign') && !agent && <DefaultButton text="Assign" iconProps={{ iconName: 'Contact' }} disabled={bulkBusy || !onBulkAction || Boolean(error)} onClick={event => { if (assignTarget || bulkBusy) return; setAssignmentTicketIds(selectedTickets.map(ticket => ticket.Id)); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget('bulk'); }} />}
      <DefaultButton text="Export selected" iconProps={{ iconName: 'Download' }} disabled={bulkBusy || Boolean(error)} onClick={() => exportCsv(selectedTickets)} />
      <DefaultButton text={`Select all ${matching.length} matching`} disabled={bulkBusy || selectedTickets.length === matching.length} onClick={() => setSelectedIds(new Set(matching.map(ticket => ticket.Id)))} />
      <DefaultButton text="Clear selection" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())} />
    </div> : <span>{matching.length} tickets in this view</span>}</div></caption><thead><tr><th scope="col" className={styles.selectionCell}><input type="checkbox" ref={selectPage} aria-label="Select all tickets on this page" checked={allPageSelected} disabled={!pageTickets.length} onChange={event => toggleSelection(pageTickets.map(ticket => ticket.Id), event.target.checked)} /></th>{columns.filter(name => visible.includes(name)).map(name => <th scope="col" key={name} aria-sort={sort?.column === name ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className={styles.columnSortButton} title={`Sort by ${name}`} onClick={() => { setSort(current => ({ column: name, descending: current?.column === name ? !current.descending : false })); setPage(0); }}>{name}<Icon aria-hidden="true" iconName={sort?.column === name ? sort.descending ? 'SortDown' : 'SortUp' : 'Sort'} /></button></th>)}</tr></thead><tbody>{pageTickets.map(ticket => <tr key={ticket.Id} data-selected={selectedIds.has(ticket.Id)}><td className={styles.selectionCell}><input type="checkbox" aria-label={`Select ticket #${ticket.Id}: ${ticket.Title}`} checked={selectedIds.has(ticket.Id)} onChange={event => toggleSelection([ticket.Id], event.target.checked)} /></td>{[ `#${ticket.Id}`, ...columnValues(ticket).slice(1) ].map((value, index) => visible.includes(columns[index]) && <td key={columns[index]} onDoubleClick={event => {
      if (!canManageTicket(ticket) || (agent && columns[index] !== 'Status') || !onBulkAction || bulkBusy || error || !['Status', 'Priority', 'Assigned to'].includes(columns[index]) || (event.target as HTMLElement).closest('button')) return;
      event.currentTarget.querySelector('button')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }} className={['Created Date', 'Last Updated', 'Expected Resolution Date', 'Started At', 'Resolved At', 'Closed At'].includes(columns[index]) ? styles.ticketDateCell : onBulkAction && ['Status', 'Priority', 'Assigned to'].includes(columns[index]) ? styles.editableTicketCell : undefined}>{columns[index] === 'Title' ? <button type="button" className={styles.ticketSubjectLink} onClick={() => setDetailId(ticket.Id)}>{ticket.Title}</button> : columns[index] === 'Description' ? <span className={styles.ticketDescriptionPreview} title={String(value)}>{value}</span> : columns[index] === 'Status' ? (onBulkAction && canUse(service, 'status') && canManageTicket(ticket) ? <InlineEditButton className={styles.inlineChoice} onRenderMenuIcon={() => null} ariaLabel={`Change status for ticket #${ticket.Id}; current status: ${normalizeStatus(ticket.Status)}`} title="Double-click to change status" disabled={bulkBusy || Boolean(error)} onRenderText={() => <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{savingCell?.id === ticket.Id && savingCell.kind === 'status' ? 'Saving…' : normalizeStatus(ticket.Status)}</span>} menuProps={{ className: styles.rowEditMenu, items: ticketStatuses.filter(value => !agent || !['Resolved', 'Completed', 'Closed'].includes(ticket.Status) || ['Resolved', 'Closed'].includes(value)).map(value => ({ key: value, text: value, canCheck: true, checked: normalizeStatus(ticket.Status) === value, onClick: () => { void updateRow(ticket, { kind: 'status', status: value }); } })) }} /> : <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span>) : columns[index] === 'Priority' ? (onBulkAction && canUse(service, 'priority') && !agent ? <InlineEditButton className={styles.inlineChoice} onRenderMenuIcon={() => null} ariaLabel={`Change priority for ticket #${ticket.Id}; current priority: ${ticket.Priority}`} title="Double-click to change priority" disabled={bulkBusy || Boolean(error)} onRenderText={() => <span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{savingCell?.id === ticket.Id && savingCell.kind === 'priority' ? 'Saving…' : ticket.Priority}</span>} menuProps={{ className: styles.rowEditMenu, items: Array.from(new Set([...priorityOptions, ...tickets.map(item => item.Priority)])).map(value => ({ key: value, text: value, canCheck: true, checked: ticket.Priority === value, onClick: () => { void updateRow(ticket, { kind: 'priority', priority: value }); } })) }} /> : <span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span>) : columns[index] === 'Assigned to' && onBulkAction && canUse(service, 'assign') && !agent ? <DefaultButton className={styles.inlineAssignee} ariaLabel={`Assign ticket #${ticket.Id}; double-click to change assignee`} title="Double-click to change assignee" disabled={bulkBusy || Boolean(error)} onDoubleClick={event => { if (assignTarget || bulkBusy) return; setAssignmentTicketIds([ticket.Id]); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget(ticket); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget(ticket); } }} onRenderText={() => <AssigneeLabel person={ticket.AssignedTo} />} /> : columns[index] === 'Assigned to' ? <AssigneeLabel person={ticket.AssignedTo} /> : value}{((savingCell?.id === ticket.Id && ((savingCell.kind === 'status' && columns[index] === 'Status') || (savingCell.kind === 'priority' && columns[index] === 'Priority'))) || (assigningIds.includes(ticket.Id) && columns[index] === 'Assigned to')) && <Spinner className={styles.cellSavingSpinner} size={SpinnerSize.xSmall} ariaLabel={`Updating ${columns[index]} for ticket #${ticket.Id}`} />}</td>)}</tr>)}</tbody></table></div>
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
    </div>
  </section>;
};
