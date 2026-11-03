import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  cyclePaletteGroup,
  filterPaletteItems,
  flattenPaletteGroups,
  groupPaletteItems,
  movePaletteIndex,
} from '../src/shell/CommandPaletteModel.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const PALETTE = path.resolve(here, '../src/shell/CommandPalette.vue');
const paletteSource = readFileSync(PALETTE, 'utf8');
const themeCss = readFileSync(path.resolve(here, '../src/design/theme.css'), 'utf8');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);

function loadCompilerSfc() {
  for (const spec of ['@vue/compiler-sfc', '@vue/compiler-sfc']) {
    try {
      return require(spec);
    } catch {
      // try next candidate
    }
  }
  throw new Error('Unable to resolve @vue/compiler-sfc');
}

test('command palette compiles against the installed Vue compiler as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  const { descriptor, errors } = parse(paletteSource, { filename: 'CommandPalette.vue' });
  assert.deepEqual(errors, []);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined);
  const script = compileScript(descriptor, { id: 'shell-palette' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: 'CommandPalette.vue',
    id: 'shell-palette',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('palette styles use tokens only and every variable is declared in theme.css', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(paletteSource, { filename: 'CommandPalette.vue' });
  assert.ok(descriptor.styles.length > 0);
  for (const style of descriptor.styles) {
    assert.equal(rawStyle(style.content), false);
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(themeVars.has(match[1]), `undeclared token ${match[1]}`);
    }
  }
});

test('palette exposes the S6 slot/prop/event contract with stable control ids', () => {
  for (const prop of ['visible', 'items', 'label', 'inputLabel', 'placeholder', 'emptyText']) {
    assert.ok(paletteSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['update:visible', 'select', 'close']) {
    assert.ok(paletteSource.includes(`'${event}'`), 'event ' + event);
  }
  assert.ok(paletteSource.includes('name="item-icon"'), 'slot item-icon');
  assert.ok(paletteSource.includes('name="empty"'), 'slot empty');
  for (const id of ['shell/palette/dialog', 'shell/palette/input', 'shell/palette/list', 'shell/palette/empty', 'shell/palette/group-clear']) {
    assert.ok(paletteSource.includes(id), 'id ' + id);
  }
  assert.ok(paletteSource.includes("'shell/palette/item-'"), 'dynamic item id prefix');
  for (const role of ['list', 'status']) {
    assert.ok(paletteSource.includes(`role="${role}"`), 'role ' + role);
  }
  for (const attr of ['aria-expanded', 'aria-controls="shell/palette/list"', 'aria-autocomplete="list"', 'aria-current']) {
    assert.ok(paletteSource.includes(attr), 'a11y ' + attr);
  }
  for (const hint of ['Navigate', 'Select', 'Close', 'Filter by Group', 'Re-focus']) {
    assert.ok(paletteSource.includes(hint), 'hint ' + hint);
  }
  assert.ok(paletteSource.includes('openPalette'));
  assert.ok(paletteSource.includes('closePalette'));
  for (const dialog of [':show-header="false"', ':draggable="false"', ':dismissable-mask="true"', ':close-on-escape="true"', 'modal']) {
    assert.ok(paletteSource.includes(dialog), 'dialog ' + dialog);
  }
});

test('every semantic anchor on the palette matches a declared control family', () => {
  for (const anchor of ['shell/navigation/palette-search', 'shell/navigation/palette-group-clear']) {
    assert.ok(paletteSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
  assert.ok(paletteSource.includes(`'shell/navigation/command-'`), 'dynamic command anchor prefix');
  assert.ok(matchControlFamily('shell/navigation/command-probe-1x'), 'command family probe');
});

test('palette carries no consumer names, uses only the Dialog vendor primitive, and resolves its icons', () => {
  assertPackageImports();
  const vendor = Array.from(paletteSource.matchAll(/from '(openvue\/[^']+)'/g)).map((m) => m[1]);
  assert.deepEqual(new Set(vendor), new Set(['openvue/dialog']));
  for (const icon of ['search', 'chevronright', 'thlarge']) {
    let found = false;
    try {
      require.resolve(`@openvue/icons/${icon}`);
      found = true;
    } catch {
      found = false;
    }
    assert.ok(found, 'icon ' + icon);
  }
});

const sampleItems = [
  { id: 'hq', label: 'HQ Cockpit', description: 'Core stage', group: 'Jump to', kind: 'jump' },
  { id: 'batch', label: 'Start Batch', group: 'Commands', kind: 'command', keywords: ['run', 'production'] },
  { id: 'settings', label: 'Settings', group: 'Jump to', kind: 'jump' },
];

test('palette filter matches label, description, group and keywords case-insensitively', () => {
  assert.deepEqual(filterPaletteItems(sampleItems, '').map((i) => i.id), ['hq', 'batch', 'settings']);
  assert.deepEqual(filterPaletteItems(sampleItems, '  ').map((i) => i.id), ['hq', 'batch', 'settings']);
  assert.deepEqual(filterPaletteItems(sampleItems, 'cockpit').map((i) => i.id), ['hq']);
  assert.deepEqual(filterPaletteItems(sampleItems, 'CORE STAGE').map((i) => i.id), ['hq']);
  assert.deepEqual(filterPaletteItems(sampleItems, 'commands').map((i) => i.id), ['batch']);
  assert.deepEqual(filterPaletteItems(sampleItems, 'RUN').map((i) => i.id), ['batch']);
  assert.deepEqual(filterPaletteItems(sampleItems, 'zzz-no-match'), []);
});

test('palette grouping preserves first-seen order and flattens to row order', () => {
  const groups = groupPaletteItems(sampleItems);
  assert.deepEqual(groups.map((g) => g.group), ['Jump to', 'Commands']);
  assert.deepEqual(groups[0].items.map((i) => i.id), ['hq', 'settings']);
  assert.deepEqual(flattenPaletteGroups(groups).map((i) => i.id), ['hq', 'settings', 'batch']);
  assert.deepEqual(groupPaletteItems([{ id: 'x', label: 'Solo' }]), [{ group: '', items: [{ id: 'x', label: 'Solo' }] }]);
});

test('palette index moves with wraparound and refuses empty lists', () => {
  assert.equal(movePaletteIndex(0, 0, 1), -1);
  assert.equal(movePaletteIndex(3, -1, 1), 0);
  assert.equal(movePaletteIndex(3, -1, -1), 2);
  assert.equal(movePaletteIndex(3, 2, 1), 0);
  assert.equal(movePaletteIndex(3, 0, -1), 2);
  assert.equal(movePaletteIndex(3, 1, 1), 2);
});

test('palette group filter cycles through groups then clears', () => {
  assert.equal(cyclePaletteGroup([], null), null);
  assert.equal(cyclePaletteGroup(['a', 'b'], null), 'a');
  assert.equal(cyclePaletteGroup(['a', 'b'], 'missing'), 'a');
  assert.equal(cyclePaletteGroup(['a', 'b'], 'a'), 'b');
  assert.equal(cyclePaletteGroup(['a', 'b'], 'b'), null);
});
