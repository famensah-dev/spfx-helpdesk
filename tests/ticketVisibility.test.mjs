import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(module.exports, name => {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  }, module);
  return module.exports;
}
const roles = load('../src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');


const {ticketInScope,applyAppRoleRules}=load('../src/webparts/helpdeskSystem/services/appRoleRules.ts',{'../interfaces/IRoleManagement':load('../src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts')});
const tickets=[
{Id:1,Status:'New',AssignedTo:{Id:7}},
{Id:2,Status:'New',CreatedBy:{Id:7},AssignedTo:{Id:8}},
{Id:3,Status:'New',Requester:{Id:7},CreatedBy:{Id:8}},
{Id:4,Status:'In Progress'},
{Id:5,Status:'New'},
{Id:6,Status:'Resolved',AssignedTo:{Id:8}}
];
for(const [scope,expected] of [['assigned',[1]],['assignedOrCreated',[1,2]],['newUnassigned',[3,5]],['all',[1,2,3,4,5,6]]]){
 test(scope+' filters lists and direct comment access',async()=>{
 const role={id:'agent',name:'Agent',scope,actions:['tickets','comment']};
 const config=roles.defaultRoleConfiguration();config.roles[0]=role;roles.validateRoleConfiguration(config);
 assert.deepEqual(tickets.filter(ticket=>ticketInScope(ticket,role,7,'me@example.com')).map(ticket=>ticket.Id),expected);
 const service=applyAppRoleRules({getTickets:async()=>({tickets}),getComments:async()=>[]},role,7,'me@example.com');
 assert.deepEqual((await service.getTickets()).tickets.map(ticket=>ticket.Id),expected);
 for(const ticket of tickets)if(expected.includes(ticket.Id))await service.getComments(ticket.Id);else await assert.rejects(service.getComments(ticket.Id),/outside/);
 });
}
test('assigned or created matches creator email and AAD identity, not requester',()=>{
 const role={id:'agent',scope:'assignedOrCreated'};
 assert(ticketInScope({CreatedBy:{Email:'ME@example.com'}},role,0,'me@example.com'));
 assert(ticketInScope({CreatedBy:{AadId:'ABC'}},role,0,'','abc'));
 assert(!ticketInScope({Requester:{Id:7}},role,7,''));
});
