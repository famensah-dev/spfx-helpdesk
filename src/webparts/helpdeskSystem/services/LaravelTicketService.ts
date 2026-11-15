import { AadHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { ITicketDataSource, INewTicketInput, ITicketEdit, ITicketCreationOptions, ITicketComment, ITicketVersion, TicketBulkAction, ITicketBulkResult, IOrganizationUser } from '../interfaces/ITicketDataSource';
import type { ITicket, IUserLookup } from '../interfaces/ITicket';
import type { ITicketQueryResult } from '../interfaces/IDashboard';
import type { IWorkspaceAccess } from '../interfaces/IWorkspaceAccess';
import { defaultRoleConfiguration, roleSettingsPages, validateRoleConfiguration } from '../interfaces/IRoleManagement';
import type { IDeskPilotRole, IRoleConfiguration, IRoleManagement, IWorkspaceSettings } from '../interfaces/IRoleManagement';
import type { AdminPage, IAdministrationService, IClassificationEntry } from '../interfaces/IAdministration';
import type { IFaq, IFaqInput, IFaqAccess, FaqBulkAction, IFaqBulkResult } from '../interfaces/IFaq';

export interface IBackendUser { id?: number; entra_object_id: string | null; name: string; email: string; role: 'requester' | 'agent' | 'admin' | 'superAdmin'; enabled: boolean; }
export interface IBackendDepartment { id: number; name: string; }
export interface IBackendDepartmentSettings { roles: Record<string, IDeskPilotRole>; members: Array<{id: number; name: string; email: string; role?: string; enabled?: boolean; created_at?: string; can_manage?: boolean}>; entra_group_ids: string[]; can_manage_users?: boolean; }
export interface IBackendClassification { id: number; name: string; active: boolean | number; sort_order: number; category_id?: number; department_ids?: number[]; can_edit?: boolean; }
export type BackendClassificationKind = 'categories' | 'subcategories' | 'issue-types';

/** Presentation adapter only. Laravel authorizes and validates every operation. */
export class LaravelTicketService implements ITicketDataSource {
  public readonly storageProvider = 'laravel' as const;
  public roleManagement!: IRoleManagement;
  public administration!: IAdministrationService;
  public workspaceSettings!: IWorkspaceSettings;
  public settingsScope!: NonNullable<ITicketDataSource['settingsScope']>;
  public readonly capabilities = {attachments: false, requesterEditing: false, ticketSources: true, ticketTypes: true, extendedTicketFields: false};
  public access!: IWorkspaceAccess;
  public roleRules!: IDeskPilotRole;
  public title: string = '';
  private constructor(private readonly client: AadHttpClient, private readonly baseUrl: string, private readonly context: WebPartContext) {}

  public static async create(context: WebPartContext, baseUrl: string, resource: string): Promise<LaravelTicketService> {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Configure an HTTPS Laravel API URL without credentials, query or fragment.');
    if (!resource.trim()) throw new Error('Configure the Laravel API Entra resource URI.');
    const service = new LaravelTicketService(await context.aadHttpClientFactory.getClient(resource.trim()), url.href.replace(/\/$/, ''), context);
    const session = await service.request<{access: Omit<IWorkspaceAccess, 'oid'> & {entra_object_id: string}; roleRules: IDeskPilotRole; title: string; departments?: IBackendDepartment[]; workspace?: IWorkspaceSettings}>('/session');
    // The shared legacy UI contract uses oid; the Laravel API uses the explicit name.
    service.access = {...session.access, oid: session.access.entra_object_id};
    service.roleRules = session.roleRules;
    service.title = session.title;
    service.workspaceSettings = session.workspace || {title:session.title,description:'',listName:'Tickets',listId:''};
    service.bindSettings(session.departments || []);
    return service;
  }

  private bindSettings(departments: IBackendDepartment[]): void {
    this.settingsScope = {
      departments, selectedId:departments[0]?.id,
      select:id=>{if(!this.settingsScope.departments.some(department=>department.id===id))throw new Error('Select an accessible department.');this.settingsScope.selectedId=id;},
      create:async name=>{const department=await this.createDepartment(name);this.settingsScope.departments=await this.listDepartments();this.settingsScope.selectedId=department.id;},
      getGroups:async()=>this.settingsScope.selectedId ? (await this.getDepartment(this.settingsScope.selectedId)).entra_group_ids : [],
      saveGroups:async ids=>{if(!this.settingsScope.selectedId)throw new Error('Select a department.');await this.saveDepartment(this.settingsScope.selectedId,{entra_group_ids:ids});}
    };
    this.roleManagement={supportedActions:['dashboard','tickets','faqs','manageFaqs','create','edit','status','assign','priority','archive','comment','classifications','manageUsers'],supportedSettingsPages:['settings','roles','categories','subcategories','issueTypes','faqs'],load:()=>this.loadRoleConfiguration(),save:value=>this.saveRoleConfiguration(value)};
    const kinds = {categories:'categories',subcategories:'subcategories',issueTypes:'issue-types'} as const;
    const selected = (row:IBackendClassification):boolean => !row.department_ids?.length || Boolean(this.settingsScope.selectedId && row.department_ids.includes(this.settingsScope.selectedId));
    const entry = (row:IBackendClassification,parents:IBackendClassification[]):IClassificationEntry=>({id:row.id,title:row.name,active:Boolean(row.active),sortOrder:row.sort_order,parentId:row.category_id,parentName:parents.find(parent=>parent.id===row.category_id)?.name,canEdit:row.can_edit});
    this.administration={
      getData:async(page:AdminPage)=>{
        if(page==='schema')return this.request<import('../interfaces/IAdministration').IAdminData>('/ticket-schema');
        const rows=await this.listClassifications(kinds[page]);
        const parents=page==='subcategories' ? await this.listClassifications('categories',true) : [];
        const visibleParents=parents.filter(selected);
        return {listName:page==='issueTypes'?'Ticket Issue Types':page==='subcategories'?'Ticket Subcategories':'Ticket Categories',canManage:true,columns:[],entries:rows.filter(row=>page==='subcategories'?visibleParents.some(parent=>parent.id===row.category_id):selected(row)).map(row=>entry(row,parents)),parents:visibleParents.map(row=>entry(row,[])),lists:[]};
      },
      getLookupColumns:async()=>[],
      saveColumn:async()=>{throw new Error('Database schema changes are managed through Laravel migrations.');},
      deleteColumn:async()=>{throw new Error('Database schema changes are managed through Laravel migrations.');},
      saveEntry:async(page,input,id)=>{if(!this.settingsScope.selectedId)throw new Error('Select a department.');await this.saveClassification(kinds[page],{name:input.title,active:input.active,sort_order:input.sortOrder,...(page==='subcategories'?{category_id:input.parentId}:id===undefined?{department_ids:[this.settingsScope.selectedId]}:{})},id);},
      deleteEntry:async()=>{throw new Error('Deactivate lookup entries to preserve historical ticket references.');}
    };
  }

  private async loadRoleConfiguration():Promise<IRoleConfiguration> {
    if(!this.settingsScope.selectedId)throw new Error('Create or select a department to manage its roles.');
    const settings=await this.getDepartment(this.settingsScope.selectedId);
    const department=this.settingsScope.departments.find(value=>value.id===this.settingsScope.selectedId);
    return {
      canManageUsers:settings.can_manage_users ?? this.access.superAdmin,
      roles:defaultRoleConfiguration().roles.map(role=>role.id==='requester'?role:{...role,...settings.roles[role.id],...(role.id==='admin'?{name:'Administrator'}:{})}),
      assignments:settings.members.filter(user=>user.role!=='superAdmin').map(user=>({userId:user.id,name:user.name,email:user.email,roleId:user.role || 'requester',department:department?.name,disabled:user.enabled===false,addedAt:user.created_at || undefined,canManage:user.can_manage})),
      roleMembers:settings.members.map(user=>({userId:user.id,name:user.name,email:user.email,roleId:user.role || 'requester',department:department?.name,disabled:user.enabled===false}))
    };
  }

  private async saveRoleConfiguration(value:IRoleConfiguration):Promise<void> {
    validateRoleConfiguration(value);
    if(!this.settingsScope.selectedId)throw new Error('Select a department.');
    const existing=await this.loadRoleConfiguration();
    const normalized=(configuration:IRoleConfiguration):string=>JSON.stringify(configuration.assignments.map(user=>({id:user.userId,role:user.roleId,disabled:Boolean(user.disabled)})).sort((a,b)=>a.id-b.id));
    const usersChanged=normalized(existing)!==normalized(value);
    const rules=(configuration:IRoleConfiguration):Record<string,{name:string;scope:string;actions:string[];pageAccess:import('../interfaces/IRoleManagement').SettingsPageKey[]}>=>Object.fromEntries(configuration.roles.filter(role=>role.id!=='requester').map(role=>[role.id,{name:role.name,scope:role.scope,actions:role.actions,pageAccess:roleSettingsPages(role)}]));
    const rolesChanged=JSON.stringify(rules(existing))!==JSON.stringify(rules(value));
    if(usersChanged && rolesChanged)throw new Error('Save user changes and role permissions separately.');
    if(usersChanged)await this.request(`/departments/${this.settingsScope.selectedId}/assignments`,'PUT',{assignments:value.assignments});
    else if(rolesChanged)await this.saveDepartment(this.settingsScope.selectedId,{roles:rules(value)});
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
    await this.request('/tickets', 'POST', {title: input.title, description: input.description, priority: input.priority, assignedToId: input.assignedToId, departmentId: input.department ? Number(input.department) : undefined, category: input.category || null, subcategory: input.subcategory || null, issueType: input.issueType || null, ticketType:input.ticketType || null,ticketSource:input.ticketSource || 'DeskPilot',dueDate:input.dueDate || null});
  }
  public async updateTicket(id: number, input: ITicketEdit): Promise<void> {
    const unsupported: Array<keyof ITicketEdit> = ['requestedById', 'requesterName', 'requesterEmail', 'department'];
    if (unsupported.some(key => input[key] !== undefined) || input.resolutionEmail) throw new Error('This edit includes fields or email delivery that are not available in the Laravel preview.');
    await this.request(`/tickets/${id}`, 'PATCH', {title: input.title, description: input.description, priority: input.priority, status: input.status, assignedToId: input.assignedToId, resolutionSummary: input.resolutionSummary, dueDate: input.dueDate, category: input.category === '' ? null : input.category, subcategory: input.subcategory === '' ? null : input.subcategory, issueType: input.issueType === '' ? null : input.issueType,ticketType:input.ticketType === '' ? null : input.ticketType,ticketSource:input.ticketSource});
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
    if(user.sharePointId)return {Id:user.sharePointId,AadId:user.id,Title:user.displayName,Email:user.email};
    const saved=await this.request<{id:number;name:string;email:string;entra_object_id:string}>('/directory-users/resolve','POST',{entra_object_id:user.id,name:user.displayName,email:user.email || user.userPrincipalName,department_id:this.settingsScope.selectedId});
    return {Id:saved.id,AadId:saved.entra_object_id,Title:saved.name,Email:saved.email};
  }
  public async searchDirectoryUsers(query:string):Promise<IOrganizationUser[]> {
    const term=query.trim();
    if(term.length<2)return [];
    if(this.access.admin && this.context.msGraphClientFactory){
      const graph=await this.context.msGraphClientFactory.getClient('3');
      const escaped=term.replace(/'/g,"''");
      const result=await graph.api('/users').select('id,displayName,mail,userPrincipalName,department').filter(`startswith(displayName,'${escaped}') or startswith(mail,'${escaped}') or startswith(userPrincipalName,'${escaped}')`).top(50).get() as {value:Array<{id:string;displayName:string;mail?:string;userPrincipalName:string;department?:string}>};
      return result.value.map(user=>({id:user.id,displayName:user.displayName || user.userPrincipalName,email:user.mail || user.userPrincipalName,userPrincipalName:user.userPrincipalName,department:user.department}));
    }
    const users=await this.request<Array<{id:number;name:string;email:string;entra_object_id:string}>>('/directory-users?search='+encodeURIComponent(term));
    return users.map(user=>({id:user.entra_object_id,displayName:user.name,email:user.email,userPrincipalName:user.email,sharePointId:user.id}));
  }
  public listUsers(): Promise<IBackendUser[]> { return this.request('/users'); }
  public getFaqs(manage=false):Promise<IFaq[]> {
    return this.request('/knowledge-articles'+(manage?'?manage=1&department_id='+encodeURIComponent(String(this.settingsScope.selectedId || '')):''));
  }
  public getFaqAccess():Promise<IFaqAccess> {
    return this.request('/knowledge-articles/access?department_id='+encodeURIComponent(String(this.settingsScope.selectedId || '')));
  }
  public async saveFaq(input:IFaqInput,id?:number):Promise<void> {
    const body={question:input.question,answer:input.answer,keywords:input.keywords,published:input.published,sortOrder:input.sortOrder,categoryId:input.categoryId || null,subcategoryId:input.subcategoryId || null,...(input.sourceTicketId?{sourceTicketId:input.sourceTicketId}:{}),...(input.agentEditingEnabled!==undefined?{agentEditingEnabled:input.agentEditingEnabled}:{}),...(id===undefined?{department_id:this.settingsScope.selectedId}:{})};
    await this.request('/knowledge-articles'+(id===undefined?'':'/'+id),id===undefined?'POST':'PATCH',body);
  }
  public async deleteFaq(id:number):Promise<void> {await this.request('/knowledge-articles/'+id,'DELETE');}
  public async updateFaqs(ids:number[],action:FaqBulkAction):Promise<IFaqBulkResult> {
    const articles=await this.getFaqs(true);
    const result:IFaqBulkResult={succeeded:[],failed:[]};
    const unique=Array.from(new Set(ids));
    for(let index=0;index<unique.length;index++){
      const id=unique[index];
      try{
        const article=articles.find(row=>row.id===id);
        if(!article)throw new Error('Article is not available in the selected department.');
        if(action.kind==='delete')await this.deleteFaq(id);
        else await this.saveFaq({...article,...(action.kind==='sort'?{sortOrder:index+1}:{published:action.published})},id);
        result.succeeded.push(id);
      }catch(reason){result.failed.push({id,message:reason instanceof Error?reason.message:String(reason)});}
    }
    return result;
  }
  public async deleteComment(ticketId:number,commentId:string):Promise<void> {
    if(!/^[1-9]\d*$/.test(commentId))throw new Error('Invalid comment identifier.');
    await this.request(`/tickets/${ticketId}/comments/${commentId}`,'DELETE');
  }
  public async searchDirectoryGroups(query:string):Promise<import('../interfaces/ITicketDataSource').IOrganizationGroup[]> {
    if(!this.access.superAdmin)throw new Error('Only Super Admins can search tenant groups for department mappings.');
    const term=query.trim();
    if(term.length<2)return [];
    const graph=await this.context.msGraphClientFactory.getClient('3');
    const escaped=term.replace(/'/g,"''");
    try {
      const result=await graph.api('/groups').select('id,displayName,mail').filter(`startswith(displayName,'${escaped}') or startswith(mail,'${escaped}')`).top(50).get() as {value:Array<{id:string;displayName:string;mail?:string}>};
      return result.value.map(group=>({id:group.id.toLowerCase(),displayName:group.displayName || group.id,mail:group.mail}));
    } catch(reason) {
      if((reason as {statusCode?:number}).statusCode===403)throw new Error('Tenant group search needs Microsoft Graph Group.ReadBasic.All approval in SharePoint admin center → API access.');
      throw reason;
    }
  }
  public async getDirectoryGroup(id:string):Promise<import('../interfaces/ITicketDataSource').IOrganizationGroup> {
    if(!this.access.superAdmin && !this.access.admin)throw new Error('Admin access is required to view department groups.');
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('Invalid group identifier.');
    const graph=await this.context.msGraphClientFactory.getClient('3');
    return graph.api('/groups/'+id).select('id,displayName,mail').get();
  }
  public async saveWorkspaceSettings(settings:IWorkspaceSettings):Promise<void> {await this.request('/workspace-settings','PUT',{title:settings.title,description:settings.description});this.workspaceSettings={...this.workspaceSettings,title:settings.title,description:settings.description};}
  public listDepartments(): Promise<IBackendDepartment[]> { return this.request('/departments'); }
  public createDepartment(name: string): Promise<IBackendDepartment> { return this.request('/departments', 'POST', {name}); }
  public getDepartment(id: number): Promise<IBackendDepartmentSettings> { return this.request(`/departments/${id}`); }
  public saveDepartment(id: number, input: {member_ids?: number[]; entra_group_ids?: string[]; roles?: Record<string, {name: string; scope: string; actions: string[]}>}): Promise<void> { return this.request(`/departments/${id}`, 'PATCH', input); }
  public listClassifications(kind: BackendClassificationKind, parentsForSubcategories=false): Promise<IBackendClassification[]> { return this.request(`/classifications/${kind}${parentsForSubcategories?'?parentsFor=subcategories':''}`); }
  public saveClassification(kind: BackendClassificationKind, input: {name: string; active: boolean; sort_order?: number; category_id?: number; department_ids?: number[]}, id?: number): Promise<IBackendClassification> { return this.request(`/classifications/${kind}${id === undefined ? '' : '/'+id}`, id === undefined ? 'POST' : 'PATCH', input); }
  public async saveUser(user: IBackendUser): Promise<void> { await this.request('/users', 'POST', user); }
}
