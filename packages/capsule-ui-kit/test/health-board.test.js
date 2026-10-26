/**
 * @file Capsule health board tests: model, registry rows, agent journey and SFC contract.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse, compileScript } from '@vue/compiler-sfc';
import {
  createControlRegistry,
  matchControlFamily,
  computeStateDigests,
} from '../src/agent/controlRegistry.js';
import {
  HEALTH_CAPSULE_STATES,
  HEALTH_ALERT_SEVERITIES,
  HEALTH_SEVERITY_FILTERS,
  HEALTH_SEVERITY_FILTER_LABELS,
  HEALTH_UNKNOWN_TEXT,
  HEALTH_ACKNOWLEDGE_ALERT_INTENT,
  HEALTH_FILTER_CHANGE_INTENT,
  HEALTH_BOARD_EMITS,
  HEALTH_SEVERITY_FILTER_DOM_ID,
  HEALTH_SEVERITY_FILTER_ANCHOR,
  HEALTH_UNREAD_FILTER_DOM_ID,
  HEALTH_UNREAD_FILTER_ANCHOR,
  isHealthEntityId,
  normalizeHealthCapsuleState,
  healthStateTone,
  normalizeHealthCapsule,
  normalizeHealthMetric,
  formatHealthMetricValue,
  normalizeAlertSeverity,
  alertSeverityTone,
  normalizeHealthAlert,
  normalizeSeverityFilter,
  filterHealthAlerts,
  buildAcknowledgeAlertIntent,
  buildFilterChangeIntent,
  healthCapsuleRowDomId,
  healthCapsuleRowAnchor,
  healthCapsuleRowAccessibleName,
  healthTelemetryDomId,
  healthTelemetryAnchor,
  healthTelemetryAccessibleName,
  healthAlertDomId,
  healthAlertAnchor,
  healthAlertAccessibleName,
  healthAckDomId,
  healthAckAnchor,
  healthAckAccessibleName,
} from '../src/health/healthModel.js';
import {
  HEALTH_REGISTRY_ROWS,
  HEALTH_AGENT_LANE_IDS,
  HEALTH_FIXTURE_IDS,
  healthAnchorFor,
} from '../src/health/healthRegistryRows.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const healthDir = path.join(kitRoot, 'src', 'health');
const indexSource = readFileSync(path.join(healthDir, 'index.js'), 'utf8');
const rowsSource = readFileSync(path.join(healthDir, 'healthRegistryRows.js'), 'utf8');
const modelSource = readFileSync(path.join(healthDir, 'healthModel.js'), 'utf8');

function createReviewedProducer() {
  return Object.freeze({
    contractId: 'agent_lane.producer/v1',
    peer: 'test-harness-at-spi',
    reviewed: true,
    mapStableId(/** @type {{ windowId: string, presentationInstance: string, semanticAnchor: string, epoch: number, generation: number }} */ input) {
      return `${input.windowId}:${input.presentationInstance}:${input.semanticAnchor}@e${input.epoch}.g${input.generation}`;
    },
  });
}

test('health model exposes the lane H state and severity contracts', () => {
  assert.deepEqual([...HEALTH_CAPSULE_STATES], ['ready', 'starting', 'lost', 'error', 'stopped']);
  assert.deepEqual([...HEALTH_ALERT_SEVERITIES], ['info', 'warning', 'error', 'critical']);
  assert.deepEqual([...HEALTH_SEVERITY_FILTERS], ['all', 'info', 'warning', 'error', 'critical']);
  assert.deepEqual({ ...HEALTH_SEVERITY_FILTER_LABELS }, {
    all: 'All severities',
    info: 'Info',
    warning: 'Warning',
    error: 'Error',
    critical: 'Critical',
  });
  assert.equal(HEALTH_UNKNOWN_TEXT, 'unknown');
  assert.equal(HEALTH_ACKNOWLEDGE_ALERT_INTENT, 'acknowledge-alert');
  assert.equal(HEALTH_FILTER_CHANGE_INTENT, 'filter-change');
  assert.deepEqual([...HEALTH_BOARD_EMITS], ['submit-intent']);
  assert.ok(Object.isFrozen(HEALTH_CAPSULE_STATES));
  assert.ok(Object.isFrozen(HEALTH_ALERT_SEVERITIES));
  assert.ok(Object.isFrozen(HEALTH_SEVERITY_FILTERS));
});

