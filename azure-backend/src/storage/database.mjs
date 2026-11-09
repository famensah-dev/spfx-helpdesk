import { ApiError } from '../tokens.mjs';
import { SqlRepository, sqlPool } from './sql/repository.mjs';
import { PostgresRepository, postgresPool } from './postgres/repository.mjs';

export function databaseProvider(profile) { return profile.provider || 'sql'; }
export function requireMatchingProvider(profile, selected) {
  if (databaseProvider(profile) !== selected) throw new ApiError('The database connection does not match the selected storage provider.', 400);
}
export async function openRepository(profile, workspace) {
  if (databaseProvider(profile) === 'postgres') return new PostgresRepository(postgresPool(profile), workspace);
  if (databaseProvider(profile) === 'sql') return new SqlRepository(await sqlPool(profile), workspace);
  throw new ApiError('Unsupported database provider.', 400);
}
