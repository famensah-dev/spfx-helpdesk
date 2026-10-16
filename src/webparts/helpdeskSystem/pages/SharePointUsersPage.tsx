import * as React from 'react';
import { DefaultButton, Dialog, DialogFooter, Dropdown, Icon, IconButton, MessageBar, MessageBarType, PersonaCoin, PersonaSize, PrimaryButton, SearchBox, Spinner, TextField } from '@fluentui/react';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import type { ITicketDataSource, IOrganizationUser } from '../interfaces/ITicketDataSource';
import type { IRoleAssignment, IRoleConfiguration } from '../interfaces/IRoleManagement';
import styles from '../components/HelpdeskSystem.module.scss';

export function SharePointUsersPage(props: { service: ITicketDataSource; configuration: IRoleConfiguration; busy: boolean; onReload: () => Promise<void>; onNotice?: (message: string) => void; onSave: (assignments: IRoleAssignment[]) => Promise<void> }): React.ReactElement {
  const [roleFilter, setRoleFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const [department, setDepartment] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(0);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [adding, setAdding] = React.useState(false);
  const searchInput = React.useRef<import('@fluentui/react').ITextField>(null);
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<IOrganizationUser[]>([]);
  const [chosen, setChosen] = React.useState<IOrganizationUser[]>([]);
  const [addRole, setAddRole] = React.useState('agent');
  const [searching, setSearching] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState('');
  const setNotice = props.onNotice || (() => undefined);
  const [pending, setPending] = React.useState<{ title: string; text: string; assignments: IRoleAssignment[] }>();
  const lock = React.useRef(false);
  const selectPage = React.useRef<HTMLInputElement>(null);
  const busy = working || props.busy;
  const assignments = props.configuration.assignments;
  const roleName = (id: string): string => props.configuration.roles.find(role => role.id === id)?.name || id;
  React.useEffect(() => { setPage(0); setSelected([]); }, [roleFilter, query, department, status]);
  React.useEffect(() => {
    let active = true; setResults([]); setSearching(false);
    if (!adding || search.trim().length < 2) return;
    setSearching(true);
    const timer = window.setTimeout(() => {
      props.service.searchUsers!(search.trim()).then(users => { if (active) setResults(users); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to search users.'); }).finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [adding, search, props.service]);
  const filtered = assignments.filter(user => (roleFilter === 'all' || user.roleId === roleFilter) && (department === 'all' || user.department === department) && (status === 'all' || (status === 'inactive') === Boolean(user.disabled)) && `${user.name} ${user.email} ${user.department || ''}`.toLowerCase().includes(query.toLowerCase()));
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  React.useEffect(() => {
    if (selectPage.current) selectPage.current.indeterminate = visible.some(user => selected.includes(user.userId)) && !visible.every(user => selected.includes(user.userId));
  }, [visible, selected]);
  const departments = Array.from(new Set(assignments.map(user => user.department).filter((value): value is string => Boolean(value)))).sort();
  const availableResults = results.filter(user => !chosen.some(selectedUser => selectedUser.id === user.id));
  const dismissAdd = (): void => { if (!busy) { setAdding(false); setSearch(''); setChosen([]); setResults([]); } };
  const choose = (user: IOrganizationUser, checked: boolean): void => {
    setChosen(current => checked ? [...current.filter(item => item.id !== user.id), user] : current.filter(item => item.id !== user.id));
    if (checked) { setSearch(''); setResults([]); searchInput.current?.focus(); }
  };
  const commit = async (value: IRoleAssignment[], message: string): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setWorking(true); setError(''); setNotice('');
    try { await props.onSave(value); setPending(undefined); setSelected([]); setNotice(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save users.'); throw reason; }
    finally { lock.current = false; setWorking(false); }
  };
  const addUsers = async (): Promise<void> => {
    if (!chosen.length || lock.current) return;
    lock.current = true; setWorking(true); setError(''); setNotice('');
    try {
      const resolved: IRoleAssignment[] = [];
      for (const user of chosen) {
        const person = await props.service.resolveUser!(user);
        if (!person.Id) throw new Error(`Unable to resolve ${user.displayName}.`);
        if (assignments.some(existing => existing.userId === person.Id) || resolved.some(existing => existing.userId === person.Id)) continue;
        resolved.push({ userId: person.Id, name: user.displayName, email: user.email || user.userPrincipalName, department: typeof user.department === 'string' ? user.department : undefined, roleId: addRole, addedAt: new Date().toISOString() });
      }
      if (!resolved.length) throw new Error('The selected users already have assignments.');
      await props.onSave([...assignments, ...resolved]);
      setAdding(false); setSearch(''); setChosen([]); setNotice(`${resolved.length} user${resolved.length === 1 ? '' : 's'} added. They must refresh DeskPilot to apply access.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to add users.'); }
    finally { lock.current = false; setWorking(false); }
  };
  const requestChange = (user: IRoleAssignment, kind: 'role' | 'status' | 'remove', roleId?: string): void => {
    const title = kind === 'role' ? 'Change helpdesk role?' : kind === 'status' ? user.disabled ? 'Activate user?' : 'Deactivate user?' : 'Remove user?';
    setError('');
    setPending({ title, text: `${user.name}: ${kind === 'role' ? `change role to ${roleName(roleId!)}.` : kind === 'status' ? user.disabled ? 'restore their DeskPilot access after refresh.' : 'deactivate their assigned DeskPilot role after refresh.' : 'remove their DeskPilot role.'} SharePoint and Microsoft 365 permissions stay unchanged.`, assignments: kind === 'remove' ? assignments.filter(item => item.userId !== user.userId) : assignments.map(item => item.userId === user.userId ? kind === 'role' ? { ...item, roleId: roleId! } : { ...item, disabled: !item.disabled } : item) });
  };
  return <>
    <nav className={styles.userRoleFilters} aria-label="Filter users by role">{[{ key: 'all', text: 'All Users' }, ...props.configuration.roles.map(role => ({ key: role.id, text: role.id === 'agent' ? 'Agents' : 'Helpdesk Admins' }))].map(item => <button type="button" key={item.key} aria-pressed={roleFilter === item.key} onClick={() => setRoleFilter(item.key)}>{item.text}</button>)}</nav>
    <div className={styles.ticketToolbar}>
      <div className={styles.ticketControls}><SearchBox ariaLabel="Search assigned users" placeholder="Search by name, email or department" value={query} onChange={(_, value) => setQuery(value || '')} /><Dropdown ariaLabel="Department filter" selectedKey={department} options={[{ key: 'all', text: 'All Departments' }, ...departments.map(value => ({ key: value, text: value }))]} onChange={(_, option) => { if (option) setDepartment(String(option.key)); }} /><Dropdown ariaLabel="Status filter" selectedKey={status} options={[{ key: 'all', text: 'All Status' }, { key: 'active', text: 'Active' }, { key: 'inactive', text: 'Inactive' }]} onChange={(_, option) => { if (option) setStatus(String(option.key)); }} /></div>
      <div className={styles.ticketActions}><DefaultButton text="Add users" iconProps={{ iconName: 'Add' }} disabled={busy} onClick={() => { setAdding(true); setSearch(''); setChosen([]); setError(''); setAddRole(roleFilter === 'admin' ? 'admin' : 'agent'); }} /><IconButton iconProps={{ iconName: 'Refresh' }} ariaLabel="Reload users" disabled={busy} onClick={() => { setError(''); props.onReload().catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to reload users.')); }} /></div>
    </div>
    {error && !adding && !pending && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {selected.length > 0 && <div className={styles.bulkActions}><span>{selected.length} selected</span><DefaultButton text="Remove selected" disabled={busy} onClick={() => setPending({ title: 'Remove selected users?', text: `Remove ${selected.length} DeskPilot assignments? SharePoint permissions stay unchanged.`, assignments: assignments.filter(user => !selected.includes(user.userId)) })} /><DefaultButton text="Clear selection" onClick={() => setSelected([])} /></div>}
    <div className={styles.tableContainer}><table className={styles.ticketTable} aria-label="Helpdesk users"><thead><tr><th className={styles.selectionCell}><input type="checkbox" ref={selectPage} aria-label="Select users on this page" disabled={busy || !visible.length} checked={visible.length > 0 && visible.every(user => selected.includes(user.userId))} onChange={event => setSelected(current => event.target.checked ? Array.from(new Set([...current, ...visible.map(user => user.userId)])) : current.filter(id => !visible.some(user => user.userId === id)))} /></th><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th>Date added</th><th>Actions</th></tr></thead><tbody>{visible.map(user => <tr key={user.userId} data-selected={selected.includes(user.userId)}>
      <td className={styles.selectionCell}><input type="checkbox" disabled={busy} aria-label={`Select ${user.name}`} checked={selected.includes(user.userId)} onChange={event => setSelected(current => event.target.checked ? [...current, user.userId] : current.filter(id => id !== user.userId))} /></td>
      <td><span className={styles.userIdentity}><PersonaCoin text={user.name} size={PersonaSize.size32} /><span>{user.name}</span></span></td><td>{user.email}</td><td>{user.department || '—'}</td><td><span className={styles.userRoleBadge} data-role={user.roleId}>{roleName(user.roleId)}</span></td><td><span className={styles.userStatusBadge} data-active={!user.disabled}>{user.disabled ? 'Inactive' : 'Active'}</span></td><td>{user.addedAt ? new Date(user.addedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'}</td>
      <td><IconButton className={styles.userRowActions} iconProps={{ iconName: 'More' }} menuIconProps={{ iconName: '' }} ariaLabel={`Actions for ${user.name}`} disabled={busy} menuProps={{ items: [{ key: 'role', text: 'Change role', subMenuProps: { items: props.configuration.roles.map(role => ({ key: role.id, text: role.name, checked: user.roleId === role.id, canCheck: true, onClick: () => requestChange(user, 'role', role.id) })) } }, { key: 'status', text: user.disabled ? 'Activate' : 'Deactivate', onClick: () => requestChange(user, 'status') }, { key: 'remove', text: 'Remove user', onClick: () => requestChange(user, 'remove') }] }} /></td>
    </tr>)}</tbody></table>{!filtered.length && <p>No users match these filters.</p>}</div>
    <div className={styles.userTableFooter}><span>{filtered.length ? `Showing ${currentPage * pageSize + 1} to ${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length} users` : '0 users'}</span><div><IconButton iconProps={{ iconName: 'ChevronLeft' }} ariaLabel="Previous users page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} /><span>Page {currentPage + 1} of {pageCount}</span><IconButton iconProps={{ iconName: 'ChevronRight' }} ariaLabel="Next users page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} /></div></div>
    <Dialog hidden={!adding} onDismiss={busy ? undefined : dismissAdd} dialogContentProps={{ title: roleFilter === 'all' ? 'Add users' : roleFilter === 'admin' ? 'Add Helpdesk Admins' : 'Add Agents', showCloseButton: !busy, closeButtonAriaLabel: 'Close add users', styles: { title: { fontSize: 14, color: '#172536' } } }} modalProps={{ isBlocking: true, styles: { root: { alignItems: 'flex-start', paddingTop: 'min(88px, 10vh)', boxSizing: 'border-box' }, main: { width: 'min(840px, calc(100vw - 32px))', minWidth: 0, maxWidth: 840, maxHeight: 'calc(100vh - 96px)', borderRadius: 6, overflowY: 'auto', selectors: { '@media (min-width: 480px)': { width: 'min(840px, calc(100vw - 32px))', minWidth: 0, maxWidth: 840 } } } } }} minWidth={320} maxWidth={840}>
      <div className={styles.addUsersForm}>
      
      <div className={styles.addUsersSearchControl}><div className={styles.addUsersSearchRow}>
      <TextField componentRef={searchInput} ariaLabel="Search organization users" onRenderPrefix={() => <Icon iconName="Search" />} placeholder="Search by name or email" value={search} disabled={busy} onChange={(_, value) => { setSearch(value || ''); setError(''); }} />
      {roleFilter === 'all' && <Dropdown ariaLabel="Assign role" selectedKey={addRole} disabled={busy} options={props.configuration.roles.map(role => ({ key: role.id, text: role.name }))} onChange={(_, option) => { if (option) setAddRole(String(option.key)); }} />}
      </div></div>

      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <div className={styles.addUsersResults}>{searching ? <Spinner label="Searching users..." /> : search.trim().length < 2 ? <p>Search your organization and select users. Selected people stay in the tray until you add them.</p> : !availableResults.length ? <p>No additional users found.</p> : availableResults.map(user => {
        const existing = assignments.some(item => item.email.toLowerCase() === (user.email || user.userPrincipalName).toLowerCase());
        return <div className={styles.addUserResult} key={user.id}><PersonaCoin text={user.displayName} size={PersonaSize.size32} /><button type="button" className={styles.addUserName} aria-label={`Select ${user.displayName}`} disabled={busy || existing} onClick={() => choose(user, !chosen.some(item => item.id === user.id))}><strong>{user.displayName}</strong><small>{user.email || user.userPrincipalName}{existing ? ' · Already added' : ''}</small></button><small>{user.department || '—'}</small></div>;
      })}</div>
      {chosen.length > 0 && <section className={styles.selectedUserTray} aria-label="Selected users"><strong>{chosen.length} selected</strong>{chosen.map(user => <div key={user.id} className={styles.selectedUserChip}><PersonaCoin text={user.displayName} size={PersonaSize.size32} /><span>{user.displayName}<small>{user.email || user.userPrincipalName}</small></span><IconButton iconProps={{ iconName: 'Delete' }} ariaLabel={`Remove ${user.displayName} from selection`} disabled={busy} onClick={() => choose(user, false)} /></div>)}</section>}
      <div className={styles.addUsersFooter}><span>{chosen.length} selected</span><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={dismissAdd} /><PrimaryButton text={working ? 'Adding...' : 'Add users'} disabled={busy || !chosen.length} onClick={() => { addUsers().catch(() => undefined); }} /></div>
      </div>
    </Dialog>
    <Dialog hidden={!pending} onDismiss={busy ? undefined : () => setPending(undefined)} dialogContentProps={{ title: pending?.title }} modalProps={{ isBlocking: true }}>
      <p>{pending?.text}</p>{error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <DialogFooter><PrimaryButton text={busy ? 'Saving...' : 'Confirm'} disabled={busy} onClick={() => { if (pending) commit(pending.assignments, 'User assignments updated. Affected users must refresh DeskPilot.').catch(() => undefined); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => { setPending(undefined); setError(''); }} /></DialogFooter>
    </Dialog>
  </>;
}
