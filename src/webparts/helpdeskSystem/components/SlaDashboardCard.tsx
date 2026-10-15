import * as React from 'react';
import { IconButton, Spinner, MessageBar, MessageBarType } from '@fluentui/react';
import type { ITicket } from '../interfaces/ITicket';
import type { ISlaService, ISlaPriority } from '../interfaces/ISla';
import { ticketSla, SlaState } from '../utils/sla';
import styles from './HelpdeskSystem.module.scss';
export function SlaDashboardCard(props: {service: ISlaService; tickets: ITicket[]; lastUpdated: Date | null; onOpenTicket?: (id: number) => void}): React.ReactElement {
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
  return <section className={styles.dashboardChartCard} aria-label="SLA performance"><div className={styles.dashboardCardHeading}><h3>SLA performance</h3><IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh SLA targets" onClick={() => setReload(value => value + 1)} /></div>
    {loading ? <Spinner label="Loading SLA targets…" /> : error ? <MessageBar messageBarType={MessageBarType.warning}>{error}</MessageBar> : !configured ? <p className={styles.adminHint}>Configure targets in Administration → SLA &amp; Priorities to track response and resolution performance.</p> : <>
      <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Target</th>{states.map(state => <th key={state}>{state}</th>)}</tr></thead><tbody>{(['response', 'resolution'] as const).map(kind => <tr key={kind}><td>{kind === 'response' ? 'First response' : 'Resolution'}</td>{states.map(state => <td key={state}><span className={styles.slaState} data-state={state}>{rows.filter(row => row[kind] === state).length}</span></td>)}</tr>)}</tbody></table></div>
      <p className={styles.dashboardChartNote}>Current priority targets · 24/7 elapsed time · Uses this dashboard’s filters. Unknown means a required timestamp is unavailable. Open tickets within target have not met SLA yet.</p>
      {breached.length > 0 && <><h4>Tickets that missed SLA ({breached.length})</h4><div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Ticket</th><th>Priority</th><th>First response</th><th>Resolution</th></tr></thead><tbody>{breached.slice(0, 6).map(row => <tr key={row.ticket.Id}><td><button className={styles.ticketSubjectLink} disabled={!props.onOpenTicket} onClick={() => props.onOpenTicket?.(row.ticket.Id)}>#{row.ticket.Id} {row.ticket.Title}</button></td><td>{row.ticket.Priority}</td><td><span className={styles.slaState} data-state={row.response}>{row.response}</span></td><td><span className={styles.slaState} data-state={row.resolution}>{row.resolution}</span></td></tr>)}</tbody></table></div>{breached.length > 6 && <p className={styles.adminHint}>Showing six of {breached.length} tickets that missed SLA.</p>}</>}
    </>}
  </section>;
}
