import * as React from 'react';
import { DefaultButton } from '@fluentui/react';
import type { MicrosoftAuth } from './auth/MicrosoftAuth';

export function AccountMenu(props: { displayName: string; email: string; auth: MicrosoftAuth; onError: (error: unknown) => void }): React.ReactElement {
  const initials = (props.displayName || props.email).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <div className="account">
    <span className="account-name">{props.displayName}</span>
    <DefaultButton className="account-avatar" ariaLabel={`Account menu for ${props.displayName}`} title={props.email} menuIconProps={{ iconName: '' }} menuProps={{
      className: 'account-dropdown',
      calloutProps: { calloutWidth: 250 },
      styles: { root: { width: 250, maxWidth: 'calc(100vw - 24px)' }, container: { minWidth: 0, paddingBottom: 10 }, subComponentStyles: { menuItem: { label: { fontSize: 13, whiteSpace: 'normal', overflowWrap: 'normal', wordBreak: 'normal', lineHeight: '20px', color: '#172536', overflow: 'visible', flex: 1, minWidth: 0 }, root: { height: 'auto', minHeight: 32, lineHeight: '20px', color: '#172536', background: '#fff' }, rootHovered: { background: '#edf3ff', color: '#1b385c' }, linkContent: { display: 'flex', alignItems: 'center', height: 'auto', minHeight: 32, padding: '5px 12px', whiteSpace: 'normal' }, icon: { color: '#415f88', flexShrink: 0, marginRight: 10 } } } },
      items: [
      { key: 'identity', text: props.email, onRender: () => <div className="account-menu-email">{props.email}</div> },
      { key: 'view', text: 'View account', iconProps: { iconName: 'Contact' }, href: 'https://myaccount.microsoft.com/', target: '_blank', rel: 'noopener noreferrer' },
      { key: 'switch', text: 'Sign in with a different account', iconProps: { iconName: 'AddFriend' }, onClick: () => { props.auth.switchAccount().catch(props.onError); } },
      { key: 'out', text: 'Sign out', iconProps: { iconName: 'SignOut' }, onClick: () => { props.auth.signOut().catch(props.onError); } }
    ] }} styles={{ root: { width: 36, height: 36, minWidth: 36, padding: 0, borderRadius: '50%', background: 'transparent', border: '1px solid #c6d8f3', color: '#fff' }, rootHovered: { background: 'transparent', color: '#fff' }, rootPressed: { background: 'transparent', color: '#fff' }, label: { margin: 0, fontWeight: 600 }, menuIcon: { display: 'none' } }}>{initials}</DefaultButton>
  </div>;
}
