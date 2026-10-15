export interface ISlaPriority { id?: string; name: string; responseMinutes?: number; resolutionMinutes?: number; active: boolean; }
export interface ISlaSettings { configured: boolean; listUrl?: string; priorities: ISlaPriority[]; trackingReady: boolean; }
export interface ISlaService {
  getSettings(manage?: boolean): Promise<ISlaSettings>;
  setup(): Promise<void>;
  savePriority(input: ISlaPriority): Promise<void>;
}
