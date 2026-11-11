const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/graph/GraphFaqService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(()=>({}),m,m.exports);
const {GraphFaqService}=m.exports;
const input={question:'Title',answer:'Content',category:'',keywords:'',published:true,sortOrder:0};
function setup(actor,email,fields){let writes=[];const svc=new GraphFaqService({get:async()=>({fields,eTag:'v1'}),patch:async(...args)=>writes.push(args),post:async(...args)=>writes.push(args)}, {currentUserEmail:email,currentUserId:7},undefined,actor);svc.context={path:'/faqs',fields:{question:'Title',answer:'Answer',category:'Category',keywords:'Keywords',published:'Active',sortOrder:'SortOrder'},categoryColumn:{text:{}},publisherEmail:'PublisherEmail',agentEditing:'AgentEditingEnabled'};svc.getAccess=async()=>({canManage:actor.admin,canCreate:true,canEditArticles:true,canSubmitDraft:true});svc.lookupOptions=async()=>({});return{svc,writes};}
(async()=>{
 let test=setup({admin:false,agent:true},'owner@example.com',{PublisherEmail:'owner@example.com',Active:true});await test.svc.save(input,1);assert.equal(test.writes.length,1);assert.equal(test.writes[0][2],'v1');assert(!('PublisherEmail' in test.writes[0][1]));
 test=setup({admin:false,agent:true},'other@example.com',{PublisherEmail:'owner@example.com',Active:true});await assert.rejects(()=>test.svc.save(input,1),/Only the publisher/);assert.equal(test.writes.length,0);
 test=setup({admin:false,agent:true},'other@example.com',{PublisherEmail:'owner@example.com',Active:true,AgentEditingEnabled:true});await test.svc.save({...input,agentEditingEnabled:true},1);assert.equal(test.writes.length,1);await assert.rejects(()=>test.svc.save({...input,agentEditingEnabled:false},1),/Only a Helpdesk Admin/);
 test=setup({admin:true,agent:false},'admin@example.com',{PublisherEmail:'owner@example.com',Active:true});await test.svc.save({...input,agentEditingEnabled:true},1);assert.equal(test.writes[0][1].AgentEditingEnabled,true);assert(!('PublisherEmail' in test.writes[0][1]));
 test=setup({admin:false,agent:true},'owner@example.com',{AuthorLookupId:'7',Active:true});await test.svc.save(input,1);assert.equal(test.writes.length,1);assert(!('PublisherEmail' in test.writes[0][1]),'Do not falsely claim a legacy publisher');
 test=setup({admin:false,agent:false},'owner@example.com',{PublisherEmail:'owner@example.com',Active:true});await assert.rejects(()=>test.svc.save(input,1),/Only the publisher/);
 test=setup({admin:true,agent:false},'admin@example.com',{Active:false});await test.svc.save(input,1);assert.equal(test.writes[0][1].PublisherEmail,'admin@example.com');
 console.log('Knowledge Base editing permissions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
