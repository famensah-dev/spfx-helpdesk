export class AccessError extends Error { constructor(message = 'You do not have permission for this action.', status = 403) {super(message); this.status = status;} }
const roles = ['DeskPilot.SuperAdmin', 'DeskPilot.HelpdeskAdmin', 'DeskPilot.HelpdeskAgent'];
export function sessionAccess(claims) {
  const assigned = Array.isArray(claims.roles) ? claims.roles : [];
  const role = roles.find(value => assigned.includes(value));
  if (!role) throw new AccessError('No recognized DeskPilot role is assigned. Ask your administrator to assign an app role.');
  return {role, oid: claims.oid, superAdmin: role === roles[0], admin: role !== roles[2], agent: role === roles[2]};
}
export function ownsTicket(access, ticket, profile) {
  const email = ticket.AssignedTo?.Email?.toLowerCase();
  return Boolean(email && [profile.mail, profile.userPrincipalName].some(value => value?.toLowerCase() === email));
}
export function canReadTicket(access, ticket, profile) {
  const requesterEmail = ticket.Requester?.Email?.toLowerCase();
  return access.admin || ownsTicket(access, ticket, profile) || ticket.Requester?.AadId?.toLowerCase() === access.oid.toLowerCase() || Boolean(requesterEmail && [profile.mail, profile.userPrincipalName].some(value => value?.toLowerCase() === requesterEmail));
}
export function assertTicketAction(access, ticket, profile, action, input) {
  if (!canReadTicket(access, ticket, profile)) throw new AccessError('This ticket is outside your workspace access.');
  if (access.admin || ['read', 'comment', 'attach'].includes(action)) return;
  if (!ownsTicket(access, ticket, profile)) throw new AccessError('Only assigned tickets can be managed.');
  if (action === 'response') return;
  if (action === 'status') {
    if (['Resolved', 'Completed', 'Closed'].includes(ticket.Status) && !['Resolved', 'Completed', 'Closed'].includes(input)) throw new AccessError('Only a helpdesk administrator can reopen a ticket.');
    return;
  }
  if (action === 'edit') {
    if (input.priority !== ticket.Priority || input.assignedToId !== (ticket.AssignedTo?.Id || null)) throw new AccessError('Agents cannot change priority or assignment.');
    assertTicketAction(access, ticket, profile, 'status', input.status); return;
  }
  throw new AccessError('Agents cannot assign tickets, change priority, or archive tickets.');
}
