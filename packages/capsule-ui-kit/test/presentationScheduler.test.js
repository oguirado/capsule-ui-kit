import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEDULER_REASONS,
  validateFrozenBudget,
  evaluateDrawableEligibility,
  createPresentationScheduler
} from '../src/surfaces/presentationScheduler.js';

function makeFrozenBudget(overrides = {}) {
  return Object.freeze({
    maxDrawsPerTick: 2,
    maxUploadBytesPerTick: 4096,
    maxPresentMsPerTick: 8,
    maxWarmResourcesPerSurface: 2,
    maxDrainSteps: 4,
    ...overrides
  });
}

function makeDrawableState(overrides = {}) {
  return {
    panelOpen: true,
    panelSelected: true,
    folded: false,
    width: 1280.4,
    height: 720.2,
    x: 10.2,
    y: 20.6,
    viewportIntersecting: true,
    windowPresentationAllowed: true,
    ...overrides
  };
}

test('validateFrozenBudget accepts valid frozen budget and rejects missing, unfrozen, or unknown limits', () => {
  const valid = makeFrozenBudget();
  const resValid = validateFrozenBudget(valid);
  assert.equal(resValid.ok, true);

  // Missing budget blocks qualification
  const resNull = validateFrozenBudget(null);
  assert.equal(resNull.ok, false);
  assert.equal(resNull.reason, SCHEDULER_REASONS.INVALID_BUDGET);

  // Unfrozen budget rejected when freeze is required
  const unfrozen = {
    maxDrawsPerTick: 2,
    maxUploadBytesPerTick: 4096,
    maxPresentMsPerTick: 8,
    maxWarmResourcesPerSurface: 2,
    maxDrainSteps: 4
  };
  const resUnfrozen = validateFrozenBudget(unfrozen, { requireFrozen: true });
  assert.equal(resUnfrozen.ok, false);
  assert.equal(resUnfrozen.reason, SCHEDULER_REASONS.INVALID_BUDGET);

  // Unknown limit key rejected
  const unknownKey = Object.freeze({
    ...valid,
    unmeasuredHeuristicLimit: 99
  });
  const resUnknown = validateFrozenBudget(unknownKey);
  assert.equal(resUnknown.ok, false);
  assert.equal(resUnknown.reason, SCHEDULER_REASONS.INVALID_BUDGET);

  // Non-positive limit rejected
  const zeroDraws = makeFrozenBudget({ maxDrawsPerTick: 0 });
  const resZero = validateFrozenBudget(zeroDraws);
  assert.equal(resZero.ok, false);
  assert.equal(resZero.reason, SCHEDULER_REASONS.INVALID_BUDGET);
});

test('evaluateDrawableEligibility checks all 5 eligibility axes and returns rounded CSS box or null when hidden', () => {
  const eligible = evaluateDrawableEligibility(makeDrawableState());
  assert.equal(eligible.eligible, true);
  assert.deepEqual(eligible.reasons, []);
  assert.deepEqual(eligible.box, { x: 10, y: 21, width: 1280, height: 720 });

  // First empty-box frame (0x0) never supplies fake geometry
  const emptyBox = evaluateDrawableEligibility(makeDrawableState({ width: 0, height: 0 }));
  assert.equal(emptyBox.eligible, false);
  assert.equal(emptyBox.box, null);
  assert.ok(emptyBox.reasons.includes('NON_POSITIVE_SIZE'));

  // Folded, unselected, off-viewport, disallowed window presentation each fail eligibility
  const folded = evaluateDrawableEligibility(makeDrawableState({ folded: true }));
  assert.equal(folded.eligible, false);
  assert.equal(folded.box, null);
  assert.ok(folded.reasons.includes('FOLDED'));

  const unselected = evaluateDrawableEligibility(makeDrawableState({ panelSelected: false }));
  assert.equal(unselected.eligible, false);
  assert.equal(unselected.box, null);

  const offViewport = evaluateDrawableEligibility(makeDrawableState({ viewportIntersecting: false }));
  assert.equal(offViewport.eligible, false);
  assert.equal(offViewport.box, null);

  const disallowedWindow = evaluateDrawableEligibility(makeDrawableState({ windowPresentationAllowed: false }));
  assert.equal(disallowedWindow.eligible, false);
  assert.equal(disallowedWindow.box, null);
});

