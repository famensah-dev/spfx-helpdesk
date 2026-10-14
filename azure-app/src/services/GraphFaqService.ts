import { GraphClient } from './GraphClient';
import type { IAppConfig } from '../config';
import type { IFaq, IFaqInput, IFaqAccess } from '../../../src/webparts/helpdeskSystem/interfaces/IFaq';

interface Column { required?: boolean; name: string; displayName: string; text?: object; boolean?: object; number?: object; choice?: { choices: string[] }; readOnly?: boolean; lookup?: { listId: string; allowMultipleValues?: boolean }; }
interface Context { path: string; listId: string; fields: Record<'question' | 'answer' | 'category' | 'keywords' | 'published' | 'sortOrder', string> & { subcategory?: string }; categories?: string[]; categoryColumn: Column; subcategoryColumn?: Column; sitePath: string; requiredTitle?: string; }
export class GraphFaqService {
  private context?: Context;
  public constructor(private readonly graph: GraphClient, private readonly config: IAppConfig, private readonly getSharePointToken?: () => Promise<string>) {}
  private async schema(): Promise<Context> {
    if (this.context) return this.context;
    const url = new URL(this.config.siteUrl);
    const site = this.config.siteId ? { id: this.config.siteId } : await this.graph.get<{ id: string }>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const base = `/sites/${encodeURIComponent(site.id)}/lists`;
    const lists = await this.graph.getAll<{ id: string; displayName: string }>(`${base}?$select=id,displayName`);
    const list = lists.find(item => this.config.faqListId ? item.id.toLowerCase() === this.config.faqListId.toLowerCase() : item.displayName === (this.config.faqListName || 'FAQs'));
    if (!list) throw new Error('The FAQs list is not available. Create it on the configured helpdesk site using the FAQ setup instructions, or check your list access.');
    const path = `${base}/${encodeURIComponent(list.id)}`;
    const columns = await this.graph.getAll<Column>(`${path}/columns`);
    const normalize = (value: string): string => value.replace(/\s+/g, '').toLowerCase();
    const find = (names: string[], kinds: Array<'text' | 'boolean' | 'number' | 'choice' | 'lookup'>): Column => {
      const matches = names.flatMap(name => columns.filter(item => normalize(item.displayName) === normalize(name) || normalize(item.name) === normalize(name)));
      const column = matches.find(item => !item.readOnly && kinds.some(kind => item[kind])) || matches[0];
      if (!column) throw new Error(`FAQs: no column matching ${names.join(' / ')} was found. Available columns: ${columns.filter(item => !item.readOnly).map(item => `${item.displayName} (${item.name})`).join(', ')}.`);
      if (column.readOnly) throw new Error(`FAQs: "${column.displayName}" (${column.name}) is read-only. Use a writable ${kinds.join(' or ')} column for ${names[0]}.`);
      if (!kinds.some(kind => column[kind])) {
        const actual = ['text', 'boolean', 'number', 'choice', 'lookup', 'calculated', 'dateTime', 'personOrGroup'].find(kind => Boolean((column as unknown as Record<string, unknown>)[kind])) || 'an unrecognized type';
        throw new Error(`FAQs: "${column.displayName}" (${column.name}) has type ${actual}; expected ${kinds.join(' or ')}. Check this column under List settings > Columns.`);
      }
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column.name)) throw new Error(`FAQs: "${column.displayName}" has an unsupported internal name: ${column.name}.`);
      return column;
    };
    const category = find(['Category'], ['text', 'choice', 'lookup']);
    const subcategory = columns.some(item => normalize(item.displayName) === 'subcategory' || normalize(item.name) === 'subcategory') ? find(['Subcategory'], ['lookup', 'text', 'choice']) : undefined;
    this.context = { path, listId: list.id, categories: category.choice?.choices, requiredTitle: columns.find(item => item.name === 'Title' && item.required && item.text)?.name, categoryColumn: category, subcategoryColumn: subcategory, sitePath: `/sites/${encodeURIComponent(site.id)}`, fields: {
      question: find(['Question', 'Title'], ['text']).name, answer: find(['Answer'], ['text']).name,
      category: category.name, keywords: find(['Keywords'], ['text']).name,
      ...(subcategory ? { subcategory: subcategory.name } : {}), published: find(['IsPublished', 'Published'], ['boolean']).name, sortOrder: find(['SortOrder', 'Sort Order'], ['number']).name
    } };
    return this.context;
  }
  private async lookupOptions(schema: Context): Promise<Pick<IFaqAccess, 'categoryOptions' | 'subcategoryOptions'>> {
    const read = async (column: Column | undefined, subcategory: boolean): Promise<Array<{ id: string; name: string; parentId: string; active: boolean }> | undefined> => {
      if (!column?.lookup) return undefined;
      if (column.lookup.allowMultipleValues) throw new Error('FAQ classifications must use single-value lookups.');
      const path = `${schema.sitePath}/lists/${encodeURIComponent(column.lookup.listId)}`;
      const columns = await this.graph.getAll<Column>(`${path}/columns`);
      const title = columns.find(item => item.name === 'Title');
      if (!title?.text) throw new Error('The FAQ lookup list needs a Title text column.');
      const active = columns.find(item => item.name.toLowerCase() === 'active' && item.boolean);
      const parent = subcategory ? columns.find(item => (item.displayName?.toLowerCase() === 'category' || item.name.toLowerCase() === 'category') && item.lookup) : undefined;
      if (subcategory && (!parent?.lookup || parent.lookup.allowMultipleValues || parent.lookup.listId.toLowerCase() !== schema.categoryColumn.lookup?.listId.toLowerCase())) throw new Error('The FAQ subcategory list must have a single Category lookup to the FAQ category source list.');
      const items = await this.graph.getAll<{ id: string; fields: Record<string, unknown> }>(`${path}/items?$expand=fields&$top=200`);
      return items.map(item => ({ id: item.id, name: String(item.fields[title.name] || ''), parentId: parent ? String(item.fields[`${parent.name}LookupId`] || '') : '', active: active ? item.fields[active.name] === true : true })).filter(item => item.name);
    };
    const [categoryOptions, subcategoryOptions] = await Promise.all([read(schema.categoryColumn, false), read(schema.subcategoryColumn, true)]);
    return { categoryOptions, subcategoryOptions };
  }
  public async getAccess(): Promise<IFaqAccess> {
    const schema = await this.schema();
    if (!this.getSharePointToken) return { canManage: false, categories: schema.categories };
    const token = await this.getSharePointToken();
    const response = await fetch(`${this.config.siteUrl}/_api/web/lists(guid'${encodeURIComponent(schema.listId)}')/EffectiveBasePermissions`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata' }, signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Unable to verify FAQ management permissions (${response.status}). Confirm SharePoint permission consent and list access.`);
    const permissions = await response.json() as { Low: string; High: string };
    // AddListItems, EditListItems, DeleteListItems. Actual writes remain enforced by SharePoint.
    return { canManage: (Number(permissions.Low) & 14) === 14, categories: schema.categories, ...await this.lookupOptions(schema) };
  }
  public async getFaqs(manage = false): Promise<IFaq[]> {
    const schema = await this.schema();
    if (manage && !(await this.getAccess()).canManage) throw new Error('Your account cannot manage this FAQ list.');
    const fields = schema.fields;
    const lookupOptions = await this.lookupOptions(schema);
    const items = await this.graph.getAll<{ id: string; lastModifiedDateTime: string; fields: Record<string, unknown> }>(`${schema.path}/items?$expand=fields&$top=200`);
    return items.filter(item => manage || item.fields[fields.published] === true).map(item => ({
      id: Number(item.id), question: String(item.fields[fields.question] || ''), answer: String(item.fields[fields.answer] || ''),
      categoryId: schema.categoryColumn.lookup ? String(item.fields[`${fields.category}LookupId`] || '') : undefined,
      category: lookupOptions.categoryOptions?.find(value => value.id === String(item.fields[`${fields.category}LookupId`]))?.name || String(item.fields[fields.category] || ''),
      subcategoryId: fields.subcategory && schema.subcategoryColumn?.lookup ? String(item.fields[`${fields.subcategory}LookupId`] || '') : undefined,
      subcategory: fields.subcategory ? lookupOptions.subcategoryOptions?.find(value => value.id === String(item.fields[`${fields.subcategory}LookupId`]))?.name || String(item.fields[fields.subcategory] || '') : undefined, keywords: String(item.fields[fields.keywords] || ''),
      published: item.fields[fields.published] === true, sortOrder: Number(item.fields[fields.sortOrder]) || 0, modified: item.lastModifiedDateTime
    })).sort((a, b) => a.sortOrder - b.sortOrder || a.question.localeCompare(b.question));
  }
  public async save(input: IFaqInput, id?: number): Promise<void> {
    const schema = await this.schema();
    if (!(await this.getAccess()).canManage) throw new Error('Your account cannot manage this FAQ list.');
    if (!input.question.trim() || input.question.trim().length > 255) throw new Error('Enter a question of 1–255 characters.');
    if (!input.answer.trim()) throw new Error('Enter an answer.');
    if (!Number.isFinite(input.sortOrder) || input.sortOrder < 0) throw new Error('Sort order must be zero or greater.');
    if (schema.categories && input.category && !schema.categories.includes(input.category)) throw new Error('Select a category configured on the FAQs list.');
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid FAQ ID.');
    const values: Record<string, unknown> = {};
    (Object.keys(schema.fields) as Array<keyof typeof schema.fields>).forEach(key => { const name = schema.fields[key]; if (name) values[name] = typeof input[key] === 'string' ? (input[key] as string).trim() : input[key] ?? ''; });
    if (schema.requiredTitle && schema.requiredTitle !== schema.fields.question) values[schema.requiredTitle] = input.question.trim();
    const lookups = await this.lookupOptions(schema);
    if (schema.categoryColumn.lookup) {
      delete values[schema.fields.category];
      const category = lookups.categoryOptions?.find(item => item.id === input.categoryId);
      if (input.categoryId && !category) throw new Error('Select a valid FAQ category.');
      values[`${schema.fields.category}LookupId`] = category?.id || null;
    }
    if (schema.subcategoryColumn?.lookup && schema.fields.subcategory) {
      delete values[schema.fields.subcategory];
      const subcategory = lookups.subcategoryOptions?.find(item => item.id === input.subcategoryId);
      if (input.subcategoryId && (!subcategory || subcategory.parentId !== input.categoryId)) throw new Error('Select a subcategory belonging to the selected category.');
      values[`${schema.fields.subcategory}LookupId`] = subcategory?.id || null;
    }
    if (id) await this.graph.patch(`${schema.path}/items/${id}/fields`, values);
    else await this.graph.post(`${schema.path}/items`, { fields: values });
  }
  public async delete(id: number): Promise<void> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid FAQ ID.');
    const schema = await this.schema();
    if (!(await this.getAccess()).canManage) throw new Error('Your account cannot manage this FAQ list.');
    await this.graph.delete(`${schema.path}/items/${id}`);
  }
}
