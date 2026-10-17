import * as React from 'react';
import { Icon, IconButton, DefaultButton, PrimaryButton, SearchBox, Dropdown, MessageBar, MessageBarType, Spinner, SpinnerSize, Panel, PanelType } from '@fluentui/react';
import type { IAdminData, IAdminColumn, IColumnInput, IAdministrationService } from '../interfaces/IAdministration';
import { AdminColumnForm } from './AdminColumnForm';
import { cancelButtonStyles } from './cancelButtonStyles';
import styles from './HelpdeskSystem.module.scss';
const columnTypeLabels: Record<string, string> = {personOrGroup: 'Person', dateTime: 'Date and Time', number: 'Number', choice: 'Choice', boolean: 'Yes/No', lookup: 'Lookup', 'Single line of text': 'Single Line of Text', 'Multiple lines of text': 'Multiple Lines of Text', 'System / other': 'System / Other'};
export function TicketSchemaWorkspace(props: { data: IAdminData; service: IAdministrationService; busy: boolean; input: IColumnInput | null; editing: boolean; error: string; onInput: (value: IColumnInput | null) => void; onNew: () => void; onEdit: (column: IAdminColumn) => void; onInspect: (column: IAdminColumn) => void; onDelete: (column: IAdminColumn) => void; onSave: () => void; onRefresh: () => void; onError: (message: string) => void }): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [type, setType] = React.useState('');
  const [filter, setFilter] = React.useState('editable');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc' | null>(null);
  const [copied, setCopied] = React.useState(false);
  const types = Array.from(new Set(props.data.columns.map(column => column.type))).sort();
  const rows = props.data.columns.filter(column => (!type || column.type === type) && (!filter || (filter === 'required' && (column.required || column.requiredIn?.length)) || (filter === 'editable' && column.canEdit) || (filter === 'protected' && column.protected)) && `${column.displayName} ${column.name} ${column.description || ''}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden) || (sortDirection ? (sortDirection === 'desc' ? -1 : 1) * a.displayName.localeCompare(b.displayName) : 0));
  const icon = (column: IAdminColumn): string => column.type.includes('text') ? 'TextDocument' : column.type === 'lookup' ? 'Link' : column.type === 'personOrGroup' ? 'Contact' : column.type === 'dateTime' ? 'Calendar' : column.type === 'number' ? 'NumberField' : column.type === 'boolean' ? 'CheckboxComposite' : 'BulletedList';
  return <div className={styles.schemaWorkspace}>
    <div className={styles.schemaTopRow}>
    <div className={styles.schemaHeading}><small>List name</small><h2>{props.data.listName} Schema</h2></div>
    <div className={styles.schemaListSummary}>
      <div><small>SharePoint site</small><a href={props.data.siteUrl} target="_blank" rel="noopener noreferrer">{props.data.siteUrl?.split('/').filter(Boolean).pop() || 'Helpdesk site'}</a></div>
      <div className={styles.schemaListIdentifier}><small>List ID</small><span>{props.data.listId}<IconButton iconProps={{iconName: copied ? 'CheckMark' : 'Copy'}} title={copied ? 'Copied' : 'Copy list ID'} ariaLabel="Copy list ID" onClick={() => { navigator.clipboard.writeText(props.data.listId || '').then(() => setCopied(true)).catch(() => props.onError('Unable to copy the list ID.')); }} /></span></div>
      <a className={styles.adminSharePointLink} href={props.data.listUrl} target="_blank" rel="noopener noreferrer">Open in SharePoint</a>
    </div>
    </div>
    <div className={styles.schemaToolbar}>
      <SearchBox showIcon iconProps={{iconName: 'Search'}} placeholder="Search columns…" ariaLabel="Search ticket columns" value={query} onChange={(_, value) => setQuery(value || '')} />
      <Dropdown ariaLabel="Column properties filter" selectedKey={filter} options={[{key: '', text: 'All Columns'}, {key: 'required', text: 'Required Columns'}, {key: 'editable', text: 'Editable Columns'}, {key: 'protected', text: 'Protected Columns'}]} onChange={(_, option) => setFilter(String(option?.key || ''))} />
      <Dropdown ariaLabel="Column type" selectedKey={type} options={[{key: '', text: 'All Column Types'}, ...types.map(value => ({key: value, text: columnTypeLabels[value] || value}))]} onChange={(_, option) => setType(String(option?.key || ''))} />
      <IconButton iconProps={{iconName: 'Refresh'}} ariaLabel="Refresh columns" disabled={props.busy} onClick={props.onRefresh} />
      <div className={styles.ticketActions}><DefaultButton text="Add Column" iconProps={{iconName: 'Add'}} disabled={props.busy} onClick={props.onNew} /></div>
    </div>
    <div className={styles.schemaColumnsLayout}>
      <div className={styles.schemaTableCard}><div className={styles.tableContainer}><table className={styles.ticketTable}><thead><tr><th><button type="button" className={styles.columnSortButton} onClick={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')}>Display name {sortDirection && <Icon iconName={sortDirection === 'desc' ? 'SortDown' : 'SortUp'} />}</button></th><th>Internal name</th><th>Type</th><th>Required</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(column => <tr key={column.id}>
        <td><button type="button" className={styles.ticketSubjectLink} onClick={() => column.canEdit ? props.onEdit(column) : props.onInspect(column)}>{column.displayName}</button></td><td>{column.name}</td><td><span className={styles.schemaColumnType}><Icon iconName={icon(column)} />{({personOrGroup: 'Person', dateTime: 'Date and Time', number: 'Number', choice: 'Choice', boolean: 'Yes/No', lookup: 'Lookup', 'Single line of text': 'Single Line of Text', 'Multiple lines of text': 'Multiple Lines of Text', 'System / other': 'System / Other'} as Record<string, string>)[column.type] || column.type}</span></td>
        <td><span className={styles.schemaRequired} title={column.requiredIn?.length ? `Required for: ${column.requiredIn.join(', ')}` : undefined} data-required={column.required || Boolean(column.requiredIn?.length)}>{column.required || column.requiredIn?.length ? 'Yes' : column.required === undefined ? 'Unknown' : 'No'}</span></td><td title={column.description}><span className={styles.schemaDescription}>{column.description || '—'}</span></td><td><span className={styles.faqStatusPill} data-active={!column.hidden}>{column.hidden ? 'Hidden' : 'Visible'}</span></td>
        <td><IconButton iconProps={{iconName: 'More'}} onRenderMenuIcon={() => null} ariaLabel={`Actions for ${column.displayName}`} disabled={props.busy} menuProps={{items: [{key: 'view', text: 'View all properties', iconProps: {iconName: 'Info'}, onClick: () => props.onInspect(column)}, {key: 'edit', text: 'Edit properties', disabled: !column.canEdit, iconProps: {iconName: 'Edit'}, onClick: () => props.onEdit(column)}, {key: 'delete', text: 'Delete column', disabled: !column.canDelete, iconProps: {iconName: 'Delete'}, onClick: () => props.onDelete(column)}]}} /></td>
      </tr>)}</tbody></table></div>{!rows.length && <p className={styles.adminHint}>No columns match these filters.</p>}</div>
      {props.input && <Panel isOpen type={PanelType.custom} customWidth="400px" headerText={props.editing ? 'Edit Column' : 'Add Column'} isBlocking isLightDismiss={false} hasCloseButton={!props.busy} onDismiss={() => { if (!props.busy) props.onInput(null); }} closeButtonAriaLabel="Close column editor" styles={{main: {color: '#172536', maxWidth: '100vw'}, content: {paddingTop: 20}}}>
        <form onSubmit={event => {event.preventDefault();
            const column = props.data.columns.find(item => item.name === props.input?.name);
            const previousKind = column?.properties.text ? (column.properties.text.allowMultipleLines ? 'multiline' : 'text') : column?.type;
            if (props.editing && previousKind !== props.input?.kind && !window.confirm('Change this column?s data type? Existing values may be converted or lost. SharePoint may reject incompatible changes.')) return;
            props.onSave();}}>
          {props.error && <MessageBar messageBarType={MessageBarType.error}>{props.error}</MessageBar>}
          <AdminColumnForm value={props.input} editing={props.editing} disabled={props.busy} lists={props.data.lists} service={props.service} onChange={props.onInput} onError={props.onError} />
          <div className={styles.faqModalFooter}><DefaultButton text="Cancel" styles={cancelButtonStyles} disabled={props.busy} onClick={() => props.onInput(null)} /><PrimaryButton type="submit" text={props.busy ? 'Saving…' : props.editing ? 'Save changes' : 'Create Column'} disabled={props.busy} onRenderIcon={props.busy ? () => <Spinner size={SpinnerSize.xSmall} /> : undefined} /></div>
        </form>
      </Panel>}
    </div>
  </div>;
}
