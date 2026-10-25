<script>
/**
 * @fileoverview Core capability projection and explicit recipient target picker for the Orchestrator Drawer.
 * Implements UI_ARCHITECTURE.md §3 (OrchestratorDrawer ownership), §4 (Drafts & ingress alias cloning),
 * §6 (Capsule/Multislot identity, session activity/attachment, G5 focus preservation),
 * §7 (Target selection modes "One"/"Many"/"All", G3 per-slot lock, G4 target eligibility, review freeze/invalidation),
 * §8 (Flexbox panel internals and shared token roles), §9 (AI-operability contract for `drawer/targets/*` and `session/{sid}/target`),
 * and §13 (`TargetPicker.vue` unit: Core capability projection; duplicate/unknown recipient refuses).
 *
 * Structured adapter protocol name/version/capabilities and prompt/dispatch wire contracts in `envelope/v0.1`
 * are declared AUSENTE in UI_ARCHITECTURE.md §§5, 7, 14 R3; `adapterProtocol` defaults to `'AUSENTE'`.
 */

/** @typedef {'one' | 'many' | 'all'} TargetSelectionMode */

/**
 * @typedef {'unknown' | 'ready' | 'busy' | 'waiting-input' | 'waiting-permission' | 'exited' | 'failed'} SessionActivityState
 */

/**
 * @typedef {'detached' | 'attaching' | 'restoring' | 'live' | 'disconnected'} SessionAttachmentState
 */

/**
 * @typedef {'Ready' | 'Busy' | 'Done' | 'Error' | 'Unavailable'} TargetStatusBadge
 */

/**
 * @typedef {Object} SessionCapabilityDescriptor
 * @property {string} sessionId - Immutable session identity (`sid`); never a bare numeric list index.
 * @property {string} capsuleId - Immutable bound capsule identity.
 * @property {string} workspaceId - Workspace scope identifier.
 * @property {string} slotId - Target slot identity for G3 lock scoping.
 * @property {number} generation - Non-negative safe integer slot/session generation.
 * @property {number} epoch - Non-negative safe integer projection epoch.
 * @property {SessionActivityState} activity - Core-projected session activity state.
 * @property {SessionAttachmentState} attachment - Core-projected session attachment state.
 * @property {boolean} visibleInWorkspace - Whether session is in the visible workspace scope for "All".
 * @property {boolean} supportsQueue - Whether the authenticated adapter explicitly advertises queue semantics.
 * @property {number} maxQueueDepth - Declared queue bound when `supportsQueue` is true.
 * @property {number} currentQueueDepth - Current queued count when `supportsQueue` is true.
 * @property {boolean} inFlightLock - Whether core currently holds an active in-flight slot lock (G3).
 * @property {string} ownership - Current control/execution owner or `'none'`.
 * @property {string} adapterProtocol - Reviewed structured protocol identifier or `'AUSENTE'`.
 */

/**
 * @typedef {Object} ProjectedTargetCapabilityRow
 * @property {string} sessionId
 * @property {string} capsuleId
 * @property {string} workspaceId
 * @property {string} slotId
 * @property {string} slotLockKey
 * @property {number} generation
 * @property {number} epoch
 * @property {SessionActivityState} activity
 * @property {SessionAttachmentState} attachment
 * @property {boolean} visibleInWorkspace
 * @property {boolean} supportsQueue
 * @property {number} maxQueueDepth
 * @property {number} currentQueueDepth
 * @property {boolean} inFlightLock
 * @property {string} ownership
 * @property {string} adapterProtocol
 * @property {boolean} eligible
 * @property {'dispatch' | 'queue' | 'unavailable'} admissionMode
 * @property {TargetStatusBadge} statusBadge
 * @property {string | null} unavailableCode
 * @property {string | null} unavailableReason
 * @property {string} semanticAnchor
 * @property {string} quickTargetAnchor
 * @property {string} accessibleName
 */

export const TARGET_PICKER_MODES = Object.freeze(['one', 'many', 'all']);

export const ELIGIBLE_SESSION_ACTIVITIES = Object.freeze(['ready', 'waiting-input']);

export const ALL_SESSION_ACTIVITIES = Object.freeze([
  'unknown',
  'ready',
  'busy',
  'waiting-input',
  'waiting-permission',
  'exited',
  'failed'
]);

export const ALL_SESSION_ATTACHMENTS = Object.freeze([
  'detached',
  'attaching',
  'restoring',
  'live',
  'disconnected'
]);

const ALLOWED_DESCRIPTOR_KEYS = new Set([
  'sessionId',
  'capsuleId',
  'workspaceId',
  'slotId',
  'generation',
  'epoch',
  'activity',
  'attachment',
  'visibleInWorkspace',
  'supportsQueue',
  'maxQueueDepth',
  'currentQueueDepth',
  'inFlightLock',
  'ownership',
  'adapterProtocol'
]);

/**
 * Checks that an identity token is a non-empty immutable string without whitespace
 * and is never a bare numeric index/list-length token (UI_ARCHITECTURE §6, §9).
 *
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {{ ok: true, id: string } | { ok: false, code: string, message: string }}
 */
function validateImmutableEntityId(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      code: 'TARGET_INVALID_ID',
      message: `Field "${fieldName}" must be a non-empty string.`
    };
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return {
      ok: false,
      code: 'TARGET_INVALID_ID',
      message: `Field "${fieldName}" must not contain leading, trailing, or internal whitespace.`
    };
  }
  if (/^\d+$/.test(value)) {
    return {
      ok: false,
      code: 'SCHEMA_NUMERIC_INDEX_FORBIDDEN',
      message: `Field "${fieldName}" must use an immutable entity identity, never a bare numeric index ("${value}").`
    };
  }
  return { ok: /** @type {const} */ (true), id: value };
}

/**
 * Validates a single session capability descriptor against closed schema rules and deep-freezes a cloned copy.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, descriptor: SessionCapabilityDescriptor } | { ok: false, code: string, message: string }}
 */
