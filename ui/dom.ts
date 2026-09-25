type Attrs = Record<string, string | boolean | ((ev: Event) => void)>;

/** Tiny element builder: text children are always text nodes (no innerHTML anywhere). */
export function h(
  doc: Document,
  tag: string,
  attrs: Attrs = {},
  ...children: (Node | string | null)[]
): HTMLElement {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children)
    if (c !== null) el.append(typeof c === 'string' ? doc.createTextNode(c) : c);
  return el;
}

export function table(doc: Document, head: string[], rows: (Node | string)[][]): HTMLElement {
  return h(
    doc,
    'table',
    {},
    h(doc, 'thead', {}, h(doc, 'tr', {}, ...head.map((x) => h(doc, 'th', { scope: 'col' }, x)))),
    h(doc, 'tbody', {}, ...rows.map((r) => h(doc, 'tr', {}, ...r.map((c) => h(doc, 'td', {}, c))))),
  );
}
