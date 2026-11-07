import sql from 'mssql';
import { ApiError } from '../../tokens.mjs';
const pools = new Map();
export async function sqlPool(profile) {
    if (!pools.has(profile.id)) {
        const pool = new sql.ConnectionPool({ ...profile.sql, options: { ...profile.sql.options, encrypt: true, trustServerCertificate: false }, pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }, requestTimeout: 30000 });
        const connection = pool.connect().catch(error => { pools.delete(profile.id); throw error; });
        pools.set(profile.id, connection);
    }
    return pools.get(profile.id);
}
export class SqlRepository {
    constructor(pool, workspace) { this.pool = pool; this.workspace = workspace; }
    request(kind) { return this.pool.request().input('workspace', sql.NVarChar(64), this.workspace).input('kind', sql.NVarChar(32), kind); }
    row(row) { return { ...JSON.parse(row.Document), id: Number(row.Id), version: Buffer.from(row.Version).toString('hex') }; }
    async health() { await this.request('ticket').query('SELECT TOP(1) Id FROM deskpilot.Records WHERE WorkspaceId=@workspace AND Kind=@kind'); }
    async list(kind, { parent, owner, scope, id } = {}) {
        const request = this.request(kind);
        let where = 'WorkspaceId=@workspace AND Kind=@kind';
        if (id !== undefined) {
            where += ' AND Id=@id';
            request.input('id', sql.BigInt, id);
        }
        if (parent !== undefined) {
            where += ' AND ParentId=@parent';
            request.input('parent', sql.BigInt, parent);
        }
        if (owner !== undefined) {
            where += ' AND OwnerId=@owner';
            request.input('owner', sql.NVarChar(64), owner);
        }
        if (scope) {
            request.input('email', sql.NVarChar(320), scope.email.toLowerCase());
            const own = '(RequesterEmail=@email OR CreatorEmail=@email)';
            if (scope.mode === 'own')
                where += ' AND RequesterEmail=@email';
            else if (scope.mode === 'assigned')
                where += ' AND (AssignedEmail=@email' + (scope.agent ? ' OR ' + own : '') + ')';
            if (scope.departments) {
                request.input('departments', sql.NVarChar(sql.MAX), JSON.stringify(scope.departments));
                where += ' AND (' + own + " OR Department IN (SELECT value FROM OPENJSON(@departments)))";
            }
        }
        const result = await request.query('SELECT Id,Document,Version FROM deskpilot.Records WHERE ' + where + ' ORDER BY Id DESC');
        return result.recordset.map(row => this.row(row));
    }
    async get(kind, id) { const result = await this.request(kind).input('id', sql.BigInt, id).query('SELECT Id,Document,Version FROM deskpilot.Records WHERE WorkspaceId=@workspace AND Kind=@kind AND Id=@id'); return result.recordset[0] ? this.row(result.recordset[0]) : undefined; }
    async insert(kind, document, parent = 0, owner = '') {
        const result = await this.request(kind).input('document', sql.NVarChar(sql.MAX), JSON.stringify(document)).input('parent', sql.BigInt, parent).input('owner', sql.NVarChar(64), owner).query('INSERT deskpilot.Records(WorkspaceId,Kind,ParentId,OwnerId,Document) OUTPUT inserted.Id,inserted.Document,inserted.Version VALUES(@workspace,@kind,@parent,@owner,@document)');
        return this.row(result.recordset[0]);
    }
    async replace(kind, id, document, version) {
        if (!/^[a-f0-9]{16}$/i.test(version || ''))
            throw new ApiError('Reload before saving this item.', 409);
        const result = await this.request(kind).input('id', sql.BigInt, id).input('document', sql.NVarChar(sql.MAX), JSON.stringify(document)).input('version', sql.Binary(8), Buffer.from(version, 'hex')).query('UPDATE deskpilot.Records SET Document=@document OUTPUT inserted.Id,inserted.Document,inserted.Version WHERE WorkspaceId=@workspace AND Kind=@kind AND Id=@id AND Version=@version');
        if (!result.recordset.length)
            throw new ApiError('This item changed. Refresh and retry.', 409);
        return this.row(result.recordset[0]);
    }
    async remove(kind, id, version) {
        const result = await this.request(kind).input('id', sql.BigInt, id).input('version', sql.Binary(8), Buffer.from(version, 'hex')).query('DELETE deskpilot.Records WHERE WorkspaceId=@workspace AND Kind=@kind AND Id=@id AND Version=@version');
        if (!result.rowsAffected[0])
            throw new ApiError('This item changed. Refresh and retry.', 409);
    }
}
