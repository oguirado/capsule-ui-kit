/**
 * @file Declarative semantic control registry and AI-operability contract enforcement.
 * Grounded in UI_ARCHITECTURE.md §9 (AI-operability contract) and §13 (Semantic registry unit).
 * Plain JavaScript ES module with JSDoc types; no authored TypeScript, no consumer imports.
 */

import { sha256 } from './sha256.js';

/**
 * @typedef {Object} ControlBox
 * @property {number} x - Rounded content-window CSS pixel X coordinate (content-framebuffer origin).
 * @property {number} y - Rounded content-window CSS pixel Y coordinate (content-framebuffer origin).
 * @property {number} width - Rounded positive width in CSS pixels.
 * @property {number} height - Rounded positive height in CSS pixels.
 */

/**
 * @typedef {Object} ControlFamilyRule
 * @property {number} rowIndex - 1-based row index from UI_ARCHITECTURE.md §9 matrix.
 * @property {string} template - Canonical family template label.
 * @property {RegExp} pattern - Pattern matching concrete semantic anchors.
 * @property {readonly string[]} allowedRoles - Permitted ARIA/semantic roles for this control family.
 * @property {boolean} requiresReasonWhenDisabled - Whether disabled/unavailable state requires unavailableReason.
 * @property {boolean} forbidsZeroWhenUnknown - Whether unknown values must never be coerced to zero.
 */

/**
 * @typedef {Object} ReviewedProducerContract
 * @property {string} contractId - Reviewed producer schema identifier.
 * @property {string} peer - Peer identifier (must not be bare 'electron').
 * @property {boolean} reviewed - Explicit review gate witness.
 * @property {(input: { semanticAnchor: string, windowId: string, presentationInstance: string, entityId: string, controlSlot: string, epoch: number, generation: number }) => string} mapStableId
 */

/**
 * @typedef {Object} ControlRegistrationInput
 * @property {string} semanticAnchor - Concrete semantic anchor matching the §9 control-family inventory.
 * @property {string} entityId - Immutable entity identity (never list index/length/display text).
 * @property {string} presentationInstance - Presentation instance identifier within the window.
 * @property {string} controlSlot - Control slot identifier within the entity/presentation tuple.
 * @property {string} role - Effective ARIA/semantic role.
 * @property {string} accessibleName - Computed accessible name (localized text allowed; IDs never localize).
 * @property {Record<string, unknown>} [state] - Semantic state snapshot (expanded, pressed, disabled, etc.).
 * @property {boolean} [visible] - Whether the node is currently visible.
 * @property {boolean} [materialized] - Whether the node is currently materialized in the view.
 * @property {boolean} [inDom] - Whether the node is mounted in the active DOM.
 * @property {boolean} [synthetic] - Whether the entry is a synthetic container/status with no box.
 * @property {string} [coordinateSpace] - Must be 'content-window' when provided.
 * @property {ControlBox | null} [box] - Current content-window CSS box or null when hidden/synthetic.
 * @property {number} epoch - Exact window/projection epoch at registration.
 * @property {number} [generation] - Immutable surface/entity generation.
 * @property {string} [stableId] - Forbidden on UI input; UI must never synthesize wire suffixes.
 */

/**
 * @typedef {Object} RegisteredControlRecord
 * @property {string} semanticAnchor
 * @property {string} familyTemplate
 * @property {string} windowId
 * @property {string} entityId
 * @property {string} presentationInstance
 * @property {string} controlSlot
 * @property {string} tupleKey
 * @property {string} role
 * @property {string} accessibleName
 * @property {Record<string, unknown>} state
 * @property {boolean} visible
 * @property {boolean} materialized
 * @property {boolean} inDom
 * @property {boolean} synthetic
 * @property {ControlBox | null} box
 * @property {number} epoch
 * @property {number} generation
 * @property {string | null} stableId
 */

/**
 * Creates a coded error for deterministic gate assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function registryError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Validates that an identifier token is a non-empty immutable token (not purely numeric index or whitespace).
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function assertImmutableId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw registryError('ERR_INVALID_IDENTITY', `${label} must be a non-empty string`);
  }
  if (value !== value.trim() || /\s/.test(value)) {
    throw registryError('ERR_INVALID_IDENTITY', `${label} must not contain whitespace: "${value}"`);
  }
  if (/^\d+$/.test(value)) {
    throw registryError(
      'ERR_NUMERIC_INDEX_ID',
      `${label} must use an immutable entity ID, never a bare numeric index or list length: "${value}"`
    );
  }
  return value;
}

/**
 * Validates a non-negative safe integer for epoch/generation/seq/tick.
 * @param {unknown} value
 * @param {string} label
 * @param {string} [errCode]
 * @returns {number}
 */
