import type { ITicketQueryResult } from './IDashboard';
import type { TicketStatus, TicketPriority } from './ITicket';
export interface ITicketEdit { title: string; description?: string; priority: TicketPriority; status: TicketStatus; assignedToId: number | null; }
export interface ITicketComment { id: string; text: string; author: string; created: string; }
export interface ITicketVersion { id: string; modified: string; author: string; }
export type TicketBulkAction = { kind: 'status'; status: TicketStatus } | { kind: 'priority'; priority: TicketPriority } | { kind: 'assign'; userId: number | null } | { kind: 'archive' };
export interface ITicketBulkResult { succeeded: number[]; failed: Array<{ id: number; message: string }>; }

/** A host-independent data source shared by SharePoint and Azure. */
export interface ITicketDataSource {
  getTickets(): Promise<ITicketQueryResult>;
  createTicket?(input: { title: string; description: string; priority: string }): Promise<void>;
  updateTickets?(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult>;
  updateTicket?(id: number, input: ITicketEdit): Promise<void>;
  getComments?(id: number): Promise<ITicketComment[]>;
  addComment?(id: number, text: string): Promise<void>;
  getHistory?(id: number): Promise<ITicketVersion[]>;
}
