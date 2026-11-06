import type { ITicketDataSource } from '../interfaces/ITicketDataSource';

export function azureRpcUrl(value: string): string {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('Configure an HTTPS Azure backend URL without credentials, query parameters or a fragment.');
  url.pathname = url.pathname.replace(/\/$/, '') + '/api/rpc';
  return url.href;
}
async function serialize(value: unknown): Promise<unknown> {
  if (typeof File !== 'undefined' && value instanceof File) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
    return { name: value.name, type: value.type, data: btoa(binary) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(serialize));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).filter(([, item]) => typeof item !== 'function').map(async ([key, item]) => [key, await serialize(item)]));
    return Object.fromEntries(entries);
  }
  return typeof value === 'function' ? undefined : value;
}
interface Session {
  access: ITicketDataSource['access']; roleRules: ITicketDataSource['roleRules'];
  workspaceSettings: ITicketDataSource['workspaceSettings']; workspaceConnection: ITicketDataSource['workspaceConnection'];
  capabilities: string[]; notificationManagement: boolean;
}
/** The browser has no direct data fallback; authorization lives in the Azure API. */
export async function createAzureService(baseUrl: string, getToken: () => Promise<string>, request: typeof fetch = (...args) => fetch(...args)): Promise<ITicketDataSource> {
  const endpoint = azureRpcUrl(baseUrl);
  const rpc = async (method: string, args: unknown[] = []): Promise<unknown> => {
    const response = await request(endpoint, { method: 'POST', credentials: 'omit', headers: { Authorization: 'Bearer ' + await getToken(), 'Content-Type': 'application/json' }, body: JSON.stringify({ method, args: await serialize(args) }), signal: AbortSignal.timeout(180000) });
    const body = await response.json().catch(() => ({ error: 'The Azure backend did not return a valid response.' }));
    if (!response.ok) {
      const error = new Error(body.error || `Azure backend request failed (${response.status}).`) as Error & { createdTicketId?: number };
      if (Number.isSafeInteger(body.createdTicketId)) error.createdTicketId = body.createdTicketId;
      throw error;
    }
    return body.result;
  };
  const session = await rpc('session') as Session;
  if (!session?.access || !session.roleRules || !Array.isArray(session.capabilities)) throw new Error('The Azure backend returned an invalid workspace session.');
  const source: Record<string, unknown> = { access: session.access, roleRules: session.roleRules, workspaceSettings: session.workspaceSettings, workspaceConnection: session.workspaceConnection };
  for (const method of session.capabilities) {
    const parts = method.split('.');
    if (parts.length > 2 || parts.some(part => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(part) || ['constructor', 'prototype', '__proto__'].includes(part))) throw new Error('The backend returned an invalid capability.');
    const owner = parts.length === 1 ? source : (source[parts[0]] ||= {}) as Record<string, unknown>;
    owner[parts[parts.length - 1]] = (...args: unknown[]) => rpc(method, args);
  }
  if (source.notifications) (source.notifications as Record<string, unknown>).canManage = session.notificationManagement;
  if (source.workspaceSetup) (source.workspaceSetup as Record<string, unknown>).run = async (progress: (message: string) => void): Promise<void> => {
    progress('Initializing workspace through Azure...');
    const result = await rpc('workspaceSetup.run') as { progress: string[] };
    result.progress.forEach(progress);
  };
  if (source.workspaceMaintenance) {
    let reviewToken: string | undefined;
    const maintenance = source.workspaceMaintenance as Record<string, unknown>;
    maintenance.inspect = async (action: string, ids: string[]) => {
      const result = await rpc('workspaceMaintenance.inspect', [action, ids]) as { targets: unknown[]; reviewToken: string };
      reviewToken = result.reviewToken; return result.targets;
    };
    maintenance.run = async (action: string, ids: string[], phrase: string, progress: (message: string, status?: unknown) => void) => {
      const token = reviewToken; reviewToken = undefined;
      const result = await rpc('workspaceMaintenance.run', [action, ids, phrase, token]) as { progress: Array<{ message: string; status?: unknown }> };
      result.progress.forEach(item => progress(item.message, item.status));
    };
  }
  if (source.roleManagement) {
    const versions = new Map<string, string>();
    const roles = source.roleManagement as Record<string, unknown>;
    roles.load = async () => {
      const result = await rpc('roleManagement.load') as { configuration: unknown; versionToken: string };
      versions.set('roles', result.versionToken); return result.configuration;
    };
    roles.save = async (configuration: unknown) => {
      const result = await rpc('roleManagement.save', [configuration, versions.get('roles')]) as { versionToken: string };
      versions.set('roles', result.versionToken);
    };
  }
  return source as unknown as ITicketDataSource;
}