export function validateSingleTargetCapability(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_DESCRIPTOR',
      message: 'Session capability descriptor must be a plain object.'
    };
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_DESCRIPTOR_KEYS.has(key)) {
      return {
        ok: false,
        code: 'SCHEMA_UNKNOWN_KEY',
        message: `Unknown key "${key}" in session capability descriptor.`
      };
    }
  }

  const obj = /** @type {Record<string, unknown>} */ (raw);
  for (const idField of ['sessionId', 'capsuleId', 'workspaceId', 'slotId']) {
    const idCheck = validateImmutableEntityId(obj[idField], idField);
    if (!idCheck.ok) {
      return idCheck;
    }
  }

  if (typeof obj.generation !== 'number' || !Number.isSafeInteger(obj.generation) || obj.generation < 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_GENERATION',
      message: 'Field "generation" must be a non-negative safe integer.'
    };
  }
  if (typeof obj.epoch !== 'number' || !Number.isSafeInteger(obj.epoch) || obj.epoch < 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_EPOCH',
      message: 'Field "epoch" must be a non-negative safe integer.'
    };
  }
  if (
    typeof obj.activity !== 'string' ||
    !ALL_SESSION_ACTIVITIES.includes(/** @type {SessionActivityState} */ (obj.activity))
  ) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ACTIVITY',
      message: `Field "activity" must be one of ${ALL_SESSION_ACTIVITIES.join(', ')}.`
    };
  }
  if (
    typeof obj.attachment !== 'string' ||
    !ALL_SESSION_ATTACHMENTS.includes(/** @type {SessionAttachmentState} */ (obj.attachment))
  ) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ATTACHMENT',
      message: `Field "attachment" must be one of ${ALL_SESSION_ATTACHMENTS.join(', ')}.`
    };
  }
  if (typeof obj.visibleInWorkspace !== 'boolean') {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_VISIBILITY',
      message: 'Field "visibleInWorkspace" must be a boolean.'
    };
  }
  if (typeof obj.supportsQueue !== 'boolean') {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_QUEUE_FLAG',
      message: 'Field "supportsQueue" must be a boolean.'
    };
  }

  const maxQueueDepth = obj.maxQueueDepth === undefined ? 0 : obj.maxQueueDepth;
  const currentQueueDepth = obj.currentQueueDepth === undefined ? 0 : obj.currentQueueDepth;
  if (typeof maxQueueDepth !== 'number' || !Number.isSafeInteger(maxQueueDepth) || maxQueueDepth < 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_QUEUE_BOUND',
      message: 'Field "maxQueueDepth" must be a non-negative safe integer.'
    };
  }
  if (typeof currentQueueDepth !== 'number' || !Number.isSafeInteger(currentQueueDepth) || currentQueueDepth < 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_QUEUE_DEPTH',
      message: 'Field "currentQueueDepth" must be a non-negative safe integer.'
    };
  }

  const inFlightLock = obj.inFlightLock === undefined ? false : obj.inFlightLock;
  if (typeof inFlightLock !== 'boolean') {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_LOCK_FLAG',
      message: 'Field "inFlightLock" must be a boolean.'
    };
  }

  const ownership = obj.ownership === undefined ? 'none' : obj.ownership;
  if (typeof ownership !== 'string' || ownership.trim().length === 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_OWNERSHIP',
      message: 'Field "ownership" must be a non-empty string.'
    };
  }

  const adapterProtocol = obj.adapterProtocol === undefined ? 'AUSENTE' : obj.adapterProtocol;
  if (typeof adapterProtocol !== 'string' || adapterProtocol.trim().length === 0) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_PROTOCOL',
      message: 'Field "adapterProtocol" must be a non-empty string.'
    };
  }

  return {
    ok: true,
    descriptor: Object.freeze({
      sessionId: /** @type {string} */ (obj.sessionId),
      capsuleId: /** @type {string} */ (obj.capsuleId),
      workspaceId: /** @type {string} */ (obj.workspaceId),
      slotId: /** @type {string} */ (obj.slotId),
      generation: /** @type {number} */ (obj.generation),
      epoch: /** @type {number} */ (obj.epoch),
      activity: /** @type {SessionActivityState} */ (obj.activity),
      attachment: /** @type {SessionAttachmentState} */ (obj.attachment),
      visibleInWorkspace: /** @type {boolean} */ (obj.visibleInWorkspace),
      supportsQueue: /** @type {boolean} */ (obj.supportsQueue),
      maxQueueDepth,
      currentQueueDepth,
      inFlightLock,
      ownership,
      adapterProtocol
    })
  };
}

/**
 * Validates an entire core capability projection batch (fail-closed: rejects whole batch on any malformed row,
 * duplicate `sessionId`, duplicate `slotId@generation`, or stale epoch).
 *
 * @param {unknown} rawBatch
 * @param {{ expectedEpoch?: number }} [options]
 * @returns {{ ok: true, descriptors: readonly SessionCapabilityDescriptor[], byId: Readonly<Record<string, SessionCapabilityDescriptor>> } | { ok: false, code: string, message: string }}
 */
export function validateTargetCapabilityProjection(rawBatch, options = {}) {
  if (!Array.isArray(rawBatch)) {
    return {
      ok: false,
      code: 'SCHEMA_BATCH_NOT_ARRAY',
      message: 'Capability projection batch must be an array.'
    };
  }

  const expectedEpoch = options.expectedEpoch;
  /** @type {SessionCapabilityDescriptor[]} */
  const descriptors = [];
  /** @type {Record<string, SessionCapabilityDescriptor>} */
  const byId = {};
  const seenSessions = new Set();
  const seenSlotGenerations = new Set();

  for (const item of rawBatch) {
    const single = validateSingleTargetCapability(item);
    if (!single.ok) {
      return single;
    }
    const desc = single.descriptor;
    if (expectedEpoch !== undefined && desc.epoch < expectedEpoch) {
      return {
        ok: false,
        code: 'PROJECTION_STALE_EPOCH',
        message: `Session "${desc.sessionId}" has stale epoch (${desc.epoch} < ${expectedEpoch}).`
      };
    }
    if (seenSessions.has(desc.sessionId)) {
      return {
        ok: false,
        code: 'SCHEMA_DUPLICATE_SESSION_ID',
        message: `Duplicate sessionId "${desc.sessionId}" in capability projection batch.`
      };
    }
    const slotKey = `${desc.slotId}@${desc.generation}`;
    if (seenSlotGenerations.has(slotKey)) {
      return {
        ok: false,
        code: 'SCHEMA_DUPLICATE_SLOT_GENERATION',
        message: `Duplicate slot@generation "${slotKey}" in capability projection batch.`
      };
    }
    seenSessions.add(desc.sessionId);
    seenSlotGenerations.add(slotKey);
    descriptors.push(desc);
    byId[desc.sessionId] = desc;
  }

  descriptors.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return {
    ok: true,
    descriptors: Object.freeze(descriptors),
    byId: Object.freeze(byId)
  };
}

