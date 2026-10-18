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
const { isTicketCreatedBy } = load('../src/webparts/helpdeskSystem/utils/ticketRequester.ts');
test('Created by Me matches requester identity without using names or assignees', () => {
  assert.equal(isTicketCreatedBy({ Requester: { Email: 'ME@EXAMPLE.COM' } }, 'me@example.com'), true);
  assert.equal(isTicketCreatedBy({ Requester: { AadId: 'user-123' } }, '', 'USER-123'), true);
  assert.equal(isTicketCreatedBy({ Requester: { Email: 'other@example.com' }, AssignedTo: { Email: 'me@example.com' } }, 'me@example.com'), false);
  assert.equal(isTicketCreatedBy({ Requester: { Title: 'Same name' } }, '', ''), false);
  assert.equal(isTicketCreatedBy({}, 'me@example.com', 'user-123'), false);
});
const { applyAppRoleRules, ticketInScope, canUse } = load('../src/webparts/helpdeskSystem/services/appRoleRules.ts');
const { SharePointRoleManagement } = load('../src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts', {
  '@microsoft/sp-http': { SPHttpClient: { configurations: { v1: {} } } },
  '../interfaces/IRoleManagement': roles
});
const tickets = [
  { Id: 1, Title: 'Assigned', Status: 'New', Priority: 'Low', AssignedTo: { Id: 7, Email: 'agent@example.com' } },
  { Id: 2, Title: 'Other', Status: 'New', Priority: 'Low', AssignedTo: { Id: 8, Email: 'other@example.com' } },
  { Id: 3, Title: 'Own', Status: 'New', Priority: 'Low', Requester: { Email: 'agent@example.com' } }
];
const data = { tickets, isMockData: false, sourceLabel: 'SharePoint', hasResolvedAt: false, hasCategory: false, hasDueDate: false, hasEscalated: false, hasPending: false };
function fixture() {
  const writes = [];
  const source = {
    getTickets: async () => data,
    createTicket: async input => writes.push(input),
    updateTicket: async (...args) => writes.push(args),
    updateTickets: async (...args) => { writes.push(args); return { succeeded: args[0], failed: [] }; },
    addComment: async (...args) => writes.push(args),
    getComments: async () => [], getHistory: async () => [],
    getCreationOptions: async () => ({ priorities: ['Low'], description: true, assignment: true, fields: [] }),
    saveFaq: async input => writes.push(input),
    getFaqAccess: async () => ({ canManage: true, canSubmitDraft: true }),
    administration: {},
    sla: { getSettings: async () => ({}), setup: async () => writes.push('setup'), savePriority: async input => writes.push(input) }
  };
  return { writes, source, service: applyAppRoleRules(source, roles.defaultRoleConfiguration().roles[0], 7, 'agent@example.com') };
}
test('Agent view and comment/history calls reject tickets outside its scope', async () => {
  const { service, writes } = fixture();
  assert.deepEqual((await service.getTickets()).tickets.map(item => item.Id), [1]);
  await assert.rejects(service.addComment(2, 'hidden'), /outside/);
  await assert.rejects(service.getHistory(2), /outside/);
  await service.addComment(1, 'allowed');
  assert.equal(writes.length, 1);
});
test('Agent cannot assign, reprioritize or archive through normal app calls', async () => {
  const { service, writes } = fixture();
  for (const action of [{ kind: 'assign', userId: 8 }, { kind: 'priority', priority: 'High' }, { kind: 'archive' }]) await assert.rejects(service.updateTickets([1], action), /does not allow/);
  await assert.rejects(service.createTicket({ title: 'New', assignedToId: 8 }), /does not allow/);
  await assert.rejects(service.updateTicket(1, { title: 'Assigned', status: 'New', priority: 'High', assignedToId: 7 }), /does not allow/);
  await service.updateTickets([1], { kind: 'status', status: 'In Progress' });
  assert.equal(writes.length, 1);
  assert.equal((await service.getCreationOptions()).assignment, false);
});
test('disabled features are removed and cannot leak through inherited source methods', async () => {
  const { service, source } = fixture();
  assert.equal(service.saveFaq, undefined);
  assert.equal(service.administration, undefined);
  assert.deepEqual(await service.getFaqAccess(), { canManage: false, canSubmitDraft: false });
  await assert.rejects(service.sla.savePriority({ name: 'High' }), /does not allow/);
  const empty = applyAppRoleRules(source, { id: 'agent', name: 'Agent', scope: 'all', actions: [] }, 7, 'agent@example.com');
  assert.equal(empty.updateTickets, undefined);
  assert.equal(empty.updateTicket, undefined);
  assert.equal(empty.addComment, undefined);
  assert.equal(empty.createTicket, undefined);
  assert.equal(canUse(empty, 'tickets'), false);
  assert.deepEqual((await empty.getTickets()).tickets, []);
});
test('custom scope and actions apply independently of role name', async () => {
  const { source } = fixture();
  const custom = { id: 'agent', name: 'Agent', scope: 'own', actions: ['tickets', 'priority'] };
  assert.equal(ticketInScope(tickets[2], custom, 7, 'agent@example.com'), true);
  assert.equal(ticketInScope({ ...tickets[2], Requester: { AadId: 'user-guid' } }, custom, 7, '', 'USER-GUID'), true);
  const service = applyAppRoleRules(source, custom, 7, 'agent@example.com');
  assert.deepEqual((await service.getTickets()).tickets.map(item => item.Id), [3]);
  await service.updateTickets([3], { kind: 'priority', priority: 'High' });
  await assert.rejects(service.updateTickets([1], { kind: 'priority', priority: 'High' }), /outside/);
});
test('invalid rules, duplicate assignments and unsupported roles are rejected', () => {
  const config = roles.defaultRoleConfiguration();
  roles.validateRoleConfiguration(config);
  config.assignments = [{ userId: 7, name: 'A', email: 'a@example.com', roleId: 'superAdmin' }];
  assert.throws(() => roles.validateRoleConfiguration(config), /Invalid user/);
  config.assignments[0].roleId = 'agent'; config.assignments.push(config.assignments[0]);
  assert.throws(() => roles.validateRoleConfiguration(config), /Invalid user/);
});
test('missing configuration never grants a nonowner access and nonowners cannot save', async () => {
  let writes = 0;
  const context = { pageContext: { web: { absoluteUrl: 'https://example.sharepoint.com/sites/desk' } }, spHttpClient: { get: async () => new Response('', { status: 404 }), post: async () => { writes++; } } };
  const nonowner = new SharePointRoleManagement(context, false);
  await assert.rejects(nonowner.load(), /Unable to load DeskPilot access/);
  await assert.rejects(nonowner.save(roles.defaultRoleConfiguration()), /Only SharePoint site owners/);
  assert.equal(writes, 0);
  assert.deepEqual(await new SharePointRoleManagement(context, true).load(), roles.defaultRoleConfiguration());
});
test('stale edits use an ETag and report concurrency conflicts', async () => {
  let headers;
  const config = roles.defaultRoleConfiguration();
  const context = { pageContext: { web: { absoluteUrl: 'https://example.sharepoint.com/sites/desk' } }, spHttpClient: {
    get: async url => new Response(JSON.stringify(url.includes('/items(1)') ? {d: {Id: 1, Rules: JSON.stringify(config), __metadata: {etag: '"4"'}}} : url.includes('/items?') ? { value: [{ Id: 1, Rules: JSON.stringify(config) }] } : url.includes('/fields?') ? { value: [{ InternalName: 'Rules' }] } : url.includes('/roleassignments?') ? { value: [] } : url.includes('/roledefinitions?') ? { value: [{ Id: 1073741826, RoleTypeKind: 2 }] } : { HasUniqueRoleAssignments: true }), { status: 200 }),
    post: async (_, __, options) => { headers = options.headers; return new Response('', { status: 412 }); }
  } };
  const service = new SharePointRoleManagement(context, true);
  service.ensureList = async () => {};
  service.secure = async () => {};
  service.sync = async () => {};
  await service.load();
  await assert.rejects(service.save(config), /another session/);
  assert.equal(headers['IF-MATCH'], '"4"');
});

