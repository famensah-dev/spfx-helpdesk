import * as React from 'react';
import { Checkbox, DefaultButton, Dropdown, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { BackendClassificationKind, IBackendClassification, IBackendDepartment, IBackendDepartmentSettings, IBackendUser, LaravelTicketService } from '../services/LaravelTicketService';
import type { IDeskPilotRole, RoleAction } from '../interfaces/IRoleManagement';
import { BackendUsersSettings } from './BackendUsersSettings';

const scopes = [
  {key:'assigned',text:'Assigned to them'}, {key:'assignedOrCreated',text:'Assigned to or created by them'},
  {key:'newUnassigned',text:'New unassigned tickets'}, {key:'all',text:'All accessible tickets in this department'}
];
const actions: Array<{key: RoleAction; label: string}> = [
  {key:'dashboard',label:'Dashboard'}, {key:'tickets',label:'View tickets'}, {key:'create',label:'Create tickets'},
  {key:'edit',label:'Edit details'}, {key:'status',label:'Change status'}, {key:'assign',label:'Assign tickets'},
  {key:'priority',label:'Change priority'}, {key:'archive',label:'Archive tickets'}, {key:'comment',label:'Comment'},
  {key:'classifications',label:'Manage categories and issue types'}
];

export function BackendWorkspaceSettings(props: {service: LaravelTicketService; onBack: () => void}): React.ReactElement {
  const owner = props.service.access.superAdmin;
  const [tab,setTab] = React.useState<'departments'|'lookups'|'users'>('departments');
  const [departments,setDepartments] = React.useState<IBackendDepartment[]>([]);
  const [department,setDepartment] = React.useState<number>();
  const [settings,setSettings] = React.useState<IBackendDepartmentSettings>();
  const [users,setUsers] = React.useState<IBackendUser[]>([]);
  const [name,setName] = React.useState('');
  const [members,setMembers] = React.useState<number[]>([]);
  const [groups,setGroups] = React.useState('');
  const [kind,setKind] = React.useState<BackendClassificationKind>('categories');
  const [entries,setEntries] = React.useState<IBackendClassification[]>([]);
  const [parents,setParents] = React.useState<IBackendClassification[]>([]);
  const [parent,setParent] = React.useState<number>();
  const [shared,setShared] = React.useState(false);
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [notice,setNotice] = React.useState('');
  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch(reason) {setError(reason instanceof Error ? reason.message : String(reason));}
    finally {setBusy(false);}
  };
  React.useEffect(()=>{
    let active = true;
    setBusy(true);
    Promise.all([props.service.listDepartments(),owner ? props.service.listUsers() : Promise.resolve([])])
      .then(([values,people])=>{if(active){setDepartments(values);setDepartment(values[0]?.id);setUsers(people);}})
      .catch(reason=>{if(active)setError(String(reason));}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[props.service,owner]);
  React.useEffect(()=>{
    let active = true;
    setSettings(undefined);
    if(department)props.service.getDepartment(department).then(value=>{if(active){setSettings(value);setMembers(value.members.map(member=>member.id));setGroups(value.entra_group_ids.join('\n'));}}).catch(reason=>{if(active)setError(String(reason));});
    return ()=>{active=false;};
  },[props.service,department]);
  React.useEffect(()=>{
    let active = true;
    if(tab==='lookups')Promise.all([props.service.listClassifications(kind),props.service.listClassifications('categories')]).then(([values,categories])=>{if(active){setEntries(values);setParents(categories);setParent(undefined);}}).catch(reason=>{if(active)setError(String(reason));});
    return ()=>{active=false;};
  },[props.service,kind,tab]);
  const changeRule = (role: string, change: Partial<IDeskPilotRole>): void => setSettings(current=>current ? {...current,roles:{...current.roles,[role]:{...current.roles[role],...change}}} : current);
  const saveRules = async (): Promise<void> => {
    if(!department || !settings)return;
    const roles: Record<string,{name:string;scope:string;actions:string[]}> = {};
    for(const role of ['agent','admin']){const rule=settings.roles[role];roles[role]={name:rule.name,scope:rule.scope,actions:rule.actions};}
    await props.service.saveDepartment(department,{roles}); setNotice('Department permissions saved. Refresh DeskPilot to update the controls.');
  };
  return <section style={{maxWidth:1000,margin:'24px auto',padding:24}} aria-label="Workspace settings">
    <DefaultButton text="Back to tickets" onClick={props.onBack} /><h1>Workspace settings</h1>
    <div><DefaultButton text="Departments and permissions" disabled={busy} onClick={()=>setTab('departments')} /><DefaultButton text="Categories and issue types" disabled={busy} onClick={()=>setTab('lookups')} />{owner && <DefaultButton text="Users" disabled={busy} onClick={()=>setTab('users')} />}</div>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {notice && <MessageBar messageBarType={MessageBarType.success}>{notice}</MessageBar>}
    {busy && <Spinner label="Saving or loading settings" />}
    {tab==='users' && owner ? <BackendUsersSettings service={props.service} onBack={()=>setTab('departments')} /> : <>
      <Dropdown label="Department" disabled={busy} selectedKey={department} options={departments.map(value=>({key:value.id,text:value.name}))} onChange={(_,option)=>{setDepartment(Number(option?.key));setShared(false);}} />
      {tab==='departments' ? <>
        {owner && <form onSubmit={event=>{event.preventDefault();void run(async()=>{const value=await props.service.createDepartment(name.trim());setDepartments(await props.service.listDepartments());setDepartment(value.id);setName('');});}}><TextField label="New department name" required disabled={busy} value={name} onChange={(_,value)=>setName(value || '')} /><PrimaryButton type="submit" text="Create department" disabled={busy || !name.trim()} /></form>}
        {settings && <>
          <h2>Department members</h2>
          {owner ? <><Dropdown label="Members (multiple departments per user are supported)" multiSelect disabled={busy} selectedKeys={members} options={users.filter(user=>user.id).map(user=>({key:user.id!,text:`${user.name} (${user.email})`}))} onChange={(_,option)=>{if(option)setMembers(current=>option.selected ? [...current,Number(option.key)] : current.filter(id=>id!==option.key));}} /><PrimaryButton text="Save members" disabled={busy} onClick={()=>void run(async()=>{await props.service.saveDepartment(department!,{member_ids:members});setNotice('Department members saved.');})} /></> : <ul>{settings.members.map(member=><li key={member.id}>{member.name}</li>)}</ul>}
          <h2>Roles and permissions</h2><p>These rules apply only within this department. Requesters see tickets they requested or created. Super Admins retain access across the organization.</p>
          {owner && <><TextField label="Entra group object IDs (one per line)" multiline rows={3} value={groups} disabled={busy} onChange={(_,value)=>setGroups(value || '')} description="Members of mapped groups receive department membership when their API access token includes those groups. Application roles remain controlled here. Direct memberships also work without Entra groups." /><PrimaryButton text="Save group mappings" disabled={busy} onClick={()=>void run(async()=>{await props.service.saveDepartment(department!,{entra_group_ids:groups.split(/[\s,;]+/).filter(Boolean)});setNotice('Group mappings saved. Entra must include group IDs in access tokens for this API.');})} /></>}
          {['agent','admin'].map(role=>{const rule=settings.roles[role];return <fieldset key={role} disabled={busy}><legend>{rule.name}</legend><Dropdown label="Ticket visibility" selectedKey={rule.scope} options={scopes} onChange={(_,option)=>changeRule(role,{scope:option!.key as IDeskPilotRole['scope']})} />{actions.map(action=><Checkbox key={action.key} label={action.label} checked={rule.actions.includes(action.key)} onChange={(_,checked)=>changeRule(role,{actions:checked ? [...rule.actions,action.key] : rule.actions.filter(key=>key!==action.key)})} />)}</fieldset>;})}
          <PrimaryButton text="Save department permissions" disabled={busy} onClick={()=>void run(saveRules)} />
        </>}
      </> : <>
        <h2>Categories and issue types</h2>
        <Dropdown label="List" disabled={busy} selectedKey={kind} options={[{key:'categories',text:'Categories'},{key:'subcategories',text:'Subcategories'},{key:'issue-types',text:'Issue types'}]} onChange={(_,option)=>{setKind(option!.key as BackendClassificationKind);setName('');}} />
        <p>Subcategories inherit their parent category’s departments. Shared options are managed by Super Admins.</p>
        <ul>{entries.map(entry=><li key={entry.id}>{entry.name}{entry.department_ids?.length ? ` — ${entry.department_ids.map(id=>departments.find(value=>value.id===id)?.name || id).join(', ')}` : kind==='subcategories' ? ` — ${parents.find(value=>value.id===entry.category_id)?.name || ''}` : ' — Shared'} <DefaultButton text={entry.active ? 'Deactivate' : 'Activate'} disabled={busy || !entry.can_edit} onClick={()=>void run(async()=>{await props.service.saveClassification(kind,{name:entry.name,active:!entry.active},entry.id);setEntries(await props.service.listClassifications(kind));})} /></li>)}</ul>
        <form onSubmit={event=>{event.preventDefault();void run(async()=>{await props.service.saveClassification(kind,{name:name.trim(),active:true,...(kind==='subcategories' ? {category_id:parent} : {department_ids:shared ? [] : [department!]})});setEntries(await props.service.listClassifications(kind));setParents(await props.service.listClassifications('categories'));setName('');});}}>
          <TextField label="Name" required disabled={busy} value={name} onChange={(_,value)=>setName(value || '')} />
          {kind==='subcategories' ? <Dropdown label="Parent category" required disabled={busy} selectedKey={parent} options={parents.filter(value=>value.active && value.can_edit).map(value=>({key:value.id,text:value.name}))} onChange={(_,option)=>setParent(Number(option?.key))} /> : owner && <Checkbox label="Share with every department" disabled={busy} checked={shared} onChange={(_,checked)=>setShared(Boolean(checked))} />}
          <PrimaryButton type="submit" text="Add option" disabled={busy || !name.trim() || (kind==='subcategories' ? !parent : !shared && !department)} />
        </form>
      </>}
    </>}
  </section>;
}
