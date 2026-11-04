const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'https://example.org',pretendToBeVisual:true});global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'),ReactDOM=require('react-dom'),{act,Simulate}=require('react-dom/test-utils'),h=React.createElement;
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(key=>deps[key]||require(key),m,m.exports);return m.exports;}
const events=load('src/webparts/helpdeskSystem/interfaces/INotifications.ts');
const {NotificationRulesCards}=load('src/webparts/helpdeskSystem/components/NotificationRulesCards.tsx',{'../interfaces/INotifications':events,'./HelpdeskSettingsLayout.module.scss':{default:{}},'@fluentui/react':{Icon:()=>null,Toggle:({label,ariaLabel,checked,disabled,onChange})=>h('input',{type:'checkbox','aria-label':ariaLabel||label,checked,disabled,onChange:e=>onChange(e,e.target.checked)})}});
let value={enabled:true,autoInvite:false,rules:Object.fromEntries(events.notificationEvents.map(key=>[key,{email:true,inApp:key!=='invited'}]))},opened;
const host=document.getElementById('app');
async function render(){await act(async()=>{ReactDOM.render(h(NotificationRulesCards,{value,busy:false,saveControl:h('button',null,'Save'),onChange:next=>{value=next;},onTemplate:key=>{opened=key;}}),host);});}
async function toggle(label,checked){await act(async()=>Simulate.change(host.querySelector(`[aria-label="${label}"]`),{target:{checked}}));await render();}
(async()=>{
 await render();assert.equal(host.querySelectorAll('tbody tr').length,4);assert(host.querySelector('section[aria-label="User invitations"]'));
 await toggle('Enable ticket notifications',false);assert.equal(value.enabled,false);assert.equal(value.autoInvite,false);assert.equal(value.rules.invited.email,true);
 await toggle('Ticket Assigned email',false);assert.equal(value.rules.assigned.email,false);assert.equal(value.rules.assigned.inApp,true);assert.equal(value.rules.created.email,true);
 await toggle('Send invitation automatically',true);assert.equal(value.autoInvite,true);assert.equal(value.enabled,false,'Invitation setting is independent of the ticket master switch');
 await toggle('Enable Invitation Email',false);assert(host.querySelector('[aria-label="Send invitation automatically"]').disabled);assert.equal(value.rules.created.email,true);
 await act(async()=>[...host.querySelectorAll('button')].find(item=>item.textContent==='Ticket Resolved').click());assert.equal(opened,'resolved');
 await act(async()=>[...host.querySelectorAll('button')].find(item=>item.textContent==='Edit Invitation Template').click());assert.equal(opened,'invited');
 await act(async()=>ReactDOM.unmountComponentAtNode(host));dom.window.close();console.log('Notification cards passed: four ticket events, isolated channel toggles, independent invitations and template navigation.');process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
