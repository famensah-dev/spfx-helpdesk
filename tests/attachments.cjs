const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
function load(path,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(name=>deps[name]||require(name),module,module.exports);return module.exports;}
const validation=load('src/webparts/helpdeskSystem/utils/ticketAttachments.ts');
const {SharePointAttachments}=load('src/webparts/helpdeskSystem/services/graph/SharePointAttachments.ts',{'../../utils/ticketAttachments':validation});
(async()=>{
  assert.throws(()=>validation.validateTicketAttachments([{name:'empty.pdf',size:0}]),/empty/);
  assert.throws(()=>validation.validateTicketAttachments([{name:'bad.pdf',size:NaN}]),/invalid/);
  assert.throws(()=>validation.validateTicketAttachments([{name:'x.exe',size:1}]),/use PDF/);
  assert.throws(()=>validation.validateTicketAttachments([{name:'x.pdf',size:6*1024*1024}]),/5 MB/);
  assert.throws(()=>validation.validateTicketAttachments([{name:'X.pdf',size:1},{name:'x.PDF',size:1}]),/already/);
  assert.throws(()=>validation.validateTicketAttachments([{name:'x/.pdf',size:1}]),/unsupported/);
  const store=new Map(),posts=[];let failSecond=true,enabled=true;
  const realFetch=global.fetch;
  global.fetch=async(url,options={})=>{
    if(url.includes('EnableAttachments'))return new Response(JSON.stringify({EnableAttachments:enabled}));
    if(options.method==='POST'){
      const name=decodeURIComponent(url.match(/FileName='(.*)'/)[1]).replace(/''/g,"'");posts.push(name);
      if(name==='second.pdf'&&failSecond){failSecond=false;return new Response('',{status:503});}
      store.set(name,await options.body.arrayBuffer());return new Response('{}');
    }
    if(url.endsWith('/AttachmentFiles'))return new Response(JSON.stringify({value:[...store.keys()].map(FileName=>({FileName,ServerRelativeUrl:'/sites/test/Lists/Tickets/Attachments/1/'+FileName}))}));
    if(url.includes('GetFileByServerRelativePath'))return Response.json({Length:'4',Author:{Title:'Email sender'},TimeCreated:'2026-11-02T10:00:00Z'});
    const name=decodeURIComponent(url.match(/AttachmentFiles\('(.*)'\)\/\$value$/)[1]).replace(/''/g,"'");
    return new Response(store.get(name));
  };
  try {
    const service=new SharePointAttachments('https://example.sharepoint.com/sites/test',async()=>'test-token');
    const id='11111111-1111-1111-1111-111111111111';
    const first=new File(['first'],'first.pdf'),second=new File(['second'],'second.pdf');
    await assert.rejects(()=>service.upload(id,1,[first,second]),/retained/);assert.equal(store.size,1);
    await service.upload(id,1,[first,second]);assert.deepEqual(posts,['first.pdf','second.pdf','second.pdf']);assert.equal(store.size,2);
    const before=posts.length;
    await assert.rejects(()=>service.upload(id,1,[new File(['new'],'new.pdf'),new File(['other'],'first.pdf')]),/different file/);
    assert.equal(posts.length,before,'All name collisions must be checked before uploading anything');
    await service.upload(id,1,[new File(['safe'],"O'Brien #1%.png")]);
    const file=(await service.list(id,1)).find(value=>value.name.includes("O'Brien"));
    assert(file.contentUrl.includes('%27%27')&&file.contentUrl.includes('%23')&&file.contentUrl.includes('%25'));assert(!file.url.includes('#'));assert(!file.url.endsWith('/$value'));assert(file.url.endsWith("O'Brien%20%231%25.png"));assert.equal(file.author,'Email sender');
    await service.upload(id,1,[new File(['word'],'email report.docx')]);const office=(await service.list(id,1)).find(value=>value.name==='email report.docx');assert(office.previewUrl.endsWith('email%20report.docx?web=1'));assert(!office.url.includes('?web='));
    const apiFetch=global.fetch;global.fetch=async()=>Response.json({value:[{FileName:'report.pdf',ServerRelativeUrl:'//outside.example/report.pdf'}]});const fallback=(await service.list(id,1))[0];assert(fallback.url.startsWith('https://example.sharepoint.com/sites/test/_api/'));global.fetch=apiFetch;
    enabled=false;await assert.rejects(()=>service.ensureEnabled(id),/disabled/);
    await assert.rejects(()=>service.list('bad-id',1),/Invalid/);
  } finally {global.fetch=realFetch;}
  console.log('Attachment checks passed: validation, partial retries, identical-file checks, collision rejection, safe URLs and disabled attachments.');
})().catch(error=>{console.error(error);process.exitCode=1;});
