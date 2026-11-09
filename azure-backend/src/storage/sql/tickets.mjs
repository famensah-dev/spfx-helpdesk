import { ApiError } from '../../tokens.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { safeDescriptionHtml } = require('../../../compiled/components/RichTextEditor.js');
const statuses = ['New', 'In Progress', 'Pending', 'Resolved', 'Closed'];
const now = () => new Date().toISOString();
function clean(row) { if (!row)
    return undefined; const { id, version, ...value } = row; return { ...value, Id: id, ChangeVersion: version }; }
export function createSqlTicketService({ repository, attachments, identity, scope, base, person, changed, route, departments }) {
    const actor = { Id: identity.userId, AadId: identity.oid, Title: identity.name, Email: identity.email };
    const visible = async (id) => { if (!Number.isSafeInteger(id) || id < 1)
        throw new ApiError('Invalid ticket ID.', 400); const value = (await repository.list('ticket', { scope, id }))[0]; if (!value)
        throw new ApiError('Ticket not found or access denied.', 404); return value; };
    const history = async (id, action) => repository.insert('history', { modified: now(), author: identity.name, action }, id);
    const update = async (id, input) => {
        const before = await visible(id);
        if (input.ChangeVersion && input.ChangeVersion !== before.version)
            throw new ApiError('This ticket changed. Refresh and retry.', 409);
        const next = { ...before, ...input, Modified: now() };
        delete next.id;
        delete next.version;
        delete next.ChangeVersion;
        if (next.Status !== before.Status) {
            if (!statuses.includes(next.Status))
                throw new ApiError('Invalid ticket status.', 400);
            if (next.Status === 'Resolved' || next.Status === 'Closed')
                next.ResolvedAt = next.ResolvedAt || now();
            else
                next.ResolvedAt = null;
            next.ClosedAt = next.Status === 'Closed' ? now() : undefined;
            if (next.Status === 'In Progress')
                next.StartedAt = next.StartedAt || now();
            const pending = before.SlaPauseIntervals || [];
            next.SlaPauseIntervals = before.Status === 'Pending' ? pending.map(interval => interval.end ? interval : { ...interval, end: now() }) : pending;
            if (next.Status === 'Pending')
                next.SlaPauseIntervals = [...next.SlaPauseIntervals, { start: now() }];
        }
        const saved = await repository.replace('ticket', id, next, before.version);
        await history(id, 'Updated ticket');
        await changed(clean(saved), { status: before.Status, assignedToId: before.AssignedTo?.Id || 0 }, false);
        return saved;
    };
    const upload = async (id, files, commentId) => {
        await visible(id);
        if (!Array.isArray(files) || files.length > 10)
            throw new ApiError('Select up to ten attachments.', 400);
        if (commentId) {
            const comment = await repository.get('comment', Number(commentId));
            if (!comment || comment.ticketId !== id || comment.owner !== identity.oid)
                throw new ApiError('Only the comment author can attach files.');
        }
        for (const file of files) {
            const stored = await attachments.upload(id, file);
            try {
                await repository.insert('attachment', { ...stored, author: identity.name, commentId: commentId ? String(commentId) : undefined }, id);
            }
            catch (error) {
                await attachments.remove(stored);
                throw error;
            }
        }
        await history(id, 'Added attachment');
    };
    const service = {
        ...base,
        getTickets: async () => ({ tickets: (await repository.list('ticket', { scope })).map(clean), sourceLabel: repository.sourceLabel || 'Azure SQL', isMockData: false, hasResolvedAt: true, hasCategory: true, hasDueDate: true, hasEscalated: false, hasPending: true, assignmentIdentityAvailable: true }),
        createTicket: async (input) => {
            if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255 || typeof input.description !== 'string' || input.description.length > 1000000)
                throw new ApiError('Enter a ticket title and valid description.', 400);
            if (departments && !departments.some(item => item.key === input.department || item.name === input.department))
                throw new ApiError('Choose a configured department.', 400);
            if (scope.departments && input.department && !scope.departments.includes(input.department) && !scope.requester)
                throw new ApiError('This department is outside your access.');
            if (input.assignedToId && !base.roleRules.actions.includes('assign'))
                throw new ApiError('Your role cannot assign tickets.');
            const priorities = await service.getPriorities();
            if (!priorities.includes(input.priority))
                throw new ApiError('Choose a configured priority.', 400);
            const assignee = input.assignedToId ? await person(input.assignedToId) : undefined;
            let requester = actor;
            if (input.requesterEmail && input.requesterEmail.toLowerCase() !== identity.email.toLowerCase()) {
                if (!base.access.admin && !base.access.agent)
                    throw new ApiError('You can submit only your own requests.');
                requester = { Title: input.requesterName || input.requesterEmail, Email: input.requesterEmail };
            }
            const row = await repository.insert('ticket', { Title: input.title.trim(), Description: input.description, Priority: input.priority, Status: assignee ? 'In Progress' : 'New', AssignedTo: assignee, Requester: requester, RequesterEmail: requester.Email, CreatedBy: actor, Created: now(), Modified: now(), Category: input.category, Subcategory: input.subcategory, IssueType: input.issueType, TicketType: input.ticketType, Department: input.department, TicketSource: input.ticketSource || 'DeskPilot', DueDate: input.dueDate, Archived: false, HasResponseTracking: true, HasResolutionTracking: true, FirstRespondedAt: null, ResolvedAt: null, SlaPauseIntervals: [] });
            try {
                if (input.attachments?.length)
                    await upload(row.id, input.attachments);
                await history(row.id, 'Created ticket');
                await route?.(row.id);
                await changed(clean(await repository.get('ticket', row.id)), undefined, true);
            }
            catch (error) {
                error.createdTicketId = row.id;
                throw error;
            }
        },
        updateTicket: async (id, input) => {
            if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 255 || !statuses.includes(input.status))
                throw new ApiError('Invalid ticket fields.', 400);
            if (!(await service.getPriorities()).includes(input.priority))
                throw new ApiError('Choose a configured priority.', 400);
            const before = await visible(id);
            if (input.department !== undefined && departments && !departments.some(item => item.key === input.department || item.name === input.department))
                throw new ApiError('Choose a configured department.', 400);
            if (input.department !== undefined && scope.departments && !scope.departments.includes(input.department))
                throw new ApiError('This department is outside your access.');
            const assigned = Boolean(input.assignedToId);
            const status = assigned && (input.status === 'New' || input.assignedToId !== before.AssignedTo?.Id) ? 'In Progress' : input.status;
            const value = { Title: input.title, Priority: input.priority, Status: status, AssignedTo: assigned ? await person(input.assignedToId) : undefined };
            for (const [key, field] of Object.entries({ description: 'Description', requesterEmail: 'RequesterEmail', dueDate: 'DueDate', department: 'Department', ticketSource: 'TicketSource', resolutionSummary: 'ResolutionSummary', category: 'Category', subcategory: 'Subcategory', issueType: 'IssueType', ticketType: 'TicketType' }))
                if (input[key] !== undefined)
                    value[field] = input[key];
            if (input.requestedById)
                value.Requester = await person(input.requestedById);
            else if (input.requesterName !== undefined || input.requesterEmail !== undefined)
                value.Requester = { ...before.Requester, Title: input.requesterName ?? before.Requester?.Title, Email: input.requesterEmail ?? before.Requester?.Email };
            if (value.Requester)
                value.RequesterEmail = value.Requester.Email;
            await update(id, { ...value, ChangeVersion: input.changeVersion });
        },
        updateTickets: async (ids, action) => {
            const result = { succeeded: [], failed: [] };
            for (const id of ids) {
                try {
                    const row = await visible(id);
                    let patch;
                    if (action.kind === 'status')
                        patch = { Status: action.status };
                    else if (action.kind === 'archive')
                        patch = { Archived: action.archived !== false };
                    else if (action.kind === 'assign')
                        patch = { AssignedTo: action.userId ? await person(action.userId) : undefined, ...(action.userId ? { Status: 'In Progress' } : {}) };
                    else if (action.kind === 'priority' && (await service.getPriorities()).includes(action.priority))
                        patch = { Priority: action.priority };
                    else
                        throw new ApiError('Invalid bulk action.', 400);
                    await update(id, { ...patch, ChangeVersion: row.version });
                    result.succeeded.push(id);
                }
                catch (error) {
                    result.failed.push({ id, message: error.message });
                }
            }
            return result;
        },
        getAttachments: async (id) => { await visible(id); return Promise.all((await repository.list('attachment', { parent: id })).map(file => attachments.link(file))); },
        uploadAttachments: upload,
        uploadCommentAttachments: (id, commentId, files) => upload(id, files, commentId),
        getComments: async (id) => { await visible(id); const files = await repository.list('attachment', { parent: id }); return Promise.all((await repository.list('comment', { parent: id })).map(async (row) => ({ id: String(row.id), text: row.text, html: row.html, author: row.author, created: row.created, attachments: await Promise.all(files.filter(file => file.commentId === String(row.id)).map(file => attachments.link(file))) }))); },
        addComment: async (id, text, options) => {
            await visible(id);
            if (typeof text !== 'string' || text.length > 100000 || (!text.trim() && !options?.files?.length))
                throw new ApiError('Enter a comment.', 400);
            if (options?.requestId && (typeof options.requestId !== 'string' || options.requestId.length > 128))
                throw new ApiError('Invalid comment request ID.', 400);
            const previous = options?.requestId ? (await repository.list('comment', { parent: id })).find(row => row.owner === identity.oid && row.requestId === options.requestId) : undefined;
            const comment = previous || await repository.insert('comment', { ticketId: id, text, html: options?.html ? safeDescriptionHtml(options.html) : undefined, requestId: options?.requestId, author: identity.name, owner: identity.oid, created: now() }, id);
            if (options?.files?.length)
                await upload(id, options.files, String(comment.id));
            await history(id, 'Added comment');
        },
        getHistory: async (id) => { await visible(id); return (await repository.list('history', { parent: id })).map(row => ({ ...row, id: String(row.id) })); },
        recordFirstResponse: async (id) => { const row = await visible(id); if (!row.FirstRespondedAt)
            await update(id, { FirstRespondedAt: now() }); },
        markCommentAsSolution: async (id, commentId, replace) => { const row = await visible(id), comment = await repository.get('comment', Number(commentId)); if (comment?.ticketId !== id)
            throw new ApiError('Comment not found.', 404); if (row.SolutionCommentId && !replace)
            throw new ApiError('A solution is already selected.', 409); await update(id, { SolutionCommentId: String(commentId), ResolutionSummary: comment.text }); },
        ticketViews: { getOpened: async (ids) => { const rows = await repository.list('view', { owner: identity.oid }); return rows.map(row => row.ticketId).filter(id => ids.includes(id)); }, markOpened: async (id) => { await visible(id); if (!(await repository.list('view', { owner: identity.oid })).some(row => row.ticketId === id))
                await repository.insert('view', { ticketId: id }, id, identity.oid); } },
    };
    if (base.access.superAdmin)
        service.deleteArchivedTickets = async (ids) => { const result = { succeeded: [], failed: [] }; for (const id of ids)
            try {
                const row = await visible(id);
                if (!row.Archived)
                    throw new ApiError('Only archived tickets can be deleted.');
                for (const kind of ['attachment', 'comment', 'history', 'view', 'event'])
                    for (const child of await repository.list(kind, { parent: id })) {
                        if (kind === 'attachment')
                            await attachments.remove(child);
                        await repository.remove(kind, child.id, child.version);
                    }
                await repository.remove('ticket', id, row.version);
                result.succeeded.push(id);
            }
            catch (error) {
                result.failed.push({ id, message: error.message });
            } return result; };
    return { service, update, visible };
}
