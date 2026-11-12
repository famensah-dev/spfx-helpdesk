import { useTicketOpened } from '../hooks/useTicketOpened';
import { calendarAppearance } from '../components/calendarAppearance';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import { canUse, isTicketSubmittedBy } from '../services/appRoleRules';
import { OrganizationUserPicker } from '../components/OrganizationUserPicker';
import * as React from 'react';
import { PersonaCoin, PersonaSize } from '@fluentui/react';
import { type IButton, type IButtonProps, DatePicker, Dialog, DialogFooter, PrimaryButton, Dropdown, Checkbox, Panel, PanelType, DefaultButton, Icon, IconButton, MessageBar, MessageBarType, SearchBox, Spinner, SpinnerSize } from '@fluentui/react';
import { TicketDetails } from '../components/TicketDetails';
import { NewTicketForm, type INewTicketInput } from '../components/NewTicketForm';
import type { ITicketDataSource, TicketBulkAction, ITicketBulkResult } from '../interfaces/ITicketDataSource';
import type { ITicket, TicketPriority } from '../interfaces/ITicket';

import { ticketStatuses, normalizeStatus, countStatus, matchesStatusFilter } from '../utils/ticketStatuses';
import { getTicketDateRange } from '../utils/ticketDateRanges';
import { isTicketCreatedBy } from '../utils/ticketRequester';
import styles from '../components/HelpdeskSystem.module.scss';
interface ITicketListPageProps { onOpenTicket?:(id:number)=>void; creating?:boolean; onCreatingChange?:(value:boolean)=>void; view?:string; onViewChange?:(view:string)=>void; service?: ITicketDataSource; onBulkAction?: (ids: number[], action: TicketBulkAction) => Promise<ITicketBulkResult>; onCreate?: (input: INewTicketInput) => Promise<void>; title: string; tickets: ITicket[]; currentUserEmail?: string; assignmentIdentityAvailable?: boolean; loading: boolean; error: string | null; refresh: () => Promise<void>; }
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
const TicketCreatedTime = ({value}:{value:string}):React.ReactElement|null => {
  const created=new Date(value);
  if(!Number.isFinite(created.getTime()))return null;
  const today=created.toDateString()===new Date().toDateString();
  const label=today ? created.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) : created.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return <time dateTime={created.toISOString()} title={created.toLocaleString()} aria-label={'Created '+created.toLocaleString()}>{label}</time>;
};
const columns = ['ID', 'Title', 'Description', 'Status', 'Priority', 'Assigned to', 'Assigned Team', 'Issue Category', 'Issue Subcategory', 'Issue Type', 'Ticket Type', 'Requested By', 'Requester Email', 'Created By', 'Ticket Source', 'Department / Unit', 'Created Date', 'Last Updated', 'Expected Resolution Date', 'Started At', 'First Response At', 'Resolved At', 'Closed At', 'Resolution Summary', 'Escalated'];
const durationOptions = [{key: 'today', text: 'Today'}, {key: 'thisWeek', text: 'This Week'}, {key: 'month', text: 'This Month'}, {key: 'year', text: 'This Year'}, {key: 'all', text: 'All Time'}];
const defaultColumns = ['ID', 'Title', 'Status', 'Priority', 'Assigned to', 'Requested By', 'Created Date'];
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
    case 'Requested By': return ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || null;
    case 'Requester Email': return ticket.RequesterEmail || ticket.Requester?.Email || null;
    case 'Created By': return ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || null;
    case 'Assigned Team': return ticket.AssignedUnit || null;
    case 'Ticket Source': return ticket.TicketSource || null;
    case 'Escalated': return ticket.Escalated === undefined ? null : Number(ticket.Escalated);
    case 'Department / Unit': return ticket.Department || null;
    case 'Resolution Summary': return ticket.ResolutionSummary || null;
    default: {
      const date = column === 'Created Date' ? ticket.Created : column === 'Last Updated' ? ticket.Modified : column === 'Started At' ? ticket.StartedAt : column === 'First Response At' ? ticket.FirstRespondedAt : column === 'Resolved At' ? ticket.ResolvedAt : column === 'Closed At' ? ticket.ClosedAt : ticket.DueDate;
      const timestamp = date ? new Date(date).getTime() : NaN;
      return Number.isFinite(timestamp) ? timestamp : null;
    }
  }
};
const displayDate = (value?: string | null): string => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';
const columnValues = (ticket: ITicket): Array<string | number> => [ticket.Id, ticket.Title, ticketDescription(ticket) || '—', normalizeStatus(ticket.Status), ticket.Priority, ticket.AssignedTo?.Title || '_', ticket.AssignedUnit || '\u2014', ticket.Category || '—', ticket.Subcategory || '—', ticket.IssueType || '—', ticket.TicketType || '—', ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || '\u2014', ticket.RequesterEmail || ticket.Requester?.Email || '\u2014', ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || '\u2014', ticket.TicketSource || '\u2014', ticket.Department || '—', displayDate(ticket.Created), displayDate(ticket.Modified), displayDate(ticket.DueDate), displayDate(ticket.StartedAt), displayDate(ticket.FirstRespondedAt), displayDate(ticket.ResolvedAt), displayDate(ticket.ClosedAt), ticket.ResolutionSummary || '\u2014', ticket.Escalated === undefined ? '\u2014' : ticket.Escalated ? 'Yes' : 'No'];
export const TicketListPage: React.FC<ITicketListPageProps> = ({ service, onBulkAction, onCreate, title, tickets, currentUserEmail, assignmentIdentityAvailable, loading, error, refresh, onOpenTicket, creating:routeCreating, onCreatingChange, view, onViewChange }) => {
  const agent = service?.roleRules?.id === 'agent' || service?.access?.agent === true;
  const handlingAgent = agent || (service?.roleRules?.id === 'agent' && service.roleRules.scope === 'assigned');
  const canManageTicket = (ticket: ITicket): boolean => !handlingAgent || ticket.AssignedTo?.Email?.toLowerCase() === currentUserEmail?.toLowerCase();
  const ownAgentRequest = (ticket: ITicket): boolean => Boolean((agent || service?.roleRules?.id === 'agent') && isTicketSubmittedBy(ticket, 0, currentUserEmail || '', service?.access?.oid));
  const canChangeStatus = (ticket: ITicket): boolean => canManageTicket(ticket) || ownAgentRequest(ticket);
  const canCloseTicket = (ticket: ITicket): boolean => Boolean((!service?.roleRules && !agent) || service?.access?.admin || service?.access?.superAdmin);
  const [priorityOptions, setPriorityOptions] = React.useState<string[]>([]);
  React.useEffect(() => { let active = true; if (service?.getPriorities) service.getPriorities().then(values => {if (active) setPriorityOptions(values);}).catch(() => {if (active) setPriorityOptions([]);}); return () => {active = false;}; }, [service, tickets]);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [deleteIds,setDeleteIds]=React.useState<number[]>([]);
  const [assigningIds, setAssigningIds] = React.useState<number[]>([]);
  const [savingCell, setSavingCell] = React.useState<{ id: number; kind: string } | null>(null);
  const [bulkMessage, setBulkMessage] = React.useState('');
  const [bulkFailed, setBulkFailed] = React.useState(false);
  const bulkLock = React.useRef(false);
  const [assignmentTicketIds, setAssignmentTicketIds] = React.useState<number[]>([]);
  const [assignAnchor, setAssignAnchor] = React.useState<HTMLElement | null>(null);
  const [assignTarget, setAssignTarget] = React.useState<ITicket | 'bulk' | null>(null);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const [localCreating, setLocalCreating] = React.useState(false);
  const creating=routeCreating === undefined ? localCreating : routeCreating;
  const setCreating=(value:boolean):void=>{if(onCreatingChange)onCreatingChange(value);else setLocalCreating(value);};
  const [created, setCreated] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [sort, setSort] = React.useState<{ column: string; descending: boolean } | null>({column:'Created Date',descending:true});
  const [localTab, setLocalTab] = React.useState('All Tickets');
  const tab=view || localTab;
  const setTab=(value:string):void=>{if(onViewChange)onViewChange(value);else setLocalTab(value);};
  const [duration, setDuration] = React.useState('all');
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const [customStart, setCustomStart] = React.useState<Date>();
  const [customEnd, setCustomEnd] = React.useState<Date>();
  const [appliedRange, setAppliedRange] = React.useState<{start: number; end: number}>();
  const [status, setStatus] = React.useState('Total');
  const [visible, setVisible] = React.useState(defaultColumns);
  const [columnSearch, setColumnSearch] = React.useState('');
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [mobileAdvancedFilters,setMobileAdvancedFilters]=React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<number>>(() => new Set());
  React.useEffect(() => { setSelectedIds(new Set()); }, [title, tab, search, duration, status, tickets]);
  React.useEffect(() => { if(view===undefined)setLocalTab(title === 'Tickets' ? 'All Tickets' : 'My Assigned Tickets'); setPage(0); }, [title]);
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

  const statusFilters = ['Total', ...ticketStatuses];
  const matching = scoped.filter(ticket => status === 'Total' || matchesStatusFilter(ticket.Status, status));
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
    return (sort.descending ? -comparison : comparison) || (sort.descending ? b.Id - a.Id : a.Id - b.Id);
  }), [matching, sort]);
  const pageTickets = sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const viewed=useTicketOpened(creating || detailId ? undefined : service?.ticketViews,pageTickets.map(ticket=>ticket.Id),tickets);
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
  const deleteArchived = async (): Promise<void> => {
    if(bulkLock.current||!service?.access?.superAdmin||!service.deleteArchivedTickets||!deleteIds.length)return;
    bulkLock.current=true;setBulkBusy(true);setBulkMessage('');
    try{
      const result=await service.deleteArchivedTickets(deleteIds);
      setDeleteIds([]);setBulkFailed(Boolean(result.failed.length));
      setBulkMessage(result.succeeded.length+' ticket(s) moved to the recycle bin.'+(result.failed.length?' '+result.failed.length+' failed: '+result.failed.map(item=>'#'+item.id).join(', ')+'. '+result.failed[0].message:''));
      setSelectedIds(new Set(result.failed.map(item=>item.id)));
      try{await refresh();}catch{setBulkFailed(true);setBulkMessage(current=>current+' Refresh failed; reload the page before retrying.');}
    }catch(reason){setDeleteIds([]);setBulkFailed(true);setBulkMessage(reason instanceof Error?reason.message:'Deletion could not be confirmed. Refresh before retrying.');}
    finally{bulkLock.current=false;setBulkBusy(false);}
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
  return <section className={`${styles.pageContent} ${styles.ticketPage} ${styles.mobileTicketPage}`} aria-label={title}>
    <Dialog hidden={!bulkBusy} dialogContentProps={{title:'Updating tickets',showCloseButton:false}} modalProps={{isBlocking:true}}>
      <div role="status" aria-live="polite" aria-busy="true">
        <Spinner size={SpinnerSize.large} label="Please wait until tickets are saved and updated." styles={{label:{fontSize:16,lineHeight:24,color:'var(--dp-fg-172536, #172536)'}}} />
      </div>
    </Dialog>
    <div className={styles.mobileTicketHeader}><h2>{title}</h2><PrimaryButton text="New" iconProps={{iconName:'Add'}} disabled={!onCreate || loading || Boolean(error)} onClick={()=>setCreating(true)} /></div>
    <div className={styles.mobileTicketTools}>
      <nav className={`${styles.mobileTicketViews} ${styles.ticketTabs}`} aria-label="Mobile ticket views">{[{key:'All Tickets',text:'All Tickets',disabled:title!=='Tickets'},{key:'My Assigned Tickets',text:'Assigned to Me',disabled:!currentUserEmail || assignmentIdentityAvailable===false},{key:'Created by Me',text:'Created by Me',disabled:false}].map(item=><button type="button" key={item.key} className={tab===item.key ? styles.activeNav : undefined} disabled={item.disabled} aria-current={tab===item.key ? 'page' : undefined} onClick={()=>{setTab(item.key);setPage(0);}}><span className={styles.mobileTicketTabLabel}>{item.text}</span></button>)}</nav>
      <div className={styles.mobileTicketToolRow}>
        <SearchBox showIcon ariaLabel="Search mobile tickets" placeholder="Search" value={search} onChange={(_,value)=>{setSearch(value || '');setPage(0);}} />
        <IconButton iconProps={{iconName:'Calendar'}} menuIconProps={{iconName:''}} ariaLabel="Ticket date filter" title={durationLabel} menuProps={{items:[...durationOptions.map(option=>({...option,canCheck:true,checked:duration===option.key,onClick:()=>{setDuration(option.key);setPage(0);}})),{key:'custom',text:'Custom Range',onClick:()=>setRangeOpen(true)}]}} />
        <IconButton iconProps={{iconName:'Equalizer'}} menuIconProps={{iconName:''}} ariaLabel="More ticket actions" title="Ticket actions" menuProps={{items:[
          {key:'refresh',text:'Refresh',disabled:loading,onClick:()=>{void refresh().catch(()=>undefined);}},
          {key:'export',text:'Export',disabled:loading || Boolean(error),onClick:()=>exportCsv()},
          {key:'archive',text:'Archives',onClick:()=>{setTab('Archive');setPage(0);}},
          {key:'advanced',text:'Advanced Filter',onClick:()=>setMobileAdvancedFilters(true)}
        ]}} />
      </div>
      {(status!=='Total' || duration!=='all' || tab==='Archive') && <div className={styles.mobileTicketFilterSummary}><span>{[tab==='Archive' ? 'Archive' : '',status!=='Total' ? status : '',duration!=='all' ? durationLabel : ''].filter(Boolean).join(' / ')}</span><button type="button" onClick={()=>{setStatus('Total');setDuration('all');setPage(0);}}>Clear Filters</button></div>}
    </div>
    <Panel isOpen={mobileAdvancedFilters} type={PanelType.smallFixedFar} headerText="Advanced Filter" closeButtonAriaLabel="Close advanced filters" onDismiss={()=>setMobileAdvancedFilters(false)} isLightDismiss styles={{main:{background:'var(--dp-bg-fff, #fff)',color:'var(--dp-fg-172536, #172536)'}}}>
      <div className={styles.mobileTicketFilterFields}>
        <Dropdown label="Status" selectedKey={status} options={statusFilters.map(label=>({key:label,text:label==='Total' ? 'All Statuses' : label}))} onChange={(_,option)=>{if(option){setStatus(String(option.key));setPage(0);}}} />
        <Dropdown label="Created Date" selectedKey={duration} options={[...durationOptions,{key:'custom',text:'Custom Range'}]} onChange={(_,option)=>{if(!option)return;if(option.key==='custom'){setMobileAdvancedFilters(false);setRangeOpen(true);}else{setDuration(String(option.key));setPage(0);}}} />
        <PrimaryButton text="Show Tickets" onClick={()=>setMobileAdvancedFilters(false)} /><DefaultButton text="Clear Filters" onClick={()=>{setStatus('Total');setDuration('all');setSearch('');setPage(0);}} />
      </div>
    </Panel>
    <div className={styles.ticketTabs} role="group" aria-label="Ticket views">
      <h2 className={styles.toolbarTitle}>{title}</h2>
      {[
        { name: 'All Tickets', icon: 'BulletedList', disabled: title !== 'Tickets', hint: 'All accessible tickets' },
        { name: 'My Assigned Tickets', icon: 'Contact', disabled: !currentUserEmail || assignmentIdentityAvailable === false, hint: 'Tickets assigned to you' },
        { name: 'Created by Me', icon: 'Ticket', disabled: false, hint: 'Tickets you created' },
        { name: 'Archive', icon: 'Lock', disabled: false, hint: 'Archived tickets' }
      ].map(item => <button key={item.name} type="button" disabled={item.disabled} title={item.hint} aria-pressed={tab === item.name} className={tab === item.name ? styles.activeNav : undefined} onClick={() => { setTab(item.name); setPage(0); }}>{/* <Icon iconName={item.icon} /> */}{item.name}</button>)}
    </div>
    <Dialog hidden={!deleteIds.length || bulkBusy} onDismiss={bulkBusy?undefined:()=>setDeleteIds([])} dialogContentProps={{title:'Delete Archived Tickets?',showCloseButton:!bulkBusy}} modalProps={{isBlocking:true}}>
      <p>Delete {deleteIds.length} selected archived ticket(s)? Tickets and their attachments will move to the SharePoint recycle bin. Ticket comments and notification history will be retained.</p>
      <DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={bulkBusy} onClick={()=>setDeleteIds([])} /><PrimaryButton text={bulkBusy?'Deleting?':'Delete Tickets'} iconProps={{iconName:'Delete'}} disabled={bulkBusy} onClick={()=>{void deleteArchived();}} /></DialogFooter>
    </Dialog>
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
    {viewed.error && <MessageBar messageBarType={MessageBarType.warning}>{viewed.error}</MessageBar>}
    <div className={styles.ticketListCard}>
    <div className={styles.ticketToolbar}>
      <div className={styles.ticketActions}>
        <DefaultButton data-create-action="true" text="New" iconProps={{ iconName: 'Add' }} disabled={!onCreate || loading || Boolean(error)} onClick={() => setCreating(true)} />
        <DefaultButton text="Columns" iconProps={{ iconName: 'Table' }} onClick={() => setColumnsOpen(true)} />
        <DefaultButton text="Import/Export" iconProps={{ iconName: 'Upload' }} menuProps={{ items: [{ key: 'export', text: 'Export Filtered Tickets (CSV)', disabled: loading || Boolean(error), onClick: () => exportCsv() }, { key: 'import', text: 'Import Tickets (Coming Soon)', disabled: true }] }} />
      </div>
      <div className={styles.ticketControls}>
        <div className={styles.ticketCounts} role="group" aria-label="Filter tickets by status">
          {statusFilters.map(label => <button key={label} type="button" aria-pressed={status === label} data-active={status === label} onClick={() => { setStatus(label); setPage(0); }}>{label}<strong data-status={label}>{loading || error ? '—' : label === 'Total' ? scoped.length : label === 'Resolved' ? scoped.filter(ticket => matchesStatusFilter(ticket.Status, label)).length : countStatus(scoped, label)}</strong></button>)}
        </div>
        <Dialog hidden={!rangeOpen} onDismiss={() => setRangeOpen(false)} dialogContentProps={{title: 'Custom Date Range'}}>
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created From" value={customStart} maxDate={customEnd} onSelectDate={date => setCustomStart(date || undefined)} />
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created To" value={customEnd} minDate={customStart} onSelectDate={date => setCustomEnd(date || undefined)} />
          <DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} onClick={() => setRangeOpen(false)} /><PrimaryButton text="Apply" disabled={!customStart || !customEnd || customStart > customEnd} onClick={() => { if (!customStart || !customEnd) return; setAppliedRange({start: new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate()).getTime(), end: new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate() + 1).getTime()}); setDuration('custom'); setPage(0); setSelectedIds(new Set()); setRangeOpen(false); }} /></DialogFooter>
        </Dialog>
        <DefaultButton ariaLabel="Ticket creation duration" className={styles.dashboardDateRange} text={durationLabel} iconProps={{ iconName: 'Calendar' }} menuProps={{ items: [...durationOptions.map(option => ({ ...option, canCheck: true, checked: duration === option.key, onClick: () => { setDuration(option.key); setPage(0); } })), {key: 'custom', text: 'Custom Range…', onClick: () => setRangeOpen(true)}] }} />
        <SearchBox ariaLabel="Search tickets by ID or title" placeholder="Search" value={search} onChange={(_, value) => { setSearch(value || ''); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'ClearFilter' }} title="Clear filters" ariaLabel="Clear ticket filters" onClick={() => { setSearch(''); setDuration('all'); setStatus('Total'); setPage(0); }} />
        <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh" ariaLabel="Refresh tickets" disabled={loading} onClick={() => { refresh().catch(() => undefined); }} />
      </div>
    </div>
    <Panel isOpen={columnsOpen} type={PanelType.custom} customWidth="280px" headerText="Columns" closeButtonAriaLabel="Close columns" onDismiss={() => setColumnsOpen(false)} isLightDismiss styles={{ header: { padding: '20px 16px 16px' }, headerText: { fontSize: 14, fontWeight: 600 }, content: { padding: '0 16px 16px' }, navigation: { height: 40 }, closeButton: { color: "var(--dp-fg-7d8793, #7d8793)" } }}>
      <div className={styles.columnPanelSearch}><SearchBox placeholder="Search" ariaLabel="Search columns" value={columnSearch} onChange={(_, value) => setColumnSearch(value || '')} styles={{ root: { height: 32, borderColor: "var(--dp-line-dce2e9, #dce2e9)", borderRadius: 2 }, iconContainer: { order: 2 }, field: { fontSize: 14 } }} /></div>
      <p className={styles.columnPanelHint}>Select the fields to show. Unavailable values appear as —.</p><div className={styles.columnPanelList}>
        {columns.filter(name => name.toLowerCase().includes(columnSearch.toLowerCase())).map(name => <Checkbox key={name} label={name === 'ID' ? 'Ticket ID' : name} checked={visible.includes(name)} disabled={visible.length === 1 && visible.includes(name)} styles={{ root: { padding: '3px 4px' }, checkbox: { width: 18, height: 18, borderRadius: 3, borderColor: visible.includes(name) ? "var(--dp-line-1b385c, #1b385c)" : "var(--dp-line-d5dae1, #d5dae1)", background: visible.includes(name) ? "var(--dp-bg-1b385c, #1b385c)" : "var(--dp-bg-fff, #fff)" }, checkmark: { fontSize: 12, color: "var(--dp-fg-fff, #fff)" }, text: { fontSize: 14, fontWeight: 400, marginLeft: 8, color: "var(--dp-fg-283544, #283544)" } }} onChange={(_, checked) => setVisible(current => checked ? current.includes(name) ? current : [...current, name] : current.length > 1 ? current.filter(value => value !== name) : current)} />)}
        {!columns.some(name => name.toLowerCase().includes(columnSearch.toLowerCase())) && <p>No matching columns.</p>}
      </div>
    </Panel>
    {loading ? <Spinner label="Loading tickets…" /> : <>
      <div className={styles.mobileTicketCards}>
      <div className={styles.mobileTicketSelection}><div className={styles.mobileTicketCountSort}><span>{matching.length} tickets in this view</span><DefaultButton text={sort?.column==='Created Date' ? sort.descending ? 'Newest First' : 'Oldest First' : sort?.column==='Priority' ? 'Priority First' : 'Custom Sort'} menuIconProps={{iconName:'ChevronDown'}} ariaLabel="Quick ticket sort" menuProps={{items:[{key:'priority',text:'Highest Priority First',onClick:()=>{setSort({column:'Priority',descending:false});setPage(0);}},{key:'newest',text:'Newest First',onClick:()=>{setSort({column:'Created Date',descending:true});setPage(0);}},{key:'oldest',text:'Oldest First',onClick:()=>{setSort({column:'Created Date',descending:false});setPage(0);}}]}} /></div></div>
      <div role="list" aria-label="Tickets">{pageTickets.map(ticket=><article role="listitem" key={ticket.Id} className={styles.mobileTicketCard} data-selected={selectedIds.has(ticket.Id)}>
        <button type="button" className={styles.mobileTicketCardOpen} onClick={()=>onOpenTicket ? onOpenTicket(ticket.Id) : setDetailId(ticket.Id)} aria-label={'Open ticket #'+ticket.Id+': '+ticket.Title}>
          <span className={styles.mobileTicketCardTop}><span>#{ticket.Id}{viewed.opened && !viewed.opened.has(ticket.Id) && <span className={styles.mobileTicketUnread} role="img" aria-label="Unopened ticket"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 1.5v5M3 3l4 4M1.5 11.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>}</span><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></span>
          <strong className={styles.mobileTicketCardTitle}>{ticket.Title}</strong>
          <span className={styles.mobileTicketCardBottom}><span>From {ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || 'Not available'}</span><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} />{ticket.Priority}</span></span>
          <span data-ticket-card-footer="true">{ticket.AssignedTo?.Title && <span className={styles.mobileTicketCardAgent}>Assigned to {ticket.AssignedTo.Title}</span>}<TicketCreatedTime value={ticket.Created} /></span>
        </button>
      </article>)}</div>
    </div><p className={styles.mobileTableHint}>Swipe sideways to see more columns.</p><div className={styles.tableContainer} tabIndex={0} role="region" aria-label="Tickets table, scroll sideways for more columns"><table className={styles.ticketTable}><caption className={styles.ticketCountRow}><div className={styles.ticketCountContent}>{selectedTickets.length > 0 ? <div className={styles.bulkActions} role="group" aria-label="Selected ticket actions">
      <strong aria-live="polite">{selectedTickets.length} selected</strong>
      {canUse(service, 'archive') && canUse(service, 'assign') && !agent && <DefaultButton text={bulkBusy ? 'Updating…' : tab === 'Archive' ? 'Unarchive' : 'Archive'} iconProps={{ iconName: tab === 'Archive' ? 'Undo' : 'Archive' }} disabled={bulkBusy || !onBulkAction || Boolean(error)} onClick={() => { void runBulk({kind: 'archive', archived: tab !== 'Archive'}); }} />}
      <DefaultButton text="Mark As" iconProps={{ iconName: 'Tag' }} disabled={!canUse(service, 'status') || bulkBusy || !onBulkAction || Boolean(error) || selectedTickets.some(ticket => !canChangeStatus(ticket))} menuProps={{ items: ticketStatuses.filter(value => (value !== 'Closed' || selectedTickets.every(canCloseTicket)) && (!agent || selectedTickets.every(ownAgentRequest) || !selectedTickets.some(ticket => ['Resolved', 'Completed', 'Closed'].includes(ticket.Status)) || ['Resolved', 'Closed'].includes(value))).map(value => ({key: value, text: value, onClick: () => { void runBulk({kind: 'status', status: value}); }})) }} />
      {canUse(service, 'assign') && !agent && <DefaultButton text="Assign" iconProps={{ iconName: 'Contact' }} disabled={bulkBusy || !onBulkAction || Boolean(error)} onClick={event => { if (assignTarget || bulkBusy) return; setAssignmentTicketIds(selectedTickets.map(ticket => ticket.Id)); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget('bulk'); }} />}
      {tab==='Archive'&&service?.access?.superAdmin&&service.deleteArchivedTickets&&<DefaultButton text="Delete Selected" iconProps={{iconName:'Delete'}} title="Delete up to 200 archived tickets at a time" disabled={bulkBusy||Boolean(error)||selectedTickets.length>200} onClick={()=>setDeleteIds(selectedTickets.map(ticket=>ticket.Id))} />}
      <DefaultButton text="Export Selected" iconProps={{ iconName: 'Download' }} disabled={bulkBusy || Boolean(error)} onClick={() => exportCsv(selectedTickets)} />
      <DefaultButton text={`Select all ${matching.length} matching`} disabled={bulkBusy || selectedTickets.length === matching.length} onClick={() => setSelectedIds(new Set(matching.map(ticket => ticket.Id)))} />
      <DefaultButton text="Clear Selection" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())} />
    </div> : <span>{matching.length} tickets in this view</span>}</div></caption><thead><tr><th scope="col" className={styles.selectionCell}><input type="checkbox" ref={selectPage} aria-label="Select all tickets on this page" checked={allPageSelected} disabled={!pageTickets.length} onChange={event => toggleSelection(pageTickets.map(ticket => ticket.Id), event.target.checked)} /></th>{columns.filter(name => visible.includes(name)).map(name => <th scope="col" key={name} data-column={name} aria-sort={sort?.column === name ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" className={styles.columnSortButton} title={`Sort by ${name}`} onClick={() => { setSort(current => ({ column: name, descending: current?.column === name ? !current.descending : false })); setPage(0); }}>{name}<Icon aria-hidden="true" iconName={sort?.column === name ? sort.descending ? 'SortDown' : 'SortUp' : 'Sort'} /></button></th>)}</tr></thead><tbody>{pageTickets.map(ticket => <tr key={ticket.Id} data-selected={selectedIds.has(ticket.Id)} data-unopened={viewed.opened ? !viewed.opened.has(ticket.Id) : undefined}><td className={styles.selectionCell}><input type="checkbox" aria-label={`Select ticket #${ticket.Id}: ${ticket.Title}`} checked={selectedIds.has(ticket.Id)} onChange={event => toggleSelection([ticket.Id], event.target.checked)} /></td>{[ `#${ticket.Id}`, ...columnValues(ticket).slice(1) ].map((value, index) => visible.includes(columns[index]) && <td key={columns[index]} data-column={columns[index]} onDoubleClick={event => {
      if (!(columns[index] === 'Status' ? canChangeStatus(ticket) : canManageTicket(ticket)) || (agent && columns[index] !== 'Status') || !onBulkAction || bulkBusy || error || !['Status', 'Priority', 'Assigned to'].includes(columns[index]) || (event.target as HTMLElement).closest('button')) return;
      event.currentTarget.querySelector('button')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }} className={['Created Date', 'Last Updated', 'Expected Resolution Date', 'Started At', 'Resolved At', 'Closed At'].includes(columns[index]) ? styles.ticketDateCell : onBulkAction && ['Status', 'Priority', 'Assigned to'].includes(columns[index]) ? styles.editableTicketCell : undefined}>{columns[index] === 'Title' ? <button type="button" className={styles.ticketSubjectLink} aria-label={ticket.Title} onClick={() => onOpenTicket ? onOpenTicket(ticket.Id) : setDetailId(ticket.Id)}>{viewed.opened && !viewed.opened.has(ticket.Id) && <span className={styles.ticketUnopenedStar} role="img" aria-label="Unopened ticket" title="You have not opened this ticket yet"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 1.5v5M3 3l4 4M1.5 11.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>}{ticket.Title}</button> : columns[index] === 'Description' ? <span className={styles.ticketDescriptionPreview} title={String(value)}>{value}</span> : columns[index] === 'Status' ? (onBulkAction && canUse(service, 'status') && canChangeStatus(ticket) ? <InlineEditButton className={styles.inlineChoice} onRenderMenuIcon={() => null} ariaLabel={`Change status for ticket #${ticket.Id}; current status: ${normalizeStatus(ticket.Status)}`} title="Double-click to change status" disabled={bulkBusy || Boolean(error)} onRenderText={() => <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{savingCell?.id === ticket.Id && savingCell.kind === 'status' ? 'Saving…' : normalizeStatus(ticket.Status)}</span>} menuProps={{ className: styles.rowEditMenu, items: ticketStatuses.filter(value => (value !== 'Closed' || canCloseTicket(ticket)) && (!agent || ownAgentRequest(ticket) || !['Resolved', 'Completed', 'Closed'].includes(ticket.Status) || ['Resolved', 'Closed'].includes(value))).map(value => ({ key: value, text: value, canCheck: true, checked: normalizeStatus(ticket.Status) === value, onClick: () => { void updateRow(ticket, { kind: 'status', status: value }); } })) }} /> : <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span>) : columns[index] === 'Priority' ? (onBulkAction && canUse(service, 'priority') && !agent ? <InlineEditButton className={styles.inlineChoice} onRenderMenuIcon={() => null} ariaLabel={`Change priority for ticket #${ticket.Id}; current priority: ${ticket.Priority}`} title="Double-click to change priority" disabled={bulkBusy || Boolean(error)} onRenderText={() => <span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{savingCell?.id === ticket.Id && savingCell.kind === 'priority' ? 'Saving…' : ticket.Priority}</span>} menuProps={{ className: styles.rowEditMenu, items: Array.from(new Set([...priorityOptions, ...tickets.map(item => item.Priority)])).map(value => ({ key: value, text: value, canCheck: true, checked: ticket.Priority === value, onClick: () => { void updateRow(ticket, { kind: 'priority', priority: value }); } })) }} /> : <span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span>) : columns[index] === 'Assigned to' && onBulkAction && canUse(service, 'assign') && !agent ? <DefaultButton className={styles.inlineAssignee} ariaLabel={`Assign ticket #${ticket.Id}; double-click to change assignee`} title="Double-click to change assignee" disabled={bulkBusy || Boolean(error)} onDoubleClick={event => { if (assignTarget || bulkBusy) return; setAssignmentTicketIds([ticket.Id]); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget(ticket); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setAssignAnchor(event.currentTarget as HTMLElement); setAssignTarget(ticket); } }} onRenderText={() => <AssigneeLabel person={ticket.AssignedTo} />} /> : columns[index] === 'Assigned to' ? <AssigneeLabel person={ticket.AssignedTo} /> : value}{((savingCell?.id === ticket.Id && ((savingCell.kind === 'status' && columns[index] === 'Status') || (savingCell.kind === 'priority' && columns[index] === 'Priority'))) || (assigningIds.includes(ticket.Id) && columns[index] === 'Assigned to')) && <Spinner className={styles.cellSavingSpinner} size={SpinnerSize.xSmall} ariaLabel={`Updating ${columns[index]} for ticket #${ticket.Id}`} />}</td>)}</tr>)}</tbody></table></div>
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
