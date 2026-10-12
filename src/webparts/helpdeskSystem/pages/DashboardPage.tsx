import * as React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Legend, LinearScale, Tooltip } from 'chart.js';
import { DefaultButton, DatePicker, Dropdown, Icon, IconButton, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { IDashboardStats, IChartDataset } from '../interfaces/IDashboard';
import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { getCategoryChart, getGlobalSummary } from '../utils/globalDashboardUtils';
import styles from '../components/HelpdeskSystem.module.scss';

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
    filteredTicketCount, hasResolvedAt, hasCategory, hasDueDate, hasEscalated, hasPending, lastUpdated } = props;
  const summary = getGlobalSummary(filteredTickets);
  const categoryChart = getCategoryChart(filteredTickets);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const sameDay = (a: Date | null | undefined, b: Date): boolean => Boolean(a && a.toDateString() === b.toDateString());
  const period = !filters.startDate && !filters.endDate ? 'all' : sameDay(filters.startDate, monthStart) && sameDay(filters.endDate, monthEnd) ? 'month' : 'custom';
  const invalidDates = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const cards = [
    { label: 'Total', value: summary.total, tone: 'total', hint: 'All matching tickets' },
    { label: 'Open', value: summary.open, tone: 'open', hint: 'All tickets that are not resolved or closed' },
    { label: 'Pending', value: hasPending ? summary.pending : '—', tone: 'pending', hint: hasPending ? 'Tickets with Pending status' : 'Pending status is not configured in the list' },
    { label: 'Closed', value: summary.closed, tone: 'closed', hint: 'Tickets with Closed status' },
    { label: 'Escalated', value: hasEscalated ? summary.escalated : '—', tone: 'escalated', hint: hasEscalated ? 'Escalated flag or Escalated status' : 'An Escalated Yes/No column or status is required' },
    { label: 'Overdue', value: hasDueDate ? summary.overdue : '—', tone: 'overdue', hint: hasDueDate ? 'Unresolved tickets past their due date' : 'A DueDate Date and Time column is required' }
  ];
  const barData = { ...statusChart, datasets: statusChart.datasets.map(dataset => ({ ...dataset, backgroundColor: ['#219dcd', '#008959', '#e8a500', '#337fe5', '#e8a500', '#df5d85'], borderWidth: 0 })) };
  return (
    <section className={styles.pageContent} aria-label={props.title || 'Global Dashboard'}>
      <div className={styles.pageHeading}>
        <h2>{props.title || 'Global Dashboard'}</h2>
        <div className={styles.headingActions}>
          <select aria-label="Dashboard date range" className={styles.periodSelect} value={period} onChange={event => {
            const value = event.target.value;
            if (value === 'all') setFilters(current => ({ ...current, startDate: null, endDate: null }));
            if (value === 'month') setFilters(current => ({ ...current, startDate: monthStart, endDate: monthEnd }));
          }}><option value="month">This Month</option><option value="all">All Time</option>{period === 'custom' && <option value="custom">Custom Range</option>}</select>
          <IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh dashboard" ariaLabel="Refresh dashboard" disabled={loading} onClick={() => { refresh().catch(() => undefined); }} />
        </div>
      </div>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error} {lastUpdated ? 'The last successful snapshot is shown below.' : 'No operational data has been loaded.'}</MessageBar>}
      {invalidDates && <MessageBar messageBarType={MessageBarType.error}>The end date must be on or after the start date.</MessageBar>}
      {loading ? <div className={styles.loadingState}><Spinner label="Loading tickets from SharePoint…" /></div> : !lastUpdated ? <div className={styles.emptyState}><Icon iconName="PlugDisconnected" /><strong>Connect your Tickets list</strong><span>Check the list schema and your site permissions, then refresh the dashboard.</span></div> : <>
        <div className={styles.kpiGrid}>{cards.map(card => <div className={styles.kpiCard} key={card.label} data-tone={card.tone} title={card.hint}><span className={styles.kpiLabel}>{card.label}<span className={styles.srOnly}> · {card.hint}</span></span><span className={styles.kpiValue}>{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</span></div>)}</div>
        {filteredTicketCount === 0 ? <div className={styles.emptyState}><Icon iconName="Inbox" /><strong>No tickets match this view</strong><span>Try All Time or clear your filters to see more tickets.</span></div> : <div className={styles.chartGrid}>
          <section className={styles.chartCard} aria-label="Tickets by category"><h3 className={styles.chartTitle}>Tickets by Category</h3>{hasCategory ? <div className={styles.chartCanvas}>
            <Doughnut aria-label={chartLabel(categoryChart)} role="img" data={categoryChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '63%', layout: { padding: 28 }, plugins: { legend: { display: false } }, elements: { arc: { spacing: 8 } } }} />
            <span className={styles.doughnutCenter} aria-hidden="true">{filteredTicketCount.toLocaleString()}</span>
          </div> : <div className={styles.chartUnavailable}><Icon iconName="DonutChart" /><span>Category breakdown is unavailable.</span><small>Add a Category Choice or Text column to enable this chart.</small></div>}</section>
          <section className={styles.chartCard} aria-label="Tickets by status"><h3 className={styles.chartTitle}>Tickets by Status</h3><div className={styles.chartCanvas}><Bar aria-label={chartLabel(barData)} role="img" data={barData} options={{ responsive: true, maintainAspectRatio: false, layout: { padding: { top: 35, left: 22, right: 12, bottom: 35 } }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, display: false, ticks: { precision: 0 } }, x: { display: false, grid: { display: false } } }, datasets: { bar: { borderRadius: 5, borderSkipped: false, maxBarThickness: 62, categoryPercentage: .8, barPercentage: .8 } } }} /></div></section>
        </div>}
        {(!hasDueDate || !hasEscalated || !hasPending) && <span className={styles.pageFooter}>— indicates a metric whose supporting field or status is not configured.</span>}
      </>}
      <details className={styles.filterPanel}>
        <summary>Filters{(filters.status || filters.priority || filters.assignedTo) ? ' · Active' : ''}</summary>
        <div className={styles.filterGroup}>
          <DatePicker label="Created from" placeholder="Start date" value={filters.startDate || undefined} maxDate={filters.endDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, startDate: date || null }))} />
          <DatePicker label="Created to" placeholder="End date" value={filters.endDate || undefined} minDate={filters.startDate || undefined} onSelectDate={date => setFilters(current => ({ ...current, endDate: date || null }))} />
          <Dropdown label="Status" selectedKey={filters.status || ''} options={options(['New', 'Assigned', 'Completed', 'Closed', ...(hasPending ? ['Pending'] : []), ...(hasEscalated ? ['Escalated'] : [])], 'All statuses')} onChange={(_, option) => setFilters(current => ({ ...current, status: String(option?.key || '') }))} />
          <Dropdown label="Priority" selectedKey={filters.priority || ''} options={options(['Critical', 'High', 'Medium', 'Low'], 'All priorities')} onChange={(_, option) => setFilters(current => ({ ...current, priority: String(option?.key || '') }))} />
          <Dropdown label="Assigned to" selectedKey={String(filters.assignedTo || '')} options={[{ key: '', text: 'All assigned users' }, {key: 'unassigned', text: 'Unassigned'}, ...assignedUsers]} onChange={(_, option) => setFilters(current => ({ ...current, assignedTo: String(option?.key || '') }))} />
        </div>
        <div className={styles.toolbarActions}><span>Filters apply to all dashboard metrics and charts · Date range uses Created</span><DefaultButton text="Clear filters" onClick={() => setFilters({})} /></div>
      </details>
      {lastUpdated && !loading && <>
        <details className={styles.filterPanel}><summary>Resolution &amp; Priority Insights</summary>
          {!hasResolvedAt && <p>Add a ResolvedAt Date and Time column to enable resolution metrics. Modified is never used as a resolution date.</p>}
          <div className={styles.resolutionGrid}><div>Critical unresolved tickets<strong>{filteredTickets.filter(ticket => ticket.Priority === 'Critical' && ticket.Status !== 'Completed' && ticket.Status !== 'Closed').length}</strong></div><div>Completed this calendar month<strong>{hasResolvedAt ? stats.resolvedThisMonth : '—'}</strong></div><div>Average resolution time<strong>{hasResolvedAt && stats.averageResolutionTimeHours !== null ? `${stats.averageResolutionTimeHours}h` : '—'}</strong></div></div>
          <div className={styles.chartCanvas}><Doughnut aria-label={chartLabel(priorityChart)} role="img" data={priorityChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} /></div>
        </details>
        <footer className={styles.pageFooter}><span>SharePoint · Tickets · {filteredTicketCount.toLocaleString()} matching tickets</span><span>Last refreshed {lastUpdated.toLocaleString()}</span></footer>
      </>}
    </section>
  );
};
