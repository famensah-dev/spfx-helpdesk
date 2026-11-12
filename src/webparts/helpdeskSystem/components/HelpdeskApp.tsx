import { NotificationCenter } from './NotificationCenter';
import { SelfServiceGuide } from './SelfServiceGuide';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { pagePaths, adminPaths, resolveAppRoute } from '../utils/appRoutes';
import { MissingWorkspaceNotice } from './WorkspaceSetupPanel';
import { AdministrationPage } from '../pages/AdministrationPage';
import { DocumentationPage } from '../pages/DocumentationPage';
import { FaqPage } from '../pages/FaqPage';

import * as React from 'react';
import { DefaultButton, Icon, IconButton, ThemeProvider, createTheme, mergeStyles, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import { useDeskPilotAppearance, DeskPilotAppearanceContext } from '../hooks/useDeskPilotAppearance';
import { darkenStyles } from '../utils/themeColors';
import { darkControlSelectors } from './darkControlStyles';
import { DashboardPage } from '../pages/DashboardPage';
import { TicketListPage } from '../pages/TicketListPage';
import { TicketDetails } from './TicketDetails';
import styles from './HelpdeskSystem.module.scss';
import { useHelpdeskDashboard } from '../hooks/useHelpdeskDashboard';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { canUse, canAccessSettings } from '../services/appRoleRules';

export interface IHelpdeskAppProps { service: ITicketDataSource; currentUserEmail: string; accountActions?: React.ReactNode; portalTitle?: string; settingsContent?: React.ReactNode; }

const pages = ['Dashboard', 'Tickets', 'FAQs', 'Administration', 'Users & Roles', 'Documentation'] as const;
type Page = typeof pages[number] | 'My Assigned Tickets' | 'My Dashboard';
const appTheme = createTheme({
  defaultFontStyle: { fontFamily: "'Segoe UI', sans-serif" },
  semanticColors: { infoBackground: '#deebff', infoIcon: '#2855b6', warningBackground: '#fff4d6', warningIcon: '#946200', successBackground: '#dff6dd', successIcon: '#107c10' },
  palette: { themePrimary: '#2855b6', themeDarkAlt: '#234a9c', themeDark: '#1b385c', themeLight: '#d5e2fb', themeLighter: '#eff4ff', white: '#ffffff', neutralPrimary: '#252939' },
  effects: { roundedCorner2: '2px', roundedCorner4: '2px' },
  components: {
    Checkbox: { styles: { root: { selectors: { '&.is-checked .ms-Checkbox-checkmark': { color: '#ffffff !important', fontWeight: 700 } } } } },
    Dialog: { styles: { main: { selectors: { '@media (max-width: 767px)': {
      width: 'calc(100vw - 24px) !important', minWidth: '0 !important', maxWidth: 'calc(100vw - 24px) !important',
      maxHeight: 'calc(100dvh - 24px)', margin: 12
    } } } } },
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
    TextField: { styles: { fieldGroup: { borderColor: '#d6e1ee', borderRadius: 4 }, field: { fontSize: 13, selectors: { '@media (max-width: 767px)': { fontSize: 16 } } }, subComponentStyles: { label: { root: { color: '#415575', fontWeight: 500 } } } } },
    Calendar: { styles: { root: { background: '#fff', borderRadius: 4 }, goTodayButton: { color: '#1b385c', fontWeight: 600 } } },
    PrimaryButton: { styles: { root: { background: '#1b385c', border: '1px solid #1b385c', borderRadius: 2, color: '#fff' }, rootHovered: { background: '#152d50', borderColor: '#152d50', color: '#fff' }, rootPressed: { background: '#101e32', color: '#fff' }, rootDisabled: { background: '#e7e9ef', borderColor: '#e7e9ef', color: '#9297a5' } } },
    DefaultButton: { styles: { root: { background: '#eaf0ff', border: '1px solid #cedaf2', borderRadius: 2, color: '#244a91' }, rootHovered: { background: '#dce7fc', borderColor: '#a8bee8', color: '#152d50' }, rootPressed: { background: '#adc5f0', color: '#152d50' }, rootDisabled: { background: '#f0f1f5', borderColor: '#e7e9ef', color: '#9297a5' } } },
    IconButton: { styles: { root: { background: '#eaf0ff', color: '#2855b6', borderRadius: 2 }, rootHovered: { background: '#dce7fc', color: '#1b385c' }, rootDisabled: { background: '#f0f1f5', color: '#9297a5' } } }
  }
});

const darkControlsClass = mergeStyles({selectors:darkControlSelectors});
const darkAppTheme = createTheme({
  isInverted: true,
  defaultFontStyle: { fontFamily: "'Segoe UI', sans-serif" },
  effects: appTheme.effects,
  palette: { themePrimary:'#79aaff', themeDarkAlt:'#8ab5ff', themeDark:'#a2c4ff', themeDarker:'#c4daff', themeSecondary:'#6da0f5', themeTertiary:'#4477c7', themeLight:'#294a76', themeLighter:'#1f354f', themeLighterAlt:'#172739', white:'#1a2c43', black:'#ffffff', neutralLighterAlt:'#132238', neutralLighter:'#1e3048', neutralLight:'#263a53', neutralQuaternaryAlt:'#30465f', neutralQuaternary:'#405872', neutralTertiaryAlt:'#69727f', neutralTertiary:'#a7afb9', neutralSecondary:'#c3c9d1', neutralPrimaryAlt:'#e0e3e8', neutralPrimary:'#f1f3f5', neutralDark:'#f7f8fa' },
  semanticColors: { bodyBackground:'#132238', bodyText:'#f1f3f5', inputBackground:'#1a2c43', inputText:'#f1f3f5', inputBorder:'#405872', infoBackground:'#1c3551', infoIcon:'#91baff', warningBackground:'#3c311a', warningIcon:'#f6c75f', successBackground:'#143c32', successIcon:'#79d8b0', errorBackground:'#482832', errorIcon:'#ff9faf' },
  components: {
    ...darkenStyles(appTheme.components) as typeof appTheme.components,
    PersonaCoin: { styles: { initials: { color: '#ffffff !important' } } },
    Layer: { styles: { root: { selectors: darkControlSelectors } } }
  }
});

export default function HelpdeskApp(props: IHelpdeskAppProps): React.ReactElement {
  const appearance = useDeskPilotAppearance();
  const rules = props.service.roleRules;
  const administrationAllowed = canAccessSettings(props.service) && (rules ? props.service.supportUnits || props.service.access?.superAdmin || ['classifications', 'manageFaqs', 'sla'].some(action => rules.actions.includes(action as 'classifications' | 'manageFaqs' | 'sla')) : !props.service.access?.agent);
  const permittedPage = (value: Page): boolean => value === 'Documentation' ? Boolean(props.service.access?.superAdmin) : value === 'Users & Roles' ? canAccessSettings(props.service,'roles') && Boolean(props.service.roleManagement) : value === 'Administration' ? Boolean(administrationAllowed) : value === 'FAQs' ? canUse(props.service, 'faqs') : value === 'Tickets' || value === 'My Assigned Tickets' ? canUse(props.service, 'tickets') : canUse(props.service, 'dashboard');
  const initialPage: Page = rules ? canUse(props.service, 'dashboard') ? 'Dashboard' : canUse(props.service, 'tickets') ? 'Tickets' : canUse(props.service, 'faqs') ? 'FAQs' : 'Administration' : props.service.access?.agent ? 'My Dashboard' : 'Dashboard';
  const location = useLocation();
  const routerNavigate = useNavigate();
  const route = resolveAppRoute(location.pathname);
  const page:Page = route.page;
  const allowed = route.creating ? canUse(props.service,'create') : route.workspace ? Boolean(props.service.access?.superAdmin) : route.ticketId ? canUse(props.service,'tickets') || canUse(props.service,'dashboard') : permittedPage(page);
  const personal = page === 'My Dashboard' || page === 'My Assigned Tickets';
  const dashboard = useHelpdeskDashboard(props.service, personal ? props.currentUserEmail : undefined, !route.creating && !route.ticketId && ['Dashboard','My Dashboard','Tickets','My Assigned Tickets'].includes(page) && permittedPage(page));
  const dashboardActive = page === 'Dashboard' || page === 'My Dashboard' || page === 'My Assigned Tickets';
  const detailTicket = dashboard.tickets.find(ticket=>ticket.Id===route.ticketId);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const navigationRef=React.useRef<HTMLElement>(null);
  React.useEffect(()=>{
    const revealActive=():void=>{
      const nav=navigationRef.current;
      if(!nav || window.innerWidth>700)return;
      const active=nav.querySelector<HTMLElement>('[aria-current="page"], [data-active="true"]');
      if(!active)return;
      const bounds=nav.getBoundingClientRect(),tab=active.getBoundingClientRect();
      const inset=Math.min(70, bounds.width * 0.18);
      if(tab.left<bounds.left+inset)nav.scrollLeft-=bounds.left+inset-tab.left;
      else if(tab.right>bounds.right-inset)nav.scrollLeft+=tab.right-bounds.right+inset;
    };
    const frame=window.requestAnimationFrame(revealActive);
    window.addEventListener('resize',revealActive);
    return()=>{window.cancelAnimationFrame(frame);window.removeEventListener('resize',revealActive);};
  },[location.pathname,props.settingsContent]);

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
    <DeskPilotAppearanceContext.Provider value={appearance.dark}>
    <ThemeProvider theme={appearance.dark ? darkAppTheme : appTheme} style={{colorScheme:appearance.dark ? 'dark' : 'light'}} className={`${styles.helpdeskSystemShell}${appearance.dark ? ' ' + darkControlsClass : ''}${!props.settingsContent && route.ticketId ? ` ${styles.ticketDetailsCanvas}` : ''}${!props.settingsContent && (page === 'Dashboard' || page === 'My Dashboard' || page === 'Administration') && !route.ticketId ? ` ${styles.dashboardCanvas}` : ''}`}>
      {dashboard.newTicketNotice>0 && <div key={dashboard.newTicketNotice} className={styles.newTicketToast} role="status"><Icon iconName="Ticket" aria-hidden="true" />New ticket created</div>}
      <header className={styles.appHeader}>
        <div className={styles.brand}><Icon iconName="Headset" aria-hidden="true" /><strong>DeskPilot</strong><span className={styles.brandDivider} aria-hidden="true">|</span><span className={styles.portalLabel}>{props.portalTitle?.trim() || 'IT Helpdesk'}</span></div>
        <div className={styles.headerActions}><IconButton onRenderIcon={() => appearance.dark ? <Icon iconName="Sunny" /> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M19.8 15.1A8 8 0 0 1 8.9 4.2 8 8 0 1 0 19.8 15.1Z" fill="currentColor" fillOpacity=".18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>} ariaLabel={appearance.dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} title={appearance.dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'} toggle checked={appearance.dark} onClick={appearance.toggle} styles={{root:{background:'transparent',color:"var(--dp-fg-ffffff, #ffffff)",width:34,height:34},rootHovered:{background:'rgba(255,255,255,.12)',color:"var(--dp-fg-ffffff, #ffffff)"},rootChecked:{background:'transparent',color:"var(--dp-fg-ffffff, #ffffff)"},rootCheckedHovered:{background:'rgba(255,255,255,.12)',color:"var(--dp-fg-ffffff, #ffffff)"},icon:{fontSize:17}}} />{canUse(props.service,'tickets') && <><span className={styles.headerActionDivider} aria-hidden={true} /><NotificationCenter service={props.service} onOpenTicket={id=>routerNavigate('/tickets/'+id)} /></>}{props.accountActions}</div>
      </header>
      {!props.settingsContent && <nav ref={navigationRef} className={styles.navigation} aria-label="DeskPilot navigation">
        {canUse(props.service, 'dashboard') && (rules ? <button type="button" aria-current={dashboardActive ? 'page' : undefined} className={[styles.dashboardNav, dashboardActive ? styles.activeNav : ''].join(' ')} onClick={() => navigate('Dashboard')}>Dashboard</button> : <div className={[styles.dashboardSplit, styles.dashboardNav].join(' ')} data-active={dashboardActive}><DefaultButton text="Dashboard" split onClick={() => navigate(props.service.access?.agent ? 'My Dashboard' : 'Dashboard')} splitButtonAriaLabel="Choose dashboard view" className={dashboardActive ? styles.activeNav : undefined} menuProps={{ items: [
          { key: 'personal', text: 'My Dashboard', canCheck: true, checked: page === 'My Dashboard', onClick: () => navigate('My Dashboard') },
          ...(!props.service.access?.agent ? [{ key: 'global', text: 'Admin Dashboard', canCheck: true, checked: page === 'Dashboard', onClick: () => navigate('Dashboard') }] : [])
        ] }} styles={{ root: { height: 'auto', minWidth: 0 }, label: { fontWeight: dashboardActive ? 600 : 400 }, splitButtonContainer: { height: '100%', border: 0, borderRadius: 2 }, splitButtonMenuButton: { width: 26, minWidth: 26, padding: 0, border: 0 }, splitButtonDivider: { display: 'none' } }} /></div>)}
        {!canUse(props.service,'tickets') && canUse(props.service,'create') && <button type="button" aria-current={route.creating ? 'page' : undefined} className={route.creating ? styles.activeNav : undefined} onClick={()=>routerNavigate('/tickets/new')}>Create Ticket</button>}
        {pages.filter(item => item !== 'Dashboard' && item !== 'Users & Roles' && permittedPage(item)).map(item => <button type="button" key={item} className={page === item ? styles.activeNav : undefined} aria-current={page === item ? 'page' : undefined} onClick={() => navigate(item)}>{item==='Documentation' ? 'User Guide' : item==='Administration' ? 'Settings' : item==='FAQs' ? 'Knowledge Base' : item}</button>)}
      </nav>}
      <main className={`${styles.mainContent}${props.settingsContent ? ` ${styles.settingsMain}` : ''}`}>
        {props.settingsContent || <><MissingWorkspaceNotice service={props.service} error={dashboard.error} />
        {dashboard.warnings.map(warning => <MessageBar key={warning} messageBarType={MessageBarType.warning}>{warning}</MessageBar>)}
        <h1 ref={heading} tabIndex={-1} className={styles.srOnly}>{page === 'Documentation' ? 'User Guide' : page === 'Dashboard' ? 'Admin Dashboard' : page}</h1>
        {route.notFound ? <MessageBar messageBarType={MessageBarType.error}>This DeskPilot page was not found. <DefaultButton text="Go to Home" onClick={()=>routerNavigate(pagePaths[initialPage])} /></MessageBar> : !allowed ? <MessageBar messageBarType={MessageBarType.error}>You do not have permission to view this page.</MessageBar> : route.ticketId ? (dashboard.loading ? <Spinner label="Loading ticket..." /> : dashboard.error ? <MessageBar messageBarType={MessageBarType.error}>{dashboard.error}</MessageBar> : detailTicket ? <TicketDetails key={detailTicket.Id} ticket={detailTicket} tickets={dashboard.tickets} service={props.service} refresh={dashboard.refresh} backLabel={backPath.startsWith('/dashboard') || backPath.startsWith('/my-dashboard') ? 'Back to Dashboard' : 'Back to Tickets'} onBack={()=>routerNavigate(backPath)} /> : <MessageBar messageBarType={MessageBarType.error}>This ticket was not found or you do not have access to it. <DefaultButton text="Back to Tickets" onClick={()=>navigate('Tickets')} /></MessageBar>) : <>
        {(page === 'Dashboard' || (page === 'My Dashboard' && dashboard.assignmentIdentityAvailable)) && <DashboardPage {...dashboard} sla={props.service.sla} title={rules ? 'Dashboard' : page === 'My Dashboard' ? 'My Dashboard' : 'Admin Dashboard'} filteredTicketCount={dashboard.filteredTickets.length} onOpenTicket={openTicket} onViewTickets={canUse(props.service, 'tickets') ? () => navigate('Tickets') : undefined} />}
        {(page === 'Tickets' || (page === 'My Assigned Tickets' && dashboard.assignmentIdentityAvailable)) && (route.creating && !props.service.createTicket ? <MessageBar messageBarType={MessageBarType.error}>You do not have permission to create tickets.</MessageBar> : <TicketListPage service={props.service} onBulkAction={props.service.updateTickets ? (ids, action) => props.service.updateTickets!(ids, action) : undefined} onCreate={props.service.createTicket ? input => props.service.createTicket!(input) : undefined} title={page} currentUserEmail={props.currentUserEmail} assignmentIdentityAvailable={dashboard.assignmentIdentityAvailable} tickets={dashboard.tickets} loading={dashboard.loading} error={dashboard.error} refresh={dashboard.refresh} onOpenTicket={openTicket} creating={route.creating===true} onCreatingChange={value=>routerNavigate(value ? '/tickets/new' : canUse(props.service,'tickets') ? '/tickets' : pagePaths[initialPage])} view={ticketView} onViewChange={view=>routerNavigate({pathname:location.pathname,search:view==='All Tickets' ? '' : '?view='+encodeURIComponent(view)})} />)}
        {personal && !dashboard.assignmentIdentityAvailable && <section className={styles.secondaryPage}><div className={styles.secondaryPageHeader}><h2>{page}</h2></div><div className={styles.ticketListCard}><div className={styles.placeholder}><p>Your assignments cannot be shown until SharePoint person identities are available.</p></div></div></section>}
        {page === 'FAQs' && <FaqPage service={props.service} />}
        {page === 'Documentation' && <DocumentationPage />}
        {page === 'Administration' && administrationAllowed && <AdministrationPage service={props.service} section={route.adminSection || 'home'} onSectionChange={section=>routerNavigate('/settings'+(adminPaths[section] ? '/'+adminPaths[section] : ''))} onSettingsChanged={dashboard.refresh} onUsersAndRoles={()=>navigate('Users & Roles')} />}
        {page === 'Users & Roles' && props.service.roleManagement && <Navigate to="/settings/users-and-roles" replace />}
        </>}
        </>}
      </main>
      {!props.settingsContent && !route.creating && canUse(props.service, 'faqs') && <SelfServiceGuide service={props.service} canCreate={canUse(props.service, 'create') && Boolean(props.service.createTicket)} onCreate={draft => routerNavigate('/tickets/new', { state: { selfServiceDraft: draft } })} />}
    </ThemeProvider>
    </DeskPilotAppearanceContext.Provider>
  );
}




