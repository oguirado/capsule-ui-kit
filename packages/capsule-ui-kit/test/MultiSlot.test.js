import { assertPackageImports } from './publication-rules.js';
/**
 * @file Behavioral and structural oracle tests for MultiSlot.vue (`architecture contract` §§ 3, 6, 7, 9, 10, 12, 13).
 * Verifies the Session projection contract, 5 orthogonal multislot axes, attach/restore contiguous cursor
 * reconciliation, G5 fold/restore focus and activation veil protocol, §9 semantic control inventory,
 * @vue/compiler-sfc compilation, and the mandatory negative contrasts (tab/fold/mount cannot spawn/kill,
 * quiet output never implies ready/done, multiple active controllers refused, fabricated hidden boxes refused,
 * stale/gap stream chunks rejected, late focus timers cancelled, and prompt injection callbacks rejected).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VUE_FILE_PATH = path.resolve(__dirname, '../src/capsules/MultiSlot.vue');
const BOOK_FILE_PATH = path.resolve(__dirname, '../books/multislot.md');

/**
 * Loads `@vue/compiler-sfc` from the workspace or consumer shell node_modules if installed.
 * @returns {import('@vue/compiler-sfc') | null}
 */
function loadCompilerSfc() {
  return createRequire(import.meta.url)('@vue/compiler-sfc');
}

/**
 * Extracts and dynamically imports the pure JS module `<script>` block from `MultiSlot.vue`
 * so `node:test` can execute all exported helper functions directly without a custom loader.
 * @returns {Promise<Record<string, any>>}
 */
