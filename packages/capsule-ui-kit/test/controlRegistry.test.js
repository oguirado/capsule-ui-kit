/**
 * @file Behavioral oracle and negative contrast suite for the semantic control registry.
 * Covers UI_ARCHITECTURE.md §9 (AI-operability contract) and §13 (Semantic registry unit).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTROL_FAMILY_INVENTORY,
  createControlRegistry,
  matchControlFamily,
  validateAgentLaneFrame,
  computeStateDigests,
  canonicalizeStateJson,
} from '../src/agent/controlRegistry.js';

/**
 * Helper: creates a mock reviewed lane producer contract for testing.
 * @param {object} [opts]
 */
function createReviewedProducer(opts = {}) {
  const peer = opts.peer ?? 'test-harness-at-spi';
  const contractId = opts.contractId ?? 'agent_lane.producer/v1';
  return Object.freeze({
    contractId,
    peer,
    reviewed: opts.reviewed ?? true,
    /**
     * @param {{ semanticAnchor: string, windowId: string, presentationInstance: string, epoch: number, generation: number }} input
     */
    mapStableId(input) {
      return `${input.windowId}:${input.presentationInstance}:${input.semanticAnchor}@e${input.epoch}.g${input.generation}`;
    },
  });
}

test('CONTROL_FAMILY_INVENTORY covers all 13 normative rows from UI_ARCHITECTURE §9', () => {
  assert.equal(Array.isArray(CONTROL_FAMILY_INVENTORY), true);
  assert.equal(CONTROL_FAMILY_INVENTORY.length, 13);

  const sampleAnchors = [
    ['shell/fullscreen', 'shell/fullscreen'],
    ['shell/navigation/home', 'shell/navigation/{id}'],
    ['capsule/cap-1/panel', 'capsule/{id}/panel'],
    ['capsule/cap-1/tab', 'capsule/{id}/tab'],
    ['capsule/cap-1/fold', 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}'],
    ['capsule/cap-1/popout', 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}'],
    ['workspace/separator/main-wall', 'workspace/separator/{id}'],
    ['capsule/cap-1/slot', 'capsule/{id}/slot'],
    ['capsule/cap-1/session/sess-9/tab', 'capsule/{id}/session/{sid}/tab'],
    ['session/sess-9/attach', 'session/{sid}/{attach,stop,replay,target}'],
    ['drawer/toggle', 'drawer/{toggle,maximize,composer,send}'],
    ['drawer/send', 'drawer/{toggle,maximize,composer,send}'],
    ['drawer/targets/sess-9', 'drawer/targets/{sid,all,clear}'],
    ['drawer/targets/all', 'drawer/targets/{sid,all,clear}'],
    ['dispatch/disp-1/target/sess-9/result', 'dispatch/{did}/target/{sid}/{result,retry,cancel}'],
    ['dispatch/disp-1/target/sess-9/retry', 'dispatch/{did}/target/{sid}/{result,retry,cancel}'],
    ['fleet/cap-1/row', 'fleet/{id}/row'],
    ['inspector/cap-1/field', 'inspector/{id}/field'],
    ['alerts/alert-1', 'alerts/{aid}'],
    ['inbox/msg-7/ack', 'inbox/{mid}/{read,ack}'],
    ['settings/theme.mode', 'settings/{key}'],
    ['dialog/loan-confirm/accept', 'dialog/{id}/{action}'],
    ['output/sess-9/text', 'output/{sid}/text'],
    ['about/licences', 'about/licences'],
    ['assistant/disclosure', 'assistant/disclosure'],
  ];

  for (const [anchor, expectedTemplate] of sampleAnchors) {
    const matched = matchControlFamily(anchor);
    assert.ok(matched, `Expected anchor ${anchor} to match inventory`);
    assert.equal(matched.template, expectedTemplate);
  }
});

