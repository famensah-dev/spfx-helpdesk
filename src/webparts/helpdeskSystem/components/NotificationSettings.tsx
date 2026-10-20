import * as React from 'react';
import { Checkbox, DefaultButton, Dropdown, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField, Toggle } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { defaultNotificationSettings, notificationLabels, notificationTokens, validateNotificationSettings } from '../interfaces/INotifications';
import type { INotificationRule, INotificationSettings, INotificationLogEntry, NotificationEvent } from '../interfaces/INotifications';
import { cancelButtonStyles } from './cancelButtonStyles';
import styles from '../pages/SettingsPage.module.scss';
import { notificationFlowGuide } from '../utils/notificationFlowGuide';
export function NotificationSettings({service,appUrl}:{service:ITicketDataSource;appUrl:string}):React.ReactElement {
  const productionUrl = new URL(appUrl);for (const key of ['debugManifestsFile','debug','noredir']) productionUrl.searchParams.delete(key);productionUrl.hash='';
  appUrl=productionUrl.href;
  const [draft,setDraft] = React.useState<INotificationSettings>(defaultNotificationSettings(appUrl));
  const [original,setOriginal] = React.useState<INotificationSettings>();
  const [event,setEvent] = React.useState<NotificationEvent>('created');
  const [busy,setBusy] = React.useState(true),[error,setError] = React.useState(''),[saved,setSaved] = React.useState(false);
  const lock = React.useRef(false);
  const [log,setLog] = React.useState<INotificationLogEntry[]>(),[logBusy,setLogBusy] = React.useState(false),[logError,setLogError] = React.useState('');
  const readLog = async ():Promise<void> => {
    if (logBusy || !service.notifications?.log) return;setLogBusy(true);setLogError('');
    try {setLog(await service.notifications.log());}catch(reason){setLogError(reason instanceof Error ? reason.message : 'Unable to load delivery log.');}finally{setLogBusy(false);}
  };
  const load = async ():Promise<void> => {
    if (lock.current) return;lock.current=true;setBusy(true);setError('');setSaved(false);
    try {if (!service.notifications) throw new Error('Notification settings are unavailable.');const value=await service.notifications.load();const initial={...value,appUrl:value.appUrl || appUrl};setDraft(initial);setOriginal(initial);}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to load notification settings.');}
    finally {lock.current=false;setBusy(false);}
  };
  React.useEffect(() => {void load();},[service.notifications]);
  const change = (value:Partial<INotificationSettings>):void => {setDraft(current => ({...current,...value}));setSaved(false);};
  const updateRule = (key:NotificationEvent,value:Partial<INotificationRule>):void => change({rules:draft.rules.map(rule => rule.event === key ? {...rule,...value} : rule)});
  const save = async ():Promise<void> => {
    if (lock.current || !service.notifications) return;
    setError('');setSaved(false);
    try {validateNotificationSettings(draft);}catch(reason){setError((reason as Error).message);return;}
    lock.current=true;setBusy(true);
    try {await service.notifications.save(draft);setOriginal(draft);setSaved(true);}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to save notification settings.');}
    finally {lock.current=false;setBusy(false);}
  };
  const download = ():void => {
    const setup={...draft,enabled:false,siteUrl:service.access?.siteUrl,ticketsListId:service.workspaceSettings?.listId,ticketsListName:service.workspaceSettings?.listName,commentsListId:service.workspaceSettings?.resourceIds?.comments,notificationLogListId:service.workspaceSettings?.resourceIds?.notificationLog,configurationList:'DeskPilot Access',configurationItemTitle:'Configuration',configurationField:'Rules',settingsProperty:'notifications',note:'Setup reference only. This JSON is not an importable Power Automate flow. Flows must read the live private configuration for every event.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(setup,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='deskpilot-notification-setup.json';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const selected=draft.rules.find(rule => rule.event === event)!;
  const downloadGuide = ():void => {
    const url=URL.createObjectURL(new Blob([notificationFlowGuide],{type:'text/markdown'}));const link=document.createElement('a');link.href=url;link.download='DeskPilot-Power-Automate-Setup.md';link.click();setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  return <div className={styles.notificationSettings}>
    <MessageBar messageBarType={MessageBarType.info}>Email is delivered by your Power Automate flows. Saving these settings does not create a flow or connect a mailbox.</MessageBar>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error} <DefaultButton text="Reload settings" styles={cancelButtonStyles} disabled={busy} onClick={() => {void load();}} /></MessageBar>}
    {saved && <MessageBar messageBarType={MessageBarType.success}>Notification settings saved. Your configured flows will use them for new events.</MessageBar>}
    {busy && <Spinner label="Please wait while we update notification settings..." />}
    <Toggle label="Email delivery" checked={draft.enabled} onText="Enabled in settings" offText="Disabled" disabled={busy || !original} onChange={(_,checked) => change({enabled:Boolean(checked)})} />
    <div className={styles.form}>
      <TextField label="Support mailbox" placeholder="support@company.com" value={draft.mailbox} disabled={busy || !original} description="The shared mailbox used by the flow's Outlook connection. That account needs permission to send from it." onChange={(_,value) => change({mailbox:(value || '').trim()})} />
      <TextField label="Helpdesk recipients" value={draft.helpdeskEmails} disabled={busy || !original} description="Separate addresses with semicolons. These receive notifications addressed to Helpdesk." onChange={(_,value) => change({helpdeskEmails:value || ''})} />
      <TextField label="DeskPilot page URL" value={draft.appUrl} disabled={busy || !original} onChange={(_,value) => change({appUrl:(value || '').trim()})} />
      <TextField label="Power Automate notification flow link" value={draft.flowUrl} disabled={busy || !original} placeholder="https://make.powerautomate.com/environments/.../flows/.../details" description="A management link for opening the flow. Do not paste a webhook URL, access token or password." onChange={(_,value) => change({flowUrl:(value || '').trim()})} />
    </div>
    <h4>Notification Events</h4><div style={{overflowX:'auto'}}><table><thead><tr><th>Event</th><th>Enabled</th><th>Requester</th><th>Assigned Agent</th><th>Helpdesk</th></tr></thead><tbody>{draft.rules.map(rule => <tr key={rule.event}><td>{notificationLabels[rule.event]}</td>{(['enabled','requester','assignee','helpdesk'] as const).map(key => <td key={key}><Checkbox ariaLabel={`${notificationLabels[rule.event]}: ${key}`} checked={rule[key]} disabled={busy || !original} onChange={(_,checked) => updateRule(rule.event,{[key]:Boolean(checked)})} /></td>)}</tr>)}</tbody></table></div>
    <p>Requester updates also respect the ticket's Email Requester Updates setting. Comment emails require Email a copy to requester when the comment is posted.</p>
    <h4>Email Templates</h4><div className={styles.form}><Dropdown label="Event" selectedKey={event} options={draft.rules.map(rule => ({key:rule.event,text:notificationLabels[rule.event]}))} onChange={(_,option) => setEvent(option?.key as NotificationEvent)} />
      <TextField label="Subject" maxLength={255} value={selected.subject} disabled={busy || !original} onChange={(_,value) => updateRule(event,{subject:value || ''})} />
      <TextField label="Message" multiline rows={6} maxLength={8000} value={selected.body} disabled={busy || !original} onChange={(_,value) => updateRule(event,{body:value || ''})} />
      <p>Available fields: {notificationTokens.map(token => '{{'+token+'}}').join(', ')}. Messages are plain text; the flow must escape content before sending HTML emails.</p>
    </div>
    <div className={styles.actions}><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy || !original} onClick={() => {if(original) {setDraft(original);setError('');setSaved(false);}}} /><PrimaryButton text="Save notification settings" disabled={busy || !original} onClick={() => {void save();}} /></div>
    <h4>Power Automate Setup</h4><ol><li>Run Initialize workspace to add requester fields, the notification log and version history.</li><li>Create the lifecycle, comment and delivery flows using the deployment guide. Use an approved company account with access to the private DeskPilot configuration and support mailbox.</li><li>Keep delivery disabled while configuring. Test each flow with a controlled test ticket and verify the notification log.</li><li>Add the notification flow management link, then enable email delivery.</li></ol>
    <div style={{display:'flex',flexWrap:'wrap',gap:8}}><DefaultButton text="Download flow setup guide" iconProps={{iconName:'TextDocument'}} onClick={downloadGuide} /><DefaultButton text="Download setup reference" iconProps={{iconName:'Download'}} disabled={busy} onClick={download} />{draft.flowUrl.startsWith('https://make.powerautomate.com/') && <DefaultButton text="Open notification flow" iconProps={{iconName:'OpenInNewWindow'}} href={draft.flowUrl} target="_blank" rel="noopener noreferrer" />}<DefaultButton text="Open Power Automate" styles={cancelButtonStyles} href="https://make.powerautomate.com/" target="_blank" rel="noopener noreferrer" /></div>
    <p>Flow connection and delivery status are not verified by DeskPilot. Forms and incoming email workflows remain in Power Automate.</p>
    <h4>Recent Delivery Log</h4><DefaultButton text={log ? 'Refresh delivery log' : 'View delivery log'} iconProps={{iconName:'History'}} disabled={logBusy} onClick={() => {void readLog();}} />
    {logBusy && <Spinner label="Loading delivery log..." />}{logError && <MessageBar messageBarType={MessageBarType.error}>{logError}</MessageBar>}
    {log && <><p>Statuses are recorded by your Power Automate flows. Sent means the send action reported success, not confirmed receipt.</p>{log.length ? <div style={{overflowX:'auto'}}><table><thead><tr><th>Ticket</th><th>Event</th><th>Recipient</th><th>Status</th><th>Details</th></tr></thead><tbody>{log.map(row => <tr key={row.Id}><td>#{row.TicketId}</td><td>{row.Event}</td><td>{row.Recipients}</td><td>{row.DeliveryStatus}</td><td>{row.LastError || (row.SentAt ? new Date(row.SentAt).toLocaleString() : new Date(row.Created).toLocaleString())}</td></tr>)}</tbody></table></div> : <p>No delivery records yet. Configure and test the flows before enabling notifications.</p>}</>}
  </div>;
}
