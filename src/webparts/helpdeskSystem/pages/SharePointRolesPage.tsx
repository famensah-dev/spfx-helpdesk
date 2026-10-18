import { cancelButtonStyles } from '../components/cancelButtonStyles';
import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, Dropdown, Icon, MessageBar, MessageBarType, PrimaryButton, Spinner } from '@fluentui/react';
import { SharePointUsersPage } from './SharePointUsersPage';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { defaultRoleConfiguration, validateRoleConfiguration } from '../interfaces/IRoleManagement';
import type { IDeskPilotRole, IRoleConfiguration, RoleAction } from '../interfaces/IRoleManagement';
import styles from '../components/HelpdeskSystem.module.scss';

const labels: Record<RoleAction, string> = { dashboard: 'Dashboard page', tickets: 'Tickets page', faqs: 'FAQs page', create: 'Create tickets', edit: 'Edit ticket details and attachments', status: 'Change status / record response', assign: 'Assign tickets', priority: 'Change priority', archive: 'Archive tickets', comment: 'Add comments', manageFaqs: 'Manage FAQs', classifications: 'Manage categories and issue types', sla: 'Manage SLA priorities' };
const permissionGroups: Array<{ name: string; description: string; actions: RoleAction[] }> = [
  { name: 'Page access', description: 'Choose which pages appear in the navigation.', actions: ['dashboard', 'tickets', 'faqs'] },
  { name: 'Ticket permissions', description: 'Choose what users can do with tickets in their ticket view.', actions: ['create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment'] },
  { name: 'Administration permissions', description: 'Choose which helpdesk settings users can manage.', actions: ['manageFaqs', 'classifications', 'sla'] }
];
const scopeOptions = [{ key: 'assigned', text: 'Assigned to the user' }, { key: 'own', text: 'Requested by the user' }, { key: 'all', text: 'All accessible tickets' }];
const descriptions: Record<RoleAction, string> = { dashboard: 'Access the dashboard and summary statistics.', tickets: 'Access the ticket list and ticket details.', faqs: 'Read helpdesk FAQs and knowledge articles.', create: 'Submit a new support request.', edit: 'Update ticket details and upload attachments.', status: 'Update ticket status and record the first response.', assign: 'Assign or reassign tickets to support agents.', priority: 'Change the priority of a ticket.', archive: 'Move tickets into the archive.', comment: 'Add a comment to a ticket.', manageFaqs: 'Create, edit and manage helpdesk knowledge articles.', classifications: 'Manage categories, subcategories and issue types.', sla: 'Manage response and resolution targets.' };

