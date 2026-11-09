const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
function load(path,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const root='src/webparts/helpdeskSystem/';
const {applyAppRoleRules}=load(root+'services/appRoleRules.ts');
const {GraphTicketService}=load(root+'services/graph/GraphTicketService.ts',{'../../utils/ticketStatuses':load(root+'utils/ticketStatuses.ts'),'../../utils/commentContent':load(root+'utils/commentContent.ts'),'./SharePointAttachments':{},'../../utils/ticketAttachments':{},'./GraphClassificationService':{},'./GraphClient':{}});
(async()=>{
 const ticket={Id:1,Title:'Original',Description:'Details',Status:'New',Priority:'Low',CreatedBy:{Id:8},AssignedTo:{Id:7}};
 let calls=0;const source={getTickets:async()=>({tickets:[ticket]}),updateTicket:async()=>{calls++;},updateTickets:async()=>{calls++;}};
 const input={title:ticket.Title,status:ticket.Status,priority:ticket.Priority,assignedToId:7};
 const agent=applyAppRoleRules(source,{id:'agent',scope:'all',actions:['tickets','edit','assign','status','comment']},7,'');
 const admin=applyAppRoleRules(source,{id:'admin',scope:'all',actions:['tickets','edit','assign','status']},7,'');
 for(const service of [agent,admin]){
   await assert.rejects(service.updateTicket(1,{...input,title:'Changed'}),/creator/);
   await assert.rejects(service.updateTicket(1,{...input,description:'Changed'}),/creator/);
   await assert.rejects(service.updateTicket(1,{...input,requestedById:9}),/Requester/);
   await assert.rejects(service.updateTicket(1,{...input,requesterEmail:'other@example.com'}),/Requester/);
 }
 await assert.rejects(agent.updateTicket(1,{...input,assignedToId:9}),/only tickets they created/);
 await assert.rejects(agent.updateTickets([1],{kind:'assign',userId:9}),/only tickets they created/);
 await assert.rejects(agent.updateTicket(1,{...input,status:'Closed'}),/cannot close/);
 await assert.rejects(agent.updateTickets([1],{kind:'status',status:'Closed'}),/cannot close/);
 assert.equal(calls,0);await admin.updateTicket(1,{...input,status:'Resolved'});assert.equal(calls,1);
 let item={createdDateTime:new Date().toISOString(),fields:{TicketKey:'tickets:1',AuthorLookupId:7}};
 const deleted=[];const graph={get:async()=>item,delete:async path=>deleted.push(path)};
 const service=new GraphTicketService(graph,{currentUserId:7});
 service.commentsContext=async()=>({path:'/comments',key:'TicketKey',ticketKey:'tickets:1'});
 service.getTickets=async()=>({tickets:[ticket]});
 await service.deleteComment(1,'2');assert.deepEqual(deleted,['/comments/items/2']);deleted.length=0;
 item.fields.AuthorLookupId=8;await assert.rejects(service.deleteComment(1,'2'),/own comments/);item.fields.AuthorLookupId=7;
 item.createdDateTime=new Date(Date.now()-600001).toISOString();await assert.rejects(service.deleteComment(1,'2'),/10 minutes/);
 item.createdDateTime='invalid';await assert.rejects(service.deleteComment(1,'2'),/10 minutes/);
 item.createdDateTime=new Date().toISOString();item.fields.TicketKey='tickets:3';await assert.rejects(service.deleteComment(1,'2'),/own comments/);
 item.fields.TicketKey='tickets:1';ticket.SolutionCommentId='2';await assert.rejects(service.deleteComment(1,'2'),/solution/);
 assert.equal(deleted.length,0);
 console.log('Ticket ownership and comment deletion checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
