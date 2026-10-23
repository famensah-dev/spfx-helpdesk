import type { WorkspaceSection } from '../utils/appRoutes';
import { WorkspaceSetupPanel } from '../components/WorkspaceSetupPanel';
import { WorkspaceMaintenancePanel } from '../components/WorkspaceMaintenancePanel';
import * as React from 'react';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import { DefaultButton, PrimaryButton, Icon, IconButton, TextField, Spinner, MessageBar, MessageBarType, Dialog, DialogFooter } from '@fluentui/react';
import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IWorkspaceSettings } from '../interfaces/IRoleManagement';
import styles from './SettingsPage.module.scss';
interface List { Id: string; Title: string; Hidden: boolean; BaseTemplate: number; DefaultViewUrl: string; RootFolder?: {ServerRelativeUrl: string}; }
interface Entry { Name: string; ServerRelativeUrl: string; folder: boolean; }
const textButtonStyles: import('@fluentui/react').IButtonStyles = { root: { background: 'transparent', border: 0, minWidth: 0, padding: '0 4px', height: 30, fontSize: 13 }, rootHovered: { background: 'transparent', border: 0, selectors: { '.ms-Button-label': { textDecoration: 'underline' } } }, rootPressed: { background: 'transparent', border: 0 }, rootDisabled: { background: 'transparent', border: 0 }, label: { fontWeight: 400 } };
const sections = ['General', 'SharePoint Settings', 'Site Lists', 'Site Documents', 'Hidden Lists'] as const;
export function SettingsPage(props: {context: WebPartContext; service: ITicketDataSource; portalTitle?: string; onBack: () => void; section?: WorkspaceSection; onSectionChange?:(section:WorkspaceSection)=>void}): React.ReactElement {
  const [localSection, setLocalSection] = React.useState<typeof sections[number]>('General');
  const section=props.section || localSection;
  const setSection=(value:WorkspaceSection):void=>{if(props.onSectionChange)props.onSectionChange(value);else setLocalSection(value);};
  const initial = props.service.workspaceSettings!;
  const [draft, setDraft] = React.useState<IWorkspaceSettings>({...initial, title: initial.title || props.portalTitle || 'IT Helpdesk'});
  const [lists, setLists] = React.useState<List[]>([]);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [folder, setFolder] = React.useState('');
  const [library, setLibrary] = React.useState('');
  const [trail, setTrail] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);
  const version = React.useRef(0);
  const saveLock = React.useRef(false);
  const site = props.context.pageContext.web.absoluteUrl.replace(/\/$/, '');
  const web = site + '/_api/web';
  const normal = new URL(window.location.href); normal.searchParams.delete('env');
  const app = new URL(normal.href); app.searchParams.set('env', 'WebView');
  const read = async <T,>(url: string): Promise<T> => {
    const address = new URL(url, site + '/');
    if (address.origin !== new URL(site).origin) throw new Error('Unexpected SharePoint address.');
    const response = await props.context.spHttpClient.get(address.href, SPHttpClient.configurations.v1, {headers: {Accept: 'application/json;odata=nometadata', 'odata-version': ''}});
    if (!response.ok) throw new Error(`SharePoint request failed (${response.status}). Check your permissions and try again.`);
    return response.json();
  };
  const all = async <T,>(url: string): Promise<T[]> => {
    const values: T[] = []; let next: string | undefined = url; const seen = new Set<string>();
    while (next) { if (seen.has(next)) throw new Error('Invalid pagination response.'); seen.add(next); const page: {value: T[]; 'odata.nextLink'?: string; '@odata.nextLink'?: string} = await read(next); values.push(...page.value); next = page['odata.nextLink'] || page['@odata.nextLink']; }
    return values;
  };
  const load = async (): Promise<void> => {
    const request = ++version.current; setBusy(true); setError('');
    try {
      if (section === 'Site Documents' && folder) {
        const encoded = encodeURIComponent(folder.replace(/'/g, "''")).replace(/'/g, '%27');
        const base = `${web}/GetFolderByServerRelativePath(decodedUrl='${encoded}')`;
        const [folders, files] = await Promise.all([all<Omit<Entry, 'folder'>>(`${base}/Folders?$select=Name,ServerRelativeUrl`), all<Omit<Entry, 'folder'>>(`${base}/Files?$select=Name,ServerRelativeUrl`)]);
        if (request === version.current) setEntries([...folders.map(item => ({...item, folder: true})), ...files.map(item => ({...item, folder: false}))].sort((a,b) => Number(b.folder) - Number(a.folder) || a.Name.localeCompare(b.Name)));
      } else {
        const values = await all<List>(`${web}/lists?$select=Id,Title,Hidden,BaseTemplate,DefaultViewUrl,RootFolder/ServerRelativeUrl&$expand=RootFolder&$top=100`);
        if (request === version.current) setLists(values.sort((a,b) => a.Title.localeCompare(b.Title)));
      }
    } catch (reason) { if (request === version.current) setError(reason instanceof Error ? reason.message : 'Unable to load settings.'); }
    finally { if (request === version.current) setBusy(false); }
  };
  React.useEffect(() => { if (section !== 'General' && section !== 'SharePoint Settings') load().catch(() => undefined); return () => { version.current++; }; }, [section, folder]);
  if (!props.service.access?.superAdmin) return <MessageBar messageBarType={MessageBarType.error}>Super Admin access is required.</MessageBar>;
  const url = (value: string): string => { const address = new URL(value, site + '/'); return address.origin === new URL(site).origin ? address.href : site + '/'; };
  const save = async (): Promise<void> => {
    if (saveLock.current || !props.service.saveWorkspaceSettings) return;
    saveLock.current = true; setSaving(true); setError(''); setConfirm(false);
    try { await props.service.saveWorkspaceSettings(draft); window.location.reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save settings.'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  const appNames = ['Ticket Categories', 'Ticket Subcategories', 'Ticket Issue Types', 'FAQs', 'Ticket Priorities', 'TicketComments', 'DeskPilot Access'];
  const relevant = (item: List): boolean => item.Title === initial.listName || item.Id.toLowerCase() === initial.listId.toLowerCase() || appNames.includes(item.Title) || Object.values(initial.resourceIds || {}).some(id => id.toLowerCase() === item.Id.toLowerCase());
  const listTable = (items: List[]): React.ReactElement => <table><thead><tr><th>List name</th><th>Visibility</th><th /></tr></thead><tbody>{items.map(item => <tr key={item.Id}><td><a href={url(item.DefaultViewUrl || `${site}/_layouts/15/listedit.aspx?List=${encodeURIComponent(item.Id)}`)}>{item.Title}</a></td><td>{item.Hidden ? 'Hidden' : 'Visible'}</td><td><a href={url(item.DefaultViewUrl || `${site}/_layouts/15/listedit.aspx?List=${encodeURIComponent(item.Id)}`)}>Open list</a></td></tr>)}</tbody></table>;
  const links = [
    ['Site home', site + '/', 'Home'], ['Site information', site + '/_layouts/15/prjsetng.aspx', 'Info'], ['Site permissions', site + '/_layouts/15/user.aspx', 'Permissions'],
    ['Site contents', site + '/_layouts/15/viewlsts.aspx', 'AllApps'], ['Site Pages', site + '/SitePages/Forms/AllPages.aspx', 'Page'], ['Site settings', site + '/_layouts/15/settings.aspx', 'Settings'],
    ['Show SharePoint controls', normal.href, 'Website'], ['Open DeskPilot app view', app.href, 'FullScreen']
  ];
  return <section className={styles.settings}><header><div><h2>Settings</h2><p>Manage this DeskPilot workspace.</p></div><DefaultButton styles={textButtonStyles} text="Back to DeskPilot" iconProps={{iconName: 'Back'}} onClick={props.onBack} /></header><div className={styles.layout}>
    <nav aria-label="Settings sections">{sections.map(item => <button key={item} aria-current={item === section ? 'page' : undefined} onClick={() => {setSection(item); setError('');}}>{item}</button>)}</nav>
    <div className={styles.content}><div className={styles.heading}><h3>{section}</h3>{section !== 'General' && section !== 'SharePoint Settings' && <IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh" disabled={busy} onClick={() => {load().catch(() => undefined);}} />}</div>
    {(section === 'General' || section === 'Site Lists') && <WorkspaceSetupPanel service={props.service} />}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {section === 'General' && <div className={styles.form}><TextField label="Workspace display name" value={draft.title} onChange={(_,value) => setDraft({...draft,title: value || ''})} description="Shown beside DeskPilot. This does not rename the SharePoint site." /><TextField label="Support description" multiline rows={2} value={draft.description} onChange={(_,value) => setDraft({...draft,description: value || ''})} /><TextField label="Connected SharePoint site" readOnly value={site} /><TextField label="DeskPilot page URL" readOnly value={app.href} /><TextField label="Tickets list name" required value={draft.listName} onChange={(_,value) => setDraft({...draft,listName: value || ''})} /><TextField label="Tickets list ID" value={draft.listId} description="Optional. Takes precedence over the name. The selected list must be on this site." onChange={(_,value) => setDraft({...draft,listId: (value || '').trim()})} /><div className={styles.actions}><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={saving} onClick={() => setDraft({...initial,title: initial.title || props.portalTitle || 'IT Helpdesk'})} /><PrimaryButton text={saving ? 'Saving...' : 'Save'} disabled={saving || !draft.listName.trim()} onClick={() => setConfirm(true)} /></div></div>}
    {section === 'SharePoint Settings' && <div className={styles.links}>{links.map(([name,href,icon]) => <a key={name} href={href}><Icon iconName={icon} aria-hidden="true" /><span>{name}</span></a>)}</div>}
    {busy && <Spinner label="Loading SharePoint resources..." />}
    {!busy && section === 'Site Lists' && <><p>Lists used by this workspace.</p>{listTable(lists.filter(relevant))}{lists.some(item => item.Title === 'DeskPilot User Access') && <><h4>Previously used list</h4><p>This is the old user-access list. DeskPilot now uses DeskPilot Access instead; this copy is kept for recovery.</p>{listTable(lists.filter(item => item.Title === 'DeskPilot User Access'))}</>}</>}
    {section === 'Site Lists' && <WorkspaceMaintenancePanel service={props.service} />}
    {!busy && section === 'Hidden Lists' && <><h4>DeskPilot</h4>{listTable(lists.filter(item => item.Hidden && relevant(item)))}<h4>Other SharePoint lists</h4>{listTable(lists.filter(item => item.Hidden && !relevant(item)))}<p>Links respect SharePoint permissions. System lists are provided for inspection.</p></>}
    {!busy && section === 'Site Documents' && <>{folder ? <><div className={styles.heading}><DefaultButton text={trail.length ? 'Up one folder' : 'Libraries'} iconProps={{iconName: 'Back'}} onClick={() => {const previous = [...trail]; setFolder(previous.pop() || ''); setTrail(previous);}} /><a href={url(library)}>Open library in SharePoint</a></div><p>{folder}</p><table><thead><tr><th>Name</th><th>Type</th></tr></thead><tbody>{entries.map(item => <tr key={item.ServerRelativeUrl}><td>{item.folder ? <button className={styles.folder} onClick={() => {setTrail([...trail,folder]); setFolder(item.ServerRelativeUrl);}}>{item.Name}</button> : <a href={url(item.ServerRelativeUrl)} target="_blank" rel="noopener noreferrer">{item.Name}</a>}</td><td>{item.folder ? 'Folder' : 'File'}</td></tr>)}</tbody></table>{!entries.length && <p>This folder is empty.</p>}</> : <div className={styles.links}>{lists.filter(item => item.BaseTemplate === 101 && !item.Hidden && item.RootFolder?.ServerRelativeUrl).map(item => <button key={item.Id} onClick={() => {setFolder(item.RootFolder!.ServerRelativeUrl); setLibrary(item.DefaultViewUrl); setTrail([]);}}><Icon iconName="FabricFolder" aria-hidden="true" /><span>{item.Title}</span></button>)}{!lists.some(item => item.BaseTemplate === 101 && !item.Hidden) && <p>No document libraries available.</p>}</div>}</>}
    </div></div><Dialog hidden={!confirm} onDismiss={() => setConfirm(false)} dialogContentProps={{title: 'Save workspace settings?', subText: 'The ticket list will be checked before saving. This changes the workspace for its users and reloads DeskPilot; no ticket data is moved.'}}><DialogFooter><DefaultButton styles={cancelButtonStyles} text="Cancel" onClick={() => setConfirm(false)} /><PrimaryButton text="Save" onClick={() => {save().catch(() => undefined);}} /></DialogFooter></Dialog><Dialog hidden={!saving} modalProps={{isBlocking: true, styles: {main: {width: 'min(520px, calc(100vw - 32px))', minWidth: 0, maxWidth: 520, borderRadius: 6}}}} dialogContentProps={{title: 'Saving workspace settings', showCloseButton: false}}>
      <div role="status" aria-live="polite" aria-busy="true"><Spinner label="Please wait while we save your settings and update workspace access." styles={{label: {color: '#172536', fontSize: 14, lineHeight: 21}}} /></div>
    </Dialog></section>;
}
