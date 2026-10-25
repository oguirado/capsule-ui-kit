<script>
/**
 * @fileoverview DispatchResults component controller, correlation contract verifier,
 * non-authoritative IntentStatus projection, witness verification guard, and semantic registry synchronizer.
 * Grounded in UI_ARCHITECTURE.md §§3, 4, 6 (G5), 7, 8, 9, 10, 12, and 13.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product-specific simulation imports.
 */

export const DISPATCH_RESULTS_SCHEMA = 'capsule-ui-kit.dispatch-results/v1';

export const ALLOWED_TARGET_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'queued',
  'executing',
  'waiting-permission',
  'waiting-input',
  'completed-unverified',
  'verified-success',
  'verified-failure',
  'refused',
  'cancelled',
  'uncertain'
]);

export const TERMINAL_FAILURE_RETRYABLE_STATUSES = Object.freeze([
  'verified-failure',
  'refused',
  'cancelled'
]);

export const CANCELLABLE_IN_FLIGHT_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'queued',
  'executing',
  'waiting-permission',
  'waiting-input'
]);

export const VERIFIED_STATUSES = Object.freeze(['verified-success', 'verified-failure']);

const DEFAULT_MAX_STREAM_BYTES = 262144;

/**
 * @typedef {'pending' | 'accepted' | 'queued' | 'executing' | 'waiting-permission' | 'waiting-input' | 'completed-unverified' | 'verified-success' | 'verified-failure' | 'refused' | 'cancelled' | 'uncertain'} TargetRunStatus
 */

/**
 * @typedef {Object} CorrelatedTargetRun
 * @property {string} requestId - Immutable parent dispatch identity.
 * @property {string} sessionId - Immutable target session identity.
 * @property {string} capsuleId - Bound capsule identity.
 * @property {string} slotId - Target slot identity.
 * @property {number} generation - Monotonic slot/session generation integer.
 * @property {string} runId - Correlated per-target run identifier.
 * @property {TargetRunStatus} status - Current non-authoritative run status.
 * @property {readonly string[]} streamedChunks - Bounded plain-text output chunks.
 * @property {number} streamedBytes - Total UTF-8 byte length of streamed output.
 * @property {boolean} adapterCompleted - Whether adapter work completed (distinct from verified outcome).
 * @property {boolean} cliWithoutCompletionWitness - True when CLI adapter lacks a structured completion witness.
 * @property {string | null} permissionRequestId - Exact permission request reference when waiting-permission.
 * @property {string | null} verifiedReceiptId - Core verified receipt identifier (null until verified).
 * @property {string | null} witnessStateSha256 - Authoritative state SHA-256 witness (required for verification).
 * @property {number | null} witnessTick - Authoritative lockstep tick witness (required for verification).
 * @property {string | null} refusalCode - Refusal or failure code if refused/failed.
 * @property {string | null} refusalMessage - Full refusal or verification failure message.
 * @property {boolean} cancelRequested - Whether explicit Stop-this-run cancellation was requested.
 */

/**
 * @typedef {Object} CorrelatedDispatchRecord
 * @property {string} requestId - Literal or G2-derived deterministic request identity.
 * @property {string} workspaceId - Workspace scope identifier.
 * @property {number} epoch - Service/projection epoch integer.
 * @property {string} promptText - Frozen prompt text.
 * @property {string} promptSha256 - Frozen prompt SHA-256 hex digest.
 * @property {readonly string[]} targetIds - Ordered frozen target session IDs.
 * @property {string | null} parentRequestId - Linked parent dispatch ID when created via guarded retry.
 * @property {'admitting' | 'rejected' | 'accepted'} phase - High-level admission phase.
 * @property {string | null} refusalAlert - Full refusal text for named alert region (`alerts/dispatch-{did}`).
 * @property {Readonly<Record<string, CorrelatedTargetRun>>} targets - Per-target correlated run records.
 */

/**
 * Preserves live-surface DOM focus when clicking adjacent chrome controls (§6 G5).
 * Calls `preventDefault()` on `pointerdown` / `mousedown` while leaving click and keyboard activation intact.
 *
 * @param {{ preventDefault?: () => void } | null | undefined} event
 * @returns {{ preservedLiveFocus: boolean }}
 */
export function preserveLiveSurfaceFocusOnPointerDown(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
    return { preservedLiveFocus: true };
  }
  return { preservedLiveFocus: false };
}

/**
 * Validates that an identifier is a non-empty immutable string and not a bare numeric index (§9).
 *
 * @param {unknown} id
 * @param {string} fieldName
 * @returns {{ ok: true, value: string } | { ok: false, code: string, message: string }}
 */
export function validateImmutableEntityId(id, fieldName) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ID',
      message: `${fieldName} must be a non-empty string.`
    };
  }
  if (id !== id.trim() || /\s/.test(id)) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ID',
      message: `${fieldName} must not contain whitespace.`
    };
  }
  if (/^\d+$/.test(id)) {
    return {
      ok: false,
      code: 'SCHEMA_NUMERIC_INDEX_ID',
      message: `${fieldName} must be an immutable identifier, never a numeric index or list length.`
    };
  }
  return { ok: true, value: id };
}

/**
 * Checks whether a target run record carries a complete, valid core verification witness
 * (`verifiedReceiptId`, `witnessStateSha256`, and non-negative integer `witnessTick`).
 *
 * @param {Partial<CorrelatedTargetRun> | null | undefined} targetRun
 * @returns {boolean}
 */
export function hasCompleteVerificationWitness(targetRun) {
  if (!targetRun || typeof targetRun !== 'object') {
    return false;
  }
  return (
    typeof targetRun.verifiedReceiptId === 'string' &&
    targetRun.verifiedReceiptId.trim().length > 0 &&
    typeof targetRun.witnessStateSha256 === 'string' &&
    targetRun.witnessStateSha256.trim().length > 0 &&
    typeof targetRun.witnessTick === 'number' &&
    Number.isSafeInteger(targetRun.witnessTick) &&
    targetRun.witnessTick >= 0
  );
}

/**
 * Classifies a correlated target run into its UI verification and actionability projection.
 * Enforces the §7 / §13 invariant that core acceptance, streaming output, or adapter completion
 * NEVER appears verified without an authenticated core receipt and state/tick witness.
 *
 * @param {CorrelatedTargetRun} targetRun
 */
