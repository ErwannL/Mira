/**
 * `GET /api` in Orqea's shape (`routes/api/apiDescriptor.js`): `{message: 'Orqea API', endpoints}`
 * where `endpoints` is a NESTED object, grouped by resource, whose leaves carry `method` and
 * `path` (`:name` path params). The fake builds it from its own mounted routes, grouped by the
 * first segment after `/api`.
 */
export function describeApi(routes: { method: string; path: string }[]) {
  const endpoints: Record<string, Record<string, { method: string; path: string }>> = {};
  for (const r of routes) {
    if (r.path === '/api') continue;
    const group = r.path.split('/')[2] as string;
    const leaves = (endpoints[group] ??= {});
    leaves[`${r.method.toLowerCase()}${Object.keys(leaves).length}`] = r;
  }
  return { message: 'Orqea API', endpoints };
}
