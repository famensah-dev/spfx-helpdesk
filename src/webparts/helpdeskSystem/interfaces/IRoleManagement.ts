export const roleActions = ['dashboard', 'tickets', 'faqs', 'create', 'edit', 'status', 'assign', 'priority', 'archive', 'comment', 'manageFaqs', 'classifications', 'sla'] as const;
export type RoleAction = typeof roleActions[number];
export type TicketScope = 'own' | 'assigned' | 'all';
export interface IDeskPilotRole { id: string; name: string; scope: TicketScope; actions: RoleAction[]; }
export interface IRoleAssignment { userId: number; name: string; email: string; roleId: string; department?: string; addedAt?: string; disabled?: boolean; }
export interface IRoleConfiguration { roles: IDeskPilotRole[]; assignments: IRoleAssignment[]; }
export interface IRoleManagement { load(): Promise<IRoleConfiguration>; save(configuration: IRoleConfiguration): Promise<void>; }
export function assignedRole(configuration: IRoleConfiguration, userId: number): IDeskPilotRole | undefined {
  const assignment = configuration.assignments.find(item => item.userId === userId && item.disabled !== true);
  return assignment ? configuration.roles.find(role => role.id === assignment.roleId) : undefined;
}
export const defaultRoleConfiguration = (): IRoleConfiguration => ({ roles: [
  { id: 'agent', name: 'Agent', scope: 'assigned', actions: ['dashboard', 'tickets', 'faqs', 'create', 'edit', 'status', 'comment'] },
  { id: 'admin', name: 'Helpdesk Admin', scope: 'all', actions: [...roleActions] }
], assignments: [] });

export function validateRoleConfiguration(value: IRoleConfiguration): void {
  const ids = ['agent', 'admin'];
  if (!value || !Array.isArray(value.roles) || value.roles.length !== 2 || !Array.isArray(value.assignments)) throw new Error('Invalid role configuration.');
  if (new Set(value.roles.map(role => role.id)).size !== 2) throw new Error('Duplicate roles.');
  for (const role of value.roles) {
    if (!ids.includes(role.id) || !role.name || !['own', 'assigned', 'all'].includes(role.scope) || !Array.isArray(role.actions) || role.actions.some(action => !roleActions.includes(action))) throw new Error('Invalid role rules.');
    if (role.actions.includes('manageFaqs') && !role.actions.includes('faqs')) throw new Error(`${role.name}: enable the FAQs page before enabling FAQ management.`);
  }
  if (new Set(value.assignments.map(item => item.userId)).size !== value.assignments.length || value.assignments.some(item => !Number.isInteger(item.userId) || item.userId < 1 || !item.email || !ids.includes(item.roleId))) throw new Error('Invalid user assignments.');
  for (const item of value.assignments) {
    const user = item.name || item.email;
    if (item.disabled !== undefined && typeof item.disabled !== 'boolean') throw new Error(`The access status for ${user} is invalid. Reload users and try again.`);
    if (item.department !== undefined && item.department !== null && typeof item.department !== 'string') throw new Error(`The department for ${user} is invalid. Remove this selection and search for the user again.`);
    if (item.addedAt !== undefined && (typeof item.addedAt !== 'string' || !Number.isFinite(Date.parse(item.addedAt)))) throw new Error(`The date added for ${user} is invalid. Reload users and try again.`);
  }
}
