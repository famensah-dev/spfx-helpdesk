import * as React from 'react';
import { DefaultButton, PrimaryButton, IconButton, SearchBox, Dropdown, Dialog, DialogType, TextField, Toggle, Spinner, SpinnerSize, MessageBar, MessageBarType } from '@fluentui/react';
import type { ISlaService, ISlaSettings, ISlaPriority } from '../interfaces/ISla';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';
export function SlaPrioritiesPage(props: {service?: ISlaService; onChanged?: () => Promise<void>}): React.ReactElement {
  const [settings, setSettings] = React.useState<ISlaSettings | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [settingUp, setSettingUp] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [draft, setDraft] = React.useState<ISlaPriority | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<'setup' | 'save' | null>(null);
  const lock = React.useRef(false);
  const load = React.useCallback(async () => {
    setLoading(true); setError('');
    try { if (!props.service) throw new Error('SLA administration is not configured.'); setSettings(await props.service.getSettings(true)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load priorities.'); setSettings(null); }
    finally { setLoading(false); }
  }, [props.service]);
  React.useEffect(() => { void load(); }, [load]);
  const save = async (): Promise<void> => {
    if (lock.current || !props.service || !confirm) return;
    lock.current = true; setBusy(true); setError('');
    const operation = confirm; setConfirm(null);
    setSettingUp(operation === 'setup');
    try {
      if (operation === 'setup') await props.service.setup();
      else if (draft) await props.service.savePriority(draft);
      setDraft(null); if (props.onChanged) await props.onChanged(); setMessage(operation === 'setup' ? 'SLA setup complete. Review and adjust the initial targets below.' : 'Priority and SLA targets saved.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save SLA settings.'); }
    finally { lock.current = false; setBusy(false); setSettingUp(false); }
  };
  const rows = (settings?.priorities || []).filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (status === 'all' || item.active === (status === 'active')));
  return <>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
    <div className={styles.ticketListCard}>
      {loading ? <Spinner label="Loading SLA & Priorities…" /> : settings && <>
        <div className={styles.ticketToolbar}><div className={styles.ticketControls}><SearchBox showIcon placeholder="Search priorities" value={query} onChange={(_, text) => setQuery(text || '')} /><Dropdown ariaLabel="Priority status" selectedKey={status} options={[{key: 'all', text: 'All statuses'}, {key: 'active', text: 'SLA enabled'}, {key: 'inactive', text: 'SLA disabled'}]} onChange={(_, option) => setStatus(String(option?.key || 'all'))} /><IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh priorities" disabled={busy} onClick={() => { void load(); }} /></div><div className={styles.ticketActions}>{settings.configured && settings.trackingReady && <button type="button" className={styles.adminAvailabilityLink} disabled={busy} onClick={() => setConfirm('setup')}>Sync priorities</button>}{settings.listUrl && <a className={styles.adminSharePointLink} href={settings.listUrl} target="_blank" rel="noopener noreferrer">View in SharePoint</a>}<DefaultButton text="New" iconProps={{iconName: 'Add'}} disabled={busy || !settings.configured || !settings.trackingReady} onClick={() => {setEditing(false); setDraft({name: '', active: true, responseMinutes: 240, resolutionMinutes: 1440}); setError('');}} /></div></div>
        <p className={styles.adminHint}>Targets count elapsed time, 24 hours a day, including weekends and time on hold. Changes apply to dashboard calculations for existing tickets too.</p>
        {(!settings.configured || !settings.trackingReady) && <MessageBar messageBarType={MessageBarType.warning}>Set up the Ticket Priorities list and response/resolution timestamp columns before configuring SLA targets. <button type="button" className={styles.adminAvailabilityLink} style={{textDecoration: 'underline'}} disabled={busy} onClick={() => setConfirm('setup')}>Set up SLA tracking</button></MessageBar>}
        <div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th>Priority</th><th>Expected response</th><th>Expected resolution</th><th>SLA tracking</th><th>Actions</th></tr></thead><tbody>{rows.map(item => <tr key={item.id || item.name}><td>{item.name}</td><td>{item.responseMinutes ? `${item.responseMinutes} min (${(item.responseMinutes / 60).toFixed(1)} hrs)` : 'Not configured'}</td><td>{item.resolutionMinutes ? `${item.resolutionMinutes} min (${(item.resolutionMinutes / 60).toFixed(1)} hrs)` : 'Not configured'}</td><td><span className={styles.faqStatusPill} data-active={item.active && Boolean(item.responseMinutes && item.resolutionMinutes)}>{!item.responseMinutes || !item.resolutionMinutes ? 'Not configured' : item.active ? 'Enabled' : 'Disabled'}</span></td><td><button className={styles.adminAvailabilityLink} disabled={busy || !settings.configured || !settings.trackingReady} onClick={() => {setEditing(true); setDraft({...item}); setError('');}}>Edit</button></td></tr>)}</tbody></table></div>{!rows.length && <p>No priorities match these filters.</p>}
      </>}
    </div>
    <Dialog hidden={!draft} onDismiss={busy ? undefined : () => setDraft(null)} minWidth={320} maxWidth={540} dialogContentProps={{type: DialogType.close, title: editing ? 'Edit priority & SLA' : 'New priority', showCloseButton: !busy}} modalProps={{isBlocking: true}}>
      {draft && <form onSubmit={event => {event.preventDefault(); setConfirm('save');}}><div className={styles.adminFormFields}>
        <TextField label="Priority name" required maxLength={255} value={draft.name} disabled={busy || editing} description={editing ? 'Name is preserved to keep existing ticket references.' : undefined} onChange={(_, text) => setDraft({...draft, name: text || ''})} />
        <TextField label="Expected response (minutes)" required type="number" min={1} step={1} value={draft.responseMinutes === undefined ? '' : String(draft.responseMinutes)} disabled={busy} onChange={(_, text) => setDraft({...draft, responseMinutes: text ? Number(text) : undefined})} />
        <TextField label="Expected resolution (minutes)" required type="number" min={draft.responseMinutes || 1} step={1} value={draft.resolutionMinutes === undefined ? '' : String(draft.resolutionMinutes)} disabled={busy} onChange={(_, text) => setDraft({...draft, resolutionMinutes: text ? Number(text) : undefined})} />
        <Toggle label="SLA tracking" checked={draft.active} onText="Enabled" offText="Disabled" disabled={busy} onChange={(_, checked) => setDraft({...draft, active: Boolean(checked)})} />
        <p className={styles.adminHint}>Disabling SLA tracking keeps the priority available on tickets and excludes it from SLA scoring.</p>
      </div>{error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}<div className={styles.faqModalFooter}><PrimaryButton type="submit" text="Save" disabled={busy || !draft.name.trim() || !draft.responseMinutes || !draft.resolutionMinutes} onRenderIcon={busy ? () => <Spinner size={SpinnerSize.xSmall} /> : undefined} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setDraft(null)} /></div></form>}
    </Dialog>
    <Dialog minWidth={320} maxWidth={640} hidden={!confirm} onDismiss={() => setConfirm(null)} dialogContentProps={{title: confirm === 'setup' ? 'Set up SLA tracking?' : 'Save SLA targets?'}} modalProps={{isBlocking: true, styles: {main: {width: 'min(640px, calc(100vw - 32px))', minWidth: 0, maxWidth: 640, selectors: {'@media (min-width: 480px)': {width: 'min(640px, calc(100vw - 32px))', minWidth: 0, maxWidth: 640}}}}}}><p>{confirm === 'setup' ? 'This creates Ticket Priorities on this site, shows it in SharePoint navigation, and adds FirstRespondedAt and ResolvedAt Date and Time fields to Tickets if missing. Existing ticket Priority choices will be copied into Ticket Priorities with initial SLA targets (Critical: 15 min / 4 hrs; High: 1 / 8 hrs; Medium: 4 / 24 hrs; Low: 8 / 72 hrs; other priorities: 4 / 24 hrs). Empty targets will be filled; saved targets will be preserved. Ticket timestamps will not be backfilled.' : 'These targets affect SLA calculations for tickets with this priority. A new priority will also be added to the Tickets Priority choices.'}</p><div className={styles.faqModalFooter}><PrimaryButton text="Confirm" onClick={() => {void save();}} /><DefaultButton text="Cancel" styles={cancelButtonStyles} onClick={() => setConfirm(null)} /></div></Dialog>
    <Dialog minWidth={320} maxWidth={640} hidden={!settingUp} dialogContentProps={{title: 'Setting up SharePoint', showCloseButton: false}} modalProps={{isBlocking: true, styles: {main: {width: 'min(640px, calc(100vw - 32px))', minWidth: 0, maxWidth: 640, selectors: {'@media (min-width: 480px)': {width: 'min(640px, calc(100vw - 32px))', minWidth: 0, maxWidth: 640}}}}}}>
      <div role="status" aria-live="polite" aria-busy={settingUp}>
        <Spinner size={SpinnerSize.large} label="Creating your SLA list and tracking fields…" />
        <p>We’re setting up Ticket Priorities and the required ticket fields in your SharePoint site. Please wait while setup completes.</p>
      </div>
    </Dialog>
  </>;
}
