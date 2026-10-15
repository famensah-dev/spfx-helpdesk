import { downloadSlaExcel, printSlaPdf } from '../utils/slaExport';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import * as React from 'react';
import { IconButton, Spinner, MessageBar, MessageBarType, Dialog, DialogType, DefaultButton, TooltipHost } from '@fluentui/react';
import type { ITicket } from '../interfaces/ITicket';
import type { ISlaService, ISlaPriority } from '../interfaces/ISla';
import { ticketSla, SlaState } from '../utils/sla';
import styles from './HelpdeskSystem.module.scss';
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);
export function SlaDashboardCard(props: {service: ISlaService; tickets: ITicket[]; lastUpdated: Date | null; onOpenTicket?: (id: number) => void}): React.ReactElement {
  const [hiddenStates, setHiddenStates] = React.useState<SlaState[]>([]);
  const [allOpen, setAllOpen] = React.useState(false);
  const [exportError, setExportError] = React.useState('');
  const [policies, setPolicies] = React.useState<ISlaPriority[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [configured, setConfigured] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  React.useEffect(() => {
    let active = true; setLoading(true); setError('');
    props.service.getSettings().then(settings => { if (active) {setPolicies(settings.priorities); setConfigured(settings.configured); setNow(new Date());} }).catch(reason => {if (active) setError(reason instanceof Error ? reason.message : 'Unable to load SLA targets.');}).finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, [props.service, props.lastUpdated, reload]);
  const states: SlaState[] = ['Met', 'Breached', 'Within target', 'Unknown', 'Not configured'];
  const rows = props.tickets.filter(ticket => !ticket.Archived).map(ticket => ({ticket, response: ticketSla(ticket, policies, 'response', now), resolution: ticketSla(ticket, policies, 'resolution', now)}));
  const breached = rows.filter(row => row.response === 'Breached' || row.resolution === 'Breached');
  const explanations: Record<SlaState, string> = {
    Met: 'The response or resolution was recorded on or before its deadline.',
    Breached: 'The event happened after its deadline, or the open ticket is still awaiting it after the deadline.',
    'Within target': 'The ticket is open and still awaiting a response or resolution. Its deadline has not passed; SLA is not met yet.',
    Unknown: 'An SLA target exists, but reliable tracking data is missing or invalid; for example, a resolved ticket has no resolution timestamp.',
    'Not configured': 'No enabled SLA target exists for the priority of this ticket. Set a target and enable tracking in Administration.'
  };
  const colors = ['#28b47d', '#ed4c60', '#e8a500', '#a6b1c2', '#dce3ee'];
  const chart = {
    labels: ['First response', 'Resolution'],
    datasets: states.map((state, index) => ({label: state, data: (['response', 'resolution'] as const).map(kind => rows.filter(row => row[kind] === state).length), backgroundColor: colors[index], hidden: hiddenStates.includes(state), borderWidth: 0, maxBarThickness: 22}))
  };
  const refresh = <IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh SLA targets" disabled={loading} onClick={() => setReload(value => value + 1)} />;
  if (loading || error || !configured) return <section className={styles.dashboardChartCard} aria-label="SLA performance"><div className={styles.dashboardCardHeading}><h3>SLA performance</h3>{refresh}</div>{loading ? <Spinner label="Loading SLA targets..." /> : error ? <MessageBar messageBarType={MessageBarType.warning}>{error}</MessageBar> : <p className={styles.adminHint}>Configure targets in Administration &gt; SLA &amp; Priorities to track response and resolution performance.</p>}</section>;
  return <div className={styles.slaDashboardRow}>
    <section className={styles.dashboardChartCard} aria-label="SLA performance">
      <div className={styles.dashboardCardHeading}><h3>SLA performance</h3>{refresh}</div>
      {rows.length ? <div className={styles.slaChart}><Bar role="img" aria-label={chart.labels.map((label, index) => label + ': ' + chart.datasets.map(dataset => dataset.label + ' ' + dataset.data[index]).join(', ')).join('; ')} data={chart} options={{indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: {x: {stacked: true, beginAtZero: true, ticks: {precision: 0}, grid: {color: '#edf1f7'}}, y: {stacked: true, grid: {display: false}}}, plugins: {legend: {display: false}}}} /></div> : <div className={styles.dashboardChartEmpty}>No tickets in this view.</div>}
      <div className={styles.slaLegend} aria-label="SLA status explanations">{states.map((state, index) => <TooltipHost key={state} content={explanations[state]}><button type="button" aria-label={state + ': ' + explanations[state]} aria-pressed={!hiddenStates.includes(state)} onClick={() => setHiddenStates(current => current.includes(state) ? current.filter(value => value !== state) : [...current, state])} style={{opacity: hiddenStates.includes(state) ? 0.5 : 1}}><span aria-hidden="true" style={{background: colors[index]}} />{state}</button></TooltipHost>)}</div>
      <p className={styles.dashboardChartNote}>Uses current priority targets and dashboard filters. Timing runs 24/7. Hover or focus a key for its meaning.</p>
    </section>
    <section className={styles.dashboardChartCard} aria-label="Tickets that missed SLA">
      <div className={styles.dashboardCardHeading}><h3>Tickets that missed SLA ({breached.length})</h3>{breached.length > 0 && <button type="button" className={styles.adminAvailabilityLink} onClick={() => {setExportError(''); setAllOpen(true);}}>View all</button>}</div>
      {breached.length ? <><div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Ticket</th><th>Priority</th><th>First response</th><th>Resolution</th></tr></thead><tbody>{breached.slice(0, 6).map(row => <tr key={row.ticket.Id}><td><button className={styles.ticketSubjectLink} style={{fontWeight: 400}} disabled={!props.onOpenTicket} onClick={() => props.onOpenTicket?.(row.ticket.Id)}>#{row.ticket.Id} {row.ticket.Title}</button></td><td>{row.ticket.Priority}</td><td><span className={styles.slaState} data-state={row.response}>{row.response}</span></td><td><span className={styles.slaState} data-state={row.resolution}>{row.resolution}</span></td></tr>)}</tbody></table></div><div className={styles.slaTableFooter}><span>Showing {Math.min(6, breached.length)} of {breached.length} tickets that missed SLA.</span></div></> : <div className={styles.dashboardChartEmpty}>No recorded SLA breaches in this view.</div>}
    </section>
    <Dialog hidden={!allOpen} onDismiss={() => setAllOpen(false)} minWidth={320} maxWidth={1320} dialogContentProps={{type: DialogType.close, title: 'Tickets that missed SLA (' + breached.length + ')', showCloseButton: true, styles: {header: {borderBottom: '1px solid #d6dfed', marginBottom: 20}}}} modalProps={{isBlocking: true, styles: {main: {width: 'min(1320px, calc(100vw - 32px))', minWidth: 0, maxWidth: 1320, minHeight: 'min(780px, calc(100vh - 32px))', maxHeight: 'calc(100vh - 32px)', borderRadius: 6, selectors: {'@media (min-width: 480px)': {width: 'min(1320px, calc(100vw - 32px))', minWidth: 0, maxWidth: 1320}}}}}}>
      <div className={styles.slaExportToolbar}><span>All tickets matching the current dashboard filters.</span><DefaultButton styles={{root: {background: 'transparent', border: 0, minWidth: 0, padding: '0 8px', fontSize: 12}, rootHovered: {background: 'transparent', border: 0}, rootPressed: {background: 'transparent', border: 0}, rootDisabled: {background: 'transparent', border: 0}, label: {fontSize: 12, fontWeight: 400}, icon: {color: '#107c41', fontSize: 14}}} text="Export Excel" iconProps={{iconName: 'ExcelDocument'}} disabled={!breached.length} onClick={() => {try {downloadSlaExcel(breached); setExportError('');} catch (reason) {setExportError(reason instanceof Error ? reason.message : 'Unable to export Excel.');}}} /><DefaultButton styles={{root: {background: 'transparent', border: 0, minWidth: 0, padding: '0 8px', fontSize: 12}, rootHovered: {background: 'transparent', border: 0}, rootPressed: {background: 'transparent', border: 0}, rootDisabled: {background: 'transparent', border: 0}, label: {fontSize: 12, fontWeight: 400}, icon: {color: '#d92d20', fontSize: 14}}} text="Export PDF" iconProps={{iconName: 'PDF'}} disabled={!breached.length} onClick={() => {try {printSlaPdf(breached); setExportError('');} catch (reason) {setExportError(reason instanceof Error ? reason.message : 'Unable to export PDF.');}}} /></div>
      <p className={styles.adminHint}>PDF opens a print view. Choose Save as PDF in the print dialog of your browser.</p>
      {exportError && <MessageBar messageBarType={MessageBarType.error}>{exportError}</MessageBar>}
      <div className={styles.slaAllTable}><table className={styles.ticketTable}><thead><tr><th>Ticket</th><th>Priority</th><th>First response</th><th>Resolution</th></tr></thead><tbody>{breached.map(row => <tr key={row.ticket.Id}><td><button className={styles.ticketSubjectLink} style={{fontWeight: 400}} disabled={!props.onOpenTicket} onClick={() => {setAllOpen(false); props.onOpenTicket?.(row.ticket.Id);}}>#{row.ticket.Id} {row.ticket.Title}</button></td><td>{row.ticket.Priority}</td><td><span className={styles.slaState} data-state={row.response}>{row.response}</span></td><td><span className={styles.slaState} data-state={row.resolution}>{row.resolution}</span></td></tr>)}</tbody></table>{!breached.length && <p>No recorded SLA breaches in this view.</p>}</div>
    </Dialog>
  </div>;
}
