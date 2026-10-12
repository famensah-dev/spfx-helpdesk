import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function load(relative) {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports: {}};
  new Function('exports', 'require', 'module', compiled)(module.exports, require, module);
  return module.exports;
}
const {GraphClient} = load('../src/services/GraphClient.ts');
const {GraphTicketService} = load('../src/services/GraphTicketService.ts');
const response = body => new Response(JSON.stringify(body), {status: 200, headers: {'Content-Type': 'application/json'}});

test('Default transport calls browser fetch with the global receiver', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (url, options) {
    assert.equal(this, globalThis);
    assert.equal(url, 'https://graph.microsoft.com/v1.0/me');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return response({id: 'current-user'});
  };
  try {
    const client = new GraphClient(async () => 'test-token');
    assert.deepEqual(await client.get('/me'), {id: 'current-user'});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Graph pagination follows next links and sends a token on each request', async () => {
  const urls = [];
  const client = new GraphClient(async () => 'test-token', async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    return urls.length === 1 ? response({value: [{id: 1}], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/page2'}) : response({value: [{id: 2}]});
  });
  assert.deepEqual(await client.getAll('/page1'), [{id: 1}, {id: 2}]);
  assert.equal(urls.length, 2);
});

test('Graph refuses foreign origins before acquiring or sending tokens', async () => {
  let tokenCalls = 0;
  const client = new GraphClient(async () => {tokenCalls++; return 'test-token';}, async () => {throw new Error('must not fetch');});
  await assert.rejects(client.get('https://attacker.example/v1.0/me'), /unexpected API address/);
  assert.equal(tokenCalls, 0);
});

test('Graph rejects malicious and repeated pagination links', async () => {
  const malicious = new GraphClient(async () => 'test-token', async () => response({value: [], '@odata.nextLink': 'https://attacker.example/v1.0/page2'}));
  await assert.rejects(malicious.getAll('/page1'), /unexpected API address/);
  const repeated = new GraphClient(async () => 'test-token', async () => response({value: [], '@odata.nextLink': '/page1'}));
  await assert.rejects(repeated.getAll('/page1'), /repeated pagination/);
});

test('Graph reports permission failures without inventing data', async () => {
  const client = new GraphClient(async () => 'test-token', async () => new Response(JSON.stringify({error: {message: 'Access denied'}}), {status: 403}));
  await assert.rejects(client.getAll('/items'), /403: Access denied.*selected-site read grant/);
});

const columns = [
  {name: 'Title', displayName: 'Title', text: {}},
  {name: 'State', displayName: 'Status', choice: {choices: ['New', 'Pending', 'Escalated', 'Closed']}},
  {name: 'Urgency', displayName: 'Priority', choice: {choices: ['Low', 'Medium', 'High', 'Critical']}},
  {name: 'Agent', displayName: 'AssignedTo', personOrGroup: {allowMultipleSelection: false}},
  {name: 'Area', displayName: 'Category', choice: {choices: ['IT']}},
  {name: 'Deadline', displayName: 'DueDate', dateTime: {}},
  {name: 'ResolvedAt', displayName: 'ResolvedAt', dateTime: {}},
  {name: 'Escalated', displayName: 'Escalated', boolean: {}}
];
const config = {siteUrl: 'https://example.sharepoint.com/sites/support', listName: 'Tickets'};
test('Single-ticket editing maps fields and preserves an unchanged rich description', async () => {
  const graph = fakeGraph({schema: [...columns, {name: 'Details', displayName: 'Issue description', text: {}}]});
  const writes = [];
  graph.patch = async (path, fields) => { writes.push({path, fields}); return fields; };
  const service = new GraphTicketService(graph, config);
  await service.updateTicket(7, {title: ' Updated subject ', status: 'New', priority: 'Critical', assignedToId: 12});
  assert.deepEqual(writes[0], {path: '/sites/site-id/lists/tickets-id/items/7/fields', fields: {Title: 'Updated subject', Urgency: 'Critical', State: 'New', AgentLookupId: '12'}});
  await service.updateTicket(7, {title: 'Updated', description: 'New description', status: 'Closed', priority: 'High', assignedToId: null});
  assert.equal(writes[1].fields.Details, 'New description');
  assert.equal(writes[1].fields.AgentLookupId, null);
  await assert.rejects(service.updateTicket(7, {title: '', status: 'New', priority: 'High', assignedToId: null}), /issue title/);
});

test('Comments are scoped by ticket list and ID and use the server author', async () => {
  const graph = fakeGraph();
  const originalGetAll = graph.getAll;
  graph.getAll = async path => {
    if (path.includes('/lists?')) return [...await originalGetAll(path), {id: 'comments-id', displayName: 'TicketComments'}];
    if (path.includes('/comments-id/columns')) return [{name: 'TicketKey', displayName: 'TicketKey', text: {}}, {name: 'Content', displayName: 'Content', text: {}}];
    if (path.includes('/comments-id/items')) {
      assert(decodeURIComponent(path).includes("fields/TicketKey eq 'tickets-id:7'"));
      return [{id: '1', createdDateTime: '2026-10-12T12:00:00Z', createdBy: {user: {displayName: 'Real Author'}}, fields: {TicketKey: 'tickets-id:7', Content: 'Please investigate'}}, {id: '2', fields: {TicketKey: 'another-list:7', Content: 'Do not show'}}];
    }
    return originalGetAll(path);
  };
  const writes = [];
  graph.post = async (path, body) => { writes.push({path, body}); return {id: '3'}; };
  const service = new GraphTicketService(graph, config);
  assert.deepEqual(await service.getComments(7), [{id: '1', text: 'Please investigate', author: 'Real Author', created: '2026-10-12T12:00:00Z'}]);
  await service.addComment(7, ' Update ');
  assert.deepEqual(writes, [{path: '/sites/site-id/lists/comments-id/items', body: {fields: {Title: 'Ticket #7', TicketKey: 'tickets-id:7', Content: 'Update'}}}]);
  await assert.rejects(service.addComment(7, ' '), /Enter a comment/);
  await assert.rejects(new GraphTicketService(fakeGraph(), config).getComments(7), /TicketComments list/);
});
test('Bulk updates preserve internal names, report partial failures and deduplicate IDs', async () => {
  const graph = fakeGraph({schema: [...columns, {name: 'IsArchived', displayName: 'Archived', boolean: {}}]});
  const writes = [];
  graph.patch = async (path, fields) => {
    writes.push({path, fields});
    if (path.includes('/9/')) throw new Error('Access denied');
    return fields;
  };
  const service = new GraphTicketService(graph, config);
  const result = await service.updateTickets([7, 9, 7], {kind: 'status', status: 'Closed'});
  assert.deepEqual(result, {succeeded: [7], failed: [{id: 9, message: 'Access denied'}]});
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], {path: '/sites/site-id/lists/tickets-id/items/7/fields', fields: {State: 'Closed'}});
  await service.updateTickets([7], {kind: 'archive'});
  assert.deepEqual(writes[2].fields, {IsArchived: true});
  await service.updateTickets([7], {kind: 'assign', userId: 12});
  assert.deepEqual(writes[3].fields, {AgentLookupId: '12'});
  await service.updateTickets([7], {kind: 'assign', userId: null});
  assert.deepEqual(writes[4].fields, {AgentLookupId: null});
  await assert.rejects(service.updateTickets([7], {kind: 'status', status: 'Completed'}), /Status choices/);
  await assert.rejects(new GraphTicketService(fakeGraph(), config).updateTickets([7], {kind: 'archive'}), /Archived Yes\/No/);
});
test('Ticket creation maps internal columns and rejects a missing description column', async () => {
  const graph = fakeGraph({schema: [...columns, {name: 'IssueDetails', displayName: 'Issue description', text: {}}]});
  const writes = [];
  graph.post = async (path, body) => { writes.push({path, body}); return {id: '8'}; };
  const service = new GraphTicketService(graph, config);
  await service.createTicket({title: ' VPN broken ', description: 'Cannot connect', priority: 'High'});
  assert.deepEqual(writes, [{path: '/sites/site-id/lists/tickets-id/items', body: {fields: {Title: 'VPN broken', State: 'New', Urgency: 'High', IssueDetails: 'Cannot connect'}}}]);
  await assert.rejects(service.createTicket({title: ' ', description: '', priority: 'High'}), /issue title/);
  const missing = new GraphTicketService(fakeGraph(), config);
  await assert.rejects(missing.createTicket({title: 'Issue', description: 'Keep this description', priority: 'High'}), /description text column/);
});

