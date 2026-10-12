export interface IDashboardStats {
  totalOpenTickets: number;
  criticalTickets: number;
  resolvedThisMonth: number;
  averageResolutionTimeHours: number | null;
}

export interface IChartDataset {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string[];
    borderColor?: string[];
    borderWidth?: number;
  }>;
}

export interface ITicketQueryResult {
  tickets: import('./ITicket').ITicket[];
  isMockData: boolean;
  sourceLabel: string;
  warnings?: string[];
  assignmentIdentityAvailable?: boolean;
  hasResolvedAt: boolean;
  hasCategory: boolean;
  hasDueDate: boolean;
  hasEscalated: boolean;
  hasPending: boolean;
}



