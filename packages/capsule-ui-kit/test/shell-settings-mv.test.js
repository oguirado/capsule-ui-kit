import { assertPackageImports } from './publication-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  DENSITY_OPTIONS,
  SCHEME_OPTIONS,
  SETTINGS_SECTIONS,
  SETTINGS_KEY_ANCHORS,
  normalizeRecordDestination,
  normalizeSettingsLimit,
  resolveSettingsOptionId,
} from '../src/shell/SettingsModel.js';

// Host-supplied settings keys (theme, providers, record-destination,
// limits): generic controls in the EXISTING settings/{key} family. The
// host supplies every value and applies every change; the kit only
// renders and emits, and the record destination arrives only through a
// host capability (no enumeration in kit code).

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(path.resolve(here, '../src/shell/SettingsPanel.vue'), 'utf8');
const modelSource = readFileSync(path.resolve(here, '../src/shell/SettingsModel.js'), 'utf8');
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

test('host-key panel compiles as plain JS (no lang="ts")', () => {
  const { parse, compileScript, compileTemplate } = loadCompilerSfc();
  const { descriptor, errors } = parse(panelSource, { filename: 'SettingsPanel.vue' });
  assert.deepEqual(errors, []);
  assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined);
  const script = compileScript(descriptor, { id: 'shell-settings-mv' });
  const template = compileTemplate({
    source: descriptor.template?.content ?? '',
    filename: 'SettingsPanel.vue',
    id: 'shell-settings-mv',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.deepEqual(template.errors, []);
});

const rawStyle = (source) => /(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(source);

test('host-key control styles use declared tokens only', () => {
  const { parse } = loadCompilerSfc();
  const { descriptor } = parse(panelSource, { filename: 'SettingsPanel.vue' });
  assert.ok(descriptor.styles.length > 0);
  for (const style of descriptor.styles) {
    assert.equal(rawStyle(style.content), false);
    for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
      assert.ok(themeVars.has(match[1]), `undeclared token ${match[1]}`);
    }
  }
  for (const selector of ['.s1-set .s1-set-card select', '.s1-set .s1-set-card input[type="text"]', '.s1-set .s1-set-card input[type="number"]']) {
    assert.ok(panelSource.includes(selector), 'selector ' + selector);
  }
});

test('panel exposes the host-key prop/event contract with stable ids', () => {
  for (const prop of ['theme', 'themeOptions', 'themeLabel', 'provider', 'providerOptions', 'providerLabel', 'recordDestination', 'recordDestinationOptions', 'recordDestinationLabel', 'recordDestinationHelp', 'limit', 'limitMin', 'limitMax', 'limitStep', 'limitLabel']) {
    assert.ok(panelSource.includes(prop), 'prop ' + prop);
  }
  for (const event of ['update:theme', 'update:provider', 'update:record-destination', 'update:limit']) {
    assert.ok(panelSource.includes(`'${event}'`), 'event ' + event);
  }
  for (const id of ['shell/settings/theme', 'shell/settings/providers', 'shell/settings/record-destination', 'shell/settings/limits', 'shell/settings/record-destination-list']) {
    assert.ok(panelSource.includes(id), 'id ' + id);
  }
});

test('every host-key anchor matches the declared settings family', () => {
  assert.deepEqual({ ...SETTINGS_KEY_ANCHORS }, {
    theme: 'settings/theme',
    providers: 'settings/providers',
    recordDestination: 'settings/record-destination',
    limits: 'settings/limits',
  });
  assert.ok(Object.isFrozen(SETTINGS_KEY_ANCHORS), 'anchors frozen');
  for (const anchor of Object.values(SETTINGS_KEY_ANCHORS)) {
    assert.ok(panelSource.includes(anchor), anchor);
    assert.ok(matchControlFamily(anchor), `undeclared anchor ${anchor}`);
  }
});

test('host-key widgets carry native roles and accessible names', () => {
  assert.ok(panelSource.includes('<select'), 'theme combobox element');
  assert.ok(panelSource.includes('id="shell/settings/theme"'), 'theme id');
  assert.ok(panelSource.includes(':aria-label="themeLabel"'), 'theme name');
  assert.ok(panelSource.includes('<fieldset id="shell/settings/providers"'), 'providers group element');
  assert.ok(panelSource.includes('<legend class="s1-set-legend">{{ providerLabel }}</legend>'), 'providers name');
  assert.ok(panelSource.includes('name="settings-provider"'), 'provider radios');
  assert.ok(panelSource.includes('type="text"'), 'destination textbox element');
  assert.ok(panelSource.includes('id="shell/settings/record-destination"'), 'destination id');
  assert.ok(panelSource.includes(':aria-label="recordDestinationLabel"'), 'destination name');
  assert.ok(panelSource.includes('<datalist'), 'destination candidates element');
  assert.ok(panelSource.includes('type="number"'), 'limits spinbutton element');
  assert.ok(panelSource.includes('id="shell/settings/limits"'), 'limits id');
  assert.ok(panelSource.includes(':aria-label="limitLabel"'), 'limits name');
  assert.ok(panelSource.includes(':min="limitMin"'), 'limits min');
  assert.ok(panelSource.includes(':max="limitMax"'), 'limits max');
  assert.ok(panelSource.includes(':step="limitStep"'), 'limits step');
  for (const forId of ['for-id="shell/settings/theme"', 'for-id="shell/settings/record-destination"', 'for-id="shell/settings/limits"']) {
    assert.ok(panelSource.includes(forId), 'label ' + forId);
  }
});

test('host-key controls render only when the host supplies values', () => {
  assert.ok(panelSource.includes('v-if="themeList.length > 0"'), 'theme gate');
  assert.ok(panelSource.includes('v-if="providerList.length > 0"'), 'providers gate');
  assert.ok(panelSource.includes('v-if="recordDestinationVisible"'), 'destination gate');
  assert.ok(panelSource.includes('v-if="limitShown"'), 'limits gate');
  assert.ok(panelSource.includes("changeHostSetting($event, 'theme')"), 'theme commit');
  assert.ok(panelSource.includes("changeHostSetting($event, 'record-destination')"), 'destination commit');
  assert.ok(panelSource.includes("emit('update:provider', option.id)"), 'provider commit');
  assert.ok(panelSource.includes('@change="changeLimit"'), 'limits commit');
  assert.ok(panelSource.includes('v-for="option in themeList"'), 'theme options from host');
  assert.ok(panelSource.includes('v-for="option in providerList"'), 'provider options from host');
  assert.ok(panelSource.includes('v-for="option in recordDestinationList"'), 'destination options from host');
});

test('record destination flows only through the host capability', () => {
  for (const [label, source] of [['panel', panelSource], ['model', modelSource]]) {
    assert.ok(!source.includes("from 'node:"), `${label}: no node runtime import`);
    assert.ok(!source.includes('process.'), `${label}: no process access`);
    assert.ok(!source.includes('require('), `${label}: no require`);
    assert.doesNotMatch(source, /from '(fs|path|os)'/, `${label}: no host enumeration import`);
  }
  assert.ok(panelSource.includes(':value="recordDestination"'), 'destination value from host prop');
  assert.ok(panelSource.includes(':list="recordDestinationList.length > 0 ? \'shell/settings/record-destination-list\' : undefined"'), 'candidates list from host prop');
});

test('host-key files carry no consumer or provider names', () => {
  for (const [label, source] of [['panel', panelSource], ['model', modelSource]]) {
    assert.doesNotMatch(source, /claude|codex/i, label);
    assert.doesNotMatch(source, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/, `${label}: mail-shaped string`);
  }
});

test('settings option resolution snaps to listed ids', () => {
  const options = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  assert.equal(resolveSettingsOptionId(options, 'b'), 'b');
  assert.equal(resolveSettingsOptionId(options, 'zzz'), 'a');
  assert.equal(resolveSettingsOptionId(options, ''), 'a');
  assert.equal(resolveSettingsOptionId([], 'a'), '');
  assert.equal(resolveSettingsOptionId(null, 'a'), '');
  assert.equal(resolveSettingsOptionId([{ id: '' }, { label: 'x' }], 'a'), '');
});

test('record destination normalization trims host values', () => {
  assert.equal(normalizeRecordDestination('  disk-a  '), 'disk-a');
  assert.equal(normalizeRecordDestination('disk-a'), 'disk-a');
  assert.equal(normalizeRecordDestination(''), '');
  assert.equal(normalizeRecordDestination(null), '');
  assert.equal(normalizeRecordDestination(42), '');
});

test('settings limit normalization clamps to host bounds', () => {
  assert.equal(normalizeSettingsLimit(5, { min: 1, max: 10 }), 5);
  assert.equal(normalizeSettingsLimit(50, { min: 1, max: 10 }), 10);
  assert.equal(normalizeSettingsLimit(-5, { min: 1, max: 10 }), 1);
  assert.equal(normalizeSettingsLimit('7', { min: 1, max: 10 }), 7);
  assert.equal(normalizeSettingsLimit('  ', {}), null);
  assert.equal(normalizeSettingsLimit(Number.NaN, {}), null);
  assert.equal(normalizeSettingsLimit(undefined, {}), null);
  assert.equal(normalizeSettingsLimit(Number.POSITIVE_INFINITY, {}), null);
  assert.equal(normalizeSettingsLimit(5, { min: 10, max: 1 }), 5);
  assert.equal(normalizeSettingsLimit(5), 5);
});

test('existing settings contract is unchanged', () => {
  assert.deepEqual(SCHEME_OPTIONS.map((o) => o.id), ['dark', 'light', 'system']);
  assert.deepEqual(DENSITY_OPTIONS.map((o) => o.id), ['comfortable', 'compact']);
  assert.deepEqual([...SETTINGS_SECTIONS], ['appearance', 'workspace', 'ai-terminal', 'shortcuts', 'about']);
  for (const anchor of ['settings/restore-layout', 'settings/snap-grid', 'settings/ai-terminal']) {
    assert.ok(panelSource.includes(anchor), anchor);
  }
});

test('imports use package boundaries and declared dependencies', () => assertPackageImports());
