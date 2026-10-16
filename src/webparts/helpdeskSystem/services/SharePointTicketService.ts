import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { SPHttpClient } from '@microsoft/sp-http';
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
  const roles = new SharePointRoleManagement(context, superAdmin);
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
  const config = {tenantId: '', clientId: '', siteUrl, listName: listName || 'Issue Tracker', listId: listId || undefined, faqListName: 'FAQs', graphSiteScope: 'Sites.Selected' as const};
  const tickets = new GraphTicketService(graph, config, graph, sharePointToken);
  const faqs = new GraphFaqService(graph, config, sharePointToken);
  const access: IWorkspaceAccess = {role: role.name, oid: aadId, admin: admin || superAdmin, superAdmin, agent: role.id === 'agent', email: context.pageContext.user.email, name: context.pageContext.user.displayName, siteUrl};
  const source: ITicketDataSource = Object.assign(tickets, {
    access,
    administration: role.actions.includes('classifications') ? new GraphAdministrationService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()) : undefined,
    sla: new GraphSlaService(graph, graph, config, sharePointToken, () => tickets.invalidateSchema()),
    getFaqs: faqs.getFaqs.bind(faqs), getFaqAccess: faqs.getAccess.bind(faqs),
    saveFaq: faqs.save.bind(faqs), deleteFaq: faqs.delete.bind(faqs), updateFaqs: faqs.updateMany.bind(faqs)
  });
  if (superAdmin) { source.roleManagement = roles; source.roleRules = role; return source; }
  return applyAppRoleRules(source, role, currentUserId, access.email, aadId);
}