export function SharePointRolesPage(props: { service: ITicketDataSource }): React.ReactElement {
  const [tab, setTab] = React.useState<'users' | 'roles'>('users');
  const [config, setConfig] = React.useState<IRoleConfiguration>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [userNotice, setUserNotice] = React.useState('');
  const saved = React.useRef<IRoleConfiguration>();
  const [selectedRoleId, setSelectedRoleId] = React.useState('agent');
  const [draft, setDraft] = React.useState<IDeskPilotRole>();
  const [confirmation, setConfirmation] = React.useState<{ role: IDeskPilotRole; restore: boolean }>();
  const lock = React.useRef(false);
  const load = React.useCallback(async (): Promise<void> => {
    setError('');
    try { const value = await props.service.roleManagement!.load(); saved.current = value; setConfig(value); setDraft(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load roles.'); }
  }, [props.service]);
  React.useEffect(() => { load().catch(() => undefined); }, [load]);
  const currentRole = config?.roles.find(role => role.id === selectedRoleId);
  const displayedRole = draft || currentRole;
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
      const updated = await props.service.roleManagement!.load();
      saved.current = updated;
      setConfig(updated);
      setDraft(undefined); setConfirmation(undefined);
      setMessage(`${pending.role.name} permissions ${pending.restore ? 'restored to defaults' : 'applied'}. Affected users must refresh DeskPilot.`);
    } catch (reason) { setConfirmation(undefined); setError(reason instanceof Error ? reason.message : 'Unable to apply permissions.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const permissionChanges = confirmation && currentRole ? [
    ...confirmation.role.actions.filter(action => !currentRole.actions.includes(action)).map(action => `Allow: ${labels[action]}`),
    ...currentRole.actions.filter(action => !confirmation.role.actions.includes(action)).map(action => `Remove: ${labels[action]}`),
    ...(confirmation.role.scope !== currentRole.scope ? [`Ticket view: ${scopeOptions.find(option => option.key === confirmation.role.scope)?.text}`] : [])
  ] : [];
  return <section className={`${styles.pageContent} ${styles.ticketPage}`}>
    <nav className={styles.ticketTabs} aria-label="Users and roles pages">
      <h2 className={styles.toolbarTitle}>Users &amp; roles</h2>
      <button type="button" aria-current={tab === 'users' ? 'page' : undefined} className={tab === 'users' ? styles.activeNav : undefined} disabled={busy || Boolean(draft)} onClick={() => setTab('users')}><Icon iconName="People" />Users</button>
      <button type="button" aria-current={tab === 'roles' ? 'page' : undefined} className={tab === 'roles' ? styles.activeNav : undefined} disabled={busy} onClick={() => setTab('roles')}><Icon iconName="Shield" />Roles &amp; Permissions</button>
    </nav>
    {tab === 'users' && <div className={styles.pageAlerts}>
      <MessageBar className={styles.usersInfoAlert}>Assign a role to configure DeskPilot and this site's SharePoint access together. Agents can edit assigned tickets; Helpdesk Admins manage tickets. Site owners retain Super Admin access.</MessageBar>
      {userNotice && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setUserNotice('')}>{userNotice}</MessageBar>}
    </div>}
    {tab === 'roles' && <div className={styles.pageAlerts}>
      <MessageBar className={styles.usersInfoAlert}>Super Admin access comes from SharePoint site ownership. Agents use assigned-ticket access and cannot create tickets in this permission model. Role controls govern DeskPilot actions; SharePoint enforces item access.</MessageBar>
    </div>}
    <div className={styles.ticketListCard}>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success}>{message}</MessageBar>}
    {!config ? <><Spinner label="Loading roles..." /><DefaultButton text="Retry" onClick={() => { load().catch(() => undefined); }} /></> : <>
      {tab === 'roles' && <>
      <div className={styles.rolePermissionToolbar}>
        <Dropdown label="Role" selectedKey={selectedRoleId} disabled={busy || Boolean(draft)} options={config.roles.map(role => ({ key: role.id, text: role.name }))} onChange={(_, option) => { if (option) { setSelectedRoleId(String(option.key)); setMessage(''); setError(''); } }} />
        <div className={styles.ticketActions}>
        {currentRole && <DefaultButton text="Edit permissions" iconProps={{ iconName: 'Edit' }} disabled={busy || Boolean(draft)} onClick={() => { setDraft({ ...currentRole, actions: [...currentRole.actions] }); setMessage(''); setError(''); }} />}
        <DefaultButton text="Reload permissions" iconProps={{ iconName: 'Refresh' }} disabled={busy || Boolean(draft)} onClick={() => { load().catch(() => undefined); }} />
        {currentRole && <DefaultButton text="Restore defaults" iconProps={{ iconName: 'Undo' }} disabled={busy} onClick={() => { const role = defaultRoleConfiguration().roles.find(item => item.id === selectedRoleId); if (role) setConfirmation({ role, restore: true }); }} />}
        </div>
      </div>
      {draft && <MessageBar>Editing {draft.name}. Changes take effect only after you apply and confirm them.</MessageBar>}
      {displayedRole && <div className={styles.tableContainer}>
        <table className={`${styles.ticketTable} ${styles.rolePermissionsTable}`} aria-label={`${displayedRole.name} permissions`}>
          <thead><tr><th scope="col">Permission</th><th scope="col">Description</th><th scope="col">Access</th></tr></thead>
          <tbody>
            <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>Ticket visibility<span>Choose one ticket view for this role.</span></th></tr>
            {scopeOptions.map(option => <tr key={option.key}>
              <td>{option.text}</td><td>{option.key === 'assigned' ? 'View tickets assigned to this user.' : option.key === 'own' ? 'View tickets created by this user.' : 'View all tickets their SharePoint access allows.'}</td>
              <td><button type="button" role="radio" aria-checked={displayedRole.scope === option.key} aria-label={option.text} disabled={busy || !draft || (displayedRole.id === 'agent' && option.key !== 'assigned')} className={styles.roleScopeSwitch} onClick={() => { if (draft) setDraft({ ...draft, scope: option.key as IDeskPilotRole['scope'] }); }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span><span>{displayedRole.scope === option.key ? 'Allowed' : 'Not allowed'}</span></button></td>
            </tr>)}
          </tbody>
          {permissionGroups.map(group => <tbody key={group.name}>
            <tr className={styles.permissionCategory}><th scope="rowgroup" colSpan={3}>{group.name}<span>{group.description}</span></th></tr>
            {group.actions.map(action => <tr key={action}>
              <td>{labels[action]}</td><td>{descriptions[action]}</td>
              <td><button type="button" role="switch" aria-label={labels[action]} aria-checked={displayedRole.actions.includes(action)} disabled={busy || !draft || (displayedRole.id === 'agent' && action === 'create')} className={styles.roleScopeSwitch} onClick={() => {
              if (!draft) return;
              const checked = !draft.actions.includes(action);
              let actions = checked ? [...draft.actions.filter(value => value !== action), action] : draft.actions.filter(value => value !== action);
              if (checked && action === 'manageFaqs' && !actions.includes('faqs')) actions = [...actions, 'faqs'];
              if (!checked && action === 'faqs') actions = actions.filter(value => value !== 'manageFaqs');
              setDraft({ ...draft, actions });
              }}><span className={styles.roleSwitchTrack} aria-hidden="true"><span className={styles.roleSwitchThumb} /></span><span>{displayedRole.actions.includes(action) ? 'Allowed' : 'Not allowed'}</span></button></td>
            </tr>)}
          </tbody>)}
        </table>
      </div>}
      <div className={styles.rolePermissionsFooter}><DefaultButton styles={cancelButtonStyles} text="Cancel editing" disabled={busy || !draft} onClick={() => { setDraft(undefined); setError(''); }} /><PrimaryButton text="Apply changes" iconProps={{ iconName: 'Save' }} disabled={busy || !draft} onClick={prepareApply} /></div>
      </>}
      {tab === 'users' && <SharePointUsersPage service={props.service} configuration={config} busy={busy} onReload={load} onNotice={setUserNotice} onSave={async assignments => {
        if (!saved.current || lock.current) throw new Error('Settings are busy. Please try again.');
        lock.current = true; setBusy(true);
        try {
          const value = { ...saved.current, assignments };
          await props.service.roleManagement!.save(value);
          const updated = await props.service.roleManagement!.load();
          saved.current = updated; setConfig(updated);
        } finally { lock.current = false; setBusy(false); }
      }} />}
    </>}
  </div>
    <Dialog hidden={!confirmation} onDismiss={busy ? undefined : () => setConfirmation(undefined)} dialogContentProps={{ title: confirmation?.restore ? 'Restore default permissions?' : 'Apply role permissions?' }} modalProps={{ isBlocking: true }}>
      <p>{confirmation?.restore ? `Restore the default permissions for ${confirmation.role.name}? This replaces this role's custom permissions and ticket view.` : `Apply these permission changes to ${confirmation?.role.name}?`}</p>
      {permissionChanges.length ? <ul>{permissionChanges.map(value => <li key={value}>{value}</li>)}</ul> : <p>No permission differences from the saved role.</p>}
      <p>User assignments and other roles will stay unchanged. Affected users must refresh DeskPilot.</p>
      <DialogFooter><PrimaryButton text={busy ? 'Applying...' : confirmation?.restore ? 'Confirm restore' : 'Confirm apply'} disabled={busy} onClick={() => { applyPermissions().catch(() => undefined); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setConfirmation(undefined)} /></DialogFooter>
    </Dialog>
  </section>;
}
