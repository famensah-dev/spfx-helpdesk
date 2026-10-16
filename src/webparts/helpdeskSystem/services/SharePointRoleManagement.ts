import { SPHttpClient } from '@microsoft/sp-http';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { defaultRoleConfiguration, validateRoleConfiguration } from '../interfaces/IRoleManagement';
import type { IRoleConfiguration, IRoleManagement } from '../interfaces/IRoleManagement';

interface AccessItem { Id: number; Title: string; Rules: string; }
/** SharePoint ACLs protect configuration and each user's access projection. */
export class SharePointRoleManagement implements IRoleManagement {
  private readonly web: string;
  private readonly root: string;
  private readonly users: string;
  private itemId?: number;
  private etag?: string;
  private identity?: { user: number; owners: number; read: number; full: number };
  public constructor(private context: WebPartContext, private owner: boolean) {
    this.web = `${context.pageContext.web.absoluteUrl}/_api/web`;
    this.root = `${this.web}/lists/getbytitle('DeskPilot Access')`;
    this.users = this.root;
  }
  private async read<T>(url: string): Promise<T> {
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' } });
    if (!response.ok) throw new Error(`Unable to load DeskPilot access (${response.status}). Ask a site owner to open DeskPilot and check your assignment.`);
    return response.json();
  }
  private async write<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', 'odata-version': '', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(response.status === 412 ? 'Access settings changed in another session. Reload before saving.' : `Unable to update DeskPilot access (${response.status}). Changes may be partially applied; a site owner must reload and retry.`);
    return response.status === 204 ? undefined as T : response.json().catch(() => undefined as T);
  }
  private async info(): Promise<NonNullable<SharePointRoleManagement['identity']>> {
    if (!this.identity) {
      const [user, owners, definitions] = await Promise.all([
        this.read<{ Id: number }>(`${this.web}/currentuser?$select=Id`),
        this.read<{ Id: number }>(`${this.web}/associatedownergroup?$select=Id`),
        this.read<{ value: Array<{ Id: number; RoleTypeKind: number }> }>(`${this.web}/roledefinitions?$select=Id,RoleTypeKind`)
      ]);
      const read = definitions.value.find(item => item.RoleTypeKind === 2)?.Id;
      const full = definitions.value.find(item => item.RoleTypeKind === 5)?.Id;
      if (!read || !full) throw new Error('SharePoint Read and Full Control permission levels are required.');
      this.identity = { user: user.Id, owners: owners.Id, read, full };
    }
    return this.identity;
  }
  private async secure(path: string, userId?: number): Promise<void> {
    const info = await this.info();
    await this.write(`${path}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)`);
    // Grant administrators first, then remove every obsolete/broad grant.
    for (const principal of new Set([info.user, info.owners])) {
      await this.write(`${path}/roleassignments/addroleassignment(principalid=${principal},roledefid=${info.full})`);
    }
    const existing = await this.read<{ value: Array<{ PrincipalId: number }> }>(`${path}/roleassignments?$select=PrincipalId`);
    for (const assignment of existing.value) {
      if (assignment.PrincipalId !== info.user && assignment.PrincipalId !== info.owners) {
        await this.write(`${path}/roleassignments/getbyprincipalid(${assignment.PrincipalId})`, undefined, { 'X-HTTP-Method': 'DELETE' });
      }
    }
    if (userId && userId !== info.user && userId !== info.owners) await this.write(`${path}/roleassignments/addroleassignment(principalid=${userId},roledefid=${info.read})`);
  }
  private async ensureList(path: string, title: string): Promise<void> {
    const response = await this.context.spHttpClient.get(`${path}?$select=Id`, SPHttpClient.configurations.v1);
    if (response.status === 404) await this.write(`${this.web}/lists`, { Title: title, BaseTemplate: 100, Hidden: true, OnQuickLaunch: false });
    else if (!response.ok) throw new Error(`Unable to inspect ${title} (${response.status}).`);
    await this.secure(path);
    await this.write(path, { Hidden: true, OnQuickLaunch: false }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
    const fields = await this.read<{ value: Array<{ InternalName: string }> }>(`${path}/fields?$select=InternalName&$filter=InternalName eq 'Rules'`);
    if (!fields.value.length) await this.write(`${path}/fields/createfieldasxml`, { parameters: { SchemaXml: '<Field Type="Note" DisplayName="Rules" Name="Rules" StaticName="Rules" RichText="FALSE" />', Options: 0 } });
    await this.write(`${path}/fields/getbyinternalnameortitle('Title')`, { Indexed: true, EnforceUniqueValues: true }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
  }
  private async sync(configuration: IRoleConfiguration): Promise<void> {
    const items: AccessItem[] = [];
    let next: string | undefined = `${this.users}/items?$select=Id,Title,Rules&$filter=Title ne 'Configuration'&$top=5000`;
    while (next) {
      const page: { value: AccessItem[]; 'odata.nextLink'?: string; '@odata.nextLink'?: string } = await this.read(next);
      items.push(...page.value); next = page['odata.nextLink'] || page['@odata.nextLink'];
    }
    const active = configuration.assignments.filter(item => !item.disabled);
    // Remove revoked users before updating or granting any new assignments.
    for (const item of items) {
      if (item.Title === 'Configuration') continue;
      if (!active.some(user => String(user.userId) === item.Title)) await this.write(`${this.users}/items(${item.Id})`, undefined, { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' });
    }
    for (const user of active) {
      const role = configuration.roles.find(item => item.id === user.roleId)!;
      // Only this user's assignment and effective role; never the full configuration.
      const rules = JSON.stringify({ role, assignment: user });
      let item = items.find(value => value.Title === String(user.userId));
      if (!item) item = await this.write<AccessItem>(`${this.users}/items`, { Title: String(user.userId), Rules: rules });
      const path = `${this.users}/items(${item.Id})`;
      await this.secure(path, user.userId);
      if (item.Rules !== rules) await this.write(path, { Rules: rules }, { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' });
    }
    await this.retireLegacyList();
  }
  private async retireLegacyList(): Promise<void> {
    const legacy = `${this.web}/lists/getbytitle('DeskPilot User Access')`;
    const response = await this.context.spHttpClient.get(`${legacy}?$select=Id`, SPHttpClient.configurations.v1);
    if (response.status === 404) return;
    if (!response.ok) throw new Error('User entries were migrated, but the old access list could not be secured. Reopen DeskPilot as a site owner to retry.');
    // Preserve old data for recovery, but revoke every obsolete per-user grant.
    await this.secure(legacy);
    let next: string | undefined = `${legacy}/items?$select=Id&$top=5000`;
    while (next) {
      const page: { value: Array<{Id: number}>; 'odata.nextLink'?: string; '@odata.nextLink'?: string } = await this.read(next);
      for (const item of page.value) await this.secure(`${legacy}/items(${item.Id})`);
      next = page['odata.nextLink'] || page['@odata.nextLink'];
    }
  }
  public async load(): Promise<IRoleConfiguration> {
    if (!this.owner) {
      const user = await this.read<{ Id: number }>(`${this.web}/currentuser?$select=Id`);
      const data = await this.read<{ value: AccessItem[] }>(`${this.users}/items?$select=Id,Rules&$filter=Title eq '${user.Id}'&$top=2`);
      if (data.value.length !== 1) throw new Error('You do not have access to this DeskPilot workspace. Contact your helpdesk administrator.');
      const projection = JSON.parse(data.value[0].Rules);
      if (projection.assignment?.userId !== user.Id || projection.assignment.disabled || projection.assignment.roleId !== projection.role?.id) throw new Error('Invalid user access entry. Contact a site owner.');
      const config = defaultRoleConfiguration();
      config.roles = config.roles.map(role => role.id === projection.role.id ? projection.role : role);
      config.assignments = [projection.assignment]; validateRoleConfiguration(config);
      return config;
    }
    const response = await this.context.spHttpClient.get(`${this.root}?$select=Id`, SPHttpClient.configurations.v1);
    if (response.status === 404) return defaultRoleConfiguration();
    if (!response.ok) throw new Error('Unable to load private DeskPilot configuration.');
    const fields = await this.read<{ value: Array<{ InternalName: string }> }>(`${this.root}/fields?$select=InternalName&$filter=InternalName eq 'Rules'`);
    if (!fields.value.length) return defaultRoleConfiguration();
    const data = await this.read<{ value: Array<AccessItem & { 'odata.etag'?: string; '@odata.etag'?: string }> }>(`${this.root}/items?$select=Id,Rules&$filter=Title eq 'Configuration'&$top=2`);
    if (!data.value.length) return defaultRoleConfiguration();
    if (data.value.length !== 1) throw new Error('DeskPilot Access must contain exactly one Configuration item.');
    const item = data.value[0]; const config = JSON.parse(item.Rules) as IRoleConfiguration; validateRoleConfiguration(config);
    this.itemId = item.Id; this.etag = item['odata.etag'] || item['@odata.etag'];
    // Migration and repair: close old configuration grants first, then provision private rows.
    await this.ensureList(this.root, 'DeskPilot Access');
    await this.secure(`${this.root}/items(${item.Id})`);
    await this.sync(config);
    return config;
  }
  public async save(configuration: IRoleConfiguration): Promise<void> {
    if (!this.owner) throw new Error('Only SharePoint site owners can manage DeskPilot roles.');
    validateRoleConfiguration(configuration);
    if (JSON.stringify(configuration).length > 60000) throw new Error('Too many user assignments.');
    await this.ensureList(this.root, 'DeskPilot Access');
    if (this.itemId) {
      if (!this.etag) throw new Error('Reload access settings before saving.');
      await this.write(`${this.root}/items(${this.itemId})`, { Rules: JSON.stringify(configuration) }, { 'IF-MATCH': this.etag, 'X-HTTP-Method': 'MERGE' });
    } else {
      const item = await this.write<AccessItem>(`${this.root}/items`, { Title: 'Configuration', Rules: JSON.stringify(configuration) });
      this.itemId = item.Id;
    }
    await this.secure(`${this.root}/items(${this.itemId})`);
    await this.sync(configuration);
    const saved = await this.read<{ 'odata.etag'?: string; '@odata.etag'?: string }>(`${this.root}/items(${this.itemId})`);
    this.etag = saved['odata.etag'] || saved['@odata.etag'];
  }
}
