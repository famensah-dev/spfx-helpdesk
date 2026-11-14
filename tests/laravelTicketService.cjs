const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const compiled = ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/LaravelTicketService.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
}).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, {
  exports: exportsObject, URL,
  require: name => {
    if(name==='../interfaces/IRoleManagement'){
      const exports={};
      const source=ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
      vm.runInNewContext(source,{exports});return exports;
    }
    assert.equal(name, '@microsoft/sp-http'); return {AadHttpClient: {configurations: {v1: {}}}};
  }
});
const {LaravelTicketService} = exportsObject;
const session = {access: {admin: false, role: 'requester', email: 'me@example.com', entra_object_id: 'test-user'}, roleRules: {actions: ['tickets', 'create']}, title: 'IT'};

async function fixture(handler, sessionOverride = {}) {
  const requests = [];
  const context = {aadHttpClientFactory: {getClient: async resource => {
    assert.equal(resource, 'api://test');
    return {fetch: async (url, config, options) => {
      requests.push({url, ...options});
      const value = url.endsWith('/session') ? {...session,...sessionOverride} : await handler(url, options);
      return {ok: value?.failure !== true, status: value?.failure ? 403 : 200, json: async () => value};
    }};
  }}};
  const service = await LaravelTicketService.create(context, 'https://api.example/api/v1', 'api://test');
  return {service, requests, context};
}

test('all scoped pages are loaded from the API', async () => {
  const {service} = await fixture(url => url.endsWith('after=0') ? {tickets: [{Id: 3}], next: 3} : {tickets: [{Id: 9}], next: null});
  assert.deepEqual(JSON.parse(JSON.stringify((await service.getTickets()).tickets)), [{Id: 3}, {Id: 9}]);
});

test('API authorization failures propagate and bulk results preserve failures', async () => {
  const {service} = await fixture(() => ({failure: true, message: 'Access denied by server'}));
  await assert.rejects(service.getTickets(), /Access denied by server/);
  const result = await service.updateTickets([7], {kind: 'priority', priority: 'High'});
  assert.equal(result.succeeded.length, 0);
  assert.equal(result.failed[0].id, 7);
});

test('requester fields are never forwarded and unsupported uploads fail before creation', async () => {
  const {service, requests} = await fixture(() => ({}));
  await service.createTicket({title: 'Test', description: 'Help', priority: 'Low', requesterEmail: 'spoof@example.com', requesterName: 'Spoof'});
  const body = JSON.parse(requests.at(-1).body);
  assert.equal(body.requesterEmail, undefined);
  assert.equal(body.requesterName, undefined);
  const count = requests.length;
  await assert.rejects(service.createTicket({title: 'Test', description: 'Help', priority: 'Low', attachments: [{}]}), /Attachments/);
  assert.equal(requests.length, count);
});

test('invalid API configuration fails before obtaining a token', async () => {
  await assert.rejects(LaravelTicketService.create({}, 'http://api.example', 'api://test'), /HTTPS/);
  await assert.rejects(LaravelTicketService.create({}, 'https://api.example', ''), /resource/);
});

test('unsupported edits are rejected before any API write', async () => {
  const {service, requests} = await fixture(() => ({}));
  const count = requests.length;
  await assert.rejects(service.updateTicket(1, {title: 'Test', priority: 'Low', status: 'New', assignedToId: null, department: 'IT'}), /not available/);
  assert.equal(requests.length, count);
});

test('user management uses the users API contract', async () => {
  const user = {entra_object_id: 'test-user', name: 'Test User', email: 'test@example.com', role: 'agent', enabled: true};
  const {service, requests} = await fixture(() => [user]);
  const users = await service.listUsers();
  assert.equal(service.access.oid, session.access.entra_object_id);
  assert.equal(users[0].email, user.email);
  assert.equal(requests.at(-1).url, 'https://api.example/api/v1/users');
  await service.saveUser(user);
  assert.equal(requests.at(-1).method, 'POST');
  assert.equal(requests.at(-1).url, 'https://api.example/api/v1/users');
  assert.deepEqual(JSON.parse(requests.at(-1).body), user);
});

test('department and lookup IDs are sent on creation without requester authority', async () => {
  const {service, requests} = await fixture(() => ({}));
  await service.createTicket({title:'Help',description:'',priority:'Low',department:'4',category:'8',subcategory:'9',issueType:'10',requesterEmail:'spoof@example.com'});
  const body = JSON.parse(requests.at(-1).body);
  assert.equal(body.departmentId,4);
  assert.equal(body.category,'8');
  assert.equal(body.subcategory,'9');
  assert.equal(body.issueType,'10');
  assert.equal(body.requesterEmail,undefined);
  await service.updateTicket(1,{title:'Help',priority:'Low',status:'New',assignedToId:null,category:'',subcategory:''});
  assert.equal(JSON.parse(requests.at(-1).body).category,null);
  assert.equal(JSON.parse(requests.at(-1).body).subcategory,null);
});

