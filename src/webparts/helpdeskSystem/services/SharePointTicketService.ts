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
import { assignedRole, roleActions } from '../interfaces/IRoleManagement';
import { applyAppRoleRules } from './appRoleRules';
import { WorkspaceSetupService } from './WorkspaceSetupService';
import { WorkspaceMaintenanceService } from './WorkspaceMaintenanceService';
import { SharePointWorkspacePermissions } from './SharePointWorkspacePermissions';

/** SharePoint enforces access for every delegated request; UI roles are not a security boundary. */
export async function createSharePointService(context: WebPartContext, listName: string, listId?: string): Promise<ITicketDataSource> {
  const siteUrl = context.pageContext.web.absoluteUrl.replace(/\/$/, '');
  const permissionsResponse = await context.spHttpClient.get(`${siteUrl}/_api/web/EffectiveBasePermissions`, SPHttpClient.configurations.v1);
  if (!permissionsResponse.ok) throw new Error(`Unable to read your SharePoint permissions (${permissionsResponse.status}).`);
  const permissionData = await permissionsResponse.json();
  const permissions = permissionData.d?.EffectiveBasePermissions || permissionData.EffectiveBasePermissions || permissionData;
  const low = Number(permissions.Low);
  if (!Number.isFinite(low)) throw new Error('SharePoint did not return valid permissions.');
  const superAdmin = (low & 1073741824) !== 0 && (low & 33554432) !== 0; // ManageWeb and ManagePermissions
  const permissionsService = new SharePointWorkspacePermissions(context);
  const roles = new SharePointRoleManagement(context, superAdmin, async value => {
    if (value.workspace?.assignedTicketPermissions) await permissionsService.sync(value);
  });
  const configuration = await roles.load();
  const currentUserResponse = await context.spHttpClient.get(`${siteUrl}/_api/web/currentuser`, SPHttpClient.configurations.v1);
  if (!currentUserResponse.ok) throw new Error('Unable to identify your SharePoint user.');
  const currentUserData = await currentUserResponse.json();
  const currentUserId = Number((currentUserData.d || currentUserData).Id);
  if (!Number.isInteger(currentUserId) || currentUserId < 1) throw new Error('Unable to identify your SharePoint user.');
  const role = superAdmin ? { id: 'superAdmin', name: 'Super Admin', scope: 'all' as const, actions: [...roleActions] } : assignedRole(configuration, currentUserId);
  if (!role) throw new Error('You do not have access to this DeskPilot workspace. Contact your helpdesk administrator to request access.');
  const admin = role.id === 'admin';
  const provider = await context.aadTokenProviderFactory.getTokenProvider();
  const graph = new GraphClient(() => provider.getToken('https://graph.microsoft.com'));
  const aadId = (await graph.get<{ id: string }>('/me?$select=id')).id;
  const sharePointToken = (): Promise<string> => provider.getToken(new URL(siteUrl).origin);
  const workspaceSettings: import('../interfaces/IRoleManagement').IWorkspaceSettings = configuration.workspace || {title: '', description: '', listName: listName || 'Tickets', listId: listId || ''};
  const config = {tenantId: '', clientId: '', siteUrl, listName: workspaceSettings.listName, listId: workspaceSettings.listId || undefined, resourceIds: workspaceSettings.resourceIds, faqListName: 'FAQs', faqListId: workspaceSettings.resourceIds?.faqs, graphSiteScope: 'Sites.Selected' as const};
  const tickets = new GraphTicketService(graph, config, graph, sharePointToken, workspaceSettings.assignedTicketPermissions ? {
    prepare: (listId,id) => permissionsService.ticket(listId,id,true),
    complete: (listId,id) => permissionsService.ticket(listId,id)
  } : undefined);
  const faqs = new GraphFaqService(graph, config, sharePointToken);
  const access: IWorkspaceAccess = {role: role.name, oid: aadId, admin: admin || superAdmin, superAdmin, agent: role.id === 'agent', email: context.pageContext.user.email, name: context.pageContext.user.displayName, siteUrl};
  const source: ITicketDataSource = Object.assign(tickets, {
    workspaceSettings,
    access,
    administration: role.actions.includes('classifications') ? new GraphAdministrationService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()) : undefined,
    sla: new GraphSlaService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()),
    getFaqs: faqs.getFaqs.bind(faqs), getFaqAccess: faqs.getAccess.bind(faqs),
    saveFaq: faqs.save.bind(faqs), deleteFaq: faqs.delete.bind(faqs), updateFaqs: faqs.updateMany.bind(faqs)
  });
  if (superAdmin) {
    source.workspaceMaintenance = new WorkspaceMaintenanceService(context, roles);
    source.workspaceSetup = new WorkspaceSetupService(graph, config, async (ids, orderedFields) => {
      const current = await roles.load();
      await roles.save({...current, workspace: {...workspaceSettings, listId: ids.tickets, resourceIds: ids}});
      const fields = spfi().using(SPFx(context)).web.lists.getById(ids.tickets).defaultView.fields;
      const existing = (await fields()).Items;
      for (let index = 0; index < orderedFields.length; index++) {
        const field = orderedFields[index] === 'Title' && existing.includes('LinkTitle') ? 'LinkTitle' : orderedFields[index];
        if (!existing.includes(field)) {await fields.add(field); existing.push(field);}
        await fields.move(field,index);
      }
      tickets.invalidateSchema();
    });
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
    source.roleManagement = {load:() => roles.load(),save:async value => {
      if (value.roles.find(item => item.id === 'agent')?.scope !== 'assigned') throw new Error('Agents must use the Assigned tickets scope when SharePoint access is managed by DeskPilot.');
      const workspace = {...workspaceSettings,...value.workspace,assignedTicketPermissions:true};
      const assignedRoles = value.roles.map(item => item.id === 'agent' ? {...item,actions:item.actions.filter(action => action !== 'create')} : item);
      await roles.save({...value,roles:assignedRoles,workspace});
      tickets.setTicketPermissions({prepare:(listId,id) => permissionsService.ticket(listId,id,true),complete:(listId,id) => permissionsService.ticket(listId,id)});
      source.workspaceSettings = workspace;
    }}; source.roleRules = role; return source;
  }
  return applyAppRoleRules(source, role, currentUserId, access.email, aadId);
}
