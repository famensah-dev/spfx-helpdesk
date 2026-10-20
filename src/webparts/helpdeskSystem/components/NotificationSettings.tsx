import * as React from 'react';
import { Checkbox, DefaultButton, Icon, IconButton, MessageBar, MessageBarType, PrimaryButton, Spinner, TextField, Toggle } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import { defaultNotificationSettings, notificationLabels, notificationTokens, validateNotificationSettings } from '../interfaces/INotifications';
import type { INotificationRule, INotificationSettings, INotificationLogEntry, NotificationEvent } from '../interfaces/INotifications';
import { cancelButtonStyles } from './cancelButtonStyles';
import styles from '../pages/SettingsPage.module.scss';
import { notificationFlowGuide } from '../utils/notificationFlowGuide';
const tabs = ['Notification Rules','Email Templates','Recipients','Sender Settings','Delivery & History'] as const;
type EmailTab = typeof tabs[number];
const eventIcons:Record<NotificationEvent,string> = {created:'PageAdd',assigned:'AddFriend',escalated:'DoubleChevronUp',resolved:'Completed',closed:'Lock',comment:'Comment'};
const eventDescriptions:Record<NotificationEvent,string> = {created:'Confirm receipt of a new support request.',assigned:'Let the assigned agent know a ticket needs attention.',escalated:'Alert the relevant people when an issue is escalated.',resolved:'Share the outcome when a ticket is resolved or completed.',closed:'Confirm that the ticket has been closed.',comment:'Email a response when a comment requests delivery.'};
export function NotificationSettings({service,appUrl}:{service:ITicketDataSource;appUrl:string}):React.ReactElement {
  const productionUrl = new URL(appUrl);for (const key of ['debugManifestsFile','debug','noredir']) productionUrl.searchParams.delete(key);productionUrl.hash='';
  appUrl=productionUrl.href;
  const [draft,setDraft] = React.useState<INotificationSettings>(defaultNotificationSettings(appUrl));
  const [original,setOriginal] = React.useState<INotificationSettings>();
  const [event,setEvent] = React.useState<NotificationEvent>('created');
  const [tab,setTab] = React.useState<EmailTab>('Notification Rules');
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
  React.useEffect(() => {if (tab === 'Delivery & History' && !log) readLog().catch(() => undefined);},[tab]);
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
  const disabled=busy || !original;
  const dirty=Boolean(original && JSON.stringify(draft) !== JSON.stringify(original));
  const recipients = (rule:INotificationRule):string => [rule.requester ? 'Requester' : '',rule.assignee ? 'Assigned agent' : '',rule.helpdesk ? 'Helpdesk' : ''].filter(Boolean).join(', ') || 'No recipients selected';
  const editEvent = (key:NotificationEvent):void => {setEvent(key);setTab('Email Templates');};
  return <section className={styles.notificationSettings} aria-label="Email settings">
    <header className={styles.emailHeader}><Icon iconName="Mail" /><div><h3>Email Settings</h3><p>Manage automated email notifications for ticket events.</p></div><span className={styles.emailBadge} data-state={draft.enabled ? 'enabled' : 'disabled'}>{draft.enabled ? 'Delivery enabled in settings' : 'Email delivery off'}</span></header>
    <nav className={styles.emailTabs} role="tablist" aria-label="Email settings sections">{tabs.map((name,index) => <button key={name} id={`email-tab-${index}`} type="button" role="tab" aria-selected={tab === name} aria-controls="email-settings-panel" tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={e => {
      const next=e.key === 'ArrowRight' ? (index+1)%tabs.length : e.key === 'ArrowLeft' ? (index+tabs.length-1)%tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : -1;
      if(next >= 0){e.preventDefault();setTab(tabs[next]);const buttons=e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');buttons?.[next].focus();}
    }}>{name}</button>)}</nav>
    <div className={styles.emailAlerts}>
      <MessageBar messageBarType={MessageBarType.info} actions={<DefaultButton text="Open Power Automate" styles={cancelButtonStyles} iconProps={{iconName:'OpenInNewWindow'}} href={draft.flowUrl.startsWith('https://make.powerautomate.com/') ? draft.flowUrl : 'https://make.powerautomate.com/'} target="_blank" rel="noopener noreferrer" />}>DeskPilot uses Power Automate to send emails. Configure notifications here, then connect your flows.</MessageBar>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error} <DefaultButton text="Reload settings" styles={cancelButtonStyles} disabled={busy} onClick={() => {load().catch(() => undefined);}} /></MessageBar>}
      {saved && <MessageBar messageBarType={MessageBarType.success}>Email settings saved.</MessageBar>}
    </div>
    {busy && <Spinner label="Updating email settings..." />}
    <div id="email-settings-panel" role="tabpanel" aria-labelledby={`email-tab-${tabs.indexOf(tab)}`} className={styles.emailPanel}>
      {tab === 'Notification Rules' && <>
        <div className={styles.emailSectionTitle}><div><h4>Notification Rules</h4><p>Choose which ticket events send email. Select an event to customize its message.</p></div></div>
        <div className={styles.emailRules}>{draft.rules.map(rule => <div className={styles.emailRule} key={rule.event}>
          <Icon iconName={eventIcons[rule.event]} className={styles.emailEventIcon} />
          <button type="button" className={styles.emailRuleText} onClick={() => editEvent(rule.event)}><strong>{notificationLabels[rule.event]}</strong><span>{eventDescriptions[rule.event]}</span><small>{recipients(rule)}</small></button>
          <Toggle ariaLabel={`Enable ${notificationLabels[rule.event]}`} checked={rule.enabled} disabled={disabled} onChange={(_,checked) => updateRule(rule.event,{enabled:Boolean(checked)})} />
          <IconButton styles={cancelButtonStyles} iconProps={{iconName:'ChevronRight'}} ariaLabel={`Edit ${notificationLabels[rule.event]}`} onClick={() => editEvent(rule.event)} />
        </div>)}</div>
        <p className={styles.emailHint}>Event switches apply when email delivery is enabled in Sender Settings.</p>
      </>}
      {tab === 'Email Templates' && <>
        <div className={styles.emailSectionTitle}><div><h4>Email Templates</h4><p>Customize the subject and message for each notification.</p></div></div>
        <div className={styles.emailTemplateLayout}>
          <nav className={styles.emailEventList} aria-label="Email template events">{draft.rules.map(rule => <button type="button" key={rule.event} aria-current={event === rule.event ? 'true' : undefined} onClick={() => setEvent(rule.event)}><Icon iconName={eventIcons[rule.event]} /><span><strong>{notificationLabels[rule.event]}</strong><small>{recipients(rule)}</small></span><Icon iconName="ChevronRight" /></button>)}</nav>
          <div className={styles.emailTemplateEditor}>
            <div className={styles.emailSectionTitle}><div><h4>{notificationLabels[event]}</h4><p>{eventDescriptions[event]}</p></div><span className={styles.emailBadge} data-state={selected.enabled ? 'enabled' : 'disabled'}>{selected.enabled ? 'Enabled' : 'Disabled'}</span></div>
            <TextField label="Email Subject" maxLength={255} value={selected.subject} disabled={disabled} onChange={(_,value) => updateRule(event,{subject:value || ''})} />
            <TextField label="Email Message" multiline rows={10} maxLength={8000} value={selected.body} disabled={disabled} onChange={(_,value) => updateRule(event,{body:value || ''})} />
            <div className={styles.emailPlaceholders}><span>Insert a field at the end of the message</span><div>{notificationTokens.map(token => <button type="button" key={token} disabled={disabled} aria-label={`Insert ${token}`} onClick={() => updateRule(event,{body:selected.body+'{{'+token+'}}'})}>{'{{'+token+'}}'}</button>)}</div></div>
            <DefaultButton text="Reset this template" styles={cancelButtonStyles} iconProps={{iconName:'Refresh'}} disabled={disabled} onClick={() => {const defaults=defaultNotificationSettings().rules.find(rule => rule.event === event)!;updateRule(event,{subject:defaults.subject,body:defaults.body});}} />
          </div>
        </div>
      </>}
      {tab === 'Recipients' && <>
        <div className={styles.emailSectionTitle}><div><h4>Recipients</h4><p>Choose who hears about each event and set the shared helpdesk recipients.</p></div></div>
        <div className={styles.emailCard}><h4>Helpdesk Recipients</h4><TextField label="Email addresses" value={draft.helpdeskEmails} disabled={disabled} placeholder="it-support@company.com; supervisor@company.com" description="Separate addresses with semicolons. You can also use your support distribution list address." onChange={(_,value) => change({helpdeskEmails:value || ''})} /></div>
        <div className={styles.emailTable}><table><thead><tr><th>Notification</th><th>Requester</th><th>Assigned Agent</th><th>Helpdesk</th></tr></thead><tbody>{draft.rules.map(rule => <tr key={rule.event}><td><span className={styles.emailTableEvent}><Icon iconName={eventIcons[rule.event]} />{notificationLabels[rule.event]}</span></td>{(['requester','assignee','helpdesk'] as const).map(key => <td key={key}><Checkbox ariaLabel={`${notificationLabels[rule.event]}: ${key}`} checked={rule[key]} disabled={disabled} onChange={(_,checked) => updateRule(rule.event,{[key]:Boolean(checked)})} /></td>)}</tr>)}</tbody></table></div>
        <p className={styles.emailHint}>Requester updates respect the ticket email preference. Comment emails also require “Email a copy to requester” when posting.</p>
      </>}
      {tab === 'Sender Settings' && <>
        <div className={styles.emailSectionTitle}><div><h4>Sender Settings</h4><p>Choose the support mailbox and control email delivery.</p></div></div>
        <div className={styles.emailCard}><div className={styles.form}>
          <TextField label="Support Mailbox" placeholder="support@company.com" value={draft.mailbox} disabled={disabled} description="Use the shared mailbox connected to your Power Automate flow." onChange={(_,value) => change({mailbox:(value || '').trim()})} />
          <TextField label="DeskPilot Page URL" value={draft.appUrl} disabled={disabled} description="The production page linked from notification emails." onChange={(_,value) => change({appUrl:(value || '').trim()})} />
        </div></div>
        <div className={styles.emailCard}><div className={styles.emailSectionTitle}><div><h4>Email Delivery</h4><p>Enable after the mailbox and flows have been configured and tested.</p></div><Toggle ariaLabel="Enable email delivery" checked={draft.enabled} onText="Enabled" offText="Disabled" disabled={disabled} onChange={(_,checked) => change({enabled:Boolean(checked)})} /></div><p className={styles.emailHint}>Saving a mailbox address does not connect it. Your flow connection needs permission to send from that mailbox.</p></div>
      </>}
      {tab === 'Delivery & History' && <>
        <div className={styles.emailSectionTitle}><div><h4>Delivery History</h4><p>The 20 most recent records reported by your notification flows.</p></div><IconButton styles={cancelButtonStyles} iconProps={{iconName:'Refresh'}} ariaLabel="Refresh delivery history" title="Refresh delivery history" disabled={logBusy} onClick={() => {readLog().catch(() => undefined);}} /></div>
        {logBusy && <Spinner label="Loading delivery history..." />}{logError && <MessageBar messageBarType={MessageBarType.error}>{logError}</MessageBar>}
        {log && (log.length ? <div className={styles.emailTable}><table><thead><tr><th>Date & Time</th><th>Ticket / Event</th><th>Recipient</th><th>Status</th><th /></tr></thead><tbody>{log.map(row => <tr key={row.Id}><td>{new Date(row.SentAt || row.Created).toLocaleString()}</td><td>#{row.TicketId}<small className={styles.emailHistoryEvent}>{notificationLabels[row.Event as NotificationEvent] || row.Event}</small></td><td>{row.Recipients}</td><td><span className={styles.emailBadge} data-state={row.DeliveryStatus.toLowerCase()}><Icon iconName={row.DeliveryStatus === 'Sent' ? 'CompletedSolid' : ['Failed','Review'].includes(row.DeliveryStatus) ? 'ErrorBadge' : 'Clock'} />{row.DeliveryStatus}</span></td><td>{row.LastError && <details><summary>View details</summary><p>{row.LastError}</p></details>}</td></tr>)}</tbody></table></div> : <div className={styles.emailEmpty}><Icon iconName="Mail" /><strong>No email activity yet</strong><p>Set up your Power Automate flows to start recording deliveries.</p></div>)}
        <p className={styles.emailHint}>Sent means the flow reported a successful send, not confirmed receipt. DeskPilot does not verify the flow connection.</p>
        <details className={styles.emailSetup}><summary><Icon iconName="Flow" /> Power Automate Setup</summary><div className={styles.form}>
          <TextField label="Notification Flow Link" value={draft.flowUrl} disabled={disabled} placeholder="https://make.powerautomate.com/environments/.../flows/.../details" description="Paste the flow management link, not a webhook URL, token or password." onChange={(_,value) => change({flowUrl:(value || '').trim()})} />
          <ol><li>Run Initialize workspace to add requester fields and the notification log.</li><li>Follow the setup guide to create the lifecycle, comment and delivery flows.</li><li>Connect the company support mailbox in Power Automate and test delivery.</li><li>Save the flow link here, then enable email delivery in Sender Settings.</li></ol>
          <div className={styles.emailDownloadActions}><DefaultButton text="Download setup guide" iconProps={{iconName:'TextDocument'}} onClick={downloadGuide} /><DefaultButton text="Download setup reference" iconProps={{iconName:'Download'}} disabled={busy} onClick={download} /></div>
        </div></details>
      </>}
    </div>
    <footer className={styles.emailFooter}><span>{dirty ? 'Unsaved changes' : 'Changes apply to all notification settings.'}</span><div><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={disabled || !dirty} onClick={() => {if(original) {setDraft(original);setError('');setSaved(false);}}} /><PrimaryButton text={busy ? 'Saving...' : 'Save changes'} disabled={disabled || !dirty} onClick={() => {save().catch(() => undefined);}} /></div></footer>
  </section>;
}