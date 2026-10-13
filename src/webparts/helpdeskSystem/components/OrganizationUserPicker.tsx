import { cancelButtonStyles } from './cancelButtonStyles';
import * as React from 'react';
import { IconButton, type ITextField, PersonaCoin, PersonaSize, Callout, DirectionalHint, FocusTrapZone, TextField, DefaultButton, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicketDataSource, IOrganizationUser } from '../interfaces/ITicketDataSource';
import type { IUserLookup } from '../interfaces/ITicket';

const assignmentButtonStyles = {
  root: { background: '#1b385c', border: '1px solid #1b385c', borderRadius: 4, color: '#fff', fontSize: 13 },
  rootHovered: { background: '#152d50', borderColor: '#152d50', color: '#fff' },
  rootPressed: { background: '#101e32', borderColor: '#101e32', color: '#fff' },
  rootDisabled: { background: '#e7e9ef', borderColor: '#e7e9ef', color: '#9297a5' },
  label: { fontSize: 13, fontWeight: 400 as const }
};
export function OrganizationUserPicker(props: { target: HTMLElement; dismissOnOutsideClick?: boolean; currentUser?: IUserLookup; service?: ITicketDataSource; onDismiss: () => void; onStart?: () => void; onComplete?: (error?: string) => void; onSelect: (person: IUserLookup | null) => Promise<void> }): React.ReactElement {
  const searchField = React.useRef<ITextField>(null);
  const [selectedUser, setSelectedUser] = React.useState<IOrganizationUser | null>(() => props.currentUser?.Id ? { id: 'current', displayName: props.currentUser.Title || props.currentUser.Email || 'Assigned user', email: props.currentUser.Email || '', userPrincipalName: props.currentUser.Email || '' } : null);
  const [query, setQuery] = React.useState('');
  const [users, setUsers] = React.useState<IOrganizationUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  React.useEffect(() => {
    let active = true;
    setUsers([]); setError(''); setLoading(false);
    if (query.trim().length < 2) return;
    setLoading(true);
    const timer = window.setTimeout(() => {
      if (!props.service?.searchUsers) { setError('Organization search is not available with this connection.'); setLoading(false); return; }
      props.service.searchUsers(query).then(result => { if (active) setUsers(result); })
        .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to search organization users.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, props.service]);
  const select = async (user: IOrganizationUser | null): Promise<void> => {
    setSaving(true); setError(''); props.onStart?.();
    try {
      if (user && user.id !== 'current' && !props.service?.resolveUser) throw new Error('Person resolution is unavailable.');
      const person = user?.id === 'current' ? props.currentUser! : user ? await props.service!.resolveUser!(user) : null;
      await props.onSelect(person);
      props.onComplete?.();
      if (mounted.current) props.onDismiss();
    } catch (reason) { const message = reason instanceof Error ? reason.message : 'Unable to apply assignment.'; props.onComplete?.(message); if (mounted.current) setError(message); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <Callout target={props.target} directionalHint={DirectionalHint.bottomLeftEdge} gapSpace={2} preventDismissOnEvent={event => !props.dismissOnOutsideClick && (event.type === 'mousedown' || event.type === 'click' || event.type === 'focus')} onDismiss={saving ? undefined : props.onDismiss} setInitialFocus role="dialog" ariaLabel="Choose one assignee" styles={{ root: { width: 320, maxWidth: 'calc(100vw - 24px)' }, calloutMain: { padding: 12, maxHeight: 400, overflowY: 'auto' } }}><FocusTrapZone>
    <TextField componentRef={searchField} readOnly={Boolean(selectedUser)} onRenderPrefix={selectedUser ? () => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, margin: '3px 0 3px 5px', paddingLeft: 7, background: '#e8effa', borderRadius: 999, color: '#293d58', fontSize: 13, maxWidth: 'calc(100% - 10px)', paddingRight: 3 }}><span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '18px' }}>{selectedUser.displayName}</span><IconButton iconProps={{ iconName: 'Cancel' }} ariaLabel={`Remove ${selectedUser.displayName}`} disabled={saving} styles={{ root: { width: 24, minWidth: 24, flexShrink: 0, height: 24, borderRadius: '50%', overflow: 'hidden', background: 'transparent', color: '#526580', selectors: { ':after': { borderRadius: '50%' } } }, rootHovered: { borderRadius: '50%', background: '#d5e2f5' }, rootPressed: { borderRadius: '50%', background: '#c3d6ef' }, icon: { fontSize: 10 } }} onClick={() => { setSelectedUser(null); setQuery(''); searchField.current?.focus(); }} /></span> : undefined} styles={{ subComponentStyles: { label: { root: { paddingBottom: 12, fontSize: 14 } } }, fieldGroup: { height: 'auto', minHeight: 32, border: '1px solid #d6e1ee', borderRadius: 4, selectors: { ':hover': { borderColor: '#a9bfd9' }, ':after': { border: '1px solid #789ac4', borderRadius: 4 } } }, prefix: { background: 'transparent', padding: 0, maxWidth: '100%', flex: selectedUser ? '1 1 100%' : undefined }, field: { fontSize: 13, ...(selectedUser ? { width: 0, minWidth: 0, padding: 0, flex: '0 0 0px' } : {}) } }} label="Search organization users" placeholder={selectedUser ? '' : 'Name or email (at least 2 characters)'} value={selectedUser ? '' : query} disabled={saving} onChange={(_, value) => { setQuery(value || ''); setSelectedUser(null); }} />
    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {(loading || saving) && <Spinner label={saving ? 'Assigning user…' : 'Searching users…'} />}

      {!selectedUser && !loading && !error && query.trim().length >= 2 && !users.length && <p role="status">No users found. Try another name or email.</p>}
      {!selectedUser && users.length > 0 && <div style={{ display: 'grid' }}>
        {!selectedUser && users.map((user, index) => <DefaultButton key={user.id} disabled={saving || loading} styles={{ root: { background: '#fff', color: '#293d58', border: 0, borderBottom: index < users.length - 1 ? '1px solid #e5ebf3' : 0, borderRadius: 0, height: 'auto', minHeight: 48, textAlign: 'left', justifyContent: 'flex-start', padding: '8px 10px' }, rootHovered: { background: '#edf3fc', color: '#1b385c' }, rootPressed: { background: '#e8effa', color: '#1b385c' }, flexContainer: { width: '100%', minWidth: 0 }, label: { fontSize: 14, fontWeight: 400, whiteSpace: 'normal', lineHeight: '18px', margin: 0, minWidth: 0, width: '100%' } }} aria-pressed={false} onClick={() => setSelectedUser(user)} onRenderText={() => <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}><span style={{ flexShrink: 0 }} aria-hidden="true"><PersonaCoin text={user.displayName} size={PersonaSize.size28} /></span><span style={{ minWidth: 0, overflowWrap: 'anywhere', whiteSpace: 'normal' }}><span>{user.displayName}</span><br /><span style={{ fontSize: 13, color: '#647694' }}>{user.email}</span></span></span>} />)}
      </div>}
      {!selectedUser && users.length === 50 && <p>Showing up to 50 matches. Refine your search to find more people.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 0 }}>
        <DefaultButton styles={assignmentButtonStyles} text="Apply" disabled={saving || loading || (!selectedUser && !props.currentUser?.Id)} onClick={() => { void select(selectedUser); }} />
        <DefaultButton text="Cancel" disabled={saving} onClick={props.onDismiss} styles={cancelButtonStyles} />
      </div>
    </div>
  </FocusTrapZone></Callout>;
}
