import pg from 'pg';
import { ManagedIdentityCredential } from '@azure/identity';
import { ApiError } from '../../tokens.mjs';

const pools = new Map();
export function postgresPool(profile) {
  if (!pools.has(profile.id)) {
    const settings = profile.postgres;
    const credential = settings.authentication === 'managed-identity' ? new ManagedIdentityCredential() : undefined;
    const pool = new pg.Pool({
      host: settings.host, port: settings.port || 5432, database: settings.database, user: settings.user,
      password: credential ? async () => (await credential.getToken('https://ossrdbms-aad.database.windows.net/.default')).token : settings.password,
      ssl: { rejectUnauthorized: true, ...(settings.ca ? { ca: settings.ca } : {}) },
      max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 15000, statement_timeout: 30000,
      application_name: 'DeskPilot'
    });
    // pg emits errors for idle connections. Never log credentials or SQL parameter values.
    pool.on('error', () => {});
    pools.set(profile.id, pool);
  }
  return pools.get(profile.id);
}
export async function closePostgresPools() {
  const current = [...pools.values()]; pools.clear(); await Promise.all(current.map(pool => pool.end()));
}
function validId(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new ApiError('Invalid record ID.', 400);
  return value;
}
function versionNumber(version) {
  if (!/^[a-f0-9]{16}$/i.test(version || '')) throw new ApiError('Reload before saving this item.', 409);
  const value = BigInt('0x' + version);
  if (value > 9223372036854775807n) throw new ApiError('Invalid record version.', 409);
  return value.toString();
}
/** Same repository contract as Azure SQL, with parameterized PostgreSQL queries. */
export class PostgresRepository {
  constructor(pool, workspace) { this.pool = pool; this.workspace = workspace; this.sourceLabel = 'Azure PostgreSQL'; }
  async query(text, values) {
    try { return await this.pool.query(text, values); }
    catch (error) {
      if (error.code === '23505') throw new ApiError('This record already exists. Refresh and retry.', 409);
      throw new ApiError('PostgreSQL operation failed. Ask your administrator to check the backend connection and schema.', 503);
    }
  }
  row(row) { return { ...row.document, id: validId(Number(row.id)), version: BigInt(row.version).toString(16).padStart(16, '0') }; }
  async health() { await this.query('SELECT id FROM deskpilot.records WHERE workspace_id=$1 AND kind=$2 LIMIT 1', [this.workspace, 'ticket']); }
  async list(kind, { parent, owner, scope, id } = {}) {
    const values = [this.workspace, kind], where = ['workspace_id=$1', 'kind=$2'];
    const bind = value => { values.push(value); return '$' + values.length; };
    if (id !== undefined) where.push('id=' + bind(validId(id)));
    if (parent !== undefined) where.push('parent_id=' + bind(parent));
    if (owner !== undefined) where.push('owner_id=' + bind(owner));
    if (scope) {
      if (!scope.email || !['own', 'assigned', 'all'].includes(scope.mode)) throw new ApiError('Invalid database access scope.');
      const email = bind(scope.email.toLowerCase()), own = `(requester_email=${email} OR creator_email=${email})`;
      if (scope.mode === 'own') where.push('requester_email=' + email);
      if (scope.mode === 'assigned') where.push(`(assigned_email=${email}${scope.agent ? ' OR ' + own : ''})`);
      if (scope.departments) where.push(`(${own} OR department=ANY(${bind(scope.departments)}::text[]))`);
    }
    const result = await this.query('SELECT id,document,version FROM deskpilot.records WHERE ' + where.join(' AND ') + ' ORDER BY id DESC', values);
    return result.rows.map(row => this.row(row));
  }
  async get(kind, id) { return (await this.list(kind, { id }))[0]; }
  async insert(kind, document, parent = 0, owner = '') {
    const result = await this.query('INSERT INTO deskpilot.records(workspace_id,kind,parent_id,owner_id,document) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id,document,version', [this.workspace, kind, parent, owner, JSON.stringify(document)]);
    return this.row(result.rows[0]);
  }
  async replace(kind, id, document, version) {
    const result = await this.query('UPDATE deskpilot.records SET document=$4::jsonb WHERE workspace_id=$1 AND kind=$2 AND id=$3 AND version=$5::bigint RETURNING id,document,version', [this.workspace, kind, validId(id), JSON.stringify(document), versionNumber(version)]);
    if (!result.rows.length) throw new ApiError('This item changed. Refresh and retry.', 409);
    return this.row(result.rows[0]);
  }
  async remove(kind, id, version) {
    const result = await this.query('DELETE FROM deskpilot.records WHERE workspace_id=$1 AND kind=$2 AND id=$3 AND version=$4::bigint', [this.workspace, kind, validId(id), versionNumber(version)]);
    if (!result.rowCount) throw new ApiError('This item changed. Refresh and retry.', 409);
  }
}