test('positive: registers valid controls, namespaces by window/presentation, resolves targets, and exports via reviewed producer', () => {
  const producer = createReviewedProducer();
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 3,
    generation: 1,
    reviewedProducer: producer,
  });

  const foldRecord = registry.register({
    semanticAnchor: 'capsule/cap-alpha/fold',
    entityId: 'cap-alpha',
    presentationInstance: 'wall-primary',
    controlSlot: 'fold',
    role: 'button',
    accessibleName: 'Fold Alpha Capsule',
    state: { expanded: true, disabled: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 10.4, y: 20.6, width: 80.2, height: 24.1 },
    epoch: 3,
    generation: 1,
  });

  // Boxes are rounded content-window CSS pixels
  assert.deepEqual(foldRecord.box, { x: 10, y: 21, width: 80, height: 24 });
  assert.equal(
    foldRecord.stableId,
    'win-main:wall-primary:capsule/cap-alpha/fold' + '@' + 'e3.g1'
  );

  // Popout control that is unavailable must carry unavailableReason (UI_ARCHITECTURE §9 / §14 R2)
  const popoutRecord = registry.register({
    semanticAnchor: 'capsule/cap-alpha/popout',
    entityId: 'cap-alpha',
    presentationInstance: 'wall-primary',
    controlSlot: 'popout',
    role: 'button',
    accessibleName: 'Pop out Alpha Capsule',
    state: {
      disabled: true,
      unavailableReason: 'Host window transfer contract not active',
    },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 96, y: 21, width: 32, height: 24 },
    epoch: 3,
    generation: 1,
  });
  assert.equal(popoutRecord.state.disabled, true);

  // Mirror/popout presentation in another window/presentation namespace does not collide
  const popoutWindowRegistry = createControlRegistry({
    windowId: 'win-popout-1',
    epoch: 1,
    generation: 1,
    reviewedProducer: producer,
  });
  const mirroredPanel = popoutWindowRegistry.register({
    semanticAnchor: 'capsule/cap-alpha/panel',
    entityId: 'cap-alpha',
    presentationInstance: 'popout-view',
    controlSlot: 'panel',
    role: 'region',
    accessibleName: 'Alpha Capsule',
    state: {},
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 0, y: 0, width: 640, height: 480 },
    epoch: 1,
    generation: 1,
  });
  assert.equal(
    mirroredPanel.stableId,
    'win-popout-1:popout-view:capsule/cap-alpha/panel' + '@' + 'e1.g1'
  );

  // Resolve actionable target
  const resolved = registry.resolveActionableTarget('capsule/cap-alpha/fold');
  assert.equal(resolved.semanticAnchor, 'capsule/cap-alpha/fold');
  assert.deepEqual(resolved.box, { x: 10, y: 21, width: 80, height: 24 });

  // Export canonical state via reviewed producer
  const exported = registry.exportCanonicalState();
  assert.equal(exported.windowId, 'win-main');
  assert.equal(exported.epoch, 3);
  assert.equal(exported.nodes.length, 2);
});

test('negative contrast: tuple collision and duplicate semantic anchor within same window/presentation fail', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });

  registry.register({
    semanticAnchor: 'capsule/cap-1/pin',
    entityId: 'cap-1',
    presentationInstance: 'dock-a',
    controlSlot: 'pin',
    role: 'button',
    accessibleName: 'Pin Capsule 1',
    state: { pressed: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 12, y: 12, width: 28, height: 28 },
    epoch: 1,
    generation: 1,
  });

  // 1. Exact tuple collision (entityId, presentationInstance, controlSlot) fails
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'capsule/cap-1/pin',
        entityId: 'cap-1',
        presentationInstance: 'dock-a',
        controlSlot: 'pin',
        role: 'button',
        accessibleName: 'Duplicate Pin Capsule 1',
        state: { pressed: true },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 40, y: 12, width: 28, height: 28 },
        epoch: 1,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_CONTROL_COLLISION'
  );

  // 2. Same semantic anchor in the same window/presentation with a different slot also fails
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'capsule/cap-1/pin',
        entityId: 'cap-1',
        presentationInstance: 'dock-a',
        controlSlot: 'pin-alt',
        role: 'button',
        accessibleName: 'Conflicting Anchor Pin',
        state: { pressed: false },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 50, y: 12, width: 28, height: 28 },
        epoch: 1,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_CONTROL_COLLISION'
  );
});

