import type { GraphClient } from './GraphClient';
import type { IAppConfig } from './IAppConfig';
import { workspaceLists } from '../../interfaces/IWorkspaceSetup';
import type { ISupportUnitData, ISupportUnitsService, ISupportUnit, IUnitMember, IUnitCreationResult } from '../../interfaces/ISupportUnits';
interface Item {id:string; eTag?:string; '@odata.etag'?:string; fields:Record<string, unknown>;}
interface Column {name:string; displayName?:string; lookup?:{listId:string;allowMultipleValues?:boolean}; personOrGroup?:object; choice?:{choices:string[]};}
const number = (value:unknown):number => Number(value) || 0;
const enabled = (value:unknown):boolean => value === true || value === 1 || value === '1';
const positive = (value:number):boolean => Number.isSafeInteger(value) && value > 0;
const isSettings = (item:Item):boolean => item.fields.RecordType==='Settings' || item.fields.Title==='__DeskPilotAssignmentSettings';
export function matchingSupportUnit(data:ISupportUnitData, categoryId:number):ISupportUnit | undefined {
  const matches = data.units.filter(unit => unit.active && unit.categoryIds.includes(categoryId));
  if (matches.length > 1) throw new Error('Multiple active units handle this category. Ask a Helpdesk Admin to correct them.');
  return matches[0];
}
function categoryIds(value:unknown):number[] {
  if (value === undefined || value === null || value === '') return [];
  let parsed:unknown;
  try {parsed=JSON.parse(String(value));} catch {throw new Error('Invalid unit category configuration. Ask a Helpdesk Admin to review the unit.');}
  if (!Array.isArray(parsed) || parsed.some(id => !positive(id))) throw new Error('Invalid unit category configuration.');
  return [...new Set(parsed as number[])];
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
    for (const key of ['units','unitMembers','categories','tickets']) {
      const configured = key === 'tickets' ? this.config.listId : this.config.resourceIds?.[key];
      const name = key === 'tickets' ? this.config.listName : workspaceLists[key as keyof typeof workspaceLists];
      const found = lists.find(list => configured ? list.id.toLowerCase() === configured.toLowerCase() : list.displayName === name);
      if (found) ids[key] = found.id;
    }
    if (['units','unitMembers'].every(key => !ids[key]) && optional) return undefined;
    if (Object.keys(ids).length !== 4) throw new Error('Support unit setup is incomplete. Ask a Super Admin to run Initialize workspace, then reload DeskPilot.');
    const legacy = lists.find(list => this.config.resourceIds?.routingRules ? list.id===this.config.resourceIds.routingRules : list.displayName==='Routing Rules');
    if (legacy) ids.routingRules=legacy.id;
    return {path,ids};
  }
  private async read(context:{path:string;ids:Record<string,string>}):Promise<ISupportUnitData> {
    const entries = await Promise.all(['units','unitMembers','categories'].map(key => this.graph.getAll<Item>(`${context.path}/lists/${context.ids[key]}/items?$expand=fields&$top=200`)));
    // Read old routing data only for units that have not yet saved embedded categories.
    const legacy = context.ids.routingRules && entries[0].some(item => (item.fields.CategoryIds == null || item.fields.CategoryIds === ''))
      ? await this.graph.getAll<Item>(`${context.path}/lists/${context.ids.routingRules}/items?$expand=fields&$top=200`) : [];
    return {
      autoAssignEnabled:entries[0].filter(isSettings).length===1 && enabled(entries[0].find(isSettings)?.fields.AutoAssignEnabled),
      units:entries[0].filter(item=>!isSettings(item)).map(item => ({id:number(item.id),title:String(item.fields.Title || ''),active:enabled(item.fields.Active),method:item.fields.AssignmentMethod==='Unit queue' ? 'Specific member' : item.fields.AssignmentMethod as ISupportUnit['method'],lastMemberId:number(item.fields.LastMemberId),defaultMemberId:number(item.fields.DefaultMemberId) || undefined,categoryIds:(item.fields.CategoryIds == null || item.fields.CategoryIds === '') ? [...new Set(legacy.filter(rule => number(rule.fields.UnitLookupId)===number(item.id) && enabled(rule.fields.Active)).map(rule => number(rule.fields.CategoryLookupId)).filter(positive))] : categoryIds(item.fields.CategoryIds)})),
      members:entries[1].map(item => ({id:number(item.id),unitId:number(item.fields.UnitLookupId),userId:number(item.fields.MemberLookupId),name:String(item.fields.Title || ''),available:enabled(item.fields.Available),order:number(item.fields.RotationOrder)})),
      categories:entries[2].map(item => ({id:number(item.id),title:String(item.fields.Title || '')}))
    };
  }
  public async load():Promise<ISupportUnitData> {return this.read((await this.context())!);}
  private async requireSchema(context:{path:string;ids:Record<string,string>}):Promise<void> {
    const columns = await this.graph.getAll<Column>(`${context.path}/lists/${context.ids.units}/columns`);
    const missing=['CategoryIds','DefaultMemberId','RecordType','AutoAssignEnabled'].filter(name=>!columns.some(column=>column.name===name));
    if(missing.length)throw new Error(`Support Units needs workspace initialization (missing ${missing.join(', ')}). Ask a Super Admin to run Initialize workspace, then reload DeskPilot. No units were saved.`);
  }
  public async createUnits(names:string[]):Promise<IUnitCreationResult> {
    const unique=[...new Set(names.map(name=>name.trim()).filter(Boolean))];
    if(!unique.length || unique.some(name=>name.length>255 || name.toLowerCase()==='__deskpilotassignmentsettings'))throw new Error('Enter unit names of 1-255 characters, one per row.');
    if(new Set(unique.map(name=>name.toLowerCase())).size!==unique.length)throw new Error('Remove duplicate unit names before creating units.');
    const context=(await this.context())!;await this.requireSchema(context);
    const data=await this.read(context), result:IUnitCreationResult={created:[],skipped:[],failed:[]};
    for(let index=0;index<unique.length;index++){
      const name=unique[index];
      if(data.units.some(unit=>unit.title.toLowerCase()===name.toLowerCase())){result.skipped.push(name);continue;}
      try{await this.graph.post(`${context.path}/lists/${context.ids.units}/items`,{fields:{Title:name,RecordType:'Unit',Active:true,AssignmentMethod:'Round robin',CategoryIds:'[]',DefaultMemberId:0}});result.created.push(name);}
      catch(reason){result.failed.push({name,message:reason instanceof Error ? reason.message : 'Creation could not be confirmed.'});for(const remaining of unique.slice(index+1))result.failed.push({name:remaining,message:'Not attempted.'});break;}
    }
    return result;
  }
  public async setAutoAssignment(value:boolean):Promise<void> {
    const context=(await this.context())!;await this.requireSchema(context);
    const path=`${context.path}/lists/${context.ids.units}/items`;
    const settings=(await this.graph.getAll<Item>(`${path}?$expand=fields&$top=200`)).filter(isSettings);
    if(settings.length>1)throw new Error('Duplicate assignment settings found. Automatic assignment is disabled until a Super Admin corrects them.');
    if(settings[0]){const current=await this.graph.get<Item>(`${path}/${settings[0].id}?$expand=fields`);await this.graph.patch(`${path}/${current.id}/fields`,{AutoAssignEnabled:value},this.etag(current));}
    else await this.graph.post(path,{fields:{Title:'__DeskPilotAssignmentSettings',RecordType:'Settings',AutoAssignEnabled:value,Active:false,CategoryIds:'[]'}});
  }
  private async save(key:string,fields:Record<string,unknown>,id?:number):Promise<void> {
    if (id !== undefined && !positive(id)) throw new Error('Invalid configuration item.');
    const context = (await this.context())!;
    const path = `${context.path}/lists/${context.ids[key]}/items`;
    if (id) {const current = await this.graph.get<Item>(`${path}/${id}?$expand=fields`); await this.graph.patch(`${path}/${id}/fields`,fields,this.etag(current));}
    else await this.graph.post(path,{fields});
  }
  private etag(item:Item):string {const value = item.eTag || item['@odata.etag']; if (!value) throw new Error('Unable to verify the current item version. Refresh and try again.'); return value;}
  public async saveUnit(value:Omit<ISupportUnit,'id'|'lastMemberId'>,id?:number):Promise<void> {
    if (!value.title.trim() || value.title.trim().length>255 || value.title.trim().toLowerCase()==='__deskpilotassignmentsettings' || !['Round robin','Specific member'].includes(value.method)) throw new Error('Enter a unit name and supported assignment method.');
    const context=(await this.context())!;await this.requireSchema(context);
    const data = await this.read(context);
    if (data.units.some(unit => unit.id!==id && unit.title.toLowerCase()===value.title.trim().toLowerCase())) throw new Error('A unit with this name already exists.');
    if (!Array.isArray(value.categoryIds) || value.categoryIds.some(category => !data.categories.some(entry => entry.id===category))) throw new Error('Select valid ticket categories.');
    if (value.active && data.units.some(unit => unit.id!==id && unit.active && unit.categoryIds.some(category => value.categoryIds.includes(category)))) throw new Error('A selected category already belongs to another active unit.');
    const member = data.members.find(entry => entry.id===value.defaultMemberId && entry.unitId===id && entry.available);
    if (value.active && value.method==='Specific member' && !member) throw new Error('Choose an available member of this unit as the designated assignee. Add members first, then configure assignment.');
    await this.save('units',{Title:value.title.trim(),Active:value.active,AssignmentMethod:value.method,CategoryIds:JSON.stringify([...new Set(value.categoryIds)]),DefaultMemberId:value.method==='Specific member' ? value.defaultMemberId || 0 : 0},id);
  }
  public async saveMember(value:Omit<IUnitMember,'id'>,id?:number):Promise<void> {
    const data = await this.load();
    if (!data.units.some(unit => unit.id===value.unitId) || !positive(value.userId) || !value.name.trim() || !Number.isSafeInteger(value.order) || value.order<0) throw new Error('Select a unit and person, and enter a non-negative rotation order.');
    if (data.members.some(member => member.id!==id && member.unitId===value.unitId && member.userId===value.userId)) throw new Error('This person is already in the unit. Edit their availability instead.');
    await this.save('unitMembers',{Title:value.name,UnitLookupId:String(value.unitId),MemberLookupId:String(value.userId),Available:value.available,RotationOrder:value.order},id);
  }
  public async routeTicket(id:number):Promise<string> {
    if (!positive(id)) throw new Error('Enter a valid ticket ID.');
    const context = await this.context(true);
    if (!context) return 'Support units are not configured.';
    const data = await this.read(context);
    if(!data.autoAssignEnabled)return 'Automatic assignment is disabled.';
    if (!data.units.some(unit => unit.active && unit.categoryIds.length)) return 'No active unit handles ticket categories.';
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
    const unit = matchingSupportUnit(data,categoryId);
    if (!unit) return 'No matching active unit; ticket remains unassigned.';
    const existingUnit = number(item.fields[`${unitColumn.name}LookupId`]);
    if (existingUnit && existingUnit!==unit.id) return 'Existing assigned unit preserved.';
    if (!['Round robin','Specific member'].includes(unit.method)) throw new Error('Unsupported unit assignment method.');
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
    if (unit.method==='Specific member' && unit.defaultMemberId) selected = data.members.find(member => member.id===unit.defaultMemberId && member.unitId===unit.id && member.available && positive(member.userId));
    if (!selected && existingUnit===unit.id) return `Ticket remains in ${unit.title}'s queue; no individual assignment made.`;
    await this.graph.patch(`${path}/items/${id}/fields`,{[`${unitColumn.name}LookupId`]:String(unit.id),...(selected ? {[`${assigned.name}LookupId`]:String(selected.userId),[status.name]:'Assigned'} : {})},this.etag(item));
    return selected ? `Assigned to ${selected.name} in ${unit.title}.` : `Added to ${unit.title}'s queue; no configured assignee is available; administrator review required.`;
  }
}
