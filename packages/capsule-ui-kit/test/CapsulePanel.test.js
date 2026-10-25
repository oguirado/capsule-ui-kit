/**
 * @file Independent behavioral and negative-contrast test suite for CapsulePanel.vue.
 * Grounded in UI_ARCHITECTURE.md §§3, 4, 5, 6, 8, 9, 10, 12, 13 and 14 (unit: Capsule chrome).
 *
 * Verifies:
 * 1. Vue SFC structure & compilation (@vue/compiler-sfc): plain JS/JSDoc (no lang="ts"),
 *    v-show permanent host retention, actionable control id/role/aria-label/data-semantic-anchor,
 *    scoped --cuk-* design token usage, and zero vendor leaks.
 * 2. Snapshot reader over PublicProjection: 5 distinct lifecycle/presentation/session/attachment/dispatch
 *    axes (never collapsed into a single green/red boolean), stale/error preservation, and missing
 *    monetary/numeric fields preserved as 'unavailable' (never coerced to 0).
 * 3. Semantic control inventory (UI_ARCHITECTURE.md §9): registers capsule/{id}/panel, capsule/{id}/tab,
 *    capsule/{id}/{fold,pin,control,close,popout,dock-back}, and capsule/{id}/slot into controlRegistry;
 *    enforces unavailableReason on disabled actions (including R2 popout policy block), null boxes for
 *    hidden/folded regions, and rejects numeric list-index IDs or UI-synthesized stableId suffixes.
 * 4. Fold cannot stop capture (UI_ARCHITECTURE.md §6, §10, §12, §13): folding disables only the display
 *    branch in presentationScheduler, drains pending display mailbox lease, retains authoritative capture
 *    lease, keeps DOM host mounted via v-show, and allows upstream capture witnesses to advance while
 *    rejecting hidden draws; unfolding requests newest generation beyond hidden capture witnesses without
 *    replaying hidden backlog.
 * 5. G5 Fold/restore focus, bounded retry controller (0ms + 120ms + 400ms), activation veil truth table,
 *    pointerdown/mousedown focus preservation beside live surfaces, and lifecycle negative contrasts
 *    (mount never spawns a process, panel move/remove never destroys capsule, destroyed/lost never revives
 *    under old identity per ARCH:226).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const SFC_PATH = path.resolve(__dirname, '../src/capsules/CapsulePanel.vue');

/**
 * Loads @vue/compiler-sfc from standard node resolution or the pinned consumer shell node_modules.
 */
function loadCompilerSfc() {
  const candidates = [
    '@vue/compiler-sfc',
    '@vue/compiler-sfc',
  ];
  for (const spec of candidates) {
    try {
      return require(spec);
    } catch {
      // try next candidate
    }
  }
  throw new Error('Unable to resolve @vue/compiler-sfc');
}

/** Imports a sibling module from this kit. */
async function loadKitModule(relPathFromSrc) {
  return import(pathToFileURL(path.resolve(__dirname, '../src', relPathFromSrc)).href);
}

const compilerSfc = loadCompilerSfc();
const sfcSource = fs.readFileSync(SFC_PATH, 'utf8');
const parsedSfc = compilerSfc.parse(sfcSource, { filename: 'CapsulePanel.vue' });

if (parsedSfc.errors && parsedSfc.errors.length > 0) {
  throw new Error(`Failed to parse CapsulePanel.vue: ${parsedSfc.errors[0].message}`);
}
if (!parsedSfc.descriptor.script || !parsedSfc.descriptor.script.content) {
  throw new Error('CapsulePanel.vue must contain a plain JS <script> module block exporting testable helpers');
}

const scriptDataUrl =
  'data:text/javascript;base64,' +
  Buffer.from(parsedSfc.descriptor.script.content, 'utf8').toString('base64');

const capsuleModule = await import(scriptDataUrl);
const projectionModule = await loadKitModule('state/publicProjection.js');
const registryModule = await loadKitModule('agent/controlRegistry.js');
const schedulerModule = await loadKitModule('surfaces/presentationScheduler.js');

const {
  ALLOWED_BACKEND_LIFECYCLES,
  ALLOWED_AI_SESSION_ACTIVITIES,
  ALLOWED_ATTACHMENT_STATES,
  ALLOWED_DISPATCH_OUTCOMES,
  CAPSULE_ACTION_VERBS,
  assertImmutableCapsuleId,
  readCapsuleFromProjection,
  evaluateActivationVeil,
  arbitrateKeyboardOwnership,
  createFocusRetryController,
  guardLiveSurfaceControlPointerEvent,
  buildCapsuleSemanticInventory,
  syncCapsuleControlsToRegistry,
  createCapsuleChromeController,
} = capsuleModule;

const { createPublicProjectionCoordinator, PUBLIC_PROJECTION_SCHEMA_ID } = projectionModule;
const { createControlRegistry, computeStateDigests } = registryModule;
const { createPresentationScheduler, SCHEDULER_REASONS } = schedulerModule;

const FROZEN_TEST_BUDGET = Object.freeze({
  maxDrawsPerTick: 4,
  maxUploadBytesPerTick: 4 * 1024 * 1024,
  maxPresentMsPerTick: 8,
  maxWarmResourcesPerSurface: 2,
  maxDrainSteps: 4,
});