export function classifyTargetOutcomeView(targetRun) {
  const status = targetRun.status;
  const witnessPresent = hasCompleteVerificationWitness(targetRun);
  const isVerified = VERIFIED_STATUSES.includes(status) && witnessPresent;
  const appearsVerified = isVerified;
  const isAccepted =
    status === 'accepted' ||
    status === 'executing' ||
    status === 'completed-unverified' ||
    status === 'verified-success' ||
    status === 'verified-failure';
  const isAdapterCompleted = Boolean(targetRun.adapterCompleted);

  let verificationState = 'unverified-pending';
  let verificationBadge = 'Pending Admission';

  if (isVerified && status === 'verified-success') {
    verificationState = 'verified-success';
    verificationBadge = 'Verified Success';
  } else if (isVerified && status === 'verified-failure') {
    verificationState = 'verified-failure';
    verificationBadge = 'Verified Failure';
  } else if (targetRun.cliWithoutCompletionWitness) {
    verificationState = 'outcome-unknown-unverified';
    verificationBadge = 'Outcome Unknown (Unverified CLI)';
  } else if (status === 'completed-unverified') {
    verificationState = 'adapter-completed-unverified';
    verificationBadge = 'Adapter Completed — Unverified';
  } else if (status === 'accepted') {
    verificationState = 'unverified-accepted';
    verificationBadge = 'Accepted — Unverified';
  } else if (status === 'queued') {
    verificationState = 'unverified-queued';
    verificationBadge = 'Queued — Unverified';
  } else if (status === 'executing') {
    verificationState = targetRun.cancelRequested
      ? 'cancel-requested-in-flight'
      : 'unverified-executing';
    verificationBadge = targetRun.cancelRequested
      ? 'Cancel Requested — In Flight'
      : 'Executing — Unverified';
  } else if (status === 'waiting-permission') {
    verificationState = 'waiting-permission';
    verificationBadge = 'Waiting Permission';
  } else if (status === 'waiting-input') {
    verificationState = 'waiting-input';
    verificationBadge = 'Waiting Input';
  } else if (status === 'uncertain') {
    verificationState = 'uncertain-reconcile-required';
    verificationBadge = 'Uncertain — Reconcile Required';
  } else if (status === 'refused') {
    verificationState = 'refused';
    verificationBadge = 'Refused';
  } else if (status === 'cancelled') {
    verificationState = 'cancelled';
    verificationBadge = 'Cancelled';
  }

  const retryAllowed = TERMINAL_FAILURE_RETRYABLE_STATUSES.includes(status);
  let retryUnavailableReason = '';
  if (!retryAllowed) {
    if (status === 'uncertain') {
      retryUnavailableReason = 'Uncertain outcome requires journal reconciliation before retry';
    } else if (status === 'verified-success') {
      retryUnavailableReason = 'Verified successful target is never rerun';
    } else if (status === 'accepted') {
      retryUnavailableReason = 'Accepted target is not verified or terminal; retry unavailable';
    } else if (status === 'completed-unverified') {
      retryUnavailableReason = 'Adapter-completed target awaits core verification; retry unavailable';
    } else {
      retryUnavailableReason = `Retry unavailable while target status is ${status}`;
    }
  }

  const cancelAllowed =
    CANCELLABLE_IN_FLIGHT_STATUSES.includes(status) && !targetRun.cancelRequested;
  let cancelUnavailableReason = '';
  if (!cancelAllowed) {
    if (targetRun.cancelRequested && status !== 'cancelled') {
      cancelUnavailableReason = 'Cancellation already requested; awaiting core terminal outcome';
    } else {
      cancelUnavailableReason = `Cancel unavailable in status ${status}`;
    }
  }

  return Object.freeze({
    status,
    isAccepted,
    isAdapterCompleted,
    isVerified,
    appearsVerified,
    verificationState,
    verificationBadge,
    retryAllowed,
    retryUnavailableReason,
    cancelAllowed,
    cancelUnavailableReason
  });
}

/**
 * Synchronizes all semantic controls owned by DispatchResults into a window-scoped `controlRegistry` (§9).
 * Enforces the rule that hidden controls have `visible: false` and `box: null` (no fabricated boxes).
 *
 * @param {ReturnType<typeof createDispatchResultsController>} controller
 * @param {{ register: (input: any) => any }} registry
 * @param {{
 *   presentationInstance?: string,
 *   epoch: number,
 *   generation?: number,
 *   visible?: boolean,
 *   measureBox?: (anchor: string) => { x: number, y: number, width: number, height: number } | null
 * }} options
 * @returns {Array<any>}
 */
export function syncDispatchResultsToRegistry(controller, registry, options) {
  const isVisible = options.visible !== false;
  const presentationInstance = options.presentationInstance || 'dispatch-results-view';
  const epoch = options.epoch;
  const generation = options.generation ?? 1;
  const measureBox = typeof options.measureBox === 'function' ? options.measureBox : () => null;

  const inventory = controller.getSemanticControlInventory();
  const registeredRecords = [];

  for (const item of inventory) {
    const box = isVisible ? measureBox(item.anchor) : null;
    const record = registry.register({
      semanticAnchor: item.anchor,
      entityId: item.entityId,
      presentationInstance,
      controlSlot: item.controlSlot,
      role: item.role,
      accessibleName: item.accessibleName,
      state: {
        disabled: Boolean(item.disabled),
        appearsVerified: Boolean(item.appearsVerified),
        verificationState: item.verificationState || 'none',
        ...(item.reason ? { unavailableReason: item.reason } : {})
      },
      visible: isVisible,
      materialized: isVisible,
      inDom: true,
      box,
      epoch,
      generation
    });
    registeredRecords.push(record);
  }

  return registeredRecords;
}

/**
 * Creates a DispatchResults controller enforcing request correlation, non-authoritative IntentStatus,
 * witness-gated verification, uncertainty reconciliation, and guarded retry staging (§4, §7, §9, §12, §13).
 *
 * @param {Object} [config]
 * @param {number} [config.maxStreamBytes]
 * @param {(requestId: string, sessionId: string) => void} [config.onCancelRun]
 * @param {(stagedRetry: { parentRequestId: string, targetIds: string[], promptText: string, requiresExplicitReview: true, autoSubmitted: false }) => void} [config.onStageRetry]
 */
