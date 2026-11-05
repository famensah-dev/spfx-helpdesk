import type { TicketStatus } from '../interfaces/ITicket';

export const ticketStatuses: TicketStatus[] = ['New', 'In Progress', 'Pending', 'Resolved', 'Closed'];
export const statusColors: Record<string, string> = { New: '#219dcd', Pending:'#ffbf00', Assigned: '#8054c7', 'In Progress': '#8054c7', 'On Hold': '#87909d', 'Waiting on Third Party': '#b07828', Resolved: '#159663', Closed: '#718096', Escalated: '#df5d85' };
export const normalizeStatus = (value: string): TicketStatus => ({Completed:'Resolved',Assigned:'New','On Hold':'Pending','Waiting on Third Party':'Pending',Escalated:'In Progress'}[value] || value) as TicketStatus;
export const isResolved = (value: string): boolean => ['Resolved', 'Completed', 'Closed'].includes(value);
export const countStatus = (tickets: import('../interfaces/ITicket').ITicket[], status: string): number => tickets.filter(ticket => normalizeStatus(ticket.Status) === status).length;
