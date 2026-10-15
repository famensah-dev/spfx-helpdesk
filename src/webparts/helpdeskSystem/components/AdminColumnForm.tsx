import * as React from 'react';
import { TextField, Dropdown, Checkbox, Toggle } from '@fluentui/react';
import type { IColumnInput, IAdministrationService, ColumnKind } from '../interfaces/IAdministration';
import styles from './HelpdeskSystem.module.scss';
export const newColumn: IColumnInput = {name: '', displayName: '', description: '', required: false, kind: 'text', maxLength: 255, choices: [], peopleOnly: true};
export function AdminColumnForm(props: { value: IColumnInput; editing: boolean; disabled: boolean; lists: Array<{id: string; name: string}>; service: IAdministrationService; onChange: (value: IColumnInput) => void; onError: (error: string) => void }): React.ReactElement {
  const [sourceColumns, setSourceColumns] = React.useState<Array<{name: string; displayName: string}>>([]);
  const [loading, setLoading] = React.useState(false);
  const value = props.value;
  const change = (patch: Partial<IColumnInput>): void => props.onChange({...value, ...patch});
  React.useEffect(() => {
    let active = true; setSourceColumns([]);
    if (value.kind !== 'lookup' || !value.lookupListId) return;
    setLoading(true);
    props.service.getLookupColumns(value.lookupListId).then(columns => { if (active) setSourceColumns(columns); }).catch(reason => { if (active) props.onError(reason instanceof Error ? reason.message : 'Unable to load source columns.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [value.lookupListId, value.kind, props.service]);
  return <div className={styles.adminFormFields}>
    <TextField label="Display name" required maxLength={255} value={value.displayName} disabled={props.disabled} onChange={(_, text) => { const displayName = text || ''; const internalName = (label: string): string => label.replace(/[^A-Za-z0-9_]/g, '').replace(/^[^A-Za-z]+/, '').slice(0, 64); change({displayName, ...(!props.editing && (!value.name || value.name === internalName(value.displayName)) ? {name: internalName(displayName)} : {})}); }} />
    <TextField label="Description" multiline rows={2} value={value.description} disabled={props.disabled} onChange={(_, text) => change({description: text || ''})} />
    {<Dropdown label="Data type" required selectedKey={value.kind} disabled={props.disabled} options={[['text', 'Single line of text'], ['multiline', 'Multiple lines of text'], ['number', 'Number'], ['choice', 'Choice'], ['dateTime', 'Date and time'], ['boolean', 'Yes/No'], ['personOrGroup', 'Person or group'], ['lookup', 'Lookup']].map(([key, text]) => ({key, text}))} onChange={(_, option) => change({kind: option?.key as ColumnKind, defaultValue: undefined, defaultFormula: undefined})} />}
    <Toggle label="Required" onText="Yes" offText="No" checked={value.required} disabled={props.disabled} onChange={(_, checked) => change({required: Boolean(checked)})} />
    {<details className={styles.schemaAdvanced} open={value.kind === 'choice' || value.kind === 'lookup' || undefined}><summary>Type settings</summary><div className={styles.adminFormFields}>
      {value.kind === 'text' && <TextField label="Maximum length" type="number" min={1} max={255} value={String(value.maxLength || '')} disabled={props.disabled} onChange={(_, text) => change({maxLength: Number(text)})} />}
      {value.kind === 'multiline' && <Checkbox label="Rich text" checked={Boolean(value.richText)} disabled={props.disabled} onChange={(_, checked) => change({richText: Boolean(checked)})} />}
      {value.kind === 'choice' && <TextField label="Choices (one per line)" required multiline rows={5} value={(value.choices || []).join('\n')} disabled={props.disabled} onChange={(_, text) => change({choices: (text || '').split('\n')})} />}
      {value.kind === 'number' && <div className={styles.newTicketFields}><TextField label="Minimum (optional)" type="number" value={value.minimum === undefined ? '' : String(value.minimum)} disabled={props.disabled} onChange={(_, text) => change({minimum: text ? Number(text) : undefined})} /><TextField label="Maximum (optional)" type="number" value={value.maximum === undefined ? '' : String(value.maximum)} disabled={props.disabled} onChange={(_, text) => change({maximum: text ? Number(text) : undefined})} /><Dropdown label="Decimal places" selectedKey={value.decimals || 'automatic'} disabled={props.disabled} options={['automatic', 'none', 'one', 'two', 'three', 'four', 'five'].map(key => ({key, text: key}))} onChange={(_, option) => change({decimals: String(option?.key)})} /></div>}
      {value.kind === 'dateTime' && <Checkbox label="Date only" checked={Boolean(value.dateOnly)} disabled={props.disabled} onChange={(_, checked) => change({dateOnly: Boolean(checked)})} />}
      {value.kind === 'personOrGroup' && <Checkbox label="People only (exclude groups)" checked={value.peopleOnly !== false} disabled={props.disabled} onChange={(_, checked) => change({peopleOnly: Boolean(checked)})} />}
      {value.kind === 'lookup' && <><Dropdown label="Source list" required selectedKey={value.lookupListId} disabled={props.disabled} options={props.lists.map(item => ({key: item.id, text: item.name}))} onChange={(_, option) => change({lookupListId: String(option?.key), lookupColumnName: undefined})} /><Dropdown label={loading ? 'Loading source columns…' : 'Source column'} required selectedKey={value.lookupColumnName} disabled={props.disabled || loading || !value.lookupListId} options={sourceColumns.map(item => ({key: item.name, text: item.displayName}))} onChange={(_, option) => change({lookupColumnName: String(option?.key)})} /></>}
      {['lookup', 'personOrGroup'].includes(value.kind) && <Checkbox label="Allow multiple values" checked={Boolean(value.multiple)} disabled={props.disabled} onChange={(_, checked) => change({multiple: Boolean(checked)})} />}
    </div></details>}
    <details className={styles.schemaAdvanced}><summary>Advanced settings</summary><div className={styles.adminFormFields}>
      {value.kind === 'choice' && <Toggle label="Allow manual values" onText="Yes" offText="No" checked={Boolean(value.allowTextEntry)} disabled={props.disabled} onChange={(_, checked) => change({allowTextEntry: Boolean(checked)})} />}
      {['text', 'number', 'choice', 'dateTime', 'boolean'].includes(value.kind) && <>
        <Dropdown label="Default value" selectedKey={value.defaultFormula !== undefined ? 'formula' : value.defaultValue !== undefined ? 'value' : 'none'} disabled={props.disabled} options={[{key: 'none', text: 'No default'}, {key: 'value', text: 'Specific value'}, {key: 'formula', text: 'Formula'}]} onChange={(_, option) => change({defaultValue: option?.key === 'value' ? '' : undefined, defaultFormula: option?.key === 'formula' ? '' : undefined})} />
        {value.defaultFormula !== undefined && <TextField label="Default formula" placeholder="=[Today]" value={value.defaultFormula} disabled={props.disabled} onChange={(_, text) => change({defaultFormula: text || ''})} />}
        {value.defaultValue !== undefined && (value.kind === 'boolean' ? <Dropdown label="Default" selectedKey={value.defaultValue} options={[{key: '1', text: 'Yes'}, {key: '0', text: 'No'}]} disabled={props.disabled} onChange={(_, option) => change({defaultValue: String(option?.key || '0')})} /> : <TextField label="Default" type={value.kind === 'number' ? 'number' : 'text'} description={value.kind === 'dateTime' ? 'Enter an ISO date, for example 2026-10-15.' : undefined} value={value.defaultValue} disabled={props.disabled} onChange={(_, text) => change({defaultValue: text || ''})} />)}
      </>}
    <TextField label="Internal name" required value={value.name} disabled={props.disabled || props.editing} description="Permanent API name. Use letters, digits, and underscores." onChange={(_, text) => change({name: text || ''})} />
    </div></details>
  </div>;
}
