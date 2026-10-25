/**
 * @file AI multislot intent vocabulary: builders and validators for the kit
 * `submit-intent` channel (`{ type, capsuleId, ... }`, same shape the wall
 * tile and record button emit). Components take generic props and emit
 * intents only; product bindings and every sink live in the host adapter.
 *
 * Input-mode model (conductor ruling): the operator input mode is
 * `input-mode-read` / `input-mode-write`. There are no take/cede control
 * verbs in this vocabulary: switching mode never takes control away from
 * the automated actor, and slot buttons are operator tools (no activity or
 * pause control exists). The host journals `operator-guidance` events for
 * operator input performed in WRITE mode.
 *
 * Kit law: builders and validators never touch disk, network or clipboard.
 * Disk capture is refused without a host destination
 * (`ERR_DISK_RECORD_WITHOUT_DESTINATION`); the kit never invents a capsule
 * id (`ERR_INVENTED_CAPSULE_ID`).
 *
 * Plain JavaScript ES module with JSDoc types. Zero imports.
 * @module multislot/multislotIntents
 */

/**
 * Record axis phases, shared with the record cluster component.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_RECORD_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/**
 * Screenshot axis states (momentary control).
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_SCREENSHOT_STATES = Object.freeze([
  'idle',
  'capturing',
  'done',
  'error',
]);

/**
 * Operator input modes.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_INPUT_MODES = Object.freeze(['read', 'write']);

/**
 * Capture stores. `ram` is the default; `disk` needs a host destination.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_CAP_STORES = Object.freeze(['ram', 'disk']);

/**
 * Kinds of operator input reported in guidance events.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_INPUT_KINDS = Object.freeze(['pointer', 'keyboard', 'wheel']);

/**
 * Live-surface kinds carried in copy-id payloads.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_SURFACE_KINDS = Object.freeze(['program', 'browser', 'vm']);

/**
 * Full multislot intent vocabulary (submit-intent `type` values).
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_INTENT_TYPES = Object.freeze([
  'record-ai',
  'record-disk',
  'screenshot',
  'copy-id',
  'hide-surface',
  'show-surface',
  'hide-terminal',
  'show-terminal',
  'input-mode-read',
  'input-mode-write',
  'fold',
  'unfold',
  'float',
  'dock-back',
  'close',
  'operator-guidance',
]);

/**
 * Subset of the vocabulary the host journals instead of acting upon.
 * Transport stays `submit-intent`; the host treats these as events.
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_HOST_EVENT_TYPES = Object.freeze(['operator-guidance']);

/**
 * Literal reason shown when disk capture has no host destination.
 * @type {string}
 */
export const DISK_DESTINATION_REASON = 'No disk destination advertised by the host';

/**
 * Creates a coded error for deterministic gate assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function multislotIntentError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Checks whether a value is a plain object.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks whether a value is a non-negative exact safe integer.
 * @param {unknown} value
 * @returns {value is number}
 */
function isNonNegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks whether a value is a non-empty string without surrounding whitespace.
 * @param {unknown} value
 * @returns {value is string}
 */
