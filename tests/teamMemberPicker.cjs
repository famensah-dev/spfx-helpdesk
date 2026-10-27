const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:'https://example.com'});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'),ReactDOM=require('react-dom'),{act,Simulate}=require('react-dom/test-utils'),h=React.createElement;
function load(file,deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const fluent={Checkbox:p=>h('input',{type:'checkbox','aria-label':p.ariaLabel,checked:p.checked,disabled:p.disabled,onChange:e=>p.onChange(e,e.target.checked)}),PersonaCoin:()=>null,SearchBox:p=>h('input',{'aria-label':p.ariaLabel,value:p.value,disabled:p.disabled,onChange:e=>p.onChange(e,e.target.value)}),Spinner:p=>h('span',null,p.label),MessageBar:p=>h('div',{role:'alert'},p.children),MessageBarType:{error:1,warning:2}};
const {TeamMemberPicker}=load('src/webparts/helpdeskSystem/components/TeamMemberPicker.tsx',{'react':React,'@fluentui/react':fluent,'./HelpdeskSystem.module.scss':{default:{}}});
const {SharePointGroupAccess}=load('src/webparts/helpdeskSystem/services/SharePointGroupAccess.ts',{'@microsoft/sp-http':{SPHttpClient:{configurations:{v1:{}}}}});
const alex={id:'sp:7',sharePointId:7,displayName:'Alex',email:'alex@example.com',userPrincipalName:'alex@example.com'},bea={id:'sp:8',sharePointId:8,displayName:'Bea',email:'bea@example.com',userPrincipalName:'bea@example.com'},chris={id:'aad:9',displayName:'Chris',email:'chris@example.com',userPrincipalName:'chris@example.com'};
const host=document.getElementById('app');let chosen=[],searches=0;
const service={getTeamCandidates:async()=>[alex,bea],searchUsers:async()=>{searches++;return[{...bea,id:'aad:8'},chris];}};
function Harness(){const [users,setUsers]=React.useState([]);return h(TeamMemberPicker,{service,users,existingUserIds:[7],disabled:false,onChange:value=>{chosen=value;setUsers(value);}});}
(async()=>{
 await act(async()=>ReactDOM.render(h(Harness),host));assert.equal(searches,0);assert(host.textContent.includes('Bea'));assert(host.querySelector('[aria-label="Select Alex"]').disabled);assert(host.querySelector('[aria-label="Select Alex"]').checked);
 await act(async()=>Simulate.change(host.querySelector('[aria-label="Select Bea"]'),{target:{checked:true}}));assert.deepEqual(chosen.map(u=>u.displayName),['Bea']);
 await act(async()=>{Simulate.change(host.querySelector('[aria-label="Search team candidates"]'),{target:{value:'example'}});});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});assert.equal(host.querySelectorAll('[aria-label="Select Bea"]').length,1,'Directory and roster identities deduplicate');
 await act(async()=>Simulate.change(host.querySelector('[aria-label="Select Chris"]'),{target:{checked:true}}));assert.equal(chosen.length,2);
 await act(async()=>Simulate.change(host.querySelector('[aria-label="Search team candidates"]'),{target:{value:''}}));assert(host.querySelector('[aria-label="Select Bea"]').checked);assert(host.querySelector('[aria-label="Select Chris"]').checked);
 await act(async()=>ReactDOM.unmountComponentAtNode(host));
 const groups=new SharePointGroupAccess({pageContext:{web:{absoluteUrl:'https://example.sharepoint.com'}}});groups.groups=async()=>[{Id:1},{Id:2}];groups.collection=async()=>[{Id:7,Title:'Alex',Email:'alex@example.com',LoginName:'i:0#.f|membership|alex@example.com'}];
 const roster=await groups.members();assert.equal(roster.length,1);assert.equal(roster[0].sharePointId,7);assert.equal(roster[0].userPrincipalName,'alex@example.com');
 console.log('Team member picker passed: role roster, existing members, checked selection, directory fallback, identity deduplication and selection preservation.');dom.window.close();process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