test('positive: coordinated fair scheduler replaces mailbox with newest frame and schedules round-robin under budget', () => {
  const presented = [];
  const releasedLeases = [];
  let now = 1000;

  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget({ maxDrawsPerTick: 2, maxUploadBytesPerTick: 2048 }),
    clock: () => now,
    onPresent: (record) => {
      presented.push(record);
    },
    onReleaseLease: (leaseInfo) => {
      releasedLeases.push(leaseInfo);
    }
  });

  scheduler.registerSurface({
    surfaceId: 'surface-alpha',
    surfaceGeneration: 1,
    epoch: 10,
    captureLeaseId: 'cap-lease-alpha',
    state: makeDrawableState()
  });
  scheduler.registerSurface({
    surfaceId: 'surface-beta',
    surfaceGeneration: 1,
    epoch: 10,
    captureLeaseId: 'cap-lease-beta',
    state: makeDrawableState()
  });
  scheduler.registerSurface({
    surfaceId: 'surface-gamma',
    surfaceGeneration: 1,
    epoch: 10,
    captureLeaseId: 'cap-lease-gamma',
    state: makeDrawableState()
  });

  // Submit two frames to surface-alpha before tick: first must be superseded in mailbox and its lease released
  const sub1 = scheduler.submitFrame({
    surfaceId: 'surface-alpha',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'lease-a1',
    byteLength: 512,
    submittedAtMs: 990,
    inputTimestampMs: 980
  });
  assert.equal(sub1.ok, true);
  assert.equal(presented.length, 0, 'Arrival must never trigger immediate reactive draw');

  const sub2 = scheduler.submitFrame({
    surfaceId: 'surface-alpha',
    surfaceGeneration: 1,
    frameGeneration: 2,
    leaseId: 'lease-a2',
    byteLength: 512,
    submittedAtMs: 995,
    inputTimestampMs: 985
  });
  assert.equal(sub2.ok, true);
  assert.equal(sub2.replacedFrameGeneration, 1);
  assert.equal(releasedLeases.some((l) => l.leaseId === 'lease-a1' && l.reason === 'MAILBOX_SUPERSEDED'), true);

  scheduler.submitFrame({
    surfaceId: 'surface-beta',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'lease-b1',
    byteLength: 512,
    submittedAtMs: 996
  });
  scheduler.submitFrame({
    surfaceId: 'surface-gamma',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'lease-g1',
    byteLength: 512,
    submittedAtMs: 997
  });

  // Tick 1: maxDrawsPerTick is 2, so alpha (gen 2) and beta (gen 1) present; gamma is deferred fairly
  now = 1005;
  const tick1 = scheduler.runTick();
  assert.equal(tick1.ok, true);
  assert.equal(tick1.presented.length, 2);
  assert.equal(tick1.presented[0].surfaceId, 'surface-alpha');
  assert.equal(tick1.presented[0].frameGeneration, 2);
  assert.equal(tick1.presented[1].surfaceId, 'surface-beta');
  assert.equal(tick1.presented[1].frameGeneration, 1);
  assert.equal(tick1.budgetDeferrals, 1);

  const alphaMetrics = scheduler.getInstrumentation('surface-alpha');
  assert.equal(alphaMetrics.presentCount, 1);
  assert.equal(alphaMetrics.drawSubmissions, 1);
  assert.equal(alphaMetrics.uploadSubmissions, 1);
  assert.equal(alphaMetrics.mailboxReplacements, 1);
  assert.equal(alphaMetrics.lastPresentAgeMs, 10);
  assert.equal(alphaMetrics.inputToPresentMs, 20);

  // Tick 2: round-robin cursor starts at surface-gamma so gamma presents first
  now = 1020;
  const tick2 = scheduler.runTick();
  assert.equal(tick2.presented.length, 1);
  assert.equal(tick2.presented[0].surfaceId, 'surface-gamma');
  assert.equal(tick2.presented[0].frameGeneration, 1);
});

