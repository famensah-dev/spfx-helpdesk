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
  const localRequire = name => name.endsWith('/ticketAttachments') ? load('../../src/webparts/helpdeskSystem/utils/ticketAttachments.ts') : name.endsWith('/GraphClassificationService') ? load('../src/services/GraphClassificationService.ts') : require(name);
  new Function('exports', 'require', 'module', compiled)(module.exports, localRequire, module);
  return module.exports;
}
const {GraphClient} = load('../src/services/GraphClient.ts');
const {GraphTicketService} = load('../src/services/GraphTicketService.ts');
const {loadClassification} = load('../src/services/GraphClassificationService.ts');
test('Issue Type takes precedence over legacy Issue / Request and saves its actual internal name', async () => {
  const graph = fakeGraph({schema: [...columns,
    {name: 'OldRequest', displayName: 'Issue / Request', text: {}},
    {name: 'field_6', displayName: 'Issue Type', text: {}}
  ]});
  const writes = [];
  graph.post = async (path, body) => { writes.push(body.fields); return {id: '42'}; };
  graph.patch = async (path, fields) => writes.push(fields);
  const service = new GraphTicketService(graph, config);
  const options = await service.getCreationOptions();
  assert.equal(options.fields.find(field => field.key === 'issueType').label, 'Issue Type');
  await service.createTicket({title: 'Issue', description: '', priority: 'High', issueType: '3'});
  await service.updateTicket(7, {title: 'Issue', priority: 'High', status: 'New', assignedToId: null, issueType: '3'});
  assert.equal(writes[0].field_6, 'Email issue');
  assert.equal(writes[1].field_6, 'Email issue');
  assert.equal(writes[0].OldRequest, undefined);
  assert.equal(writes[1].OldRequest, undefined);
});
test('Classification lists validate lookup targets and omit inactive categories and subcategories while retaining independent issue types', async () => {
  const graph = fakeGraph();
  const lists = await graph.getAll('/lists?');
  const taxonomy = await loadClassification(graph, '/sites/site-id', lists);
  assert.deepEqual(taxonomy.subcategories, [{id: '2', name: 'Outlook', parentId: '1'}]);
  const original = graph.getAll;
  graph.getAll = async path => {
    const values = await original(path);
    if (path.includes('/cat-id/items')) return values.map(item => ({...item, fields: {...item.fields, Active: false}}));
    return values;
  };
  const inactive = await loadClassification(graph, '/sites/site-id', lists);
  assert.equal(inactive.categories.length, 0);
  assert.equal(inactive.subcategories.length, 0);
  assert.equal(inactive.issueTypes.length, 1);
  graph.getAll = async path => {
    const values = await original(path);
    if (path.includes('/sub-id/columns')) return values.map(item => item.lookup ? {...item, lookup: {listId: 'wrong-list'}} : item);
    return values;
  };
  await assert.rejects(loadClassification(graph, '/sites/site-id', lists), /correct parent list/);
});
test('Classification lookup ticket columns save numeric source IDs on creation and editing', async () => {
  const graph = fakeGraph({schema: columns.map(column => column.name === 'Area' ? {name: 'Area', displayName: 'Issue Category', lookup: {listId: 'cat-id'}} : column).concat([
    {name: 'Sub', displayName: 'Issue Subcategory', lookup: {listId: 'sub-id'}},
    {name: 'Request', displayName: 'Issue Type', lookup: {listId: 'type-id'}}
  ])});
  const writes = [];
  graph.post = async (path, body) => { writes.push(body.fields); return {id: '10'}; };
  graph.patch = async (path, fields) => writes.push(fields);
  const service = new GraphTicketService(graph, config);
  await service.createTicket({title: 'Issue', description: '', priority: 'High', category: '1', subcategory: '2', issueType: '3'});
  assert.equal(writes[0].AreaLookupId, '1');
  assert.equal(writes[0].SubLookupId, '2');
  assert.equal(writes[0].RequestLookupId, '3');
  await service.updateTicket(7, {title: 'Issue', priority: 'High', status: 'New', assignedToId: null, category: '1', subcategory: '2', issueType: '3'});
  assert.equal(writes[1].RequestLookupId, '3');
  await assert.rejects(service.createTicket({title: 'Issue', description: '', priority: 'High', category: '1', subcategory: '999'}), /active classification/);
  assert.equal(writes.length, 2);
});
const {GraphFaqService} = load('../src/services/GraphFaqService.ts');
test('FAQ Active Yes/No column supports reads, saves and bulk changes', async () => {
  const graph = faqGraph();
  const original = graph.getAll;
  graph.getAll = async path => {
    const values = await original(path);
    if (path.includes('/columns')) return values.map(column => column.name === 'field_4' ? {...column, name: 'Active', displayName: 'Active'} : column);
    if (path.includes('/items')) return values.map(item => ({...item, fields: {...item.fields, Active: item.fields.field_4}}));
    return values;
  };
  const service = new GraphFaqService(graph, {siteId: 'site', siteUrl: 'https://example.sharepoint.com/sites/support'});
  assert.deepEqual((await service.getFaqs()).map(faq => faq.id), [2]);
  service.getAccess = async () => ({canManage: true});
  await service.save({question: 'Question', answer: 'Answer', category: 'Accounts', keywords: '', published: true, sortOrder: 0});
  assert.equal(graph.writes[0].body.fields.Active, true);
  await service.updateMany([2], {kind: 'publish', published: false});
  assert.deepEqual(graph.writes[1].body, {Active: false});
});
test('FAQ bulk publication, ordering and deletion only update the requested fields and report partial failures', async () => {
  const graph = faqGraph();
  const service = new GraphFaqService(graph, {siteId: 'site', siteUrl: 'https://example.sharepoint.com/sites/support'});
  service.getAccess = async () => ({canManage: true});
  await service.updateMany([2, 1, 2], {kind: 'publish', published: false});
  assert.deepEqual(graph.writes.map(write => write.body), [{field_4: false}, {field_4: false}]);
  graph.writes.length = 0;
  await service.updateMany([2, 1], {kind: 'sort'});
  assert.deepEqual(graph.writes.map(write => write.body), [{field_5: 1}, {field_5: 2}]);
  assert.match(graph.writes[0].path, /items\/2\/fields$/);
  graph.delete = async path => { if (path.endsWith('/1')) throw new Error('Denied'); };
  assert.deepEqual(await service.updateMany([2, 1], {kind: 'delete'}), {succeeded: [2], failed: [{id: 1, message: 'Denied'}]});
  await assert.rejects(service.updateMany([-1], {kind: 'delete'}), /Invalid FAQ/);
  service.getAccess = async () => ({canManage: false});
  await assert.rejects(service.updateMany([2], {kind: 'publish', published: true}), /cannot manage/);
});
test('FAQ Question ignores read-only LinkTitle and saves the writable Title column', async () => {
  const graph = faqGraph();
  const original = graph.getAll;
  graph.getAll = async path => path.includes('/columns') ? [{name: 'LinkTitle', displayName: 'Question', readOnly: true}, ...(await original(path))] : original(path);
  const service = new GraphFaqService(graph, {siteId: 'site', siteUrl: 'https://example.sharepoint.com/sites/support'});
  assert.equal((await service.getFaqs())[0].question, 'Published');
  service.getAccess = async () => ({canManage: true});
  await service.save({question: 'Question', answer: 'Answer', category: 'Accounts', keywords: '', published: true, sortOrder: 0});
  assert.equal(graph.writes[0].body.fields.Title, 'Question');
  assert.equal(graph.writes[0].body.fields.LinkTitle, undefined);
});
function faqGraph() {
  const writes = [];
  return {
    writes,
    getAll: async path => path.includes('/columns') ? [
      {name: 'Title', displayName: 'Question', text: {}}, {name: 'field_1', displayName: 'Answer', text: {}},
      {name: 'field_2', displayName: 'Category', choice: {choices: ['Accounts', 'Devices']}},
      {name: 'field_3', displayName: 'Keywords', text: {}}, {name: 'field_4', displayName: 'Published', boolean: {}},
      {name: 'field_5', displayName: 'Sort Order', number: {}}
    ] : path.includes('/items') ? [
      {id: '1', lastModifiedDateTime: '2026-10-14T12:00:00Z', fields: {Title: 'Draft', field_1: 'Draft answer', field_4: false}},
      {id: '2', lastModifiedDateTime: '2026-10-14T12:00:00Z', fields: {Title: 'Published', field_1: '<p>Answer</p>', field_2: 'Accounts', field_3: 'password', field_4: true, field_5: 3}}
    ] : [{id: 'faq-guid', displayName: 'FAQs'}],
    post: async (path, body) => writes.push({method: 'POST', path, body}),
    patch: async (path, body) => writes.push({method: 'PATCH', path, body}),
    delete: async path => writes.push({method: 'DELETE', path})
  };
}
test('FAQ Question, IsPublished and parent-linked classification lookups map to actual fields', async () => {
  const graph = faqGraph();
  const original = graph.getAll;
  graph.getAll = async path => {
    if (path.includes('/category-source/columns')) return [{name: 'Title', text: {}}, {name: 'Active', boolean: {}}];
    if (path.includes('/subcategory-source/columns')) return [{name: 'Title', text: {}}, {name: 'Active', boolean: {}}, {name: 'Parent', displayName: 'Category', lookup: {listId: 'category-source'}}];
    if (path.includes('/category-source/items')) return [{id: '10', fields: {Title: 'IT', Active: true}}];
    if (path.includes('/subcategory-source/items')) return [{id: '20', fields: {Title: 'Outlook', ParentLookupId: '10', Active: true}}];
    const result = await original(path);
    if (path.includes('/columns')) return result.map(column => column.name === 'Title' ? {...column, displayName: 'Title'} : column.name === 'field_2' ? {...column, choice: undefined, lookup: {listId: 'category-source'}} : column.name === 'field_4' ? {...column, displayName: 'IsPublished'} : column).concat([{name: 'QuestionText', displayName: 'Question', text: {}}, {name: 'Sub', displayName: 'Subcategory', lookup: {listId: 'subcategory-source'}}]);
    if (path.includes('/items')) return [{id: '1', fields: {QuestionText: 'Question', field_1: 'Answer', field_2LookupId: '10', SubLookupId: '20', field_4: true}}];
    return result;
  };
  const service = new GraphFaqService(graph, {siteId: 'site', siteUrl: 'https://example.sharepoint.com/sites/support'});
  const faqs = await service.getFaqs();
  assert.equal(faqs[0].question, 'Question');
  assert.equal(faqs[0].category, 'IT');
  assert.equal(faqs[0].subcategory, 'Outlook');
  service.getAccess = async () => ({canManage: true});
  await service.save({...faqs[0], published: false});
  assert.equal(graph.writes[0].body.fields.QuestionText, 'Question');
  assert.equal(graph.writes[0].body.fields.field_2LookupId, '10');
  assert.equal(graph.writes[0].body.fields.SubLookupId, '20');
  assert.equal(graph.writes[0].body.fields.field_4, false);
  assert.equal(graph.writes[0].body.fields.field_2, undefined);
  await assert.rejects(service.save({...faqs[0], categoryId: ''}), /belonging/);
});
test('FAQs map actual columns, hide drafts from readers, and protect management operations', async () => {
  const graph = faqGraph();
  const service = new GraphFaqService(graph, {siteId: 'site-id', siteUrl: 'https://example.sharepoint.com/sites/support'});
  assert.deepEqual((await service.getFaqs()).map(faq => faq.id), [2]);
  await assert.rejects(service.getFaqs(true), /cannot manage/);
  service.getAccess = async () => ({canManage: true});
  assert.equal((await service.getFaqs(true)).length, 2);
  const input = {question: ' New question ', answer: '<p>Formatted answer</p>', category: 'Accounts', keywords: 'login', published: false, sortOrder: 1};
  await service.save(input);
  assert.deepEqual(graph.writes[0].body.fields, {Title: 'New question', field_1: '<p>Formatted answer</p>', field_2: 'Accounts', field_3: 'login', field_4: false, field_5: 1});
  await service.save({...input, published: true}, 2);
  assert.match(graph.writes[1].path, /items\/2\/fields$/);
  await service.delete(2);
  assert.equal(graph.writes[2].method, 'DELETE');
  await assert.rejects(service.save({...input, question: ''}), /question/);
  await assert.rejects(service.save({...input, category: 'Unknown'}), /configured/);
  await assert.rejects(service.delete(-1), /Invalid FAQ/);
  service.getAccess = async () => ({canManage: false});
  await assert.rejects(service.save(input), /cannot manage/);
  await assert.rejects(service.delete(2), /cannot manage/);
  assert.equal(graph.writes.length, 3);
});
test('FAQ management uses SharePoint list add/edit/delete permissions', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(url, /lists\(guid'faq-guid'\)\/EffectiveBasePermissions$/);
      assert.equal(options.headers.Authorization, 'Bearer sharepoint-token');
      return response({Low: '14', High: '0'});
    };
    const service = new GraphFaqService(faqGraph(), {siteId: 'site-id', siteUrl: 'https://example.sharepoint.com/sites/support'}, async () => 'sharepoint-token');
    assert.equal((await service.getAccess()).canManage, true);
    globalThis.fetch = async () => response({Low: '2', High: '0'});
    assert.equal((await service.getAccess(true)).canManage, false);
  } finally { globalThis.fetch = originalFetch; }
});
test('Graph deletion accepts 204 without parsing an empty response', async () => {
  const client = new GraphClient(async () => 'token', async (url, options) => {
    assert.equal(options.method, 'DELETE');
    assert.equal(options.body, undefined);
    return new Response(null, {status: 204});
  });
  await client.delete('/sites/site/lists/faqs/items/2');
});
const { classificationChoices } = load('../../src/webparts/helpdeskSystem/utils/ticketClassification.ts');
const { validateTicketAttachments } = load('../../src/webparts/helpdeskSystem/utils/ticketAttachments.ts');
test('Attachments enforce file count, supported extensions, size, and unique names', () => {
  validateTicketAttachments(['pdf', 'doc', 'docx', 'mp4', 'jpeg', 'jpg', 'webp', 'png'].map(ext => ({name: `file.${ext}`, size: 5 * 1024 * 1024})));
  assert.throws(() => validateTicketAttachments([{name: 'large.pdf', size: 5 * 1024 * 1024 + 1}]), /5 MB/);
  assert.throws(() => validateTicketAttachments([{name: 'file.exe', size: 1}]), /use PDF/);
  assert.throws(() => validateTicketAttachments(Array.from({length: 11}, (_, i) => ({name: `${i}.png`, size: 1}))), /10 files/);
  assert.throws(() => validateTicketAttachments([{name: 'FILE.pdf', size: 1}, {name: 'file.PDF', size: 1}]), /already/);
});
test('Attachment uploads send file bytes to the ticket and skip already uploaded names on retry', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({url, options});
    assert.equal(options.headers.Authorization, 'Bearer sharepoint-token');
    return options.method === 'POST' ? response({}) : response({value: [{FileName: 'done.pdf'}]});
  };
  try {
    const service = new GraphTicketService({}, {siteUrl: 'https://example.sharepoint.com/sites/support'}, undefined, async () => 'sharepoint-token');
    service.context = {listId: 'list-guid'};
    const file = new File(['content'], "new's.pdf", {type: 'application/pdf'});
    await service.uploadAttachments(42, [new File(['done'], 'done.pdf'), file]);
    assert.equal(calls.length, 2);
    assert.match(calls[1].url, /items\(42\)\/AttachmentFiles\/add/);
    assert.equal(calls[1].options.body, file);
    assert.match(calls[1].url, /new%27%27s.pdf/);
  } finally { globalThis.fetch = originalFetch; }
});
test('Upload failure after creation reports the existing ticket ID for a safe retry', async () => {
  const graph = fakeGraph();
  let creates = 0;
  graph.post = async () => { creates++; return {id: '42'}; };
  const service = new GraphTicketService(graph, config, undefined, async () => 'token');
  service.uploadAttachments = async () => { throw new Error('Upload denied'); };
  await assert.rejects(service.createTicket({title: 'Issue', description: '', priority: 'High', attachments: [new File(['file'], 'file.pdf')]}), error => error.createdTicketId === 42 && /was created/.test(error.message));
  assert.equal(creates, 1);
});
test('Classification children follow their parents and stay within configured list choices', () => {
  assert.deepEqual(classificationChoices('subcategory', ['Printer', 'Outlook', 'Scanner'], 'Hardware & Devices', ''), ['Printer', 'Scanner']);
  assert.deepEqual(classificationChoices('subcategory', ['Printer'], '', ''), []);
  assert.deepEqual(classificationChoices('issueType', ['Password Reset', 'Printing Failure', 'Malfunction / Fault'], 'Hardware & Devices', 'Printer'), ['Printing Failure', 'Malfunction / Fault']);
  assert.deepEqual(classificationChoices('issueType', ['Password Reset', 'Printing Failure'], 'Clinical Systems', 'HealthPro'), ['Password Reset']);
  assert.deepEqual(classificationChoices('issueType', ['Password Reset'], 'Clinical Systems', ''), []);
});
const response = body => new Response(JSON.stringify(body), {status: 200, headers: {'Content-Type': 'application/json'}});
test('Assignment and removal save the matching workflow status in the same update', async () => {
  const writes = [];
  const service = new GraphTicketService({ patch: async (path, fields) => writes.push({ path, fields }) }, {});
  service.updateSchema = { path: '/sites/site/lists/tickets', status: 'Status', choices: ['New', 'Assigned'], assigned: 'Owner' };
  await service.updateTickets([1], { kind: 'assign', userId: 42 });
  await service.updateTickets([1], { kind: 'assign', userId: null });
  assert.deepEqual(writes.map(write => write.fields), [{ OwnerLookupId: '42', Status: 'Assigned' }, { OwnerLookupId: null, Status: 'New' }]);
  service.updateSchema.choices = ['New'];
  await assert.rejects(service.updateTickets([1], { kind: 'assign', userId: 42 }), /Add Assigned/);
  assert.equal(writes.length, 2);
});

