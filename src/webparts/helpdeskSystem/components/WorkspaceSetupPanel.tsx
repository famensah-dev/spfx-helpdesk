import * as React from 'react';
import { DefaultButton, PrimaryButton, Dialog, DialogFooter, Spinner, MessageBar, MessageBarType } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { ISetupPlan } from '../interfaces/IWorkspaceSetup';
import { cancelButtonStyles } from './cancelButtonStyles';
export function WorkspaceSetupPanel(props: {service: ITicketDataSource}): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  const [plan, setPlan] = React.useState<ISetupPlan>();
  const [busy, setBusy] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [messages, setMessages] = React.useState<string[]>([]);
  const [error, setError] = React.useState('');
  const lock = React.useRef(false);
  if (!props.service.access?.superAdmin || !props.service.workspaceSetup) return null;
  const inspect = async (): Promise<void> => {
    if (lock.current) return;
    lock.current = true; setOpen(true); setBusy(true); setError(''); setPlan(undefined); setDone(false); setMessages([]);
    try {setPlan(await props.service.workspaceSetup!.inspect());} catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to inspect workspace.');}
    finally {lock.current = false; setBusy(false);}
  };
  const run = async (): Promise<void> => {
    if (lock.current || !plan || plan.steps.some(step => step.blocked)) return;
    lock.current = true; setBusy(true); setRunning(true); setError(''); setMessages([]);
    try {await props.service.workspaceSetup!.run(message => setMessages(current => [...current,message])); setDone(true);}
    catch (reason) {setError(`${reason instanceof Error ? reason.message : 'Setup failed.'} Completed changes are retained. Review again to retry the remaining steps.`); setPlan(undefined);}
    finally {lock.current = false; setBusy(false); setRunning(false);}
  };
  return <div style={{margin: '12px 0 20px'}}><PrimaryButton text="Initialize workspace" styles={{root: {background: '#1b385c', borderColor: '#1b385c', height: 32, fontSize: 13}, rootHovered: {background: '#142c49', borderColor: '#142c49'}, rootPressed: {background: '#102339', borderColor: '#102339'}}} iconProps={{iconName:'Database'}} onClick={() => {inspect().catch(() => undefined);}} /><p style={{fontSize:13,color:'#647694'}}>Create missing DeskPilot lists and columns, or check an existing workspace.</p>
    <Dialog hidden={!open} onDismiss={busy ? undefined : () => setOpen(false)} minWidth={320} maxWidth={760} modalProps={{isBlocking:busy, styles:{main:{width:'min(760px, calc(100vw - 32px))',maxWidth:760,borderRadius:6}}}} dialogContentProps={{title:done ? 'Workspace ready' : running ? 'Initializing workspace' : 'Review workspace setup',showCloseButton:!busy}}>
      {busy && <Spinner label={running ? 'Creating and configuring SharePoint resources...' : 'Checking lists, columns and lookup relationships...'} styles={{label:{fontSize:14,color:'#172536'}}} />}
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      {plan && !running && !done && <><p>Existing records and column types are preserved. Missing columns and supported choices will be added. No Forms or flows are created.</p><div style={{maxHeight:'45vh',overflow:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left'}}>Resource</th><th style={{textAlign:'left'}}>Planned action</th></tr></thead><tbody>{plan.steps.map((step,index) => <tr key={index} style={{color:step.blocked ? '#b42318' : '#172536'}}><td style={{padding:8,borderBottom:'1px solid #e3e9f1'}}>{step.resource}</td><td style={{padding:8,borderBottom:'1px solid #e3e9f1'}}>{step.blocked ? 'Needs review: ' : ''}{step.action}</td></tr>)}</tbody></table></div></>}
      {messages.length > 0 && <ol role="log" aria-live="polite" style={{maxHeight:'35vh',overflow:'auto',fontSize:13}}>{messages.map((message,index) => <li key={index}>{message}</li>)}</ol>}
      <DialogFooter>{!busy && <DefaultButton text={done ? 'Close' : 'Cancel'} styles={cancelButtonStyles} onClick={() => setOpen(false)} />}{done ? <PrimaryButton text="Reload DeskPilot" onClick={() => window.location.reload()} /> : plan ? <PrimaryButton text="Confirm initialize" disabled={busy || plan.steps.some(step => step.blocked)} onClick={() => {run().catch(() => undefined);}} /> : !busy && <PrimaryButton text="Review again" onClick={() => {inspect().catch(() => undefined);}} />}</DialogFooter>
    </Dialog>
  </div>;
}
export function MissingWorkspaceNotice(props: {service?: ITicketDataSource; error?: string | null}): React.ReactElement | null {
  if (!props.service?.workspaceSetup || !props.service.access?.superAdmin || !props.error || !/list.*(not found|not available|unavailable|requires)|needs.*column/i.test(props.error)) return null;
  return <MessageBar messageBarType={MessageBarType.warning}>This workspace may need setup. <DefaultButton text="Open workspace setup" styles={cancelButtonStyles} onClick={props.service.openWorkspaceSetup} /></MessageBar>;
}
