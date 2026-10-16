import type { ITicket } from '../interfaces/ITicket';

export function isTicketCreatedBy(ticket: ITicket, email?: string, aadId?: string): boolean {
  return Boolean(email && ticket.Requester?.Email?.toLowerCase() === email.toLowerCase()) || Boolean(aadId && ticket.Requester?.AadId?.toLowerCase() === aadId.toLowerCase());
}
