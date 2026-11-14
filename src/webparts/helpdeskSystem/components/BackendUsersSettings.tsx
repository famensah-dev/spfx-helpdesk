import * as React from 'react';
import { DefaultButton, PrimaryButton, TextField, Dropdown, Checkbox, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { LaravelTicketService, IBackendUser } from '../services/LaravelTicketService';

const emptyUser = (): IBackendUser => ({entra_object_id: '', name: '', email: '', role: 'requester', enabled: true});

export function BackendUsersSettings(props: {service: LaravelTicketService; onBack: () => void}): React.ReactElement {
  const [users, setUsers] = React.useState<IBackendUser[]>([]);
  const [draft, setDraft] = React.useState<IBackendUser>(emptyUser);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    let active = true;
    props.service.listUsers().then(values => {if (active) setUsers(values);}).catch(reason => {if (active) setError(String(reason));}).finally(() => {if (active) setBusy(false);});
    return () => { active = false; };
  }, [props.service]);
  const save = async (): Promise<void> => {
    setBusy(true); setError('');
    try { await props.service.saveUser(draft); setUsers(await props.service.listUsers()); setDraft(emptyUser()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save user access.'); }
    finally { setBusy(false); }
  };
  return <section style={{maxWidth: 800, margin: '24px auto', padding: 24}} aria-label="Workspace user access">
    <DefaultButton text="Back" onClick={props.onBack} /><h1>Workspace users</h1>
    <p>Add users using their Microsoft Entra user object ID. Role and access changes apply to their next request.</p>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {busy && <Spinner label="Loading workspace users" />}
    <ul>{users.map(user => <li key={user.id || user.entra_object_id}><DefaultButton disabled={busy || !user.entra_object_id || user.entra_object_id === props.service.access.oid} text={`${user.name} (${user.email}) — ${user.role}${user.enabled ? '' : ' — disabled'}${user.entra_object_id ? '' : ' — no Entra sign-in linked'}`} onClick={() => setDraft({...user})} /></li>)}</ul>
    <form onSubmit={event => {event.preventDefault(); void save();}}>
      <TextField label="Entra user object ID" required disabled={busy || Boolean(draft.id)} value={draft.entra_object_id || ''} onChange={(_, value) => setDraft({...draft, entra_object_id: value || ''})} />
      <TextField label="Name" required disabled={busy} value={draft.name} onChange={(_, value) => setDraft({...draft, name: value || ''})} />
      <TextField label="Email" type="email" required disabled={busy} value={draft.email} onChange={(_, value) => setDraft({...draft, email: value || ''})} />
      <Dropdown label="Role" disabled={busy} selectedKey={draft.role} options={[{key:'requester',text:'Requester'}, {key:'agent',text:'Agent'}, {key:'admin',text:'Helpdesk Admin'}, {key:'superAdmin',text:'Super Admin'}]} onChange={(_, option) => setDraft({...draft, role: option!.key as IBackendUser['role']})} />
      <Checkbox label="Access enabled" disabled={busy} checked={draft.enabled} onChange={(_, checked) => setDraft({...draft, enabled: Boolean(checked)})} />
      <PrimaryButton type="submit" disabled={busy} text="Save user" /><DefaultButton disabled={busy} text="New user" onClick={() => setDraft(emptyUser())} />
    </form>
  </section>;
}
