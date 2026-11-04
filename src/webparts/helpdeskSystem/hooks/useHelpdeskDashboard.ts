import * as React from 'react';
import type { ITicketDataSource } from '../interfaces/ITicketDataSource';

import type { ITicket, ITicketFilters } from '../interfaces/ITicket';
import { filterTickets, getAssignedUserOptions, getDashboardStats, getPriorityChartData, getStatusChartData } from '../utils/dashboardUtils';

export function useHelpdeskDashboard(service: ITicketDataSource, assignedEmail?: string, autoRefresh = false) {
  const [tickets, setTickets] = React.useState<ITicket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [assignmentIdentityAvailable, setAssignmentIdentityAvailable] = React.useState(true);
  const [hasResolvedAt, setHasResolvedAt] = React.useState(false);
  const [capabilities, setCapabilities] = React.useState({ hasCategory: false, hasDueDate: false, hasEscalated: false, hasPending: false });
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [filters, setFilters] = React.useState<ITicketFilters>(() => { const now = new Date(); return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0) }; });

  const [newTicketNotice,setNewTicketNotice]=React.useState(0);
  const noticeSequence=React.useRef(0);
  const observed=React.useRef<{service:ITicketDataSource;highest?:number}>({service});
  React.useEffect(()=>{
    if(!newTicketNotice)return;
    const timer=window.setTimeout(()=>setNewTicketNotice(0),5000);
    return()=>window.clearTimeout(timer);
  },[newTicketNotice]);
  const request = React.useRef(0);
  const inFlight=React.useRef(new Set<number>());
  const lastPoll=React.useRef(0);
  const fetchTickets = React.useCallback(async (quiet=false): Promise<void> => {
    if(quiet && inFlight.current.size>0)return;
    const id = ++request.current;
    inFlight.current.add(id);
    if(!quiet){setLoading(true);setError(null);}
    try {
      const result = await service.getTickets();
      if (request.current !== id) return;
      setError(null);
      const previous=observed.current.service===service?observed.current.highest:undefined;
      const highest=result.tickets.reduce((value,ticket)=>Math.max(value,ticket.Id),previous || 0);
      if(quiet && previous!==undefined && result.tickets.some(ticket=>ticket.Id>previous && (assignedEmail===undefined || ticket.AssignedTo?.Email?.toLowerCase()===assignedEmail.toLowerCase())))setNewTicketNotice(++noticeSequence.current);
      observed.current={service,highest};
      setTickets(result.tickets);
      setWarnings(result.warnings || []);
      setAssignmentIdentityAvailable(result.assignmentIdentityAvailable !== false);
      setHasResolvedAt(result.hasResolvedAt);
      setCapabilities({ hasCategory: result.hasCategory, hasDueDate: result.hasDueDate, hasEscalated: result.hasEscalated, hasPending: result.hasPending });
      setLastUpdated(new Date());
      if(service.sla?.checkBreaches)void service.sla.checkBreaches(result.tickets).catch(reason=>{if(request.current===id)setWarnings(current=>[...current,reason instanceof Error?reason.message:'Unable to check SLA breach alerts.']);});
    } catch (err) {
      if (request.current !== id) return;
      if(!quiet)setError(err instanceof Error ? err.message : 'Unable to load tickets. Check your connection and SharePoint permissions.');
    } finally {
      inFlight.current.delete(id);
      if (request.current === id) setLoading(false);
    }
  }, [service,assignedEmail]);
  const refresh=React.useCallback(()=>fetchTickets(false),[fetchTickets]);
  React.useEffect(()=>{
    if(!service.sla?.checkBreaches || !(service.access?.admin || service.access?.superAdmin))return;
    let active=true; const checks=new Set<symbol>();
    const check=async():Promise<void>=>{if(checks.size||document.visibilityState==='hidden')return;const token=Symbol('sla-check');checks.add(token);try{const result=await service.getTickets();if(active)await service.sla?.checkBreaches?.(result.tickets);}catch(reason){if(active)setWarnings(current=>[...new Set([...current,reason instanceof Error?reason.message:'Unable to check SLA alerts.'])]);}finally{checks.delete(token);}};
    const timer=window.setInterval(()=>{void check();},60000);
    return()=>{active=false;window.clearInterval(timer);};
  },[service]);
  React.useEffect(()=>{
    if(!autoRefresh)return;
    const check=():void=>{if(document.visibilityState==='hidden' || Date.now()-lastPoll.current<5000)return;lastPoll.current=Date.now();void fetchTickets(true);};
    const timer=window.setInterval(check,30000);
    document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);};
  },[autoRefresh,fetchTickets]);
  React.useEffect(() => {
    void refresh();
    return () => { request.current++; };
  }, [refresh]);
  const scopedTickets = React.useMemo(() => assignedEmail === undefined ? tickets : tickets.filter(ticket => Boolean(assignedEmail) && ticket.AssignedTo?.Email?.toLowerCase() === assignedEmail.toLowerCase()), [tickets, assignedEmail]);
  const filteredTickets = React.useMemo(() => filterTickets(scopedTickets, filters), [scopedTickets, filters]);
  return {
    ...capabilities, warnings, assignmentIdentityAvailable, tickets: scopedTickets, filteredTickets, filters, setFilters, loading, error, hasResolvedAt, lastUpdated,
    isDemoData: false, refresh, newTicketNotice,
    stats: React.useMemo(() => getDashboardStats(filteredTickets), [filteredTickets]),
    statusChart: React.useMemo(() => getStatusChartData(filteredTickets), [filteredTickets]),
    priorityChart: React.useMemo(() => getPriorityChartData(filteredTickets), [filteredTickets]),
    assignedUsers: React.useMemo(() => getAssignedUserOptions(scopedTickets), [scopedTickets])
  };
}




