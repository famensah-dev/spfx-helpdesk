const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, dependencies = {}) {const module = {exports:{}}; const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText; new Function('require','module','exports',code)(name => dependencies[name] || require(name),module,module.exports); return module.exports;}
const contracts = load('src/webparts/helpdeskSystem/interfaces/IWorkspaceSetup.ts');
const {WorkspaceSetupService, columnConflict} = load('src/webparts/helpdeskSystem/services/WorkspaceSetupService.ts', {'../interfaces/IWorkspaceSetup':contracts});
(async () => {
  const lists = [], columns = new Map(), items = new Map(); let changes = 0, finished = 0, fail = false;
  const graph = {
    get: async () => ({id:'site'}),
    getAll: async path => {
      if (path.includes('/columns')) return columns.get(path.split('/lists/')[1].split('/')[0]) || [];
      if (path.includes('/items')) return items.get(path.split('/lists/')[1].split('/')[0]) || [];
      return lists;
    },
    post: async (path,body) => {
      if (fail) {fail = false; throw Error('Transient setup failure');}
      changes++;
      if (path.endsWith('/lists')) {const id = `00000000-0000-0000-0000-${String(lists.length + 1).padStart(12,'0')}`; const list={id,displayName:body.displayName}; lists.push(list); columns.set(id,[{id:'title',name:'Title',text:{}}]); items.set(id,[]); return list;}
      const id = path.split('/lists/')[1].split('/')[0];
      if (path.endsWith('/columns')) {const value={...body,id:String(columns.get(id).length)}; columns.get(id).push(value); return value;}
      if (path.endsWith('/items')) {const value={id:String(items.get(id).length + 1),fields:body.fields}; items.get(id).push(value); return value;}
      throw Error('Unexpected POST');
    },
    patch: async (path,body) => {changes++; const id=path.split('/lists/')[1].split('/')[0]; if (path.includes('/columns/')) Object.assign(columns.get(id).find(value=>value.id===path.split('/').pop()),body); else Object.assign(items.get(id).find(value=>value.id===path.split('/items/')[1].split('/')[0]).fields,body);}
  };
  const setup = new WorkspaceSetupService(graph,{siteUrl:'https://example.sharepoint.com/sites/test',listName:'Tickets'},async ids => {assert(ids.tickets && ids.categories); finished++;});
  assert.equal((await setup.inspect()).steps.some(step=>step.blocked),false);
  await setup.run(()=>{});
  assert.equal(lists.length,6);
  const sub=lists.find(value=>value.displayName==='Ticket Subcategories');
  const cats=lists.find(value=>value.displayName==='Ticket Categories');
  assert.equal(columns.get(sub.id).find(value=>value.name==='Category').lookup.listId,cats.id);
  assert.equal(items.get(cats.id).length,0);
  assert.equal(items.get(sub.id).length,0);
  items.get(cats.id).push({id:'existing-category',fields:{Title:'General'}});
  items.get(sub.id).push({id:'existing-subcategory',fields:{Title:'General',CategoryLookupId:'existing-category'}});
  const priorityList=lists.find(value=>value.displayName==='Ticket Priorities');
  assert.equal(items.get(priorityList.id).length,4);
  items.get(priorityList.id)[0].fields.ResponseMinutes=777;
  const before=changes;
  await setup.inspect(); await setup.run(()=>{});
  assert.equal(changes,before,'Second setup must not duplicate or rewrite lists, columns or priorities');
  assert.equal(items.get(cats.id).length,1,'Existing categories must be preserved');
  assert.equal(items.get(sub.id)[0].fields.CategoryLookupId,'existing-category','Existing subcategories must be preserved');
  assert.equal(items.get(priorityList.id)[0].fields.ResponseMinutes,777);
  const ticket=lists.find(value=>value.displayName==='Tickets');
  const status=columns.get(ticket.id).find(value=>value.name==='Status');
  status.choice.choices.push('Legacy');
  status.choice.choices=status.choice.choices.filter(value=>value!=='Assigned');
  await setup.inspect(); await setup.run(()=>{});
  assert(status.choice.choices.includes('Legacy') && status.choice.choices.includes('Assigned'));
  assert(columnConflict({name:'Category',lookup:{listId:'wrong'}},{name:'Category',lookup:{target:'categories'}},{categories:cats.id}));
  const missing = new WorkspaceSetupService(graph,{siteUrl:'https://example.sharepoint.com/sites/test',listName:'Tickets',listId:'missing'},async()=>{});
  await assert.rejects(missing.inspect(),/Configured/);
  const broken=columns.get(ticket.id).find(value=>value.name==='Archived'); delete broken.boolean; broken.text={};
  assert((await setup.inspect()).steps.some(step=>step.blocked));
  await assert.rejects(setup.run(()=>{}),/Schema conflicts/);
  delete broken.text; broken.boolean={};
  columns.get(ticket.id).splice(columns.get(ticket.id).findIndex(value=>value.name==='Escalated'),1);
  await setup.inspect(); fail=true;
  await assert.rejects(setup.run(()=>{}),/Transient/);
  await setup.inspect(); await setup.run(()=>{});
  assert.equal(columns.get(ticket.id).filter(value=>value.name==='Escalated').length,1);
  assert(finished>=3);
  console.log('Workspace setup checks passed: dependency order, safe retry, no duplicates, preserved choices/targets, conflicts and explicit missing bindings.');
})().catch(error=>{console.error(error);process.exitCode=1;});
