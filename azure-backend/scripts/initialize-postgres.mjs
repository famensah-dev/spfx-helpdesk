import { readFile } from 'node:fs/promises';
import { storageProfiles, selectProfile } from '../src/storage/profiles.mjs';
import { requireMatchingProvider } from '../src/storage/database.mjs';
import { postgresPool, closePostgresPools } from '../src/storage/postgres/repository.mjs';

try {
  const profile = selectProfile(storageProfiles(), process.argv[2]);
  requireMatchingProvider(profile, 'postgres');
  await postgresPool(profile).query(await readFile(new URL('../src/storage/postgres/schema.sql', import.meta.url), 'utf8'));
  console.log('DeskPilot PostgreSQL schema is ready. No data was moved and no workspace binding changed.');
} catch {
  console.error('PostgreSQL initialization failed. Check the selected profile, deployment identity, network access and PostgreSQL server logs.');
  process.exitCode = 1;
} finally { await closePostgresPools(); }
