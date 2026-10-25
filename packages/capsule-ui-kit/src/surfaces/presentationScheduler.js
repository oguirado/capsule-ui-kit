/**
 * @fileoverview Coordinated fair presentation scheduler and surface frame-lease registry.
 * Sealed design authority: UI_ARCHITECTURE.md sections 3, 4, 5, 6, 9, 10 and 13.
 *
 * Enforces:
 * - Non-reactive external service registry for frame mailboxes, leases, and bounded warm resources (§4, §10).
 * - Five-axis drawable eligibility: open/selected panel, unfolded state, positive size, viewport intersection,
 *   and allowed window presentation (§10), producing rounded CSS content boxes only when materialized & visible (§9).
 * - Coordinated fair round-robin scheduling under a frozen aggregate tick budget; no arrival-driven Vue updates (§10).
 * - Fold/hide stops only the display branch, drains/reclaims presentation-owned pending leases and trims warm
 *   resources while preserving upstream capture leases and advancing capture witnesses (§6, §10, §12).
 * - Reopen requests the newest generation beyond any hidden capture witness, rejecting hidden backlog replay (§10, §13).
 * - Strict surface generation, frame generation, and frame lease checks fail closed on stale or hidden draws (§13).
 */

/**
 * @typedef {Object} FrozenSchedulerBudget
 * @property {number} maxDrawsPerTick - Maximum surface draw submissions per scheduler tick (positive safe integer).
 * @property {number} maxUploadBytesPerTick - Maximum aggregate byte uploads per scheduler tick (positive safe integer).
 * @property {number} maxPresentMsPerTick - Maximum aggregate presentation time in ms per tick (positive finite number).
 * @property {number} maxWarmResourcesPerSurface - Bounded warm resource count retained per surface (non-negative safe integer).
 * @property {number} maxDrainSteps - Maximum bounded drain steps permitted when folding a surface (positive safe integer).
 */

/**
 * @typedef {Object} SurfacePresentationState
 * @property {boolean} panelOpen - True if the hosting panel is currently open in the workspace.
 * @property {boolean} panelSelected - True if the hosting panel/tab is currently selected/active in its stack.
 * @property {boolean} folded - True if the surface display branch is folded by the user/workspace.
 * @property {number} width - Content box width in CSS pixels.
 * @property {number} height - Content box height in CSS pixels.
 * @property {number} [x] - Content box X coordinate in content-window CSS pixels.
 * @property {number} [y] - Content box Y coordinate in content-window CSS pixels.
 * @property {boolean} viewportIntersecting - True if the surface intersects the visible viewport.
 * @property {boolean} windowPresentationAllowed - True if the host window presentation permits drawing.
 * @property {boolean} [contextLost] - True if the underlying GPU/canvas context is currently lost.
 */

/**
 * @typedef {Object} ContentBox
 * @property {number} x - Rounded content-window CSS X coordinate.
 * @property {number} y - Rounded content-window CSS Y coordinate.
 * @property {number} width - Rounded content-window CSS width (> 0).
 * @property {number} height - Rounded content-window CSS height (> 0).
 */

/**
 * @typedef {Object} DrawableEligibilityResult
 * @property {boolean} eligible - True only when all 5 drawable eligibility axes hold and context is not lost.
 * @property {string[]} reasons - Disqualifying axis identifiers when ineligible; empty when eligible.
 * @property {ContentBox|null} box - Rounded content-window CSS pixel box when eligible; null when hidden/ineligible.
 */

/**
 * @typedef {Object} FrameSubmission
 * @property {string} surfaceId - Immutable core-issued surface identifier.
 * @property {number} surfaceGeneration - Core-issued surface generation/epoch witness.
 * @property {number} frameGeneration - Monotonic frame generation number for this surface generation.
 * @property {string} leaseId - Unique frame lease identifier for lifecycle/ACK tracking.
 * @property {number} byteLength - Byte size of the frame payload for upload budget accounting.
 * @property {number} [submittedAtMs] - Submission timestamp in ms.
 * @property {number} [inputTimestampMs] - Originating input timestamp in ms for input-to-present latency.
 * @property {number} [decodeDurationMs] - Upstream/adapter decode duration in ms.
 * @property {number} [estimatedPresentMs] - Estimated presentation cost in ms (defaults to 1).
 * @property {number} [leaseExpiresAtMs] - Optional expiration deadline in ms for the frame lease.
 * @property {unknown} [payload] - Opaque transport-neutral frame reference or handle.
 */

