export interface IAppConfig {
  tenantId: string;
  clientId: string;
  siteUrl: string;
  listName: string;
  listId?: string;
  userInformationListId?: string;
  graphSiteScope: 'Sites.Selected' | 'Sites.Read.All';
}
export function readConfig(): IAppConfig {
  const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID?.trim();
  const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID?.trim();
  const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!tenantId || !clientId || !guid.test(tenantId) || !guid.test(clientId)) {
    throw new Error('Microsoft 365 sign-in has not been configured. Set the tenant ID and application client ID in azure-app/.env.local, then restart or rebuild the app.');
  }
  const siteUrl = import.meta.env.VITE_SHAREPOINT_SITE_URL?.trim();
  if (!siteUrl) throw new Error('The SharePoint site URL has not been configured.');
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' || !site.hostname.endsWith('.sharepoint.com') || site.search || site.hash) {
    throw new Error('Use an HTTPS SharePoint Online site URL without query parameters or a fragment.');
  }
  const scope = import.meta.env.VITE_GRAPH_SITE_SCOPE?.trim() || 'Sites.Selected';
  if (scope !== 'Sites.Selected' && scope !== 'Sites.Read.All') throw new Error('Unsupported Graph site permission.');
  return { tenantId, clientId, siteUrl: site.href.replace(/\/$/, ''),
    listName: import.meta.env.VITE_TICKETS_LIST_NAME?.trim() || 'Tickets',
    listId: import.meta.env.VITE_TICKETS_LIST_ID?.trim() || undefined,
    userInformationListId: import.meta.env.VITE_USER_INFORMATION_LIST_ID?.trim() || undefined,
    graphSiteScope: scope };
}
