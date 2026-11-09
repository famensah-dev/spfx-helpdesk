import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAzureMigrationSettings} from '../scripts/migration-settings.mjs';
import {migrationReview} from '../scripts/migrate-sharepoint.mjs';

const resourceId='/subscriptions/11111111-1111-4111-8111-111111111111/resourceGroups/rg-dev/providers/Microsoft.Web/sites/deskpilot';
const migrationClientId='22222222-2222-4222-8222-222222222222';
const settings={DESKPILOT_WORKER_ENABLED:'false','AzureWebJobs.Automation.Disabled':'true',DESKPILOT_TENANT_ID:'tenant',DESKPILOT_CLIENT_ID:'api',DESKPILOT_ALLOWED_CLIENT_IDS:'frontend',DESKPILOT_ALLOWED_ORIGINS:'https://tenant.sharepoint.com',DESKPILOT_SITE_URL:'https://tenant.sharepoint.com/sites/help',DESKPILOT_PAGE_URL:'https://tenant.sharepoint.com/sites/help/SitePages/DeskPilot.aspx',DESKPILOT_CLIENT_SECRET:'@Microsoft.KeyVault(SecretUri=https://deskpilot-kv-dev.vault.azure.net/secrets/client)',DESKPILOT_SQL_PROFILES:'@Microsoft.KeyVault(SecretUri=https://deskpilot-kv-dev.vault.azure.net/secrets/sql)'};
function fixture(properties=settings){
  const scopes=[],calls=[];
  return {scopes,calls,credential:{getToken:async scope=>{scopes.push(scope);return {token:scope.includes('management')?'arm-token':'vault-token'};}},request:async(address,options)=>{const url=new URL(address);calls.push({url,options});if(url.hostname==='management.azure.com')return Response.json({properties});assert.equal(url.hostname,'deskpilot-kv-dev.vault.azure.net');assert.equal(options.headers.Authorization,'Bearer vault-token');return Response.json({value:url.pathname.endsWith('/client')?'private-client-secret':'[{"id":"primary"}]'});}};
}
test('Migration loads only required settings and secrets into memory and restores local environment',async()=>{
  const f=fixture(),env={DESKPILOT_CLIENT_SECRET:'old-value',UNRELATED:'preserved'};
  const restore=await loadAzureMigrationSettings({resourceId,vaultName:'deskpilot-kv-dev',provider:'sql',migrationClientId,env,...f});
  assert.equal(env.DESKPILOT_CLIENT_SECRET,'private-client-secret');
  assert.equal(env.DESKPILOT_SQL_PROFILES,'[{"id":"primary"}]');
  assert.equal(env.DESKPILOT_POSTGRES_PROFILES,'[]');
  assert.equal(env.DESKPILOT_ALLOWED_CLIENT_IDS,'frontend,'+migrationClientId);
  assert.equal(f.calls.length,3);assert(f.calls.every(call=>call.options.redirect==='error'));
  assert.deepEqual(f.scopes,['https://management.azure.com/.default','https://vault.azure.net/.default']);
  restore();assert.deepEqual(env,{DESKPILOT_CLIENT_SECRET:'old-value',UNRELATED:'preserved'});
});
test('Migration refuses other vaults, enabled live automation, and malformed resource targets',async()=>{
  for(const properties of [{...settings,DESKPILOT_CLIENT_SECRET:'@Microsoft.KeyVault(SecretUri=https://other-vault.vault.azure.net/secrets/client)'},{...settings,DESKPILOT_WORKER_ENABLED:'true'}]){
    const f=fixture(properties),env={};
    await assert.rejects(loadAzureMigrationSettings({resourceId,vaultName:'deskpilot-kv-dev',provider:'sql',migrationClientId,env,...f}));
    assert(f.calls.every(call=>call.url.hostname==='management.azure.com'));
    assert.deepEqual(env,{});
  }
  await assert.rejects(loadAzureMigrationSettings({resourceId:'https://example.com',vaultName:'deskpilot-kv-dev',provider:'sql',migrationClientId,...fixture()}),/exact Function/);
});
test('Migration confirmation binds source, database engine, target database and Blob account without disclosing credentials',()=>{
  const profile={id:'primary',sql:{server:'server.database.windows.net',database:'DeskPilot',password:'never-print'},container:'attachments',blobConnectionString:'never-print'};
  const config={siteUrl:'https://tenant.sharepoint.com/sites/help'},snapshot={digest:'source',counts:{ticket:1}};
  const review=migrationReview('sql',profile,config,snapshot,{container:{url:'https://files.blob.core.windows.net/attachments?sig=never-print'}});
  assert(!JSON.stringify(review).includes('never-print'));
  assert.notEqual(review.digest,migrationReview('sql',{...profile,sql:{...profile.sql,database:'Other'}},config,snapshot,{container:{url:'https://files.blob.core.windows.net/attachments'}}).digest);
  assert.notEqual(review.digest,migrationReview('sql',profile,config,{...snapshot,digest:'changed'},{container:{url:'https://files.blob.core.windows.net/attachments'}}).digest);
});
