import { loadClassification } from './GraphClassificationService';
import { validateTicketAttachments } from '../../utils/ticketAttachments';
import type { INewTicketInput, ITicketCreationOptions } from '../../interfaces/ITicketDataSource';
import type { ITicketDataSource } from '../../interfaces/ITicketDataSource';
import type { TicketBulkAction, ITicketBulkResult, ITicketEdit, ITicketComment, ITicketVersion, ITicketAttachment, ICommentPostOptions } from '../../interfaces/ITicketDataSource';
import { SharePointAttachments } from './SharePointAttachments';
import type { ITicketQueryResult } from '../../interfaces/IDashboard';
import type { ITicket, IUserLookup, TicketStatus, TicketPriority } from '../../interfaces/ITicket';
import type { IAppConfig } from './IAppConfig';
import { GraphClient } from './GraphClient';
import type { IOrganizationUser } from '../../interfaces/ITicketDataSource';

interface IGraphList { id: string; displayName: string; webUrl?: string; }
interface IGraphColumn { required?: boolean; readOnly?: boolean; name: string; displayName: string; choice?: { choices: string[] }; text?: object; dateTime?: object; boolean?: object; personOrGroup?: { allowMultipleSelection?: boolean }; lookup?: { listId: string; allowMultipleValues?: boolean }; }
interface IGraphItem { id: string; webUrl?: string; createdBy?: { user?: { displayName?: string; id?: string; email?: string } }; createdDateTime: string; lastModifiedDateTime: string; fields: Record<string, unknown>; }
const statuses: TicketStatus[] = ['New', 'Assigned', 'In Progress', 'On Hold', 'Waiting on Third Party', 'Resolved', 'Closed', 'Completed', 'Pending', 'Escalated'];
const text = (value: unknown): string => typeof value === 'string' ? value : '';

