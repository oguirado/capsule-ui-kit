import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// PL2 K3 (+H1 boot): kit/theme CSS installed before first paint for every
// capsule (F1 styling race). Kit side: synchronous, idempotent installer.
// Consumer side (H1 surface, asserted here): install in main.js pre-mount.

test('theme preset resolves synchronously for every scheme', async () => {
  const { createAuraPreset } = await import('../src/design/aura.js');
  const preset = createAuraPreset();
  assert.ok(!(preset instanceof Promise));
  for (const mode of ['light', 'dark']) {
    const scheme = preset.semantic.colorScheme[mode];
    assert.ok(scheme.text.color && scheme.text.mutedColor, mode);
    assert.ok(scheme.primary.color && scheme.primary.contrastColor, mode);
    assert.ok(scheme.content.background && scheme.content.color, mode);
  }
});

test('installKitTheme is synchronous, idempotent and nonce-gated', async () => {
  const { installKitTheme, isKitThemeInstalled, KIT_THEME_INSTALLED } = await import('../src/design/aura.js');
  assert.equal(typeof KIT_THEME_INSTALLED, 'symbol');
  assert.equal(isKitThemeInstalled(null), false);
  assert.equal(isKitThemeInstalled(undefined), false);
  assert.equal(isKitThemeInstalled({}), false);
  const calls = [];
  const fakeApp = { use(...args) { calls.push(args); return fakeApp; } };
  globalThis.document = { querySelector: () => ({ getAttribute: () => 'pl2-test-nonce' }) };
  try {
    const out = installKitTheme(fakeApp);
    assert.equal(out, fakeApp);
    assert.ok(!(out instanceof Promise));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].csp.nonce, 'pl2-test-nonce');
    assert.ok(calls[0][1].theme.preset);
    assert.equal(isKitThemeInstalled(fakeApp), true);
    installKitTheme(fakeApp);
    assert.equal(calls.length, 1);
  } finally {
    delete globalThis.document;
  }
  const noMeta = { use() { throw new Error('must not register'); } };
  globalThis.document = { querySelector: () => null };
  try {
    assert.throws(() => installKitTheme(noMeta), /Style nonce unavailable/);
    assert.equal(isKitThemeInstalled(noMeta), false);
  } finally {
    delete globalThis.document;
  }
});

test('consumer boot installs the kit theme before mount (H1 surface)', () => {
  const main = readFileSync(new URL('../../../app/shell/src/renderer-v2/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("import 'capsule-ui-kit/theme.css'"), 'theme.css in module graph');
  const install = main.indexOf('installKitTheme(');
  const mount = main.indexOf('.mount(');
  assert.ok(install >= 0, 'installKitTheme called in main.js');
  assert.ok(mount >= 0, 'app mount present in main.js');
  assert.ok(install < mount, 'theme installed before mount');
});
