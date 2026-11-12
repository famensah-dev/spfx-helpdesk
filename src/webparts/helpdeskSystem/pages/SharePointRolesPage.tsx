import { cancelButtonStyles } from '../components/cancelButtonStyles';
import * as React from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { DefaultButton, Dialog, DialogFooter, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, SearchBox, Spinner } from '@fluentui/react';
import { SharePointUsersPage } from './SharePointUsersPage';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { defaultRoleConfiguration, validateRoleConfiguration } from '../interfaces/IRoleManagement';
import type { IDeskPilotRole, IRoleConfiguration, RoleAction } from '../interfaces/IRoleManagement';
import styles from '../components/HelpdeskSystem.module.scss';

function currentRoleChanged(draft: IDeskPilotRole, current?: IDeskPilotRole): boolean {
  return !current || draft.scope !== current.scope || draft.actions.length !== current.actions.length || draft.actions.some(action => !current.actions.includes(action));
}
const labels: Record<RoleAction, string> = { dashboard: 'Dashboard Page', tickets: 'Tickets Page', faqs: 'Knowledge Base', create: 'Create Tickets', edit: 'Edit Ticket Details and Attachments', status: 'Change Status / Record Response', assign: 'Assign Tickets', priority: 'Change Priority', archive: 'Archive Tickets', comment: 'Add Comments', manageFaqs: 'Manage Knowledge Base', classifications: 'Manage Categories and Issue Types', sla: 'Manage SLA Priorities' };
const permissionGroups: Array<{ name: string; actions: RoleAction[] }> = [
  { name: 'Page access', actions: ['dashboard', 'tickets', 'faqs'] },
  { name: 'Ticket permissions', actions: ['create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment'] },
  { name: 'Administration permissions', actions: ['manageFaqs', 'classifications', 'sla'] }
];
const scopeOptions = [{ key: 'assigned', text: 'Only Tickets Assigned to Them', description: 'View only tickets assigned to this user.' }, { key: 'assignedOrCreated', text: 'Assigned to Them or Created by Them', description: 'View tickets assigned to this user or entered by this user. Requester alone does not qualify.' }, { key: 'newUnassigned', text: 'All New Unassigned Tickets', description: 'View only New tickets that have no assignee.' }, { key: 'all', text: 'All Accessible Tickets', description: 'View all tickets their SharePoint access allows.' }];
const descriptions: Record<RoleAction, string> = { dashboard: 'Access the dashboard and summary statistics.', tickets: 'Access the ticket list and ticket details.', faqs: 'Read published knowledge base articles.', create: 'Submit a new support request.', edit: 'Update ticket details and upload attachments.', status: 'Update ticket status and record the first response.', assign: 'Assign or reassign tickets to support agents.', priority: 'Change the priority of a ticket.', archive: 'Move tickets into the archive.', comment: 'Add a comment to a ticket.', manageFaqs: 'Create, edit and manage helpdesk knowledge articles.', classifications: 'Manage categories, subcategories and issue types.', sla: 'Manage response and resolution targets.' };

