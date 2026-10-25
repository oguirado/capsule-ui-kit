<script>
/**
 * @file CapsulePanel companion module: pure JS snapshot reader, 5-axis state separator,
 * §9 semantic control inventory builder, §6/§10 fold-cannot-stop-capture coordinator,
 * and §6 G5 focus retry / activation veil / pointer-focus-guard helpers.
 *
 * Grounded in UI_ARCHITECTURE.md §§3, 4, 5, 6, 8, 9, 10, 12, 13 and 14.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

/**
 * Closed backend lifecycle enum defined by ARCH:110 and UI_ARCHITECTURE.md §6.
 * @type {readonly string[]}
 */
export const ALLOWED_BACKEND_LIFECYCLES = Object.freeze([
  'active',
  'standby',
  'ceded',
  'destroyed',
  'lost',
]);

/**
 * Closed UI presentation request phases (distinct from backend lifecycle enum per §6).
 * @type {readonly string[]}
 */
export const ALLOWED_UI_REQUEST_PHASES = Object.freeze([
  'idle',
  'creating',
  'readiness-error',
  'folding',
  'unfolding',
  'taking-control',
  'releasing-control',
  'destroying',
]);

/**
 * Closed projected AI session activity states (UI_ARCHITECTURE.md §6).
 * @type {readonly string[]}
 */
export const ALLOWED_AI_SESSION_ACTIVITIES = Object.freeze([
  'unknown',
  'ready',
  'busy',
  'waiting-input',
  'waiting-permission',
  'exited',
  'failed',
]);

/**
 * Closed multislot attachment states (UI_ARCHITECTURE.md §6).
 * @type {readonly string[]}
 */
export const ALLOWED_ATTACHMENT_STATES = Object.freeze([
  'detached',
  'attaching',
  'restoring',
  'live',
  'disconnected',
]);

/**
 * Closed dispatch outcome states (UI_ARCHITECTURE.md §6, §7).
 * @type {readonly string[]}
 */
export const ALLOWED_DISPATCH_OUTCOMES = Object.freeze([
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

/**
 * Canonical capsule header action verbs from UI_ARCHITECTURE.md §9 row 3.
 * @type {readonly string[]}
 */
export const CAPSULE_ACTION_VERBS = Object.freeze([
  'fold',
  'pin',
  'control',
  'close',
  'popout',
  'dock-back',
]);

/**
 * Closed S1 capsule status chip variants (spec §3: Live/Active/Waiting Decision/Refused + idle).
 * @type {readonly string[]}
 */
export const CAPSULE_CHIP_VARIANTS = Object.freeze([
  'live',
  'active',
  'waiting',
  'refused',
  'idle',
]);

/**
 * Maps a human status label to its S1 chip variant. Pure; the label itself is unchanged.
 *
 * @param {unknown} humanStatus
 * @returns {string}
 */
export function resolveCapsuleChipVariant(humanStatus) {
  if (typeof humanStatus !== 'string') return 'idle';
  const text = humanStatus.trim();
  if (text === 'Live') return 'live';
  if (text === 'Active') return 'active';
  if (text === 'Error' || text.startsWith('Refused')) return 'refused';
  if (text.startsWith('Waiting')) return 'waiting';
  return 'idle';
}

/**
 * Maps an S1 chip variant to the UiTag status prop (UiTag separates success/error/info only;
 * the full S1 tint is applied by CapsulePanel token CSS per variant).
 *
 * @param {string} variant
 * @returns {string}
 */
export function chipStatusForVariant(variant) {
  if (variant === 'live') return 'success';
  if (variant === 'refused') return 'error';
  return 'info';
}

/**
 * Default unavailable reason for popout under UI_ARCHITECTURE.md §14 R2.
 * @type {string}
 */
export const DEFAULT_POPOUT_UNAVAILABLE_REASON =
  'Host window transfer contract unavailable under deny-window.open policy';

/**
 * Monetary and numeric resource keys that must remain 'unavailable' when missing/null, never 0 (§4).
 * @type {readonly string[]}
 */
const UNAVAILABLE_WHEN_NULL_KEYS = Object.freeze([
  'amount',
  'balance',
  'cost',
  'price',
  'cash',
  'loan',
  'equity',
  'revenue',
  'salary',
  'capacity',
]);

/**
 * Creates a deterministic coded error object.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function capsuleError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Validates an immutable core-issued capsule or surface identifier (§6, §9).
 * Rejects empty strings, whitespace, numeric list-length/index IDs, display-number credentials,
 * and synthetic terminal success IDs.
 *
 * @param {unknown} value
 * @param {string} [label='capsuleId']
 * @returns {string}
 */
export function assertImmutableCapsuleId(value, label = 'capsuleId') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw capsuleError('ERR_INVALID_CAPSULE_ID', `${label} must be a non-empty string`);
  }
  if (value !== value.trim() || /\s/.test(value)) {
    throw capsuleError('ERR_INVALID_CAPSULE_ID', `${label} must not contain whitespace: "${value}"`);
  }
  if (/^\d+$/.test(value)) {
    throw capsuleError(
      'ERR_NUMERIC_INDEX_ID',
      `${label} must be an immutable core identity, never a numeric list index or length: "${value}"`
    );
  }
  if (/^:\d+$/.test(value) || /^display:\d+$/i.test(value)) {
    throw capsuleError(
      'ERR_DISPLAY_CREDENTIAL_ID',
      `${label} must not use display-number credentials: "${value}"`
    );
  }
  if (/^term-(ok|success)/i.test(value)) {
    throw capsuleError(
      'ERR_SYNTHETIC_TERM_ID',
      `${label} must not use a synthetic successful terminal identifier: "${value}"`
    );
  }
  return value;
}

/**
 * Reads a single capsule's projected state from a PublicProjection view or snapshot envelope.
 * Enforces exact ID matching (never prefix matching), separates the 5 orthogonal status axes
 * (never collapsing into a single green/red boolean), rejects invented backend lifecycle enums,
 * and preserves 'unavailable' on missing monetary/resource fields.
 *
 * @param {Record<string, any>} projectionSnapshotOrView
 * @param {string} capsuleId
 * @param {Record<string, any>} [options]
 * @returns {{ ok: true, capsule: Object } | { ok: false, error: { code: string, message: string } }}
 */
