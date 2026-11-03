import { assertPackageImports } from './publication-rules.js';
/**
 * @fileoverview Behavioral oracle and negative-contrast test suite for TargetPicker.vue.
 * Covers architecture contract §3, §4, §6, §7 (G3, G4), §8, §9, and §13:
 * "Target picker | TargetPicker.vue, TargetPicker.test.js, books/target-picker.md | Core capability projection; duplicate/unknown recipient refuses"
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SFC_PATH = resolve(__dirname, './fixtures/retired/src/orchestrator/TargetPicker.vue');

const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

/** @type {string} */
let sfcSource = '';
/** @type {any} */
let pickerModule = null;

/**
 * Helper to create a valid projected session capability descriptor with overrides.
 *
 * @param {Record<string, any>} [overrides]
 */
function makeSessionCapability(overrides = {}) {
  return {
    sessionId: 'sid-alpha',
    capsuleId: 'cap-alpha',
    workspaceId: 'ws-main',
    slotId: 'slot-alpha',
    generation: 1,
    epoch: 7,
    activity: 'ready',
    attachment: 'live',
    visibleInWorkspace: true,
    supportsQueue: false,
    maxQueueDepth: 0,
    currentQueueDepth: 0,
    inFlightLock: false,
    ownership: 'human',
    adapterProtocol: 'AUSENTE',
    ...overrides
  };
}

