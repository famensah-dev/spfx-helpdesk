const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),module,module.exports);return module.exports;}
const notifications=load('src/webparts/helpdeskSystem/interfaces/INotifications.ts');
const roles=load('src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');
const {SharePointRoleManagement}=load('src/webparts/helpdeskSystem/services/SharePointRoleManagement.ts',{'@microsoft/sp-http':{SPHttpClient:{configurations:{v1:{}}}},'../interfaces/IRoleManagement':roles,'../interfaces/INotifications':notifications});
(async()=>{
 const defaults=notifications.defaultNotificationSettings();notifications.validateNotificationSettings(defaults);assert.equal(defaults.enabled,false);assert.equal(defaults.mailbox,'');
 const enabled={...defaults,enabled:true,mailbox:'support@example.com',helpdeskEmails:'helpdesk@example.com',appUrl:'https://example.sharepoint.com/sites/support/SitePages/DeskPilot.aspx?env=WebView',flowUrl:'https://make.powerautomate.com/environments/test/flows/test/details'};
 notifications.validateNotificationSettings(enabled);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,mailbox:''}),/before enabling/);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,helpdeskEmails:'not-email'}),/valid mailbox/);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,flowUrl:'https://prod.logic.azure.com/workflows/test?sig=secret'}),/management link/);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,appUrl:enabled.appUrl+'&debug=true'}),/production/);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,rules:enabled.rules.map((rule,i)=>i?rule:{...rule,subject:'{{unknown}}'})}),/Unknown/);
 assert.throws(()=>notifications.validateNotificationSettings({...enabled,rules:enabled.rules.map((rule,i)=>i?rule:{...rule,requester:false,assignee:false,helpdesk:false})}),/recipient/);
 assert.deepEqual(notifications.emailAddresses('A@example.com;a@example.com, b@example.com\nc@example.com'),['a@example.com','b@example.com','c@example.com']);
 let configuration={...roles.defaultRoleConfiguration(),workspace:{title:'Test',description:'',listName:'Tickets',listId:'',resourceIds:{notificationLog:'11111111-1111-1111-1111-111111111111'}},notifications:defaults},version=1;const posts=[];
 const context={pageContext:{web:{absoluteUrl:'https://example.sharepoint.com/sites/support'}},spHttpClient:{get:async()=>({ok:true,headers:new Headers({ETag:String(version)}),json:async()=>({Id:1,Rules:JSON.stringify(configuration)})}),post:async(url,_client,options)=>{posts.push({url,options});configuration=JSON.parse(JSON.parse(options.body).Rules);version++;return{ok:true,status:204};}}};
 const service=new SharePointRoleManagement(context,true);service.itemId=1;
 await service.loadNotifications();await service.saveNotifications(enabled);assert.equal(posts.length,1);assert.equal(posts[0].options.headers['IF-MATCH'],'1');assert(!posts[0].url.includes('roleassignments'));assert.deepEqual(configuration.roles,roles.defaultRoleConfiguration().roles);assert.equal(configuration.notifications.mailbox,'support@example.com');
 version++;await assert.rejects(()=>service.saveNotifications(defaults),/another session/);assert.equal(posts.length,1);
 const denied=new SharePointRoleManagement(context,false);await assert.rejects(()=>denied.loadNotifications(),/site owners/);await assert.rejects(()=>denied.saveNotifications(defaults),/site owners/);
 await assert.rejects(()=>denied.notificationLog('11111111-1111-1111-1111-111111111111'),/site owners/);
 await assert.rejects(()=>service.notificationLog(),/Initialize workspace/);
 console.log('Notification settings checks passed: disabled defaults, addresses/URLs/tokens, private persistence, preserved roles, no permission sync and stale-edit protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
