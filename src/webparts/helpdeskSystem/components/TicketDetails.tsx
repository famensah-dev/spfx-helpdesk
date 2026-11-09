import { TicketActivity } from './TicketActivity';
import { CommentComposer } from './CommentComposer';
import { TicketDueDatePicker } from './TicketDueDatePicker';
import { canUse, isTicketSubmittedBy, isAgentCreatedTicket } from '../services/appRoleRules';
import type { IFaqInput } from '../interfaces/IFaq';
import { TicketClassificationFields } from './TicketClassificationFields';
import { RichTextEditor, RichTextContent } from './RichTextEditor';
import { MarkdownContent } from './MarkdownEditor';
import { cancelButtonStyles } from './cancelButtonStyles';
import { FormAssigneePicker } from './FormAssigneePicker';
import * as React from 'react';
import { DefaultButton, PrimaryButton, PersonaCoin, Icon, IconButton, Panel, PanelType, TextField, Dropdown, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicket, IUserLookup, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import type { ITicketDataSource, ITicketComment, ITicketVersion } from '../interfaces/ITicketDataSource';
import { ticketStatuses, normalizeStatus } from '../utils/ticketStatuses';
import { AttachmentFiles, AttachmentPicker } from './AttachmentFiles';
import { TicketAttachments } from './TicketAttachments';
import { Dialog, DialogFooter } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';

export function TicketDetails(props: { ticket: ITicket; tickets: ITicket[]; service?: ITicketDataSource; refresh: () => Promise<void>; onBack: () => void; backLabel?: string }): React.ReactElement {
  const { ticket, service } = props;
  const agent = !service?.roleRules && service?.access?.agent === true;
  const handlingAgent = agent || (service?.roleRules?.id === 'agent' && service.roleRules.scope === 'assigned');
  const canManage = !handlingAgent || ticket.AssignedTo?.Email?.toLowerCase() === service?.access?.email.toLowerCase();
  const ownAgentRequest = Boolean((agent || service?.roleRules?.id === 'agent') && isTicketSubmittedBy(ticket, 0, service?.access?.email || '', service?.access?.oid));
  const canChangeStatus = canManage || ownAgentRequest;
  const canAssignCreated = isAgentCreatedTicket(ticket, service);
  const canCloseTicket = Boolean(service?.access?.admin || service?.access?.superAdmin || ownAgentRequest);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [viewTrackingError,setViewTrackingError]=React.useState('');
  React.useEffect(()=>{let active=true;setViewTrackingError('');service?.ticketViews?.markOpened(ticket.Id).catch(()=>{if(active)setViewTrackingError('The ticket is open, but its opened indicator could not be saved.');});return()=>{active=false;};},[service?.ticketViews,ticket.Id]);
  const [requesterBusy,setRequesterBusy]=React.useState(false);
  const [requesterPerson,setRequesterPerson]=React.useState<IUserLookup | null>(null);
  const [extraEdit,setExtraEdit]=React.useState<{requestedById?:number|null;requesterName?:string;requesterEmail?:string;dueDate?:string;department?:string;ticketSource?:string}>({});
  const [editSources,setEditSources]=React.useState<string[]>(['DeskPilot','Forms','Email','Phone / Call-in','Other']);
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
  const [attachmentCount,setAttachmentCount]=React.useState<number>();
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
  const [commentHtml,setCommentHtml]=React.useState('');
  const [commentFiles,setCommentFiles] = React.useState<File[]>([]);
  const [uploadProgress,setUploadProgress] = React.useState('');
  const [pendingCommentUpload,setPendingCommentUpload] = React.useState<{id:string;faq?:IFaqInput}>();
  const commentPostId = React.useRef('');
  const [saveToFaq, setSaveToFaq] = React.useState(false);
  const [pendingFaq, setPendingFaq] = React.useState<IFaqInput | null>(null);
  const [faqMessage, setFaqMessage] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState('comments');
  React.useEffect(()=>{if(activeSection==='resolution' && !ticket.ResolutionSummary?.trim())setActiveSection('comments');},[activeSection,ticket.ResolutionSummary]);
  const [newestFirst, setNewestFirst] = React.useState(false);
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
    if (!historyOpen && activeSection !== 'activity') return;
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
  }, [historyOpen, activeSection, historyReload, service, ticket.Id]);
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
  const commentDate = (value:string):string => {const parsed=new Date(value);return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', '+parsed.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}).replace(/[\s\u00a0\u202f]+(AM|PM)/g,' $1') : 'Not provided';};
  const beginEdit = (): void => { setExtraEdit({});setRequesterPerson(ticket.Requester?.Id ? ticket.Requester : null);service?.getCreationOptions?.().then(value=>{if(value.ticketSources)setEditSources(value.ticketSources);}).catch(()=>undefined);setEditFiles([]); setClassificationEdit({}); setTitle(ticket.Title); setDescription(ticket.Description || ''); setPriority(ticket.Priority); setStatus(normalizeStatus(ticket.Status)); setAssigned(ticket.AssignedTo?.Id || 0); setAssignedName(ticket.AssignedTo?.Title || 'Unassigned'); setError(''); setSaved(false); setEditing(true); };
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (!service?.updateTicket || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      await service.updateTicket(ticket.Id, {title, description: description !== (ticket.Description || '') ? description : undefined, priority, status, assignedToId: assigned || null, ...classificationEdit,...extraEdit});
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
    catch (reason) { setCommentsError(reason instanceof Error ? reason.message : 'Unable to save the knowledge base article.'); }
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
        await service.addComment(ticket.Id,comment,{html:commentHtml,files:commentFiles,requestId:commentPostId.current,onProgress:setUploadProgress});
      }
      commentSaved = true; setComment('');setCommentHtml(''); setCommentFiles([]); setPendingCommentUpload(undefined); setSaveToFaq(false); commentPostId.current = '';
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
    if (next === 'Closed' && !canCloseTicket) {setError('Only Helpdesk Admins or an agent who submitted the request can close tickets.');return;}
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
    <Dialog minWidth={320} maxWidth={720} hidden={!statusTarget && !clearResolution} onDismiss={saving ? undefined : ()=>{setStatusTarget(undefined);setClearResolution(false);}} dialogContentProps={{title:clearResolution ? 'Clear Resolution Summary?' : statusTarget==='Resolved' ? 'Complete Ticket?' : 'Change Ticket Status'}} modalProps={{isBlocking:saving,styles:{main:{width:"min(720px, calc(100vw - 32px))",maxWidth:720,selectors:{"@media (min-width: 480px)":{width:"min(720px, calc(100vw - 32px))",minWidth:0,maxWidth:720}}}}}}><p>{clearResolution ? 'Clear the summary and remove the comment solution tag? The ticket status will remain unchanged.' : statusTarget==='Resolved' ? 'Mark this ticket as completed?' : 'Change ticket status to '+statusTarget+'?'}</p>{!clearResolution && statusTarget && ['Resolved','Completed','Closed'].includes(statusTarget) && !ticket.ResolutionSummary?.trim() && <TextField label="Resolution Summary" required multiline rows={4} maxLength={10000} value={resolutionDraft} disabled={saving} onChange={(_,value)=>setResolutionDraft(value || '')} />}{statusError && <MessageBar messageBarType={MessageBarType.error}>{statusError}</MessageBar>}<DialogFooter><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={saving} onClick={()=>{setStatusTarget(undefined);setClearResolution(false);}} /><PrimaryButton text={saving ? 'Saving...' : 'Confirm'} disabled={saving} onClick={()=>{void confirmStatus();}} /></DialogFooter></Dialog>
    <Dialog hidden={!commentAction} onDismiss={() => {if (!actionBusy) setCommentAction(undefined);}} dialogContentProps={{title:commentAction?.kind === 'solution' ? 'Mark as Solution' : 'Publish to Knowledge Base'}} modalProps={{isBlocking:actionBusy}}><p>{commentAction?.kind === 'solution' ? (ticket.ResolutionSummary ? 'Replace the existing Resolution Summary with this comment? Ticket status will remain unchanged.' : 'Use this comment as the Resolution Summary? Ticket status will remain unchanged.') : 'Publish this comment to the Knowledge Base using the ticket title as the article title? Attached files will remain on the comment.'}</p>{actionError && <MessageBar messageBarType={MessageBarType.error}>{actionError}</MessageBar>}<DialogFooter><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={actionBusy} onClick={() => setCommentAction(undefined)} /><PrimaryButton text={actionBusy ? 'Saving…' : 'Confirm'} disabled={actionBusy} onClick={() => {void runCommentAction();}} /></DialogFooter></Dialog><h2 className={styles.srOnly} ref={heading} tabIndex={-1}>Ticket #{ticket.Id}</h2>
    {viewTrackingError && <MessageBar messageBarType={MessageBarType.warning} onDismiss={()=>setViewTrackingError('')}>{viewTrackingError}</MessageBar>}
    {assignmentMessage && <MessageBar messageBarType={assignmentBusy ? MessageBarType.info : MessageBarType.success} onDismiss={assignmentBusy ? undefined : () => setAssignmentMessage('')}>{assignmentMessage}</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {saved && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>Ticket changes saved.</MessageBar>}
    <Panel isOpen={historyOpen} type={PanelType.custom} customWidth="360px" headerText="Ticket History" closeButtonAriaLabel="Close issue history" isLightDismiss onDismiss={() => setHistoryOpen(false)} styles={{ main: { maxWidth: '100vw', background: "var(--dp-bg-fbfdff, #fbfdff)" }, commands: { paddingTop: 0, background: "var(--dp-bg-f3f7ff, #f3f7ff)", borderBottom: "1px solid var(--dp-line-dce5f1, #dce5f1)" }, navigation: { alignItems: 'center', minHeight: 54 }, header: { padding: '14px 20px', alignSelf: 'center' }, closeButton: { margin: '0 12px 0 0', width: 32, height: 32, background: 'transparent', color: "var(--dp-fg-526783, #526783)" }, headerText: { fontSize: 16, fontWeight: 600 }, content: { padding: '0 20px 20px' } }}>
      <div className={styles.issueHistory}>
        <div className={styles.historyToolbar}><span>Ticket #{ticket.Id}</span><div><IconButton styles={cancelButtonStyles} iconProps={{iconName:historyNewestFirst ? 'SortDown' : 'SortUp'}} title={historyNewestFirst ? 'Newest first - change order' : 'Oldest first - change order'} ariaLabel="History sort order" menuProps={{items:[{key:'newest',text:'Newest First',canCheck:true,checked:historyNewestFirst,onClick:()=>setHistoryNewestFirst(true)},{key:'oldest',text:'Oldest First',canCheck:true,checked:!historyNewestFirst,onClick:()=>setHistoryNewestFirst(false)}]}} /><IconButton iconProps={{iconName:'Refresh'}} title="Refresh history" ariaLabel="Refresh history" disabled={historyLoading} onClick={()=>setHistoryReload(value=>value+1)} /></div></div>
        {historyError && <MessageBar messageBarType={MessageBarType.error}>{historyError}</MessageBar>}
        {historyLoading ? <Spinner label="Loading issue history…" /> : !historyError && (history.length ? <ol>{[...history].sort((a,b)=>(new Date(a.modified).getTime()-new Date(b.modified).getTime())*(historyNewestFirst ? -1 : 1)).map(version => {
          const createdVersion = new Date(version.modified).getTime() === new Date(ticket.Created).getTime();
          return <li key={version.id} data-created={createdVersion}><span className={styles.historyEventIcon} aria-hidden="true"><Icon iconName={createdVersion ? 'Add' : 'Edit'} /></span><div><div className={styles.historyItemHeading}><strong>{createdVersion ? 'Ticket Created' : 'Details Updated'}</strong><time dateTime={version.modified}>{date(version.modified)}</time></div><p>{createdVersion ? 'The helpdesk request was submitted by ' : 'Issue version saved by '}<b>{version.author}</b>.</p></div></li>;
        })}</ol> : <p>No saved versions were returned. Check the list’s versioning settings if you expect earlier changes.</p>)}
      </div>
    </Panel>
    <div className={styles.ticketDetailLayout}>
      <article className={`${styles.ticketDetailBody} ${styles.ticketConversation}`}>
        <div className={styles.detailSummary}>
          <header className={styles.conversationHeader}>
            <button className={styles.conversationBack} type="button" disabled={saving || posting} onClick={props.onBack}><Icon iconName="Back" />{props.backLabel || 'Tickets'}</button>
            <div className={styles.conversationActions}><span className={styles.conversationResolve}><PrimaryButton styles={{root:{height:26,minWidth:0,padding:'0 9px',border:0,borderRadius:0,background:"var(--dp-bg-00899b, #00899b)",color:"var(--dp-fg-fff, #fff)"},rootHovered:{background:"var(--dp-bg-00798a, #00798a)",color:"var(--dp-fg-fff, #fff)"},rootPressed:{background:"var(--dp-bg-006d7d, #006d7d)",color:"var(--dp-fg-fff, #fff)"},label:{fontSize:12,fontWeight:500},icon:{fontSize:12}}} text={['Resolved','Completed','Closed'].includes(ticket.Status) ? 'Close' : 'Resolve'}  disabled={!service?.updateTicket || !canChangeStatus || !canUse(service,'status') || saving || ticket.Status==='Closed' || (['Resolved','Completed'].includes(ticket.Status) && !canCloseTicket)} onClick={()=>openStatus(['Resolved','Completed'].includes(ticket.Status) ? 'Closed' : 'Resolved')} /><IconButton ariaLabel="Change ticket status" title="Change ticket status" menuIconProps={{iconName:'ChevronDown'}} disabled={!service?.updateTicket || !canChangeStatus || !canUse(service,'status') || saving} menuProps={{items:ticketStatuses.filter(value=>value!==normalizeStatus(ticket.Status) && (value!=='Closed' || canCloseTicket)).map(value=>({key:value,text:value,onClick:()=>openStatus(value)}))}} /></span><DefaultButton text="Edit" iconProps={{iconName:'Edit'}} ariaLabel="Edit ticket" title="Edit ticket" styles={{root:{background:"var(--dp-bg-f0f2f5, #f0f2f5)",border:0,borderRadius:4,color:"var(--dp-fg-172536, #172536)",padding:'0 10px'},rootHovered:{background:"var(--dp-bg-e5e9ef, #e5e9ef)",border:0,color:"var(--dp-fg-172536, #172536)"},rootPressed:{background:"var(--dp-bg-dce2e9, #dce2e9)",border:0,color:"var(--dp-fg-172536, #172536)"},label:{fontWeight:400,fontSize:12},icon:{color:"var(--dp-fg-172536, #172536)",fontSize:12}}} disabled={!service?.updateTicket || !canManage || saving} onClick={beginEdit} /></div>
            <h3 className={styles.detailSubject}>#{ticket.Id} {"\u00b7"} {ticket.Title}</h3><p className={styles.detailSubmitted}>Submitted by {ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'} {"\u00b7"} {date(ticket.Created)} <span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></p>
          </header>
          <section className={styles.ticketDescriptionBox} aria-label="Description"><div className={styles.ticketDescription}>{/<\/?(?:p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(ticket.Description || '') ? <RichTextContent value={ticket.Description!} /> : ticket.Description?.trim() ? <MarkdownContent value={ticket.Description} /> : <p className={styles.conversationEmpty}>No description added.</p>}</div></section>

        </div>
        <Dialog hidden={!editing} onDismiss={saving ? undefined : () => setEditing(false)} minWidth={320} maxWidth={1100} dialogContentProps={{title:"Edit Ticket",showCloseButton:!saving}} modalProps={{isBlocking:saving,styles:{main:{width:"min(1100px, calc(100vw - 32px))",maxWidth:1100,selectors:{"@media (min-width: 480px)":{width:"min(1100px, calc(100vw - 32px))",minWidth:0,maxWidth:1100}}}}}}><form className={styles.ticketEditForm} onSubmit={event => { void save(event); }}>
          <div className={styles.detailSectionHeading}><Icon iconName="Edit" /><h3>Edit Details</h3></div>
          <div className="ticket-title-source-row"><TextField label="Title" required value={title} maxLength={255} disabled={saving || !canUse(service, 'edit')} onChange={(_, value) => setTitle(value || '')} />{ticket.TicketSource ? <TextField label="Ticket Source" value={ticket.TicketSource} readOnly /> : <Dropdown label="Ticket Source" placeholder="Select source" selectedKey={extraEdit.ticketSource || ''} disabled={saving || !canUse(service,'edit')} options={editSources.map(value=>({key:value,text:value==='Forms'?'Microsoft Forms':value}))} onChange={(_,option)=>setExtraEdit(current=>({...current,ticketSource:String(option?.key || '')}))} />}</div>
          <RichTextEditor value={description} disabled={saving || !canUse(service, 'edit')} onChange={setDescription} />
          {service?.uploadAttachments && <AttachmentPicker compact files={editFiles} onChange={setEditFiles} disabled={saving || !canUse(service, 'edit')} />}
          <div className={styles.detailFormGrid}>
            <Dropdown label="Priority" selectedKey={priority} disabled={saving || agent || !canUse(service, 'priority')} options={Array.from(new Set([...priorityOptions, ticket.Priority])).map(value => ({key: value, text: value}))} onChange={(_, option) => setPriority(option?.key as TicketPriority)} />
            <Dropdown label="Status" selectedKey={status} disabled={saving || !canUse(service, 'status')} options={ticketStatuses.filter(value => !agent || !['Resolved', 'Completed', 'Closed'].includes(ticket.Status) || ['Resolved', 'Closed'].includes(value)).map(value => ({key: value, text: value}))} onChange={(_, option) => setStatus(option?.key as TicketStatus)} />
          <Dropdown label="Ticket Type" selectedKey={classificationEdit.ticketType || ticket.TicketType || ''} disabled={saving || !canUse(service, 'edit')} options={[{key: '', text: 'Not Specified', disabled: true}, ...['Problem', 'Incident', 'Question', 'Request'].map(value => ({key: value, text: value}))]} onChange={(_,option) => { if (option) setClassificationEdit(current => ({...current, ticketType: String(option.key)})); }} />
          </div>
            <FormAssigneePicker service={service} value={assigned ? { Id: assigned, Title: assignedName } : null} disabled={saving || agent || !canUse(service, 'assign')} onBusy={setAssignmentBusy} onChange={person => { setAssigned(person?.Id || 0); setAssignedName(person?.Title || person?.Email || 'Unassigned'); }} />
          
          
          <details className={styles.newTicketAdvanced}><summary>Show All</summary><TicketClassificationFields service={service} ticket={ticket} disabled={saving || !canUse(service, 'edit')} onChange={value => setClassificationEdit(current => ({ ...current, ...value }))} /><div className={styles.detailFormGrid}>
            <FormAssigneePicker label="Requested By" service={service} value={requesterPerson} disabled={saving || !canUse(service,'edit')} onBusy={setRequesterBusy} onChange={person=>{setRequesterPerson(person);setExtraEdit(current=>({...current,requestedById:person?.Id || null,requesterName:person?.Title || '',requesterEmail:person?.Email || ''}));}} />
            <TextField label="Requester Name" maxLength={255} value={extraEdit.requesterName ?? ticket.Requester?.Title ?? ''} disabled={saving || !canUse(service,'edit')} readOnly={Boolean(requesterPerson)} onChange={(_,value)=>setExtraEdit(current=>({...current,requesterName:value || ''}))} />
            <TextField label="Requester Email" type="email" maxLength={254} value={extraEdit.requesterEmail ?? ticket.RequesterEmail ?? ticket.Requester?.Email ?? ''} disabled={saving || !canUse(service,'edit')} readOnly={Boolean(requesterPerson)} onChange={(_,value)=>setExtraEdit(current=>({...current,requesterEmail:value || ''}))} />
          </div><div className={styles.newTicketFields}>
            <TextField label="Department" value={extraEdit.department ?? ticket.Department ?? ''} disabled={saving || !canUse(service,'edit')} onChange={(_,value)=>setExtraEdit(current=>({...current,department:value || ''}))} />
            <TicketDueDatePicker value={extraEdit.dueDate ?? ticket.DueDate ?? ''} disabled={saving || !canUse(service,'edit')} onChange={value=>setExtraEdit(current=>({...current,dueDate:value}))} />
          </div></details>
          {editUploadProgress && <Spinner label={editUploadProgress} />}
          <div className={styles.detailSaveBar}><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={saving} onClick={() => setEditing(false)} /><PrimaryButton type="submit" text={saving ? 'Saving…' : 'Save Changes'} iconProps={{iconName: 'Save'}} disabled={saving || assignmentBusy || requesterBusy || !title.trim()} /></div>
        </form></Dialog>
        <nav className={styles.detailSectionNav} aria-label="Ticket sections">{[{key:'comments',label:`Comments (${comments.length})`},{key:'attachments',label:attachmentCount===undefined ? 'Attachments' : `Attachments (${attachmentCount})`},...(ticket.ResolutionSummary?.trim() ? [{key:'resolution',label:'Resolution Summary'}] : []),{key:'activity',label:'Activity'}].map(tab=><button key={tab.key} type="button" disabled={tab.key==='attachments' && !service?.getAttachments} data-active={activeSection===tab.key} aria-current={activeSection===tab.key ? 'page' : undefined} onClick={()=>setActiveSection(tab.key)}>{tab.label}</button>)}{activeSection==='comments' && <div className={styles.conversationTabActions}><IconButton iconProps={{iconName:'SortLines'}} title={newestFirst ? 'Newest first - click for oldest first' : 'Oldest first - click for newest first'} ariaLabel="Sort comments" onClick={()=>setNewestFirst(value=>!value)} /><IconButton iconProps={{iconName:'Refresh'}} title="Refresh comments" ariaLabel="Refresh comments" disabled={commentsLoading || posting} onClick={()=>{void loadComments();}} /></div>}</nav>
        {activeSection==='resolution' && ticket.ResolutionSummary?.trim() && <section aria-label="Resolution summary" className={styles.ticketResolutionBody}>{canSelectSolution && service?.updateTicket && <div className={styles.resolutionSummaryActions}><DefaultButton styles={cancelButtonStyles} text="Clear Resolution Summary" disabled={saving} onClick={()=>{setStatusError('');setClearResolution(true);}} /></div>}<div className={styles.resolutionSummaryContent}>{ticket.SolutionCommentId ? <p style={{whiteSpace:'pre-wrap'}}>{ticket.ResolutionSummary}</p> : <RichTextContent value={ticket.ResolutionSummary} />}</div></section>}
        {activeSection==='activity' && <section aria-label="Ticket activity">{historyError && <MessageBar messageBarType={MessageBarType.error}>{historyError}</MessageBar>}{historyLoading ? <Spinner label="Loading activity..." /> : <TicketActivity ticket={ticket} history={history} comments={comments} />}</section>}
        {activeSection === 'attachments' && <section aria-label="Ticket attachments"><TicketAttachments id={ticket.Id} service={service} refreshKey={attachmentRevision} comments={comments} onCount={setAttachmentCount} canUpload={canManage && canUse(service,'edit')} /></section>}

      {faqMessage && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setFaqMessage('')}>{faqMessage}</MessageBar>}
      {pendingFaq && <MessageBar messageBarType={MessageBarType.warning}>Your comment is saved; its Knowledge Base draft still needs to be saved. <DefaultButton text="Retry Save to Knowledge Base" disabled={posting} onClick={() => { void retryFaq(); }} /><DefaultButton text="Dismiss" disabled={posting} styles={cancelButtonStyles} onClick={() => setPendingFaq(null)} /></MessageBar>}
      <section hidden={activeSection !== 'comments'} style={activeSection !== 'comments' ? {display:'none'} : undefined} ref={commentsSection} className={styles.ticketComments} aria-label="Ticket comments">

        <div className={styles.commentDisplay} hidden={!commentsLoading && !commentsError && !comments.length}>
        {commentsError && <MessageBar messageBarType={MessageBarType.error}>{commentsError}</MessageBar>}
        {commentsLoading ? <div className={styles.conversationLoading}><Spinner label="Loading comments…" /></div> : <div className={styles.commentThread} aria-live="polite">{[...comments].sort((a, b) => (new Date(a.created).getTime() - new Date(b.created).getTime()) * (newestFirst ? -1 : 1)).map(value => <article key={value.id} className={styles.commentEntry}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={value.author} coinSize={24} /></span><div className={styles.commentContent}><header><strong>{value.author}</strong><time dateTime={value.created}>{commentDate(value.created)}</time>{ticket.SolutionCommentId === value.id && <span className={styles.commentSolution}><Icon iconName="CompletedSolid" /> Solution</span>}</header>{value.html ? <RichTextContent value={value.html} /> : <p>{value.text}</p>}{!!value.attachments?.length && <AttachmentFiles files={value.attachments} />}{value.attachmentError && <MessageBar messageBarType={MessageBarType.warning}>{value.attachmentError} Refresh comments to retry.</MessageBar>}</div>{((canSelectSolution && service?.markCommentAsSolution && ticket.SolutionCommentId!==value.id) || service?.saveFaq) && <IconButton iconProps={{iconName:'More'}} menuIconProps={{iconName:''}} ariaLabel={`Actions for comment by ${value.author}`} disabled={actionBusy} menuProps={{items:[...(canSelectSolution && service?.markCommentAsSolution && ticket.SolutionCommentId!==value.id ? [{key:'solution',text:'Mark as Solution',onClick:()=>{setActionError('');setCommentAction({kind:'solution',comment:value});}}] : []),...(service?.saveFaq ? [{key:'faq',text:'Publish to Knowledge Base',onClick:()=>{setActionError('');setCommentAction({kind:'faq',comment:value});}}] : [])]}} />}</article>)}</div>}
        </div>
        <form onSubmit={event=>{void post(event);}} className={styles.commentComposer}>
          <CommentComposer value={comment} disabled={posting || Boolean(pendingCommentUpload) || !service?.addComment} posting={posting} retry={Boolean(pendingCommentUpload)} canAttach={Boolean(service?.uploadCommentAttachments)} canPost={!posting && !pendingFaq && !commentsLoading && !!comment.trim() && !!service?.addComment} files={commentFiles} onFiles={setCommentFiles} onChange={(text,html)=>{setComment(text);setCommentHtml(html);}} />
          {saveToFaq && <p className={styles.conversationEmpty}>A Knowledge Base draft will be created with this comment.</p>}
          {pendingCommentUpload && <MessageBar messageBarType={MessageBarType.warning}>Your comment is already saved. Retry attachments to finish uploading the selected files without posting another comment.</MessageBar>}{posting && uploadProgress && <Spinner label={uploadProgress} />}
        </form>
      </section>
      </article>
      <aside className={styles.detailSidebar} aria-label="Ticket information">
        <section className={styles.detailSidebarCard}>
          <div className={`${styles.detailSectionHeading} ${styles.ticketMetadataHeading}`}><h3>Ticket Details</h3><div style={{display:"flex",alignItems:"center",gap:4}}><DefaultButton styles={{root:{height:26,minWidth:0,padding:"0 6px",background:"transparent",border:0,color:"var(--dp-fg-172536, #172536)"},rootHovered:{background:"transparent",color:"var(--dp-fg-172536, #172536)"},rootPressed:{background:"transparent",color:"var(--dp-fg-172536, #172536)"},icon:{color:"var(--dp-fg-172536, #172536)",fontSize:13},label:{fontSize:12,fontWeight:400}}} text="History" iconProps={{iconName:"History"}} title="Ticket history" ariaLabel="Open ticket history" onClick={()=>setHistoryOpen(true)} /></div></div>
          <dl className={styles.detailSidebarMetadata}>
            <div><dt><Icon iconName="Ticket" />Ticket ID</dt><dd>#{ticket.Id}</dd></div>
            <div><dt><Icon iconName="ProgressRingDots" />Status</dt><dd><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></dd></div>
            <div><dt><Icon iconName="Flag" />Priority</dt><dd><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span></dd></div>
            <div><dt><Icon iconName="Tag" />Category</dt><dd>{ticket.Category || 'Not specified'}</dd></div>
            <div><dt><Icon iconName="Tag" />Sub Category</dt><dd>{ticket.Subcategory || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Ticket Type</dt><dd>{ticket.TicketType || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Issue Type</dt><dd>{ticket.IssueType || 'Not specified'}</dd></div><div><dt><Icon iconName="Work" />Department</dt><dd>—</dd></div><div><dt><Icon iconName="Calendar" />Created</dt><dd>{date(ticket.Created)}</dd></div>
            <div><dt><Icon iconName="Clock" />Last Updated</dt><dd>{date(ticket.Modified)}</dd></div>
            <div><dt><Icon iconName="Contact" />Assigned To</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.AssignedTo?.Title || 'Unassigned'} coinSize={28} /></span>{ticket.AssignedTo?.Title || 'Unassigned'}</dd>
              {canAssignCreated && service?.updateTicket && <div>
                <FormAssigneePicker label="Assign Ticket" service={service} value={assigned ? {Id:assigned,Title:assignedName} : null} disabled={saving} onBusy={setAssignmentBusy} onChange={person=>{setAssigned(person?.Id || 0);setAssignedName(person?.Title || person?.Email || 'Unassigned');}} />
                <DefaultButton text="Save Assignment" disabled={saving || assignmentBusy || assigned === (ticket.AssignedTo?.Id || 0)} onClick={()=>{setSaving(true);setError('');void service.updateTicket!(ticket.Id,{title:ticket.Title,priority:ticket.Priority,status:ticket.Status,assignedToId:assigned || null}).then(()=>props.refresh()).catch(reason=>setError(reason instanceof Error ? reason.message : 'Unable to assign ticket.')).finally(()=>setSaving(false));}} />
              </div>}
            </div>
            {ticket.DueDate && <div><dt><Icon iconName="Calendar" />Due Date</dt><dd>{date(ticket.DueDate)}</dd></div>}
            <div><dt><Icon iconName="Warning" />Escalated</dt><dd>{ticket.Escalated || ticket.Status === 'Escalated' ? 'Yes' : 'No'}</dd></div>
            <div><dt><Icon iconName="Contact" />Requester</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || 'Not available'} coinSize={28} /></span>{ticket.Requester?.Title || ticket.Requester?.Email || ticket.RequesterEmail || 'Not available'}</dd></div>
            <div><dt><Icon iconName="Contact" />Created By</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true"><PersonaCoin text={ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'} coinSize={28} /></span>{ticket.CreatedBy?.Title || ticket.CreatedBy?.Email || 'Not available'}</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  </section>;
}
