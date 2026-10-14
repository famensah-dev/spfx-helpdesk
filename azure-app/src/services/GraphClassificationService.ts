import type { GraphClient } from './GraphClient';
import type { ITicketClassification, IClassificationOption } from '../../../src/webparts/helpdeskSystem/interfaces/ITicketDataSource';
interface Column { name: string; displayName: string; text?: object; boolean?: object; number?: object; lookup?: { listId: string; allowMultipleValues?: boolean }; }
export async function loadClassification(graph: GraphClient, sitePath: string, lists: Array<{ id: string; displayName: string }>): Promise<ITicketClassification> {
  const getList = (name: string): { id: string; displayName: string } => {
    const list = lists.find(item => item.displayName === name);
    if (!list) throw new Error(`The ${name} list was not found on the configured site.`);
    return list;
  };
  const category = getList('Ticket Categories'), subcategory = getList('Ticket Subcategories'), issueType = getList('Ticket Issue Types');
  const read = async (list: { id: string; displayName: string }, parent?: { label: string; listId: string }): Promise<IClassificationOption[]> => {
    const path = `${sitePath}/lists/${encodeURIComponent(list.id)}`;
    const columns = await graph.getAll<Column>(`${path}/columns`);
    const find = (name: string): Column => {
      const normalize = (value: string): string => value.replace(/\s+/g, '').toLowerCase();
      const column = columns.find(item => normalize(item.name) === normalize(name)) || columns.find(item => normalize(item.displayName) === normalize(name));
      if (!column || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column.name)) throw new Error(`${list.displayName} needs a ${name} column.`);
      return column;
    };
    const title = find('Title'), active = find('Active'), order = find('SortOrder');
    const checkType = (column: Column, kind: 'text' | 'boolean' | 'number', expected: string): void => {
      if (column[kind]) return;
      const actual = column.text ? 'Single line / multiple lines of text' : column.boolean ? 'Yes/No' : column.number ? 'Number' : column.lookup ? 'Lookup' : (column as Column & { choice?: object }).choice ? 'Choice' : 'another column type';
      throw new Error(`${list.displayName}: "${column.displayName}" (${column.name}) is ${actual}; it must be ${expected}. Open List settings > Columns to check this column. Existing values have not been changed.`);
    };
    checkType(title, 'text', 'Single line of text');
    checkType(active, 'boolean', 'Yes/No');
    checkType(order, 'number', 'Number');
    const relationship = parent ? find(parent.label) : undefined;
    if (parent && (!relationship?.lookup || relationship.lookup.allowMultipleValues || relationship.lookup.listId.toLowerCase() !== parent.listId.toLowerCase())) throw new Error(`${list.displayName}.${parent.label} must be a single lookup to the correct parent list.`);
    const items = await graph.getAll<{ id: string; fields: Record<string, unknown> }>(`${path}/items?$expand=fields&$top=200`);
    return items.filter(item => item.fields[active.name] === true).map(item => {
      const parentId = relationship ? String(item.fields[`${relationship.name}LookupId`] || '') : undefined;
      const name = String(item.fields[title.name] || '').trim();
      if (!/^[1-9]\d*$/.test(item.id)) throw new Error(`${list.displayName} returned an entry with an invalid ID.`);
      if (!name) throw new Error(`${list.displayName}: item #${item.id} is Active but its Title is blank. Enter a name or set Active to No.`);
      if (parent && !/^[1-9]\d*$/.test(parentId || '')) throw new Error(`${list.displayName}: "${name}" (item #${item.id}) is Active but has no valid ${parent.label} selected. Edit this row and choose its ${parent.label}, or set Active to No.`);
      return { id: item.id, name: String(item.fields[title.name]).trim(), parentId, order: Number(item.fields[order.name]) || 0 };
    }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map(({ order: ignored, ...item }) => item);
  };
  const [categories, subcategories, issueTypes] = await Promise.all([
    read(category), read(subcategory, { label: 'Category', listId: category.id }), read(issueType)
  ]);
  const activeSubcategories = subcategories.filter(item => categories.some(parent => parent.id === item.parentId));
  return { categories, subcategories: activeSubcategories, issueTypes, listIds: { category: category.id, subcategory: subcategory.id, issueType: issueType.id } };
}
