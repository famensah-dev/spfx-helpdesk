export type AdminPage = 'schema' | 'categories' | 'subcategories' | 'issueTypes';
export type ColumnKind = 'text' | 'multiline' | 'number' | 'choice' | 'dateTime' | 'boolean' | 'personOrGroup' | 'lookup';
export interface IAdminColumn { id: string; name: string; displayName: string; description?: string; required?: boolean; readOnly?: boolean; hidden?: boolean; protected: boolean; canEdit: boolean; canDelete: boolean; type: string; properties: Record<string, unknown>; }
export interface IColumnInput { name: string; displayName: string; description: string; required: boolean; kind: ColumnKind; maxLength?: number; choices?: string[]; minimum?: number; maximum?: number; decimals?: string; dateOnly?: boolean; multiple?: boolean; peopleOnly?: boolean; richText?: boolean; lookupListId?: string; lookupColumnName?: string; }
export interface IClassificationEntry { id: number; title: string; active: boolean; sortOrder: number; parentId?: number; parentName?: string; }
export interface IClassificationInput { title: string; active: boolean; sortOrder: number; parentId?: number; }
export interface IAdminData { listName: string; canManage: boolean; columns: IAdminColumn[]; entries: IClassificationEntry[]; parents: IClassificationEntry[]; lists: Array<{ id: string; name: string }>; }
export interface IAdministrationService {
  getData(page: AdminPage): Promise<IAdminData>;
  getLookupColumns(listId: string): Promise<Array<{ name: string; displayName: string }>>;
  saveColumn(input: IColumnInput, id?: string): Promise<void>;
  deleteColumn(id: string): Promise<void>;
  saveEntry(page: Exclude<AdminPage, 'schema'>, input: IClassificationInput, id?: number): Promise<void>;
  deleteEntry(page: Exclude<AdminPage, 'schema'>, id: number): Promise<void>;
}