test('health entity ids are anchor tokens, never numeric indexes', () => {
  for (const valid of ['cap-01', 'alert-01', 'a', 'cap_2.x-3']) {
    assert.equal(isHealthEntityId(valid), true, valid);
  }
  for (const invalid of ['', '  ', 'cap 01', '0123', 7, null, undefined, {}, []]) {
    assert.equal(isHealthEntityId(invalid), false, String(invalid));
  }
});

test('capsule state normalization and tones fail closed to unknown', () => {
  assert.equal(normalizeHealthCapsuleState('ready'), 'ready');
  assert.equal(normalizeHealthCapsuleState('stopped'), 'stopped');
  for (const unknown of ['healthy', 'READY', '', null, undefined, 3, {}]) {
    assert.equal(normalizeHealthCapsuleState(unknown), 'unknown', String(unknown));
  }
  assert.deepEqual(
    ['ready', 'starting', 'lost', 'error', 'stopped', 'unknown'].map(healthStateTone),
    ['success', 'info', 'warning', 'error', 'neutral', 'neutral']
  );
});

test('normalizeHealthCapsule never throws and never invents values', () => {
  const full = normalizeHealthCapsule({
    id: 'cap-01',
    label: '  Capsule 01  ',
    state: 'lost',
    reason: '  heartbeat missed  ',
    telemetry: [{ key: 'cpu', label: 'CPU', value: 12, unit: 'pct' }],
  });
  assert.deepEqual({ ...full }, {
    id: 'cap-01',
    label: 'Capsule 01',
    state: 'lost',
    reason: 'heartbeat missed',
    telemetry: [{ key: 'cpu', label: 'CPU', value: 12, unit: 'pct' }],
  });
  assert.ok(Object.isFrozen(full));
  const bare = normalizeHealthCapsule({ id: 'cap-02', state: 'ready' });
  assert.equal(bare.label, 'cap-02');
  assert.equal(bare.reason, null);
  assert.deepEqual([...bare.telemetry], []);
  for (const raw of [null, undefined, 42, 'cap-01', [], { id: '007' }, { id: 'bad id' }]) {
    const fallback = normalizeHealthCapsule(raw);
    assert.equal(fallback.id, 'unknown', JSON.stringify(raw));
    assert.equal(fallback.state, 'unknown', JSON.stringify(raw));
  }
  assert.equal(normalizeHealthCapsule({ id: 'cap-03', state: 'invented' }).state, 'unknown');
  assert.equal(normalizeHealthCapsule({ id: 'cap-03', state: 'ready', reason: '   ' }).reason, null);
  assert.equal(normalizeHealthCapsule({ id: 'cap-03', telemetry: 'nope' }).telemetry.length, 0);
});

test('metric formatting renders genuine zeros but never fakes unknown as zero', () => {
  assert.equal(formatHealthMetricValue(0), '0');
  assert.equal(formatHealthMetricValue(0, 'MiB'), '0 MiB');
  assert.equal(formatHealthMetricValue(12.5, 'pct'), '12.5 pct');
  assert.equal(formatHealthMetricValue('12', 'ms'), '12 ms');
  for (const unknown of [null, undefined, NaN, Infinity, '', '   ', {}, [], true]) {
    assert.equal(formatHealthMetricValue(unknown), 'unknown', String(unknown));
    assert.equal(formatHealthMetricValue(unknown, 'MiB'), 'unknown', String(unknown));
  }
  assert.equal(
    formatHealthMetricValue(normalizeHealthMetric({ key: 'mem' }).value),
    'unknown'
  );
  assert.deepEqual({ ...normalizeHealthMetric(null) }, {
    key: 'unknown',
    label: 'unknown',
    value: null,
    unit: '',
  });
  assert.equal(normalizeHealthMetric({ key: 'cpu' }).label, 'cpu');
});

