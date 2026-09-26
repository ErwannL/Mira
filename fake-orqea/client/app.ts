/**
 * The fake Orqea's browser script, as self-contained functions: unit-tested in happy-dom and
 * served to real browsers as source text (see clientScript). No imports, no outer closures.
 */

/** "{board.id}" style substitution from a (nested) JSON response. */
export function fillTpl(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{([\w.]+)\}/g, (_m, k: string) => {
    let cur: unknown = data;
    for (const part of k.split('.'))
      cur = cur !== null && typeof cur === 'object' ? (cur as Record<string, unknown>)[part] : '';
    return String(cur ?? '');
  });
}

export function withDone(url: string, done: string | undefined): string {
  return done ? `${url}${url.includes('?') ? '&' : '?'}done=${done}` : url;
}

/** Sets `data.a.b = value` for a field named "a.b" (Orqea's nested bodies, e.g. form `values`). */
export function put(data: Record<string, unknown>, name: string, value: unknown): void {
  const parts = name.split('.');
  let obj = data;
  for (const p of parts.slice(0, -1)) {
    obj[p] = obj[p] ?? {};
    obj = obj[p] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1] as string] = value;
}

export function collectForm(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name) continue;
    if (el.type === 'checkbox' && el.dataset.collect !== undefined) {
      const list = (data[el.name] as string[] | undefined) ?? [];
      if (el.checked) list.push(el.value);
      data[el.name] = list;
    } else if (el.type === 'checkbox') {
      put(data, el.name, el.checked);
    } else {
      put(data, el.name, el.dataset.json !== undefined ? JSON.parse(el.value) : el.value);
    }
  }
  return data;
}

export function alertIn(doc: Document, form: HTMLFormElement, message: string): void {
  let el = form.querySelector('[role="alert"]');
  if (!el) {
    el = doc.createElement('p');
    el.setAttribute('role', 'alert');
    form.prepend(el);
  }
  el.textContent = message;
}

export function showPaywall(doc: Document, body: Record<string, unknown>): void {
  const dialog = doc.getElementById('paywall') as HTMLElement;
  dialog.hidden = false;
  (dialog.querySelector('[data-feature]') as HTMLElement).textContent = String(
    body.feature ?? body.limitKey ?? '',
  );
}

export async function submitForm(
  doc: Document,
  win: Window,
  fetchImpl: typeof fetch,
  form: HTMLFormElement,
): Promise<void> {
  // Like Orqea's signup: a required checkbox left unticked is refused before any request.
  const unticked = form.querySelector<HTMLInputElement>('input[type="checkbox"][required]');
  if (unticked && !unticked.checked) return alertIn(doc, form, String(unticked.dataset.invalid));
  const [method, pathTpl] = (form.dataset.api as string).split(' ') as [string, string];
  const res = await fetchImpl(fillTpl(pathTpl, form.dataset), {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(collectForm(form)),
    credentials: 'same-origin',
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 402) return showPaywall(doc, body);
  if (!res.ok) {
    // Orqea's short message plus its `issues` (what exactly is wrong), or its error code.
    const issues = Array.isArray(body.issues) ? body.issues.map(String) : [];
    const why = [String(body.message ?? body.code ?? 'Error.'), ...issues].join(' ');
    return alertIn(doc, form, why);
  }
  if (typeof body.token === 'string')
    doc.cookie = `orqea_token=${body.token}; path=/; SameSite=Lax`;
  win.location.assign(
    withDone(fillTpl(form.dataset.redirect ?? win.location.pathname, body), form.dataset.done),
  );
}

/** "1 card selected" / "2 cards selected", in the page's language (templates on the element). */
export function updateSelection(doc: Document): void {
  const n = doc.querySelectorAll('input[data-select]:checked').length;
  const out = doc.querySelector('[data-selected-count]') as HTMLElement;
  const tpl = (n === 1 ? out.dataset.one : out.dataset.other) as string;
  out.textContent = tpl.replace('{count}', String(n));
  out.hidden = n === 0;
}

/** Live search in the search dialog; results open the card's board. */
export async function runSearch(doc: Document, fetchImpl: typeof fetch, q: string): Promise<void> {
  const res = await fetchImpl(`/api/search?q=${encodeURIComponent(q)}`, {
    credentials: 'same-origin',
  });
  const { cards } = (await res.json()) as { cards: { title: string; board_id: number }[] };
  const list = doc.querySelector('[data-search-results]') as HTMLElement;
  list.replaceChildren(
    ...cards.map((c) => {
      const li = doc.createElement('li');
      const b = doc.createElement('button');
      b.type = 'button';
      b.dataset.action = 'go';
      b.dataset.href = `/board/${c.board_id}`;
      b.textContent = c.title;
      li.append(b);
      return li;
    }),
  );
}

export function onAction(doc: Document, win: Window, el: HTMLElement): void {
  const action = el.dataset.action;
  if (action === 'consent') {
    doc.cookie = `consent=${el.dataset.value}; path=/; SameSite=Lax`;
    doc.getElementById('cookie-banner')?.remove();
  } else if (action === 'select-mode') {
    doc.querySelectorAll<HTMLElement>('[data-bulk]').forEach((e) => (e.hidden = false));
  } else if (action === 'toggle') {
    const target = doc.getElementById(el.dataset.target as string) as HTMLElement;
    target.hidden = !target.hidden;
  } else if (action === 'go') {
    win.location.assign(el.dataset.href as string);
  } else if (action === 'close-paywall') {
    (doc.getElementById('paywall') as HTMLElement).hidden = true;
  }
}

export function installApp(doc: Document, win: Window, fetchImpl: typeof fetch): void {
  doc.addEventListener('submit', async (ev) => {
    const form = ev.target as HTMLFormElement;
    if (!form.dataset.api) return;
    ev.preventDefault();
    await submitForm(doc, win, fetchImpl, form);
  });
  doc.addEventListener('click', (ev) => {
    const el = (ev.target as Element).closest('[data-action]') as HTMLElement | null;
    if (el) onAction(doc, win, el);
  });
  doc.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset.search !== undefined) void runSearch(doc, fetchImpl, el.value);
  });
  doc.addEventListener('change', (ev) => {
    if ((ev.target as HTMLElement).dataset.select !== undefined) updateSelection(doc);
  });
  doc.addEventListener('dragstart', (ev) => {
    const card = (ev.target as Element).closest('[data-card-id]') as HTMLElement | null;
    if (card) ev.dataTransfer?.setData('text/plain', card.dataset.cardId as string);
  });
  doc.addEventListener('dragover', (ev) => {
    if ((ev.target as Element).closest('[data-list-id]')) ev.preventDefault();
  });
  doc.addEventListener('drop', async (ev) => {
    const zone = (ev.target as Element).closest('[data-list-id]') as HTMLElement | null;
    const cardId = ev.dataTransfer?.getData('text/plain');
    if (!zone || !cardId) return;
    ev.preventDefault();
    await fetchImpl(`/api/cards/${cardId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ list_id: zone.dataset.listId }),
      credentials: 'same-origin',
    });
    win.location.assign(withDone(win.location.pathname, 'moved'));
  });
}

export function clientScript(): string {
  const parts = [
    fillTpl,
    withDone,
    put,
    collectForm,
    alertIn,
    showPaywall,
    submitForm,
    updateSelection,
    runSearch,
    onAction,
    installApp,
  ]
    .map(String)
    .join('\n');
  return `(() => {\n${parts}\ninstallApp(document, window, window.fetch.bind(window));\n})();\n`;
}
