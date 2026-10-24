import type { IDashboardStats, IChartDataset } from '../interfaces/IDashboard';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';
import { ticketStatuses, normalizeStatus, isResolved, statusColors } from './ticketStatuses';

const statusOrder: TicketStatus[] = ticketStatuses;
const priorityOrder: TicketPriority[] = ['Critical', 'High', 'Medium', 'Low'];

export const chartColors = {
  status: ['#6875dc', '#54a6e8', '#58b99c', '#a5b0c4'],
  priority: ['#EB5757', '#F2994A', '#F2C94C', '#82D4B2']
};

export function filterTickets(tickets: ITicket[], filters: { startDate?: Date | null; endDate?: Date | null; status?: string; priority?: string; assignedTo?: string | number | null; }): ITicket[] {
  return tickets.filter((ticket) => {
    if (ticket.Archived) return false;
    const createdDate = new Date(ticket.Created);

    if (filters.startDate && createdDate < new Date(new Date(filters.startDate.getTime()).setHours(0, 0, 0, 0))) {
      return false;
    }

    if (filters.endDate && createdDate > new Date(new Date(filters.endDate.getTime()).setHours(23, 59, 59, 999))) {
      return false;
    }

    if (filters.status && normalizeStatus(ticket.Status) !== normalizeStatus(filters.status)) {
      return false;
    }

    if (filters.priority && ticket.Priority !== filters.priority) {
      return false;
    }

    if (filters.assignedTo === 'unassigned' ? Boolean(ticket.AssignedTo?.Id) : filters.assignedTo && ticket.AssignedTo?.Id?.toString() !== filters.assignedTo.toString()) {
      return false;
    }

    return true;
  });
}

export function getDashboardStats(tickets: ITicket[]): IDashboardStats {
  tickets = tickets.filter(ticket => !ticket.Archived);
  const openTickets = tickets.filter((ticket) => !isResolved(ticket.Status));
  const criticalTickets = openTickets.filter((ticket) => ticket.Priority === 'Critical');

  const now = new Date();
  const resolvedThisMonth = tickets.filter((ticket) => {
    const resolutionDate = ticket.ResolvedAt ? new Date(ticket.ResolvedAt) : null;
    return isResolved(ticket.Status) && resolutionDate && resolutionDate.getMonth() === now.getMonth() && resolutionDate.getFullYear() === now.getFullYear();
  });

  const resolutionHours: number[] = tickets
    .filter((ticket) => isResolved(ticket.Status) && ticket.ResolvedAt)
    .map((ticket) => {
      const created = new Date(ticket.Created);
      const resolved = new Date(ticket.ResolvedAt!);
      const diffMs = resolved.getTime() - created.getTime();
      return diffMs >= 0 ? diffMs / (1000 * 60 * 60) : NaN;
    }).filter(Number.isFinite);

  const averageResolutionTimeHours = resolutionHours.length > 0
    ? resolutionHours.reduce((sum, value) => sum + value, 0) / resolutionHours.length
    : 0;

  return {
    totalOpenTickets: openTickets.length,
    criticalTickets: criticalTickets.length,
    resolvedThisMonth: resolvedThisMonth.length,
    averageResolutionTimeHours: resolutionHours.length ? Number(averageResolutionTimeHours.toFixed(1)) : null
  };
}

export function getStatusChartData(tickets: ITicket[]): IChartDataset {
  tickets = tickets.filter(ticket => !ticket.Archived);
  const displayedStatuses = statusOrder.concat((['Escalated'] as TicketStatus[]).filter(status => tickets.some(ticket => ticket.Status === status)));
  const counts = displayedStatuses.reduce<Record<string, number>>((result, status) => {
    result[status] = tickets.filter((ticket) => normalizeStatus(ticket.Status) === status).length;
    return result;
  }, {} as Record<string, number>);

  return {
    labels: displayedStatuses,
    datasets: [{
      label: 'Tickets',
      data: displayedStatuses.map((status) => counts[status] ?? 0),
      backgroundColor: displayedStatuses.map(status => statusColors[status]),
      borderColor: displayedStatuses.map(status => statusColors[status]),
      borderWidth: 1
    }]
  };
}

export function getPriorityChartData(tickets: ITicket[]): IChartDataset {
  tickets = tickets.filter(ticket => !ticket.Archived);
  const values = Array.from(new Set([...priorityOrder, ...tickets.map(ticket => ticket.Priority)]));
  const counts = values.reduce<Record<string, number>>((result, priority) => {
    result[priority] = tickets.filter((ticket) => ticket.Priority === priority).length;
    return result;
  }, {} as Record<string, number>);

  return {
    labels: values,
    datasets: [{
      label: 'Priority',
      data: values.map((priority) => counts[priority] ?? 0),
      backgroundColor: values.map((_, index) => chartColors.priority[index] || '#87909d'),
      borderColor: values.map((_, index) => chartColors.priority[index] || '#87909d'),
      borderWidth: 1
    }]
  };
}

export function getAssignedUserOptions(tickets: ITicket[]) {
  tickets = tickets.filter(ticket => !ticket.Archived);
  const users = tickets
    .map((ticket) => ticket.AssignedTo)
    .filter((user): user is NonNullable<typeof user> => Boolean(user && user.Id));

  const uniqueUsers = users.filter((user, index, list) => {
    const id = user.Id?.toString();
    return list.findIndex((value) => value.Id?.toString() === id) === index;
  });

  return uniqueUsers.map((user) => ({
    key: user.Id?.toString() ?? '',
    text: user.Title || user.Email || 'Unassigned'
  }));
}




