import { AadHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { ITicketDataSource, INewTicketInput, ITicketEdit, ITicketCreationOptions, ITicketComment, ITicketVersion, TicketBulkAction, ITicketBulkResult, IOrganizationUser } from '../interfaces/ITicketDataSource';
import type { ITicket, IUserLookup } from '../interfaces/ITicket';
import type { ITicketQueryResult } from '../interfaces/IDashboard';
import type { IWorkspaceAccess } from '../interfaces/IWorkspaceAccess';
import type { IDeskPilotRole } from '../interfaces/IRoleManagement';

export interface IBackendUser { id?: number; entra_object_id: string | null; name: string; email: string; role: 'requester' | 'agent' | 'admin' | 'superAdmin'; enabled: boolean; }
export interface IBackendDepartment { id: number; name: string; }
export interface IBackendDepartmentSettings { roles: Record<string, IDeskPilotRole>; members: Array<{id: number; name: string; email: string}>; entra_group_ids: string[]; }
export interface IBackendClassification { id: number; name: string; active: boolean | number; sort_order: number; category_id?: number; department_ids?: number[]; can_edit?: boolean; }
export type BackendClassificationKind = 'categories' | 'subcategories' | 'issue-types';

/** Presentation adapter only. Laravel authorizes and validates every operation. */
export class LaravelTicketService implements ITicketDataSource {
  public readonly capabilities = {attachments: false, requesterEditing: false, ticketSources: false, extendedTicketFields: false};
  public access!: IWorkspaceAccess;
  public roleRules!: IDeskPilotRole;
  public title: string = '';
  private constructor(private readonly client: AadHttpClient, private readonly baseUrl: string) {}

  public static async create(context: WebPartContext, baseUrl: string, resource: string): Promise<LaravelTicketService> {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Configure an HTTPS Laravel API URL without credentials, query or fragment.');
    if (!resource.trim()) throw new Error('Configure the Laravel API Entra resource URI.');
    const service = new LaravelTicketService(await context.aadHttpClientFactory.getClient(resource.trim()), url.href.replace(/\/$/, ''));
    const session = await service.request<{access: Omit<IWorkspaceAccess, 'oid'> & {entra_object_id: string}; roleRules: IDeskPilotRole; title: string}>('/session');
    // The shared legacy UI contract uses oid; the Laravel API uses the explicit name.
    service.access = {...session.access, oid: session.access.entra_object_id};
    service.roleRules = session.roleRules;
    service.title = session.title;
    return service;
  }

  private async request<T>(path: string, method: string = 'GET', input?: unknown): Promise<T> {
    const response = await this.client.fetch(this.baseUrl + path, AadHttpClient.configurations.v1, {
      method, headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      ...(input === undefined ? {} : {body: JSON.stringify(input)})
    });
    if (response.status === 204) return undefined as T;
    const data = await response.json().catch(() => ({message: 'The helpdesk API returned an invalid response.'}));
    if (!response.ok) throw new Error(data.message || `Helpdesk API request failed (${response.status}).`);
    return data as T;
  }

  public async getTickets(): Promise<ITicketQueryResult> {
    const tickets: ITicket[] = [];
    let after: number | null = 0;
    do {
      const page: {tickets: ITicket[]; next: number | null} = await this.request(`/tickets?after=${after}`);
      tickets.push(...page.tickets);
      if (page.next !== null && page.next <= (after || 0)) throw new Error('Invalid ticket pagination response.');
      after = page.next;
    } while (after !== null);
    return {tickets, isMockData: false, sourceLabel: 'DeskPilot API', assignmentIdentityAvailable: true, hasResolvedAt: true, hasCategory: true, hasDueDate: true, hasEscalated: false, hasPending: true};
  }
  public async getPriorities(): Promise<string[]> { return (await this.getCreationOptions()).priorities; }
  public getCreationOptions(): Promise<ITicketCreationOptions> { return this.request('/ticket-options'); }
  public async createTicket(input: INewTicketInput): Promise<void> {
    if (input.attachments?.length) throw new Error('Attachments are not yet available in the Laravel preview.');
    // Requester is always the signed-in user, never user-supplied email or SharePoint ID.
    await this.request('/tickets', 'POST', {title: input.title, description: input.description, priority: input.priority, assignedToId: input.assignedToId, departmentId: input.department ? Number(input.department) : undefined, category: input.category || null, subcategory: input.subcategory || null, issueType: input.issueType || null});
  }
  public async updateTicket(id: number, input: ITicketEdit): Promise<void> {
    const unsupported: Array<keyof ITicketEdit> = ['requestedById', 'requesterName', 'requesterEmail', 'department', 'ticketSource', 'ticketType'];
    if (unsupported.some(key => input[key] !== undefined) || input.resolutionEmail) throw new Error('This edit includes fields or email delivery that are not available in the Laravel preview.');
    await this.request(`/tickets/${id}`, 'PATCH', {title: input.title, description: input.description, priority: input.priority, status: input.status, assignedToId: input.assignedToId, resolutionSummary: input.resolutionSummary, dueDate: input.dueDate, category: input.category === '' ? null : input.category, subcategory: input.subcategory === '' ? null : input.subcategory, issueType: input.issueType === '' ? null : input.issueType});
  }
  public async updateTickets(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult> {
    const result: ITicketBulkResult = {succeeded: [], failed: []};
    for (const id of ids) {
      const input = action.kind === 'status' ? {status: action.status} : action.kind === 'priority' ? {priority: action.priority} : action.kind === 'assign' ? {assignedToId: action.userId} : {archived: action.archived !== false};
      try { await this.request(`/tickets/${id}`, 'PATCH', input); result.succeeded.push(id); }
      catch (error) { result.failed.push({id, message: error instanceof Error ? error.message : 'Update failed.'}); }
    }
    return result;
  }
  public getComments(id: number): Promise<ITicketComment[]> { return this.request(`/tickets/${id}/comments`); }
  public async addComment(id: number, text: string, options?: import('../interfaces/ITicketDataSource').ICommentPostOptions): Promise<void> {
    if (options?.files?.length) throw new Error('Comment attachments are not yet available in the Laravel preview.');
    await this.request(`/tickets/${id}/comments`, 'POST', {text});
  }
  public getHistory(id: number): Promise<ITicketVersion[]> { return this.request(`/tickets/${id}/history`); }
  public async recordFirstResponse(id: number): Promise<void> { await this.request(`/tickets/${id}/response`, 'POST'); }
  public async searchUsers(query: string): Promise<IOrganizationUser[]> {
    const users = await this.request<Array<{id: number; entra_object_id: string; name: string; email: string}>>('/assignees');
    return users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())).map(user => ({id: user.entra_object_id, displayName: user.name, email: user.email, userPrincipalName: user.email, sharePointId: user.id}));
  }
  public async resolveUser(user: IOrganizationUser): Promise<IUserLookup> {
    return {Id: user.sharePointId, AadId: user.id, Title: user.displayName, Email: user.email};
  }
  public listUsers(): Promise<IBackendUser[]> { return this.request('/users'); }
  public listDepartments(): Promise<IBackendDepartment[]> { return this.request('/departments'); }
  public createDepartment(name: string): Promise<IBackendDepartment> { return this.request('/departments', 'POST', {name}); }
  public getDepartment(id: number): Promise<IBackendDepartmentSettings> { return this.request(`/departments/${id}`); }
  public saveDepartment(id: number, input: {member_ids?: number[]; entra_group_ids?: string[]; roles?: Record<string, {name: string; scope: string; actions: string[]}>}): Promise<void> { return this.request(`/departments/${id}`, 'PATCH', input); }
  public listClassifications(kind: BackendClassificationKind): Promise<IBackendClassification[]> { return this.request(`/classifications/${kind}`); }
  public saveClassification(kind: BackendClassificationKind, input: {name: string; active: boolean; sort_order?: number; category_id?: number; department_ids?: number[]}, id?: number): Promise<IBackendClassification> { return this.request(`/classifications/${kind}${id === undefined ? '' : '/'+id}`, id === undefined ? 'POST' : 'PATCH', input); }
  public async saveUser(user: IBackendUser): Promise<void> { await this.request('/users', 'POST', user); }
}
