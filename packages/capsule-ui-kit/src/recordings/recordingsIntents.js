/**
 * @file Recordings intent vocabulary: builders and validators for the kit
 * `submit-intent` channel (`{ type, capsuleId, ... }`, same shape the wall
 * tile and slot record controls emit). Components take generic props and emit
 * intents only; product bindings and every sink live in the host adapter.
 *
 * Capture model: RAM-first. Recording for AI and screenshots stay in RAM;
 * the kit performs no export itself. Export is an explicit host capability:
 * the host advertises a destination, and only sealed recordings may be
 * exported (`ERR_EXPORT_UNSEALED_RECORDING`). Without a host destination the
 * export intent is refused (`ERR_EXPORT_WITHOUT_DESTINATION`); the kit never
 * invents a capsule or recording id (`ERR_INVENTED_CAPSULE_ID`,
 * `ERR_INVENTED_RECORDING_ID`).
 *
 * Kit law: builders and validators never touch disk, network or clipboard.
 *
 * Plain JavaScript ES module with JSDoc types. Zero imports.
 * @module recordings/recordingsIntents
 */

/**
 * Record axis phases, shared with the control bar and the panel.
 * @type {ReadonlyArray<string>}
 */
export const RECORDING_PHASES = Object.freeze([
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
export const RECORDING_SCREENSHOT_STATES = Object.freeze([
  'idle',
  'capturing',
  'done',
  'error',
]);

/**
 * Capture stores. This lane renders RAM recordings only.
 * @type {ReadonlyArray<string>}
 */
export const RECORDING_STORES = Object.freeze(['ram']);

/**
 * Full recordings intent vocabulary (submit-intent `type` values).
 * @type {ReadonlyArray<string>}
 */
export const RECORDING_INTENT_TYPES = Object.freeze([
  'record-ai',
  'screenshot',
  'recording-select',
  'recording-export',
]);

/**
 * Literal reason shown when export has no host destination.
 * @type {string}
 */
export const EXPORT_DESTINATION_REASON = 'No export destination advertised by the host';

/**
 * Literal reason shown when export targets a recording that is not sealed.
 * @type {string}
 */
export const EXPORT_UNSEALED_REASON = 'Only sealed recordings can be exported';

/**
 * Creates a coded error for deterministic gate assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function recordingsIntentError(code, message) {
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
 * Validates a host-issued immutable recording id: non-empty, no whitespace,
 * never a bare numeric index.
 * @param {unknown} value
 * @returns {{ ok: true, id: string } | { ok: false, error: { code: string, message: string } }}
 */
export function validateRecordingId(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVENTED_RECORDING_ID',
        message: 'recordingId must be provided by the host; the kit never invents one',
      },
    };
  }
  if (value !== value.trim() || /\s/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_IDENTITY',
        message: `recordingId must not contain whitespace: "${value}"`,
      },
    };
  }
  if (/^\d+$/.test(value)) {
    return {
      ok: false,
      error: {
        code: 'ERR_NUMERIC_INDEX_ID',
        message: `recordingId must not be a bare numeric index: "${value}"`,
      },
    };
  }
  return { ok: true, id: value };
}

/**
 * Requires a valid capsule id or throws the coded validation error.
 * @param {unknown} value
 * @returns {string}
 */
function requireCapsuleId(value) {
  const checked = validateCapsuleId(value);
  if (checked.ok === false) {
    throw recordingsIntentError(checked.error.code, checked.error.message);
  }
  return checked.id;
}

/**
 * Requires a valid recording id or throws the coded validation error.
 * @param {unknown} value
 * @returns {string}
 */
function requireRecordingId(value) {
  const checked = validateRecordingId(value);
  if (checked.ok === false) {
    throw recordingsIntentError(checked.error.code, checked.error.message);
  }
  return checked.id;
}

/**
 * @param {unknown} phase
 * @returns {string} Known record phase, falling back to `idle`.
 */
