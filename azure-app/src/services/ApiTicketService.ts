import type { ITicketDataSource, INewTicketInput, ITicketEdit, ITicketCreationOptions, ITicketComment, ITicketVersion, TicketBulkAction, ITicketBulkResult, IOrganizationUser } from '../../../src/webparts/helpdeskSystem/interfaces/ITicketDataSource';
import type { IWorkspaceAccess } from '../../../src/webparts/helpdeskSystem/interfaces/IWorkspaceAccess';
import type { IFaq, IFaqAccess, IFaqInput, FaqBulkAction, IFaqBulkResult } from '../../../src/webparts/helpdeskSystem/interfaces/IFaq';
import type { ITicketQueryResult } from '../../../src/webparts/helpdeskSystem/interfaces/IDashboard';
import type { IUserLookup } from '../../../src/webparts/helpdeskSystem/interfaces/ITicket';
export class ApiTicketService implements ITicketDataSource {
  public access!: IWorkspaceAccess;
  public administration?: ITicketDataSource['administration'];
  public members?: ITicketDataSource['members'];
  public sla: NonNullable<ITicketDataSource['sla']>;
  public constructor(private token: () => Promise<string>) {
    this.sla = {getSettings: manage => this.rpc('sla.getSettings', [manage]), setup: () => this.rpc('sla.setup'), savePriority: value => this.rpc('sla.savePriority', [value])};
  }
  public async initialize(): Promise<void> {
    this.access = await this.rpc('session');
    if (this.access.admin) {
      this.administration = {getData: page => this.rpc('admin.getData', [page]), getLookupColumns: id => this.rpc('admin.getLookupColumns', [id]), saveColumn: (input, id) => this.rpc('admin.saveColumn', [input, id]), deleteColumn: id => this.rpc('admin.deleteColumn', [id]), saveEntry: (page, input, id) => this.rpc('admin.saveEntry', [page, input, id]), deleteEntry: (page, id) => this.rpc('admin.deleteEntry', [page, id])};
      if (this.access.superAdmin) this.members = {list: () => this.rpc('members.list'), save: member => this.rpc('members.save', [member]), remove: member => this.rpc('members.remove', [member])};
    }
  }
  private async rpc<T>(method: string, args: unknown[] = []): Promise<T> {
    let result: Response;
    try {result = await fetch('/api/rpc', {method: 'POST', headers: {Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json'}, body: JSON.stringify({method, args}), signal: AbortSignal.timeout(180000)});} catch (reason) {throw new Error(`DeskPilot API could not be reached. Start/configure the protected API. ${reason instanceof Error ? reason.message : ''}`);}
    const data = await result.json().catch(() => ({error: 'DeskPilot API is unavailable. Check its server configuration.'}));
    if (!result.ok) {const error = new Error(data.error || 'Request denied.') as Error & {createdTicketId?: number}; if (data.createdTicketId) error.createdTicketId = data.createdTicketId; throw error;}
    return data.result as T;
  }
  private async files(files: File[] = []): Promise<Array<{name: string; type: string; data: string}>> {
    return Promise.all(files.map(async file => {const bytes = new Uint8Array(await file.arrayBuffer()); let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192)); return {name: file.name, type: file.type, data: btoa(value)};}));
  }
  public getTickets(): Promise<ITicketQueryResult> {return this.rpc('getTickets');}
  public getPriorities(): Promise<string[]> {return this.rpc('getPriorities');}
  public getCreationOptions(): Promise<ITicketCreationOptions> {return this.rpc('getCreationOptions');}
  public async createTicket(input: INewTicketInput): Promise<void> {return this.rpc('createTicket', [{...input, attachments: await this.files(input.attachments)}]);}
  public async uploadAttachments(id: number, values: File[]): Promise<void> {return this.rpc('uploadAttachments', [id, await this.files(values)]);}
  public updateTicket(id: number, input: ITicketEdit): Promise<void> {return this.rpc('updateTicket', [id, input]);}
  public updateTickets(ids: number[], action: TicketBulkAction): Promise<ITicketBulkResult> {return this.rpc('updateTickets', [ids, action]);}
  public getComments(id: number): Promise<ITicketComment[]> {return this.rpc('getComments', [id]);}
  public addComment(id: number, text: string): Promise<void> {return this.rpc('addComment', [id, text]);}
  public getHistory(id: number): Promise<ITicketVersion[]> {return this.rpc('getHistory', [id]);}
  public recordFirstResponse(id: number): Promise<void> {return this.rpc('recordFirstResponse', [id]);}
  public searchUsers(query: string, department?: string): Promise<IOrganizationUser[]> {return this.rpc('searchUsers', [query, department]);}
  public resolveUser(user: IOrganizationUser): Promise<IUserLookup> {return this.rpc('resolveUser', [user]);}
  public getFaqs(manage?: boolean): Promise<IFaq[]> {return this.rpc('getFaqs', [manage]);}
  public getFaqAccess(): Promise<IFaqAccess> {return this.rpc('getFaqAccess');}
  public saveFaq(input: IFaqInput, id?: number): Promise<void> {return this.rpc('saveFaq', [input, id]);}
  public deleteFaq(id: number): Promise<void> {return this.rpc('deleteFaq', [id]);}
  public updateFaqs(ids: number[], action: FaqBulkAction): Promise<IFaqBulkResult> {return this.rpc('updateFaqs', [ids, action]);}
}