/**
 * Projects a single validated session capability descriptor into a UI target row with G3/G4 eligibility,
 * visible status badge, unavailable reason, and §9 semantic control metadata.
 *
 * @param {SessionCapabilityDescriptor} descriptor
 * @param {{ workspaceId?: string, allowQueue?: boolean }} [options]
 * @returns {ProjectedTargetCapabilityRow}
 */
export function projectTargetCapabilityRow(descriptor, options = {}) {
  const activeWorkspace = options.workspaceId ?? descriptor.workspaceId;
  const allowQueue = Boolean(options.allowQueue);
  const slotLockKey = `${descriptor.slotId}@${descriptor.generation}`;

  /** @type {boolean} */
  let eligible = false;
  /** @type {'dispatch' | 'queue' | 'unavailable'} */
  let admissionMode = 'unavailable';
  /** @type {string | null} */
  let unavailableCode = null;
  /** @type {string | null} */
  let unavailableReason = null;

  if (descriptor.workspaceId !== activeWorkspace) {
    unavailableCode = 'TARGET_WRONG_WORKSPACE';
    unavailableReason = `Session "${descriptor.sessionId}" belongs to workspace "${descriptor.workspaceId}", not "${activeWorkspace}".`;
  } else if (descriptor.attachment !== 'live') {
    unavailableCode = 'G4_ATTACHMENT_NOT_LIVE';
    unavailableReason = `Session "${descriptor.sessionId}" attachment is "${descriptor.attachment}" (requires "live").`;
  } else if (ELIGIBLE_SESSION_ACTIVITIES.includes(descriptor.activity) && !descriptor.inFlightLock) {
    eligible = true;
    admissionMode = 'dispatch';
  } else if (
    (descriptor.activity === 'busy' ||
      (ELIGIBLE_SESSION_ACTIVITIES.includes(descriptor.activity) && descriptor.inFlightLock)) &&
    allowQueue &&
    descriptor.supportsQueue
  ) {
    if (descriptor.maxQueueDepth <= 0 || descriptor.currentQueueDepth >= descriptor.maxQueueDepth) {
      unavailableCode = 'G3_QUEUE_FULL';
      unavailableReason = `Session "${descriptor.sessionId}" queue is full (${descriptor.currentQueueDepth}/${descriptor.maxQueueDepth}).`;
    } else {
      eligible = true;
      admissionMode = 'queue';
    }
  } else if (descriptor.inFlightLock) {
    unavailableCode = 'G3_SLOT_BUSY_LOCKED';
    unavailableReason = `Slot "${slotLockKey}" for session "${descriptor.sessionId}" holds an active in-flight lock and queue admission is unavailable.`;
  } else {
    unavailableCode = 'G4_ACTIVITY_INELIGIBLE';
    unavailableReason = `Session "${descriptor.sessionId}" activity is "${descriptor.activity}" (only "ready" or "waiting-input" are eligible).`;
  }

  /** @type {TargetStatusBadge} */
  let statusBadge = 'Unavailable';
  if (eligible) {
    statusBadge = admissionMode === 'queue' ? 'Busy' : 'Ready';
  } else if (descriptor.activity === 'busy' || descriptor.inFlightLock) {
    statusBadge = 'Busy';
  } else if (descriptor.activity === 'exited') {
    statusBadge = 'Done';
  } else if (descriptor.activity === 'failed') {
    statusBadge = 'Error';
  } else {
    statusBadge = 'Unavailable';
  }

  const semanticAnchor = `drawer/targets/${descriptor.sessionId}`;
  const quickTargetAnchor = `session/${descriptor.sessionId}/target`;
  const accessibleName = eligible
    ? `Target session ${descriptor.sessionId} (${descriptor.capsuleId}, ${statusBadge})`
    : `Target session ${descriptor.sessionId} (${descriptor.capsuleId}, unavailable: ${unavailableReason})`;

  return Object.freeze({
    sessionId: descriptor.sessionId,
    capsuleId: descriptor.capsuleId,
    workspaceId: descriptor.workspaceId,
    slotId: descriptor.slotId,
    slotLockKey,
    generation: descriptor.generation,
    epoch: descriptor.epoch,
    activity: descriptor.activity,
    attachment: descriptor.attachment,
    visibleInWorkspace: descriptor.visibleInWorkspace,
    supportsQueue: descriptor.supportsQueue,
    maxQueueDepth: descriptor.maxQueueDepth,
    currentQueueDepth: descriptor.currentQueueDepth,
    inFlightLock: descriptor.inFlightLock,
    ownership: descriptor.ownership,
    adapterProtocol: descriptor.adapterProtocol,
    eligible,
    admissionMode,
    statusBadge,
    unavailableCode,
    unavailableReason,
    semanticAnchor,
    quickTargetAnchor,
    accessibleName
  });
}

/**
 * Validates an explicit recipient selection against the current capability projection.
 * Refuses duplicate recipient IDs, unknown or prefix-matched IDs, bare numeric index IDs,
 * cross-workspace recipients, same-slot collisions, or ineligible recipients before any effect.
 *
 * @param {unknown} rawTargetIds
 * @param {Readonly<Record<string, ProjectedTargetCapabilityRow>>} projectedById
 * @param {{ requireEligible?: boolean, requireNonEmpty?: boolean }} [options]
 * @returns {{ ok: true, targetIds: readonly string[], rows: readonly ProjectedTargetCapabilityRow[] } | { ok: false, code: string, message: string, targetId?: string }}
 */