const REVIEWED_TEST_PRODUCER = Object.freeze({
  contractId: 'mv.agent-lane-producer/v1',
  peer: 'sample-host-linux-atspi-harness',
  reviewed: true,
  mapStableId({ semanticAnchor, windowId, presentationInstance, epoch, generation }) {
    return `lane:${windowId}:${presentationInstance}:${semanticAnchor}:e${epoch}:g${generation}`;
  },
});

test('SFC compilation: CapsulePanel.vue uses plain JS (<script> + <script setup>, no lang="ts"), v-show permanent hosts, and --cuk-* tokens', () => {
  assert.equal(parsedSfc.errors.length, 0);
  assert.ok(parsedSfc.descriptor.template, 'Template block is required');
  assert.ok(parsedSfc.descriptor.script, 'Companion <script> block is required');
  assert.ok(parsedSfc.descriptor.scriptSetup, '<script setup> block is required');

  assert.equal(parsedSfc.descriptor.script.lang, undefined, '<script> must not set lang="ts"');
  assert.equal(parsedSfc.descriptor.scriptSetup.lang, undefined, '<script setup> must not set lang="ts"');

  const compiledScript = compilerSfc.compileScript(parsedSfc.descriptor, {
    id: 'capsule-panel-scope',
  });
  assert.ok(compiledScript.content.includes('defineComponent') || compiledScript.content.includes('setup('));

  const templateSource = parsedSfc.descriptor.template.content;
  for (const verb of CAPSULE_ACTION_VERBS) {
    const propName = verb === 'dock-back' ? 'dockBack' : verb;
    assert.ok(
      templateSource.includes(`:id="domIds.${propName}"`),
      `Template must bind stable DOM id for ${verb}`
    );
    assert.ok(
      templateSource.includes(`:data-semantic-anchor="anchors.${propName}"`),
      `Template must bind semantic anchor for ${verb}`
    );
  }

  const compiledTemplate = compilerSfc.compileTemplate({
    source: templateSource,
    filename: 'CapsulePanel.vue',
    id: 'capsule-panel-scope',
  });
  assert.equal(compiledTemplate.errors.length, 0);
  assert.ok(
    compiledTemplate.code.includes('vShow'),
    'Template must use v-show (vShow directive) to keep folded live hosts mounted in the DOM'
  );

  assert.ok(parsedSfc.descriptor.styles.length >= 1, 'Scoped style block is required');
  for (const styleBlock of parsedSfc.descriptor.styles) {
    assert.equal(styleBlock.scoped, true, 'Style block must be scoped');
    const styleResult = compilerSfc.compileStyle({
      source: styleBlock.content,
      filename: 'CapsulePanel.vue',
      id: 'data-v-capsulepanel',
      scoped: true,
    });
    assert.equal(styleResult.errors.length, 0);
    assert.ok(styleBlock.content.includes('--cuk-'), 'Styles must reference --cuk-* shared tokens');
    assert.equal(
      /--(dv|p|px|vscode)-/.test(styleBlock.content),
      false,
      'CapsulePanel styles must never reference vendor CSS variables'
    );
  }
});

test('Identity validation: rejects numeric list-index IDs, display-number credentials, synthetic term IDs, and prefix matching', () => {
  assert.equal(assertImmutableCapsuleId('cap-alpha-01', 'capsuleId'), 'cap-alpha-01');
  assert.deepEqual(ALLOWED_BACKEND_LIFECYCLES, ['active', 'standby', 'ceded', 'destroyed', 'lost']);
  assert.deepEqual(ALLOWED_AI_SESSION_ACTIVITIES, [
    'unknown',
    'ready',
    'busy',
    'waiting-input',
    'waiting-permission',
    'exited',
    'failed',
  ]);
  assert.deepEqual(ALLOWED_ATTACHMENT_STATES, [
    'detached',
    'attaching',
    'restoring',
    'live',
    'disconnected',
  ]);
  assert.deepEqual(ALLOWED_DISPATCH_OUTCOMES, [
    'none',
    'admitting',
    'accepted',
    'executing',
    'completed-unverified',
    'verified',
    'refused',
    'uncertain',
    'cancelled',
  ]);

  assert.throws(
    () => assertImmutableCapsuleId('', 'capsuleId'),
    (err) => err.code === 'ERR_INVALID_CAPSULE_ID'
  );
  assert.throws(
    () => assertImmutableCapsuleId('0', 'capsuleId'),
    (err) => err.code === 'ERR_NUMERIC_INDEX_ID'
  );
  assert.throws(
    () => assertImmutableCapsuleId('42', 'capsuleId'),
    (err) => err.code === 'ERR_NUMERIC_INDEX_ID'
  );
  assert.throws(
    () => assertImmutableCapsuleId(':99', 'capsuleId'),
    (err) => err.code === 'ERR_DISPLAY_CREDENTIAL_ID'
  );
  assert.throws(
    () => assertImmutableCapsuleId('display:1', 'capsuleId'),
    (err) => err.code === 'ERR_DISPLAY_CREDENTIAL_ID'
  );
  assert.throws(
    () => assertImmutableCapsuleId('term-ok-1', 'capsuleId'),
    (err) => err.code === 'ERR_SYNTHETIC_TERM_ID'
  );
});

