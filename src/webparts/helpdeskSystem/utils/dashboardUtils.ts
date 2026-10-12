import type { IDashboardStats, IChartDataset } from '../interfaces/IDashboard';
import type { ITicket, TicketPriority, TicketStatus } from '../interfaces/ITicket';

const statusOrder: TicketStatus[] = ['New', 'Assigned', 'Completed', 'Closed'];
const priorityOrder: TicketPriority[] = ['Critical', 'High', 'Medium', 'Low'];

export const chartColors = {
  status: ['#6875dc', '#54a6e8', '#58b99c', '#a5b0c4'],
  priority: ['#EB5757', '#F2994A', '#F2C94C', '#82D4B2']
};

export function filterTickets(tickets: ITicket[], filters: { startDate?: Date | null; endDate?: Date | null; status?: string; priority?: string; assignedTo?: string | number | null; }): ITicket[] {
  return tickets.filter((ticket) => {
    const createdDate = new Date(ticket.Created);

    if (filters.startDate && createdDate < new Date(new Date(filters.startDate.getTime()).setHours(0, 0, 0, 0))) {
      return false;
    }

    if (filters.endDate && createdDate > new Date(new Date(filters.endDate.getTime()).setHours(23, 59, 59, 999))) {
      return false;
    }

    if (filters.status && ticket.Status !== filters.status) {
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
  const openTickets = tickets.filter((ticket) => ticket.Status === 'New' || ticket.Status === 'Assigned');
  const criticalTickets = tickets.filter((ticket) => (ticket.Status === 'New' || ticket.Status === 'Assigned') && ticket.Priority === 'Critical');

  const now = new Date();
  const resolvedThisMonth = tickets.filter((ticket) => {
    const resolutionDate = ticket.ResolvedAt ? new Date(ticket.ResolvedAt) : null;
    return (ticket.Status === 'Completed' || ticket.Status === 'Closed') && resolutionDate && resolutionDate.getMonth() === now.getMonth() && resolutionDate.getFullYear() === now.getFullYear();
  });

  const resolutionHours: number[] = tickets
    .filter((ticket) => (ticket.Status === 'Completed' || ticket.Status === 'Closed') && ticket.ResolvedAt)
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
  const displayedStatuses = statusOrder.concat((['Pending', 'Escalated'] as TicketStatus[]).filter(status => tickets.some(ticket => ticket.Status === status)));
  const counts = displayedStatuses.reduce<Record<string, number>>((result, status) => {
    result[status] = tickets.filter((ticket) => ticket.Status === status).length;
    return result;
  }, {} as Record<string, number>);

  return {
    labels: displayedStatuses,
    datasets: [{
      label: 'Tickets',
      data: displayedStatuses.map((status) => counts[status] ?? 0),
      backgroundColor: chartColors.status.concat(['#e7a500', '#de5c85']),
      borderColor: chartColors.status.concat(['#e7a500', '#de5c85']),
      borderWidth: 1
    }]
  };
}

export function getPriorityChartData(tickets: ITicket[]): IChartDataset {
  const counts = priorityOrder.reduce<Record<string, number>>((result, priority) => {
    result[priority] = tickets.filter((ticket) => ticket.Priority === priority).length;
    return result;
  }, {} as Record<string, number>);

  return {
    labels: priorityOrder,
    datasets: [{
      label: 'Priority',
      data: priorityOrder.map((priority) => counts[priority] ?? 0),
      backgroundColor: chartColors.priority,
      borderColor: chartColors.priority,
      borderWidth: 1
    }]
  };
}

export function getAssignedUserOptions(tickets: ITicket[]) {
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




