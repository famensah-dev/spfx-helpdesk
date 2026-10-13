import type { ITicketDataSource } from '../../../src/webparts/helpdeskSystem/interfaces/ITicketDataSource';
import type { TicketBulkAction, ITicketBulkResult, ITicketEdit, ITicketComment, ITicketVersion } from '../../../src/webparts/helpdeskSystem/interfaces/ITicketDataSource';
import type { ITicketQueryResult } from '../../../src/webparts/helpdeskSystem/interfaces/IDashboard';
import type { ITicket, IUserLookup, TicketStatus, TicketPriority } from '../../../src/webparts/helpdeskSystem/interfaces/ITicket';
import type { IAppConfig } from '../config';
import { GraphClient } from './GraphClient';
import type { IOrganizationUser } from '../../../src/webparts/helpdeskSystem/interfaces/ITicketDataSource';

interface IGraphList { id: string; displayName: string; webUrl?: string; }
interface IGraphColumn { name: string; displayName: string; choice?: { choices: string[] }; text?: object; dateTime?: object; boolean?: object; personOrGroup?: { allowMultipleSelection?: boolean }; }
interface IGraphItem { id: string; webUrl?: string; createdBy?: { user?: { displayName?: string } }; createdDateTime: string; lastModifiedDateTime: string; fields: Record<string, unknown>; }
const statuses: TicketStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Completed', 'Pending', 'Escalated'];
const priorities: TicketPriority[] = ['Low', 'Medium', 'High', 'Critical'];
const text = (value: unknown): string => typeof value === 'string' ? value : '';

