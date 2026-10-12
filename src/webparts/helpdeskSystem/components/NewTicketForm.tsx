import * as React from 'react';
import { Panel, PanelType, TextField, Dropdown, PrimaryButton, DefaultButton, MessageBar, MessageBarType } from '@fluentui/react';
export interface INewTicketInput { title: string; description: string; priority: string; }
export function NewTicketForm(props: { onDismiss: () => void; onCreate: (input: INewTicketInput) => Promise<void> }): React.ReactElement {
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState('Medium');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const submitting = React.useRef(false);
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting.current || !title.trim()) return;
    submitting.current = true; setSaving(true); setError('');
    try { await props.onCreate({ title: title.trim(), description, priority }); props.onDismiss(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create the ticket.'); }
    finally { submitting.current = false; setSaving(false); }
  };
  return <Panel isOpen type={PanelType.medium} headerText="New ticket" closeButtonAriaLabel="Close new ticket form" isBlocking isLightDismiss={false} isHiddenOnDismiss={false} hasCloseButton={!saving} onDismiss={() => { if (!saving) props.onDismiss(); }}>
    <form onSubmit={event => { void submit(event); }} style={{ display: 'grid', gap: 16, paddingTop: 16 }}>
      {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
      <TextField label="Issue" required maxLength={255} value={title} disabled={saving} onChange={(_, value) => setTitle(value || '')} />
      <TextField label="Issue description" multiline rows={6} value={description} disabled={saving} onChange={(_, value) => setDescription(value || '')} />
      <Dropdown label="Priority" selectedKey={priority} disabled={saving} options={['Critical', 'High', 'Medium', 'Low'].map(value => ({ key: value, text: value }))} onChange={(_, option) => setPriority(String(option?.key || 'Medium'))} />
      <p style={{ margin: 0, color: '#626b7b' }}>New tickets start with New status and are unassigned.</p>
      <div style={{ display: 'flex', gap: 8 }}><PrimaryButton type="submit" text={saving ? 'Creating…' : 'Create ticket'} disabled={saving || !title.trim()} /><DefaultButton text="Cancel" disabled={saving} onClick={props.onDismiss} /></div>
    </form>
  </Panel>;
}
