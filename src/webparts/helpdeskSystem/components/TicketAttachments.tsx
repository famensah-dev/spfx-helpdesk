import * as React from 'react';
import { DefaultButton, Icon, IconButton, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicketAttachment, ITicketComment, ITicketDataSource } from '../interfaces/ITicketDataSource';
import { attachmentAccept, validateTicketAttachments } from '../utils/ticketAttachments';
import styles from './HelpdeskSystem.module.scss';
const sizeLabel=(size:number):string=>size < 1048576 ? Math.max(1,Math.round(size/1024))+' KB' : (size/1048576).toFixed(1)+' MB';
export function TicketAttachments(props:{id:number;service?:ITicketDataSource;refreshKey?:number;comments?:ITicketComment[];onCount?:(count:number)=>void;canUpload?:boolean}): React.ReactElement {
  const [saved,setSaved]=React.useState<ITicketAttachment[]>([]);
  const [loading,setLoading]=React.useState(false);
  const [uploading,setUploading]=React.useState(false);
  const [error,setError]=React.useState('');
  const [progress,setProgress]=React.useState('');
  const input=React.useRef<HTMLInputElement>(null);
  const generation=React.useRef(0);
  const uploadLock=React.useRef(false);
  const load=React.useCallback(async():Promise<void>=>{
    const request=++generation.current;setLoading(true);
    try {if(!props.service?.getAttachments)throw new Error('Attachments are not available in this host.');const files=await props.service.getAttachments(props.id);if(request===generation.current){setSaved(files);setError('');}}
    catch(reason){if(request===generation.current)setError(reason instanceof Error ? reason.message : 'Unable to load attachments.');}
    finally{if(request===generation.current)setLoading(false);}
  },[props.id,props.service,props.refreshKey]);
  React.useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  const files=React.useMemo(()=>[
    ...saved.map(file=>({...file,source:'Added with ticket'})),
    ...(props.comments || []).flatMap(comment=>(comment.attachments || []).map(file=>({...file,author:file.author || comment.author,created:file.created || comment.created,source:'Added in comment'})))
  ].filter((file,index,all)=>all.findIndex(other=>other.url===file.url)===index),[saved,props.comments]);
  React.useEffect(()=>props.onCount?.(files.length),[files.length,props.onCount]);
  const upload=async(selected:File[]):Promise<void>=>{
    if(uploadLock.current || !props.canUpload || !props.service?.uploadAttachments || !selected.length)return;
    uploadLock.current=true;setUploading(true);setError('');
    try{validateTicketAttachments(selected);await props.service.uploadAttachments(props.id,selected,setProgress);await load();}
    catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to upload files.');await load();setError(reason instanceof Error ? reason.message : 'Unable to upload files.');}
    finally{uploadLock.current=false;setUploading(false);setProgress('');}
  };
  const knownSize=files.reduce((sum,file)=>sum+(file.size || 0),0);
  return <div className={styles.ticketAttachmentList}>
    <div className={styles.ticketAttachmentToolbar}><span>{files.length} {files.length===1 ? 'file' : 'files'}{files.length>0 && files.every(file=>file.size!==undefined) ? ' \u00b7 '+sizeLabel(knownSize) : ''}</span><DefaultButton text="Upload" iconProps={{iconName:'Upload'}} disabled={!props.canUpload || !props.service?.uploadAttachments || uploading} onClick={()=>input.current?.click()} /><input ref={input} type="file" hidden multiple accept={attachmentAccept} aria-label="Upload ticket attachments" disabled={uploading || !props.canUpload} onChange={event=>{const selected=Array.from(event.target.files || []);event.target.value='';void upload(selected);}} /></div>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {(loading || uploading) && <Spinner label={progress || 'Loading attachments...'} />}
    {!loading && files.map(file=>{
      const extension=file.name.split('.').pop()?.toLowerCase() || '';
      const kind=['doc','docx'].includes(extension) ? 'word' : extension==='pdf' ? 'pdf' : ['png','jpg','jpeg','webp','gif'].includes(extension) ? 'image' : 'file';
      const date=file.created && Number.isFinite(new Date(file.created).getTime()) ? new Date(file.created).toLocaleDateString('en-US',{month:'short',day:'numeric'})+', '+new Date(file.created).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';
      return <div className={styles.ticketAttachmentRow} key={file.url}><span className={styles.ticketFileIcon} data-kind={kind}><Icon iconName={kind==='word' ? 'WordDocument' : kind==='pdf' ? 'PDF' : kind==='image' ? 'Photo2' : 'Page'} /></span><div className={styles.ticketFileInfo}><a href={file.previewUrl || file.url} target="_blank" rel="noopener noreferrer">{file.name}</a><p>{[file.author,date,file.size!==undefined ? sizeLabel(file.size) : '',file.source].filter(Boolean).join(' \u00b7 ')}</p></div><IconButton iconProps={{iconName:'Download'}} title={'Download '+file.name} ariaLabel={'Download '+file.name} href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" /><IconButton iconProps={{iconName:'More'}} menuIconProps={{iconName:''}} title={'More actions for '+file.name} ariaLabel={'More actions for '+file.name} menuProps={{items:[{key:'open',text:'Open file',href:file.previewUrl || file.url,target:'_blank',rel:'noopener noreferrer'},{key:'copy',text:'Copy file link',onClick:()=>{if(!navigator.clipboard){setError('Copy the file link from your browser.');return;}void navigator.clipboard.writeText(file.url).catch(()=>setError('Unable to copy file link.'));}}]}} /></div>;
    })}
    {!loading && !files.length && !error && <p>No attachments yet.</p>}
  </div>;
}
