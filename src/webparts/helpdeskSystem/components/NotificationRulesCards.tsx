import * as React from 'react';
import { Icon, Toggle } from '@fluentui/react';
import { eventNames, notificationEvents } from '../interfaces/INotifications';
import type { IEmailSettings, NotificationEvent } from '../interfaces/INotifications';
import layout from './HelpdeskSettingsLayout.module.scss';

const descriptions: Record<NotificationEvent, string> = { created: 'A new ticket is submitted', assigned: 'A ticket is assigned to an agent', resolved: 'A ticket is marked resolved', closed: 'A ticket is closed', invited: 'A user is invited to DeskPilot' };
export function NotificationRulesCards(props: { value: IEmailSettings; busy: boolean; saveControl: React.ReactNode; onChange: (value: IEmailSettings) => void; onTemplate: (event: NotificationEvent) => void }): React.ReactElement {
  const { value, busy, onChange } = props;
  return <div className={layout.notificationRulesCards}>
    <section className={layout.notificationRulesCard} aria-label="Ticket notifications">
      <header className={layout.notificationRulesHeader}><div><h3>Ticket Notifications</h3><p>Send alerts when tickets change.</p></div><div className={layout.notificationRulesActions}><Toggle ariaLabel="Enable ticket notifications" inlineLabel label={value.enabled ? 'On' : 'Off'} checked={value.enabled} disabled={busy} onChange={(_, checked) => onChange({ ...value, enabled: Boolean(checked) })} />{props.saveControl}</div></header>
      <table className={layout.notificationRulesTable}><thead><tr><th scope="col">Event</th><th scope="col"><Icon iconName="Mail" /> Email</th><th scope="col"><Icon iconName="Ringer" /> In-App</th></tr></thead><tbody>{notificationEvents.filter(key => key !== 'invited').map(key => <tr key={key}><td><button type="button" className={layout.notificationEventLink} onClick={() => props.onTemplate(key)}>{eventNames[key]}</button><p>{descriptions[key]}</p></td><td><Toggle ariaLabel={eventNames[key] + ' email'} checked={value.rules[key].email} disabled={busy} onChange={(_, checked) => onChange({ ...value, rules: { ...value.rules, [key]: { ...value.rules[key], email: Boolean(checked) } } })} /></td><td><Toggle ariaLabel={eventNames[key] + ' in-app notification'} checked={value.rules[key].inApp} disabled={busy} onChange={(_, checked) => onChange({ ...value, rules: { ...value.rules, [key]: { ...value.rules[key], inApp: Boolean(checked) } } })} /></td></tr>)}</tbody></table>
    </section>
    <section className={layout.notificationRulesCard} aria-label="User invitations"><header className={layout.notificationRulesHeader}><div><h3>User Invitations</h3><p>Separate from ticket notifications. Invites go only to the new user.</p></div></header>
      <div className={layout.invitationAutomaticRow}><div><h4>Send Invitation Automatically</h4><p>When off, use Send invite next to a user in Users &amp; Roles.</p>{!value.rules.invited.email && <p>Enable invitation email below to send invitations.</p>}</div><Toggle ariaLabel="Send invitation automatically" checked={Boolean(value.autoInvite)} disabled={busy || !value.rules.invited.email} onChange={(_, checked) => onChange({ ...value, autoInvite: Boolean(checked) })} /></div>
      <details className={layout.invitationOptions}><summary>Invitation Email Options</summary><Toggle label="Enable Invitation Email" inlineLabel checked={value.rules.invited.email} disabled={busy} onChange={(_, checked) => onChange({ ...value, rules: { ...value.rules, invited: { ...value.rules.invited, email: Boolean(checked) } } })} /><button type="button" className={layout.notificationEventLink} onClick={() => props.onTemplate('invited')}>Edit Invitation Template</button></details>
    </section>
  </div>;
}
