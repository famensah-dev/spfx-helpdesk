import * as React from 'react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';

import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { filterTickets, getAssignedUserOptions, getDashboardStats, getPriorityChartData, getStatusChartData } from '../utils/dashboardUtils';

export function useHelpdeskDashboard(service: ITicketDataSource, assignedEmail?: string) {
  const [tickets, setTickets] = React.useState<ITicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [assignmentIdentityAvailable, setAssignmentIdentityAvailable] = React.useState(true);
  const [hasResolvedAt, setHasResolvedAt] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState({ hasCategory: false, hasDueDate: false, hasEscalated: false, hasPending: false });
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [filters, setFilters] = React.useState<ITicketFilters>(() => { const now = new Date(); return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0) }; });

  const request = React.useRef(0);
  const refresh = React.useCallback(async (): Promise<void> => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const result = await service.getTickets();
      if (request.current !== id) return;
      setTickets(result.tickets);
      setWarnings(result.warnings || []);
      setAssignmentIdentityAvailable(result.assignmentIdentityAvailable !== false);
      setHasResolvedAt(result.hasResolvedAt);
      setCapabilities({ hasCategory: result.hasCategory, hasDueDate: result.hasDueDate, hasEscalated: result.hasEscalated, hasPending: result.hasPending });
      setLastUpdated(new Date());
    } catch (err) {
      if (request.current !== id) return;
      setError(err instanceof Error ? err.message : 'Unable to load tickets. Check your connection and SharePoint permissions.');
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [service]);
  React.useEffect(() => {
    void refresh();
    return () => { request.current++; };
  }, [refresh]);
  const scopedTickets = React.useMemo(() => assignedEmail === undefined ? tickets : tickets.filter(ticket => Boolean(assignedEmail) && ticket.AssignedTo?.Email?.toLowerCase() === assignedEmail.toLowerCase()), [tickets, assignedEmail]);
  const filteredTickets = React.useMemo(() => filterTickets(scopedTickets, filters), [scopedTickets, filters]);
  return {
    ...capabilities, warnings, assignmentIdentityAvailable, tickets: scopedTickets, filteredTickets, filters, setFilters, loading, error, hasResolvedAt, lastUpdated,
    isDemoData: false, refresh,
    stats: React.useMemo(() => getDashboardStats(filteredTickets), [filteredTickets]),
    statusChart: React.useMemo(() => getStatusChartData(filteredTickets), [filteredTickets]),
    priorityChart: React.useMemo(() => getPriorityChartData(filteredTickets), [filteredTickets]),
    assignedUsers: React.useMemo(() => getAssignedUserOptions(scopedTickets), [scopedTickets])
  };
}




