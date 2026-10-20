import type { ITicket } from '../interfaces/ITicket';

export function isTicketCreatedBy(ticket: ITicket, email?: string, aadId?: string): boolean {
  const creator = ticket.CreatedBy || ticket.Requester;
  return Boolean(email && creator?.Email?.toLowerCase() === email.toLowerCase()) || Boolean(aadId && creator?.AadId?.toLowerCase() === aadId.toLowerCase());
}
