const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path,dependencies={}) {const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>dependencies[name] || require(name),module,module.exports);return module.exports;}
const {SharePointWorkspacePermissions} = load('src/webparts/helpdeskSystem/services/SharePointWorkspacePermissions.ts',{'@microsoft/sp-http':{SPHttpClient:{configurations:{v1:{}}}}});
(async()=>{
  const ticketId='11111111-1111-1111-1111-111111111111';
  const service=new SharePointWorkspacePermissions({pageContext:{web:{absoluteUrl:'https://example.sharepoint.com/sites/support',id:'web-id'}}});
  let owner=true;const writes=[],groups=[],members=new Map();
  const defs=[{Id:10,RoleTypeKind:2,BasePermissions:{High:'0',Low:'1'}},{Id:20,RoleTypeKind:5},{Id:30,RoleTypeKind:6}];
  const lists=[{Id:ticketId,Title:'Tickets',BaseTemplate:100,Hidden:false},{Id:'categories',Title:'Ticket Categories',BaseTemplate:100,Hidden:false},{Id:'pages',Title:'Site Pages',BaseTemplate:119,Hidden:false}];
  service.read=async path=>{
    if(path==='/EffectiveBasePermissions')return {Low:owner?String(1073741824|33554432):'0'};
    if(path.startsWith('/associatedownergroup'))return {Id:1};
    if(path.startsWith('/currentuser'))return {Id:2};
    if(path.startsWith('/roledefinitions/getbyname'))return defs.at(-1);
    if(path.startsWith('/roledefinitions?'))return {value:defs};
    if(path.startsWith('/lists?'))return {value:lists};
    if(path.startsWith('/sitegroups?'))return {value:groups};
    if(path.startsWith('/siteusers/'))return {LoginName:'user-'+path.match(/getbyid\((\d+)\)/)[1]};
    if(path.includes('/sitegroups(')&&path.includes('/users?'))return {value:members.get(Number(path.match(/sitegroups\((\d+)\)/)[1]))||[]};
    if(path.includes('/fields?'))return {value:[{InternalName:'AssignedTo',Title:'Assigned To',TypeAsString:'User'}]};
    if(path.includes('/items?$select=Id,AssignedToId'))return {value:[{Id:1,AssignedToId:7},{Id:2,AssignedToId:8}]};
    if(path.includes('/items(1)?'))return {AssignedToId:7};
    if(path.includes('/roleassignments?'))return {value:[{PrincipalId:777,RoleDefinitionBindings:[{Id:20}]},{PrincipalId:7,RoleDefinitionBindings:[{Id:20}]}]};
    if(path.includes('HasUniqueRoleAssignments'))return {HasUniqueRoleAssignments:false};
    if(path.startsWith('/RootFolder'))return {WelcomePage:''};
    throw Error('Unhandled read: '+path);
  };
  service.write=async(path,body,headers)=>{
    writes.push({path,body,headers});
    if(path==='/sitegroups'){const group={Id:100+groups.length,...body};groups.push(group);members.set(group.Id,[]);}
    if(path==='/roledefinitions')defs.push({Id:40,...body});
    if(path.endsWith('/users')){const id=Number(path.match(/sitegroups\((\d+)\)/)[1]);members.get(id).push({Id:Number(body.LoginName.slice(5))});}
    if(path.includes('/users/removebyid')){const [id,user]=[...path.matchAll(/\((\d+)\)/g)].map(value=>Number(value[1]));members.set(id,members.get(id).filter(value=>value.Id!==user));}
  };
  const configuration={workspace:{listName:'Tickets',listId:ticketId},roles:[],assignments:[{userId:7,roleId:'agent'},{userId:8,roleId:'agent',disabled:true},{userId:9,roleId:'admin'}]};
  await service.sync(configuration);
  assert(defs.some(value=>value.Id===40 && value.BasePermissions.Low==='5'),'Assigned editor must contain Read + Edit, without Add/Delete/Manage');
  assert(writes.some(value=>value.path.includes('/items(1)/roleassignments/addroleassignment(principalid=7,roledefid=40)')));
  assert(!writes.some(value=>value.path.includes('/items(2)/roleassignments/addroleassignment(principalid=8')));
  assert(!writes.some(value=>value.path===`/lists(guid'${ticketId}')/roleassignments/addroleassignment(principalid=100,roledefid=10)`),'Agent group must not read the ticket list');
  assert(writes.some(value=>value.path.includes('/items(1)/roleassignments/removeroleassignment(principalid=7,roledefid=20)')),'Old elevated agent binding must be removed');
  assert(writes.some(value=>value.path.includes('getbyprincipalid(777)')),'Broad inherited grants must be removed');
  assert.deepEqual(members.get(100),[{Id:7}]);assert.deepEqual(members.get(101),[{Id:9}]);
  writes.length=0;await service.ticket(ticketId,1,true);
  assert(!writes.some(value=>value.path.includes('principalid=7,roledefid=40')),'Prepare reassignment must revoke agent grants');
  writes.length=0;await service.ticket(ticketId,1);
  assert(writes.some(value=>value.path.includes('principalid=7,roledefid=40')));
  owner=false;writes.length=0;
  await assert.rejects(()=>service.sync(configuration),/Super Admin/);assert.equal(writes.length,0);
  console.log('Workspace permission checks passed: fresh authorization, private ticket ACLs, disabled agents, removal of broad/elevated grants, membership and reassignment.');
})().catch(error=>{console.error(error);process.exitCode=1;});