function isPresentToken(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

/**
 * Validates a host-issued immutable capsule id: non-empty, no whitespace,
 * never a bare numeric index, never a display-number credential.
 * @param {unknown} value
 * @returns {{ ok: true, id: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateCapsuleId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVENTED_CAPSULE_ID',
        message: 'capsuleId must be provided by the host; the kit never invents one',
      },
    };
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_IDENTITY',
        message: `capsuleId must not contain whitespace: "${value}"`,
      },
    };
  }
  if (/^\d+$/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_NUMERIC_INDEX_ID',
        message: `capsuleId must not be a bare numeric index: "${value}"`,
      },
    };
  }
  if (value.startsWith(':') || /^display=/i.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_DISPLAY_CREDENTIAL_ID',
        message: `capsuleId must not be a display-number credential: "${value}"`,
      },
    };
  }
  return { ok: true, id: value };
}

/**
 * Checks the canonical capsule id shape (`cap-` plus lower-case
 * alphanumerics and dashes, at most 40 characters in total).
 * Informational only: builders enforce immutability, not this shape.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCanonicalCapsuleId(value) {
  return typeof value === 'string' && /^cap-[a-z0-9-]{1,36}$/.test(value);
}

/**
 * Requires a valid capsule id or throws the coded validation error.
 * @param {unknown} value
 * @returns {string}
 */
function requireCapsuleId(value) {
  const checked = validateCapsuleId(value);
  if (checked.ok === false) {
    throw multislotIntentError(checked.error.code, checked.error.message);
  }
  return checked.id;
}

/**
 * @param {unknown} phase
 * @returns {string} Known record phase, falling back to `idle`.
 */
export function normalizeRecordPhase(phase) {
  return MULTISLOT_RECORD_PHASES.includes(/** @type {string} */ (phase))
    ? /** @type {string} */ (phase)
    : 'idle';
}

/**
 * @param {unknown} phase
 * @returns {boolean} True while the host transition is pending.
 */
export function recordPhaseBusy(phase) {
  const normalized = normalizeRecordPhase(phase);
  return normalized === 'starting' || normalized === 'stopping';
}

/**
 * @param {unknown} state
 * @returns {string} Known screenshot state, falling back to `idle`.
 */
export function normalizeScreenshotState(state) {
  return MULTISLOT_SCREENSHOT_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'idle';
}

/**
 * @param {unknown} state
 * @returns {boolean} True while the capture is in flight.
 */
export function screenshotStateBusy(state) {
  return normalizeScreenshotState(state) === 'capturing';
}

/**
 * Formats a host-projected elapsed-seconds count as `MM:SS`.
 * Unreadable values render `--:--`, never a fabricated zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatElapsed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--:--';
  }
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Requires a usable disk destination or throws the refusal code.
 * @param {unknown} destination
 * @returns {string}
 */
function requireDiskDestination(destination) {
  if (!isPresentToken(destination)) {
    throw multislotIntentError('ERR_DISK_RECORD_WITHOUT_DESTINATION', DISK_DESTINATION_REASON);
  }
  return /** @type {string} */ (destination);
}

/**
 * Builds a record-for-AI (RAM-only) intent.
 * @param {{ capsuleId: string, phase?: unknown }} input
 * @returns {{ type: string, capsuleId: string, phase: string }}
 */
export function buildRecordAiIntent(input) {
  return Object.freeze({
    type: 'record-ai',
    capsuleId: requireCapsuleId(input.capsuleId),
    phase: normalizeRecordPhase(input.phase),
  });
}

/**
 * Builds a record-to-disk intent. Refused when the host advertises no
 * destination (`ERR_DISK_RECORD_WITHOUT_DESTINATION`).
 * @param {{ capsuleId: string, phase?: unknown, destination: unknown }} input
 * @returns {{ type: string, capsuleId: string, phase: string, destination: string }}
 */
export function buildRecordDiskIntent(input) {
  const capsuleId = requireCapsuleId(input.capsuleId);
  const destination = requireDiskDestination(input.destination);
  return Object.freeze({
    type: 'record-disk',
    capsuleId,
    phase: normalizeRecordPhase(input.phase),
    destination,
  });
}

/**
 * Builds a screenshot intent. RAM by default; a `disk` target is refused
 * without a host destination (`ERR_DISK_RECORD_WITHOUT_DESTINATION`).
 * @param {{ capsuleId: string, target?: unknown, destination?: unknown }} input
 * @returns {{ type: string, capsuleId: string, target: string, destination?: string }}
 */
export function buildScreenshotIntent(input) {
  const capsuleId = requireCapsuleId(input.capsuleId);
  const target = input.target === 'disk' ? 'disk' : 'ram';
  if (target === 'disk') {
    return Object.freeze({
      type: 'screenshot',
      capsuleId,
      target,
      destination: requireDiskDestination(input.destination),
    });
  }
  return Object.freeze({ type: 'screenshot', capsuleId, target });
}

/**
 * Validates a copy-id payload:
 * `{ capsule_id, slot_id?, session_id?, surface?, ts }`.
 * @param {unknown} payload
 * @param {string} capsuleId
 * @returns {{ ok: true } | { ok: false, error: { code: string, message: string } }}
 */
export function validateCopyIdPayload(payload, capsuleId) {
  if (!isPlainObject(payload)) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'copy-id payload must be an object' },
    };
  }
  if (payload.capsule_id !== capsuleId) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_INTENT_PAYLOAD',
        message: 'copy-id payload capsule_id must equal the intent capsuleId',
      },
    };
  }
  for (const key of ['slot_id', 'session_id']) {
    if (payload[key] !== undefined) {
      const checked = validateCapsuleId(payload[key]);
      if (checked.ok === false) {
        return {
          ok: false,
          error: {
            code: 'ERR_INVALID_INTENT_PAYLOAD',
            message: `copy-id payload ${key}: ${checked.error.message}`,
          },
        };
      }
    }
  }
  if (payload.surface !== undefined) {
    if (!isPlainObject(payload.surface)) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'copy-id surface must be an object' },
      };
    }
    const surface = /** @type {Record<string, unknown>} */ (payload.surface);
    if (!MULTISLOT_SURFACE_KINDS.includes(/** @type {string} */ (surface.kind))) {
      return {
        ok: false,
        error: {
          code: 'ERR_INVALID_INTENT_PAYLOAD',
          message: `copy-id surface.kind must be one of ${MULTISLOT_SURFACE_KINDS.join('|')}`,
        },
      };
    }
    for (const key of ['display', 'geometry']) {
      if (surface[key] !== undefined && !isPlainObject(surface[key]) && typeof surface[key] !== 'string') {
        return {
          ok: false,
          error: {
            code: 'ERR_INVALID_INTENT_PAYLOAD',
            message: `copy-id surface.${key} must be a string or an object`,
          },
        };
      }
    }
  }
  if (!isNonNegativeSafeInteger(payload.ts)) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'copy-id payload ts must be a timestamp' },
    };
  }
  return { ok: true };
}