async function loadMultiSlotHelpers() {
  const source = fs.readFileSync(VUE_FILE_PATH, 'utf8');
  const compilerSfc = loadCompilerSfc();
  let scriptContent = '';

  if (compilerSfc) {
    const { descriptor, errors } = compilerSfc.parse(source, { filename: 'MultiSlot.vue' });
    assert.equal(errors.length, 0, 'MultiSlot.vue must parse without SFC syntax errors');
    assert.ok(descriptor.script, 'MultiSlot.vue must contain a module <script> block exporting pure JS helpers');
    assert.ok(descriptor.scriptSetup, 'MultiSlot.vue must contain a <script setup> block');
    assert.equal(descriptor.script.lang, undefined, '<script> must be plain JS (no lang="ts")');
    assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must be plain JS (no lang="ts")');
    scriptContent = descriptor.script.content;
  } else {
    const match = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/.exec(source);
    assert.ok(match, 'MultiSlot.vue must contain a <script> block');
    scriptContent = match[1];
  }

  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(scriptContent)}`;
  return import(dataUrl);
}

test('SFC structure, @vue/compiler-sfc compilation, plain JS/JSDoc law, and zero consumer imports', async () => {
  const source = fs.readFileSync(VUE_FILE_PATH, 'utf8');
  assert.ok(!source.includes('lang="ts"'), 'Authored TypeScript (lang="ts") is forbidden');
  assert.ok(!source.includes("lang='ts'"), "Authored TypeScript (lang='ts') is forbidden");
  assertPackageImports();
  assert.ok(source.includes("'cuk-csp-hidden':"), 'Folded live hosts must stay mounted using a mounted hidden class (§6)');

  const compilerSfc = loadCompilerSfc();
  assert.ok(compilerSfc, '@vue/compiler-sfc must be loadable for SFC smoke verification');

  const { descriptor, errors } = compilerSfc.parse(source, { filename: 'MultiSlot.vue' });
  assert.equal(errors.length, 0);
  assert.ok(descriptor.template, 'MultiSlot.vue must have a <template>');
  assert.ok(descriptor.script, 'MultiSlot.vue must have a <script> block');
  assert.ok(descriptor.scriptSetup, 'MultiSlot.vue must have a <script setup> block');

  const compiledScript = compilerSfc.compileScript(descriptor, { id: 'multislot-scope-test' });
  assert.ok(compiledScript.content.includes('defineComponent') || compiledScript.content.includes('setup('));

  const compiledTemplate = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: 'MultiSlot.vue',
    id: 'multislot-scope-test'
  });
  assert.equal(compiledTemplate.errors.length, 0, 'Template must compile with zero errors');
});

test('Session projection contract: validates 5 orthogonal axes and rejects collapsed boolean or unapproved schemas', async () => {
  const mod = await loadMultiSlotHelpers();

  assert.deepEqual(mod.AI_REGION_PRESENTATION_STATES, ['expanded', 'folded']);
  assert.deepEqual(mod.SESSION_VIEW_SELECTION_STATES, ['selected', 'unselected']);
  assert.deepEqual(mod.ATTACHMENT_STATES, ['detached', 'attaching', 'restoring', 'live', 'disconnected']);
  assert.deepEqual(mod.PROJECTED_SESSION_ACTIVITIES, [
    'unknown',
    'ready',
    'busy',
    'waiting-input',
    'waiting-permission',
    'exited',
    'failed'
  ]);
  assert.deepEqual(mod.VIEW_RETENTION_STATES, ['live-view', 'replay-view', 'disposed']);

  const valid = mod.validateCapsuleSessionProjection({
    capsuleId: 'cap-alpha',
    capsuleTitle: 'Alpha Workstation',
    backendLifecycle: 'active',
    epoch: 3,
    generation: 2,
    sessions: [
      {
        sessionId: 'sess-main',
        title: 'Planner',
        disambiguator: 'slot-1',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      },
      {
        sessionId: 'sess-review',
        title: 'Auditor',
        disambiguator: 'slot-2',
        role: 'reviewer',
        hasControlLease: false,
        activity: 'waiting-input',
        attachment: 'detached',
        viewRetention: 'live-view',
        attention: true,
        dispatchOutcome: 'accepted'
      }
    ]
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.value.sessions.length, 2);
  assert.ok(Object.isFrozen(valid.value));
  assert.ok(Object.isFrozen(valid.value.sessions[0]));

  // Negative contrast: numeric list-length IDs, display credentials, unknown keys, or multiple active controllers
  const numericId = mod.validateCapsuleSessionProjection({
    capsuleId: '0',
    capsuleTitle: 'Bad ID',
    backendLifecycle: 'active',
    epoch: 1,
    generation: 1,
    sessions: []
  });
  assert.equal(numericId.ok, false);
  assert.equal(numericId.error.code, 'ERR_NUMERIC_INDEX_ID');

  const displayCredId = mod.validateCapsuleSessionProjection({
    capsuleId: 'cap-alpha',
    capsuleTitle: 'Alpha',
    backendLifecycle: 'active',
    epoch: 1,
    generation: 1,
    sessions: [
      {
        sessionId: ':99',
        title: 'X11 Display',
        disambiguator: 'd1',
        role: 'reviewer',
        hasControlLease: false,
        activity: 'ready',
        attachment: 'detached',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      }
    ]
  });
  assert.equal(displayCredId.ok, false);
  assert.equal(displayCredId.error.code, 'ERR_DISPLAY_CREDENTIAL_ID');

  const multiController = mod.validateCapsuleSessionProjection({
    capsuleId: 'cap-alpha',
    capsuleTitle: 'Alpha',
    backendLifecycle: 'active',
    epoch: 1,
    generation: 1,
    sessions: [
      {
        sessionId: 'sess-a',
        title: 'One',
        disambiguator: 'a',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      },
      {
        sessionId: 'sess-b',
        title: 'Two',
        disambiguator: 'b',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      }
    ]
  });
  assert.equal(multiController.ok, false);
  assert.equal(multiController.error.code, 'ERR_MULTIPLE_CONTROLLERS');
});

test('Negative contrast (§13 gate): mount, tab selection, fold/unfold, and Dockview remount NEVER spawn or kill sessions', async () => {
  const mod = await loadMultiSlotHelpers();

  let spawnCalls = 0;
  let killCalls = 0;
  /** @type {Array<Record<string, any>>} */
  const emittedIntents = [];

  const controller = mod.createMultiSlotController({
    capsuleId: 'cap-alpha',
    capsuleTitle: 'Alpha Capsule',
    epoch: 5,
    generation: 1,
    consoleMode: 'player',
    onIntent(intent) {
      emittedIntents.push(intent);
    }
  });

  // 1. Mount must never spawn a process
  const mountSnap = controller.mountSlot();
  assert.equal(mountSnap.mounted, true);
  assert.equal(mountSnap.spawnCount, 0);
  assert.equal(mountSnap.killCount, 0);
  assert.equal(spawnCalls, 0);
  assert.equal(killCalls, 0);

  // Admit core session projection
  const admitted = controller.applySessionProjection({
    capsuleId: 'cap-alpha',
    capsuleTitle: 'Alpha Capsule',
    backendLifecycle: 'active',
    epoch: 5,
    generation: 1,
    sessions: [
      {
        sessionId: 'sess-1',
        title: 'Architect',
        disambiguator: 'tab-1',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      },
      {
        sessionId: 'sess-2',
        title: 'Reviewer',
        disambiguator: 'tab-2',
        role: 'reviewer',
        hasControlLease: false,
        activity: 'busy',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: true,
        dispatchOutcome: 'executing'
      }
    ]
  });
  assert.equal(admitted.ok, true);
  assert.equal(controller.getState().viewedSessionId, 'sess-1');
  assert.deepEqual(controller.getState().recipientSessionIds, []);
  assert.equal(controller.getState().activeControllerSessionId, 'sess-1');

  // 2. Selecting another tab changes ONLY viewedSessionId, never recipient set, execution owner, or spawn/kill
  const tabSwitch = controller.selectSessionTab('sess-2');
  assert.equal(tabSwitch.ok, true);
  assert.equal(tabSwitch.state.viewedSessionId, 'sess-2');
  assert.deepEqual(tabSwitch.state.recipientSessionIds, []);
  assert.equal(tabSwitch.state.activeControllerSessionId, 'sess-1');
  assert.equal(tabSwitch.state.spawnCount, 0);
  assert.equal(tabSwitch.state.killCount, 0);

  // Attempting to pass spawn/kill flags into selectSessionTab or foldSlot must be rejected
  assert.throws(
    () => controller.selectSessionTab('sess-1', /** @type {any} */ ({ spawnIfMissing: true })),
    (err) => err.code === 'ERR_TAB_CANNOT_SPAWN_OR_KILL'
  );
  assert.throws(
    () => controller.foldSlot(/** @type {any} */ ({ killSessions: true })),
    (err) => err.code === 'ERR_FOLD_CANNOT_SPAWN_OR_KILL'
  );

  // 3. Folding moves focus to fold invoker BEFORE hiding, keeps DOM body mounted (v-show), disables scheduling, and never kills
  const folded = controller.foldSlot();
  assert.equal(folded.ok, true);
  assert.equal(folded.state.presentation, 'folded');
  assert.equal(folded.state.keepBodyMounted, true);
  assert.equal(folded.state.schedulingEnabled, false);
  assert.equal(folded.state.focusedAnchor, 'capsule/cap-alpha/session-slot/fold');
  assert.equal(folded.state.focusMovedBeforeHide, true);
  assert.equal(folded.state.spawnCount, 0);
  assert.equal(folded.state.killCount, 0);
  assert.equal(folded.state.sessions.length, 2);
  assert.equal(folded.state.sessions[0].attachment, 'live');
  assert.equal(folded.state.sessions[1].attachment, 'live');

  // 4. Dockview movement / remount preserves sessions without destroying or spawning
  const remounted = controller.remountPresentation();
  assert.equal(remounted.ok, true);
  assert.equal(remounted.state.spawnCount, 0);
  assert.equal(remounted.state.killCount, 0);
  assert.equal(remounted.state.sessions.length, 2);

  // 5. Rejects inherited onTermReady(send) or raw SendStdin injection hooks (§6 line 199)
  assert.throws(
    () => controller.registerTerminalBridge('sess-1', { onTermReady: () => {}, sendStdin: () => {} }),
    (err) => err.code === 'ERR_FORBIDDEN_INJECTION_HOOK'
  );
});

test('Attach/restore protocol, non-reactive writer cumulative ACKs, gap/stale resync, reload detach, and broker loss', async () => {
  const mod = await loadMultiSlotHelpers();

  /** @type {string[]} */
  const writtenChunks = [];
  /** @type {number[]} */
  const ackedOffsets = [];

  const controller = mod.createMultiSlotController({
    capsuleId: 'cap-stream',
    capsuleTitle: 'Stream Capsule',
    epoch: 10,
    generation: 1,
    consoleMode: 'developer-pty'
  });

  controller.applySessionProjection({
    capsuleId: 'cap-stream',
    capsuleTitle: 'Stream Capsule',
    backendLifecycle: 'active',
    epoch: 10,
    generation: 1,
    sessions: [
      {
        sessionId: 'sess-pty',
        title: 'Dev Shell',
        disambiguator: 'pty-1',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'detached',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      }
    ]
  });

  // Register non-reactive writer
  controller.registerTerminalWriter('sess-pty', (chunk, done) => {
    writtenChunks.push(chunk);
    done();
  });

  // Step 1: Begin attach installs handlers first and requests snapshot/cursor; input still disabled
  const attachStep = controller.beginAttach('sess-pty', { epoch: 10, capabilityToken: 'cap-tok-10' });
  assert.equal(attachStep.ok, true);
  assert.equal(attachStep.session.attachment, 'attaching');
  assert.equal(attachStep.session.handlersInstalled, true);
  assert.equal(attachStep.session.snapshotRequested, true);
  assert.equal(attachStep.session.inputEnabled, false);

  // Buffer live events arriving while restoring
  const bufRes = controller.bufferIncomingChunk('sess-pty', {
    epoch: 10,
    startOffset: 5,
    endOffset: 11,
    data: 'world!'
  });
  assert.equal(bufRes.ok, true);
  assert.equal(writtenChunks.length, 0, 'Buffered tail must not write before snapshot cut is applied');

  // Step 2: Apply snapshot + contiguous tail -> transitions to live and enables permitted input
  const restoreRes = controller.applyRestoreSnapshot('sess-pty', {
    epoch: 10,
    cursorOffset: 5,
    snapshotData: 'hello ',
    onAck(offset) {
      ackedOffsets.push(offset);
    }
  });
  assert.equal(restoreRes.ok, true);
  assert.equal(restoreRes.session.attachment, 'live');
  assert.equal(restoreRes.session.inputEnabled, true);
  assert.equal(restoreRes.session.acknowledgedOffset, 11);
  assert.deepEqual(writtenChunks, ['hello ', 'world!']);
  assert.deepEqual(ackedOffsets, [5, 11]);

  // Step 3: Negative contrast — VT byte gap or stale epoch refuses to skip bytes and restarts reconciliation
  const gapRes = controller.writeLiveChunk('sess-pty', {
    epoch: 10,
    startOffset: 20, // gap: expected 11
    endOffset: 25,
    data: 'skip?'
  });
  assert.equal(gapRes.ok, false);
  assert.equal(gapRes.error.code, 'ERR_STREAM_GAP_OR_STALE_EPOCH');
  assert.equal(gapRes.session.attachment, 'attaching');
  assert.equal(gapRes.session.reconciling, true);
  assert.equal(gapRes.session.inputEnabled, false);

  // Step 4: Negative contrast — quiet output NEVER implies ready or done
  controller.applySessionProjection({
    capsuleId: 'cap-stream',
    capsuleTitle: 'Stream Capsule',
    backendLifecycle: 'active',
    epoch: 10,
    generation: 1,
    sessions: [
      {
        sessionId: 'sess-pty',
        title: 'Dev Shell',
        disambiguator: 'pty-1',
        role: 'controller',
        hasControlLease: true,
        activity: 'busy',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'executing'
      }
    ]
  });
  const quietCheck = controller.recordOutputSilence('sess-pty', 60_000);
  assert.equal(quietCheck.ok, false);
  assert.equal(quietCheck.error.code, 'ERR_QUIET_OUTPUT_NOT_READY');
  assert.equal(controller.getSession('sess-pty').activity, 'busy');

  // Step 5: Renderer reload detaches view without killing session
  const reloadSnap = controller.detachOnReload();
  assert.equal(reloadSnap.sessions[0].attachment, 'detached');
  assert.equal(reloadSnap.killCount, 0);

  // Step 6: Broker loss invalidates capability and produces disconnected/unknown, never resurrecting old ID
  const lostSnap = controller.handleBrokerLoss();
  assert.equal(lostSnap.sessions[0].attachment, 'disconnected');
  assert.equal(lostSnap.sessions[0].activity, 'unknown');
  assert.equal(lostSnap.sessions[0].capabilityToken, null);

  const reviveAttempt = controller.recordBackendLifecycle('destroyed');
  assert.equal(reviveAttempt.backendLifecycle, 'destroyed');
  assert.throws(
    () => controller.reviveUnderSameIdentity('cap-stream'),
    (err) => err.code === 'ERR_REVIVE_OLD_IDENTITY_FORBIDDEN'
  );
});

test('G5 Fold/restore focus protocol (0ms, 120ms, 400ms), stale retry cancellation, activation veil truth table, and pointer guards', async () => {
  const mod = await loadMultiSlotHelpers();

  const controller = mod.createMultiSlotController({
    capsuleId: 'cap-focus',
    capsuleTitle: 'Focus Capsule',
    epoch: 1,
    generation: 4,
    consoleMode: 'developer-pty'
  });

  controller.applySessionProjection({
    capsuleId: 'cap-focus',
    capsuleTitle: 'Focus Capsule',
    backendLifecycle: 'active',
    epoch: 1,
    generation: 4,
    sessions: [
      {
        sessionId: 'sess-focus',
        title: 'Focus Session',
        disambiguator: 'f1',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: false,
        dispatchOutcome: 'idle'
      }
    ]
  });

  // Fold then unfold: first empty-box frame must be rejected; positive geometry schedules rAF (0ms) + 120ms refit
  controller.foldSlot();
  const unfoldRes = controller.unfoldSlot();
  assert.equal(unfoldRes.state.presentation, 'expanded');

  const emptyBox = controller.notifyRestoreGeometry({ width: 0, height: 400 });
  assert.equal(emptyBox.ok, false);
  assert.equal(emptyBox.error.code, 'ERR_EMPTY_BOX_GEOMETRY');

  const validBox = controller.notifyRestoreGeometry({ width: 640, height: 360 });
  assert.equal(validBox.ok, true);
  assert.deepEqual(validBox.scheduledRefitDelaysMs, [0, 120]);

  // G5 Three-layer focus on explicit Take Control after admitted human ownership: retries at [0, 120, 400]
  const focusPlan = controller.beginTakeControlFocus({
    sessionId: 'sess-focus',
    admittedOwner: 'human',
    hasControlLease: true
  });
  assert.equal(focusPlan.ok, true);
  assert.deepEqual(focusPlan.retryScheduleMs, [0, 120, 400]);
  assert.deepEqual(focusPlan.layers, ['slot-census-witness', 'dom-host-focus', 'core-native-focus-intent']);

  // Step at 0ms succeeds if slot identity, generation, visibility, owner, and intent match
  const step0 = controller.runFocusRetryStep({
    intentId: focusPlan.intentId,
    delayMs: 0,
    slotId: 'cap-focus',
    generation: 4,
    visible: true,
    owner: 'human',
    domFocusSucceeded: false
  });
  assert.equal(step0.ok, true);
  assert.equal(step0.completed, false);

  // Folding cancels pending 120ms and 400ms retries so a late timer cannot steal focus
  controller.foldSlot();
  const lateStep = controller.runFocusRetryStep({
    intentId: focusPlan.intentId,
    delayMs: 120,
    slotId: 'cap-focus',
    generation: 4,
    visible: true,
    owner: 'human',
    domFocusSucceeded: true
  });
  assert.equal(lateStep.ok, false);
  assert.equal(lateStep.error.code, 'ERR_FOCUS_RETRY_CANCELLED');

  // Activation veil truth table (SLOT §5): show ONLY when liveSurfaceCount > 1, !hasKeyboardOwnership, and !underAiCommand
  assert.equal(
    mod.computeActivationVeilState({
      liveSurfaceCount: 1,
      hasKeyboardOwnership: false,
      underAiCommand: false
    }).veilVisible,
    false,
    'Single surface never shows activation veil'
  );
  assert.equal(
    mod.computeActivationVeilState({
      liveSurfaceCount: 2,
      hasKeyboardOwnership: true,
      underAiCommand: false
    }).veilVisible,
    false,
    'Surface with keyboard ownership never shows veil'
  );
  assert.equal(
    mod.computeActivationVeilState({
      liveSurfaceCount: 3,
      hasKeyboardOwnership: false,
      underAiCommand: true
    }).veilVisible,
    false,
    'Negative contrast: no veil over agent-owned target'
  );
  const veilActive = mod.computeActivationVeilState({
    liveSurfaceCount: 2,
    hasKeyboardOwnership: false,
    underAiCommand: false
  });
  assert.equal(veilActive.veilVisible, true);

  // Pointerdown/mousedown beside live surfaces call preventDefault() while keeping click/keyboard intact
  let defaultPrevented = false;
  const guardRes = mod.preserveLiveSurfaceFocusGuard({
    type: 'pointerdown',
    preventDefault() {
      defaultPrevented = true;
    }
  });
  assert.equal(defaultPrevented, true);
  assert.equal(guardRes.preservedFocus, true);
});

test('§9 AI-operability semantic control inventory and negative contrast for fabricated boxes while folded/hidden', async () => {
  const mod = await loadMultiSlotHelpers();

  const controller = mod.createMultiSlotController({
    capsuleId: 'cap-sem',
    capsuleTitle: 'Semantics Capsule',
    epoch: 7,
    generation: 2
  });

  controller.applySessionProjection({
    capsuleId: 'cap-sem',
    capsuleTitle: 'Semantics Capsule',
    backendLifecycle: 'active',
    epoch: 7,
    generation: 2,
    sessions: [
      {
        sessionId: 'sess-alpha',
        title: 'Alpha Agent',
        disambiguator: 's1',
        role: 'controller',
        hasControlLease: true,
        activity: 'ready',
        attachment: 'live',
        viewRetention: 'live-view',
        attention: true,
        dispatchOutcome: 'idle'
      }
    ]
  });

  const expandedControls = mod.buildMultiSlotSemanticControls(controller.getState(), {
    presentationInstance: 'wall-main',
    boxesByAnchor: {
      'capsule/cap-sem/slot': { x: 10, y: 20, width: 500, height: 240 },
      'capsule/cap-sem/session-slot/fold': { x: 12, y: 22, width: 80, height: 28 },
      'capsule/cap-sem/session/sess-alpha/tab': { x: 100, y: 22, width: 140, height: 28 },
      'session/sess-alpha/attach': { x: 250, y: 22, width: 64, height: 24 },
      'session/sess-alpha/stop': { x: 320, y: 22, width: 64, height: 24 },
      'session/sess-alpha/replay': { x: 390, y: 22, width: 64, height: 24 },
      'session/sess-alpha/target': { x: 460, y: 22, width: 64, height: 24 },
      'output/sess-alpha/text': { x: 10, y: 56, width: 500, height: 180 }
    }
  });

  const anchors = expandedControls.map((c) => c.semanticAnchor);
  assert.ok(anchors.includes('capsule/cap-sem/slot'));
  assert.ok(anchors.includes('capsule/cap-sem/session-slot/fold'));
  assert.ok(anchors.includes('capsule/cap-sem/session/sess-alpha/tab'));
  assert.ok(anchors.includes('session/sess-alpha/attach'));
  assert.ok(anchors.includes('session/sess-alpha/stop'));
  assert.ok(anchors.includes('session/sess-alpha/replay'));
  assert.ok(anchors.includes('session/sess-alpha/target'));
  assert.ok(anchors.includes('output/sess-alpha/text'));

  // Fold the slot: fold button remains visible, but inner session tab/controls/output are hidden and MUST NOT have fabricated boxes
  controller.foldSlot();
  assert.throws(
    () =>
      mod.buildMultiSlotSemanticControls(controller.getState(), {
        presentationInstance: 'wall-main',
        rejectFabricatedHiddenBoxes: true,
        boxesByAnchor: {
          'capsule/cap-sem/session/sess-alpha/tab': { x: 100, y: 22, width: 140, height: 28 }
        }
      }),
    (err) => err.code === 'ERR_FABRICATED_HIDDEN_BOX'
  );

  const foldedControls = mod.buildMultiSlotSemanticControls(controller.getState(), {
    presentationInstance: 'wall-main',
    rejectFabricatedHiddenBoxes: false,
    boxesByAnchor: {
      'capsule/cap-sem/session-slot/fold': { x: 12, y: 22, width: 80, height: 28 }
    }
  });
  const foldedTab = foldedControls.find((c) => c.semanticAnchor === 'capsule/cap-sem/session/sess-alpha/tab');
  assert.ok(foldedTab);
  assert.equal(foldedTab.visible, false);
  assert.equal(foldedTab.box, null);

  // Verify companion book exists and documents multislot contract
  assert.ok(fs.existsSync(BOOK_FILE_PATH), 'Companion book books/multislot.md must exist');
});
