const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.com', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
const React = require('react');
const ReactDOM = require('react-dom');
const { act, Simulate } = require('react-dom/test-utils');
const h = React.createElement;
function load(file, deps = {}) {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText)(name => deps[name] || require(name), module, module.exports);
  return module.exports;
}
const styles = { default: new Proxy({}, { get: (_, key) => String(key) }) };
const button = p => h('button', { disabled: p.disabled, onClick: p.onClick, 'aria-label': p.ariaLabel }, p.text || p.ariaLabel);
const fluent = {
  PersonaCoin: p => h('span', { 'data-avatar-size': p.coinSize }, p.text.slice(0,1)),
  DefaultButton: button, PrimaryButton: button, IconButton: button, Icon: () => null,
  MessageBar: p => h('div', { role: 'alert' }, p.children), MessageBarType: { error: 1, success: 2 }, Spinner: p => h('p', null, p.label),
  Dialog: p => p.hidden ? null : h('div', { role: 'dialog' }, p.children), DialogFooter: p => h('div', null, p.children),
  SearchBox: p => h('input', { 'aria-label': p.ariaLabel, value: p.value, onChange: e => p.onChange(e, e.target.value) }),
  Dropdown: p => h('select', { 'aria-label': p.ariaLabel, value: p.selectedKey, onChange: e => p.onChange(e, { key: e.target.value }) }, p.options.map(o => h('option', { key: o.key, value: o.key }, o.text)))
};
const contracts = load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');
const { SharePointRolesPage } = load('src/webparts/helpdeskSystem/pages/SharePointRolesPage.tsx', {
  '@fluentui/react': fluent,
  './SharePointUsersPage': { SharePointUsersPage: () => null },
  '../interfaces/IRoleManagement': contracts,
  '../components/cancelButtonStyles': { cancelButtonStyles: {} },
  '../components/HelpdeskSystem.module.scss': styles,
  './LaravelRoles.module.scss': styles
});
const root = document.getElementById('app');
const find = text => [...root.querySelectorAll('button')].find(b => b.textContent === text);
(async () => {
  const config = contracts.defaultRoleConfiguration();
  config.assignments = [{ userId: 1, name: 'Jane Doe', email: 'jane@example.com', roleId: 'agent' }, { userId: 2, name: 'Hidden User', email: 'hidden@example.com', roleId: 'admin' }];
  let saved; let back = 0;
  const service = { storageProvider: 'laravel', roleManagement: { supportedActions: ['dashboard', 'tickets', 'create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment', 'classifications'], supportedSettingsPages: ['settings', 'roles', 'categories', 'subcategories', 'issueTypes'], load: async () => config, save: async value => { saved = value; } } };
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view: 'roles', roleId: 'agent', cardLayout: true, onBack: () => back++ }), root));
  assert.equal(root.querySelectorAll('details').length, 9);
  assert(root.querySelector('aside').textContent.includes('Jane Doe'));
  assert(!root.querySelector('aside').textContent.includes('Hidden User'));
  assert(root.querySelector('.detail > .main > header.header'), 'The heading card belongs to the left column');
  assert(root.querySelector('.main > .permissionsCard > .permissionsToolbar'), 'Filters belong to a separate permissions card');
  assert(!find('Save') && !find('Discard'), 'Save and Discard appear only after changes');
  assert(!root.querySelector('input[type="radio"]'));
  await act(async()=>root.querySelector('button[role="switch"][aria-label="All Accessible Tickets"]').click());
  assert.equal(root.querySelectorAll('button[role="switch"][aria-checked="true"]').length,1,'Visibility switches remain mutually exclusive');
  await act(async()=>find('Discard').click());
  assert(!root.querySelector('input[aria-label="Manage service levels"]'), 'Only implemented backend permissions are editable');
  await act(async () => root.querySelector('input[aria-label="Select all Tickets"]').click());
  assert(root.querySelector('input[aria-label="Assign tickets"]').checked);
  assert(find('Save') && find('Discard'));
  await act(async () => find('Discard').click());
  assert(!root.querySelector('input[aria-label="Assign tickets"]').checked, 'Discard restores the saved permissions');
  assert(!find('Save') && !find('Discard'));
  await act(async () => root.querySelector('input[aria-label="Select all Tickets"]').click());
  await act(async () => find('Back').click());
  assert.equal(back, 0, 'Back must preserve unsaved edits');
  assert(root.querySelector('[role="dialog"]'));
  await act(async () => [...root.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Cancel').click());
  await act(async () => find('Save').click());
  await act(async () => find('Confirm Apply').click());
  assert(saved.roles.find(r => r.id === 'agent').actions.includes('assign'));
  assert.deepEqual(saved.assignments, config.assignments);
  await act(async () => find('Back').click());
  assert.equal(back, 1);
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view: 'roles', roleId: 'requester', cardLayout: true }), root));
  assert(find('Select All').disabled, 'Requester permissions remain fixed');
  assert([...root.querySelectorAll('input[type="checkbox"]')].every(input=>input.disabled));
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view: 'roles', roleId: 'agent', cardLayout: true, tableLayout: true }), root));
  assert(root.querySelector('table[aria-label="Agent permissions"]'), 'Role details can use the original permissions table');
  assert(!root.querySelector('details'), 'Table details omit the permission cards');
  assert(!root.querySelector('aside'), 'The table uses the full content width');
  assert(find('Back'), 'Table details retain guarded back navigation');
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view: 'roles', roleId: 'agent', cardLayout: true, fullWidth: true }), root));
  assert.equal(root.querySelectorAll('details').length, 9);
  assert(!root.querySelector('aside'), 'Reference layout uses full-width permission groups without a users column');
  assert(!root.querySelector('table'), 'Reference layout uses grouped checkbox rows');
  assert(find('Select All') && find('Clear All'), 'Bulk controls sit in the search toolbar');
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  config.roleMembers=[...config.assignments,{userId:3,name:'Organization Owner',email:'owner@example.com',roleId:'superAdmin'}];
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view:'roles', roleId:'superAdmin', cardLayout:true, fixedRole:{id:'superAdmin',name:'Super Admin',scope:'all',actions:[...service.roleManagement.supportedActions],pageAccess:[...service.roleManagement.supportedSettingsPages]} }),root));
  assert(root.querySelector('aside').textContent.includes('Organization Owner'));
  assert(find('Select All').disabled, 'Super Admin permissions remain fixed');
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  let headerBack;
  await act(async () => ReactDOM.render(h(SharePointRolesPage,{service,view:'roles',roleId:'agent',cardLayout:true,hideRoleHeading:true,onBackAction:action=>{headerBack=action;},onBack:()=>back++}),root));
  assert(!root.querySelector('.main > header'),'The shared settings heading replaces the duplicate role heading');
  assert(root.querySelector('input[aria-label="View tickets"]'),'Permission names are readable');
  assert(![...root.querySelectorAll('.permissionCode')].some(node=>node.textContent==='tickets.view'));
  await act(async()=>root.querySelector('input[aria-label="Assign tickets"]').click());
  await act(async()=>headerBack());
  assert(root.querySelector('[role="dialog"]'),'Shared-header Back must protect unsaved permission edits');
  await act(async()=>find('Discard and Leave').click());
  assert.equal(back,2);
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  dom.window.close();
  console.log('Permission cards passed: grouped controls, scoped users, save, fixed roles and unsaved-change protection.');
  process.exit(0);
})().catch(error => { console.error(error); dom.window.close(); process.exit(1); });