test('department permission settings are saved to the department API', async () => {
  const {service, requests} = await fixture(() => ({}));
  const settings = {member_ids:[3,7],entra_group_ids:['group-id']};
  await service.saveDepartment(4,settings);
  assert.equal(requests.at(-1).url,'https://api.example/api/v1/departments/4');
  assert.equal(requests.at(-1).method,'PATCH');
  assert.deepEqual(JSON.parse(requests.at(-1).body),settings);
});

const departmentSettings = {
  roles:{agent:{name:'Agent',scope:'assignedOrCreated',actions:['tickets','create','comment']},admin:{name:'Helpdesk Admin',scope:'all',actions:['tickets','create','classifications']}},
  members:[{id:9,name:'Agent',email:'agent@example.com',role:'agent',enabled:true},{id:1,name:'Owner',email:'owner@example.com',role:'superAdmin',enabled:true}],entra_group_ids:[]
};
const scopedSession = {departments:[{id:4,name:'IT'}]};

test('existing Users and Roles page receives its original contract and saves department rules',async()=>{
  const {service,requests}=await fixture(()=>departmentSettings,scopedSession);
  const configuration=await service.roleManagement.load();
  assert.equal(configuration.roles.find(role=>role.id==='admin').name,'Administrator','Previously saved role names must display as Admin');
  assert.equal(configuration.assignments.length,1);
  assert.equal(configuration.assignments[0].userId,9);
  assert.equal(configuration.assignments[0].department,'IT');
  configuration.roles.find(role=>role.id==='agent').scope='all';
  await service.roleManagement.save(configuration);
  assert.equal(requests.at(-1).method,'PATCH');
  assert.equal(requests.at(-1).url,'https://api.example/api/v1/departments/4');
  assert.equal(JSON.parse(requests.at(-1).body).roles.agent.scope,'all');
});

test('existing user table saves assignments through owner-controlled backend endpoint',async()=>{
  const {service,requests}=await fixture(()=>departmentSettings,scopedSession);
  const configuration=await service.roleManagement.load();
  configuration.assignments[0].disabled=true;
  await service.roleManagement.save(configuration);
  assert.equal(requests.at(-1).method,'PUT');
  assert.equal(requests.at(-1).url,'https://api.example/api/v1/departments/4/assignments');
  assert.equal(JSON.parse(requests.at(-1).body).assignments[0].disabled,true);
});

test('classification table receives title, sort order and editable metadata without a fake SharePoint link',async()=>{
  const {service,requests}=await fixture(()=>[{id:8,name:'Computers',active:true,sort_order:3,department_ids:[4],can_edit:true}],scopedSession);
  const data=await service.administration.getData('categories');
  assert.equal(data.entries[0].title,'Computers');
  assert.equal(data.entries[0].sortOrder,3);
  assert.equal(data.listUrl,undefined);
  await service.administration.saveEntry('categories',{title:'Devices',active:false,sortOrder:5},8);
  const body=JSON.parse(requests.at(-1).body);
  assert.equal(body.name,'Devices');assert.equal(body.active,false);assert.equal(body.sort_order,5);
  assert.equal(body.department_ids,undefined);
});

test('ticket type source and due date are passed through instead of being hidden or discarded',async()=>{
  const {service,requests}=await fixture(()=>({}));
  await service.createTicket({title:'Help',description:'',priority:'Low',ticketType:'Incident',ticketSource:'Phone / Call-in',dueDate:'2026-12-01'});
  const body=JSON.parse(requests.at(-1).body);
  assert.equal(body.ticketType,'Incident');assert.equal(body.ticketSource,'Phone / Call-in');assert.equal(body.dueDate,'2026-12-01');
});

test('tenant group picker uses read-only Graph queries and escapes search input',async()=>{
  const {service,context,requests}=await fixture(()=>({}),{access:{...session.access,superAdmin:true}});
  const calls=[];
  const group={id:'11111111-1111-4111-8111-111111111111',displayName:"Nurses' group",mail:'nurses@example.com'};
  let failure;
  context.msGraphClientFactory={getClient:async()=>({api(path){calls.push(['path',path]);const query={select(value){calls.push(['select',value]);return query;},filter(value){calls.push(['filter',value]);return query;},top(value){calls.push(['top',value]);return query;},async get(){if(failure)throw failure;return path==='/groups'?{value:[group]}:group;}};return query;}})};
  const groups=await service.searchDirectoryGroups("Nurses'");
  assert.equal(groups[0].displayName,"Nurses' group");
  assert(calls.some(([key,value])=>key==='filter' && value.includes("Nurses''")));
  assert.equal((await service.getDirectoryGroup(group.id)).displayName,group.displayName);
  await assert.rejects(()=>service.getDirectoryGroup('../users'),/Invalid group identifier/);
  failure={statusCode:403};
  await assert.rejects(()=>service.searchDirectoryGroups('Nurses'),/Group.ReadBasic.All approval/);
  service.access.superAdmin=false;
  const before=calls.length;
  await assert.rejects(()=>service.searchDirectoryGroups('Nurses'),/Only Super Admins/);
  assert.equal(calls.length,before);
  assert.equal(requests.length,1,'Directory browsing must not write assignments or department mappings');
});
