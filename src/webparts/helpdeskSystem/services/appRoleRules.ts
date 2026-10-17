import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ITicket } from '../interfaces/ITicket';
import type { IDeskPilotRole, RoleAction } from '../interfaces/IRoleManagement';

export function canUse(service: ITicketDataSource | undefined, action: RoleAction): boolean {
  return !service?.roleRules || service.roleRules.actions.includes(action);
}
export function ticketInScope(ticket: ITicket, role: IDeskPilotRole, userId: number, email: string, aadId?: string): boolean {
  if (role.scope === 'all') return true;
  const person = role.scope === 'own' ? ticket.Requester : ticket.AssignedTo;
  return person?.Id === userId || Boolean(email && person?.Email?.toLowerCase() === email.toLowerCase()) || Boolean(aadId && person?.AadId?.toLowerCase() === aadId.toLowerCase());
}

/** Guards normal app calls; delegated SharePoint permissions enforce data access outside this client. */
export function applyAppRoleRules(source: ITicketDataSource, role: IDeskPilotRole, userId: number, email: string, aadId?: string): ITicketDataSource {
  const result = Object.create(source) as ITicketDataSource;
  result.roleRules = role;
  const requireAction = (action: RoleAction): void => { if (!role.actions.includes(action)) throw new Error(`Your DeskPilot role does not allow ${action}.`); };
  const visible = (ticket: ITicket): boolean => ticketInScope(ticket, role, userId, email, aadId);
  const requireTicket = async (id: number): Promise<ITicket> => {
    const ticket = (await source.getTickets()).tickets.find(item => item.Id === id);
    if (!ticket || !visible(ticket)) throw new Error('This ticket is outside your DeskPilot role’s view.');
    return ticket;
  };
  result.getTickets = async () => {
    if (!role.actions.includes('dashboard') && !role.actions.includes('tickets')) return { tickets: [], isMockData: false, sourceLabel: 'SharePoint', hasResolvedAt: false, hasCategory: false, hasDueDate: false, hasEscalated: false, hasPending: false };
    const data = await source.getTickets(); return { ...data, tickets: data.tickets.filter(visible) };
  };
  if (source.createTicket) result.createTicket = role.actions.includes('create') ? async input => {
    requireAction('create');
    if (input.assignedToId !== null && input.assignedToId !== undefined) requireAction('assign');
    await source.createTicket!(input);
  } : undefined;
  if (source.getCreationOptions) result.getCreationOptions = async () => {
    const options = await source.getCreationOptions!(); return { ...options, assignment: options.assignment && role.actions.includes('assign') };
  };
  if (source.updateTicket) result.updateTicket = role.actions.some(action => action === 'edit' || action === 'status') ? async (id, input) => {
    const ticket = await requireTicket(id);
    if (input.title !== ticket.Title || (input.description !== undefined && input.description !== ticket.Description) || input.category !== undefined || input.subcategory !== undefined || input.issueType !== undefined || input.ticketType !== undefined) requireAction('edit');
    if (input.status !== ticket.Status) requireAction('status');
    if (input.priority !== ticket.Priority) requireAction('priority');
    if (input.assignedToId !== (ticket.AssignedTo?.Id || null)) requireAction('assign');
    await source.updateTicket!(id, input);
  } : undefined;
  if (source.updateTickets) result.updateTickets = role.actions.some(action => ['status', 'priority', 'assign', 'archive'].includes(action)) ? async (ids, action) => {
    requireAction(action.kind);
    for (const id of ids) await requireTicket(id);
    return source.updateTickets!(ids, action);
  } : undefined;
  if (source.getComments) result.getComments = async id => { await requireTicket(id); return source.getComments!(id); };
  if (source.getHistory) result.getHistory = async id => { await requireTicket(id); return source.getHistory!(id); };
  if (source.addComment) result.addComment = role.actions.includes('comment') ? async (id, text) => { requireAction('comment'); await requireTicket(id); await source.addComment!(id, text); } : undefined;
  if (source.uploadAttachments) result.uploadAttachments = role.actions.includes('edit') ? async (id, files) => { requireAction('edit'); await requireTicket(id); await source.uploadAttachments!(id, files); } : undefined;
  if (source.recordFirstResponse) result.recordFirstResponse = role.actions.includes('status') ? async id => { requireAction('status'); await requireTicket(id); await source.recordFirstResponse!(id); } : undefined;
  if (!role.actions.includes('classifications')) result.administration = undefined;
  if (source.getFaqAccess) result.getFaqAccess = async () => { const access = await source.getFaqAccess!(); return { ...access, canManage: access.canManage && role.actions.includes('manageFaqs'), canSubmitDraft: false }; };
  if (source.getFaqs) result.getFaqs = async manage => { requireAction('faqs'); if (manage) requireAction('manageFaqs'); return source.getFaqs!(manage); };
  if (!role.actions.includes('manageFaqs')) { result.saveFaq = undefined; result.deleteFaq = undefined; result.updateFaqs = undefined; }
  if (source.sla) result.sla = { getSettings: manage => { if (manage) requireAction('sla'); return source.sla!.getSettings(manage); }, setup: async () => { throw new Error('SLA setup requires Super Admin.'); }, savePriority: async input => { requireAction('sla'); await source.sla!.savePriority(input); } };
  return result;
}