test('alert severity normalization and tones fail closed to unknown', () => {
  assert.equal(normalizeAlertSeverity('critical'), 'critical');
  for (const unknown of ['fatal', 'CRITICAL', '', null, undefined]) {
    assert.equal(normalizeAlertSeverity(unknown), 'unknown', String(unknown));
  }
  assert.deepEqual(
    ['info', 'warning', 'error', 'critical', 'unknown'].map(alertSeverityTone),
    ['info', 'warning', 'error', 'error', 'neutral']
  );
});

test('normalizeHealthAlert never throws and never invents values', () => {
  const full = normalizeHealthAlert({
    id: 'alert-01',
    capsuleId: 'cap-01',
    severity: 'error',
    summary: '  Pressure high  ',
    detail: '  sustained  ',
    acknowledged: true,
  });
  assert.deepEqual({ ...full }, {
    id: 'alert-01',
    capsuleId: 'cap-01',
    severity: 'error',
    summary: 'Pressure high',
    detail: 'sustained',
    acknowledged: true,
  });
  assert.ok(Object.isFrozen(full));
  const bare = normalizeHealthAlert({ id: 'alert-02', summary: 'Ping' });
  assert.equal(bare.capsuleId, null);
  assert.equal(bare.severity, 'unknown');
  assert.equal(bare.detail, null);
  assert.equal(bare.acknowledged, false);
  for (const raw of [null, undefined, 'alert-01', { id: '9' }, { summary: 'x' }]) {
    assert.equal(normalizeHealthAlert(raw).id, 'unknown', JSON.stringify(raw));
  }
  assert.equal(normalizeHealthAlert({ id: 'alert-03', summary: '   ' }).summary, 'unknown');
  assert.equal(normalizeHealthAlert({ id: 'alert-03', summary: 'x', acknowledged: 'yes' }).acknowledged, false);
});

test('alert filtering is pure and honors severity plus unread-only', () => {
  const alerts = [
    { id: 'alert-01', severity: 'warning', summary: 'a', acknowledged: false },
    { id: 'alert-02', severity: 'error', summary: 'b', acknowledged: true },
    { id: 'alert-03', severity: 'error', summary: 'c', acknowledged: false },
    { id: 'alert-04', severity: 'mystery', summary: 'd', acknowledged: false },
  ];
  assert.equal(filterHealthAlerts(alerts).length, 4);
  assert.deepEqual(
    filterHealthAlerts(alerts, { severity: 'error' }).map((entry) => entry.id),
    ['alert-02', 'alert-03']
  );
  assert.deepEqual(
    filterHealthAlerts(alerts, { unreadOnly: true }).map((entry) => entry.id),
    ['alert-01', 'alert-03', 'alert-04']
  );
  assert.deepEqual(
    filterHealthAlerts(alerts, { severity: 'error', unreadOnly: true }).map((entry) => entry.id),
    ['alert-03']
  );
  assert.equal(filterHealthAlerts(alerts, { severity: 'invented' }).length, 4);
  assert.equal(normalizeSeverityFilter('warning'), 'warning');
  assert.equal(normalizeSeverityFilter('invented'), 'all');
  assert.deepEqual([...filterHealthAlerts(null)], []);
  assert.deepEqual([...filterHealthAlerts('nope', { unreadOnly: true })], []);
  assert.ok(Object.isFrozen(filterHealthAlerts(alerts)));
});

test('health intent builders freeze exact payloads', () => {
  assert.deepEqual(buildAcknowledgeAlertIntent({ alertId: 'alert-01' }), {
    type: 'acknowledge-alert',
    alertId: 'alert-01',
  });
  assert.deepEqual(buildAcknowledgeAlertIntent({ alertId: '12' }), {
    type: 'acknowledge-alert',
    alertId: 'unknown',
  });
  assert.deepEqual(buildAcknowledgeAlertIntent(null), {
    type: 'acknowledge-alert',
    alertId: 'unknown',
  });
  assert.deepEqual(buildFilterChangeIntent({ severity: 'warning', unreadOnly: true }), {
    type: 'filter-change',
    severity: 'warning',
    unreadOnly: true,
  });
  assert.deepEqual(buildFilterChangeIntent({ severity: 'invented', unreadOnly: 'yes' }), {
    type: 'filter-change',
    severity: 'all',
    unreadOnly: false,
  });
  assert.deepEqual(buildFilterChangeIntent(), {
    type: 'filter-change',
    severity: 'all',
    unreadOnly: false,
  });
  assert.ok(Object.isFrozen(buildAcknowledgeAlertIntent({ alertId: 'alert-01' })));
  assert.ok(Object.isFrozen(buildFilterChangeIntent()));
});

