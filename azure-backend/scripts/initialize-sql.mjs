import { readFile } from 'node:fs/promises';
import { storageProfiles, selectProfile } from '../src/storage/profiles.mjs';
import { sqlPool } from '../src/storage/sql/repository.mjs';
const profile = selectProfile(storageProfiles(), process.argv[2]);
const pool = await sqlPool(profile);
try {
    await pool.request().batch(await readFile(new URL('../src/storage/sql/schema.sql', import.meta.url), 'utf8'));
    console.log('DeskPilot SQL schema is ready. No workspace binding or data migration was performed.');
}
finally {
    await pool.close();
}
