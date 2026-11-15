const assert = require('node:assert/strict');
const fs = require('fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="app"></div>', {url:'https://example.com',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'), ReactDOM=require('react-dom');
const {act,Simulate}=require('react-dom/test-utils');
const h=React.createElement;
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(n=>deps[n]||require(n),m,m.exports);return m.exports;}
const Button=p=>h('button',{onClick:p.onClick,disabled:p.disabled,'aria-label':p.ariaLabel},p.text||p.ariaLabel);
const fluent={DefaultButton:Button,PrimaryButton:Button,IconButton:p=>h('span',null,h(Button,p),p.menuProps?.items.map(item=>h('button',{key:item.key,'data-action':item.key},item.text))),
  Dialog:p=>p.hidden?null:h('section',{'role':'dialog'},p.children),DialogFooter:p=>h('footer',null,p.children),
  TextField:p=>h('input',{'aria-label':p.ariaLabel,value:p.value||'',disabled:p.disabled,onChange:e=>p.onChange(e,e.target.value)}),
  SearchBox:p=>h('input',{'aria-label':p.ariaLabel,onChange:e=>p.onChange(e,e.target.value)}),
  Dropdown:p=>h('select',{'aria-label':p.ariaLabel,value:p.selectedKey,disabled:p.disabled,onChange:e=>p.onChange(e,{key:e.target.value})},p.options.map(o=>h('option',{key:o.key,value:o.key},o.text))),
  Icon:()=>null,MessageBar:p=>h('p',null,p.children),MessageBarType:{error:1},Spinner:p=>h('p',null,p.label),PersonaCoin:()=>null,PersonaSize:{size24:24,size32:32}};
const contracts=load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');
const {SharePointUsersPage}=load('src/webparts/helpdeskSystem/pages/SharePointUsersPage.tsx',{
  '@fluentui/react':fluent,'../components/UserDetailsPanel':{UserDetailsPanel:()=>null},
  '../components/cancelButtonStyles':{cancelButtonStyles:{}},'../components/HelpdeskSystem.module.scss':{default:new Proxy({},{get:(_,key)=>key})}});
const root=document.getElementById('app');
const find=text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
(async()=>{
  let saved;
  const people=[{id:'a',displayName:'Alice',email:'alice@example.com',userPrincipalName:'alice@example.com'},{id:'b',displayName:'Bob',email:'bob@example.com',userPrincipalName:'bob@example.com'}];
  const service={storageProvider:'laravel',searchDirectoryUsers:async()=>people,resolveUser:async user=>({Id:user.id==='a'?1:2})};
  const configuration=contracts.defaultRoleConfiguration();
  const props={service,configuration,busy:false,onReload:async()=>{},onSave:async rows=>{saved=rows;}};
  await act(async()=>ReactDOM.render(h(SharePointUsersPage,props),root));
  await act(async()=>find('Admins').click());
  await act(async()=>find('Add Users').click());
  await act(async()=>Simulate.change(root.querySelector('[aria-label="Search organization users"]'),{target:{value:'al'}}));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  assert(root.querySelector('table[aria-label="Directory search results"]'));
  assert.equal(root.querySelector('[aria-label="Role for Alice"]').value,'admin');
  await act(async()=>root.querySelector('[aria-label="Select Alice"]').click());
  await act(async()=>Simulate.change(root.querySelector('[aria-label="Role for Alice"]'),{target:{value:'requester'}}));
  assert(root.querySelector('table[aria-label="Users to add"]').textContent.includes('alice@example.com'));
  await act(async()=>Simulate.change(root.querySelector('[aria-label="Search organization users"]'),{target:{value:'bo'}}));
  await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  await act(async()=>root.querySelector('[aria-label="Select Bob"]').click());
  assert.equal(root.querySelector('[aria-label="Role for Bob"]').value,'admin');
  await act(async()=>[...root.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent==='Add Users').click());
  assert.deepEqual(saved.map(user=>user.roleId),['requester','admin']);
  await act(async()=>ReactDOM.unmountComponentAtNode(root));
  const readonly={...props,readOnly:true,configuration:{...configuration,assignments:[{userId:3,name:'Protected',email:'protected@example.com',roleId:'agent',canManage:false}]}};
  await act(async()=>ReactDOM.render(h(SharePointUsersPage,readonly),root));
  assert(!find('Add Users'));
  assert(!root.querySelector('[data-action="role"]'));
  assert(!root.querySelector('[data-action="status"]'));
  assert(!root.querySelector('[data-action="remove"]'));
  assert(root.querySelector('[data-action="details"]'));
  await act(async()=>ReactDOM.unmountComponentAtNode(root));
  dom.window.close();
  console.log('Department users passed: tab defaults, per-person roles, table results and hidden unauthorized actions.');
  process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
