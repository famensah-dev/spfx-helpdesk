import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ITicket, IUserLookup } from '../interfaces/ITicket';
import type { IDeskPilotRole, RoleAction } from '../interfaces/IRoleManagement';

export function canUse(service: ITicketDataSource | undefined, action: RoleAction): boolean {
  return !service?.roleRules || service.roleRules.actions.includes(action);
}
function matchesUser(person: IUserLookup | undefined, userId: number, email: string, aadId?: string): boolean {
  return Boolean(userId > 0 && person?.Id === userId) || Boolean(email && person?.Email?.toLowerCase() === email.toLowerCase()) || Boolean(aadId && person?.AadId?.toLowerCase() === aadId.toLowerCase());
}
export function isTicketSubmittedBy(ticket: ITicket, userId: number, email: string, aadId?: string): boolean {
  return matchesUser(ticket.Requester, userId, email, aadId) || matchesUser(ticket.CreatedBy, userId, email, aadId);
}
export function isTicketCreator(ticket: ITicket, userId: number, email: string, aadId?: string): boolean {
  return matchesUser(ticket.CreatedBy,userId,email,aadId);
}
export function isAgentCreatedTicket(ticket: ITicket, service: ITicketDataSource | undefined, userId = 0): boolean {
  return Boolean((service?.roleRules?.id === 'agent' || service?.access?.agent) && matchesUser(ticket.CreatedBy, userId, service?.access?.email || '', service?.access?.oid));
}
export function ticketInScope(ticket: ITicket, role: IDeskPilotRole, userId: number, email: string, aadId?: string): boolean {
  if (role.scope === 'all') return true;
  if (role.scope === 'newUnassigned') return ticket.Status === 'New' && !ticket.AssignedTo?.Id && !ticket.AssignedTo?.Email && !ticket.AssignedTo?.AadId;
  const people = role.scope === 'own' ? [ticket.Requester] : role.scope === 'assignedOrCreated' ? [ticket.AssignedTo, ticket.CreatedBy] : [ticket.AssignedTo];
  return people.some(person => matchesUser(person, userId, email, aadId));
}

