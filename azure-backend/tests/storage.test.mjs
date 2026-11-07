import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createSqlTicketService } from '../src/storage/sql/tickets.mjs';
import { SqlRepository } from '../src/storage/sql/repository.mjs';
import { sqlKnowledge } from '../src/storage/sql/knowledge.mjs';
import { routeSqlTicket } from '../src/storage/sql/routing.mjs';
import { deliverSqlEvents } from '../src/storage/sql/worker.mjs';
import { storageProfiles, selectProfile } from '../src/storage/profiles.mjs';
import { dispatch, metadata } from '../src/dispatch.mjs';
import { ApiError } from '../src/tokens.mjs';
import { createStorageManagement } from '../src/storage/management.mjs';
const require = createRequire(import.meta.url);
const { applyAppRoleRules } = require('../compiled/services/appRoleRules.js');
const { defaultRoleConfiguration } = require('../compiled/interfaces/IRoleManagement.js');
class MemoryRepository {
    constructor() { this.rows = []; this.next = 1; }
    async list(kind, { id, parent, owner, scope } = {}) {
        return this.rows.filter(row => row.kind === kind && (id === undefined || row.id === id) && (parent === undefined || row.parent === parent) && (owner === undefined || row.ownerIndex === owner)).filter(row => {
            if (!scope)
                return true;
            const email = scope.email.toLowerCase(), own = row.Requester?.Email?.toLowerCase() === email, created = row.CreatedBy?.Email?.toLowerCase() === email, assigned = row.AssignedTo?.Email?.toLowerCase() === email;
            return (scope.mode === 'all' || scope.mode === 'own' && own || scope.mode === 'assigned' && (assigned || scope.agent && (own || created))) && (!scope.departments || own || created || scope.departments.includes(row.Department));
        }).map(row => structuredClone(row));
    }
    async get(kind, id) { return (await this.list(kind, { id }))[0]; }
    async insert(kind, value, parent = 0, owner = '') { const row = { ...structuredClone(value), kind, parent, ownerIndex: owner, id: this.next++, version: '0000000000000001' }; this.rows.push(row); return structuredClone(row); }
    async replace(kind, id, value, version) { const index = this.rows.findIndex(row => row.kind === kind && row.id === id); if (index < 0 || this.rows[index].version !== version)
        throw new ApiError('This item changed.', 409); const row = { ...structuredClone(value), kind, id, parent: this.rows[index].parent, ownerIndex: this.rows[index].ownerIndex, version: (BigInt('0x' + version) + 1n).toString(16).padStart(16, '0') }; this.rows[index] = row; return structuredClone(row); }
    async remove(kind, id, version) { const row = await this.get(kind, id); if (row?.version !== version)
        throw new ApiError('This item changed.', 409); this.rows = this.rows.filter(row => row.kind !== kind || row.id !== id); }
}
const actor = { userId: 7, oid: 'actor', email: 'agent@example.com', name: 'Agent' };
function fixture(roleId = 'agent') {
    const repository = new MemoryRepository(), events = [];
    const role = defaultRoleConfiguration().roles.find(row => row.id === roleId);
    const raw = createSqlTicketService({ repository, identity: actor, scope: { mode: role.scope, agent: roleId === 'agent', email: actor.email }, attachments: { upload: async (id, file) => ({ key: id + '/' + file.name, name: file.name }), link: async (row) => ({ name: row.name, url: 'https://private.example/file' }), remove: async () => { } }, base: { access: { agent: roleId === 'agent', admin: roleId === 'admin' }, roleRules: role, getPriorities: async () => ['Low', 'Medium'] }, person: async (id) => ({ Id: id, Email: id === 7 ? actor.email : 'other@example.com' }), changed: async (...args) => events.push(args) });
    return { repository, events, raw, service: applyAppRoleRules(raw.service, role, actor.userId, actor.email, actor.oid) };
}
test('SQL role scopes include agent submissions but forbid management of another agent assignment', async () => {
    const { repository, service } = fixture();
    const own = await repository.insert('ticket', { Title: 'Own', Priority: 'Low', Status: 'New', Requester: { Id: 7, Email: actor.email }, AssignedTo: { Id: 8, Email: 'other@example.com' }, CreatedBy: { Id: 7, Email: actor.email } });
    const hidden = await repository.insert('ticket', { Title: 'Other', Priority: 'Low', Status: 'New', Requester: { Id: 9, Email: 'staff@example.com' } });
    assert.deepEqual((await service.getTickets()).tickets.map(row => row.Id), [own.id]);
    await service.updateTicket(own.id, { title: 'Own', priority: 'Low', status: 'Resolved', assignedToId: 8 });
    assert.equal((await repository.get('ticket', own.id)).Status, 'Resolved');
    await assert.rejects(service.updateTicket(own.id, { title: 'Changed', priority: 'Low', status: 'Resolved', assignedToId: 8 }), /Only tickets assigned/);
    await assert.rejects(service.addComment(hidden.id, 'Attempted access'), /outside/);
    await assert.rejects(service.getAttachments(hidden.id), /outside/);
});
test('SQL creation persists identities, attachments, and creation event; stale edits are rejected', async () => {
    const { repository, service, events } = fixture('admin');
    await service.createTicket({ title: 'Test', description: 'Details', priority: 'Medium', assignedToId: 7, attachments: [{ name: 'example.pdf', size: 100 }] });
    const ticket = (await service.getTickets()).tickets[0];
    assert.equal(ticket.Status, 'In Progress');
    assert.equal(ticket.CreatedBy.Email, actor.email);
    assert.equal((await service.getAttachments(ticket.Id))[0].name, 'example.pdf');
    assert.equal(events[0][2], true);
    await service.updateTicket(ticket.Id, { title: 'Test', priority: 'Low', status: 'In Progress', assignedToId: 7, changeVersion: ticket.ChangeVersion });
    await assert.rejects(service.updateTicket(ticket.Id, { title: 'Test', priority: 'Low', status: 'In Progress', assignedToId: 7, changeVersion: ticket.ChangeVersion }), /changed/);
    assert.equal((await repository.list('ticket')).length, 1);
});
test('SQL requester cannot read or comment on someone else ticket or assign on create', async () => {
    const { repository, service } = fixture('requester');
    const other = await repository.insert('ticket', { Title: 'Other', Requester: { Email: 'other@example.com' } });
    await assert.rejects(service.getComments(other.id), /outside/);
    await assert.rejects(service.createTicket({ title: 'Test', description: '', priority: 'Low', assignedToId: 7 }), /assign/);
    await service.createTicket({ title: 'Test', description: '', priority: 'Low' });
    assert.equal((await service.getTickets()).tickets.length, 1);
});
test('SQL Knowledge Base hides drafts and prevents unauthorized writes', async () => {
    const repository = new MemoryRepository();
    await repository.insert('article', { question: 'Draft', answer: 'Private', published: false, sortOrder: 0 });
    await repository.insert('article', { question: 'Published', answer: 'Public', published: true, sortOrder: 0 });
    const service = sqlKnowledge(repository, false, async () => ({}));
    assert.deepEqual((await service.getFaqs()).map(row => row.question), ['Published']);
    await assert.rejects(service.getFaqs(true), /management/);
    await assert.rejects(service.deleteFaq(1), /management/);
});
test('SQL routing rotates available members and makes assigned tickets In Progress', async () => {
    const repository = new MemoryRepository();
    const data = { autoAssignEnabled: true, categories: [{ id: 1, title: 'Network' }], units: [{ id: 2, title: 'IT', active: true, categoryIds: [1], method: 'Round robin', lastMemberId: 0 }], members: [{ id: 3, unitId: 2, userId: 7, name: 'First', available: true, order: 0 }, { id: 4, unitId: 2, userId: 8, name: 'Second', available: true, order: 1 }] };
    for (const expected of [7, 8, 7]) {
        const ticket = await repository.insert('ticket', { Category: 'Network', Status: 'New' });
        await routeSqlTicket(ticket.id, { repository, units: { load: async () => data }, person: async (id) => ({ Id: id }) });
        const saved = await repository.get('ticket', ticket.id);
        assert.equal(saved.Status, 'In Progress');
        assert.equal(saved.AssignedTo.Id, expected);
    }
});
test('SQL email queue preserves event order, retries failures, and skips live leases', async () => {
    const repository = new MemoryRepository(), delivered = [];
    let fail = true;
    for (const ticket of [{ Id: 1 }, { Id: 1 }, { Id: 2 }])
        await repository.insert('event', { ticket, state: 'pending' }, ticket.Id);
    const mail = { changed: async (ticket) => { if (ticket.Id === 1 && fail)
            throw new Error('Mail unavailable'); delivered.push(ticket.Id); } };
    const first = await deliverSqlEvents(repository, mail);
    assert.equal(first.failed.length, 1);
    assert.deepEqual(delivered, [2]);
    fail = false;
    await deliverSqlEvents(repository, mail);
    assert.deepEqual(delivered, [2, 1, 1]);
    assert.equal((await repository.list('event')).length, 0);
    await repository.insert('event', { ticket: { Id: 1 }, state: 'processing', leaseUntil: new Date(Date.now() + 600000).toISOString() });
    await deliverSqlEvents(repository, mail);
    assert.equal(delivered.length, 3);
});
test('SQL queries bind workspace, identity, and departments as parameters', async () => {
    const calls = [];
    let query;
    const pool = { request() { return { input(name, type, value) { calls.push([name, value]); return this; }, async query(value) { query = value; return { recordset: [] }; } }; } };
    await new SqlRepository(pool, 'workspace-a').list('ticket', { id: 9, scope: { email: "agent'@example.com", mode: 'assigned', agent: true, departments: ['IT'] } });
    assert(query.includes('WorkspaceId=@workspace'));
    assert(query.includes('AssignedEmail'));
    assert(query.includes('OPENJSON(@departments)'));
    assert(!query.includes("agent'"));
    assert.deepEqual(calls.find(row => row[0] === 'workspace'), ['workspace', 'workspace-a']);
});
test('storage configuration rejects unknown profiles and RPC denies non-admin provider changes', async () => {
    assert.deepEqual(storageProfiles({}), []);
    assert.throws(() => selectProfile([], 'missing'), /not configured/);
    assert.throws(() => storageProfiles({ DESKPILOT_SQL_PROFILES: '[{"id":"invalid"}]' }), /Invalid/);
    let saved = false;
    const service = { access: { superAdmin: false }, storageManagement: { save: async () => { saved = true; } } };
    assert(metadata(service).capabilities.includes('storageManagement.save'));
    await assert.rejects(dispatch({ service }, 'storageManagement.save', [{ provider: 'sql' }]), /Super Admin/);
    assert.equal(saved, false);
});
test('storage selection protects existing data, keeps secrets server-side, and binds only once', async () => {
    let configuration = { workspace: { title: 'Helpdesk', listName: 'Tickets', listId: '' } }, tickets = [{ Id: 1 }], saved = 0;
    const control = { access: { superAdmin: true }, workspaceSettings: configuration.workspace, roleManagement: { load: async () => structuredClone(configuration), save: async (value) => { configuration = value; saved++; } }, getTickets: async () => ({ tickets }), getFaqs: async () => [] };
    const profile = { id: 'main', name: 'Primary Database', sql: { password: 'never-serialize' }, blobConnectionString: 'secret' };
    const management = createStorageManagement({ control, profiles: [profile], openDatabase: async () => ({ repository: { health: async () => { }, list: async () => [] }, attachments: { health: async () => { } } }) });
    assert(!JSON.stringify(await management.get()).includes('never-serialize'));
    assert(!JSON.stringify(await management.get()).includes('blobConnectionString'));
    await assert.rejects(management.save({ provider: 'sql', connectionId: 'main' }), /already contains/);
    assert.equal(saved, 0);
    tickets = [];
    await assert.rejects(control.roleManagement.save({ workspace: { ...configuration.workspace, storage: { provider: 'sql', connectionId: 'main' } } }), /Data Storage/);
    await management.save({ provider: 'sql', connectionId: 'main' });
    assert.equal(configuration.workspace.storage.provider, 'sql');
    assert.equal(configuration.workspace.storage.locked, true);
    await assert.rejects(management.save({ provider: 'sharepoint' }), /already bound/);
});
