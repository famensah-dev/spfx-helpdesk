const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file,deps={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React}}).outputText)(name=>deps[name] || require(name),module,module.exports);return module.exports;}
const style={default:new Proxy({},{get:(_,key)=>String(key)})};
const hub=load('src/webparts/helpdeskSystem/components/HelpdeskSettingsHub.tsx',{'./HelpdeskSystem.module.scss':style});
const rules=load('src/webparts/helpdeskSystem/services/appRoleRules.ts');
const empty=new Proxy({},{get:()=>()=>null});
const {AdministrationPage}=load('src/webparts/helpdeskSystem/pages/AdministrationPage.tsx',{
  '../components/HelpdeskSettingsHub':hub,'../components/HelpdeskSystem.module.scss':style,'../services/appRoleRules':rules,
  './SupportUnitsPage':empty,'../components/AutoAssignmentSetting':empty,'../components/WorkspaceSetupPanel':empty,
  './DepartmentMembersPage':empty,'./SlaPrioritiesPage':empty,'../components/TicketSchemaWorkspace':empty,
  '../components/AdminColumnForm':empty,'../components/SearchableSelect':empty,'../components/cancelButtonStyles':empty,'./FaqPage':empty
});
const render=service=>renderToStaticMarkup(React.createElement(AdministrationPage,{service,onUsersAndRoles:()=>{}}));
const admin={access:{admin:true,superAdmin:false},roleRules:{actions:[]},supportUnits:{}};
let html=render(admin);
assert(html.includes('Helpdesk settings') && html.includes('Support Teams') && html.includes('Auto Assignment'));
assert(!html.includes('Ticket list schema') && !html.includes('Users &amp; Roles') && !html.includes('SLA &amp; Priorities'),'Super Admin and disabled features must not leak into the hub');
html=render({...admin,roleRules:{actions:['classifications','sla','manageFaqs']}});
assert(html.includes('Categories') && html.includes('Subcategories') && html.includes('Issue Types') && html.includes('SLA &amp; Priorities') && html.includes('Knowledge Base'));
html=render({...admin,access:{admin:true,superAdmin:true},roleManagement:{}});
assert(html.includes('Users &amp; Roles') && html.includes('Ticket list schema'),'Existing Super Admin tools remain available to owners');
console.log('Helpdesk settings checks passed: grouped hub opens first, team/assignment settings remain available to admins, and restricted settings are filtered.');
