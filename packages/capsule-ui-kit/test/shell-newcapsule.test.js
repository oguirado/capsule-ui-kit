import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  NEWCAPSULE_GRID_COLUMNS,
  NEWCAPSULE_PLACEMENTS,
  capsuleCategories,
  capsuleCategoryId,
  filterCapsuleTypes,
  filterCapsuleTypesByCategory,
  moveCapsuleCardIndex,
  normalizeCapsuleCatalog,
  normalizeCapsuleType,
  resolveCapsulePlacement,
} from '../src/shell/NewCapsuleModel.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const DIALOG = path.resolve(here, '../src/shell/NewCapsuleDialog.vue');
const MODEL = path.resolve(here, '../src/shell/NewCapsuleModel.js');
const dialogSource = readFileSync(DIALOG, 'utf8');
const modelSource = readFileSync(MODEL, 'utf8');
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

test('new capsule dialog compiles against the installed Vue compiler as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  const { descriptor, errors } = parse(dialogSource, { filename: 'NewCapsuleDialog.vue' });
  assert.deepEqual(errors, []);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined);
  const script = compileScript(descriptor, { id: 'shell-newcapsule' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: 'NewCapsuleDialog.vue',
    id: 'shell-newcapsule',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('launcher styles use tokens only and every variable is declared in theme.css', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(dialogSource, { filename: 'NewCapsuleDialog.vue' });
  assert.ok(descriptor.styles.length > 0);
  for (const style of descriptor.styles) {
    assert.equal(rawStyle(style.content), false);
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(themeVars.has(match[1]), `undeclared token ${match[1]}`);
    }
  }
});