export class GraphTicketService implements ITicketDataSource {
  private context?: { sitePath: string; listId: string; lists: IGraphList[] };
  private editSchema?: { path: string; title: string; description?: string; priority: string; priorities: string[] };
  private commentSchema?: { path: string; key: string; content: string };
  private updateSchema?: { path: string; status: string; choices: string[]; assigned: string; archived?: string; resolved?: string };
  private creationSchema?: { path: string; title: string; status: string; priority: string; description?: string; choices: string[]; maxLength?: number };
  public constructor(private readonly graph: GraphClient, private readonly config: IAppConfig,
    private readonly directory?: GraphClient, private readonly getSharePointToken?: () => Promise<string>) {}
  public async searchUsers(query: string, department?: string): Promise<IOrganizationUser[]> {
    if (!this.directory) throw new Error('Organization user search is not configured.');
    const escape = (value: string): string => value.replace(/'/g, "''");
    const term = query.trim();
    if (term.length < 2 && !department?.trim()) return [];
    const filters = [];
    if (term) filters.push(`(startswith(displayName,'${escape(term)}') or startswith(mail,'${escape(term)}') or startswith(userPrincipalName,'${escape(term)}'))`);
    if (department?.trim()) filters.push(`department eq '${escape(department.trim())}'`);
    const params = new URLSearchParams({ '$select': 'id,displayName,mail,userPrincipalName,department', '$filter': filters.join(' and '), '$top': '50' });
    const result = await this.directory.get<{ value: Array<{ id: string; displayName: string; mail?: string; userPrincipalName: string; department?: string }> }>(`/users?${params}`);
    return result.value.filter(user => user.userPrincipalName).map(user => ({ id: user.id, displayName: user.displayName || user.userPrincipalName, email: user.mail || user.userPrincipalName, userPrincipalName: user.userPrincipalName, department: user.department }));
  }
  public async resolveUser(user: IOrganizationUser): Promise<IUserLookup> {
    if (!this.getSharePointToken) throw new Error('SharePoint person resolution is not configured.');
    const token = await this.getSharePointToken();
    const response = await fetch(`${this.config.siteUrl}/_api/web/ensureuser`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' },
      body: JSON.stringify({ logonName: `i:0#.f|membership|${user.userPrincipalName}` }), signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Unable to resolve this person in SharePoint (${response.status}). Check SharePoint delegated AllSites.Write consent and your site access.`);
    const person = await response.json() as { Id: number; Title?: string; Email?: string };
    if (!Number.isSafeInteger(person.Id) || person.Id <= 0) throw new Error('SharePoint did not return a valid person ID.');
    return { Id: person.Id, Title: person.Title || user.displayName, Email: person.Email || user.email };
  }
  public async getHistory(id: number): Promise<ITicketVersion[]> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ticket ID.');
    if (!this.context) await this.getTickets();
    const path = `${this.context!.sitePath}/lists/${encodeURIComponent(this.context!.listId)}/items/${id}/versions`;
    const versions = await this.graph.getAll<{ id: string; lastModifiedDateTime: string; lastModifiedBy?: { user?: { displayName?: string }; application?: { displayName?: string } } }>(path);
    return versions.map(version => ({ id: version.id, modified: version.lastModifiedDateTime, author: version.lastModifiedBy?.user?.displayName || version.lastModifiedBy?.application?.displayName || 'Unknown author' }))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
  }
  public async updateTicket(id: number, input: ITicketEdit): Promise<void> {
    if (!this.editSchema || !this.updateSchema) await this.getTickets();
    const schema = this.editSchema!;
    const workflow = this.updateSchema!;
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ticket ID.');
    if (!input.title.trim() || input.title.trim().length > 255) throw new Error('Enter an issue title of 1–255 characters.');
    if (!schema.priorities.includes(input.priority)) throw new Error('This priority is not configured in the list.');
    const status = workflow.choices.includes(input.status) ? input.status : input.status === 'On Hold' && workflow.choices.includes('Pending') ? 'Pending' : input.status === 'Resolved' && workflow.choices.includes('Completed') ? 'Completed' : undefined;
    if (!status) throw new Error(`Add ${input.status} to the list’s Status choices first.`);
    if (input.assignedToId !== null && (!Number.isSafeInteger(input.assignedToId) || input.assignedToId <= 0)) throw new Error('Select a valid SharePoint person.');
    const fields: Record<string, unknown> = { [schema.title]: input.title.trim(), [schema.priority]: input.priority, [workflow.status]: status, [`${workflow.assigned}LookupId`]: input.assignedToId === null ? null : String(input.assignedToId) };
    if (input.description !== undefined) {
      if (!schema.description) throw new Error('The list has no Issue description text column.');
      fields[schema.description] = input.description;
    }
    await this.graph.patch(`${schema.path}/items/${id}/fields`, fields);
  }
  private async commentsContext(id: number): Promise<{ path: string; key: string; content: string; ticketKey: string }> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ticket ID.');
    if (!this.context) await this.getTickets();
    if (!this.commentSchema) {
      const list = this.context!.lists.find(value => value.displayName === 'TicketComments');
      if (!list) throw new Error('Comments need a TicketComments list on this site, with an indexed TicketKey text column and a Content multiple-lines-of-text column.');
      const path = `${this.context!.sitePath}/lists/${encodeURIComponent(list.id)}`;
      const columns = await this.graph.getAll<IGraphColumn>(`${path}/columns`);
      const key = columns.find(value => (value.name === 'TicketKey' || value.displayName === 'TicketKey') && value.text);
      const content = columns.find(value => (value.name === 'Content' || value.displayName === 'Content') && value.text);
      if (!key || !content) throw new Error('TicketComments requires TicketKey and Content text columns. Index TicketKey in List settings.');
      this.commentSchema = { path, key: key.name, content: content.name };
    }
    return { ...this.commentSchema, ticketKey: `${this.context!.listId}:${id}` };
  }
  public async getComments(id: number): Promise<ITicketComment[]> {
    const schema = await this.commentsContext(id);
    const items = await this.graph.getAll<IGraphItem>(`${schema.path}/items?$expand=fields&$filter=${encodeURIComponent(`fields/${schema.key} eq '${schema.ticketKey}'`)}&$top=200`);
    return items.filter(item => item.fields[schema.key] === schema.ticketKey).map(item => ({ id: item.id, text: text(item.fields[schema.content]), author: item.createdBy?.user?.displayName || 'Organization user', created: item.createdDateTime })).sort((a, b) => a.created.localeCompare(b.created));
  }
  public async addComment(id: number, value: string): Promise<void> {
    if (!value.trim() || value.trim().length > 10000) throw new Error('Enter a comment of 1–10,000 characters.');
    const schema = await this.commentsContext(id);
    await this.graph.post(`${schema.path}/items`, { fields: { Title: `Ticket #${id}`, [schema.key]: schema.ticketKey, [schema.content]: value.trim() } });
  }
  public async updateTickets(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult> {
    if (!this.updateSchema) await this.getTickets();
    const schema = this.updateSchema!;
    const fields: Record<string, unknown> = {};
    if (action.kind === 'archive') {
      if (!schema.archived) throw new Error('Add an Archived Yes/No column to the Issue tracker list before archiving tickets.');
      fields[schema.archived] = true;
    } else if (action.kind === 'assign') {
      if (action.userId !== null && (!Number.isSafeInteger(action.userId) || action.userId <= 0)) throw new Error('Select a valid SharePoint person.');
      fields[`${schema.assigned}LookupId`] = action.userId === null ? null : String(action.userId);
      const status = action.userId === null ? 'New' : 'Assigned';
      if (!schema.choices.includes(status)) throw new Error(`Add ${status} to the list’s Status choices before assigning tickets.`);
      fields[schema.status] = status;
    } else if (action.kind === 'priority') {
      if (!this.editSchema) await this.getTickets();
      if (!priorities.includes(action.priority) || !this.editSchema!.priorities.includes(action.priority)) throw new Error('This priority is not configured in the list.');
      fields[this.editSchema!.priority] = action.priority;
    } else {
      if (!statuses.includes(action.status)) throw new Error('Select a valid ticket status.');
      const value = schema.choices.includes(action.status) ? action.status : action.status === 'On Hold' && schema.choices.includes('Pending') ? 'Pending' : action.status === 'Resolved' && schema.choices.includes('Completed') ? 'Completed' : undefined;
      if (!value) throw new Error(`Add ${action.status} to the list’s Status choices before using this action.`);
      fields[schema.status] = value;
      // Do not invent resolution timestamps when changing workflow status.
    }
    const unique = Array.from(new Set(ids));
    if (!unique.length || unique.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Select valid tickets first.');
    const result: ITicketBulkResult = { succeeded: [], failed: [] };
    for (const id of unique) {
      try { await this.graph.patch(`${schema.path}/items/${id}/fields`, fields); result.succeeded.push(id); }
      catch (error) { result.failed.push({ id, message: error instanceof Error ? error.message : 'Update failed.' }); }
    }
    return result;
  }
  public async createTicket(input: { title: string; description: string; priority: string }): Promise<void> {
    if (!this.creationSchema) await this.getTickets();
    const schema = this.creationSchema;
    if (!schema) throw new Error('Configure New as a Status choice in the SharePoint list before creating tickets.');
    if (!input.title.trim() || input.title.trim().length > 255) throw new Error('Enter an issue title of 1–255 characters.');
    if (!priorities.includes(input.priority as TicketPriority) || !schema.choices.includes(input.priority)) throw new Error('This priority is not configured in the SharePoint list.');
    if (input.description.trim() && !schema.description) throw new Error('Add an Issue description text column to the list to save a description.');
    const fields: Record<string, string> = { [schema.title]: input.title.trim(), [schema.status]: 'New', [schema.priority]: input.priority };
    if (schema.description) fields[schema.description] = input.description.trim();
    await this.graph.post(`${schema.path}/items`, { fields });
  }
  public async getTickets(): Promise<ITicketQueryResult> {
    const url = new URL(this.config.siteUrl);
    const site = this.config.siteId ? { id: this.config.siteId } : await this.graph.get<{ id: string }>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const sitePath = `/sites/${encodeURIComponent(site.id)}`;
    const lists = await this.graph.getAll<IGraphList>(`${sitePath}/lists?$select=id,displayName,webUrl,system`);
    const list = this.config.listId ? lists.find(value => value.id.toLowerCase() === this.config.listId?.toLowerCase()) : lists.find(value => value.displayName === this.config.listName);
    if (!list) throw new Error(`The ${this.config.listName} list was not found on the configured site. Create it using the documented schema, configure its list ID, or check your access.`);
    const listPath = `${sitePath}/lists/${encodeURIComponent(list.id)}`;
    this.context = { sitePath, listId: list.id, lists };
    const columns = await this.graph.getAll<IGraphColumn>(`${listPath}/columns`);
    const normalize = (name: string): string => name.replace(/\s+/g, '').toLowerCase();
    const aliases: Record<string, string[]> = { Title: ['Issue'], AssignedTo: ['Assigned To'], Category: ['Issue Category'], ResolvedAt: ['Resolved At', 'Completed At'], DueDate: ['Expected Resolution Date', 'Expected Resolution Date (New)'] };
    const resolve = (name: string, kind: 'choice' | 'text' | 'dateTime' | 'boolean' | 'personOrGroup', optional = false): IGraphColumn | undefined => {
      const names = [name, ...(aliases[name] || [])].map(normalize);
      const column = columns.find(value => value.name === name) || columns.find(value => names.includes(normalize(value.displayName)) || names.includes(normalize(value.name)));
      if (!column && optional) return undefined;
      if (!column || !column[kind]) throw new Error(`The ${this.config.listName} list requires a ${kind} column named ${[name, ...(aliases[name] || [])].join(' or ')}.`);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column.name)) throw new Error(`Unsupported internal column name: ${column.name}`);
      return column;
    };
    const title = resolve('Title', 'text')!;
    const status = resolve('Status', 'choice')!;
    const priority = resolve('Priority', 'choice')!;
    const assigned = resolve('AssignedTo', 'personOrGroup')!;
    const description = columns.find(column => ['issuedescription', 'description'].includes(normalize(column.displayName)) && column.text);
    this.editSchema = { path: listPath, title: title.name, description: description?.name, priority: priority.name, priorities: priority.choice?.choices || [] };
    if (status.choice?.choices.includes('New')) this.creationSchema = { path: listPath, title: title.name, status: status.name, priority: priority.name, description: description?.name, choices: priority.choice?.choices || [] };
    else this.creationSchema = undefined;
    if (assigned.personOrGroup?.allowMultipleSelection) throw new Error('AssignedTo must allow a single person.');
    const categoryColumn = columns.find(value => value.name === 'Category') || columns.find(value => ['Category', 'Issue Category'].includes(value.displayName));
    const category = categoryColumn ? resolve('Category', categoryColumn.choice ? 'choice' : 'text', true) : undefined;
    const resolved = resolve('ResolvedAt', 'dateTime', true);
    const due = resolve('DueDate', 'dateTime', true);
    const escalated = resolve('Escalated', 'boolean', true);
    const archived = resolve('Archived', 'boolean', true);
    this.updateSchema = { path: listPath, status: status.name, choices: status.choice?.choices || [], assigned: assigned.name, archived: archived?.name, resolved: resolved?.name };
    const optionalDisplay = (names: string[], types: Array<'text' | 'choice' | 'dateTime' | 'personOrGroup'>): IGraphColumn | undefined => columns.find(column => names.map(normalize).includes(normalize(column.displayName)) && types.some(type => Boolean(column[type])));
    const subcategory = optionalDisplay(['Issue Subcategory'], ['text', 'choice']);
    const issueType = optionalDisplay(['Issue Type'], ['text', 'choice']);
    const department = optionalDisplay(['Department', 'Department / Unit', 'Unit'], ['text', 'choice']);
    const started = optionalDisplay(['Started At', 'Viewed At', 'Viewed / Started At'], ['dateTime']);
    const closed = optionalDisplay(['Closed At', 'Closed At (New)'], ['dateTime']);
    const resolutionSummary = optionalDisplay(['Resolution Summary'], ['text']);
    const fields = [title.name, status.name, priority.name, assigned.name, `${assigned.name}LookupId`, ...(description ? [description.name] : []), ...[category, resolved, due, escalated, archived, subcategory, issueType, department, started, closed, resolutionSummary].filter((value): value is IGraphColumn => Boolean(value)).map(value => value.name)];
    const items = await this.graph.getAll<IGraphItem>(`${listPath}/items?$expand=fields($select=${fields.join(',')})&$top=200`);
    const users = new Map<number, IUserLookup>();
    const warnings: string[] = [];
    let assignmentIdentityAvailable = true;
    if (items.some(item => item.fields[`${assigned.name}LookupId`])) {
      try {
        const userListId = this.config.userInformationListId || lists.find(value => value.webUrl && /\/_catalogs\/users(?:\/|$)/i.test(value.webUrl))?.id;
        if (!userListId) throw new Error('User Information List not found.');
        const people = await this.graph.getAll<IGraphItem>(`${sitePath}/lists/${encodeURIComponent(userListId)}/items?$expand=fields($select=Title,EMail,Name)&$top=200`);
        people.forEach(person => {
          const email = text(person.fields.EMail) || text(person.fields.Name).split('|').pop() || '';
          users.set(Number(person.id), { Id: Number(person.id), Title: text(person.fields.Title) || email, Email: email || undefined });
        });
      } catch {
        assignmentIdentityAvailable = false;
        warnings.push('Assignment identities could not be resolved. My Board is unavailable. Ask your administrator to configure read access to the site’s User Information List and its ID.');
      }
    }
    const tickets: ITicket[] = items.map(item => {
      const values = item.fields;
      const rawState = text(values[status.name]);
      const state = (rawState === 'Pending' ? 'On Hold' : rawState === 'Completed' ? 'Resolved' : rawState) as TicketStatus;
      const urgency = text(values[priority.name]) as TicketPriority;
      if (statuses.indexOf(state) < 0 || priorities.indexOf(urgency) < 0) throw new Error(`Ticket ${item.id} has an unsupported status or priority.`);
      const userId = Number(values[`${assigned.name}LookupId`]);
      return { Id: Number(item.id), Title: text(values[title.name]) || 'Untitled ticket', Status: state, Priority: urgency,
        Description: description ? text(values[description.name]) : undefined, WebUrl: item.webUrl,
        Archived: archived ? values[archived.name] === true : false,
        Created: item.createdDateTime, Modified: item.lastModifiedDateTime,
        AssignedTo: userId ? users.get(userId) || { Id: userId, Title: text(values[assigned.name]) || `User #${userId}` } : undefined,
        Category: category ? text(values[category.name]) : undefined,
        Subcategory: subcategory ? text(values[subcategory.name]) : undefined,
        IssueType: issueType ? text(values[issueType.name]) : undefined,
        Department: department ? text(values[department.name]) : undefined,
        Requester: item.createdBy?.user?.displayName ? { Title: item.createdBy.user.displayName } : undefined,
        StartedAt: started ? text(values[started.name]) || undefined : undefined,
        ClosedAt: closed ? text(values[closed.name]) || undefined : undefined,
        ResolutionSummary: resolutionSummary ? text(values[resolutionSummary.name]) : undefined,
        DueDate: due ? text(values[due.name]) || undefined : undefined,
        Escalated: escalated ? values[escalated.name] === true : undefined,
        ResolvedAt: resolved ? text(values[resolved.name]) || null : null };
    });
    if (tickets.some(ticket => ticket.AssignedTo && !ticket.AssignedTo.Email) && assignmentIdentityAvailable) {
      assignmentIdentityAvailable = false;
      warnings.push('Some assigned people have no resolvable email address. My Board is unavailable until assignment identities are complete.');
    }
    const choices = status.choice?.choices || [];
    return { tickets, isMockData: false, sourceLabel: 'Microsoft Graph · SharePoint Tickets',
      hasResolvedAt: Boolean(resolved), hasCategory: Boolean(category), hasDueDate: Boolean(due),
      hasEscalated: Boolean(escalated) || choices.indexOf('Escalated') >= 0, hasPending: choices.indexOf('Pending') >= 0,
      assignmentIdentityAvailable, warnings };
  }
}
