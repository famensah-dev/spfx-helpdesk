export type TicketStatus = 'New' | 'Assigned' | 'In Progress' | 'On Hold' | 'Waiting on Third Party' | 'Resolved' | 'Closed' | 'Completed' | 'Pending' | 'Escalated';
export type TicketPriority = string;

export interface IUserLookup {
  AadId?: string;
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
  Subcategory?: string;
  IssueType?: string;
  TicketType?: string;
  Requester?: IUserLookup;
  CreatedBy?: IUserLookup;
  RequesterEmail?: string;
  Department?: string;
  StartedAt?: string;
  ClosedAt?: string;
  ResolutionSummary?: string;
  SolutionCommentId?: string;
  Escalated?: boolean;
  DueDate?: string;
  FirstRespondedAt?: string | null;
  HasResponseTracking?: boolean;
  HasResolutionTracking?: boolean;
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

