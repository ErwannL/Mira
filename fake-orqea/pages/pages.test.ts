import { describe, expect, it } from 'vitest';
import { signRunHeader } from '../../shared/synthetic.js';
import { makeFake, NOW, SECRET } from '../test-helpers/fake.js';

async function setup(scenario = {}) {
  const f = await makeFake({}, scenario);
  const u = await f.user();
  const cookie = { cookie: `orqea_token=${u.token}` };
  const board = await f.call('POST', '/api/boards', { name: 'Plan & co' }, u.auth);
  const lists = (await f.call('GET', `/api/boards/${board.json.id}`, undefined, u.auth)).json.lists as { id: string }[];
  const card = await f.call('POST', `/api/lists/${lists[0]!.id}/cards`, { title: 'Call <Bob>' }, u.auth);
  await f.call('POST', `/api/cards/${card.json.id}/checklist`, { text: 'item' }, u.auth);
  await f.call('POST', `/api/cards/${card.json.id}/comments`, { text: 'hello' }, u.auth);
  const page = (url: string, extra: Record<string, string> = {}) => f.call('GET', url, undefined, { ...cookie, ...extra });
  return { f, u, page, boardId: board.json.id as string, cardId: card.json.id as string };
}

describe('public pages', () => {
  it('landing with a cookie banner until consent, in the browser language', async () => {
    const f = await makeFake();
    const en = await f.call('GET', '/');
    expect(en.body).toContain('<html lang="en">');
    expect(en.body).toContain('role="dialog" aria-label="Cookies"');
    expect(en.body).toContain('Sign up');
    const fr = await f.call('GET', '/', undefined, { 'accept-language': 'fr', cookie: 'consent=none' });
    expect(fr.body).toContain('Créer un compte');
    expect(fr.body).not.toContain('role="dialog"');
    const noBanner = await makeFake({}, { cookieBanner: false });
    expect((await noBanner.call('GET', '/')).body).not.toContain('role="dialog"');
  });

  it('signup shows extra fields, and a captcha to real users only', async () => {
    const f = await makeFake({}, { extraSignupFields: 2, captcha: true });
    const real = await f.call('GET', '/signup');
    expect(real.body).toContain('First name');
    expect(real.body).toContain('Last name');
    expect(real.body).not.toContain('Phone number');
    expect(real.body).toContain('I am not a robot');
    const synthetic = await f.call('GET', '/signup', undefined, { 'x-synthetic-run': signRunHeader('r1', SECRET, NOW) });
    expect(synthetic.body).not.toContain('I am not a robot');
    expect(synthetic.headers['x-captcha-would-show']).toBeUndefined();
  });

  it('untranslated scenario leaves French pages in English', async () => {
    const f = await makeFake({}, { untranslated: true });
    const r = await f.call('GET', '/signup', undefined, { 'accept-language': 'fr' });
    expect(r.body).toContain('<html lang="fr">');
    expect(r.body).toContain('Create account');
  });

  it('login, signup done, public form, account deleted, 404 form', async () => {
    const { f, u } = await setup();
    const form = await f.call('POST', '/api/forms', { title: 'Reg', questions: ['Name?', 'Age?'] }, u.auth);
    expect((await f.call('GET', '/login')).body).toContain('data-api="POST /api/auth/login"');
    expect((await f.call('GET', '/signup/done')).body).toContain('Check your inbox');
    const pub = await f.call('GET', `/f/${form.json.id}?done=answer`);
    expect(pub.body).toContain('Your answer 2');
    expect(pub.body).toContain('role="status" aria-label="Answer sent"');
    expect((await f.call('GET', '/f/none')).status).toBe(404);
    expect((await f.call('GET', '/account-deleted')).body).toContain('Account deleted');
  });
});

