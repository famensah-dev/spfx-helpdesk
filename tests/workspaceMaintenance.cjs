const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, dependencies = {}) {const module = {exports:{}}; const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText; new Function('require','module','exports',code)(name => dependencies[name] || require(name),module,module.exports); return module.exports;}
const contracts = load('src/webparts/helpdeskSystem/interfaces/IWorkspaceSetup.ts');
const {WorkspaceMaintenanceService, maintenancePhrase} = load('src/webparts/helpdeskSystem/services/WorkspaceMaintenanceService.ts', {'@microsoft/sp-http':{SPHttpClient:{configurations:{v1:{}}}},'../interfaces/IWorkspaceSetup':contracts});
(async () => {
  let owner = true, writes = [], saved = 0;
  let configuration = {roles:[{id:'agent'}],assignments:[{userId:7}],workspace:{title:'Support',description:'',listName:'Tickets',listId:'tickets',resourceIds:{tickets:'tickets',categories:'categories',access:'access',subcategories:'missing'}}};
  let lists = [
    {Id:'tickets',Title:'Tickets',ItemCount:2,BaseTemplate:100,Hidden:false},
    {Id:'categories',Title:'Ticket Categories',ItemCount:1,BaseTemplate:100,Hidden:false},
    {Id:'access',Title:'DeskPilot Access',ItemCount:3,BaseTemplate:100,Hidden:true},
    {Id:'docs',Title:'Documents',ItemCount:3,BaseTemplate:101,Hidden:false},
    {Id:'unrelated',Title:'Unrelated',ItemCount:0,BaseTemplate:100,Hidden:false}
  ];
  let items = [{Id:1},{Id:2}];
  const context = {pageContext:{web:{absoluteUrl:'https://tenant.sharepoint.com/sites/support'}},spHttpClient:{
    get:async url => ({ok:true,json:async () => url.endsWith('EffectiveBasePermissions') ? {Low:owner ? String(1073741824 | 33554432) : '0'} : url.includes('/items?') ? {value:items.slice(0,1)} : {value:lists}}),
    post:async url => {writes.push(url); if (url.includes('/items(')) items.shift(); else lists = lists.filter(list => !url.includes(`guid'${list.Id}'`)); return {ok:true};}
  }};
  const roles = {load:async () => structuredClone(configuration),save:async value => {saved++; configuration = structuredClone(value);}};
  const service = new WorkspaceMaintenanceService(context,roles);
  assert.deepEqual((await service.lists()).map(value => value.Id),['tickets','categories']);
  await assert.rejects(() => service.inspect('drop',['access']), /Select only/);
  await assert.rejects(() => service.inspect('drop',['docs']), /Select only/);
  await assert.rejects(() => service.inspect('drop',['unrelated']), /Select only/);
  await service.inspect('clear',['tickets']);
  await assert.rejects(() => service.run('clear',['tickets'],'wrong',()=>{}), /confirmation/);
  assert.equal(writes.length,0);
  owner = false;
  await assert.rejects(() => service.run('clear',['tickets'],maintenancePhrase('clear'),()=>{}), /requires SharePoint/);
  assert.equal(writes.length,0);
  owner = true;
  await service.inspect('clear',['tickets']);
  lists[0].ItemCount = 3;
  await assert.rejects(() => service.run('clear',['tickets'],maintenancePhrase('clear'),()=>{}), /Resources changed/);
  assert.equal(writes.length,0);
  await service.inspect('clear',['tickets']);
  await service.run('clear',['tickets'],maintenancePhrase('clear'),()=>{});
  assert.equal(writes.length,2); assert.equal(items.length,0); assert.equal(saved,0);
  await service.inspect('drop',['tickets']);
  await service.run('drop',['tickets'],maintenancePhrase('drop'),()=>{});
  assert.equal(configuration.workspace.listId,''); assert.equal(configuration.workspace.resourceIds.tickets,undefined);
  assert.equal(configuration.workspace.resourceIds.categories,'categories');
  const beforeReset = writes.length;
  await service.inspect('reset',[]);
  await service.run('reset',[],maintenancePhrase('reset'),()=>{});
  assert.equal(writes.length,beforeReset); assert.deepEqual(configuration.workspace.resourceIds,{});
  assert.equal(configuration.assignments[0].userId,7); assert.equal(configuration.roles[0].id,'agent');
  console.log('Workspace maintenance checks passed: protected resources, typed confirmation, permission recheck, stale review, paged clearing, deletion bindings and non-destructive reset.');
})().catch(error => {console.error(error); process.exitCode=1;});
