import * as React from 'react';
import { DefaultButton, PrimaryButton, Icon, TextField, Dropdown, MessageBar, MessageBarType, Spinner } from '@fluentui/react';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import type { ITicketDataSource, ITicketComment } from '../interfaces/ITicketDataSource';
import styles from './HelpdeskSystem.module.scss';

export function TicketDetails(props: { ticket: ITicket; tickets: ITicket[]; service?: ITicketDataSource; refresh: () => Promise<void>; onBack: () => void }): React.ReactElement {
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
  const [status, setStatus] = React.useState<TicketStatus>(ticket.Status);
  const [assigned, setAssigned] = React.useState(ticket.AssignedTo?.Id || 0);
  const [comments, setComments] = React.useState<ITicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [commentsError, setCommentsError] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [posting, setPosting] = React.useState(false);
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
  const beginEdit = (): void => { setTitle(ticket.Title); setDescription(plainDescription); setPriority(ticket.Priority); setStatus(ticket.Status); setAssigned(ticket.AssignedTo?.Id || 0); setError(''); setSaved(false); setEditing(true); };
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
      <div className={styles.detailToolbarTitle}><DefaultButton text="Tickets" iconProps={{ iconName: 'ChevronLeft' }} disabled={saving || posting} onClick={props.onBack} /><span aria-hidden="true">/</span><h2 ref={heading} tabIndex={-1}>Ticket #{ticket.Id}</h2></div>
    </div>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {saved && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setSaved(false)}>Ticket changes saved.</MessageBar>}
    <div className={styles.ticketDetailLayout}>
      <article className={styles.ticketDetailBody}>
        <div className={styles.detailSummary}>
          <div className={styles.detailSummaryActions}><div className={styles.detailEyebrow}><Icon iconName="Ticket" /> ISSUE #{ticket.Id}</div>{!editing ? <PrimaryButton text="Edit ticket" iconProps={{ iconName: 'Edit' }} disabled={!service?.updateTicket} onClick={beginEdit} /> : <span className={styles.editingIndicator}>Editing ticket</span>}</div>
          <h3 className={styles.detailSubject}>{ticket.Title}</h3>
          <div className={styles.ticketDetailBadges}><span className={styles.statusPill} data-status={ticket.Status}>{ticket.Status}</span><span className={styles.priorityLabel} data-priority={ticket.Priority}><span className={styles.priorityDot} aria-hidden="true" />{ticket.Priority} priority</span></div>
        </div>
        {editing ? <form className={styles.ticketEditForm} onSubmit={event => { void save(event); }}>
          <div className={styles.detailSectionHeading}><Icon iconName="Edit" /><h3>Edit details</h3></div>
          <TextField label="Issue" required value={title} maxLength={255} disabled={saving} onChange={(_, value) => setTitle(value || '')} />
          <TextField label="Issue description" multiline rows={7} value={description} disabled={saving} onChange={(_, value) => setDescription(value || '')} />
          <div className={styles.detailFormGrid}>
            <Dropdown label="Priority" selectedKey={priority} disabled={saving} options={['Critical', 'High', 'Medium', 'Low'].map(value => ({key: value, text: value}))} onChange={(_, option) => setPriority(option?.key as TicketPriority)} />
            <Dropdown label="Status" selectedKey={status} disabled={saving} options={['New', 'Assigned', 'Completed', 'Closed', 'Escalated', 'Pending'].map(value => ({key: value, text: value}))} onChange={(_, option) => setStatus(option?.key as TicketStatus)} />
          </div>
          <Dropdown label="Assigned to" selectedKey={assigned} disabled={saving} options={[{key: 0, text: 'Unassigned'}, ...people.map(person => ({key: person!.Id!, text: person!.Title || person!.Email || `User #${person!.Id}`}))]} onChange={(_, option) => setAssigned(Number(option?.key || 0))} />
          <div className={styles.detailSaveBar}><DefaultButton text="Cancel" disabled={saving} onClick={() => setEditing(false)} /><PrimaryButton type="submit" text={saving ? 'Saving…' : 'Save changes'} iconProps={{iconName: 'Save'}} disabled={saving || !title.trim()} /></div>
        </form> : <>
          <section className={styles.detailSection}><div className={styles.detailSectionHeading}><Icon iconName="AlignLeft" /><h3>Description</h3></div><p className={styles.ticketDescription}>{plainDescription || 'No description has been added to this ticket.'}</p></section>
          <section className={styles.detailSection}><div className={styles.detailSectionHeading}><Icon iconName="Info" /><h3>Ticket information</h3></div>
            <dl className={styles.ticketMetadata}>
              <div><dt>Assigned to</dt><dd className={styles.detailAssignee}><span className={styles.personInitials} aria-hidden="true">{ticket.AssignedTo?.Title ? initials(ticket.AssignedTo.Title) : '—'}</span>{ticket.AssignedTo?.Title || 'Unassigned'}</dd></div>
              <div><dt>Category</dt><dd>{ticket.Category || 'Not specified'}</dd></div>
              <div><dt>Created</dt><dd>{date(ticket.Created)}</dd></div>
              <div><dt>Last updated</dt><dd>{date(ticket.Modified)}</dd></div>
              {ticket.DueDate && <div><dt>Due date</dt><dd>{date(ticket.DueDate)}</dd></div>}
            </dl>
          </section>
        </>}
      </article>
      <aside className={styles.ticketComments} aria-label="Ticket comments">
        <div className={styles.conversationHeading}><div><h3><Icon iconName="Comment" /> Conversation <span className={styles.commentCount}>{comments.length}</span></h3><p>Keep updates and discussion together.</p></div><DefaultButton text="Refresh" iconProps={{iconName: 'Refresh'}} disabled={commentsLoading || posting} onClick={() => { void loadComments(); }} /></div>
        {commentsError && <MessageBar messageBarType={MessageBarType.error}>{commentsError}</MessageBar>}
        {commentsLoading ? <div className={styles.conversationLoading}><Spinner label="Loading comments…" /></div> : <div className={styles.commentThread} aria-live="polite">{comments.map(value => <article key={value.id} className={styles.commentEntry}><span className={styles.personInitials} aria-hidden="true">{initials(value.author)}</span><div className={styles.commentContent}><header><strong>{value.author}</strong><time dateTime={value.created}>{date(value.created)}</time></header><p>{value.text}</p></div></article>)}{!comments.length && !commentsError && <div className={styles.conversationEmpty}><Icon iconName="Comment" /><strong>No comments yet</strong><p>Share an update or ask a question below.</p></div>}</div>}
        <form onSubmit={event => { void post(event); }} className={styles.commentComposer}><TextField label="Add a comment" placeholder="Write an update or ask a question…" multiline rows={4} maxLength={10000} value={comment} disabled={posting || !service?.addComment} onChange={(_, value) => setComment(value || '')} /><div className={styles.commentComposerFooter}><span>Visible to people with access to the comments list</span><PrimaryButton type="submit" text={posting ? 'Posting…' : 'Post comment'} iconProps={{iconName: 'Send'}} disabled={posting || commentsLoading || Boolean(commentsError) || !comment.trim() || !service?.addComment} /></div></form>
      </aside>
    </div>
  </section>;
}
