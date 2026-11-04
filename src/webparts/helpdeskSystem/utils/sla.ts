import type { ITicket } from '../interfaces/ITicket';
import type { ISlaPriority } from '../interfaces/ISla';
import { defaultSlaClockRules, slaElapsed } from './slaClock';
export type SlaState = 'Met' | 'Breached' | 'At risk' | 'Within target' | 'Unknown' | 'Not configured';
export function ticketSla(ticket: ITicket, policies: ISlaPriority[], kind: 'response' | 'resolution', now = new Date()): SlaState {
  const policy = policies.find(item => item.active && item.name === ticket.Priority);
  const minutes = kind === 'response' ? policy?.responseMinutes : policy?.resolutionMinutes;
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return 'Not configured';
  if (!(kind === 'response' ? ticket.HasResponseTracking : ticket.HasResolutionTracking)) return 'Unknown';
  const start = Date.parse(ticket.Created);
  if (!Number.isFinite(start) || start > now.getTime()) return 'Unknown';
  const timestamp = kind === 'response' ? ticket.FirstRespondedAt : ticket.ResolvedAt;
  const rules=policy?.clockRules || defaultSlaClockRules();
  const end=timestamp?Date.parse(timestamp):now.getTime();
  if(!Number.isFinite(end)||end<start||end>now.getTime())return 'Unknown';
  let elapsed=slaElapsed(start,end,rules);
  if(rules.pausePending){
    if(!ticket.SlaPauseIntervals || ticket.SlaPauseIntervals.some(interval=>!interval||typeof interval.start!=='string'))return 'Unknown';
    if(['Pending','On Hold','Waiting on Third Party'].includes(ticket.Status)!==ticket.SlaPauseIntervals.some(interval=>!interval.end))return 'Unknown';
    let previousEnd=start;
    for(const interval of ticket.SlaPauseIntervals){if(!interval||typeof interval.start!=='string'||(interval.end!==undefined&&typeof interval.end!=='string'))return 'Unknown';const a=Date.parse(interval.start),b=interval.end?Date.parse(interval.end):now.getTime();if(!Number.isFinite(a)||!Number.isFinite(b)||a<previousEnd||b<a||b>now.getTime())return 'Unknown';previousEnd=b;elapsed-=slaElapsed(Math.max(start,a),Math.min(end,b),rules);}
  }
  if (timestamp) {
    const end = Date.parse(timestamp);
    if (!Number.isFinite(end) || end < start || end > now.getTime()) return 'Unknown';
    return elapsed <= minutes * 60000 ? 'Met' : 'Breached';
  }
  // Legacy completed tickets cannot be scored from Modified or inferred timestamps.
  if (['Resolved', 'Completed', 'Closed'].includes(ticket.Status)) return 'Unknown';
  return elapsed > minutes * 60000 ? 'Breached' : rules.markAtRisk && elapsed >= minutes * 60000 * rules.atRiskPercent/100 ? 'At risk' : 'Within target';
}