/**
 * Builds a copy-capsule-id intent with a schema-valid payload.
 * @param {{ capsuleId: string, payload: Record<string, unknown> }} input
 * @returns {{ type: string, capsuleId: string, payload: Record<string, unknown> }}
 */
export function buildCopyIdIntent(input) {
  const capsuleId = requireCapsuleId(input.capsuleId);
  const checked = validateCopyIdPayload(input.payload, capsuleId);
  if (checked.ok === false) {
    throw multislotIntentError(checked.error.code, checked.error.message);
  }
  return Object.freeze({
    type: 'copy-id',
    capsuleId,
    payload: Object.freeze({ ...input.payload }),
  });
}

/**
 * Builds a pane-visibility intent
 * (`hide-surface`, `show-surface`, `hide-terminal`, `show-terminal`).
 * @param {{ capsuleId: string, verb: string }} input
 * @returns {{ type: string, capsuleId: string }}
 */
export function buildVisibilityIntent(input) {
  const verbs = ['hide-surface', 'show-surface', 'hide-terminal', 'show-terminal'];
  if (!verbs.includes(input.verb)) {
    throw multislotIntentError(
      'ERR_UNKNOWN_INTENT_TYPE',
      `visibility verb must be one of ${verbs.join('|')}`,
    );
  }
  return Object.freeze({ type: input.verb, capsuleId: requireCapsuleId(input.capsuleId) });
}

/**
 * Builds an operator input-mode intent (`input-mode-read` / `input-mode-write`).
 * @param {{ capsuleId: string, mode: string }} input
 * @returns {{ type: string, capsuleId: string, mode: string }}
 */
export function buildInputModeIntent(input) {
  if (!MULTISLOT_INPUT_MODES.includes(input.mode)) {
    throw multislotIntentError(
      'ERR_UNKNOWN_INTENT_TYPE',
      `input mode must be one of ${MULTISLOT_INPUT_MODES.join('|')}`,
    );
  }
  return Object.freeze({
    type: input.mode === 'write' ? 'input-mode-write' : 'input-mode-read',
    capsuleId: requireCapsuleId(input.capsuleId),
    mode: input.mode,
  });
}

/**
 * Builds a presentation intent (`fold`, `unfold`, `float`, `dock-back`, `close`).
 * @param {{ capsuleId: string, verb: string }} input
 * @returns {{ type: string, capsuleId: string }}
 */
export function buildPresentationIntent(input) {
  const verbs = ['fold', 'unfold', 'float', 'dock-back', 'close'];
  if (!verbs.includes(input.verb)) {
    throw multislotIntentError(
      'ERR_UNKNOWN_INTENT_TYPE',
      `presentation verb must be one of ${verbs.join('|')}`,
    );
  }
  return Object.freeze({ type: input.verb, capsuleId: requireCapsuleId(input.capsuleId) });
}

/**
 * Builds an operator-guidance host event for operator input performed in
 * WRITE mode. The kit emits it; the host journals it (timestamp, capsule
 * id, input kind) so the automated actor can re-perceive and continue.
 * @param {{ capsuleId: string, ts?: unknown, inputKind: string }} input
 * @returns {{ type: string, capsuleId: string, ts: number, inputKind: string }}
 */