test('private access synchronization deletes revoked rows and updates only each assigned user projection', async () => {
  const service = new SharePointRoleManagement({pageContext: {web: {absoluteUrl: 'https://example.sharepoint.com'}}}, true);
  const writes = [], secured = [];
  service.retireLegacyList = async () => {};
  service.read = async () => ({value: [{Id: 1, Title: 'Configuration', Rules: '{}'}, {Id: 10, Title: '8', Rules: '{}'}, {Id: 11, Title: '7', Rules: '{}'}]});
  service.write = async (url, body, headers) => {writes.push({url, body, headers}); return {Id: 12};};
  service.secure = async (path, userId) => secured.push({path, userId});
  const config = roles.defaultRoleConfiguration();
  config.assignments = [{userId: 7, name: 'Agent', email: 'agent@example.com', roleId: 'agent'}, {userId: 8, name: 'Disabled', email: 'disabled@example.com', roleId: 'agent', disabled: true}];
  await service.sync(config);
  assert.equal(writes[0].headers['X-HTTP-Method'], 'DELETE');
  assert(writes[0].url.endsWith('/items(10)'));
  assert(!writes.some(item => item.url.endsWith('/items(1)')), 'Synchronization must preserve the private configuration item');
  assert.deepEqual(secured.map(item => item.userId), [7]);
  const projection = JSON.parse(writes.find(item => item.body?.Rules).body.Rules);
  assert.equal(projection.assignment.userId, 7);
  assert.equal(projection.role.id, 'agent');
  assert.equal(projection.assignments, undefined);
  assert.equal(projection.roles, undefined);
});
test('permission editor requires Apply and confirmation; cancel and restore preserve user assignments', async () => {
  const state = [], effects = [];
  let cursor = 0, tree;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: initial => { const index = cursor++; return state[index] ||= { current: initial }; },
    useCallback: (fn, deps) => { const index = cursor++; if (!state[index] || deps.some((value, i) => value !== state[index].deps[i])) state[index] = { fn, deps }; return state[index].fn; },
    useEffect: (fn, deps) => { const index = cursor++; if (!state[index] || deps.some((value, i) => value !== state[index][i])) { state[index] = deps; effects.push(fn); } }
  };
  const fluent = Object.fromEntries(['Checkbox', 'DefaultButton', 'Dialog', 'DialogFooter', 'Dropdown', 'Link', 'MessageBar', 'PrimaryButton', 'SearchBox', 'Spinner', 'Toggle', 'Icon'].map(name => [name, name]));
  fluent.MessageBarType = {};
  const { SharePointRolesPage } = load('../src/webparts/helpdeskSystem/pages/SharePointRolesPage.tsx', { react, '@fluentui/react': fluent, '../components/cancelButtonStyles': {cancelButtonStyles: {}}, '../interfaces/IRoleManagement': roles, '../components/HelpdeskSystem.module.scss': { default: {} }, './SharePointUsersPage': { SharePointUsersPage: 'SharePointUsersPage' } });
  const config = roles.defaultRoleConfiguration();
  config.assignments = [{ userId: 7, name: 'Agent', email: 'agent@example.com', roleId: 'agent' }];
  const writes = [];
  let storedConfig = structuredClone(config);
  const service = { roleManagement: { load: async () => structuredClone(storedConfig), save: async value => {storedConfig = structuredClone(value); writes.push(structuredClone(value));} } };
  const render = () => { cursor = 0; tree = SharePointRolesPage({ service }); while (effects.length) effects.shift()(); return tree; };
  const find = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    return node.props?.children?.map(child => child === undefined ? undefined : find(predicate, child)).find(Boolean);
  };
  const click = text => { const node = find(node => node.props.text === text || node.props.children?.includes(text)); assert(node, `Missing ${text}`); node.props.onClick(); render(); };
  render(); await Promise.resolve(); render();
  click('Roles & Permissions');
  assert.equal(find(node => node.props.role === 'switch').props.disabled, true);
  click('Edit permissions');
  const permission = find(node => node.props.role === 'switch' && node.props['aria-label'] === 'Assign tickets');
  permission.props.onClick(); render();
  assert.equal(writes.length, 0);
  click('Apply changes');
  assert.equal(writes.length, 0);
  assert.equal(find(node => node.type === 'Dialog').props.hidden, false);
  click('Cancel');
  assert.equal(writes.length, 0);
  click('Apply changes'); click('Confirm apply');
  await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(writes.length, 1);
  assert(writes[0].roles[0].actions.includes('assign'));
  assert.deepEqual(writes[0].assignments, config.assignments);
  click('Restore defaults');
  assert.equal(writes.length, 1);
  click('Confirm restore'); await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].roles, config.roles);
  assert.deepEqual(writes[1].assignments, config.assignments);
});

