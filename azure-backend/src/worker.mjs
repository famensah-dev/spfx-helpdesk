import {createRequire} from 'node:module';
import {storageProfiles,selectProfile} from './storage/profiles.mjs';
import {requireMatchingProvider} from './storage/database.mjs';
import {runSqlWorker} from './storage/sql/worker.mjs';
const require=createRequire(import.meta.url);
const {GraphClient}=require('../compiled/services/graph/GraphClient.js');
const {GraphTicketService}=require('../compiled/services/graph/GraphTicketService.js');
const {GraphSupportUnitsService}=require('../compiled/services/graph/GraphSupportUnitsService.js');
const {GraphNotificationService}=require('../compiled/services/graph/GraphNotificationService.js');
const {GraphSlaService}=require('../compiled/services/graph/GraphSlaService.js');
export async function workerToken(config,env=process.env,request=fetch){
  if(env.IDENTITY_ENDPOINT&&env.IDENTITY_HEADER){
    const url=new URL(env.IDENTITY_ENDPOINT);url.searchParams.set('resource','https://graph.microsoft.com');url.searchParams.set('api-version','2019-08-01');
    const response=await request(url,{headers:{'X-IDENTITY-HEADER':env.IDENTITY_HEADER},signal:AbortSignal.timeout(30000)});const data=await response.json();
    if(!response.ok||!data.access_token)throw new Error('The Azure worker managed identity could not obtain Graph access.');return data.access_token;
  }
  // Explicit local opt-in only. Azure uses managed identity, never a browser token.
  if(env.DESKPILOT_ALLOW_LOCAL_WORKER!=='true')throw new Error('Background automation requires Azure managed identity.');
  const response=await request(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'}),signal:AbortSignal.timeout(30000)});const data=await response.json();
  if(!response.ok||!data.access_token)throw new Error('The local worker could not obtain Graph application access.');return data.access_token;
}
export async function processReadyTicket(id,{units,tickets,mail,graph,path}){
  if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid intake ticket ID.');
  await units.routeTicket(id);
  const updated=(await tickets.getTickets()).tickets.find(ticket=>ticket.Id===id);if(!updated)throw new Error('Ticket disappeared during automation.');
  await mail.changed(updated,undefined,true);
  const current=await graph.get(path+'/items/'+id+'?$expand=fields');
  const etag=current.eTag||current['@odata.etag'];if(!etag)throw new Error('The intake completion version could not be verified.');
  await graph.patch(path+'/items/'+id+'/fields',{AutomationReady:false},etag);
}
export async function runWorker(config,env=process.env,request=fetch){
  if(env.DESKPILOT_WORKER_ENABLED!=='true')return {disabled:true};
  const mailbox=env.DESKPILOT_WORKER_MAILBOX;
  if(!mailbox||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox))throw new Error('Configure the dedicated worker mailbox.');
  const token=await workerToken(config,env,request);
  const sendRequest=(address,options)=>{
    const url=new URL(address);
    if(url.pathname.endsWith('/sendMail')){
      url.pathname='/v1.0/users/'+encodeURIComponent(mailbox)+'/sendMail';
      const body=JSON.parse(options.body);body.message.from={emailAddress:{address:mailbox}};options={...options,body:JSON.stringify(body)};
    }
    return request(url.href,options);
  };
  const graph=new GraphClient(async()=>token,sendRequest);
  const appConfig={...config,currentUserEmail:mailbox,currentUserName:'DeskPilot Automation',graphSiteScope:'Sites.Selected'};
  const siteUrl=new URL(config.siteUrl);
  const site=await graph.get(`/sites/${siteUrl.hostname}:${siteUrl.pathname}?$select=id`);
  const lists=await graph.getAll(`/sites/${encodeURIComponent(site.id)}/lists?$select=id,displayName,webUrl`);
  const access=lists.find(list=>list.displayName==='DeskPilot Access');let workspace;
  if(access){const rows=await graph.getAll(`/sites/${encodeURIComponent(site.id)}/lists/${access.id}/items?$expand=fields&$filter=`+encodeURIComponent("fields/Title eq 'Configuration'")+'&$top=2');if(rows.length>1)throw new Error('Duplicate workspace configuration.');if(rows[0])workspace=JSON.parse(rows[0].fields.Rules).workspace;}
  const target=lists.find(list=>workspace?.listId?list.id.toLowerCase()===workspace.listId.toLowerCase():list.displayName===(workspace?.listName||config.listName));if(!target)throw new Error('Worker ticket list was not found.');
  appConfig.resourceIds=workspace?.resourceIds;
  appConfig.siteId=site.id;appConfig.listId=target.id;
  const units=new GraphSupportUnitsService(graph,appConfig),tickets=new GraphTicketService(graph,appConfig);
  if(['sql','postgres'].includes(workspace?.storage?.provider)){
    const profile=selectProfile(storageProfiles(env),workspace.storage.connectionId);requireMatchingProvider(profile,workspace.storage.provider);
    return runSqlWorker({config,profile,graph,appConfig,workspace,units,mailbox,sitePath:'/sites/'+encodeURIComponent(site.id),lists});
  }
  const teamData=await units.load();
  const mail=new GraphNotificationService(graph,appConfig,{email:mailbox,name:'DeskPilot Automation'},true,config.pageUrl,workspace?.title||'DeskPilot',async()=>(await tickets.getTickets()).tickets,async id=>teamData.units.find(team=>team.id===id)?.email||'');
  const path=`/sites/${encodeURIComponent(site.id)}/lists/${target.id}`;
  // An intake flow marks READY only after AI categorization and attachments finish.
  const columns=await graph.getAll(path+'/columns');
  let processed=0;const failed=[];
  if(columns.some(column=>column.name==='AutomationReady')){
    const ready=await graph.getAll(path+'/items?$expand=fields&$filter='+encodeURIComponent('fields/AutomationReady eq 1')+'&$top=100');
    for(const item of ready.slice(0,50)){
      try{
        await processReadyTicket(Number(item.id),{units,tickets,mail,graph,path});processed++;
      }catch(error){failed.push(Number(item.id));console.error(JSON.stringify({operation:'intake',ticketId:Number(item.id),errorType:error.name}));}
    }
  }
  const sla=new GraphSlaService(graph,graph,appConfig);
  sla.onBreach=async(ticket,kind)=>{
    const team=teamData.units.find(unit=>unit.id===ticket.AssignedUnitId),lead=teamData.members.find(member=>member.unitId===team?.id&&member.id===team?.teamLeadMemberId);
    if(!lead)return;
    const users=lists.find(list=>list.webUrl?.toLowerCase().includes('/_catalogs/users'));if(!users)throw new Error('Worker cannot resolve the team lead.');
    const person=await graph.get(`/sites/${encodeURIComponent(site.id)}/lists/${users.id}/items/${lead.userId}?$expand=fields`);
    await mail.slaBreach(ticket,kind,String(person.fields.EMail||person.fields.Email||''));
  };
  await sla.checkBreaches((await tickets.getTickets()).tickets);
  return {processed,failed};
}
