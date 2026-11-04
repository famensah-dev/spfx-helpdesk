const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,deps={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),m,m.exports);return m.exports;}
const root='src/webparts/helpdeskSystem/';
const {GraphTicketService}=load(root+'services/graph/GraphTicketService.ts',{'../../utils/ticketStatuses':load(root+'utils/ticketStatuses.ts'),'../../utils/commentContent':load(root+'utils/commentContent.ts'),'./GraphClassificationService':{},'./SharePointAttachments':{},'../../utils/ticketAttachments':{validateTicketAttachments:()=>{}},'./GraphClient':{}});
let fields={Status:'New',SlaPauseIntervals:'[]'},version='v1';
const graph={get:async()=>({fields:JSON.parse(JSON.stringify(fields)),eTag:version}),patch:async(path,update,etag)=>{assert.equal(etag,'v1');Object.assign(fields,update);},post:async(path,body)=>{fields=body.fields;return{id:'2'};}};
(async()=>{
 const service=new GraphTicketService(graph,{});service.updateSchema={path:'/tickets',status:'Status',assigned:'AssignedTo',pause:'SlaPauseIntervals',choices:['New','In Progress','Pending','Resolved','Closed']};
 await service.updateTickets([1],{kind:'status',status:'Pending'});let history=JSON.parse(fields.SlaPauseIntervals);assert.equal(history.length,1);assert(history[0].start);assert.equal(history[0].end,undefined);
 await service.updateTickets([1],{kind:'status',status:'In Progress'});history=JSON.parse(fields.SlaPauseIntervals);assert(history[0].end,'Resume closes the pause in the same status patch');
 fields={Status:'Pending',SlaPauseIntervals:'[]'};await service.updateTickets([1],{kind:'status',status:'In Progress'});assert.equal(fields.SlaPauseIntervals,'null','External status changes with missing history must remain unknown');
 fields={Status:'New',SlaPauseIntervals:'[]'};version=undefined;const result=await service.updateTickets([1],{kind:'status',status:'Pending'});assert.equal(result.failed.length,1);assert.equal(fields.Status,'New','A missing version must not overwrite pause history');
 version='v1';service.context={sitePath:'/sites/site',listId:'tickets',lists:[]};service.creationSchema={path:'/tickets',title:'Title',status:'Status',priority:'Priority',choices:['Medium']};await service.createTicket({title:'Test',priority:'Medium',description:''});assert.equal(fields.SlaPauseIntervals,'[]','New tickets have a reliable empty pause history');
 console.log('SLA pause tracking passed: enter/resume Pending, history initialization, missing-version protection and unknown external changes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
