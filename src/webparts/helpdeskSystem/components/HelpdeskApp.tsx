import * as React from 'react';
import { DefaultButton, Icon, ThemeProvider, createTheme, MessageBar, MessageBarType } from '@fluentui/react';
import { DashboardPage } from '../pages/DashboardPage';
import { TicketListPage } from '../pages/TicketListPage';
import styles from './HelpdeskSystem.module.scss';
import { useHelpdeskDashboard } from '../hooks/useHelpdeskDashboard';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';

export interface IHelpdeskAppProps { service: ITicketDataSource; currentUserEmail: string; accountActions?: React.ReactNode; }

const pages = ['Dashboard', 'Tickets', 'FAQs', 'Administration'] as const;
type Page = typeof pages[number] | 'My Assigned Tickets' | 'My Dashboard';
const appTheme = createTheme({
  defaultFontStyle: { fontFamily: "'Segoe UI', sans-serif" },
  palette: { themePrimary: '#2855b6', themeDarkAlt: '#234a9c', themeDark: '#1b385c', themeLight: '#d5e2fb', themeLighter: '#eff4ff', white: '#ffffff', neutralPrimary: '#252939' },
  effects: { roundedCorner2: '2px', roundedCorner4: '2px' },
  components: {
    PrimaryButton: { styles: { root: { background: '#1b385c', border: '1px solid #1b385c', borderRadius: 2, color: '#fff' }, rootHovered: { background: '#152d50', borderColor: '#152d50', color: '#fff' }, rootPressed: { background: '#101e32', color: '#fff' }, rootDisabled: { background: '#e7e9ef', borderColor: '#e7e9ef', color: '#9297a5' } } },
    DefaultButton: { styles: { root: { background: '#eaf0ff', border: '1px solid #cedaf2', borderRadius: 2, color: '#244a91' }, rootHovered: { background: '#dce7fc', borderColor: '#a8bee8', color: '#152d50' }, rootPressed: { background: '#adc5f0', color: '#152d50' }, rootDisabled: { background: '#f0f1f5', borderColor: '#e7e9ef', color: '#9297a5' } } },
    IconButton: { styles: { root: { background: '#eaf0ff', color: '#2855b6', borderRadius: 2 }, rootHovered: { background: '#dce7fc', color: '#1b385c' }, rootDisabled: { background: '#f0f1f5', color: '#9297a5' } } }
  }
});

export default function HelpdeskApp(props: IHelpdeskAppProps): React.ReactElement {
  const [page, setPage] = React.useState<Page>('Dashboard');
  const personal = page === 'My Dashboard' || page === 'My Assigned Tickets';
  const dashboard = useHelpdeskDashboard(props.service, personal ? props.currentUserEmail : undefined);
  const dashboardActive = page === 'Dashboard' || page === 'My Dashboard' || page === 'My Assigned Tickets';
  const heading = React.useRef<HTMLHeadingElement>(null);
  const navigate = (next: Page): void => {
    setPage(next);
    // Move focus to the new page after React commits its content.
    window.requestAnimationFrame(() => heading.current?.focus());
  };
  return (
    <ThemeProvider theme={appTheme} className={styles.helpdeskSystemShell}>
      <header className={styles.appHeader}>
        <div className={styles.brand}><Icon iconName="Headset" /><strong>DeskPilot</strong><span className={styles.brandDivider} aria-hidden="true">|</span><span className={styles.portalLabel}>IT Helpdesk</span></div>
        <div className={styles.headerActions}>{props.accountActions}</div>
      </header>
      <nav className={styles.navigation} aria-label="DeskPilot navigation">
        <div className={styles.dashboardSplit} data-active={dashboardActive}><DefaultButton text="Dashboard" split onClick={() => navigate('Dashboard')} splitButtonAriaLabel="Choose dashboard view" className={dashboardActive ? styles.activeNav : undefined} menuProps={{ items: [
          { key: 'assigned', text: 'My Assigned Tickets', canCheck: true, checked: page === 'My Assigned Tickets', onClick: () => navigate('My Assigned Tickets') },
          { key: 'personal', text: 'My Dashboard', canCheck: true, checked: page === 'My Dashboard', onClick: () => navigate('My Dashboard') },
          { key: 'global', text: 'Global Dashboard', canCheck: true, checked: page === 'Dashboard', onClick: () => navigate('Dashboard') }
        ] }} styles={{ root: { height: 'auto', minWidth: 0 }, label: { fontWeight: dashboardActive ? 600 : 400 }, splitButtonContainer: { height: '100%', border: 0, borderRadius: 2 }, splitButtonMenuButton: { width: 26, minWidth: 26, padding: 0, border: 0 }, splitButtonDivider: { display: 'none' } }} /></div>
        {pages.filter(item => item !== 'Dashboard').map(item => <button type="button" key={item} className={page === item ? styles.activeNav : undefined} aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{item}</button>)}
      </nav>
      <main className={styles.mainContent}>
        {dashboard.warnings.map(warning => <MessageBar key={warning} messageBarType={MessageBarType.warning}>{warning}</MessageBar>)}
        <h1 ref={heading} tabIndex={-1} className={styles.srOnly}>{page === 'Dashboard' ? 'Global Dashboard' : page}</h1>
        {(page === 'Dashboard' || (page === 'My Dashboard' && dashboard.assignmentIdentityAvailable)) && <DashboardPage {...dashboard} title={page === 'My Dashboard' ? 'My Dashboard' : 'Global Dashboard'} filteredTicketCount={dashboard.filteredTickets.length} />}
        {(page === 'Tickets' || (page === 'My Assigned Tickets' && dashboard.assignmentIdentityAvailable)) && <TicketListPage service={props.service} onBulkAction={props.service.updateTickets ? (ids, action) => props.service.updateTickets!(ids, action) : undefined} onCreate={props.service.createTicket ? input => props.service.createTicket!(input) : undefined} title={page} currentUserEmail={props.currentUserEmail} assignmentIdentityAvailable={dashboard.assignmentIdentityAvailable} tickets={dashboard.tickets} loading={dashboard.loading} error={dashboard.error} refresh={dashboard.refresh} />}
        {personal && !dashboard.assignmentIdentityAvailable && <section className={styles.pageContent}><div className={styles.pageHeading}><h2>{page}</h2></div><div className={styles.placeholder}><p>Your assignments cannot be shown until SharePoint person identities are available.</p></div></section>}
        {(page === 'FAQs' || page === 'Administration') && <section className={styles.pageContent}><div className={styles.pageHeading}><h2>{page}</h2></div><div className={styles.placeholder}><Icon iconName={page === 'FAQs' ? 'Help' : 'Settings'} /><p>{page === 'FAQs' ? 'Your organization’s support knowledge base will appear here.' : 'Application settings and workflow configuration will be added here.'}</p><p>This section is planned for a future release.</p></div></section>}
      </main>
    </ThemeProvider>
  );
}