test('Snapshot reader: reads admitted PublicProjection, keeps 5 axes separate, preserves unavailable amounts, and surfaces stale/error banners', () => {
  const coordinator = createPublicProjectionCoordinator();
  const session = coordinator.beginSession({ query: 'capsules/wall', epoch: 3 });
  coordinator.markSubscriptionReady(session.generation);

  const admitResult = coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 3,
      revision: 10,
      durableRevision: 9,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-desk-1',
            surfaceId: 'surf-desk-1',
            title: 'Security Desk Alpha',
            generation: 1,
            backendLifecycle: 'standby',
          },
        ],
      },
    },
    { generation: session.generation }
  );
  assert.equal(admitResult.ok, true);

  const validAdmit = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 3,
      revision: 11,
      durableRevision: 10,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-desk-1',
            surfaceId: 'surf-desk-1',
            title: 'Security Desk Alpha',
            generation: 2,
            backendLifecycle: 'active',
            folded: false,
            pinned: true,
            aiSessionActivity: 'busy',
            attachmentState: 'live',
            dispatchOutcome: 'executing',
            controlOwner: 'none',
            liveSurfaceCount: 2,
            underAiCommand: false,
            cost: null,
            balance: null,
            sessions: [
              { id: 'sess-a1', title: 'Planner', activity: 'busy', attachment: 'live' },
            ],
          },
        ],
      },
    },
    { generation: session.generation }
  );
  assert.equal(validAdmit.ok, true);

  const view = coordinator.getView();
  const readResult = readCapsuleFromProjection(view, 'cap-desk-1');
  assert.equal(readResult.ok, true);

  const state = readResult.capsule;
  assert.equal(state.capsuleId, 'cap-desk-1');
  assert.equal(state.surfaceId, 'surf-desk-1');
  assert.equal(state.generation, 2);
  assert.equal(state.epoch, 3);
  assert.equal(state.ramRevision, 11);
  assert.equal(state.durableRevision, 10);
  assert.equal(state.stale, false);

  // Verify the 5 separate axes are distinct and never collapsed to a boolean
  assert.equal(state.axes.backendLifecycle, 'active');
  assert.equal(state.axes.uiPresentation.folded, false);
  assert.equal(state.axes.uiPresentation.pinned, true);
  assert.equal(state.axes.aiSessionActivity, 'busy');
  assert.equal(state.axes.attachmentState, 'live');
  assert.equal(state.axes.dispatchOutcome, 'executing');
  assert.equal(typeof state.axes.statusBoolean, 'undefined');

  // Missing monetary fields remain 'unavailable', never 0
  assert.equal(state.metrics.cost, 'unavailable');
  assert.equal(state.metrics.balance, 'unavailable');
  assert.notEqual(state.metrics.cost, 0);

  // Negative contrast: prefix matching ('cap-desk') must NOT match 'cap-desk-1'
  const prefixAttempt = readCapsuleFromProjection(view, 'cap-desk');
  assert.equal(prefixAttempt.ok, false);
  assert.equal(prefixAttempt.error.code, 'ERR_CAPSULE_NOT_FOUND');

  // Negative contrast: refused push marks projection stale while preserving last-good capsule data
  const badPush = coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 3,
      revision: 9, // stale revision
      query: 'capsules/wall',
      projection: { rows: [] },
    },
    { generation: session.generation }
  );
  assert.equal(badPush.ok, false);

  const staleRead = readCapsuleFromProjection(view, 'cap-desk-1');
  assert.equal(staleRead.ok, true);
  assert.equal(staleRead.capsule.stale, true);
  assert.equal(staleRead.capsule.projectionStatus, 'stale');
  assert.equal(staleRead.capsule.lastError.code, 'ERR_STALE_REVISION');
  assert.equal(staleRead.capsule.title, 'Security Desk Alpha');
});

