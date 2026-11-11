const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const base='src/webparts/helpdeskSystem/';const content=load(base+'pages/documentationContent.ts');const {documentationTopics:topics,searchDocumentation:search}=content;
assert.equal(new Set(topics.map(topic=>topic.id)).size,topics.length);for(const topic of topics)for(const id of topic.related||[])assert(topics.some(other=>other.id===id),'Related topic exists: '+id);
assert(search('10 minutes').some(topic=>topic.id==='comments'),'Search finds instructions, not only headings');assert(search('chatbot').some(topic=>topic.id==='quick-help'),'Search includes alternate names');assert(search('who can edit').some(topic=>topic.id==='roles'));assert.equal(search('zzznothingmatches').length,0);assert.equal(search('  ').length,topics.length);
const routes=load(base+'utils/appRoutes.ts');assert.equal(routes.resolveAppRoute('/documentation').page,'Documentation');
const dom=new JSDOM('<div id="app"></div>',{pretendToBeVisual:true});global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'),ReactDOM=require('react-dom'),{act,Simulate}=require('react-dom/test-utils'),h=React.createElement;
const {DocumentationPage}=load(base+'pages/DocumentationPage.tsx',{'./documentationContent':content,'@fluentui/react':{Icon:()=>null,SearchBox:p=>h('input',{'aria-label':p.ariaLabel,value:p.value,onChange:event=>p.onChange(event,event.target.value)})}});
const host=document.getElementById('app');
(async()=>{
 await act(async()=>ReactDOM.render(h(DocumentationPage),host));assert.equal(host.querySelector('article h3').textContent,'Welcome to DeskPilot');assert(host.querySelector('nav[aria-label="Documentation topics"]'));
 await act(async()=>Simulate.change(host.querySelector('input'),{target:{value:'10 minutes'}}));assert.equal(host.querySelector('article h3').textContent,'Add or Delete a Comment');assert(host.querySelector('[role="status"]').textContent.includes('found'));
 await act(async()=>Simulate.change(host.querySelector('input'),{target:{value:'zzznothingmatches'}}));assert(host.textContent.includes('No topics match'));
 await act(async()=>[...host.querySelectorAll('button')].find(button=>button.textContent==='Browse All Topics').click());assert(host.querySelector('nav').textContent.includes('Getting Started'));
 await act(async()=>[...host.querySelectorAll('nav button')].find(button=>button.textContent==='Create a Ticket').click());assert.equal(host.querySelector('article h3').textContent,'Create a Ticket');assert(host.querySelector('article ol'));
 ReactDOM.unmountComponentAtNode(host);dom.window.close();console.log('Documentation passed: search, synonyms, links, navigation, results and route');process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
