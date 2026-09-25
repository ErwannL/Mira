import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, whether running from sources (shared/) or compiled (dist/shared/). */
export function repoRoot(from: string = import.meta.url): string {
  const here = dirname(fileURLToPath(from));
  return here.includes(`${join('dist', 'shared')}`) ? join(here, '..', '..') : join(here, '..');
}

export const dataPaths = (root: string) => ({
  personas: join(root, 'personas'),
  catalogue: join(root, 'catalogue'),
  weights: join(root, 'config', 'friction-weights.json'),
  time: join(root, 'config', 'time.json'),
  ui: join(root, 'config', 'common-ui.json'),
});
