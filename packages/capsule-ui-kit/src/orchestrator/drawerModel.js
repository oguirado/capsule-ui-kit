/**
 * @fileoverview Pure state model and review/dispatch invariants for the Orchestrator Drawer.
 * Implements UI_ARCHITECTURE §4 (Drafts), §7 (Orchestrator drawer and prompt dispatch, G2, G3, G4),
 * §9 (AI-operability contract for drawer/dispatch controls), and §13 (Drawer model unit).
 *
 * Prompt/session/dispatch/cancel wire contracts are AUSENTE in ARCH (§5, §14 R3).
 * This module enforces local schema validation, deterministic request_id derivation (G2),
 * target eligibility and slot lock checks (G3, G4), and review invalidation on any basis/prompt/target/all-scope change.
 */

import { sha256 } from '../agent/sha256.js';

/** @typedef {'collapsed' | 'expanded' | 'maximized'} DrawerPresentationMode */

/** @typedef {'one' | 'many' | 'all'} TargetSelectionMode */

/**
 * @typedef {'unknown' | 'ready' | 'busy' | 'waiting-input' | 'waiting-permission' | 'exited' | 'failed'} SessionActivityState
 */

/**
 * @typedef {'detached' | 'attaching' | 'restoring' | 'live' | 'disconnected'} SessionAttachmentState
 */

/**
 * @typedef {'draft' | 'reviewing' | 'admitting' | 'rejected' | 'accepted'} DispatchLifecyclePhase
 */

/**
 * @typedef {'pending' | 'accepted' | 'queued' | 'executing' | 'waiting-permission' | 'waiting-input' | 'completed-unverified' | 'verified-success' | 'verified-failure' | 'refused' | 'cancelled' | 'uncertain'} TargetRunStatus
 */

/**
 * @typedef {Object} SessionTargetDescriptor
 * @property {string} sessionId - Immutable session identity (`sid`).
 * @property {string} capsuleId - Bound capsule identity.
 * @property {string} workspaceId - Workspace scope identifier.
 * @property {string} slotId - Target slot identity for G3 lock scoping.
 * @property {number} generation - Monotonic slot/session generation integer.
 * @property {number} epoch - Service/projection epoch integer.
 * @property {SessionActivityState} activity - Current core-projected activity state.
 * @property {SessionAttachmentState} attachment - Current attachment state.
 * @property {boolean} visibleInWorkspace - Whether session is inside the visible workspace scope for "All".
 * @property {boolean} supportsQueue - Whether the authenticated adapter explicitly advertises queue semantics.
 * @property {number} [maxQueueDepth] - Declared queue bound when `supportsQueue` is true.
 * @property {number} [currentQueueDepth] - Current queued count when `supportsQueue` is true.
 * @property {boolean} [inFlightLock] - Whether core currently holds an active in-flight slot lock (G3).
 * @property {string} [ownership] - Current control/execution owner or 'none'.
 * @property {string} [adapterProtocol] - Reviewed structured protocol identifier if present, or 'AUSENTE'.
 */

/**
 * @typedef {Object} FrozenTargetBasis
 * @property {string} sessionId
 * @property {string} capsuleId
 * @property {string} workspaceId
 * @property {string} slotId
 * @property {number} generation
 * @property {number} epoch
 * @property {SessionActivityState} activity
 * @property {SessionAttachmentState} attachment
 * @property {boolean} supportsQueue
 * @property {string} ownership
 * @property {string} adapterProtocol
 * @property {'dispatch' | 'queue'} admissionMode
 */

/**
 * @typedef {Object} FrozenReviewSnapshot
 * @property {string} schema - Fixed schema identifier `capsule-ui-kit.drawer-review/v1`.
 * @property {string} workspaceId - Active workspace scope.
 * @property {string} promptText - Exact prompt string.
 * @property {number} promptByteLength - Exact UTF-8 byte length of `promptText`.
 * @property {string} promptSha256 - Lowercase hex SHA-256 of UTF-8 `promptText` bytes.
 * @property {TargetSelectionMode} selectionMode - Mode active when reviewed ('one' | 'many' | 'all').
 * @property {readonly string[]} targetIds - Ordered, deduplicated explicit session IDs frozen for review.
 * @property {readonly string[]} visibleScopeIds - Exact visible workspace session IDs at review freeze time.
 * @property {Readonly<Record<string, FrozenTargetBasis>>} basisByTarget - Frozen capability/readiness basis per target.
 * @property {string} basisDigest - Lowercase hex SHA-256 of canonical JSON of `{promptSha256, workspaceId, targetIds, basisByTarget}`.
 */

/**
 * @typedef {Object} TargetRunRecord
 * @property {string} sessionId
 * @property {string} capsuleId
 * @property {string} slotId
 * @property {number} generation
 * @property {TargetRunStatus} status
 * @property {readonly string[]} streamedChunks
 * @property {number} streamedBytes
 * @property {number} seenStreamedBytes - Streamed bytes already surfaced while open; unread = streamedBytes - seen.
 * @property {boolean} adapterCompleted
 * @property {string | null} verifiedReceiptId
 * @property {string | null} witnessStateSha256
 * @property {number | null} witnessTick
 * @property {string | null} refusalCode
 * @property {string | null} refusalMessage
 * @property {boolean} cancelRequested
 */

/**
 * @typedef {Object} DispatchRecord
 * @property {string} requestId - Literal or G2-derived deterministic request identity.
 * @property {string} workspaceId
 * @property {string} promptText
 * @property {string} promptSha256
 * @property {readonly string[]} targetIds - Frozen target IDs.
 * @property {string} bodyDigest - Canonical digest of frozen dispatch payload.
 * @property {DispatchLifecyclePhase} phase
 * @property {string | null} parentRequestId - Present if created via explicit retry of failed targets.
 * @property {string | null} refusalAlert - Named refusal message if core rejected admission.
 * @property {Readonly<Record<string, TargetRunRecord>>} targets
 */

export const DRAWER_REVIEW_SCHEMA = 'capsule-ui-kit.drawer-review/v1';
export const DISPATCH_INTENT_SCHEMA = 'capsule-ui-kit.dispatch-intent-preview/v1';

export const PRESENTATIONS = Object.freeze(['collapsed', 'expanded', 'maximized']);
export const SELECTION_MODES = Object.freeze(['one', 'many', 'all']);
export const ELIGIBLE_ACTIVITIES = Object.freeze(['ready', 'waiting-input']);

/** Display vocabulary for session tab chips (S4): live-quiet, live-active, ended. */
export const TAB_STATUSES = Object.freeze(['idle', 'busy', 'exited']);

/**
 * Maps a core-projected session activity to the tab chip display status.
 * Anything without busy evidence renders `idle` (live but quiet); only
 * explicit `exited`/`failed` render `exited`. Unknown values stay `idle`.
 *
 * @param {unknown} activity
 * @returns {'idle' | 'busy' | 'exited'}
 */
export function resolveSessionTabStatus(activity) {
  if (activity === 'exited' || activity === 'failed') return 'exited';
  if (activity === 'busy' || activity === 'waiting-input' || activity === 'waiting-permission') return 'busy';
  return 'idle';
}
export const ALL_ACTIVITIES = Object.freeze([
  'unknown',
  'ready',
  'busy',
  'waiting-input',
  'waiting-permission',
  'exited',
  'failed'
]);
export const ALL_ATTACHMENTS = Object.freeze([
  'detached',
  'attaching',
  'restoring',
  'live',
  'disconnected'
]);

const DEFAULT_MAX_PROMPT_BYTES = 65536;
const DEFAULT_MAX_STREAM_BYTES = 262144;
const MAX_UNREAD_PREVIEW_CHARS = 160;
const DEFAULT_DRAWER_HEIGHT_PX = 280;
const MIN_DRAWER_HEIGHT_PX = 140;
const MAX_DRAWER_HEIGHT_PX = 960;

