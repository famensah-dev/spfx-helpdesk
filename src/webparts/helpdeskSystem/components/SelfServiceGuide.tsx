import * as React from 'react';
import { DefaultButton, PrimaryButton, Icon, Panel, PanelType, Spinner, MessageBar, MessageBarType, TextField } from '@fluentui/react';
import type { IFaq } from '../interfaces/IFaq';
import type { ITicketDataSource, INewTicketInput } from '../interfaces/ITicketDataSource';
import { RichTextContent } from './RichTextEditor';
import styles from './SelfServiceGuide.module.scss';

export function SelfServiceGuide(props: { service: ITicketDataSource; canCreate: boolean; onCreate: (draft: Partial<INewTicketInput>) => void }): React.ReactElement {
  const [open, setOpen] = React.useState(false);
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
  const subcategories = Array.from(new Set(matching.map(item => item.subcategory || 'General questions'))).sort();
  const questions = matching.filter(item => (item.subcategory || 'General questions') === subcategory);
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
    <button type="button" className={styles.launcher} onClick={() => setOpen(true)} aria-label="Open self-service help"><Icon iconName="Chat" />Need help?</button>
    <Panel isOpen={open} onDismiss={() => { if (!loading) setOpen(false); }} type={PanelType.custom} customWidth="440px" headerText="Quick help" closeButtonAriaLabel="Close quick help" isLightDismiss={!loading} styles={{ main: { maxWidth: '100vw' }, content: { padding: 20 }, header: { padding: '20px 20px 0' } }}>
      <div className={styles.guide}>
        <p className={styles.intro}>Find an answer or let us help you create a support ticket.</p>
        <div className={styles.utilityNavigation}><button type="button" disabled={loading || (category === undefined && !escalating && !solved)} onClick={back}><Icon iconName="Back" />Back</button><button type="button" disabled={loading} onClick={reset}>Start again</button></div>
        {category && <p className={styles.path}>{[category, subcategory].filter(Boolean).join(' / ')}</p>}
        {error && <MessageBar messageBarType={MessageBarType.error}>{error}</MessageBar>}
        {loading ? <Spinner label="Loading help..." /> : solved ? <div role="status"><h3>Glad that helped!</h3><p>You can come back here whenever you need help.</p><PrimaryButton text="Done" onClick={() => { setOpen(false); reset(); }} /></div> : escalating ? <>
          <h3>Tell us a little more</h3><p>We will include the guides you reviewed so you do not have to repeat yourself.</p>
          <TextField label="What do you need help with?" multiline rows={4} maxLength={4000} value={details} onChange={(_, value) => setDetails(value || '')} />
          <PrimaryButton text="Continue to ticket form" iconProps={{ iconName: 'Forward' }} onClick={() => { void create(); }} />
        </> : article ? <>
          <h3>{article.question}</h3><div className={styles.answer}><RichTextContent value={article.answer} /></div>
          <h4>Did this solve your issue?</h4><div className={styles.navigation}><PrimaryButton text="Yes, it helped" onClick={() => setSolved(true)} /><DefaultButton text="No, I still need help" onClick={() => props.canCreate ? setEscalating(true) : setArticle(undefined)} /></div>
        </> : <>
          <h3>{category === undefined ? 'What do you need help with?' : subcategory === undefined ? 'Which area best matches your issue?' : 'Choose the question closest to yours'}</h3>
          <div className={styles.choices}>
            {category === undefined ? categories.map(value => <button type="button" key={value} onClick={() => setCategory(value)}>{value}<Icon iconName="ChevronRight" /></button>) : subcategory === undefined ? subcategories.map(value => <button type="button" key={value} onClick={() => setSubcategory(value)}>{value}<Icon iconName="ChevronRight" /></button>) : questions.map(item => <button type="button" key={item.id} onClick={() => choose(item)}>{item.question}<Icon iconName="ChevronRight" /></button>)}
          </div>
          {!articles.length && <p>No published guides are available yet.</p>}
          {subcategory !== undefined && <DefaultButton text="Nothing matches my issue" onClick={() => props.canCreate ? setEscalating(true) : setSubcategory(undefined)} />}
        </>}
        {props.canCreate && !escalating && !solved && <div className={styles.footer}><p>Still need help, or prefer to contact support directly? Create a ticket and our team will help you.</p><button type="button" className={styles.issueLink} disabled={loading} onClick={() => setEscalating(true)}>Create a Ticket</button></div>}
      </div>
    </Panel>
  </>;
}