test('negative contrast: stale epoch registration, update, target resolution, and export fail', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 5,
    generation: 2,
    reviewedProducer: createReviewedProducer(),
  });

  // Registering with stale epoch (< 5) fails immediately
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'shell/fullscreen',
        entityId: 'shell',
        presentationInstance: 'root',
        controlSlot: 'fullscreen',
        role: 'button',
        accessibleName: 'Full screen',
        state: { pressed: false },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 1200, y: 8, width: 64, height: 32 },
        epoch: 4,
        generation: 2,
      });
    },
    (err) => err.code === 'ERR_STALE_EPOCH'
  );

  // Register valid at epoch 5
  registry.register({
    semanticAnchor: 'shell/fullscreen',
    entityId: 'shell',
    presentationInstance: 'root',
    controlSlot: 'fullscreen',
    role: 'button',
    accessibleName: 'Full screen',
    state: { pressed: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 1200, y: 8, width: 64, height: 32 },
    epoch: 5,
    generation: 2,
  });

  // Advance registry epoch to 6
  registry.advanceEpoch(6, 1);

  // Resolving or exporting an entry still at epoch 5 fails with ERR_STALE_EPOCH
  assert.throws(
    () => {
      registry.resolveActionableTarget('shell/fullscreen');
    },
    (err) => err.code === 'ERR_STALE_EPOCH'
  );

  assert.throws(
    () => {
      registry.exportCanonicalState();
    },
    (err) => err.code === 'ERR_STALE_EPOCH'
  );

  // Attempting to move epoch backwards fails
  assert.throws(
    () => {
      registry.advanceEpoch(4, 1);
    },
    (err) => err.code === 'ERR_STALE_EPOCH'
  );
});

test('negative contrast: UI synthesis of stable_id or missing/unreviewed/retail lane producer fails', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });

  // UI must not synthesize stable_id wire suffix
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'drawer/toggle',
        entityId: 'drawer',
        presentationInstance: 'bottom-rail',
        controlSlot: 'toggle',
        role: 'button',
        accessibleName: 'Orchestrator',
        state: { expanded: false },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 0, y: 680, width: 140, height: 40 },
        epoch: 1,
        generation: 1,
        stableId: 'forged-wire-id@e1',
      });
    },
    (err) => err.code === 'ERR_UI_STABLE_ID_FORBIDDEN'
  );

  // Without a reviewed producer (or in retail build), exportCanonicalState is BLOCKED (UI_ARCHITECTURE §9, §14 R8)
  const unreviewedRegistry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: null,
  });

  unreviewedRegistry.register({
    semanticAnchor: 'drawer/toggle',
    entityId: 'drawer',
    presentationInstance: 'bottom-rail',
    controlSlot: 'toggle',
    role: 'button',
    accessibleName: 'Orchestrator',
    state: { expanded: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 0, y: 680, width: 140, height: 40 },
    epoch: 1,
    generation: 1,
  });

  assert.throws(
    () => {
      unreviewedRegistry.exportCanonicalState();
    },
    (err) => err.code === 'ERR_LANE_PRODUCER_BLOCKED'
  );

  // Bare Electron peer or retail mode also blocks export
  const retailRegistry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    retailMode: true,
    reviewedProducer: createReviewedProducer(),
  });
  assert.throws(
    () => {
      retailRegistry.exportCanonicalState();
    },
    (err) => err.code === 'ERR_RETAIL_EXPORT_FORBIDDEN'
  );
});

