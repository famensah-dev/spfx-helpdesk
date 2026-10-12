import type { TicketStatus } from '../interfaces/ITicket';

export const ticketStatuses: TicketStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
export const statusColors: Record<string, string> = { New: '#219dcd', Assigned: '#8054c7', 'In Progress': '#ffb800', 'On Hold': '#87909d', Resolved: '#159663', Closed: '#df526b', Escalated: '#df5d85' };
export const normalizeStatus = (value: string): TicketStatus => (value === 'Completed' ? 'Resolved' : value === 'Pending' ? 'On Hold' : value) as TicketStatus;
export const isResolved = (value: string): boolean => ['Resolved', 'Completed', 'Closed'].includes(value);
export const countStatus = (tickets: import('../interfaces/ITicket').ITicket[], status: string): number => tickets.filter(ticket => normalizeStatus(ticket.Status) === status).length;
