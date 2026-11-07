import { ApiError } from '../tokens.mjs';
import { selectProfile, requireDepartmentMappings } from './profiles.mjs';
/** The provider binding is a control-plane setting, never a client-supplied database address. */
export function createStorageManagement({ control, profiles, openDatabase }) {
    const roles = control.roleManagement, saveRoles = roles.save.bind(roles);
    const initial = control.workspaceSettings?.storage;
    roles.save = async (value) => {
        if (JSON.stringify(value.workspace?.storage) !== JSON.stringify(initial))
            throw new ApiError('Use Data Storage settings to change providers.', 400);
        return saveRoles(value);
    };
    const requireOwner = () => { if (!control.access?.superAdmin)
        throw new ApiError('Super Admin access is required.'); };
    return {
        get: async () => { requireOwner(); const selected = (await roles.load()).workspace?.storage || { provider: 'sharepoint' }; return { selected, connections: profiles.map(value => ({ id: value.id, name: value.name })), locked: Boolean(selected.locked) }; },
        save: async (value) => {
            requireOwner();
            if (!value || !['sharepoint', 'sql'].includes(value.provider))
                throw new ApiError('Choose a supported storage provider.', 400);
            const current = await roles.load(), previous = current.workspace?.storage || { provider: 'sharepoint' };
            if (previous.locked)
                throw new ApiError('Storage is already bound. Moving data requires an explicit migration.', 409);
            if ((await control.getTickets()).tickets.length || (await control.getFaqs(true)).length)
                throw new ApiError('This workspace already contains tickets or articles. Migrate them before changing storage.', 409);
            let next = { provider: 'sharepoint', locked: true };
            if (value.provider === 'sql') {
                const profile = selectProfile(profiles, value.connectionId);
                requireDepartmentMappings(profile, current.workspace);
                const database = await openDatabase(profile);
                await database.repository.health();
                if ((await database.repository.list('ticket')).length || (await database.repository.list('article')).length)
                    throw new ApiError('The database already contains workspace data. A reviewed migration is required.', 409);
                await database.attachments.health();
                next = { provider: 'sql', connectionId: profile.id, locked: true };
            }
            await saveRoles({ ...current, workspace: { ...current.workspace, storage: next } });
        }
    };
}
