const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:'https://example.com'});
for(const key of ['window','document','DOMParser','NodeFilter'])global[key]=key==='window'?dom.window:dom.window[key];
global.navigator=dom.window.navigator;
const React=require('react'),ReactDOM=require('react-dom'),{act,Simulate}=require('react-dom/test-utils'),h=React.createElement;
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(key=>deps[key]||require(key),m,m.exports);return m.exports;}
const {RichTextEditor}=load('src/webparts/helpdeskSystem/components/RichTextEditor.tsx',{
 '../utils/decodeHtmlEntities':{decodeHtmlEntities:value=>value},'./HelpdeskSystem.module.scss':{default:{}},
 '@fluentui/react':{Label:({children})=>h('label',null,children),IconButton:()=>null,Dropdown:()=>null,
 DefaultButton:({text,onClick,disabled})=>h('button',{onClick,disabled},text),SearchBox:({ariaLabel,value,onChange})=>h('input',{'aria-label':ariaLabel,value,onChange:event=>onChange(event,event.target.value)})}
});
const host=document.getElementById('app');let output;
(async()=>{
 await act(async()=>{ReactDOM.render(h(RichTextEditor,{plainText:true,label:'Subject',value:'Hi {{TicketTitle}}',placeholders:[{key:'TicketTitle',label:'Ticket Title'},{key:'RequesterName',label:'Requester Name'}],onChange:value=>{output=value;}}),host);});
 const editor=host.querySelector('[role="textbox"]');assert.equal(editor.querySelector('[data-email-token]').textContent,'Ticket Title');assert(!editor.textContent.includes('{{'));
 const range=document.createRange();range.setStart(editor.firstChild,3);range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);Simulate.mouseUp(editor);
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Insert Placeholder').click());
 await act(async()=>Simulate.change(host.querySelector('input'),{target:{value:'requester'}}));
 assert(![...host.querySelectorAll('button')].some(button=>button.textContent==='Ticket Title'),'Search narrows insertion choices');
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Requester Name').click());
 assert.equal(output,'Hi {{RequesterName}}{{TicketTitle}}','Insertion uses the saved cursor and serializes original template tokens');
 assert.equal(editor.querySelectorAll('[data-email-token]').length,2);
 await act(async()=>ReactDOM.unmountComponentAtNode(host));dom.window.close();console.log('Email placeholder editor passed: badges, search, cursor insertion and token serialization.');process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