test('inactive DeskPilot assignments deny role resolution without breaking legacy records', () => {
  const config = roles.defaultRoleConfiguration();
  config.assignments = [{ userId: 7, name: 'Agent', email: 'agent@example.com', roleId: 'agent' }];
  assert.equal(roles.assignedRole(config, 7).id, 'agent');
  config.assignments[0].disabled = true;
  roles.validateRoleConfiguration(config);
  assert.equal(roles.assignedRole(config, 7), undefined);
  config.assignments[0].disabled = false;
  assert.equal(roles.assignedRole(config, 7).id, 'agent');
});

test('Add users opens on demand, saves multiple selected people once, and status changes require confirmation', async () => {
  const state = [], effects = [];
  let cursor = 0, tree;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: initial => { const index = cursor++; return state[index] ||= { current: initial }; },
    useEffect: (fn, deps) => { const index = cursor++; if (!state[index] || deps.some((value, i) => value !== state[index][i])) { state[index] = deps; effects.push(fn); } }
  };
  const fluent = Object.fromEntries(['Checkbox', 'DefaultButton', 'Dialog', 'DialogFooter', 'Dropdown', 'Icon', 'IconButton', 'MessageBar', 'PersonaCoin', 'PrimaryButton', 'SearchBox', 'Spinner', 'TextField'].map(name => [name, name]));
  fluent.MessageBarType = {}; fluent.PersonaSize = {}; fluent.DirectionalHint = {};
  const { SharePointUsersPage } = load('../src/webparts/helpdeskSystem/pages/SharePointUsersPage.tsx', { react, '@fluentui/react': fluent, '../components/HelpdeskSystem.module.scss': { default: {} }, '../components/cancelButtonStyles': { cancelButtonStyles: {} } });
  const people = [{ id: '1', displayName: 'Alice', email: 'alice@example.com', department: 'IT' }, { id: '2', displayName: 'Bob', email: 'bob@example.com', department: null }];
  const writes = [];
  let reloads = 0;
  const props = { configuration: roles.defaultRoleConfiguration(), busy: false, service: { searchUsers: async () => people, resolveUser: async user => ({ Id: Number(user.id) }) }, onSave: async assignments => { roles.validateRoleConfiguration({ ...props.configuration, assignments }); writes.push(structuredClone(assignments)); props.configuration = { ...props.configuration, assignments }; }, onReload: async () => { reloads++; } };
  const render = () => { cursor = 0; tree = SharePointUsersPage(props); while (effects.length) effects.shift()(); };
  const find = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    return node.props?.children?.map(child => child === undefined ? undefined : find(predicate, child)).find(Boolean);
  };
  const originalWindow = globalThis.window;
  globalThis.window = { setTimeout: fn => { fn(); return 1; }, clearTimeout: () => {} };
  try {
    render();
    assert.equal(find(node => node.type === 'Dialog' && node.props.dialogContentProps?.title === 'Add users').props.hidden, true);
    find(node => node.props.text === 'Add users').props.onClick({ currentTarget: {} }); render();
    assert.equal(find(node => node.type === 'Dialog' && node.props.dialogContentProps?.title === 'Add users').props.hidden, false);
    find(node => node.props.ariaLabel === 'Search organization users').props.onChange(undefined, 'al'); render();
    await new Promise(resolve => setImmediate(resolve)); render();
    for (const person of people) {
      find(node => node.props.ariaLabel === 'Search organization users').props.onChange(undefined, person.displayName); render();
      await new Promise(resolve => setImmediate(resolve)); render();
      find(node => node.props['aria-label'] === `Select ${person.displayName}`).props.onClick(); render();
      assert.equal(find(node => node.props.ariaLabel === 'Search organization users').props.value, '');
      assert(find(node => node.props.ariaLabel === `Remove ${person.displayName} from selection`));
    }
    assert.equal(writes.length, 0);
    find(node => node.props.ariaLabel === 'Search organization users').props.onChange(undefined, 'Bob'); render();
    await new Promise(resolve => setImmediate(resolve)); render();
    assert.equal(find(node => node.props['aria-label'] === 'Select Bob'), undefined);
    find(node => node.props.ariaLabel === 'Remove Bob from selection').props.onClick(); render();
    assert(find(node => node.props['aria-label'] === 'Select Bob'));
    find(node => node.props['aria-label'] === 'Select Bob').props.onClick(); render();
    const popup = find(node => node.type === 'Dialog' && node.props.dialogContentProps?.title === 'Add users');
    find(node => node.type === 'PrimaryButton' && node.props.text === 'Add users', popup).props.onClick();
    await new Promise(resolve => setImmediate(resolve)); render();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].length, 2);
    assert.equal(writes[0][0].department, 'IT');
    assert.equal(writes[0][1].department, undefined);
    assert(writes[0].every(user => user.addedAt && user.roleId === 'agent'));
    assert.equal(find(node => node.type === 'Dialog' && node.props.dialogContentProps?.title === 'Add users').props.hidden, true);
    find(node => node.props.ariaLabel === 'Actions for Alice').props.menuProps.items.find(item => item.key === 'status').onClick(); render();
    assert.equal(writes.length, 1);
    find(node => node.type === 'PrimaryButton' && node.props.text === 'Confirm').props.onClick();
    await new Promise(resolve => setImmediate(resolve)); render();
    assert.equal(writes[1][0].disabled, true);
    assert.equal(writes[1][1].disabled, undefined);
    find(node => node.props.ariaLabel === 'Reload users').props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reloads, 1);
    assert.equal(writes.length, 2);
  } finally { globalThis.window = originalWindow; }
});
