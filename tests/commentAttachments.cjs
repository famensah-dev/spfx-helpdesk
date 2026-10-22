const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(path,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),module,module.exports);return module.exports;}
const validation=load('src/webparts/helpdeskSystem/utils/ticketAttachments.ts');
let failedUpload=true,enabled=true,uploadCalls=0,author=7,lostResponse=false;
class AttachmentStore{async ensureEnabled(){if(!enabled)throw Error('disabled');}async list(){return[{name:'report.pdf',url:'https://example.sharepoint.com/report.pdf'}];}async upload(){uploadCalls++;if(failedUpload)throw Error('interrupted');}}
const {GraphTicketService}=load('src/webparts/helpdeskSystem/services/graph/GraphTicketService.ts',{'./SharePointAttachments':{SharePointAttachments:AttachmentStore},'../../utils/ticketAttachments':validation,'./GraphClassificationService':{},'./GraphClient':{}});
(async()=>{
  const items=[];let posts=0;
  const graph={getAll:async()=>items,get:async()=>items[0],post:async(_path,{fields})=>{posts++;const item={id:String(posts),fields:{...fields,AuthorLookupId:'7',Attachments:true},createdDateTime:'2026-10-19T10:00:00Z',createdBy:{user:{displayName:'Agent'}}};items.push(item);if(lostResponse){lostResponse=false;throw Error('Save result unknown');}return item;}};
  const service=new GraphTicketService(graph,{siteUrl:'https://example.sharepoint.com/sites/test'},undefined,async()=>'test-token');
  const listId='11111111-1111-1111-1111-111111111111';
  service.context={listId,sitePath:'/sites/test',lists:[]};service.commentSchema={listId:'22222222-2222-2222-2222-222222222222',path:'/comments',key:'TicketKey',content:'Content'};
  const options={files:[new File(['report'],'report.pdf')],requestId:'33333333-3333-3333-3333-333333333333'};
  const realFetch=global.fetch;global.fetch=async()=>new Response(JSON.stringify({Id:author}));
  try {
    enabled=false;await assert.rejects(()=>service.addComment(5,'Progress',options),/disabled/);assert.equal(posts,0);enabled=true;
    await assert.rejects(()=>service.addComment(5,'Progress',options),error=>error.createdCommentId==='1');assert.equal(posts,1);
    failedUpload=false;await service.uploadCommentAttachments(5,'1',options.files);assert.equal(posts,1);
    author=8;const before=uploadCalls;await assert.rejects(()=>service.uploadCommentAttachments(5,'1',options.files),/own comment/);assert.equal(uploadCalls,before);author=7;
    await assert.rejects(()=>service.uploadCommentAttachments(6,'1',options.files),/own comment/);
    await service.addComment(5,'Progress',options);assert.equal(posts,1,'Retry must reuse the saved comment');
    const comments=await service.getComments(5);assert.equal(comments[0].attachments[0].name,'report.pdf');
    lostResponse=true;const next={requestId:'44444444-4444-4444-4444-444444444444'};
    await assert.rejects(()=>service.addComment(5,'Next',next),/unknown/);await service.addComment(5,'Next',next);assert.equal(posts,2,'Uncertain save response should be reconciled by request ID');
    const createdFields=[];const creator=new GraphTicketService({post:async(_path,{fields})=>{createdFields.push(fields);return{id:'99'};}},{currentUserId:7,currentUserEmail:'requester@example.com'});
    creator.creationSchema={path:'/tickets',title:'Title',status:'Status',priority:'Priority',choices:['Medium']};creator.requesterFields={requestedBy:'RequestedBy',email:'RequesterEmail',source:'TicketSource'};
    await creator.createTicket({title:'New request',description:'',priority:'Medium'});
    assert.equal(createdFields[0].RequestedByLookupId,'7');assert.equal(createdFields[0].RequesterEmail,'requester@example.com');assert.equal(createdFields[0].TicketSource,'DeskPilot');
  } finally {global.fetch=realFetch;}
  console.log('Comment attachment checks passed: disabled preflight, saved IDs, upload retries, ownership, ticket binding, file listing and uncertain-save reconciliation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
