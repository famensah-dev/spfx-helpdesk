export interface ISlaClockRules { businessHoursOnly: boolean; pausePending: boolean; markAtRisk: boolean; atRiskPercent: number; notifyTeamLead: boolean; timeZone: string; workDays: number[]; startMinute: number; endMinute: number; }
export interface ISlaPriority { id?: string; name: string; responseMinutes?: number; resolutionMinutes?: number; active: boolean; clockRules?: ISlaClockRules; }
export interface ISlaSettings { configured: boolean; listUrl?: string; priorities: ISlaPriority[]; trackingReady: boolean; clockRules?: ISlaClockRules; }
export interface ISlaService {
  getSettings(manage?: boolean): Promise<ISlaSettings>;
  setup(): Promise<void>;
  savePriority(input: ISlaPriority): Promise<void>;
  saveClockRules?(input: ISlaClockRules): Promise<void>;
  checkBreaches?(tickets: import('./ITicket').ITicket[]): Promise<void>;
}
