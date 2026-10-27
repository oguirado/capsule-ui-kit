import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import { tokenValue } from '../src/design/tokenContract.js';
import {
  DENSITY_OPTIONS,
  SCHEME_OPTIONS,
  SECTION_LABELS,
  SETTINGS_SECTIONS,
  SETTINGS_STORAGE_KEYS,
  readStoredSetting,
  resolveScheme,
  writeStoredSetting,
} from '../src/shell/SettingsModel.js';

// S6 settings panel plus the S5 window-state shell contract (hidden strip,
// drop-preview overlay, maximized/restore anchor proof, floating theme).

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(path.resolve(here, '../src/shell/' + file), 'utf8');
const settingsSource = read('SettingsPanel.vue');
const stripSource = read('HiddenStrip.vue');
const dropSource = read('HiddenStripDropPreview.vue');
const themeCss = readFileSync(path.resolve(here, '../src/design/theme.css'), 'utf8');
const themeVars = new Set(
  Array.from(themeCss.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((match) => match[1]),
);
const files = [
  ['SettingsPanel.vue', settingsSource],
  ['HiddenStrip.vue', stripSource],
  ['HiddenStripDropPreview.vue', dropSource],
  ['ShellWorkspace.vue', read('ShellWorkspace.vue')],
];

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

test('settings, strip and drop preview compile as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  for (const [file, source] of files) {
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'shell-settings-' + file });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: file,
      id: 'shell-settings-' + file,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
  }
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('settings, strip and drop-preview styles use declared tokens only', () => {
  const { parse } = loadCompilerSfc();
  for (const [file, source] of files) {
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(rawStyle(style.content), false, file);
      for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
        assert.ok(themeVars.has(match[1]), `${file}: undeclared token ${match[1]}`);
      }
    }
  }
});

