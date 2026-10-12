const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('src/webparts/helpdeskSystem/utils/dashboardUtils.ts', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}});
const loaded = {exports: {}};
new Function('exports', 'require', 'module', compiled.outputText)(loaded.exports, require, loaded);
const {filterTickets, getDashboardStats, getStatusChartData, getPriorityChartData} = loaded.exports;
const now = new Date();
const start = new Date(now.getFullYear(), now.getMonth(), 1, 8);
const resolution = new Date(start.getTime() + 2 * 3600000);
const base = {Title: 'Ticket', Created: start.toISOString(), Modified: resolution.toISOString(), Priority: 'Critical'};
const tickets = [
  {...base, Id: 1, Status: 'New'},
  {...base, Id: 2, Status: 'Assigned', AssignedTo: {Id: 7, Title: 'Agent'}},
  {...base, Id: 3, Status: 'Completed', ResolvedAt: resolution.toISOString()},
  {...base, Id: 4, Status: 'Closed', ResolvedAt: null},
  {...base, Id: 5, Status: 'Completed', ResolvedAt: 'invalid'}
];
assert.deepEqual(getDashboardStats(tickets), {totalOpenTickets: 2, criticalTickets: 2, resolvedThisMonth: 1, averageResolutionTimeHours: 2});
assert.equal(getDashboardStats([]).averageResolutionTimeHours, null);
const from = new Date(start); const to = new Date(start);
const before = [from.getTime(), to.getTime()];
assert.equal(filterTickets(tickets, {startDate: from, endDate: to}).length, 5);
assert.deepEqual([from.getTime(), to.getTime()], before);
assert.equal(filterTickets(tickets, {assignedTo: '7'}).length, 1);
assert.equal(filterTickets(tickets, {assignedTo: 'unassigned'}).length, 4);
assert.equal(filterTickets(tickets, {status: 'Assigned', priority: 'Critical', assignedTo: '7'}).length, 1);
assert.deepEqual(getStatusChartData(tickets).datasets[0].data, [1, 1, 2, 1]);
assert.deepEqual(getPriorityChartData(tickets).datasets[0].data, [0, 0, 0, 5]);
console.log('Dashboard checks passed: metrics, missing and invalid resolution dates, immutable inclusive date filters, assignees, combined filters, and chart totals.');

const globalSource = fs.readFileSync('src/webparts/helpdeskSystem/utils/globalDashboardUtils.ts', 'utf8');
const globalModule = {exports: {}};
new Function('exports', 'require', 'module', ts.transpileModule(globalSource, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(globalModule.exports, require, globalModule);
const {getGlobalSummary, getCategoryChart} = globalModule.exports;
const extended = [
  {...base, Id: 1, Status: 'New', Category: 'Hardware', DueDate: '2026-01-01T00:00:00Z'},
  {...base, Id: 2, Status: 'Pending', Category: 'Software', Escalated: true},
  {...base, Id: 3, Status: 'Escalated', Category: 'Hardware', Escalated: true, DueDate: '2030-01-01T00:00:00Z'},
  {...base, Id: 4, Status: 'Closed', DueDate: '2026-01-01T00:00:00Z'},
  {...base, Id: 5, Status: 'Completed', DueDate: '2026-01-01T00:00:00Z'},
  {...base, Id: 6, Status: 'Assigned', DueDate: 'invalid'}
];
assert.deepEqual(getGlobalSummary(extended, new Date('2026-10-10T12:00:00Z')), {total: 6, open: 4, pending: 1, closed: 1, escalated: 2, overdue: 1});
const categories = getCategoryChart(extended);
assert.equal(categories.datasets[0].data.reduce((sum, n) => sum + n, 0), extended.length);
assert.equal(categories.datasets[0].data[categories.labels.indexOf('Uncategorized')], 3);
const manyCategories = getCategoryChart(Array.from({length: 12}, (_, i) => ({...base, Id: i, Status: 'New', Category: `Category ${i}`})));
assert.equal(manyCategories.labels.length, 8);
assert.equal(manyCategories.datasets[0].data.reduce((sum, n) => sum + n, 0), 12);
assert.equal(getStatusChartData(extended).datasets[0].data.reduce((sum, n) => sum + n, 0), 6);
console.log('Global dashboard checks passed: pending/escalated states, escalation deduplication, overdue boundaries, category grouping, and extended chart totals.');
