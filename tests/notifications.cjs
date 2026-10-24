const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {JSDOM}=require('jsdom');const dom=new JSDOM('');global.DOMParser=dom.window.DOMParser;
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const base='src/webparts/helpdeskSystem/';
const contracts=load(base+'interfaces/INotifications.ts');const lists=load(base+'interfaces/IWorkspaceSetup.ts');
const routes=load(base+'utils/appRoutes.ts');
const rich=load(base+'components/RichTextEditor.tsx',{'@fluentui/react':{},'./HelpdeskSystem.module.scss':{default:{}}});
const templates=load(base+'utils/emailTemplates.ts',{'../interfaces/INotifications':contracts,'../components/RichTextEditor':rich,'./appRoutes':routes});
const {GraphNotificationService}=load(base+'services/graph/GraphNotificationService.ts',{'../../interfaces/INotifications':contracts,'../../utils/emailTemplates':templates,'../../interfaces/IWorkspaceSetup':lists});
const {GraphClient}=load(base+'services/graph/GraphClient.ts');
const {GraphTicketService}=load(base+'services/graph/GraphTicketService.ts',{'../../utils/commentContent':load(base+'utils/commentContent.ts'),'./GraphClassificationService':{},'./SharePointAttachments':{},'../../utils/ticketAttachments':load(base+'utils/ticketAttachments.ts'),'./GraphClient':{}});
const url='https://example.sharepoint.com/sites/support/SitePages/DeskPilot.aspx?env=WebView';
const actor={email:'admin@example.com',name:'Admin'};
const ticket={Id:5,Title:'Printer offline',Status:'Assigned',Priority:'Medium',Created:'2026-10-23T12:00:00Z',Modified:'2026-10-23T12:01:00Z',ChangeVersion:'v1',AssignedTo:{Id:11,Title:'Agent',Email:'agent@example.com'},Requester:{Title:'Requester',Email:'requester@example.com'},RequesterEmail:'requester@example.com',CreatedBy:{Email:'creator@example.com'},AssignedUnitId:1,AssignedUnit:'IT'};
(async()=>{
 const settings=templates.defaultEmailSettings(url);assert.equal(settings.enabled,false);templates.validateEmailSettings(settings);
 assert.throws(()=>templates.validateEmailSettings({...settings,rules:{...settings.rules,created:{...settings.rules.created,subject:'{{Unknown}}'}}}),/Unknown/);
 assert.throws(()=>templates.validateEmailSettings({...settings,sender:'shared',sharedMailbox:'bad'}),/valid shared/);
 const rendered=templates.renderEmail({subject:'{{TicketTitle}}',body:'<script>alert(1)</script><p>{{TicketTitle}} {{TicketLink}}</p>'},{TicketTitle:'<img src=x onerror=alert(1)>\r\nBcc: bad',TicketId:'5',TicketLink:routes.ticketLink(url,5)});
 assert(!rendered.html.includes('<script'));assert(!rendered.html.includes('<img'));assert(rendered.html.includes('&lt;img'));assert(rendered.html.includes('env=WebView#/tickets/5'));assert(!/[\r\n]/.test(rendered.subject));
 let requests=0;const client=new GraphClient(async()=>'fake',async()=>{requests++;return new Response(null,{status:202});});assert.equal(await client.post('/me/sendMail',{}),undefined);assert.equal(requests,1,'202 has no JSON body');
 const uncertain=new GraphClient(async()=>'fake',async()=>{requests++;throw new TypeError('Network lost');});await assert.rejects(uncertain.post('/me/sendMail',{}),/could not be confirmed/);assert.equal(requests,2,'Mail must not be retried');
 const denied=new GraphClient(async()=>'fake',async()=>new Response(JSON.stringify({error:{message:'Denied'}}),{status:403}));await assert.rejects(denied.post('/me/sendMail',{}),/Mail.Send/);
 let configuration;const records=[],emails=[];let failSend=false,claimLost=false,allowed=[ticket];
 const graph={
  getAll:async path=>{
   if(path.includes('SettingKey'))return configuration?[configuration]:[];
   if(path.includes('NotificationKey')){const match=decodeURIComponent(path).match(/NotificationKey eq '([^']+)'/);return records.filter(item=>item.fields.NotificationKey===match?.[1]);}
   return [{id:'settings',displayName:lists.workspaceLists.emailSettings},{id:'log',displayName:lists.workspaceLists.notificationLog}];
  },
  get:async path=>path.includes('/log/items?')?{value:records.slice().reverse()}:configuration,
  post:async(path,body)=>{
   if(path==='/me/sendMail'){emails.push(body);if(failSend)throw Error('Mail denied');return;}
   if(path.includes('/settings/')){configuration={id:'1',eTag:'cfg1',fields:body.fields};return configuration;}
   const item={id:String(records.length+1),createdDateTime:new Date().toISOString(),fields:{...body.fields}};records.push(item);if(claimLost){claimLost=false;throw Error('Claim response lost');}return item;
  },
  patch:async(path,fields,etag)=>{if(path.includes('/settings/')){assert(etag);Object.assign(configuration.fields,fields);}else{const id=path.match(/items\/([^/]+)/)[1];Object.assign(records.find(item=>item.id===id).fields,fields);}}
 };
 const service=new GraphNotificationService(graph,{siteId:'site',siteUrl:'https://example.sharepoint.com/sites/support'},actor,true,url,'IT Support',async()=>allowed,async()=> 'team@example.com');
 await service.changed(ticket,undefined,true);assert.equal(emails.length,0,'Disabled by default');settings.enabled=true;settings.rules.created.cc=['requester','actor'];settings.rules.created.extraTo=['REQUESTER@example.com'];await service.saveSettings(settings);
 await service.changed(ticket,undefined,true);assert.equal(emails.length,2,'Creation and initial assignment notify once');assert.deepEqual(emails[0].message.toRecipients,[{emailAddress:{address:'requester@example.com'}}]);assert.deepEqual(emails[0].message.ccRecipients,[{emailAddress:{address:actor.email}}]);assert.equal(records[0].fields.DeliveryStatus,'Accepted');
 await service.changed({...ticket,ChangeVersion:'v99'},undefined,true);assert.equal(emails.length,3,'Created deduplicates across later versions; assignment has its own version');await service.changed(ticket,undefined,true);assert.equal(emails.length,3);
 await service.changed({...ticket,Status:'Completed',ChangeVersion:'v2'},{status:'In Progress',assignedToId:11});assert.equal(emails.length,4);assert(emails[3].message.subject.includes('Ticket Resolved'));
 await service.changed({...ticket,Status:'Closed',ChangeVersion:'v3'},{status:'Resolved',assignedToId:11});assert.equal(emails.length,5);
 await service.changed({...ticket,ChangeVersion:'v4'},{status:'Assigned',assignedToId:11});assert.equal(emails.length,5,'No-op updates do not notify');
 failSend=true;await assert.rejects(service.changed({...ticket,Status:'Closed',ChangeVersion:'v5'},{status:'Resolved',assignedToId:11}),/Mail denied/);const attempts=emails.length;failSend=false;await service.changed({...ticket,Status:'Closed',ChangeVersion:'v5'},{status:'Resolved',assignedToId:11});assert.equal(emails.length,attempts,'Failed or uncertain submissions never automatically resend');
 claimLost=true;await service.changed({...ticket,Status:'Closed',ChangeVersion:'v6'},{status:'Resolved',assignedToId:11});assert.equal(emails.length,attempts,'Unconfirmed log claim must not send duplicate email');
 settings.rules.assigned.to=['team'];settings.rules.assigned.email=false;await service.saveSettings(settings);await service.changed({...ticket,ChangeVersion:'v7'},{status:'New',assignedToId:0});assert.equal(emails.length,attempts);assert.equal(records.at(-1).fields.Audience,'["team@example.com"]');assert.equal(records.at(-1).fields.DeliveryStatus,'In-app only');
 assert((await service.inbox()).some(item=>item.ticketId===5));allowed=[];assert.equal((await service.inbox()).length,0,'Inbox must respect ticket visibility');
 settings.sender='shared';settings.sharedMailbox='support@example.com';settings.replyTo='replies@example.com';await service.test(settings,'created');assert.deepEqual(emails.at(-1).message.toRecipients,[{emailAddress:{address:actor.email}}]);assert.deepEqual(emails.at(-1).message.from,{emailAddress:{address:'support@example.com'}});assert.deepEqual(emails.at(-1).message.replyTo,[{emailAddress:{address:'replies@example.com'}}]);
 const agent=new GraphNotificationService(graph,{siteId:'site',siteUrl:'https://example.com'},actor,false,url,'IT',async()=>[],async()=> '');await assert.rejects(agent.saveSettings(settings),/Only Helpdesk Admins/);await assert.rejects(agent.test(settings,'created'),/Only Helpdesk Admins/);await assert.rejects(agent.history(),/Only Helpdesk Admins/);
 // Verify hooks at the mutation layer rather than only in page handlers.
 let fields={Title:'Printer',Status:'New',Priority:'Medium',AssignedToLookupId:null};const updates=[];
 const writes={get:async()=>({fields:{...fields}}),patch:async(_path,value)=>Object.assign(fields,value),post:async(_path,body)=>{fields=body.fields;return{id:'5'};}};
 const tickets=new GraphTicketService(writes,{});tickets.editSchema={path:'/tickets',title:'Title',priority:'Priority',priorities:['Medium']};tickets.updateSchema={path:'/tickets',status:'Status',choices:['New','Assigned','Resolved','Closed'],assigned:'AssignedTo'};tickets.creationSchema={path:'/tickets',title:'Title',status:'Status',priority:'Priority',choices:['Medium']};tickets.notificationEnabled=async()=>true;tickets.getTickets=async()=>({tickets:[{...ticket,Status:fields.Status,AssignedTo:fields.AssignedToLookupId?{Id:Number(fields.AssignedToLookupId)}:undefined}]});tickets.onTicketChanged=async(t,b,c)=>updates.push({t,b,c});
 await tickets.updateTicket(5,{title:'Printer',priority:'Medium',status:'Assigned',assignedToId:11});assert.equal(updates.length,1);assert.equal(updates[0].b.status,'New');assert.equal(updates[0].b.assignedToId,0);assert.equal(updates[0].t.AssignedTo.Id,11);
 await tickets.updateTickets([5],{kind:'status',status:'Resolved'});assert.equal(updates.length,2);assert.equal(updates[1].b.status,'Assigned');
 tickets.updateSchema.archived='Archived'; const archiveStatus=fields.Status; await tickets.updateTickets([5],{kind:'archive'}); assert.equal(fields.Archived,true); await tickets.updateTickets([5],{kind:'archive',archived:false}); assert.equal(fields.Archived,false); assert.equal(fields.Status,archiveStatus,'Archive and restore must preserve ticket status');
 tickets.onTicketChanged=async()=>{throw Error('Mail failed');};await tickets.updateTicket(5,{title:'Printer',priority:'Medium',status:'Closed',assignedToId:11});assert.equal(fields.Status,'Closed');assert([...tickets.notificationWarnings].some(value=>value.includes('was saved')),'Email failure must not fail ticket updates');
 tickets.onTicketChanged=async(t,b,c)=>updates.push({t,b,c});await tickets.createTicket({title:'Printer',description:'',priority:'Medium'});assert.equal(updates.at(-1).c,true,'Creation must emit from the data service');
 dom.window.close();console.log('Notification checks passed: Graph 202, safe templates, recipients, event transitions, duplicate prevention, failures, shared sender, inbox scope, admin controls and mutation hooks.');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
