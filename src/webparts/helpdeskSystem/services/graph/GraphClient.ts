export interface IGraphCollection<T> { value: T[]; '@odata.nextLink'?: string; }

/** Only sends delegated access tokens to Microsoft's Graph origin. */
export class GraphClient {
  public constructor(private readonly getToken: () => Promise<string>, private readonly request: typeof fetch = (...args) => globalThis.fetch(...args)) {}
  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.write<T>(path, body, 'POST');
  }
  public async patch<T>(path: string, body: unknown, etag?: string): Promise<T> {
    return this.write<T>(path, body, 'PATCH', etag);
  }
  public async delete(path: string): Promise<void> { await this.write(path, undefined, 'DELETE'); }
  private async write<T>(path: string, body: unknown, method: 'POST' | 'PATCH' | 'DELETE', etag?: string): Promise<T> {
    const url = new URL(path.startsWith('/') ? `https://graph.microsoft.com/v1.0${path}` : path);
    if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) throw new Error('Refusing to send a Microsoft 365 token to an unexpected API address.');
    const token = await this.getToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      // Never retry creation automatically: a lost response could otherwise duplicate a ticket.
      const response = await this.request(url.href, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(etag ? {'If-Match': etag} : {}) }, body: JSON.stringify(body), signal: controller.signal });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } };
        const reason = detail.error?.message || response.statusText || 'Access denied';
        const requestId = response.headers.get('request-id');
        const schemaOperation = url.pathname.includes('/columns');
        const hint = response.status === 403 && schemaOperation ? ' Schema changes require Microsoft Graph delegated Sites.Manage.All admin consent and Manage Lists permission for your signed-in account.' : response.status === 403 ? ' Check that the write grant targets this DeskPilot client ID and site, and that your signed-in account can add list items. A read-only grant must change from read to write.' : '';
        throw new Error(`${schemaOperation ? 'Column' : 'Ticket'} ${method === 'POST' ? 'creation' : method === 'DELETE' ? 'deletion' : 'update'} failed (${response.status}${detail.error?.code ? ` / ${detail.error.code}` : ''}): ${reason}.${hint}${requestId ? ` Request ID: ${requestId}` : ''}`);
      }
      return response.status === 204 ? undefined as T : await response.json() as T;
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error instanceof TypeError)) throw new Error('The save result could not be confirmed. Refresh the ticket list before trying again to avoid a duplicate ticket.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  public async get<T>(path: string): Promise<T> {
    const url = new URL(path.startsWith('/') ? `https://graph.microsoft.com/v1.0${path}` : path);
    if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/')) {
      throw new Error('Refusing to send a Microsoft 365 token to an unexpected API address.');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response: Response;
      try {
        response = await this.request(url.href, { headers: { Authorization: `Bearer ${await this.getToken()}` }, signal: controller.signal, cache: 'no-store' });
      } finally { clearTimeout(timeout); }
      if ((response.status === 429 || response.status === 503) && attempt < 2) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await new Promise(resolve => setTimeout(resolve, Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1), 5000)));
        continue;
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
        const hint = response.status === 403 ? ' Confirm admin consent, the selected-site read grant, and your SharePoint access.' : '';
        throw new Error(`Microsoft Graph ${response.status}: ${detail.error?.message || response.statusText}.${hint}`);
      }
      return await response.json() as T;
    }
    throw new Error('Microsoft Graph is busy. Try refreshing shortly.');
  }
  public async getAll<T>(path: string): Promise<T[]> {
    const result: T[] = [];
    const visited = new Set<string>();
    let next: string | undefined = path;
    while (next) {
      if (visited.has(next)) throw new Error('Microsoft Graph returned a repeated pagination link.');
      visited.add(next);
      const page: IGraphCollection<T> = await this.get<IGraphCollection<T>>(next);
      if (!Array.isArray(page.value)) throw new Error('Microsoft Graph returned an invalid collection response.');
      result.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return result;
  }
}
