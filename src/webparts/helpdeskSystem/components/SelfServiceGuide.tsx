import * as React from 'react';
import { DefaultButton, PrimaryButton, Icon, Panel, PanelType, Spinner, MessageBar, MessageBarType, TextField } from '@fluentui/react';
import type { IFaq } from '../interfaces/IFaq';
import type { ITicketDataSource, INewTicketInput } from '../interfaces/ITicketDataSource';
import { RichTextContent } from './RichTextEditor';
import styles from './SelfServiceGuide.module.scss';

export function SelfServiceGuide(props: { service: ITicketDataSource; canCreate: boolean; onCreate: (draft: Partial<INewTicketInput>) => void }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number }>();
  const [dragging, setDragging] = React.useState(false);
  const drag = React.useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean }>();
  const suppressClick = React.useRef(false);
  const fitLauncher = (left: number, top: number, snap: boolean): { left: number; top: number } => {
    const rect = launcherRef.current?.getBoundingClientRect();
    const width = rect?.width || 150;
    const height = rect?.height || 48;
    const margin = 14;
    const right = Math.max(margin, window.innerWidth - width - margin);
    return {
      left: snap ? (left + width / 2 < window.innerWidth / 2 ? margin : right) : Math.max(margin, Math.min(right, left)),
      top: Math.max(margin, Math.min(Math.max(margin, window.innerHeight - height - margin), top))
    };
  };
  React.useEffect(() => {
    const resize = (): void => { setPosition(current => current ? fitLauncher(current.left, current.top, true) : current); };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) {
      setPosition(fitLauncher(current.left + event.clientX - current.x, current.top + event.clientY - current.y, true));
      suppressClick.current = true;
    }
    drag.current = undefined;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const [articles, setArticles] = React.useState<IFaq[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [category, setCategory] = React.useState<string>();
  const [subcategory, setSubcategory] = React.useState<string>();
  const [article, setArticle] = React.useState<IFaq>();
  const [attempted, setAttempted] = React.useState<IFaq[]>([]);
  const [escalating, setEscalating] = React.useState(false);
  const [solved, setSolved] = React.useState(false);
  const [details, setDetails] = React.useState('');
  const reset = (): void => { setCategory(undefined); setSubcategory(undefined); setArticle(undefined); setAttempted([]); setEscalating(false); setSolved(false); setDetails(''); };
  React.useEffect(() => { reset(); setOpen(false); setArticles([]); }, [props.service]);
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError('');
    Promise.resolve().then(async () => {
      if (!props.service.getFaqs) throw new Error('The knowledge base is not available with this connection.');
      return props.service.getFaqs(false);
    }).then(items => { if (active) setArticles(items.filter(item => item.published).sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question))); })
      .catch(reason => { if (active) { setArticles([]); setError(reason instanceof Error ? reason.message : 'Unable to load guides. Please try again.'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, props.service]);
  const categories = Array.from(new Set(articles.map(item => item.category || 'General'))).sort();
  const matching = articles.filter(item => (item.category || 'General') === category);
  const subcategories = Array.from(new Set(matching.map(item => item.subcategory || 'General Articles'))).sort();
  const questions = matching.filter(item => (item.subcategory || 'General Articles') === subcategory);
  const choose = (item: IFaq): void => { setArticle(item); setAttempted(current => current.some(value => value.id === item.id) ? current : [...current, item]); };
  const back = (): void => {
    if (solved) setSolved(false);
    else if (escalating) setEscalating(false);
    else if (article) setArticle(undefined);
    else if (subcategory !== undefined) setSubcategory(undefined);
    else setCategory(undefined);
  };
  const create = async (): Promise<void> => {
    setLoading(true); setError('');
    try {
      const options = await props.service.getCreationOptions?.();
      const selectedCategory = options?.classification?.categories.find(item => item.id === article?.categoryId || item.name === category);
      const selectedSubcategory = options?.classification?.subcategories.find(item => item.parentId === selectedCategory?.id && (item.id === article?.subcategoryId || item.name === subcategory));
      const description = [details.trim(), `Self-service path: ${[category, subcategory, article?.question].filter(Boolean).join(' > ') || 'No matching guide'}`, attempted.length ? `Guides reviewed (issue still needs help):\n${attempted.map(item => '- ' + item.question).join('\n')}` : 'No matching solution found.'].filter(Boolean).join('\n\n');
      props.onCreate({ title: (details.trim().split('\n')[0] || article?.question || (category ? `${category}: Support request` : '')).slice(0, 255), description, category: selectedCategory?.id || (options?.fields.find(item => item.key === 'category')?.choices?.includes(category || '') ? category : undefined), subcategory: selectedSubcategory?.id });
      setOpen(false); reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to prepare your request. Please try again.'); }
    finally { setLoading(false); }
  };
  return <>
    <button ref={launcherRef} type="button" className={styles.launcher}
      style={{ ...(position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : {}), cursor: dragging ? 'grabbing' : 'pointer' }}
      title="Click for Help or Drag to Either Side"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const current = drag.current;
        if (!current || current.id !== event.pointerId) return;
        if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
        current.moved = true;
        setDragging(true);
        setPosition(fitLauncher(current.left + event.clientX - current.x, current.top + event.clientY - current.y, false));
      }}
      onPointerUp={finishDrag} onPointerCancel={finishDrag}
      onLostPointerCapture={() => { drag.current = undefined; setDragging(false); }}
      onClick={event => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } setOpen(true); }}
      aria-label="Open self-service help"><Icon iconName="Chat" />Need Help?</button>
    <Panel isOpen={open} onDismiss={() => { if (!loading) setOpen(false); }} type={PanelType.custom} customWidth="440px" headerText="Quick Help" closeButtonAriaLabel="Close Quick Help" isLightDismiss={!loading} styles={{ main: { maxWidth: '100vw' }, content: { padding: 20 }, commands: { paddingTop: 0 }, navigation: { alignItems: 'center', minHeight: 64, padding: '12px 20px', boxSizing: 'border-box' }, header: { padding: 0, alignSelf: 'center', minWidth: 0 }, headerText: { margin: 0, lineHeight: '32px' }, closeButton: { margin: 0, width: 32, height: 32, background: 'transparent', border: 0, color: '#52647a' } }}>
      <div className={styles.guide}>
        <p className={styles.intro}>Find a helpful article or let us help you create a support ticket.</p>
        <div className={styles.utilityNavigation}><button type="button" disabled={loading || (category === undefined && !escalating && !solved)} onClick={back}><Icon iconName="Back" />Back</button><button type="button" disabled={loading} onClick={reset}>Start Again</button></div>
        {category && <p className={styles.path}>{[category, subcategory].filter(Boolean).join(' / ')}</p>}
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {loading ? <Spinner label="Loading help..." /> : solved ? <div role="status"><h3>Glad That Helped!</h3><p>You can come back here whenever you need help.</p><PrimaryButton text="Done" onClick={() => { setOpen(false); reset(); }} /></div> : escalating ? <>
          <h3>Tell Us a Little More</h3><p>We will include the guides you reviewed so you do not have to repeat yourself.</p>
          <TextField label="What Do You Need Help With?" multiline rows={4} maxLength={4000} value={details} onChange={(_, value) => setDetails(value || '')} />
          <PrimaryButton text="Continue to Ticket Form" iconProps={{ iconName: 'Forward' }} onClick={() => { void create(); }} />
        </> : article ? <>
          <h3>{article.question}</h3><div className={styles.answer}><RichTextContent value={article.answer} /></div>
          <h4>Did This Solve Your Issue?</h4><div className={styles.navigation}><PrimaryButton text="Yes, It Helped" onClick={() => setSolved(true)} /><DefaultButton text="No, I Still Need Help" onClick={() => props.canCreate ? setEscalating(true) : setArticle(undefined)} /></div>
        </> : <>
          <h3>{category === undefined ? 'What Do You Need Help With?' : subcategory === undefined ? 'Which Area Best Matches Your Issue?' : 'Choose an Article That Matches Your Issue'}</h3>
          <div className={styles.choices}>
            {category === undefined ? categories.map(value => <button type="button" key={value} onClick={() => setCategory(value)}>{value}<Icon iconName="ChevronRight" /></button>) : subcategory === undefined ? subcategories.map(value => <button type="button" key={value} onClick={() => setSubcategory(value)}>{value}<Icon iconName="ChevronRight" /></button>) : questions.map(item => <button type="button" key={item.id} onClick={() => choose(item)}>{item.question}<Icon iconName="ChevronRight" /></button>)}
          </div>
          {!articles.length && <p>No published guides are available yet.</p>}
          {subcategory !== undefined && <DefaultButton text="Nothing Matches My Issue" onClick={() => props.canCreate ? setEscalating(true) : setSubcategory(undefined)} />}
        </>}
        {props.canCreate && !escalating && !solved && <div className={styles.footer}><p>Still need help, or prefer to contact support directly? Create a ticket and our team will help you.</p><button type="button" className={styles.issueLink} disabled={loading} onClick={() => setEscalating(true)}>Create a Ticket</button></div>}
      </div>
    </Panel>
  </>;
}
