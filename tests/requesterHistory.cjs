const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name] || {},m,m.exports);return m.exports;}
(async()=>{
 const {GraphTicketService}=load('src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts');
 const service=Object.create(GraphTicketService.prototype);service.context={sitePath:'/sites/test',listId:'tickets'};service.requesterFields={name:'RequesterName',email:'RequesterEmail',requestedBy:'RequestedBy'};
 const fields=(name,email,id)=>({RequesterName:name,RequesterEmail:email,RequestedByLookupId:id});
 let request;
 service.graph={getAll:async path=>{request=path;return [
 {id:'3',lastModifiedDateTime:'2026-11-10T12:00:00Z',lastModifiedBy:{user:{displayName:'Admin'}},fields:fields('New person','new@example.com','2')},
 {id:'1',lastModifiedDateTime:'2026-11-10T10:00:00Z',fields:fields('Original','old@example.com','1')},
 {id:'2',lastModifiedDateTime:'2026-11-10T11:00:00Z',fields:fields('Original','old@example.com','1')}
 ];}};
 const history=await service.getHistory(1);assert(request.endsWith('?$expand=fields'));assert.equal(history[0].author,'Admin');assert.deepEqual(history[0].requesterChange,{before:'Original / old@example.com',after:'New person / new@example.com'});assert.equal(history[1].requesterChange,undefined);assert.equal(history[2].requesterChange,undefined);
 service.graph.getAll=async()=>[{id:'1',lastModifiedDateTime:'2026-11-10T10:00:00Z'},{id:'2',lastModifiedDateTime:'2026-11-10T11:00:00Z',fields:fields('New','new@example.com','2')}];assert((await service.getHistory(1)).every(version=>!version.requesterChange),'Missing historical fields must not invent requester changes');
 console.log('Requester history checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
