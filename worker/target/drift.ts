import type { Catalogue } from '../../shared/catalogue-schema.js';
import type { Endpoint } from './client.js';

/** "/api/boards/{{boardId}}/lists?x=1" and "/api/boards/:boardId/lists" both → "/api/boards/:*\/lists". */
export function normalisePath(path: string): string {
  return path.split('?')[0]!.replace(/\{\{\w+\}\}|:\w+/g, ':*').replace(/\/$/, '') || '/';
}

export const key = (method: string, path: string): string => `${method.toUpperCase()} ${normalisePath(path)}`;

export interface DriftReport {
  missing: { useCase: string; method: string; path: string }[];
  /** Target endpoints that no catalogue use case calls (coverage matrix, static half). */
  uncatalogued: string[];
}

export function checkDrift(catalogue: Catalogue, endpoints: Endpoint[]): DriftReport {
  const available = new Set(endpoints.map((e) => key(e.method, e.path)));
  const used = new Set<string>();
  const missing: DriftReport['missing'] = [];
  for (const u of catalogue.useCases) {
    for (const s of u.api) {
      const k = key(s.method, s.path);
      used.add(k);
      if (!available.has(k)) missing.push({ useCase: u.id, method: s.method, path: s.path });
    }
  }
  // Contract endpoints (admin API, the endpoint list itself) are not product use cases.
  const uncatalogued = [...available].filter((k) => !used.has(k) && !k.includes('/api/admin/') && k !== 'GET /api').sort();
  return { missing, uncatalogued };
}
