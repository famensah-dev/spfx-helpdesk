import type { GraphClient } from './graph/GraphClient';
import type { IAppConfig } from './graph/IAppConfig';
import { workspaceLists } from '../interfaces/IWorkspaceSetup';
import type { WorkspaceListKey, ISetupPlan, IWorkspaceSetup } from '../interfaces/IWorkspaceSetup';
interface List {id: string; displayName: string;}
interface Column {id?: string; name: string; displayName?: string; readOnly?: boolean; required?: boolean; [key: string]: unknown;}
interface Definition {key: WorkspaceListKey; name: string; columns: Column[];}
const text = (name: string, multiline = false): Column => ({name, text: {allowMultipleLines: multiline, ...(multiline ? {textType: 'richText'} : {})}});
const choice = (name: string, choices: string[], value?: string): Column => ({name, choice: {choices, allowTextEntry: false, displayAs: 'dropDownMenu'}, ...(value ? {defaultValue: {value}} : {})});
const date = (name: string): Column => ({name, dateTime: {format: 'dateTime', displayAs: 'default'}});
const lookup = (name: string, key: WorkspaceListKey): Column => ({name, lookup: {target: key, columnName: 'Title', allowMultipleValues: false}});
const common = (): Column[] => [text('Title'), {name: 'Active', boolean: {}, defaultValue: {value: '1'}}, {name: 'SortOrder', number: {decimalPlaces: 'none'}, defaultValue: {value: '0'}}];
export const ticketViewOrder = ['Title','Status','Priority','TicketType','Category','Subcategory','IssueType','AssignedTo','DueDate','FirstRespondedAt','ResolvedAt','ClosedAt','ResolutionSummary','RelatedIssue','Created','Author','Editor'];
export function workspaceDefinitions(ticketName: string): Definition[] {
  const definitions: Definition[] = [
    {key: 'categories', name: workspaceLists.categories, columns: common()},
    {key: 'comments', name: workspaceLists.comments, columns: [text('Title'),{...text('TicketKey'),indexed:true,required:true},{name:'Content',text:{allowMultipleLines:true,textType:'plain'},required:true}]},
    {key: 'subcategories', name: workspaceLists.subcategories, columns: [...common(), {...lookup('Category', 'categories'), required: true}]},
    {key: 'issueTypes', name: workspaceLists.issueTypes, columns: common()},
    {key: 'priorities', name: workspaceLists.priorities, columns: [text('Title'), {name: 'Active', boolean: {}, defaultValue: {value: '1'}}, {name: 'ResponseMinutes', number: {minimum: 1}}, {name: 'ResolutionMinutes', number: {minimum: 1}}]},
    {key: 'tickets', name: ticketName, columns: [text('Title'), {...text('Description', true), displayName: 'Issue description'}, choice('Status', ['New','Assigned','In Progress','On Hold','Waiting on Third Party','Resolved','Closed','Escalated'], 'New'), choice('Priority', ['Low','Medium','High','Critical'], 'Medium'), {name: 'AssignedTo', displayName: 'Assigned To', personOrGroup: {allowMultipleSelection: false, chooseFromType: 'peopleOnly', displayAs: 'name'}}, choice('TicketType', ['Problem','Incident','Question','Request']), lookup('Category','categories'), {...lookup('Subcategory','subcategories'), displayName: 'Issue Subcategory'}, {...lookup('IssueType','issueTypes'), displayName: 'Issue Type'}, text('Department'), {name:'RequestedBy',displayName:'Requested By',personOrGroup:{allowMultipleSelection:false,chooseFromType:'peopleOnly',displayAs:'name'}},text('RequesterEmail'),choice('TicketSource',['DeskPilot','Forms','Email','Other'],'DeskPilot'),{...text('ExternalRequestId'),indexed:true}, date('DueDate'), date('FirstRespondedAt'), date('ResolvedAt'), date('StartedAt'), date('ClosedAt'), {name:'ResolutionSummary',text:{allowMultipleLines:true,textType:'plain'}}, {name:'SolutionCommentId',displayName:'Solution Comment ID',text:{}}, {name: 'Archived', boolean: {}, defaultValue: {value: '0'}}, {name: 'Escalated', boolean: {}, defaultValue: {value: '0'}}]},
    {key: 'faqs', name: workspaceLists.faqs, columns: [text('Title'), {...text('Answer',true), required: true}, lookup('Category','categories'), lookup('Subcategory','subcategories'), text('Keywords'), {name:'Active', boolean:{}, defaultValue:{value:'0'}}, {name:'SortOrder',number:{decimalPlaces:'none'},defaultValue:{value:'0'}}]}
  ];
  const tickets = definitions.find(item => item.key === 'tickets')!;
  tickets.columns.push({...lookup('RelatedIssue','tickets'), displayName:'Related Issue'});
  const labels: Record<string,string> = {Category:'Issue Category', DueDate:'Expected Resolution Date', FirstRespondedAt:'First Responded At', ResolvedAt:'Resolved At', ClosedAt:'Closed At', ResolutionSummary:'Resolution Summary'};
  tickets.columns = tickets.columns.map(column => ({...column, ...(labels[column.name] ? {displayName:labels[column.name]} : {})})).sort((a,b) => (ticketViewOrder.includes(a.name) ? ticketViewOrder.indexOf(a.name) : 100) - (ticketViewOrder.includes(b.name) ? ticketViewOrder.indexOf(b.name) : 100));
  return definitions;
}
const normalize = (value: string): string => value.replace(/[^a-z0-9]/gi, '').toLowerCase();
const aliases: Record<string, string[]> = {Title:['Question','Issue'], Description:['Issue description'], Category:['Issue Category'], Subcategory:['Issue Subcategory'], AssignedTo:['Assigned To'], DueDate:['Expected Resolution Date'], ResolvedAt:['Resolved At','Completed At'], ClosedAt:['Closed At (New)']};
export function matchingColumn(columns: Column[], expected: Column): Column | undefined {
  const names = [expected.name, expected.displayName || '', ...(aliases[expected.name] || [])].filter(Boolean).map(normalize);
  return columns.find(column => column.name === expected.name) || columns.find(column => !column.readOnly && names.includes(normalize(column.displayName || column.name)));
}
const facet = (column: Column): string => ['text','choice','boolean','number','dateTime','personOrGroup','lookup'].find(kind => column[kind]) || 'unknown';
export function columnConflict(actual: Column, expected: Column, ids: Record<string,string>, allowLegacyClassification = false): string | undefined {
  const kind = facet(expected), actualKind = facet(actual);
  const legacyClassification = allowLegacyClassification && ['Category','Subcategory','IssueType'].includes(expected.name) && ['text','choice'].includes(actualKind);
  if (actual.readOnly || (kind !== actualKind && !legacyClassification)) return expected.name === 'RelatedIssue'
    ? `Related Issue must be a writable lookup to this same tickets list (currently ${actualKind}); existing data will not be converted automatically`
    : `must be a writable ${kind} column (currently ${actualKind})`;
  if (actualKind === 'lookup') {
    const target = expected.lookup as {target?: string}; const value = actual.lookup as {listId: string; allowMultipleValues?: boolean};
    if (value.allowMultipleValues || !ids[target.target!] || value.listId.toLowerCase() !== ids[target.target!].toLowerCase()) return 'lookup points to a different list or allows multiple values';
  }
  if (actualKind === 'personOrGroup' && (actual.personOrGroup as {allowMultipleSelection?: boolean}).allowMultipleSelection) return 'must allow a single person';
  if (['Answer','Content','ResolutionSummary'].includes(expected.name) && actualKind === 'text' && !(actual.text as {allowMultipleLines?: boolean}).allowMultipleLines) return 'must allow multiple lines';
  return undefined;
}
export class WorkspaceSetupService implements IWorkspaceSetup {
  private reviewed?: string;
  public constructor(private graph: GraphClient, private config: IAppConfig, private finish: (ids: Record<string,string>, orderedFields: string[]) => Promise<void>) {}
  private async snapshot(): Promise<{path: string; definitions: Definition[]; ids: Record<string,string>; lists: List[]}> {
    const url = new URL(this.config.siteUrl);
    const site = await this.graph.get<{id:string}>(`/sites/${url.hostname}:${url.pathname}?$select=id`);
    const path = `/sites/${encodeURIComponent(site.id)}`;
    const lists = await this.graph.getAll<List>(`${path}/lists?$select=id,displayName,system`);
    const definitions = workspaceDefinitions(this.config.listName);
    const ids: Record<string,string> = {};
    for (const definition of definitions) {
      const configured = definition.key === 'tickets' ? this.config.listId : this.config.resourceIds?.[definition.key];
      const found = configured ? lists.find(list => list.id.toLowerCase() === configured.toLowerCase()) : lists.find(list => list.displayName === definition.name);
      // An explicit missing binding is never silently replaced by a same-name list.
      if (configured && !found) throw new Error(`Configured ${definition.name} ID is unavailable. Check permissions or correct the binding before initialization; no duplicate list was created.`);
      if (found) ids[definition.key] = found.id;
    }
    return {path,definitions,ids,lists};
  }
  public async inspect(): Promise<ISetupPlan> {
    const {path,definitions,ids} = await this.snapshot();
    const steps: ISetupPlan['steps'] = [];
    for (const definition of definitions) {
      if (!ids[definition.key]) {steps.push({resource: definition.name, action: `Create list and ${definition.columns.length} columns`}); continue;}
      const before = steps.length;
      const columns = await this.graph.getAll<Column>(`${path}/lists/${ids[definition.key]}/columns`);
      for (const expected of definition.columns) {
        const actual = matchingColumn(columns,expected);
        if (!actual) {steps.push({resource: `${definition.name} / ${expected.name}`, action:'Add column'}); continue;}
        const conflict = columnConflict(actual,expected,ids, definition.key === 'tickets' || definition.key === 'faqs');
        if (expected.indexed && !actual.indexed) steps.push({resource:`${definition.name} / ${actual.displayName || actual.name}`,action:'Index column for comment lookup'});
        if (conflict) steps.push({resource: `${definition.name} / ${actual.displayName || actual.name}`, action:conflict, blocked:true});
        else if (expected.choice && (expected.choice as {choices:string[]}).choices.some(value => !(actual.choice as {choices:string[]}).choices.includes(value))) steps.push({resource:`${definition.name} / ${actual.name}`, action:'Append missing supported choices; preserve existing choices'});
      }
      if (steps.length === before) steps.push({resource:definition.name,action:'Already configured; preserve existing list and records'});
    }
    steps.push({resource: workspaceLists.priorities, action:'Seed missing priorities and missing SLA targets; preserve existing targets'});
    steps.push({resource:this.config.listName, action:'Arrange default view in the requested column order; keep other view fields afterward'});
    steps.push({resource: workspaceLists.access, action:'Initialize/verify private configuration, synchronize user access and save list bindings'});
    this.reviewed = JSON.stringify(steps);
    return {steps};
  }
  public async run(progress: (message: string) => void): Promise<void> {
    const reviewed = this.reviewed;
    const plan = await this.inspect();
    if (!reviewed || reviewed !== JSON.stringify(plan.steps)) throw new Error('Workspace changed since the review. Review the updated plan before continuing.');
    if (plan.steps.some(step => step.blocked)) throw new Error('Schema conflicts require review. Fix them before initialization.');
    const {path,definitions,ids} = await this.snapshot();
    for (const definition of definitions) {
      progress(`Preparing ${definition.name}...`);
      if (!ids[definition.key]) {
        const created = await this.graph.post<List>(`${path}/lists`, {displayName:definition.name, list:{template:'genericList'}});
        ids[definition.key] = created.id;
      }
      const columnPath = `${path}/lists/${ids[definition.key]}/columns`;
      const columns = await this.graph.getAll<Column>(columnPath);
      for (const expected of definition.columns) {
        const actual = matchingColumn(columns,expected);
        if (actual) {
          const conflict = columnConflict(actual,expected,ids, definition.key === 'tickets' || definition.key === 'faqs');
          if (conflict) throw new Error(`${definition.name}.${actual.name}: ${conflict}. Existing records preserved.`);
          if (expected.indexed && !actual.indexed) await this.graph.patch(`${columnPath}/${actual.id}`,{indexed:true});
          if (expected.choice) {
            const choices = [...new Set([...(actual.choice as {choices:string[]}).choices,...(expected.choice as {choices:string[]}).choices])];
            if (choices.length !== (actual.choice as {choices:string[]}).choices.length) await this.graph.patch(`${columnPath}/${actual.id}`, {choice:{...actual.choice as object, choices}});
          }
          continue;
        }
        const body = {...expected};
        if (expected.lookup) {const relationship = expected.lookup as {target: string; columnName:string; allowMultipleValues:boolean}; body.lookup = {listId:ids[relationship.target],columnName:relationship.columnName,allowMultipleValues:false};}
        await this.graph.post(columnPath,body);
      }
    }
    progress('Adding initial priority targets...');
    const prioritiesPath = `${path}/lists/${ids.priorities}/items`;
    const existing = await this.graph.getAll<{id:string; fields:Record<string,unknown>}>(`${prioritiesPath}?$expand=fields&$top=200`);
    const ticketColumns = await this.graph.getAll<Column>(`${path}/lists/${ids.tickets}/columns`);
    const priority = matchingColumn(ticketColumns, choice('Priority',[]));
    const names = (priority?.choice as {choices:string[]}).choices;
    const defaults: Record<string,[number,number]> = {critical:[15,240], high:[60,480], medium:[240,1440], low:[480,4320]};
    for (const name of names) {
      const targets = defaults[name.toLowerCase()] || [240,1440];
      const item = existing.find(value => String(value.fields.Title).trim().toLowerCase() === name.trim().toLowerCase());
      if (!item) await this.graph.post(prioritiesPath,{fields:{Title:name,Active:true,ResponseMinutes:targets[0],ResolutionMinutes:targets[1]}});
      else {const fields: Record<string,number> = {}; if (item.fields.ResponseMinutes == null) fields.ResponseMinutes = targets[0]; if (item.fields.ResolutionMinutes == null) fields.ResolutionMinutes = targets[1]; if (Object.keys(fields).length) await this.graph.patch(`${prioritiesPath}/${item.id}/fields`,fields);}
    }
    progress('Securing configuration and saving workspace connections...');
    const orderedFields = ticketViewOrder.map(name => ['Created','Author','Editor'].includes(name) ? name : matchingColumn(ticketColumns,{name})?.name).filter((name): name is string => Boolean(name));
    await this.finish(ids,orderedFields);
    progress('Workspace initialized successfully.');
  }
}
