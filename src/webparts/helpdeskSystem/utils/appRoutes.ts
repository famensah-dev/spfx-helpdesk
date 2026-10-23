export const pagePaths = {
  Dashboard: '/dashboard',
  'My Dashboard': '/my-dashboard',
  Tickets: '/tickets',
  'My Assigned Tickets': '/my-tickets',
  FAQs: '/knowledge-base',
  Administration: '/settings',
  'Users & roles': '/users-and-roles'
} as const;
export type AppPage = keyof typeof pagePaths;
export const adminPaths = {home:'', units:'teams', assignment:'auto-assignment', categories:'categories', subcategories:'subcategories', issueTypes:'issue-types', sla:'sla', faqs:'knowledge-base', members:'users', schema:'ticket-schema'} as const;
export type AdminSection = keyof typeof adminPaths;
export const workspacePaths = {'General':'general', 'SharePoint Settings':'sharepoint', 'Site Lists':'lists', 'Site Documents':'documents', 'Hidden Lists':'hidden-lists'} as const;
export type WorkspaceSection = keyof typeof workspacePaths;
export function resolveAppRoute(pathname: string): {page:AppPage; ticketId?:number; creating?:boolean; adminSection?:AdminSection; workspaceSection?:WorkspaceSection; workspace?:boolean; notFound?:boolean} {
  const path = pathname.replace(/\/+$/, '') || '/';
  const ticket = /^\/tickets\/([1-9]\d*)$/.exec(path);
  if (ticket && Number.isSafeInteger(Number(ticket[1]))) return {page:'Tickets',ticketId:Number(ticket[1])};
  if (path === '/tickets/new') return {page:'Tickets',creating:true};
  for (const page of Object.keys(pagePaths) as AppPage[]) if (pagePaths[page] === path) return {page};
  for (const key of Object.keys(adminPaths) as AdminSection[]) if (path === '/settings/'+adminPaths[key]) return {page:'Administration',adminSection:key};
  if (path === '/workspace-settings') return {page:'Administration',workspace:true,workspaceSection:'General'};
  for (const key of Object.keys(workspacePaths) as WorkspaceSection[]) if (path === '/workspace-settings/'+workspacePaths[key]) return {page:'Administration',workspace:true,workspaceSection:key};
  return {page:'Tickets',notFound:true};
}
/** Replace only the fragment: SharePoint's path and env=WebView stay intact. */
export function ticketLink(href:string,id:number):string {
  const url=new URL(href);
  url.hash='/tickets/'+id;
  return url.href;
}
