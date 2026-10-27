// Must-FAIL controls for tools/kit_digest.mjs: every mutation happens in a scratch copy of the package, never in the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, appendFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = fileURLToPath(new URL('../tools/kit_digest.mjs', import.meta.url));
const pkg = fileURLToPath(new URL('../packages/capsule-ui-kit/', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });

function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'kitdigest-'));
  cpSync(pkg, join(dir, 'kit'), { recursive: true, filter: (src) => !src.split(/[\\/]/).includes('node_modules') });
  return dir;
}

test('the package matches KIT_SOURCE.json', () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^KIT_DIGEST_OK [0-9a-f]{64}$/m);
});

test('a one-byte change fails', () => {
  const dir = scratch();
  try {
    appendFileSync(join(dir, 'kit', 'package.json'), ' ');
    const r = run('--root', join(dir, 'kit'));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /contentHash mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a symlink is refused', () => {
  const dir = scratch();
  try {
    symlinkSync('package.json', join(dir, 'kit', 'linked.json'));
    const r = run('--root', join(dir, 'kit'));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /refusing non-regular entry/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unknown option exits 2', () => {
  assert.equal(run('--bogus').status, 2);
});
