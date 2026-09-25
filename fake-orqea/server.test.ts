import { describe, expect, it } from 'vitest';
import { signRunHeader } from '../shared/synthetic.js';
import { makeFake, NOW, SECRET } from './test-helpers/fake.js';

describe('fake orqea server', () => {
  it('serves health, script and stylesheet', async () => {
    const f = await makeFake();
    expect((await f.call('GET', '/health')).json).toEqual({ ok: true });
    const js = await f.call('GET', '/static/app.js');
    expect(js.headers['content-type']).toContain('javascript');
    expect((await f.call('GET', '/static/app.css')).body).toContain('section[data-list-id]');
  });
  it('slow scenario delays pages but never the admin API or static files', async () => {
    const f = await makeFake({}, { slowMs: 60 });
    let t = Date.now();
    await f.call('GET', '/');
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
    t = Date.now();
    await f.call('GET', '/static/app.css');
    await f.call('GET', '/api/admin/synthetic/target', undefined, f.admin);
    expect(Date.now() - t).toBeLessThan(55);
  });
  it('applies the per-run scenario selected by a signed header', async () => {
    const f = await makeFake();
    await f.call('PUT', '/__control/scenario/r5', { extraSignupFields: 3 }, f.admin);
    const run = { 'x-synthetic-run': signRunHeader('r5', SECRET, NOW) };
    expect((await f.call('GET', '/signup', undefined, run)).body).toContain('Phone number');
    expect((await f.call('GET', '/signup')).body).not.toContain('Phone number');
  });
});
