import type { ITicketQueryResult } from './IDashboard';
import type { TicketStatus, TicketPriority } from './ITicket';
import type { IUserLookup } from './ITicket';
import type { IFaq, IFaqInput, IFaqAccess, FaqBulkAction, IFaqBulkResult } from './IFaq';
export interface IOrganizationUser { id: string; displayName: string; email: string; userPrincipalName: string; department?: string; }
export interface INewTicketInput { title: string; description: string; priority: string; assignedToId?: number | null; category?: string; subcategory?: string; issueType?: string; ticketType?: string; department?: string; dueDate?: string; attachments?: File[]; }
export interface IClassificationOption { id: string; name: string; parentId?: string; }
export interface ITicketClassification { categories: IClassificationOption[]; subcategories: IClassificationOption[]; issueTypes: IClassificationOption[]; listIds: { category: string; subcategory: string; issueType: string }; }
export interface ITicketCreationOptions { classification?: ITicketClassification; priorities: string[]; description: boolean; assignment: boolean; fields: Array<{ key: 'category' | 'subcategory' | 'issueType' | 'ticketType' | 'department' | 'dueDate'; label: string; choices?: string[]; required?: boolean; }> }
export interface ITicketEdit { resolutionSummary?: string; title: string; description?: string; priority: TicketPriority; status: TicketStatus; assignedToId: number | null; category?: string; subcategory?: string; issueType?: string; ticketType?: string; }
export interface ITicketAttachment { name: string; url: string; }
export interface ICommentPostOptions { html?: string; files?: File[]; requestId?: string; onProgress?: (message: string) => void; }
export interface ITicketComment { html?: string; id: string; text: string; author: string; created: string; attachments?: ITicketAttachment[]; attachmentError?: string; }
export interface ITicketVersion { id: string; modified: string; author: string; }
export type TicketBulkAction = { kind: 'status'; status: TicketStatus } | { kind: 'priority'; priority: TicketPriority } | { kind: 'assign'; userId: number | null } | { kind: 'archive'; archived?: boolean };
export interface ITicketBulkResult { succeeded: number[]; failed: Array<{ id: number; message: string }>; }

/** A host-independent data source shared by SharePoint and Azure. */
export interface ITicketDataSource {
  notifications?: import('./INotifications').INotificationService;
  supportUnits?: import('./ISupportUnits').ISupportUnitsService;
  workspaceSetup?: import('./IWorkspaceSetup').IWorkspaceSetup;
  openWorkspaceSetup?: () => void;
  workspaceSettings?: import('./IRoleManagement').IWorkspaceSettings;
  saveWorkspaceSettings?(settings: import('./IRoleManagement').IWorkspaceSettings): Promise<void>;
  workspaceMaintenance?: import('../services/WorkspaceMaintenanceService').WorkspaceMaintenanceService;
  roleManagement?: import('./IRoleManagement').IRoleManagement;
  roleRules?: import('./IRoleManagement').IDeskPilotRole;
  access?: import('./IWorkspaceAccess').IWorkspaceAccess;
  members?: import('./IWorkspaceAccess').IWorkspaceMembers;
  sla?: import('./ISla').ISlaService;
  getPriorities?(): Promise<string[]>;
  recordFirstResponse?(id: number): Promise<void>;
  administration?: import('./IAdministration').IAdministrationService;
  getFaqs?(manage?: boolean): Promise<IFaq[]>;
  getFaqAccess?(): Promise<IFaqAccess>;
  saveFaq?(input: IFaqInput, id?: number): Promise<void>;
  deleteFaq?(id: number): Promise<void>;
  updateFaqs?(ids: number[], action: FaqBulkAction): Promise<IFaqBulkResult>;
  searchUsers?(query: string, department?: string): Promise<IOrganizationUser[]>;
  resolveUser?(user: IOrganizationUser): Promise<IUserLookup>;
  getTickets(): Promise<ITicketQueryResult>;
  createTicket?(input: INewTicketInput): Promise<void>;
  getCreationOptions?(): Promise<ITicketCreationOptions>;
  getAttachments?(id: number): Promise<ITicketAttachment[]>;
  uploadAttachments?(id: number, files: File[], onProgress?: (message: string) => void): Promise<void>;
  uploadCommentAttachments?(ticketId: number, commentId: string, files: File[], onProgress?: (message: string) => void): Promise<void>;
  updateTickets?(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult>;
  updateTicket?(id: number, input: ITicketEdit): Promise<void>;
  getComments?(id: number): Promise<ITicketComment[]>;
  markCommentAsSolution?(id: number, commentId: string, replaceExisting?: boolean): Promise<void>;
  addComment?(id: number, text: string, options?: ICommentPostOptions): Promise<void>;
  getHistory?(id: number): Promise<ITicketVersion[]>;
}