export function validateRecipientSelection(rawTargetIds, projectedById, options = {}) {
  const requireEligible = options.requireEligible !== false;
  const requireNonEmpty = Boolean(options.requireNonEmpty);

  if (!Array.isArray(rawTargetIds)) {
    return {
      ok: false,
      code: 'TARGETS_NOT_ARRAY',
      message: 'Recipient target selection must be an array of session IDs.'
    };
  }

  if (requireNonEmpty && rawTargetIds.length === 0) {
    return {
      ok: false,
      code: 'TARGETS_EMPTY',
      message: 'At least one explicit target session is required; empty targets never default to all.'
    };
  }

  const seenIds = new Set();
  const seenSlots = new Set();
  /** @type {string[]} */
  const validatedIds = [];
  /** @type {ProjectedTargetCapabilityRow[]} */
  const validatedRows = [];

  for (const rawId of rawTargetIds) {
    if (typeof rawId !== 'string' || rawId.trim().length === 0 || rawId !== rawId.trim() || /\s/.test(rawId) || /^\d+$/.test(rawId)) {
      return {
        ok: false,
        code: 'TARGET_INVALID_ID',
        message: `Invalid recipient session ID "${String(rawId)}"; must be an immutable non-numeric identifier.`,
        targetId: String(rawId)
      };
    }

    if (seenIds.has(rawId)) {
      return {
        ok: false,
        code: 'TARGET_DUPLICATE_ID',
        message: `Duplicate recipient session ID "${rawId}" is refused.`,
        targetId: rawId
      };
    }
    seenIds.add(rawId);

    if (!Object.prototype.hasOwnProperty.call(projectedById, rawId) || !projectedById[rawId]) {
      return {
        ok: false,
        code: 'TARGET_UNKNOWN',
        message: `Unknown recipient session ID "${rawId}" is not in the projected capability inventory (prefix matching is forbidden).`,
        targetId: rawId
      };
    }

    const row = /** @type {ProjectedTargetCapabilityRow} */ (projectedById[rawId]);
    if (requireEligible && !row.eligible) {
      return {
        ok: false,
        code: row.unavailableCode ?? 'G4_ACTIVITY_INELIGIBLE',
        message: row.unavailableReason ?? `Recipient session "${rawId}" is not eligible.`,
        targetId: rawId
      };
    }

    if (seenSlots.has(row.slotLockKey)) {
      return {
        ok: false,
        code: 'G3_SAME_SLOT_CONFLICT',
        message: `Multiple selected recipients map to the same slot lock "${row.slotLockKey}".`,
        targetId: rawId
      };
    }
    seenSlots.add(row.slotLockKey);

    validatedIds.push(rawId);
    validatedRows.push(row);
  }

  return {
    ok: true,
    targetIds: Object.freeze([...validatedIds].sort()),
    rows: Object.freeze(validatedRows)
  };
}

/**
 * Preserves live-surface DOM focus when clicking adjacent TargetPicker controls (§6 G5:
 * "`pointerdown` and `mousedown` use `preventDefault()` to preserve live-host focus;
 * button click still submits its explicit intent; keyboard semantics remain intact").
 *
 * @param {{ type?: string, preventDefault?: () => void } | null | undefined} event
 */
export function preserveLiveSurfaceFocus(event) {
  if (
    event &&
    (event.type === 'pointerdown' || event.type === 'mousedown') &&
    typeof event.preventDefault === 'function'
  ) {
    event.preventDefault();
  }
}

/**
 * Serializes a frozen target basis row for deterministic comparison across projection updates.
 *
 * @param {ProjectedTargetCapabilityRow} row
 * @returns {string}
 */
function serializeTargetBasis(row) {
  return JSON.stringify([
    row.sessionId,
    row.capsuleId,
    row.workspaceId,
    row.slotId,
    row.generation,
    row.epoch,
    row.activity,
    row.attachment,
    row.supportsQueue,
    row.ownership,
    row.adapterProtocol,
    row.admissionMode
  ]);
}

/**
 * Creates a pure stateful TargetPicker controller enforcing UI_ARCHITECTURE.md §§4, 6, 7, 9, and 13.
 *
 * @param {Object} [config]
 * @param {string} [config.workspaceId]
 * @param {number} [config.epoch]
 * @param {boolean} [config.allowQueue]
 * @param {boolean} [config.pickerOpen]
 */