test('negative contrast: hidden or folded surface draw/upload fails while capture witness advances; reopen requests newest generation without backlog replay', () => {
  const presented = [];
  const releasedLeases = [];
  const reopenRequests = [];
  let now = 2000;

  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget(),
    clock: () => now,
    onPresent: (rec) => presented.push(rec),
    onReleaseLease: (lease) => releasedLeases.push(lease),
    onRequestNewestGeneration: (req) => reopenRequests.push(req)
  });

  scheduler.registerSurface({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    epoch: 1,
    captureLeaseId: 'cap-lease-keep',
    state: makeDrawableState()
  });

  // Allocate 3 warm resources; fold will trim to maxWarmResourcesPerSurface (2)
  scheduler.allocateWarmResource('surface-foldable', 'tex-1', 1024);
  scheduler.allocateWarmResource('surface-foldable', 'tex-2', 1024);
  scheduler.allocateWarmResource('surface-foldable', 'tex-3', 1024);

  // Queue a pending frame before folding
  scheduler.submitFrame({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    frameGeneration: 10,
    leaseId: 'lease-pending-before-fold',
    byteLength: 512,
    submittedAtMs: 1990
  });

  // Fold the surface: disables only display branch, drains pending mailbox, keeps capture lease active
  const foldRes = scheduler.foldSurface('surface-foldable', { drainSteps: 2 });
  assert.equal(foldRes.ok, true);
  assert.equal(foldRes.captureLeaseRetained, true);
  assert.equal(
    releasedLeases.some((l) => l.leaseId === 'lease-pending-before-fold' && l.reason === 'FOLD_DRAIN'),
    true
  );

  // Upstream capture witness continues to advance while folded
  const cap1 = scheduler.recordCaptureWitness({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    captureGeneration: 11,
    timestampMs: 2010
  });
  const cap2 = scheduler.recordCaptureWitness({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    captureGeneration: 12,
    timestampMs: 2020
  });
  assert.equal(cap1.ok, true);
  assert.equal(cap2.ok, true);

  // Attempting to submit/draw while folded or hidden must fail and never draw or buffer hidden backlog
  const hiddenSubmit = scheduler.submitFrame({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    frameGeneration: 12,
    leaseId: 'lease-while-folded',
    byteLength: 512,
    submittedAtMs: 2021
  });
  assert.equal(hiddenSubmit.ok, false);
  assert.equal(hiddenSubmit.reason, SCHEDULER_REASONS.FOLDED_DISPLAY_DISABLED);
  assert.equal(
    releasedLeases.some((l) => l.leaseId === 'lease-while-folded' && l.reason === 'FOLDED_REJECT'),
    true
  );

  const directHiddenDraw = scheduler.presentSurfaceNow('surface-foldable');
  assert.equal(directHiddenDraw.ok, false);
  assert.equal(directHiddenDraw.reason, SCHEDULER_REASONS.FOLDED_DISPLAY_DISABLED);

  const tickWhileFolded = scheduler.runTick();
  assert.equal(tickWhileFolded.presented.length, 0);

  const metricsFolded = scheduler.getInstrumentation('surface-foldable');
  assert.equal(metricsFolded.captureCount, 2, 'Capture witness must advance while hidden');
  assert.equal(metricsFolded.lastCaptureGeneration, 12);
  assert.equal(metricsFolded.drawSubmissions, 0, 'Hidden draw count must remain zero');
  assert.equal(metricsFolded.uploadSubmissions, 0, 'Hidden upload count must remain zero');
  assert.equal(metricsFolded.rejectedHiddenDraws, 2);
  assert.equal(metricsFolded.captureLeaseActive, true, 'Capture lease must not be released by DOM hide/fold');
  assert.equal(metricsFolded.warmResourceCount, 2, 'Warm resources must be bounded to budget cap');

  // Unfold/reopen with 0x0 geometry first: first empty-box frame must not supply fake geometry or draw
  const unfoldEmpty = scheduler.unfoldSurface('surface-foldable', {
    geometry: { x: 0, y: 0, width: 0, height: 0 }
  });
  assert.equal(unfoldEmpty.ok, true);
  assert.equal(unfoldEmpty.eligible, false);
  assert.equal(reopenRequests.length, 1);
  assert.equal(reopenRequests[0].afterFrameGeneration, 12, 'Reopen must request newest generation, skipping hidden backlog');

  // Restore valid geometry and attempt to replay old backlog frame (gen 11 <= 12): must fail as stale
  scheduler.updateSurfaceState('surface-foldable', { width: 800, height: 600 });
  const backlogAttempt = scheduler.submitFrame({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    frameGeneration: 11,
    leaseId: 'lease-backlog-11',
    byteLength: 512,
    submittedAtMs: 2030
  });
  assert.equal(backlogAttempt.ok, false);
  assert.equal(backlogAttempt.reason, SCHEDULER_REASONS.STALE_FRAME_GENERATION);

  // Fresh generation 13 after reopen succeeds and presents
  const freshAttempt = scheduler.submitFrame({
    surfaceId: 'surface-foldable',
    surfaceGeneration: 3,
    frameGeneration: 13,
    leaseId: 'lease-fresh-13',
    byteLength: 512,
    submittedAtMs: 2035
  });
  assert.equal(freshAttempt.ok, true);

  now = 2040;
  const tickAfterReopen = scheduler.runTick();
  assert.equal(tickAfterReopen.presented.length, 1);
  assert.equal(tickAfterReopen.presented[0].frameGeneration, 13);
});