test('Snapshot reader negative contrasts: rejects invented backend lifecycle enums, collapsed boolean status, and quiet-output ready inference', () => {
  // 1. Invented backendLifecycle enum value must fail closed
  const inventedLifecycleSnap = {
    status: 'live',
    stale: false,
    ramRevision: 1,
    durableRevision: 1,
    envelope: {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      durableRevision: 1,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-bad-enum',
            surfaceId: 'surf-bad-enum',
            title: 'Bad Enum',
            generation: 1,
            backendLifecycle: 'resurrected',
          },
        ],
      },
    },
  };
  const badEnumRes = readCapsuleFromProjection(inventedLifecycleSnap, 'cap-bad-enum');
  assert.equal(badEnumRes.ok, false);
  assert.equal(badEnumRes.error.code, 'ERR_INVENTED_LIFECYCLE_ENUM');

  // 2. Collapsed single green/red boolean status payload without distinct axes must fail closed
  const collapsedBooleanSnap = {
    status: 'live',
    stale: false,
    ramRevision: 1,
    durableRevision: 1,
    envelope: {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      durableRevision: 1,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-bool-only',
            surfaceId: 'surf-bool-only',
            title: 'Collapsed Status',
            generation: 1,
            isGreen: true,
          },
        ],
      },
    },
  };
  const collapsedRes = readCapsuleFromProjection(collapsedBooleanSnap, 'cap-bool-only');
  assert.equal(collapsedRes.ok, false);
  assert.equal(collapsedRes.error.code, 'ERR_COLLAPSED_STATUS_BOOLEAN');

  // 3. Quiet terminal output without authenticated adapter/core event leaves activity 'unknown', never 'ready'
  const quietSnap = {
    status: 'live',
    stale: false,
    ramRevision: 2,
    durableRevision: 2,
    envelope: {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 2,
      durableRevision: 2,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-quiet',
            surfaceId: 'surf-quiet',
            title: 'Quiet Capsule',
            generation: 1,
            backendLifecycle: 'active',
            outputQuietMs: 60000,
          },
        ],
      },
    },
  };
  const quietRes = readCapsuleFromProjection(quietSnap, 'cap-quiet');
  assert.equal(quietRes.ok, true);
  assert.equal(quietRes.capsule.axes.aiSessionActivity, 'unknown');
  assert.notEqual(quietRes.capsule.axes.aiSessionActivity, 'ready');
});

test('Semantic inventory & controlRegistry integration: registers all §9 capsule controls, enforces R2 popout unavailableReason, and nulls folded boxes', () => {
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 5,
    generation: 2,
    reviewedProducer: REVIEWED_TEST_PRODUCER,
  });

  const capsuleState = {
    capsuleId: 'cap-ops-7',
    surfaceId: 'surf-ops-7',
    title: 'Browser Surface 7',
    epoch: 5,
    generation: 2,
    axes: {
      backendLifecycle: 'active',
      uiPresentation: {
        folded: false,
        slotFolded: false,
        pinned: false,
        presentationMode: 'docked',
        panelOpen: true,
        panelSelected: true,
        controlRequestPhase: 'idle',
      },
      aiSessionActivity: 'ready',
      attachmentState: 'live',
      dispatchOutcome: 'none',
    },
    controlOwner: 'none',
    popoutTransferSupported: false, // §14 R2 default: blocked by deny-window.open
  };

  const unfoldedLayout = {
    presentationInstance: 'panel-ops-7',
    visible: true,
    materialized: true,
    inDom: true,
    boxes: {
      panel: { x: 20, y: 40, width: 640, height: 480 },
      tab: { x: 20, y: 10, width: 140, height: 30 },
      fold: { x: 500, y: 44, width: 28, height: 26 },
      pin: { x: 530, y: 44, width: 28, height: 26 },
      control: { x: 560, y: 44, width: 28, height: 26 },
      popout: { x: 590, y: 44, width: 28, height: 26 },
      'dock-back': { x: 620, y: 44, width: 28, height: 26 },
      close: { x: 650, y: 44, width: 28, height: 26 },
      slot: { x: 20, y: 340, width: 640, height: 180 },
    },
  };

  const records = syncCapsuleControlsToRegistry(registry, capsuleState, unfoldedLayout);
  assert.equal(records.length, 9);

  // Verify actionable controls resolve cleanly
  const foldTarget = registry.resolveActionableTarget('capsule/cap-ops-7/fold', 'panel-ops-7');
  assert.equal(foldTarget.role, 'button');
  assert.equal(foldTarget.accessibleName, 'Fold Browser Surface 7');
  assert.equal(foldTarget.state.expanded, true);
  assert.ok(foldTarget.stableId?.startsWith('lane:win-main:panel-ops-7:capsule/cap-ops-7/fold'));

  // R2: popout is disabled with an explicit unavailableReason, so resolving as actionable refuses with ERR_TARGET_DISABLED
  assert.throws(
    () => registry.resolveActionableTarget('capsule/cap-ops-7/popout', 'panel-ops-7'),
    (err) => err.code === 'ERR_TARGET_DISABLED' && /window\.open|transfer/i.test(err.message)
  );

  // Dock-back is disabled while already docked, with explicit unavailableReason
  assert.throws(
    () => registry.resolveActionableTarget('capsule/cap-ops-7/dock-back', 'panel-ops-7'),
    (err) => err.code === 'ERR_TARGET_DISABLED' && /already docked/i.test(err.message)
  );

  // Now fold the capsule: slot region is hidden via v-show and must receive box: null
  const foldedCapsuleState = {
    ...capsuleState,
    axes: {
      ...capsuleState.axes,
      uiPresentation: {
        ...capsuleState.axes.uiPresentation,
        folded: true,
      },
    },
  };
  registry.markNeedsRevalidation('layout');
  syncCapsuleControlsToRegistry(registry, foldedCapsuleState, unfoldedLayout, { revalidate: true });

  const exported = registry.exportCanonicalState();
  const slotNode = exported.nodes.find((n) => n.semanticAnchor === 'capsule/cap-ops-7/slot');
  assert.ok(slotNode);
  assert.equal(slotNode.visible, false);
  assert.equal(slotNode.inDom, true, 'v-show keeps slot host mounted in DOM');
  assert.equal(slotNode.box, null, 'Hidden/folded slot region must have null box');

  const foldNodeAfter = registry.resolveActionableTarget('capsule/cap-ops-7/fold', 'panel-ops-7');
  assert.equal(foldNodeAfter.accessibleName, 'Unfold Browser Surface 7');
  assert.equal(foldNodeAfter.state.expanded, false);

  // Battery digest invariance when moving panel geometry vs changing semantic state
  const digestsBeforeMove = computeStateDigests(exported);
  const movedLayout = {
    ...unfoldedLayout,
    boxes: {
      ...unfoldedLayout.boxes,
      panel: { x: 120, y: 140, width: 640, height: 480 },
      fold: { x: 600, y: 144, width: 28, height: 26 },
    },
  };
  registry.markNeedsRevalidation('layout');
  syncCapsuleControlsToRegistry(registry, foldedCapsuleState, movedLayout, { revalidate: true });
  const exportedMoved = registry.exportCanonicalState();
  const digestsAfterMove = computeStateDigests(exportedMoved);

  assert.equal(
    digestsAfterMove.batteryDigest,
    digestsBeforeMove.batteryDigest,
    'Moving a capsule box changes frameBindingDigest but never batteryDigest'
  );
  assert.notEqual(digestsAfterMove.frameBindingDigest, digestsBeforeMove.frameBindingDigest);
});

