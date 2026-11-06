const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/AzureTicketService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);
const {azureRpcUrl,createAzureService}=mod.exports;
(async()=>{
 assert.equal(azureRpcUrl('https://api.example'),'https://api.example/api/rpc');
 for(const url of ['http://api.example','https://user:pass@api.example','https://api.example?key=secret'])assert.throws(()=>azureRpcUrl(url));
 const calls=[];
 const request=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);assert.equal(options.headers.Authorization,'Bearer api-token');return {ok:true,json:async()=>({result:body.method==='session'?{access:{email:'user@example.com'},roleRules:{id:'admin',actions:[]},capabilities:['getTickets','createTicket','addComment','sla.saveClockRules','workspaceMaintenance.inspect','workspaceMaintenance.run']}:body.method==='workspaceMaintenance.inspect'?{targets:[{Id:1}],reviewToken:'review'}:body.method==='workspaceMaintenance.run'?{progress:[{message:'Complete'}]}:null})};};
 const service=await createAzureService('https://api.example',async()=>'api-token',request);
 await service.addComment(1,'Text',{html:'<p>Text</p>',files:[new File(['bytes'],'test.txt',{type:'text/plain'})]});
 assert.equal(Buffer.from(calls.at(-1).args[2].files[0].data,'base64').toString(),'bytes');assert.equal(calls.at(-1).args[2].html,'<p>Text</p>');
 await service.workspaceMaintenance.inspect('clear',['list']);await service.workspaceMaintenance.run('clear',['list'],'CLEAR LIST ITEMS',()=>{});assert.equal(calls.at(-1).args[3],'review');
 assert.equal(service.updateTicket,undefined,'Unsupported operations are not exposed');
 await assert.rejects(createAzureService('https://api.example',async()=>'token',async()=>({ok:false,json:async()=>({error:'Access denied'})})),/Access denied/);
 console.log('Azure transport passed: API-only access, capabilities, attachments, rich comments, maintenance review and denied sessions.');
})().catch(error=>{console.error(error);process.exitCode=1;});