describe('app pages', () => {
  it('redirect to login without a session', async () => {
    const f = await makeFake();
    const r = await f.call('GET', '/boards');
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/login');
  });

  it('boards, board, card pages with escaping, bulk and flash', async () => {
    const { page, boardId, cardId } = await setup();
    const boards = await page('/boards');
    expect(boards.body).toContain('Your boards');
    expect(boards.body).toContain('Plan &amp; co');
    expect(boards.body).toContain('role="search"');
    const board = await page(`/boards/${boardId}?done=moved`);
    expect(board.body).toContain('aria-label="Done"');
    expect(board.body).toContain('Call &lt;Bob&gt;');
    expect(board.body).toContain('aria-label="Select Call &lt;Bob&gt;"');
    expect(board.body).toContain('role="status" aria-label="Card moved"');
    expect(board.body).toContain('<form id="bulk" data-api="POST /api/cards/bulk"');
    const card = await page(`/cards/${cardId}`);
    expect(card.body).toContain('<option value="medium" selected>');
    expect(card.body).toContain('item');
    expect(card.body).toContain('hello');
    expect((await page(`/boards/${boardId}/automations`)).body).toContain('Create rule');
    expect((await page(`/boards/${boardId}/members`)).body).toContain('Create a guest link');
  });

  it('unknown flash keys and missing objects', async () => {
    const { page, f } = await setup();
    expect((await page('/boards?done=bogus')).body).not.toContain('role="status"');
    for (const url of ['/boards/none', '/cards/none', '/boards/none/automations', '/boards/none/members']) {
      expect((await page(url)).status, url).toBe(404);
    }
    const eve = await f.user('eve@example.com');
    const board = await f.call('POST', '/api/boards', { name: 'E' }, eve.auth);
    const lists = (await f.call('GET', `/api/boards/${board.json.id}`, undefined, eve.auth)).json.lists as { id: string }[];
    const card = await f.call('POST', `/api/lists/${lists[0]!.id}/cards`, { title: 'x' }, eve.auth);
    for (const url of [`/boards/${board.json.id}`, `/cards/${card.json.id}`, `/boards/${board.json.id}/automations`, `/boards/${board.json.id}/members`]) {
      expect((await page(url)).status, url).toBe(404);
    }
  });

  it('unnamed controls scenario strips the accessible name of icon buttons', async () => {
    const { page, boardId } = await setup({ unnamedControls: true });
    const board = await page(`/boards/${boardId}`);
    expect(board.body).toContain('<svg aria-hidden="true"');
    expect(board.body).not.toContain('>Add card<');
  });

  it('onboarding (short and long), calendar, notes, forms, qr, search, settings, billing, checkout', async () => {
    const { page, f, u } = await setup();
    expect((await page('/onboarding')).body).toContain('data-step="2" hidden');
    const long = await setup({ longOnboarding: true });
    expect((await long.page('/onboarding')).body).toContain('please read carefully');
    await f.call('POST', '/api/notes', { text: 'Order flour', remindAt: '2030-01-15' }, u.auth);
    const cal = await page('/calendar?m=1');
    expect(cal.body).toContain('February 2030');
    expect(cal.body).toContain('Order flour');
    expect(cal.body).toContain('name="m" value="2"');
    expect((await page('/calendar?m=abc')).body).toContain('January 2030');
    expect((await page('/calendar')).body).toContain('January 2030');
    expect((await page('/notes')).body).toContain('Remind me on');
    await f.call('POST', '/api/forms', { title: 'Reg', questions: ['Q'] }, u.auth);
    expect((await page('/forms')).body).toContain('Public link');
    u.user.plan = 'pro';
    const qr = await f.call('POST', '/api/qr', { url: 'https://example.org' }, u.auth);
    expect((await page(`/qr?id=${qr.json.id}`)).body).toContain('alt="QR code"');
    expect((await page('/qr')).body).not.toContain('alt="QR code"');
    expect((await page('/search?q=call')).body).toContain('/cards/');
    expect((await page('/search')).body).not.toContain('/cards/');
    const settings = await page('/settings');
    expect(settings.body).toContain('Export my data');
    expect(settings.body).toContain('I understand this cannot be undone');
    const billing = await page('/billing');
    expect(billing.body).toContain('Choose Pro');
    expect(billing.body).toContain('per seat per month');
    expect((await page('/checkout')).body).toContain('Checkout (test mode)');
  });

  it('a QR of someone else is not shown', async () => {
    const { page, f } = await setup();
    const eve = await f.user('eve@example.com');
    eve.user.plan = 'pro';
    const qr = await f.call('POST', '/api/qr', { url: 'https://example.org' }, eve.auth);
    expect((await page(`/qr?id=${qr.json.id}`)).body).not.toContain('alt="QR code"');
  });
});
