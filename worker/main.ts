import { start } from './start.js';

const ac = new AbortController();
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => ac.abort());
await start(process.env, ac.signal);
