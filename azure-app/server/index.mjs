import { EntraUsers } from './entraUsers.mjs';
import { validateToken } from './tokenValidation.mjs';
import { dispatch } from './dispatch.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRemoteJWKSet } from 'jose';
import { AccessError, sessionAccess } from './authorization.mjs';
const require = createRequire(import.meta.url);
const {GraphClient} = require('./compiled/azure-app/src/services/GraphClient.js');
const {GraphTicketService} = require('./compiled/azure-app/src/services/GraphTicketService.js');
const {GraphFaqService} = require('./compiled/azure-app/src/services/GraphFaqService.js');
const {GraphAdministrationService} = require('./compiled/azure-app/src/services/GraphAdministrationService.js');
const {GraphSlaService} = require('./compiled/azure-app/src/services/GraphSlaService.js');
const env = process.env;
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const tenantId = env.DESKPILOT_TENANT_ID, clientId = env.DESKPILOT_CLIENT_ID;
const invalidSettings = [!guid.test(tenantId || '') && 'DESKPILOT_TENANT_ID (missing or invalid GUID)', !guid.test(clientId || '') && 'DESKPILOT_CLIENT_ID (missing or invalid GUID)', !env.DESKPILOT_CLIENT_SECRET?.trim() && 'DESKPILOT_CLIENT_SECRET (missing or empty)'].filter(Boolean);
if (invalidSettings.length) throw new Error(`Fix ${invalidSettings.join(', ')} in azure-app/server/.env.local. Save the file and restart npm run dev:api.`);
const site = new URL(env.DESKPILOT_SITE_URL || '');
if (site.protocol !== 'https:' || !site.hostname.endsWith('.sharepoint.com') || site.search || site.hash) throw new Error('Invalid server SharePoint site URL.');
const config = {tenantId, clientId, siteUrl: site.href.replace(/\/$/, ''), siteId: env.DESKPILOT_SITE_ID || undefined, listName: env.DESKPILOT_TICKETS_LIST_NAME || 'Issue Tracker', listId: env.DESKPILOT_TICKETS_LIST_ID || undefined, faqListName: env.DESKPILOT_FAQS_LIST_NAME || 'FAQs', graphSiteScope: 'Sites.Selected'};
const keys = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
const origin = env.DESKPILOT_ALLOWED_ORIGIN || 'http://localhost:5173';
const auditFile = path.resolve(env.DESKPILOT_AUDIT_FILE || path.join(import.meta.dirname, 'data/role-audit.jsonl'));
async function audit(record) {
  await fs.mkdir(path.dirname(auditFile), {recursive: true, mode: 0o700});
  await fs.appendFile(auditFile, JSON.stringify({time: new Date().toISOString(), ...record}) + '\n', {mode: 0o600});
}
async function obo(assertion, resource) {
  const result = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {method: 'POST', body: new URLSearchParams({client_id: clientId, client_secret: env.DESKPILOT_CLIENT_SECRET, grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion, requested_token_use: 'on_behalf_of', scope: `${resource}/.default`}), signal: AbortSignal.timeout(30000)});
  const data = await result.json();
  if (!result.ok || !data.access_token) throw new AccessError('Microsoft 365 delegated access could not be obtained. Check API consent and the server credential.', 502);
  return data.access_token;
}
const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, value) => {response.writeHead(status, {'Content-Type': 'application/json'}); response.end(JSON.stringify(value));};
  try {
    if (request.headers.origin && request.headers.origin !== origin) throw new AccessError('Untrusted origin.');
    if (request.url !== '/api/rpc' || request.method !== 'POST') return send(404, {error: 'Not found'});
    const assertion = request.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!assertion) throw new AccessError('Sign in to DeskPilot.', 401);
    const claims = await validateToken(assertion, keys, tenantId, clientId);
    const access = sessionAccess(claims);
    let length = 0; const chunks = [];
    for await (const chunk of request) {length += chunk.length; if (length > 72 * 1024 * 1024) throw new AccessError('Request too large.', 413); chunks.push(chunk);}
    let body; try {body = JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {throw new AccessError('Invalid JSON.', 400);}
    if (typeof body.method !== 'string' || !Array.isArray(body.args) || body.args.length > 4) throw new AccessError('Invalid request.', 400);
    const tokens = new Map(); const token = resource => {if (!tokens.has(resource)) tokens.set(resource, obo(assertion, resource)); return tokens.get(resource);};
    const graph = new GraphClient(() => token('https://graph.microsoft.com'));
    const spToken = () => token(site.origin);
    const profile = await graph.get('/me?$select=id,displayName,mail,userPrincipalName');
    if (profile.id.toLowerCase() !== claims.oid.toLowerCase()) throw new AccessError('Identity mismatch.', 401);
    const tickets = new GraphTicketService(graph, config, graph, spToken);
    const result = await dispatch(access, profile, {graph, tickets, entraUsers: new EntraUsers(graph, clientId, audit), faq: new GraphFaqService(graph, config, spToken), admin: new GraphAdministrationService(graph, graph, config, spToken), sla: new GraphSlaService(graph, graph, config, spToken, () => tickets.invalidateSchema())}, body.method, body.args.map(value => value === null ? undefined : value), config);
    send(200, {result: result ?? null});
  } catch (error) {send(error instanceof AccessError ? error.status : 400, {error: error.message || 'Request failed.', ...(error.createdTicketId ? {createdTicketId: error.createdTicketId} : {})});}
});
server.requestTimeout = 180000;
server.listen(Number(env.DESKPILOT_API_PORT || 7071), env.DESKPILOT_API_HOST || '127.0.0.1', () => console.log('DeskPilot API listening.'));
