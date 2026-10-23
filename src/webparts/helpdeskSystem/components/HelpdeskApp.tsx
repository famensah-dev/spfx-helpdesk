import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { pagePaths, adminPaths, resolveAppRoute } from '../utils/appRoutes';
import { MissingWorkspaceNotice } from './WorkspaceSetupPanel';
import { AdministrationPage } from '../pages/AdministrationPage';
import { FaqPage } from '../pages/FaqPage';
import { SharePointRolesPage } from '../pages/SharePointRolesPage';
import * as React from 'react';
import { DefaultButton, Icon, ThemeProvider, createTheme, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import { DashboardPage } from '../pages/DashboardPage';
import { TicketListPage } from '../pages/TicketListPage';
import { TicketDetails } from './TicketDetails';
import styles from './HelpdeskSystem.module.scss';
import { useHelpdeskDashboard } from '../hooks/useHelpdeskDashboard';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { canUse } from '../services/appRoleRules';

export interface IHelpdeskAppProps { service: ITicketDataSource; currentUserEmail: string; accountActions?: React.ReactNode; portalTitle?: string; settingsContent?: React.ReactNode; }

const pages = ['Dashboard', 'Tickets', 'FAQs', 'Administration', 'Users & Roles'] as const;
type Page = typeof pages[number] | 'My Assigned Tickets' | 'My Dashboard';
const appTheme = createTheme({
  defaultFontStyle: { fontFamily: "'Segoe UI', sans-serif" },
  semanticColors: { infoBackground: '#deebff', infoIcon: '#2855b6', warningBackground: '#fff4d6', warningIcon: '#946200', successBackground: '#dff6dd', successIcon: '#107c10' },
  palette: { themePrimary: '#2855b6', themeDarkAlt: '#234a9c', themeDark: '#1b385c', themeLight: '#d5e2fb', themeLighter: '#eff4ff', white: '#ffffff', neutralPrimary: '#252939' },
  effects: { roundedCorner2: '2px', roundedCorner4: '2px' },
  components: {
    Dropdown: { styles: {
      title: { height: 34, lineHeight: '32px', border: '1px solid #d6e1ee', borderRadius: 4, background: '#fff', color: '#293d58', fontSize: 13, padding: '0 34px 0 11px', selectors: { ':hover': { borderColor: '#a9bfd9', background: '#fbfdff' } } },
      dropdown: { selectors: {
        ':focus::after': { border: '1px solid #8ba9cb', borderRadius: 4 },
        ':hover .ms-Dropdown-title, :focus .ms-Dropdown-title, :active .ms-Dropdown-title': { borderColor: '#a9bfd9' }
      } },
      caretDownWrapper: { height: 34, lineHeight: '34px', right: 11 },
      caretDown: { color: '#526e93', fontSize: 10 },
      callout: { borderRadius: 4, border: '1px solid #dce5f1', boxShadow: '0 8px 24px rgba(27,56,92,.12)', overflow: 'hidden' },
      dropdownItems: { padding: 4 },
      dropdownItem: { fontSize: 13, borderRadius: 3, color: '#293d58', selectors: { ':hover': { background: '#edf3fc' } } },
      dropdownItemSelected: { fontSize: 13, fontWeight: 600, background: '#e8effa', color: '#1b385c', borderRadius: 3, selectors: { ':hover': { background: '#dce7f7' } } }
    } },
    DatePicker: { styles: { root: { marginBottom: 0 }, icon: { color: '#415f88', background: '#edf3fc', borderLeft: '1px solid #e0e8f4', borderRadius: '0 5px 5px 0', width: 32, height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, bottom: 0, top: 0, right: 0, fontSize: 14 }, callout: { borderRadius: 4, border: '1px solid #dce5f1', boxShadow: '0 8px 24px rgba(27,56,92,.12)', overflow: 'hidden' } } },
    TextField: { styles: { fieldGroup: { borderColor: '#d6e1ee', borderRadius: 4 }, field: { fontSize: 13 }, subComponentStyles: { label: { root: { color: '#415575', fontWeight: 500 } } } } },
    Calendar: { styles: { root: { background: '#fff', borderRadius: 4 }, goTodayButton: { color: '#1b385c', fontWeight: 600 } } },
    PrimaryButton: { styles: { root: { background: '#1b385c', border: '1px solid #1b385c', borderRadius: 2, color: '#fff' }, rootHovered: { background: '#152d50', borderColor: '#152d50', color: '#fff' }, rootPressed: { background: '#101e32', color: '#fff' }, rootDisabled: { background: '#e7e9ef', borderColor: '#e7e9ef', color: '#9297a5' } } },
    DefaultButton: { styles: { root: { background: '#eaf0ff', border: '1px solid #cedaf2', borderRadius: 2, color: '#244a91' }, rootHovered: { background: '#dce7fc', borderColor: '#a8bee8', color: '#152d50' }, rootPressed: { background: '#adc5f0', color: '#152d50' }, rootDisabled: { background: '#f0f1f5', borderColor: '#e7e9ef', color: '#9297a5' } } },
    IconButton: { styles: { root: { background: '#eaf0ff', color: '#2855b6', borderRadius: 2 }, rootHovered: { background: '#dce7fc', color: '#1b385c' }, rootDisabled: { background: '#f0f1f5', color: '#9297a5' } } }
  }
});

export default function HelpdeskApp(props: IHelpdeskAppProps): React.ReactElement {
  const rules = props.service.roleRules;
  const administrationAllowed = rules ? props.service.supportUnits || props.service.access?.superAdmin || ['classifications', 'manageFaqs', 'sla'].some(action => rules.actions.includes(action as 'classifications' | 'manageFaqs' | 'sla')) : !props.service.access?.agent;
  const permittedPage = (value: Page): boolean => value === 'Users & Roles' ? Boolean(props.service.roleManagement) : value === 'Administration' ? Boolean(administrationAllowed) : value === 'FAQs' ? canUse(props.service, 'faqs') : value === 'Tickets' || value === 'My Assigned Tickets' ? canUse(props.service, 'tickets') : canUse(props.service, 'dashboard');
  const initialPage: Page = rules ? canUse(props.service, 'dashboard') ? 'Dashboard' : canUse(props.service, 'tickets') ? 'Tickets' : canUse(props.service, 'faqs') ? 'FAQs' : 'Administration' : props.service.access?.agent ? 'My Dashboard' : 'Dashboard';
  const location = useLocation();
  const routerNavigate = useNavigate();
  const route = resolveAppRoute(location.pathname);
  const page:Page = route.page;
  const allowed = route.workspace ? Boolean(props.service.access?.superAdmin) : route.ticketId ? canUse(props.service,'tickets') || canUse(props.service,'dashboard') : permittedPage(page);
  const personal = page === 'My Dashboard' || page === 'My Assigned Tickets';
  const dashboard = useHelpdeskDashboard(props.service, personal ? props.currentUserEmail : undefined);
  const dashboardActive = page === 'Dashboard' || page === 'My Dashboard' || page === 'My Assigned Tickets';
  const detailTicket = dashboard.tickets.find(ticket=>ticket.Id===route.ticketId);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const navigate = (next: Page): void => {
    if (permittedPage(next)) routerNavigate(pagePaths[next]);
  };
  const openTicket = (id:number):void => routerNavigate('/tickets/'+id,{state:{from:location.pathname+location.search}});
  const backPath = typeof location.state?.from === 'string' && location.state.from.startsWith('/') && !location.state.from.startsWith('//') && !resolveAppRoute(location.state.from.split('?')[0]).notFound ? location.state.from : '/tickets';
  const requestedView = new URLSearchParams(location.search).get('view') || (page==='My Assigned Tickets' ? 'My Assigned Tickets' : 'All Tickets');
  const ticketView = ['All Tickets','My Assigned Tickets','Created by Me','Archive'].includes(requestedView) ? requestedView : 'All Tickets';
  React.useEffect(()=>{window.requestAnimationFrame(()=>heading.current?.focus());},[location.pathname]);
  if(location.pathname==='/' || location.pathname==='')return <Navigate to={pagePaths[initialPage]} replace />;
  return (
    <ThemeProvider theme={appTheme} className={`${styles.helpdeskSystemShell}${!props.settingsContent && (page === 'Dashboard' || page === 'My Dashboard') && !route.ticketId ? ` ${styles.dashboardCanvas}` : ''}`}>
      <header className={styles.appHeader}>
        <div className={styles.brand}><Icon iconName="Headset" aria-hidden="true" /><strong>DeskPilot</strong><span className={styles.brandDivider} aria-hidden="true">|</span><span className={styles.portalLabel}>{props.portalTitle?.trim() || 'IT Helpdesk'}</span></div>
        <div className={styles.headerActions}>{props.accountActions}</div>
      </header>
      {!props.settingsContent && <nav className={styles.navigation} aria-label="DeskPilot navigation">
        {canUse(props.service, 'dashboard') && (rules ? <button type="button" aria-current={dashboardActive ? 'page' : undefined} className={[styles.dashboardNav, dashboardActive ? styles.activeNav : ''].join(' ')} onClick={() => navigate('Dashboard')}>Dashboard</button> : <div className={[styles.dashboardSplit, styles.dashboardNav].join(' ')} data-active={dashboardActive}><DefaultButton text="Dashboard" split onClick={() => navigate(props.service.access?.agent ? 'My Dashboard' : 'Dashboard')} splitButtonAriaLabel="Choose dashboard view" className={dashboardActive ? styles.activeNav : undefined} menuProps={{ items: [
          { key: 'personal', text: 'My Dashboard', canCheck: true, checked: page === 'My Dashboard', onClick: () => navigate('My Dashboard') },
          ...(!props.service.access?.agent ? [{ key: 'global', text: 'Admin Dashboard', canCheck: true, checked: page === 'Dashboard', onClick: () => navigate('Dashboard') }] : [])
        ] }} styles={{ root: { height: 'auto', minWidth: 0 }, label: { fontWeight: dashboardActive ? 600 : 400 }, splitButtonContainer: { height: '100%', border: 0, borderRadius: 2 }, splitButtonMenuButton: { width: 26, minWidth: 26, padding: 0, border: 0 }, splitButtonDivider: { display: 'none' } }} /></div>)}
        {pages.filter(item => item !== 'Dashboard' && permittedPage(item)).map(item => <button type="button" key={item} className={page === item ? styles.activeNav : undefined} aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{item==='Administration' ? 'Helpdesk Settings' : item==='FAQs' ? 'Knowledge Base' : item}</button>)}
      </nav>}
      <main className={`${styles.mainContent}${props.settingsContent ? ` ${styles.settingsMain}` : ''}`}>
        {props.settingsContent || <><MissingWorkspaceNotice service={props.service} error={dashboard.error} />
        {dashboard.warnings.map(warning => <MessageBar key={warning} messageBarType={MessageBarType.warning}>{warning}</MessageBar>)}
        <h1 ref={heading} tabIndex={-1} className={styles.srOnly}>{page === 'Dashboard' ? 'Admin Dashboard' : page}</h1>
        {route.notFound ? <MessageBar messageBarType={MessageBarType.error}>This DeskPilot page was not found. <DefaultButton text="Go to home" onClick={()=>routerNavigate(pagePaths[initialPage])} /></MessageBar> : !allowed ? <MessageBar messageBarType={MessageBarType.error}>You do not have permission to view this page.</MessageBar> : route.ticketId ? (dashboard.loading ? <Spinner label="Loading ticket..." /> : dashboard.error ? <MessageBar messageBarType={MessageBarType.error}>{dashboard.error}</MessageBar> : detailTicket ? <TicketDetails key={detailTicket.Id} ticket={detailTicket} tickets={dashboard.tickets} service={props.service} refresh={dashboard.refresh} backLabel={backPath.startsWith('/dashboard') || backPath.startsWith('/my-dashboard') ? 'Back to Dashboard' : 'Back to Tickets'} onBack={()=>routerNavigate(backPath)} /> : <MessageBar messageBarType={MessageBarType.error}>This ticket was not found or you do not have access to it. <DefaultButton text="Back to Tickets" onClick={()=>navigate('Tickets')} /></MessageBar>) : <>
        {(page === 'Dashboard' || (page === 'My Dashboard' && dashboard.assignmentIdentityAvailable)) && <DashboardPage {...dashboard} sla={props.service.sla} title={rules ? 'Dashboard' : page === 'My Dashboard' ? 'My Dashboard' : 'Admin Dashboard'} filteredTicketCount={dashboard.filteredTickets.length} onOpenTicket={openTicket} onViewTickets={canUse(props.service, 'tickets') ? () => navigate('Tickets') : undefined} />}
        {(page === 'Tickets' || (page === 'My Assigned Tickets' && dashboard.assignmentIdentityAvailable)) && (route.creating && !props.service.createTicket ? <MessageBar messageBarType={MessageBarType.error}>You do not have permission to create tickets.</MessageBar> : <TicketListPage service={props.service} onBulkAction={props.service.updateTickets ? (ids, action) => props.service.updateTickets!(ids, action) : undefined} onCreate={props.service.createTicket ? input => props.service.createTicket!(input) : undefined} title={page} currentUserEmail={props.currentUserEmail} assignmentIdentityAvailable={dashboard.assignmentIdentityAvailable} tickets={dashboard.tickets} loading={dashboard.loading} error={dashboard.error} refresh={dashboard.refresh} onOpenTicket={openTicket} creating={route.creating===true} onCreatingChange={value=>routerNavigate(value ? '/tickets/new' : '/tickets')} view={ticketView} onViewChange={view=>routerNavigate({pathname:location.pathname,search:view==='All Tickets' ? '' : '?view='+encodeURIComponent(view)})} />)}
        {personal && !dashboard.assignmentIdentityAvailable && <section className={styles.secondaryPage}><div className={styles.secondaryPageHeader}><h2>{page}</h2></div><div className={styles.ticketListCard}><div className={styles.placeholder}><p>Your assignments cannot be shown until SharePoint person identities are available.</p></div></div></section>}
        {page === 'FAQs' && <FaqPage service={props.service} />}
        {page === 'Administration' && administrationAllowed && <AdministrationPage service={props.service} section={route.adminSection || 'home'} onSectionChange={section=>routerNavigate('/settings'+(adminPaths[section] ? '/'+adminPaths[section] : ''))} onSettingsChanged={dashboard.refresh} onUsersAndRoles={()=>navigate('Users & Roles')} />}
        {page === 'Users & Roles' && props.service.roleManagement && <SharePointRolesPage service={props.service} />}
        </>}
        </>}
      </main>
    </ThemeProvider>
  );
}




