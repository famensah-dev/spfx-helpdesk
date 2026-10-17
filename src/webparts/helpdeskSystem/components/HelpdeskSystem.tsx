import * as React from 'react';
import HelpdeskApp from './HelpdeskApp';
import { createSharePointService } from '../services/SharePointTicketService';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { Icon, Spinner } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';
import { SharePointAccountMenu } from './SharePointAccountMenu';
import { SharePointSettingsMenu } from './SharePointSettingsMenu';
import { SettingsPage } from '../pages/SettingsPage';
import type { IHelpdeskSystemProps } from './IHelpdeskSystemProps';

export default function HelpdeskSystem(props: IHelpdeskSystemProps): React.ReactElement {
  const [service, setService] = React.useState<ITicketDataSource>();
  const [error, setError] = React.useState('');
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  React.useEffect(() => {
    let active = true;
    setService(undefined); setError('');
    createSharePointService(props.spContext, props.listName, props.listId).then(value => { if (active) setService(value); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to connect to SharePoint.'); });
    return () => { active = false; };
  }, [props.spContext, props.listName, props.listId]);
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
  const user = props.spContext.pageContext.user;
  const accountActions = <><SharePointSettingsMenu context={props.spContext} superAdmin={Boolean(service.access?.superAdmin)} onOpenSettings={() => setSettingsOpen(true)} /><SharePointAccountMenu context={props.spContext} /></>;
  return <HelpdeskApp service={service} currentUserEmail={user.email} accountActions={accountActions} portalTitle={service.workspaceSettings?.title || props.portalTitle} settingsContent={settingsOpen && service.access?.superAdmin ? <SettingsPage context={props.spContext} service={service} portalTitle={props.portalTitle} onBack={() => setSettingsOpen(false)} /> : undefined} />;
}