export function createDispatchResultsController(config = {}) {
  const maxStreamBytes = config.maxStreamBytes ?? DEFAULT_MAX_STREAM_BYTES;
  const onCancelRun = typeof config.onCancelRun === 'function' ? config.onCancelRun : null;
  const onStageRetry = typeof config.onStageRetry === 'function' ? config.onStageRetry : null;

  /** @type {Map<string, CorrelatedDispatchRecord>} */
  const dispatchesById = new Map();

  /**
   * @param {CorrelatedTargetRun} tr
   * @returns {CorrelatedTargetRun}
   */
  function snapshotTarget(tr) {
    return Object.freeze({
      ...tr,
      streamedChunks: Object.freeze([...tr.streamedChunks])
    });
  }

  /**
   * @param {CorrelatedDispatchRecord} disp
   * @returns {CorrelatedDispatchRecord}
   */
  function snapshotDispatch(disp) {
    /** @type {Record<string, CorrelatedTargetRun>} */
    const targetsCopy = {};
    for (const [sid, tr] of Object.entries(disp.targets)) {
      targetsCopy[sid] = snapshotTarget(tr);
    }
    return Object.freeze({
      ...disp,
      targetIds: Object.freeze([...disp.targetIds]),
      targets: Object.freeze(targetsCopy)
    });
  }

  /**
   * Internal helper to verify `(requestId, sessionId?, epoch?)` correlation against registered dispatches.
   *
   * @param {{ requestId?: unknown, sessionId?: unknown, runId?: unknown, epoch?: unknown }} event
   * @param {{ requireSession?: boolean }} [opts]
   */
  function verifyCorrelation(event, opts = {}) {
    if (!event || typeof event !== 'object') {
      return {
        ok: false,
        code: 'CORRELATION_INVALID_EVENT',
        message: 'Correlation event must be a plain object.'
      };
    }
    if (typeof event.requestId !== 'string' || event.requestId.trim().length === 0) {
      return {
        ok: false,
        code: 'CORRELATION_MISSING_REQUEST_ID',
        message: 'Correlation requires a non-empty requestId.'
      };
    }
    const disp = dispatchesById.get(event.requestId);
    if (!disp) {
      return {
        ok: false,
        code: 'CORRELATION_UNKNOWN_DISPATCH',
        message: `Unknown dispatch requestId "${event.requestId}".`
      };
    }
    if (event.epoch !== undefined) {
      if (
        typeof event.epoch !== 'number' ||
        !Number.isSafeInteger(event.epoch) ||
        event.epoch !== disp.epoch
      ) {
        return {
          ok: false,
          code: 'CORRELATION_EPOCH_MISMATCH',
          message: `Event epoch (${String(event.epoch)}) does not match dispatch epoch (${disp.epoch}).`
        };
      }
    }
    if (opts.requireSession) {
      if (typeof event.sessionId !== 'string' || event.sessionId.trim().length === 0) {
        return {
          ok: false,
          code: 'CORRELATION_MISSING_TARGET',
          message: 'Target sessionId is required for target-scoped dispatch correlation.'
        };
      }
      const tr = disp.targets[event.sessionId];
      if (!tr || !disp.targetIds.includes(event.sessionId)) {
        return {
          ok: false,
          code: 'CORRELATION_UNKNOWN_TARGET',
          message: `Target session "${event.sessionId}" is not in the frozen target set of dispatch "${disp.requestId}".`
        };
      }
      if (event.runId !== undefined && event.runId !== null && event.runId !== tr.runId) {
        return {
          ok: false,
          code: 'CORRELATION_RUN_MISMATCH',
          message: `Event runId "${String(event.runId)}" does not match correlated target runId "${tr.runId}".`
        };
      }
      return { ok: true, dispatch: disp, target: tr };
    }
    return { ok: true, dispatch: disp, target: null };
  }

  return Object.freeze({
    /**
     * Registers or synchronizes a correlated dispatch record into the results view.
     *
     * @param {Record<string, unknown>} raw
     */
    registerDispatch(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return {
          ok: false,
          code: 'SCHEMA_INVALID_DISPATCH',
          message: 'Dispatch registration input must be a plain object.'
        };
      }
      const reqIdCheck = validateImmutableEntityId(raw.requestId, 'requestId');
      if (!reqIdCheck.ok) {
        return reqIdCheck;
      }
      const wsIdCheck = validateImmutableEntityId(raw.workspaceId ?? 'ws-default', 'workspaceId');
      if (!wsIdCheck.ok) {
        return wsIdCheck;
      }
      const epoch = raw.epoch === undefined ? 1 : raw.epoch;
      if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 0) {
        return {
          ok: false,
          code: 'SCHEMA_INVALID_EPOCH',
          message: 'Dispatch epoch must be a non-negative safe integer.'
        };
      }
      if (!Array.isArray(raw.targetIds) || raw.targetIds.length === 0) {
        return {
          ok: false,
          code: 'SCHEMA_EMPTY_TARGETS',
          message: 'Dispatch must declare at least one explicit frozen targetId.'
        };
      }

      const seenTargets = new Set();
      /** @type {string[]} */
      const validatedTargetIds = [];
      for (const sid of raw.targetIds) {
        const sidCheck = validateImmutableEntityId(sid, 'targetId');
        if (!sidCheck.ok) {
          return sidCheck;
        }
        if (seenTargets.has(sidCheck.value)) {
          return {
            ok: false,
            code: 'SCHEMA_DUPLICATE_TARGET',
            message: `Duplicate target sessionId "${sidCheck.value}" in dispatch.`
          };
        }
        seenTargets.add(sidCheck.value);
        validatedTargetIds.push(sidCheck.value);
      }

      const rawTargets =
        raw.targets && typeof raw.targets === 'object' && !Array.isArray(raw.targets)
          ? /** @type {Record<string, any>} */ (raw.targets)
          : {};

      /** @type {Record<string, CorrelatedTargetRun>} */
      const targetRuns = {};
      for (const sid of validatedTargetIds) {
        const item = rawTargets[sid] || {};
        const status =
          typeof item.status === 'string' && ALLOWED_TARGET_STATUSES.includes(item.status)
            ? item.status
            : 'pending';
        const chunks = Array.isArray(item.streamedChunks)
          ? item.streamedChunks.filter((c) => typeof c === 'string')
          : [];
        const bytes = chunks.reduce((acc, c) => acc + Buffer.byteLength(c, 'utf8'), 0);

        targetRuns[sid] = {
          requestId: reqIdCheck.value,
          sessionId: sid,
          capsuleId:
            typeof item.capsuleId === 'string' && item.capsuleId.trim().length > 0
              ? item.capsuleId
              : `cap-${sid}`,
          slotId:
            typeof item.slotId === 'string' && item.slotId.trim().length > 0
              ? item.slotId
              : `slot-${sid}`,
          generation:
            typeof item.generation === 'number' && Number.isSafeInteger(item.generation) && item.generation >= 0
              ? item.generation
              : 1,
          runId:
            typeof item.runId === 'string' && item.runId.trim().length > 0
              ? item.runId
              : `run-${reqIdCheck.value}-${sid}`,
          status,
          streamedChunks: chunks,
          streamedBytes: bytes,
          adapterCompleted: Boolean(item.adapterCompleted),
          cliWithoutCompletionWitness: Boolean(item.cliWithoutCompletionWitness),
          permissionRequestId:
            typeof item.permissionRequestId === 'string' ? item.permissionRequestId : null,
          verifiedReceiptId:
            typeof item.verifiedReceiptId === 'string' ? item.verifiedReceiptId : null,
          witnessStateSha256:
            typeof item.witnessStateSha256 === 'string' ? item.witnessStateSha256 : null,
          witnessTick:
            typeof item.witnessTick === 'number' && Number.isSafeInteger(item.witnessTick)
              ? item.witnessTick
              : null,
          refusalCode: typeof item.refusalCode === 'string' ? item.refusalCode : null,
          refusalMessage: typeof item.refusalMessage === 'string' ? item.refusalMessage : null,
          cancelRequested: Boolean(item.cancelRequested)
        };
      }

      /** @type {CorrelatedDispatchRecord} */
      const record = {
        requestId: reqIdCheck.value,
        workspaceId: wsIdCheck.value,
        epoch,
        promptText: typeof raw.promptText === 'string' ? raw.promptText : '',
        promptSha256: typeof raw.promptSha256 === 'string' ? raw.promptSha256 : '',
        targetIds: validatedTargetIds,
        parentRequestId:
          typeof raw.parentRequestId === 'string' && raw.parentRequestId.trim().length > 0
            ? raw.parentRequestId
            : null,
        phase:
          raw.phase === 'accepted' || raw.phase === 'rejected' ? raw.phase : 'admitting',
        refusalAlert: typeof raw.refusalAlert === 'string' ? raw.refusalAlert : null,
        targets: targetRuns
      };

      dispatchesById.set(record.requestId, record);
      return { ok: true, dispatch: snapshotDispatch(record) };
    },

    /**
     * Correlates core acceptance for a dispatch (`Admitting / core accepted`).
     * Transitions pending targets to `accepted`.
     * Enforces §4 ("acknowledgements never patch projection") and §7/§13 ("Acceptance is not execution completion", "acceptance cannot appear verified").
     *
     * @param {{ requestId: string, epoch?: number }} event
     */
    correlateCoreAcceptance(event) {
      const corr = verifyCorrelation(event, { requireSession: false });
      if (!corr.ok) {
        return corr;
      }
      const disp = corr.dispatch;
      disp.phase = 'accepted';
      for (const sid of disp.targetIds) {
        const tr = disp.targets[sid];
        if (tr.status === 'pending') {
          tr.status = 'accepted';
        }
      }
      return Object.freeze({
        ok: true,
        dispatch: snapshotDispatch(disp),
        patchedProjection: false,
        appearsVerified: false
      });
    },

    /**
     * Correlates core admission refusal (`Admitting / core refusal`).
     * Records full refusal text in named alert (`alerts/dispatch-{did}`).
     *
     * @param {{ requestId: string, epoch?: number, code: string, message: string, sessionId?: string }} event
     */
    correlateCoreRefusal(event) {
      const hasSession = typeof event?.sessionId === 'string' && event.sessionId.length > 0;
      const corr = verifyCorrelation(event, { requireSession: hasSession });
      if (!corr.ok) {
        return corr;
      }
      const code =
        typeof event.code === 'string' && event.code.trim().length > 0
          ? event.code
          : 'CORE_REFUSED';
      const msg =
        typeof event.message === 'string' && event.message.trim().length > 0
          ? event.message
          : 'Core refused dispatch admission.';

      const disp = corr.dispatch;
      disp.refusalAlert = `${code}: ${msg}`;

      if (hasSession && corr.target) {
        corr.target.status = 'refused';
        corr.target.refusalCode = code;
        corr.target.refusalMessage = msg;
      } else {
        disp.phase = 'rejected';
        for (const sid of disp.targetIds) {
          const tr = disp.targets[sid];
          tr.status = 'refused';
          tr.refusalCode = code;
          tr.refusalMessage = msg;
        }
      }

      return Object.freeze({
        ok: true,
        dispatch: snapshotDispatch(disp),
        patchedProjection: false,
        appearsVerified: false
      });
    },

    /**
     * Correlates a streamed output chunk to `(requestId, sessionId, runId)`.
     * Enforces §7 & §9 rules:
     * - Text is inert display data only: never mints control events, never escalates capability, and never marks a run verified.
     * - New output never steals focus or scroll (`stoleFocus: false`, `stoleScroll: false`).
     * - No token-by-token live announcements (`announcedToken: false`).
     *
     * @param {{ requestId: string, sessionId: string, runId?: string, epoch?: number, chunkText: string }} event
     */
    correlateStreamChunk(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      if (typeof event.chunkText !== 'string') {
        return {
          ok: false,
          code: 'STREAM_CHUNK_NOT_STRING',
          message: 'Streamed chunk must be a string.'
        };
      }
      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      const byteLength = Buffer.byteLength(event.chunkText, 'utf8');
      if (tr.streamedBytes + byteLength > maxStreamBytes) {
        return {
          ok: false,
          code: 'STREAM_RESULT_OVER_BOUND',
          message: `Streamed output for "${tr.sessionId}" exceeds bounded cap (${maxStreamBytes} bytes).`
        };
      }
      if (tr.status === 'accepted' || tr.status === 'pending') {
        tr.status = 'executing';
      }
      tr.streamedChunks = [...tr.streamedChunks, event.chunkText];
      tr.streamedBytes += byteLength;

      const view = classifyTargetOutcomeView(tr);
      return Object.freeze({
        ok: true,
        target: snapshotTarget(tr),
        patchedProjection: false,
        mintedControlEvents: 0,
        escalatedCapability: false,
        appearsVerified: view.appearsVerified,
        stoleFocus: false,
        stoleScroll: false,
        announcedToken: false
      });
    },

    /**
     * Correlates target attention state (`waiting-permission` or `waiting-input`, §7).
     * Requires exact `permissionRequestId` for `waiting-permission`; never auto-answers or overwrites prompt.
     *
     * @param {{ requestId: string, sessionId: string, epoch?: number, attentionState: 'waiting-permission' | 'waiting-input', permissionRequestId?: string }} event
     */
    correlateTargetAttention(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      if (
        event.attentionState !== 'waiting-permission' &&
        event.attentionState !== 'waiting-input'
      ) {
        return {
          ok: false,
          code: 'ATTENTION_INVALID_STATE',
          message: 'attentionState must be "waiting-permission" or "waiting-input".'
        };
      }
      if (
        event.attentionState === 'waiting-permission' &&
        (typeof event.permissionRequestId !== 'string' ||
          event.permissionRequestId.trim().length === 0)
      ) {
        return {
          ok: false,
          code: 'ATTENTION_MISSING_PERMISSION_REQUEST_ID',
          message: 'waiting-permission requires an exact permissionRequestId reference.'
        };
      }
      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      tr.status = event.attentionState;
      tr.permissionRequestId =
        event.attentionState === 'waiting-permission' ? event.permissionRequestId ?? null : null;

      return Object.freeze({
        ok: true,
        target: snapshotTarget(tr),
        autoAnswered: false,
        promptOverwritten: false,
        appearsVerified: false
      });
    },

    /**
     * Correlates adapter completion separately from verified outcome (§7:234, 254).
     * Refuses completion inferred from output silence, ANSI title changes, or regex matches.
     * For CLI-only adapters lacking a structured completion witness, marks `cliWithoutCompletionWitness: true`
     * so the outcome is shown as unknown/unverified.
     *
     * @param {{
     *   requestId: string,
     *   sessionId: string,
     *   epoch?: number,
     *   hasStructuredCompletionWitness?: boolean,
     *   quietOutputOnly?: boolean,
     *   ansiTitleOnly?: boolean,
     *   regexMatchOnly?: boolean
     * }} event
     */
    correlateAdapterCompletion(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      if (event.quietOutputOnly || event.ansiTitleOnly || event.regexMatchOnly) {
        return {
          ok: false,
          code: 'COMPLETION_SENTINEL_REJECTED',
          message:
            'Output silence, ANSI title changes, or regex heuristics cannot establish adapter completion (§7).'
        };
      }
      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      if (event.hasStructuredCompletionWitness === false) {
        tr.cliWithoutCompletionWitness = true;
        tr.adapterCompleted = false;
        return Object.freeze({
          ok: true,
          target: snapshotTarget(tr),
          appearsVerified: false
        });
      }

      tr.adapterCompleted = true;
      tr.cliWithoutCompletionWitness = false;
      if (!VERIFIED_STATUSES.includes(tr.status)) {
        tr.status = 'completed-unverified';
      }
      return Object.freeze({
        ok: true,
        target: snapshotTarget(tr),
        appearsVerified: false
      });
    },

    /**
     * Correlates an authoritative core receipt (`Completed / verified core receipt`, §7:235, §13:391).
     * Refuses transport-ack-only, pixel-diff-only, or missing `receiptId`/`stateSha256`/`tick` witnesses.
     * Only transitions to `verified-success` or `verified-failure` when the complete witness is valid.
     *
     * @param {{
     *   requestId: string,
     *   sessionId: string,
     *   epoch?: number,
     *   receiptId: string,
     *   verified: boolean,
     *   stateSha256: string,
     *   tick: number,
     *   pixelDiffOnly?: boolean,
     *   transportAckOnly?: boolean,
     *   failureReason?: string
     * }} event
     */
    correlateVerifiedReceipt(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      if (event.transportAckOnly) {
        return {
          ok: false,
          code: 'ACCEPTANCE_NOT_VERIFIED',
          message: 'Transport acknowledgement or core acceptance cannot appear verified (§7, §13).'
        };
      }
      if (event.pixelDiffOnly) {
        return {
          ok: false,
          code: 'RECEIPT_PIXEL_DIFF_INSUFFICIENT',
          message: 'A pixel difference alone cannot verify domain outcome; state/tick witness is required (§7).'
        };
      }
      if (
        typeof event.receiptId !== 'string' ||
        event.receiptId.trim().length === 0 ||
        typeof event.stateSha256 !== 'string' ||
        event.stateSha256.trim().length === 0 ||
        typeof event.tick !== 'number' ||
        !Number.isSafeInteger(event.tick) ||
        event.tick < 0 ||
        typeof event.verified !== 'boolean'
      ) {
        return {
          ok: false,
          code: 'RECEIPT_MISSING_WITNESS',
          message:
            'Verified receipt requires non-empty receiptId, stateSha256 witness, boolean verified flag, and non-negative safe integer tick.'
        };
      }

      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      tr.verifiedReceiptId = event.receiptId;
      tr.witnessStateSha256 = event.stateSha256;
      tr.witnessTick = event.tick;
      tr.cliWithoutCompletionWitness = false;

      if (event.verified) {
        tr.status = 'verified-success';
        tr.refusalCode = null;
        tr.refusalMessage = null;
      } else {
        tr.status = 'verified-failure';
        tr.refusalCode = 'VERIFICATION_FAILED';
        tr.refusalMessage =
          typeof event.failureReason === 'string' && event.failureReason.trim().length > 0
            ? event.failureReason
            : 'Core receipt verification failed against state/tick witness.';
      }

      const view = classifyTargetOutcomeView(tr);
      return Object.freeze({
        ok: true,
        target: snapshotTarget(tr),
        appearsVerified: view.appearsVerified
      });
    },

    /**
     * Marks in-flight targets as `uncertain` on disconnect or lost reply (§7:236).
     * Never automatically resends under a new request ID; requires journal reconciliation by original `requestId`.
     *
     * @param {{ requestId: string, sessionId?: string, epoch?: number }} event
     */
    correlateDisconnectOrLostReply(event) {
      const hasSession = typeof event?.sessionId === 'string' && event.sessionId.length > 0;
      const corr = verifyCorrelation(event, { requireSession: hasSession });
      if (!corr.ok) {
        return corr;
      }
      const disp = corr.dispatch;
      const terminalStatuses = new Set([
        'verified-success',
        'verified-failure',
        'refused',
        'cancelled'
      ]);

      if (hasSession && corr.target) {
        if (!terminalStatuses.has(corr.target.status)) {
          corr.target.status = 'uncertain';
        }
      } else {
        for (const sid of disp.targetIds) {
          const tr = disp.targets[sid];
          if (!terminalStatuses.has(tr.status)) {
            tr.status = 'uncertain';
          }
        }
      }

      return Object.freeze({
        ok: true,
        dispatch: snapshotDispatch(disp),
        reconcileByRequestId: disp.requestId,
        autoResentUnderNewId: false
      });
    },

    /**
     * Reconciles an `uncertain` target run from the authoritative journal by original `requestId` (§7:236, 238).
     *
     * @param {{
     *   requestId: string,
     *   sessionId: string,
     *   epoch?: number,
     *   journalOutcome: 'verified-success' | 'verified-failure' | 'refused' | 'cancelled',
     *   receiptId?: string,
     *   stateSha256?: string,
     *   tick?: number,
     *   failureReason?: string
     * }} event
     */
    reconcileUncertainTarget(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      if (tr.status !== 'uncertain') {
        return {
          ok: false,
          code: 'RECONCILE_TARGET_NOT_UNCERTAIN',
          message: `Target "${tr.sessionId}" is in status "${tr.status}", not "uncertain".`
        };
      }
      if (
        event.journalOutcome === 'verified-success' ||
        event.journalOutcome === 'verified-failure'
      ) {
        return this.correlateVerifiedReceipt({
          requestId: event.requestId,
          sessionId: event.sessionId,
          epoch: event.epoch,
          receiptId: event.receiptId ?? '',
          verified: event.journalOutcome === 'verified-success',
          stateSha256: event.stateSha256 ?? '',
          tick: event.tick ?? -1,
          failureReason: event.failureReason
        });
      }
      if (event.journalOutcome === 'cancelled') {
        tr.status = 'cancelled';
        return Object.freeze({
          ok: true,
          target: snapshotTarget(tr),
          appearsVerified: false
        });
      }
      if (event.journalOutcome === 'refused') {
        tr.status = 'refused';
        tr.refusalCode = 'RECONCILED_REFUSAL';
        tr.refusalMessage = event.failureReason ?? 'Reconciled refusal from journal.';
        return Object.freeze({
          ok: true,
          target: snapshotTarget(tr),
          appearsVerified: false
        });
      }
      return {
        ok: false,
        code: 'RECONCILE_INVALID_OUTCOME',
        message: `Unsupported journalOutcome "${String(event.journalOutcome)}".`
      };
    },

    /**
     * Submits an explicit cancel intent for a target run (`dispatch/{did}/target/{sid}/cancel`, `Stop-this-run`).
     * Distinct from stopping a session (`stoppedSession: false`) and never claims rollback of committed effects (`rolledBackCommittedEffects: false`, §7:237, 256).
     *
     * @param {{ requestId: string, sessionId: string, confirmedByCore?: boolean }} event
     */
    requestCancelRun(event) {
      const corr = verifyCorrelation(event, { requireSession: true });
      if (!corr.ok) {
        return corr;
      }
      const tr = /** @type {CorrelatedTargetRun} */ (corr.target);
      if (!CANCELLABLE_IN_FLIGHT_STATUSES.includes(tr.status)) {
        return {
          ok: false,
          code: 'CANCEL_NOT_IN_FLIGHT',
          message: `Target "${tr.sessionId}" is in status "${tr.status}" and cannot be cancelled.`
        };
      }
      tr.cancelRequested = true;
      if (event.confirmedByCore) {
        tr.status = 'cancelled';
      }
      if (onCancelRun) {
        onCancelRun(corr.dispatch.requestId, tr.sessionId);
      }
      return Object.freeze({
        ok: true,
        target: snapshotTarget(tr),
        rolledBackCommittedEffects: false,
        stoppedSession: false
      });
    },

    /**
     * Stages a guarded retry for explicitly selected failed targets (`dispatch/{did}/target/{sid}/retry`, §7:238).
     * Enforces negative contrasts:
     * - Uncertain targets are refused (`RETRY_UNCERTAIN_FORBIDDEN`).
     * - Verified successful targets are refused (`RETRY_SUCCESSFUL_FORBIDDEN`).
     * - Non-terminal targets (`accepted`, `executing`, `completed-unverified`, etc.) are refused (`RETRY_TARGET_NOT_TERMINAL_FAILURE`).
     * - Produces a staged retry linked to `parentRequestId` that requires explicit review before submission (`requiresExplicitReview: true`, `autoSubmitted: false`).
     *
     * @param {{ parentRequestId: string, retrySessionIds: readonly string[] }} event
     */
    requestRetryFailedTargets(event) {
      if (!event || typeof event !== 'object') {
        return {
          ok: false,
          code: 'RETRY_INVALID_EVENT',
          message: 'Retry request must be an object.'
        };
      }
      const corr = verifyCorrelation(
        { requestId: event.parentRequestId },
        { requireSession: false }
      );
      if (!corr.ok) {
        return corr;
      }
      if (!Array.isArray(event.retrySessionIds) || event.retrySessionIds.length === 0) {
        return {
          ok: false,
          code: 'RETRY_TARGETS_EMPTY',
          message: 'At least one explicit failed target sessionId is required for retry.'
        };
      }

      const disp = corr.dispatch;
      const deduplicated = [];
      const seen = new Set();

      for (const sid of event.retrySessionIds) {
        if (typeof sid !== 'string' || !disp.targets[sid]) {
          return {
            ok: false,
            code: 'CORRELATION_UNKNOWN_TARGET',
            message: `Target "${String(sid)}" is not part of dispatch "${disp.requestId}".`
          };
        }
        const tr = disp.targets[sid];
        if (tr.status === 'uncertain') {
          return {
            ok: false,
            code: 'RETRY_UNCERTAIN_FORBIDDEN',
            message: `Target "${sid}" is uncertain; reconcile journal by original requestId before retry (§7).`
          };
        }
        if (tr.status === 'verified-success') {
          return {
            ok: false,
            code: 'RETRY_SUCCESSFUL_FORBIDDEN',
            message: `Target "${sid}" already achieved verified-success; successful children are not rerun (§7).`
          };
        }
        if (!TERMINAL_FAILURE_RETRYABLE_STATUSES.includes(tr.status)) {
          return {
            ok: false,
            code: 'RETRY_TARGET_NOT_TERMINAL_FAILURE',
            message: `Target "${sid}" is in status "${tr.status}" and is not eligible for retry.`
          };
        }
        if (!seen.has(sid)) {
          seen.add(sid);
          deduplicated.push(sid);
        }
      }

      const stagedRetry = Object.freeze({
        parentRequestId: disp.requestId,
        targetIds: Object.freeze(deduplicated.sort()),
        promptText: disp.promptText,
        requiresExplicitReview: /** @type {true} */ (true),
        autoSubmitted: /** @type {false} */ (false)
      });

      if (onStageRetry) {
        onStageRetry(stagedRetry);
      }

      return Object.freeze({
        ok: true,
        stagedRetry
      });
    },

    /**
     * Returns a snapshot of a single correlated target run or null if not found.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @returns {CorrelatedTargetRun | null}
     */
    getTargetRun(requestId, sessionId) {
      const disp = dispatchesById.get(requestId);
      if (!disp || !disp.targets[sessionId]) {
        return null;
      }
      return snapshotTarget(disp.targets[sessionId]);
    },

    /**
     * Returns concatenated plain-text output for `output/{sid}/text` (§9).
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @returns {string}
     */
    getAccessibleOutputText(requestId, sessionId) {
      const disp = dispatchesById.get(requestId);
      if (!disp || !disp.targets[sessionId]) {
        return '';
      }
      return disp.targets[sessionId].streamedChunks.join('');
    },

    /**
     * Builds the declarative §9 semantic control inventory for all correlated dispatches.
     */
    getSemanticControlInventory() {
      const controls = [];
      const seenOutputSessionIds = new Set();

      for (const [did, disp] of dispatchesById.entries()) {
        if (disp.refusalAlert) {
          controls.push(
            Object.freeze({
              anchor: `alerts/dispatch-${did}`,
              entityId: `alert-dispatch-${did}`,
              controlSlot: 'refusal-alert',
              role: 'alert',
              accessibleName: disp.refusalAlert,
              disabled: false,
              appearsVerified: false,
              verificationState: 'refused'
            })
          );
        }

        for (const sid of disp.targetIds) {
          const tr = disp.targets[sid];
          const view = classifyTargetOutcomeView(tr);

          controls.push(
            Object.freeze({
              anchor: `dispatch/${did}/target/${sid}/result`,
              entityId: `dispatch-${did}-target-${sid}`,
              controlSlot: 'result-region',
              role: 'region',
              accessibleName: `Attributed result for ${sid} in dispatch ${did}: ${view.verificationBadge}`,
              disabled: false,
              appearsVerified: view.appearsVerified,
              verificationState: view.verificationState
            }),
            Object.freeze({
              anchor: `dispatch/${did}/target/${sid}/retry`,
              entityId: `dispatch-${did}-target-${sid}`,
              controlSlot: 'retry-button',
              role: 'button',
              accessibleName: `Retry target ${sid}`,
              disabled: !view.retryAllowed,
              appearsVerified: view.appearsVerified,
              verificationState: view.verificationState,
              ...(view.retryUnavailableReason ? { reason: view.retryUnavailableReason } : {})
            }),
            Object.freeze({
              anchor: `dispatch/${did}/target/${sid}/cancel`,
              entityId: `dispatch-${did}-target-${sid}`,
              controlSlot: 'cancel-button',
              role: 'button',
              accessibleName: `Cancel run on ${sid}`,
              disabled: !view.cancelAllowed,
              appearsVerified: view.appearsVerified,
              verificationState: view.verificationState,
              ...(view.cancelUnavailableReason ? { reason: view.cancelUnavailableReason } : {})
            })
          );

          if (!seenOutputSessionIds.has(sid)) {
            seenOutputSessionIds.add(sid);
            controls.push(
              Object.freeze({
                anchor: `output/${sid}/text`,
                entityId: `output-session-${sid}`,
                controlSlot: 'accessible-output-text',
                role: 'region',
                accessibleName: `Accessible output for ${sid}`,
                disabled: false,
                appearsVerified: view.appearsVerified,
                verificationState: view.verificationState
              })
            );
          }
        }
      }

      return Object.freeze(controls);
    },

    /**
     * Returns an immutable snapshot of all registered dispatches.
     */
    getState() {
      const list = [...dispatchesById.values()].map((d) => snapshotDispatch(d));
      return Object.freeze({
        schema: DISPATCH_RESULTS_SCHEMA,
        dispatches: Object.freeze(list),
        dispatchesById: Object.freeze(
          Object.fromEntries(list.map((d) => [d.requestId, d]))
        )
      });
    }
  });
}
</script>

