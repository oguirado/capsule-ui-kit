/**
 * @file Fleet overview tests: model, registry rows, selection journey and SFC contract.
 * Mirror-safe: imports only lane F sources plus node builtins and the kit
 * compiler. Family membership against the shared control registry and token
 * declaration membership against the kit theme are verified by the lane probes
 * (see the lane report), which read the live kit files as an independent oracle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  FLEET_BOARD_EMITS,
  FLEET_BULK_EMPTY_REASON,
  FLEET_BULK_FOLD_ACCESSIBLE_NAME,
  FLEET_BULK_FOLD_ANCHOR,
  FLEET_BULK_FOLD_DOM_ID,
  FLEET_BULK_HIDE_ACCESSIBLE_NAME,
  FLEET_BULK_HIDE_ANCHOR,
  FLEET_BULK_HIDE_DOM_ID,
  FLEET_BULK_INTENTS,
  FLEET_BULK_STOP_ACCESSIBLE_NAME,
  FLEET_BULK_STOP_ANCHOR,
  FLEET_BULK_STOP_DOM_ID,
  FLEET_CAPSULE_KINDS,
  FLEET_CAPSULE_STATES,
  FLEET_EMPTY_TEXT,
  FLEET_FOLD_INTENT,
  FLEET_HIDE_INTENT,
  FLEET_INPUT_MODE_LABELS,
  FLEET_INPUT_MODES,
  FLEET_INSPECTOR_EMPTY_TEXT,
  FLEET_KIND_LABELS,
  FLEET_LAYOUTS,
  FLEET_SELECT_INTENT,
  FLEET_STOP_INTENT,
  FLEET_UNKNOWN_KIND_LABEL,
  FLEET_UNKNOWN_TEXT,
  buildFleetBulkIntent,
  buildFleetSelectIntent,
  fleetBulkReason,
  fleetCardDomId,
  fleetInspectorAccessibleName,
  fleetInspectorAnchor,
  fleetInspectorCapsule,
  fleetInspectorDomId,
  fleetInputModeLabel,
  fleetKindLabel,
  fleetRowAccessibleName,
  fleetRowAnchor,
  fleetRowDomId,
  fleetSelectAccessibleName,
  fleetSelectAnchor,
  fleetSelectDomId,
  fleetStateTone,
  formatFleetResourceValue,
  formatFleetUptime,
  isFleetBulkIntent,
  isFleetEntityId,
  isFleetSelected,
  normalizeFleetCapsule,
  normalizeFleetCapsuleKind,
  normalizeFleetCapsuleState,
  normalizeFleetInputMode,
  normalizeFleetLayout,
  normalizeFleetResource,
  normalizeSelectedIds,
  toggleFleetSelection,
} from '../src/fleet/fleetModel.js';
import {
  FLEET_REGISTRY_ROWS,
  FLEET_AGENT_LANE_IDS,
  FLEET_FIXTURE_IDS,
  fleetAnchorFor,
} from '../src/fleet/fleetRegistryRows.js';

const require = createRequire(import.meta.url);
const { parse, compileScript } = require('@vue/compiler-sfc');

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const fleetDir = path.join(kitRoot, 'src', 'fleet');
const indexSource = readFileSync(path.join(fleetDir, 'index.js'), 'utf8');
const rowsSource = readFileSync(path.join(fleetDir, 'fleetRegistryRows.js'), 'utf8');
const modelSource = readFileSync(path.join(fleetDir, 'fleetModel.js'), 'utf8');

test('fleet model exposes the lane F contracts', () => {
  assert.deepEqual([...FLEET_CAPSULE_STATES], ['ready', 'starting', 'lost', 'error', 'stopped']);
  assert.deepEqual([...FLEET_CAPSULE_KINDS], [
    'browser', 'desktop', 'microvm', 'identity_browser', 'game_capsule', 'terminal',
  ]);
  assert.deepEqual({ ...FLEET_KIND_LABELS }, {
    browser: 'Browser',
    desktop: 'Desktop Program',
    microvm: 'VM',
    identity_browser: 'Identity Browser',
    game_capsule: 'Game Capsule',
    terminal: 'Terminal',
  });
  assert.deepEqual([...FLEET_INPUT_MODES], ['read', 'write']);
  assert.deepEqual({ ...FLEET_INPUT_MODE_LABELS }, { read: 'READ', write: 'WRITE' });
  assert.deepEqual([...FLEET_LAYOUTS], ['table', 'cards']);
  assert.equal(FLEET_UNKNOWN_TEXT, 'unknown');
  assert.equal(FLEET_UNKNOWN_KIND_LABEL, 'Unknown');
  assert.equal(FLEET_EMPTY_TEXT, 'No capsules.');
  assert.equal(FLEET_INSPECTOR_EMPTY_TEXT, 'No capsule selected.');
  assert.equal(FLEET_BULK_EMPTY_REASON, 'No capsules selected.');
  assert.equal(FLEET_SELECT_INTENT, 'fleet-select');
  assert.equal(FLEET_FOLD_INTENT, 'fleet-fold');
  assert.equal(FLEET_HIDE_INTENT, 'fleet-hide');
  assert.equal(FLEET_STOP_INTENT, 'fleet-stop');
  assert.deepEqual([...FLEET_BULK_INTENTS], ['fleet-fold', 'fleet-hide', 'fleet-stop']);
  assert.deepEqual([...FLEET_BOARD_EMITS], ['submit-intent']);
});

test('fleet entity ids are anchor tokens, never numeric indexes', () => {
  for (const id of ['cap-01', 'cap.07', 'fleet-bulk', 'sess_01', 'unknown']) {
    assert.equal(isFleetEntityId(id), true, id);
  }
  for (const id of ['', '  ', 'cap 01', 'cap/01', '01', '007', 7, null, undefined, {}, []]) {
    assert.equal(isFleetEntityId(id), false, String(id));
  }
});

test('fleet normalization and tones fail closed to unknown', () => {
  assert.equal(normalizeFleetCapsuleState('ready'), 'ready');
  assert.equal(normalizeFleetCapsuleState('Ready'), 'unknown');
  assert.equal(normalizeFleetCapsuleState(null), 'unknown');
  assert.equal(fleetStateTone('ready'), 'success');
  assert.equal(fleetStateTone('starting'), 'info');
  assert.equal(fleetStateTone('lost'), 'warning');
  assert.equal(fleetStateTone('error'), 'error');
  assert.equal(fleetStateTone('stopped'), 'neutral');
  assert.equal(fleetStateTone('invented'), 'neutral');
  assert.equal(normalizeFleetCapsuleKind('desktop'), 'desktop');
  assert.equal(normalizeFleetCapsuleKind('program'), 'unknown');
  assert.equal(fleetKindLabel('desktop'), 'Desktop Program');
  assert.equal(fleetKindLabel('microvm'), 'VM');
  assert.equal(fleetKindLabel('program'), 'Unknown');
  assert.equal(normalizeFleetInputMode('write'), 'write');
  assert.equal(normalizeFleetInputMode('execute'), 'unknown');
  assert.equal(fleetInputModeLabel('read'), 'READ');
  assert.equal(fleetInputModeLabel('execute'), 'unknown');
  assert.equal(normalizeFleetLayout('cards'), 'cards');
  assert.equal(normalizeFleetLayout('wall'), 'table');
  assert.equal(normalizeFleetLayout(null), 'table');
});

test('normalizeFleetCapsule never throws and never invents values', () => {
  for (const raw of [null, undefined, 7, 'cap-01', [], {}]) {
    const capsule = normalizeFleetCapsule(raw);
    assert.equal(capsule.id, 'unknown');
    assert.equal(capsule.kind, 'unknown');
    assert.equal(capsule.state, 'unknown');
    assert.equal(capsule.owner, null);
    assert.equal(capsule.inputMode, 'unknown');
    assert.deepEqual([...capsule.resources], []);
    assert.equal(capsule.uptimeSeconds, null);
    assert.equal(capsule.sessionId, null);
    assert.equal(capsule.epoch, null);
  }
  const full = normalizeFleetCapsule({
    id: 'cap-07',
    label: '  Renderer  ',
    kind: 'browser',
    state: 'ready',
    owner: 'desk-operator',
    inputMode: 'write',
    resources: [{ key: 'cpu', label: 'CPU', value: 12, unit: '%' }],
    uptimeSeconds: 3661,
    sessionId: 'sess-01',
    epoch: 42,
  });
  assert.equal(full.id, 'cap-07');
  assert.equal(full.label, 'Renderer');
  assert.equal(full.owner, 'desk-operator');
  assert.equal(full.inputMode, 'write');
  assert.equal(full.resources.length, 1);
  assert.equal(full.uptimeSeconds, 3661);
  assert.equal(full.sessionId, 'sess-01');
  assert.equal(full.epoch, 42);
  assert.ok(Object.isFrozen(full));
  const coerced = normalizeFleetCapsule({
    id: 'cap-07', label: '  ', owner: '', uptimeSeconds: -5, epoch: 1.5, sessionId: '12',
  });
  assert.equal(coerced.label, 'cap-07');
  assert.equal(coerced.owner, null);
  assert.equal(coerced.uptimeSeconds, null);
  assert.equal(coerced.epoch, null);
  assert.equal(coerced.sessionId, null);
  const resource = normalizeFleetResource({ value: 0 });
  assert.equal(resource.key, 'unknown');
  assert.equal(resource.label, 'unknown');
  assert.equal(resource.value, 0);
  assert.equal(resource.unit, '');
});

test('resource and uptime formatting renders genuine zeros but never fakes unknown as zero', () => {
  assert.equal(formatFleetResourceValue(0, '%'), '0 %');
  assert.equal(formatFleetResourceValue(512, 'MiB'), '512 MiB');
  assert.equal(formatFleetResourceValue('12', '%'), '12 %');
  for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '', '  ', {}, []]) {
    assert.equal(formatFleetResourceValue(value, '%'), 'unknown', String(value));
  }
  assert.equal(formatFleetUptime(0), '0s');
  assert.equal(formatFleetUptime(45), '45s');
  assert.equal(formatFleetUptime(330), '5m 30s');
  assert.equal(formatFleetUptime(3661), '1h 1m');
  assert.equal(formatFleetUptime(187200), '2d 4h');
  for (const value of [null, undefined, Number.NaN, -1, '45', {}, []]) {
    assert.equal(formatFleetUptime(value), 'unknown', String(value));
  }
});

test('fleet selection helpers are pure and honor identity rules', () => {
  assert.deepEqual([...normalizeSelectedIds(['cap-01', 'cap-02', 'cap-01', '07', null])], ['cap-01', 'cap-02']);
  assert.deepEqual([...normalizeSelectedIds('cap-01')], []);
  assert.equal(isFleetSelected(['cap-01'], 'cap-01'), true);
  assert.equal(isFleetSelected(['cap-01'], 'cap-02'), false);
  assert.equal(isFleetSelected(['cap-01'], '07'), false);
  assert.equal(isFleetSelected(null, 'cap-01'), false);
  const before = Object.freeze(['cap-01']);
  assert.deepEqual([...toggleFleetSelection(before, 'cap-02')], ['cap-01', 'cap-02']);
  assert.deepEqual([...toggleFleetSelection(before, 'cap-01')], []);
  assert.deepEqual([...toggleFleetSelection(before, '07')], ['cap-01']);
  assert.deepEqual(before, ['cap-01']);
  assert.ok(Object.isFrozen(toggleFleetSelection(['cap-01'], 'cap-02')));
});

test('inspector resolution follows the most recent selection in the census', () => {
  const census = [
    { id: 'cap-01', state: 'ready' },
    { id: 'cap-02', state: 'lost' },
  ];
  assert.equal(fleetInspectorCapsule(census, ['cap-01', 'cap-02'])?.id, 'cap-02');
  assert.equal(fleetInspectorCapsule(census, ['cap-02', 'cap-01'])?.id, 'cap-01');
  assert.equal(fleetInspectorCapsule(census, ['cap-09', 'cap-01'])?.id, 'cap-01');
  assert.equal(fleetInspectorCapsule(census, ['cap-09']), null);
  assert.equal(fleetInspectorCapsule(census, []), null);
  assert.equal(fleetInspectorCapsule([], ['cap-01']), null);
  assert.equal(fleetInspectorCapsule(null, ['cap-01']), null);
  const resolved = fleetInspectorCapsule(census, ['cap-02']);
  assert.equal(resolved?.state, 'lost');
  assert.ok(Object.isFrozen(resolved));
});

test('fleet intent builders freeze exact payloads', () => {
  assert.deepEqual(buildFleetSelectIntent({ capsuleId: 'cap-07', selected: true }), {
    type: 'fleet-select', capsuleId: 'cap-07', selected: true,
  });
  assert.deepEqual(buildFleetSelectIntent({ capsuleId: '07', selected: 'yes' }), {
    type: 'fleet-select', capsuleId: 'unknown', selected: false,
  });
  assert.deepEqual(buildFleetSelectIntent(null), {
    type: 'fleet-select', capsuleId: 'unknown', selected: false,
  });
  for (const type of ['fleet-fold', 'fleet-hide', 'fleet-stop']) {
    const intent = buildFleetBulkIntent(type, ['cap-01', 'cap-02', 'cap-01', '07']);
    assert.deepEqual({ ...intent, capsuleIds: [...intent.capsuleIds] }, {
      type, capsuleIds: ['cap-01', 'cap-02'],
    });
    assert.ok(Object.isFrozen(intent));
    assert.ok(Object.isFrozen(intent.capsuleIds));
    assert.equal(isFleetBulkIntent(intent), true);
  }
  assert.throws(() => buildFleetBulkIntent('fleet-destroy', ['cap-01']), /Unknown fleet bulk intent/);
  assert.throws(() => buildFleetBulkIntent(null, []), /Unknown fleet bulk intent/);
  for (const value of [null, {}, { type: 'fleet-fold' }, { type: 'fleet-fold', capsuleIds: ['07'] }, { type: 'fleet-destroy', capsuleIds: [] }]) {
    assert.equal(isFleetBulkIntent(value), false, JSON.stringify(value));
  }
});

test('fleet DOM ids, anchors and accessible names are stable and exact', () => {
  assert.equal(fleetRowDomId('cap-07'), 'cuk-fleet-row-cap-07');
  assert.equal(fleetRowDomId('07'), 'cuk-fleet-row-unknown');
  assert.equal(fleetRowAnchor('cap-07'), 'fleet/cap-07/row');
  assert.equal(fleetRowAccessibleName({ id: 'cap-07', kind: 'desktop', state: 'ready' }),
    'Capsule cap-07: Desktop Program, ready.');
  assert.equal(fleetCardDomId('cap-07'), 'cuk-fleet-card-cap-07');
  assert.equal(fleetCardDomId(null), 'cuk-fleet-card-unknown');
  assert.equal(fleetSelectDomId('cap-07'), 'cuk-fleet-select-cap-07');
  assert.equal(fleetSelectAnchor('cap-07'), 'dialog/cap-07/select');
  assert.equal(fleetSelectAnchor('07'), 'dialog/unknown/select');
  assert.equal(fleetSelectAccessibleName({ id: 'cap-07', label: 'Renderer' }), 'Select capsule Renderer.');
  assert.equal(fleetInspectorDomId('cap-07'), 'cuk-fleet-inspector-cap-07');
  assert.equal(fleetInspectorAnchor('cap-07'), 'inspector/cap-07/field');
  assert.equal(fleetInspectorAccessibleName({ id: 'cap-07', label: 'Renderer' }), 'Inspector for Renderer.');
  assert.equal(fleetInspectorAccessibleName(null), 'Inspector. No capsule selected.');
  assert.equal(fleetInspectorAccessibleName(undefined), 'Inspector. No capsule selected.');
  // State changes never move the stable identity.
  assert.equal(fleetRowDomId('cap-07'), 'cuk-fleet-row-cap-07');
  assert.equal(fleetRowAnchor('cap-07'), 'fleet/cap-07/row');
});

test('fleet bulk constants and empty reason are literal', () => {
  assert.equal(FLEET_BULK_FOLD_DOM_ID, 'cuk-fleet-bulk-fold');
  assert.equal(FLEET_BULK_FOLD_ANCHOR, 'dialog/fleet-bulk/fold');
  assert.equal(FLEET_BULK_FOLD_ACCESSIBLE_NAME, 'Fold selected capsules.');
  assert.equal(FLEET_BULK_HIDE_DOM_ID, 'cuk-fleet-bulk-hide');
  assert.equal(FLEET_BULK_HIDE_ANCHOR, 'dialog/fleet-bulk/hide');
  assert.equal(FLEET_BULK_HIDE_ACCESSIBLE_NAME, 'Hide selected capsules.');
  assert.equal(FLEET_BULK_STOP_DOM_ID, 'cuk-fleet-bulk-stop');
  assert.equal(FLEET_BULK_STOP_ANCHOR, 'dialog/fleet-bulk/stop');
  assert.equal(FLEET_BULK_STOP_ACCESSIBLE_NAME, 'Stop selected capsules.');
  assert.equal(fleetBulkReason([]), 'No capsules selected.');
  assert.equal(fleetBulkReason(['07']), 'No capsules selected.');
  assert.equal(fleetBulkReason(['cap-01']), null);
});

test('fleet registry rows cover the lane F control surface exactly once', () => {
  assert.equal(FLEET_REGISTRY_ROWS.length, 6);
  assert.equal(FLEET_AGENT_LANE_IDS.length, 6);
  assert.equal(new Set(FLEET_AGENT_LANE_IDS).size, 6);
  for (const row of FLEET_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'F', 'lane ' + row.agentLaneId);
    assert.equal(row.anchorStatus, 'existing', 'status ' + row.agentLaneId);
    assert.ok(row.component && !/\s/.test(row.component), 'component ' + row.agentLaneId);
    assert.ok(!/[{}]/.test(row.anchorExample), 'concrete example ' + row.agentLaneId);
  }
  assert.deepEqual({ ...FLEET_FIXTURE_IDS }, { capsuleId: 'cap-01', bulkId: 'fleet-bulk' });
  assert.deepEqual([...FLEET_AGENT_LANE_IDS], [
    'fleet.row',
    'fleet.row.select',
    'fleet.bulk.fold',
    'fleet.bulk.hide',
    'fleet.bulk.stop',
    'fleet.inspector.field',
  ]);
  assert.deepEqual(FLEET_REGISTRY_ROWS.map((row) => row.anchorExample), [
    'fleet/cap-01/row',
    'dialog/cap-01/select',
    'dialog/fleet-bulk/fold',
    'dialog/fleet-bulk/hide',
    'dialog/fleet-bulk/stop',
    'inspector/cap-01/field',
  ]);
});

test('fleet registry examples rebuild from template plus fixtures', () => {
  for (const row of FLEET_REGISTRY_ROWS) {
    const rebuilt = row.anchorTemplate
      .split('{id}').join(FLEET_FIXTURE_IDS.capsuleId)
      .split('{action}').join(row.anchorExample.split('/').at(-1) ?? '');
    const bulkRebuilt = rebuilt.split(FLEET_FIXTURE_IDS.capsuleId).join(FLEET_FIXTURE_IDS.bulkId);
    assert.ok(row.anchorExample === rebuilt || row.anchorExample === bulkRebuilt,
      'rebuild ' + row.agentLaneId);
    assert.ok(row.anchorExample.includes(FLEET_FIXTURE_IDS.capsuleId)
      || row.anchorExample.includes(FLEET_FIXTURE_IDS.bulkId), 'fixture ' + row.agentLaneId);
  }
  assert.equal(fleetAnchorFor('fleet.row'), 'fleet/cap-01/row');
  assert.equal(fleetAnchorFor('fleet.row', { id: 'cap-07' }), 'fleet/cap-07/row');
  assert.equal(fleetAnchorFor('fleet.row.select', { id: 'cap-07' }), 'dialog/cap-07/select');
  assert.equal(fleetAnchorFor('fleet.bulk.fold'), 'dialog/fleet-bulk/fold');
  assert.equal(fleetAnchorFor('fleet.bulk.stop', { bulk: 'fleet-team' }), 'dialog/fleet-team/stop');
  assert.equal(fleetAnchorFor('fleet.inspector.field', { id: 'cap-07' }), 'inspector/cap-07/field');
  assert.throws(() => fleetAnchorFor('fleet.invented'), /Unknown fleet agent_lane id/);
});

test('fleet component index exports exactly the lane F surface', () => {
  const expected = ['FleetOverview', 'FleetBulkBar'];
  const exported = Array.from(indexSource.matchAll(/export \{ default as (\w+) \} from '\.\/(\w+)\.vue';/g));
  assert.deepEqual(exported.map((m) => m[1]), expected);
  for (const m of exported) {
    assert.equal(m[1], m[2]);
  }
  assert.ok(indexSource.includes(`export * from './fleetModel.js';`));
  assert.ok(indexSource.includes(`export * from './fleetRegistryRows.js';`));
  const onDisk = readdirSync(fleetDir).filter((f) => f.endsWith('.vue'));
  assert.deepEqual(onDisk.sort(), expected.map((name) => `${name}.vue`).sort());
  for (const file of onDisk) {
    assert.ok(indexSource.includes(`from './${file}'`), 'unexported component ' + file);
    assert.ok(existsSync(path.join(fleetDir, file)), file);
  }
  const modules = readdirSync(fleetDir).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(modules, ['fleetModel.js', 'fleetRegistryRows.js', 'index.js']);
});

test('fleet lane components compile as plain JS', () => {
  const onDisk = readdirSync(fleetDir).filter((f) => f.endsWith('.vue'));
  assert.equal(onDisk.length, 2);
  for (const file of onDisk) {
    const source = readFileSync(path.join(fleetDir, file), 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.scriptSetup?.lang ?? descriptor.script?.lang ?? undefined, undefined, file);
    assert.ok(descriptor.template, 'template ' + file);
    assert.ok(descriptor.styles.length > 0, 'styles ' + file);
    const script = compileScript(descriptor, { id: 'fleet-index-' + file });
    assert.ok(script.content.length > 0, file);
  }
});

test('fleet components carry stable ids, roles, names, anchors and intents', () => {
  const sources = {};
  for (const file of readdirSync(fleetDir).filter((f) => f.endsWith('.vue'))) {
    sources[file] = readFileSync(path.join(fleetDir, file), 'utf8');
  }
  const overview = sources['FleetOverview.vue'];
  assert.ok(overview.includes('id="cuk-fleet-overview"'), 'overview id');
  assert.ok(overview.includes('role="region"'), 'overview region');
  assert.ok(overview.includes('id="cuk-fleet-census"'), 'census section');
  assert.ok(overview.includes('aria-label="Capsule census"'), 'census name');
  assert.ok(overview.includes('id="cuk-fleet-table"'), 'table id');
  assert.ok(overview.includes('id="cuk-fleet-cards"'), 'cards id');
  for (const column of ['Capsule', 'Kind', 'State', 'Owner / Mode', 'Resources', 'Uptime', 'Select']) {
    assert.ok(overview.includes(`<th scope="col">${column}</th>`), 'column ' + column);
  }
  assert.ok(overview.includes('role="row"'), 'row role');
  assert.ok(overview.includes('aria-pressed'), 'select pressed state');
  assert.ok(overview.includes(':data-semantic-anchor="fleetRowAnchor(capsule.id)"'), 'row anchor binding');
  assert.ok(overview.includes(':data-semantic-anchor="fleetSelectAnchor(capsule.id)"'), 'select anchor binding');
  assert.ok(overview.includes('fleetRowDomId'), 'row dom id helper');
  assert.ok(overview.includes('fleetCardDomId'), 'card dom id helper');
  assert.ok(overview.includes('fleetSelectAccessibleName'), 'select name helper');
  assert.ok(overview.includes('<slot name="inspector"'), 'inspector slot');
  assert.ok(overview.includes(':capsule="inspectorCapsule"'), 'inspector slot prop');
  assert.ok(overview.includes('fleetInspectorAnchor'), 'inspector anchor helper');
  assert.ok(overview.includes('fleetInspectorAccessibleName'), 'inspector name helper');
  assert.ok(overview.includes('{{ FLEET_EMPTY_TEXT }}'), 'empty text binding');
  assert.ok(overview.includes('{{ FLEET_INSPECTOR_EMPTY_TEXT }}'), 'inspector empty text binding');
  assert.ok(overview.includes(`defineEmits(['submit-intent'])`), 'overview emits');
  assert.ok(overview.includes('<FleetBulkBar'), 'bulk bar wiring');
  assert.ok(overview.includes('@submit-intent="forwardIntent"'), 'intent forwarding');
  const bar = sources['FleetBulkBar.vue'];
  assert.ok(bar.includes('id="cuk-fleet-bulk"'), 'bar id');
  assert.ok(bar.includes('aria-label="Bulk actions"'), 'bar name');
  assert.ok(bar.includes('role="status"'), 'bar status');
  assert.ok(bar.includes('FLEET_BULK_FOLD_DOM_ID'), 'fold id constant');
  assert.ok(bar.includes('FLEET_BULK_HIDE_ANCHOR'), 'hide anchor constant');
  assert.ok(bar.includes('FLEET_BULK_STOP_ACCESSIBLE_NAME'), 'stop name constant');
  assert.ok(bar.includes('Fold selected'), 'fold label');
  assert.ok(bar.includes('Hide selected'), 'hide label');
  assert.ok(bar.includes('Stop selected'), 'stop label');
  assert.ok(bar.includes(':disabled='), 'disabled binding');
  assert.ok(bar.includes('cuk-fleet-bulk-reason'), 'reason id');
  assert.ok(bar.includes(`defineEmits(['submit-intent'])`), 'bar emits');
  assert.ok(bar.includes('buildFleetBulkIntent'), 'bulk intent builder');
  for (const [file, source] of Object.entries(sources)) {
    assert.ok(source.includes('aria-label'), 'accessible name ' + file);
    assert.ok(source.includes('data-semantic-anchor'), 'anchor ' + file);
  }
});

test('fleet component styles use token variables only', () => {
  const onDisk = readdirSync(fleetDir).filter((f) => f.endsWith('.vue'));
  for (const file of onDisk) {
    const source = readFileSync(path.join(fleetDir, file), 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    for (const block of descriptor.styles) {
      const css = block.content;
      assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'hex color in ' + file);
      assert.doesNotMatch(css, /[^a-z-](rgb|hsl)a?\(/i, 'raw color function in ' + file);
      for (const match of css.matchAll(/var\(\s*(--[a-z0-9_-]+)/g)) {
        assert.ok(match[1].startsWith('--cuk-'), `non-kit token ${match[1]} in ${file}`);
      }
    }
    assert.doesNotMatch(source, /from\s+['"]openvue[^'"]*['"]/, 'direct openvue import in ' + file);
  }
});

test('fleet modules stay data-only, sink-free and publishable', () => {
  assert.equal(/^\s*import\s/m.test(rowsSource), false);
  assert.equal(/^\s*import\s/m.test(modelSource), false);
  const laneFiles = readdirSync(fleetDir).filter((f) => f.endsWith('.js') || f.endsWith('.vue'));
  assert.equal(laneFiles.length, 5);
  const sinks = [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch(',
    'XMLHttpRequest',
    'navigator.clipboard',
    'writeText(',
    'writeFile',
    'appendFile',
    'createWriteStream',
    'document.write',
    'window.open',
    'sendBeacon',
    'WebSocket(',
  ];
  for (const file of laneFiles) {
    const source = readFileSync(path.join(fleetDir, file), 'utf8');
    for (const sink of sinks) {
      assert.equal(source.includes(sink), false, `${file}: must not contain ${sink}`);
    }
    assert.doesNotMatch(source, /from\s+['"]node:/, 'node runtime in ' + file);
    assert.doesNotMatch(source, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/, 'address in ' + file);
  }
});
