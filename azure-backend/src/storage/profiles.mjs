import { ApiError } from '../tokens.mjs';
/** Only server configuration may contain SQL or Blob credentials. Never serialize these profiles. */
export function storageProfiles(env = process.env) {
    // The legacy variable remains supported for existing Azure SQL deployments.
    const parse = value => { try { return JSON.parse(value || '[]'); } catch { throw new Error('Invalid backend database profile JSON.'); } };
    const sql = parse(env.DESKPILOT_SQL_PROFILES), postgres = parse(env.DESKPILOT_POSTGRES_PROFILES);
    if (!Array.isArray(sql) || !Array.isArray(postgres)) throw new Error('Database profiles must be arrays.');
    const values = [...sql, ...postgres];
    const ids = new Set();
    for (const value of values) {
        if (!value || typeof value !== 'object') throw new Error('Invalid server-side database storage profile.');
        const provider = value.provider || 'sql';
        const pg = value.postgres;
        const validDatabase = provider === 'sql' ? value.sql?.server && value.sql?.database : provider === 'postgres' && pg?.host && pg?.database && pg?.user && (pg.authentication === 'managed-identity' || (pg.authentication === undefined || pg.authentication === 'password') && typeof pg.password === 'string' && pg.password.length > 0) && (pg.port === undefined || Number.isInteger(pg.port) && pg.port > 0 && pg.port < 65536);
        if (!/^[a-z0-9-]{1,48}$/.test(value.id || '') || ids.has(value.id) || !value.name || !validDatabase || !value.blobConnectionString || !value.container)
            throw new Error('Invalid server-side database storage profile.');
        if (value.departmentGroups && (typeof value.departmentGroups !== 'object' || Array.isArray(value.departmentGroups) || Object.values(value.departmentGroups).some(id => !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))))
            throw new Error('Invalid database department group mappings.');
        ids.add(value.id);
    }
    return values;
}
export function selectProfile(values, id) { const profile = values.find(value => value.id === id); if (!profile)
    throw new ApiError('The selected database connection is not configured on the backend.', 400); return profile; }
export function requireDepartmentMappings(profile, workspace) {
    if (workspace?.departmentFolders?.departments.some(item => !profile.departmentGroups?.[item.key]))
        throw new ApiError('Configure an Entra group mapping for each department in the database connection before binding database storage.', 400);
}
