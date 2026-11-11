const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/appRoleRules.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(()=>({}),m,m.exports);
const {applyAppRoleRules}=m.exports;
(async()=>{
 const writes=[];const source={access:{agent:true},getTickets:async()=>({tickets:[]}),getCreationOptions:async()=>({assignment:true}),createTicket:async input=>writes.push(['ticket',input]),getFaqAccess:async()=>({canManage:false,canCreate:true,canEditArticles:true}),getFaqs:async()=>[],saveFaq:async(input,id)=>writes.push(['faq',id]),deleteFaq:async()=>{},updateFaqs:async()=>{}};
 const agent=applyAppRoleRules(source,{id:'agent',scope:'assigned',actions:['tickets','create','faqs']},7,'agent@example.com');
 assert.equal((await agent.getCreationOptions()).assignment,true);await agent.createTicket({title:'My new ticket',assignedToId:8});assert.equal(writes.length,1);
 assert.equal((await agent.getFaqAccess()).canCreate,true);await agent.saveFaq({question:'My article'});await agent.saveFaq({question:'My update'},1);assert.equal(writes.length,3);assert.equal(agent.deleteFaq,undefined);assert.equal(agent.updateFaqs,undefined);
 const requester=applyAppRoleRules(source,{id:'requester',scope:'own',actions:['tickets','create','faqs']},7,'requester@example.com');assert.equal((await requester.getCreationOptions()).assignment,false);await assert.rejects(()=>requester.createTicket({title:'Request',assignedToId:8}),/assign/);assert.equal(requester.saveFaq,undefined);
 const noCreate=applyAppRoleRules(source,{id:'agent',scope:'assigned',actions:['tickets','faqs']},7,'agent@example.com');assert.equal(noCreate.createTicket,undefined);assert.equal((await noCreate.getCreationOptions()).assignment,false);
 console.log('Agent creation permissions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
