export type AdminPage = 'schema' | 'categories' | 'subcategories' | 'issueTypes';
export type ColumnKind = 'text' | 'multiline' | 'number' | 'choice' | 'dateTime' | 'boolean' | 'personOrGroup' | 'lookup';
export interface IAdminColumn { id: string; name: string; displayName: string; description?: string; required?: boolean; requiredIn?: string[]; readOnly?: boolean; hidden?: boolean; protected: boolean; canEdit: boolean; canDelete: boolean; type: string; properties: Record<string, unknown> & { defaultValue?: {value?: string; formula?: string}; text?: {allowMultipleLines?: boolean; maxLength?: number; textType?: string}; choice?: {choices?: string[]; allowTextEntry?: boolean}; number?: {minimum?: number; maximum?: number; decimalPlaces?: string}; dateTime?: {format?: string}; personOrGroup?: {chooseFromType?: string; allowMultipleSelection?: boolean}; lookup?: {listId?: string; columnName?: string; allowMultipleValues?: boolean} }; }
export interface IColumnInput { name: string; displayName: string; description: string; required: boolean; kind: ColumnKind; maxLength?: number; allowTextEntry?: boolean; defaultValue?: string; defaultFormula?: string; choices?: string[]; minimum?: number; maximum?: number; decimals?: string; dateOnly?: boolean; multiple?: boolean; peopleOnly?: boolean; richText?: boolean; lookupListId?: string; lookupColumnName?: string; }
export interface IClassificationEntry { id: number; title: string; active: boolean; sortOrder: number; parentId?: number; parentName?: string; }
export interface IClassificationInput { title: string; active: boolean; sortOrder: number; parentId?: number; }
export interface IAdminData { listName: string; listId?: string; siteUrl?: string; listUrl?: string; canManage: boolean; columns: IAdminColumn[]; entries: IClassificationEntry[]; parents: IClassificationEntry[]; lists: Array<{ id: string; name: string }>; }
export interface IAdministrationService {
  getData(page: AdminPage): Promise<IAdminData>;
  getLookupColumns(listId: string): Promise<Array<{ name: string; displayName: string }>>;
  saveColumn(input: IColumnInput, id?: string): Promise<void>;
  deleteColumn(id: string): Promise<void>;
  saveEntry(page: Exclude<AdminPage, 'schema'>, input: IClassificationInput, id?: number): Promise<void>;
  deleteEntry(page: Exclude<AdminPage, 'schema'>, id: number): Promise<void>;
}