test('settings panel exposes the S6 section/prop/event contract with stable ids', () => {
  for (const prop of ['scheme', 'density', 'snapToGrid', 'aiTerminal', 'shortcuts', 'about', 'section']) {
    assert.ok(settingsSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['update:scheme', 'update:density', 'update:snap-to-grid', 'update:ai-terminal', 'restore-layout', 'reset-layout', 'check-updates', 'open-licences', 'section-change']) {
    assert.ok(settingsSource.includes(`'${event}'`), 'event ' + event);
  }
  for (const section of ['appearance', 'workspace', 'ai-terminal', 'shortcuts', 'about']) {
    assert.ok(settingsSource.includes(`shell/settings/section-${section}`), 'section ' + section);
  }
  assert.ok(settingsSource.includes("'shell/settings/nav-'"), 'dynamic nav id prefix');
  assert.deepEqual([...SETTINGS_SECTIONS], ['appearance', 'workspace', 'ai-terminal', 'shortcuts', 'about']);
  for (const id of ['shell/settings/snap', 'shell/settings/ai-terminal', 'shell/settings/restore-layout', 'shell/settings/reset-layout', 'shell/settings/check-updates', 'shell/settings/licences', 'shell/settings/shortcuts-list']) {
    assert.ok(settingsSource.includes(id), 'id ' + id);
  }
  assert.ok(settingsSource.includes("'shell/settings/scheme-'"), 'dynamic scheme id prefix');
  assert.ok(settingsSource.includes("'shell/settings/density-'"), 'dynamic density id prefix');
  assert.ok(settingsSource.includes('aria-current'));
  assert.ok(settingsSource.includes('role="note"'));
  assert.ok(settingsSource.includes('role="status"'));
  assert.ok(settingsSource.includes('type="radio"'));
  assert.ok(settingsSource.includes('type="checkbox"'));
});

test('hidden strip exposes the S5 list contract with stable ids', () => {
  for (const prop of ['items', 'expanded', 'title', 'showLabel', 'showAllLabel', 'emptyText']) {
    assert.ok(stripSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['show', 'show-all', 'update:expanded']) {
    assert.ok(stripSource.includes(`'${event}'`), 'event ' + event);
  }
  for (const id of ['shell/hidden-strip', 'shell/hidden-strip/toggle', 'shell/hidden-strip/show-all', 'shell/hidden-strip/list', 'shell/hidden-strip/empty']) {
    assert.ok(stripSource.includes(id), 'id ' + id);
  }
  assert.ok(stripSource.includes("'shell/hidden-strip/item-'"), 'dynamic item id prefix');
  assert.ok(stripSource.includes("'shell/hidden-strip/show-'"), 'dynamic show id prefix');
  assert.ok(stripSource.includes('aria-expanded'));
  assert.ok(stripSource.includes('aria-controls="shell/hidden-strip/list"'));
  assert.ok(stripSource.includes('role="status"'));
});

test('drop preview exposes the S5 zone contract with stable ids', () => {
  for (const prop of ['visible', 'title', 'draggedLabel', 'targetLabel', 'actionLabel', 'floatingHint', 'zones']) {
    assert.ok(dropSource.includes(prop), 'prop ' + prop);
  }
  assert.ok(dropSource.includes(`'zone-activate'`), 'event zone-activate');
  for (const id of ['shell/drop-preview', 'shell/drop-preview/dragged', 'shell/drop-preview/status', 'shell/drop-preview/zone-tab', 'shell/drop-preview/zone-split-top', 'shell/drop-preview/zone-split-bottom', 'shell/drop-preview/zone-split-left', 'shell/drop-preview/zone-split-right', 'shell/drop-preview/zone-swap']) {
    assert.ok(dropSource.includes(id), 'id ' + id);
  }
  for (const zone of ['Drop Zone: Add as Tab', 'Split Horizontal Top', 'Split Horizontal Bottom', 'Split Vertical', 'Center = Swap Capsule', 'Drop here to replace active panel in grid']) {
    assert.ok(dropSource.includes(zone), 'zone ' + zone);
  }
  assert.ok(dropSource.includes('Press Shift to force Floating Window'));
  assert.ok(dropSource.includes('type="button"'));
});

test('every semantic anchor on settings, strip and drop preview matches a declared family', () => {
  for (const anchor of ['settings/restore-layout', 'settings/reset-layout', 'settings/snap-grid', 'settings/ai-terminal', 'settings/check-updates', 'settings/shortcuts', 'about/licences']) {
    assert.ok(settingsSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
  for (const prefix of ["'settings/nav-'", "'settings/scheme-'", "'settings/density-'"]) {
    assert.ok(settingsSource.includes(prefix), 'dynamic anchor ' + prefix);
  }
  for (const probe of ['settings/nav-appearance', 'settings/scheme-dark', 'settings/density-compact']) {
    assert.ok(matchControlFamily(probe), `undeclared anchor family ${probe}`);
  }
  for (const anchor of ['shell/navigation/hidden-toggle', 'shell/navigation/hidden-show-all']) {
    assert.ok(stripSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
  assert.ok(stripSource.includes(`'capsule/' + item.id + '/show'`), 'dynamic capsule show anchor');
  assert.ok(matchControlFamily('capsule/probe-1x/show'), 'capsule show family probe');
  for (const anchor of ['shell/navigation/drop-tab', 'shell/navigation/drop-split-top', 'shell/navigation/drop-split-bottom', 'shell/navigation/drop-split-left', 'shell/navigation/drop-split-right', 'shell/navigation/drop-swap']) {
    assert.ok(dropSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
});

test('maximized/restore keeps the TP5 toggle contract and floating stays theme-backed', () => {
  assert.ok(matchControlFamily('capsule/probe-1x/maximize'), 'restore uses the maximize toggle family');
  const presentation = readFileSync(path.resolve(here, '../src/workspace/windowPresentation.js'), 'utf8');
  assert.ok(presentation.includes('function maximize('), 'TP5 maximize toggle present');
  assert.ok(presentation.includes('exitMaximized'), 'TP5 restore path present');
  assert.ok(themeCss.includes('--dv-floating-box-shadow: var(--cuk-component-dock-workspace-floating-shadow);'));
  assert.ok(themeCss.includes('--dv-floating-border: var(--cuk-component-dock-workspace-floating-border);'));
  assert.equal(tokenValue('component.dockWorkspace.floatingShadow', 'dark.normal'), '0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35)');
  assert.equal(tokenValue('component.dockWorkspace.floatingShadow', 'light.normal'), '0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)');
});

test('settings, strip and drop preview carry no consumer names and import no vendor primitives', () => {
  for (const [file, source] of files) {
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), file);
    const vendor = Array.from(source.matchAll(/from '(openvue\/[^']+)'/g)).map((m) => m[1]);
    assert.deepEqual(vendor, [], file);
  }
  for (const icon of ['infocircle', 'eyeslash', 'undo', 'chevrondown', 'chevronup']) {
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

test('settings model catalogs schemes, densities and sections in S6 order', () => {
  assert.deepEqual(SCHEME_OPTIONS.map((o) => o.id), ['dark', 'light', 'system']);
  assert.deepEqual(DENSITY_OPTIONS.map((o) => o.id), ['comfortable', 'compact']);
  assert.deepEqual([...SETTINGS_SECTIONS], ['appearance', 'workspace', 'ai-terminal', 'shortcuts', 'about']);
  assert.equal(SECTION_LABELS['ai-terminal'], 'AI Terminal Mode');
  assert.equal(SETTINGS_STORAGE_KEYS.scheme, 'capsule-kit-scheme');
  assert.equal(SETTINGS_STORAGE_KEYS.schemePreference, 'capsule-kit-scheme-preference');
});

test('settings model resolves scheme preferences and refuses unknown ones', () => {
  assert.equal(resolveScheme('light', false), 'light');
  assert.equal(resolveScheme('dark', true), 'dark');
  assert.equal(resolveScheme('system', true), 'light');
  assert.equal(resolveScheme('system', false), 'dark');
  assert.throws(() => resolveScheme('nope', false), /Unknown scheme preference/);
});

test('settings storage helpers round-trip and never throw', () => {
  const store = new Map();
  const double = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, v); } };
  assert.equal(readStoredSetting(double, 'k', 'fb'), 'fb');
  assert.equal(writeStoredSetting(double, 'k', 'v'), true);
  assert.equal(readStoredSetting(double, 'k', 'fb'), 'v');
  assert.equal(readStoredSetting(null, 'k', 'fb'), 'fb');
  assert.equal(writeStoredSetting(null, 'k', 'v'), true);
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(readStoredSetting(broken, 'k', 'fb'), 'fb');
  assert.equal(writeStoredSetting(broken, 'k', 'v'), false);
});
