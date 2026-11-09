const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:'https://example.com',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'),ReactDOM=require('react-dom'),{act}=require('react-dom/test-utils'),h=React.createElement;
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(key=>deps[key]||require(key),m,m.exports);return m.exports;}
const roles=load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');
const fluent={DefaultButton:({text,onClick,disabled})=>h('button',{onClick,disabled},text),PrimaryButton:({text,onClick,disabled})=>h('button',{onClick,disabled},text),Spinner:({label})=>h('div',{role:'status'},label),MessageBar:({children})=>h('div',null,children),MessageBarType:{error:1},Icon:()=>null,Dialog:()=>null,DialogFooter:()=>null,Dropdown:({label})=>h('div',null,label)};
const {SharePointRolesPage}=load('src/webparts/helpdeskSystem/pages/SharePointRolesPage.tsx',{'@fluentui/react':fluent,'../interfaces/IRoleManagement':roles,'../components/HelpdeskSystem.module.scss':{default:{}},'../components/cancelButtonStyles':{cancelButtonStyles:{}},'./SharePointUsersPage':{SharePointUsersPage:()=>h('div',null,'User list')}});
const host=document.getElementById('app');let rejectFirst,calls=0;
const pending=new Promise((resolve,reject)=>{rejectFirst=reject;});
const service={roleManagement:{load:()=>++calls===1 ? pending : Promise.resolve(roles.defaultRoleConfiguration())}};
const button=text=>[...host.querySelectorAll('button')].find(item=>item.textContent===text);
(async()=>{
 await act(async()=>ReactDOM.render(h(SharePointRolesPage,{service}),host));
 assert(host.querySelector('[role="status"]'));assert(!button('Retry'),'No retry before results arrive');
 await act(async()=>rejectFirst(new Error('Connection failed')));assert(button('Retry'));assert(!host.querySelector('[role="status"]'));
 await act(async()=>button('Retry').click());assert(host.textContent.includes('User list'));assert(!button('Retry'));
 await act(async()=>button('Roles & Permissions').click());
 const nav=host.querySelector('nav[aria-label="Role permissions"]');assert(nav);assert.equal(nav.querySelectorAll('button').length,2);assert(!nav.textContent.includes('Requester'));
 await act(async()=>[...nav.querySelectorAll('button')].find(item=>item.textContent==='Helpdesk Admin').click());
 assert.equal(nav.querySelector('[aria-current="page"]').textContent,'Helpdesk Admin');
 await act(async()=>ReactDOM.unmountComponentAtNode(host));dom.window.close();console.log('Role loading passed: pending, failed, retry success and role tabs.');process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
