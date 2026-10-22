const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name] || require(name),module,module.exports);return module.exports;}
const contracts=load('src/webparts/helpdeskSystem/interfaces/IWorkspaceSetup.ts');
const {GraphSupportUnitsService,matchingRoutingRule,nextUnitMember}=load('src/webparts/helpdeskSystem/services/graph/GraphSupportUnitsService.ts',{'../../interfaces/IWorkspaceSetup':contracts});
const {applyAppRoleRules}=load('src/webparts/helpdeskSystem/services/appRoleRules.ts');
const item=(id,fields)=>({id:String(id),eTag:'v1',fields});
(async()=>{
  const store={
    units:[item(1,{Title:'Infrastructure',Active:true,AssignmentMethod:'Round robin',LastMemberId:0}),item(2,{Title:'Applications',Active:true,AssignmentMethod:'Unit queue'})],
    unitMembers:[item(1,{Title:'Alex',UnitLookupId:'1',MemberLookupId:'11',Available:true,RotationOrder:1}),item(2,{Title:'Bea',UnitLookupId:'1',MemberLookupId:'12',Available:true,RotationOrder:2}),item(3,{Title:'Chris',UnitLookupId:'1',MemberLookupId:'13',Available:false,RotationOrder:3})],
    routingRules:[item(1,{Title:'Network',CategoryLookupId:'1',UnitLookupId:'1',Active:true}),item(2,{Title:'Applications',CategoryLookupId:'2',UnitLookupId:'2',Active:true})],
    categories:[item(1,{Title:'Network'}),item(2,{Title:'Applications'})],
    tickets:Array.from({length:15},(_,index)=>item(index+1,{Title:'Help',Status:'New',CategoryLookupId:'1'}))
  };
  const lists=Object.entries(store).map(([id])=>({id,displayName:id==='tickets' ? 'Tickets' : contracts.workspaceLists[id]}));
  const columns=[{name:'AssignedTo',personOrGroup:{}},{name:'Status',choice:{choices:['New','Assigned']}},{name:'AssignedUnit',lookup:{listId:'units'}},{name:'Category',lookup:{listId:'categories'}},{name:'Subcategory',lookup:{listId:'subcategories'}}];
  const copy=value=>JSON.parse(JSON.stringify(value));
  let cursorConflict=false,ticketConflict=false,writes=0;
  const target=path=>{const match=path.match(/\/lists\/([^/]+)\/items\/(\d+)/);return match && store[match[1]].find(value=>value.id===match[2]);};
  const graph={
    get:async path=>path.startsWith('/sites/example.') ? {id:'site'} : copy(target(path)),
    getAll:async path=>path.endsWith('/columns') ? columns : path.includes('/items?') ? copy(store[path.match(/\/lists\/([^/]+)/)[1]]) : lists,
    patch:async(path,fields,etag)=>{
      const current=target(path);assert(etag,'Every mutable item must use its version');
      if(path.includes('/units/') && cursorConflict){cursorConflict=false;current.eTag+='x';current.fields.LastMemberId=1;throw Error('update failed (412)');}
      if(path.includes('/tickets/') && ticketConflict){ticketConflict=false;current.eTag+='x';current.fields.AssignedToLookupId='99';throw Error('update failed (412)');}
      if(etag!==current.eTag)throw Error('update failed (412)');
      writes++;Object.assign(current.fields,fields);current.eTag+='x';
    },
    post:async(path,body)=>{writes++;const key=path.match(/\/lists\/([^/]+)/)[1];store[key].push(item(store[key].length+1,body.fields));}
  };
  const service=new GraphSupportUnitsService(graph,{siteUrl:'https://example.sharepoint.com/sites/helpdesk',listName:'Tickets'});
  let data=await service.load();
  assert.equal(matchingRoutingRule(data,2).unitId,2,'Each category routes independently');
  assert.equal(matchingRoutingRule(data,1).unitId,1);
  assert.equal(nextUnitMember(data.members,1,2).name,'Alex','Unavailable members must be skipped');
  assert.equal(nextUnitMember(data.members,1,999).name,'Alex','Removed cursor member must restart safely');
  assert.equal(nextUnitMember(data.members.map(member=>({...member,available:false})),1,0),undefined);
  await service.routeTicket(1);await service.routeTicket(2);await service.routeTicket(3);
  assert.deepEqual(store.tickets.slice(0,3).map(value=>value.fields.AssignedToLookupId),['11','12','11']);
  assert.equal(store.tickets[0].fields.AssignedUnitLookupId,'1');assert.equal(store.tickets[0].fields.Status,'Assigned');
  const before=writes;await service.routeTicket(1);assert.equal(writes,before,'Retries must preserve existing assignments');
  cursorConflict=true;await service.routeTicket(4);assert.equal(store.tickets[3].fields.AssignedToLookupId,'12','A cursor conflict must re-read and choose the next person');
  store.tickets[4].fields.CategoryLookupId='2';await service.routeTicket(5);
  assert.equal(store.tickets[4].fields.AssignedUnitLookupId,'2');assert.equal(store.tickets[4].fields.AssignedToLookupId,undefined);assert.equal(store.tickets[4].fields.Status,'New');
  store.unitMembers.forEach(value=>value.fields.Available=false);await service.routeTicket(6);
  assert.equal(store.tickets[5].fields.AssignedUnitLookupId,'1');assert.equal(store.tickets[5].fields.AssignedToLookupId,undefined,'Unavailable unit must fall back to queue');
  store.unitMembers[0].fields.Available=true;await service.routeTicket(6);assert.equal(store.tickets[5].fields.AssignedToLookupId,'11','Admin can route a waiting ticket once somebody becomes available');
  store.tickets[6].fields.Status='Resolved';await service.routeTicket(7);assert.equal(store.tickets[6].fields.AssignedUnitLookupId,undefined);
  store.tickets[7].fields.CategoryLookupId='99';await service.routeTicket(8);assert.equal(store.tickets[7].fields.AssignedUnitLookupId,undefined);
  store.tickets[8].fields.AssignedUnitLookupId='2';await service.routeTicket(9);assert.equal(store.tickets[8].fields.AssignedUnitLookupId,'2');
  ticketConflict=true;await assert.rejects(service.routeTicket(10),/412/);assert.equal(store.tickets[9].fields.AssignedToLookupId,'99','A concurrent manual assignment must never be overwritten');
  store.units[0].fields.Active=false;await service.routeTicket(11);assert.equal(store.tickets[10].fields.AssignedToLookupId,undefined);store.units[0].fields.Active=true;
  await assert.rejects(service.saveMember({unitId:1,userId:11,name:'Alex',available:true,order:0}),/already/);
  await assert.rejects(service.saveRule({title:'Duplicate',categoryId:1,unitId:1,active:true}),/already/);
  await assert.rejects(service.saveRule({title:'Invalid category',categoryId:99,unitId:1,active:true}),/valid category/);
  await assert.rejects(service.saveUnit({title:'Infrastructure',active:true,method:'Round robin'}),/already/);
  const cursor=store.units[0].fields.LastMemberId;await service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin'},1);assert.equal(store.units[0].fields.LastMemberId,cursor,'Editing a unit must preserve rotation position');
  data=await service.load();data.rules.push({...data.rules[0],id:99});assert.throws(()=>matchingRoutingRule(data,1),/Multiple/);
  const source={supportUnits:service,access:{admin:false},getTickets:async()=>({tickets:[]})};
  assert.equal(applyAppRoleRules(source,{id:'agent',scope:'assigned',actions:[]},11,'alex@example.com').supportUnits,undefined);
  assert.equal(applyAppRoleRules({...source,access:{admin:true}},{id:'admin',scope:'all',actions:[]},11,'alex@example.com').supportUnits,service,'Helpdesk Admin can configure units independently of classification settings');
  lists.splice(lists.findIndex(list=>list.id==='routingRules'),1);await assert.rejects(service.load(),/incomplete/);
  const {GraphTicketService}=load('src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts',{
    './GraphClient':{},'./GraphClassificationService':{},'../../utils/ticketAttachments':{validateTicketAttachments:()=>{}},
    './SharePointAttachments':{SharePointAttachments:class {async ensureEnabled(){}}}
  });
  let creations=0,routingFails=false;const events=[];
  const creator=new GraphTicketService({post:async()=>{creations++;return{id:String(creations)};}},{siteUrl:'https://example.sharepoint.com'},undefined,async()=>'',async id=>{events.push(`route:${id}`);if(routingFails)throw Error('routing unavailable');return 'Assigned';});
  creator.context={sitePath:'/sites/site',listId:'tickets',lists:[]};
  creator.creationSchema={path:'/sites/site/lists/tickets',title:'Title',status:'Status',priority:'Priority',choices:['Medium']};
  creator.updateSchema={path:'/sites/site/lists/tickets',assigned:'AssignedTo',status:'Status',choices:['New','Assigned']};
  creator.uploadAttachments=async id=>{events.push(`upload:${id}`);};
  await creator.createTicket({title:'Example',description:'',priority:'Medium',attachments:[{}]});
  assert.deepEqual(events,['upload:1','route:1'],'Upload attachments before routing so a routing failure cannot discard selected files');
  await creator.createTicket({title:'Manual',description:'',priority:'Medium',assignedToId:11});assert.equal(events.length,2,'Explicit assignments bypass automatic routing');
  routingFails=true;await assert.rejects(creator.createTicket({title:'Retry later',description:'',priority:'Medium'}),error=>error.createdTicketId===3 && error.message.includes('was created'));
  assert.equal(creations,3,'Routing failures must not retry creation');
  console.log('Support units passed: category routing, round robin, availability, queues, safe retries, concurrent cursor/ticket writes, configuration validation and admin access.');
})().catch(error=>{console.error(error);process.exitCode=1;});
