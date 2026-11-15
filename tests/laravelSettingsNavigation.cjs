const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'https://example.com',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react');
const ReactDOM=require('react-dom');
const {act,Simulate}=require('react-dom/test-utils');
const h=React.createElement;
function load(file,deps={}){
  const module={exports:{}};
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText;
  new Function('require','module','exports',compiled)(name=>deps[name] || require(name),module,module.exports);
  return module.exports;
}
const button=p=>h('button',{type:p.type || 'button',disabled:p.disabled,onClick:p.onClick,'aria-label':p.ariaLabel},p.text);
const fluent={DefaultButton:button,PrimaryButton:button,Dialog:p=>p.hidden?null:h('div',{role:'dialog'},h('h3',null,p.dialogContentProps?.title),p.children),DialogFooter:p=>h('div',null,p.children),MessageBar:p=>h('div',{role:'alert'},p.children),MessageBarType:{error:1,success:2},Spinner:p=>h('div',{role:'status'},p.label),TextField:p=>h('label',null,p.label,h(p.multiline?'textarea':'input',{'aria-label':p.label,value:p.value,disabled:p.disabled,readOnly:p.readOnly,onChange:event=>p.onChange?.(event,event.target.value)}))};
fluent.SearchBox=p=>h('input',{'aria-label':p.ariaLabel,value:p.value,disabled:p.disabled,onChange:event=>p.onChange(event,event.target.value)});
fluent.Icon=()=>h('i',{'aria-hidden':'true'});
const groupPicker=load('src/webparts/helpdeskSystem/components/DepartmentGroupPicker.tsx',{'@fluentui/react':fluent,'./HelpdeskSystem.module.scss':{default:{}}});
const pages=load('src/webparts/helpdeskSystem/pages/LaravelAccessPages.tsx',{
  '@fluentui/react':fluent,
  './SharePointRolesPage':{SharePointRolesPage:p=>h('div',{'data-role-id':p.roleId,'data-view':p.view},h('button',{onClick:p.onBack},'Back to roles'))},
  '../interfaces/IRoleManagement':load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts'),
  './LaravelRoles.module.scss':{default:new Proxy({},{get:(_,key)=>String(key)})},
  '../components/cancelButtonStyles':{cancelButtonStyles:{}},
  '../components/DepartmentGroupPicker':groupPicker,
  '../components/HelpdeskSystem.module.scss':{default:new Proxy({},{get:(_,key)=>String(key)})}
});
const routes=load('src/webparts/helpdeskSystem/utils/appRoutes.ts');
const root=document.getElementById('app');
const findButton=text=>[...root.querySelectorAll('button')].find(node=>node.textContent===text);
const config={roles:[{id:'requester',name:'Requester',scope:'own',actions:[]},{id:'agent',name:'Agent',scope:'assignedOrCreated',actions:[]},{id:'admin',name:'Admin',scope:'all',actions:[]}],assignments:[]};

(async()=>{
  assert.equal(routes.resolveAppRoute('/settings/departments').adminSection,'departments');
  assert.equal(routes.resolveAppRoute('/settings/users').adminSection,'members');
  assert.equal(routes.resolveAppRoute('/settings/roles-permissions').adminSection,'permissions');
  const service={storageProvider:'laravel',access:{superAdmin:true},roleManagement:{load:async()=>config,supportedActions:['tickets','create']}};
  await act(async()=>ReactDOM.render(h(pages.LaravelRolesPage,{service}),root));
  assert.equal(root.querySelectorAll('article').length,4);
  assert(!root.textContent.includes('Submit support requests'),'Role cards omit descriptions');
  assert(!root.querySelector('article footer'),'Role cards omit the descriptive footer too');
  await act(async()=>root.querySelector('[aria-label="Manage permissions for Agent"]').click());
  assert.equal(root.querySelector('[data-role-id]').dataset.roleId,'agent');
  assert.equal(root.querySelector('[data-view]').dataset.view,'roles');
  await act(async()=>findButton('Back to roles').click());
  await act(async()=>root.querySelector('[aria-label="Manage permissions for Requester"]').click());
  assert.equal(root.querySelector('[data-role-id]').dataset.roleId,'requester');
  await act(async()=>findButton('Back to roles').click());
  await act(async()=>root.querySelector('[aria-label="Manage permissions for Super Admin"]').click());
  assert.equal(root.querySelector('[data-role-id]').dataset.roleId,'superAdmin');
  await act(async()=>ReactDOM.unmountComponentAtNode(root));

  const group1='11111111-1111-4111-8111-111111111111';
  const group2='22222222-2222-4222-8222-222222222222';
  let savedGroups;
  const scope={departments:[{id:4,name:'IT'}],selectedId:4,select(id){this.selectedId=id;},async create(name){this.departments.push({id:5,name});this.selectedId=5;},getGroups:async()=>[group1,group2],saveGroups:async ids=>{savedGroups=ids;}};
  service.settingsScope=scope;
  service.getDirectoryGroup=async id=>({id,displayName:id===group1?'IT staff':'Facilities staff'});
  service.searchDirectoryGroups=async query=>[{id:group2,displayName:'Facilities staff'}];
  await act(async()=>ReactDOM.render(h(pages.LaravelDepartmentsPage,{service,onChange:()=>{}}),root));
  await act(async()=>findButton('New department').click());
  await act(async()=>Simulate.change(root.querySelector('[aria-label="Department name"]'),{target:{value:'Facilities'}}));
  await act(async()=>Simulate.submit(root.querySelector('form')));
  assert(root.textContent.includes('Facilities'));
  assert(!root.querySelector('[role="dialog"]'));
  assert(!findButton('Manage group mappings'));
  assert(root.textContent.includes('Entra groups do not control department membership'));
  await act(async()=>ReactDOM.unmountComponentAtNode(root));
  await act(async()=>ReactDOM.render(h(pages.LaravelDepartmentsPage,{service:{...service,access:{superAdmin:false}},onChange:()=>{}}),root));
  assert(!findButton('New department'));
  assert(!findButton('View group mappings'));
  await act(async()=>ReactDOM.unmountComponentAtNode(root));
  dom.window.close();
  console.log('Laravel settings passed: separate routes, role descriptions, permission views, department creation and application-owned memberships.');
  process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
