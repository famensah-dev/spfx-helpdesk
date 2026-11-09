import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSharePoint, verifyStaged } from '../src/storage/migration.mjs';
import { stageSqlMigration } from '../src/storage/sql/migration.mjs';
import { SqlRepository } from '../src/storage/sql/repository.mjs';
import { createStorageManagement } from '../src/storage/management.mjs';
import { dispatch } from '../src/dispatch.mjs';

// Transaction-aware mssql contract fixture. It does not claim to be a SQL Server engine.
function fixture() {
  const pool={rows:[],identity:0,version:0,commands:[],close:async()=>{pool.closed=true;}};
  class Transaction {
    constructor(parent){assert.equal(parent,pool);this.parent=parent;pool.transaction=this;}
    async begin(level){assert.equal(level,'SERIALIZABLE');this.rows=structuredClone(pool.rows);this.active=true;pool.commands.push('BEGIN');}
    async commit(){pool.commands.push('COMMIT');pool.rows=this.rows;this.active=false;if(pool.lostCommit)throw new Error('Lost commit acknowledgement');}
    async rollback(){pool.commands.push('ROLLBACK');if(pool.failRollback||!this.active)throw new Error('Rollback not confirmed');this.active=false;}
  }
  class Request {
    constructor(owner){this.owner=owner;this.values={};}
    input(name,type,value){this.values[name]=value;return this;}
    async query(query){
      pool.commands.push(query);const v=this.values,tx=this.owner instanceof Transaction?this.owner:undefined;
      if(tx)assert(tx.active,'All requests must use the active pinned transaction');
      const rows=tx?tx.rows:pool.rows;
      if(query.startsWith('SET IDENTITY_INSERT')){tx.identityInsert=query.endsWith('ON');return {recordset:[]};}
      if(query.includes('TABLOCKX'))return {recordset:rows.filter(row=>row.WorkspaceId===v.workspace).slice(0,1)};
      if(query.includes('GROUP BY Kind'))return {recordset:[...new Set(rows.filter(row=>row.WorkspaceId===v.workspace).map(row=>row.Kind))].map(Kind=>({Kind,Total:rows.filter(row=>row.WorkspaceId===v.workspace&&row.Kind===Kind).length}))};
      if(query.startsWith('INSERT')){
        if(pool.failInsert)throw new Error('Insert failed');
        if(v.id!==undefined){assert(tx.identityInsert);pool.identity=Math.max(pool.identity,v.id);}else assert(!tx?.identityInsert);
        const Version=Buffer.alloc(8);Version.writeBigUInt64BE(BigInt(++pool.version));
        const row={WorkspaceId:v.workspace,Kind:v.kind,Id:v.id??++pool.identity,ParentId:v.parent,OwnerId:v.owner||'',Document:v.document,Version};
        assert(!rows.some(item=>item.WorkspaceId===row.WorkspaceId&&item.Kind===row.Kind&&item.Id===row.Id));
        rows.push(row);return {recordset:[row]};
      }
      if(query.startsWith('SELECT Id,Document,Version'))return {recordset:rows.filter(row=>row.WorkspaceId===v.workspace&&row.Kind===v.kind).sort((a,b)=>b.Id-a.Id)};
      throw new Error('Unimplemented fixture query');
    }
  }
  pool.request=()=>new Request(pool);
  const driver={Transaction,Request,ISOLATION_LEVEL:{SERIALIZABLE:'SERIALIZABLE'},NVarChar:()=>'',BigInt:'bigint',MAX:'max'};
  const source={access:{superAdmin:true},getTickets:async()=>({tickets:[{Id:55,Title:"Ticket ' ; --",Requester:{Email:'staff@example.com'},SolutionCommentId:'99'}]}),getComments:async()=>[{id:'99',text:'Solved',author:'Agent',created:'2026-11-09',attachments:[{name:'comment.txt'}]}],getAttachments:async()=>[{name:'ticket.txt'}],getHistory:async()=>[{id:'512',modified:'2026-11-09',author:'Agent'}],getFaqs:async()=>[{id:20,question:'Article',answer:'Contents',published:true}],roleManagement:{load:async()=>({workspace:{title:'Helpdesk'}})}};
  const files=new Map();let next=0;
  const attachments={upload:async(id,file)=>{const key='workspace-a/'+id+'/'+(++next);const value={key,name:file.name,size:file.size};files.set(key,Buffer.from(await file.arrayBuffer()));return value;},verify:async(file)=>{if(pool.failBlobVerification)throw new Error('Blob mismatch');assert(files.has(file.key));},remove:async(file)=>files.delete(file.key)};
  return {pool,driver,source,attachments,files,repository:new SqlRepository(pool,'workspace-a'),snapshot:()=>captureSharePoint(source,async()=>Buffer.from('File contents'))};
}
async function stage(f,snapshot,verifySource=async()=>snapshot.digest){return stageSqlMigration({pool:f.pool,driver:f.driver,workspace:'workspace-a',snapshot,attachments:f.attachments,profileId:'primary',verifySource});}

