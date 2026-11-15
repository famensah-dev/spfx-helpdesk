import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, Icon, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IDeskPilotRole, IRoleConfiguration } from '../interfaces/IRoleManagement';
import { roleSettingsPages, settingsPageLabels } from '../interfaces/IRoleManagement';
import { SharePointRolesPage } from './SharePointRolesPage';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
import roleStyles from './LaravelRoles.module.scss';

const permissionLabels:Record<string,string>={dashboard:'View dashboards',tickets:'View tickets',create:'Create tickets',edit:'Edit ticket details',status:'Change ticket status',assign:'Assign tickets',priority:'Change ticket priority',archive:'Archive tickets',comment:'Comment on tickets',classifications:'Manage categories, subcategories and issue types'};

export function LaravelRolesPage(props:{service:ITicketDataSource;onDetailChange?:(role?:IDeskPilotRole)=>void;onBackAction?:(action?:()=>void)=>void}):React.ReactElement {
  const [configuration,setConfiguration]=React.useState<IRoleConfiguration>();
  const [selected,setSelected]=React.useState<IDeskPilotRole>();
  const [error,setError]=React.useState('');
  const backToRoles=React.useCallback(()=>setSelected(undefined),[]);
  React.useEffect(()=>{props.onDetailChange?.(selected);},[selected,props.onDetailChange]);
  React.useEffect(()=>{
    let active=true;
    props.service.roleManagement!.load().then(value=>{if(active)setConfiguration(value);}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:String(reason));});
    return ()=>{active=false;};
  },[props.service]);
  if(error)return <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>;
  if(!configuration)return <Spinner label="Loading roles" />;
  if(selected)return <SharePointRolesPage key={selected.id} service={props.service} hideHeading view="roles" roleId={selected.id} cardLayout fixedRole={selected.id==='superAdmin'?{...selected,actions:[...(props.service.roleManagement?.supportedActions || [])],pageAccess:[...(props.service.roleManagement?.supportedSettingsPages || [])]}:undefined} hideRoleHeading onBackAction={props.onBackAction} onBack={backToRoles} onSaved={setConfiguration} />;
  const roles=[...configuration.roles,{id:'superAdmin',name:'Super Admin',scope:'all',actions:[]}];
  return <div className={roleStyles.workspace}>
    <div className={roleStyles.grid} aria-label="Application roles">{roles.map(role=>{
      const fixed=role.id==='superAdmin';
      const actions=fixed ? [...(props.service.roleManagement?.supportedActions || [])] : role.actions.filter(action=>!props.service.roleManagement?.supportedActions || props.service.roleManagement.supportedActions.includes(action));
      const pages=(fixed ? props.service.roleManagement?.supportedSettingsPages || [] : roleSettingsPages(role as IDeskPilotRole)).filter(page=>!props.service.roleManagement?.supportedSettingsPages || props.service.roleManagement.supportedSettingsPages.includes(page));
      const permissions=[...actions.map(action=>permissionLabels[action] || action),...pages.map(page=>settingsPageLabels[page])];
      const users=configuration.assignments.filter(user=>user.roleId===role.id && !user.disabled);
      return <article key={role.id} className={roleStyles.card} aria-label={`${role.name} role`}><div className={roleStyles.cardHeader}><div><h3>{role.name}</h3><p className={roleStyles.muted}>{fixed?'Organization-wide role':`${users.length} active ${users.length===1?'user':'users'} in this department`}</p></div><button type="button" className={roleStyles.manageButton} aria-label={`Manage permissions for ${role.name}`} onClick={()=>setSelected(role as IDeskPilotRole)}><Icon iconName="Settings" aria-hidden="true" /><span>Manage</span></button></div><div className={roleStyles.cardBody}><div className={roleStyles.cardSummary}><span>{permissions.length} permissions</span></div><div className={roleStyles.chips}>{permissions.slice(0,6).map(permission=><span className={roleStyles.chip} key={permission}>{permission}</span>)}{permissions.length>6 && <span className={`${roleStyles.chip} ${roleStyles.moreChip}`}>+{permissions.length-6} more</span>}</div></div></article>;
    })}</div>
  </div>;
}

export function LaravelDepartmentsPage(props:{service:ITicketDataSource;onChange:()=>void}):React.ReactElement {
  const scope=props.service.settingsScope;
  const owner=Boolean(props.service.access?.superAdmin);
  const [creating,setCreating]=React.useState(false);
  const [name,setName]=React.useState('');
  const [busy,setBusy]=React.useState(false);
  const lock=React.useRef(false);
  const [error,setError]=React.useState('');
  if(!scope)return <MessageBar>Department management is not available for this connection.</MessageBar>;
  const create=async():Promise<void>=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await scope.create(name.trim());setName('');setCreating(false);props.onChange();}catch(reason){setError(reason instanceof Error?reason.message:String(reason));}finally{lock.current=false;setBusy(false);}};
  return <>
    {error && !creating && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    <div className={styles.ticketListCard}>
      <div className={styles.ticketToolbar}><p>Create departments in DeskPilot and add staff from the Users page. Entra groups do not control department membership.</p><div className={styles.ticketActions}>{owner && <DefaultButton text="New department" iconProps={{iconName:'Add'}} disabled={busy} onClick={()=>{setError('');setCreating(true);}} />}</div></div>
      <div className={styles.tableContainer}><table className={styles.ticketTable} aria-label="Departments"><thead><tr><th>Department</th></tr></thead><tbody>{scope.departments.map(department=><tr key={department.id}><td>{department.name}</td></tr>)}</tbody></table></div>
      {!scope.departments.length && <p>No departments yet.{owner?' Use New department to add the first one.':''}</p>}
    </div>
    <Dialog hidden={!creating} onDismiss={busy?undefined:()=>setCreating(false)} dialogContentProps={{title:'New department'}} modalProps={{isBlocking:true}}>
      <form onSubmit={event=>{event.preventDefault();create().catch(()=>undefined);}}>
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        <TextField label="Department name" required maxLength={255} value={name} disabled={busy} onChange={(_,value)=>setName(value || '')} />
        <DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={()=>setCreating(false)} /><PrimaryButton type="submit" text="Create department" disabled={busy || !name.trim()} /></DialogFooter>
      </form>
    </Dialog>
  </>;
}
