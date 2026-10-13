import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { isResolved } from './ticketStatuses';

const dayMs = 86400000;
export interface DashboardBar { label: string; value: number; }

export function groupTicketCounts(tickets: ITicket[], field: 'Category' | 'IssueType' | 'Department', limit = 9): DashboardBar[] {
  const groups = new Map<string, number>();
  tickets.forEach(ticket => {
    const label = ticket[field]?.trim() || 'Not specified';
    groups.set(label, (groups.get(label) || 0) + 1);
  });
  const rows = Array.from(groups, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (rows.length <= limit) return rows;
  const shown = rows.slice(0, limit - 1);
  return [...shown, { label: 'Other groups (combined)', value: rows.slice(limit - 1).reduce((sum, row) => sum + row.value, 0) }];
}

export function resolutionDays(ticket: ITicket): number | null {
  if (!isResolved(ticket.Status) || !ticket.ResolvedAt) return null;
  const elapsed = new Date(ticket.ResolvedAt).getTime() - new Date(ticket.Created).getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed / dayMs : null;
}

export function averageResolutionDays(tickets: ITicket[]): number | null {
  const values = tickets.map(resolutionDays).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function getResolutionByCategory(tickets: ITicket[]): DashboardBar[] {
  const groups = new Map<string, number[]>();
  tickets.forEach(ticket => {
    const duration = resolutionDays(ticket);
    if (duration === null) return;
    const label = ticket.Category?.trim() || 'Not specified';
    groups.set(label, [...(groups.get(label) || []), duration]);
  });
  return Array.from(groups, ([label, values]) => ({ label, value: values.reduce((sum, value) => sum + value, 0) / values.length }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, 8);
}

export function getOpenTicketAging(tickets: ITicket[], now: Date): DashboardBar[] {
  const rows = ['< 1 day', '1–3 days', '4–7 days', '8–14 days', '> 14 days'].map(label => ({ label, value: 0 }));
  tickets.filter(ticket => !isResolved(ticket.Status)).forEach(ticket => {
    const age = (now.getTime() - new Date(ticket.Created).getTime()) / dayMs;
    if (!Number.isFinite(age) || age < 0) return;
    rows[age < 1 ? 0 : age < 4 ? 1 : age < 8 ? 2 : age < 15 ? 3 : 4].value++;
  });
  return rows;
}

export function getMonthlyTicketTrend(tickets: ITicket[], end: Date, start?: Date | null) {
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const firstMonth = new Date(endMonth.getFullYear(), endMonth.getMonth() - 11, 1);
  if (start && start > firstMonth) firstMonth.setFullYear(start.getFullYear(), start.getMonth(), 1);
  const months: Date[] = [];
  for (const date = new Date(firstMonth); date <= endMonth; date.setMonth(date.getMonth() + 1)) months.push(new Date(date));
  const countInMonth = (value: string | null | undefined, month: Date): boolean => {
    if (!value) return false;
    const date = new Date(value);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  };
  return {
    labels: months.map(month => month.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })),
    created: months.map(month => tickets.filter(ticket => countInMonth(ticket.Created, month)).length),
    resolved: months.map(month => tickets.filter(ticket => resolutionDays(ticket) !== null && countInMonth(ticket.ResolvedAt, month)).length)
  };
}

export function getTicketTrend(tickets: ITicket[], end: Date, start?: Date | null) {
  if (!start || start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth()) {
    return { ...getMonthlyTicketTrend(tickets, end, start), title: 'Monthly Ticket Trend' };
  }
  const days: Date[] = [];
  const finalDay = new Date(end); finalDay.setHours(23, 59, 59, 999);
  for (const day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day <= finalDay; day.setDate(day.getDate() + 1)) days.push(new Date(day));
  const sameDay = (value: string | null | undefined, day: Date): boolean => Boolean(value && new Date(value).toDateString() === day.toDateString());
  return {
    title: 'Daily Ticket Trend',
    labels: days.map(day => day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
    created: days.map(day => tickets.filter(ticket => sameDay(ticket.Created, day)).length),
    resolved: days.map(day => tickets.filter(ticket => resolutionDays(ticket) !== null && sameDay(ticket.ResolvedAt, day)).length)
  };
}

export function getPreviousPeriod(filters: ITicketFilters): ITicketFilters | null {
  if (!filters.startDate || !filters.endDate || filters.startDate > filters.endDate) return null;
  const start = new Date(filters.startDate); start.setHours(0, 0, 0, 0);
  const end = new Date(filters.endDate); end.setHours(0, 0, 0, 0);
  const fullMonth = start.getDate() === 1 && start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
    && end.getDate() === new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
  if (fullMonth) return { ...filters, startDate: new Date(start.getFullYear(), start.getMonth() - 1, 1), endDate: new Date(start.getFullYear(), start.getMonth(), 0) };
  // UTC calendar dates avoid daylight-saving changes altering the number of days.
  const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / dayMs) + 1;
  const previousStart = new Date(start); previousStart.setDate(start.getDate() - days);
  const previousEnd = new Date(start); previousEnd.setDate(start.getDate() - 1);
  return { ...filters, startDate: previousStart, endDate: previousEnd };
}
