const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function readConfig(env=process.env) {
  const tenantId=env.DESKPILOT_TENANT_ID,clientId=env.DESKPILOT_CLIENT_ID;
  const clients=(env.DESKPILOT_ALLOWED_CLIENT_IDS||'').split(',').map(value=>value.trim()).filter(Boolean);
  if (!guid.test(tenantId||'')||!guid.test(clientId||'')||!clients.length||clients.some(value=>!guid.test(value))) throw new Error('Configure the backend tenant, API client ID and allowed frontend client IDs.');
  if (!env.DESKPILOT_CLIENT_SECRET?.trim()) throw new Error('Configure the server-only API credential.');
  const site=new URL(env.DESKPILOT_SITE_URL),page=new URL(env.DESKPILOT_PAGE_URL);
  if(site.protocol!=='https:'||!site.hostname.endsWith('.sharepoint.com')||site.username||site.password||site.search||site.hash) throw new Error('Invalid backend SharePoint workspace URL.');
  const siteUrl=site.href.replace(/\/$/,'');
  if(page.username||page.password||page.origin!==site.origin||!page.pathname.startsWith(site.pathname.replace(/\/$/,'')+'/')||page.pathname.toLowerCase().includes('/_layouts/')) throw new Error('Configure the actual DeskPilot page inside the workspace.');
  const origins=(env.DESKPILOT_ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean);
  if(!origins.length||origins.some(value=>{const url=new URL(value);return url.origin!==value||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)));}))throw new Error('Configure exact allowed frontend origins.');
  return {tenantId,clientId,clients,origins,siteUrl,pageUrl:page.href,listName:env.DESKPILOT_TICKETS_LIST_NAME||'Tickets',clientSecret:env.DESKPILOT_CLIENT_SECRET};
}