test('Azure SQL migration preserves IDs and links, uses a pinned serializable transaction and does not activate',async()=>{
  const f=fixture(),snapshot=await f.snapshot();
  await stage(f,snapshot);
  assert.equal((await f.repository.list('ticket'))[0].id,55);
  assert.equal((await f.repository.list('ticket'))[0].SolutionCommentId,'99');
  assert.equal((await f.repository.list('comment'))[0].id,99);
  assert.equal((await f.repository.list('attachment')).length,2);
  assert(f.pool.identity>99,'New identities must not collide with imported IDs');
  assert.equal(f.pool.transaction.identityInsert,false);
  assert(f.pool.commands.some(text=>text.includes('TABLOCKX,HOLDLOCK')));
  assert(f.pool.commands.every(text=>!text.includes("Ticket ' ; --")),'Documents must be parameters, never SQL text');
  assert.equal(f.pool.commands.at(-1).startsWith('SELECT'),true);
  await verifyStaged({repository:f.repository,snapshot,attachments:f.attachments,profileId:'primary'});
  assert.equal(snapshot.configuration.workspace.storage,undefined,'Copy does not change the active provider');
});
test('Azure SQL migration refuses existing destination rows before uploading files',async()=>{
  const f=fixture(),snapshot=await f.snapshot();f.pool.rows.push({WorkspaceId:'workspace-a',Kind:'ticket',Id:1});
  await assert.rejects(stage(f,snapshot),/not empty/);
  assert.equal(f.files.size,0);assert.equal(f.pool.rows.length,1);
});
test('Azure SQL migration rolls back records and copied blobs when the source changes',async()=>{
  const f=fixture(),snapshot=await f.snapshot();
  await assert.rejects(stage(f,snapshot,async()=>'changed'),/changed during/);
  assert.equal(f.pool.rows.length,0);assert.equal(f.files.size,0);
  assert.equal(f.pool.transaction.identityInsert,false);
  assert(f.pool.commands.includes('ROLLBACK'));assert(!f.pool.commands.includes('COMMIT'));
});
test('Azure SQL migration turns off IDENTITY_INSERT after an insert failure',async()=>{
  const f=fixture(),snapshot=await f.snapshot();f.pool.failInsert=true;
  await assert.rejects(stage(f,snapshot),/Insert failed/);
  assert.equal(f.pool.transaction.identityInsert,false);assert.equal(f.pool.rows.length,0);
});
test('Azure SQL migration rolls back blobs when copied content verification fails',async()=>{
  const f=fixture(),snapshot=await f.snapshot();f.pool.failBlobVerification=true;
  await assert.rejects(stage(f,snapshot),/Blob mismatch/);
  assert.equal(f.files.size,0);assert.equal(f.pool.rows.length,0);
});
test('Azure SQL migration retains files after an uncertain commit or rollback',async()=>{
  for(const lostCommit of [true,false]){
    const f=fixture(),snapshot=await f.snapshot();f.pool.lostCommit=lostCommit;f.pool.failRollback=!lostCommit;
    await assert.rejects(stage(f,snapshot,lostCommit?async()=>snapshot.digest:async()=>'changed'));
    assert.equal(f.files.size,2,'Unknown database outcome must not delete potentially referenced files');
    if(lostCommit)await verifyStaged({repository:f.repository,snapshot,attachments:f.attachments,profileId:'primary'});
  }
});
test('Azure SQL activation verification rejects tampering and a different profile',async()=>{
  const f=fixture(),snapshot=await f.snapshot();await stage(f,snapshot);
  await assert.rejects(verifyStaged({repository:f.repository,snapshot,attachments:f.attachments,profileId:'other'}),/does not match/);
  f.pool.rows.find(row=>row.Kind==='ticket').Document='{"Title":"Tampered"}';
  await assert.rejects(verifyStaged({repository:f.repository,snapshot,attachments:f.attachments,profileId:'primary'}),/changed after/);
});
test('Connection test runs on the backend, remains read-only, and is denied to non-Super Admins',async()=>{
  let opened=0,saved=0,read=0,healthy=0;
  const control={access:{superAdmin:true},workspaceSettings:{},roleManagement:{load:async()=>({workspace:{}}),save:async()=>{saved++;}},getTickets:async()=>{read++;return {tickets:[]};}};
  const management=createStorageManagement({control,profiles:[{id:'primary',name:'SQL'}],openDatabase:async()=>{opened++;return {repository:{health:async()=>{healthy++;}},attachments:{health:async()=>{healthy++;}}};}});
  const service={access:control.access,storageManagement:management};
  assert.deepEqual(await dispatch({service},'storageManagement.test',['primary']),{ok:true,provider:'sql'});
  assert.equal(opened,1);assert.equal(healthy,2);assert.equal(saved,0);assert.equal(read,0);
  await assert.rejects(management.test('unknown'),/not configured/);assert.equal(opened,1);
  control.access.superAdmin=false;
  await assert.rejects(management.test('primary'),/Super Admin/);
  await assert.rejects(dispatch({service},'storageManagement.test',['primary']),/Super Admin/);
  assert.equal(opened,1);
});
