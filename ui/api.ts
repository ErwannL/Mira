export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? status));
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Same-origin JSON client; state-changing calls carry the anti-CSRF header. */
export function apiClient(fetchImpl: Fetch) {
  const call = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (method !== 'GET') headers['x-figura'] = '1';
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetchImpl(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, json);
    return json as T;
  };
  return {
    get: <T>(url: string) => call<T>('GET', url),
    post: <T>(url: string, body?: unknown) => call<T>('POST', url, body ?? {}),
    del: <T>(url: string) => call<T>('DELETE', url),
  };
}
export type Api = ReturnType<typeof apiClient>;