before(async () => {
  sfcSource = await readFile(SFC_PATH, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(sfcSource, { filename: 'TargetPicker.vue' });
  assert.equal(errors.length, 0, `SFC parse errors: ${errors.map((e) => e.message).join('; ')}`);
  assert.ok(descriptor.script, 'TargetPicker.vue must include a <script> block exporting pure helpers');

  const encoded = Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  pickerModule = await import(`data:text/javascript;base64,${encoded}`);
});

describe('TargetPicker.vue — SFC Compilation & Structural Contract (§3, §8, §9, §13)', () => {
  it('parses and compiles <script>, <script setup>, and <template> via @vue/compiler-sfc with zero errors and no authored TypeScript', () => {
    const { descriptor, errors } = compilerSfc.parse(sfcSource, { filename: 'TargetPicker.vue' });
    assert.equal(errors.length, 0);
    assert.ok(descriptor.script, 'Expected <script> block for exported pure helpers');
    assert.ok(descriptor.scriptSetup, 'Expected <script setup> block for component logic');
    assert.ok(descriptor.template, 'Expected <template> block');

    // Enforce plain JS with JSDoc (no lang="ts") and no consumer imports
    assert.equal(descriptor.script.lang, undefined, '<script> must not use lang="ts"');
    assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');
    assertPackageImports();

    const compiledScript = compilerSfc.compileScript(descriptor, { id: 'target-picker-scope' });
    assert.ok(compiledScript.content.length > 0);

    const compiledTemplate = compilerSfc.compileTemplate({
      source: descriptor.template.content,
      filename: 'TargetPicker.vue',
      id: 'target-picker-scope',
      compilerOptions: {
        bindingMetadata: compiledScript.bindings
      }
    });
    assert.equal(
      compiledTemplate.errors.length,
      0,
      `Template compile errors: ${compiledTemplate.errors.map((e) => (typeof e === 'string' ? e : e.message)).join('; ')}`
    );

    // Verify §9 semantic control anchors exist in template
    const tpl = descriptor.template.content;
    assert.match(tpl, /drawer\/targets\/all/);
    assert.match(tpl, /drawer\/targets\/clear/);
    assert.match(tpl, /drawer\/targets\//);
    assert.match(tpl, /role="checkbox"/);
    assert.match(tpl, /role="button"/);
    assert.match(tpl, /aria-label/);
  });
});

describe('TargetPicker — Core Capability Projection & Closed Schema Validation (§4, §6, §7 G3/G4)', () => {
  it('validates capability projection batches (fail-closed), clones/freezes accepted data, and defaults adapterProtocol to AUSENTE', () => {
    const {
      validateTargetCapabilityProjection,
      projectTargetCapabilityRow
    } = pickerModule;

    const rawInput = [
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1', adapterProtocol: undefined }),
      makeSessionCapability({
        sessionId: 'sid-2',
        capsuleId: 'cap-beta',
        slotId: 'slot-2',
        activity: 'waiting-input'
      })
    ];
    // Remove undefined key so we test default assignment to 'AUSENTE'
    delete rawInput[0].adapterProtocol;

    const res = validateTargetCapabilityProjection(rawInput, { expectedEpoch: 7 });
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.descriptors.length, 2);
      assert.equal(res.descriptors[0].adapterProtocol, 'AUSENTE');
      assert.equal(Object.isFrozen(res.descriptors[0]), true);

      // Mutating caller input object must not affect accepted descriptor (§4 alias protection)
      rawInput[0].activity = 'failed';
      assert.equal(res.descriptors[0].activity, 'ready');
      assert.throws(() => {
        /** @type {any} */ (res.descriptors[0]).activity = 'exited';
      }, TypeError);

      const row = projectTargetCapabilityRow(res.descriptors[0], { workspaceId: 'ws-main' });
      assert.equal(row.eligible, true);
      assert.equal(row.admissionMode, 'dispatch');
      assert.equal(row.statusBadge, 'Ready');
      assert.equal(row.semanticAnchor, 'drawer/targets/sid-1');
    }
  });

  it('rejects malformed capability batches: unknown keys, bare numeric IDs, duplicate sessionId, duplicate slot@generation, or stale epoch', () => {
    const { validateTargetCapabilityProjection } = pickerModule;

    // Unknown property key
    const unknownKey = validateTargetCapabilityProjection([
      { ...makeSessionCapability(), unreviewedField: 1 }
    ]);
    assert.equal(unknownKey.ok, false);
    assert.equal(unknownKey.code, 'SCHEMA_UNKNOWN_KEY');

    // Bare numeric list-index ID forbidden (§6, §9)
    const numericId = validateTargetCapabilityProjection([
      makeSessionCapability({ sessionId: '0' })
    ]);
    assert.equal(numericId.ok, false);
    assert.equal(numericId.code, 'SCHEMA_NUMERIC_INDEX_FORBIDDEN');

    // Duplicate sessionId in batch
    const dupSession = validateTargetCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-dup', slotId: 'slot-1' }),
      makeSessionCapability({ sessionId: 'sid-dup', slotId: 'slot-2' })
    ]);
    assert.equal(dupSession.ok, false);
    assert.equal(dupSession.code, 'SCHEMA_DUPLICATE_SESSION_ID');

    // Duplicate slot@generation in batch
    const dupSlot = validateTargetCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-a', slotId: 'slot-shared', generation: 2 }),
      makeSessionCapability({ sessionId: 'sid-b', slotId: 'slot-shared', generation: 2 })
    ]);
    assert.equal(dupSlot.ok, false);
    assert.equal(dupSlot.code, 'SCHEMA_DUPLICATE_SLOT_GENERATION');

    // Stale epoch rejected
    const staleEpoch = validateTargetCapabilityProjection(
      [makeSessionCapability({ epoch: 4 })],
      { expectedEpoch: 7 }
    );
    assert.equal(staleEpoch.ok, false);
    assert.equal(staleEpoch.code, 'PROJECTION_STALE_EPOCH');
  });

  it('projects G3/G4 eligibility accurately across ready, waiting-input, busy, queued, locked, and non-live states', () => {
    const { projectTargetCapabilityRow, validateTargetCapabilityProjection } = pickerModule;

    const batch = validateTargetCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-ready', slotId: 'slot-1', activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-wait', slotId: 'slot-2', activity: 'waiting-input' }),
      makeSessionCapability({ sessionId: 'sid-busy-noq', slotId: 'slot-3', activity: 'busy', supportsQueue: false }),
      makeSessionCapability({
        sessionId: 'sid-busy-q-ok',
        slotId: 'slot-4',
        activity: 'busy',
        supportsQueue: true,
        maxQueueDepth: 4,
        currentQueueDepth: 1
      }),
      makeSessionCapability({
        sessionId: 'sid-busy-q-full',
        slotId: 'slot-5',
        activity: 'busy',
        supportsQueue: true,
        maxQueueDepth: 2,
        currentQueueDepth: 2
      }),
      makeSessionCapability({ sessionId: 'sid-perm', slotId: 'slot-6', activity: 'waiting-permission' }),
      makeSessionCapability({ sessionId: 'sid-disc', slotId: 'slot-7', activity: 'ready', attachment: 'disconnected' }),
      makeSessionCapability({ sessionId: 'sid-locked', slotId: 'slot-8', activity: 'ready', inFlightLock: true })
    ]);
    assert.equal(batch.ok, true);
    const byId = Object.fromEntries(batch.descriptors.map((d) => [d.sessionId, d]));

    assert.equal(projectTargetCapabilityRow(byId['sid-ready']).eligible, true);
    assert.equal(projectTargetCapabilityRow(byId['sid-wait']).eligible, true);

    const busyNoQ = projectTargetCapabilityRow(byId['sid-busy-noq'], { allowQueue: true });
    assert.equal(busyNoQ.eligible, false);
    assert.equal(busyNoQ.unavailableCode, 'G4_ACTIVITY_INELIGIBLE');

    const busyQDisabled = projectTargetCapabilityRow(byId['sid-busy-q-ok'], { allowQueue: false });
    assert.equal(busyQDisabled.eligible, false);

    const busyQEnabled = projectTargetCapabilityRow(byId['sid-busy-q-ok'], { allowQueue: true });
    assert.equal(busyQEnabled.eligible, true);
    assert.equal(busyQEnabled.admissionMode, 'queue');

    const busyQFull = projectTargetCapabilityRow(byId['sid-busy-q-full'], { allowQueue: true });
    assert.equal(busyQFull.eligible, false);
    assert.equal(busyQFull.unavailableCode, 'G3_QUEUE_FULL');

    const permRow = projectTargetCapabilityRow(byId['sid-perm']);
    assert.equal(permRow.eligible, false);
    assert.equal(permRow.unavailableCode, 'G4_ACTIVITY_INELIGIBLE');

    const discRow = projectTargetCapabilityRow(byId['sid-disc']);
    assert.equal(discRow.eligible, false);
    assert.equal(discRow.unavailableCode, 'G4_ATTACHMENT_NOT_LIVE');

    const lockedRow = projectTargetCapabilityRow(byId['sid-locked']);
    assert.equal(lockedRow.eligible, false);
    assert.equal(lockedRow.unavailableCode, 'G3_SLOT_BUSY_LOCKED');
  });
});

