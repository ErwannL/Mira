import { describe, expect, it } from 'vitest';
import { signRunHeader } from '../../shared/synthetic.js';
import { makeFake, NOW, SECRET, withBoard } from '../test-helpers/fake.js';

async function setup(scenario = {}) {
  const w = await withBoard(scenario);
  const { f, u, cardId } = w;
  await f.call('PUT', `/api/cards/${cardId}`, { title: 'Call <Bob>' }, u.auth);
  await f.call('POST', `/api/cards/${cardId}/checklist/items`, { title: 'item' }, u.auth);
  await f.call('POST', `/api/cards/${cardId}/comments`, { content: 'hello' }, u.auth);
  const cookie = { cookie: `orqea_token=${u.token}` };
  const page = (url: string, extra: Record<string, string> = {}) =>
    f.call('GET', url, undefined, { ...cookie, ...extra });
  return { ...w, page };
}

describe('public pages', () => {
  it('landing with a cookie banner until consent, in the browser language', async () => {
    const f = await makeFake();
    const en = await f.call('GET', '/');
    expect(en.body).toContain('<html lang="en">');
    expect(en.body).toContain('role="dialog" aria-label="Cookies"');
    expect(en.body).toContain('>Try the beta</a>');
    const fr = await f.call('GET', '/', undefined, {
      'accept-language': 'fr',
      cookie: 'consent=none',
    });
    expect(fr.body).toContain('Essayer la bêta');
    expect(fr.body).not.toContain('role="dialog"');
    const noBanner = await makeFake({}, { cookieBanner: false });
    expect((await noBanner.call('GET', '/')).body).not.toContain('role="dialog"');
  });

  it('signup: username, email, password, required terms; extras and captcha scenarios', async () => {
    const f = await makeFake({}, { extraSignupFields: 2, captcha: true });
    const real = await f.call('GET', '/signup');
    expect(real.body).toContain('Username');
    expect(real.body).toContain('I accept the terms of use and the privacy policy');
    expect(real.body).toContain('required data-invalid="Please accept');
    expect(real.body).toContain('First name');
    expect(real.body).not.toContain('Phone number');
    expect(real.body).toContain('I am not a robot');
    const synthetic = await f.call('GET', '/signup', undefined, {
      'x-synthetic-run': signRunHeader('r1', SECRET, NOW),
    });
    expect(synthetic.body).not.toContain('I am not a robot');
    expect(synthetic.headers['x-captcha-would-show']).toBeUndefined();
  });

  it('untranslated scenario leaves French pages in English', async () => {
    const f = await makeFake({}, { untranslated: true });
    const r = await f.call('GET', '/signup', undefined, { 'accept-language': 'fr' });
    expect(r.body).toContain('<html lang="fr">');
    expect(r.body).toContain('>Sign up</button>');
  });

  it('signup done (undelivered status), verify-email page, login', async () => {
    const f = await makeFake();
    expect((await f.call('GET', '/signup/done')).body).toContain(
      '<p role="status">Account created, but',
    );
    await f.call('POST', '/api/auth/register', {
      email: 'ann@example.com',
      password: 'Str0ngPassword1!',
    });
    const token = f.deps.store.userByEmail('ann@example.com')!.verifyToken;
    const ok = await f.call('GET', `/verify-email?token=${token}`);
    expect(ok.body).toContain('<h2>Email verified — you can now log in</h2>');
    const again = await f.call('GET', `/verify-email?token=${token}`);
    expect([again.status, again.body.includes('Verification failed')]).toEqual([400, true]);
    expect((await f.call('GET', '/login')).body).toContain('data-api="POST /api/auth/login"');
  });

  it('public form page, with thanks after sending; 404 for an unknown token', async () => {
    const { f, u, boardId, lists } = await setup();
    const board = f.deps.store.boards.get(boardId)!;
    const created = await f.call(
      'POST',
      `/api/boards/${boardId}/forms`,
      {
        title: 'Reg',
        config: {
          target_list_id: lists[0]!.id,
          label_ids: [board.labels[0]!.id],
          fields: [
            { id: 'name', label: 'Your name?', required: true },
            { id: 'age', label: 'Age' },
          ],
          title_field: 'name',
        },
      },
      u.auth,
    );
    const token = (created.json.form as { public_token: string }).public_token;
    const pub = await f.call('GET', `/forms/${token}?done=answer`);
    expect(pub.body).toContain('name="values.name"');
    expect(pub.body).toContain('Send my request');
    expect(pub.body).toContain('<p role="status">Thank you</p>');
    expect((await f.call('GET', '/forms/none')).status).toBe(404);
  });
});

