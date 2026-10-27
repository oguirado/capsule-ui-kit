import { test } from 'node:test';
import assert from 'node:assert/strict';

// PL2 K3 (+H1 boot): kit/theme CSS installed before first paint for every
// capsule (F1 styling race). Kit side: synchronous, idempotent installer.
// Consumer integration is verified separately.

test('theme preset resolves synchronously for every scheme', async () => {
  const { createAuraPreset } = await import('../src/design/aura.js');
  const preset = createAuraPreset();
  assert.ok(!(preset instanceof Promise));
  for (const mode of ['light', 'dark']) {
    const scheme = preset.semantic.colorScheme[mode];
    assert.ok(scheme.text.color && scheme.text.mutedColor, mode);
    assert.ok(scheme.primary.color && scheme.primary.contrastColor, mode);
    assert.equal(scheme.content.background, 'var(--cuk-semantic-surface-panel)', mode);
    assert.equal(scheme.content.color, 'var(--cuk-semantic-text-primary)', mode);
    assert.equal(scheme.text.color, 'var(--cuk-semantic-text-primary)', mode);
    assert.equal(scheme.text.mutedColor, 'var(--cuk-semantic-text-muted)', mode);
    assert.equal(scheme.primary.color, 'var(--cuk-semantic-text-accent)', mode);
    for (const kind of ['select', 'popover', 'modal']) {
      assert.equal(scheme.overlay[kind].background, 'var(--cuk-semantic-surface-elevated)', mode + kind);
      assert.equal(scheme.overlay[kind].color, 'var(--cuk-semantic-text-primary)', mode + kind);
    }
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
    assert.equal(calls[0][1].theme.options.darkModeSelector, ':root[data-theme-scheme$="dark"]');
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