/** Guards normal app calls; delegated SharePoint permissions enforce data access outside this client. */
export function applyAppRoleRules(source: ITicketDataSource, role: IDeskPilotRole, userId: number, email: string, aadId?: string): ITicketDataSource {
  const result = Object.create(source) as ITicketDataSource;
  result.roleRules = role;
  if (!source.access?.admin && !source.access?.superAdmin) result.supportUnits = undefined;
  const requireAction = (action: RoleAction): void => { if (!role.actions.includes(action)) throw new Error(`Your DeskPilot role does not allow ${action}.`); };
  const visible = (ticket: ITicket): boolean => ticketInScope(ticket, role, userId, email, aadId);
  const createdByAgent = (ticket: ITicket): boolean => role.id === 'agent' && matchesUser(ticket.CreatedBy, userId, email, aadId);
  const requireTicket = async (id: number): Promise<ITicket> => {
    if(!role.actions.includes('tickets') && !role.actions.includes('dashboard'))throw new Error('Your DeskPilot role does not allow viewing tickets.');
    const ticket = (await source.getTickets()).tickets.find(item => item.Id === id);
    if (!ticket || !visible(ticket)) throw new Error('This ticket is outside your DeskPilot role’s view.');
    return ticket;
  };
  const requireManagedTicket = async (id: number): Promise<ITicket> => {
    const ticket = await requireTicket(id);
    // Seeing a submitted request does not make its creator the handling agent.
    if (role.id === 'agent' && ['assigned', 'assignedOrCreated'].includes(role.scope) && !matchesUser(ticket.AssignedTo, userId, email, aadId)) throw new Error('Only tickets assigned to you can be managed. You can still view and comment on your submitted requests.');
    return ticket;
  };
  result.getTickets = async () => {
    if (!role.actions.includes('dashboard') && !role.actions.includes('tickets')) return { tickets: [], isMockData: false, sourceLabel: 'SharePoint', hasResolvedAt: false, hasCategory: false, hasDueDate: false, hasEscalated: false, hasPending: false };
    const data = await source.getTickets(); return { ...data, tickets: data.tickets.filter(visible) };
  };
  if (source.createTicket) result.createTicket = role.actions.includes('create') ? async input => {
    requireAction('create');
    if (input.assignedToId !== null && input.assignedToId !== undefined && role.id!=='agent') requireAction('assign');
    await source.createTicket!(input);
  } : undefined;
  if (source.getCreationOptions) result.getCreationOptions = async () => {
    const options = await source.getCreationOptions!(); return { ...options, assignment: options.assignment && (role.actions.includes('assign') || (role.id==='agent' && role.actions.includes('create'))) };
  };
  if (source.updateTicket) result.updateTicket = role.actions.some(action => action === 'edit' || action === 'status') ? async (id, input) => {
    const ticket = await requireTicket(id);
    const contentChanged = input.title !== ticket.Title || (input.description !== undefined && input.description !== ticket.Description) || input.category !== undefined || input.subcategory !== undefined || input.issueType !== undefined || input.ticketType !== undefined || input.requestedById !== undefined || input.requesterName !== undefined || input.requesterEmail !== undefined || input.dueDate !== undefined || input.department !== undefined || input.ticketSource !== undefined;
    if ((input.title !== ticket.Title || (input.description !== undefined && input.description !== ticket.Description)) && !matchesUser(ticket.CreatedBy,userId,email,aadId)) throw new Error('Only the ticket creator can change its title or description.');
    if(input.requestedById!==undefined || input.requesterName!==undefined || input.requesterEmail!==undefined)throw new Error('Requester details cannot be changed after ticket creation.');
    if(role.id==='agent' && input.assignedToId !== (ticket.AssignedTo?.Id || null) && !createdByAgent(ticket))throw new Error('Agents can assign only tickets they created.');
    if(role.id==='agent' && input.status==='Closed' && ticket.Status!=='Closed')throw new Error('Agents cannot close tickets.');
    const submittedAgent = role.id === 'agent' && isTicketSubmittedBy(ticket,userId,email,aadId);
    const statusSummary = submittedAgent && input.status !== ticket.Status && ['Resolved','Completed','Closed'].includes(input.status) && Boolean(input.resolutionSummary?.trim());
    if ((contentChanged && !createdByAgent(ticket)) || (input.resolutionSummary !== undefined && !statusSummary) || input.priority !== ticket.Priority || (input.assignedToId !== (ticket.AssignedTo?.Id || null) && !createdByAgent(ticket))) await requireManagedTicket(id);
    if (input.resolutionSummary !== undefined) {
      requireAction('edit');
      if (!input.resolutionSummary.trim() && !source.access?.admin && !source.access?.superAdmin) throw new Error('Only Helpdesk Admins can clear the resolution summary.');
    }
    if (input.status === 'Closed' && ticket.Status !== 'Closed' && !source.access?.admin && !source.access?.superAdmin) throw new Error('Only Helpdesk Admins can close tickets.');
    if (contentChanged) requireAction('edit');
    if (input.status !== ticket.Status) requireAction('status');
    if (input.priority !== ticket.Priority) requireAction('priority');
    if (input.assignedToId !== (ticket.AssignedTo?.Id || null) && !createdByAgent(ticket)) requireAction('assign');
    await source.updateTicket!(id, input);
  } : undefined;
  if (source.updateTickets) result.updateTickets = role.actions.some(action => ['status', 'priority', 'assign', 'archive'].includes(action)) ? async (ids, action) => {
    if (action.kind !== 'assign') requireAction(action.kind);
    for (const id of ids) {
      const checked=await requireTicket(id);
      if(role.id==='agent' && action.kind==='assign' && !createdByAgent(checked))throw new Error('Agents can assign only tickets they created.');
      if(role.id==='agent' && action.kind==='status' && action.status==='Closed')throw new Error('Agents cannot close tickets.');
      if (action.kind === 'assign' && createdByAgent(await requireTicket(id))) continue;
      if (action.kind === 'assign') requireAction('assign');
      const ticket = action.kind === 'status' ? await requireTicket(id) : await requireManagedTicket(id);
      if (action.kind === 'status' && action.status === 'Closed' && ticket.Status !== 'Closed' && !source.access?.admin && !source.access?.superAdmin) throw new Error('Only Helpdesk Admins can close tickets.');
    }
    return source.updateTickets!(ids, action);
  } : undefined;
  if (source.getComments) result.getComments = async id => { await requireTicket(id); return source.getComments!(id); };
  if(source.deleteComment)result.deleteComment=async(id,commentId)=>{requireAction('comment');await requireTicket(id);await source.deleteComment!(id,commentId);};
  if (source.getHistory) result.getHistory = async id => { await requireTicket(id); return source.getHistory!(id); };
  if (source.markCommentAsSolution) result.markCommentAsSolution = source.access?.admin || source.access?.superAdmin ? async (id, commentId, replace) => { requireAction('edit'); await requireTicket(id); await source.markCommentAsSolution!(id,commentId,replace); } : undefined;
  if (source.addComment) result.addComment = role.actions.includes('comment') ? async (id, text, options) => { requireAction('comment'); await requireTicket(id); await source.addComment!(id, text, options); } : undefined;
  if (source.uploadCommentAttachments) result.uploadCommentAttachments = role.actions.includes('comment') ? async (id, commentId, files, progress) => {requireAction('comment'); await requireTicket(id); await source.uploadCommentAttachments!(id,commentId,files,progress);} : undefined;
  if (source.getAttachments) result.getAttachments = async id => {await requireTicket(id); return source.getAttachments!(id);};
  if (source.uploadAttachments) result.uploadAttachments = role.actions.includes('edit') ? async (id, files, progress) => { requireAction('edit'); await requireManagedTicket(id); await source.uploadAttachments!(id, files, progress); } : undefined;
  if (source.recordFirstResponse) result.recordFirstResponse = role.actions.includes('status') ? async id => { requireAction('status'); await requireManagedTicket(id); await source.recordFirstResponse!(id); } : undefined;
  if(source.ticketViews)result.ticketViews=role.actions.includes('tickets') || role.actions.includes('dashboard') ? {getOpened:ids=>source.ticketViews!.getOpened(ids),markOpened:async id=>{await requireTicket(id);await source.ticketViews!.markOpened(id);},subscribe:source.ticketViews.subscribe?.bind(source.ticketViews)} : undefined;
  if (!role.actions.includes('classifications')) result.administration = undefined;
  if (source.getFaqAccess) result.getFaqAccess = async () => { const access = await source.getFaqAccess!(); return { ...access, canManage: access.canManage && role.actions.includes('manageFaqs'), canCreate:access.canCreate && (role.actions.includes('manageFaqs') || (role.id==='agent' && role.actions.includes('faqs'))), canEditArticles:access.canEditArticles && role.actions.includes('faqs'), canSubmitDraft: false }; };
  if (source.getFaqs) result.getFaqs = async manage => { requireAction('faqs'); if (manage) requireAction('manageFaqs'); const articles=await source.getFaqs!(manage);return role.id==='requester' ? articles.filter(article=>article.published) : articles; };
  if(source.saveFaq && role.id==='agent' && role.actions.includes('faqs'))result.saveFaq=async(input,id)=>{
    requireAction('faqs');
    await source.saveFaq!(input,id);
  };
  if (!role.actions.includes('manageFaqs')) { if(role.id!=='agent' || !role.actions.includes('faqs'))result.saveFaq = undefined; result.deleteFaq = undefined; result.updateFaqs = undefined; }
  if (source.sla) result.sla = { getSettings: manage => { if (manage) requireAction('sla'); return source.sla!.getSettings(manage); }, setup: async () => { throw new Error('SLA setup requires Super Admin.'); }, savePriority: async input => { requireAction('sla'); await source.sla!.savePriority(input); }, saveClockRules: source.sla.saveClockRules ? async input=>{requireAction('sla');await source.sla!.saveClockRules!(input);} : undefined, checkBreaches: source.sla.checkBreaches && source.access?.admin ? async tickets=>{if(!role.actions.includes('tickets')&&!role.actions.includes('dashboard'))return;await source.sla!.checkBreaches!(tickets.filter(visible));} : undefined };
  return result;
}
