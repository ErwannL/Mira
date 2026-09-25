import type { Api } from './api.js';

/**
 * Reads `#sso=<token>` once, trades it for a session, then removes the fragment from the address
 * bar and history. Returns the operator name, or null when there is no (valid) session.
 */
export async function bootstrapSession(win: Window, api: Api): Promise<string | null> {
  const match = /^#sso=([\w.-]+)$/.exec(win.location.hash);
  if (match) {
    win.history.replaceState(null, '', win.location.pathname + win.location.search);
    try {
      return (await api.post<{ operator: string }>('/auth/sso', { token: match[1] })).operator;
    } catch {
      return null;
    }
  }
  try {
    return (await api.get<{ operator: string }>('/api/me')).operator;
  } catch {
    return null;
  }
}
