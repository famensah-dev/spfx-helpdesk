import { spfi, SPFx, type SPFI } from '@pnp/sp';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/fields';
import type { ITicket } from '../interfaces/ITicket';
import type { ITicketQueryResult } from '../interfaces/IDashboard';

interface IListField { InternalName: string; Title: string; TypeAsString: string; Choices?: string[]; }

export class TicketService {
  private readonly sp: SPFI;
  public constructor(context: WebPartContext) {
    this.sp = spfi().using(SPFx(context));
  }

  public async getTickets(): Promise<ITicketQueryResult> {
    const list = this.sp.web.lists.getByTitle('Tickets');
    const fields: IListField[] = await list.fields.select('InternalName', 'Title', 'TypeAsString')();
    const resolve = (name: string, type: string, optional = false): string | undefined => {
      const field = fields.find(f => f.InternalName === name) || fields.find(f => f.Title === name);
      if (!field && optional) return undefined;
      if (!field || field.TypeAsString !== type) {
        throw new Error(`The Tickets list requires a ${type} column named ${name}. Check its internal name and type in List settings.`);
      }
      return field.InternalName;
    };
    const status = resolve('Status', 'Choice')!;
    const priority = resolve('Priority', 'Choice')!;
    const assigned = resolve('AssignedTo', 'User')!;
    const resolved = resolve('ResolvedAt', 'DateTime', true);
    const categoryField = fields.find(f => f.InternalName === 'Category') || fields.find(f => f.Title === 'Category');
    const category = categoryField && ['Text', 'Choice'].indexOf(categoryField.TypeAsString) >= 0 ? categoryField.InternalName : undefined;
    const dueDate = resolve('DueDate', 'DateTime', true);
    const escalated = resolve('Escalated', 'Boolean', true);
    const statusField: { Choices: string[] } = await list.fields.getByInternalNameOrTitle(status).select('Choices')();
    const statusChoices = statusField.Choices || [];
    const selected = ['Id', 'Title', 'Created', 'Modified', status, priority,
      `${assigned}/Id`, `${assigned}/Title`, `${assigned}/EMail`];
    [resolved, category, dueDate, escalated].forEach(field => { if (field) selected.push(field); });
    const tickets: ITicket[] = [];
    const query = list.items.select(...selected).expand(assigned).orderBy('Id').top(1000);
    for await (const batch of query) {
      for (const item of batch) {
        if (item[status] === 'Pending') item[status] = 'On Hold';
        if (item[status] === 'Completed') item[status] = 'Resolved';
        if (['New', 'Assigned', 'In Progress', 'On Hold', 'Waiting on Third Party', 'Resolved', 'Closed', 'Escalated'].indexOf(item[status]) < 0 ||
          ['Low', 'Medium', 'High', 'Critical'].indexOf(item[priority]) < 0) {
          throw new Error(`Ticket ${item.Id} has an unsupported status or priority. Review the list choice values.`);
        }
        const person = item[assigned];
        tickets.push({
          Id: item.Id, Title: item.Title || 'Untitled ticket',
          Status: item[status], Priority: item[priority], Created: item.Created, Modified: item.Modified,
          AssignedTo: person ? { Id: person.Id, Title: person.Title, Email: person.EMail } : undefined,
          Category: category ? item[category] : undefined,
          DueDate: dueDate ? item[dueDate] : undefined,
          Escalated: escalated ? Boolean(item[escalated]) : undefined,
          ResolvedAt: resolved ? item[resolved] || null : null
        });
      }
    }
    return { tickets, isMockData: false, sourceLabel: 'SharePoint · Tickets', hasResolvedAt: Boolean(resolved), hasCategory: Boolean(category), hasDueDate: Boolean(dueDate),
      hasEscalated: Boolean(escalated) || statusChoices.indexOf('Escalated') >= 0, hasPending: statusChoices.indexOf('Pending') >= 0 };
  }
}



