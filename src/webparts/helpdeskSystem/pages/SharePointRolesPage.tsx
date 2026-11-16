import { cancelButtonStyles } from '../components/cancelButtonStyles';
import * as React from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { DefaultButton, Dialog, DialogFooter, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PersonaCoin, PrimaryButton, SearchBox, Spinner } from '@fluentui/react';
import { SharePointUsersPage } from './SharePointUsersPage';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { defaultRoleConfiguration, validateRoleConfiguration, settingsPageKeys, settingsPageLabels, roleSettingsPages } from '../interfaces/IRoleManagement';
import type { IDeskPilotRole, IRoleConfiguration, RoleAction, SettingsPageKey } from '../interfaces/IRoleManagement';
import styles from '../components/HelpdeskSystem.module.scss';
import roleStyles from './LaravelRoles.module.scss';

function currentRoleChanged(draft: IDeskPilotRole, current?: IDeskPilotRole): boolean {
  return !current || roleSettingsPages(draft).length !== roleSettingsPages(current).length || roleSettingsPages(draft).some(page=>!roleSettingsPages(current).includes(page)) || draft.scope !== current.scope || draft.actions.length !== current.actions.length || draft.actions.some(action => !current.actions.includes(action));
}
const labels: Record<RoleAction, string> = { dashboard: 'Dashboard Page', tickets: 'Tickets Page', faqs: 'Knowledge Base', create: 'Create Tickets', edit: 'Edit Ticket Details and Attachments', status: 'Change Status / Record Response', assign: 'Assign Tickets', priority: 'Change Priority', archive: 'Archive Tickets', comment: 'Add Comments', manageFaqs: 'Manage Knowledge Base', classifications: 'Manage Categories and Issue Types', sla: 'Manage SLA Priorities', manageUsers: 'Manage users', manageEmail: 'Manage email and notifications', manageTeams: 'Manage support teams' };
interface IPermissionGroup { name:string; actions:RoleAction[]; pages?:SettingsPageKey[]; }
const permissionGroups: IPermissionGroup[] = [
  { name: 'Page access', actions: ['dashboard', 'tickets', 'faqs'] },
  { name: 'Ticket permissions', actions: ['create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment'] },
  { name: 'Administration permissions', actions: ['manageFaqs', 'classifications', 'sla'] }
];
const resourcePermissions:Record<RoleAction,string>={dashboard:'dashboard.view',tickets:'tickets.view',create:'tickets.create',edit:'tickets.edit',status:'tickets.change_status',assign:'tickets.assign',priority:'tickets.change_priority',archive:'tickets.archive',comment:'comments.create',classifications:'classifications.manage',faqs:'knowledge_base.view',manageFaqs:'knowledge_base.manage',sla:'sla.manage',manageUsers:'users.manage',manageEmail:'notifications.manage',manageTeams:'support_teams.manage'};
const resourceLabels:Record<RoleAction,string>={dashboard:'View dashboard',tickets:'View tickets',create:'Create tickets',edit:'Edit tickets',status:'Change ticket status',assign:'Assign tickets',priority:'Change ticket priority',archive:'Archive tickets',comment:'Create comments',classifications:'Manage classifications',faqs:'View knowledge base',manageFaqs:'Manage knowledge base',sla:'Manage service levels',manageUsers:'Manage users',manageEmail:'Manage email and notifications',manageTeams:'Manage support teams'};
const resourcePages:Record<SettingsPageKey,string>={settings:'settings.view',roles:'roles.manage_permissions',categories:'categories.settings_access',subcategories:'subcategories.settings_access',issueTypes:'issue_types.settings_access',units:'support_teams.settings_access',sla:'sla.settings_access',email:'email.settings_access',assignment:'assignment.settings_access',faqs:'knowledge_base.settings_access',members:'users.settings_access',schema:'schema.settings_access'};
const resourcePageLabels:Record<SettingsPageKey,string>={settings:'View settings',roles:'Manage role permissions',categories:'Access category settings',subcategories:'Access subcategory settings',issueTypes:'Access issue type settings',units:'Access support team settings',sla:'Access service level settings',email:'Access email settings',assignment:'Access assignment settings',faqs:'Access knowledge base settings',members:'Access user settings',schema:'Access schema settings'};
// These identifiers describe existing rules; separate model CRUD grants require backend support.
const resourceGroups:IPermissionGroup[]=[
  {name:'Dashboard',actions:['dashboard']},
  {name:'Tickets',actions:['tickets','create','edit','status','assign','priority','archive']},
  {name:'Comments',actions:['comment']},
  {name:'Classifications',actions:['classifications'],pages:['categories','subcategories','issueTypes']},
  {name:'Users',actions:['manageUsers']},
  {name:'Roles',actions:[],pages:['roles']},
  {name:'Settings',actions:[],pages:['settings']},
  {name:'Knowledge base',actions:['faqs','manageFaqs']},
  {name:'SLA',actions:['sla'],pages:['sla']},
  {name:'Email & Notifications',actions:['manageEmail'],pages:['email']},
  {name:'Support Teams',actions:['manageTeams'],pages:['units']}
];
const scopeOptions = [{ key: 'assigned', text: 'Only Tickets Assigned to Them', description: 'View only tickets assigned to this user.' }, { key: 'assignedOrCreated', text: 'Assigned to Them or Created by Them', description: 'View tickets assigned to this user or entered by this user. Requester alone does not qualify.' }, { key: 'newUnassigned', text: 'All New Unassigned Tickets', description: 'View only New tickets that have no assignee.' }, { key: 'all', text: 'All Accessible Tickets', description: 'View all tickets their SharePoint access allows.' }];
const descriptions: Record<RoleAction, string> = { dashboard: 'Access the dashboard and summary statistics.', tickets: 'Access the ticket list and ticket details.', faqs: 'Read published knowledge base articles.', create: 'Submit a new support request.', edit: 'Update ticket details and upload attachments.', status: 'Update ticket status and record the first response.', assign: 'Assign or reassign tickets to support agents.', priority: 'Change the priority of a ticket.', archive: 'Move tickets into the archive.', comment: 'Add a comment to a ticket.', manageFaqs: 'Create, edit and manage helpdesk knowledge articles.', classifications: 'Manage categories, subcategories and issue types.', sla: 'Manage response and resolution targets.', manageUsers: 'Add staff, change roles and activate or deactivate users in managed departments.', manageEmail: 'Configure email rules, templates and sender settings.', manageTeams: 'Manage support teams, their members, leads and categories.' };

