import { createRequire } from 'node:module';
import { openRepository } from '../database.mjs';
import { workspaceKey } from './provider.mjs';
const require = createRequire(import.meta.url);
const { GraphNotificationService } = require('../../../compiled/services/graph/GraphNotificationService.js');
const { GraphSlaService } = require('../../../compiled/services/graph/GraphSlaService.js');
/** SQL events are durable; the timer leases each event using rowversion before delivery. */
export async function deliverSqlEvents(repository, mail, clock = () => Date.now()) {
    let processed = 0;
    const failed = [], blocked = new Set();
    for (const row of (await repository.list('event')).sort((a, b) => a.id - b.id).slice(0, 50)) {
        if (blocked.has(row.ticket.Id))
            continue;
        if (row.state === 'processing' && Date.parse(row.leaseUntil) > clock()) {
            blocked.add(row.ticket.Id);
            continue;
        }
        let claimed;
        try {
            claimed = await repository.replace('event', row.id, { ...row, state: 'processing', leaseUntil: new Date(clock() + 10 * 60000).toISOString(), attempts: (row.attempts || 0) + 1 }, row.version);
        }
        catch {
            blocked.add(row.ticket.Id);
            continue;
        }
        try {
            await mail.changed(row.ticket, row.before, row.created);
            await repository.remove('event', row.id, claimed.version);
            processed++;
        }
        catch (error) {
            failed.push(row.id);
            blocked.add(row.ticket.Id);
            await repository.replace('event', row.id, { ...claimed, state: 'pending', leaseUntil: undefined, lastErrorType: error.name }, claimed.version);
        }
    }
    return { processed, failed };
}
export async function runSqlWorker({ config, profile, graph, appConfig, workspace, units, mailbox, sitePath, lists }) {
    const repository = await openRepository(profile, workspaceKey(config));
    await repository.health();
    const all = async () => (await repository.list('ticket')).map(({ id, version, ...row }) => ({ ...row, Id: id, ChangeVersion: version }));
    const mail = new GraphNotificationService(graph, appConfig, { email: mailbox, name: 'DeskPilot Automation' }, true, config.pageUrl, workspace.title, all, async (id) => (await units.load()).units.find(team => team.id === id)?.email || '');
    const result = await deliverSqlEvents(repository, mail);
    const sla = new GraphSlaService(graph, graph, appConfig);
    sla.onBreach = async (ticket, kind) => {
        const data = await units.load(), team = data.units.find(unit => unit.id === ticket.AssignedUnitId), lead = data.members.find(member => member.id === team?.teamLeadMemberId && member.unitId === team?.id);
        if (!lead)
            return;
        const users = lists.find(list => list.webUrl?.toLowerCase().includes('/_catalogs/users'));
        if (!users)
            throw new Error('Worker cannot resolve the team lead.');
        const person = await graph.get(sitePath + '/lists/' + users.id + '/items/' + lead.userId + '?$expand=fields');
        await mail.slaBreach(ticket, kind, String(person.fields.EMail || person.fields.Email || ''));
    };
    await sla.checkBreaches(await all());
    return result;
}
