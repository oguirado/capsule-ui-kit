import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';

// PL4 P3: the expanded overlay nav pins the rail token width with its own
// opaque surface, shadow and drawer z-index, and expanded labels wrap
// instead of ellipsizing. Kit-local reads only.

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/shell/Sidebar.vue', root), 'utf8');
const theme = readFileSync(new URL('src/design/theme.css', root), 'utf8');
const { descriptor, errors } = parse(source, { filename: 'Sidebar.vue' });
const css = descriptor.styles.map((style) => style.content).join('\n');

test('pl4 P3: sidebar still parses and compiles as plain JS', () => {
  assert.deepEqual(errors, []);
  assert.ok(descriptor.scriptSetup, 'script setup required');
  assert.equal(descriptor.scriptSetup.lang, undefined, 'must not set lang="ts"');
  const script = compileScript(descriptor, { id: 'shell-sidebar-pl4' });
  const template = compileTemplate({
    source: descriptor.template.content,
    filename: 'Sidebar.vue',
    id: 'shell-sidebar-pl4',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
  for (const style of descriptor.styles) {
    assert.equal(style.scoped, true, 'scoped');
    const compiled = compileStyle({ source: style.content, filename: 'Sidebar.vue', id: 'shell-sidebar-pl4', scoped: true });
    assert.deepEqual(compiled.errors, []);
  }
});

test('pl4 P3: expanded overlay pins the rail width with its own surface, shadow and z-index', () => {
  const expanded = css.match(/\.cuk-sidebar--overlay:not\(\.cuk-sidebar--collapsed\)\s*\{[^}]*\}/);
  assert.ok(expanded, 'expanded overlay rule required');
  const rule = expanded[0];
  assert.ok(rule.includes('width: var(--cuk-semantic-size-rail-expanded-width)'), 'rail token width');
  assert.ok(rule.includes('background: var(--cuk-semantic-surface-panel)'), 'own opaque surface');
  assert.ok(rule.includes('var(--cuk-semantic-z-index-drawer)'), 'drawer z-index above content');
  assert.ok(rule.includes('var(--cuk-semantic-elevation-s1-floating)'), 'floating shadow');
  assert.ok(theme.includes('--cuk-semantic-size-rail-expanded-width:'), 'rail token defined');
});

test('pl4 P3: expanded labels wrap instead of ellipsizing', () => {
  const wrap = css.match(/\.cuk-sidebar:not\(\.cuk-sidebar--collapsed\)\s+\.cuk-sidebar__label\s*\{[^}]*\}/);
  assert.ok(wrap, 'expanded label wrap rule required');
  assert.ok(wrap[0].includes('white-space: normal'), 'labels wrap');
  assert.doesNotMatch(wrap[0], /text-overflow:\s*ellipsis/, 'no ellipsis once expanded');
});
