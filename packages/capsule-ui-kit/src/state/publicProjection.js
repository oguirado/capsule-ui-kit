/**
 * @file PublicProjection admission coordinator, closed schema validator, and read-only view facade.
 * Implements UI_ARCHITECTURE.md §4 (Non-authoritative state and persistence),
 * §12 (C-OWN, C-PUBLIC, C-DECODE, C-INTEGER, C-FLOW, C-REV) and §13 (Projection unit).
 * Plain JavaScript ES module with JSDoc types; zero external runtime dependencies.
 */

/**
 * Default closed schema identifier for shared kit projections.
 * @type {string}
 */
export const PUBLIC_PROJECTION_SCHEMA_ID = 'capsule-ui-kit.public-projection/v1';

/**
 * Closed list of default admitted projection schema identifiers.
 * @type {readonly string[]}
 */
export const DEFAULT_ALLOWED_SCHEMAS = Object.freeze([
  PUBLIC_PROJECTION_SCHEMA_ID
]);

/**
 * Closed top-level envelope keys permitted by admission.
 * @type {readonly string[]}
 */
export const ALLOWED_ENVELOPE_KEYS = Object.freeze([
  'schema',
  'epoch',
  'revision',
  'durableRevision',
  'baseRevision',
  'mode',
  'query',
  'projection'
]);

/**
 * Keys that represent hidden or unredacted internal facts and must never cross into PublicProjection.
 * @type {readonly string[]}
 */
export const FORBIDDEN_HIDDEN_KEYS = Object.freeze([
  'hidden',
  '_hidden',
  'secret',
  'privateFact',
  'internalOnly'
]);

/**
 * Keys whose missing/null/undefined values represent monetary or quantity amounts that must
 * remain `'unavailable'` and never be coerced to `0`.
 * @type {readonly string[]}
 */
export const MONEY_FIELD_KEYS = Object.freeze([
  'amount',
  'balance',
  'cost',
  'price',
  'cash',
  'loan',
  'equity',
  'revenue',
  'salary'
]);

/**
 * @typedef {Object} AdmissionError
 * @property {string} code
 * @property {string} message
 * @property {number|null} [rejectedRevision]
 * @property {string|null} [rejectedQuery]
 * @property {number|null} [rejectedEpoch]
 */

/**
 * @typedef {Object} AdmittedEnvelope
 * @property {string} schema
 * @property {number} epoch
 * @property {number} revision
 * @property {number|null} durableRevision
 * @property {string} query
 * @property {Record<string, any>} projection
 */

/**
 * @typedef {Object} PublicProjectionSnapshot
 * @property {'unavailable'|'live'|'stale'} status
 * @property {boolean} stale
 * @property {number|null} ramRevision
 * @property {number|null} durableRevision
 * @property {AdmittedEnvelope|null} envelope
 * @property {AdmissionError|null} error
 */

/**
 * @typedef {Object} QuerySessionState
 * @property {number} generation
 * @property {string} query
 * @property {number} epoch
 * @property {boolean} subscriptionReady
 * @property {boolean} active
 */

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
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
 * Deeply clones and freezes a plain data value, normalizing missing monetary fields
 * to `'unavailable'` (never `0`) and rejecting non-plain objects, functions, or circular structures.
 * @template T
 * @param {T} value
 * @param {WeakSet<object>} [seen]
 * @returns {T}
 */
export function cloneAndFreeze(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }
  const valueType = typeof value;
  if (
    valueType === 'string' ||
    valueType === 'boolean' ||
    valueType === 'number'
  ) {
    return value;
  }
  if (valueType !== 'object') {
    throw new TypeError(`Unsupported value type in projection: ${valueType}`);
  }
  const obj = /** @type {object} */ (value);
  if (seen.has(obj)) {
    throw new TypeError('Circular reference refused in projection payload');
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    const copy = obj.map((item) => cloneAndFreeze(item, seen));
    return /** @type {T} */ (Object.freeze(copy));
  }

  if (!isPlainObject(obj)) {
    throw new TypeError('Non-plain object instance refused in projection payload');
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(obj)) {
    const rawVal = obj[key];
    if (
      MONEY_FIELD_KEYS.includes(key) &&
      (rawVal === null || rawVal === undefined)
    ) {
      out[key] = 'unavailable';
    } else if (rawVal !== undefined) {
      out[key] = cloneAndFreeze(rawVal, seen);
    }
  }
  return /** @type {T} */ (Object.freeze(out));
}