test('negative contrast: fabricated boxes while hidden/off-DOM/synthetic and invalid coordinate spaces fail', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 2,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });

  // Hidden control supplying a fabricated box must fail
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'capsule/cap-1/slot',
        entityId: 'cap-1',
        presentationInstance: 'wall',
        controlSlot: 'slot',
        role: 'region',
        accessibleName: 'AI sessions for Capsule 1',
        state: { expanded: false },
        visible: false,
        materialized: true,
        inDom: true,
        box: { x: 10, y: 10, width: 100, height: 100 },
        epoch: 2,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_FABRICATED_BOX'
  );

  // Hidden control with null box succeeds, but cannot be resolved as actionable target
  registry.register({
    semanticAnchor: 'capsule/cap-1/slot',
    entityId: 'cap-1',
    presentationInstance: 'wall',
    controlSlot: 'slot',
    role: 'region',
    accessibleName: 'AI sessions for Capsule 1',
    state: { expanded: false },
    visible: false,
    materialized: true,
    inDom: true,
    box: null,
    epoch: 2,
    generation: 1,
  });

  assert.throws(
    () => {
      registry.resolveActionableTarget('capsule/cap-1/slot');
    },
    (err) => err.code === 'ERR_TARGET_NOT_ACTIONABLE'
  );

  // Screen coordinates or popout-offset coordinate spaces are rejected
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'shell/fullscreen',
        entityId: 'shell',
        presentationInstance: 'root',
        controlSlot: 'fullscreen',
        role: 'button',
        accessibleName: 'Full screen',
        state: {},
        visible: true,
        materialized: true,
        inDom: true,
        coordinateSpace: 'screen',
        box: { x: 100, y: 100, width: 50, height: 30 },
        epoch: 2,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_INVALID_BOX_SPACE'
  );
});

test('negative contrast: unknown control families, zero-coerced unknown values, and modal background actions fail', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: createReviewedProducer(),
  });

  // Uninventoried control family fails admission
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'custom/unreviewed/button',
        entityId: 'custom',
        presentationInstance: 'wall',
        controlSlot: 'button',
        role: 'button',
        accessibleName: 'Unreviewed Button',
        state: {},
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 10, y: 10, width: 50, height: 20 },
        epoch: 1,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_UNKNOWN_CONTROL_FAMILY'
  );

  // Inspector field with unknown value coerced to 0 when marked unknown fails ("Unknown omitted/unavailable, never zero")
  assert.throws(
    () => {
      registry.register({
        semanticAnchor: 'inspector/cap-1/field',
        entityId: 'cap-1',
        presentationInstance: 'inspector',
        controlSlot: 'field-balance',
        role: 'group',
        accessibleName: 'Balance: 0',
        state: { valueKnown: false, value: 0 },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 20, y: 40, width: 120, height: 24 },
        epoch: 1,
        generation: 1,
      });
    },
    (err) => err.code === 'ERR_UNKNOWN_VALUE_ZERO'
  );

  // Modal scope blocks background controls and requires valid invoker restoration
  registry.register({
    semanticAnchor: 'shell/navigation/loan',
    entityId: 'loan',
    presentationInstance: 'rail',
    controlSlot: 'nav-loan',
    role: 'button',
    accessibleName: 'Loan',
    state: { selected: true },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 10, y: 80, width: 100, height: 32 },
    epoch: 1,
    generation: 1,
  });

  registry.register({
    semanticAnchor: 'dialog/loan-confirm/accept',
    entityId: 'loan-confirm',
    presentationInstance: 'modal',
    controlSlot: 'accept',
    role: 'button',
    accessibleName: 'Confirm Loan',
    state: {},
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 400, y: 300, width: 120, height: 36 },
    epoch: 1,
    generation: 1,
  });

  registry.enterModalScope('loan-confirm', 'shell/navigation/loan');

  // Background control is inert while modal is active
  assert.throws(
    () => {
      registry.resolveActionableTarget('shell/navigation/loan');
    },
    (err) => err.code === 'ERR_MODAL_BACKGROUND_INERT'
  );

  // Modal control itself is actionable
  const modalAction = registry.resolveActionableTarget('dialog/loan-confirm/accept');
  assert.equal(modalAction.entityId, 'loan-confirm');

  // Exiting modal scope restores invoker anchor
  const restoredInvoker = registry.exitModalScope('loan-confirm');
  assert.equal(restoredInvoker, 'shell/navigation/loan');

  // Invalidation on layout/scroll/sort/zoom requires revalidation before target resolution
  registry.markNeedsRevalidation('zoom');
  assert.throws(
    () => {
      registry.resolveActionableTarget('shell/navigation/loan');
    },
    (err) => err.code === 'ERR_REVALIDATION_REQUIRED'
  );
});

