const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(file,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name] || require(name),module,module.exports);return module.exports;}
const contracts=load('src/webparts/helpdeskSystem/interfaces/IWorkspaceSetup.ts');
const {GraphSupportUnitsService,matchingSupportUnit,nextUnitMember}=load('src/webparts/helpdeskSystem/services/graph/GraphSupportUnitsService.ts',{'../../interfaces/IWorkspaceSetup':contracts});
const {applyAppRoleRules}=load('src/webparts/helpdeskSystem/services/appRoleRules.ts');
const item=(id,fields)=>({id:String(id),eTag:'v1',fields});
(async()=>{
  const store={
    units:[item(1,{Title:'Infrastructure',Active:true,AssignmentMethod:'Round robin',LastMemberId:0,CategoryIds:'[1]'}),item(2,{Title:'Applications',Active:true,AssignmentMethod:'Team lead',CategoryIds:'[2]',DefaultMemberId:4}),item(99,{Title:'__DeskPilotAssignmentSettings',RecordType:'Settings',AutoAssignEnabled:true,Active:false,CategoryIds:'[]'})],
    unitMembers:[item(1,{Title:'Alex',UnitLookupId:'1',MemberLookupId:'11',Available:true,RotationOrder:1}),item(2,{Title:'Bea',UnitLookupId:'1',MemberLookupId:'12',Available:true,RotationOrder:2}),item(3,{Title:'Chris',UnitLookupId:'1',MemberLookupId:'13',Available:false,RotationOrder:3}),item(4,{Title:'Dana',UnitLookupId:'2',MemberLookupId:'14',Available:true,RotationOrder:1})],
    categories:[item(1,{Title:'Network'}),item(2,{Title:'Applications'})],
    tickets:Array.from({length:15},(_,index)=>item(index+1,{Title:'Help',Status:'New',CategoryLookupId:'1'}))
  };
  const lists=Object.entries(store).map(([id])=>({id,displayName:id==='tickets' ? 'Tickets' : contracts.workspaceLists[id]}));
  const columns=[{name:'AssignedTo',personOrGroup:{}},{name:'Status',choice:{choices:['New','Assigned']}},{name:'AssignedUnit',lookup:{listId:'units'}},{name:'Category',lookup:{listId:'categories'}},{name:'Subcategory',lookup:{listId:'subcategories'}}];
  const unitColumns=['CategoryIds','DefaultMemberId','RecordType','AutoAssignEnabled'].map(name=>({name})).concat([{name:'AssignmentMethod',choice:{choices:['Round robin','Team lead']}}]);
  const copy=value=>JSON.parse(JSON.stringify(value));
  let cursorConflict=false,ticketConflict=false,writes=0;
  const target=path=>{const match=path.match(/\/lists\/([^/]+)\/items\/(\d+)/);return match && store[match[1]].find(value=>value.id===match[2]);};
  const graph={
    get:async path=>path.startsWith('/sites/example.') ? {id:'site'} : copy(target(path)),
    getAll:async path=>path.endsWith('/units/columns') ? unitColumns : path.endsWith('/columns') ? columns : path.includes('/items?') ? copy(store[path.match(/\/lists\/([^/]+)/)[1]]) : lists,
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
  assert.equal(matchingSupportUnit(data,2).id,2,'Each category routes independently');
  assert.equal(matchingSupportUnit(data,1).id,1);
  assert.equal(nextUnitMember(data.members,1,2).name,'Alex','Unavailable members must be skipped');
  assert.equal(nextUnitMember(data.members,1,999).name,'Alex','Removed cursor member must restart safely');
  assert.equal(nextUnitMember(data.members.map(member=>({...member,available:false})),1,0),undefined);
  await service.routeTicket(1);await service.routeTicket(2);await service.routeTicket(3);
  assert.deepEqual(store.tickets.slice(0,3).map(value=>value.fields.AssignedToLookupId),['11','12','11']);
  assert.equal(store.tickets[0].fields.AssignedUnitLookupId,'1');assert.equal(store.tickets[0].fields.Status,'Assigned');
  const before=writes;await service.routeTicket(1);assert.equal(writes,before,'Retries must preserve existing assignments');
  cursorConflict=true;await service.routeTicket(4);assert.equal(store.tickets[3].fields.AssignedToLookupId,'12','A cursor conflict must re-read and choose the next person');
  store.tickets[4].fields.CategoryLookupId='2';await service.routeTicket(5);
  assert.equal(store.tickets[4].fields.AssignedUnitLookupId,'2');assert.equal(store.tickets[4].fields.AssignedToLookupId,'14');assert.equal(store.tickets[4].fields.Status,'Assigned');
  store.unitMembers.forEach(value=>value.fields.Available=false);await service.routeTicket(6);
  assert.equal(store.tickets[5].fields.AssignedUnitLookupId,'1');assert.equal(store.tickets[5].fields.AssignedToLookupId,undefined,'Unavailable unit must fall back to queue');
  store.unitMembers[0].fields.Available=true;await service.routeTicket(6);assert.equal(store.tickets[5].fields.AssignedToLookupId,'11','Admin can route a waiting ticket once somebody becomes available');
  store.tickets[6].fields.Status='Resolved';await service.routeTicket(7);assert.equal(store.tickets[6].fields.AssignedUnitLookupId,undefined);
  store.tickets[7].fields.CategoryLookupId='99';await service.routeTicket(8);assert.equal(store.tickets[7].fields.AssignedUnitLookupId,undefined);
  store.tickets[8].fields.AssignedUnitLookupId='2';await service.routeTicket(9);assert.equal(store.tickets[8].fields.AssignedUnitLookupId,'2');
  ticketConflict=true;await assert.rejects(service.routeTicket(10),/412/);assert.equal(store.tickets[9].fields.AssignedToLookupId,'99','A concurrent manual assignment must never be overwritten');
  store.units[0].fields.Active=false;await service.routeTicket(11);assert.equal(store.tickets[10].fields.AssignedToLookupId,undefined);store.units[0].fields.Active=true;
  await assert.rejects(service.saveMember({unitId:1,userId:11,name:'Alex',available:true,order:0}),/already/);
  await assert.rejects(service.saveUnit({title:'Duplicate routing',categoryIds:[1],active:true,method:'Round robin'}),/already belongs/);
  await assert.rejects(service.saveUnit({title:'Invalid category',categoryIds:[99],active:true,method:'Round robin'}),/valid ticket categories/);
  await assert.rejects(service.saveUnit({title:'Wrong member',categoryIds:[],active:true,method:'Team lead',teamLeadMemberId:4},1),/must be a member/);
  await assert.rejects(service.saveUnit({title:'Infrastructure',active:true,method:'Round robin',categoryIds:[1]}),/already/);
  const cursor=store.units[0].fields.LastMemberId;await service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin',categoryIds:[1]},1);assert.equal(store.units[0].fields.LastMemberId,cursor,'Editing a unit must preserve rotation position');
  const emailBefore=writes;
  await assert.rejects(service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin',categoryIds:[1],email:'bad address'},1),/valid team email/);
  await assert.rejects(service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin',categoryIds:[1],email:'network@example.com'},1),/Initialize workspace/);assert.equal(writes,emailBefore,'Missing email schema must not partially save changes');
  unitColumns.push({name:'TeamEmail',text:{}});
  await service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin',categoryIds:[1],email:' network@example.com '},1);
  assert.equal((await service.load()).units[0].email,'network@example.com');
  await service.saveUnit({title:'Infrastructure renamed',active:true,method:'Round robin',categoryIds:[1],email:''},1);assert.equal((await service.load()).units[0].email,'','Team email can be cleared');
  data=await service.load();data.units.push({...data.units[0],id:99});assert.throws(()=>matchingSupportUnit(data,1),/Multiple/);
  const source={supportUnits:service,access:{admin:false},getTickets:async()=>({tickets:[]})};
  assert.equal(applyAppRoleRules(source,{id:'agent',scope:'assigned',actions:[]},11,'alex@example.com').supportUnits,undefined);
  assert.equal(applyAppRoleRules({...source,access:{admin:true}},{id:'admin',scope:'all',actions:[]},11,'alex@example.com').supportUnits,service,'Helpdesk Admin can configure units independently of classification settings');
  store.unitMembers[3].fields.Available=true;
  await service.saveUnit({title:'Applications',categoryIds:[2],active:true,method:'Team lead',teamLeadMemberId:4},2);
  const cursorBefore=store.units[1].fields.LastMemberId;store.tickets[11].fields.CategoryLookupId='2';await service.routeTicket(12);
  assert.equal(store.tickets[11].fields.AssignedToLookupId,'14');assert.equal(store.units[1].fields.LastMemberId,cursorBefore,'Specific assignment must not advance the rotation cursor');
  store.unitMembers[3].fields.Available=false;store.tickets[12].fields.CategoryLookupId='2';await service.routeTicket(13);
  assert.equal(store.tickets[12].fields.AssignedToLookupId,undefined,'Unavailable designated member must not receive new tickets');
  assert.equal(store.tickets[12].fields.AssignedUnitLookupId,'2');
  const savedCategories=store.units[0].fields.CategoryIds;
  delete store.units[0].fields.CategoryIds;
  store.routingRules=[item(1,{CategoryLookupId:'1',UnitLookupId:'1',Active:true})];lists.push({id:'routingRules',displayName:'Routing Rules'});
  assert.deepEqual((await service.load()).units[0].categoryIds,[1],'Read existing category routing during upgrade');
  store.units[0].fields.CategoryIds='[]';assert.deepEqual((await service.load()).units[0].categoryIds,[],'Explicitly clearing categories must not restore retired rules');
  store.units[0].fields.CategoryIds=savedCategories;lists.splice(lists.findIndex(list=>list.id==='routingRules'),1);
  assert.equal((await service.load()).units.length,2,'Routing Rules list is not required');
  await service.setAutoAssignment(false);const disabledWrites=writes;await service.routeTicket(14);assert.equal(writes,disabledWrites,'Disabled auto assignment must not change tickets or the cursor');assert.equal((await service.load()).autoAssignEnabled,false);
  await service.setAutoAssignment(true);await service.routeTicket(14);assert.equal(store.tickets[13].fields.AssignedToLookupId,'11');
  const created=await service.createUnits(['Infrastructure renamed','Email Support','Desktop Support']);assert.deepEqual(created.created,['Email Support','Desktop Support']);assert.deepEqual(created.skipped,['Infrastructure renamed']);
  assert.equal((await service.load()).units.length,4,'The settings record must not appear as a unit');
  await assert.rejects(service.createUnits(['Duplicate','duplicate']),/duplicate/);
  const existingPost=graph.post;let lost=true;
  graph.post=async(path,body)=>{await existingPost(path,body);if(lost){lost=false;throw Error('Response lost');}};
  const partial=await service.createUnits(['Uncertain Unit','Not Yet Created']);assert.equal(partial.failed.length,2);assert.equal(partial.failed[1].message,'Not attempted.');
  const recovered=await service.createUnits(['Uncertain Unit','Not Yet Created']);assert.deepEqual(recovered.skipped,['Uncertain Unit']);assert.deepEqual(recovered.created,['Not Yet Created']);assert.equal(store.units.filter(entry=>entry.fields.Title==='Uncertain Unit').length,1,'A retry must not duplicate a unit saved before a lost response');graph.post=existingPost;
  const removedColumn=unitColumns.splice(unitColumns.findIndex(column=>column.name==='AutoAssignEnabled'),1)[0];const schemaWrites=writes;await assert.rejects(service.createUnits(['Blocked']),/Initialize workspace/);assert.equal(writes,schemaWrites);unitColumns.push(removedColumn);
  await assert.rejects(service.setTeamLead(1,4),/member of this support team/);
  await service.setTeamLead(1,1);assert.equal(store.units[0].fields.DefaultMemberId,1);
  await service.saveUnit({title:'Infrastructure renamed',categoryIds:[1],active:true,method:'Round robin',teamLeadMemberId:1},1);
  assert.equal((await service.load()).units[0].teamLeadMemberId,1,'Team lead must persist when assignment is round robin');
  await service.saveUnit({title:'Infrastructure renamed',categoryIds:[1],active:true,method:'Team lead',teamLeadMemberId:1},1);
  const leadCursor=store.units[0].fields.LastMemberId;await service.routeTicket(15);assert.equal(store.tickets[14].fields.AssignedToLookupId,'11');assert.equal(store.units[0].fields.LastMemberId,leadCursor);
  store.units.push(item(998,{RecordType:'Settings',Title:'Duplicate Settings',AutoAssignEnabled:true}));assert.equal((await service.load()).autoAssignEnabled,false);await assert.rejects(service.setAutoAssignment(true),/Duplicate/);store.units.pop();
  lists.splice(lists.findIndex(list=>list.id==='unitMembers'),1);await assert.rejects(service.load(),/incomplete/);
  const {GraphTicketService}=load('src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts',{
    '../../utils/commentContent':load('src/webparts/helpdeskSystem/utils/commentContent.ts'),'./GraphClient':{},'./GraphClassificationService':{},'../../utils/ticketAttachments':{validateTicketAttachments:()=>{}},
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