test('ROW NEGATIVE CONTRAST — Fold cannot stop capture: folding drains display branch only, retains capture lease, advances capture witness, rejects hidden draws, and skips backlog on unfold', () => {
  let clockMs = 1000;
  /** @type {Object[]} */
  const releasedLeases = [];
  /** @type {Object[]} */
  const newestGenRequests = [];
  /** @type {Object[]} */
  const emittedIntents = [];
  let captureUnsubscribeCalls = 0;
  let processDestroyCalls = 0;

  const scheduler = createPresentationScheduler({
    budget: FROZEN_TEST_BUDGET,
    clock: () => clockMs,
    onReleaseLease: (info) => releasedLeases.push(info),
    onRequestNewestGeneration: (req) => newestGenRequests.push(req),
  });

  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: REVIEWED_TEST_PRODUCER,
  });

  const coordinator = createPublicProjectionCoordinator();
  const session = coordinator.beginSession({ query: 'capsules/wall', epoch: 1 });
  coordinator.markSubscriptionReady(session.generation);
  coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      durableRevision: 1,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-capture-1',
            surfaceId: 'surf-capture-1',
            title: 'Live Capture Capsule',
            generation: 1,
            captureLeaseId: 'cap-lease-alpha',
            backendLifecycle: 'active',
            folded: false,
            pinned: false,
            aiSessionActivity: 'busy',
            attachmentState: 'live',
            dispatchOutcome: 'executing',
          },
        ],
      },
    },
    { generation: session.generation }
  );

  const controller = createCapsuleChromeController({
    capsuleId: 'cap-capture-1',
    presentationInstance: 'panel-capture-1',
    projectionView: coordinator.getView(),
    scheduler,
    controlRegistry: registry,
    onSubmitIntent: (intent) => {
      emittedIntents.push(intent);
      if (intent.type === 'frame_unsubscribe') {
        captureUnsubscribeCalls += 1;
      }
      if (intent.type === 'surface_request.destroy') {
        processDestroyCalls += 1;
      }
    },
  });

  // Mount controller with positive geometry
  const mountRes = controller.mount({
    geometry: { x: 10, y: 20, width: 800, height: 600 },
  });
  assert.equal(mountRes.ok, true);
  assert.equal(mountRes.spawnedProcess, false, 'Mounting a panel must never spawn a backend process');

  // Allocate warm resources and submit frame 1 + frame 2 while unfolded
  scheduler.allocateWarmResource('surf-capture-1', 'tex-1', 4096);
  scheduler.allocateWarmResource('surf-capture-1', 'tex-2', 4096);
  scheduler.recordCaptureWitness({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    captureGeneration: 1,
    timestampMs: clockMs,
  });

  const frame1Res = scheduler.submitFrame({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'frame-lease-1',
    byteLength: 65536,
    submittedAtMs: clockMs,
  });
  assert.equal(frame1Res.ok, true);
  scheduler.runTick();

  // Queue frame 2 into mailbox right before folding
  clockMs += 16;
  scheduler.recordCaptureWitness({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    captureGeneration: 2,
    timestampMs: clockMs,
  });
  const frame2Res = scheduler.submitFrame({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    frameGeneration: 2,
    leaseId: 'frame-lease-2',
    byteLength: 65536,
    submittedAtMs: clockMs,
  });
  assert.equal(frame2Res.ok, true);

  // Execute FOLD
  const foldRes = controller.fold();
  assert.equal(foldRes.ok, true);
  assert.equal(foldRes.folded, true);
  assert.equal(foldRes.domHostMounted, true, 'Folded live host must stay mounted via v-show');
  assert.equal(foldRes.focusMovedTo, 'capsule/cap-capture-1/fold', 'Focus must return to fold invoker before hiding');
  assert.equal(foldRes.captureLeaseRetained, true, 'Fold must NEVER release the authoritative capture lease');
  assert.equal(foldRes.drainedFrameGeneration, 2, 'Pending display mailbox lease must be drained on fold');
  assert.equal(captureUnsubscribeCalls, 0, 'Fold must NEVER emit frame_unsubscribe');
  assert.equal(processDestroyCalls, 0, 'Fold must NEVER terminate or destroy the capsule');

  // Verify pending display lease was reclaimed with FOLD_DRAIN
  assert.ok(
    releasedLeases.some((r) => r.leaseId === 'frame-lease-2' && r.reason === 'FOLD_DRAIN'),
    'Pending presentation lease must be reclaimed on fold'
  );

  // Verify upstream authoritative capture continues advancing while folded (gen 3, 4, 5)
  for (const capGen of [3, 4, 5]) {
    clockMs += 16;
    const witnessRes = scheduler.recordCaptureWitness({
      surfaceId: 'surf-capture-1',
      surfaceGeneration: 1,
      captureGeneration: capGen,
      timestampMs: clockMs,
    });
    assert.equal(witnessRes.ok, true, `Capture witness ${capGen} must advance while folded`);

    // Any attempt to submit/draw display frames while folded must be rejected fail-closed
    const hiddenDrawAttempt = scheduler.submitFrame({
      surfaceId: 'surf-capture-1',
      surfaceGeneration: 1,
      frameGeneration: capGen,
      leaseId: `frame-lease-${capGen}`,
      byteLength: 65536,
      submittedAtMs: clockMs,
    });
    assert.equal(hiddenDrawAttempt.ok, false);
    assert.equal(hiddenDrawAttempt.reason, SCHEDULER_REASONS.FOLDED_DISPLAY_DISABLED);
  }

  const instWhileFolded = scheduler.getInstrumentation('surf-capture-1');
  assert.equal(instWhileFolded.captureLeaseActive, true);
  assert.equal(instWhileFolded.captureCount, 5, 'Capture count advanced from 2 to 5 while folded');
  assert.equal(instWhileFolded.presentCount, 1, 'Present/draw count stayed at 1 while folded');
  assert.equal(instWhileFolded.rejectedHiddenDraws, 3, 'All 3 hidden frame submissions were rejected');

  // Attempt explicit stopCapture / unsubscribe through fold guard must be refused
  assert.throws(
    () => controller.assertFoldNeverStopsCapture({ unsubscribeCapture: true }),
    (err) => err.code === 'ERR_FOLD_CANNOT_STOP_CAPTURE'
  );

  // Now UNFOLD: must request newest generation (> 5) and reject stale hidden backlog (<= 5)
  clockMs += 16;
  const unfoldRes = controller.unfold({
    geometry: { x: 10, y: 20, width: 800, height: 600 },
  });
  assert.equal(unfoldRes.ok, true);
  assert.equal(unfoldRes.folded, false);
  assert.equal(unfoldRes.requestedAfterFrameGeneration, 5);
  assert.equal(newestGenRequests.length, 1);
  assert.equal(newestGenRequests[0].afterFrameGeneration, 5);

  // Negative contrast: replaying hidden backlog frame 4 or 5 after unfold must fail closed
  const backlogReplay = scheduler.submitFrame({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    frameGeneration: 5,
    leaseId: 'frame-lease-backlog-5',
    byteLength: 65536,
    submittedAtMs: clockMs,
  });
  assert.equal(backlogReplay.ok, false);
  assert.equal(backlogReplay.reason, SCHEDULER_REASONS.STALE_FRAME_GENERATION);

  // Fresh frame 6 after unfold succeeds and presents
  const freshFrame6 = scheduler.submitFrame({
    surfaceId: 'surf-capture-1',
    surfaceGeneration: 1,
    frameGeneration: 6,
    leaseId: 'frame-lease-6',
    byteLength: 65536,
    submittedAtMs: clockMs,
  });
  assert.equal(freshFrame6.ok, true);
  const tickAfterUnfold = scheduler.runTick();
  assert.equal(tickAfterUnfold.presented.length, 1);
  assert.equal(tickAfterUnfold.presented[0].frameGeneration, 6);
});