describe('app pages', () => {
  it('redirect to login without a session', async () => {
    const f = await makeFake();
    for (const url of ['/dashboard', '/board/1', '/card/1', '/settings', '/billing']) {
      const r = await f.call('GET', url);
      expect([r.status, r.headers.location], url).toEqual([302, '/login']);
    }
  });

  it('dashboard: empty state and getting started (short, long, dismissed)', async () => {
    const f = await makeFake({}, { longOnboarding: true });
    const u = await f.user();
    const page = () => f.call('GET', '/dashboard', undefined, { cookie: `orqea_token=${u.token}` });
    const first = (await page()).body;
    expect(first).toContain('Create your first board');
    expect(first).toContain('data-redirect="/board/{board.id}"');
    expect(first).toContain('Hide getting started');
    expect(first).toContain('retention policies');
    await f.call('POST', '/api/onboarding/checklist/dismiss', {}, u.auth);
    await f.call('POST', '/api/boards', { title: 'Mine' }, u.auth);
    const later = (await page()).body;
    expect(later).not.toContain('Create your first board');
    expect(later).not.toContain('Hide getting started');
    expect(later).toContain('data-href="/board/');
    const short = await setup();
    expect((await short.page('/dashboard')).body).toContain('A board brings together');
  });

  it('board page: lists, cards (hard-coded French labels), panels, add forms, escaping', async () => {
    const { page, boardId } = await setup();
    const body = (await page(`/board/${boardId}?open=rules-panel`)).body;
    expect(body).toContain('aria-label="Ouvrir la tâche Call &lt;Bob&gt;"');
    expect(body).toContain('aria-label="Sélectionner la tâche Call &lt;Bob&gt;"');
    expect(body).toContain('<h2>done</h2>');
    expect(body).toContain('+ Add a card');
    expect(body).toContain('placeholder="Title"');
    expect(body).toContain('aria-label="Add the new list"');
    expect(body).toContain('<div id="rules-panel">');
    expect(body).toContain('<div id="members-panel" hidden>');
    expect(body).toContain('data-one="{count} card selected"');
    expect((await page('/board/999')).status).toBe(404);
  });

  it('board page shows rules and forms once created', async () => {
    const { f, u, page, boardId, lists } = await setup();
    await f.call(
      'POST',
      `/api/boards/${boardId}/rules`,
      { name: 'R1', trigger: { type: 'card_created' }, actions: [{ type: 'complexity.set' }] },
      u.auth,
    );
    const board = f.deps.store.boards.get(boardId)!;
    await f.call(
      'POST',
      `/api/boards/${boardId}/forms`,
      {
        title: 'Reg',
        config: {
          target_list_id: lists[0]!.id,
          label_ids: [board.labels[0]!.id],
          fields: [{ id: 'n', label: 'N' }],
          title_field: 'n',
        },
      },
      u.auth,
    );
    const body = (await page(`/board/${boardId}`)).body;
    expect(body).toContain('<li>R1</li>');
    expect(body).toContain('Copy public link');
    // A board without lists still renders its form panel.
    const bare = await f.call('POST', '/api/boards', { title: 'Bare' }, u.auth);
    const bareId = (bare.json.board as { id: number }).id;
    expect((await page(`/board/${bareId}`)).body).not.toContain('target_list_id&quot;:');
  });

  it('card page: unnamed rich-text editors, priorities, checklist, comments', async () => {
    const { f, u, page, boardId, cardId } = await setup();
    await f.call('POST', `/api/boards/${boardId}/priorities`, { title: 'High' }, u.auth);
    const body = (await page(`/card/${cardId}?open=activity`)).body;
    expect(body).toContain('<div aria-label="Description"><div contenteditable="true">');
    expect(body).toContain('>High</option>');
    expect(body).toContain('aria-label="Add item"');
    expect(body).toContain('aria-label="Add check"');
    expect(body).toContain('<li>hello</li>');
    expect(body).toContain('<div id="activity">');
    expect((await page('/card/999')).status).toBe(404);
  });

  it('unnamed controls scenario strips the accessible name of icon buttons', async () => {
    const { page, boardId } = await setup({ unnamedControls: true });
    expect((await page(`/board/${boardId}`)).body).toContain('<svg aria-hidden="true"');
  });

  it('calendar, qr, settings (preferences, privacy), profile, billing, checkout', async () => {
    const { f, u, page } = await setup();
    expect((await page('/calendar')).body).toContain('<h1>📅 My calendar</h1>');
    // /stats is gated in the page (no 402), like Orqea's RequireFeature.
    expect((await page('/stats')).body).toContain('<h1>Unlock advanced analytics</h1>');
    u.user.plan = 'pro';
    expect((await page('/stats')).body).toContain('<h1>My statistics</h1>');
    await f.call('POST', '/api/qr-codes', { label: 'Poster', targetUrl: 'https://e.org' }, u.auth);
    const other = await f.user('bob@example.com');
    other.user.plan = 'pro';
    await f.call(
      'POST',
      '/api/qr-codes',
      { label: 'Hidden', targetUrl: 'https://e.org' },
      other.auth,
    );
    const qr = (await page('/qr')).body;
    expect(qr).toContain('<li>Poster</li>');
    expect(qr).not.toContain('Hidden');
    const prefs = (await page('/settings?done=settings')).body;
    expect(prefs).toContain('aria-label="Select the dark theme"');
    expect(prefs).toContain('<p role="status">Theme saved!</p>');
    const privacy = (await page('/settings?tab=privacy&open=delete-confirm')).body;
    expect(privacy).toContain('Download my data (JSON)');
    expect(privacy).toContain('<label for="delete-confirm-input">To confirm');
    expect(privacy).not.toMatch(/id="delete-confirm"[^>]* hidden/);
    expect((await page('/settings?tab=privacy')).body).toMatch(/id="delete-confirm"[^>]* hidden/);
    const profile = (await page('/profile?open=profile-edit')).body;
    expect(profile).toContain('<p>Preferred language</p><select name="language">');
    expect(profile).not.toMatch(/id="profile-edit"[^>]* hidden/);
    expect((await page('/profile')).body).toMatch(/id="profile-edit"[^>]* hidden/);
    const billing = (await page('/billing')).body;
    expect(billing).toContain('<h1>Billing &amp; plans</h1>');
    expect(billing).toContain('Choose Pro');
    expect(billing).toContain('Contact us');
    expect(billing).not.toContain('Choose Free');
    expect(billing).not.toContain('Choose Enterprise');
    expect((await page('/checkout')).body).toContain('Stripe test mode');
  });

  it('header: sidebar boards, search dialog, notes panel (open after saving)', async () => {
    const { f, u, page } = await setup();
    await f.call('POST', '/api/notes', { content: 'Order flour' }, u.auth);
    const body = (await page('/dashboard?open=notes-panel')).body;
    expect(body).toContain('aria-label="Main navigation"');
    expect(body).toContain('<button type="button" aria-label="Search"');
    expect(body).toContain('aria-label="Search a card across all your boards"');
    expect(body).toContain('<div id="notes-panel"><ul><li>Order flour</li>');
    expect(body).toContain('data-redirect="/dashboard?open=notes-panel"');
    expect((await page('/dashboard')).body).toContain('<div id="notes-panel" hidden>');
    expect((await page('/dashboard?done=unknown')).body).not.toContain('role="status"');
  });
});
