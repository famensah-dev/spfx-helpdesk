// Local mock reproductions only: no tokens, SharePoint writes, email, or network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, dependencies = {}) {
  const result = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    fileName: file, compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React}
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw Error('Unexpected dependency: ' + name);
    return dependencies[name];
  }, result, result.exports);
  return result.exports;
}
(async () => {
  const base = 'src/webparts/helpdeskSystem/';
  const {applyAppRoleRules} = load(base + 'services/appRoleRules.ts');
  const contracts = load(base + 'interfaces/IRoleManagement.ts');
  const ticket = {Id: 1, Title: 'Mock', Status: 'New', Priority: 'Medium', AssignedTo: {Id: 7}};
  let bulkWrites = 0;
  const source = {access: {admin: false, superAdmin: false}, getTickets: async () => ({tickets: [ticket, {...ticket, Id: 2, AssignedTo: {Id: 8}}]}),
    updateTicket: async () => undefined, updateTickets: async () => {bulkWrites++;}};
  const guarded = applyAppRoleRules(source, contracts.defaultRoleConfiguration().roles[0], 7, 'agent@example.com');
  assert.deepEqual((await guarded.getTickets()).tickets.map(t => t.Id), [1]);
  assert.equal((await Object.getPrototypeOf(guarded).getTickets()).tickets.length, 2);
  console.log('DP-01: the source receives out-of-scope rows before browser filtering; source is also the wrapper prototype.');
  await assert.rejects(guarded.updateTicket(1, {title: 'Mock', status: 'Closed', priority: 'Medium', assignedToId: 7}), /Only Helpdesk Admins/);
  await guarded.updateTickets([1], {kind: 'status', status: 'Closed'});
  assert.equal(bulkWrites, 1);
  console.log('DP-05: single-ticket close denied, identical bulk close forwarded for default Agent.');

  const {assertTicketAction, sessionAccess} = await import('../../azure-app/server/authorization.mjs');
  const azureAgent = sessionAccess({oid: '11111111-1111-4111-8111-111111111111', roles: ['DeskPilot.HelpdeskAgent']});
  assert.doesNotThrow(() => assertTicketAction(azureAgent, {...ticket, AssignedTo: {Id: 7, Email: 'agent@example.com'}}, {mail: 'agent@example.com'}, 'status', 'Closed'));
  console.log('DP-05: Azure API policy also permits assigned agents to close tickets.');

  const {SharePointRoleManagement} = load(base + 'services/SharePointRoleManagement.ts', {
    '@microsoft/sp-http': {SPHttpClient: {configurations: {v1: {}}}}, '../interfaces/IRoleManagement': contracts
  });
  const user = {userId: 7, name: 'Mock Agent', email: 'agent@example.com', roleId: 'agent'};
  let configuration = {...contracts.defaultRoleConfiguration(), assignments: [user]}, version = 1;
  const rows = new Map([[70, {Id: 70, Title: '7', Rules: 'old projection'}]]);
  const membership = new Set([7]);
  let unblock, reached;
  const gate = new Promise(resolve => {unblock = resolve;});
  const waiting = new Promise(resolve => {reached = resolve;});
  const context = {pageContext: {web: {absoluteUrl: 'https://example.sharepoint.com/sites/mock'}}, spHttpClient: {
    get: async () => ({ok: true, status: 200})
  }};
  function owner(paused) {
    const service = new SharePointRoleManagement(context, true, {sync: async assignments => {
      membership.clear(); for (const item of assignments) if (!item.disabled) membership.add(item.userId);
    }});
    service.itemId = 1; service.etag = 'v1';
    service.configurationItem = async () => ({Id: 1, Rules: JSON.stringify(configuration), etag: 'v' + version});
    service.ensureList = async () => {if (paused) {reached(); await gate;}};
    service.secure = async () => undefined;
    service.retireLegacyList = async () => undefined;
    service.read = async url => ({value: url.includes('/fields?') ? [{InternalName: 'Rules'}] : url.includes("Title eq 'Configuration'") ? [{Id: 1}] : [...rows.values()]});
    service.write = async (url, body, headers) => {
      if (url.endsWith('/items(1)') && body?.Rules) {
        assert.equal(headers['IF-MATCH'], 'v' + version); configuration = JSON.parse(body.Rules); version++; return;
      }
      if (headers?.['X-HTTP-Method'] === 'DELETE') {rows.delete(Number(url.match(/items\((\d+)\)/)[1])); return;}
      if (url.endsWith('/items')) {const row = {Id: 71, ...body}; rows.set(71, row); return row;}
      const id = Number(url.match(/items\((\d+)\)/)?.[1]); if (rows.has(id)) Object.assign(rows.get(id), body);
    };
    return service;
  }
  const stale = owner(true), current = owner(false);
  const oldLoad = stale.load(); await waiting;
  await current.save({...configuration, assignments: []});
  assert.equal(rows.size, 0); assert.equal(membership.size, 0);
  unblock(); await oldLoad;
  assert.equal(configuration.assignments.length, 0);
  assert([...rows.values()].some(row => row.Title === '7'));
  assert(membership.has(7));
  console.log('DP-03: an owner load holding old configuration restores revoked projection and group intent after a newer owner save.');
  const {JSDOM} = require('jsdom');
  const dom = new JSDOM(''); global.DOMParser = dom.window.DOMParser;
  const {safeDescriptionHtml} = load(base + 'components/RichTextEditor.tsx', {
    react: {}, '@fluentui/react': {}, './HelpdeskSystem.module.scss': {}
  });
  for (const input of [
    '<script>alert(1)</script><p onclick="alert(1)">text</p>',
    '<svg><a onload="alert(1)">test</a></svg>',
    '<a href="javascript:alert(1)">link</a><img src=x onerror="alert(1)">',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><math><mi>x</mi></math>',
    '<a href="data:text/html,unsafe">test</a><div style="background:url(https://example.invalid)">safe</div>'
  ]) {
    const cleaned = new dom.window.DOMParser().parseFromString(safeDescriptionHtml(input), 'text/html');
    assert.equal(cleaned.querySelectorAll('script,svg,iframe,math,img,object').length, 0);
    for (const element of cleaned.querySelectorAll('*')) for (const attribute of element.attributes) {
      assert(!/^on/i.test(attribute.name));
      if (attribute.name === 'href') assert(/^(https?:\/\/|mailto:)/i.test(attribute.value));
    }
  }
  dom.window.close();
  console.log('Positive control: representative HTML/script/unsafe-link payloads removed by the rich-text sanitizer.');
  let tokenRequests = 0;
  const {GraphClient} = load(base + 'services/graph/GraphClient.ts');
  const graph = new GraphClient(async () => {tokenRequests++; return 'mock-token';});
  await assert.rejects(graph.get('https://example.invalid/v1.0/me'), /unexpected API/);
  await assert.rejects(graph.post('https://example.invalid/v1.0/me', {}), /unexpected API/);
  assert.equal(tokenRequests, 0);
  console.log('Positive control: Graph client rejects foreign origins before acquiring a token.');
  console.log('All audit reproductions confirmed against local mocked services. No live systems were contacted.');
})().catch(error => {console.error(error); process.exitCode = 1;});
