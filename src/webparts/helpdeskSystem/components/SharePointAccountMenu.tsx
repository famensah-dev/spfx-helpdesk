import * as React from 'react';
import { DefaultButton } from '@fluentui/react';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import styles from './HelpdeskSystem.module.scss';

export function SharePointAccountMenu(props: { context: WebPartContext }): React.ReactElement {
  const user = props.context.pageContext.user;
  const [photo, setPhoto] = React.useState<string>();
  const initials = (user.displayName || user.email || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  React.useEffect(() => {
    let active = true;
    let photoUrl: string | undefined;
    const controller = new AbortController();
    setPhoto(undefined);
    const load = async (): Promise<void> => {
      try {
        const provider = await props.context.aadTokenProviderFactory.getTokenProvider();
        const token = await provider.getToken('https://graph.microsoft.com');
        const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok) return; // Graph returns 404 when no actual profile photo exists.
        const blob = await response.blob();
        if (!active || !blob.size || !blob.type.startsWith('image/')) return;
        photoUrl = URL.createObjectURL(blob);
        setPhoto(photoUrl);
      } catch { /* Initials remain visible when the photo is unavailable. */ }
    };
    load().catch(() => undefined);
    return () => { active = false; controller.abort(); if (photoUrl) URL.revokeObjectURL(photoUrl); };
  }, [props.context, user.loginName]);
  const siteUrl = props.context.pageContext.web.absoluteUrl;
  const switchUrl = `${siteUrl}/_layouts/15/closeConnection.aspx?loginasanotheruser=true&Source=${encodeURIComponent(window.location.href)}`;
  return <div className={styles.accountIdentity}>
    <span>{user.displayName}</span>
    <DefaultButton className={styles.accountAvatar} ariaLabel={`Account menu for ${user.displayName}`} title={user.email} menuIconProps={{ iconName: '' }}
      styles={{ root: { background: 'transparent', border: '1px solid #c6d8f3', borderRadius: '50%', width: 36, height: 36, minWidth: 36, padding: 0, color: '#fff' }, rootHovered: { background: 'transparent', color: '#fff', borderColor: '#fff' }, rootPressed: { background: 'transparent', color: '#fff' }, rootExpanded: { background: 'transparent', color: '#fff' }, label: { margin: 0 }, menuIcon: { display: 'none' } }}
      menuProps={{ calloutProps: { calloutWidth: 270 }, styles: { root: { width: 270, maxWidth: 'calc(100vw - 24px)' }, subComponentStyles: { menuItem: { label: { whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: '18px' }, root: { height: 'auto', minHeight: 30 }, linkContent: { height: 'auto', minHeight: 30, boxSizing: 'border-box', padding: '4px 18px' } } } }, items: [
        { key: 'identity', text: user.email || user.loginName, onRender: () => <div className={styles.accountEmail}>{user.email || user.loginName}</div> },
        { key: 'account', text: 'View account', iconProps: { iconName: 'Contact' }, href: 'https://myaccount.microsoft.com/', target: '_blank', rel: 'noopener noreferrer' },
        { key: 'profile', text: 'My profile', iconProps: { iconName: 'ContactInfo' }, href: `${siteUrl}/_layouts/15/me.aspx`, target: '_blank', rel: 'noopener noreferrer' },
        { key: 'switch', text: 'Sign in with another account', iconProps: { iconName: 'AddFriend' }, href: switchUrl },
        { key: 'out', text: 'Sign out', iconProps: { iconName: 'SignOut' }, href: `${siteUrl}/_layouts/15/SignOut.aspx` }
      ] }}>
      {photo ? <img className={styles.accountPhoto} src={photo} alt="" onError={() => setPhoto(undefined)} /> : <span aria-hidden="true">{initials}</span>}
    </DefaultButton>
  </div>;
}