test('health DOM ids, anchors and accessible names are stable and exact', () => {
  assert.equal(healthCapsuleRowDomId('cap-01'), 'cuk-health-capsule-row-cap-01');
  assert.equal(healthCapsuleRowDomId('7'), 'cuk-health-capsule-row-unknown');
  assert.equal(healthCapsuleRowAnchor('cap-01'), 'fleet/cap-01/row');
  assert.equal(healthCapsuleRowAnchor(null), 'fleet/unknown/row');
  assert.equal(
    healthCapsuleRowAccessibleName({ id: 'cap-01', label: 'Capsule 01', state: 'lost', reason: 'beat missed' }),
    'Capsule Capsule 01: lost, beat missed.'
  );
  assert.equal(
    healthCapsuleRowAccessibleName({ id: 'cap-02', state: 'ready' }),
    'Capsule cap-02: ready.'
  );
  assert.equal(healthTelemetryDomId('cap-01'), 'cuk-health-telemetry-cap-01');
  assert.equal(healthTelemetryAnchor('cap-01'), 'inspector/cap-01/field');
  assert.equal(healthTelemetryAnchor('bad id'), 'inspector/unknown/field');
  assert.equal(
    healthTelemetryAccessibleName({ capsuleId: 'cap-01', capsuleLabel: 'Capsule 01' }),
    'Telemetry for Capsule 01.'
  );
  assert.equal(healthTelemetryAccessibleName({ capsuleId: 'cap-01' }), 'Telemetry for cap-01.');
  assert.equal(healthTelemetryAccessibleName({}), 'Telemetry for unknown.');
  assert.equal(healthAlertDomId('alert-01'), 'cuk-health-alert-alert-01');
  assert.equal(healthAlertAnchor('alert-01'), 'alerts/alert-01');
  assert.equal(
    healthAlertAccessibleName({ id: 'alert-01', severity: 'warning', summary: 'Pressure high' }),
    'Alert alert-01: warning, Pressure high.'
  );
  assert.equal(
    healthAlertAccessibleName({ id: 'alert-02', severity: 'error', summary: 'Down', acknowledged: true }),
    'Alert alert-02: error, Down. Acknowledged.'
  );
  assert.equal(healthAckDomId('alert-01'), 'cuk-health-ack-alert-01');
  assert.equal(healthAckAnchor('alert-01'), 'inbox/alert-01/ack');
  assert.equal(healthAckAccessibleName('alert-01'), 'Acknowledge alert alert-01.');
  assert.equal(healthAckAccessibleName('4'), 'Acknowledge alert unknown.');
  assert.equal(HEALTH_SEVERITY_FILTER_DOM_ID, 'cuk-health-filter-severity');
  assert.equal(HEALTH_SEVERITY_FILTER_ANCHOR, 'settings/health-severity');
  assert.equal(HEALTH_UNREAD_FILTER_DOM_ID, 'cuk-health-filter-unread');
  assert.equal(HEALTH_UNREAD_FILTER_ANCHOR, 'settings/health-unread-only');
});

test('health registry rows cover the lane H control surface exactly once', () => {
  assert.equal(HEALTH_REGISTRY_ROWS.length, 6);
  assert.equal(HEALTH_AGENT_LANE_IDS.length, 6);
  assert.equal(new Set(HEALTH_AGENT_LANE_IDS).size, 6);
  for (const row of HEALTH_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'H', 'lane ' + row.agentLaneId);
    assert.equal(row.anchorStatus, 'existing', 'status ' + row.agentLaneId);
    assert.ok(row.component && !/\s/.test(row.component), 'component ' + row.agentLaneId);
  }
  assert.deepEqual(HEALTH_FIXTURE_IDS, { capsuleId: 'cap-01', alertId: 'alert-01' });
  assert.deepEqual([...HEALTH_AGENT_LANE_IDS], [
    'health.capsule.row',
    'health.telemetry.strip',
    'health.alert.item',
    'health.alert.ack',
    'health.alerts.filter-severity',
    'health.alerts.filter-unread',
  ]);
});

