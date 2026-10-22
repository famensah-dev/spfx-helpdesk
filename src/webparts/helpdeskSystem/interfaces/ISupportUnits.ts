export type AssignmentMethod = 'Round robin' | 'Unit queue';
export interface ISupportUnit { id: number; title: string; active: boolean; method: AssignmentMethod; lastMemberId: number; }
export interface IUnitMember { id: number; unitId: number; userId: number; name: string; available: boolean; order: number; }
export interface IRoutingRule { id: number; title: string; categoryId: number; unitId: number; active: boolean; }
export interface ISupportUnitData { units: ISupportUnit[]; members: IUnitMember[]; rules: IRoutingRule[]; categories: Array<{id: number; title: string}>; }
export interface ISupportUnitsService {
  load(): Promise<ISupportUnitData>;
  saveUnit(value: Omit<ISupportUnit, 'id' | 'lastMemberId'>, id?: number): Promise<void>;
  saveMember(value: Omit<IUnitMember, 'id'>, id?: number): Promise<void>;
  saveRule(value: Omit<IRoutingRule, 'id'>, id?: number): Promise<void>;
  routeTicket(id: number): Promise<string>;
}