/**
 * Recursively inspects a projection node for forbidden hidden keys and inexact numbers.
 * @param {unknown} node
 * @param {Set<string>} forbiddenKeySet
 * @param {WeakSet<object>} [seen]
 * @returns {{ ok: true } | { ok: false, error: AdmissionError }}
 */
function inspectPayloadNode(node, forbiddenKeySet, seen = new WeakSet()) {
  if (node === null || node === undefined) {
    return { ok: true };
  }
  const t = typeof node;
  if (t === 'string' || t === 'boolean') {
    return { ok: true };
  }
  if (t === 'number') {
    if (!Number.isSafeInteger(node)) {
      return {
        ok: false,
        error: {
          code: 'ERR_INEXACT_INTEGER',
          message: `Inexact or non-safe integer value rejected: ${String(node)}`
        }
      };
    }
    return { ok: true };
  }
  if (t !== 'object') {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_PAYLOAD_TYPE',
        message: `Unsupported type in projection payload: ${t}`
      }
    };
  }

  const obj = /** @type {object} */ (node);
  if (seen.has(obj)) {
    return {
      ok: false,
      error: {
        code: 'ERR_CIRCULAR_PAYLOAD',
        message: 'Circular reference in projection payload'
      }
    };
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i += 1) {
      const check = inspectPayloadNode(obj[i], forbiddenKeySet, seen);
      if (!check.ok) {
        return check;
      }
    }
    return { ok: true };
  }

  if (!isPlainObject(obj)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_PAYLOAD_TYPE',
        message: 'Non-plain object rejected in projection payload'
      }
    };
  }

  for (const key of Object.keys(obj)) {
    if (forbiddenKeySet.has(key)) {
      return {
        ok: false,
        error: {
          code: 'ERR_HIDDEN_FACT',
          message: `Forbidden hidden fact key "${key}" rejected at boundary`
        }
      };
    }
    const val = obj[key];
    if (MONEY_FIELD_KEYS.includes(key)) {
      if (
        val !== null &&
        val !== undefined &&
        val !== 'unavailable' &&
        (typeof val !== 'number' || !Number.isSafeInteger(val)) &&
        !(isPlainObject(val) && Object.keys(val).sort().join(',') === 'currency,minor' &&
          typeof val.currency === 'number' && Number.isSafeInteger(val.currency) && val.currency >= 0 && Number.isSafeInteger(val.minor))
      ) {
        return {
          ok: false,
          error: {
            code: 'ERR_INEXACT_INTEGER',
            message: `Monetary field "${key}" must be an exact safe integer or unavailable`
          }
        };
      }
    }
    const childCheck = inspectPayloadNode(val, forbiddenKeySet, seen);
    if (!childCheck.ok) {
      return childCheck;
    }
  }

  return { ok: true };
}

/**
 * Validates an entity row collection completely (all-or-nothing batch rule).
 * Rejects malformed rows (including the last row) and duplicate entity IDs.
 * @param {unknown[]} rows
 * @returns {{ ok: true } | { ok: false, error: AdmissionError }}
 */
function validateRowBatch(rows) {
  /** @type {Set<string>} */
  const seenIds = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isPlainObject(row) || typeof row.id !== 'string' || row.id.trim() === '') {
      return {
        ok: false,
        error: {
          code: 'ERR_MALFORMED_ROW',
          message: `Row at index ${i} is malformed or missing a stable string id`
        }
      };
    }
    if (seenIds.has(row.id)) {
      return {
        ok: false,
        error: {
          code: 'ERR_DUPLICATE_IDENTITY',
          message: `Duplicate entity identity "${row.id}" at index ${i}`
        }
      };
    }
    seenIds.add(row.id);
  }
  return { ok: true };
}

