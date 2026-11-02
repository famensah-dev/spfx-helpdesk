const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/SharePointTicketViews.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>name==='./SharePointGroupAccess'?{deskPilotGroups:{agent:'DeskPilot Agents',admin:'DeskPilot Helpdesk Administrator',requester:'DeskPilot Requesters'}}:require(name),m,m.exports);
const {SharePointTicketViews}=m.exports;
const viewId='22222222-2222-2222-2222-222222222222',ticketId='11111111-1111-1111-1111-111111111111';let records=new Map(),creates=0,updates=0,privacy=2,race=false,release,block=false,batchSizes=[],posts=[];
const key=id=>'7:'+ticketId+':'+id;
global.fetch=async(url,options)=>{const address=new URL(url);assert.equal(address.origin,'https://test.sharepoint.com');assert.equal(options.headers.Authorization,'Bearer token');posts.push({url,options});
 if(address.pathname.endsWith('/EffectiveBasePermissions'))return Response.json({Low:String(1073741824+33554432)});
 if(url.includes('/roledefinitions?'))return Response.json({value:[{Id:1,RoleTypeKind:5},{Id:2,RoleTypeKind:3}]});
 if(url.includes('/associatedownergroup?'))return Response.json({Id:10});
 if(url.includes('/sitegroups?'))return Response.json({value:[{Id:20,Title:'DeskPilot Requesters'}]});
 if(url.includes('/roleassignments?'))return Response.json({value:[{PrincipalId:20},{PrincipalId:99}]});
 if(url.includes('/roleassignments/') || url.includes('/breakroleinheritance'))return new Response(null,{status:204});
 if(url.includes('/fields/'))return Response.json({Indexed:true,EnforceUniqueValues:true});
 if(options.method==='GET'&&address.searchParams.has('$filter')){const title=address.searchParams.get('$filter').match(/Title eq '([^']+)'/)[1];return Response.json({value:records.has(title)?[records.get(title)]:[]});}
 if(address.pathname.endsWith('/items')&&options.method==='POST'){creates++;const body=JSON.parse(options.body);assert(!('AuthorId' in body));records.set(body.Title,{Id:creates,Title:body.Title,AuthorId:7,LastOpenedAt:body.LastOpenedAt});return race?new Response('',{status:400}):Response.json({Id:creates});}
 if(address.pathname.match(/\/items\(\d+\)$/)&&options.method==='POST'){updates++;const row=[...records.values()].find(v=>address.pathname.endsWith('/items('+v.Id+')'));Object.assign(row,JSON.parse(options.body));return new Response(null,{status:204});}
 if(options.method==='POST')return new Response(null,{status:204});
 return Response.json({Id:viewId,ReadSecurity:privacy,WriteSecurity:2});
};
const graph={get:async()=>({id:'site-id'}),post:async(path,body)=>{assert.equal(path,'/$batch');batchSizes.push(body.requests.length);const response={responses:body.requests.map(request=>{const filter=decodeURIComponent(request.url.split('$filter=')[1].split('&')[0]);const title=filter.match(/fields\/Title eq '([^']+)'/)[1];assert(request.url.includes('$top=2'));const row=records.get(title);return{id:request.id,status:200,body:{value:row?[{fields:{Title:row.Title,AuthorLookupId:String(row.AuthorId)}}]:[]}};})};if(block)return new Promise(resolve=>{release=()=>resolve(response);});return response;}};
const make=()=>new SharePointTicketViews('https://test.sharepoint.com/sites/helpdesk',async()=>'token',graph,7,async()=>ticketId,viewId);
(async()=>{
 const service=make();let changed=0;const unsubscribe=service.subscribe(()=>changed++);
 assert.deepEqual(await service.getOpened([1,2]),[]);assert.deepEqual(batchSizes,[2]);
 await Promise.all([service.markOpened(1),service.markOpened(1)]);assert.equal(creates,1);assert.equal(records.size,1);assert.equal(changed,1);
 await service.markOpened(1);assert.equal(creates,1,'Revisits do not append rows');assert.equal(updates,0,'Fast revisits avoid extra timestamp writes');
 records.get(key(1)).LastOpenedAt='2020-01-01T00:00:00Z';await service.markOpened(1);assert.equal(updates,1);assert.equal(records.size,1);
 assert.deepEqual(await make().getOpened([1,2]),[1],'Opened state survives a new device/service');
 race=true;await service.markOpened(3);race=false;assert(records.has(key(3)),'Concurrent create conflicts reconcile through the unique key');
 const large=make();batchSizes=[];await large.getOpened(Array.from({length:51},(_,i)=>100+i));assert.deepEqual(batchSizes,[20,20,11],'Visible tickets use bounded indexed-key batches');
 await assert.rejects(service.getOpened(Array.from({length:101},(_,i)=>i+1)),/100/);
 const stale=make();block=true;const pending=stale.getOpened([44]);while(!release)await new Promise(resolve=>setTimeout(resolve,0));await stale.markOpened(44);release();assert.deepEqual(await pending,[44],'A late empty read cannot undo a successful mark');block=false;
 records.set(key(55),{Id:55,Title:key(55),AuthorId:8});await assert.rejects(make().getOpened([55]),/ownership/);
 privacy=1;await assert.rejects(make().getOpened([1]),/privacy/);privacy=2;
 const duplicateGraph={...graph,post:async(path,body)=>{const result=await graph.post(path,body);for(const part of result.responses)part.body.value.push(...part.body.value);return result;}};
 const duplicateService=new SharePointTicketViews('https://test.sharepoint.com/sites/helpdesk',async()=>'token',duplicateGraph,7,async()=>ticketId,viewId);
 assert.deepEqual(await duplicateService.getOpened([1]),[1],'Concurrent duplicate receipts still indicate opened');
 await service.setup(viewId);const settings=posts.find(p=>p.options.body && JSON.parse(p.options.body).ReadSecurity===2);assert(settings);const migration=posts.find(p=>p.options.body && JSON.parse(p.options.body).EnforceUniqueValues===false);assert(migration,'Existing unique constraints must be removed');assert(posts.indexOf(migration)<posts.indexOf(settings),'Remove uniqueness before own-item privacy');assert.equal(JSON.parse(settings.options.body).EnableVersioning,false);assert(posts.some(p=>p.url.includes('getbyprincipalid(99)')&&p.options.headers['X-HTTP-Method']==='DELETE'));
 const originalFetch=global.fetch;
 global.fetch=async(url,options)=>options.body && JSON.parse(options.body).ReadSecurity===2
   ? Response.json({'odata.error':{code:'example-code',message:{value:'Setting was rejected'}}},{status:400,headers:{SPRequestGuid:'test-request-id'}})
   : originalFetch(url,options);
 posts=[];
 await assert.rejects(make().setup(viewId),error=>/HTTP 400/.test(error.message)&&/Setting was rejected/.test(error.message)&&/test-request-id/.test(error.message));
 assert(!posts.some(p=>p.url.includes('breakroleinheritance')),'Failed privacy settings must stop before changing permissions');
 global.fetch=async(url,options)=>options.body && JSON.parse(options.body).ReadSecurity===2
   ? new Response('<html>Unavailable</html>',{status:503}) : originalFetch(url,options);
 await assert.rejects(make().setup(viewId),/HTTP 503/);
 global.fetch=originalFetch;
 unsubscribe();console.log('Ticket views passed: receipt tracking, privacy, setup, and SharePoint failure diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
