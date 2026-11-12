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



const {canAccessSettings}=load('../src/webparts/helpdeskSystem/services/appRoleRules.ts',{'../interfaces/IRoleManagement':roles});
const service=pageAccess=>({access:{admin:true},roleRules:{id:'admin',name:'Helpdesk Admin',scope:'all',actions:['classifications'],pageAccess}});
test('Parent and individual settings permissions are both required',()=>{
 assert(canAccessSettings(service(['settings','categories']),'categories'));
 assert(!canAccessSettings(service(['settings','categories']),'subcategories'));
 assert(!canAccessSettings(service(['categories']),'categories'));
 assert(!canAccessSettings(service([])));
});
test('Legacy defaults are preserved and Super Admin access stays fixed',()=>{
 assert(canAccessSettings(service(undefined),'roles'));
 assert(!canAccessSettings({roleRules:{id:'agent',actions:[]}}));
 assert(!canAccessSettings(service(['settings','schema']),'schema'));
 assert(canAccessSettings({...service([]),access:{superAdmin:true}},'schema'));
});
test('Page access survives configuration serialization and rejects invalid keys',()=>{
 const config=roles.defaultRoleConfiguration();config.roles[1].pageAccess=['settings','categories'];
 const saved=JSON.parse(JSON.stringify(config));roles.validateRoleConfiguration(saved);
 assert.deepEqual(roles.roleSettingsPages(saved.roles[1]),['settings','categories']);
 saved.roles[1].pageAccess.push('unknown');assert.throws(()=>roles.validateRoleConfiguration(saved),/Invalid settings page access/);
});
