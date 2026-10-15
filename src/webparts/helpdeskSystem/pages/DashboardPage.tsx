import { SlaDashboardCard } from '../components/SlaDashboardCard';
import * as React from 'react';
import { Bar, Doughnut, Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { DatePicker, DefaultButton, Dropdown, Icon, IconButton, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { IDashboardStats, IChartDataset } from '../interfaces/IDashboard';
import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { getGlobalSummary } from '../utils/globalDashboardUtils';
import { ticketStatuses, countStatus, normalizeStatus, statusColors } from '../utils/ticketStatuses';
import { filterTickets } from '../utils/dashboardUtils';
import { averageResolutionDays, DashboardBar, getTicketTrend, getOpenTicketAging, getPreviousPeriod, getResolutionByCategory, groupTicketCounts } from '../utils/dashboardAnalytics';
import styles from '../components/HelpdeskSystem.module.scss';
import type { ICalendarProps } from '@fluentui/react';
import type { Plugin } from 'chart.js';

const calendarAppearance: ICalendarProps = {
  isMonthPickerVisible: false,
  showGoToToday: true,
  styles: { root: { width: 248, background: '#fff', borderRadius: 6 }, goTodayButton: { alignSelf: 'stretch', margin: '2px 12px 12px', background: '#f0f5fc', borderRadius: 4, color: '#1b385c', fontSize: 12, fontWeight: 600 } },
  calendarDayProps: { styles: {
    root: { width: 224, padding: 12 },
    monthAndYear: { color: '#1b385c', fontSize: 14, fontWeight: 600 },
    headerIconButton: { borderRadius: 4, color: '#526e93' },
    table: { borderCollapse: 'separate', borderSpacing: '0' },
    dayCell: { width: 32, height: 32, lineHeight: '32px' },
    dayButton: { width: 28, height: 28, lineHeight: '28px', borderRadius: 5, fontSize: 12 },
    daySelected: {
      background: '#fff0bb!important', borderRadius: '6px!important', color: '#735100',
      selectors: {
        '&::before': { borderRadius: 'inherit' },
        '&:hover, &.ms-CalendarDay-hoverStyle, &.ms-CalendarDay-pressedStyle': { background: '#fff0bb!important' }
      }
    },
    dayIsToday: { background: '#1b385c!important', color: '#fff!important', borderRadius: 5 }
  } }
};

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, Filler, Tooltip, Legend);
export interface IDashboardPageProps {
  sla?: import('../interfaces/ISla').ISlaService;
  title?: string;
  stats: IDashboardStats;
  statusChart: IChartDataset;
  priorityChart: IChartDataset;
  filteredTickets: ITicket[];
  tickets: ITicket[];
  onOpenTicket?: (id: number) => void;
  onViewTickets?: () => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  filters: ITicketFilters;
  setFilters: React.Dispatch<React.SetStateAction<ITicketFilters>>;
  assignedUsers: Array<{ key: string; text: string }>;
  filteredTicketCount: number;
  hasResolvedAt: boolean;
  hasCategory: boolean;
  hasDueDate: boolean;
  hasEscalated: boolean;
  hasPending: boolean;
  lastUpdated: Date | null;
}
const palette = ['#2d88ff', '#9a75f2', '#21abb6', '#ff962e', '#ffc329', '#f45663', '#a6b1c2', '#62a0f9', '#c2cad7'];
const priorityColors: Record<string, string> = { Low: '#28b47d', Medium: '#2d88ff', High: '#ff841b', Critical: '#f14f5c' };
const priorityValueLabels: Plugin<'bar'> = {
  id: 'dashboardPriorityValues',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#243958'; ctx.font = '600 12px Segoe UI, sans-serif';
    chart.getDatasetMeta(0).data.forEach((bar, index) => ctx.fillText(String(chart.data.datasets[0].data[index]), bar.x, bar.y - 5));
    ctx.restore();
  }
};
const options = (values: string[], all: string) => [{ key: '', text: all }, ...values.map(text => ({ key: text, text }))];
const formatDate = (value: Date): string => value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Breakdown(props: { rows: DashboardBar[]; unit?: string; colors?: string[]; empty?: string }): React.ReactElement {
  const maximum = Math.max(...props.rows.map(row => row.value), 1);
  return props.rows.length ? <ul className={styles.dashboardBars}>
    {props.rows.map((row, index) => <li key={row.label}>
      <span className={styles.dashboardBarLabel} title={row.label}>{row.label}</span>
      <span className={styles.dashboardBarTrack}><span style={{ width: `${row.value / maximum * 100}%`, background: (props.colors || palette)[index % (props.colors || palette).length] }} /></span>
      <strong>{props.unit ? `${row.value.toFixed(1)} ${props.unit}` : row.value}</strong>
    </li>)}
  </ul> : <div className={styles.dashboardChartEmpty}>{props.empty || 'No tickets in this view.'}</div>;
}