export function CollapsibleInfoAlert(props:{children:string}):React.ReactElement {
  const [expanded,setExpanded]=React.useState(false);
  const [overflow,setOverflow]=React.useState(false);
  const text=React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(()=>{
    const measure=():void=>{if(text.current && !expanded)setOverflow(text.current.scrollWidth>text.current.clientWidth);};
    measure();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):undefined;
    if(text.current)observer?.observe(text.current);
    window.addEventListener('resize',measure);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[props.children,expanded]);
  return <MessageBar className={styles.usersInfoAlert}><div className={styles.collapsibleInfoAlert} data-expanded={expanded}><span ref={text}>{props.children}</span>{(overflow || expanded) && <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(current=>!current)}>{expanded?'Read less':'Read more'}</button>}</div></MessageBar>;
}

export function SharePointRolesPage(props: { service: ITicketDataSource; hideHeading?: boolean; view?:'users'|'roles'; roleId?:string; cardLayout?:boolean; tableLayout?:boolean; fullWidth?:boolean; fixedRole?:IDeskPilotRole; hideRoleHeading?:boolean; onBackAction?:(action?:()=>void)=>void; onBack?:()=>void; onSaved?:(value:IRoleConfiguration)=>void }): React.ReactElement {
  const [tab, setTab] = React.useState<'users' | 'roles'>(props.view || 'users');
  const [config, setConfig] = React.useState<IRoleConfiguration>();
  const [busy, setBusy] = React.useState(false);
  const [loading,setLoading]=React.useState(true);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [userNotice, setUserNotice] = React.useState('');
  const saved = React.useRef<IRoleConfiguration>();
  const [selectedRoleId, setSelectedRoleId] = React.useState(props.roleId || 'agent');
  const [permissionSearch, setPermissionSearch] = React.useState('');
  const [accessFilter, setAccessFilter] = React.useState('all');
  const [draft, setDraft] = React.useState<IDeskPilotRole>();
  const [confirmation, setConfirmation] = React.useState<{ role: IDeskPilotRole; restore: boolean }>();
  const navigation = React.useContext(UNSAFE_NavigationContext);
  const pendingLeave = React.useRef<(() => void) | undefined>();
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const dirty = Boolean(draft && currentRoleChanged(draft, config?.roles.find(role => role.id === draft.id)));
  const requestLeave = (leave: () => void): void => {
    if (dirty) { pendingLeave.current = leave; setLeaveOpen(true); }
    else { setDraft(undefined); leave(); }
  };
  const headerBack=React.useRef<()=>void>();
  headerBack.current=()=>{if(!busy)requestLeave(()=>props.onBack?.());};
  React.useEffect(()=>{
    props.onBackAction?.(()=>headerBack.current?.());
    return ()=>props.onBackAction?.(undefined);
  },[props.onBackAction]);
  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    const originalIndex = window.history?.state?.idx as number | undefined;
    let restoring = false;
    let allowPop = false;
    const onPop = (event: PopStateEvent): void => {
      if (allowPop) return;
      const nextIndex = event.state?.idx as number | undefined;
      if (originalIndex === undefined || nextIndex === undefined) return;
      event.stopImmediatePropagation();
      if (restoring) { restoring = false; return; }
      const delta = nextIndex - originalIndex;
      if (!delta) return;
      restoring = true;
      window.history.go(-delta);
      requestLeave(() => { allowPop = true; window.history.go(delta); });
    };
    window.addEventListener('popstate', onPop, true);
    const navigator = navigation?.navigator;
    const push = navigator?.push;
    const replace = navigator?.replace;
    const go = navigator?.go;
    if (navigator && push && replace && go) {
      navigator.push = (...args) => requestLeave(() => push.apply(navigator, args));
      navigator.replace = (...args) => requestLeave(() => replace.apply(navigator, args));
      navigator.go = (...args) => requestLeave(() => go.apply(navigator, args));
    }
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', onPop, true);
      if (navigator && push && replace && go) { navigator.push = push; navigator.replace = replace; navigator.go = go; }
    };
  }, [dirty, navigation]);
  const lock = React.useRef(false);
  const load = React.useCallback(async (): Promise<void> => {
    setError('');
    try {
      const value = await props.service.roleManagement!.load();
      saved.current = value; setConfig(value);
      const role=value.roles.find(item=>item.id===(props.roleId || 'agent'));
      setDraft(props.cardLayout && role && role.id!=='requester' && role.id!=='superAdmin'?{...role,actions:[...role.actions]}:undefined);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load roles.'); }
    finally {setLoading(false);}
  }, [props.service,props.cardLayout,props.roleId]);
  React.useEffect(() => { load().catch(() => undefined); }, [load]);
  const currentRole = config?.roles.find(role => role.id === selectedRoleId) || props.fixedRole;
  const displayedRole = draft || currentRole;
  const matchesPermission = (name: string, description: string, enabled: boolean): boolean => {
    const query = permissionSearch.trim().toLowerCase();
    return (accessFilter === 'all' || enabled === (accessFilter === 'enabled')) && (name + ' ' + description).toLowerCase().includes(query);
  };
  const visibleScopes = (displayedRole?.scope==='own'?[{key:'own',text:'Own requests',description:'Tickets requested or created by this user.'}]:scopeOptions).map(option => props.service.storageProvider === 'laravel' && option.key === 'all' ? {...option, description: 'View all tickets permitted within this department.'} : option).filter(option => matchesPermission(option.text, 'Ticket Visibility', displayedRole?.scope === option.key));
  const displayedSettingsPages=displayedRole ? roleSettingsPages(displayedRole) : [];
  const resourceLayout=props.cardLayout && !props.tableLayout;
  const settingsRows=settingsPageKeys.filter(key=>key!=='members' && matchesPermission((resourceLayout?resourcePages[key]+' '+resourcePageLabels[key]+' ':'')+settingsPageLabels[key], 'Page access Settings', displayedSettingsPages.includes(key)));
  const visibleGroups = (resourceLayout?resourceGroups:permissionGroups).map((group, index) => ({ ...group, number: index + 2, pages:(resourceLayout?group.pages || []:group.name==='Page access'?settingsRows:[]).filter(page=>settingsRows.includes(page)), actions: group.actions.filter(action => (action!=='manageUsers' || props.service.storageProvider!=='laravel' || props.service.access?.superAdmin) && matchesPermission((resourceLayout?resourcePermissions[action]+' '+resourceLabels[action]+' ':'')+labels[action], descriptions[action] + ' ' + group.name, Boolean(displayedRole?.actions.includes(action)))) })).filter(group => group.actions.length || group.pages.length);
  const selectableActions=visibleGroups.flatMap(group=>group.actions).filter(action=>!props.service.roleManagement?.supportedActions || props.service.roleManagement.supportedActions.includes(action));
  const selectablePages=visibleGroups.flatMap(group=>group.pages).filter(page=>page!=='schema' && (!props.service.roleManagement?.supportedSettingsPages || props.service.roleManagement.supportedSettingsPages.includes(page)));
  const selectPermissions=(checked:boolean,actions:RoleAction[],pages:SettingsPageKey[]):void=>{
    if(!draft || busy)return;
    setDraft({...draft,actions:checked?Array.from(new Set([...draft.actions,...actions])):draft.actions.filter(action=>!actions.includes(action)),pageAccess:checked?Array.from(new Set([...roleSettingsPages(draft),...pages])):roleSettingsPages(draft).filter(page=>!pages.includes(page))});
  };
  const prepareApply = (): void => {
    if (!draft || !saved.current) return;
    try { validateRoleConfiguration({ ...saved.current, roles: saved.current.roles.map(role => role.id === draft.id ? draft : role) }); setError(''); setConfirmation({ role: draft, restore: false }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid permissions.'); }
  };
  const applyPermissions = async (): Promise<void> => {
    if (!confirmation || !saved.current || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const pending = confirmation;
    try {
      const value = { ...saved.current, roles: saved.current.roles.map(role => role.id === pending.role.id ? pending.role : role) };
      validateRoleConfiguration(value);
      await props.service.roleManagement!.save(value);
      saved.current = value;
      props.onSaved?.(value);
      setConfig(current => current ? { ...current, roles: value.roles } : value);
      setDraft(props.cardLayout?{...pending.role,actions:[...pending.role.actions]}:undefined); setConfirmation(undefined); setLeaveOpen(false);
      const leave = pendingLeave.current; pendingLeave.current = undefined;
      if (leave) leave();
      setMessage(`${pending.role.name} permissions ${pending.restore ? 'restored to defaults' : 'applied'}. Affected users must refresh DeskPilot.`);
    } catch (reason) { setConfirmation(undefined); setError(reason instanceof Error ? reason.message : 'Unable to apply permissions.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const permissionChanges = confirmation && currentRole ? [
    ...confirmation.role.actions.filter(action => !currentRole.actions.includes(action)).map(action => `Allow: ${labels[action]}`),
    ...currentRole.actions.filter(action => !confirmation.role.actions.includes(action)).map(action => `Remove: ${labels[action]}`),
    ...roleSettingsPages(confirmation.role).filter(page=>!roleSettingsPages(currentRole).includes(page)).map(page=>'Show: '+settingsPageLabels[page]),
    ...roleSettingsPages(currentRole).filter(page=>!roleSettingsPages(confirmation.role).includes(page)).map(page=>'Hide: '+settingsPageLabels[page]),
    ...(confirmation.role.scope !== currentRole.scope ? [`Ticket view: ${scopeOptions.find(option => option.key === confirmation.role.scope)?.text}`] : [])
  ] : [];
  const supportedActions=props.service.roleManagement?.supportedActions || [];
  const supportedPages=props.service.roleManagement?.supportedSettingsPages || [];
  const assignedPermissions=supportedActions.filter(action=>displayedRole?.actions.includes(action)).length+supportedPages.filter(page=>displayedSettingsPages.includes(page)).length;
  const roleUsers=(config?.roleMembers || config?.assignments || []).filter(user=>user.roleId===selectedRoleId && !user.disabled);
  return <section className={props.cardLayout?roleStyles.detailsRoot:`${styles.pageContent} ${styles.ticketPage}`} data-page="users-and-roles" data-embedded={Boolean(props.hideRoleHeading)}>
    {!props.view && <nav className={styles.ticketTabs} data-settings-tabs="true" aria-label="Users and roles pages">
      {!props.hideHeading && <h2 className={styles.toolbarTitle}>Users &amp; Roles</h2>}
      <button type="button" aria-current={tab === 'users' ? 'page' : undefined} className={tab === 'users' ? styles.activeNav : undefined} disabled={busy} onClick={() => requestLeave(() => setTab('users'))}><Icon iconName="People" />Users</button>
      <button type="button" aria-current={tab === 'roles' ? 'page' : undefined} className={tab === 'roles' ? styles.activeNav : undefined} disabled={busy} onClick={() => setTab('roles')}><Icon iconName="Shield" />Roles &amp; Permissions</button>
    </nav>}
    {tab === 'users' && <div className={styles.pageAlerts}>
      <CollapsibleInfoAlert>{props.service.storageProvider==='laravel' ? 'Add existing Microsoft 365 users and assign DeskPilot access for the selected department. Administrators with Manage users permission can manage staff in their departments. Roles and account status apply across the organization.' : 'Add existing Microsoft 365 users and assign helpdesk roles. Active and inactive refer to assigned DeskPilot access. Site owners retain Super Admin access.'}</CollapsibleInfoAlert>
      {userNotice && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setUserNotice('')}>{userNotice}</MessageBar>}
    </div>}
    {tab === 'roles' && !props.cardLayout && <div className={styles.pageAlerts}>
      <CollapsibleInfoAlert>{props.service.storageProvider==='laravel' ? 'Role permissions apply within the selected department. Laravel enforces access on every request. Super Admin access is managed separately from these role settings.' : 'Super Admin permissions are fixed and managed through SharePoint site ownership. Role permissions here control what users can do in DeskPilot. SharePoint and list permissions still apply.'}</CollapsibleInfoAlert>
    </div>}
    <div className={props.cardLayout?roleStyles.detailsRoot:styles.ticketListCard}>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success}>{message}</MessageBar>}
    {!config ? <>{loading ? <Spinner label="Loading users and roles..." /> : error && <DefaultButton text="Retry" onClick={() => { load().catch(() => undefined); }} />}</> : <>
      {tab === 'roles' && <>
      <div className={props.cardLayout && !props.tableLayout && !props.fullWidth?roleStyles.detail:undefined}><div className={props.cardLayout?roleStyles.main:undefined}>
      {props.cardLayout && !props.hideRoleHeading && <header className={roleStyles.header}><div><h2>{displayedRole?.name} Permissions</h2><p>{assignedPermissions} of {supportedActions.length+supportedPages.length} permissions assigned</p></div><button type="button" className={roleStyles.quietAction} aria-label="Back to roles" disabled={busy} onClick={()=>requestLeave(()=>props.onBack?.())}><Icon iconName="Back" aria-hidden="true" /><span>Back</span></button></header>}
      <div className={props.cardLayout?roleStyles.permissionsCard:undefined}>
      {!props.roleId && <div className={styles.rolePermissionToolbar}>
        <nav className={styles.ticketTabs} data-settings-tabs="true" data-settings-inset="true" aria-label="Role permissions">{config.roles.filter(role=>role.id!=='requester').map(role=><button type="button" key={role.id} aria-current={selectedRoleId===role.id ? 'page' : undefined} className={selectedRoleId===role.id ? styles.activeNav : undefined} disabled={busy || loading} onClick={()=>{if(role.id!==selectedRoleId)requestLeave(()=>{setSelectedRoleId(role.id);setMessage('');setError('');});}}>{role.name}</button>)}</nav>

      </div>}
      <div className={props.cardLayout?roleStyles.permissionsToolbar:styles.rolePermissionFilters}>
        <SearchBox placeholder="Search permissions" ariaLabel="Search permissions" value={permissionSearch} onChange={(_, value) => setPermissionSearch(value || '')} />
        <Dropdown ariaLabel="Filter permissions by access" selectedKey={accessFilter} options={[{key:'all',text:'All Permissions'},{key:'enabled',text:'Enabled Permissions'},{key:'disabled',text:'Disabled Permissions'}]} onChange={(_, option) => setAccessFilter(String(option?.key || 'all'))} />
        {!props.cardLayout && <IconButton ariaLabel="Reload permissions" title="Reload permissions" iconProps={{iconName:'Refresh'}} disabled={busy || Boolean(draft)} onClick={() => { load().catch(() => undefined); }} />}
        <div className={props.cardLayout?roleStyles.permissionActions:styles.ticketActions}>
        {props.cardLayout && !props.tableLayout && <><button type="button" className={roleStyles.quietAction} disabled={busy || !draft} onClick={()=>selectPermissions(true,selectableActions,selectablePages)}><Icon iconName="CheckboxComposite" aria-hidden="true" /><span>Select All</span></button><button type="button" className={roleStyles.quietAction} disabled={busy || !draft} onClick={()=>selectPermissions(false,selectableActions,selectablePages)}><Icon iconName="Checkbox" aria-hidden="true" /><span>Clear All</span></button></>}
        {!props.cardLayout && currentRole && <DefaultButton text="Edit" iconProps={{ iconName: 'Edit' }} disabled={busy || Boolean(draft) || currentRole.id==='requester'} onClick={() => { setDraft({ ...currentRole, actions: [...currentRole.actions] }); setMessage(''); setError(''); }} />}
        {draft && (!props.cardLayout || dirty) && <><PrimaryButton text="Save" iconProps={{iconName:'Save'}} disabled={busy || !dirty} onClick={prepareApply} /><DefaultButton text={props.cardLayout?'Discard':'Cancel'} iconProps={props.cardLayout?{iconName:'Undo'}:undefined} styles={cancelButtonStyles} disabled={busy} onClick={()=>{setDraft(props.cardLayout && currentRole?{...currentRole,actions:[...currentRole.actions]}:undefined);setError('');}} /></>}
        {!props.cardLayout && currentRole && <IconButton ariaLabel="More permission actions" title="More permission actions" iconProps={{iconName:'MoreVertical'}} menuIconProps={{iconName:''}} disabled={busy || Boolean(draft) || currentRole.id === 'requester'} menuProps={{items:[{key:'restore',text:'Restore default permissions',onClick:()=>{const role=defaultRoleConfiguration().roles.find(item=>item.id===selectedRoleId);if(role)setConfirmation({role,restore:true});}}]}} />}
        </div>
      </div>
      {props.cardLayout && !props.tableLayout && displayedRole && <div className={roleStyles.permissionGroups}>
        {displayedRole.id==='requester' && <MessageBar>User permissions are fixed. Staff can follow tickets requested or created by them.</MessageBar>}
        {displayedRole.id==='superAdmin' && <MessageBar>Super Admin has access across this organization. Its permissions are fixed.</MessageBar>}
        <div className={roleStyles.group}><h3 className={roleStyles.scopeTitle}>Ticket visibility</h3><div className={roleStyles.groupRows} role="group" aria-label="Ticket visibility">{visibleScopes.map(option=><div key={option.key} className={roleStyles.permission}><button type="button" role="switch" aria-label={option.text} aria-checked={displayedRole.scope===option.key} disabled={busy || !draft} className={styles.roleScopeSwitch} onClick={()=>{if(draft)setDraft({...draft,scope:option.key as IDeskPilotRole['scope']});}}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span><span>{option.text}</span></button></div>)}</div></div>
        {visibleGroups.map(group=>{
          const actions=group.actions.filter(action=>!props.service.roleManagement?.supportedActions || props.service.roleManagement.supportedActions.includes(action));
          const pages=group.pages.filter(page=>page!=='schema' && (!props.service.roleManagement?.supportedSettingsPages || props.service.roleManagement.supportedSettingsPages.includes(page)));
          if(!actions.length && !pages.length)return null;
          const enabled=actions.filter(action=>displayedRole.actions.includes(action)).length+pages.filter(page=>displayedSettingsPages.includes(page)).length;
          return <details key={group.name} className={roleStyles.group} open><summary><input type="checkbox" aria-label={`Select all ${group.name}`} checked={enabled===actions.length+pages.length} ref={input=>{if(input)input.indeterminate=enabled>0 && enabled<actions.length+pages.length;}} disabled={busy || !draft} onClick={event=>event.stopPropagation()} onChange={event=>selectPermissions(event.target.checked,actions,pages)} /><span>{group.name}</span><span className={roleStyles.chip}>{enabled}/{actions.length+pages.length}</span><Icon className={roleStyles.groupChevron} iconName="ChevronDown" aria-hidden="true" /></summary><div className={roleStyles.groupRows}>
            {actions.map(action=><label key={action} className={roleStyles.permission}><input type="checkbox" aria-label={resourceLabels[action]} checked={displayedRole.actions.includes(action)} disabled={busy || !draft} onChange={()=>{if(draft)setDraft({...draft,actions:draft.actions.includes(action)?draft.actions.filter(value=>value!==action):[...draft.actions,action]});}} /><span className={roleStyles.permissionCode}>{resourceLabels[action]}</span></label>)}
            {pages.map(page=><label key={page} className={roleStyles.permission}><input type="checkbox" aria-label={resourcePageLabels[page]} checked={displayedSettingsPages.includes(page)} disabled={busy || !draft} onChange={()=>{if(draft)setDraft({...draft,pageAccess:displayedSettingsPages.includes(page)?displayedSettingsPages.filter(value=>value!==page):[...displayedSettingsPages,page]});}} /><span className={roleStyles.permissionCode}>{resourcePageLabels[page]}</span></label>)}
          </div></details>;
        })}
        {!visibleScopes.length && !visibleGroups.some(group=>group.actions.some(action=>props.service.roleManagement?.supportedActions?.includes(action)) || group.pages.some(page=>props.service.roleManagement?.supportedSettingsPages?.includes(page))) && <p>No permissions match your search and access filter.</p>}
      </div>}
      {(!props.cardLayout || props.tableLayout) && displayedRole && <div className={styles.tableContainer} data-permissions-table="true">
        <table className={`${styles.ticketTable} ${styles.rolePermissionsTable}`} aria-label={`${displayedRole.name} permissions`}>
          <thead><tr><th scope="col">Access</th><th scope="col">Permission</th><th scope="col">Description</th></tr></thead>
          <tbody>
            {visibleScopes.length > 0 && <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>1. Ticket Visibility</th></tr>}
            {visibleScopes.map(option => <tr key={option.key}>
              <td><button type="button" role="radio" aria-checked={displayedRole.scope === option.key} aria-label={option.text} disabled={busy || !draft} className={styles.roleScopeSwitch} onClick={() => { if (draft) setDraft({ ...draft, scope: option.key as IDeskPilotRole['scope'] }); }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span></button></td><td>{option.text}</td><td>{option.description}</td>
            </tr>)}
          </tbody>
          {visibleGroups.map(group => <tbody key={group.name}>
            <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>{group.number}. {group.name}</th></tr>
            {group.actions.map(action => <tr key={action}>
              <td><button type="button" role="switch" aria-label={labels[action]} aria-checked={displayedRole.actions.includes(action)} title={props.service.roleManagement?.supportedActions && !props.service.roleManagement.supportedActions.includes(action) ? 'Backend integration pending' : undefined} disabled={busy || !draft || Boolean(props.service.roleManagement?.supportedActions && !props.service.roleManagement.supportedActions.includes(action))} className={styles.roleScopeSwitch} onClick={() => {
              if (!draft) return;
              const checked = !draft.actions.includes(action);
              let actions = checked ? [...draft.actions.filter(value => value !== action), action] : draft.actions.filter(value => value !== action);
              if (checked && action === 'manageFaqs' && !actions.includes('faqs')) actions = [...actions, 'faqs'];
              if (!checked && action === 'faqs') actions = actions.filter(value => value !== 'manageFaqs');
              setDraft({ ...draft, actions });
              }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span></button></td><td>{labels[action]}</td><td>{descriptions[action]}</td>
            </tr>)}
            {group.name==='Page access' && settingsRows.map(key=><tr key={'page-'+key}>
              <td><button type="button" role="switch" aria-label={settingsPageLabels[key]} aria-checked={key!=='schema' && displayedSettingsPages.includes(key)} disabled={busy || !draft || key==='schema' || Boolean(props.service.roleManagement?.supportedSettingsPages && !props.service.roleManagement.supportedSettingsPages.includes(key))} className={styles.roleScopeSwitch} onClick={()=>{
                if(!draft || key==='schema')return;
                const pages=roleSettingsPages(draft);
                setDraft({...draft,pageAccess:pages.includes(key) ? pages.filter(page=>page!==key) : [...pages,key]});
              }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span></button></td>
              <td>{settingsPageLabels[key]}</td><td>{key==='schema' ? 'Fixed to Super Admin access.' : key==='settings' ? 'Show the Settings page. Individual sections must also be enabled.' : 'Show this Settings section when its required management permissions are available.'}</td>
            </tr>)}
          </tbody>)}
          {!visibleScopes.length && !visibleGroups.length && <tbody><tr><td colSpan={3}>No permissions match your search and access filter.</td></tr></tbody>}
        </table>
      </div>}
      </div></div>{props.cardLayout && !props.tableLayout && !props.fullWidth && <aside className={roleStyles.users}><h3>Users with {displayedRole?.name} role <span className={roleStyles.chip}>{roleUsers.length}</span></h3><div className={roleStyles.userList}>{roleUsers.map(user=><div key={user.userId} className={roleStyles.user}><span className={roleStyles.avatar} aria-hidden="true"><PersonaCoin text={user.name || user.email} coinSize={28} /></span><div><strong className={roleStyles.userName}>{user.name}</strong><small>{user.email}</small></div></div>)}{!roleUsers.length && <p>No active users assigned in this department.</p>}</div></aside>}</div>
      </>}
      {tab === 'users' && <SharePointUsersPage service={props.service} configuration={config} busy={busy} readOnly={props.service.storageProvider === 'laravel' && !config.canManageUsers} onReload={load} onNotice={setUserNotice} onSave={async assignments => {
        if (!saved.current || lock.current) throw new Error('Settings are busy. Please try again.');
        lock.current = true; setBusy(true);
        try {
          const value = { ...saved.current, assignments };
          await props.service.roleManagement!.save(value);
          saved.current = value; setConfig(value);
        } finally { lock.current = false; setBusy(false); }
      }} />}
    </>}
  </div>
    <Dialog hidden={!leaveOpen} minWidth={560} maxWidth={700} dialogContentProps={{title:'Unsaved permission changes',showCloseButton:!busy}} onDismiss={busy ? undefined : ()=>{setLeaveOpen(false);pendingLeave.current=undefined;}} modalProps={{isBlocking:true}}>
      <p>You have unsaved permission changes. Save them before leaving, discard them, or cancel to keep editing.</p>
      <DialogFooter>
        <PrimaryButton text="Save and Leave" disabled={busy} onClick={()=>{setLeaveOpen(false);prepareApply();}} />
        <DefaultButton text="Discard and Leave" disabled={busy} onClick={()=>{const leave=pendingLeave.current;pendingLeave.current=undefined;setLeaveOpen(false);setDraft(undefined);leave?.();}} />
        <DefaultButton text="Cancel" disabled={busy} onClick={()=>{setLeaveOpen(false);pendingLeave.current=undefined;}} />
      </DialogFooter>
    </Dialog>
    <Dialog minWidth={600} maxWidth={760} hidden={!confirmation} onDismiss={busy ? undefined : () => {setConfirmation(undefined);pendingLeave.current=undefined;}} dialogContentProps={{ title: confirmation?.restore ? 'Restore Default Permissions?' : 'Apply Role Permissions?' }} modalProps={{ isBlocking: true }}>
      <p>{confirmation?.restore ? `Restore the default permissions for ${confirmation.role.name}? This replaces this role's custom permissions and ticket view.` : `Apply these permission changes to ${confirmation?.role.name}?`}</p>
      {permissionChanges.length ? <ul>{permissionChanges.map(value => <li key={value}>{value}</li>)}</ul> : <p>No permission differences from the saved role.</p>}
      <p>User assignments and other roles will stay unchanged. Affected users must refresh DeskPilot.</p>
      <DialogFooter><PrimaryButton text={busy ? 'Applying...' : confirmation?.restore ? 'Confirm Restore' : 'Confirm Apply'} disabled={busy} onClick={() => { applyPermissions().catch(() => undefined); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => {setConfirmation(undefined);pendingLeave.current=undefined;}} /></DialogFooter>
    </Dialog>
  </section>;
}