test('Organization search escapes filters and uses directory identities independently of tickets', async () => {
  let requested;
  const service = new GraphTicketService({}, {}, { get: async path => {
    requested = new URL(`https://graph.microsoft.com/v1.0${path}`);
    return { value: [{ id: 'entra-guid', displayName: "O'Neil", mail: 'oneil@example.com', userPrincipalName: 'oneil@example.com', department: 'IT' }] };
  } });
  assert.deepEqual(await service.searchUsers('a'), []);
  assert.equal(requested, undefined);
  const users = await service.searchUsers("O'Neil", 'IT');
  assert.match(requested.searchParams.get('$filter'), /O''Neil/);
  assert.match(requested.searchParams.get('$filter'), /department eq 'IT'/);
  assert.equal(requested.searchParams.get('$top'), '50');
  assert.equal(users[0].id, 'entra-guid');
  assert.equal(users[0].department, 'IT');
  assert.equal(users[0].Id, undefined);
});

test('Assignment resolves a directory user to a SharePoint numeric lookup ID using a SharePoint token', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://example.sharepoint.com/sites/helpdesk/_api/web/ensureuser');
    assert.equal(options.headers.Authorization, 'Bearer sharepoint-token');
    assert.equal(JSON.parse(options.body).logonName, 'i:0#.f|membership|person@example.com');
    return response({ Id: 42, Title: 'Person', Email: 'person@example.com' });
  };
  try {
    const service = new GraphTicketService({}, { siteUrl: 'https://example.sharepoint.com/sites/helpdesk' }, {}, async () => 'sharepoint-token');
    const user = { id: 'entra-guid', displayName: 'Person', email: 'person@example.com', userPrincipalName: 'person@example.com' };
    assert.deepEqual(await service.resolveUser(user), { Id: 42, Title: 'Person', Email: 'person@example.com' });
    globalThis.fetch = async () => new Response('', { status: 403 });
    await assert.rejects(service.resolveUser(user), /Unable to resolve.*403/);
    globalThis.fetch = async () => response({ Id: 'entra-guid' });
    await assert.rejects(service.resolveUser(user), /valid person ID/);
  } finally { globalThis.fetch = originalFetch; }
});

