import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import { PostgresRepository, postgresPool, closePostgresPools } from '../src/storage/postgres/repository.mjs';
import { storageProfiles } from '../src/storage/profiles.mjs';
import { createStorageManagement } from '../src/storage/management.mjs';
import { captureSharePoint, stageMigration, verifyStaged } from '../src/storage/postgres/migration.mjs';

const schema=await readFile(new URL('../src/storage/postgres/schema.sql',import.meta.url),'utf8');
test('Database creation metadata does not download legacy SharePoint ticket rows',async()=>{
  const require=createRequire(import.meta.url);
  const {GraphTicketService}=require('../compiled/services/graph/GraphTicketService.js');
  const paths=[];
  const service=new GraphTicketService({getAll:async path=>{
    paths.push(path);
    if(path.includes('/lists?'))return [{id:'tickets',displayName:'Tickets'}];
    if(path.endsWith('/columns'))return [{name:'Title',text:{}},{name:'Status',choice:{choices:['New']}},{name:'Priority',choice:{choices:['Low','Medium']}},{name:'AssignedTo',personOrGroup:{}}].map(column=>({...column,displayName:column.name}));
    throw new Error('Unexpected ticket data fetch');
  }},{siteUrl:'https://tenant.sharepoint.com/sites/help',siteId:'site',listName:'Tickets'});
  assert.deepEqual(await service.getPriorities(),['Low','Medium']);
  assert(!paths.some(path=>path.includes('/items')));
});
async function database(t){
  const db=new PGlite();await db.exec(schema);t.after(()=>db.close());
  const query=async(text,values)=>{const result=await db.query(text,values);return {...result,rowCount:result.affectedRows};};
  const pool={query,connect:async()=>({query,release(){}})};
  return {db,pool,repository:new PostgresRepository(pool,'workspace-a')};
}
test('PostgreSQL schema and repository enforce workspace/role/department filters and indexed identities',async t=>{
  const {repository:r,pool}=await database(t);
  await r.health();
  const own=await r.insert('ticket',{Title:'Own',Requester:{Email:'Agent@Example.com'},Department:'HR'});
  const created=await r.insert('ticket',{Title:'Created',CreatedBy:{Email:'agent@example.com'},Department:'HR'});
  const assigned=await r.insert('ticket',{Title:'Assigned',AssignedTo:{Email:'agent@example.com'},Department:'IT'});
  await r.insert('ticket',{Title:'Other',Requester:{Email:'other@example.com'},Department:'HR'});
  const other=new PostgresRepository(pool,'workspace-b');await other.insert('ticket',{Title:'Other workspace',Requester:{Email:'agent@example.com'},Department:'IT'});
  const scope={email:'agent@example.com',mode:'assigned',agent:true,departments:['IT']};
  assert.deepEqual((await r.list('ticket',{scope})).map(row=>row.id),[assigned.id,created.id,own.id]);
  assert.deepEqual((await r.list('ticket',{scope:{...scope,mode:'own'}})).map(row=>row.id),[own.id]);
  assert.equal((await r.list('ticket',{scope:{...scope,departments:[]}})).length,2);
  assert.equal((await r.list('ticket',{scope:{...scope,email:"agent' OR 1=1 --"}})).length,0);
  await assert.rejects(r.list('ticket',{scope:{email:'agent@example.com',mode:'bogus'}}),/Invalid/);
  assert.equal((await r.list('ticket')).length,4);
});
test('PostgreSQL versions prevent lost updates and deletes, and parent/owner filters protect receipts',async t=>{
  const {repository:r}=await database(t);
  const row=await r.insert('ticket',{Title:'Initial'});
  const saved=await r.replace('ticket',row.id,{Title:'New'},row.version);
  assert.notEqual(saved.version,row.version);assert.match(saved.version,/^[0-9a-f]{16}$/);
  await assert.rejects(r.replace('ticket',row.id,{Title:'Lost edit'},row.version),/changed/);
  await assert.rejects(r.remove('ticket',row.id,row.version),/changed/);
  await assert.rejects(r.remove('ticket',row.id,'invalid'),/Reload/);
  await r.insert('view',{ticketId:row.id},row.id,'user-a');
  await r.insert('view',{ticketId:row.id},row.id,'user-b');
  assert.equal((await r.list('view',{parent:row.id,owner:'user-a'})).length,1);
  await assert.rejects(r.insert('view',{ticketId:row.id},row.id,'user-a'),error=>error.status===409);
  await r.remove('ticket',row.id,saved.version);assert.equal(await r.get('ticket',row.id),undefined);
});
const profile={id:'postgres-main',name:'Postgres',provider:'postgres',postgres:{host:'test.postgres.database.azure.com',database:'deskpilot',user:'runtime',authentication:'managed-identity'},blobConnectionString:'private-value',container:'attachments'};
test('PostgreSQL profiles and binding keep credentials private and reject mismatched providers',async()=>{
  assert.equal(storageProfiles({DESKPILOT_POSTGRES_PROFILES:JSON.stringify([profile])})[0].provider,'postgres');
  assert.throws(()=>storageProfiles({DESKPILOT_POSTGRES_PROFILES:'{}'}),/arrays/);
  assert.throws(()=>storageProfiles({DESKPILOT_POSTGRES_PROFILES:'{"password":"never-return-this-secret"'}),error=>!error.message.includes('never-return-this-secret') && /Invalid/.test(error.message));
  assert.throws(()=>storageProfiles({DESKPILOT_POSTGRES_PROFILES:JSON.stringify([{...profile,postgres:{...profile.postgres,authentication:'disabled'}}])}),/Invalid/);
  let value={workspace:{title:'Helpdesk'}};
  const control={access:{superAdmin:true},workspaceSettings:value.workspace,getTickets:async()=>({tickets:[]}),getFaqs:async()=>[],roleManagement:{load:async()=>structuredClone(value),save:async input=>{value=input;}}};
  const management=createStorageManagement({control,profiles:[profile],openDatabase:async()=>({repository:{health:async()=>{},list:async()=>[]},attachments:{health:async()=>{}}})});
  assert(!JSON.stringify(await management.get()).includes('private-value'));
  await assert.rejects(management.save({provider:'sql',connectionId:profile.id}),/does not match/);
  await management.save({provider:'postgres',connectionId:profile.id});
  assert.equal(value.workspace.storage.provider,'postgres');
  await assert.rejects(management.save({provider:'sharepoint'}),/already bound/);
});
test('PostgreSQL connections validate TLS and sanitize database failures',async()=>{
  const pool=postgresPool(profile);
  assert.equal(pool.options.ssl.rejectUnauthorized,true);
  assert.equal(pool.options.max,5);
  assert.equal(typeof pool.options.password,'function');
  await closePostgresPools();
  const repository=new PostgresRepository({query:async()=>{const error=new Error('password=never-return-secret; ticket body');error.code='42P01';throw error;}},'workspace-a');
  await assert.rejects(repository.health(),error=>error.status===503 && !error.message.includes('never-return-secret'));
});
function migrationFixture(){
  const data={access:{superAdmin:true},getTickets:async()=>({tickets:[{Id:55,Title:'Preserved',Requester:{Email:'staff@example.com'},SolutionCommentId:'99'}]}),getComments:async()=>[{id:'99',text:'Fixed',author:'Agent',created:'2026-11-07',attachments:[{name:'comment.txt',url:'private'}]}],getAttachments:async()=>[{name:'ticket.txt',url:'private'}],getHistory:async()=>[{id:'512',modified:'2026-11-07',author:'Agent'}],getFaqs:async()=>[{id:20,question:'Article',answer:'Content',published:true}],roleManagement:{load:async()=>({workspace:{title:'Helpdesk'}})}};
  const files=new Map();let next=0;
  const attachments={upload:async(id,file)=>{const key='workspace-a/'+id+'/'+(++next);const value={key,name:file.name,size:file.size};files.set(key,Buffer.from(await file.arrayBuffer()));return value;},verify:async(file)=>{assert(files.has(file.key));},remove:async(file)=>files.delete(file.key)};
  return {data,files,attachments,read:async()=>Buffer.from('contents')};
}
test('Migration preserves ticket/comment/article IDs, attachments and solution links; activation rejects changes',async t=>{
  const {pool,repository}=await database(t),fixture=migrationFixture();
  const snapshot=await captureSharePoint(fixture.data,fixture.read);
  assert.equal(snapshot.counts.attachment,2);
  await stageMigration({pool,workspace:'workspace-a',snapshot,attachments:fixture.attachments,profileId:profile.id,verifySource:async()=>snapshot.digest});
  assert.equal((await repository.get('ticket',55)).SolutionCommentId,'99');
  assert.equal((await repository.get('comment',99)).ticketId,55);
  assert.equal((await repository.list('attachment')).length,2);
  await verifyStaged({repository,snapshot,attachments:fixture.attachments,profileId:profile.id});
  const original=await repository.get('ticket',55);
  await repository.replace('ticket',55,{...original,Title:'Changed after copy'},original.version);
  await assert.rejects(verifyStaged({repository,snapshot,attachments:fixture.attachments,profileId:profile.id}),/changed after/);
  const created=await repository.insert('ticket',{Title:'Next'});assert(created.id>99);
  await assert.rejects(verifyStaged({repository,snapshot,attachments:fixture.attachments,profileId:profile.id}),/verification/);
  await assert.rejects(stageMigration({pool,workspace:'workspace-a',snapshot,attachments:fixture.attachments,profileId:profile.id,verifySource:async()=>snapshot.digest}),/not empty/);
});
test('An uncertain migration commit retains copied blobs rather than deleting committed attachments',async t=>{
  const {pool,repository}=await database(t),fixture=migrationFixture();
  const snapshot=await captureSharePoint(fixture.data,fixture.read);
  const uncertain={connect:async()=>{const client=await pool.connect();return {release:()=>client.release(),query:async(text,values)=>{const result=await client.query(text,values);if(text==='COMMIT')throw new Error('Lost commit acknowledgement');return result;}};}};
  await assert.rejects(stageMigration({pool:uncertain,workspace:'workspace-a',snapshot,attachments:fixture.attachments,profileId:profile.id,verifySource:async()=>snapshot.digest}),/Lost commit/);
  assert.equal((await repository.list('attachment')).length,2);
  assert.equal(fixture.files.size,2);
  await verifyStaged({repository,snapshot,attachments:fixture.attachments,profileId:profile.id});
});
test('Migration rolls back destination rows and new blobs if source changes; missing attachments fail closed',async t=>{
  const {pool,repository}=await database(t),fixture=migrationFixture();
  const snapshot=await captureSharePoint(fixture.data,fixture.read);
  await assert.rejects(stageMigration({pool,workspace:'workspace-a',snapshot,attachments:fixture.attachments,profileId:profile.id,verifySource:async()=>'changed'}),/changed during/);
  assert.equal((await repository.list('ticket')).length,0);assert.equal(fixture.files.size,0);
  fixture.data.getComments=async()=>[{id:'99',attachmentError:'Unavailable'}];
  await assert.rejects(captureSharePoint(fixture.data,fixture.read),/attachment/);
});
