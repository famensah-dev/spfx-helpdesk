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
  assert.equal(root.querySelectorAll('details').length, 3);
  assert(root.querySelector('aside').textContent.includes('Jane Doe'));
  assert(!root.querySelector('aside').textContent.includes('Hidden User'));
  assert(!root.querySelector('input[aria-label="Manage SLA Priorities"]'), 'Only implemented backend permissions are editable');
  await act(async () => find('Edit').click());
  await act(async () => root.querySelector('button[aria-label="Select all Ticket permissions"]').click());
  assert(root.querySelector('input[aria-label="Assign Tickets"]').checked);
  await act(async () => find('Back to roles').click());
  assert.equal(back, 0, 'Back must preserve unsaved edits');
  assert(root.querySelector('[role="dialog"]'));
  await act(async () => [...root.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Cancel').click());
  await act(async () => find('Save').click());
  await act(async () => find('Confirm Apply').click());
  assert(saved.roles.find(r => r.id === 'agent').actions.includes('assign'));
  assert.deepEqual(saved.assignments, config.assignments);
  await act(async () => find('Back to roles').click());
  assert.equal(back, 1);
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  await act(async () => ReactDOM.render(h(SharePointRolesPage, { service, view: 'roles', roleId: 'requester', cardLayout: true }), root));
  assert(find('Edit').disabled, 'Requester permissions remain fixed');
  await act(async () => ReactDOM.unmountComponentAtNode(root));
  dom.window.close();
  console.log('Permission cards passed: grouped controls, scoped users, save, fixed roles and unsaved-change protection.');
  process.exit(0);
})().catch(error => { console.error(error); dom.window.close(); process.exit(1); });