test('every health row example matches its declared control family and role', () => {
  for (const row of HEALTH_REGISTRY_ROWS) {
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, 'family for ' + row.agentLaneId);
    assert.equal(rule.template, row.anchorTemplate);
    assert.ok(rule.allowedRoles.includes(row.role), `role ${row.role} for ${row.agentLaneId}`);
  }
});

test('health families admit fixtures and refuse numeric or invented ids', () => {
  const admitted = [
    ['fleet/cap-01/row', 'fleet/{id}/row'],
    ['inspector/cap-01/field', 'inspector/{id}/field'],
    ['alerts/alert-01', 'alerts/{aid}'],
    ['inbox/alert-01/ack', 'inbox/{mid}/{read,ack}'],
    ['settings/health-severity', 'settings/{key}'],
    ['settings/health-unread-only', 'settings/{key}'],
  ];
  for (const [anchor, template] of admitted) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
  }
  for (const anchor of [
    'fleet/1/row',
    'inspector/2/field',
    'alerts/3',
    'inbox/4/ack',
    'inbox/alert-01/dismiss',
    'health/cap-01/row',
  ]) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('healthAnchorFor builds concrete anchors from fixture defaults and params', () => {
  assert.equal(healthAnchorFor('health.capsule.row'), 'fleet/cap-01/row');
  assert.equal(healthAnchorFor('health.capsule.row', { id: 'cap-07' }), 'fleet/cap-07/row');
  assert.equal(healthAnchorFor('health.telemetry.strip', { id: 'cap-07' }), 'inspector/cap-07/field');
  assert.equal(healthAnchorFor('health.alert.item', { aid: 'alert-09' }), 'alerts/alert-09');
  assert.equal(healthAnchorFor('health.alert.ack', { mid: 'alert-09' }), 'inbox/alert-09/ack');
  assert.equal(healthAnchorFor('health.alerts.filter-severity'), 'settings/health-severity');
  assert.equal(healthAnchorFor('health.alerts.filter-unread'), 'settings/health-unread-only');
  assert.throws(() => healthAnchorFor('health.invented'), /Unknown health agent_lane id/);
});

test('agent journey: register, resolve and export every health control', () => {
  const registry = createControlRegistry({
    windowId: 'win-health',
    epoch: 5,
    generation: 2,
    reviewedProducer: createReviewedProducer(),
  });
  const journey = [
    { anchor: 'fleet/cap-01/row', entityId: 'cap-01', slot: 'health-row', role: 'row', name: 'Capsule cap-01: ready.', state: { expanded: false } },
    { anchor: 'inspector/cap-01/field', entityId: 'cap-01', slot: 'health-telemetry', role: 'group', name: 'Telemetry for cap-01.', state: {} },
    { anchor: 'alerts/alert-01', entityId: 'alert-01', slot: 'health-alert', role: 'alert', name: 'Alert alert-01: warning, Pressure high.', state: {} },
    { anchor: 'inbox/alert-01/ack', entityId: 'alert-01', slot: 'health-ack', role: 'button', name: 'Acknowledge alert alert-01.', state: { disabled: false } },
    { anchor: 'settings/health-severity', entityId: 'health-filters', slot: 'severity', role: 'combobox', name: 'Filter alerts by severity', state: { value: 'all' } },
    { anchor: 'settings/health-unread-only', entityId: 'health-filters', slot: 'unread-only', role: 'checkbox', name: 'Show unread alerts only', state: { checked: false } },
  ];
  journey.forEach((control, index) => {
    const record = registry.register({
      semanticAnchor: control.anchor,
      entityId: control.entityId,
      presentationInstance: 'health-primary',
      controlSlot: control.slot,
      role: control.role,
      accessibleName: control.name,
      state: control.state,
      visible: true,
      materialized: true,
      inDom: true,
      box: { x: 10 + index * 4, y: 20, width: 80, height: 24 },
      epoch: 5,
      generation: 2,
    });
    assert.ok(record.stableId?.includes('win-health:health-primary:'), control.anchor);
  });
  for (const control of journey) {
    const target = registry.resolveActionableTarget(control.anchor, 'health-primary');
    assert.equal(target.accessibleName, control.name);
  }
  const first = registry.exportCanonicalState();
  assert.equal(first.nodes.length, journey.length);
  const digestsA = computeStateDigests(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (first)));
  const second = registry.exportCanonicalState();
  const digestsB = computeStateDigests(/** @type {Record<string, unknown>} */ (/** @type {unknown} */ (second)));
  assert.equal(digestsA.batteryDigest, digestsB.batteryDigest);
  assert.equal(digestsA.frameBindingDigest, digestsB.frameBindingDigest);
});

