import type { ITicketQueryResult } from './IDashboard';
import type { TicketStatus, TicketPriority } from './ITicket';
import type { IUserLookup } from './ITicket';
import type { IFaq, IFaqInput, IFaqAccess } from './IFaq';
export interface IOrganizationUser { id: string; displayName: string; email: string; userPrincipalName: string; department?: string; }
export interface INewTicketInput { title: string; description: string; priority: string; assignedToId?: number | null; category?: string; subcategory?: string; issueType?: string; department?: string; dueDate?: string; attachments?: File[]; }
export interface IClassificationOption { id: string; name: string; parentId?: string; }
export interface ITicketClassification { categories: IClassificationOption[]; subcategories: IClassificationOption[]; issueTypes: IClassificationOption[]; listIds: { category: string; subcategory: string; issueType: string }; }
export interface ITicketCreationOptions { classification?: ITicketClassification; priorities: string[]; description: boolean; assignment: boolean; fields: Array<{ key: 'category' | 'subcategory' | 'issueType' | 'department' | 'dueDate'; label: string; choices?: string[]; required?: boolean; }> }
export interface ITicketEdit { title: string; description?: string; priority: TicketPriority; status: TicketStatus; assignedToId: number | null; category?: string; subcategory?: string; issueType?: string; }
export interface ITicketComment { id: string; text: string; author: string; created: string; }
export interface ITicketVersion { id: string; modified: string; author: string; }
export type TicketBulkAction = { kind: 'status'; status: TicketStatus } | { kind: 'priority'; priority: TicketPriority } | { kind: 'assign'; userId: number | null } | { kind: 'archive' };
export interface ITicketBulkResult { succeeded: number[]; failed: Array<{ id: number; message: string }>; }

/** A host-independent data source shared by SharePoint and Azure. */
export interface ITicketDataSource {
  getFaqs?(manage?: boolean): Promise<IFaq[]>;
  getFaqAccess?(): Promise<IFaqAccess>;
  saveFaq?(input: IFaqInput, id?: number): Promise<void>;
  deleteFaq?(id: number): Promise<void>;
  searchUsers?(query: string, department?: string): Promise<IOrganizationUser[]>;
  resolveUser?(user: IOrganizationUser): Promise<IUserLookup>;
  getTickets(): Promise<ITicketQueryResult>;
  createTicket?(input: INewTicketInput): Promise<void>;
  getCreationOptions?(): Promise<ITicketCreationOptions>;
  uploadAttachments?(id: number, files: File[]): Promise<void>;
  updateTickets?(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult>;
  updateTicket?(id: number, input: ITicketEdit): Promise<void>;
  getComments?(id: number): Promise<ITicketComment[]>;
  addComment?(id: number, text: string): Promise<void>;
  getHistory?(id: number): Promise<ITicketVersion[]>;
}