export const SCHEDULER_REASONS = Object.freeze({
  INVALID_BUDGET: 'INVALID_BUDGET',
  INVALID_SURFACE_ID: 'INVALID_SURFACE_ID',
  INVALID_GENERATION: 'INVALID_GENERATION',
  SURFACE_NOT_REGISTERED: 'SURFACE_NOT_REGISTERED',
  SURFACE_DESTROYED: 'SURFACE_DESTROYED',
  STALE_SURFACE_GENERATION: 'STALE_SURFACE_GENERATION',
  STALE_FRAME_GENERATION: 'STALE_FRAME_GENERATION',
  STALE_LEASE: 'STALE_LEASE',
  HIDDEN_SURFACE: 'HIDDEN_SURFACE',
  FOLDED_DISPLAY_DISABLED: 'FOLDED_DISPLAY_DISABLED',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  EMPTY_MAILBOX: 'EMPTY_MAILBOX',
  CONTEXT_LOST: 'CONTEXT_LOST',
  DRAIN_LIMIT_EXCEEDED: 'DRAIN_LIMIT_EXCEEDED'
});

const ALLOWED_BUDGET_KEYS = new Set([
  'maxDrawsPerTick',
  'maxUploadBytesPerTick',
  'maxPresentMsPerTick',
  'maxWarmResourcesPerSurface',
  'maxDrainSteps'
]);

/**
 * Validates that a scheduler budget has all required bounds frozen before a run.
 * Unknown, missing, or non-positive limits block qualification (§10, §12).
 *
 * @param {FrozenSchedulerBudget|null|undefined} budget
 * @param {{ requireFrozen?: boolean }} [options]
 * @returns {{ ok: boolean, reason?: string, detail?: string, budget?: FrozenSchedulerBudget }}
 */
export function validateFrozenBudget(budget, options = {}) {
  const requireFrozen = options.requireFrozen !== false;
  if (!budget || typeof budget !== 'object' || Array.isArray(budget)) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'Budget must be a non-null object'
    };
  }
  if (requireFrozen && !Object.isFrozen(budget)) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'Actual budgets must be frozen before runs'
    };
  }
  const keys = Object.keys(budget);
  for (const key of keys) {
    if (!ALLOWED_BUDGET_KEYS.has(key)) {
      return {
        ok: false,
        reason: SCHEDULER_REASONS.INVALID_BUDGET,
        detail: `Unknown budget key: ${key}`
      };
    }
  }
  for (const reqKey of ALLOWED_BUDGET_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(budget, reqKey)) {
      return {
        ok: false,
        reason: SCHEDULER_REASONS.INVALID_BUDGET,
        detail: `Missing required budget key: ${reqKey}`
      };
    }
  }
  if (!Number.isSafeInteger(budget.maxDrawsPerTick) || budget.maxDrawsPerTick <= 0) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'maxDrawsPerTick must be a positive safe integer'
    };
  }
  if (!Number.isSafeInteger(budget.maxUploadBytesPerTick) || budget.maxUploadBytesPerTick <= 0) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'maxUploadBytesPerTick must be a positive safe integer'
    };
  }
  if (typeof budget.maxPresentMsPerTick !== 'number' || !Number.isFinite(budget.maxPresentMsPerTick) || budget.maxPresentMsPerTick <= 0) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'maxPresentMsPerTick must be a positive finite number'
    };
  }
  if (!Number.isSafeInteger(budget.maxWarmResourcesPerSurface) || budget.maxWarmResourcesPerSurface < 0) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'maxWarmResourcesPerSurface must be a non-negative safe integer'
    };
  }
  if (!Number.isSafeInteger(budget.maxDrainSteps) || budget.maxDrainSteps <= 0) {
    return {
      ok: false,
      reason: SCHEDULER_REASONS.INVALID_BUDGET,
      detail: 'maxDrainSteps must be a positive safe integer'
    };
  }
  return { ok: true, budget };
}

/**
 * Evaluates whether a surface is currently eligible for display drawing/uploading (§9, §10).
 * Only currently materialized visible surfaces receive a rounded CSS pixel box; hidden or
 * empty-geometry surfaces receive `box: null` and are blocked from drawing.
 *
 * @param {SurfacePresentationState|null|undefined} state
 * @returns {DrawableEligibilityResult}
 */
export function evaluateDrawableEligibility(state) {
  if (!state || typeof state !== 'object') {
    return {
      eligible: false,
      reasons: ['MISSING_STATE'],
      box: null
    };
  }
  /** @type {string[]} */
  const reasons = [];

  if (state.panelOpen !== true || state.panelSelected !== true) {
    reasons.push('PANEL_NOT_SELECTED_OR_OPEN');
  }
  if (state.folded !== false) {
    reasons.push('FOLDED');
  }
  const hasPositiveSize =
    typeof state.width === 'number' &&
    Number.isFinite(state.width) &&
    Math.round(state.width) > 0 &&
    typeof state.height === 'number' &&
    Number.isFinite(state.height) &&
    Math.round(state.height) > 0;
  if (!hasPositiveSize) {
    reasons.push('NON_POSITIVE_SIZE');
  }
  if (state.viewportIntersecting !== true) {
    reasons.push('NOT_INTERSECTING_VIEWPORT');
  }
  if (state.windowPresentationAllowed !== true) {
    reasons.push('WINDOW_PRESENTATION_DISALLOWED');
  }
  if (state.contextLost === true) {
    reasons.push('CONTEXT_LOST');
  }

  if (reasons.length > 0) {
    return {
      eligible: false,
      reasons,
      box: null
    };
  }

  const x = typeof state.x === 'number' && Number.isFinite(state.x) ? Math.round(state.x) : 0;
  const y = typeof state.y === 'number' && Number.isFinite(state.y) ? Math.round(state.y) : 0;
  const width = Math.round(state.width);
  const height = Math.round(state.height);

  return {
    eligible: true,
    reasons: [],
    box: Object.freeze({ x, y, width, height })
  };
}

