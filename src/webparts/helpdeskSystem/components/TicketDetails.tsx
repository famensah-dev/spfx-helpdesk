import * as React from 'react';
import { DefaultButton, PrimaryButton, Icon, IconButton, Panel, PanelType, TextField, Dropdown, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import type { ITicketDataSource, ITicketComment, ITicketVersion } from '../interfaces/ITicketDataSource';
import { ticketStatuses, normalizeStatus } from '../utils/ticketStatuses';
import styles from './HelpdeskSystem.module.scss';

export function TicketDetails(props: { ticket: ITicket; tickets: ITicket[]; service?: ITicketDataSource; refresh: () => Promise<void>; onBack: () => void; backLabel?: string }): React.ReactElement {
  const { ticket, service } = props;
  const heading = React.useRef<HTMLHeadingElement>(null);
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [title, setTitle] = React.useState(ticket.Title);
  const plainDescription = React.useMemo(() => ticket.Description ? new DOMParser().parseFromString(ticket.Description, 'text/html').body.textContent || '' : '', [ticket.Description]);
  const [description, setDescription] = React.useState(plainDescription);
  const [priority, setPriority] = React.useState<TicketPriority>(ticket.Priority);
  const [status, setStatus] = React.useState<TicketStatus>(normalizeStatus(ticket.Status));
  const [assigned, setAssigned] = React.useState(ticket.AssignedTo?.Id || 0);
  const [comments, setComments] = React.useState<ITicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentsError, setCommentsError] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [posting, setPosting] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState('details');
  const [newestFirst, setNewestFirst] = React.useState(true);
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
  const people = props.tickets.map(value => value.AssignedTo).filter((person, index, all) => person?.Id && all.findIndex(other => other?.Id === person.Id) === index);
  const beginEdit = (): void => { setTitle(ticket.Title); setDescription(plainDescription); setPriority(ticket.Priority); setStatus(normalizeStatus(ticket.Status)); setAssigned(ticket.AssignedTo?.Id || 0); setError(''); setSaved(false); setEditing(true); };
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (!service?.updateTicket || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      await service.updateTicket(ticket.Id, {title, description: description !== plainDescription ? description : undefined, priority, status, assignedToId: assigned || null});
      setEditing(false); setSaved(true); await props.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save changes.'); }
    finally { lock.current = false; setSaving(false); }
  };
  const post = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault(); if (!service?.addComment || commentLock.current || !comment.trim()) return;
    commentLock.current = true; setPosting(true); setCommentsError('');
    try { await service.addComment(ticket.Id, comment); setComment(''); await loadComments(); }
    catch (reason) { setCommentsError(reason instanceof Error ? reason.message : 'Unable to post comment.'); }
    finally { commentLock.current = false; setPosting(false); }
  };
  const initials = (name: string): string => name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return <section className={`${styles.pageContent} ${styles.detailWorkspace}`} aria-label={`Ticket #${ticket.Id} details`}>
    <div className={styles.detailToolbar}>
      <div className={styles.detailToolbarTitle}><DefaultButton text={props.backLabel || 'Back to Tickets'} iconProps={{ iconName: 'Back' }} disabled={saving || posting} onClick={props.onBack} /><h2 className={styles.srOnly} ref={heading} tabIndex={-1}>Ticket #{ticket.Id}</h2></div>
      <div className={styles.detailTopActions}>{!editing ? <PrimaryButton text="Edit Ticket" iconProps={{ iconName: 'Edit' }} disabled={!service?.updateTicket} onClick={beginEdit} /> : <span className={styles.editingIndicator}>Editing ticket</span>}<IconButton iconProps={{ iconName: 'History' }} title="Issue history" ariaLabel="Open issue history" onClick={() => setHistoryOpen(true)} /></div>
    </div>
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
          <div className={styles.detailHero}><div><div className={styles.detailEyebrow}>Ticket ID #{ticket.Id}</div><h3 className={styles.detailSubject}>{ticket.Title}</h3><p className={styles.detailSubmitted}>Submitted {date(ticket.Created)}</p></div></div>
          <div className={styles.detailQuickFacts}>
            <div><span>Status</span><span className={styles.statusPill} data-status={normalizeStatus(ticket.Status)}>{normalizeStatus(ticket.Status)}</span></div>
            <div><span>Priority</span><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority}</span></div>
            <div><span>Category</span><strong className={styles.detailCategoryChip}><Icon iconName="Tag" />{ticket.Category || 'Not specified'}</strong></div><div><span>Sub Category</span><strong className={styles.detailNeutralChip}>—</strong></div>
            <div><span>Assigned to</span><strong className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true">{ticket.AssignedTo?.Title ? initials(ticket.AssignedTo.Title) : '?'}</span>{ticket.AssignedTo?.Title || 'Unassigned'}</strong></div>
            <div><span>Department</span><strong className={styles.detailAssignee}><Icon iconName="Work" />—</strong></div>
          </div>
        </div>
        <nav className={styles.detailSectionNav} aria-label="Ticket sections"><button type="button" data-active={activeSection === 'details'} onClick={() => { setActiveSection('details'); descriptionSection.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><Icon iconName="TextDocument" /> Details</button><button type="button" data-active={activeSection === 'comments'} onClick={() => { setActiveSection('comments'); commentsSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}><Icon iconName="Comment" /> Comments <span className={styles.commentCount}>{comments.length}</span></button><button type="button" disabled title="Attachments are not available yet"><Icon iconName="Attach" /> Attachments</button><button type="button" onClick={() => setHistoryOpen(true)}><Icon iconName="History" /> History</button><button type="button" disabled title="Related tickets are not available yet"><Icon iconName="BulletedList" /> Related Tickets</button></nav>
        {editing ? <form ref={descriptionSection as React.RefObject<HTMLFormElement>} className={styles.ticketEditForm} onSubmit={event => { void save(event); }}>
          <div className={styles.detailSectionHeading}><Icon iconName="Edit" /><h3>Edit details</h3></div>
          <TextField label="Issue" required value={title} maxLength={255} disabled={saving} onChange={(_, value) => setTitle(value || '')} />
          <TextField label="Issue description" multiline rows={7} value={description} disabled={saving} onChange={(_, value) => setDescription(value || '')} />
          <div className={styles.detailFormGrid}>
            <Dropdown label="Priority" selectedKey={priority} disabled={saving} options={['Critical', 'High', 'Medium', 'Low'].map(value => ({key: value, text: value}))} onChange={(_, option) => setPriority(option?.key as TicketPriority)} />
            <Dropdown label="Status" selectedKey={status} disabled={saving} options={[...ticketStatuses, ...(ticket.Status === 'Escalated' ? ['Escalated'] : [])].map(value => ({key: value, text: value}))} onChange={(_, option) => setStatus(option?.key as TicketStatus)} />
          </div>
          <Dropdown label="Assigned to" selectedKey={assigned} disabled={saving} options={[{key: 0, text: 'Unassigned'}, ...people.map(person => ({key: person!.Id!, text: person!.Title || person!.Email || `User #${person!.Id}`}))]} onChange={(_, option) => setAssigned(Number(option?.key || 0))} />
          <div className={styles.detailSaveBar}><DefaultButton text="Cancel" disabled={saving} onClick={() => setEditing(false)} /><PrimaryButton type="submit" text={saving ? 'Saving…' : 'Save changes'} iconProps={{iconName: 'Save'}} disabled={saving || !title.trim()} /></div>
        </form> : <>
          <section ref={descriptionSection} className={styles.detailSection}><div className={styles.detailSectionHeading}><Icon iconName="AlignLeft" /><h3>Description</h3></div><p className={styles.ticketDescription}>{plainDescription || 'No description has been added to this ticket.'}</p></section>
        </>}
      <section ref={commentsSection} className={styles.ticketComments} aria-label="Ticket comments">
        <form onSubmit={event => { void post(event); }} className={styles.commentComposer}><div className={styles.detailSectionHeading}><Icon iconName="CommentAdd" /><h3>Add a comment</h3></div><div className={styles.commentEditor}><div className={styles.commentFormatBar} aria-label="Comment formatting"><select disabled aria-label="Text style" title="Rich text formatting is not available yet"><option>Normal</option></select>{[{ icon: 'Bold', label: 'Bold' }, { icon: 'Italic', label: 'Italic' }, { icon: 'Underline', label: 'Underline' }, { icon: 'BulletedList', label: 'Bulleted list' }, { icon: 'NumberedList', label: 'Numbered list' }, { icon: 'AlignLeft', label: 'Align left' }, { icon: 'Link', label: 'Insert link' }, { icon: 'Photo2', label: 'Insert image' }].map(item => <IconButton key={item.icon} iconProps={{ iconName: item.icon }} ariaLabel={item.label} title={`${item.label} is not available yet`} disabled />)}</div><TextField ariaLabel="Comment" placeholder="Type your comment here…" multiline rows={4} maxLength={10000} value={comment} disabled={posting || !service?.addComment} onChange={(_, value) => setComment(value || '')} /></div><div className={styles.commentComposerFooter}><button type="button" className={styles.detailAttachButton} disabled title="File attachments are not available yet"><Icon iconName="Attach" />Attach files</button><label className={styles.detailInternalNote} title="Internal notes are not available yet"><input type="checkbox" disabled />Make this an internal note <Icon iconName="Info" /></label><PrimaryButton type="submit" text={posting ? 'Posting…' : 'Post Comment'} iconProps={{iconName: 'Send'}} disabled={posting || commentsLoading || Boolean(commentsError) || !comment.trim() || !service?.addComment} /></div></form>
        <div className={styles.commentDisplay}>
        <div className={styles.conversationHeading}><div><h3>Comments <span className={styles.commentCount}>{comments.length}</span></h3></div><div className={styles.detailTopActions}><select aria-label="Comment order" value={newestFirst ? 'newest' : 'oldest'} onChange={event => setNewestFirst(event.target.value === 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><DefaultButton text="Refresh" iconProps={{iconName: 'Refresh'}} disabled={commentsLoading || posting} onClick={() => { void loadComments(); }} /></div></div>
        {commentsError && <MessageBar messageBarType={MessageBarType.error}>{commentsError}</MessageBar>}
        {commentsLoading ? <div className={styles.conversationLoading}><Spinner label="Loading comments…" /></div> : <div className={styles.commentThread} aria-live="polite">{[...comments].sort((a, b) => (new Date(a.created).getTime() - new Date(b.created).getTime()) * (newestFirst ? -1 : 1)).map(value => <article key={value.id} className={styles.commentEntry}><span className={styles.personInitials} aria-hidden="true">{initials(value.author)}</span><div className={styles.commentContent}><header><strong>{value.author}</strong><time dateTime={value.created}>{date(value.created)}</time></header><p>{value.text}</p></div></article>)}{!comments.length && !commentsError && <div className={styles.conversationEmpty}><Icon iconName="Comment" /><strong>No comments yet</strong><p>Share an update or ask a question above.</p></div>}</div>}
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
            <div><dt><Icon iconName="Tag" />Sub Category</dt><dd>—</dd></div><div><dt><Icon iconName="Work" />Department</dt><dd>—</dd></div><div><dt><Icon iconName="Calendar" />Created</dt><dd>{date(ticket.Created)}</dd></div>
            <div><dt><Icon iconName="Clock" />Last updated</dt><dd>{date(ticket.Modified)}</dd></div>
            <div><dt><Icon iconName="Contact" />Requested By</dt><dd>—</dd></div><div><dt><Icon iconName="Contact" />Assigned to</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true">{ticket.AssignedTo?.Title ? initials(ticket.AssignedTo.Title) : '?'}</span>{ticket.AssignedTo?.Title || 'Unassigned'}</dd></div>
            {ticket.DueDate && <div><dt><Icon iconName="Calendar" />Due date</dt><dd>{date(ticket.DueDate)}</dd></div>}
            <div><dt><Icon iconName="Warning" />Escalated</dt><dd>{ticket.Escalated || ticket.Status === 'Escalated' ? 'Yes' : 'No'}</dd></div>
            <div><dt><Icon iconName="Link" />Related Issue</dt><dd>—</dd></div>
          </dl>
        </section>
        <details className={styles.detailSidebarCard} open>
          <summary className={styles.detailSectionHeading}><Icon iconName="Attach" /><h3>Attachments</h3><Icon iconName="ChevronDown" /></summary>
          <p className={styles.detailUnavailable}>Attachments are not available yet.</p>
        </details>
        <details className={styles.detailSidebarCard} open>
          <summary className={styles.detailSectionHeading}><Icon iconName="Contact" /><h3>Requester Information</h3><Icon iconName="ChevronDown" /></summary>
          <dl className={styles.detailSidebarMetadata}>
            <div><dt><Icon iconName="Contact" />Name</dt><dd>—</dd></div>
            <div><dt><Icon iconName="Work" />Department</dt><dd>—</dd></div>
            <div><dt><Icon iconName="Mail" />Email</dt><dd>—</dd></div>
            <div><dt><Icon iconName="Phone" />Phone</dt><dd>—</dd></div>
          </dl>
        </details>      </aside>
    </div>
  </section>;
}
