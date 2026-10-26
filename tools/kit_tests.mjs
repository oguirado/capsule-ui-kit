// Runs every test of the owner's kit package. The package's own kit-boundary test forbids kit tests from reading outside the package,
// so no test needs to be skipped in this repository.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const dir = fileURLToPath(new URL('../packages/capsule-ui-kit/test/', import.meta.url));
const files = readdirSync(dir).filter((n) => n.endsWith('.test.js')).sort().map((n) => join(dir, n));
const run = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(run.status ?? 1);