function assertSafeNonNegativeInt(value, label, errCode = 'ERR_INVALID_INTEGER') {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw registryError(errCode, `${label} must be a non-negative safe integer`);
  }
  return value;
}

/**
 * Allowed control-family inventory from UI_ARCHITECTURE.md §9 (13 normative rows, expanded into pattern rules).
 * @type {readonly ControlFamilyRule[]}
 */
const FAMILY_RULES = Object.freeze([
  Object.freeze({
    rowIndex: 6,
    template: 'terminal/launcher',
    pattern: /^terminal\/launcher$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 6,
    template: 'terminal/launch/{shell,pi,claude,codex}',
    pattern: /^terminal\/launch\/(shell|pi|claude|codex)$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 6,
    template: 'terminal/session/{sid}/{tab,close}',
    pattern: /^terminal\/session\/([A-Za-z0-9._-]+)\/(tab|close)$/,
    allowedRoles: Object.freeze(['tab', 'button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 6,
    template: 'terminal/composer',
    pattern: /^terminal\/composer$/,
    allowedRoles: Object.freeze(['textbox']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 6,
    template: 'terminal/composer/send',
    pattern: /^terminal\/composer\/send$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 1,
    template: 'shell/fullscreen',
    pattern: /^shell\/fullscreen$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 1,
    template: 'shell/navigation/{id}',
    pattern: /^shell\/navigation\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['button', 'tab']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 2,
    template: 'capsule/{id}/panel',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/panel$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 2,
    template: 'capsule/{id}/tab',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/tab$/,
    allowedRoles: Object.freeze(['tab']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 3,
    template: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/(fold|pin|control|close|popout|dock-back|float|maximize|hide|show)$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: true,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 4,
    template: 'workspace/separator/{id}',
    pattern: /^workspace\/separator\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['separator']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 5,
    template: 'capsule/{id}/slot',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/slot$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 5,
    template: 'capsule/{id}/session/{sid}/tab',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/session\/([A-Za-z0-9._-]+)\/tab$/,
    allowedRoles: Object.freeze(['tab']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 6,
    template: 'session/{sid}/{attach,stop,replay,target}',
    pattern: /^session\/([A-Za-z0-9._-]+)\/(attach|stop|replay|target)$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 7,
    template: 'drawer/{toggle,maximize,composer,send}',
    pattern: /^drawer\/(toggle|maximize|composer|send)$/,
    allowedRoles: Object.freeze(['button', 'textbox']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 8,
    template: 'drawer/targets/{sid,all,clear}',
    pattern: /^drawer\/targets\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['checkbox', 'button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 9,
    template: 'dispatch/{did}/target/{sid}/{result,retry,cancel}',
    pattern: /^dispatch\/([A-Za-z0-9._-]+)\/target\/([A-Za-z0-9._-]+)\/(result|retry|cancel)$/,
    allowedRoles: Object.freeze(['region', 'button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 10,
    template: 'fleet/{id}/row',
    pattern: /^fleet\/([A-Za-z0-9._-]+)\/row$/,
    allowedRoles: Object.freeze(['row']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: true,
  }),
  Object.freeze({
    rowIndex: 10,
    template: 'inspector/{id}/field',
    pattern: /^inspector\/([A-Za-z0-9._-]+)\/field$/,
    allowedRoles: Object.freeze(['region', 'group', 'definition', 'row']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: true,
  }),
  Object.freeze({
    rowIndex: 11,
    template: 'alerts/{aid}',
    pattern: /^alerts\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['alert']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 11,
    template: 'inbox/{mid}/{read,ack}',
    pattern: /^inbox\/([A-Za-z0-9._-]+)\/(read|ack)$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 12,
    template: 'settings/{key}',
    pattern: /^settings\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['textbox', 'combobox', 'checkbox', 'switch', 'spinbutton', 'button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 12,
    template: 'dialog/{id}/{action}',
    pattern: /^dialog\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/,
    allowedRoles: Object.freeze(['button', 'dialog']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 13,
    template: 'output/{sid}/text',
    pattern: /^output\/([A-Za-z0-9._-]+)\/text$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 13,
    template: 'about/licences',
    pattern: /^about\/licences$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 13,
    template: 'assistant/disclosure',
    pattern: /^assistant\/disclosure$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
]);

/**
 * The 13 normative control-family rows from UI_ARCHITECTURE.md §9.
 */
export const CONTROL_FAMILY_INVENTORY = Object.freeze([
  Object.freeze({
    row: 1,
    templates: Object.freeze(['shell/fullscreen', 'shell/navigation/{id}']),
    roles: Object.freeze(['button', 'tab']),
  }),
  Object.freeze({
    row: 2,
    templates: Object.freeze(['capsule/{id}/panel', 'capsule/{id}/tab']),
    roles: Object.freeze(['region', 'tab']),
  }),
  Object.freeze({
    row: 3,
    templates: Object.freeze(['capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}']),
    roles: Object.freeze(['button']),
  }),
  Object.freeze({
    row: 4,
    templates: Object.freeze(['workspace/separator/{id}']),
    roles: Object.freeze(['separator']),
  }),
  Object.freeze({
    row: 5,
    templates: Object.freeze(['capsule/{id}/slot', 'capsule/{id}/session/{sid}/tab']),
    roles: Object.freeze(['region', 'tab']),
  }),
  Object.freeze({
    row: 6,
    templates: Object.freeze(['session/{sid}/{attach,stop,replay,target}', 'terminal/launcher', 'terminal/launch/{shell,pi,claude,codex}', 'terminal/session/{sid}/{tab,close}', 'terminal/composer', 'terminal/composer/send']),
    roles: Object.freeze(['button']),
  }),
  Object.freeze({
    row: 7,
    templates: Object.freeze(['drawer/toggle', 'drawer/maximize', 'drawer/composer', 'drawer/send']),
    roles: Object.freeze(['button', 'textbox']),
  }),
  Object.freeze({
    row: 8,
    templates: Object.freeze(['drawer/targets/{sid}', 'drawer/targets/all', 'drawer/targets/clear']),
    roles: Object.freeze(['checkbox', 'button']),
  }),
  Object.freeze({
    row: 9,
    templates: Object.freeze(['dispatch/{did}/target/{sid}/{result,retry,cancel}']),
    roles: Object.freeze(['region', 'button']),
  }),
  Object.freeze({
    row: 10,
    templates: Object.freeze(['fleet/{id}/row', 'inspector/{id}/field']),
    roles: Object.freeze(['row', 'region', 'group', 'definition']),
  }),
  Object.freeze({
    row: 11,
    templates: Object.freeze(['alerts/{aid}', 'inbox/{mid}/{read,ack}']),
    roles: Object.freeze(['alert', 'button']),
  }),
  Object.freeze({
    row: 12,
    templates: Object.freeze(['settings/{key}', 'dialog/{id}/{action}']),
    roles: Object.freeze(['textbox', 'combobox', 'checkbox', 'switch', 'spinbutton', 'button', 'dialog']),
  }),
  Object.freeze({
    row: 13,
    templates: Object.freeze(['output/{sid}/text', 'about/licences', 'assistant/disclosure']),
    roles: Object.freeze(['region', 'button']),
  }),
]);

/**
 * Matches a concrete semantic anchor against the allowed §9 control-family inventory.
 * @param {string} semanticAnchor
 * @returns {ControlFamilyRule | null}
 */
export function matchControlFamily(semanticAnchor) {
  if (typeof semanticAnchor !== 'string' || semanticAnchor.length === 0) {
    return null;
  }
  for (const rule of FAMILY_RULES) {
    const match = rule.pattern.exec(semanticAnchor);
    if (match) {
      for (let i = 1; i < match.length; i += 1) {
        if (/^\d+$/.test(match[i] ?? "")) {
          return null;
        }
      }
      return rule;
    }
  }
  return null;
}

/**
 * Validates and normalizes a content-window CSS box.
 * Boxes use rounded content-window CSS pixels with content-framebuffer origin;
 * hidden, unmaterialized, off-DOM, or synthetic nodes must have a null box.
 * @param {ControlRegistrationInput} input
 * @returns {ControlBox | null}
 */
function normalizeControlBox(input) {
  const visible = input.visible !== false;
  const materialized = input.materialized !== false;
  const inDom = input.inDom !== false;
  const synthetic = input.synthetic === true;
  const space = input.coordinateSpace ?? 'content-window';

  if (space !== 'content-window') {
    throw registryError(
      'ERR_INVALID_BOX_SPACE',
      `Boxes must use content-window CSS pixels, received coordinateSpace="${space}"`
    );
  }

  const canHaveBox = visible && materialized && inDom && !synthetic;
  if (!canHaveBox) {
    if (input.box !== null && input.box !== undefined) {
      throw registryError(
        'ERR_FABRICATED_BOX',
        `Control "${input.semanticAnchor}" is hidden/off-DOM/synthetic and must not supply a fabricated box`
      );
    }
    return null;
  }

  if (input.box === null || input.box === undefined) {
    return null;
  }

  const { x, y, width, height } = input.box;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw registryError('ERR_INVALID_BOX', `Box coordinates for "${input.semanticAnchor}" must be finite numbers`);
  }

  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);
  if (roundedWidth <= 0 || roundedHeight <= 0) {
    throw registryError(
      'ERR_INVALID_BOX',
      `Materialized visible box for "${input.semanticAnchor}" must have positive rounded width and height`
    );
  }

  return Object.freeze({
    x: Math.round(x),
    y: Math.round(y),
    width: roundedWidth,
    height: roundedHeight,
  });
}

/**
 * Validates a reviewed lane producer contract.
 * Bare Electron is absent from the inspected peer enum (UI_ARCHITECTURE §9, WEB:513).
 * @param {ReviewedProducerContract | null | undefined} producer
 * @param {boolean} retailMode
 * @returns {ReviewedProducerContract}
 */
function assertReviewedProducer(producer, retailMode) {
  if (retailMode) {
    throw registryError(
      'ERR_RETAIL_EXPORT_FORBIDDEN',
      'Retail build forbids automated semantic export or agent lane endpoints'
    );
  }
  if (
    !producer ||
    typeof producer !== 'object' ||
    producer.reviewed !== true ||
    typeof producer.contractId !== 'string' ||
    producer.contractId.trim().length === 0 ||
    typeof producer.peer !== 'string' ||
    producer.peer.trim().length === 0 ||
    producer.peer.trim().toLowerCase() === 'electron' ||
    typeof producer.mapStableId !== 'function'
  ) {
    throw registryError(
      'ERR_LANE_PRODUCER_BLOCKED',
      'Direct semantic export is BLOCKED without a reviewed non-bare-Electron lane producer contract'
    );
  }
  return producer;
}

/**
 * Deeply clones and freezes plain state objects to prevent mutable aliasing (UI_ARCHITECTURE §4).
 * @template T
 * @param {T} value
 * @returns {T}
 */
function cloneAndFreeze(value) {
  const cloned = structuredClone(value);
  return deepFreeze(cloned);
}

/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const prop = /** @type {Record<string, unknown>} */ (obj)[key];
      if (prop && typeof prop === 'object' && !Object.isFrozen(prop)) {
        deepFreeze(prop);
      }
    }
  }
  return obj;
}

/**
 * Serializes any JSON-compatible value into deterministic canonical JSON
 * (sorted object keys, compact separators, no whitespace/newlines).
 * When options.nullBoxes is true, replaces every `node.box` with `null` while leaving
 * every other field untouched (UI_ARCHITECTURE §9 battery digest law).
 * @param {unknown} state
 * @param {{ nullBoxes?: boolean }} [options]
 * @returns {string}
 */
export function canonicalizeStateJson(state, options = {}) {
  const nullBoxes = options.nullBoxes === true;
  const prepared = structuredClone(state);
  if (
    nullBoxes &&
    prepared &&
    typeof prepared === 'object' &&
    Array.isArray(/** @type {{ nodes?: unknown[] }} */ (prepared).nodes)
  ) {
    for (const node of /** @type {{ nodes: Array<Record<string, unknown>> }} */ (prepared).nodes) {
      if (node && typeof node === 'object' && 'box' in node) {
        node.box = null;
      }
    }
  }
  return stringifyCanonical(prepared);
}

/**
 * @param {unknown} val
 * @returns {string}
 */
function stringifyCanonical(val) {
  if (val === null || typeof val === 'boolean' || typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      throw registryError('ERR_NON_FINITE_NUMBER', 'Canonical JSON cannot serialize non-finite numbers');
    }
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => stringifyCanonical(item)).join(',')}]`;
  }
  if (val && typeof val === 'object') {
    const record = /** @type {Record<string, unknown>} */ (val);
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stringifyCanonical(record[k])}`);
    return `{${pairs.join(',')}}`;
  }
  throw registryError('ERR_UNSUPPORTED_JSON_VALUE', `Unsupported value type in canonical state: ${typeof val}`);
}

/**
 * Computes both the geometry-free `batteryDigest` (every `node.box` replaced with `null`,
 * no other field removed or changed) and the `frameBindingDigest` (boxes preserved).
 * @param {Record<string, unknown>} canonicalState
 * @returns {{
 *   batteryDigest: string,
 *   frameBindingDigest: string,
 *   geometryFreeCanonicalJson: string,
 *   frameCanonicalJson: string
 * }}
 */
export function computeStateDigests(canonicalState) {
  if (!canonicalState || typeof canonicalState !== 'object' || !Array.isArray(canonicalState.nodes)) {
    throw registryError('ERR_INVALID_STATE', 'Canonical state must be an object containing a nodes array');
  }
  const geometryFreeCanonicalJson = canonicalizeStateJson(canonicalState, { nullBoxes: true });
  const frameCanonicalJson = canonicalizeStateJson(canonicalState, { nullBoxes: false });
  const batteryDigest = sha256(geometryFreeCanonicalJson);
  const frameBindingDigest = sha256(frameCanonicalJson);

  return Object.freeze({
    batteryDigest,
    frameBindingDigest,
    geometryFreeCanonicalJson,
    frameCanonicalJson,
  });
}

/**
 * Validates a closed native agent_lane frame per UI_ARCHITECTURE.md §9:
 * - Exact frame keys: `nonce,seq,verb,body`
 * - `verb` in `['observe', 'submit']`; unknown keys reject
 * - For `submit` (T2), `body` has exact keys `tick,seq,cmd,args`
 * @param {unknown} frame
 * @returns {{ ok: true, verb: 'observe' | 'submit' }}
 */
export function validateAgentLaneFrame(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
    throw registryError('ERR_INVALID_LANE_FRAME', 'Agent lane frame must be a plain object');
  }
  const frameObj = /** @type {Record<string, unknown>} */ (frame);
  const keys = Object.keys(frameObj).sort();
  if (keys.join(',') !== 'body,nonce,seq,verb') {
    throw registryError(
      'ERR_INVALID_LANE_FRAME',
      `Agent lane frame must have exact keys [nonce,seq,verb,body], got [${keys.join(',')}]`
    );
  }
  if (typeof frameObj.nonce !== 'string' || frameObj.nonce.trim().length === 0) {
    throw registryError('ERR_INVALID_LANE_FRAME', 'Frame nonce must be a non-empty string');
  }
  assertSafeNonNegativeInt(frameObj.seq, 'frame.seq', 'ERR_INVALID_LANE_FRAME');

  const verb = frameObj.verb;
  if (verb !== 'observe' && verb !== 'submit') {
    throw registryError('ERR_INVALID_LANE_FRAME', `Unsupported agent lane verb "${String(verb)}"`);
  }

  const body = frameObj.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw registryError('ERR_INVALID_LANE_FRAME', 'Frame body must be a plain object');
  }

  if (verb === 'submit') {
    const bodyObj = /** @type {Record<string, unknown>} */ (body);
    const bodyKeys = Object.keys(bodyObj).sort();
    if (bodyKeys.join(',') !== 'args,cmd,seq,tick') {
      throw registryError(
        'ERR_INVALID_LANE_FRAME',
        `T2 submit body must have exact keys [tick,seq,cmd,args], got [${bodyKeys.join(',')}]`
      );
    }
    assertSafeNonNegativeInt(bodyObj.tick, 'body.tick', 'ERR_INVALID_LANE_FRAME');
    assertSafeNonNegativeInt(bodyObj.seq, 'body.seq', 'ERR_INVALID_LANE_FRAME');
    if (typeof bodyObj.cmd !== 'string' || bodyObj.cmd.trim().length === 0) {
      throw registryError('ERR_INVALID_LANE_FRAME', 'T2 submit body.cmd must be a non-empty string');
    }
    if (!bodyObj.args || typeof bodyObj.args !== 'object' || Array.isArray(bodyObj.args)) {
      throw registryError('ERR_INVALID_LANE_FRAME', 'T2 submit body.args must be a plain object');
    }
  }

  return Object.freeze({ ok: true, verb });
}

/**
 * Creates a window-scoped semantic control registry enforcing UI_ARCHITECTURE.md §9 & §13 invariants.
 * @param {{
 *   windowId: string,
 *   epoch: number,
 *   generation?: number,
 *   reviewedProducer?: ReviewedProducerContract | null,
 *   retailMode?: boolean
 * }} config
 */
export function createControlRegistry(config) {
  if (!config || typeof config !== 'object') {
    throw registryError('ERR_INVALID_CONFIG', 'Registry configuration is required');
  }

  const windowId = assertImmutableId(config.windowId, 'windowId');
  let currentEpoch = assertSafeNonNegativeInt(config.epoch, 'epoch', 'ERR_STALE_EPOCH');
  let currentGeneration = assertSafeNonNegativeInt(config.generation ?? 1, 'generation');
  const retailMode = config.retailMode === true;
  const reviewedProducer = config.reviewedProducer ?? null;

  /** @type {Map<string, RegisteredControlRecord>} */
  const byTupleKey = new Map();
  /** @type {Map<string, RegisteredControlRecord>} */
  const byScopedAnchor = new Map();
  /** @type {Array<{ dialogId: string, invokerAnchor: string }>} */
  const modalStack = [];
  /** @type {string | null} */
  let invalidationReason = null;

  /**
   * Validates and registers a control entry.
   * Rejects stale epochs, tuple/anchor collisions, UI-synthesized stable IDs,
   * unknown control families, fabricated hidden boxes, and zero-coerced unknown values.
   * @param {ControlRegistrationInput} input
   * @returns {RegisteredControlRecord}
   */
  function register(input) {
    if (!input || typeof input !== 'object') {
      throw registryError('ERR_INVALID_CONTROL', 'Control registration input must be an object');
    }
    if (retailMode) {
      throw registryError('ERR_RETAIL_EXPORT_FORBIDDEN', 'Retail build does not admit agent control registration');
    }
    if ('stableId' in input && input.stableId !== undefined) {
      throw registryError(
        'ERR_UI_STABLE_ID_FORBIDDEN',
        'UI must not synthesize lane stableId wire suffixes; only the reviewed producer may map stable identities'
      );
    }

    const entryEpoch = assertSafeNonNegativeInt(input.epoch, 'entry.epoch', 'ERR_STALE_EPOCH');
    if (entryEpoch !== currentEpoch) {
      throw registryError(
        'ERR_STALE_EPOCH',
        `Control "${input.semanticAnchor}" epoch (${entryEpoch}) does not match active window epoch (${currentEpoch})`
      );
    }

    const entryGeneration = assertSafeNonNegativeInt(
      input.generation ?? currentGeneration,
      'entry.generation'
    );

    const familyRule = matchControlFamily(input.semanticAnchor);
    if (!familyRule) {
      throw registryError(
        'ERR_UNKNOWN_CONTROL_FAMILY',
        `Semantic anchor "${String(input.semanticAnchor)}" is not admitted by the §9 control-family inventory`
      );
    }

    if (typeof input.role !== 'string' || !familyRule.allowedRoles.includes(input.role)) {
      throw registryError(
        'ERR_INVALID_ROLE',
        `Role "${String(input.role)}" is not allowed for family "${familyRule.template}"`
      );
    }

    if (typeof input.accessibleName !== 'string' || input.accessibleName.trim().length === 0) {
      throw registryError(
        'ERR_INVALID_ACCESSIBLE_NAME',
        `Control "${input.semanticAnchor}" must have a non-empty computed accessibleName`
      );
    }

    const entityId = assertImmutableId(input.entityId, 'entityId');
    const presentationInstance = assertImmutableId(input.presentationInstance, 'presentationInstance');
    const controlSlot = assertImmutableId(input.controlSlot, 'controlSlot');

    /** @type {Readonly<Record<string, unknown>>} */
    const state = input.state ? cloneAndFreeze(input.state) : Object.freeze({});
    if (familyRule.requiresReasonWhenDisabled && state.disabled === true) {
      const reason = state.unavailableReason;
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        throw registryError(
          'ERR_MISSING_UNAVAILABLE_REASON',
          `Disabled capsule control "${input.semanticAnchor}" must explain unavailableReason`
        );
      }
    }

    if (familyRule.forbidsZeroWhenUnknown) {
      if (state.valueKnown === false && state.value === 0) {
        throw registryError(
          'ERR_UNKNOWN_VALUE_ZERO',
          `Control "${input.semanticAnchor}" must omit or mark unknown values unavailable, never coerce to zero`
        );
      }
    }

    const tupleKey = `${windowId}::${presentationInstance}::${entityId}::${controlSlot}`;
    const scopedAnchorKey = `${windowId}::${presentationInstance}::${input.semanticAnchor}`;

    if (byTupleKey.has(tupleKey) || byScopedAnchor.has(scopedAnchorKey)) {
      throw registryError(
        'ERR_CONTROL_COLLISION',
        `Collision detected for tuple "${tupleKey}" or anchor "${scopedAnchorKey}"`
      );
    }

    const box = normalizeControlBox(input);

    let stableId = null;
    if (reviewedProducer && reviewedProducer.reviewed === true) {
      const validatedProducer = assertReviewedProducer(reviewedProducer, retailMode);
      stableId = validatedProducer.mapStableId({
        semanticAnchor: input.semanticAnchor,
        windowId,
        presentationInstance,
        entityId,
        controlSlot,
        epoch: entryEpoch,
        generation: entryGeneration,
      });
    }

    /** @type {RegisteredControlRecord} */
    const record = Object.freeze({
      semanticAnchor: input.semanticAnchor,
      familyTemplate: familyRule.template,
      windowId,
      entityId,
      presentationInstance,
      controlSlot,
      tupleKey,
      role: input.role,
      accessibleName: input.accessibleName.trim(),
      state,
      visible: input.visible !== false,
      materialized: input.materialized !== false,
      inDom: input.inDom !== false,
      synthetic: input.synthetic === true,
      box,
      epoch: entryEpoch,
      generation: entryGeneration,
      stableId,
    });

    byTupleKey.set(tupleKey, record);
    byScopedAnchor.set(scopedAnchorKey, record);
    return record;
  }

  /**
   * Advances the registry epoch monotonically.
   * Existing entries from older epochs become stale and fail resolution/export until revalidated.
   * @param {number} nextEpoch
   * @param {number} [nextGeneration]
   */
  function advanceEpoch(nextEpoch, nextGeneration = currentGeneration) {
    const validatedEpoch = assertSafeNonNegativeInt(nextEpoch, 'nextEpoch', 'ERR_STALE_EPOCH');
    if (validatedEpoch <= currentEpoch) {
      throw registryError(
        'ERR_STALE_EPOCH',
        `Next epoch (${validatedEpoch}) must be strictly greater than current epoch (${currentEpoch})`
      );
    }
    currentEpoch = validatedEpoch;
    currentGeneration = assertSafeNonNegativeInt(nextGeneration, 'nextGeneration');
  }

  /**
   * Marks the registry as requiring revalidation after sort, scroll, modal, layout, theme, zoom or scale.
   * @param {'sort' | 'scroll' | 'modal' | 'layout' | 'theme' | 'zoom' | 'scale'} reason
   */
  function markNeedsRevalidation(reason) {
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw registryError('ERR_INVALID_REASON', 'Revalidation reason must be a non-empty string');
    }
    invalidationReason = reason;
  }

  /**
   * Revalidates a registered control under the current epoch and geometry.
   * @param {ControlRegistrationInput} input
   * @returns {RegisteredControlRecord}
   */
  function revalidateControl(input) {
    const entityId = assertImmutableId(input.entityId, 'entityId');
    const presentationInstance = assertImmutableId(input.presentationInstance, 'presentationInstance');
    const controlSlot = assertImmutableId(input.controlSlot, 'controlSlot');
    const tupleKey = `${windowId}::${presentationInstance}::${entityId}::${controlSlot}`;
    const scopedAnchorKey = `${windowId}::${presentationInstance}::${input.semanticAnchor}`;

    byTupleKey.delete(tupleKey);
    byScopedAnchor.delete(scopedAnchorKey);
    const updated = register(input);

    let allCurrent = true;
    for (const entry of byTupleKey.values()) {
      if (entry.epoch !== currentEpoch) {
        allCurrent = false;
        break;
      }
    }
    if (allCurrent) {
      invalidationReason = null;
    }
    return updated;
  }

  /**
   * Enters an active modal scope; background controls outside `dialog/{dialogId}/*` become inert.
   * @param {string} dialogId
   * @param {string} invokerAnchor
   */
  function enterModalScope(dialogId, invokerAnchor) {
    const validDialogId = assertImmutableId(dialogId, 'dialogId');
    if (typeof invokerAnchor !== 'string' || !matchControlFamily(invokerAnchor)) {
      throw registryError('ERR_INVALID_INVOKER', `Modal invoker "${String(invokerAnchor)}" must be a valid semantic anchor`);
    }
    modalStack.push({ dialogId: validDialogId, invokerAnchor });
  }

  /**
   * Exits the top modal scope and returns the invoker semantic anchor for focus restoration.
   * @param {string} dialogId
   * @returns {string}
   */
  function exitModalScope(dialogId) {
    if (modalStack.length === 0) {
      throw registryError('ERR_MODAL_SCOPE_MISMATCH', 'No active modal scope to exit');
    }
    const top = modalStack[modalStack.length - 1];
    if (!top) throw registryError('ERR_MODAL_SCOPE_MISMATCH', 'Modal stack empty');
    if (top.dialogId !== dialogId) {
      throw registryError(
        'ERR_MODAL_SCOPE_MISMATCH',
        `Active modal "${top.dialogId}" does not match exit request "${dialogId}"`
      );
    }
    modalStack.pop();
    return top.invokerAnchor;
  }

  /**
   * Resolves a single unambiguous actionable target by semantic anchor (and optional presentationInstance).
   * Refuses if needs revalidation, stale epoch, unknown/ambiguous, hidden/off-DOM/null-box, or blocked by active modal.
   * @param {string} semanticAnchor
   * @param {string} [presentationInstance]
   * @returns {RegisteredControlRecord}
   */
  function resolveActionableTarget(semanticAnchor, presentationInstance) {
    if (invalidationReason !== null) {
      throw registryError(
        'ERR_REVALIDATION_REQUIRED',
        `Controls require revalidation after "${invalidationReason}" before resolving actionable targets`
      );
    }

    /** @type {RegisteredControlRecord[]} */
    const matches = [];
    for (const record of byTupleKey.values()) {
      if (record.semanticAnchor === semanticAnchor) {
        if (presentationInstance === undefined || record.presentationInstance === presentationInstance) {
          matches.push(record);
        }
      }
    }

    if (matches.length === 0) {
      throw registryError('ERR_UNKNOWN_TARGET', `Unknown semantic target "${semanticAnchor}"`);
    }
    if (matches.length > 1) {
      throw registryError(
        'ERR_AMBIGUOUS_TARGET',
        `Ambiguous semantic target "${semanticAnchor}" across ${matches.length} presentation instances`
      );
    }

    const target = matches[0];
    if (!target) throw registryError('ERR_UNKNOWN_TARGET', 'Target missing');
    if (target.epoch !== currentEpoch) {
      throw registryError(
        'ERR_STALE_EPOCH',
        `Target "${semanticAnchor}" belongs to stale epoch ${target.epoch} (active epoch is ${currentEpoch})`
      );
    }

    if (modalStack.length > 0) {
      const activeModal = modalStack[modalStack.length - 1];
      if (!activeModal) throw registryError('ERR_MODAL_SCOPE_MISMATCH', 'Modal stack empty');
      const prefix = `dialog/${activeModal.dialogId}/`;
      if (!target.semanticAnchor.startsWith(prefix)) {
        throw registryError(
          'ERR_MODAL_BACKGROUND_INERT',
          `Target "${semanticAnchor}" is inert in background while modal "${activeModal.dialogId}" is active`
        );
      }
    }

    if (!target.visible || !target.materialized || !target.inDom || target.synthetic || target.box === null) {
      throw registryError(
        'ERR_TARGET_NOT_ACTIONABLE',
        `Target "${semanticAnchor}" is off-DOM, hidden, unmaterialized, or lacks a visible box`
      );
    }

    if (target.state.disabled === true) {
      throw registryError(
        'ERR_TARGET_DISABLED',
        `Target "${semanticAnchor}" is disabled${target.state.unavailableReason ? `: ${String(target.state.unavailableReason)}` : ''}`
      );
    }

    return target;
  }

  /**
   * Exports the complete canonical STATE snapshot via the reviewed lane producer contract.
   * Refuses if producer is absent/unreviewed, retailMode is active, revalidation is pending,
   * or any registered record has a stale epoch.
   * @returns {{
   *   schema: 'capsule-ui-kit.semantic-state/v1',
   *   windowId: string,
   *   epoch: number,
   *   generation: number,
   *   producerContractId: string,
   *   producerPeer: string,
   *   activeModalId: string | null,
   *   nodes: readonly RegisteredControlRecord[]
   * }}
   */
  function exportCanonicalState() {
    const validatedProducer = assertReviewedProducer(reviewedProducer, retailMode);

    if (invalidationReason !== null) {
      throw registryError(
        'ERR_REVALIDATION_REQUIRED',
        `Cannot export canonical state while "${invalidationReason}" revalidation is pending`
      );
    }

    /** @type {RegisteredControlRecord[]} */
    const nodes = [];
    for (const record of byTupleKey.values()) {
      if (record.epoch !== currentEpoch) {
        throw registryError(
          'ERR_STALE_EPOCH',
          `Cannot export canonical state: control "${record.semanticAnchor}" has stale epoch ${record.epoch} !== ${currentEpoch}`
        );
      }
      nodes.push(record);
    }

    nodes.sort((a, b) => (a.tupleKey < b.tupleKey ? -1 : a.tupleKey > b.tupleKey ? 1 : 0));

    return Object.freeze({
      schema: 'capsule-ui-kit.semantic-state/v1',
      windowId,
      epoch: currentEpoch,
      generation: currentGeneration,
      producerContractId: validatedProducer.contractId,
      producerPeer: validatedProducer.peer,
      activeModalId: modalStack.length > 0 ? (modalStack[modalStack.length - 1]?.dialogId ?? null) : null,
      nodes: Object.freeze(nodes),
    });
  }

  return Object.freeze({
    get windowId() {
      return windowId;
    },
    get epoch() {
      return currentEpoch;
    },
    get generation() {
      return currentGeneration;
    },
    register,
    advanceEpoch,
    markNeedsRevalidation,
    revalidateControl,
    enterModalScope,
    exitModalScope,
    resolveActionableTarget,
    exportCanonicalState,
  });
}
