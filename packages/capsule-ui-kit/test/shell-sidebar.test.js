import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate, compileStyle } from '@vue/compiler-sfc';

const root = new URL('../', import.meta.url);
const text = (/** @type {string} */ path) => readFileSync(new URL(path, root), 'utf8');
const sidebarSource = text('src/shell/Sidebar.vue');
const iconSource = text('src/shell/SidebarIcon.vue');
const sidebar = parse(sidebarSource, { filename: 'Sidebar.vue' });
const icon = parse(iconSource, { filename: 'SidebarIcon.vue' });

test('shell Sidebar SFCs parse and compile as plain JS without lang="ts"', () => {
  for (const [name, sfc] of [['Sidebar.vue', sidebar], ['SidebarIcon.vue', icon]]) {
    assert.deepEqual(sfc.errors, [], name);
    assert.ok(sfc.descriptor.template, name + ' template required');
    assert.ok(sfc.descriptor.scriptSetup, name + ' <script setup> required');
    assert.equal(sfc.descriptor.scriptSetup.lang, undefined, name + ' must not set lang="ts"');
    const script = compileScript(sfc.descriptor, { id: 'shell-' + name });
    assert.ok(script.content.includes('setup(') || script.content.includes('defineComponent'), name);
    const template = compileTemplate({
      source: sfc.descriptor.template.content,
      filename: name,
      id: 'shell-' + name,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], name);
  }
});

test('Sidebar exposes the generic rail contract: props, slots and events', () => {
  for (const prop of ['groups', 'workspaceLabel', 'workspaceVersion', 'collapsed', 'autoCollapse', 'collapseBreakpoint', 'activeId', 'user', 'engine', 'navLabel']) {
    assert.ok(sidebarSource.includes(prop), 'prop/' + prop);
  }
  for (const slot of ['name="icon"', 'name="header"', 'name="footer"', '#item', '#submenulabel']) {
    assert.ok(sidebarSource.includes(slot), 'slot/' + slot);
  }
  for (const event of ["'select'", "'open'", "'sync'", "'user-menu'", "'collapsed-change'"]) {
    assert.ok(sidebarSource.includes(event), 'event/' + event);
  }
  assert.ok(sidebarSource.includes(':model="menuModel"'), 'Menu model binding');
  assert.ok(sidebarSource.includes('separator: true'), 'group separators');
  assert.ok(sidebarSource.includes("emit('open', nav)"), 'open mirrors select');
  assert.ok(sidebarSource.includes('item.id === props.activeId'), 'activeId resolution');
});

test('Sidebar consumes OpenVue only through declared kit-internal imports', () => {
  for (const mod of ["openvue/menu", 'openvue/badge', 'openvue/tag', 'openvue/avatar', 'openvue/button']) {
    assert.ok(sidebarSource.includes(`from '${mod}'`), mod);
  }
  assert.ok(sidebarSource.includes("from './SidebarIcon.vue'"), 'icon part');
  assertPackageImports();
});

test('Sidebar keeps stable control ids, roles and accessible names', () => {
  const template = sidebar.descriptor.template.content;
  assert.ok(template.includes('id="shell/navigation"'), 'rail id');
  assert.ok(template.includes(`:id="'shell-menu-' + item.key"`), 'item id');
  assert.ok(template.includes(`:data-semantic-anchor="'shell/navigation/menu-' + item.key"`), 'item anchor');
  assert.ok(template.includes('id="shell-sidebar-sync"'), 'sync id');
  assert.ok(template.includes('data-semantic-anchor="shell/navigation/sidebar-sync"'), 'sync anchor');
  assert.ok(template.includes('id="shell-sidebar-user-menu"'), 'user menu id');
  assert.ok(template.includes('data-semantic-anchor="shell/navigation/sidebar-user-menu"'), 'user menu anchor');
  assert.ok(template.includes('role="button"'), 'item role');
  assert.ok(template.includes(':aria-label="itemName(item._nav)"'), 'item name');
  assert.ok(template.includes('aria-current'), 'active state');
  assert.ok(template.includes('aria-hidden="true"'), 'decorative adornments hidden');
  assert.ok(template.includes("title="), 'collapsed tooltip');
});

test('Sidebar styles are scoped, token-only and collapse through rail tokens', () => {
  assert.ok(sidebar.descriptor.styles.length >= 1, 'Sidebar styles required');
  assert.ok(icon.descriptor.styles.length >= 1, 'Icon styles required');
  const rawStyle = (/** @type {string} */ source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);
  for (const [name, sfc] of [['Sidebar.vue', sidebar], ['SidebarIcon.vue', icon]]) {
    for (const style of sfc.descriptor.styles) {
      assert.equal(style.scoped, true, name + ' scoped');
      assert.equal(rawStyle(style.content), false, name + ' rejects raw literals');
      const compiled = compileStyle({ source: style.content, filename: name, id: 'shell-' + name, scoped: true });
      assert.deepEqual(compiled.errors, [], name);
    }
  }
  const css = sidebar.descriptor.styles.map((s) => s.content).join('\n');
  assert.ok(css.includes('var(--cuk-'), 'uses kit tokens');
  assert.ok(css.includes('--cuk-component-app-shell-sidebar-width-s1'), '240px rail token');
  assert.ok(css.includes('--cuk-semantic-size-rail-collapsed-width'), 'collapsed rail token');
  assert.ok(css.includes('prefers-reduced-motion'), 'reduced motion guard');
  assert.ok(css.includes('color-mix('), 'alpha fills derive from tokens');
});

test('SidebarIcon ships the closed generic glyph set with aria-hidden art', () => {
  const template = icon.descriptor.template.content;
  assert.ok(template.includes('aria-hidden="true"'), 'decorative');
  assert.ok(template.includes('viewBox="0 0 16 16"'), '16px grid');
  for (const glyph of ['dashboard', 'people', 'mail', 'calendar', 'industry', 'box', 'chart-pie', 'trend-up', 'bank', 'save', 'console', 'cog', 'dots', 'sync', 'marker']) {
    assert.ok(iconSource.includes(`'${glyph}'`), 'glyph/' + glyph);
  }
  for (const glyph of ['dashboard', 'people', 'mail', 'calendar', 'industry', 'box', 'chart-pie', 'trend-up', 'bank', 'save', 'console', 'cog', 'dots', 'sync']) {
    assert.ok(template.includes(`glyph() === '${glyph}'`), 'art/' + glyph);
  }
  assert.ok(template.includes('<g v-else>'), 'marker fallback branch');
  assert.ok(iconSource.includes("default: 'marker'"), 'marker fallback');
  assert.ok(iconSource.includes("=== 'grid'"), 'grid alias');
  assert.ok(iconSource.includes("=== 'info'"), 'info alias');
});

test('shell rail sources carry no application or real-world names', () => {
  assertPackageImports();
});
