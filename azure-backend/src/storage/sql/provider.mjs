import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { openRepository } from '../database.mjs';
import { BlobAttachments } from './attachments.mjs';
import { createSqlTicketService } from './tickets.mjs';
import { sqlKnowledge } from './knowledge.mjs';
import { routeSqlTicket } from './routing.mjs';
import { ApiError } from '../../tokens.mjs';
const require = createRequire(import.meta.url);
const { applyAppRoleRules } = require('../../../compiled/services/appRoleRules.js');
const { GraphNotificationService } = require('../../../compiled/services/graph/GraphNotificationService.js');
const { GraphSupportUnitsService } = require('../../../compiled/services/graph/GraphSupportUnitsService.js');
const { GraphSlaService } = require('../../../compiled/services/graph/GraphSlaService.js');
export function workspaceKey(config) { return createHash('sha256').update(config.tenantId.toLowerCase() + '|' + config.siteUrl.toLowerCase()).digest('hex'); }
export async function createSqlProvider({ config, profile, control, graph, identity, person }) {
    const repository = await openRepository(profile, workspaceKey(config));
    const attachments = new BlobAttachments(profile, workspaceKey(config));
    await repository.health();
    await attachments.health();
    const workspace = control.workspaceSettings, access = control.access, role = control.roleRules;
    let departments;
    if (workspace.departmentFolders && !access.superAdmin && role.id !== 'requester') {
        const mappings = profile.departmentGroups || {};
        const ids = Object.values(mappings);
        if (!ids.length || ids.some(id => !/^[-a-f0-9]{36}$/i.test(id)))
            throw new ApiError('Configure database department group mappings on the backend before enabling SQL.');
        const memberships = new Set();
        for (let offset = 0; offset < ids.length; offset += 20) {
            const result = await graph.post('/me/checkMemberGroups', { groupIds: ids.slice(offset, offset + 20) });
            for (const id of result.value)
                memberships.add(id.toLowerCase());
        }
        departments = workspace.departmentFolders.departments.filter(item => memberships.has(String(mappings[item.key]).toLowerCase())).flatMap(item => [item.key, item.name]);
    }
    const scope = { email: identity.email, mode: role.scope, agent: access.agent, requester: role.id === 'requester', departments };
    // Roles and workspace administration remain in SharePoint for both providers.
    const base = { access, roleRules: role, workspaceSettings: workspace, workspaceConnection: control.workspaceConnection };
    for (const name of ['getPriorities', 'getCreationOptions', 'searchUsers', 'resolveUser', 'getTeamCandidates', 'saveWorkspaceSettings'])
        if (control[name])
            base[name] = control[name].bind(control);
    for (const name of ['administration', 'sla', 'roleManagement', 'members', 'readWorkspaceResource'])
        if (control[name])
            base[name] = control[name];
    const graphConfig = { siteUrl: config.siteUrl, listName: workspace.listName, listId: workspace.listId, resourceIds: workspace.resourceIds, currentUserEmail: identity.email, currentUserName: identity.name, currentUserId: identity.userId, graphSiteScope: 'Sites.Selected' };
    const units = new GraphSupportUnitsService(graph, graphConfig);
    let source, mail;
    const route = id => routeSqlTicket(id, { repository, units, person });
    const enqueue = (ticket, before, created) => repository.insert('event', { ticket, before, created, state: 'pending', attempts: 0 }, ticket.Id);
    const result = createSqlTicketService({ repository, attachments, identity, scope, base, person, route, changed: enqueue, departments: workspace.departmentFolders?.departments });
    source = result.service;
    const readTickets = source.getTickets;
    source.getTickets = async () => ({ ...await readTickets(), ...(process.env.DESKPILOT_WORKER_ENABLED !== 'true' ? { warnings: ['Database email delivery is queued. Enable the Azure automation worker to send queued notifications.'] } : {}) });
    Object.assign(source, sqlKnowledge(repository, access.superAdmin || role.actions.includes('manageFaqs'), () => control.getFaqAccess()));
    if (access.admin)
        source.supportUnits = { ...Object.fromEntries(['load', 'createUnits', 'setAutoAssignment', 'setTeamLead', 'saveUnit', 'saveMember'].map(name => [name, units[name].bind(units)])), routeTicket: async (id) => { await result.visible(id); const before = await repository.get('ticket', id); const message = await route(id); await enqueue((await source.getTickets()).tickets.find(item => item.Id === id), { status: before.Status, assignedToId: before.AssignedTo?.Id || 0 }, false); return message; } };
    mail = new GraphNotificationService(graph, graphConfig, { email: identity.email, name: identity.name }, access.admin, config.pageUrl, workspace.title, async () => (await source.getTickets()).tickets, async (id) => (await units.load()).units.find(team => team.id === id)?.email || '');
    source.notifications = { canManage: access.admin, getSettings: () => mail.getSettings(), saveSettings: value => mail.saveSettings(value), history: () => mail.history(), inbox: () => mail.inbox(), test: (...args) => mail.test(...args), invite: (...args) => mail.invite(...args) };
    const sla = new GraphSlaService(graph, graph, graphConfig);
    sla.onBreach = async (ticket, kind) => { const data = await units.load(), team = data.units.find(item => item.id === ticket.AssignedUnitId), lead = data.members.find(item => item.id === team?.teamLeadMemberId && item.unitId === team?.id); if (lead)
        await mail.slaBreach(ticket, kind, (await person(lead.userId)).Email); };
    source.sla = sla;
    return access.superAdmin ? source : applyAppRoleRules(source, role, identity.userId, identity.email, identity.oid);
}
