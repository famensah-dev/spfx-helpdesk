import type { GraphClient } from './GraphClient';
import type { IAppConfig } from './IAppConfig';
import { workspaceLists } from '../../interfaces/IWorkspaceSetup';
import type { ISupportUnitData, ISupportUnitsService, ISupportUnit, IUnitMember, IRoutingRule } from '../../interfaces/ISupportUnits';
interface Item {id:string; eTag?:string; '@odata.etag'?:string; fields:Record<string, unknown>;}
interface Column {name:string; displayName?:string; lookup?:{listId:string;allowMultipleValues?:boolean}; personOrGroup?:object; choice?:{choices:string[]};}
const number = (value:unknown):number => Number(value) || 0;
const enabled = (value:unknown):boolean => value === true || value === 1 || value === '1';
const positive = (value:number):boolean => Number.isSafeInteger(value) && value > 0;
export function matchingRoutingRule(data:ISupportUnitData, categoryId:number):IRoutingRule | undefined {
  const matches = data.rules.filter(rule => rule.active && rule.categoryId === categoryId && data.units.some(unit => unit.id === rule.unitId && unit.active));
  const candidates = matches;
  if (candidates.length > 1) throw new Error('Multiple active routing rules match this classification. Ask a Helpdesk Admin to correct them.');
  return candidates[0];
}
export function nextUnitMember(members:IUnitMember[], unitId:number, lastMemberId:number):IUnitMember | undefined {
  const ordered = members.filter(member => member.unitId === unitId).sort((a,b) => a.order - b.order || a.id - b.id);
  const last = ordered.findIndex(member => member.id === lastMemberId);
  for (let offset=1; offset<=ordered.length; offset++) { const member = ordered[(last + offset) % ordered.length]; if (member.available && positive(member.userId)) return member; }
  return undefined;
}
/** Configuration uses normal delegated list permissions. This never grants site access. */
export class GraphSupportUnitsService implements ISupportUnitsService {
  public constructor(private graph:GraphClient, private config:IAppConfig) {}
  private async context(optional=false):Promise<{path:string;ids:Record<string,string>} | undefined> {
    const url = new URL(this.config.siteUrl);
    const site = this.config.siteId ? {id:this.config.siteId} : await this.graph.get<{id:string}>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const path = `/sites/${encodeURIComponent(site.id)}`;
    const lists = await this.graph.getAll<{id:string;displayName:string}>(`${path}/lists?$select=id,displayName`);
    const ids:Record<string,string> = {};
    for (const key of ['units','unitMembers','routingRules','categories','tickets']) {
      const configured = key === 'tickets' ? this.config.listId : this.config.resourceIds?.[key];
      const name = key === 'tickets' ? this.config.listName : workspaceLists[key as keyof typeof workspaceLists];
      const found = lists.find(list => configured ? list.id.toLowerCase() === configured.toLowerCase() : list.displayName === name);
      if (found) ids[key] = found.id;
    }
    if (['units','unitMembers','routingRules'].every(key => !ids[key]) && optional) return undefined;
    if (Object.keys(ids).length !== 5) throw new Error('Support unit setup is incomplete. Ask a Super Admin to run Initialize workspace, then reload DeskPilot.');
    return {path,ids};
  }
  private async read(context:{path:string;ids:Record<string,string>}):Promise<ISupportUnitData> {
    const entries = await Promise.all(['units','unitMembers','routingRules','categories'].map(key => this.graph.getAll<Item>(`${context.path}/lists/${context.ids[key]}/items?$expand=fields&$top=200`)));
    return {
      units:entries[0].map(item => ({id:number(item.id),title:String(item.fields.Title || ''),active:enabled(item.fields.Active),method:item.fields.AssignmentMethod as ISupportUnit['method'],lastMemberId:number(item.fields.LastMemberId)})),
      members:entries[1].map(item => ({id:number(item.id),unitId:number(item.fields.UnitLookupId),userId:number(item.fields.MemberLookupId),name:String(item.fields.Title || ''),available:enabled(item.fields.Available),order:number(item.fields.RotationOrder)})),
      rules:entries[2].map(item => ({id:number(item.id),title:String(item.fields.Title || ''),categoryId:number(item.fields.CategoryLookupId),unitId:number(item.fields.UnitLookupId),active:enabled(item.fields.Active)})),
      categories:entries[3].map(item => ({id:number(item.id),title:String(item.fields.Title || '')}))
    };
  }
  public async load():Promise<ISupportUnitData> {return this.read((await this.context())!);}
  private async save(key:string,fields:Record<string,unknown>,id?:number):Promise<void> {
    if (id !== undefined && !positive(id)) throw new Error('Invalid configuration item.');
    const context = (await this.context())!;
    const path = `${context.path}/lists/${context.ids[key]}/items`;
    if (id) {const current = await this.graph.get<Item>(`${path}/${id}?$expand=fields`); await this.graph.patch(`${path}/${id}/fields`,fields,this.etag(current));}
    else await this.graph.post(path,{fields});
  }
  private etag(item:Item):string {const value = item.eTag || item['@odata.etag']; if (!value) throw new Error('Unable to verify the current item version. Refresh and try again.'); return value;}
  public async saveUnit(value:Omit<ISupportUnit,'id'|'lastMemberId'>,id?:number):Promise<void> {
    if (!value.title.trim() || value.title.trim().length>255 || !['Round robin','Unit queue'].includes(value.method)) throw new Error('Enter a unit name and supported assignment method.');
    const data = await this.load();
    if (data.units.some(unit => unit.id!==id && unit.title.toLowerCase()===value.title.trim().toLowerCase())) throw new Error('A unit with this name already exists.');
    await this.save('units',{Title:value.title.trim(),Active:value.active,AssignmentMethod:value.method},id);
  }
  public async saveMember(value:Omit<IUnitMember,'id'>,id?:number):Promise<void> {
    const data = await this.load();
    if (!data.units.some(unit => unit.id===value.unitId) || !positive(value.userId) || !value.name.trim() || !Number.isSafeInteger(value.order) || value.order<0) throw new Error('Select a unit and person, and enter a non-negative rotation order.');
    if (data.members.some(member => member.id!==id && member.unitId===value.unitId && member.userId===value.userId)) throw new Error('This person is already in the unit. Edit their availability instead.');
    await this.save('unitMembers',{Title:value.name,UnitLookupId:String(value.unitId),MemberLookupId:String(value.userId),Available:value.available,RotationOrder:value.order},id);
  }
  public async saveRule(value:Omit<IRoutingRule,'id'>,id?:number):Promise<void> {
    const data = await this.load();
    if (!data.units.some(unit => unit.id===value.unitId) || !data.categories.some(category => category.id===value.categoryId)) throw new Error('Select a valid category and support unit.');
    if (value.active && data.rules.some(rule => rule.id!==id && rule.active && rule.categoryId===value.categoryId)) throw new Error('An active rule already exists for this category. Edit that rule instead.');
    await this.save('routingRules',{Title:value.title.trim() || data.categories.find(category => category.id===value.categoryId)!.title,CategoryLookupId:String(value.categoryId),UnitLookupId:String(value.unitId),Active:value.active},id);
  }
  public async routeTicket(id:number):Promise<string> {
    if (!positive(id)) throw new Error('Enter a valid ticket ID.');
    const context = await this.context(true);
    if (!context) return 'Support units are not configured.';
    const data = await this.read(context);
    if (!data.rules.some(rule => rule.active)) return 'No active routing rule.';
    const path = `${context.path}/lists/${context.ids.tickets}`;
    const columns = await this.graph.getAll<Column>(`${path}/columns`);
    const column = (name:string,aliases:string[]=[]):Column | undefined => columns.find(item => item.name===name) || columns.find(item => aliases.includes(item.displayName || ''));
    const assigned = column('AssignedTo',['Assigned To']), status = column('Status'), unitColumn = column('AssignedUnit',['Assigned Unit']);
    if (!assigned?.personOrGroup || !status?.choice?.choices.includes('Assigned') || !unitColumn?.lookup || unitColumn.lookup.allowMultipleValues || unitColumn.lookup.listId.toLowerCase()!==context.ids.units.toLowerCase()) throw new Error('Initialize workspace to configure Assigned Unit and ticket assignment fields.');
    const item = await this.graph.get<Item>(`${path}/items/${id}?$expand=fields`);
    if (number(item.fields[`${assigned.name}LookupId`])) return 'Already assigned; preserved existing assignee.';
    if (item.fields[status.name]!=='New') return 'Only new, unassigned tickets are routed automatically.';
    const category = column('Category',['Issue Category']);
    for (const [field,target] of [[category,'categories']] as const) {
      if (field?.lookup && (field.lookup.allowMultipleValues || field.lookup.listId.toLowerCase()!==context.ids[target].toLowerCase())) throw new Error('Classification lookup points to a different list. Review workspace setup before routing.');
    }
    const categoryId = category?.lookup ? number(item.fields[`${category.name}LookupId`]) : data.categories.find(entry => entry.title===item.fields[category?.name || ''])?.id || 0;
    const rule = matchingRoutingRule(data,categoryId);
    if (!rule) return 'No matching active rule; ticket remains unassigned.';
    const unit = data.units.find(value => value.id===rule.unitId)!;
    const existingUnit = number(item.fields[`${unitColumn.name}LookupId`]);
    if (existingUnit && existingUnit!==unit.id) return 'Existing assigned unit preserved.';
    if (!['Round robin','Unit queue'].includes(unit.method)) throw new Error('Unsupported unit assignment method.');
    let selected:IUnitMember | undefined;
    if (unit.method==='Round robin') {
      const unitPath = `${context.path}/lists/${context.ids.units}/items/${unit.id}`;
      for (let attempt=0;attempt<5;attempt++) {
        const current = await this.graph.get<Item>(`${unitPath}?$expand=fields`);
        if (!enabled(current.fields.Active) || current.fields.AssignmentMethod!==unit.method) throw new Error('Unit configuration changed. Refresh and try routing again.');
        selected = nextUnitMember(data.members,unit.id,number(current.fields.LastMemberId));
        if (!selected) break;
        try {await this.graph.patch(`${unitPath}/fields`,{LastMemberId:selected.id},this.etag(current)); break;}
        catch (reason) {if (!(reason instanceof Error) || !reason.message.includes('412') || attempt===4) throw reason;}
      }
    }
    if (!selected && existingUnit===unit.id) return `Ticket remains in ${unit.title}'s queue; no individual assignment made.`;
    await this.graph.patch(`${path}/items/${id}/fields`,{[`${unitColumn.name}LookupId`]:String(unit.id),...(selected ? {[`${assigned.name}LookupId`]:String(selected.userId),[status.name]:'Assigned'} : {})},this.etag(item));
    return selected ? `Assigned to ${selected.name} in ${unit.title}.` : `Added to ${unit.title}'s queue; ${unit.method==='Unit queue' ? 'manual assignment required' : 'no members are available'}.`;
  }
}
