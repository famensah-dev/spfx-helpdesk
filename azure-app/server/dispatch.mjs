import { AccessError, canReadTicket, assertTicketAction } from './authorization.mjs';
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function files(values) {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length > 10) throw new AccessError('At most 10 attachments are allowed.', 400);
  return values.map(value => {
    if (typeof value.name !== 'string' || typeof value.data !== 'string' || value.data.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)) throw new AccessError('Invalid attachment.', 400);
    const content = Buffer.from(value.data, 'base64'); if (content.length > 5 * 1024 * 1024) throw new AccessError('Each attachment must be at most 5 MB.', 400);
    return new File([content], value.name, {type: typeof value.type === 'string' ? value.type : ''});
  });
}
export async function dispatch(access, profile, services, method, args, config) {
  const {tickets, faq, admin, sla} = services;
  const requireAdmin = () => {if (!access.admin) throw new AccessError();};
  const requireSuper = () => {if (!access.superAdmin) throw new AccessError('Ticket schema and site setup are restricted to Super Admin.');};
  let loadedTickets;
  const ticket = async (id, action = 'read', input) => {
    if (!Number.isSafeInteger(id) || id <= 0) throw new AccessError('Invalid ticket ID.', 400);
    const value = (await (loadedTickets ||= tickets.getTickets())).tickets.find(item => item.Id === id);
    if (!value) throw new AccessError('Ticket unavailable.', 404);
    assertTicketAction(access, value, profile, action, input); return value;
  };
  if (['admin.saveEntry', 'admin.deleteEntry'].includes(method) && !['categories', 'subcategories', 'issueTypes'].includes(args[0])) throw new AccessError('Invalid classification page.', 400);
  if (method === 'admin.getData' && !['schema', 'categories', 'subcategories', 'issueTypes'].includes(args[0])) throw new AccessError('Invalid administration page.', 400);
  switch (method) {
    case 'session': return {...access, email: profile.mail || profile.userPrincipalName, name: profile.displayName, siteUrl: config.siteUrl};
    case 'getTickets': {const data = await tickets.getTickets(); return {...data, tickets: data.tickets.filter(item => canReadTicket(access, item, profile))};}
    case 'getPriorities': return tickets.getPriorities();
    case 'getCreationOptions': {const options = await tickets.getCreationOptions(); return {...options, assignment: access.admin && options.assignment};}
    case 'createTicket': {const input = args[0]; if (!access.admin && input.assignedToId != null) throw new AccessError('Agents cannot assign tickets.'); return tickets.createTicket({...input, attachments: files(input.attachments)});}
    case 'uploadAttachments': await ticket(args[0], 'attach'); return tickets.uploadAttachments(args[0], files(args[1]) || []);
    case 'getComments': await ticket(args[0]); return tickets.getComments(args[0]);
    case 'getHistory': await ticket(args[0]); return tickets.getHistory(args[0]);
    case 'addComment': await ticket(args[0], 'comment'); return tickets.addComment(args[0], args[1]);
    case 'recordFirstResponse': await ticket(args[0], 'response'); return tickets.recordFirstResponse(args[0]);
    case 'updateTicket': await ticket(args[0], 'edit', args[1]); return tickets.updateTicket(args[0], args[1]);
    case 'updateTickets': {
      if (!Array.isArray(args[0]) || args[0].length > 200) throw new AccessError('Select up to 200 tickets.', 400);
      const ids = [...new Set(args[0])]; const action = args[1];
      for (const id of ids) await ticket(id, action.kind, action.kind === 'status' ? action.status : action);
      return tickets.updateTickets(ids, action);
    }
    case 'searchUsers': requireAdmin(); return tickets.searchUsers(args[0], args[1]);
    case 'resolveUser': {requireAdmin(); if (!guid.test(args[0]?.id || '')) throw new AccessError('Invalid user ID.', 400); const user = await services.graph.get(`/users/${args[0].id}?$select=id,displayName,mail,userPrincipalName`); return tickets.resolveUser({id: user.id, displayName: user.displayName, email: user.mail || user.userPrincipalName, userPrincipalName: user.userPrincipalName});}
    case 'getFaqs': {if (args[0]) requireAdmin(); return faq.getFaqs(Boolean(args[0]));}
    case 'getFaqAccess': {const value = await faq.getAccess(); return {...value, canManage: access.admin && value.canManage, canSubmitDraft: value.canSubmitDraft};}
    case 'saveFaq': {
      if (access.admin) return faq.save(args[0], args[1]);
      if (args[1] !== undefined || args[0]?.published) throw new AccessError('Agents can submit inactive FAQ drafts only.');
      const source = await ticket(args[0]?.sourceTicketId);
      return faq.save({...args[0], question: source.Title, published: false, sortOrder: 0}, undefined, true);
    }
    case 'deleteFaq': requireAdmin(); return faq.delete(args[0]);
    case 'updateFaqs': requireAdmin(); return faq.updateMany(args[0], args[1]);
    case 'admin.getData': if (args[0] === 'schema') requireSuper(); else requireAdmin(); return admin.getData(args[0]);
    case 'admin.getLookupColumns': requireSuper(); return admin.getLookupColumns(args[0]);
    case 'admin.saveColumn': requireSuper(); return admin.saveColumn(args[0], args[1]);
    case 'admin.deleteColumn': requireSuper(); return admin.deleteColumn(args[0]);
    case 'admin.saveEntry': requireAdmin(); return admin.saveEntry(args[0], args[1], args[2]);
    case 'admin.deleteEntry': requireAdmin(); return admin.deleteEntry(args[0], args[1]);
    case 'sla.getSettings': if (args[0]) requireAdmin(); return sla.getSettings(Boolean(args[0]));
    case 'sla.savePriority': requireAdmin(); return sla.savePriority(args[0]);
    case 'sla.setup': requireSuper(); return sla.setup();
    case 'members.list': requireSuper(); return services.entraUsers.list(access);
    case 'members.save': requireSuper(); return services.entraUsers.change(access, args[0]);
    case 'members.remove': requireSuper(); return services.entraUsers.change(access, args[0], true);
    default: throw new AccessError('Unknown operation.', 404);
  }
}
