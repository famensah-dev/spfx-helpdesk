import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {ApiError,tokenValidator,delegatedTokens} from '../src/tokens.mjs';
import {handler} from '../src/http.mjs';
import {dispatch,metadata} from '../src/dispatch.mjs';
import {signReview,verifyReview} from '../src/review.mjs';
import {runWorker,processReadyTicket} from '../src/worker.mjs';
import {readConfig} from '../src/config.mjs';
import {createServices} from '../src/services.mjs';
const require=createRequire(import.meta.url);
const {applyAppRoleRules}=require('../compiled/services/appRoleRules.js');
const {defaultRoleConfiguration}=require('../compiled/interfaces/IRoleManagement.js');
const {SharePointRoleManagement}=require('../compiled/services/SharePointRoleManagement.js');
const tenant='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',frontend='33333333-3333-4333-8333-333333333333',oid='44444444-4444-4444-8444-444444444444';
const config={tenantId:tenant,clientId:client,clients:[frontend],origins:['https://tenant.sharepoint.com'],siteUrl:'https://tenant.sharepoint.com/sites/helpdesk',pageUrl:'https://tenant.sharepoint.com/sites/helpdesk/SitePages/DeskPilot.aspx',clientSecret:'unit-test-only'};
test('tenant, audience, caller, signature and delegated scope are verified',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');const keys=createLocalJWKSet({keys:[{...await exportJWK(publicKey),kid:'test'}]});
  const validate=tokenValidator(config,keys);
  const sign=(patch={},aud=client,iss=tenant)=>new SignJWT({tid:tenant,oid,azp:frontend,scp:'access_as_user',...patch}).setProtectedHeader({alg:'RS256',kid:'test'}).setAudience(aud).setIssuer(`https://login.microsoftonline.com/${iss}/v2.0`).setExpirationTime('5m').sign(privateKey);
  assert.equal((await validate(await sign())).oid,oid);
  for(const token of [await sign({azp:client}),await sign({scp:'User.Read'}),await sign({tid:frontend}),await sign({},frontend),await sign({},client,frontend)])await assert.rejects(validate(token),/Invalid/);
  const token=await sign();await assert.rejects(validate(token.slice(0,-5)+'abcde'),/Invalid/);
});
async function invoke(options={}){
  let created=0;
  const api=handler({config,validate:async token=>{if(token!=='valid')throw new ApiError('Invalid token',401);return {oid};},createServices:async()=>{created++;return {};},dispatch:async()=>({ok:true}),log:()=>{}});
  const request=Readable.from([Buffer.from(options.body??'{"method":"session","args":[]}')]);
  request.headers={origin:options.origin||config.origins[0],'content-type':'application/json',...(options.token===false?{}:{authorization:'Bearer '+(options.token||'valid')})};request.url=options.url||'/api/rpc';request.method=options.method||'POST';
  const result={headers:{},created:0};
  await api(request,{setHeader:(key,value)=>{result.headers[key]=value;},writeHead:(status,headers)=>{result.status=status;Object.assign(result.headers,headers);},end:body=>{result.body=body?JSON.parse(body):null;}});
  return {...result,created};
}
test('HTTP rejects untrusted origins, missing authentication and malformed input before data access',async()=>{
  for(const [options,status]of [[{origin:'https://evil.example'},403],[{token:false},401],[{token:'forged'},401],[{body:'oops'},400],[{body:'null'},400],[{url:'/Automation'},404]]){
    const result=await invoke(options);assert.equal(result.status,status);assert.equal(result.created,0);
  }
  const preflight=await invoke({method:'OPTIONS',token:false});assert.equal(preflight.status,204);assert.equal(preflight.created,0);
  const valid=await invoke();assert.equal(valid.status,200);assert.equal(valid.headers['Access-Control-Allow-Origin'],config.origins[0]);assert.equal(valid.headers['Cache-Control'],'no-store');
});
test('current SharePoint role scopes are enforced on server reads and writes',async()=>{
  const own={Id:1,Title:'Own',Status:'New',Priority:'Low',Requester:{Id:7,Email:'staff@example.com'}},other={Id:2,Title:'Other',Status:'New',Priority:'Low',Requester:{Id:8}};
  let writes=0,created;
  const source={access:{admin:false,superAdmin:false,oid,email:'staff@example.com'},getTickets:async()=>({tickets:[own,other]}),addComment:async()=>{writes++;},createTicket:async input=>{created=input;},updateTickets:async()=>{writes++;}};
  const service=applyAppRoleRules(source,defaultRoleConfiguration().roles.find(role=>role.id==='requester'),7,'staff@example.com',oid);
  const services={service,profile:{displayName:'Staff',mail:'staff@example.com'}};
  assert.deepEqual((await dispatch(services,'getTickets',[])).tickets.map(ticket=>ticket.Id),[1]);
  await assert.rejects(dispatch(services,'addComment',[2,'forged']),/outside/);assert.equal(writes,0);
  await assert.rejects(dispatch(services,'updateTickets',[[1],{kind:'assign',userId:9}]),/not available/);
  await assert.rejects(dispatch(services,'roleManagement.save',[{}]),/not available/);
  await dispatch(services,'createTicket',[{title:'Test',requesterEmail:'someone@example.com',requesterName:'Forged'}]);assert.equal(created.requesterEmail,'staff@example.com');
  assert(!metadata(service).capabilities.includes('updateTickets'));
});
test('optional null arguments, comment formatting and file bytes survive RPC',async()=>{
  let saved,comment;
  const service={access:{admin:true},saveFaq:async(input,id)=>{saved=id;},addComment:async(...args)=>{comment=args;}};
  await dispatch({service},'saveFaq',[{},null]);assert.equal(saved,undefined);
  await dispatch({service},'addComment',[1,'Hello',{html:'<p>Hello</p>',requestId:'request',files:[{name:'sample.txt',type:'text/plain',data:Buffer.from('attachment').toString('base64')}]}]);
  assert.equal(comment[2].html,'<p>Hello</p>');assert.equal(await comment[2].files[0].text(),'attachment');
});
test('backend recomputes SLA inputs instead of trusting browser tickets',async()=>{
  let received;
  const service={access:{admin:true},getTickets:async()=>({tickets:[{Id:1}]}),sla:{checkBreaches:async value=>{received=value;}}};
  await dispatch({service},'sla.checkBreaches',[[{Id:999}]]);assert.deepEqual(received,[{Id:1}]);
});
test('maintenance reviews are signed, bound to user and targets, and expire',()=>{
  const targets=[{Id:'list',ItemCount:5}],token=signReview('secret',oid,'clear',['list'],targets,1000);
  verifyReview('secret',token,oid,'clear',['list'],targets,2000);
  assert.throws(()=>verifyReview('secret',token,frontend,'clear',['list'],targets,2000));
  assert.throws(()=>verifyReview('secret',token,oid,'drop',['list'],targets,2000));
  assert.throws(()=>verifyReview('secret',token,oid,'clear',['list'],[{Id:'list',ItemCount:6}],2000));
  assert.throws(()=>verifyReview('secret',token,oid,'clear',['list'],targets,400000));
});
test('background worker is disabled by default and never calls Microsoft APIs when off',async()=>{
  assert.deepEqual(await runWorker(config,{},()=>{throw new Error('Must not call network');}),{disabled:true});
});
test('OBO tokens are cached only within one request and destinations are constrained',async()=>{
  let count=0;const token=delegatedTokens(config,'test',async()=>{count++;return {ok:true,json:async()=>({access_token:'token'})};});
  assert.equal(await token('https://graph.microsoft.com'),'token');await token('https://graph.microsoft.com');assert.equal(count,1);
  assert.throws(()=>token('https://evil.example'),/Unexpected/);
});
test('configuration rejects missing identity, credentials and cross-site page URLs',()=>{
  const env={DESKPILOT_TENANT_ID:tenant,DESKPILOT_CLIENT_ID:client,DESKPILOT_CLIENT_SECRET:'secret',DESKPILOT_ALLOWED_CLIENT_IDS:frontend,DESKPILOT_ALLOWED_ORIGINS:config.origins[0],DESKPILOT_SITE_URL:config.siteUrl,DESKPILOT_PAGE_URL:config.pageUrl};
  assert.equal(readConfig(env).siteUrl,config.siteUrl);
  assert.throws(()=>readConfig({...env,DESKPILOT_PAGE_URL:'https://evil.example/page'}));
  assert.throws(()=>readConfig({...env,DESKPILOT_ALLOWED_CLIENT_IDS:''}));
});
test('server factory resolves the current SharePoint requester role without loading SPFx or writing ACLs',async()=>{
  const role=defaultRoleConfiguration().roles.find(item=>item.id==='requester');let writes=0;
  const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  const request=async(address,options={})=>{
    const url=new URL(address);
    if(url.hostname==='login.microsoftonline.com')return response({access_token:'test-delegated-token'});
    if(options.method&&options.method!=='GET'){writes++;throw new Error('Session bootstrap must not mutate SharePoint');}
    if(url.hostname==='graph.microsoft.com'&&url.pathname==='/v1.0/me')return response({id:oid,displayName:'Staff',mail:'staff@example.com',userPrincipalName:'staff@example.com'});
    if(url.pathname.endsWith('/_api/web'))return response({Url:config.siteUrl});
    if(url.pathname.endsWith('/EffectiveBasePermissions'))return response({Low:'0'});
    if(url.pathname.endsWith('/currentuser/groups'))return response({value:[{Id:4,Title:'DeskPilot Requesters'}]});
    if(url.pathname.endsWith('/currentuser'))return response({Id:7});
    if(decodeURIComponent(url.pathname).includes("getbytitle('DeskPilot Access')/items"))return response({value:[{Id:1,Rules:JSON.stringify({role,assignment:{userId:7,name:'Staff',email:'staff@example.com',roleId:'requester'},workspace:{title:'Support',description:'',listName:'Tickets',listId:''}})}]});
    throw new Error('Unexpected bootstrap request: '+url.pathname);
  };
  const original=globalThis.fetch;globalThis.fetch=request;
  try{const result=await createServices(config,'test',{oid},request);assert.equal(result.service.roleRules.id,'requester');assert.equal(result.service.access.email,'staff@example.com');assert.equal(writes,0);}
  finally{globalThis.fetch=original;}
});
test('intake routes before rendering notifications and acknowledges only after success with a verified version',async()=>{
  const events=[];let fail=false,version='v2';
  const dependencies={path:'/tickets',units:{routeTicket:async id=>{events.push('route');assert.equal(id,55);}},tickets:{getTickets:async()=>({tickets:[{Id:55,Status:'In Progress',AssignedTo:{Id:8}}]})},mail:{changed:async(ticket,before,created)=>{events.push('notify');assert.equal(ticket.Status,'In Progress');assert.equal(created,true);if(fail)throw new Error('Unconfirmed mail');}},graph:{get:async()=>({eTag:version}),patch:async(path,fields,etag)=>{events.push('ack');assert.equal(etag,'v2');assert.equal(fields.AutomationReady,false);}}};
  await processReadyTicket(55,dependencies);assert.deepEqual(events,['route','notify','ack']);
  events.length=0;fail=true;await assert.rejects(processReadyTicket(55,dependencies),/Unconfirmed/);assert(!events.includes('ack'));
  fail=false;version=undefined;events.length=0;await assert.rejects(processReadyTicket(55,dependencies),/version/);assert(!events.includes('ack'));
});
test('backend administrator session loads do not resynchronize permissions',async()=>{
  let writes=0;const configuration={...defaultRoleConfiguration(),workspace:{title:'Support',description:'',listName:'Tickets',listId:''}};
  const context={pageContext:{web:{absoluteUrl:config.siteUrl}},spHttpClient:{post:async()=>{writes++;throw new Error('Unexpected ACL write');},get:async url=>{
    let data;
    if(url.includes('/fields?'))data={value:[{InternalName:'Rules'}]};
    else if(url.includes('/items(1)'))data={Id:1,Rules:JSON.stringify(configuration)};
    else if(url.includes('/items?'))data={value:[{Id:1}]};
    else data={Id:'access-list'};
    return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',ETag:'v1'}});
  }}};
  const roles=new SharePointRoleManagement(context,true,undefined,undefined,config.siteUrl,true);
  assert.equal((await roles.load()).workspace.title,'Support');assert.equal(writes,0);
});
test('role saves reject a stale client configuration before overwriting another administrator',async()=>{
  let configuration={roles:['original']},writes=0;
  const service={access:{superAdmin:true,oid},roleManagement:{load:async()=>configuration,save:async value=>{configuration=value;writes++;}}};
  const context={service,reviewSecret:'test-secret'};
  const loaded=await dispatch(context,'roleManagement.load',[]);
  configuration={roles:['changed-by-other-admin']};
  await assert.rejects(dispatch(context,'roleManagement.save',[{roles:['stale']},loaded.versionToken]),/changed/);assert.equal(writes,0);
  const fresh=await dispatch(context,'roleManagement.load',[]);await dispatch(context,'roleManagement.save',[{roles:['updated']},fresh.versionToken]);assert.equal(writes,1);
});
