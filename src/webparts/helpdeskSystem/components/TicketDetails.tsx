import { canUse } from '../services/appRoleRules';
import type { IFaqInput } from '../interfaces/IFaq';
import { TicketClassificationFields } from './TicketClassificationFields';
import { RichTextEditor, RichTextContent } from './RichTextEditor';
import { MarkdownContent } from './MarkdownEditor';
import { cancelButtonStyles } from './cancelButtonStyles';
import { FormAssigneePicker } from './FormAssigneePicker';
import { Label } from '@fluentui/react';
import * as React from 'react';
import { DefaultButton, PrimaryButton, Icon, IconButton, Panel, PanelType, TextField, Dropdown, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import type { ITicketDataSource, ITicketComment, ITicketVersion } from '../interfaces/ITicketDataSource';
import { ticketStatuses, normalizeStatus } from '../utils/ticketStatuses';
import { AttachmentFiles, AttachmentPicker } from './AttachmentFiles';
import { TicketAttachments } from './TicketAttachments';
import { PersonContact } from './PersonContact';
import { Dialog, DialogFooter } from '@fluentui/react';
import styles from './HelpdeskSystem.module.scss';

export function TicketDetails(props: { ticket: ITicket; tickets: ITicket[]; service?: ITicketDataSource; refresh: () => Promise<void>; onBack: () => void; backLabel?: string }): React.ReactElement {
  const { ticket, service } = props;
  const agent = !service?.roleRules && service?.access?.agent === true;
  const canManage = !agent || ticket.AssignedTo?.Email?.toLowerCase() === service?.access?.email.toLowerCase();
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [classificationEdit, setClassificationEdit] = React.useState<{ category?: string; subcategory?: string; issueType?: string; ticketType?: string }>({});
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
  const [activeSection, setActiveSection] = React.useState('details');
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
        if (!access?.canManage || !service?.saveFaq) throw new Error('FAQ management permission is required to publish.');
        const category = access.categoryOptions?.find(item => item.name === ticket.Category);
        const subcategory = access.subcategoryOptions?.find(item => item.name === ticket.Subcategory && item.parentId === category?.id);
        const escape = (value:string):string => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        await service.saveFaq({sourceTicketId:ticket.Id,question:ticket.Title,answer:'<p>'+escape(selected.text).replace(/\n/g,'<br>')+'</p>',category:ticket.Category || '',subcategory:ticket.Subcategory || '',categoryId:category?.id,subcategoryId:subcategory?.id,keywords:'',published:true,sortOrder:0});
        setFaqMessage('Comment published as an FAQ.');
      }
      setCommentAction(undefined);
    } catch (reason) {setActionError(reason instanceof Error ? reason.message : 'Unable to save.');}
    finally {actionLock.current=false;setActionBusy(false);}
  };
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [history, setHistory] = React.useState<ITicketVersion[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyError, setHistoryError] = React.useState('');
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
  const descriptionSection = React.useRef<HTMLElement>(null);
  const commentsSection = React.useRef<HTMLElement>(null);
  const attachmentsSection = React.useRef<HTMLElement>(null);
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
  const date = (value?: string | null): string => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Not provided';
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
    try { await service.saveFaq(pendingFaq); setPendingFaq(null); setFaqMessage('Comment saved as an inactive FAQ draft.'); }
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
        if ((!access?.canManage && !access?.canSubmitDraft) || !service.saveFaq) throw new Error('You need FAQ management permission to save this comment as an FAQ.');
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
        setPendingFaq(null); setFaqMessage('Comment posted and saved as an inactive FAQ draft.');
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
  const initials = (name: string): string => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <section className={`${styles.pageContent} ${styles.detailWorkspace}`} aria-label={`Ticket #${ticket.Id} details`}>
    <Dialog hidden={!commentAction} onDismiss={() => {if (!actionBusy) setCommentAction(undefined);}} dialogContentProps={{title:commentAction?.kind === 'solution' ? 'Mark as solution' : 'Publish as FAQ'}} modalProps={{isBlocking:actionBusy}}><p>{commentAction?.kind === 'solution' ? (ticket.ResolutionSummary ? 'Replace the existing Resolution Summary with this comment? Ticket status will remain unchanged.' : 'Use this comment as the Resolution Summary? Ticket status will remain unchanged.') : 'Publish this comment as an FAQ using the ticket title as its question? Attached files will remain on the comment.'}</p>{actionError && <MessageBar messageBarType={MessageBarType.error}>{actionError}</MessageBar>}<DialogFooter><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={actionBusy} onClick={() => setCommentAction(undefined)} /><PrimaryButton text={actionBusy ? 'Saving…' : 'Confirm'} disabled={actionBusy} onClick={() => {void runCommentAction();}} /></DialogFooter></Dialog><div className={styles.detailToolbar}>
      <div className={styles.detailToolbarTitle}><DefaultButton text={props.backLabel || 'Back to Tickets'} iconProps={{ iconName: 'Back' }} disabled={saving || posting} onClick={props.onBack} /><h2 className={styles.srOnly} ref={heading} tabIndex={-1}>Ticket #{ticket.Id}</h2></div>
      <div className={styles.detailTopActions}>{service?.recordFirstResponse && canManage && ticket.HasResponseTracking && !ticket.FirstRespondedAt && <DefaultButton text="Record first response" disabled={saving || posting} onClick={() => {
        if (!window.confirm('Confirm you have responded to this ticket now. This records the first response time for SLA tracking.')) return;
        setSaving(true); setError('');
        service.recordFirstResponse!(ticket.Id).then(() => props.refresh()).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to record response.')).finally(() => setSaving(false));
      }} />}{!editing ? <PrimaryButton text="Edit Ticket" iconProps={{ iconName: 'Edit' }} disabled={!service?.updateTicket || !canManage} onClick={beginEdit} /> : <span className={styles.editingIndicator}>Editing ticket</span>}<IconButton iconProps={{ iconName: 'History' }} title="Issue history" ariaLabel="Open issue history" onClick={() => setHistoryOpen(true)} /></div>
    </div>
    {assignmentMessage && <MessageBar messageBarType={assignmentBusy ? MessageBarType.info : MessageBarType.success} onDismiss={assignmentBusy ? undefined : () => setAssignmentMessage('')}>{assignmentMessage}</MessageBar>}
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {saved && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>Ticket changes saved.</MessageBar>}
    <Panel isOpen={historyOpen} type={PanelType.custom} customWidth="360px" headerText="Ticket History" closeButtonAriaLabel="Close issue history" isLightDismiss onDismiss={() => setHistoryOpen(false)} styles={{ main: { maxWidth: '100vw', background: '#fbfdff' }, commands: { paddingTop: 0, background: '#f3f7ff', borderBottom: '1px solid #dce5f1' }, navigation: { alignItems: 'center', minHeight: 54 }, header: { padding: '14px 20px', alignSelf: 'center' }, closeButton: { margin: '0 12px 0 0', width: 32, height: 32, background: 'transparent', color: '#526783' }, headerText: { fontSize: 16, fontWeight: 600 }, content: { padding: '0 20px 20px' } }}>
      <div className={styles.issueHistory}>
        <div className={styles.historyToolbar}><span>Ticket #{ticket.Id} · Newest first</span><IconButton iconProps={{ iconName: 'Refresh' }} title="Refresh history" ariaLabel="Refresh history" disabled={historyLoading} onClick={() => setHistoryReload(value => value + 1)} /></div>
        {historyError && <MessageBar messageBarType={MessageBarType.error}>{historyError}</MessageBar>}
        {historyLoading ? <Spinner label="Loading issue history…" /> : !historyError && (history.length ? <ol>{history.map(version => {
          const createdVersion = new Date(version.modified).getTime() === new Date(ticket.Created).getTime();
          return <li key={version.id} data-created={createdVersion}><span className={styles.historyEventIcon} aria-hidden="true"><Icon iconName={createdVersion ? 'Add' : 'Edit'} /></span><div><strong>{createdVersion ? 'Ticket Created' : 'Details Updated'}</strong><p>{createdVersion ? 'The helpdesk request was submitted by ' : 'Issue version saved by '}<b>{version.author}</b>.</p><span className={styles.historyVersion}>Version {version.id}</span><time dateTime={version.modified}>{date(version.modified)}</time></div></li>;
        })}</ol> : <p>No saved versions were returned. Check the list’s versioning settings if you expect earlier changes.</p>)}
      </div>
    </Panel>
    <div className={styles.ticketDetailLayout}>
      <article className={styles.ticketDetailBody}>
        <div className={styles.detailSummary}>
          <div className={styles.detailHero}><div><div className={styles.detailEyebrow}>Ticket ID #{ticket.Id}</div><h3 className={styles.detailSubject}>{ticket.Title}</h3><p className={styles.detailSubmitted}>Submitted {date(ticket.Created)}</p>{ticket.FirstRespondedAt && <p className={styles.detailSubmitted}>First response recorded {date(ticket.FirstRespondedAt)}</p>}</div></div>
          <div className={styles.detailQuickFacts}>
            <div><span>Status</span><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></div>
            <div><span>Priority</span><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span></div>
            <div><span>Category</span><strong className={styles.detailCategoryChip}><Icon iconName="Tag" />{ticket.Category || 'Not specified'}</strong></div><div><span>Sub Category</span><strong className={styles.detailNeutralChip}>—</strong></div>
            {ticket.AssignedUnit && <div><span>Assigned unit</span><strong>{ticket.AssignedUnit}</strong></div>}
            <div><span>Assigned to</span><strong className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true">{ticket.AssignedTo?.Title ? initials(ticket.AssignedTo.Title) : '?'}</span>{ticket.AssignedTo?.Title || 'Unassigned'}</strong></div>
            <div><span>Department</span><strong className={styles.detailAssignee}><Icon iconName="Work" />—</strong></div>
          </div>
        </div>
        {editing ? <form ref={descriptionSection as React.RefObject<HTMLFormElement>} className={styles.ticketEditForm} onSubmit={event => { void save(event); }}>
          <div className={styles.detailSectionHeading}><Icon iconName="Edit" /><h3>Edit details</h3></div>
          <TextField label="Issue" required value={title} maxLength={255} disabled={saving || !canUse(service, 'edit')} onChange={(_, value) => setTitle(value || '')} />
          <RichTextEditor value={description} disabled={saving || !canUse(service, 'edit')} onChange={setDescription} />
          <div className={styles.detailFormGrid}>
            <Dropdown label="Priority" selectedKey={priority} disabled={saving || agent || !canUse(service, 'priority')} options={Array.from(new Set([...priorityOptions, ticket.Priority])).map(value => ({key: value, text: value}))} onChange={(_, option) => setPriority(option?.key as TicketPriority)} />
            <Dropdown label="Status" selectedKey={status} disabled={saving || !canUse(service, 'status')} options={[...ticketStatuses, ...(ticket.Status === 'Escalated' ? ['Escalated'] : [])].filter(value => !agent || !['Resolved', 'Completed', 'Closed'].includes(ticket.Status) || ['Resolved', 'Closed'].includes(value)).map(value => ({key: value, text: value}))} onChange={(_, option) => setStatus(option?.key as TicketStatus)} />
            <FormAssigneePicker service={service} value={assigned ? { Id: assigned, Title: assignedName } : null} disabled={saving || agent || !canUse(service, 'assign')} onBusy={setAssignmentBusy} onChange={person => { if ((person?.Id || 0) !== assigned) setStatus(person?.Id ? 'Assigned' : 'New'); setAssigned(person?.Id || 0); setAssignedName(person?.Title || person?.Email || 'Unassigned'); }} />
          </div>
          <Dropdown label="Ticket Type" selectedKey={classificationEdit.ticketType || ticket.TicketType || ''} disabled={saving || !canUse(service, 'edit')} options={[{key: '', text: 'Not specified', disabled: true}, ...['Problem', 'Incident', 'Question', 'Request'].map(value => ({key: value, text: value}))]} onChange={(_,option) => { if (option) setClassificationEdit(current => ({...current, ticketType: String(option.key)})); }} />
          <TicketClassificationFields service={service} ticket={ticket} disabled={saving || !canUse(service, 'edit')} onChange={value => setClassificationEdit(current => ({ ...current, ...value }))} />
          {service?.uploadAttachments && <div><Label>Attachments</Label><AttachmentPicker files={editFiles} onChange={setEditFiles} disabled={saving || !canUse(service, 'edit')} /></div>}
          {editUploadProgress && <Spinner label={editUploadProgress} />}
          <div className={styles.detailSaveBar}><DefaultButton styles={cancelButtonStyles} text="Cancel" disabled={saving} onClick={() => setEditing(false)} /><PrimaryButton type="submit" text={saving ? 'Saving…' : 'Save changes'} iconProps={{iconName: 'Save'}} disabled={saving || assignmentBusy || !title.trim()} /></div>
        </form> : <>
          <section ref={descriptionSection} className={styles.detailSection}><div className={styles.detailSectionHeading}><Icon iconName="AlignLeft" /><h3>Description</h3></div><div className={styles.ticketDescription}>{/<\/?(?:p|div|br|strong|b|em|ul|ol|h[234])\b/i.test(ticket.Description || '') ? <RichTextContent value={ticket.Description!} /> : <MarkdownContent value={ticket.Description || 'No description has been added to this ticket.'} />}</div></section>
        </>}
        <nav className={styles.detailSectionNav} aria-label="Ticket sections"><button type="button" data-active={activeSection === 'details'} onClick={() => { setActiveSection('details'); descriptionSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Icon iconName="TextDocument" /> Details</button><button type="button" data-active={activeSection === 'comments'} onClick={() => { setActiveSection('comments'); commentsSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon iconName="Comment" /> Comments <span className={styles.commentCount}>{comments.length}</span></button><button type="button" disabled={!service?.getAttachments} data-active={activeSection === 'attachments'} onClick={() => {setActiveSection('attachments');attachmentsSection.current?.scrollIntoView({behavior:'smooth',block:'start'});}}><Icon iconName="Attach" /> Attachments</button><button type="button" onClick={() => setHistoryOpen(true)}><Icon iconName="History" /> History</button><button type="button" disabled title="Related tickets are not available yet"><Icon iconName="BulletedList" /> Related Tickets</button></nav>
      {ticket.ResolutionSummary && <section className={styles.detailSection}><div className={styles.detailSectionHeading}><Icon iconName="CompletedSolid" /><h3>Resolution Summary</h3></div>{ticket.SolutionCommentId ? <p style={{whiteSpace:'pre-wrap'}}>{ticket.ResolutionSummary}</p> : <RichTextContent value={ticket.ResolutionSummary} />}</section>}<section ref={attachmentsSection} aria-label="Ticket attachments"><TicketAttachments id={ticket.Id} service={service} refreshKey={attachmentRevision} /></section>
      {faqMessage && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setFaqMessage('')}>{faqMessage}</MessageBar>}
      {pendingFaq && <MessageBar messageBarType={MessageBarType.warning}>Your comment is saved; its FAQ draft still needs to be saved. <DefaultButton text="Retry Save to FAQ" disabled={posting} onClick={() => { void retryFaq(); }} /><DefaultButton text="Dismiss" disabled={posting} styles={cancelButtonStyles} onClick={() => setPendingFaq(null)} /></MessageBar>}
      <section ref={commentsSection} className={styles.ticketComments} aria-label="Ticket comments">
        <form onSubmit={event => { void post(event); }} className={styles.commentComposer}><div className={styles.detailSectionHeading}><Icon iconName="CommentAdd" /><h3>Add a comment</h3></div><div className={styles.commentEditor}><div className={styles.commentFormatBar} aria-label="Comment formatting"><select disabled aria-label="Text style" title="Rich text formatting is not available yet"><option>Normal</option></select>{[{ icon: 'Bold', label: 'Bold' }, { icon: 'Italic', label: 'Italic' }, { icon: 'Underline', label: 'Underline' }, { icon: 'BulletedList', label: 'Bulleted list' }, { icon: 'NumberedList', label: 'Numbered list' }, { icon: 'AlignLeft', label: 'Align left' }, { icon: 'Link', label: 'Insert link' }, { icon: 'Photo2', label: 'Insert image' }].map(item => <IconButton key={item.icon} iconProps={{ iconName: item.icon }} ariaLabel={item.label} title={`${item.label} is not available yet`} disabled />)}</div><TextField ariaLabel="Comment" placeholder="Type your comment here…" multiline rows={4} maxLength={10000} value={comment} disabled={posting || Boolean(pendingCommentUpload) || !service?.addComment} onChange={(_, value) => setComment(value || '')} /></div><AttachmentPicker files={commentFiles} onChange={setCommentFiles} disabled={posting || !service?.uploadCommentAttachments} />{pendingCommentUpload && <MessageBar messageBarType={MessageBarType.warning}>Your comment is already saved. Retry attachments to finish uploading the selected files without posting another comment.</MessageBar>}{posting && uploadProgress && <Spinner label={uploadProgress} />}<div className={styles.commentComposerFooter}><label className={styles.detailInternalNote}><input type="checkbox" checked={saveToFaq} disabled={posting || Boolean(pendingFaq) || Boolean(pendingCommentUpload) || !service?.saveFaq} onChange={event => setSaveToFaq(event.target.checked)} />Create FAQ draft</label><PrimaryButton type="submit" text={posting ? 'Posting…' : pendingCommentUpload ? 'Retry attachments' : 'Post Comment'} iconProps={{iconName: 'Send'}} disabled={posting || Boolean(pendingFaq) || commentsLoading || !comment.trim() || !service?.addComment} /></div></form>
        <div className={styles.commentDisplay}>
        <div className={styles.conversationHeading}><div><h3>Comments <span className={styles.commentCount}>{comments.length}</span></h3></div><div className={styles.detailTopActions}><select aria-label="Comment order" value={newestFirst ? 'newest' : 'oldest'} onChange={event => setNewestFirst(event.target.value === 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><IconButton styles={cancelButtonStyles} ariaLabel="Refresh comments" title="Refresh comments" iconProps={{iconName: 'Refresh'}} disabled={commentsLoading || posting} onClick={() => { void loadComments(); }} /></div></div>
        {commentsError && <MessageBar messageBarType={MessageBarType.error}>{commentsError}</MessageBar>}
        {commentsLoading ? <div className={styles.conversationLoading}><Spinner label="Loading comments…" /></div> : <div className={styles.commentThread} aria-live="polite">{[...comments].sort((a, b) => (new Date(a.created).getTime() - new Date(b.created).getTime()) * (newestFirst ? -1 : 1)).map(value => <article key={value.id} className={styles.commentEntry}><span className={styles.personInitials} aria-hidden="true">{initials(value.author)}</span><div className={styles.commentContent}><header><strong>{value.author}</strong><time dateTime={value.created}>{date(value.created)}</time></header><p>{value.text}</p>{ticket.SolutionCommentId === value.id && <span className={styles.commentSolution}><Icon iconName="CompletedSolid" /> Solution</span>}<div className={styles.savedCommentActions}>{canSelectSolution && service?.markCommentAsSolution && ticket.SolutionCommentId !== value.id && <DefaultButton styles={cancelButtonStyles} text="Mark as solution" disabled={actionBusy} onClick={() => {setActionError('');setCommentAction({kind:'solution',comment:value});}} />}{service?.saveFaq && <DefaultButton styles={cancelButtonStyles} text="Publish as FAQ" disabled={actionBusy} onClick={() => {setActionError('');setCommentAction({kind:'faq',comment:value});}} />}</div>{!!value.attachments?.length && <AttachmentFiles files={value.attachments} />}{value.attachmentError && <MessageBar messageBarType={MessageBarType.warning}>{value.attachmentError} Refresh comments to retry.</MessageBar>}</div></article>)}{!comments.length && !commentsError && <div className={styles.conversationEmpty}><Icon iconName="Comment" /><strong>No comments yet</strong><p>Share an update or ask a question above.</p></div>}</div>}
        </div>
      </section>
      </article>
      <aside className={styles.detailSidebar} aria-label="Ticket information">
        <section className={styles.detailSidebarCard}>
          <div className={styles.detailSectionHeading}><Icon iconName="SingleBookmark" /><h3>Ticket Details</h3></div>
          <dl className={styles.detailSidebarMetadata}>
            <div><dt><Icon iconName="Ticket" />Ticket ID</dt><dd>#{ticket.Id}</dd></div>
            <div><dt><Icon iconName="ProgressRingDots" />Status</dt><dd><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></dd></div>
            <div><dt><Icon iconName="Flag" />Priority</dt><dd><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span></dd></div>
            <div><dt><Icon iconName="Tag" />Category</dt><dd>{ticket.Category || 'Not specified'}</dd></div>
            <div><dt><Icon iconName="Tag" />Sub Category</dt><dd>{ticket.Subcategory || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Ticket Type</dt><dd>{ticket.TicketType || 'Not specified'}</dd></div><div><dt><Icon iconName="Tag" />Issue Type</dt><dd>{ticket.IssueType || 'Not specified'}</dd></div><div><dt><Icon iconName="Work" />Department</dt><dd>—</dd></div><div><dt><Icon iconName="Calendar" />Created</dt><dd>{date(ticket.Created)}</dd></div>
            <div><dt><Icon iconName="Clock" />Last updated</dt><dd>{date(ticket.Modified)}</dd></div>
            <div><dt><Icon iconName="Contact" />Created By</dt><dd>{(ticket.CreatedBy || ticket.Requester)?.Title || 'Not available'}</dd></div><div><dt><Icon iconName="Contact" />Assigned to</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true">{ticket.AssignedTo?.Title ? initials(ticket.AssignedTo.Title) : '?'}</span>{ticket.AssignedTo?.Title || 'Unassigned'}</dd></div>
            {ticket.DueDate && <div><dt><Icon iconName="Calendar" />Due date</dt><dd>{date(ticket.DueDate)}</dd></div>}
            <div><dt><Icon iconName="Warning" />Escalated</dt><dd>{ticket.Escalated || ticket.Status === 'Escalated' ? 'Yes' : 'No'}</dd></div>
          </dl>
        </section>
        <details className={styles.detailSidebarCard} open>
          <summary className={styles.detailSectionHeading}><Icon iconName="Attach" /><h3>Attachments</h3><Icon iconName="ChevronDown" /></summary>
          <p className={styles.detailUnavailable}>Attachments are not available yet.</p>
        </details>
        <details className={styles.detailSidebarCard} open>
          <summary className={styles.detailSectionHeading}><Icon iconName="Contact" /><h3>Created By</h3><Icon iconName="ChevronDown" /></summary>
          <PersonContact person={ticket.CreatedBy || ticket.Requester} siteUrl={service?.access?.siteUrl} />
        </details>      </aside>
    </div>
  </section>;
}