<script setup>
import { shallowRef, computed, watch, onMounted } from 'vue';

const props = defineProps({
  dispatches: {
    type: Array,
    default: () => []
  },
  maxStreamBytes: {
    type: Number,
    default: 262144
  }
});

const emit = defineEmits(['cancel-target-run', 'stage-retry']);

const controller = createDispatchResultsController({
  maxStreamBytes: props.maxStreamBytes,
  onCancelRun: (requestId, sessionId) => emit('cancel-target-run', { requestId, sessionId }),
  onStageRetry: (stagedRetry) => emit('stage-retry', stagedRetry)
});

const viewState = shallowRef(controller.getState());

function refreshState() {
  viewState.value = controller.getState();
}

watch(
  () => props.dispatches,
  (nextDispatches) => {
    if (Array.isArray(nextDispatches)) {
      for (const raw of nextDispatches) {
        if (raw && typeof raw === 'object') {
          controller.registerDispatch(raw);
        }
      }
      refreshState();
    }
  },
  { immediate: true }
);

const dispatchRows = computed(() =>
  viewState.value.dispatches.map((disp) => {
    const targetViews = disp.targetIds.map((sid) => {
      const tr = disp.targets[sid];
      return {
        run: tr,
        outcome: classifyTargetOutcomeView(tr),
        outputText: tr.streamedChunks.join('')
      };
    });
    return {
      dispatch: disp,
      targetViews
    };
  })
);

