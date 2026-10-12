import type { ITicket } from '../interfaces/ITicket';
import type { IChartDataset } from '../interfaces/IDashboard';

export interface IGlobalSummary { total: number; open: number; pending: number; closed: number; escalated: number; overdue: number; }
export function getGlobalSummary(tickets: ITicket[], now: Date = new Date()): IGlobalSummary {
  return tickets.reduce<IGlobalSummary>((result, ticket) => {
    const unresolved = ticket.Status !== 'Completed' && ticket.Status !== 'Closed';
    result.total++;
    if (unresolved) result.open++;
    if (ticket.Status === 'Pending') result.pending++;
    if (ticket.Status === 'Closed') result.closed++;
    if (ticket.Escalated || ticket.Status === 'Escalated') result.escalated++;
    if (unresolved && ticket.DueDate && new Date(ticket.DueDate).getTime() < now.getTime()) result.overdue++;
    return result;
  }, { total: 0, open: 0, pending: 0, closed: 0, escalated: 0, overdue: 0 });
}
export function getCategoryChart(tickets: ITicket[]): IChartDataset {
  const counts = new Map<string, number>();
  tickets.forEach(ticket => {
    const category = ticket.Category?.trim() || 'Uncategorized';
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const visible = entries.slice(0, 7);
  if (entries.length > 7) visible.push(['Other categories', entries.slice(7).reduce((sum, entry) => sum + entry[1], 0)]);
  return { labels: visible.map(entry => entry[0]), datasets: [{ label: 'Tickets', data: visible.map(entry => entry[1]), backgroundColor: ['#3988d4', '#2c9976', '#e7b544', '#e4777c', '#9b83c4', '#58a4ba', '#b39673', '#7a8397'], borderWidth: 0 }] };
}
