import { execSync } from 'node:child_process';

/** Files tracked or about to be tracked by git (respects .gitignore). */
export function repoFiles() {
  return execSync('git ls-files --cached --others --exclude-standard', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}