describe('TargetPicker — Negative Contrast: Duplicate, Unknown, Prefix & Ineligible Recipients Refuse (§6, §7, §9, §13)', () => {
  it('refuses duplicate recipient IDs before any state mutation', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-alpha', slotId: 'slot-1' }),
      makeSessionCapability({ sessionId: 'sid-beta', slotId: 'slot-2' })
    ]);

    // Establish initial valid selection
    const first = picker.selectOne('sid-alpha');
    assert.equal(first.ok, true);
    assert.deepEqual(picker.getSnapshot().selectedTargetIds, ['sid-alpha']);

    // Attempt duplicate recipient selection
    const dupRes = picker.selectMany(['sid-beta', 'sid-beta']);
    assert.equal(dupRes.ok, false);
    assert.equal(dupRes.code, 'TARGET_DUPLICATE_ID');

    // Prior valid selection remains intact; lastRefusal is recorded
    const snap = picker.getSnapshot();
    assert.deepEqual(snap.selectedTargetIds, ['sid-alpha']);
    assert.equal(snap.lastRefusal?.code, 'TARGET_DUPLICATE_ID');
  });

  it('refuses unknown recipients, prefix matches, and bare numeric index IDs', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-alpha-100', slotId: 'slot-1' })
    ]);

    // Unknown recipient in selectOne
    const unknownOne = picker.selectOne('sid-missing');
    assert.equal(unknownOne.ok, false);
    assert.equal(unknownOne.code, 'TARGET_UNKNOWN');

    // Prefix match attempt ('sid-alpha' when only 'sid-alpha-100' exists) must refuse (§6 no prefix matching)
    const prefixAttempt = picker.selectOne('sid-alpha');
    assert.equal(prefixAttempt.ok, false);
    assert.equal(prefixAttempt.code, 'TARGET_UNKNOWN');

    // Unknown recipient in selectMany
    const unknownMany = picker.selectMany(['sid-alpha-100', 'sid-ghost']);
    assert.equal(unknownMany.ok, false);
    assert.equal(unknownMany.code, 'TARGET_UNKNOWN');

    // Unknown recipient in toggleRecipient
    const unknownToggle = picker.toggleRecipient('sid-ghost');
    assert.equal(unknownToggle.ok, false);
    assert.equal(unknownToggle.code, 'TARGET_UNKNOWN');

    // Bare numeric index ID ('0') refuses with TARGET_INVALID_ID
    const numericSelect = picker.selectOne('0');
    assert.equal(numericSelect.ok, false);
    assert.equal(numericSelect.code, 'TARGET_INVALID_ID');

    assert.deepEqual(picker.getSnapshot().selectedTargetIds, []);
  });

  it('refuses ineligible recipients (busy, unknown, exited, failed, disconnected, wrong workspace)', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-ready', slotId: 'slot-1', activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-busy', slotId: 'slot-2', activity: 'busy' }),
      makeSessionCapability({ sessionId: 'sid-unknown', slotId: 'slot-3', activity: 'unknown' }),
      makeSessionCapability({ sessionId: 'sid-exited', slotId: 'slot-4', activity: 'exited' }),
      makeSessionCapability({ sessionId: 'sid-other-ws', slotId: 'slot-5', workspaceId: 'ws-secondary' })
    ]);

    const busyRes = picker.selectOne('sid-busy');
    assert.equal(busyRes.ok, false);
    assert.equal(busyRes.code, 'G4_ACTIVITY_INELIGIBLE');

    const unknownActRes = picker.toggleRecipient('sid-unknown');
    assert.equal(unknownActRes.ok, false);
    assert.equal(unknownActRes.code, 'G4_ACTIVITY_INELIGIBLE');

    const exitedRes = picker.selectMany(['sid-ready', 'sid-exited']);
    assert.equal(exitedRes.ok, false);
    assert.equal(exitedRes.code, 'G4_ACTIVITY_INELIGIBLE');

    const wrongWsRes = picker.selectOne('sid-other-ws');
    assert.equal(wrongWsRes.ok, false);
    assert.equal(wrongWsRes.code, 'TARGET_WRONG_WORKSPACE');

    assert.deepEqual(picker.getSnapshot().selectedTargetIds, []);
  });
});

