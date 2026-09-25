import { makeFake, SECRET } from '../../fake-orqea/test-helpers/fake.js';
import type { FakeConfig } from '../../fake-orqea/context.js';
import type { Scenario } from '../../fake-orqea/scenario.js';
import { signRunHeader } from '../../shared/synthetic.js';

/** The fake Orqea listening on a random loopback port, with real clocks. */
export async function liveFake(cfg: Partial<FakeConfig> = {}, scenario: Partial<Scenario> = {}) {
  const f = await makeFake({ nowS: () => Math.floor(Date.now() / 1000), ...cfg }, scenario);
  await f.app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = f.app.server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${port}`;
  const runHeader = (runId = 'r1') => signRunHeader(runId, SECRET, Math.floor(Date.now() / 1000));
  return { ...f, baseUrl, runHeader, close: () => f.app.close() };
}