/**
 * Validates an immutable surface identifier (§6: no numeric list-length IDs or empty strings).
 *
 * @param {unknown} surfaceId
 * @returns {boolean}
 */
function isValidSurfaceId(surfaceId) {
  if (typeof surfaceId !== 'string' || surfaceId.trim().length === 0) {
    return false;
  }
  if (/^\d+$/.test(surfaceId.trim())) {
    return false;
  }
  return true;
}

/**
 * Creates a non-reactive coordinated fair presentation scheduler instance.
 *
 * @param {Object} options
 * @param {FrozenSchedulerBudget} options.budget - Frozen budget limits for the scheduler.
 * @param {boolean} [options.requireFrozenBudget=true] - Whether the passed budget object must already be frozen.
 * @param {() => number} [options.clock] - Monotonic clock source returning milliseconds.
 * @param {(record: Object) => void} [options.onPresent] - Callback invoked when a frame is presented during a tick.
 * @param {(leaseInfo: Object) => void} [options.onReleaseLease] - Callback invoked whenever a presentation frame lease is released/reclaimed.
 * @param {(req: Object) => void} [options.onRequestNewestGeneration] - Callback invoked on unfold/reopen to request the newest generation without hidden backlog.
 */
export function createPresentationScheduler(options) {
  if (!options || typeof options !== 'object') {
    throw new Error(`${SCHEDULER_REASONS.INVALID_BUDGET}: Scheduler options are required`);
  }
  const budgetValidation = validateFrozenBudget(options.budget, {
    requireFrozen: options.requireFrozenBudget !== false
  });
  if (!budgetValidation.ok) {
    throw new Error(`${budgetValidation.reason}: ${budgetValidation.detail}`);
  }
  const budget = budgetValidation.budget;
  const clock = typeof options.clock === 'function' ? options.clock : () => Date.now();
  const onPresent = typeof options.onPresent === 'function' ? options.onPresent : null;
  const onReleaseLease = typeof options.onReleaseLease === 'function' ? options.onReleaseLease : null;
  const onRequestNewestGeneration =
    typeof options.onRequestNewestGeneration === 'function' ? options.onRequestNewestGeneration : null;

  /** @type {Map<string, Object>} */
  const surfaces = new Map();
  /** @type {string[]} */
  const surfaceOrder = [];
  let fairCursor = 0;

  function emitLeaseRelease(surfaceId, leaseId, frameGeneration, reason) {
    if (onReleaseLease && typeof leaseId === 'string' && leaseId.length > 0) {
      onReleaseLease({
        surfaceId,
        leaseId,
        frameGeneration,
        reason,
        releasedAtMs: clock()
      });
    }
  }

  function trimWarmResources(entry, limit) {
    while (entry.warmResources.size > limit) {
      const oldestKey = entry.warmResources.keys().next().value;
      if (oldestKey === undefined) break;
      const removed = entry.warmResources.get(oldestKey);
      entry.warmResources.delete(oldestKey);
      entry.metrics.warmResourceBytes = Math.max(0, entry.metrics.warmResourceBytes - (removed?.bytes || 0));
      entry.metrics.reclaimedWarmResources += 1;
    }
  }

  /**
   * Registers a surface with its core-issued immutable identity, generation, epoch, and capture lease.
   */
  function registerSurface(config) {
    if (!config || !isValidSurfaceId(config.surfaceId)) {
      return { ok: false, reason: SCHEDULER_REASONS.INVALID_SURFACE_ID };
    }
    if (!Number.isSafeInteger(config.surfaceGeneration) || config.surfaceGeneration <= 0) {
      return { ok: false, reason: SCHEDULER_REASONS.INVALID_GENERATION };
    }
    const epoch = config.epoch === undefined ? 1 : config.epoch;
    if (!Number.isSafeInteger(epoch) || epoch <= 0) {
      return { ok: false, reason: SCHEDULER_REASONS.INVALID_GENERATION };
    }

    const initialState = {
      panelOpen: true,
      panelSelected: true,
      folded: false,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      viewportIntersecting: false,
      windowPresentationAllowed: true,
      contextLost: false,
      ...(config.state || {})
    };

    const existing = surfaces.get(config.surfaceId);
    if (existing && !existing.destroyed) {
      if (config.surfaceGeneration < existing.surfaceGeneration) {
        return { ok: false, reason: SCHEDULER_REASONS.STALE_SURFACE_GENERATION };
      }
      if (existing.mailbox) {
        emitLeaseRelease(
          existing.surfaceId,
          existing.mailbox.leaseId,
          existing.mailbox.frameGeneration,
          'SURFACE_GENERATION_ADVANCE'
        );
        existing.mailbox = null;
      }
    }

    const entry = {
      surfaceId: config.surfaceId,
      surfaceGeneration: config.surfaceGeneration,
      epoch,
      captureLeaseId: typeof config.captureLeaseId === 'string' ? config.captureLeaseId : null,
      captureLeaseActive: Boolean(config.captureLeaseId),
      destroyed: false,
      state: initialState,
      mailbox: null,
      lastPresentedFrameGen: 0,
      minAdmissibleFrameGen: 0,
      lastCaptureGeneration: 0,
      warmResources: new Map(),
      metrics: {
        captureCount: 0,
        decodeCount: 0,
        presentCount: 0,
        drawSubmissions: 0,
        uploadSubmissions: 0,
        bytesUploadedTotal: 0,
        mailboxReplacements: 0,
        rejectedHiddenDraws: 0,
        rejectedStaleFrames: 0,
        reclaimedWarmResources: 0,
        warmResourceBytes: 0,
        lastPresentAgeMs: null,
        inputToPresentMs: null,
        lastCaptureTimestampMs: null,
        lastPresentTimestampMs: null,
        timingScopes: {
          submissionMs: null,
          parserConsumptionMs: null,
          presentationMs: null,
          verifiedDomainEffectMs: null
        }
      }
    };

    surfaces.set(config.surfaceId, entry);
    if (!surfaceOrder.includes(config.surfaceId)) {
      surfaceOrder.push(config.surfaceId);
    }
    return {
      ok: true,
      surfaceId: entry.surfaceId,
      surfaceGeneration: entry.surfaceGeneration,
      epoch: entry.epoch
    };
  }

  /**
   * Records that upstream authoritative capture advanced for a surface (§10, §12).
   * Capture continues even when the UI display branch is folded or hidden.
   */
  function recordCaptureWitness({ surfaceId, surfaceGeneration, captureGeneration, timestampMs }) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    if (surfaceGeneration !== entry.surfaceGeneration) {
      return { ok: false, reason: SCHEDULER_REASONS.STALE_SURFACE_GENERATION };
    }
    if (!Number.isSafeInteger(captureGeneration) || captureGeneration <= entry.lastCaptureGeneration) {
      return { ok: false, reason: SCHEDULER_REASONS.STALE_FRAME_GENERATION };
    }

    entry.lastCaptureGeneration = captureGeneration;
    entry.metrics.captureCount += 1;
    entry.metrics.lastCaptureTimestampMs = typeof timestampMs === 'number' ? timestampMs : clock();

    if (entry.state.folded) {
      // While folded, advance minimum admissible generation so reopen skips hidden backlog
      entry.minAdmissibleFrameGen = Math.max(entry.minAdmissibleFrameGen, captureGeneration);
    }

    return {
      ok: true,
      captureCount: entry.metrics.captureCount,
      lastCaptureGeneration: entry.lastCaptureGeneration
    };
  }

  /**
   * Submits a candidate display frame into the surface's single-slot newest mailbox.
   * Never triggers an arrival-driven reactive draw. Rejects hidden/folded surfaces,
   * stale surface generations, stale frame generations, or invalid frame leases.
   *
   * @param {FrameSubmission} frame
   */
  function submitFrame(frame) {
    if (!frame || typeof frame !== 'object' || !isValidSurfaceId(frame.surfaceId)) {
      return { ok: false, reason: SCHEDULER_REASONS.INVALID_SURFACE_ID };
    }
    const entry = surfaces.get(frame.surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }

    const leaseId = typeof frame.leaseId === 'string' && frame.leaseId.trim().length > 0 ? frame.leaseId : null;
    const frameGen = frame.frameGeneration;

    // 1. Validate surface generation
    if (!Number.isSafeInteger(frame.surfaceGeneration) || frame.surfaceGeneration !== entry.surfaceGeneration) {
      entry.metrics.rejectedStaleFrames += 1;
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'STALE_SURFACE_GENERATION');
      return { ok: false, reason: SCHEDULER_REASONS.STALE_SURFACE_GENERATION };
    }

    // 2. Enforce folded display branch disable before accepting or queueing any frame
    if (entry.state.folded === true) {
      entry.metrics.rejectedHiddenDraws += 1;
      if (Number.isSafeInteger(frameGen) && frameGen > entry.minAdmissibleFrameGen) {
        entry.minAdmissibleFrameGen = frameGen;
      }
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'FOLDED_REJECT');
      return { ok: false, reason: SCHEDULER_REASONS.FOLDED_DISPLAY_DISABLED };
    }

    // 3. Validate frame generation monotonicity against presented, mailbox, and hidden-drain floor
    const currentFloor = Math.max(
      entry.lastPresentedFrameGen,
      entry.minAdmissibleFrameGen,
      entry.mailbox ? entry.mailbox.frameGeneration : 0
    );
    if (!Number.isSafeInteger(frameGen) || frameGen <= currentFloor) {
      entry.metrics.rejectedStaleFrames += 1;
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'STALE_FRAME_GENERATION');
      return { ok: false, reason: SCHEDULER_REASONS.STALE_FRAME_GENERATION };
    }

    // 4. Validate frame lease presence and non-expiration
    const now = clock();
    if (!leaseId || (typeof frame.leaseExpiresAtMs === 'number' && frame.leaseExpiresAtMs <= now)) {
      entry.metrics.rejectedStaleFrames += 1;
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'STALE_LEASE');
      return { ok: false, reason: SCHEDULER_REASONS.STALE_LEASE };
    }

    if (!Number.isSafeInteger(frame.byteLength) || frame.byteLength < 0 || frame.byteLength > budget.maxUploadBytesPerTick) {
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'INVALID_OR_OVER_BUDGET_FRAME');
      return { ok: false, reason: SCHEDULER_REASONS.BUDGET_EXHAUSTED };
    }

    // 5. Enforce drawable eligibility on the display branch: hidden surfaces do not buffer or draw
    const eligibility = evaluateDrawableEligibility(entry.state);
    if (!eligibility.eligible) {
      entry.metrics.rejectedHiddenDraws += 1;
      emitLeaseRelease(entry.surfaceId, leaseId, frameGen, 'HIDDEN_SURFACE_REJECT');
      return {
        ok: false,
        reason: entry.state.contextLost ? SCHEDULER_REASONS.CONTEXT_LOST : SCHEDULER_REASONS.HIDDEN_SURFACE,
        disqualifiers: eligibility.reasons
      };
    }

    // 6. Replace single-slot mailbox with newest frame and immediately release superseded lease
    let replacedFrameGeneration = null;
    if (entry.mailbox !== null) {
      replacedFrameGeneration = entry.mailbox.frameGeneration;
      entry.metrics.mailboxReplacements += 1;
      emitLeaseRelease(
        entry.surfaceId,
        entry.mailbox.leaseId,
        entry.mailbox.frameGeneration,
        'MAILBOX_SUPERSEDED'
      );
    }

    entry.metrics.decodeCount += 1;
    entry.mailbox = {
      surfaceId: entry.surfaceId,
      surfaceGeneration: frame.surfaceGeneration,
      frameGeneration: frameGen,
      leaseId,
      leaseExpiresAtMs: typeof frame.leaseExpiresAtMs === 'number' ? frame.leaseExpiresAtMs : null,
      byteLength: frame.byteLength,
      submittedAtMs: typeof frame.submittedAtMs === 'number' ? frame.submittedAtMs : now,
      inputTimestampMs: typeof frame.inputTimestampMs === 'number' ? frame.inputTimestampMs : null,
      decodeDurationMs: typeof frame.decodeDurationMs === 'number' ? frame.decodeDurationMs : 0,
      estimatedPresentMs:
        typeof frame.estimatedPresentMs === 'number' && frame.estimatedPresentMs > 0
          ? frame.estimatedPresentMs
          : 1,
      payload: frame.payload !== undefined ? frame.payload : null
    };

    return {
      ok: true,
      queuedFrameGeneration: frameGen,
      replacedFrameGeneration
    };
  }

  /**
   * Folds a surface: disables only the display branch, drains/reclaims presentation-owned
   * pending mailbox leases, and trims warm resources to the frozen budget cap while keeping
   * the authoritative capture lease active (§6, §10, §12).
   */
  function foldSurface(surfaceId, foldOptions = {}) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    const drainSteps = foldOptions.drainSteps === undefined ? 1 : foldOptions.drainSteps;
    if (!Number.isSafeInteger(drainSteps) || drainSteps < 0 || drainSteps > budget.maxDrainSteps) {
      return { ok: false, reason: SCHEDULER_REASONS.DRAIN_LIMIT_EXCEEDED };
    }

    entry.state = {
      ...entry.state,
      folded: true
    };

    let drainedFrameGeneration = null;
    if (entry.mailbox !== null) {
      drainedFrameGeneration = entry.mailbox.frameGeneration;
      entry.minAdmissibleFrameGen = Math.max(entry.minAdmissibleFrameGen, drainedFrameGeneration);
      emitLeaseRelease(entry.surfaceId, entry.mailbox.leaseId, entry.mailbox.frameGeneration, 'FOLD_DRAIN');
      entry.mailbox = null;
    }

    trimWarmResources(entry, budget.maxWarmResourcesPerSurface);

    return {
      ok: true,
      folded: true,
      drainedFrameGeneration,
      captureLeaseRetained: entry.captureLeaseActive,
      warmResourceCount: entry.warmResources.size
    };
  }

  /**
   * Unfolds/reopens a surface: requests the newest generation after any hidden capture
   * witness or drained frame so no hidden backlog is replayed (§10).
   */
  function unfoldSurface(surfaceId, unfoldOptions = {}) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }

    const nextGeometry = unfoldOptions.geometry && typeof unfoldOptions.geometry === 'object'
      ? {
          x: typeof unfoldOptions.geometry.x === 'number' ? unfoldOptions.geometry.x : entry.state.x,
          y: typeof unfoldOptions.geometry.y === 'number' ? unfoldOptions.geometry.y : entry.state.y,
          width: typeof unfoldOptions.geometry.width === 'number' ? unfoldOptions.geometry.width : entry.state.width,
          height: typeof unfoldOptions.geometry.height === 'number' ? unfoldOptions.geometry.height : entry.state.height
        }
      : {};

    entry.state = {
      ...entry.state,
      ...nextGeometry,
      folded: false
    };

    const afterFrameGeneration = Math.max(
      entry.lastPresentedFrameGen,
      entry.minAdmissibleFrameGen,
      entry.lastCaptureGeneration
    );
    entry.minAdmissibleFrameGen = afterFrameGeneration;

    if (onRequestNewestGeneration) {
      onRequestNewestGeneration({
        surfaceId: entry.surfaceId,
        surfaceGeneration: entry.surfaceGeneration,
        epoch: entry.epoch,
        afterFrameGeneration
      });
    }

    const eligibility = evaluateDrawableEligibility(entry.state);
    return {
      ok: true,
      eligible: eligibility.eligible,
      box: eligibility.box,
      requestedAfterFrameGeneration: afterFrameGeneration
    };
  }

  /**
   * Updates presentation-only state (move, tab selection, resize, viewport intersection, window presentation).
   * Moving or deselecting a panel never destroys the capsule or releases its capture lease (§6).
   */
  function updateSurfaceState(surfaceId, patch) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    entry.state = {
      ...entry.state,
      ...(patch || {})
    };
    const eligibility = evaluateDrawableEligibility(entry.state);
    if (!eligibility.eligible && entry.mailbox !== null) {
      entry.minAdmissibleFrameGen = Math.max(entry.minAdmissibleFrameGen, entry.mailbox.frameGeneration);
      emitLeaseRelease(
        entry.surfaceId,
        entry.mailbox.leaseId,
        entry.mailbox.frameGeneration,
        'BECAME_INELIGIBLE_DRAIN'
      );
      entry.mailbox = null;
    }
    return {
      ok: true,
      eligible: eligibility.eligible,
      box: eligibility.box,
      captureLeaseRetained: entry.captureLeaseActive
    };
  }

  /**
   * Attempts an immediate draw of a single surface, enforcing all hidden/folded and lease guards.
   */
  function presentSurfaceNow(surfaceId) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    if (entry.state.folded === true) {
      entry.metrics.rejectedHiddenDraws += 1;
      return { ok: false, reason: SCHEDULER_REASONS.FOLDED_DISPLAY_DISABLED };
    }
    const eligibility = evaluateDrawableEligibility(entry.state);
    if (!eligibility.eligible) {
      entry.metrics.rejectedHiddenDraws += 1;
      return {
        ok: false,
        reason: entry.state.contextLost ? SCHEDULER_REASONS.CONTEXT_LOST : SCHEDULER_REASONS.HIDDEN_SURFACE,
        disqualifiers: eligibility.reasons
      };
    }
    if (!entry.mailbox) {
      return { ok: false, reason: SCHEDULER_REASONS.EMPTY_MAILBOX };
    }
    return runTick({ targetSurfaceId: surfaceId });
  }

  /**
   * Executes one coordinated fair scheduler tick across registered surfaces under the frozen budget.
   */
  function runTick(tickOptions = {}) {
    const now = clock();
    const n = surfaceOrder.length;
    if (n === 0) {
      return {
        ok: true,
        presented: [],
        drawsUsed: 0,
        bytesUploaded: 0,
        timeSpentMs: 0,
        budgetDeferrals: 0,
        rejectedStaleLeases: 0
      };
    }

    let drawsUsed = 0;
    let bytesUploaded = 0;
    let timeSpentMs = 0;
    let budgetDeferrals = 0;
    let rejectedStaleLeases = 0;
    /** @type {Object[]} */
    const presented = [];

    const startIdx = fairCursor % n;
    let nextCursor = startIdx;

    for (let offset = 0; offset < n; offset += 1) {
      const idx = (startIdx + offset) % n;
      const surfaceId = surfaceOrder[idx];
      if (tickOptions.targetSurfaceId && surfaceId !== tickOptions.targetSurfaceId) {
        continue;
      }
      const entry = surfaces.get(surfaceId);
      if (!entry || entry.destroyed || !entry.mailbox) {
        continue;
      }

      const eligibility = evaluateDrawableEligibility(entry.state);
      if (!eligibility.eligible) {
        entry.metrics.rejectedHiddenDraws += 1;
        emitLeaseRelease(
          entry.surfaceId,
          entry.mailbox.leaseId,
          entry.mailbox.frameGeneration,
          'INELIGIBLE_AT_TICK'
        );
        entry.mailbox = null;
        continue;
      }

      const candidate = entry.mailbox;
      // Verify generation and lease freshness at presentation time
      const isLeaseExpired =
        typeof candidate.leaseExpiresAtMs === 'number' && candidate.leaseExpiresAtMs <= now;
      const isFrameStale =
        candidate.surfaceGeneration !== entry.surfaceGeneration ||
        candidate.frameGeneration <= entry.lastPresentedFrameGen ||
        candidate.frameGeneration <= entry.minAdmissibleFrameGen;

      if (isLeaseExpired || isFrameStale) {
        entry.metrics.rejectedStaleFrames += 1;
        if (isLeaseExpired) {
          rejectedStaleLeases += 1;
        }
        emitLeaseRelease(
          entry.surfaceId,
          candidate.leaseId,
          candidate.frameGeneration,
          isLeaseExpired ? 'LEASE_EXPIRED_AT_TICK' : 'STALE_GENERATION_AT_TICK'
        );
        entry.mailbox = null;
        continue;
      }

      // Check aggregate tick budget before drawing/uploading
      const wouldExceedDraws = drawsUsed + 1 > budget.maxDrawsPerTick;
      const wouldExceedBytes = bytesUploaded + candidate.byteLength > budget.maxUploadBytesPerTick;
      const wouldExceedTime = timeSpentMs + candidate.estimatedPresentMs > budget.maxPresentMsPerTick;

      if (wouldExceedDraws || wouldExceedBytes || wouldExceedTime) {
        budgetDeferrals += 1;
        if (budgetDeferrals === 1) {
          nextCursor = idx;
        }
        continue;
      }

      // Consume mailbox and present
      entry.mailbox = null;
      drawsUsed += 1;
      bytesUploaded += candidate.byteLength;
      timeSpentMs += candidate.estimatedPresentMs;
      nextCursor = (idx + 1) % n;

      const presentAgeMs = Math.max(0, now - candidate.submittedAtMs);
      const inputToPresentMs =
        typeof candidate.inputTimestampMs === 'number'
          ? Math.max(0, now - candidate.inputTimestampMs)
          : null;

      entry.lastPresentedFrameGen = candidate.frameGeneration;
      entry.metrics.presentCount += 1;
      entry.metrics.drawSubmissions += 1;
      entry.metrics.uploadSubmissions += 1;
      entry.metrics.bytesUploadedTotal += candidate.byteLength;
      entry.metrics.lastPresentAgeMs = presentAgeMs;
      entry.metrics.inputToPresentMs = inputToPresentMs;
      entry.metrics.lastPresentTimestampMs = now;
      entry.metrics.timingScopes = {
        submissionMs: candidate.submittedAtMs,
        parserConsumptionMs: candidate.submittedAtMs + candidate.decodeDurationMs,
        presentationMs: now,
        verifiedDomainEffectMs: null
      };

      const presentationRecord = Object.freeze({
        surfaceId: entry.surfaceId,
        surfaceGeneration: entry.surfaceGeneration,
        epoch: entry.epoch,
        frameGeneration: candidate.frameGeneration,
        leaseId: candidate.leaseId,
        byteLength: candidate.byteLength,
        box: eligibility.box,
        presentedAtMs: now,
        presentAgeMs,
        inputToPresentMs
      });

      if (onPresent) {
        onPresent(presentationRecord);
      }
      emitLeaseRelease(
        entry.surfaceId,
        candidate.leaseId,
        candidate.frameGeneration,
        'PRESENTED_ACK'
      );
      presented.push(presentationRecord);
    }

    fairCursor = nextCursor % n;

    return {
      ok: true,
      presented,
      drawsUsed,
      bytesUploaded,
      timeSpentMs,
      budgetDeferrals,
      rejectedStaleLeases
    };
  }

  /**
   * Allocates or updates a bounded warm presentation resource for a surface,
   * automatically evicting the oldest warm resource if the surface cap is exceeded (§10).
   */
  function allocateWarmResource(surfaceId, resourceId, bytes = 0) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    const safeBytes = Number.isSafeInteger(bytes) && bytes > 0 ? bytes : 0;
    if (entry.warmResources.has(resourceId)) {
      const prev = entry.warmResources.get(resourceId);
      entry.metrics.warmResourceBytes = Math.max(0, entry.metrics.warmResourceBytes - (prev?.bytes || 0));
      entry.warmResources.delete(resourceId);
    }
    entry.warmResources.set(resourceId, { resourceId, bytes: safeBytes, allocatedAtMs: clock() });
    entry.metrics.warmResourceBytes += safeBytes;
    trimWarmResources(entry, budget.maxWarmResourcesPerSurface);
    return {
      ok: true,
      warmResourceCount: entry.warmResources.size,
      warmResourceBytes: entry.metrics.warmResourceBytes
    };
  }

  /**
   * Handles presentation GPU/canvas context loss: clears pending mailbox and presentation-owned
   * warm resources while preserving the authoritative capture lease (§10).
   */
  function onContextLost(surfaceId) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    entry.state = {
      ...entry.state,
      contextLost: true
    };
    if (entry.mailbox !== null) {
      entry.minAdmissibleFrameGen = Math.max(entry.minAdmissibleFrameGen, entry.mailbox.frameGeneration);
      emitLeaseRelease(entry.surfaceId, entry.mailbox.leaseId, entry.mailbox.frameGeneration, 'CONTEXT_LOST_DRAIN');
      entry.mailbox = null;
    }
    trimWarmResources(entry, 0);
    return {
      ok: true,
      contextLost: true,
      captureLeaseRetained: entry.captureLeaseActive
    };
  }

  /**
   * Restores presentation context and requests newest generation beyond any lost/captured frames.
   */
  function onContextRestored(surfaceId) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.destroyed) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_DESTROYED };
    }
    entry.state = {
      ...entry.state,
      contextLost: false
    };
    const afterFrameGeneration = Math.max(
      entry.lastPresentedFrameGen,
      entry.minAdmissibleFrameGen,
      entry.lastCaptureGeneration
    );
    entry.minAdmissibleFrameGen = afterFrameGeneration;
    if (onRequestNewestGeneration) {
      onRequestNewestGeneration({
        surfaceId: entry.surfaceId,
        surfaceGeneration: entry.surfaceGeneration,
        epoch: entry.epoch,
        afterFrameGeneration
      });
    }
    return {
      ok: true,
      contextLost: false,
      requestedAfterFrameGeneration: afterFrameGeneration
    };
  }

  /**
   * Explicitly destroys a surface on terminal backend snapshot, releasing mailbox,
   * warm resources, and marking the capture lease terminated (§6).
   */
  function destroySurface(surfaceId) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return { ok: false, reason: SCHEDULER_REASONS.SURFACE_NOT_REGISTERED };
    }
    if (entry.mailbox !== null) {
      emitLeaseRelease(entry.surfaceId, entry.mailbox.leaseId, entry.mailbox.frameGeneration, 'SURFACE_DESTROYED');
      entry.mailbox = null;
    }
    trimWarmResources(entry, 0);
    entry.destroyed = true;
    entry.captureLeaseActive = false;
    return {
      ok: true,
      destroyed: true
    };
  }

  /**
   * Returns per-surface instrumentation and resource ledger counters (§10).
   */
  function getInstrumentation(surfaceId) {
    const entry = surfaces.get(surfaceId);
    if (!entry) {
      return null;
    }
    const eligibility = evaluateDrawableEligibility(entry.state);
    return Object.freeze({
      surfaceId: entry.surfaceId,
      surfaceGeneration: entry.surfaceGeneration,
      epoch: entry.epoch,
      destroyed: entry.destroyed,
      folded: entry.state.folded === true,
      contextLost: entry.state.contextLost === true,
      eligible: eligibility.eligible,
      box: eligibility.box,
      captureLeaseId: entry.captureLeaseId,
      captureLeaseActive: entry.captureLeaseActive,
      lastCaptureGeneration: entry.lastCaptureGeneration,
      lastPresentedFrameGen: entry.lastPresentedFrameGen,
      pendingMailboxFrameGen: entry.mailbox ? entry.mailbox.frameGeneration : null,
      warmResourceCount: entry.warmResources.size,
      warmResourceBytes: entry.metrics.warmResourceBytes,
      reclaimedWarmResources: entry.metrics.reclaimedWarmResources,
      captureCount: entry.metrics.captureCount,
      decodeCount: entry.metrics.decodeCount,
      presentCount: entry.metrics.presentCount,
      drawSubmissions: entry.metrics.drawSubmissions,
      uploadSubmissions: entry.metrics.uploadSubmissions,
      bytesUploadedTotal: entry.metrics.bytesUploadedTotal,
      mailboxReplacements: entry.metrics.mailboxReplacements,
      rejectedHiddenDraws: entry.metrics.rejectedHiddenDraws,
      rejectedStaleFrames: entry.metrics.rejectedStaleFrames,
      lastPresentAgeMs: entry.metrics.lastPresentAgeMs,
      inputToPresentMs: entry.metrics.inputToPresentMs,
      timingScopes: Object.freeze({ ...entry.metrics.timingScopes })
    });
  }

  return Object.freeze({
    budget,
    registerSurface,
    recordCaptureWitness,
    submitFrame,
    foldSurface,
    unfoldSurface,
    updateSurfaceState,
    presentSurfaceNow,
    runTick,
    allocateWarmResource,
    onContextLost,
    onContextRestored,
    destroySurface,
    getInstrumentation
  });
}