/**
 * Serializes a value to deterministic canonical JSON (sorted object keys, compact separators, no whitespace).
 * Rejects non-finite numbers, undefined values, symbols, functions, or non-safe integers.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toCanonicalJson(value) {
  if (value === null) {
    return 'null';
  }
  const t = typeof value;
  if (t === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (t === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError(`Invalid non-exact integer in canonical JSON: ${String(value)}`);
    }
    return String(value);
  }
  if (t === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => toCanonicalJson(item));
    return `[${items.join(',')}]`;
  }
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('Canonical JSON only accepts plain objects');
    }
    const keys = Object.keys(/** @type {object} */ (value)).sort();
    const parts = [];
    for (const k of keys) {
      const v = /** @type {Record<string, unknown>} */ (value)[k];
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') {
        throw new TypeError(`Unsupported property value for key "${k}" in canonical JSON`);
      }
      parts.push(`${JSON.stringify(k)}:${toCanonicalJson(v)}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new TypeError(`Unsupported type in canonical JSON: ${t}`);
}

/**
 * Computes lowercase full hex SHA-256 of a UTF-8 string.
 *
 * @param {string} utf8Text
 * @returns {string}
 */
export function sha256Hex(utf8Text) {
  if (typeof utf8Text !== 'string') {
    throw new TypeError('sha256Hex requires a string');
  }
  return sha256(utf8Text);
}

/**
 * Derives deterministic `request_id` per UI_ARCHITECTURE §7 G2:
 * `sha256(UTF-8 canonical JSON(["dispatch-request/v1",session,authenticated_sender_instance,nonce,seq]))`,
 * lowercase full hex. Refuses if any component is missing or invalid.
 *
 * @param {Object} envelopeMeta
 * @param {string} envelopeMeta.session
 * @param {string} envelopeMeta.authenticated_sender_instance
 * @param {string | number} envelopeMeta.nonce
 * @param {number} envelopeMeta.seq
 * @param {string} [envelopeMeta.request_id]
 * @returns {{ ok: true, requestId: string, derived: boolean } | { ok: false, code: string, message: string }}
 */
export function resolveDispatchRequestId(envelopeMeta) {
  if (!envelopeMeta || typeof envelopeMeta !== 'object') {
    return {
      ok: false,
      code: 'G2_MISSING_ENVELOPE_META',
      message: 'Envelope metadata is required to derive or validate request_id.'
    };
  }
  const { session, authenticated_sender_instance: sender, nonce, seq, request_id: explicitId } = envelopeMeta;
  if (typeof session !== 'string' || session.trim().length === 0) {
    return {
      ok: false,
      code: 'G2_MISSING_SESSION',
      message: 'Envelope session is required and must be a non-empty string.'
    };
  }
  if (typeof sender !== 'string' || sender.trim().length === 0) {
    return {
      ok: false,
      code: 'G2_MISSING_SENDER',
      message: 'Authenticated sender instance is required and must be a non-empty string.'
    };
  }
  const validNonce =
    (typeof nonce === 'string' && nonce.trim().length > 0) ||
    (typeof nonce === 'number' && Number.isSafeInteger(nonce) && nonce >= 0);
  if (!validNonce) {
    return {
      ok: false,
      code: 'G2_MISSING_NONCE',
      message: 'Envelope nonce is required and must be a non-empty string or non-negative safe integer.'
    };
  }
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) {
    return {
      ok: false,
      code: 'G2_INVALID_SEQ',
      message: 'Envelope seq is required and must be a non-negative safe integer.'
    };
  }
  if (explicitId !== undefined && explicitId !== null && explicitId !== '') {
    if (typeof explicitId !== 'string' || explicitId.trim().length === 0) {
      return {
        ok: false,
        code: 'G2_INVALID_REQUEST_ID',
        message: 'Explicit request_id must be a non-empty string.'
      };
    }
    return { ok: true, requestId: explicitId, derived: false };
  }
  const tuple = ['dispatch-request/v1', session, sender, nonce, seq];
  const canonical = toCanonicalJson(tuple);
  return {
    ok: true,
    requestId: sha256Hex(canonical),
    derived: true
  };
}

/**
 * Validates a session target descriptor against closed schema rules.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, descriptor: SessionTargetDescriptor } | { ok: false, code: string, message: string }}
 */
export function validateSessionTargetDescriptor(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'SCHEMA_INVALID_TARGET', message: 'Target descriptor must be a plain object.' };
  }
  const allowedKeys = new Set([
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
  for (const k of Object.keys(raw)) {
    if (!allowedKeys.has(k)) {
      return {
        ok: false,
        code: 'SCHEMA_UNKNOWN_KEY',
        message: `Unknown key "${k}" in session target descriptor.`
      };
    }
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);
  for (const idField of ['sessionId', 'capsuleId', 'workspaceId', 'slotId']) {
    if (typeof obj[idField] !== 'string' || /** @type {string} */ (obj[idField]).trim().length === 0) {
      return {
        ok: false,
        code: 'SCHEMA_INVALID_ID',
        message: `Field "${idField}" must be a non-empty string.`
      };
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
  if (typeof obj.activity !== 'string' || !ALL_ACTIVITIES.includes(/** @type {SessionActivityState} */ (obj.activity))) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ACTIVITY',
      message: `Field "activity" must be one of ${ALL_ACTIVITIES.join(', ')}.`
    };
  }
  if (
    typeof obj.attachment !== 'string' ||
    !ALL_ATTACHMENTS.includes(/** @type {SessionAttachmentState} */ (obj.attachment))
  ) {
    return {
      ok: false,
      code: 'SCHEMA_INVALID_ATTACHMENT',
      message: `Field "attachment" must be one of ${ALL_ATTACHMENTS.join(', ')}.`
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
      message: 'Field "ownership" must be a non-empty string when provided.'
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
 * Evaluates G3/G4 eligibility for a validated session descriptor.
 * Only projected `ready` or `waiting-input` sessions with `live` attachment and no in-flight slot lock are directly eligible.
 * `busy` or `inFlightLock` sessions are only eligible if `allowQueue` is requested AND `supportsQueue` is true with remaining capacity.
 *
 * @param {SessionTargetDescriptor} descriptor
 * @param {{ allowQueue?: boolean }} [options]
 * @returns {{ eligible: true, admissionMode: 'dispatch' | 'queue' } | { eligible: false, code: string, reason: string }}
 */
export function evaluateTargetEligibility(descriptor, options = {}) {
  const allowQueue = Boolean(options.allowQueue);

  if (descriptor.attachment !== 'live') {
    return {
      eligible: false,
      code: 'G4_ATTACHMENT_NOT_LIVE',
      reason: `Session "${descriptor.sessionId}" attachment is "${descriptor.attachment}" (requires "live").`
    };
  }

  const isDirectlyReady = ELIGIBLE_ACTIVITIES.includes(descriptor.activity) && !descriptor.inFlightLock;
  if (isDirectlyReady) {
    return { eligible: true, admissionMode: 'dispatch' };
  }

  const canConsiderQueue =
    (descriptor.activity === 'busy' || (ELIGIBLE_ACTIVITIES.includes(descriptor.activity) && descriptor.inFlightLock)) &&
    allowQueue &&
    descriptor.supportsQueue;

  if (canConsiderQueue) {
    const maxDepth = descriptor.maxQueueDepth ?? 0;
    const curDepth = descriptor.currentQueueDepth ?? 0;
    if (maxDepth <= 0 || curDepth >= maxDepth) {
      return {
        eligible: false,
        code: 'G3_QUEUE_FULL',
        reason: `Session "${descriptor.sessionId}" queue is full (${curDepth}/${maxDepth}).`
      };
    }
    return { eligible: true, admissionMode: 'queue' };
  }

  if (descriptor.inFlightLock) {
    return {
      eligible: false,
      code: 'G3_SLOT_BUSY_LOCKED',
      reason: `Slot "${descriptor.slotId}" for session "${descriptor.sessionId}" has an in-flight dispatch lock and queue admission is unavailable.`
    };
  }

  return {
    eligible: false,
    code: 'G4_ACTIVITY_INELIGIBLE',
    reason: `Session "${descriptor.sessionId}" activity is "${descriptor.activity}" (only "ready" or "waiting-input" are eligible).`
  };
}

/**
 * Validates prompt draft schema before review or submission.
 *
 * @param {unknown} promptText
 * @param {{ maxPromptBytes?: number }} [options]
 * @returns {{ ok: true, promptText: string, byteLength: number, sha256: string } | { ok: false, code: string, message: string }}
 */
export function validatePromptDraft(promptText, options = {}) {
  const maxBytes = options.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
  if (typeof promptText !== 'string') {
    return { ok: false, code: 'PROMPT_NOT_STRING', message: 'Prompt must be a string.' };
  }
  if (promptText.includes('\u0000')) {
    return { ok: false, code: 'PROMPT_NULL_BYTE', message: 'Prompt must not contain NUL bytes.' };
  }
  if (promptText.trim().length === 0) {
    return { ok: false, code: 'PROMPT_EMPTY', message: 'Prompt must not be empty or whitespace-only.' };
  }
  const byteLength = new TextEncoder().encode(promptText).byteLength;
  if (byteLength > maxBytes) {
    return {
      ok: false,
      code: 'PROMPT_OVER_BYTE_CAP',
      message: `Prompt UTF-8 byte length (${byteLength}) exceeds limit (${maxBytes}).`
    };
  }
  return {
    ok: true,
    promptText,
    byteLength,
    sha256: sha256Hex(promptText)
  };
}

/**
 * Computes the frozen basis object for a single target descriptor.
 *
 * @param {SessionTargetDescriptor} d
 * @param {'dispatch' | 'queue'} admissionMode
 * @returns {FrozenTargetBasis}
 */
function buildFrozenTargetBasis(d, admissionMode) {
  return Object.freeze({
    sessionId: d.sessionId,
    capsuleId: d.capsuleId,
    workspaceId: d.workspaceId,
    slotId: d.slotId,
    generation: d.generation,
    epoch: d.epoch,
    activity: d.activity,
    attachment: d.attachment,
    supportsQueue: d.supportsQueue,
    ownership: d.ownership ?? 'none',
    adapterProtocol: d.adapterProtocol ?? 'AUSENTE',
    admissionMode
  });
}

/**
 * Computes canonical digest for a frozen review snapshot.
 *
 * @param {string} promptSha256
 * @param {string} workspaceId
 * @param {readonly string[]} targetIds
 * @param {Readonly<Record<string, FrozenTargetBasis>>} basisByTarget
 * @returns {string}
 */
function computeBasisDigest(promptSha256, workspaceId, targetIds, basisByTarget) {
  const canonicalPayload = {
    schema: DRAWER_REVIEW_SCHEMA,
    workspaceId,
    promptSha256,
    targetIds: [...targetIds],
    basisByTarget
  };
  return sha256Hex(toCanonicalJson(canonicalPayload));
}

/**
 * Creates a new Orchestrator Drawer state machine and model instance.
 *
 * @param {Object} [config]
 * @param {string} [config.workspaceId]
 * @param {number} [config.maxPromptBytes]
 * @param {number} [config.maxStreamBytes]
 * @param {number} [config.initialHeightPx]
 */
export function createDrawerModel(config = {}) {
  let workspaceId =
    typeof config.workspaceId === 'string' && config.workspaceId.trim().length > 0
      ? config.workspaceId
      : 'workspace-default';
  const maxPromptBytes = config.maxPromptBytes ?? DEFAULT_MAX_PROMPT_BYTES;
  const maxStreamBytes = config.maxStreamBytes ?? DEFAULT_MAX_STREAM_BYTES;

  /** @type {DrawerPresentationMode} */
  let presentation = 'collapsed';
  /** @type {'expanded' | 'maximized'} */
  let priorOpenPresentation = 'expanded';
  let expandedHeightPx = clampHeight(config.initialHeightPx ?? DEFAULT_DRAWER_HEIGHT_PX);
  let draftScrollTop = 0;

  // Independent identities (§7: "Selected/viewed/focused/controlling identities are independent")
  /** @type {string | null} */
  let viewedSessionId = null;
  /** @type {string | null} */
  let focusedTerminalSessionId = null;
  /** @type {string | null} */
  let controllingSessionId = null;

  // Composer & target selection state
  let promptText = '';
  let stagedPasteText = '';
  let imeComposing = false;
  /** @type {TargetSelectionMode} */
  let selectionMode = 'many';
  /** @type {Set<string>} */
  let selectedTargetIds = new Set();
  let allowQueueRequest = false;

  // Projected session inventory keyed by sessionId
  /** @type {Map<string, SessionTargetDescriptor>} */
  const sessionsById = new Map();

  // Review state
  /** @type {FrozenReviewSnapshot | null} */
  let frozenReview = null;
  /** @type {{ code: string, reason: string } | null} */
  let lastInvalidation = null;

  // G2 / G3 durable admission & slot lock state
  /** @type {Set<string>} */
  const acceptedNonceSeqPairs = new Set();
  /** @type {Map<string, DispatchRecord>} */
  const dispatchesById = new Map();
  /** @type {Map<string, string>} slotKey (`${slotId}@${generation}`) -> requestId */
  const activeSlotLocks = new Map();

  /**
   * @param {number} h
   * @returns {number}
   */
  function clampHeight(h) {
    if (typeof h !== 'number' || !Number.isFinite(h)) {
      return DEFAULT_DRAWER_HEIGHT_PX;
    }
    return Math.max(MIN_DRAWER_HEIGHT_PX, Math.min(MAX_DRAWER_HEIGHT_PX, Math.round(h)));
  }

  /**
   * Invalidates active review if present and records the reason.
   *
   * @param {string} code
   * @param {string} reason
   */
  function invalidateReviewIfActive(code, reason) {
    if (frozenReview !== null) {
      frozenReview = null;
      lastInvalidation = Object.freeze({ code, reason });
    }
  }

  /**
   * Marks every streamed target output as seen (drawer opened). Review,
   * locks and dispatch phases are untouched: seen state is display-only.
   */
  function markAllStreamResultsSeen() {
    for (const record of dispatchesById.values()) {
      for (const sid of Object.keys(record.targets)) {
        const target = /** @type {TargetRunRecord} */ (record.targets[sid]);
        target.seenStreamedBytes = target.streamedBytes;
      }
    }
  }

  /**
   * Collects per-target unread outputs (targets whose streamed bytes exceed
   * the seen watermark), each with a bounded tail preview for the collapsed
   * drawer bar.
   *
   * @returns {{ count: number, outputs: Array<{ requestId: string, sessionId: string, unseenBytes: number, preview: string }> }}
   */
  function collectUnreadOutputs() {
    /** @type {Array<{ requestId: string, sessionId: string, unseenBytes: number, preview: string }>} */
    const outputs = [];
    for (const [requestId, record] of dispatchesById.entries()) {
      for (const sid of record.targetIds) {
        const tr = /** @type {TargetRunRecord} */ (record.targets[sid]);
        if (!tr) continue;
        const unseenBytes = tr.streamedBytes - (tr.seenStreamedBytes ?? 0);
        if (unseenBytes <= 0) continue;
        const joined = tr.streamedChunks.join('');
        outputs.push({
          requestId,
          sessionId: sid,
          unseenBytes,
          preview: joined.slice(-MAX_UNREAD_PREVIEW_CHARS)
        });
      }
    }
    return { count: outputs.length, outputs };
  }

  /**
   * Returns ordered visible session IDs in the current workspace.
   *
   * @returns {string[]}
   */
  function getVisibleWorkspaceSessionIds() {
    const ids = [];
    for (const [sid, desc] of sessionsById.entries()) {
      if (desc.workspaceId === workspaceId && desc.visibleInWorkspace) {
        ids.push(sid);
      }
    }
    return ids.sort();
  }

  /**
   * Checks whether current live state matches `frozenReview`; if anything diverged
   * (prompt, target list, visible "all" scope, or per-target basis), invalidates review.
   *
   * @returns {{ valid: true, review: FrozenReviewSnapshot } | { valid: false, code: string, reason: string }}
   */
  function verifyReviewStillValid() {
    const review = frozenReview;
    if (!review) {
      return {
        valid: false,
        code: lastInvalidation ? (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code : 'REVIEW_NOT_ACTIVE',
        reason: lastInvalidation ? (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason : 'No active frozen review.'
      };
    }

    if (review.workspaceId !== workspaceId) {
      invalidateReviewIfActive('REVIEW_INVALIDATED_WORKSPACE_CHANGED', 'Workspace scope changed after review freeze.');
      return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
    }

    if (review.promptText !== promptText || review.promptSha256 !== sha256Hex(promptText)) {
      invalidateReviewIfActive('REVIEW_INVALIDATED_PROMPT_CHANGED', 'Prompt text changed after review freeze.');
      return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
    }

    const currentTargets = [...selectedTargetIds].sort();
    if (
      currentTargets.length !== review.targetIds.length ||
      currentTargets.some((id, idx) => id !== review.targetIds[idx])
    ) {
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', 'Selected target set changed after review freeze.');
      return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
    }

    if (review.selectionMode === 'all') {
      const currentVisible = getVisibleWorkspaceSessionIds();
      if (
        currentVisible.length !== review.visibleScopeIds.length ||
        currentVisible.some((id, idx) => id !== review.visibleScopeIds[idx])
      ) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_ALL_SCOPE_CHANGED',
          'Visible workspace session set changed while in "all" target selection mode.'
        );
        return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
      }
    }

    for (const sid of review.targetIds) {
      const liveDesc = sessionsById.get(sid);
      const frozenBasis = review.basisByTarget[sid];
      if (!liveDesc || !frozenBasis) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_TARGET_REMOVED',
          `Target session "${sid}" is no longer present in projection.`
        );
        return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
      }
      const elig = evaluateTargetEligibility(liveDesc, { allowQueue: allowQueueRequest });
      if (!elig.eligible) {
        invalidateReviewIfActive('REVIEW_INVALIDATED_TARGET_INELIGIBLE', elig.reason);
        return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
      }
      const currentBasis = buildFrozenTargetBasis(liveDesc, elig.admissionMode);
      if (toCanonicalJson(currentBasis) !== toCanonicalJson(frozenBasis)) {
        invalidateReviewIfActive(
          'REVIEW_INVALIDATED_BASIS_CHANGED',
          `Capability or readiness basis for target "${sid}" changed since review freeze.`
        );
        return { valid: false, code: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).code, reason: (/** @type {{code:string,reason:string}} */ (lastInvalidation)).reason };
      }
    }

    return { valid: true, review };
  }

  return Object.freeze({
    /**
     * Replaces or updates the projected session inventory from core snapshots.
     * Validates every descriptor schema first (fail-closed).
     * If an active review's basis or visible "All" scope changes, invalidates the review.
     *
     * @param {readonly unknown[]} rawDescriptors
     * @returns {{ ok: true, count: number } | { ok: false, code: string, message: string }}
     */
    syncProjectedSessions(rawDescriptors) {
      if (!Array.isArray(rawDescriptors)) {
        return { ok: false, code: 'SCHEMA_SESSIONS_NOT_ARRAY', message: 'Projected sessions must be an array.' };
      }
      /** @type {Map<string, SessionTargetDescriptor>} */
      const nextMap = new Map();
      for (const item of rawDescriptors) {
        const res = validateSessionTargetDescriptor(item);
        if (!res.ok) {
          return res;
        }
        if (nextMap.has(res.descriptor.sessionId)) {
          return {
            ok: false,
            code: 'SCHEMA_DUPLICATE_SESSION_ID',
            message: `Duplicate sessionId "${res.descriptor.sessionId}" in projected batch.`
          };
        }
        nextMap.set(res.descriptor.sessionId, res.descriptor);
      }

      sessionsById.clear();
      for (const [k, v] of nextMap.entries()) {
        sessionsById.set(k, v);
      }

      if (frozenReview !== null) {
        verifyReviewStillValid();
      }

      return { ok: true, count: sessionsById.size };
    },

    /**
     * Changes the active workspace scope. Invalidates any active review if changed.
     *
     * @param {string} nextWorkspaceId
     */
    setWorkspaceId(nextWorkspaceId) {
      if (typeof nextWorkspaceId !== 'string' || nextWorkspaceId.trim().length === 0) {
        throw new TypeError('workspaceId must be a non-empty string');
      }
      if (nextWorkspaceId !== workspaceId) {
        workspaceId = nextWorkspaceId;
        invalidateReviewIfActive('REVIEW_INVALIDATED_WORKSPACE_CHANGED', 'Workspace scope changed.');
      }
    },

    // --- Presentation state transitions (§7) ---

    /**
     * Toggles between collapsed and prior open presentation (`expanded` or `maximized`).
     * Collapse never stops sessions, clears draft, or alters target selection.
     *
     * @returns {{ presentation: DrawerPresentationMode, focusTarget: string, activeSessionsPreserved: number }}
     */
    toggleDrawer() {
      if (presentation === 'collapsed') {
        presentation = priorOpenPresentation;
        markAllStreamResultsSeen();
        return {
          presentation,
          focusTarget: 'drawer/composer',
          activeSessionsPreserved: sessionsById.size
        };
      }
      priorOpenPresentation = presentation;
      presentation = 'collapsed';
      return {
        presentation,
        focusTarget: 'drawer/toggle',
        activeSessionsPreserved: sessionsById.size
      };
    },

    /**
     * Toggles between `expanded` and `maximized`.
     *
     * @returns {{ presentation: DrawerPresentationMode, expandedHeightPx: number }}
     */
    toggleMaximize() {
      if (presentation === 'maximized') {
        presentation = 'expanded';
        priorOpenPresentation = 'expanded';
      } else {
        presentation = 'maximized';
        priorOpenPresentation = 'maximized';
      }
      return { presentation, expandedHeightPx };
    },

    /**
     * Collapses the drawer explicitly, preserving draft, targets, read position, and running sessions.
     *
     * @returns {{ presentation: DrawerPresentationMode, focusTarget: string }}
     */
    collapse() {
      if (presentation !== 'collapsed') {
        priorOpenPresentation = presentation;
        presentation = 'collapsed';
      }
      return { presentation, focusTarget: 'drawer/toggle' };
    },

    /**
     * Resizes the expanded drawer height within min/max bounds.
     *
     * @param {number} heightPx
     */
    resizeExpandedHeight(heightPx) {
      expandedHeightPx = clampHeight(heightPx);
      return expandedHeightPx;
    },

    /**
     * Updates saved scroll position of the composer/results view.
     *
     * @param {number} scrollTop
     */
    setScrollPosition(scrollTop) {
      if (typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop >= 0) {
        draftScrollTop = Math.round(scrollTop);
      }
    },

    // --- Independent session view / focus / control identities (§6, §7) ---

    /**
     * Sets viewed session tab without changing dispatch recipients or control ownership.
     *
     * @param {string | null} sessionId
     */
    setViewedSession(sessionId) {
      viewedSessionId = sessionId;
    },

    /**
     * Records which terminal currently has DOM focus without altering recipient checkboxes.
     *
     * @param {string | null} sessionId
     */
    setFocusedTerminalSession(sessionId) {
      focusedTerminalSessionId = sessionId;
    },

    /**
     * Records which session holds human control lease without altering recipient checkboxes.
     *
     * @param {string | null} sessionId
     */
    setControllingSession(sessionId) {
      controllingSessionId = sessionId;
    },

    // --- Draft & Paste staging (§4, §7) ---

    /**
     * Updates the plain multiline prompt draft. Invalidates active review if text changes.
     *
     * @param {string} nextText
     */
    setPromptText(nextText) {
      if (typeof nextText !== 'string') {
        throw new TypeError('Prompt text must be a string');
      }
      if (nextText !== promptText) {
        promptText = nextText;
        invalidateReviewIfActive('REVIEW_INVALIDATED_PROMPT_CHANGED', 'Prompt draft edited during review.');
      }
    },

    /**
     * Stages untrusted pasted text in composer without automatic execution or Send (§7 Terminal security).
     * Exposes whether control characters or newlines are present.
     *
     * @param {string} pastedText
     * @returns {{ staged: string, hasNewlines: boolean, hasControlChars: boolean, autoExecuted: false }}
     */
    stagePaste(pastedText) {
      if (typeof pastedText !== 'string') {
        throw new TypeError('Pasted text must be a string');
      }
      stagedPasteText = pastedText;
      const hasNewlines = /[\r\n]/.test(pastedText);
      const hasControlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(pastedText);
      return {
        staged: stagedPasteText,
        hasNewlines,
        hasControlChars,
        autoExecuted: false
      };
    },

    /**
     * Commits staged paste into the prompt draft (stripping NUL bytes) without submitting.
     */
    applyStagedPasteToDraft() {
      if (stagedPasteText.length > 0) {
        const sanitized = stagedPasteText.replace(/\u0000/g, '');
        this.setPromptText(promptText + sanitized);
        stagedPasteText = '';
      }
    },

    /**
     * Sets IME composition state (blocks Ctrl/Cmd+Enter submission while true).
     *
     * @param {boolean} composing
     */
    setImeComposing(composing) {
      imeComposing = Boolean(composing);
    },

    /**
     * Sets whether explicit queue admission may be requested for adapters advertising queue support.
     *
     * @param {boolean} allow
     */
    setAllowQueueRequest(allow) {
      const next = Boolean(allow);
      if (next !== allowQueueRequest) {
        allowQueueRequest = next;
        invalidateReviewIfActive('REVIEW_INVALIDATED_QUEUE_OPTION_CHANGED', 'Queue request option changed.');
      }
    },

    // --- Target selection ("One", "Many", "All", Clear) (§7) ---

    /**
     * Selects a single explicit session target ("One" mode).
     *
     * @param {string} sessionId
     * @returns {{ ok: true, targetIds: string[] } | { ok: false, code: string, message: string }}
     */
    selectOneTarget(sessionId) {
      if (typeof sessionId !== 'string' || !sessionsById.has(sessionId)) {
        return {
          ok: false,
          code: 'TARGET_UNKNOWN',
          message: `Unknown target session "${String(sessionId)}".`
        };
      }
      selectionMode = 'one';
      selectedTargetIds = new Set([sessionId]);
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', 'Target selection changed to single target.');
      return { ok: true, targetIds: [...selectedTargetIds] };
    },

    /**
     * Sets an explicit checked set of target session IDs ("Many" mode).
     * Refuses duplicate or unknown session IDs.
     *
     * @param {readonly string[]} sessionIds
     * @returns {{ ok: true, targetIds: string[] } | { ok: false, code: string, message: string }}
     */
    selectManyTargets(sessionIds) {
      if (!Array.isArray(sessionIds)) {
        return { ok: false, code: 'TARGETS_NOT_ARRAY', message: 'Target list must be an array of session IDs.' };
      }
      const nextSet = new Set();
      for (const sid of sessionIds) {
        if (typeof sid !== 'string' || sid.trim().length === 0) {
          return { ok: false, code: 'TARGET_INVALID_ID', message: 'Every target ID must be a non-empty string.' };
        }
        if (nextSet.has(sid)) {
          return { ok: false, code: 'TARGET_DUPLICATE_ID', message: `Duplicate target session ID "${sid}".` };
        }
        if (!sessionsById.has(sid)) {
          return { ok: false, code: 'TARGET_UNKNOWN', message: `Unknown target session "${sid}".` };
        }
        nextSet.add(sid);
      }
      selectionMode = 'many';
      selectedTargetIds = nextSet;
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', 'Explicit target set changed.');
      return { ok: true, targetIds: [...selectedTargetIds].sort() };
    },

    /**
     * Toggles a single session checkbox inside "Many" mode.
     *
     * @param {string} sessionId
     * @returns {{ ok: true, checked: boolean, targetIds: string[] } | { ok: false, code: string, message: string }}
     */
    toggleTarget(sessionId) {
      if (typeof sessionId !== 'string' || !sessionsById.has(sessionId)) {
        return { ok: false, code: 'TARGET_UNKNOWN', message: `Unknown target session "${String(sessionId)}".` };
      }
      selectionMode = 'many';
      let checked = false;
      if (selectedTargetIds.has(sessionId)) {
        selectedTargetIds.delete(sessionId);
        checked = false;
      } else {
        selectedTargetIds.add(sessionId);
        checked = true;
      }
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_CHANGED', `Target "${sessionId}" toggled.`);
      return { ok: true, checked, targetIds: [...selectedTargetIds].sort() };
    },

    /**
     * Expands "All" into the explicit visible workspace session set before review (§7).
     * Empty visible workspace yields empty selection (never an implicit broadcast).
     *
     * @returns {{ ok: true, targetIds: string[] }}
     */
    selectAllVisibleInWorkspace() {
      const visibleIds = getVisibleWorkspaceSessionIds();
      selectionMode = 'all';
      selectedTargetIds = new Set(visibleIds);
      invalidateReviewIfActive(
        'REVIEW_INVALIDATED_TARGETS_CHANGED',
        'Expanded "All" in visible workspace scope.'
      );
      return { ok: true, targetIds: visibleIds };
    },

    /**
     * Clears all selected targets. Empty targets always disable Review/Send and invalidate any review.
     */
    clearTargets() {
      selectionMode = 'many';
      selectedTargetIds.clear();
      invalidateReviewIfActive('REVIEW_INVALIDATED_TARGETS_EMPTY', 'Targets cleared; empty targets disable Send.');
    },

    // --- Review & Freeze (§7, G4) ---

    /**
     * Freezes exact prompt bytes, explicit target IDs, workspace, adapter capabilities, and eligibility basis.
     * Refuses if targets are empty (empty NEVER means all), if prompt is invalid, or if any selected target is ineligible.
     *
     * @returns {{ ok: true, review: FrozenReviewSnapshot } | { ok: false, code: string, message: string, unavailableTargets?: Array<{ sessionId: string, code: string, reason: string }> }}
     */
    beginReview() {
      if (imeComposing) {
        return {
          ok: false,
          code: 'REVIEW_BLOCKED_IME_COMPOSING',
          message: 'Cannot review or submit while IME composition is active.'
        };
      }

      const promptCheck = validatePromptDraft(promptText, { maxPromptBytes });
      if (!promptCheck.ok) {
        return promptCheck;
      }

      const orderedTargets = [...selectedTargetIds].sort();
      if (orderedTargets.length === 0) {
        return {
          ok: false,
          code: 'TARGETS_EMPTY',
          message: 'At least one explicit target session is required; empty targets never default to all.'
        };
      }

      /** @type {Array<{ sessionId: string, code: string, reason: string }>} */
      const unavailableTargets = [];
      /** @type {Record<string, FrozenTargetBasis>} */
      const basisByTarget = {};

      for (const sid of orderedTargets) {
        const desc = sessionsById.get(sid);
        if (!desc) {
          unavailableTargets.push({
            sessionId: sid,
            code: 'TARGET_UNKNOWN',
            reason: `Target session "${sid}" does not exist in projected inventory.`
          });
          continue;
        }
        if (desc.workspaceId !== workspaceId) {
          unavailableTargets.push({
            sessionId: sid,
            code: 'TARGET_WRONG_WORKSPACE',
            reason: `Target session "${sid}" belongs to workspace "${desc.workspaceId}", not "${workspaceId}".`
          });
          continue;
        }
        const elig = evaluateTargetEligibility(desc, { allowQueue: allowQueueRequest });
        if (!elig.eligible) {
          unavailableTargets.push({
            sessionId: sid,
            code: elig.code,
            reason: elig.reason
          });
          continue;
        }
        basisByTarget[sid] = buildFrozenTargetBasis(desc, elig.admissionMode);
      }

      if (unavailableTargets.length > 0) {
        return {
          ok: false,
          code: /** @type {{code:string}} */ (unavailableTargets[0]).code,
          message: unavailableTargets.map((u) => u.reason).join(' '),
          unavailableTargets
        };
      }

      const visibleScopeIds = Object.freeze(getVisibleWorkspaceSessionIds());
      const frozenTargetIds = Object.freeze(orderedTargets);
      const frozenBasisMap = Object.freeze(basisByTarget);
      const basisDigest = computeBasisDigest(
        promptCheck.sha256,
        workspaceId,
        frozenTargetIds,
        frozenBasisMap
      );

      frozenReview = Object.freeze({
        schema: DRAWER_REVIEW_SCHEMA,
        workspaceId,
        promptText: promptCheck.promptText,
        promptByteLength: promptCheck.byteLength,
        promptSha256: promptCheck.sha256,
        selectionMode,
        targetIds: frozenTargetIds,
        visibleScopeIds,
        basisByTarget: frozenBasisMap,
        basisDigest
      });
      lastInvalidation = null;

      return { ok: true, review: frozenReview };
    },

    // --- Submit, Dedup (G2), Per-Slot Lock (G3), Re-check Eligibility (G4) ---

    /**
     * Submits the currently reviewed dispatch.
     * Enforces:
     * 1. Active, un-invalidated review snapshot.
     * 2. G2 request_id deterministic derivation & nonce/seq transport dedup + request_id body/target collision check.
     * 3. G4 fresh eligibility re-check at dispatch time (guards against stale-ready race).
     * 4. G3 atomic per-slot lock acquisition (`${slotId}@${generation}`).
     *
     * @param {Object} envelopeMeta
     * @param {string} envelopeMeta.session
     * @param {string} envelopeMeta.authenticated_sender_instance
     * @param {string | number} envelopeMeta.nonce
     * @param {number} envelopeMeta.seq
     * @param {string} [envelopeMeta.request_id]
     * @param {string} [envelopeMeta.parentRequestId]
     * @returns {{ ok: true, requestId: string, derivedRequestId: boolean, reconciledExisting: boolean, dispatch: DispatchRecord, intentPreview: Record<string, unknown> } | { ok: false, code: string, message: string }}
     */
    submitReviewedDispatch(envelopeMeta) {
      if (imeComposing) {
        return {
          ok: false,
          code: 'SUBMIT_BLOCKED_IME_COMPOSING',
          message: 'Cannot submit while IME composition is active.'
        };
      }

      const reviewCheck = verifyReviewStillValid();
      if (!reviewCheck.valid) {
        return {
          ok: false,
          code: reviewCheck.code,
          message: reviewCheck.reason
        };
      }
      const review = reviewCheck.review;

      const idRes = resolveDispatchRequestId(envelopeMeta);
      if (!idRes.ok) {
        return idRes;
      }

      const nonceSeqKey = `${envelopeMeta.session}:${envelopeMeta.authenticated_sender_instance}:${String(envelopeMeta.nonce)}:${String(envelopeMeta.seq)}`;
      if (acceptedNonceSeqPairs.has(nonceSeqKey)) {
        return {
          ok: false,
          code: 'G2_DUPLICATE_NONCE_SEQ',
          message: `Duplicate envelope (nonce=${String(envelopeMeta.nonce)}, seq=${String(envelopeMeta.seq)}) refused.`
        };
      }

      const bodyDigest = sha256Hex(
        toCanonicalJson({
          schema: DISPATCH_INTENT_SCHEMA,
          workspaceId: review.workspaceId,
          promptSha256: review.promptSha256,
          targetIds: [...review.targetIds],
          basisDigest: review.basisDigest
        })
      );

      // G2: If request_id already exists, check if fresh envelope is reconciling same body/targets or colliding
      const existingDispatch = dispatchesById.get(idRes.requestId);
      if (existingDispatch) {
        if (existingDispatch.bodyDigest !== bodyDigest) {
          return {
            ok: false,
            code: 'G2_REQUEST_ID_COLLISION',
            message: `request_id "${idRes.requestId}" already exists with different prompt body or target set.`
          };
        }
        acceptedNonceSeqPairs.add(nonceSeqKey);
        return {
          ok: true,
          requestId: idRes.requestId,
          derivedRequestId: idRes.derived,
          reconciledExisting: true,
          dispatch: existingDispatch,
          intentPreview: {
            schema: DISPATCH_INTENT_SCHEMA,
            wireContractStatus: 'AUSENTE',
            request_id: idRes.requestId,
            workspaceId: existingDispatch.workspaceId,
            promptSha256: existingDispatch.promptSha256,
            targetIds: [...existingDispatch.targetIds]
          }
        };
      }

      // G3 & G4: Re-verify eligibility and slot locks atomically before acquiring locks
      /** @type {string[]} */
      const slotsToLock = [];
      const seenSlotsInBatch = new Set();
      for (const sid of review.targetIds) {
        const desc = sessionsById.get(sid);
        if (!desc) {
          return {
            ok: false,
            code: 'G4_TARGET_DISAPPEARED',
            message: `Target "${sid}" disappeared before dispatch lock acquisition.`
          };
        }
        const elig = evaluateTargetEligibility(desc, { allowQueue: allowQueueRequest });
        if (!elig.eligible) {
          return {
            ok: false,
            code: elig.code,
            message: elig.reason
          };
        }
        const slotKey = `${desc.slotId}@${desc.generation}`;
        if (seenSlotsInBatch.has(slotKey)) {
          return {
            ok: false,
            code: 'G3_SAME_SLOT_CONFLICT',
            message: `Multiple targets in the same dispatch map to slot "${slotKey}".`
          };
        }
        seenSlotsInBatch.add(slotKey);

        if (activeSlotLocks.has(slotKey) && elig.admissionMode !== 'queue') {
          return {
            ok: false,
            code: 'G3_SLOT_LOCK_HELD',
            message: `Slot "${slotKey}" already has an in-flight dispatch lock (${activeSlotLocks.get(slotKey)}).`
          };
        }
        if (elig.admissionMode === 'dispatch') {
          slotsToLock.push(slotKey);
        }
      }

      // Acquire slot locks and record nonce/seq
      acceptedNonceSeqPairs.add(nonceSeqKey);
      for (const slotKey of slotsToLock) {
        activeSlotLocks.set(slotKey, idRes.requestId);
      }

      /** @type {Record<string, TargetRunRecord>} */
      const targetRuns = {};
      for (const sid of review.targetIds) {
        const desc = /** @type {SessionTargetDescriptor} */ (sessionsById.get(sid));
        const basis = /** @type {FrozenTargetBasis} */ (review.basisByTarget[sid]);
        targetRuns[sid] = {
          sessionId: sid,
          capsuleId: desc.capsuleId,
          slotId: desc.slotId,
          generation: desc.generation,
          status: basis.admissionMode === 'queue' ? 'queued' : 'pending',
          streamedChunks: [],
          streamedBytes: 0,
          seenStreamedBytes: 0,
          adapterCompleted: false,
          verifiedReceiptId: null,
          witnessStateSha256: null,
          witnessTick: null,
          refusalCode: null,
          refusalMessage: null,
          cancelRequested: false
        };
      }

      /** @type {DispatchRecord} */
      const record = {
        requestId: idRes.requestId,
        workspaceId: review.workspaceId,
        promptText: review.promptText,
        promptSha256: review.promptSha256,
        targetIds: review.targetIds,
        bodyDigest,
        phase: 'admitting',
        parentRequestId: envelopeMeta.parentRequestId ?? null,
        refusalAlert: null,
        targets: targetRuns
      };

      dispatchesById.set(idRes.requestId, record);
      frozenReview = null;

      return {
        ok: true,
        requestId: idRes.requestId,
        derivedRequestId: idRes.derived,
        reconciledExisting: false,
        dispatch: snapshotDispatch(record),
        intentPreview: Object.freeze({
          schema: DISPATCH_INTENT_SCHEMA,
          wireContractStatus: 'AUSENTE',
          request_id: idRes.requestId,
          workspaceId: record.workspaceId,
          promptSha256: record.promptSha256,
          targetIds: [...record.targetIds],
          basisDigest: review.basisDigest
        })
      };
    },

    // --- Core admission, streaming, completion, verification, uncertainty & retry (§7) ---

    /**
     * Records core admission refusal: marks dispatch `rejected`, releases slot locks, preserves prompt draft and shows full refusal in named alert.
     *
     * @param {string} requestId
     * @param {{ code: string, message: string }} refusal
     * @returns {{ ok: true, dispatch: DispatchRecord } | { ok: false, code: string, message: string }}
     */
    recordCoreRefusal(requestId, refusal) {
      const record = dispatchesById.get(requestId);
      if (!record) {
        return { ok: false, code: 'DISPATCH_NOT_FOUND', message: `Unknown dispatch "${requestId}".` };
      }
      record.phase = 'rejected';
      record.refusalAlert = `${refusal.code}: ${refusal.message}`;
      for (const sid of record.targetIds) {
        const tr = /** @type {TargetRunRecord} */ (record.targets[sid]);
        tr.status = 'refused';
        tr.refusalCode = refusal.code;
        tr.refusalMessage = refusal.message;
        releaseSlotLockIfHeld(tr.slotId, tr.generation, requestId);
      }
      return { ok: true, dispatch: snapshotDispatch(record) };
    },

    /**
     * Records core acceptance of the dispatch: transitions phase to `accepted` and non-queued targets to `accepted` (NOT verified or completed).
     *
     * @param {string} requestId
     * @returns {{ ok: true, dispatch: DispatchRecord } | { ok: false, code: string, message: string }}
     */
    recordCoreAccepted(requestId) {
      const record = dispatchesById.get(requestId);
      if (!record) {
        return { ok: false, code: 'DISPATCH_NOT_FOUND', message: `Unknown dispatch "${requestId}".` };
      }
      record.phase = 'accepted';
      for (const sid of record.targetIds) {
        const tr = /** @type {TargetRunRecord} */ (record.targets[sid]);
        if (tr.status === 'pending') {
          tr.status = 'accepted';
        }
      }
      return { ok: true, dispatch: snapshotDispatch(record) };
    },

    /**
     * Appends bounded streamed result text to a target run without minting control events or marking verified.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {string} chunkText
     * @returns {{ ok: true, target: TargetRunRecord } | { ok: false, code: string, message: string }}
     */
    appendTargetStreamResult(requestId, sessionId, chunkText) {
      const record = dispatchesById.get(requestId);
      if (!record || !record.targets[sessionId]) {
        return { ok: false, code: 'TARGET_RUN_NOT_FOUND', message: 'Dispatch or target run not found.' };
      }
      if (typeof chunkText !== 'string') {
        return { ok: false, code: 'STREAM_CHUNK_NOT_STRING', message: 'Streamed chunk must be a string.' };
      }
      const tr = record.targets[sessionId];
      const chunkBytes = new TextEncoder().encode(chunkText).byteLength;
      if (tr.streamedBytes + chunkBytes > maxStreamBytes) {
        return {
          ok: false,
          code: 'STREAM_RESULT_OVER_BOUND',
          message: `Streamed output for target "${sessionId}" exceeds bounded projection limit (${maxStreamBytes} bytes).`
        };
      }
      if (tr.status === 'accepted' || tr.status === 'pending') {
        tr.status = 'executing';
      }
      tr.streamedChunks = [...tr.streamedChunks, chunkText];
      tr.streamedBytes += chunkBytes;
      if (presentation !== 'collapsed') {
        tr.seenStreamedBytes = tr.streamedBytes;
      }
      return { ok: true, target: snapshotTargetRun(tr) };
    },

    /**
     * Marks adapter work complete (`completed-unverified`). Never implies verified outcome without a core receipt.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @returns {{ ok: true, target: TargetRunRecord } | { ok: false, code: string, message: string }}
     */
    recordAdapterCompletion(requestId, sessionId) {
      const record = dispatchesById.get(requestId);
      if (!record || !record.targets[sessionId]) {
        return { ok: false, code: 'TARGET_RUN_NOT_FOUND', message: 'Dispatch or target run not found.' };
      }
      const tr = record.targets[sessionId];
      tr.adapterCompleted = true;
      if (tr.status !== 'verified-success' && tr.status !== 'verified-failure') {
        tr.status = 'completed-unverified';
      }
      return { ok: true, target: snapshotTargetRun(tr) };
    },

    /**
     * Records a verified core receipt with state/tick witness (§7: "consumer requires state/tick witness; a pixel difference cannot suffice").
     * Releases the G3 slot lock on terminal verified outcome.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {{ receiptId: string, verified: boolean, stateSha256: string, tick: number, failureReason?: string }} receipt
     * @returns {{ ok: true, target: TargetRunRecord } | { ok: false, code: string, message: string }}
     */
    recordVerifiedReceipt(requestId, sessionId, receipt) {
      const record = dispatchesById.get(requestId);
      if (!record || !record.targets[sessionId]) {
        return { ok: false, code: 'TARGET_RUN_NOT_FOUND', message: 'Dispatch or target run not found.' };
      }
      if (
        !receipt ||
        typeof receipt.receiptId !== 'string' ||
        receipt.receiptId.trim().length === 0 ||
        typeof receipt.stateSha256 !== 'string' ||
        receipt.stateSha256.trim().length === 0 ||
        typeof receipt.tick !== 'number' ||
        !Number.isSafeInteger(receipt.tick) ||
        receipt.tick < 0
      ) {
        return {
          ok: false,
          code: 'RECEIPT_MISSING_WITNESS',
          message: 'Verified receipt requires non-empty receiptId, stateSha256 witness, and non-negative integer tick.'
        };
      }
      const tr = record.targets[sessionId];
      tr.verifiedReceiptId = receipt.receiptId;
      tr.witnessStateSha256 = receipt.stateSha256;
      tr.witnessTick = receipt.tick;
      if (receipt.verified) {
        tr.status = 'verified-success';
      } else {
        tr.status = 'verified-failure';
        tr.refusalMessage = receipt.failureReason ?? 'Verification failed against core witness.';
      }
      releaseSlotLockIfHeld(tr.slotId, tr.generation, requestId);
      return { ok: true, target: snapshotTargetRun(tr) };
    },

    /**
     * Marks in-flight targets as `uncertain` on transport disconnect or lost reply.
     * Retains G3 slot reservation until reconciled; never resends automatically.
     *
     * @param {string} requestId
     * @returns {{ ok: true, dispatch: DispatchRecord } | { ok: false, code: string, message: string }}
     */
    markDispatchUncertain(requestId) {
      const record = dispatchesById.get(requestId);
      if (!record) {
        return { ok: false, code: 'DISPATCH_NOT_FOUND', message: `Unknown dispatch "${requestId}".` };
      }
      const terminalStatuses = new Set(['verified-success', 'verified-failure', 'refused', 'cancelled']);
      for (const sid of record.targetIds) {
        const tr = /** @type {TargetRunRecord} */ (record.targets[sid]);
        if (!terminalStatuses.has(tr.status)) {
          tr.status = 'uncertain';
        }
      }
      return { ok: true, dispatch: snapshotDispatch(record) };
    },

    /**
     * Requests cancellation for a target run or confirms terminal core cancellation.
     *
     * @param {string} requestId
     * @param {string} sessionId
     * @param {{ confirmedByCore?: boolean }} [options]
     * @returns {{ ok: true, target: TargetRunRecord } | { ok: false, code: string, message: string }}
     */
    cancelTargetRun(requestId, sessionId, options = {}) {
      const record = dispatchesById.get(requestId);
      if (!record || !record.targets[sessionId]) {
        return { ok: false, code: 'TARGET_RUN_NOT_FOUND', message: 'Dispatch or target run not found.' };
      }
      const tr = record.targets[sessionId];
      tr.cancelRequested = true;
      if (options.confirmedByCore) {
        tr.status = 'cancelled';
        releaseSlotLockIfHeld(tr.slotId, tr.generation, requestId);
      }
      return { ok: true, target: snapshotTargetRun(tr) };
    },

    /**
     * Prepares a retry selection from a previous dispatch:
     * - Refuses if any requested retry target is `uncertain` (must reconcile before retry) or already `verified-success` (successful children are not rerun).
     * - Loads only the explicitly selected failed/refused/cancelled targets into the composer target set so the user can explicitly review and submit a new linked dispatch.
     *
     * @param {string} parentRequestId
     * @param {readonly string[]} retrySessionIds
     * @returns {{ ok: true, targetIds: string[], parentRequestId: string } | { ok: false, code: string, message: string }}
     */
    stageRetryForFailedTargets(parentRequestId, retrySessionIds) {
      const record = dispatchesById.get(parentRequestId);
      if (!record) {
        return { ok: false, code: 'DISPATCH_NOT_FOUND', message: `Unknown dispatch "${parentRequestId}".` };
      }
      if (!Array.isArray(retrySessionIds) || retrySessionIds.length === 0) {
        return {
          ok: false,
          code: 'RETRY_TARGETS_EMPTY',
          message: 'Explicit non-empty target list is required to stage retry.'
        };
      }
      const allowedRetryStatuses = new Set(['verified-failure', 'refused', 'cancelled']);
      for (const sid of retrySessionIds) {
        const tr = /** @type {TargetRunRecord} */ (record.targets[sid]);
        if (!tr) {
          return {
            ok: false,
            code: 'RETRY_TARGET_NOT_IN_DISPATCH',
            message: `Session "${sid}" was not part of dispatch "${parentRequestId}".`
          };
        }
        if (tr.status === 'uncertain') {
          return {
            ok: false,
            code: 'RETRY_UNCERTAIN_FORBIDDEN',
            message: `Target "${sid}" has uncertain outcome; reconcile journal before retry.`
          };
        }
        if (tr.status === 'verified-success') {
          return {
            ok: false,
            code: 'RETRY_SUCCESSFUL_FORBIDDEN',
            message: `Target "${sid}" already succeeded and must not be rerun.`
          };
        }
        if (!allowedRetryStatuses.has(tr.status)) {
          return {
            ok: false,
            code: 'RETRY_TARGET_NOT_TERMINAL_FAILURE',
            message: `Target "${sid}" is in state "${tr.status}" and cannot be retried yet.`
          };
        }
      }

      promptText = record.promptText;
      selectionMode = 'many';
      selectedTargetIds = new Set(retrySessionIds);
      invalidateReviewIfActive('REVIEW_INVALIDATED_RETRY_STAGED', 'Staged retry requires fresh explicit review.');
      return {
        ok: true,
        targetIds: [...selectedTargetIds].sort(),
        parentRequestId
      };
    },

    // --- Keyboard handling (§7: Enter newline; Ctrl/Cmd+Enter review/send; no submit in IME; Escape closes picker/review before collapse, never cancels run) ---

    /**
     * Evaluates composer/drawer keyboard shortcuts according to §7 rules.
     *
     * @param {{ key: string, ctrlKey?: boolean, metaKey?: boolean, shiftKey?: boolean, isComposing?: boolean, fromTerminal?: boolean, pickerOpen?: boolean }} event
     * @returns {{ action: 'ignore-terminal-key' | 'ignore-ime' | 'insert-newline' | 'trigger-review-or-send' | 'close-picker' | 'cancel-review' | 'collapse-drawer' | 'noop', cancelRun: false }}
     */
    handleKeyCommand(event) {
      if (event.fromTerminal) {
        return { action: 'ignore-terminal-key', cancelRun: false };
      }
      if (event.isComposing || imeComposing) {
        return { action: 'ignore-ime', cancelRun: false };
      }
      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          return { action: 'trigger-review-or-send', cancelRun: false };
        }
        return { action: 'insert-newline', cancelRun: false };
      }
      if (event.key === 'Escape') {
        if (event.pickerOpen) {
          return { action: 'close-picker', cancelRun: false };
        }
        if (frozenReview !== null) {
          invalidateReviewIfActive('REVIEW_CANCELLED_BY_ESCAPE', 'Review closed via Escape key.');
          return { action: 'cancel-review', cancelRun: false };
        }
        if (presentation !== 'collapsed') {
          this.collapse();
          return { action: 'collapse-drawer', cancelRun: false };
        }
        return { action: 'noop', cancelRun: false };
      }
      return { action: 'noop', cancelRun: false };
    },

    // --- Semantic control inventory projection (§9) ---

    /**
     * Builds the declarative semantic control descriptors for the drawer (`drawer/*` and `dispatch/{did}/target/{sid}/*`).
     *
     * @returns {ReadonlyArray<{ anchor: string, role: string, accessibleName: string, disabled: boolean, expanded?: boolean, checked?: boolean, reason?: string }>}
     */
    getSemanticControlInventory() {
      const reviewValidation = verifyReviewStillValid();
      const hasTargets = selectedTargetIds.size > 0;
      const promptCheck = validatePromptDraft(promptText, { maxPromptBytes });
      const sendDisabled = !hasTargets || !promptCheck.ok || imeComposing;
      let sendReason = '';
      if (!hasTargets) {
        sendReason = 'Empty targets disable Send';
      } else if (!promptCheck.ok) {
        sendReason = promptCheck.message;
      } else if (imeComposing) {
        sendReason = 'IME composition active';
      }

      /** @type {Array<{anchor:string,role:string,accessibleName:string,disabled:boolean,expanded?:boolean,checked?:boolean,reason?:string}>} */
      const controls = [
        {
          anchor: 'drawer/toggle',
          role: 'button',
          accessibleName: 'Orchestrator',
          disabled: false,
          expanded: presentation !== 'collapsed'
        },
        {
          anchor: 'drawer/maximize',
          role: 'button',
          accessibleName: presentation === 'maximized' ? 'Restore' : 'Maximize',
          disabled: presentation === 'collapsed'
        },
        {
          anchor: 'drawer/composer',
          role: 'textbox',
          accessibleName: 'Prompt',
          disabled: false
        },
        {
          anchor: 'drawer/send',
          role: 'button',
          accessibleName: reviewValidation.valid
            ? `Send to ${reviewValidation.review.targetIds.join(', ')}`
            : `Review (${selectedTargetIds.size} targets)`,
          disabled: sendDisabled,
          ...(sendReason ? { reason: sendReason } : {})
        },
        {
          anchor: 'drawer/targets/all',
          role: 'button',
          accessibleName: 'Select all in workspace',
          disabled: getVisibleWorkspaceSessionIds().length === 0
        },
        {
          anchor: 'drawer/targets/clear',
          role: 'button',
          accessibleName: 'Clear targets',
          disabled: selectedTargetIds.size === 0
        }
      ];

      for (const sid of [...sessionsById.keys()].sort()) {
        const desc = /** @type {SessionTargetDescriptor} */ (sessionsById.get(sid));
        const elig = evaluateTargetEligibility(desc, { allowQueue: allowQueueRequest });
        controls.push({
          anchor: `drawer/targets/${sid}`,
          role: 'checkbox',
          accessibleName: `Session ${sid} (${desc.activity})`,
          disabled: !elig.eligible,
          checked: selectedTargetIds.has(sid),
          ...(!elig.eligible ? { reason: elig.reason } : {})
        });
      }

      for (const [did, disp] of dispatchesById.entries()) {
        for (const sid of disp.targetIds) {
          const tr = /** @type {TargetRunRecord} */ (disp.targets[sid]);
          const canRetry =
            tr.status === 'verified-failure' || tr.status === 'refused' || tr.status === 'cancelled';
          const canCancel =
            tr.status === 'pending' ||
            tr.status === 'accepted' ||
            tr.status === 'queued' ||
            tr.status === 'executing';
          controls.push(
            {
              anchor: `dispatch/${did}/target/${sid}/result`,
              role: 'region',
              accessibleName: `Result for ${sid}: ${tr.status}`,
              disabled: false
            },
            {
              anchor: `dispatch/${did}/target/${sid}/retry`,
              role: 'button',
              accessibleName: `Retry target ${sid}`,
              disabled: !canRetry,
              ...(!canRetry
                ? {
                    reason:
                      tr.status === 'uncertain'
                        ? 'Uncertain outcome requires reconciliation before retry'
                        : `Retry unavailable in status ${tr.status}`
                  }
                : {})
            },
            {
              anchor: `dispatch/${did}/target/${sid}/cancel`,
              role: 'button',
              accessibleName: `Cancel run on ${sid}`,
              disabled: !canCancel
            }
          );
        }
      }

      return Object.freeze(controls.map((c) => Object.freeze(c)));
    },

    /**
     * Returns an immutable snapshot of the current drawer state.
     */
    getState() {
      const reviewCheck = verifyReviewStillValid();
      const unread = collectUnreadOutputs();
      return Object.freeze({
        workspaceId,
        presentation,
        priorOpenPresentation,
        expandedHeightPx,
        draftScrollTop,
        unreadOutputCount: unread.count,
        unreadOutputs: Object.freeze(unread.outputs.map((entry) => Object.freeze({ ...entry }))),
        viewedSessionId,
        focusedTerminalSessionId,
        controllingSessionId,
        promptText,
        stagedPasteText,
        imeComposing,
        selectionMode,
        selectedTargetIds: Object.freeze([...selectedTargetIds].sort()),
        allowQueueRequest,
        sendEnabled: selectedTargetIds.size > 0 && validatePromptDraft(promptText, { maxPromptBytes }).ok && !imeComposing,
        reviewing: reviewCheck.valid,
        frozenReview: reviewCheck.valid ? reviewCheck.review : null,
        lastInvalidation,
        activeSlotLocks: Object.freeze(Object.fromEntries(activeSlotLocks.entries())),
        dispatches: Object.freeze(
          Object.fromEntries([...dispatchesById.entries()].map(([k, v]) => [k, snapshotDispatch(v)]))
        )
      });
    }
  });

  /**
   * @param {string} slotId
   * @param {number} generation
   * @param {string} requestId
   */
  function releaseSlotLockIfHeld(slotId, generation, requestId) {
    const key = `${slotId}@${generation}`;
    if (activeSlotLocks.get(key) === requestId) {
      activeSlotLocks.delete(key);
    }
  }
}

/**
 * @param {TargetRunRecord} tr
 * @returns {TargetRunRecord}
 */
function snapshotTargetRun(tr) {
  return Object.freeze({
    ...tr,
    streamedChunks: Object.freeze([...tr.streamedChunks])
  });
}

/**
 * @param {DispatchRecord} d
 * @returns {DispatchRecord}
 */
function snapshotDispatch(d) {
  /** @type {Record<string, TargetRunRecord>} */
  const targetsCopy = {};
  for (const [k, v] of Object.entries(d.targets)) {
    targetsCopy[k] = snapshotTargetRun(v);
  }
  return Object.freeze({
    ...d,
    targetIds: Object.freeze([...d.targetIds]),
    targets: Object.freeze(targetsCopy)
  });
}