function onRetryClick(requestId, sessionId) {
  controller.requestRetryFailedTargets({
    parentRequestId: requestId,
    retrySessionIds: [sessionId]
  });
  refreshState();
}

function onCancelClick(requestId, sessionId) {
  controller.requestCancelRun({
    requestId,
    sessionId
  });
  refreshState();
}

onMounted(() => {
  refreshState();
});

defineExpose({
  controller,
  refreshState
});
</script>

<template>
  <section
    id="cuk-dispatch-results-region"
    class="cuk-dispatch-results"
    role="region"
    aria-label="Correlated Dispatch Results"
  >
    <p
      v-if="dispatchRows.length === 0"
      class="cuk-dispatch-results__empty"
      role="status"
    >
      No correlated dispatches recorded.
    </p>

    <div
      v-for="row in dispatchRows"
      :key="row.dispatch.requestId"
      :id="`cuk-dispatch-group-${row.dispatch.requestId}`"
      class="cuk-dispatch-results__group"
      :data-request-id="row.dispatch.requestId"
      :data-parent-request-id="row.dispatch.parentRequestId || undefined"
      :data-dispatch-phase="row.dispatch.phase"
    >
      <header class="cuk-dispatch-results__group-header">
        <span class="cuk-dispatch-results__request-id">
          Request: {{ row.dispatch.requestId }}
        </span>
        <span
          v-if="row.dispatch.parentRequestId"
          class="cuk-dispatch-results__parent-link"
        >
          Retry of: {{ row.dispatch.parentRequestId }}
        </span>
        <span
          class="cuk-dispatch-results__phase-badge"
          role="status"
          aria-live="polite"
        >
          Admission: {{ row.dispatch.phase }}
        </span>
      </header>

      <!-- Named Core Refusal Alert (`alerts/{aid}`, §7, §9) -->
      <div
        v-if="row.dispatch.refusalAlert"
        :id="`cuk-alert-dispatch-${row.dispatch.requestId}`"
        class="cuk-dispatch-results__alert"
        role="alert"
        :data-semantic-anchor="`alerts/dispatch-${row.dispatch.requestId}`"
        :aria-label="row.dispatch.refusalAlert"
      >
        {{ row.dispatch.refusalAlert }}
      </div>

      <!-- Per-Target Attributed Results (`dispatch/{did}/target/{sid}/{result,retry,cancel}`, §7, §9) -->
      <div
        v-for="item in row.targetViews"
        :key="`${row.dispatch.requestId}-${item.run.sessionId}`"
        :id="`cuk-dispatch-${row.dispatch.requestId}-target-${item.run.sessionId}-result`"
        class="cuk-dispatch-results__target"
        role="region"
        :data-semantic-anchor="`dispatch/${row.dispatch.requestId}/target/${item.run.sessionId}/result`"
        :data-target-status="item.run.status"
        :data-verification-state="item.outcome.verificationState"
        :data-appears-verified="item.outcome.appearsVerified ? 'true' : 'false'"
        :aria-label="`Attributed result for ${item.run.sessionId} in dispatch ${row.dispatch.requestId}: ${item.outcome.verificationBadge}`"
      >
        <div class="cuk-dispatch-results__target-bar">
          <strong class="cuk-dispatch-results__session-id">
            {{ item.run.sessionId }}
          </strong>

          <span
            class="cuk-dispatch-results__badge"
            :data-verified="item.outcome.appearsVerified ? 'true' : 'false'"
          >
            {{ item.outcome.verificationBadge }}
          </span>

          <span
            v-if="item.outcome.appearsVerified && item.run.verifiedReceiptId"
            class="cuk-dispatch-results__witness"
          >
            Receipt: {{ item.run.verifiedReceiptId }} · Tick: {{ item.run.witnessTick }} ·
            State: {{ item.run.witnessStateSha256.slice(0, 12) }}
          </span>

          <span
            v-if="item.run.permissionRequestId"
            class="cuk-dispatch-results__permission-ref"
          >
            Permission request: {{ item.run.permissionRequestId }}
          </span>

          <span
            v-if="item.run.refusalMessage"
            class="cuk-dispatch-results__refusal-detail"
          >
            {{ item.run.refusalMessage }}
          </span>

          <div class="cuk-dispatch-results__actions">
            <!-- Guarded Retry Target Button (§7, §9) -->
            <button
              :id="`cuk-dispatch-${row.dispatch.requestId}-target-${item.run.sessionId}-retry`"
              type="button"
              role="button"
              class="cuk-dispatch-results__btn"
              :data-semantic-anchor="`dispatch/${row.dispatch.requestId}/target/${item.run.sessionId}/retry`"
              :aria-label="`Retry target ${item.run.sessionId}`"
              :disabled="!item.outcome.retryAllowed"
              :aria-disabled="!item.outcome.retryAllowed ? 'true' : 'false'"
              :data-unavailable-reason="item.outcome.retryUnavailableReason || undefined"
              :title="item.outcome.retryUnavailableReason || `Retry target ${item.run.sessionId}`"
              @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
              @mousedown="preserveLiveSurfaceFocusOnPointerDown"
              @click="onRetryClick(row.dispatch.requestId, item.run.sessionId)"
            >
              Retry target
            </button>

            <!-- Cancel Run Button (`Stop-this-run`, distinct from `Stop-session`, §7, §9) -->
            <button
              :id="`cuk-dispatch-${row.dispatch.requestId}-target-${item.run.sessionId}-cancel`"
              type="button"
              role="button"
              class="cuk-dispatch-results__btn cuk-dispatch-results__btn--cancel"
              :data-semantic-anchor="`dispatch/${row.dispatch.requestId}/target/${item.run.sessionId}/cancel`"
              :aria-label="`Cancel run on ${item.run.sessionId}`"
              :disabled="!item.outcome.cancelAllowed"
              :aria-disabled="!item.outcome.cancelAllowed ? 'true' : 'false'"
              :data-unavailable-reason="item.outcome.cancelUnavailableReason || undefined"
              :title="item.outcome.cancelUnavailableReason || `Cancel run on ${item.run.sessionId}`"
              @pointerdown="preserveLiveSurfaceFocusOnPointerDown"
              @mousedown="preserveLiveSurfaceFocusOnPointerDown"
              @click="onCancelClick(row.dispatch.requestId, item.run.sessionId)"
            >
              Cancel run
            </button>
          </div>
        </div>

        <!-- Browsable Plain-Text Output Region (`output/{sid}/text`, no token-by-token aria-live, no raw HTML injection, §3, §7, §9) -->
        <div
          :id="`cuk-output-${item.run.sessionId}-text-${row.dispatch.requestId}`"
          class="cuk-dispatch-results__output"
          role="region"
          :data-semantic-anchor="`output/${item.run.sessionId}/text`"
          :aria-label="`Accessible output for ${item.run.sessionId}`"
        >
          <pre class="cuk-dispatch-results__output-pre">{{ item.outputText }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cuk-dispatch-results {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-space-2, 8px);
  color: var(--cuk-text-primary, #e6e8ee);
  font-family: var(--cuk-font-sans, system-ui, sans-serif);
  font-size: var(--cuk-type-body-size, 13px);
}

.cuk-dispatch-results__empty {
  margin: 0;
  color: var(--cuk-text-muted, #9aa1b0);
}

.cuk-dispatch-results__group {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-space-2, 8px);
  padding: var(--cuk-space-2, 8px);
  background-color: var(--cuk-surface-panel, #1e2128);
  border: 1px solid var(--cuk-border-default, #2d3139);
  border-radius: var(--cuk-radius-sm, 4px);
}

.cuk-dispatch-results__group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-space-2, 8px);
  font-size: var(--cuk-type-caption-size, 12px);
  color: var(--cuk-text-muted, #9aa1b0);
}

.cuk-dispatch-results__alert {
  padding: var(--cuk-space-2, 8px);
  background-color: var(--cuk-status-error-bg, #3a181c);
  color: var(--cuk-status-error-text, #ff9da4);
  border: 1px solid var(--cuk-status-error-border, #8c2d38);
  border-radius: var(--cuk-radius-sm, 4px);
}

.cuk-dispatch-results__target {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-space-1, 4px);
  padding: var(--cuk-space-2, 8px);
  background-color: var(--cuk-surface-chrome, #181a1f);
  border: 1px solid var(--cuk-border-default, #2d3139);
  border-radius: var(--cuk-radius-sm, 4px);
}

.cuk-dispatch-results__target-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-space-2, 8px);
}

.cuk-dispatch-results__badge {
  padding: 2px 6px;
  border-radius: var(--cuk-radius-sm, 4px);
  background-color: var(--cuk-surface-panel, #252932);
  border: 1px solid var(--cuk-border-default, #383e4c);
  font-size: var(--cuk-type-caption-size, 12px);
}

.cuk-dispatch-results__badge[data-verified="true"] {
  border-color: var(--cuk-status-success-border, #2a7e4f);
  color: var(--cuk-status-success-text, #7ee2a8);
}

.cuk-dispatch-results__actions {
  display: flex;
  align-items: center;
  gap: var(--cuk-space-1, 4px);
  margin-left: auto;
}

.cuk-dispatch-results__btn {
  padding: 4px 10px;
  background-color: var(--cuk-surface-panel, #252932);
  color: var(--cuk-text-primary, #e6e8ee);
  border: 1px solid var(--cuk-border-default, #383e4c);
  border-radius: var(--cuk-radius-sm, 4px);
  cursor: pointer;
}

.cuk-dispatch-results__btn:focus-visible {
  outline: 2px solid var(--cuk-focus-ring, #4c9aff);
  outline-offset: 1px;
}

.cuk-dispatch-results__btn:disabled {
  color: var(--cuk-text-disabled, #6c7380);
  cursor: not-allowed;
}

.cuk-dispatch-results__output-pre {
  margin: 0;
  padding: var(--cuk-space-2, 8px);
  background-color: var(--cuk-surface-canvas, #121418);
  border-radius: var(--cuk-radius-sm, 4px);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
}
</style>
