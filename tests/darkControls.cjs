const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:'https://example.org',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
window.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
const React=require('react'),ReactDOM=require('react-dom'),{act}=require('react-dom/test-utils');
const {ThemeProvider,PrimaryButton,Checkbox,Layer,createTheme,mergeStyles}=require('@fluentui/react');
const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/components/darkControlStyles.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m.exports,m);
const {darkControlSelectors,darkActionColors}=m.exports;
function lum(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){return (Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);}
assert(contrast(darkActionColors.fill,darkActionColors.text)>7);
assert(contrast(darkActionColors.fill,'#1a2c43')>3);
assert(contrast(darkActionColors.outline,'#1a2c43')>3);
assert(contrast('#ffffff',darkActionColors.nativeChecked)>4.5);
const h=React.createElement,host=document.getElementById('app');
const theme=createTheme({components:{Layer:{styles:{root:{selectors:darkControlSelectors}}}}});
(async()=>{
 await act(async()=>{ReactDOM.render(h(ThemeProvider,{theme,className:mergeStyles({selectors:darkControlSelectors})},h(PrimaryButton,{text:'Submit',styles:{root:{background:'#1b385c',color:'#fff'}}}),h(Checkbox,{label:'Selected',checked:true,onChange:()=>{}}),h(Layer,null,h(PrimaryButton,{text:'Dialog Submit',styles:{root:{background:'#1b385c',color:'#fff'}}}))),host);await new Promise(resolve=>setTimeout(resolve,30));});
 const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='Submit');
 // JSDOM does not consistently honor selector specificity across Fluent's style
 // sheets. Verify that the real elements match the scoped !important rules.
 const rules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]);
 const hasActionFill=element=>rules.some(rule=>rule.selectorText&&rule.style.getPropertyValue('background-color')==='#91bfff'&&rule.style.getPropertyPriority('background-color')==='important'&&element.matches(rule.selectorText));
 assert(hasActionFill(button));
 const portal=[...document.querySelectorAll('button')].find(item=>item.textContent==='Dialog Submit');assert(portal);
 assert(hasActionFill(portal),'Portaled controls must receive the same action styling');
 const box=document.querySelector('.ms-Checkbox-checkbox');
 assert(rules.some(rule=>rule.selectorText&&rule.style.getPropertyValue('background-color')===darkActionColors.nativeChecked&&box.matches(rule.selectorText)));
 const tick=document.querySelector('.ms-Checkbox-checkmark');
 assert(rules.some(rule=>rule.selectorText&&rule.style.getPropertyValue('color')==='#ffffff'&&tick.matches(rule.selectorText)));
 await act(async()=>{ReactDOM.unmountComponentAtNode(host);});dom.window.close();console.log('Dark controls passed: contrast, checked states, primary actions and portaled dialogs.');process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
