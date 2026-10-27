import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';

// PL5 NEW-1 + P5: the New Capsule dialog title and selected-row pairs, and
// the decorative bar separators, hold their contrast in every scheme. Token
// values are pinned by the legacy snapshots, so the room fixes the
// component-to-token mapping; these tests pin the mapping and the ratios.

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
 * Painted selection fill: the (possibly translucent) selection token over
 * the dialog surface the rail sits on.
 * @param {string} mode Token mode.
 * @returns {string} Opaque hex fill.
 */
function selectionFill(mode) {
  const fill = tokenValue('semantic.selection.background', mode);
  if (!fill.startsWith('rgba')) return fill;
  return compositeOver(fill, tokenValue('component.dialogHost.surface', mode));
}

/**
 * Full start tags of one element name in a template, tolerating quoted >.
 * @param {string} template Template source.
 * @param {string} tag Element name.
 * @returns {string[]} Start tags.
 */
function startTags(template, tag) {
  return Array.from(template.matchAll(new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*")*?>`, 'g'))).map((m) => m[0]);
}

test('token contract validates for the PL5 pairs', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0);
});

test('PL5 dialog title pair reaches 4.5:1 in every scheme (NEW-1)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.primary', mode), tokenValue('component.dialogHost.surface', mode));
    assert.ok(ratio >= 4.5, `${mode}/title: ${ratio}`);
  }
});

test('PL5 selected-row label pair reaches 4.5:1 in every scheme (NEW-1)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.selection.text', mode), selectionFill(mode));
    assert.ok(ratio >= 4.5, `${mode}/selected-row: ${ratio}`);
  }
});

test('PL5 selected-row count reaches 3:1 in every scheme (NEW-1)', () => {
  // The count repeats the row accessible name and is aria-hidden, so the
  // decorative/UI threshold applies; it keeps the selection pair.
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.selection.text', mode), selectionFill(mode));
    assert.ok(ratio >= 3, `${mode}/selected-count: ${ratio}`);
  }
});

test('PL5 decorative separators reach 3:1 in every scheme (P5)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.sunken', mode));
    assert.ok(ratio >= 3, `${mode}/separator: ${ratio}`);
  }
});

test('PL5 dialog paints its own content surface over the vendor rule (NEW-1)', () => {
  const source = text('src/shell/NewCapsuleDialog.vue');
  const { descriptor } = parse(source, { filename: 'NewCapsuleDialog.vue' });
  const styles = descriptor.styles.map((style) => style.content).join('\n');
  const match = styles.match(/\.p-dialog\.s8n-dialog\s+\.p-dialog-content\s*\{([^}]*)\}/);
  assert.ok(match, 'triple-specificity content rule present');
  const paint = match[1].match(/background:\s*(var\(--cuk-[A-Za-z0-9-_]+\))/);
  assert.ok(paint, 'content rule sets a token background');
  assert.equal(paint[1], 'var(--cuk-component-dialog-host-surface)');
});

test('PL5 selected row keeps the selection token pair (NEW-1 coupling)', () => {
  const source = text('src/shell/NewCapsuleDialog.vue');
  const { descriptor } = parse(source, { filename: 'NewCapsuleDialog.vue' });
  const styles = descriptor.styles.map((style) => style.content).join('\n');
  const row = styles.match(/\.s8n-cat\[aria-pressed="true"\]\s*\{([^}]*)\}/);
  assert.ok(row, 'selected-row rule present');
  assert.ok(row[1].includes('background: var(--cuk-semantic-selection-background);'), 'row fill is the selection token');
  assert.ok(row[1].includes('color: var(--cuk-semantic-selection-text);'), 'row label is the selection text token');
  const count = styles.match(/\.s8n-cat\[aria-pressed="true"\]\s+\.s8n-count\s*\{([^}]*)\}/);
  assert.ok(count, 'selected-row count rule present');
  assert.ok(count[1].includes('color: var(--cuk-semantic-selection-text);'), 'count keeps the selection pair');
});

test('PL5 separators are aria-hidden and keep the muted tone (P5 coupling)', () => {
  const cases = [
    { file: 'src/shell/TopBar.vue', classes: ['s1-topbar-divider'], property: 'background' },
    { file: 'src/shell/StatusBar.vue', classes: ['s1-statusbar-sep', 's1-statusbar-bullet'], property: 'color' },
  ];
  for (const { file, classes, property } of cases) {
    const source = text(file);
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.template, `${file}: template present`);
    const tags = startTags(descriptor.template.content, 'span');
    for (const cls of classes) {
      const uses = tags.filter((tag) => tag.includes(cls));
      assert.ok(uses.length > 0, `${file}: .${cls} used`);
      for (const tag of uses) assert.ok(tag.includes('aria-hidden="true"'), `${file}: .${cls} aria-hidden`);
      const styles = descriptor.styles.map((style) => style.content).join('\n');
      const rule = styles.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
      assert.ok(rule, `${file}: .${cls} rule present`);
      assert.ok(
        rule[1].includes(`${property}: var(--cuk-semantic-text-muted);`),
        `${file}: .${cls} keeps the muted tone`,
      );
    }
  }
});

test('PL5 touched components compile as plain JS with tokens only and no consumer names', () => {
  const themeVars = new Set(Array.from(css.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((m) => m[1]));
  for (const file of ['src/shell/NewCapsuleDialog.vue', 'src/shell/TopBar.vue', 'src/shell/StatusBar.vue']) {
    const short = file.slice('src/shell/'.length);
    const source = text(file);
    const { descriptor, errors } = parse(source, { filename: short });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'design-contrast-pl5' });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: short,
      id: 'design-contrast-pl5',
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
  assertPackageImports();
  }
});
