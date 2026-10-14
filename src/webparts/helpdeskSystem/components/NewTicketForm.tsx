import { SearchableSelect } from './SearchableSelect';
import { attachmentAccept, validateTicketAttachments } from '../utils/ticketAttachments';
import { RichTextEditor } from './RichTextEditor';
import { cancelButtonStyles } from './cancelButtonStyles';
import * as React from 'react';
import { TextField, DirectionalHint, Dropdown, PrimaryButton, DefaultButton, MessageBar, MessageBarType, Spinner, Label, Icon, IconButton } from '@fluentui/react';
import type { INewTicketInput, ITicketDataSource, ITicketCreationOptions } from '../interfaces/ITicketDataSource';
import type { IUserLookup } from '../interfaces/ITicket';
import { FormAssigneePicker } from './FormAssigneePicker';
import styles from './HelpdeskSystem.module.scss';
export type { INewTicketInput } from '../interfaces/ITicketDataSource';
export function NewTicketForm(props: { service?: ITicketDataSource; onDismiss: () => void; onCreate: (input: INewTicketInput) => Promise<void> }): React.ReactElement {
  const [files, setFiles] = React.useState<File[]>([]);
  const [createdTicketId, setCreatedTicketId] = React.useState<number | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [input, setInput] = React.useState<INewTicketInput>({ title: '', description: '', priority: 'Medium' });
  const [options, setOptions] = React.useState<ITicketCreationOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [person, setPerson] = React.useState<IUserLookup | null>(null);
  const [resolving, setResolving] = React.useState(false);
  const submitting = React.useRef(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    let active = true;
    heading.current?.focus();
    const request = props.service?.getCreationOptions ? props.service.getCreationOptions() : Promise.resolve({ priorities: ['Critical', 'High', 'Medium', 'Low'], description: true, assignment: false, fields: [] });
    request.then(value => { if (active) { setOptions(value); setInput(current => ({ ...current, priority: value.priorities.includes('Medium') ? 'Medium' : value.priorities[0] || '' })); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load ticket fields.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.service]);
  const change = (key: keyof INewTicketInput, value: string): void => setInput(current => ({ ...current, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) }));
  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (submitting.current || loading || resolving || !options || !input.title.trim()) return;
    submitting.current = true; setSaving(true); setError('');
    try {
      validateTicketAttachments(files);
      if (createdTicketId) {
        if (!props.service?.uploadAttachments) throw new Error('Attachment retry is unavailable.');
        await props.service.uploadAttachments(createdTicketId, files);
      } else await props.onCreate({ ...input, title: input.title.trim(), assignedToId: person?.Id || null, attachments: files });
      props.onDismiss();
    }
    catch (reason) { const id = (reason as { createdTicketId?: number })?.createdTicketId; if (id) setCreatedTicketId(id); setError(reason instanceof Error ? reason.message : 'Unable to create the ticket.'); }
    finally { submitting.current = false; setSaving(false); }
  };
  const addFiles = (incoming: File[]): void => {
    try { const next = [...files, ...incoming]; validateTicketAttachments(next); setFiles(next); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to select these files.'); }
  };
  const field = (item: ITicketCreationOptions['fields'][number]): React.ReactNode => {
    const taxonomy = options?.classification;
    const entries = item.key === 'category' ? taxonomy?.categories : item.key === 'subcategory' ? taxonomy?.subcategories.filter(value => value.parentId === input.category) : item.key === 'issueType' ? taxonomy?.issueTypes : undefined;
    const choices = entries ? entries.map(value => ({ key: value.id, text: value.name })) : item.choices?.map(value => ({ key: value, text: value }));
    if (['category', 'subcategory', 'issueType'].includes(item.key) && choices) return <SearchableSelect key={item.key} label={item.label} required={item.required} disabled={saving || (item.key === 'subcategory' && !input.category)} value={input[item.key] || ''} options={[...(!item.required ? [{ key: '', text: 'Not specified' }] : []), ...choices]} onChange={value => change(item.key, value)} />;
    return choices ? <Dropdown calloutProps={{ calloutMaxHeight: 280, directionalHint: DirectionalHint.bottomLeftEdge, gapSpace: 4 }} key={item.key} label={item.label} required={item.required} placeholder="Select an option" selectedKey={input[item.key] || ''} disabled={saving || (item.key === 'subcategory' && !input.category)} options={[...(!item.required ? [{ key: '', text: 'Not specified' }] : []), ...choices]} onChange={(_, option) => change(item.key, String(option?.key || ''))} />
      : <TextField key={item.key} label={item.label} required={item.required} type={item.key === 'dueDate' ? 'datetime-local' : 'text'} value={input[item.key] || ''} disabled={saving} onChange={(_, value) => change(item.key, value || '')} />;
  };
  return <section className={styles.newTicketPage} aria-labelledby="new-ticket-title">
    <div className={styles.newTicketHeader}><div><h2 id="new-ticket-title" tabIndex={-1} ref={heading}>New ticket</h2><p>Create a support request and describe the help you need.</p></div><DefaultButton styles={cancelButtonStyles} text="Back to tickets" disabled={saving || resolving} onClick={props.onDismiss} /></div>
    {createdTicketId && <MessageBar>Ticket #{createdTicketId} already exists. Retry uploads to finish attaching your files without creating another ticket.</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {loading ? <Spinner label="Loading ticket fields?" /> : options && <form onSubmit={event => { void submit(event); }} className={styles.newTicketForm}>
      <div className={styles.newTicketSection}>
        <TextField label="Title" required autoFocus maxLength={255} value={input.title} disabled={saving} onChange={(_, value) => change('title', value || '')} />
        <div className={styles.newTicketDescriptionRow}>
        {options.description && <RichTextEditor value={input.description} disabled={saving || Boolean(createdTicketId)} onChange={value => change('description', value)} />}
        <div><Label>Attachments</Label><div className={styles.ticketUploadArea} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!saving && !createdTicketId) addFiles(Array.from(event.dataTransfer.files)); }}>
          <Icon iconName="CloudUpload" /><p>Drop files here or choose files</p><small>Up to 10 files, 5 MB each<br />PDF, DOC, DOCX, MP4, JPEG, JPG, WebP, PNG</small>
          <input ref={fileInput} type="file" multiple accept={attachmentAccept} hidden disabled={saving || Boolean(createdTicketId)} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
          <DefaultButton text="Choose files" disabled={saving || Boolean(createdTicketId) || files.length >= 10} onClick={() => fileInput.current?.click()} />
        </div><ul className={styles.ticketUploadList}>{files.map(file => <li key={file.name}><span>{file.name}<small>{(file.size / (1024 * 1024)).toFixed(2)} MB</small></span><IconButton iconProps={{ iconName: 'Cancel' }} ariaLabel={`Remove ${file.name}`} disabled={saving || Boolean(createdTicketId)} onClick={() => setFiles(current => current.filter(value => value !== file))} /></li>)}</ul></div>
        </div>
        <div className={styles.newTicketFields}><Dropdown label="Priority" required selectedKey={input.priority} disabled={saving} options={options.priorities.map(value => ({ key: value, text: value }))} onChange={(_, option) => change('priority', String(option?.key || ''))} />
        {options.assignment && <FormAssigneePicker service={props.service} value={person} disabled={saving || Boolean(createdTicketId)} onBusy={setResolving} onChange={setPerson} />}</div>
        <div className={styles.newTicketClassification}>{options.fields.filter(item => ['category', 'subcategory', 'issueType'].includes(item.key)).map(field)}</div>
        {options.fields.some(item => ['department', 'dueDate'].includes(item.key)) && <details className={styles.newTicketAdvanced} open={options.fields.some(item => ['department', 'dueDate'].includes(item.key) && item.required) || undefined}><summary>Advanced fields</summary><div className={styles.newTicketFields}>{options.fields.filter(item => ['department', 'dueDate'].includes(item.key)).map(field)}</div></details>}
      <div className={styles.newTicketFooter}><p>{person ? 'This ticket will start with Assigned status.' : 'This ticket will start with New status and no assignee.'}</p><div><PrimaryButton type="submit" text={saving ? (createdTicketId ? 'Uploading files...' : 'Creating...') : createdTicketId ? 'Retry uploads' : 'Create ticket'} disabled={saving || resolving || !input.title.trim() || !input.priority} /><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={saving || resolving} onClick={props.onDismiss} /></div></div>
      </div>
    </form>}
  </section>;
}
