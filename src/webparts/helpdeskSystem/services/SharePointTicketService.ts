import { SharePointTicketViews } from './SharePointTicketViews';
import { validateWorkspaceConnection, type IWorkspaceConnection } from '../utils/workspaceConnection';
import { DepartmentFolderStore } from './DepartmentFolderStore';
import { SharePointGroupAccess } from './SharePointGroupAccess';
import { GraphNotificationService } from './graph/GraphNotificationService';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
import { spfi, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/views';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IWorkspaceAccess } from '../interfaces/IWorkspaceAccess';
import { GraphClient } from './graph/GraphClient';
import { GraphTicketService } from './graph/GraphTicketService';
import { GraphFaqService } from './graph/GraphFaqService';
import { GraphAdministrationService } from './graph/GraphAdministrationService';
import { GraphSlaService } from './graph/GraphSlaService';
import { SharePointRoleManagement } from './SharePointRoleManagement';
import { roleActions, defaultRoleConfiguration } from '../interfaces/IRoleManagement';
import { applyAppRoleRules } from './appRoleRules';
import { WorkspaceSetupService } from './WorkspaceSetupService';
import { WorkspaceMaintenanceService } from './WorkspaceMaintenanceService';
import { GraphSupportUnitsService } from './graph/GraphSupportUnitsService';

/** SharePoint enforces access for every delegated request; UI roles are not a security boundary. */
export async function createSharePointService(context: WebPartContext, listName: string, listId?: string, connection?: IWorkspaceConnection): Promise<ITicketDataSource> {
  const selected = connection ? validateWorkspaceConnection(connection, context.pageContext.web.absoluteUrl) : undefined;
  if (context.sdks?.microsoftTeams && !selected) throw new Error('Connect Teams to a DeskPilot workspace before loading or initializing lists.');
  const siteUrl = selected?.siteUrl || context.pageContext.web.absoluteUrl.replace(/\/$/, '');
  if (selected) {
    const response = await context.spHttpClient.get(`${siteUrl}/_api/web?$select=Url`, SPHttpClient.configurations.v1);
    if (!response.ok) throw new Error(`Unable to connect to the workspace site (${response.status}). Check the URL and your SharePoint access.`);
    const data = await response.json();
    if (String((data.d || data).Url).replace(/\/$/, '').toLowerCase() !== siteUrl.toLowerCase()) throw new Error('SharePoint returned a different workspace site. Check the connection URL.');
  }
  const permissionsResponse = await context.spHttpClient.get(`${siteUrl}/_api/web/EffectiveBasePermissions`, SPHttpClient.configurations.v1);
  if (!permissionsResponse.ok) throw new Error(`Unable to read your SharePoint permissions (${permissionsResponse.status}).`);
  const permissionData = await permissionsResponse.json();
  const permissions = permissionData.d?.EffectiveBasePermissions || permissionData.EffectiveBasePermissions || permissionData;
  const low = Number(permissions.Low);
  if (!Number.isFinite(low)) throw new Error('SharePoint did not return valid permissions.');
  const superAdmin = (low & 1073741824) !== 0 && (low & 33554432) !== 0; // ManageWeb and ManagePermissions
  const groupAccess=new SharePointGroupAccess(context,siteUrl);
  const groupRole=superAdmin ? undefined : await groupAccess.currentRole();
  const roles = new SharePointRoleManagement(context, superAdmin,groupAccess,groupRole,siteUrl);
  const configuration = await roles.load();
  const currentUserResponse = await context.spHttpClient.get(`${siteUrl}/_api/web/currentuser`, SPHttpClient.configurations.v1);
  if (!currentUserResponse.ok) throw new Error('Unable to identify your SharePoint user.');
  const currentUserData = await currentUserResponse.json();
  const currentUserId = Number((currentUserData.d || currentUserData).Id);
  if (!Number.isInteger(currentUserId) || currentUserId < 1) throw new Error('Unable to identify your SharePoint user.');
  const configuredRole = superAdmin ? { id: 'superAdmin', name: 'Super Admin', scope: 'all' as const, actions: [...roleActions] } : groupRole ? configuration.roles.find(item=>item.id===groupRole) || defaultRoleConfiguration().roles.find(item=>item.id===groupRole) : undefined;
  const role = configuredRole?.id === 'admin' ? {...configuredRole,actions:[...new Set([...configuredRole.actions,'classifications','manageFaqs','sla'] as typeof configuredRole.actions)]} : configuredRole;
  if (!role) throw new Error('You do not have access to this DeskPilot workspace. Contact your helpdesk administrator to request access.');
  const admin = role.id === 'admin';
  const provider = await context.aadTokenProviderFactory.getTokenProvider();
  const graph = new GraphClient(() => provider.getToken('https://graph.microsoft.com'));
  const aadId = (await graph.get<{ id: string }>('/me?$select=id')).id;
  const sharePointToken = (): Promise<string> => provider.getToken(new URL(siteUrl).origin);
  const workspaceSettings: import('../interfaces/IRoleManagement').IWorkspaceSettings = configuration.workspace || {title: '', description: '', listName: listName || 'Tickets', listId: listId || ''};
  const config = {currentUserName:context.pageContext.user.displayName,currentUserId,currentUserEmail:context.pageContext.user.email,tenantId: '', clientId: '', siteUrl, listName: workspaceSettings.listName, listId: workspaceSettings.listId || undefined, resourceIds: workspaceSettings.resourceIds, faqListName: 'FAQs', faqListId: workspaceSettings.resourceIds?.faqs, graphSiteScope: 'Sites.Selected' as const};
  const supportUnits = new GraphSupportUnitsService(graph, config);
  const tickets = new GraphTicketService(graph, config, graph, sharePointToken, id => supportUnits.routeTicket(id));
  if(workspaceSettings.departmentFolders)tickets.folderStore=new DepartmentFolderStore(siteUrl,sharePointToken,workspaceSettings.departmentFolders,currentUserId,context.pageContext.user.email,admin || superAdmin || role.id==='agent');
  const ticketViews=new SharePointTicketViews(siteUrl,sharePointToken,graph,currentUserId,async()=>{if(config.listId)return config.listId;const info=await graph.get<{id:string}>('/sites/'+new URL(siteUrl).hostname+':'+new URL(siteUrl).pathname+'?$select=id');const lists=await graph.getAll<{id:string;displayName:string}>('/sites/'+encodeURIComponent(info.id)+'/lists?$select=id,displayName');const list=lists.find(item=>item.displayName===config.listName);if(!list)throw new Error('Ticket list was not found.');return list.id;},workspaceSettings.resourceIds?.ticketViews);
  const faqs = new GraphFaqService(graph, config, sharePointToken);
  const access: IWorkspaceAccess = {role: role.name, oid: aadId, admin: admin || superAdmin, superAdmin, agent: role.id === 'agent', email: context.pageContext.user.email, name: context.pageContext.user.displayName, siteUrl};
  const source: ITicketDataSource = Object.assign(tickets, {
    workspaceConnection: selected,
    workspaceSettings,
    ticketViews,
    access,
    supportUnits: admin || superAdmin ? supportUnits : undefined,
    getTeamCandidates: admin || superAdmin ? () => groupAccess.members() : undefined,
    administration: role.actions.includes('classifications') ? new GraphAdministrationService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()) : undefined,
    sla: new GraphSlaService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()),
    getFaqs: faqs.getFaqs.bind(faqs), getFaqAccess: faqs.getAccess.bind(faqs),
    saveFaq: faqs.save.bind(faqs), deleteFaq: faqs.delete.bind(faqs), updateFaqs: faqs.updateMany.bind(faqs)
  });
  let visibleSource:ITicketDataSource=source;
  const mail=new GraphNotificationService(graph,config,{email:access.email,name:access.name || access.email},admin || superAdmin,selected?.pageUrl || window.location.href,workspaceSettings.title,async()=>(await visibleSource.getTickets()).tickets,async id=>{
    const data=await supportUnits.load();return data.units.find(team=>team.id===id)?.email || '';
  },superAdmin);
  source.notifications={canManage:admin || superAdmin,getSettings:()=>mail.getSettings(),saveSettings:value=>mail.saveSettings(value),history:()=>mail.history(),inbox:()=>mail.inbox(),test:(value,event)=>mail.test(value,event),invite:(user,role,automatic)=>mail.invite(user,role,automatic)};
  if(admin || superAdmin){
    (source.sla as GraphSlaService).onBreach=async(ticket,kind)=>{
      if(!ticket.AssignedUnitId)return;
      const data=await supportUnits.load(),team=data.units.find(unit=>unit.id===ticket.AssignedUnitId),lead=data.members.find(member=>member.unitId===team?.id&&member.id===team?.teamLeadMemberId);
      if(!lead)throw new Error(`Ticket #${ticket.Id}: choose a team lead in Support Teams for SLA alerts.`);
      const response=await context.spHttpClient.get(`${siteUrl}/_api/web/siteusers/getbyid(${lead.userId})?$select=Email`,SPHttpClient.configurations.v1);
      if(!response.ok)throw new Error('Unable to resolve the team lead for an SLA alert.');const user=await response.json();await mail.slaBreach(ticket,kind,String((user.d||user).Email||''));
    };
  }
  tickets.notificationEnabled=()=>mail.enabled();
  tickets.onTicketChanged=(ticket,before,created,resolutionEmail)=>mail.changed(ticket,before,created,resolutionEmail);
  if(admin){
    source.roleManagement=roles;
    const administration=source.administration!;
    const rejectSchema=async():Promise<never>=>{throw new Error('Ticket list schema requires Super Admin access.');};
    source.administration={
      getData:page=>page==='schema' ? rejectSchema() : administration.getData(page),
      getLookupColumns:rejectSchema,saveColumn:rejectSchema,deleteColumn:rejectSchema,
      saveEntry:administration.saveEntry.bind(administration),deleteEntry:administration.deleteEntry.bind(administration)
    };
  }
  if (superAdmin) {
    source.deleteArchivedTickets=ids=>tickets.recycleArchivedTickets(ids);
    source.workspaceMaintenance = new WorkspaceMaintenanceService(context, roles,siteUrl);
    source.workspaceSetup = new WorkspaceSetupService(graph, config, async (ids, orderedFields) => {
      await ticketViews.setup(ids.ticketViews);
      const current = await roles.load();
      await roles.save({...current, workspace: {...workspaceSettings, listId: ids.tickets, resourceIds: ids}});
      const fields = spfi(siteUrl).using(SPFx(context)).web.lists.getById(ids.tickets).defaultView.fields;
      const existing = (await fields()).Items;
      for (let index = 0; index < orderedFields.length; index++) {
        const field = orderedFields[index] === 'Title' && existing.includes('LinkTitle') ? 'LinkTitle' : orderedFields[index];
        if (!existing.includes(field)) {await fields.add(field); existing.push(field);}
        await fields.move(field,index);
      }
      tickets.invalidateSchema();
    },groupAccess);
    source.saveWorkspaceSettings = async settings => {
      if (!settings.listName.trim()) throw new Error('Tickets list name is required.');
      if (settings.listId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(settings.listId)) throw new Error('Enter a valid list ID.');
      const siteInfo = await graph.get<{id: string}>(`/sites/${new URL(siteUrl).hostname}:${new URL(siteUrl).pathname}?$select=id`);
      const lists = await graph.getAll<{id: string; displayName: string}>(`/sites/${encodeURIComponent(siteInfo.id)}/lists?$select=id,displayName`);
      const target = lists.find(item => settings.listId ? item.id.toLowerCase() === settings.listId.toLowerCase() : item.displayName === settings.listName.trim());
      if (!target) throw new Error('Tickets list was not found on this site.');
      const validator = new GraphTicketService(graph, {...config, listName: settings.listName.trim(), listId: target.id}, graph, sharePointToken);
      await validator.getTickets();
      const current = await roles.load();
      await roles.save({...current, workspace: {...settings, listName: settings.listName.trim(), listId: target.id}});
    };
    source.roleManagement = roles; source.roleRules = role; return source;
  }
  const effectiveRole=workspaceSettings.departmentFolders && role.id==='agent' ? {...role,scope:'all' as const} : role;
  visibleSource=applyAppRoleRules(source, effectiveRole, currentUserId, access.email, aadId);
  return visibleSource;
}
