import * as React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip } from 'chart.js';
import { DatePicker, Dropdown, Icon, IconButton, Label, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { IDashboardStats, IChartDataset } from '../interfaces/IDashboard';
import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { getCategoryChart, getGlobalSummary } from '../utils/globalDashboardUtils';
import { ticketStatuses, countStatus, isResolved, statusColors } from '../utils/ticketStatuses';
import styles from '../components/HelpdeskSystem.module.scss';
import type { ICalendarProps } from '@fluentui/react';

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

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);
export interface IDashboardPageProps {
  title?: string;
  stats: IDashboardStats;
  statusChart: IChartDataset;
  priorityChart: IChartDataset;
  filteredTickets: ITicket[];
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
const options = (values: string[], all: string): Array<{key: string; text: string}> => [{ key: '', text: all }, ...values.map(text => ({ key: text, text }))];
const chartLabel = (data: IChartDataset): string => data.labels.map((label, i) => `${label}: ${data.datasets[0].data[i]}`).join(', ');

export const DashboardPage: React.FC<IDashboardPageProps> = (props) => {
  const { stats, statusChart, priorityChart, filteredTickets, loading, error, refresh, filters, setFilters, assignedUsers,
    filteredTicketCount, hasResolvedAt, hasCategory, hasDueDate, hasEscalated, lastUpdated } = props;
  const summary = getGlobalSummary(filteredTickets);
  const categoryChart = getCategoryChart(filteredTickets);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const sameDay = (a: Date | null | undefined, b: Date): boolean => Boolean(a && a.toDateString() === b.toDateString());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const periods = [
    { key: 'today', text: 'Today', start: today, end: today },
    { key: 'week', text: 'This Week', start: weekStart, end: weekEnd },
    { key: 'month', text: 'This Month', start: monthStart, end: monthEnd },
    { key: 'year', text: 'This Year', start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) }
  ];
  const period = !filters.startDate && !filters.endDate ? 'all'
    : periods.find(range => sameDay(filters.startDate, range.start) && sameDay(filters.endDate, range.end))?.key || 'custom';
  const invalidDates = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const cards = [
    { label: 'Total', value: summary.total, tone: 'total', hint: 'All matching tickets' },
    ...ticketStatuses.map(status => ({ label: status, value: countStatus(filteredTickets, status), tone: status.toLowerCase().replace(/ /g, '-'), hint: `Tickets with ${status} status` })),
    ...(hasEscalated ? [{ label: 'Escalated', value: summary.escalated, tone: 'escalated', hint: 'Escalated tickets, tracked separately from lifecycle status' }] : []),
    ...(hasDueDate ? [{ label: 'Overdue', value: summary.overdue, tone: 'overdue', hint: 'Unresolved tickets past their due date' }] : [])
  ];
  const barData = { ...statusChart, datasets: statusChart.datasets.map(dataset => ({ ...dataset, borderWidth: 0 })) };
  return (
    <section className={styles.pageContent} aria-label={props.title || 'Global Dashboard'}>
      <div className={styles.pageHeading}>
        <h2>{props.title || 'Global Dashboard'}</h2>
        <div className={styles.headingActions}>
          <Dropdown ariaLabel="Dashboard date range" className={styles.durationDropdown} selectedKey={period} options={[...periods.map(range => ({key: range.key, text: range.text})), {key: 'all', text: 'All Time'}, ...(period === 'custom' ? [{key: 'custom', text: 'Custom Range'}] : [])]} onChange={(_, option) => {
            if (option?.key === 'all') setFilters(current => ({ ...current, startDate: null, endDate: null }));
            const range = periods.find(item => item.key === option?.key);
            if (range) setFilters(current => ({ ...current, startDate: range.start, endDate: range.end }));
          }} />
          <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh dashboard" ariaLabel="Refresh dashboard" disabled={loading} onClick={() => { refresh().catch(() => undefined); }} />
        </div>
      </div>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error} {lastUpdated ? 'The last successful snapshot is shown below.' : 'No operational data has been loaded.'}</MessageBar>}
      {invalidDates && <MessageBar messageBarType={MessageBarType.error}>The end date must be on or after the start date.</MessageBar>}
      <details className={`${styles.filterPanel} ${styles.dashboardFilters}`} open>
        <summary><Icon iconName="Filter" /> Filters{(filters.status || filters.priority || filters.assignedTo) ? ' · Active' : ''}</summary>
        <div className={styles.filterGroup}>
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created from" placeholder="Start date" value={filters.startDate || undefined} maxDate={filters.endDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, startDate: date || null }))} />
          <DatePicker calendarProps={calendarAppearance} firstDayOfWeek={1} label="Created to" placeholder="End date" value={filters.endDate || undefined} minDate={filters.startDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, endDate: date || null }))} />
          <Dropdown label="Status" selectedKey={filters.status || ''} options={options([...ticketStatuses, ...(filteredTickets.some(ticket => ticket.Status === 'Escalated') ? ['Escalated'] : [])], 'All statuses')} onChange={(_, option) => setFilters(current => ({ ...current, status: String(option?.key || '') }))} />
          <Dropdown label="Priority" selectedKey={filters.priority || ''} options={options(['Critical', 'High', 'Medium', 'Low'], 'All priorities')} onChange={(_, option) => setFilters(current => ({ ...current, priority: String(option?.key || '') }))} />
          <Dropdown label="Assigned to" selectedKey={String(filters.assignedTo || '')} options={[{ key: '', text: 'All assigned users' }, {key: 'unassigned', text: 'Unassigned'}, ...assignedUsers]} onChange={(_, option) => setFilters(current => ({ ...current, assignedTo: String(option?.key || '') }))} />
          <div>
            <Label aria-hidden="true" styles={{ root: { visibility: 'hidden' } }}>&nbsp;</Label>
            <IconButton iconProps={{ iconName: 'ClearFilter' }} title="Clear filters" ariaLabel="Clear filters" styles={{ root: { width: 32, height: 32, padding: 0, margin: 0 } }} onClick={() => setFilters({})} />
          </div>
        </div>
      </details>
      {loading ? <div className={styles.loadingState}><Spinner label="Loading tickets from SharePoint…" /></div> : !lastUpdated ? <div className={styles.emptyState}><Icon iconName="PlugDisconnected" /><strong>Connect your Tickets list</strong><span>Check the list schema and your site permissions, then refresh the dashboard.</span></div> : <>
        <div className={`${styles.kpiGrid} ${styles.lifecycleCards}`}>{cards.map(card => <div className={styles.kpiCard} key={card.label} data-tone={card.tone} title={card.hint}><span className={styles.kpiLabel}>{card.label}<span className={styles.srOnly}> · {card.hint}</span></span><span className={styles.kpiValue}>{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</span></div>)}</div>
        {filteredTicketCount === 0 ? <div className={styles.emptyState}><Icon iconName="Inbox" /><strong>No tickets match this view</strong><span>Try All Time or clear your filters to see more tickets.</span></div> : <div className={styles.chartGrid}>
          <section className={styles.chartCard} aria-label="Tickets by category"><h3 className={styles.chartTitle}>Tickets by Category</h3>{hasCategory ? <div className={styles.chartCanvas}>
            <Doughnut aria-label={chartLabel(categoryChart)} role="img" data={categoryChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '63%', layout: { padding: 28 }, plugins: { legend: { display: false } }, elements: { arc: { spacing: 8 } } }} />
            <span className={styles.doughnutCenter} aria-hidden="true">{filteredTicketCount.toLocaleString()}</span>
          </div> : <div className={styles.chartUnavailable}><Icon iconName="DonutChart" /><span>Category breakdown is unavailable.</span><small>Add a Category Choice or Text column to enable this chart.</small></div>}</section>
          <section className={styles.chartCard} aria-label="Tickets by status"><h3 className={styles.chartTitle}>Tickets by Status</h3><div className={styles.chartCanvas}><Bar aria-label={chartLabel(barData)} role="img" data={barData} options={{ responsive: true, maintainAspectRatio: false, layout: { padding: { top: 16, left: 0, right: 12, bottom: 4 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#edf1f7' } }, x: { display: true, ticks: { font: { size: 10 } }, grid: { display: false } } }, datasets: { bar: { borderRadius: 0, borderSkipped: false, maxBarThickness: 62, categoryPercentage: .8, barPercentage: .8 } } }} /></div><ul className={styles.statusLegend} aria-label="Status chart legend">{barData.labels.map((label, index) => <li key={label}><span aria-hidden="true" style={{ background: statusColors[label] }} />{label}<strong>{barData.datasets[0].data[index]}</strong></li>)}</ul></section>
        </div>}
      </>}

      {lastUpdated && !loading && <>
        <details className={styles.filterPanel}><summary>Resolution &amp; Priority Insights</summary>
          {!hasResolvedAt && <p>Add a ResolvedAt Date and Time column to enable resolution metrics. Modified is never used as a resolution date.</p>}
          <div className={styles.resolutionGrid}><div>Critical unresolved tickets<strong>{filteredTickets.filter(ticket => ticket.Priority === 'Critical' && !isResolved(ticket.Status)).length}</strong></div><div>Resolved this calendar month<strong>{hasResolvedAt ? stats.resolvedThisMonth : '—'}</strong></div><div>Average resolution time<strong>{hasResolvedAt && stats.averageResolutionTimeHours !== null ? `${stats.averageResolutionTimeHours}h` : '—'}</strong></div></div>
          <div className={styles.chartCanvas}><Doughnut aria-label={chartLabel(priorityChart)} role="img" data={priorityChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} /></div>
        </details>
        <footer className={styles.pageFooter}><span>SharePoint · Tickets · {filteredTicketCount.toLocaleString()} matching tickets</span><span>Last refreshed {lastUpdated.toLocaleString()}</span></footer>
      </>}
    </section>
  );
};
