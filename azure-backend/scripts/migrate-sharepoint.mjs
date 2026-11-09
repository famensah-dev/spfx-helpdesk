import { readConfig } from '../src/config.mjs';
import { ApiError, tokenValidator, delegatedTokens } from '../src/tokens.mjs';
import { createServices } from '../src/services.mjs';
import { storageProfiles, selectProfile, requireDepartmentMappings } from '../src/storage/profiles.mjs';
import { requireMatchingProvider, openRepository } from '../src/storage/database.mjs';
import { postgresPool, closePostgresPools } from '../src/storage/postgres/repository.mjs';
import { sqlPool, closeSqlPools } from '../src/storage/sql/repository.mjs';
import { stageSqlMigration } from '../src/storage/sql/migration.mjs';
import { stageMigration as stagePostgresMigration } from '../src/storage/postgres/migration.mjs';
import { captureSharePoint, verifyStaged } from '../src/storage/migration.mjs';
import { BlobAttachments } from '../src/storage/sql/attachments.mjs';
import { workspaceKey } from '../src/storage/sql/provider.mjs';
import { migrationLogin } from './migration-login.mjs';
import { loadAzureMigrationSettings } from './migration-settings.mjs';
import { createHash } from 'node:crypto';

export function migrationReview(provider, profile, config, snapshot, attachments) {
  const destination={connectionId:profile.id,server:provider==='sql'?profile.sql.server:profile.postgres.host,database:provider==='sql'?profile.sql.database:profile.postgres.database,attachmentAccount:new URL(attachments.container.url).origin,container:profile.container};
  const reviewed={provider,workspace:config.siteUrl,destination,sourceDigest:snapshot.digest};
  return {...reviewed,counts:snapshot.counts,digest:createHash('sha256').update(JSON.stringify(reviewed)).digest('hex')};
}

// Local operator tool. No migration operation is exposed through the public RPC API.
export async function runMigration(provider, args = process.argv.slice(2)) {
  let restoreSettings;
  try {
    if (!['sql','postgres'].includes(provider)) throw new ApiError('Choose an Azure SQL or PostgreSQL migration entry point.',400);
    const [mode, profileId, confirmation] = args;
    if (!['--plan','--copy','--verify','--activate'].includes(mode) || !profileId) throw new ApiError('Use --plan, --copy, --verify or --activate followed by a database profile ID.',400);
    if(process.env.DESKPILOT_MIGRATION_AZURE_RESOURCE_ID)restoreSettings=await loadAzureMigrationSettings({resourceId:process.env.DESKPILOT_MIGRATION_AZURE_RESOURCE_ID,vaultName:process.env.DESKPILOT_MIGRATION_VAULT_NAME,provider,migrationClientId:process.env.DESKPILOT_MIGRATION_CLIENT_ID});
    if (process.env.DESKPILOT_WORKER_ENABLED !== 'false') throw new ApiError('Disable the worker for migration.',400);
    if (mode !== '--plan' && process.env.DESKPILOT_MIGRATION_WRITES_FROZEN !== 'true') throw new ApiError('Freeze source and destination writes, then set DESKPILOT_MIGRATION_WRITES_FROZEN=true.',400);
    const config=readConfig();
    const profile=selectProfile(storageProfiles(),profileId);requireMatchingProvider(profile,provider);
    const assertion=process.env.DESKPILOT_MIGRATION_TOKEN || await migrationLogin(config,process.env.DESKPILOT_MIGRATION_CLIENT_ID);
    const claims=await tokenValidator(config)(assertion);
    const {service:source}=await createServices(config,assertion,claims,fetch,{forMigration:true});
    requireDepartmentMappings(profile,source.workspaceSettings);
    const token=delegatedTokens(config,assertion),site=new URL(config.siteUrl);
    const readAttachment=async file=>{
      const url=new URL(file.contentUrl || file.url);
      if(url.origin!==site.origin || !url.pathname.startsWith(site.pathname.replace(/\/$/,'')+'/'))throw new ApiError('Refusing an attachment outside the workspace.',400);
      const response=await fetch(url,{headers:{Authorization:'Bearer '+await token(site.origin)},redirect:'error',signal:AbortSignal.timeout(60000)});
      if(!response.ok || Number(response.headers.get('content-length'))>5*1024*1024)throw new ApiError('A source attachment could not be copied within the supported 5 MB limit.',409);
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>5*1024*1024)throw new ApiError('Source attachment is larger than 5 MB.',400);chunks.push(chunk);}
      return Buffer.concat(chunks);
    };
    const snapshot=await captureSharePoint(source,readAttachment);
    const workspace=workspaceKey(config),repository=await openRepository(profile,workspace),attachments=new BlobAttachments(profile,workspace);
    const summary=migrationReview(provider,profile,config,snapshot,attachments);
    await repository.health();await attachments.health();
    if(mode==='--plan') {
      console.log(JSON.stringify({...summary,action:'Read-only preview. Nothing copied or activated.'},null,2));return;
    }
    if(confirmation!==summary.digest)throw new ApiError('The confirmation digest does not match the current source and destination. Run --plan again.',409);
    if(mode==='--copy'){
      const stage=provider==='sql' ? stageSqlMigration : stagePostgresMigration;
      const pool=provider==='sql' ? await sqlPool(profile) : postgresPool(profile);
      await stage({pool,workspace,snapshot,attachments,profileId,verifySource:async()=>(await captureSharePoint(source,readAttachment)).digest});
      console.log(JSON.stringify({...summary,action:'Copy staged. SharePoint remains active. Run --verify, then --activate separately.'},null,2));return;
    }
    await verifyStaged({repository,snapshot,attachments,profileId});
    if(mode==='--verify') {
      console.log(JSON.stringify({...summary,action:'Every staged record and attachment verified. SharePoint remains active.'},null,2));return;
    }
    const current=await source.roleManagement.load();
    if(JSON.stringify(current)!==JSON.stringify(snapshot.configuration))throw new ApiError('Role configuration changed. Restart migration review.',409);
    await source.roleManagement.save({...current,workspace:{...current.workspace,storage:{provider,connectionId:profileId,locked:true}}});
    console.log('Database binding saved. Keep writes frozen until user access and ticket data are verified. SharePoint originals were retained.');
  } catch(error) {
    // Driver errors may contain connection details and ticket parameters.
    console.error(error instanceof ApiError ? error.message : 'Migration did not finish. Check credentials, source consistency, database access, and the setup guide. No automatic source deletion was performed.');
    process.exitCode=1;
  } finally {
    delete process.env.DESKPILOT_MIGRATION_TOKEN;
    await Promise.allSettled([closePostgresPools(),closeSqlPools()]);
    restoreSettings?.();
  }
}
