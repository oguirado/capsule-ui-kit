/**
 * @file SaaS registry rows, agent journeys and component-index contract for lanes B-D.
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
  SAAS_REGISTRY_ROWS,
  SAAS_AGENT_LANE_IDS,
  SAAS_FIXTURE_IDS,
  saasAnchorFor,
} from '../src/saas/saasRegistryRows.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const saasDir = path.join(kitRoot, 'src', 'saas');
const indexSource = readFileSync(path.join(saasDir, 'index.js'), 'utf8');
const rowsSource = readFileSync(path.join(saasDir, 'saasRegistryRows.js'), 'utf8');

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

test('saas registry rows cover the full lane B-D control surface exactly once', () => {
  assert.equal(SAAS_REGISTRY_ROWS.length, 34);
  assert.equal(SAAS_AGENT_LANE_IDS.length, 34);
  assert.equal(new Set(SAAS_AGENT_LANE_IDS).size, 34);
  const byLane = { B: 0, C: 0, D: 0, E: 0 };
  for (const row of SAAS_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.ok(['B', 'C', 'D', 'E'].includes(row.lane), 'lane ' + row.agentLaneId);
    assert.ok(['new', 'existing'].includes(row.anchorStatus), 'status ' + row.agentLaneId);
    assert.ok(row.component && !/\s/.test(row.component), 'component ' + row.agentLaneId);
    byLane[row.lane] += 1;
  }
  assert.deepEqual(byLane, { B: 11, C: 12, D: 9, E: 2 });
  assert.deepEqual(SAAS_FIXTURE_IDS, { capsuleId: 'cap-01', sessionId: 'sess-01', dispatchId: 'disp-01' });
});

test('every saas row example matches its declared control family and role', () => {
  for (const row of SAAS_REGISTRY_ROWS) {
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, 'family for ' + row.agentLaneId);
    assert.equal(rule.template, row.anchorTemplate);
    assert.ok(rule.allowedRoles.includes(row.role), `role ${row.role} for ${row.agentLaneId}`);
  }
});

test('new saas families admit fixtures and refuse numeric or invented ids', () => {
  const admitted = [
    ['capsule/cap-01/record', 'capsule/{id}/{record,destroy}'],
    ['capsule/cap-01/destroy', 'capsule/{id}/{record,destroy}'],
    ['shell/layout-save', 'shell/layout-save'],
    ['detail/cap-01/stepper-w', 'detail/{id}/stepper-{w,h}'],
    ['detail/cap-01/stepper-h', 'detail/{id}/stepper-{w,h}'],
    ['detail/cap-01/pty-toggle', 'detail/{id}/pty-toggle'],
    ['detail/cap-01/scaled-badge', 'detail/{id}/scaled-badge'],
    ['dispatch/disp-01/review-confirm', 'dispatch/{did}/review-confirm'],
  ];
  for (const [anchor, template] of admitted) {
    const rule = matchControlFamily(anchor);
    assert.ok(rule, anchor);
    assert.equal(rule.template, template);
  }
  for (const anchor of [
    'capsule/1/record',
    'detail/1/stepper-w',
    'detail/cap-01/stepper-x',
    'dispatch/disp-01/review',
    'saas/invented/control',
  ]) {
    assert.equal(matchControlFamily(anchor), null, anchor);
  }
});

test('saasAnchorFor builds concrete anchors from fixture defaults and params', () => {
  assert.equal(saasAnchorFor('wall.capsule.record'), 'capsule/cap-01/record');
  assert.equal(saasAnchorFor('wall.capsule.record', { id: 'cap-07' }), 'capsule/cap-07/record');
  assert.equal(
    saasAnchorFor('dispatch.result.retry', { did: 'disp-3', sid: 'sess-9' }),
    'dispatch/disp-3/target/sess-9/retry'
  );
  assert.equal(saasAnchorFor('dispatch.drawer.toggle'), 'drawer/toggle');
  assert.throws(() => saasAnchorFor('wall.capsule.invented'), /Unknown SaaS agent_lane id/);
});

test('agent journey: register, resolve and export every new saas family', () => {
  const registry = createControlRegistry({
    windowId: 'win-saas',
    epoch: 5,
    generation: 2,
    reviewedProducer: createReviewedProducer(),
  });
  const journey = [
    { anchor: 'capsule/cap-01/record', entityId: 'cap-01', slot: 'record', role: 'button', name: 'Record capsule 01', state: { disabled: false } },
    { anchor: 'capsule/cap-02/destroy', entityId: 'cap-02', slot: 'destroy', role: 'button', name: 'Destroy capsule 02', state: { disabled: false } },
    { anchor: 'shell/layout-save', entityId: 'wall', slot: 'layout-save', role: 'button', name: 'Save wall layout', state: { disabled: false } },
    { anchor: 'detail/cap-03/stepper-w', entityId: 'cap-03', slot: 'stepper-w', role: 'spinbutton', name: 'Detail width for capsule 03', state: { value: 900 } },
    { anchor: 'detail/cap-03/stepper-h', entityId: 'cap-03b', slot: 'stepper-h', role: 'spinbutton', name: 'Detail height for capsule 03', state: { value: 800 } },
    { anchor: 'detail/cap-04/pty-toggle', entityId: 'cap-04', slot: 'pty-toggle', role: 'switch', name: 'Console shell for capsule 04', state: { checked: false } },
    { anchor: 'detail/cap-05/scaled-badge', entityId: 'cap-05', slot: 'scaled-badge', role: 'status', name: 'Scaled badge for capsule 05', state: {} },
    { anchor: 'dispatch/disp-01/review-confirm', entityId: 'disp-01', slot: 'review-confirm', role: 'button', name: 'Confirm dispatch 01', state: { disabled: false } },
    { anchor: 'shell/navigation/wall', entityId: 'wall', slot: 'nav-wall', role: 'button', name: 'Open wall', state: { disabled: false } },
  ];
  journey.forEach((control, index) => {
    const record = registry.register({
      semanticAnchor: control.anchor,
      entityId: control.entityId,
      presentationInstance: 'saas-primary',
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
    assert.ok(record.stableId?.includes('win-saas:saas-primary:'), control.anchor);
  });
  for (const control of journey) {
    const target = registry.resolveActionableTarget(control.anchor, 'saas-primary');
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

test('disabled saas record/destroy controls require an unavailable reason', () => {
  const registry = createControlRegistry({
    windowId: 'win-saas',
    epoch: 1,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });
  assert.throws(
    () => registry.register({
      semanticAnchor: 'capsule/cap-09/record',
      entityId: 'cap-09',
      presentationInstance: 'saas-primary',
      controlSlot: 'record',
      role: 'button',
      accessibleName: 'Record capsule 09',
      state: { disabled: true },
      visible: true,
      materialized: true,
      inDom: true,
      box: { x: 1, y: 1, width: 8, height: 8 },
      epoch: 1,
      generation: 1,
    }),
    (err) => err.code === 'ERR_MISSING_UNAVAILABLE_REASON'
  );
  const record = registry.register({
    semanticAnchor: 'capsule/cap-09/destroy',
    entityId: 'cap-09',
    presentationInstance: 'saas-primary',
    controlSlot: 'destroy',
    role: 'button',
    accessibleName: 'Destroy capsule 09',
    state: { disabled: true, unavailableReason: 'Capsule is sealed by policy' },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 1, y: 1, width: 8, height: 8 },
    epoch: 1,
    generation: 1,
  });
  assert.equal(record.state.unavailableReason, 'Capsule is sealed by policy');
});

test('saas component index exports exactly the lane B-D surface', () => {
  const expected = [
    'SaasWallTile', 'SaasSurfaceView', 'SaasFoldedRail', 'SaasVeil', 'SaasRecordButton', 'SaasViewerChips',
    'SaasDetailLayout', 'SaasGeometryBar', 'SaasSplitter', 'SaasConsoleRow', 'SaasShellToggle', 'SaasEdgeStrip', 'SaasFrameStrip',
    'SaasDispatchSkin', 'SaasTargetRow', 'SaasFrozenReview', 'SaasAccessibleBox', 'SaasResultRows',
  ];
  const exported = Array.from(indexSource.matchAll(/export \{ default as (\w+) \} from '\.\/(\w+)\.vue';/g));
  assert.deepEqual(exported.map((m) => m[1]), expected);
  for (const m of exported) {
    assert.equal(m[1], m[2]);
  }
  // Every lane file present on disk is exported; pending lane files fail nothing yet.
  const onDisk = readdirSync(saasDir).filter((f) => f.startsWith('Saas') && f.endsWith('.vue'));
  for (const file of onDisk) {
    const name = file.slice(0, -4);
    assert.ok(expected.includes(name), 'unexpected component ' + name);
    assert.ok(indexSource.includes(`from './${file}'`), 'unexported component ' + name);
  }
});

test('saas lane components present on disk compile as plain JS (pending lanes skip)', () => {
  const onDisk = readdirSync(saasDir).filter((f) => f.startsWith('Saas') && f.endsWith('.vue'));
  for (const file of onDisk) {
    const source = readFileSync(path.join(saasDir, file), 'utf8');
    const { descriptor, errors } = parse(source, { filename: file });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.scriptSetup?.lang ?? descriptor.script?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'saas-index-' + file });
    assert.ok(script.content.length > 0, file);
  }
});

test('saas registry rows module stays data-only and publishable', () => {
  assert.equal(/^\s*import\s/m.test(rowsSource), false);
  assert.doesNotMatch(rowsSource, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/);
  assert.ok(existsSync(path.join(saasDir, 'saasRegistryRows.js')));
});