test('G5 Focus retry controller & activation veil truth table: 0ms/120ms/400ms retries, cancellation on fold/ownership change, and pointerdown focus guard', () => {
  // 1. Activation veil truth table (§6 G5)
  assert.equal(
    evaluateActivationVeil({
      liveSurfaceCount: 1,
      hasKeyboardOwnership: false,
      underAiCommand: false,
    }).showVeil,
    false,
    'Single live surface never shows activation veil'
  );
  assert.equal(
    evaluateActivationVeil({
      liveSurfaceCount: 3,
      hasKeyboardOwnership: true,
      underAiCommand: false,
    }).showVeil,
    false,
    'Surface with keyboard ownership never shows activation veil'
  );
  assert.equal(
    evaluateActivationVeil({
      liveSurfaceCount: 3,
      hasKeyboardOwnership: false,
      underAiCommand: true,
    }).showVeil,
    false,
    'Surface under AI command never shows activation veil'
  );
  assert.equal(
    evaluateActivationVeil({
      liveSurfaceCount: 3,
      hasKeyboardOwnership: false,
      underAiCommand: false,
    }).showVeil,
    true,
    'Veil shows when >1 live surface exists, lacks keyboard ownership, and not under AI command'
  );

  // Sibling keyboard ownership arbitration: idempotent and clears sibling ownership
  const siblingSurfaces = [
    { capsuleId: 'cap-1', backendLifecycle: 'active', hasKeyboardOwnership: true, underAiCommand: false },
    { capsuleId: 'cap-2', backendLifecycle: 'active', hasKeyboardOwnership: false, underAiCommand: false },
    { capsuleId: 'cap-3', backendLifecycle: 'active', hasKeyboardOwnership: false, underAiCommand: true },
  ];
  const arbResult = arbitrateKeyboardOwnership(siblingSurfaces, 'cap-2');
  assert.equal(arbResult.ok, true);
  assert.equal(arbResult.ownerCapsuleId, 'cap-2');
  assert.equal(arbResult.surfaces.find((s) => s.capsuleId === 'cap-1').hasKeyboardOwnership, false);
  assert.equal(arbResult.surfaces.find((s) => s.capsuleId === 'cap-2').hasKeyboardOwnership, true);

  // Cannot grant human keyboard ownership to an AI-commanded surface without releasing AI lease
  const aiOwnedAttempt = arbitrateKeyboardOwnership(siblingSurfaces, 'cap-3');
  assert.equal(aiOwnedAttempt.ok, false);
  assert.equal(aiOwnedAttempt.error.code, 'ERR_SURFACE_UNDER_AI_COMMAND');

  // 2. Three-layer focus retry schedule (0ms, 120ms, 400ms) and stale timer cancellation
  /** @type {Array<{ delayMs: number, fn: Function, cancelled: boolean }>} */
  const scheduledTimers = [];
  /** @type {Function[]} */
  const rafQueue = [];
  /** @type {string[]} */
  const focusLog = [];

  let stateSnapshot = {
    capsuleId: 'cap-focus-1',
    generation: 4,
    folded: false,
    visible: true,
    width: 800,
    height: 600,
    controlOwner: 'human',
    controlLeaseId: 'lease-h-1',
    slotCensusWitness: true,
  };

  const focusController = createFocusRetryController({
    getState: () => stateSnapshot,
    scheduleTimer(fn, delayMs) {
      const handle = { delayMs, fn, cancelled: false };
      scheduledTimers.push(handle);
      return () => {
        handle.cancelled = true;
      };
    },
    scheduleRaf(fn) {
      rafQueue.push(fn);
      return () => {};
    },
    onFocusFoldInvoker(anchor) {
      focusLog.push(`invoker:${anchor}`);
      return true;
    },
    onDomHostFocus(capsuleId) {
      focusLog.push(`dom:${capsuleId}`);
      return true;
    },
    onNativeSurfaceFocus(capsuleId, leaseId) {
      focusLog.push(`native:${capsuleId}:${leaseId}`);
      return scheduledTimers.filter((t) => !t.cancelled).length >= 1;
    },
    onRefitTerminal(capsuleId) {
      focusLog.push(`refit:${capsuleId}`);
    },
  });

  // Negative contrast: restore with 0x0 empty box must refuse fake geometry
  stateSnapshot = { ...stateSnapshot, width: 0, height: 0 };
  const emptyRestore = focusController.onRestoreVisible();
  assert.equal(emptyRestore.ok, false);
  assert.equal(emptyRestore.error.code, 'ERR_EMPTY_RESTORE_GEOMETRY');

  // Positive restore with real geometry schedules rAF + 120ms
  stateSnapshot = { ...stateSnapshot, width: 800, height: 600 };
  const validRestore = focusController.onRestoreVisible();
  assert.equal(validRestore.ok, true);
  assert.equal(rafQueue.length, 1);
  rafQueue.shift()();
  assert.equal(scheduledTimers.length, 1);
  assert.equal(scheduledTimers[0].delayMs, 120);

  // Folding before the 120ms timer fires moves focus to fold invoker and cancels the pending timer
  const foldFocusRes = focusController.onFold();
  assert.equal(foldFocusRes.ok, true);
  assert.equal(foldFocusRes.focusedAnchor, 'capsule/cap-focus-1/fold');
  assert.equal(scheduledTimers[0].cancelled, true, 'Fold must cancel pending restore focus timers');

  // Unfold and test 3-layer Take Control retries (0ms, 120ms, 400ms)
  stateSnapshot = { ...stateSnapshot, folded: false };
  scheduledTimers.length = 0;
  focusLog.length = 0;

  const takeControlRes = focusController.beginHumanControlFocus();
  assert.equal(takeControlRes.ok, true);
  assert.deepEqual(
    scheduledTimers.map((t) => t.delayMs),
    [120, 400],
    'Take control must schedule bounded retries at 120ms and 400ms after immediate 0ms attempt'
  );

  // If ownership changes to 'agent' before 120ms fires, the timer must cancel and never steal keys
  stateSnapshot = { ...stateSnapshot, controlOwner: 'agent' };
  const tick120 = scheduledTimers[0].fn();
  assert.equal(tick120.ok, false);
  assert.equal(tick120.error.code, 'ERR_FOCUS_RETRY_INVALIDATED');
  assert.equal(scheduledTimers[1].cancelled, true, '400ms retry must also cancel on ownership change');

  // 3. Pointerdown and mousedown beside live surfaces call preventDefault()
  let defaultPreventedCount = 0;
  const pointerDownRes = guardLiveSurfaceControlPointerEvent({
    type: 'pointerdown',
    preventDefault() {
      defaultPreventedCount += 1;
    },
  });
  const mouseDownRes = guardLiveSurfaceControlPointerEvent({
    type: 'mousedown',
    preventDefault() {
      defaultPreventedCount += 1;
    },
  });
  assert.equal(pointerDownRes.prevented, true);
  assert.equal(mouseDownRes.prevented, true);
  assert.equal(defaultPreventedCount, 2);
});

