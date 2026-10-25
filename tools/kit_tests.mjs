// Runs the owner's kit tests. Two of them read the host application tree (app/shell/...), which this repository does not ship,
// so they cannot pass here; they stay in packages/capsule-ui-kit/ untouched and are skipped by exact name (docs/CI.md).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const HOST_APP_COUPLED = new Set(['capsule-chrome-s1.test.js', 'shell-sidebar-navigation.test.js']);
const dir = fileURLToPath(new URL('../packages/capsule-ui-kit/test/', import.meta.url));
const files = readdirSync(dir).filter((n) => n.endsWith('.test.js') && !HOST_APP_COUPLED.has(n)).sort().map((n) => join(dir, n));
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
