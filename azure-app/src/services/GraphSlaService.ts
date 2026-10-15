import type { GraphClient } from './GraphClient';
import type { IAppConfig } from '../config';
import type { ISlaService, ISlaSettings, ISlaPriority } from '../../../src/webparts/helpdeskSystem/interfaces/ISla';
interface List { id: string; displayName: string; webUrl?: string; }
interface Column { id: string; name: string; displayName: string; readOnly?: boolean; text?: object; number?: object; boolean?: object; dateTime?: object; choice?: {choices: string[]; [key: string]: unknown}; }
const listName = 'Ticket Priorities';
export class GraphSlaService implements ISlaService {
  public constructor(private graph: GraphClient, private schema: GraphClient, private config: IAppConfig, private token: () => Promise<string>, private changed: () => void) {}
  private async context() {
    const url = new URL(this.config.siteUrl);
    const siteId = this.config.siteId || (await this.graph.get<{id: string}>(`/sites/${url.hostname}:${url.pathname}?$select=id`)).id;
    const site = `/sites/${encodeURIComponent(siteId)}`;
    const lists = await this.graph.getAll<List>(`${site}/lists?$select=id,displayName,webUrl`);
    const tickets = lists.find(list => this.config.listId ? list.id.toLowerCase() === this.config.listId.toLowerCase() : list.displayName === this.config.listName);
    if (!tickets) throw new Error('The configured ticket list was not found.');
    return {site, tickets, policies: lists.find(list => list.displayName === listName)};
  }
  private async authorize(id: string): Promise<void> {
    const result = await fetch(`${this.config.siteUrl}/_api/web/lists(guid'${encodeURIComponent(id)}')/EffectiveBasePermissions`, {headers: {Authorization: `Bearer ${await this.token()}`, Accept: 'application/json;odata=nometadata'}, signal: AbortSignal.timeout(30000)});
    if (!result.ok) throw new Error('Unable to verify SLA administration permissions.');
    const permissions = await result.json() as {Low: string};
    if ((Number(permissions.Low) & 2048) !== 2048) throw new Error('SLA administration requires Manage Lists permission.');
  }
  private priority(columns: Column[]): Column {
    const column = columns.find(item => item.name.toLowerCase() === 'priority' && item.choice) || columns.find(item => item.displayName.toLowerCase() === 'priority' && item.choice);
    if (!column || column.readOnly) throw new Error('Tickets requires a writable Priority Choice column.');
    return column;
  }
  private validate(columns: Column[]): void {
    for (const [name, facet] of [['Title', 'text'], ['ResponseMinutes', 'number'], ['ResolutionMinutes', 'number'], ['Active', 'boolean']] as const) {
      if (!columns.some(column => column.name === name && column[facet] && !column.readOnly)) throw new Error(`${listName} needs a writable ${name} (${facet}) column. Run setup to add missing columns.`);
    }
  }
  public async getSettings(manage = false): Promise<ISlaSettings> {
    const context = await this.context();
    if (manage) { await this.authorize(context.tickets.id); if (context.policies) await this.authorize(context.policies.id); }
    const columns = await this.graph.getAll<Column>(`${context.site}/lists/${context.tickets.id}/columns`);
    const choices = this.priority(columns).choice!.choices;
    const trackingReady = ['FirstRespondedAt', 'ResolvedAt'].every(name => columns.some(column => column.name === name && column.dateTime && !column.readOnly));
    if (!context.policies) return {configured: false, priorities: choices.map(name => ({name, active: true})), trackingReady};
    const path = `${context.site}/lists/${context.policies.id}`;
    const [policyColumns, items] = await Promise.all([this.graph.getAll<Column>(`${path}/columns`), this.graph.getAll<{id: string; fields: Record<string, unknown>}>(`${path}/items?$expand=fields&$top=200`)]);
    this.validate(policyColumns);
    const policies = items.map(item => ({id: item.id, name: String(item.fields.Title || ''), active: item.fields.Active === true, responseMinutes: typeof item.fields.ResponseMinutes === 'number' ? item.fields.ResponseMinutes : undefined, resolutionMinutes: typeof item.fields.ResolutionMinutes === 'number' ? item.fields.ResolutionMinutes : undefined}));
    if (policies.some((policy, index) => !policy.name.trim() || policies.findIndex(other => other.name.toLowerCase() === policy.name.toLowerCase()) !== index)) throw new Error('SLA priorities must have unique, non-empty names. Correct duplicates in Ticket Priorities.');
    return {configured: true, listUrl: context.policies.webUrl, trackingReady, priorities: [...choices.map(name => policies.find(policy => policy.name === name) || {name, active: true}), ...policies.filter(policy => !choices.includes(policy.name))]};
  }
  public async setup(): Promise<void> {
    const context = await this.context(); await this.authorize(context.tickets.id);
    const definitions = [{name: 'ResponseMinutes', number: {minimum: 1, decimalPlaces: 'none'}}, {name: 'ResolutionMinutes', number: {minimum: 1, decimalPlaces: 'none'}}, {name: 'Active', boolean: {}, defaultValue: {value: '1'}}];
    let policies = context.policies;
    if (!policies) policies = await this.schema.post<List>(`${context.site}/lists`, {displayName: listName, list: {template: 'genericList'}, columns: definitions});
    await this.authorize(policies.id);
    const path = `${context.site}/lists/${policies.id}`;
    const columns = await this.graph.getAll<Column>(`${path}/columns`);
    for (const definition of definitions) if (!columns.some(column => column.name === definition.name)) await this.schema.post(`${path}/columns`, definition);
    const ticketsPath = `${context.site}/lists/${context.tickets.id}`;
    const ticketColumns = await this.graph.getAll<Column>(`${ticketsPath}/columns`);
    const choices = this.priority(ticketColumns).choice!.choices;
    const items = await this.graph.getAll<{fields: {Title?: string}}>(`${path}/items?$expand=fields($select=Title)&$top=200`);
    const existingNames = new Set(items.map(item => String(item.fields.Title || '').trim().toLowerCase()));
    for (const name of choices) {
      const key = name.trim().toLowerCase();
      if (!key || existingNames.has(key)) continue;
      await this.graph.post(`${path}/items`, {fields: {Title: name, Active: true}});
      existingNames.add(key);
    }
    for (const name of ['FirstRespondedAt', 'ResolvedAt']) {
      const existing = ticketColumns.find(column => column.name === name);
      if (existing && (!existing.dateTime || existing.readOnly)) throw new Error(`${name} must be a writable Date and Time column.`);
      if (!existing) await this.schema.post(`${ticketsPath}/columns`, {name, dateTime: {format: 'dateTime', displayAs: 'default'}});
    }
    this.changed();
  }
  public async savePriority(input: ISlaPriority): Promise<void> {
    if (!input.name.trim() || input.name.trim().length > 255) throw new Error('Enter a priority name of 1–255 characters.');
    for (const value of [input.responseMinutes, input.resolutionMinutes]) if (!Number.isSafeInteger(value) || value! <= 0) throw new Error('Response and resolution targets must be positive whole minutes.');
    if (input.resolutionMinutes! < input.responseMinutes!) throw new Error('Resolution target must be at least the response target.');
    const context = await this.context(); await this.authorize(context.tickets.id);
    if (!context.policies) throw new Error('Set up SLA & Priorities first.');
    await this.authorize(context.policies.id);
    const settings = await this.getSettings();
    const name = input.name.trim();
    const existing = input.id ? settings.priorities.find(policy => policy.id === input.id) : settings.priorities.find(policy => policy.name.toLowerCase() === name.toLowerCase());
    if (input.id && (!existing || existing.name !== name)) throw new Error('Existing priority names are permanent to preserve ticket references.');
    if (existing && existing.name !== name) throw new Error('A priority already uses this name.');
    const path = `${context.site}/lists/${context.tickets.id}`;
    const priority = this.priority(await this.graph.getAll<Column>(`${path}/columns`));
    if (!priority.choice!.choices.includes(name)) {
      if (priority.choice!.choices.some(value => value.toLowerCase() === name.toLowerCase())) throw new Error('A priority already uses this name.');
      await this.schema.patch(`${path}/columns/${priority.id}`, {choice: {...priority.choice, choices: [...priority.choice!.choices, name]}});
      this.changed();
    }
    const fields = {Title: name, ResponseMinutes: input.responseMinutes, ResolutionMinutes: input.resolutionMinutes, Active: input.active};
    const policyPath = `${context.site}/lists/${context.policies.id}/items`;
    if (existing?.id) await this.graph.patch(`${policyPath}/${existing.id}/fields`, fields);
    else await this.graph.post(policyPath, {fields});
    this.changed();
  }
}
