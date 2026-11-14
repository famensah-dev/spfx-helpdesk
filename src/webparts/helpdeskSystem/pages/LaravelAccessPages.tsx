import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IDeskPilotRole, IRoleConfiguration } from '../interfaces/IRoleManagement';
import { roleSettingsPages, settingsPageLabels } from '../interfaces/IRoleManagement';
import { SharePointRolesPage } from './SharePointRolesPage';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
import roleStyles from './LaravelRoles.module.scss';

const descriptions:Record<string,string>={
  requester:'Submit support requests and follow tickets requested or created by them.',
  agent:'Handle assigned tickets and follow their submitted requests, according to department permissions.',
  admin:'Manage helpdesk tickets and configured permissions within their departments.',
  superAdmin:'Manage all departments, users and application settings within this organization.'
};
const permissionLabels:Record<string,string>={dashboard:'View dashboards',tickets:'View tickets',create:'Create tickets',edit:'Edit ticket details',status:'Change ticket status',assign:'Assign tickets',priority:'Change ticket priority',archive:'Archive tickets',comment:'Comment on tickets',classifications:'Manage categories, subcategories and issue types'};

export function LaravelRolesPage(props:{service:ITicketDataSource}):React.ReactElement {
  const [configuration,setConfiguration]=React.useState<IRoleConfiguration>();
  const [selected,setSelected]=React.useState<IDeskPilotRole>();
  const [error,setError]=React.useState('');
  React.useEffect(()=>{
    let active=true;
    props.service.roleManagement!.load().then(value=>{if(active)setConfiguration(value);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
    return ()=>{active=false;};
  },[props.service]);
  if(error)return <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>;
  if(!configuration)return <Spinner label="Loading roles" />;
  if(selected && selected.id!=='superAdmin')return <SharePointRolesPage key={selected.id} service={props.service} hideHeading view="roles" roleId={selected.id} cardLayout onBack={()=>setSelected(undefined)} onSaved={setConfiguration} />;
  if(selected)return <div className={roleStyles.workspace}><header className={roleStyles.header}><div><h2>Super Admin permissions</h2><p>Organization-wide access</p></div><DefaultButton text="Back to roles" onClick={()=>setSelected(undefined)} /></header><MessageBar>Super Admin has access across every department in this organization. Its permissions are fixed.</MessageBar><div className={roleStyles.group}><h3 className={roleStyles.cardHeader}>Application access</h3><div className={roleStyles.groupRows}>{(props.service.roleManagement?.supportedActions || []).map(action=><label key={action} className={roleStyles.permission}><input type="checkbox" checked disabled /><span>{permissionLabels[action] || action}</span></label>)}</div></div></div>;
  const roles=[...configuration.roles,{id:'superAdmin',name:'Super Admin',scope:'all',actions:[]}];
  return <div className={roleStyles.workspace}>
    <header className={roleStyles.header}><div><h2>Roles &amp; Permissions</h2><p>Manage user roles and their permissions for the selected department.</p></div><DefaultButton text="Manage Permissions" iconProps={{iconName:'Permissions'}} onClick={()=>setSelected(configuration.roles.find(role=>role.id==='admin') || configuration.roles[0])} /></header>
    <div className={roleStyles.grid} aria-label="Application roles">{roles.map(role=>{
      const fixed=role.id==='superAdmin';
      const actions=fixed ? [...(props.service.roleManagement?.supportedActions || [])] : role.actions.filter(action=>!props.service.roleManagement?.supportedActions || props.service.roleManagement.supportedActions.includes(action));
      const pages=(fixed ? props.service.roleManagement?.supportedSettingsPages || [] : roleSettingsPages(role as IDeskPilotRole)).filter(page=>!props.service.roleManagement?.supportedSettingsPages || props.service.roleManagement.supportedSettingsPages.includes(page));
      const permissions=[...actions.map(action=>permissionLabels[action] || action),...pages.map(page=>settingsPageLabels[page])];
      const users=configuration.assignments.filter(user=>user.roleId===role.id && !user.disabled);
      return <article key={role.id} className={roleStyles.card} aria-label={`${role.name} role`}><div className={roleStyles.cardHeader}><div><h3>{role.name}</h3><p className={roleStyles.muted}>{fixed?'Organization-wide role':`${users.length} active ${users.length===1?'user':'users'} in this department`}</p></div></div><div className={roleStyles.cardBody}><div className={roleStyles.cardSummary}><span>{permissions.length} permissions</span><DefaultButton text="Manage" ariaLabel={`Manage permissions for ${role.name}`} iconProps={{iconName:'Settings'}} onClick={()=>setSelected(role as IDeskPilotRole)} /></div><div className={roleStyles.chips}>{permissions.slice(0,6).map(permission=><span className={roleStyles.chip} key={permission}>{permission}</span>)}{permissions.length>6 && <span className={roleStyles.chip}>+{permissions.length-6} more</span>}</div><p className={roleStyles.muted} style={{marginTop:16}}>{descriptions[role.id]}</p></div><footer className={roleStyles.footer}>{fixed || role.id==='requester'?'Built-in role · fixed permissions':'Built-in role · department permissions'}</footer></article>;
    })}</div>
  </div>;
}

export function LaravelDepartmentsPage(props:{service:ITicketDataSource;onChange:()=>void}):React.ReactElement {
  const scope=props.service.settingsScope;
  const owner=Boolean(props.service.access?.superAdmin);
  const [creating,setCreating]=React.useState(false);
  const [name,setName]=React.useState('');
  const [viewing,setViewing]=React.useState<number>();
  const [groups,setGroups]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const lock=React.useRef(false);
  const [groupsLoaded,setGroupsLoaded]=React.useState(false);
  const [error,setError]=React.useState('');
  const [message,setMessage]=React.useState('');
  if(!scope)return <MessageBar>Department management is not available for this connection.</MessageBar>;
  const run=async(work:()=>Promise<void>):Promise<void>=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{await work();props.onChange();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{lock.current=false;setBusy(false);}};
  return <>
    {error && !creating && !viewing && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success}>{message}</MessageBar>}
    <div className={styles.ticketListCard}>
      <div className={styles.ticketToolbar}><p>Departments organize ticket access, classifications and helpdesk permissions.</p><div className={styles.ticketActions}>{owner && <DefaultButton text="New department" iconProps={{iconName:'Add'}} disabled={busy} onClick={()=>{setError('');setCreating(true);}} />}</div></div>
      <div className={styles.tableContainer}><table className={styles.ticketTable} aria-label="Departments"><thead><tr><th>Department</th><th>Access</th></tr></thead><tbody>{scope.departments.map(department=><tr key={department.id}><td>{department.name}</td><td><DefaultButton text={owner?'Manage group mappings':'View group mappings'} disabled={busy} onClick={()=>{setViewing(department.id);setGroups('');setGroupsLoaded(false);run(async()=>{scope.select(department.id);setGroups((await scope.getGroups()).join('\n'));setGroupsLoaded(true);}).catch(()=>undefined);}} /></td></tr>)}</tbody></table></div>
      {!scope.departments.length && <p>No departments yet.{owner?' Use New department to add the first one.':''}</p>}
    </div>
    <Dialog hidden={!creating} onDismiss={busy?undefined:()=>setCreating(false)} dialogContentProps={{title:'New department'}} modalProps={{isBlocking:true}}>
      <form onSubmit={event=>{event.preventDefault();run(async()=>{await scope.create(name.trim());setName('');setCreating(false);setMessage('Department created.');}).catch(()=>undefined);}}>
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        <TextField label="Department name" required maxLength={255} value={name} disabled={busy} onChange={(_,value)=>setName(value || '')} />
        <DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={()=>setCreating(false)} /><PrimaryButton type="submit" text="Create department" disabled={busy || !name.trim()} /></DialogFooter>
      </form>
    </Dialog>
    <Dialog hidden={!viewing} onDismiss={busy?undefined:()=>setViewing(undefined)} dialogContentProps={{title:scope.departments.find(department=>department.id===viewing)?.name || 'Department access'}} modalProps={{isBlocking:true}}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {busy && <Spinner label="Loading or saving department access" />}
      <TextField label="Entra group object IDs" multiline rows={5} value={groups} readOnly={!owner} disabled={busy || !groupsLoaded} onChange={(_,value)=>{setGroups(value || '');setError('');}} description="One group ID per line. Group membership supplies department access; application roles are managed separately." />
      <DialogFooter><DefaultButton text="Close" styles={cancelButtonStyles} disabled={busy} onClick={()=>setViewing(undefined)} />{owner && <PrimaryButton text="Save group mappings" disabled={busy || !groupsLoaded || Boolean(error)} onClick={()=>{run(async()=>{await scope.saveGroups(groups.split(/[\s,;]+/).filter(Boolean));setViewing(undefined);setMessage('Group mappings saved.');}).catch(()=>undefined);}} />}</DialogFooter>
    </Dialog>
  </>;
}
