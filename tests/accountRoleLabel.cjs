const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const moduleObject={exports:{}};
global.window={location:{href:'https://example.sharepoint.com'}};
const source=ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/components/SharePointAccountMenu.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
new Function('require','module','exports',source)(name=>{
  if(name==='react')return React;
  if(name==='@fluentui/react')return {DefaultButton:props=>React.createElement('button',null,props.children)};
  if(name==='./HelpdeskSystem.module.scss')return {default:new Proxy({},{get:(_,key)=>String(key)})};
  throw new Error('Unexpected import '+name);
},moduleObject,moduleObject.exports);
const context={pageContext:{user:{displayName:'Jane Doe',email:'jane@example.com',loginName:'jane'},web:{absoluteUrl:'https://example.sharepoint.com'}}};
const html=renderToStaticMarkup(React.createElement(moduleObject.exports.SharePointAccountMenu,{context,role:'admin'}));
assert(html.includes('<span class="accountName"><span>Jane Doe</span><small class="accountRole">Administrator</small></span>'));
assert(!html.includes('Helpdesk Admin'));
console.log('Account role label passed: Admin appears beneath the user name.');
