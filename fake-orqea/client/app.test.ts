import { describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { clientScript, installApp } from './app.js';

function setup(html: string, respond: (url: string, init: RequestInit) => { status: number; body?: unknown; bad?: boolean }) {
  const win = new Window({ url: 'http://fake.test/boards/b1' });
  const doc = win.document as unknown as Document;
  doc.body.innerHTML = html;
  const assign = vi.fn();
  Object.defineProperty(win, 'location', { value: { pathname: '/boards/b1', assign }, configurable: true });
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
  const submit = async (form: Element) => {
    form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }) as unknown as Event);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { win, doc, assign, calls, submit };
}

describe('fake orqea browser script', () => {
  it('submits forms as JSON (checkbox, arrays, collected checkboxes) and redirects with the done flash', async () => {
    const { doc, calls, assign, submit } = setup(
      `<form data-api="POST /api/lists/{listId}/cards" data-list-id="l1" data-redirect="/cards/{id}" data-done="card">
        <input name="title" value="T"><input type="checkbox" name="acceptedTerms" checked>
        <input name="questions" data-array value="Q"><input type="checkbox" name="cardIds" value="c1" data-collect checked>
        <input type="checkbox" name="cardIds" value="c2" data-collect><input value="nameless"></form>`,
      () => ({ status: 201, body: { id: 'c9' } }),
    );
    await submit(doc.querySelector('form')!);
    expect(calls[0]!.url).toBe('/api/lists/l1/cards');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ title: 'T', acceptedTerms: true, questions: ['Q'], cardIds: ['c1'] });
    expect(assign).toHaveBeenCalledWith('/cards/c9?done=card');
  });

  it('GET forms send no body; redirects keep existing query strings; missing placeholders become empty', async () => {
    const { doc, calls, assign, submit } = setup(
      `<form data-api="GET /api/export" data-redirect="/qr?id={id}" data-done="export"></form>`,
      () => ({ status: 200, bad: true }),
    );
    await submit(doc.querySelector('form')!);
    expect(calls[0]!.init.body).toBeUndefined();
    expect(assign).toHaveBeenCalledWith('/qr?id=&done=export');
  });

  it('stays on the page without redirect/done, and stores a login token', async () => {
    const { doc, assign, submit } = setup(`<form data-api="POST /api/auth/login"></form>`, () => ({ status: 200, body: { token: 'tok' } }));
    await submit(doc.querySelector('form')!);
    expect(doc.cookie).toContain('orqea_token=tok');
    expect(assign).toHaveBeenCalledWith('/boards/b1');
  });

  it('shows the server explanation in a role=alert, reusing it on retries', async () => {
    let n = 0;
    const { doc, submit } = setup(`<form data-api="POST /x"></form>`, () => ({ status: 400, body: n++ ? {} : { message: 'Enter an email' } }));
    const form = doc.querySelector('form')!;
    await submit(form);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('Enter an email');
    await submit(form);
    expect(form.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('Error.');
  });

  it('opens the paywall dialog on 402 with the feature or limit', async () => {
    let body: object = { feature: 'qr' };
    const { doc, submit } = setup(
      `<form data-api="POST /api/qr"></form><div id="paywall" hidden><span data-feature></span><button data-action="close-paywall">x</button></div>`,
      () => ({ status: 402, body }),
    );
    await submit(doc.querySelector('form')!);
    const dialog = doc.getElementById('paywall')!;
    expect(dialog.hidden).toBe(false);
    expect(dialog.querySelector('[data-feature]')!.textContent).toBe('qr');
    body = { limitKey: 'boards' };
    await submit(doc.querySelector('form')!);
    expect(dialog.querySelector('[data-feature]')!.textContent).toBe('boards');
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

  it('handles consent, select mode, onboarding steps and unrelated clicks', () => {
    const { doc } = setup(
      `<div id="cookie-banner"><button data-action="consent" data-value="none">no</button></div>
       <button data-action="select-mode">sel</button><input data-bulk hidden>
       <div data-step="0"><button data-action="next">n</button></div><div data-step="1" hidden></div><p id="plain">p</p>`,
      () => ({ status: 200 }),
    );
    (doc.querySelector('[data-action="consent"]') as HTMLElement).click();
    expect(doc.getElementById('cookie-banner')).toBeNull();
    expect(doc.cookie).toContain('consent=none');
    (doc.querySelector('[data-action="select-mode"]') as HTMLElement).click();
    expect((doc.querySelector('[data-bulk]') as HTMLElement).hidden).toBe(false);
    (doc.querySelector('[data-action="next"]') as HTMLElement).click();
    expect((doc.querySelector('[data-step="1"]') as HTMLElement).hidden).toBe(false);
    (doc.getElementById('plain') as HTMLElement).click();
  });

  it('consent without a banner in the page is harmless', () => {
    const { doc } = setup(`<button data-action="consent" data-value="all">ok</button>`, () => ({ status: 200 }));
    (doc.querySelector('button') as HTMLElement).click();
    expect(doc.cookie).toContain('consent=all');
  });

  it('drag and drop moves a card to a list', async () => {
    const { win, doc, calls, assign } = setup(
      `<a data-card-id="c1" draggable="true">card</a><section data-list-id="l3"><h2>Done</h2></section><p id="out">x</p>`,
      () => ({ status: 200 }),
    );
    const store = new Map<string, string>();
    const dt = { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? '' };
    const fire = (type: string, target: Element) => {
      const ev = new win.Event(type, { bubbles: true, cancelable: true }) as unknown as DragEvent;
      Object.defineProperty(ev, 'dataTransfer', { value: dt });
      target.dispatchEvent(ev);
      return ev;
    };
    const zone = doc.querySelector('h2')!;
    expect(fire('drop', zone).defaultPrevented).toBe(false); // nothing dragged yet
    fire('dragstart', doc.getElementById('out')!);
    fire('dragstart', doc.querySelector('[data-card-id]')!);
    expect(fire('dragover', zone).defaultPrevented).toBe(true);
    expect(fire('dragover', doc.getElementById('out')!).defaultPrevented).toBe(false);
    fire('drop', doc.getElementById('out')!);
    fire('drop', zone);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls[0]!.url).toBe('/api/cards/c1');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ listId: 'l3' });
    expect(assign).toHaveBeenCalledWith('/boards/b1?done=moved');
  });

  it('serves itself as a self-invoking script', () => {
    expect(clientScript()).toMatch(/^\(function installApp|^\(function/);
    expect(clientScript()).toContain('(document, window, window.fetch.bind(window))');
  });
});
