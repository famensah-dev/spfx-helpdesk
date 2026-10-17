import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import type { IRoleManagement, IWorkspaceSettings } from '../interfaces/IRoleManagement';
import { workspaceLists } from '../interfaces/IWorkspaceSetup';
export type MaintenanceAction = 'clear' | 'drop' | 'reset';
export interface MaintenanceList { Id: string; Title: string; Description?: string; ItemCount: number; BaseTemplate: number; Hidden: boolean; }
export const maintenancePhrase = (action: MaintenanceAction): string => ({clear:'CLEAR LIST ITEMS', drop:'DELETE APPLICATION LISTS', reset:'RESET LIST BINDINGS'})[action];
export class WorkspaceMaintenanceService {
  private review?: string;
  private readonly web: string;
  public constructor(private context: WebPartContext, private roles: IRoleManagement) { this.web = context.pageContext.web.absoluteUrl.replace(/\/$/, '') + '/_api/web'; }
  private async read<T>(path: string): Promise<T> {
    const response = await this.context.spHttpClient.get(this.web + path, SPHttpClient.configurations.v1, {headers:{Accept:'application/json;odata=nometadata','odata-version':''}});
    if (!response.ok) throw new Error(`SharePoint request failed (${response.status}). Check your permissions.`);
    return response.json();
  }
  private async authorize(): Promise<void> {
    const permission = await this.read<{Low:string}>('/EffectiveBasePermissions');
    const low = Number(permission.Low);
    if (!Number.isFinite(low) || !(low & 1073741824) || !(low & 33554432)) throw new Error('Workspace maintenance requires SharePoint Manage Web and Manage Permissions access.');
  }
  public async lists(): Promise<MaintenanceList[]> {
    await this.authorize();
    const config = await this.roles.load();
    const workspace = config.workspace;
    const names = [workspace?.listName || 'Tickets', ...Object.entries(workspaceLists).filter(([key]) => key !== 'access').map(([,name]) => name)];
    const ids = [workspace?.listId, ...Object.entries(workspace?.resourceIds || {}).filter(([key]) => key !== 'access').map(([,id]) => id)].filter(Boolean);
    const values: MaintenanceList[] = [];
    let path: string | undefined = '/lists?$select=Id,Title,Description,ItemCount,BaseTemplate,Hidden&$top=100';
    while (path) {
      const page: {value:MaintenanceList[]; 'odata.nextLink'?:string} = await this.read(path);
      values.push(...page.value);
      const next = page['odata.nextLink'];
      if (next && !next.startsWith(this.web + '/')) throw new Error('Unexpected SharePoint pagination address.');
      path = next?.slice(this.web.length);
    }
    return values.filter(list => list.BaseTemplate === 100 && !list.Hidden && list.Id.toLowerCase() !== workspace?.resourceIds?.access?.toLowerCase() && !/^DeskPilot (Access|User Access|Configuration)$/i.test(list.Title) && (names.includes(list.Title) || ids.some(id => id?.toLowerCase() === list.Id.toLowerCase())));
  }
  public async inspect(action: MaintenanceAction, ids: string[]): Promise<MaintenanceList[]> {
    if (!['clear','drop','reset'].includes(action)) throw new Error('Invalid maintenance action.');
    const available = await this.lists();
    const targets = action === 'reset' ? [] : available.filter(list => ids.includes(list.Id));
    if (action !== 'reset' && (!targets.length || targets.length !== new Set(ids).size)) throw new Error('Select only available application lists.');
    this.review = JSON.stringify({action, targets});
    return targets;
  }
  private async recycle(path: string): Promise<void> {
    const response = await this.context.spHttpClient.post(this.web + path + '/recycle()', SPHttpClient.configurations.v1, {headers:{Accept:'application/json;odata=nometadata','odata-version':''}});
    if (!response.ok) throw new Error(`SharePoint could not recycle the resource (${response.status}). It may be protected or referenced by another list.`);
  }
  private async unbind(ids?: string[]): Promise<void> {
    const current = await this.roles.load();
    if (!current.workspace) throw new Error('Reload workspace settings before maintenance.');
    const workspace: IWorkspaceSettings = {...current.workspace, resourceIds:{...current.workspace.resourceIds}};
    const matches = (id:string): boolean => !ids || ids.some(value => value.toLowerCase() === id.toLowerCase());
    if (matches(workspace.listId)) workspace.listId = '';
    for (const [key,id] of Object.entries(workspace.resourceIds!)) if (matches(id)) delete workspace.resourceIds![key];
    await this.roles.save({...current,workspace});
  }
  public async run(action: MaintenanceAction, ids: string[], phrase: string, progress: (message:string) => void): Promise<void> {
    if (phrase !== maintenancePhrase(action)) throw new Error('The confirmation text does not match.');
    const reviewed = this.review;
    const targets = await this.inspect(action,ids);
    if (!reviewed || reviewed !== this.review) throw new Error('Resources changed. Review the operation again before continuing.');
    this.review = undefined;
    if (action === 'reset') {await this.unbind(); progress('Saved list bindings reset. Lists and user access were preserved.'); return;}
    // Recycle dependent lists before their classification lists.
    targets.sort((a,b) => Number(/Categories|Priorities|Issue Types/.test(a.Title)) - Number(/Categories|Priorities|Issue Types/.test(b.Title)));
    for (const list of targets) {
      const path = `/lists(guid'${list.Id}')`;
      progress(`${action === 'drop' ? 'Deleting' : 'Clearing'} ${list.Title}...`);
      if (action === 'drop') {await this.recycle(path); await this.unbind([list.Id]);}
      else {
        // Keep reading the first page as recycled items disappear; never skip a page.
        let items = await this.read<{value:{Id:number}[]}>(path + '/items?$select=Id&$top=100');
        while (items.value.length) {
          for (const item of items.value) await this.recycle(path + `/items(${item.Id})`);
          items = await this.read(path + '/items?$select=Id&$top=100');
        }
      }
      progress(`${list.Title}: complete.`);
    }
  }
}
