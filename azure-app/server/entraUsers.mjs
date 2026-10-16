import {AccessError} from './authorization.mjs';
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const roleValues = {admin: 'DeskPilot.HelpdeskAdmin', agent: 'DeskPilot.HelpdeskAgent', superAdmin: 'DeskPilot.SuperAdmin'};
const changesInFlight = new Map();
export class EntraUsers {
  constructor(graph, clientId, audit) {
    if (!guid.test(clientId)) throw new Error('Invalid DeskPilot application ID.');
    this.graph = graph; this.clientId = clientId; this.audit = audit;
  }
  async context() {
    let app;
    try {app = await this.graph.get(`/servicePrincipals(appId='${this.clientId}')?$select=id,appId,appRoles`);} catch (error) {throw new Error(`Unable to read the DeskPilot enterprise application. Verify Microsoft Graph delegated Application.Read.All admin consent. ${error.message}`);}
    if (app.appId?.toLowerCase() !== this.clientId.toLowerCase() || !guid.test(app.id || '')) throw new AccessError('DeskPilot enterprise application identity could not be verified.');
    return {app, path: `/servicePrincipals/${app.id}`};
  }
  async assignments(context) {
    try {return await this.graph.getAll(`${context.path}/appRoleAssignedTo?$select=id,principalId,principalDisplayName,principalType,appRoleId,resourceId&$top=100`);} catch (error) {throw new Error(`Unable to read DeskPilot user assignments. Verify delegated Application.Read.All admin consent. ${error.message}`);}
  }
  requireSuper(access) {if (!access.superAdmin) throw new AccessError('Only DeskPilot Super Admin can manage Entra app assignments.');}
  async list(access) {
    this.requireSuper(access);
    const context = await this.context(); const assignments = await this.assignments(context);
    const users = new Map();
    for (const assignment of assignments) {
      if (assignment.principalType !== 'User' || assignment.resourceId.toLowerCase() !== context.app.id.toLowerCase()) continue;
      const role = context.app.appRoles.find(role => role.id === assignment.appRoleId);
      const key = Object.keys(roleValues).find(key => roleValues[key] === role?.value) || 'other';
      let user = users.get(assignment.principalId);
      if (!user) {user = {id: assignment.principalId, name: assignment.principalDisplayName || 'Organization user', email: '', role: key, roles: [], protected: false}; users.set(user.id, user);}
      user.roles.push(role?.displayName || 'Default / other access');
      if (key === 'superAdmin') {user.role = key; user.protected = true;}
      else if (key === 'admin' && !user.protected) user.role = key;
      else if (key === 'agent' && user.role === 'other') user.role = key;
    }
    // Bounded lookup batches avoid one unbounded request per assignment.
    const rows = [...users.values()];
    for (let start = 0; start < rows.length; start += 6) await Promise.all(rows.slice(start, start + 6).map(async row => {
      const user = await this.graph.get(`/users/${encodeURIComponent(row.id)}?$select=id,displayName,mail,userPrincipalName`);
      row.name = user.displayName || row.name; row.email = user.mail || user.userPrincipalName || '';
    }));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  async change(access, input, remove = false) {
    this.requireSuper(access);
    if (!guid.test(input?.id || '')) throw new AccessError('Select an existing organization user.', 400);
    const key = `${this.clientId}:${input.id.toLowerCase()}`;
    const previous = changesInFlight.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => this.performChange(access, input, remove));
    changesInFlight.set(key, pending);
    try {return await pending;} finally {if (changesInFlight.get(key) === pending) changesInFlight.delete(key);}
  }
  async performChange(access, input, remove = false) {
    this.requireSuper(access);
    if (!guid.test(input?.id || '') || !['agent', 'admin'].includes(input.role)) throw new AccessError('Select an existing user and a Helpdesk Admin or Agent role.', 400);
    if (input.id.toLowerCase() === access.oid.toLowerCase()) throw new AccessError('Your own app assignments must be managed directly in Entra.');
    const context = await this.context();
    const actorAssignments = await this.assignments(context);
    const superIds = context.app.appRoles.filter(role => role.value === roleValues.superAdmin).map(role => role.id);
    if (!actorAssignments.some(assignment => assignment.principalType === 'User' && assignment.principalId.toLowerCase() === access.oid.toLowerCase() && assignment.resourceId.toLowerCase() === context.app.id.toLowerCase() && superIds.includes(assignment.appRoleId))) throw new AccessError('A current direct DeskPilot Super Admin assignment is required.');
    const user = await this.graph.get(`/users/${input.id}?$select=id,displayName`);
    if (user.id.toLowerCase() !== input.id.toLowerCase()) throw new AccessError('User identity mismatch.');
    const current = actorAssignments.filter(assignment => assignment.principalType === 'User' && assignment.principalId.toLowerCase() === user.id.toLowerCase() && assignment.resourceId.toLowerCase() === context.app.id.toLowerCase());
    if (current.some(assignment => superIds.includes(assignment.appRoleId))) throw new AccessError('Super Admin users and their assignments must be managed directly in Entra.');
    const managedIds = context.app.appRoles.filter(role => ['admin', 'agent'].some(key => roleValues[key] === role.value)).map(role => role.id);
    const definitions = context.app.appRoles.filter(role => role.value === roleValues[input.role] && role.isEnabled && role.allowedMemberTypes?.includes('User'));
    if (!remove && definitions.length !== 1) throw new AccessError('The selected DeskPilot role is missing, disabled, or ambiguous. Check App registrations > App roles.');
    const desired = definitions[0]?.id;
    const changes = current.filter(assignment => managedIds.includes(assignment.appRoleId) && (remove || assignment.appRoleId !== desired));
    const record = {actorId: access.oid, targetUserId: user.id, applicationId: this.clientId, resourceId: context.app.id, action: remove ? 'remove-app-access' : 'assign-app-role', requestedRole: input.role};
    await this.audit({...record, outcome: 'attempt'}); // Fail closed if audit storage cannot accept the attempt.
    let mutations = 0;
    try {
      // Remove the old managed role before adding a replacement. Failed downgrades must not silently retain admin access.
      for (const assignment of changes) {await this.graph.delete(`${context.path}/appRoleAssignedTo/${encodeURIComponent(assignment.id)}`); mutations++;}
      if (!remove && !current.some(assignment => assignment.appRoleId === desired)) {await this.graph.post(`${context.path}/appRoleAssignedTo`, {principalId: user.id, resourceId: context.app.id, appRoleId: desired}); mutations++;}
      await this.audit({...record, outcome: 'succeeded', mutations});
    } catch (error) {
      await this.audit({...record, outcome: mutations ? 'partial' : 'failed', mutations});
      throw new Error(`${mutations ? 'Some Entra assignments changed; refresh before retrying. ' : ''}Entra role update failed. ${error.message} Verify delegated AppRoleAssignment.ReadWrite.All and Application.Read.All consent and a supported Entra administrator role for the signed-in operator.`);
    }
  }
}
