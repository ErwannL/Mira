// Installs the pre-commit hook (runs the same gates as CI, minus Docker).
import { existsSync, writeFileSync, chmodSync } from 'node:fs';

if (existsSync('.git')) {
  const hook = '.git/hooks/pre-commit';
  writeFileSync(hook, '#!/bin/sh\nset -e\nnpm run check\n');
  chmodSync(hook, 0o755);
}
