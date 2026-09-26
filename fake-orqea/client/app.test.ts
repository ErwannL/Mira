import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { clientScript, installApp } from './app.js';

function setup(
  html: string,
  respond: (url: string, init: RequestInit) => { status: number; body?: unknown; bad?: boolean },
) {
  const win = new Window({ url: 'http://fake.test/board/1' });
  const doc = win.document as unknown as Document;
  doc.body.innerHTML = html;
  const assign = vi.fn();
  Object.defineProperty(win, 'location', {
    value: { pathname: '/board/1', assign },
    configurable: true,
  });
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = respond(url, init);
    return {
      status: r.status,
      ok: r.status < 400,
      json: async () => {
        if (r.bad) throw new Error('not json');
        return r.body ?? {};
      },
    };
  }) as unknown as typeof fetch;
  installApp(doc, win as unknown as globalThis.Window, fetchImpl);
  const fire = (type: string, target: Element) =>
    target.dispatchEvent(
      new win.Event(type, { bubbles: true, cancelable: true }) as unknown as Event,
    );
  const submit = async (form: Element) => {
    fire('submit', form);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { win, doc, assign, calls, submit, fire };
}

describe('fake orqea browser script', () => {
  it('submits forms as JSON (nested names, JSON fields, collected checkboxes) and redirects', async () => {
    const { doc, calls, assign, submit } = setup(
      `<form data-api="POST /api/lists/{listId}/cards" data-list-id="l1" data-redirect="/card/{card.id}" data-done="card">
        <input name="title" value="T"><input type="checkbox" name="acceptedTerms" checked>
        <input name="values.name" value="Ann"><input name="values.age" value="3"><input type="checkbox" name="values.ok">
        <input type="hidden" name="config" data-json value='{"a":[1]}'><input type="checkbox" name="cardIds" value="c1" data-collect checked>
        <input type="checkbox" name="cardIds" value="c2" data-collect><input value="nameless"></form>`,
      () => ({ status: 201, body: { card: { id: 9 } } }),
    );
    await submit(doc.querySelector('form')!);
    expect(calls[0]!.url).toBe('/api/lists/l1/cards');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      title: 'T',
      acceptedTerms: true,
      values: { name: 'Ann', age: '3', ok: false },
      config: { a: [1] },
      cardIds: ['c1'],
    });
    expect(assign).toHaveBeenCalledWith('/card/9?done=card');
  });

  it('GET forms send no body; redirects keep query strings; missing placeholders become empty', async () => {
    const { doc, calls, assign, submit } = setup(
      `<form data-api="GET /api/export" data-redirect="/qr?id={id}&b={board.id}" data-done="export"></form>`,
      () => ({ status: 200, bad: true }),
    );
    await submit(doc.querySelector('form')!);
    expect(calls[0]!.init.body).toBeUndefined();
    expect(assign).toHaveBeenCalledWith('/qr?id=&b=&done=export');
  });

  it('stays on the page without redirect/done, and stores a login token', async () => {
    const { doc, assign, submit } = setup(`<form data-api="POST /api/auth/login"></form>`, () => ({
      status: 200,
      body: { token: 'tok' },
    }));
    await submit(doc.querySelector('form')!);
    expect(doc.cookie).toContain('orqea_token=tok');
    expect(assign).toHaveBeenCalledWith('/board/1');
  });

  it('shows the server explanation (message, else code) in a role=alert, reusing it', async () => {
    let n = 0;
    const bodies = [
      { message: 'Invalid email', issues: ['Email must contain an @ symbol'] },
      { code: 'INVALID_LABEL' },
      {},
    ];
    const { doc, submit } = setup(`<form data-api="POST /x"></form>`, () => ({
      status: 400,
      body: bodies[n++],
    }));
    const form = doc.querySelector('form')!;
    await submit(form);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe(
      'Invalid email Email must contain an @ symbol',
    );
    await submit(form);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('INVALID_LABEL');
    await submit(form);
    expect(form.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('Error.');
  });

  it('refuses an unticked required checkbox before any request, like Orqea signup', async () => {
    const { doc, calls, submit } = setup(
      `<form data-api="POST /api/auth/register"><input type="checkbox" name="acceptedTerms" required data-invalid="Please accept"></form>`,
      () => ({ status: 201 }),
    );
    const form = doc.querySelector('form')!;
    await submit(form);
    expect(calls).toHaveLength(0);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('Please accept');
    (form.querySelector('input') as HTMLInputElement).checked = true;
    await submit(form);
    expect(calls).toHaveLength(1);
  });

  it('opens the paywall dialog on 402 with the feature or limit', async () => {
    let body: object = { feature: 'qrCodes' };
    const { doc, submit } = setup(
      `<form data-api="POST /api/qr-codes"></form><div id="paywall" hidden><span data-feature></span><button data-action="close-paywall">x</button></div>`,
      () => ({ status: 402, body }),
    );
    await submit(doc.querySelector('form')!);
    const dialog = doc.getElementById('paywall')!;
    expect(dialog.hidden).toBe(false);
    expect(dialog.querySelector('[data-feature]')!.textContent).toBe('qrCodes');
    body = { limitKey: 'maxBoards' };
    await submit(doc.querySelector('form')!);
    expect(dialog.querySelector('[data-feature]')!.textContent).toBe('maxBoards');
    body = {};
    await submit(doc.querySelector('form')!);
    expect(dialog.querySelector('[data-feature]')!.textContent).toBe('');
    (dialog.querySelector('button') as HTMLElement).click();
    expect(dialog.hidden).toBe(true);
  });

  it('ignores plain forms', async () => {
    const { doc, calls, submit } = setup(`<form method="get"></form>`, () => ({ status: 200 }));
    await submit(doc.querySelector('form')!);
    expect(calls).toHaveLength(0);
  });

  it('handles consent, select mode, panels, navigation buttons and unrelated clicks', () => {
    const { doc, assign } = setup(
      `<div id="cookie-banner"><button data-action="consent" data-value="none">no</button></div>
       <button data-action="select-mode">sel</button><input data-bulk hidden>
       <button data-action="toggle" data-target="panel">t</button><div id="panel" hidden></div>
       <button data-action="go" data-href="/board/7">B</button><button data-action="nothing">?</button><p id="plain">p</p>`,
      () => ({ status: 200 }),
    );
    (doc.querySelector('[data-action="consent"]') as HTMLElement).click();
    expect(doc.getElementById('cookie-banner')).toBeNull();
    expect(doc.cookie).toContain('consent=none');
    (doc.querySelector('[data-action="select-mode"]') as HTMLElement).click();
    expect((doc.querySelector('[data-bulk]') as HTMLElement).hidden).toBe(false);
    const toggle = doc.querySelector('[data-action="toggle"]') as HTMLElement;
    toggle.click();
    expect(doc.getElementById('panel')!.hidden).toBe(false);
    toggle.click();
    expect(doc.getElementById('panel')!.hidden).toBe(true);
    (doc.querySelector('[data-action="go"]') as HTMLElement).click();
    expect(assign).toHaveBeenCalledWith('/board/7');
    (doc.querySelector('[data-action="nothing"]') as HTMLElement).click();
    (doc.getElementById('plain') as HTMLElement).click();
  });

  it('consent without a banner in the page is harmless', () => {
    const { doc } = setup(`<button data-action="consent" data-value="all">ok</button>`, () => ({
      status: 200,
    }));
    (doc.querySelector('button') as HTMLElement).click();
    expect(doc.cookie).toContain('consent=all');
  });

  it('counts the selection in the page language (one / other), hidden at zero', () => {
    const { doc, fire } = setup(
      `<input type="checkbox" data-select><input type="checkbox" data-select><input id="other" type="checkbox">
       <p data-selected-count data-one="{count} carte" data-other="{count} cartes" hidden></p>`,
      () => ({ status: 200 }),
    );
    const [a, b] = Array.from(doc.querySelectorAll<HTMLInputElement>('input[data-select]'));
    const out = doc.querySelector('[data-selected-count]') as HTMLElement;
    a!.checked = true;
    fire('change', a!);
    expect([out.textContent, out.hidden]).toEqual(['1 carte', false]);
    b!.checked = true;
    fire('change', b!);
    expect(out.textContent).toBe('2 cartes');
    a!.checked = false;
    b!.checked = false;
    fire('change', a!);
    expect(out.hidden).toBe(true);
    fire('change', doc.getElementById('other')!);
  });

  it("live search renders buttons that open the card's board", async () => {
    const { doc, calls, fire } = setup(
      `<input data-search><input id="plain"><ul data-search-results></ul>`,
      () => ({ status: 200, body: { cards: [{ title: '<b>Call</b>', board_id: 4 }] } }),
    );
    const input = doc.querySelector('[data-search]') as HTMLInputElement;
    input.value = 'call me';
    fire('input', input);
    fire('input', doc.getElementById('plain')!);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map((c) => c.url)).toEqual(['/api/search?q=call%20me']);
    const b = doc.querySelector('[data-search-results] button') as HTMLElement;
    expect(b.textContent).toBe('<b>Call</b>');
    expect(b.dataset.href).toBe('/board/4');
  });

  it('drag and drop moves a card to a list (PUT list_id)', async () => {
    const { win, doc, calls, assign } = setup(
      `<a data-card-id="c1" draggable="true">card</a><section data-list-id="l3"><h2>done</h2></section><p id="out">x</p>`,
      () => ({ status: 200 }),
    );
    const store = new Map<string, string>();
    const dt = {
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
    };
    const drag = (type: string, target: Element) => {
      const ev = new win.Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      target.dispatchEvent(ev);
      return ev;
    };
    const zone = doc.querySelector('h2')!;
    expect(drag('drop', zone).defaultPrevented).toBe(false); // nothing dragged yet
    drag('dragstart', doc.getElementById('out')!);
    drag('dragstart', doc.querySelector('[data-card-id]')!);
    expect(drag('dragover', zone).defaultPrevented).toBe(true);
    expect(drag('dragover', doc.getElementById('out')!).defaultPrevented).toBe(false);
    drag('drop', doc.getElementById('out')!);
    drag('drop', zone);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0]!.url).toBe('/api/cards/c1');
    expect(calls[0]!.init.method).toBe('PUT');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ list_id: 'l3' });
    expect(assign).toHaveBeenCalledWith('/board/1?done=moved');
  });

  it('serves itself as a self-invoking script', () => {
    expect(clientScript()).toContain('function submitForm(');
    expect(clientScript()).toContain('function runSearch(');
    expect(clientScript()).toContain('installApp(document, window, window.fetch.bind(window));');
  });
});