test('Graph creation uses POST once and explains missing write access', async () => {
  let calls = 0;
  const client = new GraphClient(async () => 'token', async (url, options) => {
    calls++;
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), {fields: {Title: 'Issue'}});
    return new Response('{}', {status: 403});
  });
  await assert.rejects(client.post('/sites/site/lists/list/items', {fields: {Title: 'Issue'}}), /read to write/);
  assert.equal(calls, 1);
  await assert.rejects(client.post('https://attacker.example/v1.0/items', {}), /unexpected API address/);
  assert.equal(calls, 1);
});
function fakeGraph({missingList = false, failPeople = false, invalidStatus = false, schema = columns} = {}) {
  return {
    get: async path => {assert(path.includes('example.sharepoint.com:/sites/support')); return {id: 'site-id'};},
    getAll: async path => {
      if (path.includes('/columns')) return schema;
      if (path.includes('/lists?')) return missingList ? [] : [{id: 'tickets-id', displayName: 'Tickets'}, {id: 'users-id', displayName: 'User Information List', webUrl: 'https://example.sharepoint.com/sites/support/_catalogs/users'}];
      if (path.includes('/users-id/items')) {
        if (failPeople) throw new Error('Access denied');
        return [{id: '12', fields: {Title: 'Support Agent', EMail: 'agent@example.com'}}];
      }
      assert(path.includes('AgentLookupId'));
      assert(path.includes('State'));
      return [{id: '7', createdDateTime: '2026-10-01T08:00:00Z', lastModifiedDateTime: '2026-10-02T08:00:00Z', fields: {Title: 'VPN issue', State: invalidStatus ? 'Invalid' : 'Pending', Urgency: 'High', AgentLookupId: '12', Area: 'IT', Escalated: true, Deadline: '2026-10-03T10:00:00Z'}}];
    }
  };
}

