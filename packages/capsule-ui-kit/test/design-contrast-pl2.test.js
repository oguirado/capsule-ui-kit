import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';

// PL2 K3: light-scheme text contrast (medium pl1-004..007, pl1-009,
// pl1-011..016, pl1-033..037 + low pl1-040/043/044, same token cause), the
// global focus-visible ring and the SkipLink component (pl1-017).

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const tokens = JSON.parse(text('src/design/tokens.json'));
const css = text('src/design/theme.css');

function luminance(hex) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** srgb mix of two hex colors, t = weight of the first. */
function mix(a, b, t) {
  const pa = a.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const pb = b.slice(1).match(/../g).map((x) => parseInt(x, 16));
  return `#${pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

test('token contract validates and other schemes keep their values', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0);
  assert.equal(tokenValue('semantic.text.disabled', 'dark.normal'), '#908fa0');
  assert.equal(tokenValue('semantic.text.accent', 'dark.normal'), '#c0c1ff');
  assert.equal(tokenValue('semantic.accent.tertiary', 'dark.normal'), '#89ceff');
  assert.equal(tokenValue('semantic.status.success.icon', 'dark.normal'), '#34d399');
  assert.equal(tokenValue('semantic.text.muted', 'light.normal'), '#475569');
  assert.equal(tokenValue('semantic.accent.primary', 'light.normal'), '#2563eb');
});

test('PL2 light text tokens resolve to the AA palette', () => {
  assert.equal(tokenValue('semantic.text.disabled', 'light.normal'), '#475569');
  assert.equal(tokenValue('semantic.text.accent', 'light.normal'), '#1d4ed8');
  assert.equal(tokenValue('semantic.accent.tertiary', 'light.normal'), '#0e7490');
  assert.equal(tokenValue('semantic.status.success.icon', 'light.normal'), '#047857');
});

test('every light text token reaches 4.5:1 on its painted surfaces', () => {
  const bgNames = ['canvas', 'panel', 'chrome', 'elevated', 'sunken', 'interactive', 'hoverS1'];
  const bgs = Object.fromEntries(bgNames.map((name) => [name, tokenValue(`semantic.surface.${name}`, 'light.normal')]));
  for (const fg of ['primary', 'muted', 'secondary', 'disabled']) {
    const color = tokenValue(`semantic.text.${fg}`, 'light.normal');
    for (const [name, bg] of Object.entries(bgs)) {
      assert.ok(contrast(color, bg) >= 4.5, `light/${fg}/${name}: ${contrast(color, bg)}`);
    }
  }
  // Selected filter tab on sunken (pl1-040 "All (0)").
  const accent = tokenValue('semantic.text.accent', 'light.normal');
  assert.ok(contrast(accent, bgs.sunken) >= 4.5, `light/accent/sunken: ${contrast(accent, bgs.sunken)}`);
  assert.ok(contrast(accent, bgs.panel) >= 4.5, `light/accent/panel: ${contrast(accent, bgs.panel)}`);
  // Tertiary text: NEW pill, active chip, avatar, inbox tag (pl1-043).
  const tertiary = tokenValue('semantic.accent.tertiary', 'light.normal');
  const pill = mix(tokenValue('semantic.accent.tertiaryContainer', 'light.normal'), bgs.panel, 0.3);
  assert.ok(contrast(tertiary, pill) >= 4.5, `light/tertiary/pill: ${contrast(tertiary, pill)}`);
  assert.ok(contrast(tertiary, tokenValue('semantic.status.info.surface', 'light.normal')) >= 4.5, 'light/tertiary/chip');
  assert.ok(contrast(tertiary, bgs.panel) >= 4.5, `light/tertiary/panel: ${contrast(tertiary, bgs.panel)}`);
  // Success price on panel (pl1-044).
  const icon = tokenValue('semantic.status.success.icon', 'light.normal');
  assert.ok(contrast(icon, bgs.panel) >= 4.5, `light/success-icon/panel: ${contrast(icon, bgs.panel)}`);
  // Tertiary graphic strokes keep non-text contrast on sunken/canvas.
  assert.ok(contrast(tertiary, bgs.sunken) >= 3, 'light/tertiary-stroke/sunken');
  assert.ok(contrast(tertiary, bgs.canvas) >= 3, 'light/tertiary-stroke/canvas');
});

test('theme.css light block mirrors the token references', () => {
  const start = css.indexOf(':root[data-theme-scheme="light"][data-theme-contrast="normal"]');
  assert.ok(start >= 0);
  const block = css.slice(start, css.indexOf('}', start));
  assert.ok(block.includes('--cuk-semantic-text-disabled: var(--cuk-primitive-color-neutral-600);'));
  assert.ok(block.includes('--cuk-semantic-text-accent: var(--cuk-primitive-color-accent-700);'));
  assert.ok(block.includes('--cuk-semantic-accent-tertiary: var(--cuk-primitive-color-cyan-700);'));
  assert.ok(block.includes('--cuk-semantic-status-success-icon: var(--cuk-primitive-color-emerald-700);'));
});

test('global focus-visible ring exists and uses tokens only (pl1-017)', () => {
  assert.ok(css.includes(':focus-visible {'));
  assert.ok(css.includes('outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);'));
  assert.ok(css.includes('outline-offset: var(--cuk-semantic-focus-ring-offset);'));
});

test('SkipLink compiles as plain JS with tokens only and a stable id/role/name', () => {
  const file = 'SkipLink.vue';
  const source = text('src/shell/SkipLink.vue');
  const { descriptor, errors } = parse(source, { filename: file });
  assert.deepEqual(errors, [], file);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
  const script = compileScript(descriptor, { id: 'design-contrast-pl2' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: file,
    id: 'design-contrast-pl2',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, [], file);
  const themeVars = new Set(Array.from(css.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((m) => m[1]));
  assert.ok(descriptor.styles.length > 0, file);
  for (const style of descriptor.styles) {
    assert.equal(/(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(style.content), false, file);
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(themeVars.has(match[1]), `${file}: undeclared token ${match[1]}`);
    }
  }
  assertPackageImports();
  for (const match of source.matchAll(/from '([^']+)'/g)) {
    assert.equal(match[1], 'vue', `${file}: unexpected import ${match[1]}`);
  }
  assert.ok(source.includes('<a '), 'link role');
  assert.ok(source.includes('data-semantic-anchor'), 'semantic anchor');
  assert.ok(source.includes("default: 'shell/skip-link'"), 'stable id');
  assert.ok(source.includes("default: 'shell/wall'"), 'stable target');
  assert.ok(source.includes("default: 'Skip to main content'"), 'accessible name');
});