test('negative contrast: stale surface generation, stale frame generation, and expired/revoked frame lease fail closed', () => {
  const presented = [];
  let now = 5000;

  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget(),
    clock: () => now,
    onPresent: (rec) => presented.push(rec)
  });

  scheduler.registerSurface({
    surfaceId: 'surface-gen-check',
    surfaceGeneration: 5,
    epoch: 2,
    captureLeaseId: 'cap-5',
    state: makeDrawableState()
  });

  // 1. Stale surface generation fails
  const staleSurface = scheduler.submitFrame({
    surfaceId: 'surface-gen-check',
    surfaceGeneration: 4,
    frameGeneration: 1,
    leaseId: 'lease-stale-surf',
    byteLength: 256,
    submittedAtMs: 4990
  });
  assert.equal(staleSurface.ok, false);
  assert.equal(staleSurface.reason, SCHEDULER_REASONS.STALE_SURFACE_GENERATION);

  // 2. Admit frame gen 10 and present it
  scheduler.submitFrame({
    surfaceId: 'surface-gen-check',
    surfaceGeneration: 5,
    frameGeneration: 10,
    leaseId: 'lease-10',
    byteLength: 256,
    submittedAtMs: 4995
  });
  scheduler.runTick();
  assert.equal(presented.length, 1);

  // 3. Stale frame generation (<= 10) fails
  const staleFrame = scheduler.submitFrame({
    surfaceId: 'surface-gen-check',
    surfaceGeneration: 5,
    frameGeneration: 10,
    leaseId: 'lease-10-dup',
    byteLength: 256,
    submittedAtMs: 5001
  });
  assert.equal(staleFrame.ok, false);
  assert.equal(staleFrame.reason, SCHEDULER_REASONS.STALE_FRAME_GENERATION);

  // 4. Frame with lease that expires before tick fails closed at presentation time
  scheduler.submitFrame({
    surfaceId: 'surface-gen-check',
    surfaceGeneration: 5,
    frameGeneration: 11,
    leaseId: 'lease-expiring',
    leaseExpiresAtMs: 5010,
    byteLength: 256,
    submittedAtMs: 5002
  });

  now = 5020; // past leaseExpiresAtMs
  const tickExpired = scheduler.runTick();
  assert.equal(tickExpired.presented.length, 0);
  assert.equal(tickExpired.rejectedStaleLeases, 1);

  const metrics = scheduler.getInstrumentation('surface-gen-check');
  assert.equal(metrics.presentCount, 1);
  assert.equal(metrics.rejectedStaleFrames, 3);
});

test('negative contrast: non-Selected/non-Intersecting/disallowed window state blocks draw and reclaims mailbox without upload', () => {
  const presented = [];
  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget(),
    clock: () => 3000,
    onPresent: (rec) => presented.push(rec)
  });

  scheduler.registerSurface({
    surfaceId: 'surface-occluded',
    surfaceGeneration: 1,
    epoch: 1,
    captureLeaseId: 'cap-occ',
    state: makeDrawableState({ viewportIntersecting: false })
  });

  const sub = scheduler.submitFrame({
    surfaceId: 'surface-occluded',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'lease-occ-1',
    byteLength: 512,
    submittedAtMs: 2995
  });
  assert.equal(sub.ok, false);
  assert.equal(sub.reason, SCHEDULER_REASONS.HIDDEN_SURFACE);

  const tick = scheduler.runTick();
  assert.equal(tick.presented.length, 0);
  assert.equal(presented.length, 0);
});