test('Tickets resolve real internal names, person identity and optional capabilities', async () => {
  const result = await new GraphTicketService(fakeGraph(), config).getTickets();
  assert.equal(result.tickets[0].Id, 7);
  assert.equal(result.tickets[0].AssignedTo.Email, 'agent@example.com');
  assert.equal(result.tickets[0].Status, 'Pending');
  assert.equal(result.tickets[0].Category, 'IT');
  assert.equal(result.tickets[0].Created, '2026-10-01T08:00:00Z');
  assert.equal(result.hasPending, true);
  assert.equal(result.hasEscalated, true);
  assert.equal(result.hasResolvedAt, true);
  assert.equal(result.isMockData, false);
  assert.equal(result.assignmentIdentityAvailable, true);
});

test('Unavailable person identities produce an explicit warning and disable My Board', async () => {
  const result = await new GraphTicketService(fakeGraph({failPeople: true}), config).getTickets();
  assert.equal(result.tickets.length, 1);
  assert.equal(result.tickets[0].AssignedTo.Id, 12);
  assert.equal(result.assignmentIdentityAvailable, false);
  assert.equal(result.warnings.length, 1);
});

test('Missing lists, invalid choices and multi-person schema fail explicitly', async () => {
  await assert.rejects(new GraphTicketService(fakeGraph({missingList: true}), config).getTickets(), /list was not found/);
  await assert.rejects(new GraphTicketService(fakeGraph({invalidStatus: true}), config).getTickets(), /unsupported status/);
  const multiple = columns.map(column => column.name === 'Agent' ? {...column, personOrGroup: {allowMultipleSelection: true}} : column);
  await assert.rejects(new GraphTicketService(fakeGraph({schema: multiple}), config).getTickets(), /single person/);
});

test('Missing optional columns preserve ticket retrieval and show unavailable metrics', async () => {
  const result = await new GraphTicketService(fakeGraph({schema: columns.slice(0, 4)}), config).getTickets();
  assert.equal(result.hasCategory, false);
  assert.equal(result.hasDueDate, false);
  assert.equal(result.hasResolvedAt, false);
  assert.equal(result.tickets[0].ResolvedAt, null);
});

test('Existing issue lists support Issue and Assigned To display names', async () => {
  const schema = columns.map(column => column.name === 'Title'
    ? {...column, displayName: 'Issue'}
    : column.name === 'Agent' ? {...column, displayName: 'Assigned To'} : column);
  const result = await new GraphTicketService(fakeGraph({schema}), config).getTickets();
  assert.equal(result.tickets[0].Title, 'VPN issue');
  assert.equal(result.tickets[0].AssignedTo.Email, 'agent@example.com');
});
