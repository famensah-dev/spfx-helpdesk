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

test('Permission search and access filters follow the selected role',async()=>{
  const state = [], effects = [];
  let cursor = 0, tree;
  globalThis.window = new EventTarget();
  const react = {
    useContext:()=>undefined,
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: initial => { const index = cursor++; return state[index] ||= { current: initial }; },
    useCallback: (fn, deps) => { const index = cursor++; if (!state[index] || deps.some((value, i) => value !== state[index].deps[i])) state[index] = { fn, deps }; return state[index].fn; },
    useEffect: (fn, deps) => { const index = cursor++; if (!state[index] || deps.some((value, i) => value !== state[index][i])) { state[index] = deps; effects.push(fn); } }
  };
  const fluent = Object.fromEntries(['Checkbox', 'DefaultButton', 'Dialog', 'DialogFooter', 'Dropdown', 'Link', 'MessageBar', 'PrimaryButton', 'SearchBox', 'Spinner', 'Toggle', 'Icon', 'IconButton'].map(name => [name, name]));
  fluent.MessageBarType = {};
  const { SharePointRolesPage } = load('../src/webparts/helpdeskSystem/pages/SharePointRolesPage.tsx', { react, 'react-router-dom':{UNSAFE_NavigationContext:{}}, '@fluentui/react': fluent, '../components/cancelButtonStyles': {cancelButtonStyles: {}}, '../interfaces/IRoleManagement': roles, '../components/HelpdeskSystem.module.scss': { default: {} }, './SharePointUsersPage': { SharePointUsersPage: 'SharePointUsersPage' } });
  const config = roles.defaultRoleConfiguration();
  config.assignments = [{ userId: 7, name: 'Agent', email: 'agent@example.com', roleId: 'agent' }];
  const writes = [];
  const service = { roleManagement: { load: async () => structuredClone(config), save: async value => writes.push(structuredClone(value)) } };
  const render = () => { cursor = 0; tree = SharePointRolesPage({ service }); while (effects.length) effects.shift()(); return tree; };
  const find = (predicate, node = tree) => {
    if (!node || typeof node !== 'object') return undefined;
    if (predicate(node)) return node;
    return node.props?.children?.map(child => child === undefined ? undefined : find(predicate, child)).find(Boolean);
  };
  const click = text => { const node = find(node => node.props.text === text || node.props.children?.includes(text)); assert(node, `Missing ${text}`); node.props.onClick(); render(); };
  render(); await Promise.resolve(); render();
  click('Roles & Permissions');

  const all=(predicate,node=tree)=>!node || typeof node!=='object' ? [] : [...(predicate(node)?[node]:[]),...(node.props?.children||[]).flatMap(child=>child == null ? [] : all(predicate,child))];
  const filters=()=>find(node=>node.props.ariaLabel==='Filter permissions by access');
  const search=()=>find(node=>node.props.ariaLabel==='Search permissions');
  filters().props.onChange(null,{key:'enabled'});render();
  assert(all(node=>node.props.role==='switch' || node.props.role==='radio').every(node=>node.props['aria-checked']===true));
  filters().props.onChange(null,{key:'disabled'});render();
  assert(all(node=>node.props.role==='switch' || node.props.role==='radio').every(node=>node.props['aria-checked']===false));
  filters().props.onChange(null,{key:'all'});search().props.onChange(null,'priority');render();
  assert.equal(all(node=>node.props.role==='switch').length,1);
  assert.equal(find(node=>node.props.role==='switch').props['aria-label'],'Change Priority');
  assert(all(node=>node.props.scope==='rowgroup').every(node=>!node.props.children.some(child=>typeof child==='object')));
  search().props.onChange(null,'no-such-permission');render();
  assert(find(node=>node.props.children?.includes('No permissions match your search and access filter.')));
  search().props.onChange(null,'');click('Helpdesk Admin');
  filters().props.onChange(null,{key:'enabled'});render();
  assert(all(node=>node.props.role==='switch').length>0);
  assert(all(node=>node.props.role==='switch').every(node=>node.props['aria-checked']===true));
  assert.equal(writes.length,0,'Filtering does not save or modify roles');
  click('Edit');
  const permission=find(node=>node.props.role==='switch');permission.props.onClick();render();
  assert(find(node=>node.props.text==='Save'),'Save is available beside Edit');
  click('Agent');
  const warning=find(node=>node.type==='Dialog' && node.props.dialogContentProps?.title==='Unsaved permission changes');
  assert.equal(warning.props.hidden,false,'Switching roles warns before losing changes');
  click('Discard and Leave');
  assert.equal(find(node=>node.props.role==='switch').props.disabled,true,'Discard returns to saved permissions');
  assert.equal(writes.length,0,'Discard does not save');
  click('Helpdesk Admin');filters().props.onChange(null,{key:'all'});render();click('Edit');
  const settingsPermission=find(node=>node.props.role==='switch' && node.props['aria-label']==='Settings: Subcategories');
  assert(settingsPermission.props['aria-checked']);settingsPermission.props.onClick();render();
  assert(!find(node=>node.props['aria-label']==='Settings: Subcategories').props['aria-checked']);
  assert(find(node=>node.props['aria-label']==='Settings: Ticket List Schema (Super Admin only)').props.disabled);
  click('Save');assert(find(node=>node.props.children?.includes('Hide: Settings: Subcategories')),'Confirmation includes page access changes');
  click('Confirm Apply');await Promise.resolve();render();
  assert.equal(writes.length,1);const savedAdmin=writes[0].roles.find(role=>role.id==='admin');
  assert(savedAdmin.pageAccess.includes('settings'));assert(!savedAdmin.pageAccess.includes('subcategories'));
  assert.deepEqual(savedAdmin.actions,config.roles.find(role=>role.id==='admin').actions,'Page access changes do not change management permissions');
});