export function buildOperatorGuidanceEvent(input) {
  const capsuleId = requireCapsuleId(input.capsuleId);
  const ts = input.ts === undefined ? Date.now() : input.ts;
  if (!isNonNegativeSafeInteger(ts)) {
    throw multislotIntentError(
      'ERR_INVALID_INTENT_PAYLOAD',
      'operator-guidance ts must be a timestamp',
    );
  }
  if (!MULTISLOT_INPUT_KINDS.includes(input.inputKind)) {
    throw multislotIntentError(
      'ERR_INVALID_INTENT_PAYLOAD',
      `operator-guidance inputKind must be one of ${MULTISLOT_INPUT_KINDS.join('|')}`,
    );
  }
  return Object.freeze({ type: 'operator-guidance', capsuleId, ts, inputKind: input.inputKind });
}

/**
 * Validates a submit-intent object without throwing. Disk capture without
 * a host destination is refused (`ERR_DISK_RECORD_WITHOUT_DESTINATION`).
 * @param {unknown} intent
 * @returns {{ ok: true, type: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateIntent(intent) {
  if (!isPlainObject(intent)) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'intent must be an object' },
    };
  }
  const type = intent.type;
  if (typeof type !== 'string' || !MULTISLOT_INTENT_TYPES.includes(type)) {
    return {
      ok: false,
      error: { code: 'ERR_UNKNOWN_INTENT_TYPE', message: `unknown intent type: ${String(type)}` },
    };
  }
  const checkedId = validateCapsuleId(intent.capsuleId);
  if (checkedId.ok === false) {
    return { ok: false, error: checkedId.error };
  }
  if (type === 'record-ai' && !MULTISLOT_RECORD_PHASES.includes(/** @type {string} */ (intent.phase))) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'record-ai phase is unknown' },
    };
  }
  if (type === 'record-disk') {
    if (!MULTISLOT_RECORD_PHASES.includes(/** @type {string} */ (intent.phase))) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'record-disk phase is unknown' },
      };
    }
    if (!isPresentToken(intent.destination)) {
      return {
        ok: false,
        error: { code: 'ERR_DISK_RECORD_WITHOUT_DESTINATION', message: DISK_DESTINATION_REASON },
      };
    }
  }
  if (type === 'screenshot') {
    const target = intent.target === undefined ? 'ram' : intent.target;
    if (target !== 'ram' && target !== 'disk') {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'screenshot target must be ram|disk' },
      };
    }
    if (target === 'disk' && !isPresentToken(intent.destination)) {
      return {
        ok: false,
        error: { code: 'ERR_DISK_RECORD_WITHOUT_DESTINATION', message: DISK_DESTINATION_REASON },
      };
    }
  }
  if (type === 'copy-id') {
    const checkedPayload = validateCopyIdPayload(intent.payload, checkedId.id);
    if (checkedPayload.ok === false) {
      return { ok: false, error: checkedPayload.error };
    }
  }
  if (type === 'input-mode-read' || type === 'input-mode-write') {
    const mode = type === 'input-mode-write' ? 'write' : 'read';
    if (intent.mode !== undefined && intent.mode !== mode) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'input-mode intent mode disagrees' },
      };
    }
  }
  if (type === 'operator-guidance') {
    if (!isNonNegativeSafeInteger(intent.ts)) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'operator-guidance ts must be set' },
      };
    }
    if (!MULTISLOT_INPUT_KINDS.includes(/** @type {string} */ (intent.inputKind))) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'operator-guidance inputKind unknown' },
      };
    }
  }
  return { ok: true, type };
}

/**
 * Generic fixture-driven intent props; neutral labels only.
 * @param {string} type
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
export function multislotIntentFixture(type, overrides = {}) {
  const base = {
    'record-ai': { capsuleId: 'cap-01', phase: 'idle' },
    'record-disk': { capsuleId: 'cap-01', phase: 'idle', destination: 'slot-destination' },
    screenshot: { capsuleId: 'cap-01', target: 'ram' },
    'copy-id': {
      capsuleId: 'cap-01',
      payload: { capsule_id: 'cap-01', ts: 0 },
    },
    'input-mode-read': { capsuleId: 'cap-01', mode: 'read' },
    'input-mode-write': { capsuleId: 'cap-01', mode: 'write' },
    'operator-guidance': { capsuleId: 'cap-01', ts: 0, inputKind: 'pointer' },
  }[type] || { capsuleId: 'cap-01' };
  return { ...base, ...overrides };
}
