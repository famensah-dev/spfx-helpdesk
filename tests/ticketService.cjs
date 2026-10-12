const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const fields = [
  {InternalName: 'TicketStatus', Title: 'Status', TypeAsString: 'Choice'},
  {InternalName: 'TicketPriority', Title: 'Priority', TypeAsString: 'Choice'},
  {InternalName: 'Agent', Title: 'AssignedTo', TypeAsString: 'User'},
  {InternalName: 'TicketCategory', Title: 'Category', TypeAsString: 'Choice'},
  {InternalName: 'Deadline', Title: 'DueDate', TypeAsString: 'DateTime'},
  {InternalName: 'IsEscalated', Title: 'Escalated', TypeAsString: 'Boolean'}
];
let selected;
let expanded;
let fail = false;
let batches = [
  [{Id: 1, Title: 'A', TicketStatus: 'Pending', TicketPriority: 'High', Agent: {Id: 7, Title: 'Agent', EMail: 'agent@example.com'}, TicketCategory: 'IT', Deadline: '2026-10-01T00:00:00Z', IsEscalated: true}],
  [{Id: 2, Title: 'B', TicketStatus: 'Closed', TicketPriority: 'Low', Agent: null}]
];
const query = {
  select(...values) {selected = values; return this;},
  expand(value) {expanded = value; return this;},
  orderBy() {return this;}, top(value) {assert.equal(value, 1000); return this;},
  async *[Symbol.asyncIterator]() {if (fail) throw new Error('Access denied'); for (const batch of batches) yield batch;}
};
const list = {items: query, fields: {
  select: () => async () => fields,
  getByInternalNameOrTitle: name => {assert.equal(name, 'TicketStatus'); return {select: () => async () => ({Choices: ['New', 'Assigned', 'Completed', 'Closed', 'Pending']})};}
}};
const sp = {using() {return this;}, web: {lists: {getByTitle: name => {assert.equal(name, 'Tickets'); return list;}}}};
const loaded = {exports: {}};
const code = ts.transpileModule(fs.readFileSync('src/webparts/helpdeskSystem/services/TicketService.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
new Function('exports', 'require', 'module', code)(loaded.exports, name => name === '@pnp/sp' ? {spfi: () => sp, SPFx: () => ({})} : {}, loaded);
(async () => {
  const service = new loaded.exports.TicketService({});
  const result = await service.getTickets();
  assert.equal(result.tickets.length, 2);
  assert.equal(result.isMockData, false);
  assert.equal(result.hasResolvedAt, false);
  assert.equal(result.hasPending, true);
  assert.equal(result.hasCategory, true);
  assert.equal(result.hasDueDate, true);
  assert.equal(result.hasEscalated, true);
  assert.equal(result.tickets[0].Category, 'IT');
  assert.equal(result.tickets[0].AssignedTo.Email, 'agent@example.com');
  assert.equal(result.tickets[0].Escalated, true);
  assert.equal(expanded, 'Agent');
  assert(selected.includes('Deadline'));
  assert(!selected.includes('ResolvedAt'));
  assert(selected.includes('Agent/EMail'));
  fail = true;
  await assert.rejects(service.getTickets(), /Access denied/);
  fail = false;
  batches = [[{Id: 3, TicketStatus: 'Unexpected', TicketPriority: 'Low'}]];
  await assert.rejects(service.getTickets(), /unsupported status/);
  console.log('Ticket service checks passed: internal field mapping, optional schema, multi-page retrieval, person lookup, propagated errors, and unsupported statuses.');
})().catch(error => {console.error(error); process.exitCode = 1;});
