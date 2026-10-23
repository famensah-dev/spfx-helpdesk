const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),module,module.exports);return module.exports;}
const {GraphTicketService}=load('src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts',{'../../utils/commentContent':load('src/webparts/helpdeskSystem/utils/commentContent.ts'),'./SharePointAttachments':{},'../../utils/ticketAttachments':{},'./GraphClassificationService':{},'./GraphClient':{}});
const {applyAppRoleRules}=load('src/webparts/helpdeskSystem/services/appRoleRules.ts');
(async()=>{
 let current={fields:{ResolutionSummary:'',SolutionCommentId:''},'@odata.etag':'version-1'},key='tickets:5',patches=[];
 const graph={get:async path=>path.startsWith('/comments')?{fields:{TicketKey:key,Content:'Restart the service.'}}:current,patch:async(...args)=>{patches.push(args);}};
 const service=new GraphTicketService(graph,{});service.solutionSchema={path:'/tickets',summary:'ResolutionSummary',comment:'SolutionCommentId'};service.commentsContext=async()=>({path:'/comments',key:'TicketKey',content:'Content',ticketKey:'tickets:5'});
 await service.markCommentAsSolution(5,'7');assert.deepEqual(patches[0],['/tickets/items/5/fields',{ResolutionSummary:'Restart the service.',SolutionCommentId:'7'},'version-1']);assert(!('Status' in patches[0][1]));
 key='tickets:6';await assert.rejects(service.markCommentAsSolution(5,'7'),/different ticket/);key='tickets:5';
 current.fields.ResolutionSummary='Old answer';await assert.rejects(service.markCommentAsSolution(5,'7'),/Confirm replacement/);
 await service.markCommentAsSolution(5,'7',true);delete current['@odata.etag'];await assert.rejects(service.markCommentAsSolution(5,'7',true),/ticket version/);
 let called=0;const source={access:{admin:false,superAdmin:false},getTickets:async()=>({tickets:[{Id:5}]}),markCommentAsSolution:async()=>{called++;}};
 const role={scope:'all',actions:['edit']};assert.equal(applyAppRoleRules(source,role,1,'').markCommentAsSolution,undefined);
 source.access.admin=true;await applyAppRoleRules(source,role,1,'').markCommentAsSolution(5,'7',true);assert.equal(called,1);
 await assert.rejects(applyAppRoleRules(source,role,1,'').markCommentAsSolution(9,'7'),/outside/);
 // Manual resolution and clearing must patch summary and solution reference together.
 service.editSchema={path:'/tickets',title:'Title',priority:'Priority',priorities:['Medium']};
 service.updateSchema={path:'/tickets',status:'Status',choices:['New','Resolved','Closed'],assigned:'AssignedTo'};
 const edit={title:'Ticket',priority:'Medium',status:'Resolved',assignedToId:null};
 patches=[];await service.updateTicket(5,{...edit,resolutionSummary:'  Replaced cable.  '});
 assert.equal(patches[0][1].ResolutionSummary,'Replaced cable.');assert.equal(patches[0][1].SolutionCommentId,'');assert.equal(patches[0][1].Status,'Resolved');
 patches=[];await service.updateTicket(5,{...edit,resolutionSummary:''});assert.equal(patches[0][1].ResolutionSummary,'');assert.equal(patches[0][1].SolutionCommentId,'');
 const guardedSource={access:{admin:false,superAdmin:false},getTickets:async()=>({tickets:[{Id:5,Title:'Ticket',Priority:'Medium',Status:'New'}]}),updateTicket:async()=>{called++;}};
 const guarded=applyAppRoleRules(guardedSource,{scope:'all',actions:['edit','status']},1,'');
 await assert.rejects(guarded.updateTicket(5,{...edit,resolutionSummary:''}),/Only Helpdesk Admins/);
 await assert.rejects(guarded.updateTicket(5,{...edit,status:'Closed'}),/Only Helpdesk Admins/);
 console.log('Comment solution checks passed: summary/ID saved together, status unchanged, ticket binding, replacement confirmation, version guard and admin scope.');
})().catch(error=>{console.error(error);process.exitCode=1;});
