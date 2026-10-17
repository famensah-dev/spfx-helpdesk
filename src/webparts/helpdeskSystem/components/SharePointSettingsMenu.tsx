import * as React from 'react';
import { ContextualMenuItemType, IconButton } from '@fluentui/react';
import type { IContextualMenuItem } from '@fluentui/react';
import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';

interface HiddenList { Id: string; Title: string; DefaultViewUrl?: string; }

/** Admin conveniences only; SharePoint still authorizes every destination. */
export function SharePointSettingsMenu(props: { context: WebPartContext; superAdmin: boolean }): React.ReactElement | null {
  const [lists, setLists] = React.useState<HiddenList[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const mounted = React.useRef(true);
  const busy = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (!props.superAdmin) return null;
  const site = props.context.pageContext.web.absoluteUrl.replace(/\/$/, '');
  const normal = new URL(window.location.href);
  normal.searchParams.delete('env');
  const app = new URL(normal.href);
  app.searchParams.set('env', 'WebView');
  const loadLists = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const found: HiddenList[] = [];
      let next: string | undefined = `${site}/_api/web/lists?$select=Id,Title,DefaultViewUrl&$filter=Hidden eq true&$top=100`;
      const visited = new Set<string>();
      while (next) {
        const address = new URL(next, site + '/');
        if (address.origin !== new URL(site).origin || visited.has(address.href)) throw new Error('Invalid SharePoint list response.');
        visited.add(address.href);
        const response = await props.context.spHttpClient.get(address.href, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' } });
        if (!response.ok) throw new Error(`Unable to load hidden lists (${response.status}).`);
        const page = await response.json() as { value: HiddenList[]; 'odata.nextLink'?: string; '@odata.nextLink'?: string };
        found.push(...page.value);
        next = page['odata.nextLink'] || page['@odata.nextLink'];
      }
      if (mounted.current) setLists(found.sort((a, b) => a.Title.localeCompare(b.Title)));
    } catch (reason) {
      if (mounted.current) { setLists([]); setError(reason instanceof Error ? reason.message : 'Unable to load hidden lists.'); }
    } finally { busy.current = false; if (mounted.current) setLoading(false); }
  };
  const hidden: IContextualMenuItem[] = loading ? [{key: 'loading', text: 'Loading hidden lists...', disabled: true}] : error ? [{key: 'error', text: error, disabled: true}] : lists.length ? lists.map(list => {
    const destination = list.DefaultViewUrl ? new URL(list.DefaultViewUrl, site + '/') : new URL(`${site}/_layouts/15/listedit.aspx?List=${encodeURIComponent(list.Id)}`);
    return {key: list.Id, text: list.Title, title: list.Title, iconProps: {iconName: 'BulletedList'}, href: destination.origin === new URL(site).origin ? destination.href : undefined};
  }) : [{key: 'empty', text: 'No hidden lists available', disabled: true}];
  return <IconButton iconProps={{iconName: 'Settings'}} menuIconProps={{iconName: ''}} ariaLabel="Super admin settings" title="Settings" onMenuClick={() => { loadLists().catch(() => undefined); }}
    styles={{root: {background: 'transparent', color: '#fff', width: 34, height: 34}, rootHovered: {background: 'rgba(255,255,255,.12)', color: '#fff'}, rootPressed: {background: 'rgba(255,255,255,.18)', color: '#fff'}, rootExpanded: {background: 'rgba(255,255,255,.12)', color: '#fff'}}}
    menuProps={{styles: {container: {maxHeight: '70vh', overflowY: 'auto', minWidth: 260}}, items: [
      {key: 'views', itemType: ContextualMenuItemType.Section, sectionProps: {title: 'Page view', items: [
        {key: 'normal', text: 'Show SharePoint controls', iconProps: {iconName: 'Website'}, href: normal.href},
        {key: 'app', text: 'Open DeskPilot app view', iconProps: {iconName: 'FullScreen'}, href: app.href}
      ]}},
      {key: 'sharepoint', itemType: ContextualMenuItemType.Section, sectionProps: {title: 'SharePoint', items: [
        {key: 'home', text: 'Site home', iconProps: {iconName: 'Home'}, href: site + '/'},
        {key: 'contents', text: 'Site contents', iconProps: {iconName: 'AllApps'}, href: site + '/_layouts/15/viewlsts.aspx'},
        {key: 'settings', text: 'Site settings', iconProps: {iconName: 'Settings'}, href: site + '/_layouts/15/settings.aspx'}
      ]}},
      {key: 'hidden', itemType: ContextualMenuItemType.Section, sectionProps: {title: 'Hidden lists', items: hidden}}
    ]}} />;
}