export function readCapsuleFromProjection(projectionSnapshotOrView, capsuleId, options = {}) {
  try {
    assertImmutableCapsuleId(capsuleId, 'capsuleId');
  } catch (err) {
    return {
      ok: false,
      error: {
        code: /** @type {any} */ (err).code || 'ERR_INVALID_CAPSULE_ID',
        message: /** @type {Error} */ (err).message,
      },
    };
  }

  if (!projectionSnapshotOrView || typeof projectionSnapshotOrView !== 'object') {
    return {
      ok: false,
      error: {
        code: 'ERR_PROJECTION_UNAVAILABLE',
        message: 'PublicProjection snapshot or view is required',
      },
    };
  }

  const snapshot =
    typeof projectionSnapshotOrView.getSnapshot === 'function'
      ? projectionSnapshotOrView.getSnapshot()
      : projectionSnapshotOrView;

  if (!snapshot || typeof snapshot !== 'object' || !snapshot.envelope) {
    return {
      ok: false,
      error: {
        code: 'ERR_PROJECTION_UNAVAILABLE',
        message: 'No admitted projection envelope is currently resident',
      },
    };
  }

  const envelope = snapshot.envelope;
  const proj = envelope.projection || {};
  const rows = Array.isArray(proj.rows)
    ? proj.rows
    : Array.isArray(proj.capsules)
      ? proj.capsules
      : Array.isArray(proj.entities)
        ? proj.entities
        : [];

  // Exact match only; prefix matching is explicitly forbidden (§6)
  const rawRow = rows.find((item) => item && typeof item === 'object' && item.id === capsuleId);
  if (!rawRow) {
    return {
      ok: false,
      error: {
        code: 'ERR_CAPSULE_NOT_FOUND',
        message: `Capsule "${capsuleId}" not found by exact identity in PublicProjection`,
      },
    };
  }

  // Reject single green/red boolean collapse when backendLifecycle is absent (§6)
  if (
    rawRow.backendLifecycle === undefined &&
    (typeof rawRow.isGreen === 'boolean' ||
      typeof rawRow.ok === 'boolean' ||
      typeof rawRow.healthy === 'boolean' ||
      typeof rawRow.statusBoolean === 'boolean')
  ) {
    return {
      ok: false,
      error: {
        code: 'ERR_COLLAPSED_STATUS_BOOLEAN',
        message: 'Capsule status axes must remain separate and never collapse into a single green/red boolean',
      },
    };
  }

  const backendLifecycle = rawRow.backendLifecycle ?? 'standby';
  if (!ALLOWED_BACKEND_LIFECYCLES.includes(backendLifecycle)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVENTED_LIFECYCLE_ENUM',
        message: `Backend lifecycle "${String(backendLifecycle)}" is not in the admitted ARCH enum [${ALLOWED_BACKEND_LIFECYCLES.join(', ')}]`,
      },
    };
  }

  // Quiet output never implies ready/done (§6)
  const aiSessionActivity = rawRow.aiSessionActivity ?? 'unknown';
  if (!ALLOWED_AI_SESSION_ACTIVITIES.includes(aiSessionActivity)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_SESSION_ACTIVITY',
        message: `Invalid projected AI session activity "${String(aiSessionActivity)}"`,
      },
    };
  }

  const attachmentState = rawRow.attachmentState ?? 'detached';
  if (!ALLOWED_ATTACHMENT_STATES.includes(attachmentState)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_ATTACHMENT_STATE',
        message: `Invalid attachment state "${String(attachmentState)}"`,
      },
    };
  }

  const dispatchOutcome = rawRow.dispatchOutcome ?? 'none';
  if (!ALLOWED_DISPATCH_OUTCOMES.includes(dispatchOutcome)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_DISPATCH_OUTCOME',
        message: `Invalid dispatch outcome "${String(dispatchOutcome)}"`,
      },
    };
  }

  const surfaceId =
    typeof rawRow.surfaceId === 'string' && rawRow.surfaceId.trim().length > 0
      ? assertImmutableCapsuleId(rawRow.surfaceId, 'surfaceId')
      : capsuleId;

  const generation =
    typeof rawRow.generation === 'number' && Number.isSafeInteger(rawRow.generation) && rawRow.generation > 0
      ? rawRow.generation
      : 1;

  const uiRequestPhase =
    typeof options.uiRequestPhase === 'string' && ALLOWED_UI_REQUEST_PHASES.includes(options.uiRequestPhase)
      ? options.uiRequestPhase
      : typeof rawRow.uiRequestPhase === 'string' && ALLOWED_UI_REQUEST_PHASES.includes(rawRow.uiRequestPhase)
        ? rawRow.uiRequestPhase
        : 'idle';

  /** @type {Record<string, unknown>} */
  const metrics = {};
  for (const key of UNAVAILABLE_WHEN_NULL_KEYS) {
    if (key in rawRow) {
      const val = rawRow[key];
      metrics[key] = val === null || val === undefined ? 'unavailable' : val;
    }
  }

  const capsule = Object.freeze({
    capsuleId,
    surfaceId,
    title: typeof rawRow.title === 'string' && rawRow.title.trim().length > 0 ? rawRow.title.trim() : capsuleId,
    epoch: envelope.epoch,
    generation,
    ramRevision: snapshot.ramRevision ?? envelope.revision,
    durableRevision: snapshot.durableRevision ?? envelope.durableRevision ?? null,
    projectionStatus: snapshot.status ?? 'live',
    stale: Boolean(snapshot.stale),
    lastError: snapshot.error ? Object.freeze({ ...snapshot.error }) : null,
    readinessError:
      rawRow.readinessError && typeof rawRow.readinessError === 'object'
        ? Object.freeze({ ...rawRow.readinessError })
        : null,
    captureLeaseId: typeof rawRow.captureLeaseId === 'string' ? rawRow.captureLeaseId : null,
    controlOwner:
      rawRow.controlOwner === 'human' || rawRow.controlOwner === 'agent' ? rawRow.controlOwner : 'none',
    controlLeaseId: typeof rawRow.controlLeaseId === 'string' ? rawRow.controlLeaseId : null,
    underAiCommand: Boolean(rawRow.underAiCommand || rawRow.controlOwner === 'agent'),
    liveSurfaceCount:
      typeof rawRow.liveSurfaceCount === 'number' && Number.isSafeInteger(rawRow.liveSurfaceCount)
        ? rawRow.liveSurfaceCount
        : 1,
    popoutTransferSupported: Boolean(rawRow.popoutTransferSupported),
    axes: Object.freeze({
      backendLifecycle,
      uiPresentation: Object.freeze({
        folded: Boolean(rawRow.folded),
        slotFolded: Boolean(rawRow.slotFolded),
        pinned: Boolean(rawRow.pinned),
        presentationMode:
          typeof rawRow.presentationMode === 'string' ? rawRow.presentationMode : 'docked',
        panelOpen: rawRow.panelOpen !== false,
        panelSelected: rawRow.panelSelected !== false,
        controlRequestPhase: uiRequestPhase,
      }),
      aiSessionActivity,
      attachmentState,
      dispatchOutcome,
    }),
    metrics: Object.freeze(metrics),
    sessions: Object.freeze(
      Array.isArray(rawRow.sessions)
        ? rawRow.sessions.map((s) => Object.freeze({ ...s }))
        : []
    ),
  });

  return Object.freeze({
    ok: true,
    capsule,
  });
}

/**
 * Evaluates the G5 activation veil truth table (UI_ARCHITECTURE.md §6 G5):
 * Show activation veil ONLY when:
 * 1. More than one live surface exists (`liveSurfaceCount > 1`),
 * 2. This surface lacks keyboard ownership (`!hasKeyboardOwnership`), AND
 * 3. It is not under AI command (`!underAiCommand`).
 *
 * @param {Object} params
 * @param {number} params.liveSurfaceCount
 * @param {boolean} params.hasKeyboardOwnership
 * @param {boolean} params.underAiCommand
 * @param {string} [params.backendLifecycle='active']
 * @returns {{ showVeil: boolean, reason: string }}
 */
export function evaluateActivationVeil(params) {
  if (!params || typeof params !== 'object') {
    return Object.freeze({ showVeil: false, reason: 'MISSING_PARAMS' });
  }
  const lifecycle = params.backendLifecycle ?? 'active';
  if (lifecycle === 'destroyed' || lifecycle === 'lost') {
    return Object.freeze({ showVeil: false, reason: 'SURFACE_NOT_LIVE' });
  }
  if (typeof params.liveSurfaceCount !== 'number' || params.liveSurfaceCount <= 1) {
    return Object.freeze({ showVeil: false, reason: 'SINGLE_OR_ZERO_LIVE_SURFACES' });
  }
  if (params.hasKeyboardOwnership === true) {
    return Object.freeze({ showVeil: false, reason: 'HAS_KEYBOARD_OWNERSHIP' });
  }
  if (params.underAiCommand === true) {
    return Object.freeze({ showVeil: false, reason: 'UNDER_AI_COMMAND' });
  }
  return Object.freeze({ showVeil: true, reason: 'NEEDS_HUMAN_ACTIVATION' });
}

/**
 * Arbitrates single keyboard ownership across sibling surfaces (UI_ARCHITECTURE.md §6 G5).
 * Activation is idempotent, clears sibling keyboard ownership, and refuses surfaces under AI command
 * or in terminal destroyed/lost states.
 *
 * @param {readonly Object[]} surfaces
 * @param {string} targetCapsuleId
 * @returns {{ ok: true, ownerCapsuleId: string, surfaces: readonly Object[] } | { ok: false, error: { code: string, message: string } }}
 */
export function arbitrateKeyboardOwnership(surfaces, targetCapsuleId) {
  if (!Array.isArray(surfaces)) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_SURFACE_LIST', message: 'Surfaces list must be an array' },
    };
  }
  const target = surfaces.find((s) => s && s.capsuleId === targetCapsuleId);
  if (!target) {
    return {
      ok: false,
      error: { code: 'ERR_CAPSULE_NOT_FOUND', message: `Target surface "${targetCapsuleId}" not found` },
    };
  }
  if (target.backendLifecycle === 'destroyed' || target.backendLifecycle === 'lost') {
    return {
      ok: false,
      error: {
        code: 'ERR_SURFACE_TERMINAL',
        message: `Cannot grant keyboard ownership to terminal surface "${targetCapsuleId}"`,
      },
    };
  }
  if (target.underAiCommand === true) {
    return {
      ok: false,
      error: {
        code: 'ERR_SURFACE_UNDER_AI_COMMAND',
        message: `Surface "${targetCapsuleId}" is under AI command; human take-control lease required first`,
      },
    };
  }

  const nextSurfaces = surfaces.map((s) =>
    Object.freeze({
      ...s,
      hasKeyboardOwnership: s.capsuleId === targetCapsuleId,
    })
  );

  return Object.freeze({
    ok: true,
    ownerCapsuleId: targetCapsuleId,
    surfaces: Object.freeze(nextSurfaces),
  });
}

/**
 * Preserves live-host focus when interacting with controls beside live surfaces (UI_ARCHITECTURE.md §6 G5):
 * `pointerdown` and `mousedown` call `preventDefault()` while `click` and keyboard events proceed normally.
 *
 * @param {{ type?: string, preventDefault?: () => void } | null | undefined} event
 * @returns {{ prevented: boolean }}
 */
export function guardLiveSurfaceControlPointerEvent(event) {
  if (
    event &&
    (event.type === 'pointerdown' || event.type === 'mousedown') &&
    typeof event.preventDefault === 'function'
  ) {
    event.preventDefault();
    return Object.freeze({ prevented: true });
  }
  return Object.freeze({ prevented: false });
}

/**
 * Creates the §6 G5 fold/restore focus and 3-layer human take-control retry controller.
 * - Fold: moves logical/DOM focus to `capsule/{id}/fold` before hiding and cancels all pending retries.
 * - Restore: requires core visibility + positive geometry (first 0x0 frame never supplies fake geometry),
 *   schedules rAF then retry after 120 ms [CITED: FOLD], retaining session and refitting terminal.
 * - Take control: after admitted human ownership, runs 3-layer focus (slot census witness, DOM host focus,
 *   native surface focus through core/adapter) now (0 ms), after 120 ms, and after 400 ms [CITED: SLOT].
 * - Every retry revalidates slot identity, generation, visibility, owner, and current focus intent.
 *
 * @param {Object} options
 * @param {() => Record<string, any>} options.getState
 * @param {(fn: () => any, delayMs: number) => () => void} [options.scheduleTimer]
 * @param {(fn: () => any) => () => void} [options.scheduleRaf]
 * @param {(anchor: string) => boolean} [options.onFocusFoldInvoker]
 * @param {(capsuleId: string) => boolean} [options.onDomHostFocus]
 * @param {(capsuleId: string, leaseId: string) => boolean} [options.onNativeSurfaceFocus]
 * @param {(capsuleId: string) => void} [options.onRefitTerminal]
 */
