import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';
import { tokenValue } from '../src/design/tokenContract.js';

// Left navigation overlay rule: a thin icon rail stays visible in flow and
// the expanded panel floats above the dock layer without reflowing it.
// R1: in the light schemes every sidebar surface uses the scheme tokens.

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/shell/Sidebar.vue', root), 'utf8');
const { descriptor, errors } = parse(source, { filename: 'Sidebar.vue' });
const css = descriptor.styles.map((style) => style.content).join('\n');

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const light = luminance(a);
  const dark = luminance(b);
  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

test('overlay prop exists, defaults to overlay mode and compiles as plain JS', () => {
  assert.deepEqual(errors, []);
  assert.ok(descriptor.scriptSetup, 'script setup required');
  assert.equal(descriptor.scriptSetup.lang, undefined, 'must not set lang="ts"');
  const script = compileScript(descriptor, { id: 'shell-sidebar-overlay' });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: 'Sidebar.vue',
    id: 'shell-sidebar-overlay',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
  assert.ok(source.includes('overlay: { type: Boolean, default: true }'), 'overlay prop defaults true');
  assert.ok(source.includes("'cuk-sidebar--overlay': overlay"), 'overlay class binding');
});

test('expanded overlay floats above the dock layer; collapsed rail stays in flow', () => {
  const expanded = css.match(/\.cuk-sidebar--overlay:not\(\.cuk-sidebar--collapsed\)\s*\{[^}]*\}/);
  assert.ok(expanded, 'expanded overlay rule required');
  const rule = expanded[0];
  assert.ok(rule.includes('position: absolute'), 'overlay leaves flow');
  assert.ok(rule.includes('top: 0'), 'overlay spans parent height (top)');
  assert.ok(rule.includes('bottom: 0'), 'overlay spans parent height (bottom)');
  assert.ok(rule.includes('left: 0'), 'overlay docks to the left edge');
  assert.ok(rule.includes('var(--cuk-semantic-z-index-drawer)'), 'drawer z-index above dock');
  assert.ok(rule.includes('var(--cuk-semantic-elevation-s1-floating)'), 'floating shadow');
  assert.ok(css.includes('.cuk-sidebar--collapsed {\n  width: var(--cuk-semantic-size-rail-collapsed-width);\n}'),
    'collapsed rail keeps the rail token width');
  assert.doesNotMatch(css, /\.cuk-sidebar--collapsed\s*\{[^}]*position:\s*absolute/, 'rail never leaves flow');
  assert.ok(css.includes('flex-shrink: 0'), 'rail reserves width in flow');
});

test('overlay styles stay scoped, token-only and reduced-motion safe', () => {
  assert.ok(descriptor.styles.length >= 1, 'Sidebar styles required');
  const rawStyle = (/** @type {string} */ value) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(value);
  for (const style of descriptor.styles) {
    assert.equal(style.scoped, true, 'scoped');
    assert.equal(rawStyle(style.content), false, 'rejects raw literals');
    const compiled = compileStyle({ source: style.content, filename: 'Sidebar.vue', id: 'shell-sidebar-overlay', scoped: true });
    assert.deepEqual(compiled.errors, []);
  }
  assert.ok(css.includes('prefers-reduced-motion'), 'reduced motion guard');
});

test('R1: sidebar surfaces resolve from scheme tokens, never vendor or fixed dark values', () => {
  assert.equal(css.includes('--cuk-primitive-color'), false, 'no fixed primitive colors');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex literals');
  assert.doesNotMatch(css, /\brgba?\(/i, 'no fixed rgb literals');
  assert.doesNotMatch(css, /--p-[a-z]/, 'no vendor theme variables');
  assert.ok(css.includes('.cuk-sidebar :deep(.p-menu-list)'), 'vendor list override');
  assert.ok(css.includes('.cuk-sidebar :deep(.p-menu-submenu-label)'), 'vendor submenu override');
  assert.ok(source.includes('background: var(--cuk-semantic-surface-panel);'), 'panel token surface');
});

test('R1: light schemes pair light sidebar surfaces with AA text contrast', () => {
  // Sunken carries only a translucent footer wash plus disabled/status
  // micro-labels on the engine strip, never primary/muted body text.
  const surfaces = ['panel', 'chrome', 'elevated', 'sunken'];
  const textSurfaces = ['panel', 'chrome', 'elevated'];
  for (const mode of ['light.normal', 'saas-light.normal']) {
    for (const name of surfaces) {
      const surface = tokenValue('semantic.surface.' + name, mode);
      assert.ok(/^#[0-9a-f]{6}$/i.test(surface), mode + '/' + name + ' resolves to hex');
      assert.ok(luminance(surface) >= 0.5, mode + '/' + name + ' stays light: ' + surface);
    }
    for (const fg of ['primary', 'muted']) {
      for (const bg of textSurfaces) {
        const ratio = contrast(tokenValue('semantic.text.' + fg, mode), tokenValue('semantic.surface.' + bg, mode));
        assert.ok(ratio >= 4.5, mode + '/' + fg + '/' + bg + ': ' + ratio);
      }
    }
  }
});

test('overlay keeps the stable rail contract: ids, collapse state and slots', () => {
  const template = descriptor.template.content;
  assert.ok(template.includes('id="shell/navigation"'), 'rail id');
  assert.ok(template.includes("'cuk-sidebar--collapsed': isCollapsed"), 'collapse binding kept');
  assert.ok(template.includes(':aria-label="navLabel"'), 'rail label');
  for (const slot of ['name="icon"', 'name="header"', 'name="footer"', 'name="telemetry"', '#item', '#submenulabel']) {
    assert.ok(source.includes(slot), 'slot/' + slot);
  }
});