export function createTargetPickerState(config = {}) {
  let workspaceId =
    typeof config.workspaceId === 'string' && config.workspaceId.trim().length > 0
      ? config.workspaceId
      : 'ws-main';
  let currentEpoch =
    typeof config.epoch === 'number' && Number.isSafeInteger(config.epoch) && config.epoch >= 0
      ? config.epoch
      : 1;
  let allowQueue = Boolean(config.allowQueue);
  let pickerOpen = Boolean(config.pickerOpen);

  /** @type {TargetSelectionMode} */
  let selectionMode = 'many';
  /** @type {string[]} */
  let selectedTargetIds = [];

  // Strictly independent identities (§6, §7, §9)
  /** @type {string | null} */
  let viewedSessionId = null;
  /** @type {string | null} */
  let focusedTerminalSessionId = null;
  /** @type {string | null} */
  let controllingSessionId = null;

  /** @type {Map<string, SessionCapabilityDescriptor>} */
  const descriptorsById = new Map();
  /** @type {Record<string, ProjectedTargetCapabilityRow>} */
  let projectedById = Object.freeze({});
  /** @type {readonly ProjectedTargetCapabilityRow[]} */
  let projectedRows = Object.freeze([]);

  /**
   * @type {{
   *   workspaceId: string,
   *   selectionMode: TargetSelectionMode,
   *   targetIds: readonly string[],
   *   visibleScopeIds: readonly string[],
   *   basisByTarget: Readonly<Record<string, string>>
   * } | null}
   */
  let frozenReview = null;
  /** @type {{ code: string, reason: string } | null} */
  let lastInvalidation = null;
  /** @type {{ code: string, message: string, targetId?: string } | null} */
  let lastRefusal = null;

  function recomputeProjectedRows() {
    /** @type {ProjectedTargetCapabilityRow[]} */
    const rows = [];
    /** @type {Record<string, ProjectedTargetCapabilityRow>} */
    const byId = {};
    const sortedIds = [...descriptorsById.keys()].sort();
    for (const sid of sortedIds) {
      const desc = /** @type {SessionCapabilityDescriptor} */ (descriptorsById.get(sid));
      const row = projectTargetCapabilityRow(desc, { workspaceId, allowQueue });
      rows.push(row);
      byId[sid] = row;
    }
    projectedRows = Object.freeze(rows);
    projectedById = Object.freeze(byId);
  }

  /**
   * Returns sorted visible and eligible session IDs in the active workspace for "All" mode.
   *
   * @returns {string[]}
   */
  function getVisibleEligibleWorkspaceIds() {
    const ids = [];
    for (const row of projectedRows) {
      if (row.workspaceId === workspaceId && row.visibleInWorkspace && row.eligible) {
        ids.push(row.sessionId);
      }
    }
    return ids;
  }

  /**
   * Returns all visible session IDs in the active workspace (used to detect "All" scope shifts).
   *
   * @returns {string[]}
   */
  function getAllVisibleWorkspaceIds() {
    const ids = [];
    for (const row of projectedRows) {
      if (row.workspaceId === workspaceId && row.visibleInWorkspace) {
        ids.push(row.sessionId);
      }
    }
    return ids;
  }

  /**
   * @param {string} code
   * @param {string} reason
   */
  function invalidateReviewIfActive(code, reason) {
    if (frozenReview !== null) {
      frozenReview = null;
      lastInvalidation = Object.freeze({ code, reason });
    }
  }

  function revalidateFrozenReview() {
    const review = frozenReview;
    if (!review) {
      return false;
    }
    if (review.workspaceId !== workspaceId) {
      invalidateReviewIfActive('REVIEW_INVALIDATED_WORKSPACE_CHANGED', 'Workspace scope changed after review freeze.');
      return false;
    }
    if (
      selectedTargetIds.length !== review.targetIds.length ||
      selectedTargetIds.some((id, idx) => id !== review.targetIds[idx])
    ) {
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', 'Selected target set changed after review freeze.');
      return false;
    }
    if (review.selectionMode === 'all') {
      const currentVisible = getAllVisibleWorkspaceIds();
      if (
        currentVisible.length !== review.visibleScopeIds.length ||
        currentVisible.some((id, idx) => id !== review.visibleScopeIds[idx])
      ) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_ALL_SCOPE_CHANGED',
          'Visible workspace session scope changed while in "all" mode; newly created or changed sessions cannot silently join.'
        );
        return false;
      }
    }
    for (const sid of review.targetIds) {
      const row = projectedById[sid];
      if (!row) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_TARGET_REMOVED',
          `Frozen target "${sid}" was removed from capability projection.`
        );
        return false;
      }
      if (!row.eligible) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_TARGET_INELIGIBLE',
          row.unavailableReason ?? `Frozen target "${sid}" became ineligible.`
        );
        return false;
      }
      if (serializeTargetBasis(row) !== review.basisByTarget[sid]) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_BASIS_CHANGED',
          `Capability basis for frozen target "${sid}" changed since review freeze.`
        );
        return false;
      }
    }
    return true;
  }

  return Object.freeze({
    /**
     * Validates and loads a new core capability projection batch.
     *
     * @param {unknown} rawBatch
     * @param {{ expectedEpoch?: number }} [options]
     */
    loadCapabilityProjection(rawBatch, options = {}) {
      const validated = validateTargetCapabilityProjection(rawBatch, {
        expectedEpoch: options.expectedEpoch ?? currentEpoch
      });
      if (!validated.ok) {
        lastRefusal = Object.freeze({ code: validated.code, message: validated.message });
        return validated;
      }

      descriptorsById.clear();
      let maxEpoch = currentEpoch;
      for (const desc of validated.descriptors) {
        descriptorsById.set(desc.sessionId, desc);
        if (desc.epoch > maxEpoch) {
          maxEpoch = desc.epoch;
        }
      }
      currentEpoch = maxEpoch;
      recomputeProjectedRows();
      revalidateFrozenReview();

      return {
        ok: /** @type {const} */ (true),
        count: projectedRows.length,
        rows: projectedRows
      };
    },

    /**
     * Selects a single explicit recipient ("One" mode). Refuses unknown or ineligible recipient.
     *
     * @param {string} sessionId
     */
    selectOne(sessionId) {
      const check = validateRecipientSelection([sessionId], projectedById, {
        requireEligible: true,
        requireNonEmpty: true
      });
      if (!check.ok) {
        lastRefusal = Object.freeze({ code: check.code, message: check.message, ...(check.targetId === undefined ? {} : {targetId: check.targetId}) });
        return check;
      }
      lastRefusal = null;
      selectionMode = 'one';
      selectedTargetIds = [...check.targetIds];
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', `Selected single target "${sessionId}".`);
      return { ok: /** @type {const} */ (true), mode: selectionMode, targetIds: Object.freeze([...selectedTargetIds]) };
    },

    /**
     * Selects an explicit checked set of recipients ("Many" mode).
     * Refuses duplicate, unknown, prefix-matched, same-slot, or ineligible recipients without mutating prior state.
     *
     * @param {readonly string[]} sessionIds
     */
    selectMany(sessionIds) {
      const check = validateRecipientSelection(sessionIds, projectedById, {
        requireEligible: true,
        requireNonEmpty: false
      });
      if (!check.ok) {
        lastRefusal = Object.freeze({ code: check.code, message: check.message, ...(check.targetId === undefined ? {} : {targetId: check.targetId}) });
        return check;
      }
      lastRefusal = null;
      selectionMode = 'many';
      selectedTargetIds = [...check.targetIds];
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', 'Updated explicit target selection.');
      return { ok: /** @type {const} */ (true), mode: selectionMode, targetIds: Object.freeze([...selectedTargetIds]) };
    },

    /**
     * Toggles a single recipient checkbox in "Many" mode.
     *
     * @param {string} sessionId
     */
    toggleRecipient(sessionId) {
      if (typeof sessionId !== 'string' || !Object.prototype.hasOwnProperty.call(projectedById, sessionId)) {
        const code = typeof sessionId === 'string' && /^\d+$/.test(sessionId) ? 'TARGET_INVALID_ID' : 'TARGET_UNKNOWN';
        const message = `Unknown or invalid recipient session "${String(sessionId)}".`;
        lastRefusal = Object.freeze({ code, message, targetId: String(sessionId) });
        return { ok: false, code, message };
      }

      const currentlyChecked = selectedTargetIds.includes(sessionId);
      const nextIds = currentlyChecked
        ? selectedTargetIds.filter((id) => id !== sessionId)
        : [...selectedTargetIds, sessionId];

      const check = validateRecipientSelection(nextIds, projectedById, {
        requireEligible: true,
        requireNonEmpty: false
      });
      if (!check.ok) {
        lastRefusal = Object.freeze({ code: check.code, message: check.message, ...(check.targetId === undefined ? {} : {targetId: check.targetId}) });
        return check;
      }

      lastRefusal = null;
      selectionMode = 'many';
      selectedTargetIds = [...check.targetIds];
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', `Toggled target "${sessionId}".`);
      return {
        ok: /** @type {const} */ (true),
        checked: !currentlyChecked,
        mode: selectionMode,
        targetIds: Object.freeze([...selectedTargetIds])
      };
    },

    /**
     * Expands "All" into the explicit visible eligible set in the active workspace before review (§7).
     */
    selectAllInWorkspace() {
      const eligibleVisibleIds = getVisibleEligibleWorkspaceIds();
      lastRefusal = null;
      selectionMode = 'all';
      selectedTargetIds = [...eligibleVisibleIds];
      invalidateReviewIfActive(
        'REVIEW_INVALIDATED_TARGETS_CHANGED',
        'Expanded "All" into visible workspace targets.'
      );
      return {
        ok: /** @type {const} */ (true),
        mode: selectionMode,
        targetIds: Object.freeze([...selectedTargetIds])
      };
    },

    /**
     * Clears all selected targets. Empty targets always disable Send and never mean all (§7).
     */
    clearTargets() {
      lastRefusal = null;
      selectionMode = 'many';
      selectedTargetIds = [];
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_EMPTY', 'Targets cleared; empty targets disable Send.');
      return {
        ok: /** @type {const} */ (true),
        mode: selectionMode,
        targetIds: Object.freeze([])
      };
    },

    /**
     * Freezes the current target selection and capability basis for dispatch review (§7).
     * Refuses if selection is empty (empty never means all) or if any target is ineligible.
     */
    freezeReviewTargets() {
      const check = validateRecipientSelection(selectedTargetIds, projectedById, {
        requireEligible: true,
        requireNonEmpty: true
      });
      if (!check.ok) {
        lastRefusal = Object.freeze({ code: check.code, message: check.message, ...(check.targetId === undefined ? {} : {targetId: check.targetId}) });
        return check;
      }

      /** @type {Record<string, string>} */
      const basisByTarget = {};
      for (const row of check.rows) {
        basisByTarget[row.sessionId] = serializeTargetBasis(row);
      }

      frozenReview = Object.freeze({
        workspaceId,
        selectionMode,
        targetIds: check.targetIds,
        visibleScopeIds: Object.freeze(getAllVisibleWorkspaceIds()),
        basisByTarget: Object.freeze(basisByTarget)
      });
      lastInvalidation = null;
      lastRefusal = null;

      return {
        ok: /** @type {const} */ (true),
        review: frozenReview
      };
    },

    /**
     * Updates workspace scope and re-evaluates eligibility and review validity.
     *
     * @param {string} nextWorkspaceId
     */
    setWorkspaceId(nextWorkspaceId) {
      const check = validateImmutableEntityId(nextWorkspaceId, 'workspaceId');
      if (!check.ok) {
        return check;
      }
      if (check.id !== workspaceId) {
        workspaceId = check.id;
        recomputeProjectedRows();
        invalidateReviewIfActive('REVIEW_INVALIDATED_WORKSPACE_CHANGED', 'Workspace scope changed.');
      }
      return { ok: /** @type {const} */ (true), workspaceId };
    },

    /**
     * Updates queue request option and re-evaluates eligibility and review validity.
     *
     * @param {boolean} allow
     */
    setAllowQueue(allow) {
      const next = Boolean(allow);
      if (next !== allowQueue) {
        allowQueue = next;
        recomputeProjectedRows();
        revalidateFrozenReview();
      }
    },

    /**
     * Sets whether the target picker popup/panel is open.
     *
     * @param {boolean} open
     */
    setPickerOpen(open) {
      pickerOpen = Boolean(open);
    },

    // --- Independent session identities (§6, §7, §9: never alter checked target set) ---

    /**
     * @param {string | null} sessionId
     */
    setViewedSession(sessionId) {
      viewedSessionId = sessionId;
    },

    /**
     * @param {string | null} sessionId
     */
    setFocusedTerminalSession(sessionId) {
      focusedTerminalSessionId = sessionId;
    },

    /**
     * @param {string | null} sessionId
     */
    setControllingSession(sessionId) {
      controllingSessionId = sessionId;
    },

    /**
     * Handles keyboard events according to §7:
     * - Terminal keystrokes never bubble into picker shortcuts.
     * - Escape closes innermost picker first, then cancels active review, and NEVER cancels a running dispatch.
     *
     * @param {{ key: string, fromTerminal?: boolean, isComposing?: boolean }} event
     * @returns {{ action: 'ignore-terminal-key' | 'ignore-ime' | 'close-picker' | 'cancel-review' | 'noop', cancelRun: false }}
     */
    handleKeyDown(event) {
      if (event && event.fromTerminal) {
        return { action: 'ignore-terminal-key', cancelRun: false };
      }
      if (event && event.isComposing) {
        return { action: 'ignore-ime', cancelRun: false };
      }
      if (event && event.key === 'Escape') {
        if (pickerOpen) {
          pickerOpen = false;
          return { action: 'close-picker', cancelRun: false };
        }
        if (frozenReview !== null) {
          invalidateReviewIfActive('REVIEW_CANCELLED_BY_ESCAPE', 'Active review closed via Escape key.');
          return { action: 'cancel-review', cancelRun: false };
        }
      }
      return { action: 'noop', cancelRun: false };
    },

    /**
     * Builds the declarative §9 semantic control inventory for `drawer/targets/*` and `session/{sid}/target`.
     * Hidden, unmaterialized, or off-DOM nodes always report `box: null`.
     *
     * @param {{
     *   visible?: boolean,
     *   materialized?: boolean,
     *   inDom?: boolean,
     *   presentationInstance?: string,
     *   boxesByAnchor?: Record<string, { x: number, y: number, width: number, height: number }>
     * }} [options]
     */
    getSemanticControls(options = {}) {
      const visible = options.visible !== false;
      const materialized = options.materialized !== false;
      const inDom = options.inDom !== false;
      const presentationInstance = options.presentationInstance ?? 'drawer-primary';
      const boxesByAnchor = options.boxesByAnchor ?? {};

      /**
       * @param {string} anchor
       */
      function resolveBox(anchor) {
        if (!visible || !materialized || !inDom) {
          return null;
        }
        const rawBox = boxesByAnchor[anchor];
        if (!rawBox) {
          return null;
        }
        const w = Math.round(rawBox.width);
        const h = Math.round(rawBox.height);
        if (w <= 0 || h <= 0) {
          return null;
        }
        return Object.freeze({
          x: Math.round(rawBox.x),
          y: Math.round(rawBox.y),
          width: w,
          height: h
        });
      }

      const eligibleInWorkspaceCount = getVisibleEligibleWorkspaceIds().length;
      /** @type {import('../agent/controlRegistry.js').ControlRegistrationInput[]} */
      const controls = [
        Object.freeze({
          semanticAnchor: 'drawer/targets/all',
          entityId: 'drawer-targets',
          presentationInstance,
          controlSlot: 'targets-all',
          role: 'button',
          accessibleName: 'Select all in workspace',
          state: Object.freeze({
            disabled: eligibleInWorkspaceCount === 0,
            ...(eligibleInWorkspaceCount === 0
              ? { unavailableReason: 'No eligible visible sessions in active workspace' }
              : {})
          }),
          visible,
          materialized,
          inDom,
          box: resolveBox('drawer/targets/all'),
          epoch: currentEpoch
        }),
        Object.freeze({
          semanticAnchor: 'drawer/targets/clear',
          entityId: 'drawer-targets',
          presentationInstance,
          controlSlot: 'targets-clear',
          role: 'button',
          accessibleName: 'Clear targets',
          state: Object.freeze({
            disabled: selectedTargetIds.length === 0
          }),
          visible,
          materialized,
          inDom,
          box: resolveBox('drawer/targets/clear'),
          epoch: currentEpoch
        })
      ];

      for (const row of projectedRows) {
        const isChecked = selectedTargetIds.includes(row.sessionId);
        controls.push(
          Object.freeze({
            semanticAnchor: row.semanticAnchor,
            entityId: row.sessionId,
            presentationInstance,
            controlSlot: `target-checkbox-${row.sessionId}`,
            role: 'checkbox',
            accessibleName: row.accessibleName,
            state: Object.freeze({
              checked: isChecked,
              disabled: !row.eligible,
              statusBadge: row.statusBadge,
              ...(!row.eligible && row.unavailableReason ? { unavailableReason: row.unavailableReason } : {})
            }),
            visible,
            materialized,
            inDom,
            box: resolveBox(row.semanticAnchor),
            epoch: row.epoch,
            generation: row.generation
          }),
          Object.freeze({
            semanticAnchor: row.quickTargetAnchor,
            entityId: row.sessionId,
            presentationInstance,
            controlSlot: `session-target-${row.sessionId}`,
            role: 'button',
            accessibleName: `Target only session ${row.sessionId} (${row.capsuleId})`,
            state: Object.freeze({
              pressed: selectionMode === 'one' && isChecked && selectedTargetIds.length === 1,
              disabled: !row.eligible,
              ...(!row.eligible && row.unavailableReason ? { unavailableReason: row.unavailableReason } : {})
            }),
            visible,
            materialized,
            inDom,
            box: resolveBox(row.quickTargetAnchor),
            epoch: row.epoch,
            generation: row.generation
          })
        );
      }

      return Object.freeze(controls);
    },

    /**
     * Returns an immutable snapshot of the current TargetPicker state.
     */
    getSnapshot() {
      const reviewValid = revalidateFrozenReview();
      return Object.freeze({
        workspaceId,
        epoch: currentEpoch,
        allowQueue,
        pickerOpen,
        selectionMode,
        selectedTargetIds: Object.freeze([...selectedTargetIds]),
        viewedSessionId,
        focusedTerminalSessionId,
        controllingSessionId,
        projectedRows,
        projectedById,
        sendEnabled: selectedTargetIds.length > 0,
        reviewValid,
        frozenReview: reviewValid ? frozenReview : null,
        lastInvalidation,
        lastRefusal
      });
    }
  });
}
</script>

