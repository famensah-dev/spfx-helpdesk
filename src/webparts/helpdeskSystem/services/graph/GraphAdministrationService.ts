import { workspaceLists } from '../../interfaces/IWorkspaceSetup';
import type { IAppConfig } from './IAppConfig';
import type { GraphClient } from './GraphClient';
import type { AdminPage, IAdminData, IAdminColumn, IColumnInput, IClassificationInput, IClassificationEntry, IAdministrationService } from '../../interfaces/IAdministration';
interface Column { id: string; name: string; displayName: string; description?: string; required?: boolean; readOnly?: boolean; hidden?: boolean; text?: { allowMultipleLines?: boolean }; choice?: object; number?: object; boolean?: object; dateTime?: object; personOrGroup?: object; lookup?: { listId: string; allowMultipleValues?: boolean }; [key: string]: unknown; }
interface Context { path: string; sitePath: string; list: { id: string; displayName: string; webUrl?: string }; lists: Array<{ id: string; displayName: string; webUrl?: string }>; }
const names = workspaceLists;
const norm = (value: string): string => value.replace(/\s+/g, '').toLowerCase();
export class GraphAdministrationService implements IAdministrationService {
  public constructor(private readonly graph: GraphClient, private readonly schemaGraph: GraphClient, private readonly config: IAppConfig, private readonly getSharePointToken: () => Promise<string>, private readonly onSchemaChanged: () => void = () => undefined) {}
  private async context(page: AdminPage): Promise<Context> {
    const url = new URL(this.config.siteUrl);
    const site = this.config.siteId ? {id: this.config.siteId} : await this.graph.get<{id: string}>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const sitePath = `/sites/${encodeURIComponent(site.id)}`;
    const lists = await this.graph.getAll<{id: string; displayName: string; webUrl?: string}>(`${sitePath}/lists?$select=id,displayName,webUrl`);
    const list = lists.find(item => page === 'schema' ? this.config.listId ? item.id.toLowerCase() === this.config.listId.toLowerCase() : item.displayName === this.config.listName : this.config.resourceIds?.[page] ? item.id.toLowerCase() === this.config.resourceIds[page].toLowerCase() : item.displayName === names[page]);
    if (!list) throw new Error(`The ${page === 'schema' ? this.config.listName : names[page]} list was not found on the configured site.`);
    return {path: `${sitePath}/lists/${encodeURIComponent(list.id)}`, sitePath, list, lists};
  }
  private async rest<T>(path: string): Promise<T> {
    const response = await fetch(`${this.config.siteUrl}/_api/web/${path}`, {headers: {Authorization: `Bearer ${await this.getSharePointToken()}`, Accept: 'application/json;odata=nometadata'}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Unable to verify administration metadata (${response.status}). Check SharePoint permission consent and site access.`);
    return response.json() as Promise<T>;
  }
  private async authorize(context: Context): Promise<void> {
    const permissions = await this.rest<{Low: string}>(`lists(guid'${encodeURIComponent(context.list.id)}')/EffectiveBasePermissions`);
    if ((Number(permissions.Low) & 2048) !== 2048) throw new Error('Administration requires Manage Lists permission on this list. Ask the site owner for administrator access.');
  }
  private find(columns: Column[], name: string, kind: string): Column {
    const column = columns.find(item => norm(item.name) === norm(name)) || columns.find(item => norm(item.displayName) === norm(name));
    if (!column || !column[kind] || column.readOnly) throw new Error(`The configuration list needs a writable ${name} (${kind}) column.`);
    return column;
  }
  private async classification(context: Context, page: Exclude<AdminPage, 'schema'>): Promise<{columns: Column[]; title: Column; active: Column; order: Column; parent?: Column; parents: IClassificationEntry[]}> {
    const columns = await this.graph.getAll<Column>(`${context.path}/columns`);
    const title = this.find(columns, 'Title', 'text'), active = this.find(columns, 'Active', 'boolean'), order = this.find(columns, 'SortOrder', 'number');
    let parent: Column | undefined; let parents: IClassificationEntry[] = [];
    if (page === 'subcategories') {
      parent = this.find(columns, 'Category', 'lookup');
      const categoryList = context.lists.find(item => this.config.resourceIds?.categories ? item.id.toLowerCase() === this.config.resourceIds.categories.toLowerCase() : item.displayName === names.categories);
      if (!categoryList || parent.lookup?.allowMultipleValues || parent.lookup?.listId.toLowerCase() !== categoryList.id.toLowerCase()) throw new Error('Category must be a single lookup to Ticket Categories.');
      const categoryContext = {...context, list: categoryList, path: `${context.sitePath}/lists/${encodeURIComponent(categoryList.id)}`};
      const schema = await this.classification(categoryContext, 'categories');
      parents = await this.readEntries(categoryContext, schema);
    }
    return {columns, title, active, order, parent, parents};
  }
  private async readEntries(context: Context, schema: {title: Column; active: Column; order: Column; parent?: Column; parents: IClassificationEntry[]}): Promise<IClassificationEntry[]> {
    const items = await this.graph.getAll<{id: string; fields: Record<string, unknown>}>(`${context.path}/items?$expand=fields&$top=200`);
    return items.map(item => {
      const parentId = schema.parent ? Number(item.fields[`${schema.parent.name}LookupId`]) || undefined : undefined;
      return {id: Number(item.id), title: String(item.fields[schema.title.name] || ''), active: item.fields[schema.active.name] === true, sortOrder: Number(item.fields[schema.order.name]) || 0, parentId, parentName: schema.parents.find(parent => parent.id === parentId)?.title};
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }
  private async columns(context: Context): Promise<IAdminColumn[]> {
    const [columns, metadata] = await Promise.all([
      this.schemaGraph.getAll<Column>(`${context.path}/columns`),
      this.rest<{value: Array<{Id: string; InternalName: string; CanBeDeleted: boolean; Sealed: boolean; ReadOnlyField: boolean; FromBaseType: boolean; Required?: boolean}>}>(`lists(guid'${encodeURIComponent(context.list.id)}')/fields?$select=Id,InternalName,CanBeDeleted,Sealed,ReadOnlyField,FromBaseType,Required`)
    ]);
    const contentTypes = await this.schemaGraph.getAll<{id: string; name: string}>(`${context.path}/contentTypes?$select=id,name`);
    const requirements = await Promise.all(contentTypes.map(async type => ({name: type.name, columns: await this.schemaGraph.getAll<Column>(`${context.path}/contentTypes/${encodeURIComponent(type.id)}/columns`)})));
    return columns.map(column => {
      const field = metadata.value.find(item => item.Id.toLowerCase() === column.id.toLowerCase() || item.InternalName === column.name);
      const requiredIn = requirements.filter(type => type.columns.some(item => (item.id.toLowerCase() === column.id.toLowerCase() || item.name === column.name) && item.required === true)).map(type => type.name);
      const protectedField = !field || field.Sealed || field.ReadOnlyField || Boolean(column.readOnly) || column.name.startsWith('_');
      const kind = ['text', 'number', 'choice', 'dateTime', 'boolean', 'personOrGroup', 'lookup'].find(type => column[type]) || 'System / other';
      const core = ['title', 'status', 'priority', 'assignedto', 'assigned to', 'issue', 'description', 'issuedescription'].map(norm).includes(norm(column.name)) || ['issue', 'status', 'priority', 'assignedto', 'issuedescription'].includes(norm(column.displayName));
      return {id: column.id, name: column.name, displayName: column.displayName, description: column.description, required: field?.Required ?? column.required, requiredIn, readOnly: column.readOnly, hidden: column.hidden, protected: protectedField, canEdit: !protectedField && kind !== 'System / other', canDelete: !protectedField && field?.CanBeDeleted === true && !field.FromBaseType && !core, type: kind === 'text' ? column.text?.allowMultipleLines ? 'Multiple lines of text' : 'Single line of text' : kind, properties: {...column}};
    });
  }
  public async getData(page: AdminPage): Promise<IAdminData> {
    const context = await this.context(page); await this.authorize(context);
    if (page === 'schema') return {listName: context.list.displayName, listId: context.list.id, siteUrl: this.config.siteUrl, listUrl: context.list.webUrl || this.config.siteUrl, canManage: true, columns: await this.columns(context), entries: [], parents: [], lists: context.lists.map(item => ({id: item.id, name: item.displayName}))};
    const schema = await this.classification(context, page);
    return {listName: context.list.displayName, listId: context.list.id, siteUrl: this.config.siteUrl, listUrl: context.list.webUrl || `${this.config.siteUrl}/_layouts/15/listedit.aspx?List=${encodeURIComponent(context.list.id)}`, canManage: true, columns: [], entries: await this.readEntries(context, schema), parents: schema.parents, lists: []};
  }
  public async getLookupColumns(listId: string): Promise<Array<{name: string; displayName: string}>> {
    const context = await this.context('schema'); await this.authorize(context);
    if (!context.lists.some(item => item.id === listId)) throw new Error('Choose a list on the configured site.');
    const columns = await this.graph.getAll<Column>(`${context.sitePath}/lists/${encodeURIComponent(listId)}/columns`);
    return columns.filter(item => !item.hidden && ((item.text && !item.text.allowMultipleLines) || item.number || item.dateTime)).map(item => ({name: item.name, displayName: item.displayName}));
  }
  public async saveColumn(input: IColumnInput, id?: string): Promise<void> {
    const context = await this.context('schema'); await this.authorize(context);
    if (!input.displayName.trim() || input.displayName.length > 255) throw new Error('Enter a display name of 1–255 characters.');
    let existing: IAdminColumn | undefined;
    if (id) {
      existing = (await this.columns(context)).find(item => item.id === id);
      if (!existing?.canEdit) throw new Error('This system-managed or read-only column cannot be edited here.');
    } else {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(input.name)) throw new Error('Use an internal name of 1-64 letters, digits, or underscores, starting with a letter.');
      const columns = await this.graph.getAll<Column>(`${context.path}/columns`);
      if (columns.some(item => norm(item.name) === norm(input.name) || norm(item.displayName) === norm(input.displayName))) throw new Error('A column already uses this name.');
    }
    const body: Record<string, unknown> = {displayName: input.displayName.trim(), description: input.description, required: input.required};
    if (!id) body.name = input.name;
      switch (input.kind) {
        case 'text': if (!Number.isInteger(input.maxLength) || input.maxLength! < 1 || input.maxLength! > 255) throw new Error('Text length must be between 1 and 255.'); body.text = {allowMultipleLines: false, maxLength: input.maxLength}; break;
        case 'multiline': body.text = {allowMultipleLines: true, linesForEditing: 6, textType: input.richText ? 'richText' : 'plain'}; break;
        case 'number': if ((input.minimum !== undefined && !Number.isFinite(input.minimum)) || (input.maximum !== undefined && !Number.isFinite(input.maximum)) || (input.minimum !== undefined && input.maximum !== undefined && input.minimum > input.maximum)) throw new Error('Enter valid number bounds.'); body.number = {minimum: input.minimum, maximum: input.maximum, decimalPlaces: input.decimals || 'automatic'}; break;
        case 'choice': { const choices = (input.choices || []).map(value => value.trim()).filter(Boolean); if (!choices.length || new Set(choices).size !== choices.length) throw new Error('Enter unique choices, one per line.'); body.choice = {choices, allowTextEntry: Boolean(input.allowTextEntry), displayAs: 'dropDownMenu'}; break; }
        case 'dateTime': body.dateTime = {format: input.dateOnly ? 'dateOnly' : 'dateTime', displayAs: 'default'}; break;
        case 'boolean': body.boolean = {}; break;
        case 'personOrGroup': body.personOrGroup = {allowMultipleSelection: Boolean(input.multiple), chooseFromType: input.peopleOnly === false ? 'peopleAndGroups' : 'peopleOnly', displayAs: 'name'}; break;
        case 'lookup': if (!input.lookupListId || !(await this.getLookupColumns(input.lookupListId)).some(item => item.name === input.lookupColumnName)) throw new Error('Choose a valid source list and column.'); body.lookup = {listId: input.lookupListId, columnName: input.lookupColumnName, allowMultipleValues: Boolean(input.multiple)}; break;
        default: throw new Error('Unsupported column type.');
      }
    if (input.defaultValue !== undefined && input.defaultFormula !== undefined) throw new Error('Choose a default value or formula, not both.');
    if (input.defaultFormula !== undefined) {
      if (!input.defaultFormula.trim()) throw new Error('Enter a default formula.');
      body.defaultValue = {formula: input.defaultFormula.trim()};
    } else if (input.defaultValue !== undefined && input.defaultValue !== '') {
      const value = input.defaultValue;
      if (input.kind === 'number' && (!Number.isFinite(Number(value)) || (input.minimum !== undefined && Number(value) < input.minimum) || (input.maximum !== undefined && Number(value) > input.maximum))) throw new Error('Default must be a number within the allowed range.');
      if (input.kind === 'boolean' && !['0', '1'].includes(value)) throw new Error('Choose Yes or No for the default.');
      if (input.kind === 'choice' && !input.allowTextEntry && !(input.choices || []).map(item => item.trim()).includes(value)) throw new Error('Default must match a configured choice, or allow manual values.');
      if (input.kind === 'text' && value.length > (input.maxLength || 255)) throw new Error('Default exceeds the maximum text length.');
      if (input.kind === 'dateTime' && Number.isNaN(Date.parse(value))) throw new Error('Enter a valid default date.');
      body.defaultValue = {value};
    } else if (existing?.properties.defaultValue) body.defaultValue = null;
    const facet = input.kind === 'multiline' ? 'text' : input.kind;
    if (existing) {
      const oldFacet = ['text', 'number', 'choice', 'dateTime', 'boolean', 'personOrGroup', 'lookup'].find(key => existing!.properties[key]);
      if (oldFacet === facet) body[facet] = {...(existing.properties[facet] as Record<string, unknown>), ...(body[facet] as Record<string, unknown>)};
      await this.schemaGraph.patch(`${context.path}/columns/${encodeURIComponent(id!)}`, body);
    } else await this.schemaGraph.post(`${context.path}/columns`, body);
    this.onSchemaChanged();
  }
  public async deleteColumn(id: string): Promise<void> {
    const context = await this.context('schema'); await this.authorize(context);
    if (!(await this.columns(context)).find(item => item.id === id)?.canDelete) throw new Error('This system-managed, built-in, or core ticket column cannot be deleted here.');
    await this.schemaGraph.delete(`${context.path}/columns/${encodeURIComponent(id)}`); this.onSchemaChanged();
  }
  public async saveEntry(page: Exclude<AdminPage, 'schema'>, input: IClassificationInput, id?: number): Promise<void> {
    const context = await this.context(page); await this.authorize(context);
    if (!input.title.trim() || input.title.length > 255) throw new Error('Enter a name of 1–255 characters.');
    if (!Number.isFinite(input.sortOrder) || input.sortOrder < 0) throw new Error('Sort order must be zero or greater.');
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid configuration item ID.');
    const schema = await this.classification(context, page);
    const fields: Record<string, unknown> = {[schema.title.name]: input.title.trim(), [schema.active.name]: input.active, [schema.order.name]: input.sortOrder};
    if (schema.parent) {
      if (!schema.parents.some(item => item.id === input.parentId)) throw new Error('Select a valid parent category.');
      fields[`${schema.parent.name}LookupId`] = String(input.parentId);
    }
    if (id) await this.graph.patch(`${context.path}/items/${id}/fields`, fields); else await this.graph.post(`${context.path}/items`, {fields});
  }
  public async deleteEntry(page: Exclude<AdminPage, 'schema'>, id: number): Promise<void> {
    const context = await this.context(page); await this.authorize(context);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid configuration item ID.');
    // Deactivate instead of deleting referenced classification values; SharePoint enforces any lookup restrictions too.
    if (page === 'categories' || page === 'subcategories') {
      const child = await this.context(page === 'categories' ? 'subcategories' : 'issueTypes');
      if (page === 'categories') {
        const schema = await this.classification(child, 'subcategories');
        if ((await this.readEntries(child, schema)).some(item => item.parentId === id)) throw new Error('This category has subcategories. Deactivate it or reassign its children first.');
      }
    }
    await this.graph.delete(`${context.path}/items/${id}`);
  }
}
