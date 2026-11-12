import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'require', 'module', compiled)(module.exports, name => {
    if (name in dependencies) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  }, module);
  return module.exports;
}
const roles = load('../src/webparts/helpdeskSystem/interfaces/IRoleManagement.ts');



const setup=load('../src/webparts/helpdeskSystem/interfaces/IWorkspaceSetup.ts');
const {loadClassification}=load('../src/webparts/helpdeskSystem/services/graph/GraphClassificationService.ts',{'../../interfaces/IWorkspaceSetup':setup});
test('Classification loader explicitly requests lookup IDs and filters inactive parents',async()=>{
 const lists=['categories','subcategories','issueTypes'].map(id=>({id,displayName:setup.workspaceLists[id]}));
 const queries=[];
 const graph={getAll:async path=>{
 queries.push(path);
 const list=path.split('/lists/')[1].split('/')[0];
 if(path.endsWith('/columns'))return [{name:'Title',displayName:'Title',text:{}},{name:'Active',displayName:'Active',boolean:{}},{name:'SortOrder',displayName:'Sort Order',number:{}},...(list==='subcategories'?[{name:'Category',displayName:'Category',lookup:{listId:'categories'}}]:[])];
 if(list==='categories')return [{id:'1',fields:{Title:'Microsoft 365',Active:true}},{id:'2',fields:{Title:'Inactive',Active:false}}];
 if(list==='issueTypes')return [];
 assert(path.includes('CategoryLookupId'),'Lookup IDs must be selected explicitly');
 return [{id:'3',fields:{Title:'Outlook',Active:true,CategoryLookupId:'1'}},{id:'4',fields:{Title:'Hidden',Active:true,CategoryLookupId:'2'}}];
 }};
 const data=await loadClassification(graph,'/sites/site',lists);
 assert.deepEqual(data.subcategories,[{id:'3',name:'Outlook',parentId:'1'}]);
 assert.equal(queries.length,6);
});