<script setup>
import { shallowRef, computed, watch } from 'vue';

const props = defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: /** @type {import('vue').PropType<string[]>} */ (Array),
    default: () => []
  },
  workspaceId: {
    type: String,
    default: 'ws-main'
  },
  epoch: {
    type: Number,
    default: 1
  },
  allowQueue: {
    type: Boolean,
    default: false
  },
  viewedSessionId: {
    type: String,
    default: null
  },
  focusedTerminalSessionId: {
    type: String,
    default: null
  },
  controllingSessionId: {
    type: String,
    default: null
  }
});

const emit = defineEmits([
  'update:modelValue',
  'targets-changed',
  'recipient-refused',
  'review-invalidated',
  'picker-closed'
]);

const controller = createTargetPickerState({
  workspaceId: props.workspaceId,
  epoch: props.epoch,
  allowQueue: props.allowQueue,
  pickerOpen: true
});

const snapshot = shallowRef(controller.getSnapshot());

function syncSnapshot() {
  const prevInvalidation = snapshot.value.lastInvalidation;
  const next = controller.getSnapshot();
  snapshot.value = next;
  if (next.lastInvalidation && next.lastInvalidation !== prevInvalidation) {
    emit('review-invalidated', next.lastInvalidation);
  }
}

// Initialize from initial props
controller.loadCapabilityProjection(props.sessions, { expectedEpoch: props.epoch });
if (Array.isArray(props.modelValue) && props.modelValue.length > 0) {
  controller.selectMany(props.modelValue);
}
syncSnapshot();

