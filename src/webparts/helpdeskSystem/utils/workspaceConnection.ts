export interface IWorkspaceConnection { siteUrl: string; pageUrl: string; }
/** Connection settings select a workspace; SharePoint still authorizes every request. */
export function validateWorkspaceConnection(value: IWorkspaceConnection, hostUrl: string): IWorkspaceConnection {
  const host = new URL(hostUrl);
  const site = new URL(value.siteUrl.trim());
  const page = new URL(value.pageUrl.trim());
  if ([site, page].some(url => url.protocol !== 'https:' || url.origin !== host.origin || url.username || url.password)) throw new Error('Use HTTPS SharePoint URLs in this tenant.');
  if (site.search || site.hash || /\/(?:_layouts|_api|sitepages|pages)(?:\/|$)/i.test(site.pathname) || /\.aspx$/i.test(site.pathname)) throw new Error('Enter the SharePoint site URL, not a page or Teams hosting URL.');
  site.pathname = site.pathname.replace(/\/+$/, '') || '/';
  const prefix = site.pathname === '/' ? '/' : site.pathname + '/';
  if (!page.pathname.toLowerCase().startsWith(prefix.toLowerCase()) || !/\/(?:sitepages|pages)\/[^/]+\.aspx$/i.test(page.pathname) || /\/(?:_layouts|_api)\//i.test(page.pathname)) throw new Error('Enter the DeskPilot SharePoint page URL within the selected site.');
  page.hash = '';
  ['debug', 'noredir', 'debugManifestsFile', 'loadSPFX'].forEach(key => page.searchParams.delete(key));
  return { siteUrl: site.href.replace(/\/$/, ''), pageUrl: page.href };
}
export function connectionStorageKey(tenantUrl: string, user: string): string {
  return 'DeskPilot.workspace.v1:' + new URL(tenantUrl).origin + ':' + user.toLowerCase();
}
