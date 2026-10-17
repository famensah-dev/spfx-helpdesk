import { MissingWorkspaceNotice } from '../components/WorkspaceSetupPanel';
import { SearchableSelect } from '../components/SearchableSelect';
import * as React from 'react';
import { Icon, IconButton, DefaultButton, PrimaryButton, TextField, SearchBox, Pivot, PivotItem, Dropdown, Checkbox, MessageBar, MessageBarType, Spinner, SpinnerSize, Dialog, DialogFooter, DialogType } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IFaq, IFaqInput, IFaqAccess, FaqBulkAction } from '../interfaces/IFaq';
import { RichTextEditor, RichTextContent } from '../components/RichTextEditor';
import { cancelButtonStyles } from '../components/cancelButtonStyles';
import styles from '../components/HelpdeskSystem.module.scss';

const blank: IFaqInput = { question: '', answer: '', category: '', keywords: '', published: false, sortOrder: 0 };
export function FaqPage(props: { service: ITicketDataSource; manage?: boolean }): React.ReactElement {
  const [faqs, setFaqs] = React.useState<IFaq[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [allowed, setAllowed] = React.useState(false);
  const [lookupChoices, setLookupChoices] = React.useState<IFaqAccess>({ canManage: false });
  const [choices, setChoices] = React.useState<string[] | undefined>();
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('');
  const [visibility, setVisibility] = React.useState('all');
  const [draft, setDraft] = React.useState<IFaqInput | null>(null);
  const [editId, setEditId] = React.useState<number | undefined>();
  const [deleting, setDeleting] = React.useState<IFaq[] | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [sortRows, setSortRows] = React.useState<IFaq[] | null>(null);
  const dragging = React.useRef<number | null>(null);
  const selectAll = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const generation = React.useRef(0);
  const load = React.useCallback(async (): Promise<void> => {
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      if (!props.service.getFaqs) throw new Error('FAQs are not available with this connection. Use the Azure app and configure its FAQs list.');
      let canManage = false;
      try {
        const access = await props.service.getFaqAccess?.();
        if (version !== generation.current) return;
        canManage = Boolean(access?.canManage); setAllowed(canManage); setChoices(access?.categories); setLookupChoices(access || { canManage: false });
        if (props.manage && !access?.canManage) throw new Error('Your account needs add, edit, and delete permission on the FAQs list to manage entries. Ask the site owner for access.');
      } catch (reason) { if (props.manage) throw reason; setAllowed(false); }
      const entries = await props.service.getFaqs(canManage);
      if (version === generation.current) { setFaqs(entries); setSelected(new Set()); }
    } catch (reason) { if (version === generation.current) setError(reason instanceof Error ? reason.message : 'Unable to load FAQs.'); }
    finally { if (version === generation.current) setLoading(false); }
  }, [props.service, props.manage]);
  React.useEffect(() => { setFaqs([]); setDraft(null); setAllowed(false); setMessage(''); void load(); return () => { generation.current++; }; }, [load]);
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!draft || !props.service.saveFaq || lock.current) return;
    if (!new DOMParser().parseFromString(draft.answer, 'text/html').body.textContent?.trim()) { setError('Enter an answer.'); return; }
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await props.service.saveFaq(draft, editId); setDraft(null); setMessage(editId ? 'FAQ updated.' : 'FAQ created.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the FAQ.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const bulk = async (ids: number[], action: FaqBulkAction): Promise<void> => {
    if (!props.service.updateFaqs || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await props.service.updateFaqs(ids, action);
      setDeleting(null); setSortRows(null);
      await load();
      if (result.failed.length) setError(`${result.succeeded.length} updated; ${result.failed.length} failed. ${result.failed.map(item => '#' + item.id + ': ' + item.message).join('; ')}`);
      else setMessage(action.kind === 'sort' ? 'FAQ order saved.' : action.kind === 'delete' ? 'Selected FAQs deleted.' : action.published ? 'Selected FAQs are active (published).' : 'Selected FAQs are inactive (unpublished).');
    } catch (reason) { setDeleting(null); setError(reason instanceof Error ? reason.message : 'Unable to update FAQs.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const categories = Array.from(new Set(faqs.map(faq => faq.category).filter(Boolean))).sort();
  const filtered = faqs.filter(faq => (!category || faq.category === category) && (!allowed || visibility === 'all' || faq.published === (visibility === 'published')) && `${faq.question} ${new DOMParser().parseFromString(faq.answer, 'text/html').body.textContent || ''} ${faq.keywords}`.toLowerCase().includes(query.toLowerCase().trim()));
  const allSelected = filtered.length > 0 && filtered.every(faq => selected.has(faq.id));
  React.useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !allSelected && filtered.some(faq => selected.has(faq.id)); }, [allSelected, filtered, selected]);
  React.useEffect(() => { setSelected(new Set()); }, [query, category, visibility]);
  const move = (from: number, to: number): void => setSortRows(current => {
    if (!current || from === to) return current;
    const next = [...current]; const index = next.findIndex(item => item.id === from); const target = next.findIndex(item => item.id === to);
    if (index < 0 || target < 0) return current;
    const [item] = next.splice(index, 1); next.splice(target, 0, item); return next;
  });
  const change = (value: Partial<IFaqInput>): void => setDraft(current => current ? { ...current, ...value } : current);
  return <section className={styles.secondaryPage}>
    <div className={`${styles.secondaryPageHeader} ${styles.faqTitleRow}`}><h2 className={styles.toolbarTitle}>{props.manage ? 'Administration — FAQs' : 'FAQs'}</h2>
    <div className={styles.faqCategoryTabs}>
      <Pivot aria-label="FAQ categories" overflowBehavior="menu" overflowAriaLabel="All categories" selectedKey={category || '__all'} onLinkClick={item => { if (!busy && !sortRows) setCategory(item?.props.itemKey === '__all' ? '' : item?.props.itemKey || ''); }}>
        <PivotItem headerText="All categories" itemKey="__all" headerButtonProps={{disabled: busy || Boolean(sortRows)}} />
        {categories.map(value => <PivotItem key={value} headerText={value} itemKey={value} headerButtonProps={{disabled: busy || Boolean(sortRows)}} />)}
      </Pivot>
    </div>
    </div>
    <MissingWorkspaceNotice service={props.service} error={error} />
    {error && !draft && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
    <div className={styles.ticketListCard}>
      {loading ? <Spinner label="Loading FAQs…" /> : <>
        <div className={styles.ticketToolbar}>
          <div className={styles.ticketControls}>
            <SearchBox ariaLabel="Search FAQs" placeholder="Search" disabled={Boolean(sortRows) || busy} value={query} onChange={(_, value) => setQuery(value || '')} />

            {allowed && <div className={styles.ticketCounts} role="group" aria-label="Filter FAQs by status">
              {[{ key: 'all', text: 'Total' }, { key: 'published', text: 'Active' }, { key: 'draft', text: 'Inactive' }].map(item => <button key={item.key} type="button" disabled={busy || Boolean(sortRows)} aria-pressed={visibility === item.key} data-active={visibility === item.key} onClick={() => setVisibility(item.key)}>{item.text}<strong style={{ color: item.key === 'published' ? '#13794e' : item.key === 'draft' ? '#596371' : undefined }}>{item.key === 'all' ? faqs.length : faqs.filter(faq => faq.published === (item.key === 'published')).length}</strong></button>)}
            </div>}
            <IconButton iconProps={{ iconName: 'Refresh' }} ariaLabel="Refresh FAQs" title="Refresh FAQs" disabled={busy || Boolean(sortRows)} onClick={() => { void load(); }} />
          </div>
          {allowed && <div className={styles.ticketActions}>
            <DefaultButton text="New" iconProps={{ iconName: 'Add' }} disabled={busy || Boolean(sortRows)} onClick={() => { setDraft({ ...blank }); setEditId(undefined); setError(''); setMessage(''); }} />
            {!sortRows && <DefaultButton text="Sort" iconProps={{ iconName: 'SortLines' }} disabled={busy || faqs.length < 2} onClick={() => { setSortRows([...faqs]); setSelected(new Set()); }} />}
          </div>}
        </div>
        {!error && !filtered.length && <p>{faqs.length ? 'No FAQs match your search or filters.' : props.manage ? 'No FAQs yet. Create your first entry.' : 'No published FAQs are available yet.'}</p>}
        {sortRows && <div className={styles.faqSortActions}><span>Drag rows to reorder all FAQs, then save. Keyboard: Alt + Up/Down.</span><PrimaryButton text={busy ? 'Saving...' : 'Save'} disabled={busy} onClick={() => { void bulk(sortRows.map(item => item.id), { kind: 'sort' }); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setSortRows(null)} /></div>}
        <div className={styles.tableContainer}><table className={styles.ticketTable}><caption className={styles.ticketCountRow}><div className={styles.ticketCountContent}>        {allowed && !sortRows && selected.size > 0 && <div className={styles.bulkActions}>
          {selected.size > 0 && <><strong aria-live="polite">{selected.size} selected</strong><DefaultButton text="Make active" disabled={busy} onClick={() => { void bulk(Array.from(selected), { kind: 'publish', published: true }); }} /><DefaultButton text="Make inactive" disabled={busy} onClick={() => { void bulk(Array.from(selected), { kind: 'publish', published: false }); }} /><DefaultButton text="Delete" disabled={busy} onClick={() => setDeleting(faqs.filter(item => selected.has(item.id)))} /></>}
        </div>}
{!selected.size && <span>{(sortRows || filtered).length} FAQs in this view</span>}</div></caption><thead><tr>
          {allowed && <th className={styles.selectionCell}>{!sortRows && <input ref={selectAll} type="checkbox" aria-label="Select all matching FAQs" checked={allSelected} disabled={busy || !filtered.length} onChange={event => setSelected(event.target.checked ? new Set(filtered.map(item => item.id)) : new Set())} />}</th>}
          <th scope="col">Question</th><th scope="col">Answer</th><th scope="col">Category</th><th scope="col">Subcategory</th><th scope="col">Status</th>
        </tr></thead><tbody>{(sortRows || filtered).map((faq, index) => <tr key={faq.id} data-selected={selected.has(faq.id)} tabIndex={sortRows ? 0 : undefined} aria-label={sortRows ? `${faq.question}. Use Alt and arrow keys to reorder.` : undefined} onKeyDown={event => { if (!sortRows || busy || !event.altKey) return; const target = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : -1; if (target >= 0 && target < sortRows.length) { event.preventDefault(); move(faq.id, sortRows[target].id); } }} draggable={Boolean(sortRows) && !busy} onDragStart={event => { dragging.current = faq.id; event.dataTransfer.setData('text/plain', String(faq.id)); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => { if (sortRows && !busy) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (sortRows && !busy && dragging.current !== null) move(dragging.current, faq.id); dragging.current = null; }} onDragEnd={() => { dragging.current = null; }}>
          {allowed && <td className={styles.selectionCell}>{sortRows ? <Icon iconName="GripperDotsVertical" /> : <input type="checkbox" aria-label={`Select ${faq.question}`} checked={selected.has(faq.id)} disabled={busy} onChange={event => setSelected(current => { const next = new Set(current); if (event.target.checked) next.add(faq.id); else next.delete(faq.id); return next; })} />}</td>}
          <td className={styles.faqQuestionCell}>{allowed && !sortRows ? <button type="button" className={styles.ticketSubjectLink} disabled={busy} onClick={() => { setEditId(faq.id); setDraft({ ...faq }); setError(''); setMessage(''); }}>{faq.question}</button> : faq.question}
          </td><td className={styles.faqAnswerCell}><span className={styles.faqAnswerPreview}>{new DOMParser().parseFromString(faq.answer, 'text/html').body.textContent || '_'}</span></td><td className={styles.faqClassificationCell}>{faq.category || '_'}</td><td className={styles.faqClassificationCell}>{faq.subcategory || '_'}</td>
          <td><span className={styles.faqStatusPill} data-active={faq.published}>{faq.published ? 'Active' : 'Inactive'}</span></td>
        </tr>)}</tbody></table></div>
      </>}
    </div>
    <Dialog hidden={!draft} onDismiss={busy ? undefined : () => { setDraft(null); setError(''); }} minWidth={320} maxWidth={840} dialogContentProps={{ type: DialogType.close, title: editId ? 'Edit FAQ' : 'New FAQ', showCloseButton: !busy, styles: { header: { borderBottom: '1px solid #e5ebf3', marginBottom: 18 } } }} modalProps={{ isBlocking: true, styles: { main: { width: 'min(840px, calc(100vw - 32px))', minWidth: 0, maxWidth: 840, borderRadius: 6, overflow: 'hidden', selectors: { '@media (min-width: 480px)': { width: 'min(840px, calc(100vw - 32px))', minWidth: 0, maxWidth: 840 } } } } }}>
      {draft && <form className={styles.faqEditor} onSubmit={event => { void save(event); }}>
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        <TextField label="Question" required maxLength={255} value={draft.question} disabled={busy} onChange={(_, value) => change({ question: value || '' })} />
        <RichTextEditor key={editId || 'new'} label="Answer" required value={draft.answer} disabled={busy} onChange={answer => change({ answer })} />
        <div className={styles.faqClassificationRow}>
          {lookupChoices.categoryOptions ? <SearchableSelect label="Category" value={draft.categoryId || ''} disabled={busy} options={[{ key: '', text: 'Uncategorized' }, ...lookupChoices.categoryOptions.filter(item => item.active || item.id === draft.categoryId).map(item => ({ key: item.id, text: item.name }))]} onChange={value => change({ categoryId: value, category: lookupChoices.categoryOptions?.find(item => item.id === value)?.name || '', subcategoryId: '', subcategory: '' })} /> : choices ? <SearchableSelect label="Category" value={draft.category} disabled={busy} options={[{ key: '', text: 'Uncategorized' }, ...choices.map(value => ({ key: value, text: value }))]} onChange={value => change({ category: value })} /> : <TextField label="Category" value={draft.category} maxLength={255} disabled={busy} onChange={(_, value) => change({ category: value || '' })} />}
          {lookupChoices.subcategoryOptions && <SearchableSelect label="Subcategory" value={draft.subcategoryId || ''} disabled={busy || !draft.categoryId} options={[{ key: '', text: 'Not specified' }, ...lookupChoices.subcategoryOptions.filter(item => item.parentId === draft.categoryId && (item.active || item.id === draft.subcategoryId)).map(item => ({ key: item.id, text: item.name }))]} onChange={value => change({ subcategoryId: value, subcategory: lookupChoices.subcategoryOptions?.find(item => item.id === value)?.name || '' })} />}
        </div>
          <TextField label="Keywords" description="Words people may search for." value={draft.keywords} maxLength={255} disabled={busy} onChange={(_, value) => change({ keywords: value || '' })} />
          <Checkbox className={styles.faqPublishCheckbox} label="Publish this FAQ" checked={draft.published} disabled={busy} onChange={(_, checked) => change({ published: Boolean(checked) })} />
        <div className={styles.faqModalFooter}><PrimaryButton onRenderIcon={busy ? () => <Spinner size={SpinnerSize.xSmall} ariaLabel="Saving FAQ" styles={{ root: { marginRight: 6 } }} /> : undefined} type="submit" text={busy ? 'Saving…' : 'Save FAQ'} disabled={busy || !draft.question.trim() || !draft.answer.trim()} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => { setDraft(null); setError(''); }} /></div>
      </form>}
    </Dialog>
    <Dialog hidden={!deleting} onDismiss={busy ? undefined : () => setDeleting(null)} dialogContentProps={{ type: DialogType.normal, title: 'Delete FAQ?', subText: `Delete ${deleting?.length || 0} selected FAQ(s)? This removes the entries from the list.` }} modalProps={{ isBlocking: busy }}>
      <DialogFooter><PrimaryButton text={busy ? 'Deleting…' : 'Delete'} disabled={busy} onClick={() => { if (deleting) void bulk(deleting.map(item => item.id), { kind: 'delete' }); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setDeleting(null)} /></DialogFooter>
    </Dialog>
  </section>;
}