/**
 * Validates a complete projection envelope against the closed schema and integer/row contracts.
 * @param {unknown} envelope
 * @param {Object} [options]
 * @param {readonly string[]} [options.allowedSchemas]
 * @param {readonly string[]} [options.forbiddenKeys]
 * @returns {{ ok: true, value: Record<string, any> } | { ok: false, error: AdmissionError }}
 */
export function validateProjectionEnvelope(envelope, options = {}) {
  if (!isPlainObject(envelope)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_ENVELOPE',
        message: 'Projection envelope must be a plain object'
      }
    };
  }

  const allowedKeySet = new Set(ALLOWED_ENVELOPE_KEYS);
  for (const key of Object.keys(envelope)) {
    if (!allowedKeySet.has(key)) {
      return {
        ok: false,
        error: {
          code: 'ERR_UNKNOWN_ENVELOPE_KEY',
          message: `Unknown envelope key "${key}" rejected`
        }
      };
    }
  }

  const allowedSchemas = options.allowedSchemas ?? DEFAULT_ALLOWED_SCHEMAS;
  if (typeof envelope.schema !== 'string' || !allowedSchemas.includes(envelope.schema)) {
    return {
      ok: false,
      error: {
        code: 'ERR_UNKNOWN_SCHEMA',
        message: `Schema "${String(envelope.schema)}" is not in the closed schema set`
      }
    };
  }

  if (!isNonNegativeSafeInteger(envelope.epoch)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'Envelope epoch must be a non-negative exact safe integer'
      }
    };
  }

  if (!isNonNegativeSafeInteger(envelope.revision)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'Envelope revision must be a non-negative exact safe integer'
      }
    };
  }

  if (
    envelope.durableRevision !== undefined &&
    envelope.durableRevision !== null &&
    (!isNonNegativeSafeInteger(envelope.durableRevision) ||
      envelope.durableRevision > envelope.revision)
  ) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'durableRevision must be a non-negative safe integer <= revision'
      }
    };
  }

  const mode = envelope.mode ?? 'snapshot';
  if (mode !== 'snapshot' && mode !== 'delta') {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_MODE',
        message: `Unsupported admission mode "${String(mode)}"`
      }
    };
  }

  if (
    envelope.baseRevision !== undefined &&
    !isNonNegativeSafeInteger(envelope.baseRevision)
  ) {
    return {
      ok: false,
      error: {
        code: 'ERR_INEXACT_INTEGER',
        message: 'baseRevision must be a non-negative safe integer when present'
      }
    };
  }

  if (typeof envelope.query !== 'string' || envelope.query.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_QUERY',
        message: 'Envelope query must be a non-empty string'
      }
    };
  }

  if (!isPlainObject(envelope.projection)) {
    return {
      ok: false,
      error: {
        code: 'ERR_INVALID_PROJECTION',
        message: 'Envelope projection payload must be a plain object'
      }
    };
  }

  const forbiddenKeySet = new Set(options.forbiddenKeys ?? FORBIDDEN_HIDDEN_KEYS);
  const payloadCheck = inspectPayloadNode(envelope.projection, forbiddenKeySet);
  if (!payloadCheck.ok) {
    return payloadCheck;
  }

  if (Array.isArray(envelope.projection.rows)) {
    const rowCheck = validateRowBatch(envelope.projection.rows);
    if (!rowCheck.ok) {
      return rowCheck;
    }
  }

  if (Array.isArray(envelope.projection.entities)) {
    const entityCheck = validateRowBatch(envelope.projection.entities);
    if (!entityCheck.ok) {
      return entityCheck;
    }
  }

  if (Array.isArray(envelope.projection.upsertRows)) {
    const upsertCheck = validateRowBatch(envelope.projection.upsertRows);
    if (!upsertCheck.ok) {
      return upsertCheck;
    }
  }

  return { ok: true, value: envelope };
}

/**
 * Applies a validated delta payload onto the resident projection, producing a new candidate
 * projection object to be validated and frozen as a complete batch before publication.
 * @param {Record<string, any>} residentProjection
 * @param {Record<string, any>} deltaProjection
 * @returns {Record<string, any>}
 */
