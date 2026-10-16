import test from 'node:test';
import assert from 'node:assert/strict';
import {EntraUsers} from './entraUsers.mjs';
import {dispatch} from './dispatch.mjs';
const client = '11111111-1111-4111-8111-111111111111';
const resource = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const target = '44444444-4444-4444-8444-444444444444';
const access = {superAdmin: true, admin: true, oid: actor};
function fixture() {
  const app = {id: resource, appId: client, appRoles: [['super', 'DeskPilot.SuperAdmin'], ['admin', 'DeskPilot.HelpdeskAdmin'], ['agent', 'DeskPilot.HelpdeskAgent']].map(([id, value]) => ({id, value, displayName: value, isEnabled: true, allowedMemberTypes: ['User']}))};
  const assignments = [{id: 'actor-super', principalId: actor, principalType: 'User', appRoleId: 'super', resourceId: resource}];
  const writes = [], audit = [];
  const graph = {
    get: async path => path.startsWith('/servicePrincipals(') ? app : {id: target, displayName: 'Agent', mail: 'agent@example.com'},
    getAll: async () => assignments.map(value => ({...value})),
    post: async (path, body) => {writes.push({path, body}); assignments.push({id: 'new-' + writes.length, principalType: 'User', ...body});},
    delete: async path => {writes.push({path}); const id = decodeURIComponent(path.split('/').pop()); const index = assignments.findIndex(item => item.id === id); if (index >= 0) assignments.splice(index, 1);}
  };
  return {app, assignments, writes, audit, graph, service: new EntraUsers(graph, client, async record => audit.push(record))};
}
test('Entra add/edit/remove use only the fixed DeskPilot resource and managed role IDs', async () => {
  const f = fixture();
  await f.service.change(access, {id: target, role: 'agent', resourceId: 'attacker-app', appRoleId: 'super'});
  assert.deepEqual(f.writes[0].body, {principalId: target, resourceId: resource, appRoleId: 'agent'});
  await f.service.change(access, {id: target, role: 'agent'});
  assert.equal(f.writes.length, 1);
  await f.service.change(access, {id: target, role: 'admin'});
  assert.equal(f.assignments.filter(row => row.principalId === target).length, 1);
  assert.equal(f.assignments.find(row => row.principalId === target).appRoleId, 'admin');
  await f.service.change(access, {id: target, role: 'admin'}, true);
  assert.equal(f.assignments.filter(row => row.principalId === target).length, 0);
  assert(f.writes.every(write => write.path.startsWith('/servicePrincipals/' + resource + '/appRoleAssignedTo')));
  assert(f.audit.some(row => row.outcome === 'succeeded' && row.actorId === actor));
});
test('Non-super callers, self changes, Super Admin promotion and protected targets are denied', async () => {
  const f = fixture();
  await assert.rejects(f.service.change({...access, superAdmin: false}, {id: target, role: 'agent'}));
  await assert.rejects(f.service.change(access, {id: actor, role: 'agent'}), /own/);
  await assert.rejects(f.service.change(access, {id: target, role: 'superAdmin'}), /Admin or Agent/);
  f.assignments.push({id: 'target-super', principalId: target, principalType: 'User', appRoleId: 'super', resourceId: resource});
  await assert.rejects(f.service.change(access, {id: target, role: 'admin'}, true), /directly in Entra/);
  assert.equal(f.writes.length, 0);
});
test('Stale Super Admin token cannot write after direct Entra assignment is removed', async () => {
  const f = fixture(); f.assignments.length = 0;
  await assert.rejects(f.service.change(access, {id: target, role: 'agent'}), /current direct/);
  assert.equal(f.writes.length, 0);
});
test('Wrong resource, missing role definition and failed auditing cannot write', async () => {
  const f = fixture(); f.app.appId = resource;
  await assert.rejects(f.service.change(access, {id: target, role: 'agent'}), /identity/);
  f.app.appId = client; f.app.appRoles.find(role => role.id === 'agent').isEnabled = false;
  await assert.rejects(f.service.change(access, {id: target, role: 'agent'}), /disabled/);
  f.app.appRoles.find(role => role.id === 'agent').isEnabled = true;
  const noAudit = new EntraUsers(f.graph, client, async () => {throw new Error('Audit unavailable');});
  await assert.rejects(noAudit.change(access, {id: target, role: 'agent'}), /Audit/);
  assert.equal(f.writes.length, 0);
});
test('Failed role replacement reports partial changes and preserves unrelated assignments', async () => {
  const f = fixture(); f.assignments.push({id: 'target-admin', principalId: target, principalType: 'User', appRoleId: 'admin', resourceId: resource}, {id: 'other-role', principalId: target, principalType: 'User', appRoleId: 'other', resourceId: resource});
  f.graph.post = async () => {throw new Error('Graph denied');};
  await assert.rejects(f.service.change(access, {id: target, role: 'agent'}), /Some Entra assignments changed/);
  assert(!f.assignments.some(row => row.id === 'target-admin'));
  assert(f.assignments.some(row => row.id === 'other-role'));
  assert(f.audit.some(row => row.outcome === 'partial'));
});
test('Users RPC does not allow Helpdesk Admin or Agent to manage assignments', async () => {
  for (const method of ['members.list', 'members.save', 'members.remove']) await assert.rejects(dispatch({admin: true, superAdmin: false}, {}, {}, method, [], {}), /Super Admin/);
});