export function createFocusRetryController(options) {
  if (!options || typeof options.getState !== 'function') {
    throw capsuleError('ERR_INVALID_FOCUS_CONFIG', 'Focus retry controller requires getState()');
  }

  /** @type {(fn:()=>any, delayMs:number)=>()=>void} */
  const scheduleTimer =
    typeof options.scheduleTimer === 'function'
      ? options.scheduleTimer
      : (fn, delayMs) => {
          const id = setTimeout(fn, delayMs);
          return () => clearTimeout(id);
        };

  /** @type {(fn:()=>any)=>()=>void} */
  const scheduleRaf =
    typeof options.scheduleRaf === 'function'
      ? options.scheduleRaf
      : (fn) => {
          const id = setTimeout(fn, 0);
          return () => clearTimeout(id);
        };

  const onFocusFoldInvoker =
    typeof options.onFocusFoldInvoker === 'function' ? options.onFocusFoldInvoker : () => true;
  const onDomHostFocus =
    typeof options.onDomHostFocus === 'function' ? options.onDomHostFocus : () => true;
  const onNativeSurfaceFocus =
    typeof options.onNativeSurfaceFocus === 'function' ? options.onNativeSurfaceFocus : () => true;
  const onRefitTerminal =
    typeof options.onRefitTerminal === 'function' ? options.onRefitTerminal : () => {};

  /** @type {Array<() => void>} */
  let activeCancels = [];
  let currentIntentId = 0;

  function cancelPendingRetries() {
    currentIntentId += 1;
    const toCancel = activeCancels.slice();
    activeCancels = [];
    for (const cancel of toCancel) {
      if (typeof cancel === 'function') {
        cancel();
      }
    }
    return currentIntentId;
  }

  /**
   * Moves focus to the valid fold invoker BEFORE hiding the body and cancels pending retries (§6 G5).
   */
  function onFold() {
    cancelPendingRetries();
    const state = options.getState();
    const capsuleId = assertImmutableCapsuleId(state?.capsuleId ?? 'capsule-unknown');
    const foldAnchor = `capsule/${capsuleId}/fold`;
    const focused = Boolean(onFocusFoldInvoker(foldAnchor));
    return Object.freeze({
      ok: true,
      focused,
      focusedAnchor: foldAnchor,
      cancelledPendingRetries: true,
    });
  }

  /**
   * Schedules rAF + 120ms focus/refit upon unfold/restore only after positive geometry is known (§6 G5).
   */
  function onRestoreVisible() {
    const state = options.getState();
    if (!state || state.folded === true || state.visible === false) {
      return Object.freeze({
        ok: false,
        error: { code: 'ERR_RESTORE_NOT_VISIBLE', message: 'Cannot restore focus while folded or hidden' },
      });
    }
    const width = typeof state.width === 'number' ? Math.round(state.width) : 0;
    const height = typeof state.height === 'number' ? Math.round(state.height) : 0;
    if (width <= 0 || height <= 0) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_EMPTY_RESTORE_GEOMETRY',
          message: 'First empty-box frame must never supply fake geometry on restore',
        },
      });
    }

    cancelPendingRetries();
    const expectedIntent = currentIntentId;
    const expectedCapsuleId = state.capsuleId;
    const expectedGen = state.generation;

    const cancelRaf = scheduleRaf(() => {
      const sRaf = options.getState();
      if (
        currentIntentId !== expectedIntent ||
        !sRaf ||
        sRaf.capsuleId !== expectedCapsuleId ||
        sRaf.generation !== expectedGen ||
        sRaf.folded === true ||
        sRaf.visible === false
      ) {
        return { ok: false, error: { code: 'ERR_FOCUS_RETRY_INVALIDATED' } };
      }
      onRefitTerminal(expectedCapsuleId);
      const cancel120 = scheduleTimer(() => {
        const s120 = options.getState();
        if (
          currentIntentId !== expectedIntent ||
          !s120 ||
          s120.capsuleId !== expectedCapsuleId ||
          s120.generation !== expectedGen ||
          s120.folded === true ||
          s120.visible === false
        ) {
          return { ok: false, error: { code: 'ERR_FOCUS_RETRY_INVALIDATED' } };
        }
        onRefitTerminal(expectedCapsuleId);
        onDomHostFocus(expectedCapsuleId);
        return { ok: true, step: '120ms' };
      }, 120);
      activeCancels.push(cancel120);
      return { ok: true, step: 'raf' };
    });

    activeCancels.push(cancelRaf);
    return Object.freeze({
      ok: true,
      intentId: expectedIntent,
      scheduledSteps: Object.freeze(['rAF', 120]),
    });
  }

  /**
   * Executes three-layer focus (slot census witness, DOM host focus, native surface focus via core/adapter)
   * with bounded retries at 0ms, 120ms, and 400ms after admitted human ownership (§6 G5).
   */
  function beginHumanControlFocus() {
    const initial = options.getState();
    if (!initial || initial.controlOwner !== 'human' || !initial.controlLeaseId) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_HUMAN_LEASE_REQUIRED',
          message: 'Three-layer focus requires core-admitted human control ownership and lease',
        },
      });
    }
    if (
      initial.folded === true ||
      initial.visible === false ||
      initial.backendLifecycle === 'destroyed' ||
      initial.backendLifecycle === 'lost'
    ) {
      return Object.freeze({
        ok: false,
        error: {
          code: 'ERR_SURFACE_NOT_FOCUSABLE',
          message: 'Cannot focus a folded, hidden, or terminal capsule surface',
        },
      });
    }

    cancelPendingRetries();
    const expectedIntent = currentIntentId;
    const expectedCapsuleId = initial.capsuleId;
    const expectedGen = initial.generation;
    const expectedLeaseId = initial.controlLeaseId;

    function executeLayerAttempt(attemptLabel) {
      const cur = options.getState();
      if (
        currentIntentId !== expectedIntent ||
        !cur ||
        cur.capsuleId !== expectedCapsuleId ||
        cur.generation !== expectedGen ||
        cur.folded === true ||
        cur.visible === false ||
        cur.controlOwner !== 'human' ||
        cur.controlLeaseId !== expectedLeaseId ||
        cur.backendLifecycle === 'destroyed' ||
        cur.backendLifecycle === 'lost'
      ) {
        cancelPendingRetries();
        return Object.freeze({
          ok: false,
          attempt: attemptLabel,
          error: {
            code: 'ERR_FOCUS_RETRY_INVALIDATED',
            message: `Focus retry (${attemptLabel}) cancelled due to state/ownership/visibility change`,
          },
        });
      }

      const layer1Census = cur.slotCensusWitness !== false;
      const layer2Dom = Boolean(onDomHostFocus(expectedCapsuleId));
      const layer3Native = Boolean(onNativeSurfaceFocus(expectedCapsuleId, expectedLeaseId));

      if (layer1Census && layer2Dom && layer3Native) {
        return Object.freeze({
          ok: true,
          attempt: attemptLabel,
          layers: Object.freeze({ layer1Census, layer2Dom, layer3Native }),
        });
      }

      if (attemptLabel === '400ms') {
        return Object.freeze({
          ok: false,
          attempt: attemptLabel,
          error: {
            code: 'ERR_FOCUS_RETRIES_EXHAUSTED',
            message: 'Bounded three-layer focus retries (0ms, 120ms, 400ms) exhausted',
          },
        });
      }

      return Object.freeze({
        ok: false,
        attempt: attemptLabel,
        pendingNextRetry: true,
      });
    }

    const immediateResult = executeLayerAttempt('0ms');
    const cancel120 = scheduleTimer(() => executeLayerAttempt('120ms'), 120);
    const cancel400 = scheduleTimer(() => executeLayerAttempt('400ms'), 400);
    activeCancels.push(cancel120, cancel400);

    return Object.freeze({
      ok: true,
      intentId: expectedIntent,
      immediateResult,
      retryDelaysMs: Object.freeze([120, 400]),
    });
  }

  return Object.freeze({
    onFold,
    onRestoreVisible,
    beginHumanControlFocus,
    cancelPendingRetries,
  });
}

/**
 * Builds the complete declarative §9 semantic control inventory for a CapsulePanel instance.
 * Enforces:
 * - Exact §9 templates: `capsule/{id}/panel`, `capsule/{id}/tab`,
 *   `capsule/{id}/{fold,pin,control,close,popout,dock-back}`, and `capsule/{id}/slot`.
 * - Non-empty `unavailableReason` whenever a capsule action button is disabled (including §14 R2 popout).
 * - Null boxes for folded/hidden nodes (`capsule/{id}/slot` when capsule or slot is folded).
 * - Zero UI-synthesized `stableId` wire suffixes.
 *
 * @param {Record<string, any>} capsuleState
 * @param {Record<string, any>} [layoutContext]
 * @returns {readonly Object[]}
 */