test('Lifecycle negative contrasts: panel move/close never destroys capsule; reconnect after destroyed/lost refuses old identity revival (ARCH:226)', () => {
  /** @type {Object[]} */
  const emittedIntents = [];
  const scheduler = createPresentationScheduler({
    budget: FROZEN_TEST_BUDGET,
  });
  const registry = createControlRegistry({
    windowId: 'win-main',
    epoch: 1,
    generation: 1,
    reviewedProducer: REVIEWED_TEST_PRODUCER,
  });
  const coordinator = createPublicProjectionCoordinator();
  const session = coordinator.beginSession({ query: 'capsules/wall', epoch: 1 });
  coordinator.markSubscriptionReady(session.generation);
  coordinator.admitInitialResponse(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 1,
      durableRevision: 1,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-life-9',
            surfaceId: 'surf-life-9',
            title: 'Lifecycle Capsule 9',
            generation: 1,
            captureLeaseId: 'lease-life-9',
            backendLifecycle: 'active',
            folded: false,
            pinned: false,
            aiSessionActivity: 'ready',
            attachmentState: 'live',
            dispatchOutcome: 'none',
          },
        ],
      },
    },
    { generation: session.generation }
  );

  const controller = createCapsuleChromeController({
    capsuleId: 'cap-life-9',
    presentationInstance: 'panel-life-9',
    projectionView: coordinator.getView(),
    scheduler,
    controlRegistry: registry,
    onSubmitIntent: (intent) => emittedIntents.push(intent),
  });
  controller.mount({ geometry: { x: 0, y: 0, width: 500, height: 400 } });

  // Moving, tabbing, or Dockview panel remove/close callback must NEVER destroy the backend capsule
  const moveRes = controller.onPresentationMove({
    presentationMode: 'floating',
    geometry: { x: 50, y: 60, width: 500, height: 400 },
  });
  assert.equal(moveRes.ok, true);
  assert.equal(moveRes.destroyedBackend, false);

  const dockviewRemoveRes = controller.onPanelRemoveCallback();
  assert.equal(dockviewRemoveRes.ok, true);
  assert.equal(dockviewRemoveRes.destroyedBackend, false);
  assert.equal(
    emittedIntents.some((i) => i.type === 'surface_request.destroy'),
    false,
    'Dockview remove callback must never emit surface_request.destroy'
  );
  assert.equal(scheduler.getInstrumentation('surf-life-9').destroyed, false);
  assert.equal(scheduler.getInstrumentation('surf-life-9').captureLeaseActive, true);

  // Core publishes terminal 'lost' state
  coordinator.admitPush(
    {
      schema: PUBLIC_PROJECTION_SCHEMA_ID,
      epoch: 1,
      revision: 2,
      durableRevision: 2,
      query: 'capsules/wall',
      projection: {
        rows: [
          {
            id: 'cap-life-9',
            surfaceId: 'surf-life-9',
            title: 'Lifecycle Capsule 9',
            generation: 1,
            captureLeaseId: 'lease-life-9',
            backendLifecycle: 'lost',
            folded: false,
            pinned: false,
            aiSessionActivity: 'failed',
            attachmentState: 'disconnected',
            dispatchOutcome: 'uncertain',
          },
        ],
      },
    },
    { generation: session.generation }
  );
  controller.syncFromProjection();

  // ARCH:226 negative contrast: attempting to revive/reconnect under the old capsuleId or surfaceId must fail closed
  assert.throws(
    () =>
      controller.requestReplacement({
        newCapsuleId: 'cap-life-9',
        newSurfaceId: 'surf-life-10',
      }),
    (err) => err.code === 'ERR_REVIVE_OLD_IDENTITY_FORBIDDEN'
  );
  assert.throws(
    () =>
      controller.requestReplacement({
        newCapsuleId: 'cap-life-10',
        newSurfaceId: 'surf-life-9',
      }),
    (err) => err.code === 'ERR_REVIVE_OLD_IDENTITY_FORBIDDEN'
  );

  // Replacement with a brand-new identity succeeds
  const replaceRes = controller.requestReplacement({
    newCapsuleId: 'cap-life-10',
    newSurfaceId: 'surf-life-10',
    profile: 'browser-default',
  });
  assert.equal(replaceRes.ok, true);
  assert.equal(replaceRes.replacementIdentity.capsuleId, 'cap-life-10');
});
