const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/SharePointGroupAccess.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>name==='@microsoft/sp-http'?{SPHttpClient:{configurations:{v1:{}}}}:require(name),m,m.exports);
const {SharePointGroupAccess,deskPilotGroups}=m.exports;
(async()=>{
 const groups=[{Id:1,Title:deskPilotGroups.agent,Description:'Custom agent group'},{Id:90,Title:'Other group'}];
 const permissions=new Map([[1,999]]),members=new Map([[1,new Set([7,50])],[90,new Set([7])]]),writes=[];
 let loseCreate=false,failReadGrant=false,failAdd=false;
 const response=value=>new Response(JSON.stringify(value),{status:200});
 const context={pageContext:{web:{absoluteUrl:'https://example.sharepoint.com/sites/support'}},spHttpClient:{
  get:async url=>{
   if(url.includes('/sitegroups?'))return response({value:groups});
   if(url.includes('/roleassignments?'))return response({value:[...permissions.keys()].map(PrincipalId=>({PrincipalId}))});
   if(url.includes('/roledefinitions?'))return response({value:[{Id:100,RoleTypeKind:2},{Id:200,RoleTypeKind:5}]});
   if(url.includes('/siteusers/getbyid'))return response({LoginName:'i:0#.f|membership|user'+url.match(/getbyid\((\d+)\)/)[1]+'@example.com'});
   if(url.includes('/users?')){const id=Number(url.match(/getbyid\((\d+)\)/)[1]);return response({value:[...(members.get(id)||[])].map(Id=>({Id}))});}
   throw Error('Unexpected GET '+url);
  },
  post:async(url,_configuration,options)=>{
   const body=options.body?JSON.parse(options.body):undefined;writes.push({url,body,headers:options.headers});assert.equal(options.headers['odata-version'],'');
   if(url.endsWith('/sitegroups')){const group={Id:2,...body};groups.push(group);members.set(2,new Set([8,51]));if(loseCreate){loseCreate=false;throw Error('Lost response');}return response(group);}
   if(url.includes('addroleassignment')){if(failReadGrant){failReadGrant=false;return new Response('',{status:403});}const id=Number(url.match(/principalid=(\d+)/)[1]),level=Number(url.match(/roledefid=(\d+)/)[1]);permissions.set(id,level);return new Response(null,{status:204});}
   if(options.headers['X-HTTP-Method']==='MERGE'){Object.assign(groups.find(group=>group.Id===Number(url.match(/getbyid\((\d+)\)/)[1])),body);return new Response(null,{status:204});}
   if(url.includes('/users/removebyid')){members.get(Number(url.match(/getbyid\((\d+)\)/)[1])).delete(Number(url.match(/removebyid\((\d+)\)/)[1]));return new Response(null,{status:204});}
   if(url.endsWith('/users')){const user=Number(body.LoginName.match(/user(\d+)@/)[1]);if(user===9&&failAdd){failAdd=false;return new Response('',{status:403});}members.get(Number(url.match(/getbyid\((\d+)\)/)[1])).add(user);return response({Id:user});}
   throw Error('Unexpected POST '+url);
  }
 }};
 const service=new SharePointGroupAccess(context);
 const plan=await service.inspect();assert(plan.find(step=>step.resource===deskPilotGroups.agent).action.includes('preserve'));assert(plan.find(step=>step.resource===deskPilotGroups.admin).action.includes('Read'));
 loseCreate=true;failReadGrant=true;await assert.rejects(service.initialize(),/403/);assert.equal(groups.filter(group=>group.Title===deskPilotGroups.admin).length,1);
 await service.initialize();assert.equal(permissions.get(1),999,'Existing custom permissions preserved');assert.equal(permissions.get(2),100,'New group gets only Read');
 const assignment=(userId,roleId,disabled=false)=>({userId,roleId,name:'User '+userId,email:'user'+userId+'@example.com',disabled});
 const desired=[assignment(7,'admin'),assignment(9,'agent'),assignment(10,'agent',true)];
 failAdd=true;await assert.rejects(service.sync(desired,[7,8,10]),/403/);await service.sync(desired,[7,8,10]);
 assert(!members.get(1).has(7));assert(members.get(2).has(7));assert(members.get(1).has(9));assert(!members.get(2).has(8));assert(members.get(1).has(50));assert(members.get(2).has(51));assert(members.get(90).has(7),'Other groups untouched');
 const before=writes.length;await service.sync(desired,[7,8,10]);assert.equal(writes.length,before,'Retry must not duplicate writes');
 await service.sync([], [7,9]);assert(!members.get(1).has(9));assert(!members.get(2).has(7));
 await assert.rejects(service.sync([assignment(-1,'agent')],[]),/valid SharePoint users/);
 assert(!writes.some(write=>write.url.includes('send')||write.url.includes('breakroleinheritance')),'No invitations or inheritance changes');
 console.log('SharePoint groups passed: existing permissions preserved, new Read groups, lost-create retry, partial grant recovery, role changes, removals and idempotence.');
})().catch(error=>{console.error(error);process.exitCode=1;});