export class GraphTicketService implements ITicketDataSource {
  public invalidateSchema(): void { this.context = undefined; this.creationSchema = undefined; this.editSchema = undefined; this.updateSchema = undefined; this.solutionSchema = undefined; this.requesterFields = undefined; this.commentSchema = undefined; this.creationFields = []; }
  private creationFields: Array<{ key: 'category' | 'subcategory' | 'issueType' | 'ticketType' | 'department' | 'dueDate'; label: string; column: IGraphColumn }> = [];
  private context?: { sitePath: string; listId: string; lists: IGraphList[] };
  private editSchema?: { path: string; title: string; description?: string; priority: string; priorities: string[] };
  private commentSchema?: { path: string; listId: string; key: string; content: string };
  private solutionSchema?: {path:string;summary:string;comment:string};
  private requesterFields?: {requestedBy?:string;email?:string;source?:string};
  public async markCommentAsSolution(id:number,commentId:string,replaceExisting = false): Promise<void> {
    if (!/^[1-9]\d*$/.test(commentId)) throw new Error('Invalid comment ID.');
    if (!this.solutionSchema) await this.getTickets();
    if (!this.solutionSchema) throw new Error('Run Initialize workspace to add Resolution Summary and Solution Comment ID.');
    const schema = await this.commentsContext(id);
    const comment = await this.graph.get<IGraphItem>(`${schema.path}/items/${commentId}?$expand=fields`);
    if (comment.fields[schema.key] !== schema.ticketKey) throw new Error('This comment belongs to a different ticket.');
    const answer = text(comment.fields[schema.content]).trim();
    if (!answer) throw new Error('An empty comment cannot be a solution.');
    const target = this.solutionSchema;
    const current = await this.graph.get<IGraphItem & {'@odata.etag'?:string;eTag?:string}>(`${target.path}/items/${id}?$expand=fields`);
    if (text(current.fields[target.summary]) && text(current.fields[target.comment]) !== commentId && !replaceExisting) throw new Error('Confirm replacement of the existing resolution summary.');
    const etag = current.eTag || current['@odata.etag'];
    if (!etag) throw new Error('Unable to verify the ticket version. Refresh and try again.');
    await this.graph.patch(`${target.path}/items/${id}/fields`,{[target.summary]:answer,[target.comment]:commentId},etag);
  }
  private updateSchema?: { path: string; status: string; choices: string[]; assigned: string; archived?: string; resolved?: string; response?: string };
  private creationSchema?: { path: string; title: string; status: string; priority: string; description?: string; choices: string[]; maxLength?: number };
  public constructor(private readonly graph: GraphClient, private readonly config: IAppConfig,
    private readonly directory?: GraphClient, private readonly getSharePointToken?: () => Promise<string>, private readonly routeNewTicket?: (id:number) => Promise<string>) {}
  public async getPriorities(): Promise<string[]> { if (!this.editSchema) await this.getTickets(); return [...this.editSchema!.priorities]; }
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
    return result.value.filter(user => user.userPrincipalName).map(user => ({ id: user.id, displayName: user.displayName || user.userPrincipalName, email: user.mail || user.userPrincipalName, userPrincipalName: user.userPrincipalName, department: typeof user.department === 'string' ? user.department : undefined }));
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
    if (input.ticketType !== undefined) {
      const field = this.creationFields.find(item => item.key === 'ticketType');
      if (!field || !['Problem', 'Incident', 'Question', 'Request'].includes(input.ticketType) || !field.column.choice?.choices.includes(input.ticketType)) throw new Error('Select a configured Ticket Type: Problem, Incident, Question or Request.');
      fields[field.column.name] = input.ticketType;
    }
    if (input.description !== undefined) {
      if (!schema.description) throw new Error('The list has no Issue description text column.');
      fields[schema.description] = input.description;
    }
    if ([input.category, input.subcategory, input.issueType].some(value => value !== undefined)) {
      const classification = await loadClassification(this.graph, this.context!.sitePath, this.context!.lists, this.config.resourceIds);
      const selected = { category: classification.categories.find(item => item.id === input.category), subcategory: classification.subcategories.find(item => item.id === input.subcategory), issueType: classification.issueTypes.find(item => item.id === input.issueType) };
      if ((input.subcategory && selected.subcategory?.parentId !== selected.category?.id)) throw new Error('Classification entries must belong to their selected parents.');
      for (const key of ['category', 'subcategory', 'issueType'] as const) {
        if (input[key] === undefined) continue;
        const field = this.creationFields.find(item => item.key === key);
        if (!field) throw new Error(`The ticket list has no writable ${key} field.`);
        const entry = selected[key];
        if (input[key] && !entry) throw new Error('Select an active classification entry.');
        if (!entry && field.column.required) throw new Error(`Select ${field.label}.`);
        if (field.column.lookup) {
          if (field.column.lookup.allowMultipleValues || field.column.lookup.listId.toLowerCase() !== classification.listIds[key].toLowerCase()) throw new Error(`${field.label} must look up the correct classification list.`);
          fields[`${field.column.name}LookupId`] = entry ? entry.id : null;
        } else {
          if (entry && field.column.choice && !field.column.choice.choices.includes(entry.name)) throw new Error(`Add ${entry.name} to ${field.label} choices or use a lookup column.`);
          fields[field.column.name] = entry?.name || '';
        }
      }
    }
    await this.addResolutionTimestamp(id, status, fields);
    await this.graph.patch(`${schema.path}/items/${id}/fields`, fields);
  }
  private async addResolutionTimestamp(id: number, next: string, fields: Record<string, unknown>): Promise<void> {
    const schema = this.updateSchema!;
    if (!schema.resolved) return;
    const current = await this.graph.get<Record<string, unknown>>(`${schema.path}/items/${id}/fields?$select=${schema.status},${schema.resolved}`);
    const terminal = (status: string): boolean => ['Resolved', 'Completed', 'Closed'].includes(status);
    if (terminal(next) && !terminal(String(current[schema.status]))) fields[schema.resolved] = new Date().toISOString();
    else if (!terminal(next) && terminal(String(current[schema.status]))) fields[schema.resolved] = null;
  }
  public async recordFirstResponse(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ticket ID.');
    if (!this.updateSchema) await this.getTickets();
    const schema = this.updateSchema!;
    if (!schema.response) throw new Error('Set up SLA tracking to add FirstRespondedAt.');
    const item = await this.graph.get<{eTag?: string; fields: Record<string, unknown>}>(`${schema.path}/items/${id}?$expand=fields($select=${schema.response})`);
    if (item.fields[schema.response]) return;
    if (!item.eTag) throw new Error('Unable to verify the ticket version. Refresh and try again.');
    await this.graph.patch(`${schema.path}/items/${id}/fields`, {[schema.response]: new Date().toISOString()}, item.eTag);
  }
  private async commentsContext(id: number): Promise<{ path: string; listId: string; key: string; content: string; ticketKey: string }> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid ticket ID.');
    if (!this.context) await this.getTickets();
    if (!this.commentSchema) {
      const list = this.context!.lists.find(value => this.config.resourceIds?.comments ? value.id.toLowerCase() === this.config.resourceIds.comments.toLowerCase() : value.displayName === 'TicketComments');
      if (!list) throw new Error('Comments need the TicketComments list. Ask a Super Admin to run Initialize workspace in Settings > Site Lists.');
      const path = `${this.context!.sitePath}/lists/${encodeURIComponent(list.id)}`;
      const columns = await this.graph.getAll<IGraphColumn>(`${path}/columns`);
      const key = columns.find(value => (value.name === 'TicketKey' || value.displayName === 'TicketKey') && value.text);
      const content = columns.find(value => (value.name === 'Content' || value.displayName === 'Content') && value.text);
      if (!key || !content) throw new Error('TicketComments requires TicketKey and Content text columns. Index TicketKey in List settings.');
      this.commentSchema = { path, listId: list.id, key: key.name, content: content.name };
    }
    return { ...this.commentSchema, ticketKey: `${this.context!.listId}:${id}` };
  }
  public async getComments(id: number): Promise<ITicketComment[]> {
    const schema = await this.commentsContext(id);
    const items = await this.graph.getAll<IGraphItem>(`${schema.path}/items?$expand=fields&$filter=${encodeURIComponent(`fields/${schema.key} eq '${schema.ticketKey}'`)}&$top=200`);
    const result:ITicketComment[] = [];
    const matching = items.filter(item => item.fields[schema.key] === schema.ticketKey);
    for (let offset = 0; offset < matching.length; offset += 4) {
      result.push(...await Promise.all(matching.slice(offset,offset + 4).map(async item => {
        const comment:ITicketComment = {id:item.id,text:text(item.fields[schema.content]),author:item.createdBy?.user?.displayName || 'Organization user',created:item.createdDateTime};
        if (item.fields.Attachments !== false) {
          try {comment.attachments = await this.attachments().list(schema.listId,Number(item.id));}
          catch (reason) {comment.attachmentError = reason instanceof Error ? reason.message : 'Unable to load files. Refresh comments to retry.';}
        }
        return comment;
      })));
    }
    return result.sort((a,b) => a.created.localeCompare(b.created));
  }
  public async addComment(id: number, value: string, options: ICommentPostOptions = {}): Promise<void> {
    if (!value.trim() || value.trim().length > 10000) throw new Error('Enter a comment of 1–10,000 characters.');
    const schema = await this.commentsContext(id);
    const files = options.files || [];
    validateTicketAttachments(files);
    if (files.length) await this.attachments().ensureEnabled(schema.listId);
    if (options.requestId && !/^[a-f0-9-]{36}$/i.test(options.requestId)) throw new Error('Invalid comment request ID.');
    const title = `Ticket #${id}${options.requestId ? ` [${options.requestId}]` : ''}`;
    // Reuse a confirmed comment after an uncertain save response; don't create it again on an upload retry.
    const previous = options.requestId ? (await this.graph.getAll<IGraphItem>(`${schema.path}/items?$expand=fields&$filter=${encodeURIComponent(`fields/${schema.key} eq '${schema.ticketKey}'`)}&$top=200`)).filter(item => item.fields[schema.key] === schema.ticketKey && item.fields.Title === title) : [];
    if (previous.length > 1) throw new Error('Multiple matching comments were found. Refresh comments before continuing.');
    if (previous[0] && previous[0].fields[schema.content] !== value.trim()) throw new Error('This comment was already saved with different text. Refresh before posting a changed comment.');
    const created = previous[0] || await this.graph.post<{id:string}>(`${schema.path}/items`, { fields: { Title: title, [schema.key]: schema.ticketKey, [schema.content]: value.trim() } });
    if (!created?.id || !/^[1-9]\d*$/.test(String(created.id))) throw new Error('The comment save returned no valid ID. Refresh comments before retrying.');
    if (files.length) {
      try {
        if (previous[0]) await this.uploadCommentAttachments(id,String(created.id),files,options.onProgress);
        else await this.attachments().upload(schema.listId,Number(created.id),files,options.onProgress);
      }
      catch (reason) {
        const error = new Error(`Your comment was saved, but some attachments need to be uploaded. ${reason instanceof Error ? reason.message : 'Upload failed.'}`) as Error & {createdCommentId:string};
        error.createdCommentId = String(created.id); throw error;
      }
    }
  }
  private attachments(): SharePointAttachments {
    if (!this.getSharePointToken) throw new Error('SharePoint attachments are not configured in this host.');
    return new SharePointAttachments(this.config.siteUrl,this.getSharePointToken);
  }
  public async getAttachments(id:number): Promise<ITicketAttachment[]> {
    if (!this.context) await this.getTickets();
    return this.attachments().list(this.context!.listId,id);
  }
  public async uploadCommentAttachments(ticketId:number,commentId:string,files:File[],progress?:(message:string)=>void): Promise<void> {
    const schema = await this.commentsContext(ticketId);
    if (!/^[1-9]\d*$/.test(commentId)) throw new Error('Invalid comment ID.');
    if (!this.getSharePointToken) throw new Error('SharePoint attachments are not configured.');
    const token = await this.getSharePointToken();
    const response = await fetch(`${this.config.siteUrl}/_api/web/currentuser?$select=Id`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json;odata=nometadata'},signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error('Unable to verify the comment author.');
    const user = await response.json() as {Id:number};
    const item = await this.graph.get<IGraphItem>(`${schema.path}/items/${commentId}?$expand=fields`);
    if (item.fields[schema.key] !== schema.ticketKey || Number(item.fields.AuthorLookupId) !== user.Id) throw new Error('You can retry attachments only on your own comment for this ticket.');
    await this.attachments().upload(schema.listId,Number(commentId),files,progress);
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
      if (!this.editSchema!.priorities.includes(action.priority)) throw new Error('This priority is not configured in the list.');
      fields[this.editSchema!.priority] = action.priority;
    } else {
      if (!statuses.includes(action.status)) throw new Error('Select a valid ticket status.');
      const value = schema.choices.includes(action.status) ? action.status : action.status === 'On Hold' && schema.choices.includes('Pending') ? 'Pending' : action.status === 'Resolved' && schema.choices.includes('Completed') ? 'Completed' : undefined;
      if (!value) throw new Error(`Add ${action.status} to the list’s Status choices before using this action.`);
      fields[schema.status] = value;
      // Resolution timestamps are recorded below only for actual status transitions.
    }
    const unique = Array.from(new Set(ids));
    if (!unique.length || unique.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Select valid tickets first.');
    const result: ITicketBulkResult = { succeeded: [], failed: [] };
    for (const id of unique) {
      try { const update = {...fields}; if (fields[schema.status] !== undefined) await this.addResolutionTimestamp(id, String(fields[schema.status]), update); await this.graph.patch(`${schema.path}/items/${id}/fields`, update); result.succeeded.push(id); }
      catch (error) { result.failed.push({ id, message: error instanceof Error ? error.message : 'Update failed.' }); }
    }
    return result;
  }
  public async getCreationOptions(): Promise<ITicketCreationOptions> {
    if (!this.creationSchema) await this.getTickets();
    if (!this.creationSchema) throw new Error('Configure New as a Status choice before creating tickets.');
    const classification = await loadClassification(this.graph, this.context!.sitePath, this.context!.lists, this.config.resourceIds);
    return {classification, priorities:this.creationSchema.choices, description:Boolean(this.creationSchema.description), assignment:Boolean(this.updateSchema?.choices.includes('Assigned')), fields:this.creationFields.map(field => ({key:field.key,label:field.label,choices:field.column.choice?.choices,required:field.column.required}))};
  }
  public async uploadAttachments(id: number, files: File[], progress?: (message:string) => void): Promise<void> {
    if (!this.context) await this.getTickets();
    await this.attachments().upload(this.context!.listId,id,files,progress);
  }
  public async createTicket(input: INewTicketInput): Promise<void> {
    validateTicketAttachments(input.attachments || []);
    if (input.attachments?.length) {
      if (!this.getSharePointToken) throw new Error('SharePoint attachment uploads are not configured.');
      await this.getSharePointToken();
    }
    if (!this.creationSchema) await this.getTickets();
    const schema = this.creationSchema;
    if (!schema) throw new Error('Configure New as a Status choice in the SharePoint list before creating tickets.');
    if (!input.title.trim() || input.title.trim().length > 255) throw new Error('Enter an issue title of 1–255 characters.');
    if (!schema.choices.includes(input.priority)) throw new Error('This priority is not configured in the SharePoint list.');
    if (input.description.trim() && !schema.description) throw new Error('Add an Issue description text column to the list to save a description.');
    const fields: Record<string, unknown> = { [schema.title]: input.title.trim(), [schema.status]: 'New', [schema.priority]: input.priority };
    const requester = this.requesterFields;
    if (requester?.requestedBy && this.config.currentUserId) fields[`${requester.requestedBy}LookupId`] = String(this.config.currentUserId);
    if (requester?.email && this.config.currentUserEmail) fields[requester.email] = this.config.currentUserEmail;
    if (requester?.source) fields[requester.source] = 'DeskPilot';
    if (schema.description) fields[schema.description] = input.description.trim();
    for (const key of ['category', 'subcategory', 'issueType'] as const) {
      if (input[key] && !this.creationFields.some(field => field.key === key)) throw new Error(`The ticket list has no writable ${key} column. The selected value cannot be saved.`);
    }
    const hasClassification = Boolean(input.category || input.subcategory || input.issueType);
    const classification = hasClassification ? await loadClassification(this.graph, this.context!.sitePath, this.context!.lists, this.config.resourceIds) : undefined;
    if (classification) {
      const category = classification.categories.find(item => item.id === input.category);
      const subcategory = classification.subcategories.find(item => item.id === input.subcategory && item.parentId === category?.id);
      const issueType = classification.issueTypes.find(item => item.id === input.issueType);
      if ((input.category && !category) || (input.subcategory && !subcategory) || (input.issueType && !issueType)) throw new Error('Select active classification entries belonging to their selected parents.');
    }
    for (const field of this.creationFields) {
      let value = input[field.key]?.trim();
      if (!value) { if (field.column.required) throw new Error(`Enter ${field.label}.`); continue; }
      if (classification && ['category', 'subcategory', 'issueType'].includes(field.key)) {
        const key = field.key as 'category' | 'subcategory' | 'issueType';
        const entries = key === 'category' ? classification.categories : key === 'subcategory' ? classification.subcategories : classification.issueTypes;
        const entry = entries.find(item => item.id === value)!;
        if (field.column.lookup) {
          if (field.column.lookup.allowMultipleValues || field.column.lookup.listId.toLowerCase() !== classification.listIds[key].toLowerCase()) throw new Error(`${field.label} must look up the correct classification list.`);
          fields[`${field.column.name}LookupId`] = entry.id;
          continue;
        }
        value = entry.name;
      }
      if (field.key === 'ticketType' && !['Problem', 'Incident', 'Question', 'Request'].includes(value)) throw new Error('Select a valid Ticket Type.');
      if (field.column.choice && !field.column.choice.choices.includes(value)) throw new Error(`Select a configured ${field.label} value.`);
      if (field.key === 'dueDate' && !Number.isFinite(new Date(value).getTime())) throw new Error('Enter a valid expected resolution date.');
      fields[field.column.name] = field.key === 'dueDate' ? new Date(value).toISOString() : value;
    }
    if (input.assignedToId != null) {
      if (!Number.isSafeInteger(input.assignedToId) || input.assignedToId <= 0) throw new Error('Select a valid SharePoint person.');
      if (!this.updateSchema?.choices.includes('Assigned')) throw new Error('Add Assigned to the Status choices before assigning a new ticket.');
      fields[`${this.updateSchema.assigned}LookupId`] = String(input.assignedToId);
      fields[schema.status] = 'Assigned';
    }
    if (input.attachments?.length) await this.attachments().ensureEnabled(this.context!.listId);
    const created = await this.graph.post<{ id: string }>(`${schema.path}/items`, { fields });
    if (input.attachments?.length) {
      const id = Number(created?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Ticket creation returned no valid ID. Refresh the ticket list before trying again.');
      try { await this.uploadAttachments(id, input.attachments); }
      catch (reason) {
        const error = new Error(`Ticket #${id} was created, but some attachments could not be uploaded. ${reason instanceof Error ? reason.message : 'Upload failed.'}`) as Error & { createdTicketId: number };
        error.createdTicketId = id;
        throw error;
      }
    }
    if (this.routeNewTicket && (input.assignedToId === null || input.assignedToId === undefined)) {
      const id = Number(created?.id);
      if (!Number.isSafeInteger(id) || id<=0) throw new Error('Ticket creation returned no valid ID. Refresh before trying again.');
      try { await this.routeNewTicket(id); }
      catch (reason) {
        const error = new Error(`Ticket #${id} was created, but automatic routing could not be confirmed. Ask a Helpdesk Admin to check its assignment. ${reason instanceof Error ? reason.message : ''}`) as Error & {createdTicketId:number};
        error.createdTicketId=id; throw error;
      }
    }
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
    const resolve = (name: string, kind: 'choice' | 'text' | 'dateTime' | 'boolean' | 'personOrGroup' | 'lookup', optional = false): IGraphColumn | undefined => {
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
    const category = categoryColumn ? resolve('Category', categoryColumn.lookup ? 'lookup' : categoryColumn.choice ? 'choice' : 'text', true) : undefined;
    const resolved = resolve('ResolvedAt', 'dateTime', true);
    const response = resolve('FirstRespondedAt', 'dateTime', true);
    const due = resolve('DueDate', 'dateTime', true);
    const escalated = resolve('Escalated', 'boolean', true);
    const archived = resolve('Archived', 'boolean', true);
    this.updateSchema = { path: listPath, status: status.name, choices: status.choice?.choices || [], assigned: assigned.name, archived: archived?.name, resolved: resolved?.name, response: response?.name };
    const optionalDisplay = (names: string[], types: Array<'text' | 'choice' | 'dateTime' | 'personOrGroup' | 'lookup'>): IGraphColumn | undefined => names.map(name => columns.find(column => normalize(column.displayName) === normalize(name) && types.some(type => Boolean(column[type]))) || columns.find(column => normalize(column.name) === normalize(name) && types.some(type => Boolean(column[type])))).find(Boolean);
    const subcategory = optionalDisplay(['Issue Subcategory', 'IssueSubcategory', 'Subcategory'], ['text', 'choice', 'lookup']);
    const issueType = optionalDisplay(['Issue Type', 'Issue / Request', 'IssueType'], ['text', 'choice', 'lookup']);
    const ticketType = optionalDisplay(['Ticket Type', 'TicketType'], ['choice']);
    const assignedUnit = optionalDisplay(['Assigned Unit','AssignedUnit'], ['lookup']);
    const department = optionalDisplay(['Department', 'Department / Unit', 'Unit'], ['text', 'choice']);
    const started = optionalDisplay(['Started At', 'Viewed At', 'Viewed / Started At'], ['dateTime']);
    const closed = optionalDisplay(['Closed At', 'Closed At (New)'], ['dateTime']);
    const resolutionSummary = optionalDisplay(['Resolution Summary'], ['text']);
    const requestedBy = optionalDisplay(['Requested By','RequestedBy'],['personOrGroup']);
    const requesterEmail = optionalDisplay(['RequesterEmail','Requester Email'],['text']);
    const ticketSource = optionalDisplay(['TicketSource','Ticket Source'],['choice','text']);
    this.requesterFields = {requestedBy:requestedBy && !requestedBy.readOnly ? requestedBy.name : undefined,email:requesterEmail && !requesterEmail.readOnly ? requesterEmail.name : undefined,source:ticketSource && !ticketSource.readOnly ? ticketSource.name : undefined};
    const solutionComment = optionalDisplay(['Solution Comment ID','SolutionCommentId'], ['text']);
    this.solutionSchema = resolutionSummary && !resolutionSummary.readOnly && solutionComment && !solutionComment.readOnly ? {path:listPath,summary:resolutionSummary.name,comment:solutionComment.name} : undefined;
    this.creationFields = [
      { key: 'category' as const, label: 'Issue category', column: category },
      { key: 'subcategory' as const, label: 'Issue subcategory', column: subcategory },
      { key: 'issueType' as const, label: 'Issue Type', column: issueType },
      { key: 'ticketType' as const, label: 'Ticket Type', column: ticketType },
      { key: 'department' as const, label: 'Department / Unit', column: department },
      { key: 'dueDate' as const, label: 'Expected resolution date', column: due }
    ].filter((field): field is typeof field & { column: IGraphColumn } => Boolean(field.column && !field.column.readOnly));
    const fields = ["AuthorLookupId", ...(requestedBy ? [requestedBy.name, `${requestedBy.name}LookupId`] : []), ...(requesterEmail ? [requesterEmail.name] : []), title.name, status.name, priority.name, assigned.name, `${assigned.name}LookupId`, ...(description ? [description.name] : []), ...[ticketSource, assignedUnit, category, resolved, response, due, escalated, archived, subcategory, issueType, ticketType, department, started, closed, resolutionSummary, solutionComment].filter((value): value is IGraphColumn => Boolean(value)).map(value => value.name)];
    const items = await this.graph.getAll<IGraphItem>(`${listPath}/items?$expand=fields($select=${fields.join(',')})&$top=200`);
    const users = new Map<number, IUserLookup>();
    const warnings: string[] = [];
    let assignmentIdentityAvailable = true;
    if (items.some(item => item.fields[`${assigned.name}LookupId`] || item.fields.AuthorLookupId || (requestedBy && item.fields[`${requestedBy.name}LookupId`]))) {
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
      if (statuses.indexOf(state) < 0 || !priority.choice!.choices.includes(urgency)) throw new Error(`Ticket ${item.id} has an unsupported status or priority.`);
      const userId = Number(values[`${assigned.name}LookupId`]);
      return { Id: Number(item.id), Title: text(values[title.name]) || 'Untitled ticket', Status: state, Priority: urgency,
        Description: description ? text(values[description.name]) : undefined, WebUrl: item.webUrl,
        Archived: archived ? values[archived.name] === true : false,
        Created: item.createdDateTime, Modified: item.lastModifiedDateTime,
        AssignedTo: userId ? users.get(userId) || { Id: userId, Title: text(values[assigned.name]) || `User #${userId}` } : undefined,
        AssignedUnit: assignedUnit ? text(values[assignedUnit.name]) || undefined : undefined,
        Category: category ? text(values[category.name]) : undefined,
        Subcategory: subcategory ? text(values[subcategory.name]) : undefined,
        TicketType: ticketType ? text(values[ticketType.name]) : undefined,
        IssueType: issueType ? text(values[issueType.name]) : undefined,
        Department: department ? text(values[department.name]) : undefined,
        CreatedBy: users.has(Number(values.AuthorLookupId)) ? {...users.get(Number(values.AuthorLookupId)), AadId:item.createdBy?.user?.id} : (item.createdBy?.user && (item.createdBy.user.id || item.createdBy.user.displayName) ? { Title: item.createdBy.user.displayName, AadId: item.createdBy.user.id, Email: item.createdBy.user.email } : undefined),
        Requester: (requestedBy && users.get(Number(values[`${requestedBy.name}LookupId`]))) || (requesterEmail && text(values[requesterEmail.name]) ? {Email:text(values[requesterEmail.name]),Title:text(values[requesterEmail.name])} : undefined) || users.get(Number(values.AuthorLookupId)) || (item.createdBy?.user ? {Title:item.createdBy.user.displayName,Email:item.createdBy.user.email,AadId:item.createdBy.user.id} : undefined),
        TicketSource: ticketSource ? text(values[ticketSource.name]) || undefined : undefined,
        RequesterEmail: requesterEmail ? text(values[requesterEmail.name]) || undefined : undefined,
        StartedAt: started ? text(values[started.name]) || undefined : undefined,
        ClosedAt: closed ? text(values[closed.name]) || undefined : undefined,
        ResolutionSummary: resolutionSummary ? text(values[resolutionSummary.name]) : undefined,
        SolutionCommentId: solutionComment ? text(values[solutionComment.name]) : undefined,
        DueDate: due ? text(values[due.name]) || undefined : undefined,
        Escalated: escalated ? values[escalated.name] === true : undefined,
        FirstRespondedAt: response ? text(values[response.name]) || null : null, HasResponseTracking: Boolean(response), HasResolutionTracking: Boolean(resolved),
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