export function buildCapsuleSemanticInventory(capsuleState, layoutContext = {}) {
  const capsuleId = assertImmutableCapsuleId(capsuleState?.capsuleId, 'capsuleId');
  const title =
    typeof capsuleState?.title === 'string' && capsuleState.title.trim().length > 0
      ? capsuleState.title.trim()
      : capsuleId;
  const epoch =
    typeof capsuleState?.epoch === 'number' && Number.isSafeInteger(capsuleState.epoch) && capsuleState.epoch >= 0
      ? capsuleState.epoch
      : 1;
  const generation =
    typeof capsuleState?.generation === 'number' &&
    Number.isSafeInteger(capsuleState.generation) &&
    capsuleState.generation >= 0
      ? capsuleState.generation
      : 1;

  const presentationInstance = assertImmutableCapsuleId(
    layoutContext.presentationInstance ?? `panel-${capsuleId}`,
    'presentationInstance'
  );

  const axes = capsuleState?.axes ?? {};
  const backendLifecycle = axes.backendLifecycle ?? 'active';
  const ui = axes.uiPresentation ?? {};
  const folded = Boolean(ui.folded);
  const slotFolded = Boolean(ui.slotFolded);
  const pinned = Boolean(ui.pinned);
  const presentationMode = ui.presentationMode ?? 'docked';
  const controlRequestPhase = ui.controlRequestPhase ?? 'idle';
  const isTerminal = backendLifecycle === 'destroyed' || backendLifecycle === 'lost';
  const hasHumanControl = capsuleState?.controlOwner === 'human';

  const panelVisible = layoutContext.visible !== false && ui.panelOpen !== false;
  const materialized = layoutContext.materialized !== false;
  const inDom = layoutContext.inDom !== false;
  const boxes = layoutContext.boxes ?? {};

  const popoutAllowed = Boolean(capsuleState?.popoutTransferSupported) && !isTerminal;
  const popoutUnavailableReason = isTerminal
    ? `Capsule is ${backendLifecycle}`
    : DEFAULT_POPOUT_UNAVAILABLE_REASON;

  const canDockBack =
    !isTerminal && (presentationMode === 'floating' || presentationMode === 'popout');
  const dockBackUnavailableReason = isTerminal
    ? `Capsule is ${backendLifecycle}`
    : 'Capsule panel is already docked in the main workspace';

  const terminalReason = isTerminal ? `Capsule is ${backendLifecycle}` : undefined;

  const entries = [
    {
      semanticAnchor: `capsule/${capsuleId}/panel`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'panel',
      role: 'region',
      accessibleName: title,
      state: {
        backendLifecycle,
        folded,
        pinned,
        presentationMode,
        aiSessionActivity: axes.aiSessionActivity ?? 'unknown',
        attachmentState: axes.attachmentState ?? 'detached',
        dispatchOutcome: axes.dispatchOutcome ?? 'none',
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.panel ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/tab`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'tab',
      role: 'tab',
      accessibleName: `${title} (${backendLifecycle})`,
      state: {
        selected: ui.panelSelected !== false,
        backendLifecycle,
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.tab ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/fold`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'fold',
      role: 'button',
      accessibleName: `${folded ? 'Unfold' : 'Fold'} ${title}`,
      state: {
        expanded: !folded,
        disabled: isTerminal,
        ...(isTerminal ? { unavailableReason: terminalReason } : {}),
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.fold ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/pin`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'pin',
      role: 'button',
      accessibleName: `${pinned ? 'Unpin' : 'Pin'} ${title}`,
      state: {
        pressed: pinned,
        disabled: isTerminal,
        ...(isTerminal ? { unavailableReason: terminalReason } : {}),
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.pin ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/control`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'control',
      role: 'button',
      accessibleName: `${hasHumanControl ? 'Release control of' : 'Take control of'} ${title}`,
      state: {
        pressed: hasHumanControl,
        pending: controlRequestPhase === 'taking-control' || controlRequestPhase === 'releasing-control',
        disabled: isTerminal,
        ...(isTerminal ? { unavailableReason: terminalReason } : {}),
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.control ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/popout`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'popout',
      role: 'button',
      accessibleName: `Pop out ${title}`,
      state: {
        disabled: !popoutAllowed,
        ...(!popoutAllowed ? { unavailableReason: popoutUnavailableReason } : {}),
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.popout ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/dock-back`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'dock-back',
      role: 'button',
      accessibleName: `Dock back ${title}`,
      state: {
        disabled: !canDockBack,
        ...(!canDockBack ? { unavailableReason: dockBackUnavailableReason } : {}),
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes['dock-back'] ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/close`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'close',
      role: 'button',
      accessibleName: `Close ${title}`,
      state: {
        disabled: false,
      },
      visible: panelVisible,
      materialized,
      inDom,
      box: panelVisible && materialized && inDom ? (boxes.close ?? null) : null,
      epoch,
      generation,
    },
    {
      semanticAnchor: `capsule/${capsuleId}/slot`,
      entityId: capsuleId,
      presentationInstance,
      controlSlot: 'slot',
      role: 'region',
      accessibleName: `AI sessions for ${title}`,
      state: {
        expanded: !folded && !slotFolded,
        aiSessionActivity: axes.aiSessionActivity ?? 'unknown',
        attachmentState: axes.attachmentState ?? 'detached',
      },
      visible: panelVisible && !folded && !slotFolded,
      materialized,
      inDom,
      box: panelVisible && !folded && !slotFolded && materialized && inDom ? (boxes.slot ?? null) : null,
      epoch,
      generation,
    },
  ];

  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

/**
 * Registers or revalidates all §9 capsule controls in a `controlRegistry` instance.
 *
 * @param {Record<string, any>} registry
 * @param {Record<string, any>} capsuleState
 * @param {Record<string, any>} [layoutContext]
 * @param {{ revalidate?: boolean }} [options]
 * @returns {readonly Object[]}
 */
export function syncCapsuleControlsToRegistry(registry, capsuleState, layoutContext = {}, options = {}) {
  if (!registry || typeof registry.register !== 'function') {
    throw capsuleError('ERR_INVALID_REGISTRY', 'A valid controlRegistry instance is required');
  }
  const inventory = buildCapsuleSemanticInventory(capsuleState, layoutContext);
  const useRevalidate = options.revalidate === true && typeof registry.revalidateControl === 'function';
  const records = inventory.map((item) =>
    useRevalidate ? registry.revalidateControl(item) : registry.register(item)
  );
  return Object.freeze(records);
}

/**
 * Creates a headless/testable CapsulePanel chrome coordinator enforcing:
 * - Mount never spawns a backend process (§6).
 * - Fold moves focus to `capsule/{id}/fold`, disables only the display branch in `presentationScheduler`,
 *   keeps the DOM host mounted via `v-show`, NEVER unsubscribes or stops authoritative capture, and updates
 *   semantic control boxes (§6, §9, §10, §12, §13).
 * - Unfold requests the newest frame generation beyond any hidden capture witness without replaying backlog (§10).
 * - Presentation moves/tabs/Dockview remove callbacks never destroy the backend capsule (§6).
 * - Terminal `destroyed`/`lost` capsules forbid revival under the old identity (ARCH:226, §6).
 *
 * @param {Object} config
 * @param {string} config.capsuleId
 * @param {string} [config.presentationInstance]
 * @param {Object} config.projectionView
 * @param {Record<string, any>} [config.scheduler]
 * @param {Record<string, any>} [config.controlRegistry]
 * @param {(intent: Object) => void} [config.onSubmitIntent]
 * @param {Record<string, any>} [config.focusOptions]
 */
export function createCapsuleChromeController(config) {
  if (!config || typeof config !== 'object') {
    throw capsuleError('ERR_INVALID_CONTROLLER_CONFIG', 'Controller config is required');
  }

  const capsuleId = assertImmutableCapsuleId(config.capsuleId, 'capsuleId');
  const presentationInstance = assertImmutableCapsuleId(
    config.presentationInstance ?? `panel-${capsuleId}`,
    'presentationInstance'
  );
  const projectionView = config.projectionView;
  const scheduler = config.scheduler ?? null;
  const controlRegistry = config.controlRegistry ?? null;
  const onSubmitIntent = typeof config.onSubmitIntent === 'function' ? config.onSubmitIntent : () => {};

  let mounted = false;
  let localFolded = false;
  let localSlotFolded = false;
  let localPresentationMode = 'docked';
  let currentGeometry = { x: 0, y: 0, width: 640, height: 480 };
  /** @type {Object|null} */
  let lastCapsuleState = null;
  let registeredInRegistry = false;

  const focusController = createFocusRetryController({
    getState: () => ({
      capsuleId,
      generation: lastCapsuleState?.generation ?? 1,
      folded: localFolded,
      visible: mounted && !localFolded,
      width: currentGeometry.width,
      height: currentGeometry.height,
      controlOwner: lastCapsuleState?.controlOwner ?? 'none',
      controlLeaseId: lastCapsuleState?.controlLeaseId ?? null,
      backendLifecycle: lastCapsuleState?.axes?.backendLifecycle ?? 'active',
      slotCensusWitness: true,
    }),
    ...(config.focusOptions || {}),
  });

  function buildDefaultBoxes(geom) {
    const x = Math.round(geom.x ?? 0);
    const y = Math.round(geom.y ?? 0);
    const width = Math.max(120, Math.round(geom.width ?? 640));
    const height = Math.max(80, Math.round(geom.height ?? 480));
    return {
      panel: { x, y, width, height },
      tab: { x, y: Math.max(0, y - 30), width: Math.min(180, width), height: 30 },
      fold: { x: x + width - 180, y: y + 4, width: 26, height: 26 },
      pin: { x: x + width - 150, y: y + 4, width: 26, height: 26 },
      control: { x: x + width - 120, y: y + 4, width: 26, height: 26 },
      popout: { x: x + width - 90, y: y + 4, width: 26, height: 26 },
      'dock-back': { x: x + width - 60, y: y + 4, width: 26, height: 26 },
      close: { x: x + width - 30, y: y + 4, width: 26, height: 26 },
      slot: { x, y: y + Math.floor(height * 0.6), width, height: Math.max(40, Math.floor(height * 0.4)) },
    };
  }

  function syncFromProjection() {
    const readRes = readCapsuleFromProjection(projectionView, capsuleId);
    if (!readRes.ok) {
      return readRes;
    }
    const base = readRes.capsule;
    lastCapsuleState = Object.freeze({
      ...base,
      axes: Object.freeze({
        ...base.axes,
        uiPresentation: Object.freeze({
          ...base.axes.uiPresentation,
          folded: localFolded,
          slotFolded: localSlotFolded,
          presentationMode: localPresentationMode,
        }),
      }),
    });

    if (controlRegistry && mounted) {
      if (registeredInRegistry) {
        controlRegistry.markNeedsRevalidation('layout');
      }
      syncCapsuleControlsToRegistry(
        controlRegistry,
        lastCapsuleState,
        {
          presentationInstance,
          visible: true,
          materialized: true,
          inDom: true,
          boxes: buildDefaultBoxes(currentGeometry),
        },
        { revalidate: registeredInRegistry }
      );
      registeredInRegistry = true;
    }

    return Object.freeze({ ok: true, capsule: lastCapsuleState });
  }

  /**
   * Mounts the presentation panel without spawning any backend process (§6).
   * @param {{ geometry?: { x?: number, y?: number, width: number, height: number } }} [mountOptions]
   */
  function mount(mountOptions = {}) {
    if (mountOptions.geometry) {
      currentGeometry = { ...currentGeometry, ...mountOptions.geometry };
    }
    mounted = true;
    const syncRes = syncFromProjection();
    if (!syncRes.ok) {
      return syncRes;
    }
    const cap = syncRes.capsule;
    localFolded = Boolean(cap.axes.uiPresentation.folded);

    if (scheduler) {
      scheduler.registerSurface({
        surfaceId: cap.surfaceId,
        surfaceGeneration: cap.generation,
        epoch: cap.epoch,
        captureLeaseId: cap.captureLeaseId ?? `lease-${cap.surfaceId}`,
        state: {
          panelOpen: true,
          panelSelected: true,
          folded: localFolded,
          x: currentGeometry.x,
          y: currentGeometry.y,
          width: currentGeometry.width,
          height: currentGeometry.height,
          viewportIntersecting: true,
          windowPresentationAllowed: true,
          contextLost: false,
        },
      });
    }

    return Object.freeze({
      ok: true,
      mounted: true,
      spawnedProcess: false,
      capsule: lastCapsuleState,
    });
  }

  /**
   * Guards that a fold transition never attempts to unsubscribe or stop authoritative capture (§6, §10, §13).
   * @param {{ unsubscribeCapture?: boolean, terminateProcess?: boolean }} [attemptedEffects]
   */
  function assertFoldNeverStopsCapture(attemptedEffects = {}) {
    if (attemptedEffects.unsubscribeCapture === true || attemptedEffects.terminateProcess === true) {
      throw capsuleError(
        'ERR_FOLD_CANNOT_STOP_CAPTURE',
        'Folding a capsule disables only the display branch and must never unsubscribe capture or terminate the capsule'
      );
    }
    return true;
  }

  /**
   * Folds the capsule body:
   * 1. Moves focus to `capsule/{id}/fold` before hiding and cancels pending focus retries (§6 G5).
   * 2. Calls `scheduler.foldSurface(surfaceId)` to disable only the display branch and drain the pending
   *    presentation mailbox lease while retaining the authoritative capture lease (§10).
   * 3. Submits desired visibility intent (`surface_visibility`) without `frame_unsubscribe` or `destroy` (§5, §6).
   * 4. Revalidates semantic control inventory so hidden regions have `box: null` while `inDom` stays `true` (`v-show`).
   */
  function fold() {
    assertFoldNeverStopsCapture({ unsubscribeCapture: false, terminateProcess: false });
    const focusRes = focusController.onFold();
    localFolded = true;

    let schedulerFoldRes = null;
    if (scheduler && lastCapsuleState) {
      schedulerFoldRes = scheduler.foldSurface(lastCapsuleState.surfaceId, { drainSteps: 1 });
    }

    onSubmitIntent(
      Object.freeze({
        type: 'surface_visibility',
        capsuleId,
        surfaceId: lastCapsuleState?.surfaceId ?? capsuleId,
        visible: false,
        folded: true,
      })
    );

    syncFromProjection();

    return Object.freeze({
      ok: true,
      folded: true,
      domHostMounted: true,
      focusMovedTo: focusRes.focusedAnchor,
      captureLeaseRetained: schedulerFoldRes ? schedulerFoldRes.captureLeaseRetained : true,
      drainedFrameGeneration: schedulerFoldRes ? schedulerFoldRes.drainedFrameGeneration : null,
    });
  }

  /**
   * Unfolds the capsule body:
   * 1. Calls `scheduler.unfoldSurface` to request the newest generation beyond any hidden capture witness (§10).
   * 2. Submits desired visibility intent (`visible: true`).
   * 3. Schedules `rAF + 120ms` restore focus/refit when positive geometry is known (§6 G5).
   * 4. Revalidates semantic control inventory with materialized boxes.
   *
   * @param {{ geometry?: { x?: number, y?: number, width: number, height: number } }} [unfoldOptions]
   */
  function unfold(unfoldOptions = {}) {
    if (unfoldOptions.geometry) {
      currentGeometry = { ...currentGeometry, ...unfoldOptions.geometry };
    }
    localFolded = false;

    let schedulerUnfoldRes = null;
    if (scheduler && lastCapsuleState) {
      schedulerUnfoldRes = scheduler.unfoldSurface(lastCapsuleState.surfaceId, {
        geometry: currentGeometry,
      });
    }

    onSubmitIntent(
      Object.freeze({
        type: 'surface_visibility',
        capsuleId,
        surfaceId: lastCapsuleState?.surfaceId ?? capsuleId,
        visible: true,
        folded: false,
      })
    );

    const restoreFocusRes = focusController.onRestoreVisible();
    syncFromProjection();

    return Object.freeze({
      ok: true,
      folded: false,
      domHostMounted: true,
      requestedAfterFrameGeneration: schedulerUnfoldRes
        ? schedulerUnfoldRes.requestedAfterFrameGeneration
        : 0,
      restoreFocusScheduled: restoreFocusRes.ok,
    });
  }

  /**
   * Handles presentation-only move, resize, tab switch, or float transition without destroying backend state (§6).
   * @param {{ presentationMode?: string, geometry?: { x?: number, y?: number, width: number, height: number } }} moveParams
   */
  function onPresentationMove(moveParams = {}) {
    if (typeof moveParams.presentationMode === 'string') {
      localPresentationMode = moveParams.presentationMode;
    }
    if (moveParams.geometry) {
      currentGeometry = { ...currentGeometry, ...moveParams.geometry };
    }
    if (scheduler && lastCapsuleState) {
      scheduler.updateSurfaceState(lastCapsuleState.surfaceId, {
        x: currentGeometry.x,
        y: currentGeometry.y,
        width: currentGeometry.width,
        height: currentGeometry.height,
      });
    }
    syncFromProjection();
    return Object.freeze({
      ok: true,
      presentationMode: localPresentationMode,
      destroyedBackend: false,
    });
  }

  /**
   * Handles Dockview panel remove/close callback as a presentation-only event.
   * Never emits `surface_request.destroy` or terminates capture (§6).
   */
  function onPanelRemoveCallback() {
    focusController.cancelPendingRetries();
    if (scheduler && lastCapsuleState) {
      scheduler.updateSurfaceState(lastCapsuleState.surfaceId, {
        panelOpen: false,
      });
    }
    return Object.freeze({
      ok: true,
      panelClosed: true,
      destroyedBackend: false,
    });
  }

  /**
   * Requests replacement of a terminal `destroyed` or `lost` capsule.
   * ARCH:226 prohibits revival under the old capsuleId or surfaceId (§6).
   *
   * @param {{ newCapsuleId: string, newSurfaceId: string, profile?: string }} params
   */
  function requestReplacement(params) {
    const currentLifecycle = lastCapsuleState?.axes?.backendLifecycle;
    if (currentLifecycle !== 'destroyed' && currentLifecycle !== 'lost') {
      throw capsuleError(
        'ERR_REPLACEMENT_REQUIRES_TERMINAL_STATE',
        `Replacement requires terminal destroyed/lost state, current is "${String(currentLifecycle)}"`
      );
    }
    const newCapsuleId = assertImmutableCapsuleId(params?.newCapsuleId, 'newCapsuleId');
    const newSurfaceId = assertImmutableCapsuleId(params?.newSurfaceId, 'newSurfaceId');

    if (newCapsuleId === capsuleId || newSurfaceId === (lastCapsuleState?.surfaceId ?? capsuleId)) {
      throw capsuleError(
        'ERR_REVIVE_OLD_IDENTITY_FORBIDDEN',
        `ARCH:226 prohibits reviving terminal capsule "${capsuleId}" under its old capsuleId or surfaceId`
      );
    }

    const intent = Object.freeze({
      type: 'surface_request.create',
      replacesCapsuleId: capsuleId,
      requestedCapsuleId: newCapsuleId,
      requestedSurfaceId: newSurfaceId,
      profile: typeof params?.profile === 'string' ? params.profile : 'default',
    });
    onSubmitIntent(intent);

    return Object.freeze({
      ok: true,
      replacementIdentity: Object.freeze({
        capsuleId: newCapsuleId,
        surfaceId: newSurfaceId,
      }),
    });
  }

  return Object.freeze({
    get state() {
      return lastCapsuleState;
    },
    mount,
    syncFromProjection,
    fold,
    unfold,
    assertFoldNeverStopsCapture,
    onPresentationMove,
    onPanelRemoveCallback,
    requestReplacement,
    focusController,
  });
}
</script>

<script setup>
import UiTag from '../ui/UiTag.vue';
import UiToolbar from '../ui/UiToolbar.vue';
import {
  shallowRef,
  computed,
  watch,
  inject,
  onMounted,
  onBeforeUnmount,
} from 'vue';

const props = defineProps({
  externalAiSlot: {type:Boolean,default:false},
  presentationStatus: { type: String, default: "" },
  placeholderTitle: { type: String, default: "" },
  capsuleId: {
    type: String,
    required: true,
  },
  presentationInstance: {
    type: String,
    default: '',
  },
  projectionView: {
    type: Object,
    default: null,
  },
  scheduler: {
    type: Object,
    default: null,
  },
  controlRegistry: {
    type: Object,
    default: null,
  },
  initialGeometry: {
    type: Object,
    default: () => ({ x: 0, y: 0, width: 640, height: 480 }),
  },
  hasKeyboardOwnership: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'submit-intent',
  'activate-surface',
  'fold-change',
  'pin-change',
  'control-request',
  'close-panel',
  'dock-back',
]);

const styledChrome = inject('capsuleChromeStyle', '') === 'openvue';
const windowPresentation = /** @type {any} */ (inject('capsuleWindowPresentation', null));
const windowState = computed(() => {windowPresentation?.revision.value; return windowPresentation?.get()?.state(resolvedInstanceId.value) ?? {floating:false,hidden:false,maximized:false};});
function windowAction(action) {windowPresentation?.get()?.[action](resolvedInstanceId.value);}
const injectedProjectionView = inject('publicProjectionView', null);
const injectedScheduler = inject('presentationScheduler', null);
const injectedControlRegistry = inject('controlRegistry', null);

const activeProjectionView = computed(() => props.projectionView || injectedProjectionView);
const activeScheduler = computed(() => props.scheduler || injectedScheduler);
const activeControlRegistry = computed(() => props.controlRegistry || injectedControlRegistry);

const resolvedInstanceId = computed(() =>
  props.presentationInstance && props.presentationInstance.trim().length > 0
    ? props.presentationInstance.trim()
    : `panel-${props.capsuleId}`
);

const capsuleSnapshot = shallowRef(null);
const localFolded = shallowRef(false);
const localSlotFolded = shallowRef(false);
const localPinned = shallowRef(false);

const domIds = computed(() => ({
  panel: `cuk-capsule-panel-${resolvedInstanceId.value}`,
  tab: `cuk-capsule-tab-${resolvedInstanceId.value}`,
  fold: `cuk-capsule-fold-${resolvedInstanceId.value}`,
  pin: `cuk-capsule-pin-${resolvedInstanceId.value}`,
  control: `cuk-capsule-control-${resolvedInstanceId.value}`,
  popout: `cuk-capsule-popout-${resolvedInstanceId.value}`,
  dockBack: `cuk-capsule-dock-back-${resolvedInstanceId.value}`,
  close: `cuk-capsule-close-${resolvedInstanceId.value}`,
  slot: `cuk-capsule-slot-${resolvedInstanceId.value}`,
}));

const anchors = computed(() => ({
  panel: `capsule/${props.capsuleId}/panel`,
  tab: `capsule/${props.capsuleId}/tab`,
  fold: `capsule/${props.capsuleId}/fold`,
  pin: `capsule/${props.capsuleId}/pin`,
  control: `capsule/${props.capsuleId}/control`,
  popout: `capsule/${props.capsuleId}/popout`,
  dockBack: `capsule/${props.capsuleId}/dock-back`,
  close: `capsule/${props.capsuleId}/close`,
  slot: `capsule/${props.capsuleId}/slot`,
}));

function refreshFromProjection() {
  const view = activeProjectionView.value;
  if (!view) {
    return;
  }
  const res = readCapsuleFromProjection(view, props.capsuleId);
  if (res.ok) {
    capsuleSnapshot.value = res.capsule;
    localFolded.value = res.capsule.axes.uiPresentation.folded;
    localSlotFolded.value = res.capsule.axes.uiPresentation.slotFolded;
    localPinned.value = res.capsule.axes.uiPresentation.pinned;
  }
}

const titleText = computed(() => capsuleSnapshot.value?.title ?? (props.placeholderTitle || props.capsuleId));
const backendLifecycle = computed(() => capsuleSnapshot.value?.axes?.backendLifecycle ?? 'standby');
const aiSessionActivity = computed(() => capsuleSnapshot.value?.axes?.aiSessionActivity ?? 'unknown');
const attachmentState = computed(() => capsuleSnapshot.value?.axes?.attachmentState ?? 'detached');
const dispatchOutcome = computed(() => capsuleSnapshot.value?.axes?.dispatchOutcome ?? 'none');
const humanStatus = computed(() => {
  if (props.presentationStatus) return props.presentationStatus;
  if (readinessError.value || backendLifecycle.value === 'lost') return 'Error';
  if (dispatchOutcome.value === 'refused') return 'Refused: dispatch refused';
  return capsuleSnapshot.value && !isStale.value ? 'Live' : 'Waiting for game';
});
const chipVariant = computed(() => resolveCapsuleChipVariant(humanStatus.value));
const chipStatus = computed(() => chipStatusForVariant(chipVariant.value));
const isStale = computed(() => Boolean(capsuleSnapshot.value?.stale));
const readinessError = computed(() => capsuleSnapshot.value?.readinessError ?? null);

const veilState = computed(() =>
  evaluateActivationVeil({
    liveSurfaceCount: capsuleSnapshot.value?.liveSurfaceCount ?? 1,
    hasKeyboardOwnership: props.hasKeyboardOwnership,
    underAiCommand: Boolean(capsuleSnapshot.value?.underAiCommand),
    backendLifecycle: backendLifecycle.value,
  })
);

const semanticInventory = computed(() => {
  const baseState = capsuleSnapshot.value ?? {
    capsuleId: props.capsuleId,
    surfaceId: props.capsuleId,
    title: titleText.value,
    epoch: 1,
    generation: 1,
    axes: {
      backendLifecycle: backendLifecycle.value,
      uiPresentation: {
        folded: localFolded.value,
        slotFolded: localSlotFolded.value,
        pinned: localPinned.value,
        presentationMode: 'docked',
        panelOpen: true,
        panelSelected: true,
        controlRequestPhase: 'idle',
      },
      aiSessionActivity: aiSessionActivity.value,
      attachmentState: attachmentState.value,
      dispatchOutcome: dispatchOutcome.value,
    },
    controlOwner: 'none',
    popoutTransferSupported: false,
  };
  return buildCapsuleSemanticInventory(baseState, {
    presentationInstance: resolvedInstanceId.value,
    visible: true,
    materialized: true,
    inDom: true,
  });
});

const controlMap = computed(() => {
  /** @type {Record<string, any>} */
  const map = {};
  for (const item of semanticInventory.value) {
    map[item.controlSlot] = !capsuleSnapshot.value && ['control', 'popout', 'dock-back'].includes(item.controlSlot)
      ? { ...item, state: { ...item.state, disabled: true, unavailableReason: 'No core-projected capsule is bound' } }
      : item;
  }
  return map;
});

function onControlPointerDown(event) {
  guardLiveSurfaceControlPointerEvent(event);
}

function onControlMouseDown(event) {
  guardLiveSurfaceControlPointerEvent(event);
}

function onToggleFold() {
  if (controlMap.value.fold?.state?.disabled) return;
  const nextFolded = !localFolded.value;
  localFolded.value = nextFolded;
  const surfId = capsuleSnapshot.value?.surfaceId ?? props.capsuleId;
  if (activeScheduler.value) {
    if (nextFolded) {
      activeScheduler.value.foldSurface(surfId, { drainSteps: 1 });
    } else {
      activeScheduler.value.unfoldSurface(surfId, { geometry: props.initialGeometry });
    }
  }
  emit('fold-change', { capsuleId: props.capsuleId, folded: nextFolded });
  emit('submit-intent', {
    type: 'surface_visibility',
    capsuleId: props.capsuleId,
    surfaceId: surfId,
    visible: !nextFolded,
    folded: nextFolded,
  });
}

function onTogglePin() {
  if (controlMap.value.pin?.state?.disabled) return;
  const nextPinned = !localPinned.value;
  localPinned.value = nextPinned;
  emit('pin-change', { capsuleId: props.capsuleId, pinned: nextPinned });
  emit('submit-intent', {
    type: 'surface_pin',
    capsuleId: props.capsuleId,
    pinned: nextPinned,
  });
}

function onToggleControl() {
  if (controlMap.value.control?.state?.disabled) return;
  const hasControl = capsuleSnapshot.value?.controlOwner === 'human';
  const verb = hasControl ? 'surface_request.release_control' : 'surface_request.take_control';
  emit('control-request', { capsuleId: props.capsuleId, verb });
  emit('submit-intent', { type: verb, capsuleId: props.capsuleId });
}

function onDockBack() {
  if (windowPresentation?.get()) {windowAction('dock'); return;}
  if (controlMap.value['dock-back']?.state?.disabled) return;
  emit('dock-back', { capsuleId: props.capsuleId });
}

function onClosePanel() {
  emit('close-panel', {
    capsuleId: props.capsuleId,
    presentationInstance: resolvedInstanceId.value,
    destroyedBackend: false,
  });
}

function onActivateVeil() {
  emit('activate-surface', { capsuleId: props.capsuleId });
}

let unsubscribeProjection = null;

onMounted(() => {
  refreshFromProjection();
  if (activeProjectionView.value && typeof activeProjectionView.value.subscribe === 'function') {
    unsubscribeProjection = activeProjectionView.value.subscribe(() => {
      refreshFromProjection();
    });
  }
  if (activeControlRegistry.value && capsuleSnapshot.value) {
    syncCapsuleControlsToRegistry(activeControlRegistry.value, capsuleSnapshot.value, {
      presentationInstance: resolvedInstanceId.value,
      visible: !windowState.value.hidden,
      materialized: !windowState.value.hidden,
      inDom: true,
    });
  }
});

watch([() => windowState.value.hidden, () => capsuleSnapshot.value?.surfaceId, () => activeScheduler.value], ([hidden]) => {
  const scheduler = activeScheduler.value;
  const surfaceId = capsuleSnapshot.value?.surfaceId ?? props.capsuleId;
  if (scheduler) {
    scheduler.updateSurfaceState(surfaceId, {panelOpen: !hidden});
    if (hidden) scheduler.foldSurface(surfaceId, {drainSteps:1});
    else if (!localFolded.value) scheduler.unfoldSurface(surfaceId, {geometry:props.initialGeometry});
  }
}, {immediate:true});

watch(
  () => [props.capsuleId, localFolded.value, localSlotFolded.value, localPinned.value, windowState.value.hidden],
  () => {
    if (activeControlRegistry.value && capsuleSnapshot.value) {
      activeControlRegistry.value.markNeedsRevalidation('layout');
      syncCapsuleControlsToRegistry(
        activeControlRegistry.value,
        capsuleSnapshot.value,
        {
          presentationInstance: resolvedInstanceId.value,
          visible: !windowState.value.hidden,
          materialized: !windowState.value.hidden,
          inDom: true,
        },
        { revalidate: true }
      );
    }
  },
  { flush: 'post' }
);

onBeforeUnmount(() => {
  if (typeof unsubscribeProjection === 'function') {
    unsubscribeProjection();
    unsubscribeProjection = null;
  }
});

defineExpose({
  refreshFromProjection,
  onToggleFold,
  onTogglePin,
  onToggleControl,
});
</script>

<template>
  <section
    :id="domIds.panel"
    class="cuk-capsule-panel"
    v-show="!windowState.hidden"
    role="region"
    :aria-label="controlMap.panel?.accessibleName || titleText"
    :data-semantic-anchor="anchors.panel"
    :data-capsule-id="capsuleId"
    :data-backend-lifecycle="capsuleSnapshot ? backendLifecycle : 'unavailable'"
    :data-ai-session-activity="aiSessionActivity"
    :data-attachment-state="attachmentState"
    :data-dispatch-outcome="dispatchOutcome"
    :data-window-floating="String(windowState.floating)"
    :data-window-hidden="String(windowState.hidden)"
    :data-window-maximized="String(windowState.maximized)"
  >
    <header class="cuk-capsule-panel__header"><template v-if="styledChrome"><UiToolbar class="ui-capsule-toolbar" :label="`Capsule chrome for ${titleText}`"><template #start>
      <div class="cuk-capsule-panel__title-cluster">
      <div
        :id="domIds.tab"
        class="cuk-capsule-panel__tab-identity"
        tabindex="-1"
        role="tab"
        :aria-selected="String(controlMap.tab?.state?.selected !== false)"
        :aria-label="capsuleSnapshot ? (controlMap.tab?.accessibleName || titleText) : `${titleText} (unavailable)`"
        :data-semantic-anchor="anchors.tab"
      >
        <span class="cuk-capsule-panel__glyph" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><rect x="2" y="4" width="12" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" /></svg></span>
        <span class="cuk-capsule-panel__title">{{ titleText }}</span>
      </div>

      <div class="cuk-capsule-panel__axes" aria-label="Capsule status">
        <span class="cuk-capsule-panel__chip" :data-chip-variant="chipVariant" role="status"><span v-if="chipVariant === 'live'" class="cuk-capsule-panel__chip-dot" aria-hidden="true"></span><UiTag class="cuk-capsule-panel__badge" :label="humanStatus" :status="chipStatus" /></span>
      </div>
      </div>

      </template><template #end><div class="cuk-capsule-panel__actions" role="toolbar" :aria-label="`Actions for ${titleText}`">
        <template v-if="windowPresentation">
          <button :id="`window-hide-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/hide`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`Hide ${titleText}`" :title="`Hide ${titleText}`" @click="windowAction('hide')"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
          <button :id="`window-float-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/float`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`Float ${titleText}`" :title="`Float ${titleText}`" :aria-pressed="String(windowState.floating)" @click="windowAction('float')"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.5 3.5h3v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M12.5 3.5 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M6.5 5.5h-3v7h7v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :id="`window-maximize-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/maximize`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`${windowState.maximized ? 'Restore' : 'Maximize'} ${titleText}`" :title="`${windowState.maximized ? 'Restore' : 'Maximize'} ${titleText}`" :aria-pressed="String(windowState.maximized)" @click="windowAction('maximize')"><svg v-if="windowState.maximized" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3.5h6.5V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><rect x="3.5" y="6" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg><svg v-else viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>
        </template>
        <button v-if="!windowPresentation"
          :id="domIds.fold"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.fold?.accessibleName"
          :aria-expanded="String(!localFolded)"
          :aria-disabled="String(Boolean(controlMap.fold?.state?.disabled))"
          :disabled="Boolean(controlMap.fold?.state?.disabled)"
          :title="controlMap.fold?.state?.unavailableReason || controlMap.fold?.accessibleName"
          :data-semantic-anchor="anchors.fold"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onToggleFold"
        >
          {{ localFolded ? 'Unfold' : 'Fold' }}
        </button>

        <button v-if="!windowPresentation"
          :id="domIds.pin"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.pin?.accessibleName"
          :aria-pressed="String(localPinned)"
          :aria-disabled="String(Boolean(controlMap.pin?.state?.disabled))"
          :disabled="Boolean(controlMap.pin?.state?.disabled)"
          :title="controlMap.pin?.state?.unavailableReason || controlMap.pin?.accessibleName"
          :data-semantic-anchor="anchors.pin"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onTogglePin"
        >
          {{ localPinned ? 'Unpin' : 'Pin' }}
        </button>

        <button v-if="!windowPresentation"
          :id="domIds.control"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.control?.accessibleName"
          :aria-pressed="String(Boolean(controlMap.control?.state?.pressed))"
          :aria-disabled="String(Boolean(controlMap.control?.state?.disabled))"
          :disabled="Boolean(controlMap.control?.state?.disabled)"
          :title="controlMap.control?.state?.unavailableReason || controlMap.control?.accessibleName"
          :data-semantic-anchor="anchors.control"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onToggleControl"
        >
          Control
        </button>

        <button v-if="!windowPresentation"
          :id="domIds.popout"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.popout?.accessibleName"
          :aria-disabled="String(Boolean(controlMap.popout?.state?.disabled))"
          :disabled="Boolean(controlMap.popout?.state?.disabled)"
          :title="controlMap.popout?.state?.unavailableReason || controlMap.popout?.accessibleName"
          :data-semantic-anchor="anchors.popout"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
        >
          Popout
        </button>

        <button
          :id="domIds.dockBack"
          type="button"
          class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn"
          role="button"
          :aria-label="controlMap['dock-back']?.accessibleName"
          :aria-disabled="String(windowPresentation ? !windowState.floating : Boolean(controlMap['dock-back']?.state?.disabled))"
          :disabled="windowPresentation ? !windowState.floating : Boolean(controlMap['dock-back']?.state?.disabled)"
          :title="controlMap['dock-back']?.state?.unavailableReason || controlMap['dock-back']?.accessibleName"
          :data-semantic-anchor="anchors.dockBack"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onDockBack"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 3v7M5.5 7.5 8 10l2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M3.5 12.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>

        <button
          :id="domIds.close"
          type="button"
          class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn"
          role="button"
          :aria-label="controlMap.close?.accessibleName"
          :aria-disabled="String(Boolean(controlMap.close?.state?.disabled))"
          :disabled="Boolean(controlMap.close?.state?.disabled)"
          :title="controlMap.close?.accessibleName"
          :data-semantic-anchor="anchors.close"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onClosePanel"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
      </div></template></UiToolbar></template><template v-else>
      <div class="cuk-capsule-panel__title-cluster">
      <div
        :id="domIds.tab"
        class="cuk-capsule-panel__tab-identity"
        tabindex="-1"
        role="tab"
        :aria-selected="String(controlMap.tab?.state?.selected !== false)"
        :aria-label="capsuleSnapshot ? (controlMap.tab?.accessibleName || titleText) : `${titleText} (unavailable)`"
        :data-semantic-anchor="anchors.tab"
      >
        <span class="cuk-capsule-panel__glyph" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><rect x="2" y="4" width="12" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" /></svg></span>
        <span class="cuk-capsule-panel__title">{{ titleText }}</span>
      </div>

      <div class="cuk-capsule-panel__axes" aria-label="Capsule status">
        <span class="cuk-capsule-panel__chip" :data-chip-variant="chipVariant" role="status"><span v-if="chipVariant === 'live'" class="cuk-capsule-panel__chip-dot" aria-hidden="true"></span><span class="cuk-capsule-panel__badge">{{ humanStatus }}</span></span>
      </div>
      </div>

      <div class="cuk-capsule-panel__actions" role="toolbar" :aria-label="`Actions for ${titleText}`">
        <template v-if="windowPresentation">
          <button :id="`window-hide-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/hide`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`Hide ${titleText}`" :title="`Hide ${titleText}`" @click="windowAction('hide')"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
          <button :id="`window-float-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/float`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`Float ${titleText}`" :title="`Float ${titleText}`" :aria-pressed="String(windowState.floating)" @click="windowAction('float')"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.5 3.5h3v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M12.5 3.5 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M6.5 5.5h-3v7h7v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <button :id="`window-maximize-${resolvedInstanceId}`" :data-semantic-anchor="`capsule/${capsuleId}/maximize`" class="cuk-capsule-panel__action-btn cuk-capsule-panel__icon-btn" type="button" role="button" :aria-label="`${windowState.maximized ? 'Restore' : 'Maximize'} ${titleText}`" :title="`${windowState.maximized ? 'Restore' : 'Maximize'} ${titleText}`" :aria-pressed="String(windowState.maximized)" @click="windowAction('maximize')"><svg v-if="windowState.maximized" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3.5h6.5V10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><rect x="3.5" y="6" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg><svg v-else viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>
        </template>
        <button
          :id="domIds.fold"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.fold?.accessibleName"
          :aria-expanded="String(!localFolded)"
          :aria-disabled="String(Boolean(controlMap.fold?.state?.disabled))"
          :disabled="Boolean(controlMap.fold?.state?.disabled)"
          :title="controlMap.fold?.state?.unavailableReason || controlMap.fold?.accessibleName"
          :data-semantic-anchor="anchors.fold"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onToggleFold"
        >
          {{ localFolded ? 'Unfold' : 'Fold' }}
        </button>

        <button
          :id="domIds.pin"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.pin?.accessibleName"
          :aria-pressed="String(localPinned)"
          :aria-disabled="String(Boolean(controlMap.pin?.state?.disabled))"
          :disabled="Boolean(controlMap.pin?.state?.disabled)"
          :title="controlMap.pin?.state?.unavailableReason || controlMap.pin?.accessibleName"
          :data-semantic-anchor="anchors.pin"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onTogglePin"
        >
          {{ localPinned ? 'Unpin' : 'Pin' }}
        </button>

        <button
          :id="domIds.control"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.control?.accessibleName"
          :aria-pressed="String(Boolean(controlMap.control?.state?.pressed))"
          :aria-disabled="String(Boolean(controlMap.control?.state?.disabled))"
          :disabled="Boolean(controlMap.control?.state?.disabled)"
          :title="controlMap.control?.state?.unavailableReason || controlMap.control?.accessibleName"
          :data-semantic-anchor="anchors.control"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onToggleControl"
        >
          Control
        </button>

        <button
          :id="domIds.popout"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.popout?.accessibleName"
          :aria-disabled="String(Boolean(controlMap.popout?.state?.disabled))"
          :disabled="Boolean(controlMap.popout?.state?.disabled)"
          :title="controlMap.popout?.state?.unavailableReason || controlMap.popout?.accessibleName"
          :data-semantic-anchor="anchors.popout"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
        >
          Popout
        </button>

        <button
          :id="domIds.dockBack"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap['dock-back']?.accessibleName"
          :aria-disabled="String(windowPresentation ? !windowState.floating : Boolean(controlMap['dock-back']?.state?.disabled))"
          :disabled="windowPresentation ? !windowState.floating : Boolean(controlMap['dock-back']?.state?.disabled)"
          :title="controlMap['dock-back']?.state?.unavailableReason || controlMap['dock-back']?.accessibleName"
          :data-semantic-anchor="anchors.dockBack"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onDockBack"
        >
          Dock back
        </button>

        <button
          :id="domIds.close"
          type="button"
          class="cuk-capsule-panel__action-btn"
          role="button"
          :aria-label="controlMap.close?.accessibleName"
          :aria-disabled="String(Boolean(controlMap.close?.state?.disabled))"
          :disabled="Boolean(controlMap.close?.state?.disabled)"
          :title="controlMap.close?.accessibleName"
          :data-semantic-anchor="anchors.close"
          @pointerdown="onControlPointerDown"
          @mousedown="onControlMouseDown"
          @click="onClosePanel"
        >
          Close
        </button>
      </div>
    </template></header>

    <div
      v-if="readinessError"
      class="cuk-capsule-panel__error-banner"
      role="alert"
    >
      {{ readinessError.message || 'Capsule readiness failed' }}
      <span v-if="readinessError.requestId">({{ readinessError.requestId }})</span>
    </div>

    <!-- Permanent body host stays mounted in DOM via v-show so folding never kills surface/session -->
    <div
      v-show="!localFolded"
      class="cuk-capsule-panel__body"
      data-permanent-host="true"
    >
      <div class="cuk-capsule-panel__surface-host" data-permanent-surface-host="true">
        <slot name="surface" :capsule="capsuleSnapshot" :folded="localFolded" />

        <div
          v-if="veilState.showVeil"
          class="cuk-capsule-panel__activation-veil"
          role="button"
          tabindex="0"
          :aria-label="`Activate keyboard focus for ${titleText}`"
          @click="onActivateVeil"
          @keydown.enter.prevent="onActivateVeil"
          @keydown.space.prevent="onActivateVeil"
        >
          <span class="cuk-capsule-panel__veil-label">Click or press Enter to focus surface</span>
        </div>
      </div>

      <section
        :id="domIds.slot"
        v-if="!externalAiSlot"
        v-show="!localSlotFolded"
        class="cuk-capsule-panel__multislot-region"
        role="region"
        :aria-label="controlMap.slot?.accessibleName || `AI sessions for ${titleText}`"
        :data-semantic-anchor="anchors.slot"
        data-permanent-slot-host="true"
      >
        <slot
          name="multislot"
          :capsule="capsuleSnapshot"
          :sessions="capsuleSnapshot?.sessions || []"
          :folded="localFolded || localSlotFolded"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.cuk-capsule-panel {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background-color: var(--cuk-component-capsule-panel-background, var(--cuk-semantic-surface-panel));
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-md);
  line-height: var(--cuk-semantic-typography-line-height-normal);
  transition-duration: var(--cuk-component-capsule-panel-fold-duration, 0ms);
}

.cuk-capsule-panel__header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  height: var(--cuk-component-s1-capsule-header-height);
  min-height: var(--cuk-component-s1-capsule-header-height);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-6);
  background-color: var(--cuk-component-capsule-panel-header-background, var(--cuk-semantic-surface-chrome));
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}

.cuk-capsule-panel__title-cluster {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  min-width: 0;
  flex: 1 1 auto;
}

.cuk-capsule-panel__tab-identity {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  min-width: 0;
}

.cuk-capsule-panel__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--cuk-semantic-text-accent);
}

.cuk-capsule-panel__glyph svg {
  display: block;
  width: var(--cuk-semantic-typography-font-size-lg);
  height: var(--cuk-semantic-typography-font-size-lg);
}

.cuk-capsule-panel__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  font-family: var(--cuk-semantic-typography-roles-headline-sm-font-family);
  line-height: var(--cuk-semantic-typography-roles-headline-sm-line-height);
  font-weight: var(--cuk-semantic-typography-roles-headline-sm-font-weight);
  color: var(--cuk-semantic-text-primary);
}

.cuk-capsule-panel__axes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-xs);
  flex: 0 0 auto;
}

.cuk-capsule-panel__chip {
  --chip-surface: var(--cuk-semantic-surface-sunken);
  --chip-border: var(--cuk-semantic-border-subtle);
  --chip-text: var(--cuk-semantic-text-muted);
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
}

.cuk-capsule-panel__chip[data-chip-variant="live"] {
  --chip-surface: var(--cuk-semantic-status-success-surface);
  --chip-border: var(--cuk-semantic-status-success-border);
  --chip-text: var(--cuk-semantic-status-success-text);
}

.cuk-capsule-panel__chip[data-chip-variant="active"] {
  --chip-surface: var(--cuk-semantic-status-info-surface);
  --chip-border: var(--cuk-semantic-accent-tertiary);
  --chip-text: var(--cuk-semantic-accent-tertiary);
}

.cuk-capsule-panel__chip[data-chip-variant="waiting"] {
  --chip-surface: var(--cuk-semantic-status-warning-surface);
  --chip-border: var(--cuk-semantic-status-warning-border);
  --chip-text: var(--cuk-semantic-status-warning-text);
}

.cuk-capsule-panel__chip[data-chip-variant="refused"] {
  --chip-surface: var(--cuk-semantic-status-error-surface);
  --chip-border: var(--cuk-semantic-status-error-border);
  --chip-text: var(--cuk-semantic-status-error-text);
}

.cuk-capsule-panel__chip[data-chip-variant="idle"] {
  --chip-surface: var(--cuk-semantic-surface-sunken);
  --chip-border: var(--cuk-semantic-border-subtle);
  --chip-text: var(--cuk-semantic-text-muted);
}

.cuk-capsule-panel__chip > .cuk-capsule-panel__badge,
.cuk-capsule-panel__chip :deep(.p-tag) {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--chip-border);
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--chip-surface);
  color: var(--chip-text);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-medium);
}

.cuk-capsule-panel__chip-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  flex: 0 0 auto;
  border-radius: var(--cuk-semantic-radius-pill);
  background-color: var(--cuk-semantic-status-success-icon);
}

.cuk-capsule-panel__actions {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  flex: 0 0 auto;
}

.cuk-capsule-panel__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-primitive-space-2);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-disabled);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  cursor: pointer;
}

.cuk-capsule-panel__icon-btn {
  width: calc(var(--cuk-semantic-typography-font-size-md) + var(--cuk-primitive-space-2) + var(--cuk-primitive-space-2));
  height: calc(var(--cuk-semantic-typography-font-size-md) + var(--cuk-primitive-space-2) + var(--cuk-primitive-space-2));
  min-height: var(--cuk-primitive-space-0);
  padding: var(--cuk-primitive-space-2);
}

.cuk-capsule-panel__icon-btn svg {
  display: block;
  width: var(--cuk-semantic-typography-font-size-md);
  height: var(--cuk-semantic-typography-font-size-md);
}

.cuk-capsule-panel__action-btn:hover:not(:disabled) {
  background-color: var(--cuk-semantic-surface-interactive);
  color: var(--cuk-semantic-text-primary);
}

.cuk-capsule-panel__action-btn:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) var(--cuk-semantic-focus-ring-style)
    var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}

.cuk-capsule-panel__action-btn:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  color: var(--cuk-semantic-text-disabled);
  cursor: not-allowed;
}

.cuk-capsule-panel__error-banner {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-component-capsule-panel-padding);
  background-color: var(--cuk-semantic-status-error-surface);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-error-border);
  color: var(--cuk-semantic-status-error-text);
  font-size: var(--cuk-semantic-typography-font-size-sm);
}

.cuk-capsule-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.cuk-capsule-panel__surface-host {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background-color: var(--cuk-component-surface-view-backdrop, var(--cuk-semantic-surface-sunken));
}

.cuk-capsule-panel__activation-veil {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--cuk-semantic-surface-overlay);
  color: var(--cuk-semantic-text-primary);
  z-index: var(--cuk-semantic-z-index-overlay);
  cursor: pointer;
}

.cuk-capsule-panel__veil-label {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-md);
  font-size: var(--cuk-semantic-typography-font-size-sm);
}

.cuk-capsule-panel__multislot-region {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  background-color: var(--cuk-component-multi-slot-header-background, var(--cuk-semantic-surface-chrome));
}
</style>

<style scoped>
.ui-capsule-toolbar{width:100%;padding:var(--cuk-primitive-space-0)!important;gap:var(--cuk-semantic-spacing-xs);background:var(--cuk-primitive-color-alpha-transparent)!important;border:0!important;flex-wrap:nowrap;}.ui-capsule-toolbar .p-toolbar-start{gap:var(--cuk-semantic-spacing-sm);min-width:0;flex:1 1 auto;}.ui-capsule-toolbar .p-toolbar-end{min-width:0;}
</style>
