import { ApiError } from '../tokens.mjs';
/** Only server configuration may contain SQL or Blob credentials. Never serialize these profiles. */
export function storageProfiles(env = process.env) {
    const values = JSON.parse(env.DESKPILOT_SQL_PROFILES || '[]');
    if (!Array.isArray(values))
        throw new Error('SQL profiles must be an array.');
    const ids = new Set();
    for (const value of values) {
        if (!/^[a-z0-9-]{1,48}$/.test(value.id || '') || ids.has(value.id) || !value.name || !value.sql?.server || !value.sql?.database || !value.blobConnectionString || !value.container)
            throw new Error('Invalid server-side SQL storage profile.');
        if (value.departmentGroups && (typeof value.departmentGroups !== 'object' || Array.isArray(value.departmentGroups) || Object.values(value.departmentGroups).some(id => !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))))
            throw new Error('Invalid SQL department group mappings.');
        ids.add(value.id);
    }
    return values;
}
export function selectProfile(values, id) { const profile = values.find(value => value.id === id); if (!profile)
    throw new ApiError('The selected database connection is not configured on the backend.', 400); return profile; }
export function requireDepartmentMappings(profile, workspace) {
    if (workspace?.departmentFolders?.departments.some(item => !profile.departmentGroups?.[item.key]))
        throw new ApiError('Configure an Entra group mapping for each department in the database connection before binding SQL.', 400);
}