describe('TargetPicker — Selection Modes ("One", "Many", "All", Clear), Empty-Never-Means-All & Review Invalidation (§7)', () => {
  it('disables Send when targets are empty (empty NEVER means all) and refuses freezeReviewTargets on empty selection', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSessionCapability({ sessionId: 'sid-2', slotId: 'slot-2' })
    ]);

    assert.equal(picker.getSnapshot().sendEnabled, false);
    const emptyReview = picker.freezeReviewTargets();
    assert.equal(emptyReview.ok, false);
    assert.equal(emptyReview.code, 'TARGETS_EMPTY');
  });

  it('expands "All" into explicit visible eligible workspace targets and invalidates review when a new session appears or basis changes', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1', visibleInWorkspace: true, activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-2', slotId: 'slot-2', visibleInWorkspace: true, activity: 'waiting-input' }),
      makeSessionCapability({ sessionId: 'sid-hidden', slotId: 'slot-3', visibleInWorkspace: false, activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-busy', slotId: 'slot-4', visibleInWorkspace: true, activity: 'busy' })
    ]);

    const allRes = picker.selectAllInWorkspace();
    assert.equal(allRes.ok, true);
    assert.deepEqual(allRes.targetIds, ['sid-1', 'sid-2']);

    const frozen = picker.freezeReviewTargets();
    assert.equal(frozen.ok, true);
    assert.equal(picker.getSnapshot().reviewValid, true);

    // Newly created visible session arrives while in "all" mode -> must NOT silently join; must invalidate review (§7)
    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1', visibleInWorkspace: true, activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-2', slotId: 'slot-2', visibleInWorkspace: true, activity: 'waiting-input' }),
      makeSessionCapability({ sessionId: 'sid-new', slotId: 'slot-5', visibleInWorkspace: true, activity: 'ready' })
    ]);

    const afterNewSession = picker.getSnapshot();
    assert.equal(afterNewSession.reviewValid, false);
    assert.equal(afterNewSession.lastInvalidation?.code, 'REVIEW_INVALIDATED_ALL_SCOPE_CHANGED');
    assert.deepEqual(afterNewSession.selectedTargetIds, ['sid-1', 'sid-2']);
  });

  it('invalidates active review when a frozen target changes capability basis or becomes ineligible', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1', activity: 'ready' })
    ]);
    picker.selectOne('sid-1');
    assert.equal(picker.freezeReviewTargets().ok, true);
    assert.equal(picker.getSnapshot().reviewValid, true);

    // Target transitions from ready to busy -> review invalidated immediately
    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1', activity: 'busy' })
    ]);
    const snap = picker.getSnapshot();
    assert.equal(snap.reviewValid, false);
    assert.equal(snap.lastInvalidation?.code, 'REVIEW_INVALIDATED_TARGET_INELIGIBLE');
  });
});

