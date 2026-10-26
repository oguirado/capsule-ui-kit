import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';

// PL6 lane M: the terminal session close/empty pair and the viewer chip
// pairs hold their contrast in every scheme. Token values are pinned by
// the legacy snapshots, so the room fixes the component-to-token mapping;
// these tests pin the mapping and the ratios. Chip text uses the primary
// tone on the status surfaces: the status text values stay pinned for
// lane N, while primary clears 4.5:1 on every status surface.

// Every scheme the kit ships, in both contrast modes.
const MODES = Object.freeze([
  'dark.normal', 'dark.high',
  'light.normal', 'light.high',
  'saas-dark.normal', 'saas-dark.high',
  'saas-light.normal', 'saas-light.high',
  'mv-dark.normal', 'mv-dark.high',
  'mv-light.normal', 'mv-light.high',
]);

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const tokens = JSON.parse(text('src/design/tokens.json'));
const css = text('src/design/theme.css');

/**
 * Relative luminance of an opaque hex color.
 * @param {string} hex Opaque sRGB hex color.
 * @returns {number} Relative luminance.
 */
function luminance(hex) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * WCAG contrast ratio of two opaque hex colors.
 * @param {string} a First color.
 * @param {string} b Second color.
 * @returns {number} Contrast ratio.
 */
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Parse a hex or rgb()/rgba() color token value.
 * @param {string} color Token value.
 * @returns {[number, number, number, number]} RGBA channels.
 */
function parseColor(color) {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) {
    const channels = color.slice(1).match(/../g).map((x) => parseInt(x, 16));
    return [...channels, 1];
  }
  return rgba[1].split(',').map(Number);
}

/**
 * Composite a translucent foreground over an opaque background.
 * @param {string} fg Foreground token value.
 * @param {string} bg Opaque background token value.
 * @returns {string} Opaque hex result.
 */
function compositeOver(fg, bg) {
  const [r1, g1, b1, a1] = parseColor(fg);
  const [r2, g2, b2] = parseColor(bg);
  const mix = (f, b) => Math.round(f * a1 + b * (1 - a1));
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Painted info-chip fill: the (possibly translucent) info surface token
 * over the panel backdrop the chip sits on.
 * @param {string} mode Token mode.
 * @returns {string} Opaque hex fill.
 */
function infoFill(mode) {
  const fill = tokenValue('semantic.status.info.surface', mode);
  if (fill.startsWith('#')) return fill;
  return compositeOver(fill, tokenValue('semantic.surface.panel', mode));
}

test('token contract validates for the PL6 terminal pairs', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0);
});

test('PL6 terminal close pair reaches 4.5:1 in every scheme (goal: 3:1 UI)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.secondary', mode), tokenValue('semantic.surface.sunken', mode));
    assert.ok(ratio >= 4.5, `${mode}/close: ${ratio}`);
  }
});

test('PL6 terminal empty pair reaches 4.5:1 in every scheme', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.secondary', mode), tokenValue('semantic.surface.sunken', mode));
    assert.ok(ratio >= 4.5, `${mode}/empty: ${ratio}`);
  }
});

test('PL6 viewer live chip pair reaches 4.5:1 in every scheme', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.primary', mode), tokenValue('semantic.status.success.surface', mode));
    assert.ok(ratio >= 4.5, `${mode}/live: ${ratio}`);
  }
});

test('PL6 viewer endpoint chip pair reaches 4.5:1 in every scheme', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.primary', mode), infoFill(mode));
    assert.ok(ratio >= 4.5, `${mode}/endpoint: ${ratio}`);
  }
});

test('PL6 viewer scaled chip pair reaches 4.5:1 in every scheme', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.elevated', mode));
    assert.ok(ratio >= 4.5, `${mode}/scaled: ${ratio}`);
  }
});

test('PL6 viewer elapsed/resolution pair reaches 4.5:1 in every scheme', () => {
  for (const mode of MODES) {
    const panel = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(panel >= 4.5, `${mode}/elapsed-on-panel: ${panel}`);
    const chrome = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.chrome', mode));
    assert.ok(chrome >= 4.5, `${mode}/elapsed-on-chrome: ${chrome}`);
  }
});

test('PL6 close/empty keep the secondary tone (coupling)', () => {
  const source = text('src/terminal/TerminalSessionTabs.vue');
  const { descriptor } = parse(source, { filename: 'TerminalSessionTabs.vue' });
  const styles = descriptor.styles.map((style) => style.content).join('\n');
  for (const cls of ['cui-terminal-tabs__close', 'cui-terminal-tabs__empty']) {
    const rule = styles.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `.${cls} rule present`);
    assert.ok(
      rule[1].includes('color: var(--cuk-semantic-text-secondary);'),
      `.${cls} keeps the secondary tone`,
    );
  }
});

test('PL6 viewer chips keep the semantic triples (coupling)', () => {
  const source = text('src/saas/SaasViewerChips.vue');
  const { descriptor } = parse(source, { filename: 'SaasViewerChips.vue' });
  const styles = descriptor.styles.map((style) => style.content).join('\n');
  const cases = [
    ['saas-viewer-live', 'color: var(--cuk-semantic-text-primary);', 'background: var(--cuk-semantic-status-success-surface);', 'border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-success-border);'],
    ['saas-viewer-resolution', 'color: var(--cuk-semantic-text-muted);'],
    ['saas-viewer-elapsed', 'color: var(--cuk-semantic-text-muted);'],
    ['saas-viewer-scaled', 'background: var(--cuk-semantic-surface-elevated);', 'color: var(--cuk-semantic-text-muted);', 'border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);'],
    ['saas-viewer-endpoint', 'background: var(--cuk-semantic-status-info-surface);', 'color: var(--cuk-semantic-text-primary);', 'border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-info-border);'],
  ];
  for (const [cls, ...decls] of cases) {
    const rule = styles.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `.${cls} rule present`);
    for (const decl of decls) {
      assert.ok(rule[1].includes(decl), `.${cls} keeps ${decl}`);
    }
  }
});

test('PL6 touched styles use semantic tokens only (no primitive colors)', () => {
  for (const file of ['src/terminal/TerminalSessionTabs.vue', 'src/saas/SaasViewerChips.vue']) {
    const source = text(file);
    const { descriptor } = parse(source, { filename: file });
    const styles = descriptor.styles.map((style) => style.content).join('\n');
    for (const match of styles.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      const name = match[1];
      const ok = name === '--cuk-primitive-color-alpha-transparent' || !name.startsWith('--cuk-primitive-color-');
      assert.ok(ok, `${file}: primitive color ${name}`);
    }
  }
});

test('PL6 touched components compile as plain JS with tokens only', () => {
  const themeVars = new Set(Array.from(css.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((m) => m[1]));
  for (const file of ['src/terminal/TerminalSessionTabs.vue', 'src/saas/SaasViewerChips.vue']) {
    const short = file.slice(file.lastIndexOf('/') + 1);
    const source = text(file);
    const { descriptor, errors } = parse(source, { filename: short });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'terminal-pl6' });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: short,
      id: 'terminal-pl6',
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(/(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(style.content), false, file);
      for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
        assert.ok(themeVars.has(match[1]), `${file}: undeclared token ${match[1]}`);
      }
    }
    // Name hygiene for these files rides on the existing whole-tree and per-area guards.
  }
});