watch(
  () => /** @type {const} */ ([props.workspaceId, props.allowQueue]),
  ([nextWs, nextAllowQueue]) => {
    controller.setWorkspaceId(nextWs);
    controller.setAllowQueue(nextAllowQueue);
    syncSnapshot();
  }
);

watch(
  () => props.sessions,
  (nextSessions) => {
    const res = controller.loadCapabilityProjection(nextSessions, { expectedEpoch: props.epoch });
    syncSnapshot();
    if (!res.ok) {
      emit('recipient-refused', { code: res.code, message: res.message });
    }
  }
);

watch(
  () => [props.viewedSessionId, props.focusedTerminalSessionId, props.controllingSessionId],
  ([viewed, focused, controlling]) => {
    controller.setViewedSession(viewed ?? null);
    controller.setFocusedTerminalSession(focused ?? null);
    controller.setControllingSession(controlling ?? null);
    syncSnapshot();
  }
);

const rows = computed(() => snapshot.value.projectedRows);
const selectedIds = computed(() => snapshot.value.selectedTargetIds);
const refusal = computed(() => snapshot.value.lastRefusal);
const eligibleWorkspaceCount = computed(
  () => snapshot.value.projectedRows.filter((r) => r.workspaceId === snapshot.value.workspaceId && r.visibleInWorkspace && r.eligible).length
);

/**
 * @param {Event} event
 */
function onSurfaceNeighborPointer(event) {
  preserveLiveSurfaceFocus(event);
}

/**
 * @param {string} sessionId
 */
function onToggleTarget(sessionId) {
  const res = controller.toggleRecipient(sessionId);
  syncSnapshot();
  if (!res.ok) {
    emit('recipient-refused', { code: res.code, message: res.message, targetId: sessionId });
    return;
  }
  emit('update:modelValue', [...snapshot.value.selectedTargetIds]);
  emit('targets-changed', {
    mode: snapshot.value.selectionMode,
    targetIds: [...snapshot.value.selectedTargetIds]
  });
}

/**
 * @param {string} sessionId
 */