export function SharePointRolesPage(props: { service: ITicketDataSource; hideHeading?: boolean }): React.ReactElement {
  const [tab, setTab] = React.useState<'users' | 'roles'>('users');
  const [config, setConfig] = React.useState<IRoleConfiguration>();
  const [busy, setBusy] = React.useState(false);
  const [loading,setLoading]=React.useState(true);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [userNotice, setUserNotice] = React.useState('');
  const saved = React.useRef<IRoleConfiguration>();
  const [selectedRoleId, setSelectedRoleId] = React.useState('agent');
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
    try { const value = await props.service.roleManagement!.load(); saved.current = value; setConfig(value); setDraft(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load roles.'); }
    finally {setLoading(false);}
  }, [props.service]);
  React.useEffect(() => { load().catch(() => undefined); }, [load]);
  const currentRole = config?.roles.find(role => role.id === selectedRoleId);
  const displayedRole = draft || currentRole;
  const matchesPermission = (name: string, description: string, enabled: boolean): boolean => {
    const query = permissionSearch.trim().toLowerCase();
    return (accessFilter === 'all' || enabled === (accessFilter === 'enabled')) && (name + ' ' + description).toLowerCase().includes(query);
  };
  const visibleScopes = scopeOptions.filter(option => matchesPermission(option.text, 'Ticket Visibility', displayedRole?.scope === option.key));
  const visibleGroups = permissionGroups.map((group, index) => ({ ...group, number: index + 2, actions: group.actions.filter(action => matchesPermission(labels[action], descriptions[action] + ' ' + group.name, Boolean(displayedRole?.actions.includes(action)))) })).filter(group => group.actions.length);
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
      setConfig(current => current ? { ...current, roles: value.roles } : value);
      setDraft(undefined); setConfirmation(undefined); setLeaveOpen(false);
      const leave = pendingLeave.current; pendingLeave.current = undefined;
      if (leave) leave();
      setMessage(`${pending.role.name} permissions ${pending.restore ? 'restored to defaults' : 'applied'}. Affected users must refresh DeskPilot.`);
    } catch (reason) { setConfirmation(undefined); setError(reason instanceof Error ? reason.message : 'Unable to apply permissions.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const permissionChanges = confirmation && currentRole ? [
    ...confirmation.role.actions.filter(action => !currentRole.actions.includes(action)).map(action => `Allow: ${labels[action]}`),
    ...currentRole.actions.filter(action => !confirmation.role.actions.includes(action)).map(action => `Remove: ${labels[action]}`),
    ...(confirmation.role.scope !== currentRole.scope ? [`Ticket view: ${scopeOptions.find(option => option.key === confirmation.role.scope)?.text}`] : [])
  ] : [];
  return <section className={`${styles.pageContent} ${styles.ticketPage}`} data-page="users-and-roles">
    <nav className={styles.ticketTabs} data-settings-tabs="true" aria-label="Users and roles pages">
      {!props.hideHeading && <h2 className={styles.toolbarTitle}>Users &amp; Roles</h2>}
      <button type="button" aria-current={tab === 'users' ? 'page' : undefined} className={tab === 'users' ? styles.activeNav : undefined} disabled={busy} onClick={() => requestLeave(() => setTab('users'))}><Icon iconName="People" />Users</button>
      <button type="button" aria-current={tab === 'roles' ? 'page' : undefined} className={tab === 'roles' ? styles.activeNav : undefined} disabled={busy} onClick={() => setTab('roles')}><Icon iconName="Shield" />Roles &amp; Permissions</button>
    </nav>
    {tab === 'users' && <div className={styles.pageAlerts}>
      <MessageBar className={styles.usersInfoAlert}>Add existing Microsoft 365 users and assign helpdesk roles. Active and inactive refer to assigned DeskPilot access. Site owners retain Super Admin access.</MessageBar>
      {userNotice && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setUserNotice('')}>{userNotice}</MessageBar>}
    </div>}
    {tab === 'roles' && <div className={styles.pageAlerts}>
      <MessageBar className={styles.usersInfoAlert}>Super Admin permissions are fixed and managed through SharePoint site ownership. Role permissions here control what users can do in DeskPilot. SharePoint and list permissions still apply.</MessageBar>
    </div>}
    <div className={styles.ticketListCard}>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success}>{message}</MessageBar>}
    {!config ? <>{loading ? <Spinner label="Loading users and roles..." /> : error && <DefaultButton text="Retry" onClick={() => { load().catch(() => undefined); }} />}</> : <>
      {tab === 'roles' && <>
      <div className={styles.rolePermissionToolbar}>
        <nav className={styles.ticketTabs} data-settings-tabs="true" data-settings-inset="true" aria-label="Role permissions">{config.roles.filter(role=>role.id!=='requester').map(role=><button type="button" key={role.id} aria-current={selectedRoleId===role.id ? 'page' : undefined} className={selectedRoleId===role.id ? styles.activeNav : undefined} disabled={busy || loading} onClick={()=>{if(role.id!==selectedRoleId)requestLeave(()=>{setSelectedRoleId(role.id);setMessage('');setError('');});}}>{role.name}</button>)}</nav>

      </div>
      <div className={styles.rolePermissionFilters}>
        <SearchBox placeholder="Search permissions" ariaLabel="Search permissions" value={permissionSearch} onChange={(_, value) => setPermissionSearch(value || '')} />
        <Dropdown ariaLabel="Filter permissions by access" selectedKey={accessFilter} options={[{key:'all',text:'All Permissions'},{key:'enabled',text:'Enabled Permissions'},{key:'disabled',text:'Disabled Permissions'}]} onChange={(_, option) => setAccessFilter(String(option?.key || 'all'))} />
        <IconButton ariaLabel="Reload permissions" title="Reload permissions" iconProps={{iconName:'Refresh'}} disabled={busy || Boolean(draft)} onClick={() => { load().catch(() => undefined); }} />
        <div className={styles.ticketActions}>
        {currentRole && <DefaultButton text="Edit" iconProps={{ iconName: 'Edit' }} disabled={busy || Boolean(draft) || currentRole.id==='requester'} onClick={() => { setDraft({ ...currentRole, actions: [...currentRole.actions] }); setMessage(''); setError(''); }} />}
        {draft && <><PrimaryButton text="Save" iconProps={{iconName:'Save'}} disabled={busy || !dirty} onClick={prepareApply} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={()=>{setDraft(undefined);setError('');}} /></>}
        {currentRole && <DefaultButton text="Restore Defaults" iconProps={{ iconName: 'Undo' }} disabled={busy || Boolean(draft)} onClick={() => { const role = defaultRoleConfiguration().roles.find(item => item.id === selectedRoleId); if (role) setConfirmation({ role, restore: true }); }} />}
        </div>
      </div>
      {displayedRole && <div className={styles.tableContainer} data-permissions-table="true">
        <table className={`${styles.ticketTable} ${styles.rolePermissionsTable}`} aria-label={`${displayedRole.name} permissions`}>
          <thead><tr><th scope="col">Permission</th><th scope="col">Description</th><th scope="col">Access</th></tr></thead>
          <tbody>
            {visibleScopes.length > 0 && <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>1. Ticket Visibility</th></tr>}
            {visibleScopes.map(option => <tr key={option.key}>
              <td>{option.text}</td><td>{option.description}</td>
              <td><button type="button" role="radio" aria-checked={displayedRole.scope === option.key} aria-label={option.text} disabled={busy || !draft} className={styles.roleScopeSwitch} onClick={() => { if (draft) setDraft({ ...draft, scope: option.key as IDeskPilotRole['scope'] }); }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span><span>{displayedRole.scope === option.key ? 'Allowed' : 'Not allowed'}</span></button></td>
            </tr>)}
          </tbody>
          {visibleGroups.map(group => <tbody key={group.name}>
            <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>{group.number}. {group.name}</th></tr>
            {group.actions.map(action => <tr key={action}>
              <td>{labels[action]}</td><td>{descriptions[action]}</td>
              <td><button type="button" role="switch" aria-label={labels[action]} aria-checked={displayedRole.actions.includes(action)} disabled={busy || !draft} className={styles.roleScopeSwitch} onClick={() => {
              if (!draft) return;
              const checked = !draft.actions.includes(action);
              let actions = checked ? [...draft.actions.filter(value => value !== action), action] : draft.actions.filter(value => value !== action);
              if (checked && action === 'manageFaqs' && !actions.includes('faqs')) actions = [...actions, 'faqs'];
              if (!checked && action === 'faqs') actions = actions.filter(value => value !== 'manageFaqs');
              setDraft({ ...draft, actions });
              }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span><span>{displayedRole.actions.includes(action) ? 'Allowed' : 'Not allowed'}</span></button></td>
            </tr>)}
          </tbody>)}
          {!visibleScopes.length && !visibleGroups.length && <tbody><tr><td colSpan={3}>No permissions match your search and access filter.</td></tr></tbody>}
        </table>
      </div>}
      </>}
      {tab === 'users' && <SharePointUsersPage service={props.service} configuration={config} busy={busy} onReload={load} onNotice={setUserNotice} onSave={async assignments => {
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
