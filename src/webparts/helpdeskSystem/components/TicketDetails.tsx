import { canUse } from '../services/appRoleRules';
import type { IFaqInput } from '../interfaces/IFaq';
import { TicketClassificationFields } from './TicketClassificationFields';
import { RichTextEditor, RichTextContent } from './RichTextEditor';
import { MarkdownContent } from './MarkdownEditor';
import { cancelButtonStyles } from './cancelButtonStyles';
import { FormAssigneePicker } from './FormAssigneePicker';
import * as React from 'react';
import { DefaultButton, PrimaryButton, PersonaCoin, Icon, IconButton, Panel, PanelType, TextField, Dropdown, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import type { ITicketDataSource, ITicketComment, ITicketVersion } from '../interfaces/ITicketDataSource';
import { ticketStatuses, normalizeStatus } from '../utils/ticketStatuses';
import { AttachmentFiles, AttachmentPicker } from './AttachmentFiles';
import { TicketAttachments } from './TicketAttachments';
import { Dialog, DialogFooter } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';

export function TicketDetails(props: { ticket: ITicket; tickets: ITicket[]; service?: ITicketDataSource; refresh: () => Promise<void>; onBack: () => void; backLabel?: string }): React.ReactElement {
  const { ticket, service } = props;
  const agent = !service?.roleRules && service?.access?.agent === true;
  const canManage = !agent || ticket.AssignedTo?.Email?.toLowerCase() === service?.access?.email.toLowerCase();
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [classificationEdit, setClassificationEdit] = React.useState<{ category?: string; subcategory?: string; issueType?: string; ticketType?: string }>({});
  const commentInput = React.useRef<HTMLDivElement>(null);
  const [resolutionOpen, setResolutionOpen] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<TicketStatus>();
  const [resolutionDraft, setResolutionDraft] = React.useState('');
  const [statusError, setStatusError] = React.useState('');
  const [clearResolution, setClearResolution] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editFiles, setEditFiles] = React.useState<File[]>([]);
  const [attachmentRevision, setAttachmentRevision] = React.useState(0);
  const [editUploadProgress, setEditUploadProgress] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [title, setTitle] = React.useState(ticket.Title);
  const plainDescription = React.useMemo(() => ticket.Description ? new DOMParser().parseFromString(ticket.Description, 'text/html').body.textContent || '' : '', [ticket.Description]);
  const [description, setDescription] = React.useState(ticket.Description || '');
  const [priority, setPriority] = React.useState<TicketPriority>(ticket.Priority);
  const [status, setStatus] = React.useState<TicketStatus>(normalizeStatus(ticket.Status));
  const [assignmentMessage, setAssignmentMessage] = React.useState('');
  const [assignmentBusy, setAssignmentBusy] = React.useState(false);
  const [assignedName, setAssignedName] = React.useState(ticket.AssignedTo?.Title || 'Unassigned');
  const [assigned, setAssigned] = React.useState(ticket.AssignedTo?.Id || 0);
  const [comments, setComments] = React.useState<ITicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentsError, setCommentsError] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [commentFiles,setCommentFiles] = React.useState<File[]>([]);
  const [uploadProgress,setUploadProgress] = React.useState('');
  const [pendingCommentUpload,setPendingCommentUpload] = React.useState<{id:string;faq?:IFaqInput}>();
  const commentPostId = React.useRef('');
  const [saveToFaq, setSaveToFaq] = React.useState(false);
  const [pendingFaq, setPendingFaq] = React.useState<IFaqInput | null>(null);
  const [faqMessage, setFaqMessage] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState('comments');
  const [newestFirst, setNewestFirst] = React.useState(true);
  const [commentAction,setCommentAction] = React.useState<{kind:'solution'|'faq';comment:ITicketComment}>();
  const [actionBusy,setActionBusy] = React.useState(false);
  const [actionError,setActionError] = React.useState('');
  const actionLock = React.useRef(false);
  const canSelectSolution = Boolean(service?.access?.admin || service?.access?.superAdmin);
  const runCommentAction = async ():Promise<void> => {
    if (!commentAction || actionLock.current) return;
    actionLock.current=true;setActionBusy(true);setActionError('');
    try {
      const selected = commentAction.comment;
      if (commentAction.kind === 'solution') {
        if (!canSelectSolution || !service?.markCommentAsSolution) throw new Error('Only Helpdesk Admins can select a solution.');
        await service.markCommentAsSolution(ticket.Id,selected.id,true);
        await props.refresh();
        setFaqMessage('Solution saved to Resolution Summary.');
      } else {
        const access = await service?.getFaqAccess?.();
        if (!access?.canManage || !service?.saveFaq) throw new Error('Knowledge Base management permission is required to publish.');
        const category = access.categoryOptions?.find(item => item.name === ticket.Category);
        const subcategory = access.subcategoryOptions?.find(item => item.name === ticket.Subcategory && item.parentId === category?.id);
        const escape = (value:string):string => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        await service.saveFaq({sourceTicketId:ticket.Id,question:ticket.Title,answer:'<p>'+escape(selected.text).replace(/\n/g,'<br>')+'</p>',category:ticket.Category || '',subcategory:ticket.Subcategory || '',categoryId:category?.id,subcategoryId:subcategory?.id,keywords:'',published:true,sortOrder:0});
        setFaqMessage('Comment published to the Knowledge Base.');
      }
      setCommentAction(undefined);
    } catch (reason) {setActionError(reason instanceof Error ? reason.message : 'Unable to save.');}
    finally {actionLock.current=false;setActionBusy(false);}
  };
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState<ITicketVersion[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState('');
  const [historyNewestFirst, setHistoryNewestFirst] = React.useState(true);
  const [historyReload, setHistoryReload] = React.useState(0);
  React.useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    setHistoryLoading(true); setHistoryError(''); setHistory([]);
    const load = async (): Promise<void> => {
      try {
        if (!service?.getHistory) throw new Error('Issue history is not available in this host.');
        const versions = await service.getHistory(ticket.Id);
        if (!cancelled) setHistory(versions);
      } catch (reason) { if (!cancelled) setHistoryError(reason instanceof Error ? reason.message : 'Unable to load issue history.'); }
      finally { if (!cancelled) setHistoryLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [historyOpen, historyReload, service, ticket.Id]);
  const commentsSection = React.useRef<HTMLElement>(null);
  const lock = React.useRef(false);
  const commentLock = React.useRef(false);
  const commentRequest = React.useRef(0);
  const loadComments = React.useCallback(async (): Promise<void> => {
    const request = ++commentRequest.current;
    setCommentsLoading(true); setCommentsError('');
    try {
      if (!service?.getComments) throw new Error('Comments are not available in this host.');
      const result = await service.getComments(ticket.Id);
      if (commentRequest.current === request) setComments(result);
    } catch (reason) { if (commentRequest.current === request) setCommentsError(reason instanceof Error ? reason.message : 'Unable to load comments.'); }
    finally { if (commentRequest.current === request) setCommentsLoading(false); }
  }, [service, ticket.Id]);
  React.useEffect(() => { heading.current?.focus(); void loadComments(); return () => { commentRequest.current++; }; }, [loadComments]);
  const date = (value?: string | null): string => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('en-US', {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).replace(/[\s\u00a0\u202f]+(AM|PM)/g, '$1') : 'Not provided';
  const beginEdit = (): void => { setEditFiles([]); setClassificationEdit({}); setTitle(ticket.Title); setDescription(ticket.Description || ''); setPriority(ticket.Priority); setStatus(normalizeStatus(ticket.Status)); setAssigned(ticket.AssignedTo?.Id || 0); setAssignedName(ticket.AssignedTo?.Title || 'Unassigned'); setError(''); setSaved(false); setEditing(true); };
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (!service?.updateTicket || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      await service.updateTicket(ticket.Id, {title, description: description !== (ticket.Description || '') ? description : undefined, priority, status, assignedToId: assigned || null, ...classificationEdit});
      if (editFiles.length) {
        try {
          if (!service.uploadAttachments) throw new Error('Attachment uploads are not available.');
          await service.uploadAttachments(ticket.Id, editFiles, setEditUploadProgress);
          setEditFiles([]);
        } catch (reason) {
          throw new Error(`Ticket details were saved, but attachments need attention. ${reason instanceof Error ? reason.message : 'Upload failed.'} Save again to retry, or cancel to keep the saved details.`);
        } finally { setAttachmentRevision(value => value + 1); }
      }
      setEditing(false); setSaved(true); await props.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save changes.'); }
    finally { lock.current = false; setSaving(false); setEditUploadProgress(''); }
  };
  const retryFaq = async (): Promise<void> => {
    if (!pendingFaq || !service?.saveFaq || commentLock.current) return;
    commentLock.current = true; setPosting(true); setCommentsError('');
    try { await service.saveFaq(pendingFaq); setPendingFaq(null); setFaqMessage('Comment saved as an inactive Knowledge Base draft.'); }
    catch (reason) { setCommentsError(reason instanceof Error ? reason.message : 'Unable to save FAQ.'); }
    finally { commentLock.current = false; setPosting(false); }
  };
  const post = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (!service?.addComment || commentLock.current || !comment.trim()) return;
    commentLock.current = true; setPosting(true); setCommentsError(''); setFaqMessage('');
    let commentSaved = false;
    let faq: IFaqInput | undefined = pendingCommentUpload?.faq;
    try {
      if (saveToFaq && !pendingCommentUpload) {
        const access = await service.getFaqAccess?.();
        if ((!access?.canManage && !access?.canSubmitDraft) || !service.saveFaq) throw new Error('You need Knowledge Base management permission to save this comment as a Knowledge Base article.');
        const category = access.categoryOptions?.find(item => item.name === ticket.Category);
        const subcategory = access.subcategoryOptions?.find(item => item.name === ticket.Subcategory && item.parentId === category?.id);
        const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        faq = { sourceTicketId: ticket.Id, question: ticket.Title, answer: '<p>' + escape(comment.trim()).replace(/\n/g, '<br>') + '</p>', category: ticket.Category || '', subcategory: ticket.Subcategory || '', categoryId: category?.id, subcategoryId: subcategory?.id, keywords: '', published: false, sortOrder: 0 };
      }
      if (pendingCommentUpload) {
        if (!service.uploadCommentAttachments) throw new Error('Comment attachment retry is not available in this host.');
        await service.uploadCommentAttachments(ticket.Id,pendingCommentUpload.id,commentFiles,setUploadProgress);
      } else {
        if (!commentPostId.current) commentPostId.current = crypto.randomUUID();
        await service.addComment(ticket.Id,comment,{files:commentFiles,requestId:commentPostId.current,onProgress:setUploadProgress});
      }
      commentSaved = true; setComment(''); setCommentFiles([]); setPendingCommentUpload(undefined); setSaveToFaq(false); commentPostId.current = '';
      if (faq) {
        setPendingFaq(faq);
        await service.saveFaq!(faq);
        setPendingFaq(null); setFaqMessage('Comment posted and saved as an inactive Knowledge Base draft.');
      }
      await loadComments();
    } catch (reason) {
      const partial = (reason as {createdCommentId?:string})?.createdCommentId;
      if (partial) setPendingCommentUpload({id:partial,faq});
      if (commentSaved || partial || pendingCommentUpload) await loadComments();
      setCommentsError((commentSaved ? 'The comment was posted. ' : '') + (reason instanceof Error ? reason.message : 'Unable to post comment.'));
    } finally { commentLock.current = false; setPosting(false); setUploadProgress(''); }
  };
  const [priorityOptions, setPriorityOptions] = React.useState<string[]>([]);
  React.useEffect(() => { let active = true; if (service?.getPriorities) service.getPriorities().then(values => {if (active) setPriorityOptions(values);}).catch(reason => {if (active) setError(reason instanceof Error ? reason.message : 'Unable to load priorities.');}); return () => {active = false;}; }, [service]);
  const openStatus = (next:TicketStatus):void => {
    if (next === 'Closed' && !canSelectSolution) {setError('Only Helpdesk Admins can close tickets.');return;}
    setResolutionDraft('');setStatusError('');setStatusTarget(next);
  };
  const confirmStatus = async ():Promise<void> => {
    if (!service?.updateTicket || saving || lock.current || (!statusTarget && !clearResolution)) return;
    const needsSummary = statusTarget && ['Resolved','Completed','Closed'].includes(statusTarget) && !ticket.ResolutionSummary?.trim();
    if (needsSummary && !resolutionDraft.trim()) {setStatusError('Provide a resolution summary before completing this ticket.');return;}
    lock.current=true;setSaving(true);setStatusError('');
    try {
      await service.updateTicket(ticket.Id,{title:ticket.Title,priority:ticket.Priority,status:statusTarget || ticket.Status,assignedToId:ticket.AssignedTo?.Id || null,...(clearResolution ? {resolutionSummary:''} : needsSummary ? {resolutionSummary:resolutionDraft.trim()} : {})});
      await props.refresh();setStatusTarget(undefined);setClearResolution(false);setSaved(true);
    } catch(reason) {setStatusError(reason instanceof Error ? reason.message : 'Unable to update ticket.');}
    finally {lock.current=false;setSaving(false);}
  };
  return <section className={`${styles.pageContent} ${styles.detailWorkspace}`} aria-label={`Ticket #${ticket.Id} details`}>
    <Dialog hidden={!statusTarget && !clearResolution} onDismiss={saving ? undefined : ()=>{setStatusTarget(undefined);setClearResolution(false);}} dialogContentProps={{title:clearResolution ? 'Clear resolution summary?' : statusTarget==='Resolved' ? 'Complete ticket?' : 'Change ticket status'}} modalProps={{isBlocking:saving}}><p>{clearResolution ? 'Clear the summary and remove the comment solution tag? The ticket status will remain unchanged.' : statusTarget==='Resolved' ? 'Mark this ticket as completed?' : 'Change ticket status to '+statusTarget+'?'}</p>{!clearResolution && statusTarget && ['Resolved','Completed','Closed'].includes(statusTarget) && !ticket.ResolutionSummary?.trim() && <TextField label="Resolution Summary" required multiline rows={4} maxLength={10000} value={resolutionDraft} disabled={saving} onChange={(_,value)=>setResolutionDraft(value || '')} />}{statusError && <MessageBar messageBarType={MessageBarType.error}>{statusError}</MessageBar>}<DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={saving} onClick={()=>{setStatusTarget(undefined);setClearResolution(false);}} /><PrimaryButton text={saving ? 'Saving...' : 'Confirm'} disabled={saving} onClick={()=>{void confirmStatus();}} /></DialogFooter></Dialog>
    <Dialog hidden={!commentAction} onDismiss={() => {if (!actionBusy) setCommentAction(undefined);}} dialogContentProps={{title:commentAction?.kind === 'solution' ? 'Mark as solution' : 'Publish to KB'}} modalProps={{isBlocking:actionBusy}}><p>{commentAction?.kind === 'solution' ? (ticket.ResolutionSummary ? 'Replace the existing Resolution Summary with this comment? Ticket status will remain unchanged.' : 'Use this comment as the Resolution Summary? Ticket status will remain unchanged.') : 'Publish this comment to the Knowledge Base using the ticket title as its question? Attached files will remain on the comment.'}</p>{actionError && <MessageBar messageBarType={MessageBarType.error}>{actionError}</MessageBar>}<DialogFooter><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={actionBusy} onClick={() => setCommentAction(undefined)} /><PrimaryButton text={actionBusy ? 'Saving…' : 'Confirm'} disabled={actionBusy} onClick={() => {void runCommentAction();}} /></DialogFooter></Dialog><h2 className={styles.srOnly} ref={heading} tabIndex={-1}>Ticket #{ticket.Id}</h2>
    {assignmentMessage && <MessageBar messageBarType={assignmentBusy ? MessageBarType.info : MessageBarType.success} onDismiss={assignmentBusy ? undefined : () => setAssignmentMessage('')}>{assignmentMessage}</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {saved && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>Ticket changes saved.</MessageBar>}
    <Panel isOpen={historyOpen} type={PanelType.custom} customWidth="360px" headerText="Ticket History" closeButtonAriaLabel="Close issue history" isLightDismiss onDismiss={() => setHistoryOpen(false)} styles={{ main: { maxWidth: '100vw', background: '#fbfdff' }, commands: { paddingTop: 0, background: '#f3f7ff', borderBottom: '1px solid #dce5f1' }, navigation: { alignItems: 'center', minHeight: 54 }, header: { padding: '14px 20px', alignSelf: 'center' }, closeButton: { margin: '0 12px 0 0', width: 32, height: 32, background: 'transparent', color: '#526783' }, headerText: { fontSize: 16, fontWeight: 600 }, content: { padding: '0 20px 20px' } }}>
      <div className={styles.issueHistory}>
        <div className={styles.historyToolbar}><span>Ticket #{ticket.Id}</span><div><IconButton styles={cancelButtonStyles} iconProps={{iconName:historyNewestFirst ? 'SortDown' : 'SortUp'}} title={historyNewestFirst ? 'Newest first - change order' : 'Oldest first - change order'} ariaLabel="History sort order" menuProps={{items:[{key:'newest',text:'Newest first',canCheck:true,checked:historyNewestFirst,onClick:()=>setHistoryNewestFirst(true)},{key:'oldest',text:'Oldest first',canCheck:true,checked:!historyNewestFirst,onClick:()=>setHistoryNewestFirst(false)}]}} /><IconButton iconProps={{iconName:'Refresh'}} title="Refresh history" ariaLabel="Refresh history" disabled={historyLoading} onClick={()=>setHistoryReload(value=>value+1)} /></div></div>
        {historyError && <MessageBar messageBarType={MessageBarType.error}>{historyError}</MessageBar>}
        {historyLoading ? <Spinner label="Loading issue history…" /> : !historyError && (history.length ? <ol>{[...history].sort((a,b)=>(new Date(a.modified).getTime()-new Date(b.modified).getTime())*(historyNewestFirst ? -1 : 1)).map(version => {
          const createdVersion = new Date(version.modified).getTime() === new Date(ticket.Created).getTime();
          return <li key={version.id} data-created={createdVersion}><span className={styles.historyEventIcon} aria-hidden="true"><Icon iconName={createdVersion ? 'Add' : 'Edit'} /></span><div><div className={styles.historyItemHeading}><strong>{createdVersion ? 'Ticket Created' : 'Details Updated'}</strong><time dateTime={version.modified}>{date(version.modified)}</time></div><p>{createdVersion ? 'The helpdesk request was submitted by ' : 'Issue version saved by '}<b>{version.author}</b>.</p></div></li>;
        })}</ol> : <p>No saved versions were returned. Check the list’s versioning settings if you expect earlier changes.</p>)}
      </div>
    </Panel>
    <div className={styles.ticketDetailLayout}>
      <article className={styles.ticketDetailBody}>
        <div className={styles.detailSummary}>
          <div className={styles.detailHero}><div><div className={styles.detailEyebrow}>Ticket ID #{ticket.Id} <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></div><h3 className={styles.detailSubject}>{ticket.Title}</h3><p className={styles.detailSubmitted}>Submitted {date(ticket.Created)} by {ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'}</p>{ticket.FirstRespondedAt && <p className={styles.detailSubmitted}>First response recorded {date(ticket.FirstRespondedAt)}</p>}</div><div className={styles.ticketTitleActions}><div><DefaultButton styles={{root:{height:24,minWidth:0,padding:'0 8px',background:'transparent',border:0},label:{fontSize:12,fontWeight:500},icon:{fontSize:11}}} text={props.backLabel || 'Back to Tickets'} iconProps={{iconName:'Back'}} disabled={saving || posting} onClick={props.onBack} /><DefaultButton styles={{root:{height:24,minWidth:0,padding:"0 8px"},label:{fontSize:12,fontWeight:500},icon:{fontSize:11}}} text="Edit Ticket" iconProps={{iconName:'Edit'}} disabled={!service?.updateTicket || !canManage || saving} onClick={beginEdit} /><span className={styles.resolveTicketControl}><PrimaryButton styles={{root:{height:26,minWidth:0,padding:'0 9px',border:0,borderRadius:0,background:'#00899b',color:'#fff'},rootHovered:{background:'#00798a',color:'#fff'},rootPressed:{background:'#006d7d',color:'#fff'},label:{fontSize:12,fontWeight:500},icon:{fontSize:12}}} text={['Resolved','Completed','Closed'].includes(ticket.Status) ? 'Close Ticket' : 'Resolve Ticket'} iconProps={{iconName:'Completed'}} disabled={!service?.updateTicket || !canManage || !canUse(service,'status') || saving || ticket.Status==='Closed' || (['Resolved','Completed'].includes(ticket.Status) && !canSelectSolution)} onClick={()=>openStatus(['Resolved','Completed'].includes(ticket.Status) ? 'Closed' : 'Resolved')} /><IconButton styles={{root:{height:26,width:24,minWidth:24,padding:0,margin:0,border:0,borderRadius:0,background:'#00899b',color:'#fff'},rootHovered:{background:'#00798a',color:'#fff'},rootPressed:{background:'#006d7d',color:'#fff'},menuIcon:{fontSize:10,margin:0,color:'inherit',transform:'translateY(2px)'}}} title="Change ticket status" ariaLabel="Change ticket status" menuIconProps={{iconName:'ChevronDown'}} disabled={!service?.updateTicket || !canManage || !canUse(service,'status') || saving} menuProps={{items:ticketStatuses.filter(value=>value!==normalizeStatus(ticket.Status) && (value!=='Closed' || canSelectSolution)).map(value=>({key:value,text:value,onClick:()=>openStatus(value)}))}} /></span></div></div></div>
          <section className={styles.ticketDescriptionBox} aria-label="Description"><div className={styles.ticketDescription}>{/<\/?(?:p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(ticket.Description || '') ? <RichTextContent value={ticket.Description!} /> : <MarkdownContent value={ticket.Description || 'No description has been added to this ticket.'} />}</div></section>
      {ticket.ResolutionSummary && <section className={styles.ticketResolutionBody}><div className={styles.resolutionSummaryActions}><DefaultButton styles={cancelButtonStyles} text="See resolution summary" iconProps={{iconName:'CompletedSolid',styles:{root:{color:'#13794e'}}}} menuIconProps={{iconName:resolutionOpen ? 'ChevronUp' : 'ChevronDown'}} aria-expanded={resolutionOpen} onClick={()=>setResolutionOpen(value=>!value)} />{resolutionOpen && <>{canSelectSolution && service?.updateTicket && <DefaultButton styles={cancelButtonStyles} text="Clear resolution summary" disabled={saving} onClick={()=>{setStatusError('');setClearResolution(true);}} />}</>}</div>{resolutionOpen && <><div className={styles.resolutionSummaryContent}>{ticket.SolutionCommentId ? <p style={{whiteSpace:'pre-wrap'}}>{ticket.ResolutionSummary}</p> : <RichTextContent value={ticket.ResolutionSummary} />}</div></>}</section>}

        </div>
        <Dialog hidden={!editing} onDismiss={saving ? undefined : () => setEditing(false)} minWidth={320} maxWidth={1100} dialogContentProps={{title:"Edit Ticket",showCloseButton:!saving}} modalProps={{isBlocking:saving,styles:{main:{width:"min(1100px, calc(100vw - 32px))",maxWidth:1100,selectors:{"@media (min-width: 480px)":{width:"min(1100px, calc(100vw - 32px))",minWidth:0,maxWidth:1100}}}}}}><form className={styles.ticketEditForm} onSubmit={event => { void save(event); }}>
          <div className={styles.detailSectionHeading}><Icon iconName="Edit" /><h3>Edit details</h3></div>
          <TextField label="Issue" required value={title} maxLength={255} disabled={saving || !canUse(service, 'edit')} onChange={(_, value) => setTitle(value || '')} />
          <RichTextEditor value={description} disabled={saving || !canUse(service, 'edit')} onChange={setDescription} />
          {service?.uploadAttachments && <AttachmentPicker compact files={editFiles} onChange={setEditFiles} disabled={saving || !canUse(service, 'edit')} />}
          <div className={styles.detailFormGrid}>
            <Dropdown label="Priority" selectedKey={priority} disabled={saving || agent || !canUse(service, 'priority')} options={Array.from(new Set([...priorityOptions, ticket.Priority])).map(value => ({key: value, text: value}))} onChange={(_, option) => setPriority(option?.key as TicketPriority)} />
            <Dropdown label="Status" selectedKey={status} disabled={saving || !canUse(service, 'status')} options={[...ticketStatuses, ...(ticket.Status === 'Escalated' ? ['Escalated'] : [])].filter(value => !agent || !['Resolved', 'Completed', 'Closed'].includes(ticket.Status) || ['Resolved', 'Closed'].includes(value)).map(value => ({key: value, text: value}))} onChange={(_, option) => setStatus(option?.key as TicketStatus)} />
            <FormAssigneePicker service={service} value={assigned ? { Id: assigned, Title: assignedName } : null} disabled={saving || agent || !canUse(service, 'assign')} onBusy={setAssignmentBusy} onChange={person => { if ((person?.Id || 0) !== assigned) setStatus(person?.Id ? 'Assigned' : 'New'); setAssigned(person?.Id || 0); setAssignedName(person?.Title || person?.Email || 'Unassigned'); }} />
          </div>
          <Dropdown label="Ticket Type" selectedKey={classificationEdit.ticketType || ticket.TicketType || ''} disabled={saving || !canUse(service, 'edit')} options={[{key: '', text: 'Not specified', disabled: true}, ...['Problem', 'Incident', 'Question', 'Request'].map(value => ({key: value, text: value}))]} onChange={(_,option) => { if (option) setClassificationEdit(current => ({...current, ticketType: String(option.key)})); }} />
          <TicketClassificationFields service={service} ticket={ticket} disabled={saving || !canUse(service, 'edit')} onChange={value => setClassificationEdit(current => ({ ...current, ...value }))} />
          
          {editUploadProgress && <Spinner label={editUploadProgress} />}
          <div className={styles.detailSaveBar}><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={saving} onClick={() => setEditing(false)} /><PrimaryButton type="submit" text={saving ? 'Saving…' : 'Save changes'} iconProps={{iconName: 'Save'}} disabled={saving || assignmentBusy || !title.trim()} /></div>
        </form></Dialog>
        <nav className={styles.detailSectionNav} aria-label="Ticket sections"><button type="button" data-active={activeSection === 'comments'} onClick={() => { setActiveSection('comments'); commentsSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon iconName="Comment" /> Comments <span className={styles.commentCount}>{comments.length}</span></button><button type="button" disabled={!service?.getAttachments} data-active={activeSection === 'attachments'} onClick={() => setActiveSection('attachments')}><Icon iconName="Attach" /> Attachments</button><button type="button" onClick={() => setHistoryOpen(true)}><Icon iconName="History" /> History</button><button type="button" disabled title="Related tickets are not available yet"><Icon iconName="BulletedList" /> Related Tickets</button>{activeSection === 'comments' && <div className={styles.commentTabControls}><DefaultButton styles={cancelButtonStyles} text="Add comment" iconProps={{iconName:'CommentAdd'}} onClick={()=>{commentInput.current?.scrollIntoView({behavior:'smooth',block:'center'});commentInput.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();}} /><select aria-label="Comment order" value={newestFirst ? 'newest' : 'oldest'} onChange={event => setNewestFirst(event.target.value === 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><IconButton styles={cancelButtonStyles} ariaLabel="Refresh comments" title="Refresh comments" iconProps={{iconName: 'Refresh'}} disabled={commentsLoading || posting} onClick={() => { void loadComments(); }} /></div>}</nav>
        {activeSection === 'attachments' && <section aria-label="Ticket attachments"><TicketAttachments id={ticket.Id} service={service} refreshKey={attachmentRevision} /></section>}

      {faqMessage && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setFaqMessage('')}>{faqMessage}</MessageBar>}
      {pendingFaq && <MessageBar messageBarType={MessageBarType.warning}>Your comment is saved; its Knowledge Base draft still needs to be saved. <DefaultButton text="Retry Save to FAQ" disabled={posting} onClick={() => { void retryFaq(); }} /><DefaultButton text="Dismiss" disabled={posting} styles={cancelButtonStyles} onClick={() => setPendingFaq(null)} /></MessageBar>}
      <section hidden={activeSection !== 'comments'} ref={commentsSection} className={styles.ticketComments} aria-label="Ticket comments">

        <div className={styles.commentDisplay}>
        {commentsError && <MessageBar messageBarType={MessageBarType.error}>{commentsError}</MessageBar>}
        {commentsLoading ? <div className={styles.conversationLoading}><Spinner label="Loading comments…" /></div> : <div className={styles.commentThread} aria-live="polite">{[...comments].sort((a, b) => (new Date(a.created).getTime() - new Date(b.created).getTime()) * (newestFirst ? -1 : 1)).map(value => <article key={value.id} className={styles.commentEntry}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={value.author} coinSize={36} /></span><div className={styles.commentContent}><header><strong>{value.author}</strong><time dateTime={value.created}>{date(value.created)}</time>{ticket.SolutionCommentId === value.id && <span className={styles.commentSolution}><Icon iconName="CompletedSolid" /> Solution</span>}</header><p>{value.text}</p>{!!value.attachments?.length && <AttachmentFiles files={value.attachments} />}{value.attachmentError && <MessageBar messageBarType={MessageBarType.warning}>{value.attachmentError} Refresh comments to retry.</MessageBar>}<div className={styles.savedCommentActions}>{canSelectSolution && service?.markCommentAsSolution && ticket.SolutionCommentId !== value.id && <DefaultButton styles={{root:{height:24,minHeight:24,minWidth:0,padding:'2px 8px',borderRadius:4,border:'1px solid #d9e4f2',background:'#edf3fc',color:'#244a78'},rootHovered:{background:'#e0eafa',borderColor:'#becfe5'},rootPressed:{background:'#d7e4f7'},label:{fontSize:11,fontWeight:500}}} text="Mark as solution" disabled={actionBusy} onClick={() => {setActionError('');setCommentAction({kind:'solution',comment:value});}} />}{service?.saveFaq && <DefaultButton styles={{root:{height:24,minHeight:24,minWidth:0,padding:'2px 8px',borderRadius:4,border:'1px solid #f0d49a',background:'#fff4d6',color:'#8a5b10'},rootHovered:{background:'#ffebba',borderColor:'#dfbb72'},rootPressed:{background:'#ffe09a'},label:{fontSize:11,fontWeight:500}}} text="Publish to KB" disabled={actionBusy} onClick={() => {setActionError('');setCommentAction({kind:'faq',comment:value});}} />}</div></div></article>)}{!comments.length && !commentsError && <div className={styles.conversationEmpty}><Icon iconName="Comment" /><strong>No comments yet</strong><p>Share an update or ask a question below.</p></div>}</div>}
        </div>
        <form onSubmit={event => { void post(event); }} className={styles.commentComposer}><div className={styles.detailSectionHeading}><Icon iconName="CommentAdd" /><h3>Add a comment</h3></div><div ref={commentInput} className={styles.commentEditor}><div className={styles.commentFormatBar} aria-label="Comment formatting"><select disabled aria-label="Text style" title="Rich text formatting is not available yet"><option>Normal</option></select>{[{ icon: 'Bold', label: 'Bold' }, { icon: 'Italic', label: 'Italic' }, { icon: 'Underline', label: 'Underline' }, { icon: 'BulletedList', label: 'Bulleted list' }, { icon: 'NumberedList', label: 'Numbered list' }, { icon: 'AlignLeft', label: 'Align left' }, { icon: 'Link', label: 'Insert link' }, { icon: 'Photo2', label: 'Insert image' }].map(item => <IconButton key={item.icon} iconProps={{ iconName: item.icon }} ariaLabel={item.label} title={`${item.label} is not available yet`} disabled />)}</div><TextField ariaLabel="Comment" placeholder="Type your comment here…" multiline rows={4} maxLength={10000} value={comment} disabled={posting || Boolean(pendingCommentUpload) || !service?.addComment} onChange={(_, value) => setComment(value || '')} /></div><AttachmentPicker compact files={commentFiles} onChange={setCommentFiles} disabled={posting || !service?.uploadCommentAttachments} />{pendingCommentUpload && <MessageBar messageBarType={MessageBarType.warning}>Your comment is already saved. Retry attachments to finish uploading the selected files without posting another comment.</MessageBar>}{posting && uploadProgress && <Spinner label={uploadProgress} />}<div className={styles.commentComposerFooter}><label className={styles.detailInternalNote}><input type="checkbox" checked={saveToFaq} disabled={posting || Boolean(pendingFaq) || Boolean(pendingCommentUpload) || !service?.saveFaq} onChange={event => setSaveToFaq(event.target.checked)} />Create Knowledge Base draft</label><PrimaryButton type="submit" text={posting ? 'Posting…' : pendingCommentUpload ? 'Retry attachments' : 'Post Comment'} iconProps={{iconName: 'Send'}} disabled={posting || Boolean(pendingFaq) || commentsLoading || !comment.trim() || !service?.addComment} /></div></form>
      </section>
      </article>
      <aside className={styles.detailSidebar} aria-label="Ticket information">
        <section className={styles.detailSidebarCard}>
          <div className={`${styles.detailSectionHeading} ${styles.ticketMetadataHeading}`}><h3>Ticket Details</h3><DefaultButton styles={{root:{height:26,minWidth:0,padding:"0 6px",background:"transparent",border:0,color:"#172536"},rootHovered:{background:"transparent",color:"#172536"},icon:{color:"#172536",fontSize:13},label:{fontSize:12,fontWeight:400}}} text="History" iconProps={{iconName:"History"}} title="Ticket history" ariaLabel="Open ticket history" onClick={()=>setHistoryOpen(true)} /></div>
          <dl className={styles.detailSidebarMetadata}>
            <div><dt><Icon iconName="Ticket" />Ticket ID</dt><dd>#{ticket.Id}</dd></div>
            <div><dt><Icon iconName="ProgressRingDots" />Status</dt><dd><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></dd></div>
            <div><dt><Icon iconName="Flag" />Priority</dt><dd><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span></dd></div>
            <div><dt><Icon iconName="Tag" />Category</dt><dd>{ticket.Category || 'Not specified'}</dd></div>
            <div><dt><Icon iconName="Tag" />Sub Category</dt><dd>{ticket.Subcategory || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Ticket Type</dt><dd>{ticket.TicketType || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Issue Type</dt><dd>{ticket.IssueType || 'Not specified'}</dd></div><div><dt><Icon iconName="Work" />Department</dt><dd>—</dd></div><div><dt><Icon iconName="Calendar" />Created</dt><dd>{date(ticket.Created)}</dd></div>
            <div><dt><Icon iconName="Clock" />Last updated</dt><dd>{date(ticket.Modified)}</dd></div>
            <div><dt><Icon iconName="Contact" />Assigned to</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.AssignedTo?.Title || 'Unassigned'} coinSize={28} /></span>{ticket.AssignedTo?.Title || 'Unassigned'}</dd></div>
            {ticket.DueDate && <div><dt><Icon iconName="Calendar" />Due date</dt><dd>{date(ticket.DueDate)}</dd></div>}
            <div><dt><Icon iconName="Warning" />Escalated</dt><dd>{ticket.Escalated || ticket.Status === 'Escalated' ? 'Yes' : 'No'}</dd></div>
            <div><dt><Icon iconName="Contact" />Requester</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || 'Not available'} coinSize={28} /></span>{ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || 'Not available'}</dd></div>
            <div><dt><Icon iconName="Contact" />Created By</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'} coinSize={28} /></span>{ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'}</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  </section>;
}
