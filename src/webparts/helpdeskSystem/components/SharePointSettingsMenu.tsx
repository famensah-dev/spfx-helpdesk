import * as React from 'react';
import { IconButton } from '@fluentui/react';
import type { WebPartContext } from '@microsoft/sp-webpart-base';

export function SharePointSettingsMenu(props: { context: WebPartContext; superAdmin: boolean; onOpenSettings?: () => void }): React.ReactElement | null {
  if (!props.superAdmin) return null;
  return <IconButton iconProps={{iconName: 'Settings'}} ariaLabel="Open Settings" title="Settings" onClick={props.onOpenSettings}
    styles={{root: {background: 'transparent', color: '#fff', width: 34, minWidth: 34, height: 34, padding: 0, flexShrink: 0}, rootHovered: {background: 'rgba(255,255,255,.12)', color: '#fff'}, rootPressed: {background: 'rgba(255,255,255,.18)', color: '#fff'}}} />;
}
