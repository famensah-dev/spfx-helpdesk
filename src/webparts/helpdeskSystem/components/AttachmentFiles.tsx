import * as React from 'react';
import { DefaultButton, Icon, IconButton, MessageBar, MessageBarType } from '@fluentui/react';
import type { ITicketAttachment } from '../interfaces/ITicketDataSource';
import { attachmentAccept, validateTicketAttachments } from '../utils/ticketAttachments';
import styles from './HelpdeskSystem.module.scss';
export function AttachmentFiles(props:{files:ITicketAttachment[]}): React.ReactElement {
  return <ul className={styles.attachmentLinks}>{props.files.map(file => <li key={file.url}><Icon iconName="Attach" aria-hidden="true" /><a href={file.url} target="_blank" rel="noopener noreferrer">{file.name}</a></li>)}</ul>;
}
export function AttachmentPicker(props:{files:File[];onChange:(files:File[])=>void;disabled?:boolean}): React.ReactElement {
  const input = React.useRef<HTMLInputElement>(null);
  const [error,setError] = React.useState('');
  const add = (files:File[]):void => {
    if (props.disabled) return;
    try {const next = [...props.files,...files];validateTicketAttachments(next);props.onChange(next);setError('');}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to attach these files.');}
  };
  return <div className={styles.attachmentPicker} onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault();add(Array.from(event.dataTransfer.files));}}>
    <input ref={input} aria-label="Choose attachments" type="file" hidden multiple accept={attachmentAccept} disabled={props.disabled} onChange={event => {add(Array.from(event.target.files || []));event.target.value='';}} />
    <DefaultButton text="Attach files" iconProps={{iconName:'Attach'}} disabled={props.disabled || props.files.length >= 10} onClick={() => input.current?.click()} />
    <span>Drop files here or choose files. Up to 10 files, 5 MB each. PDF, Word, MP4, JPEG, JPG, WebP and PNG.</span>
    {!!props.files.length && <ul>{props.files.map(file => <li key={file.name.toLowerCase()}><span>{file.name} <small>({(file.size / 1048576).toFixed(2)} MB)</small></span><IconButton ariaLabel={`Remove ${file.name}`} title={`Remove ${file.name}`} iconProps={{iconName:'Cancel'}} disabled={props.disabled} onClick={() => {props.onChange(props.files.filter(value => value !== file));setError('');}} /></li>)}</ul>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
  </div>;
}
