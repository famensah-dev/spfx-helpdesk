export type AssignmentMethod = 'Round robin' | 'Team lead';
export interface ISupportUnit { id: number; title: string; active: boolean; method: AssignmentMethod; lastMemberId: number; categoryIds: number[]; teamLeadMemberId?: number; }
export interface IUnitMember { id: number; unitId: number; userId: number; name: string; available: boolean; order: number; }
export interface ISupportUnitData { units: ISupportUnit[]; members: IUnitMember[]; categories: Array<{id: number; title: string}>; autoAssignEnabled: boolean; }
export interface IUnitCreationResult { created: string[]; skipped: string[]; failed: Array<{name:string;message:string}>; }
export interface ISupportUnitsService {
  load(): Promise<ISupportUnitData>;
  createUnits(names:string[]):Promise<IUnitCreationResult>;
  setAutoAssignment(enabled:boolean):Promise<void>;
  setTeamLead(unitId:number,memberId:number):Promise<void>;
  saveUnit(value: Omit<ISupportUnit, 'id' | 'lastMemberId'>, id?: number): Promise<void>;
  saveMember(value: Omit<IUnitMember, 'id'>, id?: number): Promise<void>;
  routeTicket(id: number): Promise<string>;
}