test('resource plateau: context loss, resize, panel move, and explicit destroy preserve lifecycle boundaries', () => {
  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget({ maxWarmResourcesPerSurface: 2 }),
    clock: () => 4000
  });

  scheduler.registerSurface({
    surfaceId: 'surface-plateau',
    surfaceGeneration: 1,
    epoch: 1,
    captureLeaseId: 'cap-plateau',
    state: makeDrawableState()
  });

  // Panel move / tab change updates presentation only and never destroys capsule or drops capture lease
  scheduler.updateSurfaceState('surface-plateau', { panelSelected: false });
  let inst = scheduler.getInstrumentation('surface-plateau');
  assert.equal(inst.destroyed, false);
  assert.equal(inst.captureLeaseActive, true);

  // Context loss clears pending mailbox and warm resources and blocks draws until restored
  scheduler.allocateWarmResource('surface-plateau', 'gpu-buf-1', 2048);
  scheduler.onContextLost('surface-plateau');
  inst = scheduler.getInstrumentation('surface-plateau');
  assert.equal(inst.contextLost, true);
  assert.equal(inst.warmResourceCount, 0);
  assert.equal(inst.captureLeaseActive, true, 'GPU context loss must not kill authoritative capture lease');

  // Explicit destroy reclaims everything
  const destroyRes = scheduler.destroySurface('surface-plateau');
  assert.equal(destroyRes.ok, true);
  inst = scheduler.getInstrumentation('surface-plateau');
  assert.equal(inst.destroyed, true);
  assert.equal(inst.captureLeaseActive, false);
});

test('negative contrast: numeric list-length surface IDs, excessive fold drain steps, and over-budget frames fail closed; timing scopes are isolated', () => {
  let now = 8000;
  const scheduler = createPresentationScheduler({
    budget: makeFrozenBudget({ maxUploadBytesPerTick: 1024, maxDrainSteps: 3 }),
    clock: () => now
  });

  // Numeric list-length ID rejected (§6)
  const listIdRes = scheduler.registerSurface({
    surfaceId: '0',
    surfaceGeneration: 1,
    epoch: 1,
    state: makeDrawableState()
  });
  assert.equal(listIdRes.ok, false);
  assert.equal(listIdRes.reason, SCHEDULER_REASONS.INVALID_SURFACE_ID);

  scheduler.registerSurface({
    surfaceId: 'surface-timing',
    surfaceGeneration: 1,
    epoch: 1,
    captureLeaseId: 'cap-timing',
    state: makeDrawableState()
  });

  // Excessive drain steps rejected
  const overDrain = scheduler.foldSurface('surface-timing', { drainSteps: 5 });
  assert.equal(overDrain.ok, false);
  assert.equal(overDrain.reason, SCHEDULER_REASONS.DRAIN_LIMIT_EXCEEDED);

  // Over-budget single frame rejected
  const overBytes = scheduler.submitFrame({
    surfaceId: 'surface-timing',
    surfaceGeneration: 1,
    frameGeneration: 1,
    leaseId: 'lease-over-bytes',
    byteLength: 2048,
    submittedAtMs: 7990
  });
  assert.equal(overBytes.ok, false);
  assert.equal(overBytes.reason, SCHEDULER_REASONS.BUDGET_EXHAUSTED);

  // Valid frame records distinct submission, parserConsumption, and presentation timing scopes
  scheduler.submitFrame({
    surfaceId: 'surface-timing',
    surfaceGeneration: 1,
    frameGeneration: 2,
    leaseId: 'lease-timing-2',
    byteLength: 512,
    submittedAtMs: 7990,
    decodeDurationMs: 4,
    inputTimestampMs: 7980
  });
  now = 8000;
  scheduler.runTick();

  const inst = scheduler.getInstrumentation('surface-timing');
  assert.deepEqual(inst.timingScopes, {
    submissionMs: 7990,
    parserConsumptionMs: 7994,
    presentationMs: 8000,
    verifiedDomainEffectMs: null
  });
});