function mergeDeltaProjection(residentProjection, deltaProjection) {
  /** @type {Record<string, any>} */
  const merged = {};
  for (const key of Object.keys(residentProjection)) {
    merged[key] = residentProjection[key];
  }

  const baseRows = Array.isArray(residentProjection.rows)
    ? residentProjection.rows.slice()
    : [];
  const removeSet = new Set(
    Array.isArray(deltaProjection.removeRowIds)
      ? deltaProjection.removeRowIds.filter((id) => typeof id === 'string')
      : []
  );

  /** @type {Record<string, any>[]} */
  const nextRows = baseRows.filter((row) => !removeSet.has(row.id));
  /** @type {Map<string, number>} */
  const indexById = new Map();
  nextRows.forEach((row, idx) => {
    indexById.set(row.id, idx);
  });

  if (Array.isArray(deltaProjection.upsertRows)) {
    for (const upsertRow of deltaProjection.upsertRows) {
      const existingIndex = indexById.get(upsertRow.id);
      if (existingIndex !== undefined) {
        nextRows[existingIndex] = {
          ...nextRows[existingIndex],
          ...upsertRow
        };
      } else {
        indexById.set(upsertRow.id, nextRows.length);
        nextRows.push({ ...upsertRow });
      }
    }
  }

  for (const key of Object.keys(deltaProjection)) {
    if (key !== 'upsertRows' && key !== 'removeRowIds') {
      merged[key] = deltaProjection[key];
    }
  }

  if (
    Array.isArray(residentProjection.rows) ||
    Array.isArray(deltaProjection.upsertRows)
  ) {
    merged.rows = nextRows;
  }

  return merged;
}

/**
 * Creates a per-renderer PublicProjection admission coordinator and read-only view facade.
 * Views receive only read-only access; ingress clones and freezes all admitted data.
 *
 * @param {Object} [options]
 * @param {readonly string[]} [options.allowedSchemas]
 * @param {readonly string[]} [options.forbiddenKeys]
 */