test('health board unknown values are never registered as zero', () => {
  const registry = createControlRegistry({
    windowId: 'win-health',
    epoch: 1,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });
  assert.throws(
    () => registry.register({
      semanticAnchor: 'fleet/cap-09/row',
      entityId: 'cap-09',
      presentationInstance: 'health-primary',
      controlSlot: 'health-row',
      role: 'row',
      accessibleName: 'Capsule cap-09: unknown.',
      state: { valueKnown: false, value: 0 },
      visible: true,
      materialized: true,
      inDom: true,
      box: { x: 1, y: 1, width: 8, height: 8 },
      epoch: 1,
      generation: 1,
    }),
    (err) => err.code === 'ERR_UNKNOWN_VALUE_ZERO'
  );
  const record = registry.register({
    semanticAnchor: 'inspector/cap-09/field',
    entityId: 'cap-09',
    presentationInstance: 'health-primary',
    controlSlot: 'health-telemetry',
    role: 'group',
    accessibleName: 'Telemetry for cap-09.',
    state: { valueKnown: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 1, y: 1, width: 8, height: 8 },
    epoch: 1,
    generation: 1,
  });
  assert.equal(record.state.valueKnown, false);
});

test('health component index exports exactly the lane H surface', () => {
  const expected = [
    'CapsuleHealthBoard',
    'HealthAlertList',
    'HealthCapsuleRow',
    'HealthTelemetryStrip',
  ];
  const exported = Array.from(indexSource.matchAll(/export \{ default as (\w+) \} from '\.\/(\w+)\.vue';/g));
  assert.deepEqual(exported.map((m) => m[1]), expected);
  for (const m of exported) {
    assert.equal(m[1], m[2]);
  }
  assert.ok(indexSource.includes(`export * from './healthModel.js';`));
  assert.ok(indexSource.includes(`export * from './healthRegistryRows.js';`));
  const onDisk = readdirSync(healthDir).filter((f) => f.endsWith('.vue'));
  assert.deepEqual(onDisk.sort(), expected.map((name) => `${name}.vue`).sort());
  for (const file of onDisk) {
    assert.ok(indexSource.includes(`from './${file}'`), 'unexported component ' + file);
    assert.ok(existsSync(path.join(healthDir, file)), file);
  }
});

test('health lane components compile as plain JS', () => {
  const onDisk = readdirSync(healthDir).filter((f) => f.endsWith('.vue'));
  assert.equal(onDisk.length, 4);
  for (const file of onDisk) {
    const source = readFileSync(path.join(healthDir, file), 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.scriptSetup?.lang ?? descriptor.script?.lang ?? undefined, undefined, file);
    assert.ok(descriptor.template, 'template ' + file);
    assert.ok(descriptor.styles.length > 0, 'styles ' + file);
    const script = compileScript(descriptor, { id: 'health-index-' + file });
    assert.ok(script.content.length > 0, file);
  }
});