function onSelectOneTarget(sessionId) {
  const res = controller.selectOne(sessionId);
  syncSnapshot();
  if (!res.ok) {
    emit('recipient-refused', { code: res.code, message: res.message, targetId: sessionId });
    return;
  }
  emit('update:modelValue', [...snapshot.value.selectedTargetIds]);
  emit('targets-changed', {
    mode: snapshot.value.selectionMode,
    targetIds: [...snapshot.value.selectedTargetIds]
  });
}

function onSelectAllInWorkspace() {
  const res = controller.selectAllInWorkspace();
  syncSnapshot();
  emit('update:modelValue', [...res.targetIds]);
  emit('targets-changed', {
    mode: res.mode,
    targetIds: [...res.targetIds]
  });
}

function onClearTargets() {
  const res = controller.clearTargets();
  syncSnapshot();
  emit('update:modelValue', []);
  emit('targets-changed', {
    mode: res.mode,
    targetIds: []
  });
}

/**
 * @param {KeyboardEvent} event
 */
function onPickerKeydown(event) {
  const outcome = controller.handleKeyDown({
    key: event.key,
    isComposing: event.isComposing
  });
  syncSnapshot();
  if (outcome.action === 'close-picker') {
    emit('picker-closed');
  }
}

defineExpose({
  selectOne: (/** @type {string} */ sid) => {
    onSelectOneTarget(sid);
    return snapshot.value;
  },
  selectMany: (/** @type {readonly string[]} */ sids) => {
    const res = controller.selectMany(sids);
    syncSnapshot();
    if (!res.ok) {
      emit('recipient-refused', { code: res.code, message: res.message, targetId: res.targetId });
    } else {
      emit('update:modelValue', [...res.targetIds]);
      emit('targets-changed', { mode: res.mode, targetIds: [...res.targetIds] });
    }
    return res;
  },
  selectAllInWorkspace: () => {
    onSelectAllInWorkspace();
    return snapshot.value;
  },
  clearTargets: () => {
    onClearTargets();
    return snapshot.value;
  },
  freezeReviewTargets: () => {
    const res = controller.freezeReviewTargets();
    syncSnapshot();
    return res;
  },
  getSemanticControls: (/** @type {Record<string, any>} */ opts) => controller.getSemanticControls(opts),
  getSnapshot: () => snapshot.value
});
</script>

<template>
  <section
    class="capsule-target-picker"
    role="group"
    aria-label="Orchestrator target recipient picker"
    @keydown="onPickerKeydown"
  >
    <header class="capsule-target-picker__toolbar">
      <button
        id="drawer/targets/all"
        data-semantic-anchor="drawer/targets/all"
        type="button"
        role="button"
        aria-label="Select all in workspace"
        :disabled="eligibleWorkspaceCount === 0"
        :aria-disabled="eligibleWorkspaceCount === 0 ? 'true' : 'false'"
        @pointerdown="onSurfaceNeighborPointer"
        @mousedown="onSurfaceNeighborPointer"
        @click="onSelectAllInWorkspace"
      >
        Select all in workspace ({{ eligibleWorkspaceCount }})
      </button>

      <button
        id="drawer/targets/clear"
        data-semantic-anchor="drawer/targets/clear"
        type="button"
        role="button"
        aria-label="Clear targets"
        :disabled="selectedIds.length === 0"
        :aria-disabled="selectedIds.length === 0 ? 'true' : 'false'"
        @pointerdown="onSurfaceNeighborPointer"
        @mousedown="onSurfaceNeighborPointer"
        @click="onClearTargets"
      >
        Clear targets
      </button>

      <span class="capsule-target-picker__summary" aria-live="polite">
        <template v-if="selectedIds.length === 0">
          No recipients selected (Send disabled)
        </template>
        <template v-else>
          Mode: {{ snapshot.selectionMode }} · {{ selectedIds.length }} target(s)
        </template>
      </span>
    </header>

    <div
      v-if="refusal"
      id="alerts/target-picker-refusal"
      data-semantic-anchor="alerts/target-picker-refusal"
      class="capsule-target-picker__refusal"
      role="alert"
      :aria-label="`Recipient refusal: ${refusal.code} ${refusal.message}`"
    >
      {{ refusal.code }}: {{ refusal.message }}
    </div>

    <ul class="capsule-target-picker__list" role="list" aria-label="Projected session capabilities">
      <li
        v-for="row in rows"
        :key="row.sessionId"
        class="capsule-target-picker__row"
        :data-session-id="row.sessionId"
        :data-eligible="row.eligible ? 'true' : 'false'"
      >
        <div
          :id="row.semanticAnchor"
          :data-semantic-anchor="row.semanticAnchor"
          role="checkbox"
          :tabindex="row.eligible ? 0 : -1"
          :aria-label="row.accessibleName"
          :aria-checked="selectedIds.includes(row.sessionId) ? 'true' : 'false'"
          :aria-disabled="row.eligible ? 'false' : 'true'"
          class="capsule-target-picker__checkbox"
          @pointerdown="onSurfaceNeighborPointer"
          @mousedown="onSurfaceNeighborPointer"
          @click="onToggleTarget(row.sessionId)"
          @keydown.space.prevent="onToggleTarget(row.sessionId)"
        >
          <span class="capsule-target-picker__session-id">{{ row.sessionId }}</span>
          <span class="capsule-target-picker__capsule-id">{{ row.capsuleId }}</span>
          <span class="capsule-target-picker__badge" :data-badge="row.statusBadge">
            {{ row.statusBadge }}
          </span>
          <span v-if="!row.eligible && row.unavailableReason" class="capsule-target-picker__reason">
            {{ row.unavailableReason }}
          </span>
        </div>

        <button
          :id="row.quickTargetAnchor"
          :data-semantic-anchor="row.quickTargetAnchor"
          type="button"
          role="button"
          class="capsule-target-picker__only-btn"
          :aria-label="`Target only session ${row.sessionId} (${row.capsuleId})`"
          :aria-pressed="
            snapshot.selectionMode === 'one' &&
            selectedIds.length === 1 &&
            selectedIds[0] === row.sessionId
              ? 'true'
              : 'false'
          "
          :disabled="!row.eligible"
          :aria-disabled="!row.eligible ? 'true' : 'false'"
          @pointerdown="onSurfaceNeighborPointer"
          @mousedown="onSurfaceNeighborPointer"
          @click="onSelectOneTarget(row.sessionId)"
        >
          One
        </button>
      </li>
    </ul>
  </section>
</template>
