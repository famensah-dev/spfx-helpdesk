const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:'https://example.org',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;global.CustomEvent=dom.window.CustomEvent;
const React=require('react'),ReactDOM=require('react-dom'),{act}=require('react-dom/test-utils');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const base='src/webparts/helpdeskSystem/';
const colors=load(base+'utils/themeColors.ts'),tokens=load(base+'utils/themeColorTokens.ts'),Chart={defaults:{}};
const {useDeskPilotAppearance,appearanceStorageKey}=load(base+'hooks/useDeskPilotAppearance.ts',{'chart.js':{Chart},'../utils/themeColors':colors,'../utils/themeColorTokens':tokens});
function App(){const {dark,toggle}=useDeskPilotAppearance();return React.createElement('button',{'aria-pressed':dark,onClick:toggle},dark?'Dark':'Light');}
const host=document.getElementById('app');
act(()=>{ReactDOM.render(React.createElement(App),host);});assert.equal(host.textContent,'Light');
act(()=>host.querySelector('button').click());assert.equal(window.localStorage.getItem(appearanceStorageKey),'dark');assert.equal(host.textContent,'Dark');
assert.equal(document.documentElement.style.getPropertyValue('--dp-bg-fff'),colors.darkColor('#fff','bg'));
assert.equal(Chart.defaults.color,'#c3c9d1');
act(()=>{ReactDOM.unmountComponentAtNode(host);ReactDOM.render(React.createElement(App),host);});assert.equal(host.textContent,'Dark','Preference survives reopening the app');
window.localStorage.setItem(appearanceStorageKey,'light');act(()=>{window.dispatchEvent(new window.StorageEvent('storage',{key:appearanceStorageKey,newValue:'light'}));});assert.equal(host.textContent,'Light');assert.equal(document.documentElement.style.getPropertyValue('--dp-bg-fff'),'');
const original=window.Storage.prototype.setItem;window.Storage.prototype.setItem=()=>{throw new Error('Storage blocked');};act(()=>host.querySelector('button').click());assert.equal(host.textContent,'Dark','Blocked storage must not prevent toggling');window.Storage.prototype.setItem=original;
assert.equal(colors.darkColor('#101e32','bg'),'#101e32','Preserve the header and brand backgrounds');
assert.equal(colors.darkenStyles({background:'#fff',color:'#172536'}).background,colors.darkColor('#fff','bg'));
function luminance(hex){const c=hex.slice(1).match(/../g).slice(0,3).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const surface=colors.darkColor('#fff','bg');
assert(contrast(colors.darkColor('#172536','fg'),surface)>10,'Main text must have strong contrast');
assert(contrast(colors.darkColor('#61728b','fg'),surface)>7,'Secondary text must stay readable');
assert.equal(colors.darkColor('#dce5f1','line'),'#344860','Card borders should be muted slate, not bright blue');
assert.equal(colors.darkColor('#1b385c','fg'),'#f1f3f5','Headings should use near-white text');
const literals=fs.readFileSync(base+'components/HelpdeskSystem.module.scss','utf8');assert(literals.includes('var(--dp-bg-fff, #fff)'),'Light surface colours remain exact fallbacks');
act(()=>{ReactDOM.unmountComponentAtNode(host);});dom.window.close();
console.log('Appearance passed: toggle, persistence, cross-tab updates, blocked storage, chart labels and light-theme fallbacks.');process.exit(0);