export function normalizeRecordPhase(phase) {
  return RECORDING_PHASES.includes(/** @type {string} */ (phase))
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
  return RECORDING_SCREENSHOT_STATES.includes(/** @type {string} */ (state))
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
 * @param {unknown} store
 * @returns {string} Known store (`ram`), falling back to `unknown`.
 */
export function normalizeStore(store) {
  return RECORDING_STORES.includes(/** @type {string} */ (store))
    ? /** @type {string} */ (store)
    : 'unknown';
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
 * Formats a host-projected counter (frames, dropped, duplicated).
 * Unreadable values render `Unknown`, never a fabricated zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatCount(value) {
  if (!isNonNegativeSafeInteger(value)) {
    return 'Unknown';
  }
  return String(value);
}

/**
 * Formats a host-projected TTL in seconds. Unreadable values render
 * `Unknown`, never a fabricated zero; a spent TTL renders `Expired`.
 * @param {unknown} value
 * @returns {string}
 */
export function formatTtl(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unknown';
  }
  if (value <= 0) {
    return 'Expired';
  }
  return formatElapsed(value);
}

/**
 * Requires a usable host export destination or throws the refusal code.
 * @param {unknown} destination
 * @returns {string}
 */
function requireExportDestination(destination) {
  if (!isPresentToken(destination)) {
    throw recordingsIntentError('ERR_EXPORT_WITHOUT_DESTINATION', EXPORT_DESTINATION_REASON);
  }
  return /** @type {string} */ (destination);
}

/**
 * Builds a record-for-AI (RAM-only) toggle intent.
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
 * Builds a RAM-only screenshot intent.
 * @param {{ capsuleId: string }} input
 * @returns {{ type: string, capsuleId: string, target: string }}
 */
export function buildScreenshotIntent(input) {
  return Object.freeze({
    type: 'screenshot',
    capsuleId: requireCapsuleId(input.capsuleId),
    target: 'ram',
  });
}

/**
 * Builds a manifest row selection intent.
 * @param {{ capsuleId: string, recordingId: string }} input
 * @returns {{ type: string, capsuleId: string, recordingId: string }}
 */
export function buildRecordingSelectIntent(input) {
  return Object.freeze({
    type: 'recording-select',
    capsuleId: requireCapsuleId(input.capsuleId),
    recordingId: requireRecordingId(input.recordingId),
  });
}

/**
 * Builds an explicit export intent to a host-chosen destination. Refused
 * when the host advertises no destination (`ERR_EXPORT_WITHOUT_DESTINATION`)
 * or when the recording is not sealed (`ERR_EXPORT_UNSEALED_RECORDING`).
 * @param {{ capsuleId: string, recordingId: string, phase?: unknown, destination: unknown }} input
 * @returns {{ type: string, capsuleId: string, recordingId: string, phase: string, destination: string }}
 */
export function buildRecordingExportIntent(input) {
  const capsuleId = requireCapsuleId(input.capsuleId);
  const recordingId = requireRecordingId(input.recordingId);
  const destination = requireExportDestination(input.destination);
  const phase = normalizeRecordPhase(input.phase);
  if (phase !== 'sealed') {
    throw recordingsIntentError('ERR_EXPORT_UNSEALED_RECORDING', EXPORT_UNSEALED_REASON);
  }
  return Object.freeze({ type: 'recording-export', capsuleId, recordingId, phase, destination });
}

/**
 * Validates a submit-intent object without throwing. Export without a host
 * destination is refused (`ERR_EXPORT_WITHOUT_DESTINATION`); export of a
 * recording that is not sealed is refused (`ERR_EXPORT_UNSEALED_RECORDING`).
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
  if (typeof type !== 'string' || !RECORDING_INTENT_TYPES.includes(type)) {
    return {
      ok: false,
      error: { code: 'ERR_UNKNOWN_INTENT_TYPE', message: `unknown intent type: ${String(type)}` },
    };
  }
  const checkedId = validateCapsuleId(intent.capsuleId);
  if (checkedId.ok === false) {
    return { ok: false, error: checkedId.error };
  }
  if (type === 'record-ai' && !RECORDING_PHASES.includes(/** @type {string} */ (intent.phase))) {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'record-ai phase is unknown' },
    };
  }
  if (type === 'screenshot' && intent.target !== undefined && intent.target !== 'ram') {
    return {
      ok: false,
      error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'screenshot target must be ram' },
    };
  }
  if (type === 'recording-select' || type === 'recording-export') {
    const checkedRecording = validateRecordingId(intent.recordingId);
    if (checkedRecording.ok === false) {
      return { ok: false, error: checkedRecording.error };
    }
  }
  if (type === 'recording-export') {
    if (!RECORDING_PHASES.includes(/** @type {string} */ (intent.phase))) {
      return {
        ok: false,
        error: { code: 'ERR_INVALID_INTENT_PAYLOAD', message: 'recording-export phase is unknown' },
      };
    }
    if (intent.phase !== 'sealed') {
      return {
        ok: false,
        error: { code: 'ERR_EXPORT_UNSEALED_RECORDING', message: EXPORT_UNSEALED_REASON },
      };
    }
    if (!isPresentToken(intent.destination)) {
      return {
        ok: false,
        error: { code: 'ERR_EXPORT_WITHOUT_DESTINATION', message: EXPORT_DESTINATION_REASON },
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
export function recordingsIntentFixture(type, overrides = {}) {
  switch (type) {
    case 'record-ai':
      return { type, capsuleId: 'cap-01', phase: 'idle', ...overrides };
    case 'screenshot':
      return { type, capsuleId: 'cap-01', target: 'ram', ...overrides };
    case 'recording-select':
      return { type, capsuleId: 'cap-01', recordingId: 'rec-01', ...overrides };
    case 'recording-export':
      return {
        type,
        capsuleId: 'cap-01',
        recordingId: 'rec-01',
        phase: 'sealed',
        destination: 'host-picker',
        ...overrides,
      };
    default:
      throw recordingsIntentError(
        'ERR_UNKNOWN_INTENT_TYPE',
        `unknown intent type: ${String(type)}`,
      );
  }
}
