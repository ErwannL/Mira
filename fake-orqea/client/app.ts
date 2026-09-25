/**
 * The fake Orqea's browser script, as self-contained functions: unit-tested in happy-dom and
 * served to real browsers as source text (see clientScript). No imports, no outer closures.
 */
export function fillTpl(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(data[k] ?? ''));
}

export function withDone(url: string, done: string | undefined): string {
  return done ? `${url}${url.includes('?') ? '&' : '?'}done=${done}` : url;
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
      data[el.name] = el.checked;
    } else {
      data[el.name] = el.dataset.array !== undefined ? [el.value] : el.value;
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
  const [method, pathTpl] = (form.dataset.api as string).split(' ') as [string, string];
  const res = await fetchImpl(fillTpl(pathTpl, form.dataset), {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(collectForm(form)),
    credentials: 'same-origin',
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 402) return showPaywall(doc, body);
  if (!res.ok) return alertIn(doc, form, String(body.message ?? 'Error.'));
  if (typeof body.token === 'string')
    doc.cookie = `orqea_token=${body.token}; path=/; SameSite=Lax`;
  win.location.assign(
    withDone(fillTpl(form.dataset.redirect ?? win.location.pathname, body), form.dataset.done),
  );
}

export function onAction(doc: Document, el: HTMLElement): void {
  const action = el.dataset.action;
  if (action === 'consent') {
    doc.cookie = `consent=${el.dataset.value}; path=/; SameSite=Lax`;
    doc.getElementById('cookie-banner')?.remove();
  } else if (action === 'select-mode') {
    doc.querySelectorAll<HTMLElement>('[data-bulk]').forEach((e) => (e.hidden = false));
  } else if (action === 'next') {
    const step = el.closest('[data-step]') as HTMLElement;
    step.hidden = true;
    (step.nextElementSibling as HTMLElement).hidden = false;
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
    if (el) onAction(doc, el);
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
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listId: zone.dataset.listId }),
      credentials: 'same-origin',
    });
    win.location.assign(withDone(win.location.pathname, 'moved'));
  });
}

export function clientScript(): string {
  const parts = [
    fillTpl,
    withDone,
    collectForm,
    alertIn,
    showPaywall,
    submitForm,
    onAction,
    installApp,
  ]
    .map(String)
    .join('\n');
  return `(() => {\n${parts}\ninstallApp(document, window, window.fetch.bind(window));\n})();\n`;
}
