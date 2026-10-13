import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Icon } from '@fluentui/react/lib/Icon';
import { initializeIcons } from '@fluentui/react/lib/Icons';

import { readConfig } from './config';
import { MicrosoftAuth } from './auth/MicrosoftAuth';
import { GraphClient } from './services/GraphClient';
import { GraphTicketService } from './services/GraphTicketService';
import './standalone.css';
import { AccountMenu } from './AccountMenu';

initializeIcons();
const root = document.getElementById('root');
function Landing(props: { title: string; children: React.ReactNode }): React.ReactElement {
  return <main className="landing"><section aria-labelledby="auth-title"><div className="auth-brand"><span className="auth-icon" aria-hidden="true"><Icon iconName="Headset" /></span><span>DeskPilot</span></div><h1 id="auth-title">{props.title}</h1>{props.children}</section></main>;
}
function Failure(props: { error: unknown; auth?: MicrosoftAuth }): React.ReactElement {
  const details = props.error instanceof Error ? props.error.message : 'Unable to start DeskPilot.';
  const timedOut = /timeout|timed.out|time.out/i.test(details);
  return <Landing title={props.auth ? 'We couldn’t sign you in' : 'DeskPilot needs your attention'}><p role="alert">{timedOut ? 'Your sign-in request took too long to complete. This can happen due to a slow connection or a temporary issue with Microsoft 365.' : 'We couldn’t connect to your support workspace. Please try again. If the problem continues, contact your support team.'}</p><div className="auth-actions"><button onClick={() => window.location.reload()}>Try again</button>{props.auth && <button className="secondary" onClick={() => { props.auth?.signOut().catch(error => renderFailure(error, props.auth)); }}>Sign out</button>}</div><details className="auth-details"><summary>Technical details</summary><p>{details}</p></details></Landing>;
}
function renderFailure(error: unknown, auth?: MicrosoftAuth): void { ReactDOM.render(<Failure error={error} auth={auth} />, root); }
async function start(): Promise<void> {
  ReactDOM.render(<Landing title="Connecting to Microsoft 365"><p role="status">Please wait while we connect to your support workspace.</p></Landing>, root);
  const config = readConfig();
  const auth = new MicrosoftAuth(config);
  try {
    const account = await auth.initialize();
    if (!account) {
      ReactDOM.render(<Landing title="Your support workspace"><p>Sign in with your organization's Microsoft 365 account to access tickets and your support dashboard.</p><button onClick={() => { auth.signIn().catch(error => renderFailure(error, auth)); }}>Sign in with Microsoft 365</button></Landing>, root);
      return;
    }
    const graph = new GraphClient(() => auth.getToken());
    const profile = await graph.get<{ displayName: string; mail: string | null; userPrincipalName: string }>('/me?$select=displayName,mail,userPrincipalName');
    const service = new GraphTicketService(graph, config);
    const { default: HelpdeskApp } = await import('../../src/webparts/helpdeskSystem/components/HelpdeskApp');
    const actions = <AccountMenu displayName={profile.displayName} email={profile.mail || profile.userPrincipalName} auth={auth} onError={error => renderFailure(error, auth)} />;
    ReactDOM.render(<HelpdeskApp service={service} currentUserEmail={profile.mail || profile.userPrincipalName} accountActions={actions} />, root);
  } catch (error) { renderFailure(error, auth); }
}
start().catch(error => renderFailure(error));
