import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair, exportJWK, createLocalJWKSet, SignJWT} from 'jose';
import {validateToken} from './tokenValidation.mjs';
import {sessionAccess, assertTicketAction} from './authorization.mjs';
import {dispatch} from './dispatch.mjs';
const oid = '11111111-1111-4111-8111-111111111111';
const tenant = '22222222-2222-4222-8222-222222222222';
const client = '33333333-3333-4333-8333-333333333333';
const profile = {id: oid, mail: 'agent@example.com', userPrincipalName: 'agent@example.com'};
const assigned = {Id: 1, Status: 'New', Priority: 'High', AssignedTo: {Id: 12, Email: 'agent@example.com'}};
const submitted = {Id: 2, Status: 'New', Priority: 'High', Requester: {AadId: oid}};
const other = {Id: 3, Status: 'New', Priority: 'High'};
const claims = {oid, roles: ['DeskPilot.HelpdeskAgent']};
const access = sessionAccess(claims, [{id: oid, role: 'agent'}]);
test('Entra app roles are the sole role source for the current site', () => {
  assert.throws(() => sessionAccess({oid, roles: []}), /role/);
  assert(sessionAccess(claims).agent);
  assert(sessionAccess({oid, roles: ['DeskPilot.HelpdeskAdmin']}).admin);
  assert(sessionAccess({oid, roles: ['DeskPilot.SuperAdmin']}).superAdmin);
});
test('Agents manage assigned jobs, comment on submitted jobs, and cannot escalate privileges', () => {
  assert.doesNotThrow(() => assertTicketAction(access, assigned, profile, 'edit', {priority: 'High', assignedToId: 12, status: 'Resolved'}));
  assert.doesNotThrow(() => assertTicketAction(access, submitted, profile, 'comment'));
  for (const action of ['assign', 'priority', 'archive']) assert.throws(() => assertTicketAction(access, assigned, profile, action), /cannot/);
  assert.throws(() => assertTicketAction(access, submitted, profile, 'edit', {}), /assigned/);
  assert.throws(() => assertTicketAction(access, other, profile, 'read'), /outside/);
  assert.throws(() => assertTicketAction(access, {...assigned, Status: 'Closed'}, profile, 'status', 'New'), /reopen/);
  assert.throws(() => assertTicketAction(access, assigned, profile, 'edit', {priority: 'Low', assignedToId: 12, status: 'New'}), /priority/);
});
test('API filters rows and rejects forged IDs and schema routes before any writes', async () => {
  let writes = 0;
  const services = {tickets: {getTickets: async () => ({tickets: [assigned, submitted, other]}), addComment: async () => {writes++;}, updateTickets: async () => {writes++;}}, admin: {saveColumn: async () => {writes++;}}};
  const data = await dispatch(access, profile, services, 'getTickets', [], {});
  assert.deepEqual(data.tickets.map(ticket => ticket.Id), [1, 2]);
  await assert.rejects(dispatch(access, profile, services, 'addComment', [3, 'forged'], {}), /outside/);
  await assert.rejects(dispatch(access, profile, services, 'updateTickets', [[1, 3], {kind: 'status', status: 'Resolved'}], {}), /outside/);
  await assert.rejects(dispatch(access, profile, services, 'admin.saveColumn', [{}], {}), /Super Admin/);
  await assert.rejects(dispatch({...access, admin: true}, profile, services, 'admin.saveEntry', ['schema', {}], {}), /classification/);
  assert.equal(writes, 0);
});
test('Agents cannot publish FAQ drafts or retrieve managed FAQs', async () => {
  const services = {tickets: {getTickets: async () => ({tickets: [assigned]})}, faq: {save: async (input, id, draftOnly) => {assert.equal(input.published, false); assert(draftOnly);}}};
  await assert.rejects(dispatch(access, profile, services, 'saveFaq', [{published: true}], {}));
  await assert.rejects(dispatch(access, profile, services, 'getFaqs', [true], {}));
});
test('API validates signatures, expiry, audience, tenant, authorized client and delegated scope', async () => {
  const {publicKey, privateKey} = await generateKeyPair('RS256');
  const jwk = {...await exportJWK(publicKey), kid: 'test'};
  const keys = createLocalJWKSet({keys: [jwk]});
  const sign = async (patch = {}, options = {}) => new SignJWT({tid: tenant, oid, azp: client, scp: 'access_as_user', ...patch}).setProtectedHeader({alg: 'RS256', kid: 'test'}).setIssuer(options.issuer || `https://login.microsoftonline.com/${tenant}/v2.0`).setAudience(options.aud || client).setExpirationTime(options.exp || '5m').sign(privateKey);
  assert.equal((await validateToken(await sign(), keys, tenant, client)).oid, oid);
  for (const [patch, options] of [[{tid: client}, {}], [{scp: 'User.Read'}, {}], [{azp: tenant}, {}], [{oid: ''}, {}], [{}, {aud: 'https://graph.microsoft.com'}], [{}, {issuer: 'https://attacker.example'}], [{}, {exp: 1}]]) await assert.rejects(validateToken(await sign(patch, options), keys, tenant, client));
  const valid = await sign(); const parts = valid.split('.'); parts[1] = Buffer.from(JSON.stringify({tid: tenant, oid, roles: ['DeskPilot.SuperAdmin']})).toString('base64url');
  await assert.rejects(validateToken(parts.join('.'), keys, tenant, client));
});

