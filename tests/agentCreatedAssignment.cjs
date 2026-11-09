const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleUnderTest={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/appRoleRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(require,moduleUnderTest,moduleUnderTest.exports);
const {applyAppRoleRules,isAgentCreatedTicket}=moduleUnderTest.exports;
const role={id:'agent',scope:'assigned',actions:['tickets','edit','status','comment']};
const tickets=[
  {Id:1,Title:'Created',Priority:'Low',Status:'New',CreatedBy:{Id:7,Email:'agent@example.com'},AssignedTo:{Id:8}},
  {Id:2,Title:'Requested only',Priority:'Low',Status:'New',Requester:{Id:7},CreatedBy:{Id:9},AssignedTo:{Id:8}},
  {Id:3,Title:'Assigned only',Priority:'Low',Status:'New',CreatedBy:{Id:9},AssignedTo:{Id:7}}
];
let calls=[];
const source={access:{agent:true,email:'agent@example.com'},getTickets:async()=>({tickets}),updateTicket:async(id,input)=>calls.push(id),updateTickets:async(ids,action)=>{calls.push(...ids);return {succeeded:ids,failed:[]};}};
const service=applyAppRoleRules(source,role,7,'agent@example.com');
const input=ticket=>({title:ticket.Title,priority:ticket.Priority,status:ticket.Status,assignedToId:10});
(async()=>{
  await service.updateTicket(1,input(tickets[0]));assert.deepEqual(calls,[1]);
  await service.updateTickets([1],{kind:'assign',userId:10});assert.deepEqual(calls,[1,1]);
  for(const ticket of tickets.slice(1))await assert.rejects(service.updateTicket(ticket.Id,input(ticket)));
  calls=[];await assert.rejects(service.updateTickets([1,2],{kind:'assign',userId:10}));assert.deepEqual(calls,[]);
  await assert.rejects(service.updateTicket(1,{...input(tickets[0]),title:'Changed content'}),/Only tickets assigned/);
  assert.equal(isAgentCreatedTicket(tickets[0],service),true);
  assert.equal(isAgentCreatedTicket(tickets[1],service),false);
  console.log('Agent-created assignment passed: single and bulk assignment, creator-only access, mixed-batch rejection and edit restrictions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
