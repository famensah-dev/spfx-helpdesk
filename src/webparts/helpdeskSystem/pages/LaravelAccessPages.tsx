import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IDeskPilotRole, IRoleConfiguration } from '../interfaces/IRoleManagement';
import { SharePointRolesPage } from './SharePointRolesPage';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';

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
  if(selected)return <>
    <DefaultButton text="Back to roles" iconProps={{iconName:'Back'}} onClick={()=>setSelected(undefined)} />
    <h3>{selected.name}</h3><p>{descriptions[selected.id]}</p>
    {selected.id==='superAdmin'?<div className={styles.ticketListCard}><MessageBar>Super Admin has access across every department in this organization. Its permissions are fixed.</MessageBar><table className={styles.ticketTable} aria-label="Super Admin permissions"><thead><tr><th>Permission</th><th>Access</th></tr></thead><tbody>{(props.service.roleManagement?.supportedActions || []).map(action=><tr key={action}><td>{permissionLabels[action] || action}</td><td>Allowed</td></tr>)}</tbody></table></div>:<SharePointRolesPage key={selected.id} service={props.service} hideHeading view="roles" roleId={selected.id} />}
  </>;
  const roles=[...configuration.roles,{id:'superAdmin',name:'Super Admin',scope:'all',actions:[]}];
  return <div className={styles.ticketListCard}><p>Select a role to view its permissions. Agent and Helpdesk Admin permissions apply to the selected department.</p><div className={styles.tableContainer}><table className={styles.ticketTable} aria-label="Application roles"><thead><tr><th>Role</th><th>Description</th><th>Permissions</th></tr></thead><tbody>{roles.map(role=><tr key={role.id}><td>{role.name}</td><td>{descriptions[role.id]}</td><td><DefaultButton text="View permissions" ariaLabel={`View permissions for ${role.name}`} onClick={()=>setSelected(role as IDeskPilotRole)} /></td></tr>)}</tbody></table></div></div>;
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
