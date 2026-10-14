import { SearchableSelect } from '../components/SearchableSelect';
import * as React from 'react';
import { DefaultButton, PrimaryButton, TextField, SearchBox, Dropdown, Checkbox, MessageBar, MessageBarType, Spinner, Dialog, DialogFooter, DialogType } from '@fluentui/react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';
import type { IFaq, IFaqInput, IFaqAccess } from '../interfaces/IFaq';
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
  const [deleting, setDeleting] = React.useState<IFaq | null>(null);
  const [busy, setBusy] = React.useState(false);
  const lock = React.useRef(false);
  const generation = React.useRef(0);
  const load = React.useCallback(async (): Promise<void> => {
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      if (!props.service.getFaqs) throw new Error('FAQs are not available with this connection. Use the Azure app and configure its FAQs list.');
      if (props.manage) {
        const access = await props.service.getFaqAccess?.();
        if (version !== generation.current) return;
        setAllowed(Boolean(access?.canManage)); setChoices(access?.categories); setLookupChoices(access || { canManage: false });
        if (!access?.canManage) throw new Error('Your account needs add, edit, and delete permission on the FAQs list to manage entries. Ask the site owner for access.');
      }
      const entries = await props.service.getFaqs(Boolean(props.manage));
      if (version === generation.current) setFaqs(entries);
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
  const remove = async (): Promise<void> => {
    if (!deleting || !props.service.deleteFaq || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await props.service.deleteFaq(deleting.id); setDeleting(null); setMessage('FAQ deleted.'); await load(); }
    catch (reason) { setDeleting(null); setError(reason instanceof Error ? reason.message : 'Unable to delete the FAQ.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const categories = Array.from(new Set(faqs.map(faq => faq.category).filter(Boolean))).sort();
  const filtered = faqs.filter(faq => (!category || faq.category === category) && (!props.manage || visibility === 'all' || faq.published === (visibility === 'published')) && `${faq.question} ${new DOMParser().parseFromString(faq.answer, 'text/html').body.textContent || ''} ${faq.keywords}`.toLowerCase().includes(query.toLowerCase().trim()));
  const change = (value: Partial<IFaqInput>): void => setDraft(current => current ? { ...current, ...value } : current);
  return <section className={styles.secondaryPage}>
    <div className={styles.secondaryPageHeader}><h2>{props.manage ? 'Administration — FAQs' : 'FAQs'}</h2></div>
    {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
    {message && <MessageBar messageBarType={MessageBarType.success} onDismiss={() => setMessage('')}>{message}</MessageBar>}
    <div className={styles.ticketListCard}>
      {loading ? <Spinner label="Loading FAQs…" /> : draft ? <form className={styles.faqEditor} onSubmit={event => { void save(event); }}>
        <h3>{editId ? 'Edit FAQ' : 'New FAQ'}</h3>
        <TextField label="Question" required maxLength={255} value={draft.question} disabled={busy} onChange={(_, value) => change({ question: value || '' })} />
        <RichTextEditor key={editId || 'new'} label="Answer" value={draft.answer} disabled={busy} onChange={answer => change({ answer })} />
        <div className={styles.newTicketFields}>
          {lookupChoices.categoryOptions ? <SearchableSelect label="Category" value={draft.categoryId || ''} disabled={busy} options={[{ key: '', text: 'Uncategorized' }, ...lookupChoices.categoryOptions.filter(item => item.active || item.id === draft.categoryId).map(item => ({ key: item.id, text: item.name }))]} onChange={value => change({ categoryId: value, category: lookupChoices.categoryOptions?.find(item => item.id === value)?.name || '', subcategoryId: '', subcategory: '' })} /> : choices ? <SearchableSelect label="Category" value={draft.category} disabled={busy} options={[{ key: '', text: 'Uncategorized' }, ...choices.map(value => ({ key: value, text: value }))]} onChange={value => change({ category: value })} /> : <TextField label="Category" value={draft.category} maxLength={255} disabled={busy} onChange={(_, value) => change({ category: value || '' })} />}
          {lookupChoices.subcategoryOptions && <SearchableSelect label="Subcategory" value={draft.subcategoryId || ''} disabled={busy || !draft.categoryId} options={[{ key: '', text: 'Not specified' }, ...lookupChoices.subcategoryOptions.filter(item => item.parentId === draft.categoryId && (item.active || item.id === draft.subcategoryId)).map(item => ({ key: item.id, text: item.name }))]} onChange={value => change({ subcategoryId: value, subcategory: lookupChoices.subcategoryOptions?.find(item => item.id === value)?.name || '' })} />}
          <TextField label="Keywords" description="Words people may search for." value={draft.keywords} maxLength={255} disabled={busy} onChange={(_, value) => change({ keywords: value || '' })} />
          <TextField label="Sort order" type="number" min={0} value={String(draft.sortOrder)} disabled={busy} onChange={(_, value) => change({ sortOrder: Number(value) })} />
          <Checkbox label="Published — visible on the FAQs page" checked={draft.published} disabled={busy} onChange={(_, checked) => change({ published: Boolean(checked) })} />
        </div>
        <div className={styles.faqActions}><PrimaryButton type="submit" text={busy ? 'Saving…' : 'Save FAQ'} disabled={busy || !draft.question.trim() || !draft.answer.trim()} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => { setDraft(null); setError(''); }} /></div>
      </form> : <>
        <div className={styles.faqToolbar}><SearchBox ariaLabel="Search FAQs" placeholder="Search questions and answers" value={query} onChange={(_, value) => setQuery(value || '')} /><Dropdown ariaLabel="FAQ category" selectedKey={category} options={[{ key: '', text: 'All categories' }, ...categories.map(value => ({ key: value, text: value }))]} onChange={(_, value) => setCategory(String(value?.key || ''))} />
          {props.manage && allowed && <Dropdown ariaLabel="Publication status" selectedKey={visibility} options={[{ key: 'all', text: 'All entries' }, { key: 'published', text: 'Published' }, { key: 'draft', text: 'Drafts' }]} onChange={(_, value) => setVisibility(String(value?.key || 'all'))} />}
          <DefaultButton text="Refresh" disabled={busy} onClick={() => { void load(); }} />
          {props.manage && allowed && <PrimaryButton text="New FAQ" disabled={busy} onClick={() => { setDraft({ ...blank }); setEditId(undefined); setError(''); setMessage(''); }} />}
        </div>
        {!error && !filtered.length && <p>{faqs.length ? 'No FAQs match your search or filters.' : props.manage ? 'No FAQs yet. Create your first entry.' : 'No published FAQs are available yet.'}</p>}
        {filtered.map(faq => <div key={faq.id} className={styles.faqEntry}><details><summary>{faq.question}</summary><div className={styles.faqAnswer}><RichTextContent value={faq.answer} /></div></details><div className={styles.faqMeta}><span>{faq.category || 'Uncategorized'}{faq.subcategory ? ` / ${faq.subcategory}` : ''}</span>{props.manage && <><span>{faq.published ? 'Published' : 'Draft'}</span><DefaultButton text="Edit" disabled={busy} onClick={() => { setEditId(faq.id); setDraft({ ...faq }); setError(''); setMessage(''); }} /><DefaultButton text="Delete" disabled={busy} onClick={() => setDeleting(faq)} /></>}</div></div>)}
      </>}
    </div>
    <Dialog hidden={!deleting} onDismiss={busy ? undefined : () => setDeleting(null)} dialogContentProps={{ type: DialogType.normal, title: 'Delete FAQ?', subText: `Delete “${deleting?.question || ''}”? This removes the entry from the list.` }} modalProps={{ isBlocking: busy }}>
      <DialogFooter><PrimaryButton text={busy ? 'Deleting…' : 'Delete'} disabled={busy} onClick={() => { void remove(); }} /><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={busy} onClick={() => setDeleting(null)} /></DialogFooter>
    </Dialog>
  </section>;
}