test('battery digest vs frame-binding digest and closed native agent_lane frame validation', () => {
  const producer = createReviewedProducer();
  const regA = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: producer,
  });
  regA.register({
    semanticAnchor: 'shell/fullscreen',
    entityId: 'shell',
    presentationInstance: 'root',
    controlSlot: 'fullscreen',
    role: 'button',
    accessibleName: 'Full screen',
    state: { pressed: false },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 100, y: 10, width: 80, height: 30 },
    epoch: 1,
    generation: 1,
  });

  const regB = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: producer,
  });
  regB.register({
    semanticAnchor: 'shell/fullscreen',
    entityId: 'shell',
    presentationInstance: 'root',
    controlSlot: 'fullscreen',
    role: 'button',
    accessibleName: 'Full screen',
    state: { pressed: false },
    visible: true,
    materialized: true,
    inDom: true,
    // Moved box!
    box: { x: 240, y: 50, width: 80, height: 30 },
    epoch: 1,
    generation: 1,
  });

  const stateA = regA.exportCanonicalState();
  const stateB = regB.exportCanonicalState();

  const digestsA = computeStateDigests(stateA);
  const digestsB = computeStateDigests(stateB);

  // Moving a box changes frameBindingDigest but NOT batteryDigest
  assert.equal(digestsA.batteryDigest, digestsB.batteryDigest);
  assert.notEqual(digestsA.frameBindingDigest, digestsB.frameBindingDigest);

  // Changing role, name, or state value MUST change batteryDigest
  const stateC = structuredClone(stateA);
  stateC.nodes[0].state.pressed = true;
  const digestsC = computeStateDigests(stateC);
  assert.notEqual(digestsA.batteryDigest, digestsC.batteryDigest);

  // Verify geometry-free canonical JSON has box: null and preserves all other fields
  const parsedGeometryFree = JSON.parse(canonicalizeStateJson(stateA, { nullBoxes: true }));
  assert.equal(parsedGeometryFree.nodes[0].box, null);
  assert.equal(parsedGeometryFree.nodes[0].accessibleName, 'Full screen');

  // Native agent lane frame validation: exact keys nonce,seq,verb,body; T2 body tick,seq,cmd,args
  const validSubmit = validateAgentLaneFrame({
    nonce: 'n-001',
    seq: 1,
    verb: 'submit',
    body: {
      tick: 42,
      seq: 1,
      cmd: 'click',
      args: { target: 'win-main:root:shell/fullscreen' + '@' + 'e1.g1' },
    },
  });
  assert.equal(validSubmit.ok, true);

  assert.throws(
    () => {
      validateAgentLaneFrame({
        nonce: 'n-001',
        seq: 1,
        verb: 'submit',
        extraKey: true,
        body: { tick: 42, seq: 1, cmd: 'click', args: {} },
      });
    },
    (err) => err.code === 'ERR_INVALID_LANE_FRAME'
  );

  assert.throws(
    () => {
      validateAgentLaneFrame({
        nonce: 'n-001',
        seq: 1,
        verb: 'submit',
        body: { tick: 42, seq: 1, cmd: 'click' }, // missing args
      });
    },
    (err) => err.code === 'ERR_INVALID_LANE_FRAME'
  );
});


test('terminal control families admit declared S4 anchors and refuse invented siblings', () => {
  for (const anchor of ['terminal/launcher', 'terminal/launch/shell', 'terminal/launch/pi', 'terminal/launch/claude', 'terminal/launch/codex', 'terminal/session/session-a/tab', 'terminal/session/session-a/close', 'terminal/composer', 'terminal/composer/send']) assert.ok(matchControlFamily(anchor), anchor);
  for (const anchor of ['terminal/launch/invented', 'terminal/session/1/tab', 'terminal/session/session-a/execute', 'terminal/composer/execute', 'invented/control']) assert.equal(matchControlFamily(anchor), null, anchor);
});