test('Issue history targets the configured list and sorts real version metadata newest first', async () => {
  const paths = [];
  const service = new GraphTicketService({ getAll: async path => {
    paths.push(path);
    return [
      { id: '1.0', lastModifiedDateTime: '2026-10-01T10:00:00Z', lastModifiedBy: { user: { displayName: 'Requester' } } },
      { id: '2.0', lastModifiedDateTime: '2026-10-02T10:00:00Z', lastModifiedBy: { application: { displayName: 'Workflow' } } }
    ];
  } }, {});
  service.context = { sitePath: '/sites/site-id', listId: 'issue-list', lists: [] };
  assert.deepEqual(await service.getHistory(42), [
    { id: '2.0', modified: '2026-10-02T10:00:00Z', author: 'Workflow' },
    { id: '1.0', modified: '2026-10-01T10:00:00Z', author: 'Requester' }
  ]);
  assert.deepEqual(paths, ['/sites/site-id/lists/issue-list/items/42/versions']);
  await assert.rejects(service.getHistory(-1), /Invalid ticket ID/);
  assert.equal(paths.length, 1);
});

test('Issue history propagates permission failures instead of returning an empty timeline', async () => {
  const service = new GraphTicketService({ getAll: async () => { throw new Error('403: Access denied'); } }, {});
  service.context = { sitePath: '/sites/site-id', listId: 'issue-list', lists: [] };
  await assert.rejects(service.getHistory(42), /403: Access denied/);
});

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
  {name: 'State', displayName: 'Status', choice: {choices: ['New', 'Assigned', 'Pending', 'Escalated', 'Closed']}},
  {name: 'Urgency', displayName: 'Priority', choice: {choices: ['Low', 'Medium', 'High', 'Critical']}},
  {name: 'Agent', displayName: 'AssignedTo', personOrGroup: {allowMultipleSelection: false}},
  {name: 'Area', displayName: 'Category', choice: {choices: ['IT']}},
  {name: 'Deadline', displayName: 'DueDate', dateTime: {}},
  {name: 'ResolvedAt', displayName: 'ResolvedAt', dateTime: {}},
  {name: 'Escalated', displayName: 'Escalated', boolean: {}}
];
const config = {siteUrl: 'https://example.sharepoint.com/sites/support', listName: 'Tickets'};
test('Inline priority changes patch only the verified priority field and report denied writes', async () => {
  const graph = fakeGraph();
  const writes = [];
  graph.patch = async (path, fields) => { writes.push({path, fields}); };
  const service = new GraphTicketService(graph, config);
  assert.deepEqual(await service.updateTickets([7], {kind: 'priority', priority: 'Critical'}), {succeeded: [7], failed: []});
  assert.deepEqual(writes, [{path: '/sites/site-id/lists/tickets-id/items/7/fields', fields: {Urgency: 'Critical'}}]);
  await assert.rejects(service.updateTickets([7], {kind: 'priority', priority: 'Invalid'}), /priority is not configured/);
  assert.equal(writes.length, 1);
  graph.patch = async () => { throw new Error('Access denied'); };
  assert.deepEqual(await service.updateTickets([7], {kind: 'priority', priority: 'Low'}), {succeeded: [], failed: [{id: 7, message: 'Access denied'}]});
});
test('Lifecycle writes keep Assigned separate from In Progress and preserve legacy choice aliases', async () => {
  const lifecycle = ['New', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
  const graph = fakeGraph({schema: columns.map(column => column.name === 'State' ? {...column, choice: {choices: lifecycle}} : column)});
  const writes = [];
  graph.patch = async (path, fields) => { writes.push(fields); };
  const service = new GraphTicketService(graph, config);
  for (const status of lifecycle) await service.updateTickets([7], {kind: 'status', status});
  assert.deepEqual(writes.map(fields => fields.State), lifecycle);
  const legacy = fakeGraph();
  legacy.patch = async (path, fields) => { assert.equal(fields.State, 'Pending'); };
  assert.deepEqual(await new GraphTicketService(legacy, config).updateTickets([7], {kind: 'status', status: 'On Hold'}), {succeeded: [7], failed: []});
});
test('Explicit site ID bypasses site-path lookup and still discovers the configured list schema', async () => {
  const graph = fakeGraph();
  graph.get = async () => { throw new Error('Site-path lookup must not run'); };
  const service = new GraphTicketService(graph, {...config, siteId: 'site-id', listId: 'tickets-id'});
  const result = await service.getTickets();
  assert(Array.isArray(result.tickets));
  assert.equal(service.context.sitePath, '/sites/site-id');
  assert.equal(service.context.listId, 'tickets-id');
});
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
  assert.deepEqual(writes[3].fields, {AgentLookupId: '12', State: 'Assigned'});
  await service.updateTickets([7], {kind: 'assign', userId: null});
  assert.deepEqual(writes[4].fields, {AgentLookupId: null, State: 'New'});
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

test('Creation options and saves use actual classification columns and assignment status', async () => {
  const graph = fakeGraph({schema: [...columns,
    {name: 'Details', displayName: 'Issue description', text: {}},
    {name: 'field_5', displayName: 'Issue Subcategory', choice: {choices: ['Outlook']}, required: true},
    {name: 'field_6', displayName: 'Issue Type', choice: {choices: ['Email issue']}},
    {name: 'Unit', displayName: 'Department / Unit', text: {}}
  ]});
  const writes = [];
  graph.post = async (path, body) => writes.push({path, body});
  const service = new GraphTicketService(graph, config);
  const options = await service.getCreationOptions();
  assert.equal(options.assignment, true);
  assert.deepEqual(options.fields.find(field => field.key === 'subcategory'), {key: 'subcategory', label: 'Issue subcategory', choices: ['Outlook'], required: true});
  const input = {title: 'Mail issue', description: 'Cannot send', priority: 'High', category: '1', subcategory: '2', issueType: '3', department: 'Support', dueDate: '2026-10-20T12:30:00Z', assignedToId: 12};
  await service.createTicket(input);
  assert.deepEqual(writes[0].body.fields, {Title: 'Mail issue', State: 'Assigned', Urgency: 'High', Details: 'Cannot send', Area: 'IT', field_5: 'Outlook', field_6: 'Email issue', Unit: 'Support', Deadline: '2026-10-20T12:30:00.000Z', AgentLookupId: '12'});
  await assert.rejects(service.createTicket({...input, subcategory: '', issueType: ''}), /Enter Issue subcategory/);
  await assert.rejects(service.createTicket({...input, issueType: 'Not configured'}), /active classification/);
  await assert.rejects(service.createTicket({...input, dueDate: 'invalid'}), /valid expected/);
  assert.equal(writes.length, 1);
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
      const classificationKind = path.includes('/cat-id/') ? 'category' : path.includes('/sub-id/') ? 'subcategory' : path.includes('/type-id/') ? 'issueType' : null;
      if (classificationKind) {
        if (path.includes('/columns')) return [{name: 'Title', displayName: 'Title', text: {}}, {name: 'Active', displayName: 'Active', boolean: {}}, {name: 'SortOrder', displayName: 'SortOrder', number: {}}, ...(['category', 'issueType'].includes(classificationKind) ? [] : [{name: classificationKind === 'subcategory' ? 'Category' : 'Subcategory', displayName: classificationKind === 'subcategory' ? 'Category' : 'Subcategory', lookup: {listId: classificationKind === 'subcategory' ? 'cat-id' : 'sub-id'}}])];
        return [{id: classificationKind === 'category' ? '1' : classificationKind === 'subcategory' ? '2' : '3', fields: {Title: classificationKind === 'category' ? 'IT' : classificationKind === 'subcategory' ? 'Outlook' : 'Email issue', Active: true, SortOrder: 0, CategoryLookupId: '1', SubcategoryLookupId: '2'}}];
      }
      if (path.includes('/columns')) return schema;
      if (path.includes('/lists?')) return missingList ? [] : [{id: 'cat-id', displayName: 'Ticket Categories'}, {id: 'sub-id', displayName: 'Ticket Subcategories'}, {id: 'type-id', displayName: 'Ticket Issue Types'}, {id: 'tickets-id', displayName: 'Tickets'}, {id: 'users-id', displayName: 'User Information List', webUrl: 'https://example.sharepoint.com/sites/support/_catalogs/users'}];
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
  assert.equal(result.tickets[0].Status, 'On Hold');
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
