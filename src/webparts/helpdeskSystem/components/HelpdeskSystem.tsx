import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import { resolveAppRoute, workspacePaths } from '../utils/appRoutes';
import * as React from 'react';
import HelpdeskApp from './HelpdeskApp';
import { createSharePointService } from '../services/SharePointTicketService';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { Icon, IconButton, Spinner, TextField, PrimaryButton, DefaultButton } from '@fluentui/react';
import { SPHttpClient } from '@microsoft/sp-http';
import { validateWorkspaceConnection, connectionStorageKey, type IWorkspaceConnection } from '../utils/workspaceConnection';
import styles from './HelpdeskSystem.module.scss';
import { SharePointAccountMenu } from './SharePointAccountMenu';
import { SharePointSettingsMenu } from './SharePointSettingsMenu';
import { SettingsPage } from '../pages/SettingsPage';
import type { IHelpdeskSystemProps } from './IHelpdeskSystemProps';

export default function HelpdeskSystem(props: IHelpdeskSystemProps): React.ReactElement {
  return <HashRouter><RoutedHelpdeskSystem {...props} /></HashRouter>;
}
function RoutedHelpdeskSystem(props: IHelpdeskSystemProps): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const route = resolveAppRoute(location.pathname);
  const [service, setService] = React.useState<ITicketDataSource>();
  const [error, setError] = React.useState('');
  const teams = Boolean(props.spContext.sdks?.microsoftTeams);
  const [connection, setConnection] = React.useState<IWorkspaceConnection>();
  const [editingConnection, setEditingConnection] = React.useState(false);
  const [siteInput, setSiteInput] = React.useState('');
  const [pageInput, setPageInput] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  const storageKey = connectionStorageKey(props.spContext.pageContext.web.absoluteUrl, props.spContext.pageContext.user.loginName || props.spContext.pageContext.user.email);
  const settingsOpen = route.workspace === true;
  const openSettings = ():void => navigate('/workspace-settings/general', {state:{from:location.pathname+location.search}});
  React.useEffect(() => {
    let active = true;
    setService(undefined); setError('');
    void (async () => {
      let selected: IWorkspaceConnection | undefined;
      if (props.workspaceSiteUrl || props.workspacePageUrl) selected = validateWorkspaceConnection({siteUrl: props.workspaceSiteUrl || '', pageUrl: props.workspacePageUrl || ''}, props.spContext.pageContext.web.absoluteUrl);
      else if (teams) {
        const origin = new URL(props.spContext.pageContext.web.absoluteUrl).origin;
        // The tenant root file is an optional, administrator-maintained pointer only.
        // Its contents grant no privileges and never create lists on the hosting site.
        const response = await props.spContext.spHttpClient.get(origin + '/SiteAssets/DeskPilot/teams-connection.json', SPHttpClient.configurations.v1);
        if (response.ok) selected = validateWorkspaceConnection(await response.json(), origin);
        else if (response.status !== 404 && response.status !== 403) throw new Error(`Unable to read the Teams workspace connection (${response.status}).`);
        if (!selected) {
          let stored: string | null = null;
          try { stored = window.localStorage.getItem(storageKey); } catch { /* Storage may be unavailable in embedded clients. */ }
          if (stored) selected = validateWorkspaceConnection(JSON.parse(stored), origin);
        }
        if (!selected) { if (active) setEditingConnection(true); return; }
      }
      const value = await createSharePointService(props.spContext, props.listName, props.listId, selected);
      if (active) { setService(value); setConnection(selected); setSiteInput(selected?.siteUrl || ''); setPageInput(selected?.pageUrl || ''); }
    })().catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Unable to connect to SharePoint.'); if (teams || props.workspaceSiteUrl) setEditingConnection(true); } });
    return () => { active = false; };
  }, [props.spContext, props.listName, props.listId, props.workspaceSiteUrl, props.workspacePageUrl, teams, storageKey]);
  const connect = async (): Promise<void> => {
    if (connecting) return;
    setConnecting(true); setError('');
    try {
      const selected = validateWorkspaceConnection({siteUrl:siteInput,pageUrl:pageInput},props.spContext.pageContext.web.absoluteUrl);
      const value = await createSharePointService(props.spContext,props.listName,props.listId,selected);
      try { window.localStorage.setItem(storageKey,JSON.stringify(selected)); } catch { /* Connection remains usable for this session. */ }
      setConnection(selected); setService(value); setEditingConnection(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to connect to the workspace.'); }
    finally { setConnecting(false); }
  };
  if (editingConnection) return <div className={`${styles.helpdeskSystemShell} ${styles.workspaceGate}`}><main className={styles.workspaceGateMain}><section className={styles.workspaceGatePanel} aria-label="Connect DeskPilot workspace"><h1>Connect your DeskPilot workspace</h1><p>Use the existing SharePoint site containing your DeskPilot lists, and the page where DeskPilot runs. This does not create or move any lists.</p><form onSubmit={event => {event.preventDefault(); void connect();}}><TextField label="Workspace SharePoint site URL" required disabled={connecting} value={siteInput} placeholder="https://yourtenant.sharepoint.com/sites/helpdesk" onChange={(_,value)=>setSiteInput(value || '')} /><TextField label="DeskPilot page URL" required disabled={connecting} value={pageInput} placeholder="https://yourtenant.sharepoint.com/sites/helpdesk/SitePages/DeskPilot.aspx" onChange={(_,value)=>setPageInput(value || '')} /><p>This connection is remembered for your account in this browser. Your administrator can publish a default connection for everyone.</p>{error && <p role="alert">{error}</p>}<PrimaryButton type="submit" text={connecting?'Connecting...':'Connect'} disabled={connecting || !siteInput.trim() || !pageInput.trim()} />{service && <DefaultButton text="Cancel" disabled={connecting} onClick={()=>{setEditingConnection(false);setError('');}} />}</form></section></main></div>;
  if (error || !service) {
    const accessDenied = error.includes('You do not have access to this DeskPilot workspace.');
    return <div className={`${styles.helpdeskSystemShell} ${styles.workspaceGate}`}>
      <header className={styles.appHeader}>
        <div className={styles.brand}><Icon iconName="Headset" aria-hidden="true" /><strong>DeskPilot</strong><span className={styles.brandDivider} aria-hidden="true">|</span><span className={styles.portalLabel}>{props.portalTitle?.trim() || 'IT Helpdesk'}</span></div>
        <div className={styles.headerActions}><SharePointAccountMenu context={props.spContext} /></div>
      </header>
      <main className={styles.workspaceGateMain}>
        <section className={styles.workspaceGatePanel} aria-label="DeskPilot workspace access">
          <div className={styles.workspaceGateBrand}><span className={styles.lightLogo} role="img" aria-label="DeskPilot" /></div>
          <h1>{error ? accessDenied ? 'Access required' : 'We couldn’t connect to your workspace' : 'Connecting to your workspace'}</h1>
          {error ? <p role="alert">{accessDenied ? 'You don’t have access to this DeskPilot workspace. Contact your helpdesk administrator to request access.' : error}</p> : <Spinner label="Please wait while we connect to your support workspace." styles={{label: {fontSize: 14, lineHeight: 21, color: '#172536'}}} />}
        </section>
      </main>
    </div>;
  }
  service.openWorkspaceSetup = openSettings;
  const user = props.spContext.pageContext.user;
  const accountActions = <>{(teams || connection) && <IconButton iconProps={{iconName:'PlugConnected'}} ariaLabel="Change workspace connection" title="Change workspace connection" onClick={()=>setEditingConnection(true)} styles={{root:{background:'transparent',color:'#fff'}}} />}<SharePointSettingsMenu context={props.spContext} superAdmin={Boolean(service.access?.superAdmin)} onOpenSettings={openSettings} /><SharePointAccountMenu context={props.spContext} /></>;
  return <HelpdeskApp service={service} currentUserEmail={user.email} accountActions={accountActions} portalTitle={service.workspaceSettings?.title || props.portalTitle} settingsContent={settingsOpen && service.access?.superAdmin ? <SettingsPage context={props.spContext} service={service} portalTitle={props.portalTitle} section={route.workspaceSection || 'General'} onSectionChange={section=>navigate('/workspace-settings/'+workspacePaths[section],{state:location.state})} onBack={()=>navigate(typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//') ? location.state.from : '/')} /> : undefined} />;
}
