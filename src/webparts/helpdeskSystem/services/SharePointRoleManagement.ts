import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { defaultRoleConfiguration, validateRoleConfiguration } from '../interfaces/IRoleManagement';
import type { IRoleConfiguration, IRoleManagement } from '../interfaces/IRoleManagement';

/** Role rules control the app experience. SharePoint ACLs remain the data security boundary. */
export class SharePointRoleManagement implements IRoleManagement {
  private readonly root: string;
  private etag: string | undefined;
  private itemId: number | undefined;
  public constructor(private context: WebPartContext, private owner: boolean) {
    this.root = `${context.pageContext.web.absoluteUrl}/_api/web/lists/getbytitle('DeskPilot Access')`;
  }
  private async read<T>(url: string): Promise<T> {
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' } });
    if (!response.ok) {
      if (!this.owner && [401, 403, 404].includes(response.status)) throw new Error('You do not have access to this DeskPilot workspace. Contact your helpdesk administrator to request access.');
      throw new Error(`Unable to read DeskPilot access settings (${response.status}). Please refresh and try again.`);
    }
    return response.json();
  }
  private async write<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', 'odata-version': '', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 412 ? 'Access settings changed in another session. Reload before saving.' : `Unable to save DeskPilot access settings (${response.status}). Site owner permissions are required.`);
    return response.status === 204 || response.headers.get('content-length') === '0' ? undefined as T : response.json().catch(() => undefined as T);
  }
  private async grantConfigurationRead(configuration: IRoleConfiguration): Promise<void> {
    const existing = await this.read<{ value: Array<{ PrincipalId: number }> }>(`${this.root}/roleassignments?$select=PrincipalId`);
    const definitions = await this.read<{ value: Array<{ Id: number; RoleTypeKind: number }> }>(`${this.context.pageContext.web.absoluteUrl}/_api/web/roledefinitions?$select=Id,RoleTypeKind`);
    const read = definitions.value.find(item => item.RoleTypeKind === 2)?.Id;
    if (!read) throw new Error('SharePoint Read permission level was not found.');
    const existingIds = new Set(existing.value.map(item => item.PrincipalId));
    for (const assignment of configuration.assignments) {
      if (!existingIds.has(assignment.userId)) await this.write(`${this.root}/roleassignments/addroleassignment(principalid=${assignment.userId},roledefid=${read})`);
    }
  }
  public async load(): Promise<IRoleConfiguration> {
    const response = await this.context.spHttpClient.get(`${this.root}?$select=Id,HasUniqueRoleAssignments`, SPHttpClient.configurations.v1);
    if (response.status === 404 && this.owner) { this.itemId = undefined; this.etag = undefined; return defaultRoleConfiguration(); }
    if (!response.ok) {
      if (!this.owner && [401, 403, 404].includes(response.status)) throw new Error('You do not have access to this DeskPilot workspace. Contact your helpdesk administrator to request access.');
      throw new Error(this.owner ? 'DeskPilot access settings could not be loaded. Check your site permissions and try again.' : 'DeskPilot could not load your access settings. Please refresh and try again.');
    }
    const listData = await response.json();
    const list = listData.d || listData;
    if (!list.HasUniqueRoleAssignments) {
      if (this.owner) { this.itemId = undefined; this.etag = undefined; return defaultRoleConfiguration(); }
      throw new Error('DeskPilot Access must have unique permissions with editing restricted to site owners. Ask a site owner to repair its permissions.');
    }
    const fields = await this.read<{ value: Array<{ InternalName: string }> }>(`${this.root}/fields?$select=InternalName&$filter=InternalName eq 'Rules'`);
    if (!fields.value.length && this.owner) { this.itemId = undefined; this.etag = undefined; return defaultRoleConfiguration(); }
    const data = await this.read<{ value: Array<{ Id: number; Rules: string; '@odata.etag'?: string; 'odata.etag'?: string }> }>(`${this.root}/items?$select=Id,Rules&$filter=Title eq 'Configuration'&$top=2`);
    if (data.value.length === 0 && this.owner) { this.itemId = undefined; this.etag = undefined; return defaultRoleConfiguration(); }
    if (data.value.length === 0) throw new Error('This DeskPilot workspace is not ready yet. Contact your helpdesk administrator.');
    if (data.value.length !== 1) throw new Error('DeskPilot Access must contain exactly one Configuration item. Ask the site owner to repair it.');
    const item = data.value[0];
    const config = JSON.parse(item.Rules) as IRoleConfiguration;
    validateRoleConfiguration(config);
    this.itemId = item.Id; this.etag = item['@odata.etag'] || item['odata.etag'];
    return config;
  }
  public async save(configuration: IRoleConfiguration): Promise<void> {
    if (!this.owner) throw new Error('Only SharePoint site owners can manage DeskPilot roles.');
    validateRoleConfiguration(configuration);
    if (JSON.stringify(configuration).length > 60000) throw new Error('Too many role assignments for this site’s access settings.');
    if (!this.itemId) {
      const response = await this.context.spHttpClient.get(`${this.root}?$select=Id`, SPHttpClient.configurations.v1);
      if (response.status === 404) {
        await this.write(`${this.context.pageContext.web.absoluteUrl}/_api/web/lists`, { Title: 'DeskPilot Access', BaseTemplate: 100, Description: 'DeskPilot app roles. Only site owners may edit. Does not grant ticket data access.' });
      } else if (!response.ok) throw new Error('Unable to inspect DeskPilot Access.');
      // Secure configuration before writing rules. With copy=false SharePoint retains the creator's Full Control.
      await this.write(`${this.root}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`);
      const web = `${this.context.pageContext.web.absoluteUrl}/_api/web`;
      const [owners, principals, definitions] = await Promise.all([
        this.read<{ Id: number }>(`${web}/associatedownergroup?$select=Id`),
        this.read<{ value: Array<{ PrincipalId: number }> }>(`${web}/roleassignments?$select=PrincipalId`),
        this.read<{ value: Array<{ Id: number; RoleTypeKind: number }> }>(`${web}/roledefinitions?$select=Id,RoleTypeKind`)
      ]);
      const read = definitions.value.find(item => item.RoleTypeKind === 2)?.Id;
      const full = definitions.value.find(item => item.RoleTypeKind === 5)?.Id;
      if (!read || !full) throw new Error('SharePoint Read and Full Control permission levels were not found.');
      const existingAssignments = await this.read<{ value: Array<{ PrincipalId: number }> }>(`${this.root}/roleassignments?$select=PrincipalId`);
      const existingIds = new Set(existingAssignments.value.map(item => item.PrincipalId));
      for (const principal of principals.value) {
        if (existingIds.has(principal.PrincipalId) || principal.PrincipalId === owners.Id) continue;
        await this.write(`${this.root}/roleassignments/addroleassignment(principalid=${principal.PrincipalId},roledefid=${principal.PrincipalId === owners.Id ? full : read})`);
      }
      if (!existingIds.has(owners.Id)) await this.write(`${this.root}/roleassignments/addroleassignment(principalid=${owners.Id},roledefid=${full})`);
      const fields = await this.read<{ value: Array<{ InternalName: string }> }>(`${this.root}/fields?$select=InternalName&$filter=InternalName eq 'Rules'`);
      if (!fields.value.length) await this.write(`${this.root}/fields/createfieldasxml`, { parameters: { SchemaXml: '<Field Type="Note" DisplayName="Rules" Name="Rules" StaticName="Rules" RichText="FALSE" NumLines="6" />', Options: 0 } });
      await this.write(`${this.root}/fields/getbyinternalnameortitle('Title')`, { Indexed: true, EnforceUniqueValues: true }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
      // Recheck after setup to avoid overwriting another owner's initialization.
      const existing = await this.read<{ value: Array<{ Id: number }> }>(`${this.root}/items?$select=Id&$filter=Title eq 'Configuration'&$top=1`);
      if (existing.value.length) throw new Error('Access settings were initialized in another session. Reload before saving.');
      await this.grantConfigurationRead(configuration);
      await this.write(this.root + '/items', { Title: 'Configuration', Rules: JSON.stringify(configuration) });
    } else {
      if (!this.etag) throw new Error('Reload access settings before saving.');
      await this.grantConfigurationRead(configuration);
      await this.write(`${this.root}/items(${this.itemId})`, { Rules: JSON.stringify(configuration) }, { 'IF-MATCH': this.etag, 'X-HTTP-Method': 'MERGE' });
    }
    await this.load();
  }
}
