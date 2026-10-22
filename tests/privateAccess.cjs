const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, imports) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', code)(name => imports[name] || require(name), module, module.exports);
  return module.exports;
}
const roles = load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts', {});
const { SharePointRoleManagement } = load('src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts', {
  '@microsoft/sp-http': {SPHttpClient: {configurations: {v1: {}}}}, '../interfaces/IRoleManagement': roles
});
(async () => {
  const config = roles.defaultRoleConfiguration();
  const assignment = {userId: 7, name: 'Test', email: 'test@example.com', roleId: 'agent'};
  const calls = [];
  const workspace = {title: 'Facilities', description: 'Building support', listName: 'Requests', listId: ''};
  let projection = {role: config.roles[0], assignment, workspace};
  const context = {pageContext: {web: {absoluteUrl: 'https://example.sharepoint.com/sites/helpdesk'}}, spHttpClient: {
    get: async url => {calls.push(url); return {ok: true, json: async () => url.includes('/currentuser') ? {Id: 7} : {value: [{Id: 1, Rules: JSON.stringify(projection)}]}};},
    post: async () => {throw Error('Unexpected write');}
  }};
  const service = new SharePointRoleManagement(context, false);
  const loaded = await service.load();
  assert.deepEqual(loaded.assignments, [assignment]);
  assert.deepEqual(loaded.workspace, workspace, 'User entry must carry the workspace settings without exposing other assignments');
  assert.throws(() => roles.validateRoleConfiguration({...config, workspace: {...workspace, listId: 'invalid'}}), /Invalid workspace/);
  assert(calls.filter(url => url.includes('/items?')).every(url => url.includes("Title eq '7'")), 'Non-admin must query only their own entry in the shared list');
  projection.assignment = {...assignment, userId: 8};
  await assert.rejects(service.load(), /Invalid user access/);
  projection.assignment = {...assignment, disabled: true};
  await assert.rejects(service.load(), /Invalid user access/);
  await assert.rejects(service.save(config), /Only SharePoint site owners/);
  const operations = [];
  const admin = new SharePointRoleManagement(context, true);
  admin.info = async () => ({user: 1, owners: 3, read: 100, full: 200});
  admin.write = async (url, body, headers) => {operations.push({url, body, headers});};
  admin.read = async () => ({value: [{PrincipalId: 1}, {PrincipalId: 3}, {PrincipalId: 9}, {PrincipalId: 7}]});
  await admin.secure('/private', 7);
  assert(operations.some(op => op.url.includes('getbyprincipalid(9)') && op.headers['X-HTTP-Method'] === 'DELETE'));
  assert(operations.some(op => op.url.includes('principalid=7,roledefid=100')));
  assert(!operations.some(op => op.url.includes('principalid=7,roledefid=200')));
  operations.length = 0;
  await admin.secure('/configuration');
  assert(!operations.some(op => op.url.includes('roledefid=100')), 'Private configuration must not grant Read');
  const retiredPaths = [];
  admin.read = async () => ({value: [{Id: 10}, {Id: 11}]});
  admin.secure = async (path, userId) => {assert.equal(userId, undefined); retiredPaths.push(path);};
  await admin.retireLegacyList();
  assert.equal(retiredPaths.length, 3, 'Legacy list and every legacy item must become owner-only');
  assert(retiredPaths[1].endsWith('/items(10)'));
  assert(retiredPaths[2].endsWith('/items(11)'));
  const versionContext = {pageContext: context.pageContext, spHttpClient: {get: async () => new Response(JSON.stringify({d: {Id: 1, Rules: '{}', __metadata: {etag: '"5"'}}}))}};
  const versionService = new SharePointRoleManagement(versionContext, true);
  assert.equal((await versionService.configurationItem(1)).etag, '"5"');
  versionContext.spHttpClient.get = async () => new Response(JSON.stringify({Id: 1, Rules: '{}'}), {headers: {ETag: '"6"'}});
  assert.equal((await versionService.configurationItem(1)).etag, '"6"');
  versionContext.spHttpClient.get = async () => new Response(JSON.stringify({Id: 1, Rules: '{}'}));
  await assert.rejects(versionService.configurationItem(1), /did not return the configuration version/);
  console.log('Private access checks passed: own-row loading, identity mismatch, disabled users, denied saves and permission pruning.');
})().catch(error => {console.error(error); process.exitCode = 1;});
