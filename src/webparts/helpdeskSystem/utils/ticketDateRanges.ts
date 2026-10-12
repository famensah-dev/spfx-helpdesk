/** Local calendar boundaries; the end is exclusive to include the entire last day. */
export function getTicketDateRange(period: string, now: Date = new Date()): { start: number; end: number } {
  const year = now.getFullYear(), month = now.getMonth(), day = now.getDate();
  const at = (y: number, m: number, d: number): number => new Date(y, m, d).getTime();
  switch (period) {
    case 'today': return { start: at(year, month, day), end: at(year, month, day + 1) };
    case 'yesterday': return { start: at(year, month, day - 1), end: at(year, month, day) };
    case 'thisWeek': {
      const monday = day - (now.getDay() + 6) % 7;
      return { start: at(year, month, monday), end: at(year, month, monday + 7) };
    }
    case 'week': return { start: at(year, month, day - 6), end: at(year, month, day + 1) };
    case 'last30': return { start: at(year, month, day - 29), end: at(year, month, day + 1) };
    case 'month': return { start: at(year, month, 1), end: at(year, month + 1, 1) };
    case 'lastMonth': return { start: at(year, month - 1, 1), end: at(year, month, 1) };
    case 'year': return { start: at(year, 0, 1), end: at(year + 1, 0, 1) };
    default: return { start: -Infinity, end: Infinity };
  }
}