test('launcher exposes the S8 slot/prop/event contract with stable control ids', () => {
  for (const prop of ['visible', 'types', 'title', 'subtitle', 'categoriesLabel', 'allLabel', 'searchLabel', 'placeholder', 'emptyText', 'placementLabel', 'cancelLabel', 'createLabel']) {
    assert.ok(dialogSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['update:visible', 'create', 'close']) {
    assert.ok(dialogSource.includes(`'${event}'`), 'event ' + event);
  }
  assert.ok(dialogSource.includes('name="type-icon"'), 'slot type-icon');
  assert.ok(dialogSource.includes('name="empty"'), 'slot empty');
  for (const id of ['shell/new-capsule/dialog', 'shell/new-capsule/search', 'shell/new-capsule/rail', 'shell/new-capsule/grid', 'shell/new-capsule/detail', 'shell/new-capsule/category-all', 'shell/new-capsule/cancel', 'shell/new-capsule/create', 'shell/new-capsule/close', 'shell/new-capsule/empty']) {
    assert.ok(dialogSource.includes(id), 'id ' + id);
  }
  for (const prefix of ['shell/new-capsule/card-', 'shell/new-capsule/category-', 'shell/new-capsule/mode-']) {
    assert.ok(dialogSource.includes(prefix), 'dynamic id prefix ' + prefix);
  }
  for (const role of ['group', 'status']) {
    assert.ok(dialogSource.includes(`role="${role}"`), 'role ' + role);
  }
  for (const attr of ['aria-pressed', 'aria-controls="shell/new-capsule/grid"', 'aria-autocomplete="list"', 'aria-label']) {
    assert.ok(dialogSource.includes(attr), 'a11y ' + attr);
  }
  for (const hint of ['Navigate', 'Create', 'Cancel']) {
    assert.ok(dialogSource.includes(hint), 'hint ' + hint);
  }
  assert.ok(dialogSource.includes('Opens as: '), 'opens-as chip');
  assert.ok(dialogSource.includes('Open as '), 'placement names');
  assert.ok(dialogSource.includes('openDialog'));
  assert.ok(dialogSource.includes('closeDialog'));
  for (const dialog of [':show-header="false"', ':draggable="false"', ':dismissable-mask="true"', ':close-on-escape="true"', 'modal']) {
    assert.ok(dialogSource.includes(dialog), 'dialog ' + dialog);
  }
});

test('every semantic anchor on the launcher matches a declared control family', () => {
  for (const anchor of ['shell/navigation/new-capsule-search', 'shell/navigation/new-capsule-close', 'shell/navigation/new-capsule-cancel', 'shell/navigation/new-capsule-create', 'shell/navigation/new-capsule-category-all']) {
    assert.ok(dialogSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
  for (const prefix of ['shell/navigation/new-capsule-category-', 'shell/navigation/new-capsule-type-', 'shell/navigation/new-capsule-mode-']) {
    assert.ok(dialogSource.includes(prefix), 'dynamic anchor prefix ' + prefix);
  }
  assert.ok(matchControlFamily('shell/navigation/new-capsule-category-group-a'), 'category family probe');
  assert.ok(matchControlFamily('shell/navigation/new-capsule-type-alpha-1'), 'type family probe');
  assert.ok(matchControlFamily('shell/navigation/new-capsule-mode-split'), 'mode family probe');
});

test('launcher carries no consumer names, uses only the Dialog vendor primitive, and resolves its icons', () => {
  assertPackageImports();
  const vendor = Array.from(dialogSource.matchAll(/from '(openvue\/[^']+)'/g)).map((m) => m[1]);
  assert.deepEqual(new Set(vendor), new Set(['openvue/dialog']));
  for (const icon of ['search', 'check', 'plus', 'times']) {
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

const fakeCatalog = [
  { id: 'alpha-1', label: 'Alpha One', category: 'Group A', description: 'First fake type', opensAs: 'split', footprint: '~6 MB heap', icon: 'marker', keywords: ['uno'] },
  { id: 'alpha-2', label: 'Alpha Two', category: 'Group A', description: 'Second fake type', opensAs: 'tab', footprint: '~8 MB heap' },
  { id: 'beta-1', label: 'Beta One', category: 'Group B', description: 'Third fake type', opensAs: 'floating', footprint: '~12 MB heap' },
];

test('launcher placements and grid columns are frozen', () => {
  assert.deepEqual([...NEWCAPSULE_PLACEMENTS], ['tab', 'split', 'floating']);
  assert.equal(NEWCAPSULE_GRID_COLUMNS, 2);
});

test('launcher placement resolution falls back to a supported mode', () => {
  assert.equal(resolveCapsulePlacement('tab'), 'tab');
  assert.equal(resolveCapsulePlacement('split'), 'split');
  assert.equal(resolveCapsulePlacement('floating'), 'floating');
  assert.equal(resolveCapsulePlacement('popout'), 'tab');
  assert.equal(resolveCapsulePlacement(undefined, 'split'), 'split');
  assert.equal(resolveCapsulePlacement(null, 'bogus'), 'tab');
  assert.equal(resolveCapsulePlacement(42), 'tab');
});

test('launcher category slugs are stable and never empty', () => {
  assert.equal(capsuleCategoryId('Group A'), 'group-a');
  assert.equal(capsuleCategoryId('AI & Terminals'), 'ai-terminals');
  assert.equal(capsuleCategoryId('  spaced  '), 'spaced');
  assert.equal(capsuleCategoryId(''), 'uncategorised');
  assert.equal(capsuleCategoryId(null), 'uncategorised');
  assert.equal(capsuleCategoryId(undefined), 'uncategorised');
});

test('launcher catalog normalization keeps host order and drops invalid entries', () => {
  assert.deepEqual(normalizeCapsuleCatalog(fakeCatalog).map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(normalizeCapsuleCatalog('nope'), []);
  assert.deepEqual(normalizeCapsuleCatalog(null), []);
  assert.deepEqual(normalizeCapsuleCatalog([
    null,
    42,
    { label: 'Missing id' },
    { id: 'missing-label' },
    { id: '  ', label: 'Blank id' },
    { id: 'ok-1', label: '  Padded  ', opensAs: 'popout', keywords: ['fine', 42, ''] },
  ]), [
    {
      id: 'ok-1', label: 'Padded', category: '', description: '', opensAs: 'tab', footprint: '', keywords: ['fine'],
    },
  ]);
  assert.equal(normalizeCapsuleType(null), null);
  assert.equal(normalizeCapsuleType({ id: 'x' }), null);
  const icon = normalizeCapsuleType({ id: 'x', label: 'X', icon: '  marker  ' });
  assert.equal(icon?.icon, 'marker');
  const noIcon = normalizeCapsuleType({ id: 'x', label: 'X', icon: '   ' });
  assert.equal('icon' in (noIcon ?? {}), false);
});

test('launcher filter matches id, label, description, category and keywords case-insensitively', () => {
  const types = normalizeCapsuleCatalog(fakeCatalog);
  assert.deepEqual(filterCapsuleTypes(types, '').map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(filterCapsuleTypes(types, '  ').map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(filterCapsuleTypes(types, 'ALPHA').map((t) => t.id), ['alpha-1', 'alpha-2']);
  assert.deepEqual(filterCapsuleTypes(types, 'beta-1').map((t) => t.id), ['beta-1']);
  assert.deepEqual(filterCapsuleTypes(types, 'second fake').map((t) => t.id), ['alpha-2']);
  assert.deepEqual(filterCapsuleTypes(types, 'group b').map((t) => t.id), ['beta-1']);
  assert.deepEqual(filterCapsuleTypes(types, 'UNO').map((t) => t.id), ['alpha-1']);
  assert.deepEqual(filterCapsuleTypes(types, 'zzz-no-match'), []);
});

test('launcher categories keep first-seen order with counts', () => {
  const types = normalizeCapsuleCatalog(fakeCatalog);
  assert.deepEqual(capsuleCategories(types), [
    { id: 'group-a', label: 'Group A', count: 2 },
    { id: 'group-b', label: 'Group B', count: 1 },
  ]);
  assert.deepEqual(capsuleCategories([]), []);
  assert.deepEqual(capsuleCategories(normalizeCapsuleCatalog([{ id: 'x', label: 'X' }])), [
    { id: 'uncategorised', label: 'Uncategorised', count: 1 },
  ]);
});

test('launcher category filter returns all for null and narrows for slugs', () => {
  const types = normalizeCapsuleCatalog(fakeCatalog);
  assert.deepEqual(filterCapsuleTypesByCategory(types, null).map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, undefined).map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, '').map((t) => t.id), ['alpha-1', 'alpha-2', 'beta-1']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, 'group-a').map((t) => t.id), ['alpha-1', 'alpha-2']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, 'group-b').map((t) => t.id), ['beta-1']);
  assert.deepEqual(filterCapsuleTypesByCategory(types, 'missing'), []);
});

test('launcher panel is capped to the viewport with pinned chrome (pl1-029..032, pl1-038/039)', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(dialogSource, { filename: 'NewCapsuleDialog.vue' });
  const css = descriptor.styles.map((style) => style.content).join('\n');
  const panel = css.match(/\.p-dialog\.s8n-dialog\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(panel.includes('max-height: 92vh'), 'vh fallback cap');
  assert.ok(panel.includes('max-height: 92dvh'), 'dynamic viewport cap');
  assert.ok(panel.includes('overflow: hidden'), 'panel clips to its rounded frame');
  const content = css.match(/\.s8n-dialog \.p-dialog-content\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(content.includes('display: flex') && content.includes('flex-direction: column'), 'content is a flex column');
  assert.ok(content.includes('min-height: 0') && content.includes('overflow: hidden'), 'content yields to the scroll regions');
  assert.ok(/\.s8n-head,\s*\.s8n-search,\s*\.s8n-foot\s*\{\s*flex:\s*none/.test(css), 'head, search and footer stay pinned');
});

test('launcher body scrolls internally instead of growing past the fold (pl1-029..032, pl1-038/039)', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(dialogSource, { filename: 'NewCapsuleDialog.vue' });
  const css = descriptor.styles.map((style) => style.content).join('\n');
  const body = css.match(/\.s8n-body\s*\{[^}]*\}/)?.[0] ?? '';
  assert.ok(body.includes('flex: 1 1 auto') && body.includes('min-height: 0'), 'body takes the free panel height');
  for (const region of ['s8n-rail', 's8n-main']) {
    const rule = css.match(new RegExp(`\\.${region}\\s*\\{[^}]*\\}`))?.[0] ?? '';
    assert.ok(rule.includes('overflow-y: auto'), `${region} scrolls`);
    assert.ok(rule.includes('max-height: 100%'), `${region} is bounded by the body`);
  }
});

test('launcher card index moves on a two-column grid with wraparound', () => {
  assert.equal(moveCapsuleCardIndex(0, 0, 'ArrowRight'), -1);
  assert.equal(moveCapsuleCardIndex(4, -1, 'ArrowRight'), 0);
  assert.equal(moveCapsuleCardIndex(4, -1, 'ArrowDown'), 0);
  assert.equal(moveCapsuleCardIndex(4, -1, 'ArrowLeft'), 3);
  assert.equal(moveCapsuleCardIndex(4, -1, 'ArrowUp'), 3);
  assert.equal(moveCapsuleCardIndex(4, 0, 'ArrowRight'), 1);
  assert.equal(moveCapsuleCardIndex(4, 3, 'ArrowRight'), 0);
  assert.equal(moveCapsuleCardIndex(4, 0, 'ArrowLeft'), 3);
  assert.equal(moveCapsuleCardIndex(4, 1, 'ArrowDown', 2), 3);
  assert.equal(moveCapsuleCardIndex(4, 3, 'ArrowDown', 2), 1);
  assert.equal(moveCapsuleCardIndex(4, 0, 'ArrowUp', 2), 2);
  assert.equal(moveCapsuleCardIndex(4, 1, 'ArrowUp', 2), 3);
  assert.equal(moveCapsuleCardIndex(4, 2, 'Home'), 0);
  assert.equal(moveCapsuleCardIndex(4, 1, 'End'), 3);
  assert.equal(moveCapsuleCardIndex(4, 1, 'Enter'), 1);
  assert.equal(moveCapsuleCardIndex(4, -1, 'Enter'), -1);
  assert.equal(moveCapsuleCardIndex(4, 0, 'ArrowDown', 0), 1);
  assert.equal(moveCapsuleCardIndex(3, 2, 'ArrowDown', 2), 1);
});
