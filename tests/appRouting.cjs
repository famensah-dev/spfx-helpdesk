const assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="app"></div>',{url:'https://tenant.sharepoint.com/sites/support/SitePages/DeskPilot.aspx?env=WebView&source=portal#/tickets/123',pretendToBeVisual:true});
global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
const React=require('react'), ReactDOM=require('react-dom'), {act}=require('react-dom/test-utils');
const Router=require('react-router-dom');
function load(file,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name] || require(name),module,module.exports);return module.exports;}
const root='src/webparts/helpdeskSystem/';
const routes=load(root+'utils/appRoutes.ts');
for(const [page,path] of Object.entries(routes.pagePaths))assert.equal(routes.resolveAppRoute(path).page,page);
assert.equal(routes.resolveAppRoute('/tickets/123').ticketId,123);
for(const path of ['/tickets/0','/tickets/-1','/tickets/abc','/tickets/9007199254740993','/unknown'])assert.equal(routes.resolveAppRoute(path).notFound,true);
assert.equal(routes.resolveAppRoute('/settings/teams').adminSection,'units');
assert.equal(routes.resolveAppRoute('/workspace-settings/sharepoint').workspaceSection,'SharePoint Settings');
const link=new URL(routes.ticketLink(window.location.href,321));assert.equal(link.search,'?env=WebView&source=portal');assert.equal(link.pathname,'/sites/support/SitePages/DeskPilot.aspx');assert.equal(link.hash,'#/tickets/321');
const h=React.createElement;
const button=(text,onClick)=>h('button',{onClick},text);
const fluent={createTheme:()=>({}),ThemeProvider:({children})=>h('div',null,children),Icon:()=>null,MessageBar:({children})=>h('div',{role:'alert'},children),MessageBarType:{error:1,warning:2},Spinner:({label})=>h('div',null,label),DefaultButton:({text,onClick})=>button(text,onClick)};
const style={default:new Proxy({},{get:(_,key)=>String(key)})};
const rules=load(root+'services/appRoleRules.ts');
let data={tickets:[{Id:123,Title:'Printer offline'}],loading:false,error:null,warnings:[],assignmentIdentityAvailable:true,filteredTickets:[],refresh:async()=>{}};
const app=load(root+'components/HelpdeskApp.tsx',{
 'react-router-dom':Router,'@fluentui/react':fluent,'../utils/appRoutes':routes,'../services/appRoleRules':rules,'./HelpdeskSystem.module.scss':style,
 './WorkspaceSetupPanel':{MissingWorkspaceNotice:()=>null},'../hooks/useHelpdeskDashboard':{useHelpdeskDashboard:()=>data},
 '../pages/DashboardPage':{DashboardPage:p=>h('div',null,'Dashboard content',button('Open dashboard ticket',()=>p.onOpenTicket(123)))},
 '../pages/TicketListPage':{TicketListPage:p=>h('div',null,p.creating?'New ticket form':'Tickets content '+p.view,button('Open list ticket',()=>p.onOpenTicket(123)),button('Show archive',()=>p.onViewChange('Archive')),button('Create ticket',()=>p.onCreatingChange(true)))},
 './TicketDetails':{TicketDetails:p=>h('div',null,'Ticket '+p.ticket.Id,button('Return from ticket',p.onBack))},
 '../pages/FaqPage':{FaqPage:()=>h('div',null,'Knowledge Base content')},
 '../pages/AdministrationPage':{AdministrationPage:p=>h('div',null,'Settings '+p.section,button('Open teams',()=>p.onSectionChange('units')))},
 '../pages/SharePointRolesPage':{SharePointRolesPage:()=>h('div',null,'Users and roles content')}
});
const service={access:{admin:true,superAdmin:true},workspaceSettings:{title:'IT'},supportUnits:{},roleManagement:{},createTicket:async()=>{}};
let finishConnection;
let connection=new Promise(resolve=>{finishConnection=resolve;});
const System=load(root+'components/HelpdeskSystem.tsx',{
 'react-router-dom':Router,'../utils/appRoutes':routes,'react':React,'@fluentui/react':fluent,'./HelpdeskApp':app,'./HelpdeskSystem.module.scss':style,
 '../services/SharePointTicketService':{createSharePointService:async()=>{await connection;return service;}},
 './SharePointAccountMenu':{SharePointAccountMenu:()=>null},'./SharePointSettingsMenu':{SharePointSettingsMenu:p=>button('Open workspace settings',p.onOpenSettings)},
 '../pages/SettingsPage':{SettingsPage:p=>h('div',null,'Workspace '+p.section,button('SharePoint section',()=>p.onSectionChange('SharePoint Settings')),button('Leave workspace',p.onBack))}
}).default;
const container=document.getElementById('app');
async function render(){await act(async()=>{ReactDOM.render(h(System,{spContext:{pageContext:{user:{email:'admin@example.com'}}},listName:'Tickets'}),container);});}
async function click(text){const b=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert(b,'Missing button '+text);await act(async()=>b.click());}
async function hash(path){await act(async()=>{window.location.hash=path;await new Promise(resolve=>setTimeout(resolve,10));});}
function unchanged(){assert.equal(window.location.search,'?env=WebView&source=portal');assert.equal(window.location.pathname,'/sites/support/SitePages/DeskPilot.aspx');}
(async()=>{
 await render();assert(container.textContent.includes('Connecting to your workspace'));assert.equal(window.location.hash,'#/tickets/123','Connection startup must preserve the incoming ticket route');
 await act(async()=>{finishConnection();await connection;});assert(container.textContent.includes('Ticket 123'),'Shared URL must open ticket directly');unchanged();
 await click('Return from ticket');assert.equal(window.location.hash,'#/tickets');
 await click('Show archive');assert(window.location.hash.includes('view=Archive'));
 await act(async()=>ReactDOM.unmountComponentAtNode(container));await render();assert(container.textContent.includes('Tickets content Archive'),'Refresh/remount retains view');
 await click('Open list ticket');assert.equal(window.location.hash,'#/tickets/123');await click('Return from ticket');assert(window.location.hash.includes('view=Archive'),'Return preserves list view');
 await click('Dashboard');await click('Open dashboard ticket');await click('Return from ticket');assert.equal(window.location.hash,'#/dashboard');
 await click('Knowledge Base');assert.equal(window.location.hash,'#/knowledge-base');
 await click('Helpdesk Settings');await click('Open teams');assert.equal(window.location.hash,'#/settings/teams');
 await act(async()=>ReactDOM.unmountComponentAtNode(container));await render();assert(container.textContent.includes('Settings units'));
 await click('Open workspace settings');await click('SharePoint section');assert.equal(window.location.hash,'#/workspace-settings/sharepoint');await click('Leave workspace');assert.equal(window.location.hash,'#/settings/teams');
 await hash('/tickets/new');assert(container.textContent.includes('New ticket form'));
 await hash('/tickets/999');assert(container.textContent.includes('not found or you do not have access'));
 data={...data,loading:true};await hash('/tickets/123');assert(container.textContent.includes('Loading ticket'));data={...data,loading:false};
 await hash('/not-a-page');assert(container.textContent.includes('page was not found'));
 await hash('/tickets');await click('Knowledge Base');await act(async()=>{window.history.back();await new Promise(resolve=>setTimeout(resolve,25));});assert.equal(window.location.hash,'#/tickets');
 await act(async()=>{window.history.forward();await new Promise(resolve=>setTimeout(resolve,25));});assert.equal(window.location.hash,'#/knowledge-base');
 service.roleRules={actions:['tickets'],scope:'assigned'};await hash('/dashboard');assert(container.textContent.includes('permission'));await hash('/workspace-settings');assert(container.textContent.includes('Workspace General'));
 service.access.superAdmin=false;await hash('/tickets');await hash('/workspace-settings');assert(container.textContent.includes('permission'),'Workspace settings stay restricted');
 unchanged();await act(async()=>ReactDOM.unmountComponentAtNode(container));dom.window.close();
 console.log('Hash routing checks passed: deep links, refresh, views, settings, loading/missing tickets, permissions, Back/Forward and env=WebView preservation.');
 // React 17's scheduler retains its MessageChannel in the browser simulation.
 process.exit(0);
})().catch(error=>{console.error(error);dom.window.close();process.exit(1);});