describe('TargetPicker — Independent Identities, Focus Preservation, Escape Key & Semantic Controls (§6, §7, §9)', () => {
  it('keeps checked recipient set strictly independent from viewed, focused, and controlling session identities', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1' }),
      makeSessionCapability({ sessionId: 'sid-2', slotId: 'slot-2' }),
      makeSessionCapability({ sessionId: 'sid-3', slotId: 'slot-3' })
    ]);

    picker.selectMany(['sid-1', 'sid-2']);
    picker.setViewedSession('sid-3');
    picker.setFocusedTerminalSession('sid-3');
    picker.setControllingSession('sid-2');

    const snap = picker.getSnapshot();
    assert.deepEqual(snap.selectedTargetIds, ['sid-1', 'sid-2']);
    assert.equal(snap.viewedSessionId, 'sid-3');
    assert.equal(snap.focusedTerminalSessionId, 'sid-3');
    assert.equal(snap.controllingSessionId, 'sid-2');
  });

  it('preserves live-surface focus on pointerdown/mousedown and enforces Escape key hierarchy without cancelling runs', () => {
    const { createTargetPickerState, preserveLiveSurfaceFocus } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7, pickerOpen: true });

    let prevented = 0;
    preserveLiveSurfaceFocus({
      type: 'pointerdown',
      preventDefault() {
        prevented += 1;
      }
    });
    preserveLiveSurfaceFocus({
      type: 'mousedown',
      preventDefault() {
        prevented += 1;
      }
    });
    assert.equal(prevented, 2);

    // Terminal keystrokes never bubble into picker shortcuts
    const termKey = picker.handleKeyDown({ key: 'Escape', fromTerminal: true });
    assert.equal(termKey.action, 'ignore-terminal-key');
    assert.equal(termKey.cancelRun, false);

    // First Escape closes open picker without cancelling any run
    const escPicker = picker.handleKeyDown({ key: 'Escape' });
    assert.equal(escPicker.action, 'close-picker');
    assert.equal(escPicker.cancelRun, false);
    assert.equal(picker.getSnapshot().pickerOpen, false);

    // Second Escape when review is active cancels review without cancelling any run
    picker.loadCapabilityProjection([makeSessionCapability({ sessionId: 'sid-1', slotId: 'slot-1' })]);
    picker.selectOne('sid-1');
    picker.freezeReviewTargets();
    const escReview = picker.handleKeyDown({ key: 'Escape' });
    assert.equal(escReview.action, 'cancel-review');
    assert.equal(escReview.cancelRun, false);
    assert.equal(picker.getSnapshot().reviewValid, false);
  });

  it('exports §9 semantic control inventory with stable anchors, roles, accessible names, and null boxes when hidden', () => {
    const { createTargetPickerState } = pickerModule;
    const picker = createTargetPickerState({ workspaceId: 'ws-main', epoch: 7 });

    picker.loadCapabilityProjection([
      makeSessionCapability({ sessionId: 'sid-alpha', slotId: 'slot-1', activity: 'ready' }),
      makeSessionCapability({ sessionId: 'sid-beta', slotId: 'slot-2', activity: 'busy' })
    ]);
    picker.selectOne('sid-alpha');

    const hiddenControls = picker.getSemanticControls({ visible: false, materialized: true, inDom: true });
    assert.ok(hiddenControls.every((c) => c.box === null), 'Hidden controls must never fabricate a non-null box');

    const visibleControls = picker.getSemanticControls({
      visible: true,
      materialized: true,
      inDom: true,
      boxesByAnchor: {
        'drawer/targets/all': { x: 10.2, y: 20.8, width: 120.4, height: 28.1 },
        'drawer/targets/clear': { x: 136, y: 21, width: 96, height: 28 },
        'drawer/targets/sid-alpha': { x: 10, y: 56, width: 180, height: 32 },
        'drawer/targets/sid-beta': { x: 198, y: 56, width: 180, height: 32 }
      }
    });

    const byAnchor = Object.fromEntries(visibleControls.map((c) => [c.semanticAnchor, c]));
    assert.equal(byAnchor['drawer/targets/all'].role, 'button');
    assert.equal(byAnchor['drawer/targets/all'].accessibleName, 'Select all in workspace');
    assert.deepEqual(byAnchor['drawer/targets/all'].box, { x: 10, y: 21, width: 120, height: 28 });

    assert.equal(byAnchor['drawer/targets/clear'].role, 'button');
    assert.equal(byAnchor['drawer/targets/clear'].accessibleName, 'Clear targets');
    assert.equal(byAnchor['drawer/targets/clear'].state.disabled, false);

    assert.equal(byAnchor['drawer/targets/sid-alpha'].role, 'checkbox');
    assert.equal(byAnchor['drawer/targets/sid-alpha'].state.checked, true);
    assert.equal(byAnchor['drawer/targets/sid-alpha'].state.disabled, false);

    assert.equal(byAnchor['drawer/targets/sid-beta'].role, 'checkbox');
    assert.equal(byAnchor['drawer/targets/sid-beta'].state.checked, false);
    assert.equal(byAnchor['drawer/targets/sid-beta'].state.disabled, true);
    assert.match(String(byAnchor['drawer/targets/sid-beta'].state.unavailableReason), /busy/);
  });
});
