import { SearchableSelect } from './SearchableSelect';
import * as React from 'react';
import { DirectionalHint, Dropdown, Spinner, MessageBar } from '@fluentui/react';
import type { ITicketDataSource, ITicketCreationOptions } from '../interfaces/ITicketDataSource';
import type { ITicket } from '../interfaces/ITicket';
import styles from './HelpdeskSystem.module.scss';
export function TicketClassificationFields(props: { service?: ITicketDataSource; ticket: ITicket; disabled: boolean; onChange: (value: { category?: string; subcategory?: string; issueType?: string }) => void }): React.ReactElement | null {
  const [options, setOptions] = React.useState<ITicketCreationOptions>();
  const [error, setError] = React.useState('');
  const [values, setValues] = React.useState({ category: '', subcategory: '', issueType: '' });
  React.useEffect(() => {
    let active = true;
    props.service?.getCreationOptions?.().then(result => {
      if (!active) return;
      setOptions(result);
      const taxonomy = result.classification;
      setValues({ category: taxonomy?.categories.find(item => item.name === props.ticket.Category)?.id || '', subcategory: taxonomy?.subcategories.find(item => item.name === props.ticket.Subcategory)?.id || '', issueType: taxonomy?.issueTypes.find(item => item.name === props.ticket.IssueType)?.id || '' });
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load classification.'); });
    return () => { active = false; };
  }, [props.service, props.ticket.Id]);
  if (!props.service?.getCreationOptions) return null;
  if (error) return <MessageBar>{error} Existing classification will be preserved.</MessageBar>;
  if (!options) return <Spinner label="Loading classification…" />;
  const taxonomy = options.classification;
  if (!taxonomy) return null;
  return <div className={styles.newTicketClassification}>{(['category', 'subcategory', 'issueType'] as const).map(key => {
    const field = options.fields.find(item => item.key === key);
    if (!field) return null;
    const entries = key === 'category' ? taxonomy.categories : key === 'subcategory' ? taxonomy.subcategories.filter(item => item.parentId === values.category) : taxonomy.issueTypes;
    const legacy = key === 'category' ? props.ticket.Category : key === 'subcategory' ? props.ticket.Subcategory : props.ticket.IssueType;
    return <SearchableSelect key={key} label={field.label} required={field.required} value={values[key]} placeholder={legacy ? `${legacy} (current)` : 'Select an option'} disabled={props.disabled || (key === 'subcategory' && !values.category)} options={[{ key: '', text: 'Not specified' }, ...entries.map(item => ({ key: item.id, text: item.name }))]} onChange={value => {
      const next = { ...values, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) };
      setValues(next);
      // Preserve untouched legacy fields; changing a parent explicitly clears its children.
      props.onChange(key === 'category' ? { category: next.category, subcategory: '' } : key === 'subcategory' ? { category: values.category || undefined, subcategory: next.subcategory } : { issueType: next.issueType });
    }} />;
  })}</div>;
}
