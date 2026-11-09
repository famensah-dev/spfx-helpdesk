import { DefaultAzureCredential } from '@azure/identity';
import { ApiError } from '../src/tokens.mjs';

/** Read an explicitly selected app's settings; resolve only needed secrets into process memory. */
export async function loadAzureMigrationSettings({resourceId, vaultName, provider, migrationClientId, env=process.env, request=fetch, credential=new DefaultAzureCredential()}) {
  const guid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if(!/^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[a-z0-9_.()-]+\/providers\/Microsoft.Web\/sites\/[a-z0-9-]+$/i.test(resourceId || '') || !/^[a-z0-9-]{3,24}$/i.test(vaultName || '') || !guid.test(migrationClientId || '') || !['sql','postgres'].includes(provider)) throw new ApiError('Configure the exact Function resource ID, vault name, migration client ID and database provider.',400);
  const armToken=await credential.getToken('https://management.azure.com/.default');
  const settingsResponse=await request('https://management.azure.com'+resourceId+'/config/appsettings/list?api-version=2024-11-01',{method:'POST',headers:{Authorization:'Bearer '+armToken.token},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!settingsResponse.ok)throw new ApiError('Unable to read Function App settings. Sign into Azure CLI with the authorised operator account.',403);
  const settings=(await settingsResponse.json()).properties;
  if(!settings || settings.DESKPILOT_WORKER_ENABLED!=='false' || settings['AzureWebJobs.Automation.Disabled']!=='true')throw new ApiError('Disable the live worker before migration, then retry.',400);
  let vaultToken;
  const resolve=async value=>{
    if(typeof value!=='string')throw new ApiError('A required backend migration setting is missing.',400);
    if(!value.startsWith('@Microsoft.KeyVault'))return value;
    const match=value.match(/^@Microsoft\.KeyVault\(SecretUri=(https:\/\/[^)]+)\)$/);
    if(!match)throw new ApiError('A Key Vault reference has unsupported syntax.',400);
    const url=new URL(match[1]);
    if(url.hostname.toLowerCase()!==vaultName.toLowerCase()+'.vault.azure.net' || url.username || url.password || url.search || url.hash || !/^\/secrets\/[a-z0-9-]+(?:\/[a-f0-9]+)?\/?$/i.test(url.pathname))throw new ApiError('Refusing a secret reference outside the explicitly selected vault.',400);
    vaultToken ||= await credential.getToken('https://vault.azure.net/.default');
    url.searchParams.set('api-version','7.4');
    const response=await request(url,{headers:{Authorization:'Bearer '+vaultToken.token},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new ApiError('The migration operator cannot read a required Key Vault secret.',403);
    const secret=await response.json();
    if(typeof secret.value!=='string')throw new ApiError('A required Key Vault secret has no value.',400);
    return secret.value;
  };
  const names=['DESKPILOT_TENANT_ID','DESKPILOT_CLIENT_ID','DESKPILOT_CLIENT_SECRET','DESKPILOT_ALLOWED_CLIENT_IDS','DESKPILOT_ALLOWED_ORIGINS','DESKPILOT_SITE_URL','DESKPILOT_PAGE_URL'];
  names.push(provider==='sql'?'DESKPILOT_SQL_PROFILES':'DESKPILOT_POSTGRES_PROFILES');
  const loaded={};
  for(const name of names)loaded[name]=await resolve(settings[name]);
  loaded.DESKPILOT_TICKETS_LIST_NAME=settings.DESKPILOT_TICKETS_LIST_NAME || 'Tickets';
  loaded.DESKPILOT_ALLOWED_CLIENT_IDS += ','+migrationClientId;
  loaded.DESKPILOT_MIGRATION_CLIENT_ID=migrationClientId;
  loaded.DESKPILOT_WORKER_ENABLED='false';
  // Do not let unrelated local database profiles change the selected environment.
  loaded[provider==='sql'?'DESKPILOT_POSTGRES_PROFILES':'DESKPILOT_SQL_PROFILES']='[]';
  const previous=new Map(Object.keys(loaded).map(name=>[name,env[name]]));
  Object.assign(env,loaded);
  return ()=>{for(const [name,value] of previous){if(value===undefined)delete env[name];else env[name]=value;}};
}
