/**
 * The fake Orqea's browser script, written as one self-contained function: it is unit-tested in
 * happy-dom and served to real browsers as `(${installApp})(document, window, fetch)`.
 * It must not reference anything outside its own body.
 */
export function installApp(doc: Document, win: Window, fetchImpl: typeof fetch): void {
  const fill = (tpl: string, data: Record<string, unknown>): string =>
    tpl.replace(/\{(\w+)\}/g, (_m, k: string) => String(data[k] ?? ''));
  const go = (url: string): void => win.location.assign(url);
  const withDone = (url: string, done: string | undefined): string =>
    done ? `${url}${url.includes('?') ? '&' : '?'}done=${done}` : url;

  const collect = (form: HTMLFormElement): Record<string, unknown> => {
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
  };

  const alertIn = (form: HTMLFormElement, message: string): void => {
    let el = form.querySelector('[role="alert"]');
    if (!el) {
      el = doc.createElement('p');
      el.setAttribute('role', 'alert');
      form.prepend(el);
    }
    el.textContent = message;
  };

  const paywall = (body: Record<string, unknown>): void => {
    const dialog = doc.getElementById('paywall') as HTMLElement;
    dialog.hidden = false;
    (dialog.querySelector('[data-feature]') as HTMLElement).textContent = String(body.feature ?? body.limitKey ?? '');
  };

  doc.addEventListener('submit', async (ev) => {
    const form = ev.target as HTMLFormElement;
    const spec = form.dataset.api;
    if (!spec) return;
    ev.preventDefault();
    const [method, pathTpl] = spec.split(' ') as [string, string];
    const res = await fetchImpl(fill(pathTpl, form.dataset), {
      method,
      headers: { 'content-type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(collect(form)),
      credentials: 'same-origin',
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 402) return paywall(body);
    if (!res.ok) return alertIn(form, String(body.message ?? 'Error.'));
    if (typeof body.token === 'string') doc.cookie = `orqea_token=${body.token}; path=/; SameSite=Lax`;
    go(withDone(fill(form.dataset.redirect ?? win.location.pathname, body), form.dataset.done));
  });

  doc.addEventListener('click', (ev) => {
    const el = (ev.target as Element).closest('[data-action]') as HTMLElement | null;
    const action = el?.dataset.action;
    if (action === 'consent') {
      doc.cookie = `consent=${el?.dataset.value}; path=/; SameSite=Lax`;
      doc.getElementById('cookie-banner')?.remove();
    } else if (action === 'select-mode') {
      doc.querySelectorAll<HTMLElement>('[data-bulk]').forEach((e) => (e.hidden = false));
    } else if (action === 'next') {
      const step = el?.closest('[data-step]') as HTMLElement;
      step.hidden = true;
      (step.nextElementSibling as HTMLElement).hidden = false;
    } else if (action === 'close-paywall') {
      (doc.getElementById('paywall') as HTMLElement).hidden = true;
    }
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
    go(withDone(win.location.pathname, 'moved'));
  });
}

export function clientScript(): string {
  return `(${installApp.toString()})(document, window, window.fetch.bind(window));\n`;
}
