import type { ITicket } from '../interfaces/ITicket';
import type { ISlaPriority } from '../interfaces/ISla';
export type SlaState = 'Met' | 'Breached' | 'Within target' | 'Unknown' | 'Not configured';
export function ticketSla(ticket: ITicket, policies: ISlaPriority[], kind: 'response' | 'resolution', now = new Date()): SlaState {
  const policy = policies.find(item => item.active && item.name === ticket.Priority);
  const minutes = kind === 'response' ? policy?.responseMinutes : policy?.resolutionMinutes;
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return 'Not configured';
  if (!(kind === 'response' ? ticket.HasResponseTracking : ticket.HasResolutionTracking)) return 'Unknown';
  const start = Date.parse(ticket.Created);
  if (!Number.isFinite(start) || start > now.getTime()) return 'Unknown';
  const timestamp = kind === 'response' ? ticket.FirstRespondedAt : ticket.ResolvedAt;
  if (timestamp) {
    const end = Date.parse(timestamp);
    if (!Number.isFinite(end) || end < start || end > now.getTime()) return 'Unknown';
    return end - start <= minutes * 60000 ? 'Met' : 'Breached';
  }
  // Legacy completed tickets cannot be scored from Modified or inferred timestamps.
  if (['Resolved', 'Completed', 'Closed'].includes(ticket.Status)) return 'Unknown';
  return now.getTime() - start > minutes * 60000 ? 'Breached' : 'Within target';
}
