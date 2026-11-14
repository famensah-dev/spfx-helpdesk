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
  require: name => {assert.equal(name, '@microsoft/sp-http'); return {AadHttpClient: {configurations: {v1: {}}}};}
});
const {LaravelTicketService} = exportsObject;
const session = {access: {admin: false, role: 'requester', email: 'me@example.com', entra_object_id: 'test-user'}, roleRules: {actions: ['tickets', 'create']}, title: 'IT'};

async function fixture(handler) {
  const requests = [];
  const context = {aadHttpClientFactory: {getClient: async resource => {
    assert.equal(resource, 'api://test');
    return {fetch: async (url, config, options) => {
      requests.push({url, ...options});
      const value = url.endsWith('/session') ? session : await handler(url, options);
      return {ok: value?.failure !== true, status: value?.failure ? 403 : 200, json: async () => value};
    }};
  }}};
  const service = await LaravelTicketService.create(context, 'https://api.example/api/v1', 'api://test');
  return {service, requests};
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
