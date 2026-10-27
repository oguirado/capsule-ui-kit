/**
 * @file mv2 lane G family tests: every additive anchor family resolves in the
 * shared registry with its declared role, and every registry row example in
 * every distributed rows file matches a family admitting its role (so no
 * central row merge is needed: rows stay colocated, families resolve centrally).
 * Plain node:test, no DOM, no Electron.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_FAMILY_INVENTORY,
  createControlRegistry,
  matchControlFamily,
} from '../src/agent/controlRegistry.js';
import {
  MV_AGENT_LANE_IDS,
  MV_FIXTURE_IDS,
  MV_REGISTRY_ROWS,
  mvAnchorFor,
} from '../src/agent/mvRegistryRows.js';
import { SAAS_REGISTRY_ROWS } from '../src/saas/saasRegistryRows.js';
import { MULTISLOT_REGISTRY_ROWS } from '../src/multislot/multislotRegistryRows.js';
import { RECORDINGS_REGISTRY_ROWS } from '../src/recordings/recordingsRegistryRows.js';
import { HEALTH_REGISTRY_ROWS } from '../src/health/healthRegistryRows.js';
import { AUDIT_REGISTRY_ROWS } from '../src/audit/auditRegistryRows.js';
import { FLEET_REGISTRY_ROWS } from '../src/fleet/fleetRegistryRows.js';
import { SURFACES_REGISTRY_ROWS } from '../src/surfaces/surfacesRegistryRows.js';

const BUTTON_SLOTS = Object.freeze([
  'release-control',
  'retry',
  'export',
  'record-ai',
  'record-disk',
  'screenshot',
  'copy-id',
  'hide-surface',
  'hide-terminal',
]);
const BUTTON_TEMPLATE =
  'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}';

function inventoryRow(n) {
  return CONTROL_FAMILY_INVENTORY.find((row) => row.row === n);
}

function reviewedProducer() {
  return {
    contractId: 'test/agent-mv-families/v1',
    peer: 'test-harness',
    reviewed: true,
    mapStableId: (input) =>
      `${input.windowId}:${input.presentationInstance}:${input.semanticAnchor}@e${input.epoch}.g${input.generation}`,
  };
}

function makeRegistry() {
  return createControlRegistry({
    windowId: 'win-mv',
    epoch: 1,
    generation: 1,
    reviewedProducer: reviewedProducer(),
  });
}

function registerNode(registry, { anchor, role, name, state = null }) {
  return registry.register({
    semanticAnchor: anchor,
    entityId: anchor,
    presentationInstance: 'main',
    controlSlot: 'node',
    role,
    accessibleName: name,
    epoch: 1,
    generation: 1,
    visible: true,
    materialized: true,
    inDom: true,
    state: state ?? { disabled: false },
    box: { x: 8, y: 8, width: 120, height: 28 },
  });
}

test('inventory keeps the 13-row shape and lists every mv2 family template', () => {
  assert.equal(CONTROL_FAMILY_INVENTORY.length, 13);
  const expected = new Map([
    [3, [BUTTON_TEMPLATE, 'capsule/{id}/input-mode', 'capsule/{id}/splitter', 'capsule/{id}/operator-guidance', 'recording/{id}/{toggle,screenshot}', 'recording/{id}/{phase,store-chip}']],
    [5, ['surface/{id}/tile', 'surface/{id}/canvas', 'surface/{id}/{scaled-badge,stale}']],
    [9, ['audit/stream/{stream}/tab', 'audit/filter/capsule', 'audit/filter/verdict', 'audit/filter/clear', 'audit/timeline/list', 'audit/record/{rid}/select', 'audit/receipt/{rid}/counts', 'audit/receipt/{rid}/gate']],
    [10, ['recording/{rid}/row', 'recording/{rid}/{select,export}', 'recording/{rid}/export-gate']],
  ]);
  for (const [rowIndex, templates] of expected) {
    const row = inventoryRow(rowIndex);
    assert.ok(row, `row ${rowIndex} exists`);
    for (const template of templates) {
      assert.ok(row.templates.includes(template), `row ${rowIndex} lists ${template}`);
    }
  }
  for (const [rowIndex, roles] of [[3, ['button', 'switch', 'separator', 'status']], [5, ['img']], [9, ['tab', 'searchbox', 'combobox', 'list', 'status']], [10, ['button', 'status']], [12, ['group']]]) {
    for (const role of roles) {
      assert.ok(inventoryRow(rowIndex).roles.includes(role), `row ${rowIndex} admits ${role}`);
    }
  }
});

test('capsule button slots share one button-only row-3 family', () => {
  for (const slot of BUTTON_SLOTS) {
    const anchor = `capsule/cap-01/${slot}`;
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, BUTTON_TEMPLATE);
    assert.equal(rule.rowIndex, 3);
    assert.deepEqual([...rule.allowedRoles], ['button']);
    assert.equal(rule.requiresReasonWhenDisabled, true);
  }
  assert.equal(matchControlFamily('capsule/cap-01/scaled-badge'), null);
  assert.equal(matchControlFamily('capsule/1/export'), null);
});

test('multislot input-mode, splitter and operator-guidance keep distinct roles', () => {
  const cases = [
    ['capsule/cap-01/input-mode', 'capsule/{id}/input-mode', 'switch'],
    ['capsule/cap-01/splitter', 'capsule/{id}/splitter', 'separator'],
    ['capsule/cap-01/operator-guidance', 'capsule/{id}/operator-guidance', 'status'],
  ];
  for (const [anchor, template, role] of cases) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
    assert.deepEqual([...rule.allowedRoles], [role]);
  }
  assert.equal(matchControlFamily('capsule/cap-01/input-mode/extra'), null);
});

test('recording control-bar and manifest families admit their row roles', () => {
  const cases = [
    ['recording/cap-01/toggle', 'recording/{id}/{toggle,screenshot}', 'button', 3],
    ['recording/cap-01/screenshot', 'recording/{id}/{toggle,screenshot}', 'button', 3],
    ['recording/cap-01/phase', 'recording/{id}/{phase,store-chip}', 'status', 3],
    ['recording/cap-01/store-chip', 'recording/{id}/{phase,store-chip}', 'status', 3],
    ['recording/rec-01/row', 'recording/{rid}/row', 'row', 10],
    ['recording/rec-01/select', 'recording/{rid}/{select,export}', 'button', 10],
    ['recording/rec-01/export', 'recording/{rid}/{select,export}', 'button', 10],
    ['recording/rec-01/export-gate', 'recording/{rid}/export-gate', 'status', 10],
  ];
  for (const [anchor, template, role, rowIndex] of cases) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
    assert.equal(rule.rowIndex, rowIndex);
    assert.ok(rule.allowedRoles.includes(role), `${anchor} admits ${role}`);
  }
  assert.equal(matchControlFamily('recording/1/row'), null);
  assert.equal(matchControlFamily('recordings/rec-01/row'), null);
});

test('audit families admit searchbox, list and the receipt roles', () => {
  const cases = [
    ['audit/stream/session-records/tab', 'audit/stream/{stream}/tab', 'tab'],
    ['audit/filter/capsule', 'audit/filter/capsule', 'searchbox'],
    ['audit/filter/verdict', 'audit/filter/verdict', 'combobox'],
    ['audit/filter/clear', 'audit/filter/clear', 'button'],
    ['audit/timeline/list', 'audit/timeline/list', 'list'],
    ['audit/record/rec-0001/select', 'audit/record/{rid}/select', 'button'],
    ['audit/receipt/rec-0001/counts', 'audit/receipt/{rid}/counts', 'region'],
    ['audit/receipt/rec-0001/gate', 'audit/receipt/{rid}/gate', 'status'],
  ];
  for (const [anchor, template, role] of cases) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
    assert.equal(rule.rowIndex, 9);
    assert.ok(rule.allowedRoles.includes(role), `${anchor} admits ${role}`);
  }
  for (const anchor of ['audit/invented/control', 'audit/record/1/select', 'audit/stream/session-records/jump']) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('surface tile, canvas and badge families admit region, img and status', () => {
  const cases = [
    ['surface/cap-01/tile', 'surface/{id}/tile', 'region'],
    ['surface/cap-01/canvas', 'surface/{id}/canvas', 'img'],
    ['surface/cap-01/scaled-badge', 'surface/{id}/{scaled-badge,stale}', 'status'],
    ['surface/cap-01/stale', 'surface/{id}/{scaled-badge,stale}', 'status'],
  ];
  for (const [anchor, template, role] of cases) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
    assert.equal(rule.rowIndex, 5);
    assert.ok(rule.allowedRoles.includes(role), `${anchor} admits ${role}`);
  }
  for (const anchor of ['surface/invented/control', 'surface/1/tile', 'surface/cap-01/jump']) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('settings family admits group plus the four mv2 section keys', () => {
  const rule = matchControlFamily('settings/providers');
  assert.ok(rule);
  assert.equal(rule.template, 'settings/{key}');
  assert.ok(rule.allowedRoles.includes('group'), 'providers section role');
  const keys = [
    ['settings/theme', 'combobox'],
    ['settings/providers', 'group'],
    ['settings/record-destination', 'textbox'],
    ['settings/limits', 'spinbutton'],
  ];
  const registry = makeRegistry();
  for (const [anchor, role] of keys) {
    const record = registerNode(registry, { anchor, role, name: anchor });
    assert.equal(record.role, role);
    assert.equal(record.accessibleName, anchor);
  }
});

test('catalog kinds resolve through the existing navigation family', () => {
  // Host-supplied kind slugs stay opaque to the kit: neutral placeholders only.
  for (const kind of ['kind-alpha', 'kind-beta', 'kind-gamma', 'kind-delta', 'kind-epsilon']) {
    const rule = matchControlFamily(`shell/navigation/new-capsule-type-${kind}`);
    assert.ok(rule, kind);
    assert.equal(rule.template, 'shell/navigation/{id}');
    assert.ok(rule.allowedRoles.includes('button'), kind);
  }
  assert.ok(matchControlFamily('shell/navigation/new-capsule-category-group-a'));
});

test('mv rows carry shape, unique ids and a working anchor builder', () => {
  assert.equal(MV_REGISTRY_ROWS.filter(row => row.agentLaneId !== 'workspace.dock-tab').length, 8);
  assert.equal(MV_REGISTRY_ROWS.length, 9);
  assert.equal(MV_AGENT_LANE_IDS.length, 9);
  assert.equal(new Set(MV_AGENT_LANE_IDS).size, 9);
  assert.deepEqual({ ...MV_FIXTURE_IDS }, { capsuleId: 'cap-01' });
  for (const row of MV_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, row.agentLaneId);
    assert.ok(['W', 'T'].includes(row.lane), row.agentLaneId);
    assert.equal(row.anchorStatus, 'new', row.agentLaneId);
    assert.ok(row.component && !/\s/.test(row.component), row.agentLaneId);
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, `family admits ${row.agentLaneId}`);
    assert.equal(rule.template, row.anchorTemplate);
    assert.ok(rule.allowedRoles.includes(row.role), `${row.agentLaneId} role`);
  }
  assert.equal(mvAnchorFor('wall.capsule.release-control'), 'capsule/cap-01/release-control');
  assert.equal(mvAnchorFor('multislot.export', { id: 'cap-09' }), 'capsule/cap-09/export');
  assert.equal(mvAnchorFor('wall.veil.retry', { id: 'cap-09' }), 'capsule/cap-09/retry');
  assert.equal(mvAnchorFor('workspace.dock-tab'), 'workspace/tab/panel-alpha');
  assert.equal(mvAnchorFor('workspace.dock-tab', {id: 'panel/one'}), 'workspace/tab/panel%2Fone');
  assert.equal(mvAnchorFor('settings.theme'), 'settings/theme');
  assert.equal(mvAnchorFor('settings.providers'), 'settings/providers');
  assert.throws(() => mvAnchorFor('mv.nope'), /Unknown mv agent_lane id/);
});

test('every distributed registry row resolves centrally with its role', () => {
  const files = [
    ['saas', SAAS_REGISTRY_ROWS],
    ['multislot', MULTISLOT_REGISTRY_ROWS],
    ['recordings', RECORDINGS_REGISTRY_ROWS],
    ['health', HEALTH_REGISTRY_ROWS],
    ['audit', AUDIT_REGISTRY_ROWS],
    ['fleet', FLEET_REGISTRY_ROWS],
    ['surfaces', SURFACES_REGISTRY_ROWS],
    ['mv', MV_REGISTRY_ROWS],
  ];
  let count = 0;
  for (const [file, rows] of files) {
    assert.ok(rows.length > 0, `${file} rows present`);
    for (const row of rows) {
      const rule = matchControlFamily(row.anchorExample);
      assert.ok(rule, `${file}:${row.agentLaneId} family admits ${row.anchorExample}`);
      assert.ok(rule.allowedRoles.includes(row.role), `${file}:${row.agentLaneId} admits ${row.role}`);
      count += 1;
    }
  }
  assert.equal(count, 34 + 19 + 8 + 6 + 8 + 6 + 4 + 8 + 1);
});

test('new controls register with stable id, role and accessible name', () => {
  const registry = makeRegistry();
  const record = registerNode(registry, {
    anchor: 'capsule/cap-01/release-control',
    role: 'button',
    name: 'Release control of Alpha',
  });
  assert.equal(record.semanticAnchor, 'capsule/cap-01/release-control');
  assert.equal(record.role, 'button');
  assert.equal(record.accessibleName, 'Release control of Alpha');
  assert.equal(
    record.stableId,
    'win-mv:main:capsule/cap-01/release-control' + '@' + 'e1.g1'
  );
  assert.throws(
    () =>
      registerNode(registry, {
        anchor: 'capsule/cap-01/input-mode',
        role: 'button',
        name: 'Input mode',
      }),
    (err) => err.code === 'ERR_INVALID_ROLE'
  );
  assert.throws(
    () =>
      registerNode(registry, {
        anchor: 'capsule/cap-01/release-control',
        role: 'button',
        name: 'Release control',
        state: { disabled: true },
      }),
    (err) => err.code === 'ERR_MISSING_UNAVAILABLE_REASON'
  );
  assert.throws(
    () =>
      registerNode(registry, {
        anchor: 'invented/control',
        role: 'button',
        name: 'Invented',
      }),
    (err) => err.code === 'ERR_UNKNOWN_CONTROL_FAMILY'
  );
});