export function createPublicProjectionCoordinator(options = {}) {
  const allowedSchemas = Object.freeze(
    options.allowedSchemas
      ? Array.from(options.allowedSchemas)
      : Array.from(DEFAULT_ALLOWED_SCHEMAS)
  );
  const forbiddenKeys = Object.freeze(
    options.forbiddenKeys
      ? Array.from(options.forbiddenKeys)
      : Array.from(FORBIDDEN_HIDDEN_KEYS)
  );

  /** @type {AdmittedEnvelope|null} */
  let residentEnvelope = null;
  /** @type {number|null} */
  let ramRevision = null;
  /** @type {number|null} */
  let durableRevision = null;
  /** @type {boolean} */
  let isStale = false;
  /** @type {AdmissionError|null} */
  let lastError = null;

  /** @type {number} */
  let currentGeneration = 0;
  /** @type {QuerySessionState|null} */
  let activeSession = null;
  /** @type {(() => void)|null} */
  let activeUnsubscribe = null;

  /** @type {Set<(snapshot: PublicProjectionSnapshot) => void>} */
  const listeners = new Set();

  /**
   * Builds and deeply freezes the current public projection snapshot.
   * @returns {PublicProjectionSnapshot}
   */
  function buildSnapshot() {
    /** @type {'unavailable'|'live'|'stale'} */
    let status = 'unavailable';
    if (residentEnvelope !== null) {
      status = isStale ? 'stale' : 'live';
    }
    return Object.freeze({
      status,
      stale: isStale,
      ramRevision,
      durableRevision,
      envelope: residentEnvelope,
      error: lastError ? Object.freeze({ ...lastError }) : null
    });
  }

  function notifyListeners() {
    const snap = buildSnapshot();
    for (const listener of listeners) {
      listener(snap);
    }
  }

  /**
   * Records a refusal without overwriting the last-good resident envelope.
   * Marks existing resident data as stale with the refusal error attached.
   * @param {AdmissionError} err
   * @returns {{ ok: false, error: AdmissionError, snapshot: PublicProjectionSnapshot }}
   */
  function refuse(err) {
    lastError = Object.freeze({ ...err });
    if (residentEnvelope !== null) {
      isStale = true;
    }
    const snapshot = buildSnapshot();
    notifyListeners();
    return Object.freeze({
      ok: false,
      error: lastError,
      snapshot
    });
  }

  /**
   * Invalidates any active QuerySession BEFORE calling its unsubscribe handle,
   * preventing stale callbacks during teardown from mutating or requesting snapshots.
   * @param {string} [reason]
   * @param {(() => void)|null} [overrideUnsubscribe]
   * @returns {number} The new invalidated generation counter
   */
  function invalidateSession(reason = 'invalidated', overrideUnsubscribe = null) {
    currentGeneration += 1;
    const prevUnsubscribe = overrideUnsubscribe ?? activeUnsubscribe;
    activeSession = null;
    activeUnsubscribe = null;
    if (residentEnvelope !== null) {
      isStale = true;
    }
    if (typeof prevUnsubscribe === 'function') {
      prevUnsubscribe();
    }
    notifyListeners();
    return currentGeneration;
  }

  /**
   * Starts a new QuerySession for `{ query, epoch }`.
   * Invalidates the previous session before invoking `onUnsubscribePrevious`.
   * Subscription readiness starts as `false` until `markSubscriptionReady(generation)` is called.
   *
   * @param {Object} params
   * @param {string} params.query
   * @param {number} params.epoch
   * @param {() => void} [params.onUnsubscribe]
   * @param {() => void} [params.onUnsubscribePrevious]
   * @returns {Readonly<QuerySessionState>}
   */
  function beginSession(params) {
    if (typeof params?.query !== 'string' || params.query.trim() === '') {
      throw new TypeError('beginSession requires a non-empty query string');
    }
    if (!isNonNegativeSafeInteger(params.epoch)) {
      throw new TypeError('beginSession requires a non-negative safe integer epoch');
    }

    const prevUnsub = params.onUnsubscribePrevious ?? activeUnsubscribe;
    currentGeneration += 1;
    const nextGen = currentGeneration;

    // Invalidate previous session state FIRST before calling its unsubscribe callback
    activeSession = {
      generation: nextGen,
      query: params.query,
      epoch: params.epoch,
      subscriptionReady: false,
      active: true
    };
    activeUnsubscribe = params.onUnsubscribe ?? null;

    if (
      residentEnvelope !== null &&
      (residentEnvelope.query !== params.query ||
        residentEnvelope.epoch !== params.epoch)
    ) {
      isStale = true;
    }

    if (typeof prevUnsub === 'function') {
      prevUnsub();
    }

    return Object.freeze({ ...activeSession });
  }

  /**
   * Marks the subscription for `generation` as installed and ready to request/receive snapshots.
   * @param {number} generation
   * @returns {{ ok: boolean, error?: AdmissionError }}
   */
  function markSubscriptionReady(generation) {
    if (!activeSession || !activeSession.active || activeSession.generation !== generation) {
      return {
        ok: false,
        error: {
          code: 'ERR_STALE_GENERATION',
          message: `Cannot mark ready: generation ${String(generation)} is not active`
        }
      };
    }
    activeSession.subscriptionReady = true;
    return { ok: true };
  }

  /**
   * Checks whether an initial snapshot may be requested for `generation`.
   * Subscription must be installed and ready first (UI_ARCHITECTURE §4).
   * @param {number} generation
   * @returns {boolean}
   */
  function canRequestSnapshot(generation) {
    return Boolean(
      activeSession &&
        activeSession.active &&
        activeSession.generation === generation &&
        activeSession.subscriptionReady
    );
  }

  /**
   * Single unified admission function used by both `push` and `initial-response`.
   * Decodes and validates the complete batch, rejects unknown keys, duplicate identities,
   * inexact integers, and stale query/epoch/revision/generation, then publishes once.
   *
   * @param {unknown} rawEnvelope
   * @param {Object} [meta]
   * @param {number} [meta.generation]
   * @param {'push'|'initial-response'} [meta.source]
   * @returns {{ ok: true, snapshot: PublicProjectionSnapshot } | { ok: false, error: AdmissionError, snapshot: PublicProjectionSnapshot }}
   */
  function admit(rawEnvelope, meta = {}) {
    if (
      meta.generation !== undefined &&
      (!activeSession || meta.generation !== activeSession.generation)
    ) {
      return refuse({
        code: 'ERR_STALE_GENERATION',
        message: `Stale callback generation ${String(meta.generation)} refused`
      });
    }

    if (activeSession && !activeSession.subscriptionReady) {
      return refuse({
        code: 'ERR_SUBSCRIPTION_NOT_READY',
        message: 'Subscription readiness is required before snapshot admission'
      });
    }

    const validation = validateProjectionEnvelope(rawEnvelope, {
      allowedSchemas,
      forbiddenKeys
    });
    if (!validation.ok) {
      return refuse(validation.error);
    }

    const env = validation.value;

    // Verify expected session query and epoch when a session is active
    if (activeSession) {
      if (env.query !== activeSession.query) {
        return refuse({
          code: 'ERR_STALE_QUERY',
          message: `Envelope query "${env.query}" does not match active query "${activeSession.query}"`,
          rejectedQuery: env.query,
          rejectedEpoch: env.epoch,
          rejectedRevision: env.revision
        });
      }
      if (env.epoch !== activeSession.epoch) {
        return refuse({
          code: 'ERR_STALE_EPOCH',
          message: `Envelope epoch ${env.epoch} does not match active epoch ${activeSession.epoch}`,
          rejectedQuery: env.query,
          rejectedEpoch: env.epoch,
          rejectedRevision: env.revision
        });
      }
    }

    // Monotonic epoch / revision guard against resident state
    if (residentEnvelope !== null) {
      if (env.epoch < residentEnvelope.epoch) {
        return refuse({
          code: 'ERR_STALE_EPOCH',
          message: `Envelope epoch ${env.epoch} is older than resident epoch ${residentEnvelope.epoch}`,
          rejectedQuery: env.query,
          rejectedEpoch: env.epoch,
          rejectedRevision: env.revision
        });
      }
      if (
        env.epoch === residentEnvelope.epoch &&
        env.query === residentEnvelope.query &&
        env.revision <= residentEnvelope.revision
      ) {
        return refuse({
          code: 'ERR_STALE_REVISION',
          message: `Non-monotonic revision ${env.revision} refused (resident is ${residentEnvelope.revision})`,
          rejectedQuery: env.query,
          rejectedEpoch: env.epoch,
          rejectedRevision: env.revision
        });
      }
    }

    const mode = env.mode ?? 'snapshot';
    /** @type {Record<string, any>} */
    let candidateProjection = env.projection;

    if (mode === 'delta' || env.baseRevision !== undefined) {
      if (
        residentEnvelope === null ||
        residentEnvelope.schema !== env.schema ||
        residentEnvelope.epoch !== env.epoch ||
        residentEnvelope.query !== env.query ||
        env.baseRevision !== residentEnvelope.revision
      ) {
        return refuse({
          code: 'ERR_WRONG_DELTA_BASE',
          message: `Delta baseRevision ${String(env.baseRevision)} does not match resident revision ${String(residentEnvelope?.revision ?? null)}`,
          rejectedQuery: env.query,
          rejectedEpoch: env.epoch,
          rejectedRevision: env.revision
        });
      }
      candidateProjection = mergeDeltaProjection(
        residentEnvelope.projection,
        env.projection
      );
      if (Array.isArray(candidateProjection.rows)) {
        const mergedCheck = validateRowBatch(candidateProjection.rows);
        if (!mergedCheck.ok) {
          return refuse(mergedCheck.error);
        }
      }
    }

    // Distinct RAM revision vs durable revision
    const nextRamRevision = env.revision;
    const nextDurableRevision =
      env.durableRevision !== undefined && env.durableRevision !== null
        ? env.durableRevision
        : residentEnvelope && residentEnvelope.epoch === env.epoch
          ? durableRevision
          : null;

    // Deep-clone and deep-freeze before storing to eliminate all mutable aliases
    const frozenProjection = cloneAndFreeze(candidateProjection);
    residentEnvelope = Object.freeze({
      schema: env.schema,
      epoch: env.epoch,
      revision: nextRamRevision,
      durableRevision: nextDurableRevision,
      query: env.query,
      projection: frozenProjection
    });
    ramRevision = nextRamRevision;
    durableRevision = nextDurableRevision;
    isStale = false;
    lastError = null;

    const snapshot = buildSnapshot();
    notifyListeners();
    return Object.freeze({
      ok: true,
      snapshot
    });
  }

  /**
   * Admits an initial snapshot response using the shared admission function.
   * @param {unknown} rawEnvelope
   * @param {Object} [meta]
   * @param {number} [meta.generation]
   */
  function admitInitialResponse(rawEnvelope, meta = {}) {
    return admit(rawEnvelope, { ...meta, source: 'initial-response' });
  }

  /**
   * Admits a pushed update or delta using the shared admission function.
   * @param {unknown} rawEnvelope
   * @param {Object} [meta]
   * @param {number} [meta.generation]
   */
  function admitPush(rawEnvelope, meta = {}) {
    return admit(rawEnvelope, { ...meta, source: 'push' });
  }

  /**
   * Reconciles a list of selected stable entity IDs against the current admitted projection.
   * Never copies entity objects into selection state (UI_ARCHITECTURE §4 UiSelection).
   * @param {readonly string[]} selectedIds
   * @returns {Readonly<{ validIds: readonly string[], removedIds: readonly string[] }>}
   */
  function reconcileSelection(selectedIds) {
    if (!Array.isArray(selectedIds)) {
      return Object.freeze({
        validIds: Object.freeze([]),
        removedIds: Object.freeze([])
      });
    }
    const rows =
      residentEnvelope?.projection?.rows ??
      residentEnvelope?.projection?.entities ??
      [];
    /** @type {Set<string>} */
    const residentIds = new Set();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row && typeof row.id === 'string') {
          residentIds.add(row.id);
        }
      }
    }

    /** @type {string[]} */
    const validIds = [];
    /** @type {string[]} */
    const removedIds = [];
    /** @type {Set<string>} */
    const seen = new Set();

    for (const id of selectedIds) {
      if (typeof id !== 'string' || seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (residentIds.has(id)) {
        validIds.push(id);
      } else {
        removedIds.push(id);
      }
    }

    return Object.freeze({
      validIds: Object.freeze(validIds),
      removedIds: Object.freeze(removedIds)
    });
  }

  /**
   * Creates an explicitly labelled, frozen UI preview draft without mutating PublicProjection.
   * @template T
   * @param {T} draftPayload
   * @param {string} [label]
   * @returns {Readonly<{ isDraft: true, label: string, draft: T }>}
   */
  function createPreviewDraft(draftPayload, label = 'draft') {
    return Object.freeze({
      isDraft: true,
      label: typeof label === 'string' && label.trim() !== '' ? label : 'draft',
      draft: cloneAndFreeze(draftPayload)
    });
  }

  /**
   * Refuses any attempt to patch PublicProjection from an IntentStatus acknowledgement
   * (UI_ARCHITECTURE §4: "acknowledgements never patch projection").
   * @param {unknown} _ackPayload
   * @returns {{ ok: false, error: AdmissionError }}
   */
  function applyAcknowledgement(_ackPayload) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: 'ERR_ACK_CANNOT_PATCH_PROJECTION',
        message: 'Intent acknowledgements must never patch PublicProjection'
      })
    });
  }

  /**
   * Subscribes a read-only listener to admitted projection changes.
   * @param {(snapshot: PublicProjectionSnapshot) => void} listener
   * @returns {() => void} Unsubscribe callback
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Listener must be a function');
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * Read-only view object handed to UI components. Contains no writer or admission capabilities.
   */
  const view = Object.freeze({
    getSnapshot: buildSnapshot,
    getProjection: () => residentEnvelope?.projection ?? null,
    getAllowedSchemas: () => allowedSchemas,
    reconcileSelection,
    subscribe
  });

  return Object.freeze({
    beginSession,
    markSubscriptionReady,
    canRequestSnapshot,
    invalidateSession,
    admit,
    admitInitialResponse,
    admitPush,
    createPreviewDraft,
    applyAcknowledgement,
    getAllowedSchemas: () => allowedSchemas,
    getView: () => view
  });
}
