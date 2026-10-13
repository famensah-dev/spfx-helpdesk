import * as React from 'react';
import { NormalPeoplePicker, MessageBar, MessageBarType, Spinner, Label } from '@fluentui/react';
import type { IPersonaProps } from '@fluentui/react';
import type { ITicketDataSource, IOrganizationUser } from '../interfaces/ITicketDataSource';
import type { IUserLookup } from '../interfaces/ITicket';
import styles from './HelpdeskSystem.module.scss';

type Person = IPersonaProps & { directoryUser?: IOrganizationUser };
export function FormAssigneePicker(props: { service?: ITicketDataSource; value: IUserLookup | null; disabled?: boolean; onChange: (person: IUserLookup | null) => void; onBusy: (busy: boolean) => void }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  const mounted = React.useRef(true);
  const searchVersion = React.useRef(0);
  const [id] = React.useState(() => `form-assignee-${Math.random().toString(36).slice(2)}`);
  React.useEffect(() => () => { mounted.current = false; searchVersion.current++; }, []);
  const search = async (query: string): Promise<Person[]> => {
    const version = ++searchVersion.current;
    setError('');
    if (query.trim().length < 2 || props.value) return [];
    try {
      if (!props.service?.searchUsers) throw new Error('Organization user search is unavailable.');
      const users = await props.service.searchUsers(query);
      return mounted.current && version === searchVersion.current ? users.map(user => ({ key: user.id, text: user.displayName, secondaryText: user.email, directoryUser: user })) : [];
    } catch (reason) {
      if (mounted.current && version === searchVersion.current) setError(reason instanceof Error ? reason.message : 'Unable to search users.');
      return [];
    }
  };
  const select = async (items?: Person[]): Promise<void> => {
    if (lock.current) return;
    const selected = items?.[0];
    if (!selected) { setError(''); props.onChange(null); return; }
    if (!selected.directoryUser) return;
    lock.current = true; setBusy(true); props.onBusy(true); setError('');
    try {
      if (!props.service?.resolveUser) throw new Error('Person resolution is unavailable.');
      const person = await props.service.resolveUser(selected.directoryUser);
      if (mounted.current) props.onChange(person);
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Unable to select this user.'); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); props.onBusy(false); } }
  };
  return <div className={styles.formAssigneePicker}><Label htmlFor={id}>Assigned to</Label>
    <NormalPeoplePicker selectedItems={props.value ? [{ key: String(props.value.Id), text: props.value.Title || props.value.Email, secondaryText: props.value.Email }] : []}
      itemLimit={1} disabled={props.disabled || busy} resolveDelay={350} onResolveSuggestions={search} onChange={items => { void select(items); }}
      inputProps={{ id, 'aria-label': 'Assigned to', placeholder: props.value ? '' : 'Search by name or email' }}
      pickerSuggestionsProps={{ suggestionsHeaderText: 'Organization users', noResultsFoundText: 'No matching users', loadingText: 'Searching users…' }}
      onValidateInput={() => 0} />
    {busy && <Spinner ariaLabel="Selecting assignee" />}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
  </div>;
}
