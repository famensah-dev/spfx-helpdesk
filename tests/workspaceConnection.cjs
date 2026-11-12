const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const root='src/webparts/helpdeskSystem/', utils=load(root+'utils/workspaceConnection.ts');
const origin='https://tenant.sharepoint.com', connection={siteUrl:origin+'/sites/helpdesk',pageUrl:origin+'/sites/helpdesk/SitePages/DeskPilot.aspx?env=WebView'};
assert.deepEqual(utils.validateWorkspaceConnection(connection,origin),connection);
assert.equal(utils.validateWorkspaceConnection({...connection,pageUrl:connection.pageUrl+'&debug=true#/tickets/3'},origin).pageUrl,connection.pageUrl);
for(const bad of [
 {...connection,siteUrl:'https://other.sharepoint.com/sites/helpdesk'},
 {...connection,siteUrl:'http://tenant.sharepoint.com/sites/helpdesk'},
 {...connection,siteUrl:origin+'/_layouts/15/teamshostedapp.aspx'},
 {...connection,pageUrl:origin+'/sites/elsewhere/SitePages/DeskPilot.aspx'},
 {...connection,pageUrl:origin+'/_layouts/15/teamshostedapp.aspx'},
 {...connection,pageUrl:'https://tenant.sharepoint.com@evil.example/SitePages/DeskPilot.aspx'}
])assert.throws(()=>utils.validateWorkspaceConnection(bad,origin));
assert.notEqual(utils.connectionStorageKey(origin,'one'),utils.connectionStorageKey(origin,'two'));
const http={'@microsoft/sp-http':{SPHttpClient:{configurations:{v1:{}}}}};
const {SharePointGroupAccess}=load(root+'services/SharePointGroupAccess.ts',http);
const requests=[];const ctx={pageContext:{web:{absoluteUrl:origin},user:{displayName:'Staff',email:'staff@example.org'}},spHttpClient:{get:async url=>{requests.push(url);return Response.json({value:[{Title:'DeskPilot Agents'}]});}}};
(async()=>{
 assert.equal(await new SharePointGroupAccess(ctx,connection.siteUrl).currentRole(),'agent');
 assert(requests.every(url=>url.startsWith(connection.siteUrl+'/_api/web/')));
 const {SharePointRoleManagement}=load(root+'services/SharePointRoleManagement.ts',{...http,'../interfaces/IRoleManagement':load(root+'interfaces/IRoleManagement.ts')});
 requests.length=0;ctx.spHttpClient.get=async url=>{requests.push(url);if(url.includes('/currentuser?'))return Response.json({Id:7});if(url.includes("Title eq 'Workspace'"))return Response.json({value:[{Id:2,Rules:JSON.stringify({workspace:{title:'Helpdesk',description:'',listName:'Tickets',listId:''}})}]});return Response.json({value:[]});};
 const roles=new SharePointRoleManagement(ctx,false,undefined,'requester',connection.siteUrl);await roles.load();assert(requests.length>0);assert(requests.every(url=>url.startsWith(connection.siteUrl+'/_api/web/')));
 // Exercise the service factory itself, not just its connection screen.
 const constructors={};
 const fakeClass=name=>class {constructor(...args){constructors[name]=args;} async load(){return {roles:[],workspace:{title:'Helpdesk',listName:'Tickets',listId:''}};} getFaqs(){} getAccess(){} save(){} delete(){} updateMany(){} invalidateSchema(){} };
 const dependencies={...http,'../utils/workspaceConnection':utils,'../interfaces/IRoleManagement':load(root+'interfaces/IRoleManagement.ts'),'./appRoleRules':{applyAppRoleRules:()=>{throw Error('Unexpected role projection');}},'@pnp/sp':{spfi:()=>{},SPFx:()=>{}}};
 for(const name of ['webs','lists','views'])dependencies['@pnp/sp/'+name]={};
 for(const [path,name] of Object.entries({'./SharePointTicketViews':'SharePointTicketViews','./DepartmentFolderStore':'DepartmentFolderStore','./SharePointGroupAccess':'SharePointGroupAccess','./SharePointRoleManagement':'SharePointRoleManagement','./WorkspaceSetupService':'WorkspaceSetupService','./WorkspaceMaintenanceService':'WorkspaceMaintenanceService','./graph/GraphTicketService':'GraphTicketService','./graph/GraphFaqService':'GraphFaqService','./graph/GraphAdministrationService':'GraphAdministrationService','./graph/GraphSlaService':'GraphSlaService','./graph/GraphSupportUnitsService':'GraphSupportUnitsService','./graph/GraphNotificationService':'GraphNotificationService'}))dependencies[path]={[name]:fakeClass(name)};
 dependencies['./graph/GraphClient']={GraphClient:class {async get(){return {id:'aad-user'};}}};
 const {createSharePointService}=load(root+'services/SharePointTicketService.ts',dependencies);
 const factoryRequests=[];const factoryContext={...ctx,sdks:{microsoftTeams:{}},aadTokenProviderFactory:{getTokenProvider:async()=>({getToken:async()=> 'token'})},spHttpClient:{get:async url=>{factoryRequests.push(url);assert(url.startsWith(connection.siteUrl+'/_api/web'));return Response.json(url.includes('EffectiveBasePermissions')?{Low:1073741824|33554432}:url.includes('currentuser')?{Id:7}:{Url:connection.siteUrl});}}};
 await assert.rejects(createSharePointService(factoryContext,'Tickets'),/Connect Teams/);assert.equal(factoryRequests.length,0);
 const source=await createSharePointService(factoryContext,'Tickets',undefined,connection);
 assert.equal(source.access.siteUrl,connection.siteUrl);assert.deepEqual(source.workspaceConnection,connection);
 assert.equal(constructors.SharePointGroupAccess[1],connection.siteUrl);assert.equal(constructors.SharePointRoleManagement[4],connection.siteUrl);assert.equal(constructors.WorkspaceMaintenanceService[2],connection.siteUrl);assert.equal(constructors.SharePointTicketViews[0],connection.siteUrl);assert.equal(constructors.GraphTicketService[1].siteUrl,connection.siteUrl);assert.equal(constructors.GraphNotificationService[4],connection.pageUrl);

 // Department folders must not silently widen the saved Agent ticket scope.
 let agentRolePassed;
 const agentDefinitions=load(root+'interfaces/IRoleManagement.ts').defaultRoleConfiguration();
 agentDefinitions.roles[0].scope='assignedOrCreated';
 agentDefinitions.workspace={title:'Helpdesk',description:'',listName:'Tickets',listId:''};
 dependencies['./SharePointGroupAccess']={SharePointGroupAccess:class {async currentRole(){return 'agent';}}};
 dependencies['./SharePointRoleManagement']={SharePointRoleManagement:class {async load(){return structuredClone(agentDefinitions);}}};
 dependencies['./appRoleRules']={applyAppRoleRules:(source,role)=>{agentRolePassed=role;return source;}};
 const agentFactory=load(root+'services/SharePointTicketService.ts',dependencies).createSharePointService;
 const agentContext={...factoryContext,spHttpClient:{get:async url=>Response.json(url.includes('EffectiveBasePermissions')?{Low:0}:url.includes('currentuser')?{Id:16}:{Url:connection.siteUrl})}};
 await agentFactory(agentContext,'Tickets',undefined,connection);assert.equal(agentRolePassed.scope,'assignedOrCreated');
 agentDefinitions.workspace.departmentFolders={enabled:true};
 await agentFactory(agentContext,'Tickets',undefined,connection);assert.equal(agentRolePassed.scope,'assignedOrCreated','Department folders do not grant all-ticket scope');
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="app"></div>',{url:origin+'/_layouts/15/teamshostedapp.aspx#/tickets',pretendToBeVisual:true});global.window=dom.window;global.document=dom.window.document;global.navigator=dom.window.navigator;
 const React=require('react'),ReactDOM=require('react-dom'),{act,Simulate}=require('react-dom/test-utils'),h=React.createElement;
 const button=({text,ariaLabel,onClick,disabled,type})=>h('button',{onClick,disabled,type,'aria-label':ariaLabel},text||ariaLabel);
 const fluent={Icon:()=>null,IconButton:button,PrimaryButton:button,DefaultButton:button,Spinner:()=>h('span',null,'Connecting'),TextField:({label,value,onChange})=>h('label',null,label,h('input',{'aria-label':label,value,onChange:e=>onChange(e,e.target.value)}))};
 let defaultPointer;const calls=[];const teamsCtx={...ctx,sdks:{microsoftTeams:{}},spHttpClient:{get:async()=>defaultPointer?Response.json(defaultPointer):new Response('',{status:404})}};
 const System=load(root+'components/HelpdeskSystem.tsx',{'@fluentui/react':fluent,...http,'../utils/workspaceConnection':utils,'../utils/appRoutes':load(root+'utils/appRoutes.ts'),'./HelpdeskSystem.module.scss':{default:{}},'../services/SharePointTicketService':{createSharePointService:async(context,name,id,selected)=>{assert(selected,'Teams must never connect implicitly to root');calls.push(selected);return {access:{email:'staff@example.org'},workspaceConnection:selected};}},'./HelpdeskApp':{default:({service,accountActions})=>h('div',null,service.workspaceConnection.siteUrl,accountActions)},'./SharePointAccountMenu':{SharePointAccountMenu:()=>null},'./SharePointSettingsMenu':{SharePointSettingsMenu:()=>null},'../pages/SettingsPage':{SettingsPage:()=>null}}).default;
 const host=document.getElementById('app');const render=async()=>act(async()=>{ReactDOM.render(h(System,{spContext:teamsCtx,listName:'Tickets'}),host);});
 await render();assert(host.textContent.includes('Connect Your DeskPilot Workspace'));assert.equal(calls.length,0);
 await act(async()=>{for(const [label,value] of [['Workspace SharePoint Site URL',connection.siteUrl],['DeskPilot Page URL',connection.pageUrl]])Simulate.change(host.querySelector(`input[aria-label="${label}"]`),{target:{value}});});
 await act(async()=>Simulate.submit(host.querySelector('form')));assert.deepEqual(calls[0],connection);assert(host.textContent.includes(connection.siteUrl));
 assert.deepEqual(JSON.parse(window.localStorage.getItem(utils.connectionStorageKey(origin,'staff@example.org'))),connection);
 await act(async()=>ReactDOM.unmountComponentAtNode(host));await render();assert.deepEqual(calls[1],connection,'Remembered connection survives reopening');
 await act(async()=>ReactDOM.unmountComponentAtNode(host));defaultPointer={siteUrl:origin+'/sites/new',pageUrl:origin+'/sites/new/SitePages/DeskPilot.aspx'};await render();assert.deepEqual(calls[2],defaultPointer,'Shared default overrides stale browser connection');
 await act(async()=>ReactDOM.unmountComponentAtNode(host));dom.window.close();console.log('Workspace connection checks passed: tenant validation, role/group target isolation, Teams fail-closed setup, persistence and shared default precedence.');process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
