export type TicketStatus = 'New' | 'Assigned' | 'Completed' | 'Closed' | 'Pending' | 'Escalated';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface IUserLookup {
  Id?: number;
  Title?: string;
  Email?: string;
}

export interface ITicket {
  Id: number;
  Title: string;
  Description?: string;
  WebUrl?: string;
  Archived?: boolean;
  Status: TicketStatus;
  Priority: TicketPriority;
  Created: string;
  Modified: string;
  AssignedTo?: IUserLookup;
  Category?: string;
  Escalated?: boolean;
  DueDate?: string;
  ResolvedAt?: string | null;
}

export interface ITicketFilters {
  startDate?: Date | null;
  endDate?: Date | null;
  status?: string;
  priority?: string;
  assignedTo?: string | number | null;
}

export interface IFilterOption {
  key: string;
  text: string;
}