function ChartCard(props: { title: string; children: React.ReactNode; action?: React.ReactNode; note?: string; className?: string }): React.ReactElement {
  return <section className={`${styles.dashboardChartCard} ${props.className || ''}`} aria-label={props.title}>
    <div className={styles.dashboardCardHeading}><h3>{props.title}</h3>{props.action}</div>
    {props.children}{props.note && <p className={styles.dashboardChartNote}>{props.note}</p>}
  </section>;
}

export const DashboardPage: React.FC<IDashboardPageProps> = (props) => {
  const { tickets, filteredTickets, loading, error, refresh, filters, setFilters, assignedUsers, hasResolvedAt, hasCategory, hasDueDate, lastUpdated } = props;
  const [department, setDepartment] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const departments = Array.from(new Set(tickets.map(ticket => ticket.Department?.trim()).filter((value): value is string => Boolean(value)))).sort();
  const inDepartment = (values: ITicket[]): ITicket[] => department ? values.filter(ticket => ticket.Department?.trim() === department) : values;
  const visible = inDepartment(filteredTickets);
  const previousFilters = getPreviousPeriod(filters);
  const previous = previousFilters ? inDepartment(filterTickets(tickets, previousFilters)) : null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const periods = [
    { key: 'today', text: 'Today', start: today, end: today },
    { key: 'week', text: 'This Week', start: weekStart, end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6) },
    { key: 'month', text: 'This Month', start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
    { key: 'year', text: 'This Year', start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) }
  ];
  const dateLabel = filters.startDate && filters.endDate ? `${formatDate(filters.startDate)} – ${formatDate(filters.endDate)}`
    : filters.startDate ? `From ${formatDate(filters.startDate)}` : filters.endDate ? `Until ${formatDate(filters.endDate)}` : 'All Time';
  const invalidDates = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const summary = getGlobalSummary(visible, now);
  const previousSummary = previous ? getGlobalSummary(previous, now) : null;
  const average = hasResolvedAt ? averageResolutionDays(visible) : null;
  const cards = [
    { label: 'Total Tickets', value: visible.length, previous: previous?.length, icon: 'Page', color: '#2d88ff' },
    { label: 'Resolved', value: countStatus(visible, 'Resolved'), previous: previous ? countStatus(previous, 'Resolved') : null, icon: 'Completed', color: '#28b47d' },
    { label: 'In Progress', value: countStatus(visible, 'In Progress'), previous: previous ? countStatus(previous, 'In Progress') : null, icon: 'Clock', color: '#ff941d' },
    { label: 'On Hold', value: countStatus(visible, 'On Hold'), previous: previous ? countStatus(previous, 'On Hold') : null, icon: 'Pause', color: '#87909d' },
    { label: 'Overdue', value: hasDueDate ? summary.overdue : null, previous: hasDueDate ? previousSummary?.overdue : null, icon: 'Warning', color: '#ed4c60' },
    { label: 'Avg. Resolution (days)', value: average, previous: hasResolvedAt && previous ? averageResolutionDays(previous) : null, icon: 'Group', color: '#72829c' }
  ];
  const displayedStatuses = [...ticketStatuses, ...(visible.some(ticket => ticket.Status === 'Escalated') ? ['Escalated'] : [])];
  const statusData = { labels: displayedStatuses, datasets: [{ data: displayedStatuses.map(status => countStatus(visible, status)), backgroundColor: displayedStatuses.map(status => statusColors[status]), borderWidth: 1, borderColor: '#ffffff' }] };
  const priorities = Array.from(new Set(['Low', 'Medium', 'High', 'Critical', ...tickets.map(ticket => ticket.Priority)]));
  const priorityData = { labels: priorities, datasets: [{ label: 'Tickets', data: priorities.map(priority => visible.filter(ticket => ticket.Priority === priority).length), backgroundColor: priorities.map(priority => priorityColors[priority] || '#87909d'), borderRadius: 0, maxBarThickness: 44 }] };
  const trend = getTicketTrend(visible, filters.endDate && filters.endDate < now ? filters.endDate : now, filters.startDate);
  const trendData = { labels: trend.labels, datasets: [
    { label: 'Created', data: trend.created, borderColor: '#2d88ff', backgroundColor: '#2d88ff16', fill: true, pointRadius: 3, borderWidth: 2, tension: .18 },
    ...(hasResolvedAt ? [{ label: 'Resolved', data: trend.resolved, borderColor: '#28b47d', backgroundColor: '#28b47d16', fill: true, pointRadius: 3, borderWidth: 2, tension: .18 }] : [])
  ] };
  const chartDefaults = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: {
    y: { beginAtZero: true, ticks: { precision: 0, color: '#718099', font: { size: 12 } }, border: { display: false }, grid: { color: '#edf2f8' } },
    x: { ticks: { color: '#526580', font: { size: 12 } }, border: { display: false }, grid: { display: false } }
  } };
  const assignedCounts = new Map<string, { name: string; count: number }>();
  visible.forEach(ticket => {
    const person = ticket.AssignedTo;
    if (!person) return;
    const key = person.Id ? String(person.Id) : person.Email?.toLowerCase() || 'unresolved-assignee';
    const current = assignedCounts.get(key);
    if (current) current.count++;
    else assignedCounts.set(key, { name: person.Title || person.Email || 'Assigned user', count: 1 });
  });
  const topAssignees = Array.from(assignedCounts.entries()).map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10);
  const assigneeColors = ['#afd396', '#c49cb8', '#fac49e', '#89afd9', '#e5ec94', '#99d5ed', '#ba98ae', '#c5b3df', '#aba7ba', '#cbd294', '#dce3ed', '#b7c1ce'];
  const assignedTotal = Array.from(assignedCounts.values()).reduce((sum, user) => sum + user.count, 0);
  const otherCount = assignedTotal - topAssignees.reduce((sum, user) => sum + user.count, 0);
  const unassignedCount = visible.filter(ticket => !ticket.AssignedTo).length;
  const assigneeTotal = assignedTotal + unassignedCount;
  const assigneeSlices = [...topAssignees, ...(otherCount ? [{ id: 'other', name: 'Other assignees', count: otherCount }] : []), ...(unassignedCount ? [{ id: 'unassigned', name: 'Unassigned', count: unassignedCount }] : [])];
  const sliceColors = assigneeSlices.map((slice, index) => slice.id === 'unassigned' ? '#b7c1ce' : assigneeColors[index]);
  const recent = [...visible].sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime() || b.Id - a.Id).slice(0, 6);
  const hasDepartment = tickets.some(ticket => Boolean(ticket.Department?.trim()));
  const hasIssueType = tickets.some(ticket => Boolean(ticket.IssueType?.trim()));
  const clear = (): void => { setFilters({}); setDepartment(''); };
  return <section className={styles.analyticsDashboard} aria-label={props.title || 'Admin Dashboard'}>
    <div className={styles.dashboardTopRow}>
      <div className={styles.dashboardTitle}><h2>{props.title || 'Admin Dashboard'}</h2><p>Overview of IT support requests, status and performance.</p></div>
      <div className={styles.dashboardTopFilters}>
        <DefaultButton className={styles.dashboardDateRange} text={dateLabel} iconProps={{ iconName: 'Calendar' }} menuProps={{ items: [
          ...periods.map(period => ({ key: period.key, text: period.text, onClick: () => setFilters(current => ({ ...current, startDate: period.start, endDate: period.end })) })),
          { key: 'all', text: 'All Time', onClick: () => setFilters(current => ({ ...current, startDate: null, endDate: null })) },
          { key: 'custom', text: 'Custom Range…', onClick: () => setFiltersOpen(true) }
        ] }} />
        <Dropdown ariaLabel="Department" placeholder="All Departments" selectedKey={department} options={options(departments, 'All Departments')} disabled={!hasDepartment} onChange={(_, option) => setDepartment(String(option?.key || ''))} />
        <Dropdown ariaLabel="Assigned to" selectedKey={String(filters.assignedTo || '')} options={[{ key: '', text: 'All Assigned To' }, { key: 'unassigned', text: 'Unassigned' }, ...assignedUsers]} onChange={(_, option) => setFilters(current => ({ ...current, assignedTo: String(option?.key || '') }))} />
        <IconButton iconProps={{ iconName: 'Filter' }} title="More filters" ariaLabel="More filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)} />
        <IconButton iconProps={{ iconName: 'ClearFilter' }} title="Clear filters" ariaLabel="Clear filters" onClick={clear} />
        <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh dashboard" ariaLabel="Refresh dashboard" disabled={loading} onClick={() => { void refresh(); }} />
      </div>
    </div>
    {(error || invalidDates || (!loading && lastUpdated && visible.length === 0)) && <div className={styles.pageAlerts}>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error} {lastUpdated ? 'Showing the last successful snapshot.' : 'No ticket data has been loaded.'}</MessageBar>}
    {invalidDates && <MessageBar messageBarType={MessageBarType.error}>The end date must be on or after the start date.</MessageBar>}
      {!loading && lastUpdated && visible.length === 0 && <MessageBar>No tickets match these filters. Try a wider date range or clear filters.</MessageBar>}
    </div>}
    {filtersOpen && <div className={styles.dashboardAdvancedFilters}>
      <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created from" placeholder="Start date" value={filters.startDate || undefined} maxDate={filters.endDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, startDate: date || null }))} />
      <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created to" placeholder="End date" value={filters.endDate || undefined} minDate={filters.startDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, endDate: date || null }))} />
      <Dropdown label="Status" selectedKey={filters.status || ''} options={options(displayedStatuses, 'All statuses')} onChange={(_, option) => setFilters(current => ({ ...current, status: String(option?.key || '') }))} />
      <Dropdown label="Priority" selectedKey={filters.priority || ''} options={options(priorities, 'All priorities')} onChange={(_, option) => setFilters(current => ({ ...current, priority: String(option?.key || '') }))} />
    </div>}
    {(filters.status || filters.priority) && !filtersOpen && <button className={styles.dashboardFilterSummary} onClick={() => setFiltersOpen(true)}><Icon iconName="Filter" /> Filtered by {[filters.status, filters.priority].filter(Boolean).join(' · ')}</button>}
    {loading ? <div className={styles.loadingState}><Spinner label="Loading dashboard…" /></div> : !lastUpdated ? <div className={styles.emptyState}><Icon iconName="PlugDisconnected" /><strong>Connect your Tickets list</strong><span>Check your list configuration and permissions, then refresh.</span></div> : <>
      <div className={styles.dashboardSummaryCards}>{cards.map((card, index) => {
        const change = card.value !== null && card.previous != null && card.previous > 0 ? (card.value - card.previous) / card.previous * 100 : null;
        const favorable = change !== null && (index === 1 ? change >= 0 : change <= 0);
        return <article className={styles.dashboardSummaryCard} key={card.label}>
          <span className={styles.dashboardMetricIcon} style={{ background: card.color }}><Icon iconName={card.icon} /></span>
          <div><strong className={styles.dashboardMetricValue}>{card.value === null ? '—' : index === 5 ? card.value.toFixed(1) : card.value.toLocaleString()}</strong><span className={styles.dashboardMetricLabel}>{card.label}</span>
            <div className={styles.dashboardComparison} data-direction={change === null || change === 0 || index === 0 ? 'neutral' : favorable ? 'good' : 'bad'}>
              {change !== null ? <><span>{change > 0 ? '↑' : change < 0 ? '↓' : '↔'} {Math.abs(change).toFixed(0)}%</span><small>vs. previous period</small></> : <small>{card.value === null ? index === 4 ? 'No due dates available' : 'No resolution dates' : previous ? 'No prior data to compare' : 'Selected date range'}</small>}
            </div>
          </div>
        </article>;
      })}</div>
      {props.sla && <SlaDashboardCard service={props.sla} tickets={visible} lastUpdated={lastUpdated} onOpenTicket={props.onOpenTicket} />}
      <div className={styles.dashboardChartsGrid}>
        <ChartCard title={trend.title} className={styles.dashboardTrendCard} action={<div className={styles.dashboardTrendLegend}><span><i style={{ background: '#2d88ff' }} />Created</span>{hasResolvedAt && <span><i style={{ background: '#28b47d' }} />Resolved</span>}</div>} note="Tickets created in the selected range. Resolved uses the recorded resolution date.">
          <div className={styles.dashboardCanvas}><Line role="img" aria-label={trend.labels.map((label, index) => `${label}: ${trend.created[index]} created${hasResolvedAt ? `, ${trend.resolved[index]} resolved` : ''}`).join('; ')} data={trendData} options={chartDefaults} /></div>
        </ChartCard>
        <ChartCard title="Tickets by Status">
          <div className={styles.dashboardStatusChart}>
      <div className={styles.dashboardDonut}><Doughnut role="img" aria-label={displayedStatuses.map(status => `${status}: ${countStatus(visible, status)}`).join(', ')} data={statusData} options={{ responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false } } }} /><div><strong>{visible.length}</strong><span>Total Tickets</span></div></div>
            <ul className={styles.dashboardStatusLegend}>{displayedStatuses.map(status => { const count = countStatus(visible, status); return <li key={status}><span style={{ background: statusColors[status] }} /><span>{status}</span><strong>{count} <small>({visible.length ? Math.round(count / visible.length * 100) : 0}%)</small></strong></li>; })}</ul>
          </div>
        </ChartCard>
        <ChartCard title="Tickets by Priority"><div className={styles.dashboardCanvas}><Bar role="img" aria-label={priorities.map((priority, index) => `${priority}: ${priorityData.datasets[0].data[index]}`).join(', ')} data={priorityData} plugins={[priorityValueLabels]} options={{ ...chartDefaults, layout: { padding: { top: 16 } }, scales: { ...chartDefaults.scales, y: { ...chartDefaults.scales.y, grace: '15%' } } }} /></div></ChartCard>
        <ChartCard title="Tickets by Category" className={styles.dashboardLeftLabels}><Breakdown rows={hasCategory ? groupTicketCounts(visible, 'Category') : []} empty="Category information is not available yet." /></ChartCard>
        <ChartCard title="Top Issue Types" className={styles.dashboardLeftLabels}><Breakdown rows={hasIssueType ? groupTicketCounts(visible, 'IssueType') : []} empty={hasIssueType ? 'No tickets in this view.' : 'Issue Type information is not available yet.'} /></ChartCard>
        <ChartCard title="Tickets by Department / Unit"><Breakdown rows={hasDepartment ? groupTicketCounts(visible, 'Department') : []} empty={hasDepartment ? 'No tickets in this view.' : 'Department information is not available yet.'} /></ChartCard>
        <ChartCard title="Average Resolution Time by Category" note="Days from creation to recorded resolution."><Breakdown rows={hasResolvedAt ? getResolutionByCategory(visible) : []} unit="days" colors={['#9a75f2', '#f45663', '#ff962e', '#28b47d', '#2d88ff', '#ffc329', '#a6b1c2', '#62a0f9']} empty="No recorded resolution dates in this view." /></ChartCard>
        <ChartCard title="Open Tickets by Aging" className={styles.dashboardAgingCard} note="Elapsed time since creation, as of today."><Breakdown rows={getOpenTicketAging(visible, now)} colors={['#28b47d', '#2d88ff', '#ffc329', '#ff962e', '#f45663']} /></ChartCard>
        <div className={styles.dashboardTicketsRow}>
        <ChartCard title="Recent Tickets" className={styles.dashboardRecentCard} action={props.onViewTickets && <button className={styles.dashboardTextLink} onClick={props.onViewTickets}>View all</button>}>
          <div className={styles.dashboardRecentScroll}><table className={styles.dashboardRecentTable}><thead><tr><th>ID</th><th>Title</th><th>Category</th><th>Status</th><th>Priority</th><th>Created</th></tr></thead><tbody>{recent.map(ticket => <tr key={ticket.Id}>
            <td>#{ticket.Id}</td><td>{props.onOpenTicket ? <button title={ticket.Title} onClick={() => props.onOpenTicket!(ticket.Id)}>{ticket.Title}</button> : ticket.Title}</td><td title={ticket.Category}>{ticket.Category || '—'}</td><td><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></td><td><span className={styles.dashboardPriorityBadge} data-priority={ticket.Priority}>{ticket.Priority}</span></td><td>{formatDate(new Date(ticket.Created))}</td>
          </tr>)}</tbody></table>{!recent.length && <div className={styles.dashboardChartEmpty}>No recent tickets in this view.</div>}</div>
        </ChartCard>
        <ChartCard title="Tickets by Assignee" note="Top 10 users by assigned tickets; remaining users are grouped as Other assignees, with a separate Unassigned slice. Follows the current filters.">
          {assigneeSlices.length ? <div className={styles.dashboardAssigneeDistribution}>
            <div><div className={styles.dashboardAssigneePie}><Pie role="img" aria-label={assigneeSlices.map(user => `${user.name}: ${user.count} tickets`).join(', ')} data={{ labels: assigneeSlices.map(user => user.name), datasets: [{ data: assigneeSlices.map(user => user.count), backgroundColor: sliceColors, borderColor: '#fff', borderWidth: 1.5 }] }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => `${context.label}: ${context.parsed} tickets (${(context.parsed / assigneeTotal * 100).toFixed(1)}%)` } } } }} /></div><div className={styles.dashboardAssigneeTotal}>Total: {assigneeTotal.toLocaleString()}</div></div>
            <ul className={styles.dashboardAssigneeLegend}>{assigneeSlices.map((user, index) => <li key={user.id}><i style={{ background: sliceColors[index] }} aria-hidden="true" /><span>{user.name}: <strong>{user.count.toLocaleString()}</strong></span></li>)}</ul>
          </div> : <div className={styles.dashboardChartEmpty}>No tickets in this view.</div>}
        </ChartCard>
        </div>
      </div>
      <footer className={styles.pageFooter}><span>{visible.length.toLocaleString()} matching tickets</span><span>Last refreshed {lastUpdated.toLocaleString()}</span></footer>
    </>}
  </section>;
};