test('health components carry stable ids, roles, names and anchors', () => {
  const sources = {};
  for (const file of readdirSync(healthDir).filter((f) => f.endsWith('.vue'))) {
    sources[file] = readFileSync(path.join(healthDir, file), 'utf8');
  }
  const board = sources['CapsuleHealthBoard.vue'];
  assert.ok(board.includes('id="cuk-health-board"'), 'board id');
  assert.ok(board.includes('role="region"'), 'board region');
  assert.ok(board.includes('id="cuk-health-capsule-table"'), 'board table id');
  assert.ok(board.includes('aria-label="Capsule states"'), 'board states section');
  assert.ok(board.includes('aria-label="Telemetry"'), 'board telemetry section');
  assert.ok(board.includes('aria-label="Alerts"'), 'board alerts section');
  assert.ok(board.includes(`defineEmits(['submit-intent'])`), 'board emits');
  const row = sources['HealthCapsuleRow.vue'];
  assert.ok(row.includes('role="row"'), 'row role');
  assert.ok(row.includes(':data-semantic-anchor="anchor"'), 'row anchor binding');
  assert.ok(row.includes('healthCapsuleRowDomId'), 'row dom id helper');
  const strip = sources['HealthTelemetryStrip.vue'];
  assert.ok(strip.includes('role="group"'), 'strip role');
  assert.ok(strip.includes('role="status"'), 'strip empty status');
  assert.ok(strip.includes('No telemetry available.'), 'strip empty text');
  assert.ok(strip.includes('healthTelemetryAnchor'), 'strip anchor helper');
  const list = sources['HealthAlertList.vue'];
  assert.ok(list.includes('role="combobox"'), 'filter combobox role');
  assert.ok(list.includes('role="checkbox"'), 'filter checkbox role');
  assert.ok(list.includes('role="alert"'), 'alert item role');
  assert.ok(list.includes('role="status"'), 'acked/empty status');
  assert.ok(list.includes('Acknowledge'), 'ack label');
  assert.ok(list.includes('Acknowledged'), 'acked text');
  assert.ok(list.includes('No alerts.'), 'list empty text');
  assert.ok(list.includes('No alerts match the current filter.'), 'list filtered empty text');
  assert.ok(list.includes(`defineEmits(['submit-intent'])`), 'list emits');
  assert.ok(list.includes('healthAlertAnchor'), 'alert anchor helper');
  assert.ok(list.includes('healthAckAnchor'), 'ack anchor helper');
  for (const [file, source] of Object.entries(sources)) {
    assert.ok(source.includes('aria-label'), 'accessible name ' + file);
  }
  // Board sections are containers; the three control components carry anchors.
  for (const file of ['HealthCapsuleRow.vue', 'HealthTelemetryStrip.vue', 'HealthAlertList.vue']) {
    assert.ok(sources[file].includes('data-semantic-anchor'), 'anchor ' + file);
  }
});

test('health component styles use declared tokens only', () => {
  const themeSource = readFileSync(path.join(kitRoot, 'src', 'design', 'theme.css'), 'utf8');
  const declared = new Set(Array.from(themeSource.matchAll(/--cuk-[a-z0-9_-]+/g)).map((m) => m[0]));
  assert.ok(declared.size > 100, 'theme declares the token set');
  const onDisk = readdirSync(healthDir).filter((f) => f.endsWith('.vue'));
  for (const file of onDisk) {
    const source = readFileSync(path.join(healthDir, file), 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    for (const block of descriptor.styles) {
      const css = block.content;
      assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'hex color in ' + file);
      assert.doesNotMatch(css, /[^a-z-](rgb|hsl)a?\(/i, 'raw color function in ' + file);
      for (const match of css.matchAll(/var\(\s*(--cuk-[a-z0-9_-]+)/g)) {
        assert.ok(declared.has(match[1]), `undeclared token ${match[1]} in ${file}`);
      }
    }
    assert.doesNotMatch(source, /from\s+['"]openvue[^'"]*['"]/, 'direct openvue import in ' + file);
  }
});

test('health modules stay data-only and publishable', () => {
  assert.equal(/^\s*import\s/m.test(rowsSource), false);
  assert.equal(/^\s*import\s/m.test(modelSource), false);
  for (const [label, source] of [['rows', rowsSource], ['model', modelSource], ['index', indexSource]]) {
    assert.doesNotMatch(source, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/, 'address in ' + label);
  }
});
