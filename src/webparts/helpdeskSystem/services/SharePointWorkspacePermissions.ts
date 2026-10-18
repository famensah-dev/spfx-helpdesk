import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { IRoleConfiguration } from '../interfaces/IRoleManagement';
interface List {Id:string; Title:string; Hidden:boolean; BaseTemplate:number;}
interface Group {Id:number; Title:string; Description:string;}
const marker = 'Managed by DeskPilot workspace access. Do not add members manually.';
export class SharePointWorkspacePermissions {
  private readonly web: string;
  public constructor(private context:WebPartContext) {this.web = context.pageContext.web.absoluteUrl.replace(/\/$/,'') + '/_api/web';}
  private async read<T>(path:string): Promise<T> {
    const response = await this.context.spHttpClient.get(this.web + path,SPHttpClient.configurations.v1,{headers:{Accept:'application/json;odata=nometadata','odata-version':''}});
    if (!response.ok) throw new Error(`Cannot inspect workspace permissions (${response.status}).`);
    return response.json();
  }
  private async write(path:string,body?:unknown,headers?:Record<string,string>): Promise<void> {
    const response = await this.context.spHttpClient.post(this.web + path,SPHttpClient.configurations.v1,{headers:{Accept:'application/json;odata=nometadata','Content-Type':'application/json;odata=nometadata','odata-version':'',...headers},body:body === undefined ? undefined : JSON.stringify(body)});
    if (!response.ok) throw new Error(`SharePoint permission update failed (${response.status}). Access may be incomplete; a Super Admin must reload and retry.`);
  }
  private async all<T>(path:string): Promise<T[]> {
    const result:T[] = []; const seen = new Set<string>();
    let next:string | undefined = path;
    while (next) {
      if (seen.has(next)) throw new Error('Repeated permissions pagination.'); seen.add(next);
      const page: {value:T[];'odata.nextLink'?:string;'@odata.nextLink'?:string} = await this.read(next);
      result.push(...page.value); const link = page['odata.nextLink'] || page['@odata.nextLink'];
      if (link && !link.startsWith(this.web + '/')) throw new Error('Unexpected permissions pagination.');
      next = link?.slice(this.web.length);
    }
    return result;
  }
  private async group(name:string,owner:number): Promise<Group> {
    const title = `DeskPilot ${name} ${this.context.pageContext.web.id.toString()}`;
    let groups = await this.all<Group>('/sitegroups?$select=Id,Title,Description');
    let group = groups.find(value => value.Title === title);
    if (group && group.Description !== marker) throw new Error(`The group ${title} already exists but is not managed by DeskPilot.`);
    if (!group) {
      await this.write('/sitegroups',{Title:title,Description:marker,AllowMembersEditMembership:false,OnlyAllowMembersViewMembership:false,AllowRequestToJoinLeave:false});
      groups = await this.all<Group>('/sitegroups?$select=Id,Title,Description'); group = groups.find(value => value.Title === title);
    }
    if (!group) throw new Error('Cannot confirm the workspace access group.');
    await this.write(`/sitegroups(${group.Id})/SetUserAsOwner(${owner})`);
    await this.write(`/sitegroups(${group.Id})`,{AllowMembersEditMembership:false,OnlyAllowMembersViewMembership:false,AllowRequestToJoinLeave:false},{'X-HTTP-Method':'MERGE'});
    return group;
  }
  private async members(group:number,users:number[]): Promise<void> {
    const current = await this.all<{Id:number}>(`/sitegroups(${group})/users?$select=Id`);
    for (const user of current) if (!users.includes(user.Id)) await this.write(`/sitegroups(${group})/users/removebyid(${user.Id})`);
    for (const user of users) if (!current.some(value => value.Id === user)) {
      const identity = await this.read<{LoginName:string}>(`/siteusers/getbyid(${user})?$select=LoginName`);
      await this.write(`/sitegroups(${group})/users`,{LoginName:identity.LoginName});
    }
  }
  private async grant(path:string,principal:number,role:number): Promise<void> {await this.write(`${path}/roleassignments/addroleassignment(principalid=${principal},roledefid=${role})`);}
  private async secure(path:string,grants:Array<[number,number]>): Promise<void> {
    await this.write(`${path}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)`);
    for (const [principal,role] of grants) await this.grant(path,principal,role);
    const existing = await this.all<{PrincipalId:number;RoleDefinitionBindings?:{Id:number}[]}>(`${path}/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id&$expand=RoleDefinitionBindings`);
    for (const item of existing) {
      if (!grants.some(([id]) => id === item.PrincipalId)) await this.write(`${path}/roleassignments/getbyprincipalid(${item.PrincipalId})`,undefined,{'X-HTTP-Method':'DELETE'});
      else for (const binding of item.RoleDefinitionBindings || []) if (!grants.some(([id,role]) => id === item.PrincipalId && role === binding.Id)) await this.write(`${path}/roleassignments/removeroleassignment(principalid=${item.PrincipalId},roledefid=${binding.Id})`);
    }
  }
  private async definitions(): Promise<{read:number;full:number;edit:number;assigned:number}> {
    const definitions = await this.all<{Id:number;Name:string;Description:string;RoleTypeKind:number;BasePermissions:{High:string;Low:string}}>('/roledefinitions?$select=Id,Name,Description,RoleTypeKind,BasePermissions');
    const read = definitions.find(value => value.RoleTypeKind === 2), full = definitions.find(value => value.RoleTypeKind === 5), edit = definitions.find(value => value.RoleTypeKind === 6);
    if (!read || !full || !edit) throw new Error('SharePoint Read, Edit and Full Control permission levels are required.');
    const name = 'DeskPilot Assigned Ticket Editor';
    let assigned = definitions.find(value => value.Name === name);
    const base = {High:read.BasePermissions.High,Low:String(Number(read.BasePermissions.Low) | 4)}; // Read + EditListItems; no Add/Delete/Manage Permissions.
    if (assigned && (assigned.Description !== marker || assigned.BasePermissions.High !== base.High || assigned.BasePermissions.Low !== base.Low)) throw new Error('DeskPilot Assigned Ticket Editor has unexpected permissions. Ask a site owner to review it.');
    if (!assigned) {
      await this.write('/roledefinitions',{Name:name,Description:marker,BasePermissions:base});
      assigned = await this.read(`/roledefinitions/getbyname('${name}')?$select=Id`);
    }
    return {read:read.Id,full:full.Id,edit:edit.Id,assigned:assigned!.Id};
  }
  public async sync(configuration:IRoleConfiguration): Promise<void> {
    const permissions = await this.read<{Low:string}>('/EffectiveBasePermissions');
    const low = Number(permissions.Low);
    if (!(low & 1073741824) || !(low & 33554432)) throw new Error('A Super Admin with SharePoint permission-management rights must synchronize workspace access.');
    const workspace = configuration.workspace;
    const lists = await this.all<List>('/lists?$select=Id,Title,Hidden,BaseTemplate');
    const tickets = lists.find(list => workspace?.listId ? list.Id.toLowerCase() === workspace.listId.toLowerCase() : list.Title === (workspace?.listName || 'Tickets'));
    if (!tickets || tickets.Hidden || tickets.BaseTemplate !== 100) throw new Error('Initialize the Tickets list before assigning SharePoint access. The role may be saved, but site access is not yet ready.');
    const [owner,user,roles] = await Promise.all([this.read<{Id:number}>('/associatedownergroup?$select=Id'),this.read<{Id:number}>('/currentuser?$select=Id'),this.definitions()]);
    const agents = await this.group('Agents',user.Id), admins = await this.group('Helpdesk Admins',user.Id);
    const active = configuration.assignments.filter(value => !value.disabled);
    const ticketPath = `/lists(guid'${tickets.Id}')`;
    const fields = await this.all<{InternalName:string;Title:string;TypeAsString:string}>(`${ticketPath}/fields?$select=InternalName,Title,TypeAsString`);
    const assigned = fields.find(value => value.TypeAsString === 'User' && (value.InternalName === 'AssignedTo' || value.Title === 'Assigned To'));
    if (!assigned) throw new Error('Tickets needs a single-person Assigned To field before access can be synchronized.');
    // Revoke obsolete membership first. Newly added users are granted site access last.
    await this.members(agents.Id,[]); await this.members(admins.Id,[]);
    const ownerGrants:Array<[number,number]> = [[owner.Id,roles.full],[user.Id,roles.full],[admins.Id,roles.full]];
    await this.secure(ticketPath,ownerGrants);
    const items = await this.all<{Id:number;[key:string]:unknown}>(`${ticketPath}/items?$select=Id,${assigned.InternalName}Id&$top=500`);
    for (const item of items) {
      const agent = active.find(value => value.roleId === 'agent' && value.userId === Number(item[`${assigned.InternalName}Id`]));
      await this.secure(`${ticketPath}/items(${item.Id})`,[...ownerGrants,...(agent ? [[agent.userId,roles.assigned] as [number,number]] : [])]);
    }
    const names:Record<string,string> = {categories:'Ticket Categories',subcategories:'Ticket Subcategories',issueTypes:'Ticket Issue Types',priorities:'Ticket Priorities',faqs:'FAQs'};
    for (const [key,name] of Object.entries(names)) {
      const id = workspace?.resourceIds?.[key];
      const list = lists.find(value => id ? value.Id.toLowerCase() === id.toLowerCase() : value.Title === name);
      if (!list) continue;
      if (list.Hidden || list.BaseTemplate !== 100 || list.Id === tickets.Id) throw new Error(`Invalid ${name} binding for access management.`);
      await this.secure(`/lists(guid'${list.Id}')`,[[owner.Id,roles.full],[user.Id,roles.full],[admins.Id,roles.edit],[agents.Id,roles.read]]);
    }
    const legacyComments = lists.find(value => value.Title === 'TicketComments');
    if (legacyComments) {
      const path = `/lists(guid'${legacyComments.Id}')`;
      await this.secure(path,ownerGrants);
      for (const item of await this.all<{Id:number}>(`${path}/items?$select=Id&$top=500`)) await this.secure(`${path}/items(${item.Id})`,ownerGrants);
    }
    // Site and published pages can be read; private configuration already has unique ACLs.
    await this.grant('',agents.Id,roles.read); await this.grant('',admins.Id,roles.read);
    const pages = lists.find(value => value.Title === 'Site Pages');
    if (pages) {
      const pagePath = `/lists(guid'${pages.Id}')`;
      const pagePermissions = await this.read<{HasUniqueRoleAssignments:boolean}>(`${pagePath}?$select=HasUniqueRoleAssignments`);
      if (!pagePermissions.HasUniqueRoleAssignments) await this.write(`${pagePath}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)`);
      await this.grant(`/lists(guid'${pages.Id}')`,agents.Id,roles.read); await this.grant(`/lists(guid'${pages.Id}')`,admins.Id,roles.read);
    }
    const home = await this.read<{WelcomePage:string}>('/RootFolder?$select=WelcomePage');
    const relativeSite = new URL(this.context.pageContext.web.absoluteUrl).pathname.replace(/\/$/,'');
    const pagePaths = new Set([home.WelcomePage ? `${relativeSite}/${home.WelcomePage}` : '',typeof window === 'undefined' ? '' : window.location.pathname]);
    for (const page of pagePaths) if (page.startsWith(relativeSite + '/SitePages/') && /\.aspx$/i.test(page)) {
      const encoded = encodeURIComponent(page.replace(/'/g,"''")).replace(/'/g,'%27');
      const path = `/GetFileByServerRelativePath(decodedUrl='${encoded}')/ListItemAllFields`;
      const info = await this.read<{HasUniqueRoleAssignments:boolean}>(`${path}?$select=HasUniqueRoleAssignments`);
      if (info.HasUniqueRoleAssignments) {await this.grant(path,agents.Id,roles.read); await this.grant(path,admins.Id,roles.read);}
    }
    await this.members(admins.Id,active.filter(value => value.roleId === 'admin').map(value => value.userId));
    await this.members(agents.Id,active.filter(value => value.roleId === 'agent').map(value => value.userId));
  }
  public async ticket(listId:string,id:number,revoke = false): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(listId) || !Number.isSafeInteger(id) || id < 1) throw new Error('Invalid ticket permission target.');
    const path = `/lists(guid'${listId}')`;
    const fields = await this.all<{InternalName:string;Title:string;TypeAsString:string}>(`${path}/fields?$select=InternalName,Title,TypeAsString`);
    const field = fields.find(value => value.TypeAsString === 'User' && (value.InternalName === 'AssignedTo' || value.Title === 'Assigned To'));
    if (!field) throw new Error('Cannot resolve ticket assignment permissions.');
    const item = await this.read<Record<string,number>>(`${path}/items(${id})?$select=${field.InternalName}Id`);
    const owner = await this.read<{Id:number}>('/associatedownergroup?$select=Id');
    const groups = await this.all<Group>('/sitegroups?$select=Id,Title,Description');
    const suffix = this.context.pageContext.web.id.toString();
    const agents = groups.find(value => value.Title === `DeskPilot Agents ${suffix}` && value.Description === marker);
    const admins = groups.find(value => value.Title === `DeskPilot Helpdesk Admins ${suffix}` && value.Description === marker);
    if (!agents || !admins) throw new Error('A Super Admin must synchronize Users & Roles before assigning tickets.');
    const members = await this.all<{Id:number}>(`/sitegroups(${agents.Id})/users?$select=Id`);
    const roles = await this.definitions();
    const assignee = revoke ? 0 : item[`${field.InternalName}Id`];
    await this.secure(`${path}/items(${id})`,[[owner.Id,roles.full],[admins.Id,roles.full],...(members.some(value => value.Id === assignee) ? [[assignee,roles.assigned] as [number,number]] : [])]);
  }
}
