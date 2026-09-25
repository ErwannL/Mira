/** "{{var}}" substitution in strings and JSON body builders. Unknown variables stay visible. */
export function fillTemplate(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);
}

export function buildBody(template: unknown, vars: Record<string, string>): unknown {
  if (typeof template === 'string') return fillTemplate(template, vars);
  if (Array.isArray(template)) return template.map((t) => buildBody(t, vars));
  if (template !== null && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, buildBody(v, vars)]));
  }
  return template;
}

/** Reads "a.0.b" from a JSON value; undefined when missing. */
export function readPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
