import { ApiError } from '../../tokens.mjs';
export async function routeSqlTicket(id, { repository, units, person }) {
    const ticket = await repository.get('ticket', id);
    if (!ticket || ticket.AssignedTo)
        return 'Already assigned';
    const data = await units.load();
    if (!data.autoAssignEnabled)
        return 'Automatic assignment is off';
    const category = data.categories.find(item => item.title === ticket.Category);
    const team = data.units.find(item => item.active && item.categoryIds.includes(category?.id));
    if (!team)
        return 'No matching team';
    const members = data.members.filter(item => item.unitId === team.id && item.available).sort((a, b) => a.order - b.order || a.id - b.id);
    let chosen;
    if (team.method === 'Team lead')
        chosen = members.find(item => item.id === team.teamLeadMemberId);
    else
        for (let attempt = 0; attempt < 5; attempt++) {
            const cursor = (await repository.list('rotation', { parent: team.id }))[0];
            chosen = members[(members.findIndex(item => item.id === (cursor?.lastMemberId || team.lastMemberId)) + 1) % members.length];
            if (!chosen)
                break;
            try {
                if (cursor)
                    await repository.replace('rotation', cursor.id, { lastMemberId: chosen.id }, cursor.version);
                else
                    await repository.insert('rotation', { lastMemberId: chosen.id }, team.id);
                break;
            }
            catch (error) {
                if (attempt === 4 || (!(error instanceof ApiError) && ![2601, 2627].includes(error.number)))
                    throw error;
            }
        }
    if (!chosen)
        return 'No available agent';
    const assigned = await person(chosen.userId);
    await repository.replace('ticket', id, { ...ticket, AssignedTo: assigned, AssignedUnitId: team.id, AssignedUnit: team.title, Status: 'In Progress', StartedAt: new Date().toISOString(), Modified: new Date().toISOString() }, ticket.version);
    return 'Assigned to ' + chosen.name;
}
