/**
 * @file Fleet overview model: kinds, states, validators, formatters, selection and intent builders.
 * Generic presentation model for a capsule census (table plus compact cards) with
 * selection, an inspector slot and bulk intents. Every value is host-supplied
 * through props; unknown or unavailable data renders as such and is never coerced
 * to zero. The overview emits intents only; the kit never folds, hides or stops
 * capsules itself and never writes disk, network or clipboard.
 * Plain JavaScript ES module with JSDoc types; no framework imports, no product names.
 * @module fleet/fleetModel
 */

/**
 * Per-capsule states on the fleet surface. Aligned with the capsule health board
 * states so both lanes name the same lifecycle the same way.
 * @type {ReadonlyArray<string>}
 */
export const FLEET_CAPSULE_STATES = Object.freeze(['ready', 'starting', 'lost', 'error', 'stopped']);

/**
 * Capsule kinds on the fleet surface (contract enums).
 * @type {ReadonlyArray<string>}
 */
export const FLEET_CAPSULE_KINDS = Object.freeze([
  'browser',
  'desktop',
  'microvm',
  'identity_browser',
  'game_capsule',
  'terminal',
]);

/**
 * Visible labels for the capsule kinds.
 * @type {Readonly<Record<string, string>>}
 */
export const FLEET_KIND_LABELS = Object.freeze({
  browser: 'Browser',
  desktop: 'Desktop Program',
  microvm: 'VM',
  identity_browser: 'Identity Browser',
  game_capsule: 'Game Capsule',
  terminal: 'Terminal',
});

/**
 * Operator input modes on the fleet surface (projected by the host).
 * @type {ReadonlyArray<string>}
 */
export const FLEET_INPUT_MODES = Object.freeze(['read', 'write']);

/**
 * Visible labels for the operator input modes.
 * @type {Readonly<Record<string, string>>}
 */
export const FLEET_INPUT_MODE_LABELS = Object.freeze({
  read: 'READ',
  write: 'WRITE',
});

/**
 * Layouts of the census: full table or compact cards.
 * @type {ReadonlyArray<string>}
 */
export const FLEET_LAYOUTS = Object.freeze(['table', 'cards']);

/**
 * Display text for a value the host did not supply.
 * @type {string}
 */
export const FLEET_UNKNOWN_TEXT = 'unknown';

/**
 * Visible label for an unknown capsule kind.
 * @type {string}
 */
export const FLEET_UNKNOWN_KIND_LABEL = 'Unknown';

/**
 * Empty-census text.
 * @type {string}
 */
export const FLEET_EMPTY_TEXT = 'No capsules.';

/**
 * Empty-inspector text (default slot fallback).
 * @type {string}
 */
export const FLEET_INSPECTOR_EMPTY_TEXT = 'No capsule selected.';

/**
 * Reason carried by the bulk bar while the selection is empty.
 * @type {string}
 */
export const FLEET_BULK_EMPTY_REASON = 'No capsules selected.';

/**
 * Intent type toggling selection of one capsule.
 * @type {string}
 */
export const FLEET_SELECT_INTENT = 'fleet-select';

/**
 * Bulk intent type requesting the host fold the selected capsules.
 * @type {string}
 */
export const FLEET_FOLD_INTENT = 'fleet-fold';

/**
 * Bulk intent type requesting the host hide the selected capsules.
 * @type {string}
 */
export const FLEET_HIDE_INTENT = 'fleet-hide';

/**
 * Bulk intent type requesting the host stop the selected capsules.
 * @type {string}
 */
export const FLEET_STOP_INTENT = 'fleet-stop';

/**
 * Bulk intent vocabulary of the fleet bar.
 * @type {ReadonlyArray<string>}
 */
export const FLEET_BULK_INTENTS = Object.freeze([FLEET_FOLD_INTENT, FLEET_HIDE_INTENT, FLEET_STOP_INTENT]);

/**
 * Event names emitted by the fleet components.
 * @type {ReadonlyArray<string>}
 */
export const FLEET_BOARD_EMITS = Object.freeze(['submit-intent']);

/**
 * Stable DOM id of the bulk fold button.
 * @type {string}
 */
export const FLEET_BULK_FOLD_DOM_ID = 'cuk-fleet-bulk-fold';

/**
 * Semantic anchor of the bulk fold button.
 * @type {string}
 */
export const FLEET_BULK_FOLD_ANCHOR = 'dialog/fleet-bulk/fold';

/**
 * Accessible name of the bulk fold button.
 * @type {string}
 */
export const FLEET_BULK_FOLD_ACCESSIBLE_NAME = 'Fold selected capsules.';

/**
 * Stable DOM id of the bulk hide button.
 * @type {string}
 */
export const FLEET_BULK_HIDE_DOM_ID = 'cuk-fleet-bulk-hide';

/**
 * Semantic anchor of the bulk hide button.
 * @type {string}
 */
export const FLEET_BULK_HIDE_ANCHOR = 'dialog/fleet-bulk/hide';

/**
 * Accessible name of the bulk hide button.
 * @type {string}
 */
export const FLEET_BULK_HIDE_ACCESSIBLE_NAME = 'Hide selected capsules.';

/**
 * Stable DOM id of the bulk stop button.
 * @type {string}
 */
export const FLEET_BULK_STOP_DOM_ID = 'cuk-fleet-bulk-stop';

/**
 * Semantic anchor of the bulk stop button.
 * @type {string}
 */
export const FLEET_BULK_STOP_ANCHOR = 'dialog/fleet-bulk/stop';

/**
 * Accessible name of the bulk stop button.
 * @type {string}
 */
export const FLEET_BULK_STOP_ACCESSIBLE_NAME = 'Stop selected capsules.';

/**
 * @typedef {Object} FleetResource
 * @property {string} key - Stable resource key.
 * @property {string} label - Visible resource label.
 * @property {unknown} value - Host-supplied value (number, string, null or undefined).
 * @property {string} unit - Unit suffix, empty when none.
 */

/**
 * @typedef {Object} FleetCapsule
 * @property {string} id - Capsule identity (`unknown` when the host id is invalid).
 * @property {string} label - Visible capsule label (falls back to the id).
 * @property {string} kind - Known capsule kind or `unknown`.
 * @property {string} state - Known capsule state or `unknown`.
 * @property {string|null} owner - Owning operator or agent, null when the host gave none.
 * @property {string} inputMode - Known input mode or `unknown`.
 * @property {readonly FleetResource[]} resources - Normalized host resources.
 * @property {number|null} uptimeSeconds - Host uptime in seconds, null when unknown.
 * @property {string|null} sessionId - Attached session, null when none.
 * @property {number|null} epoch - Projection epoch, null when unknown.
 */

/**
 * Whether a value is a usable entity identity: a non-empty anchor token that is
 * never a bare numeric index (registry identities are immutable, never list positions).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFleetEntityId(value) {
  return (
    typeof value === 'string'
    && /^[A-Za-z0-9._-]+$/.test(value)
    && !/^\d+$/.test(value)
  );
}

/**
 * @param {unknown} value
 * @returns {string} Known capsule state, or `unknown`.
 */
export function normalizeFleetCapsuleState(value) {
  return FLEET_CAPSULE_STATES.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : FLEET_UNKNOWN_TEXT;
}

/**
 * @param {unknown} state
 * @returns {string} Pill tone for a capsule state (`neutral` when unknown).
 */
export function fleetStateTone(state) {
  switch (normalizeFleetCapsuleState(state)) {
    case 'ready': return 'success';
    case 'starting': return 'info';
    case 'lost': return 'warning';
    case 'error': return 'error';
    default: return 'neutral';
  }
}

/**
 * @param {unknown} value
 * @returns {string} Known capsule kind, or `unknown`.
 */
export function normalizeFleetCapsuleKind(value) {
  return FLEET_CAPSULE_KINDS.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : FLEET_UNKNOWN_TEXT;
}

/**
 * @param {unknown} value
 * @returns {string} Visible kind label (`Unknown` when the kind is unknown).
 */
export function fleetKindLabel(value) {
  const kind = normalizeFleetCapsuleKind(value);
  return kind === FLEET_UNKNOWN_TEXT ? FLEET_UNKNOWN_KIND_LABEL : FLEET_KIND_LABELS[kind];
}

/**
 * @param {unknown} value
 * @returns {string} Known input mode, or `unknown` (never invented).
 */
export function normalizeFleetInputMode(value) {
  return FLEET_INPUT_MODES.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : FLEET_UNKNOWN_TEXT;
}

/**
 * @param {unknown} value
 * @returns {string} Visible input-mode label (`unknown` when the mode is unknown).
 */
export function fleetInputModeLabel(value) {
  const mode = normalizeFleetInputMode(value);
  return mode === FLEET_UNKNOWN_TEXT ? FLEET_UNKNOWN_TEXT : FLEET_INPUT_MODE_LABELS[mode];
}

/**
 * @param {unknown} value
 * @returns {string} Known census layout, or `table`.
 */
export function normalizeFleetLayout(value) {
  return FLEET_LAYOUTS.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : 'table';
}

/**
 * Normalizes one host resource record. Never throws on plain input.
 * @param {unknown} raw
 * @returns {FleetResource} Frozen normalized resource.
 */
export function normalizeFleetResource(raw) {
  const input = raw !== null && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const key = typeof input.key === 'string' && input.key.trim().length > 0
    ? input.key.trim()
    : FLEET_UNKNOWN_TEXT;
  const label = typeof input.label === 'string' && input.label.trim().length > 0
    ? input.label.trim()
    : key;
  const value = Object.prototype.hasOwnProperty.call(input, 'value') ? input.value : null;
  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
  return Object.freeze({ key, label, value, unit });
}

/**
 * Formats one host-supplied resource value. Genuine zeros render as `0`; missing or
 * non-finite values render as `unknown`, never as a faked zero.
 * @param {unknown} value - Host-supplied value.
 * @param {string} [unit] - Unit suffix appended to known values only.
 * @returns {string} Display text.
 */
export function formatFleetResourceValue(value, unit = '') {
  const suffix = typeof unit === 'string' && unit.trim().length > 0 ? ` ${unit.trim()}` : '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}${suffix}` : FLEET_UNKNOWN_TEXT;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? `${value.trim()}${suffix}` : FLEET_UNKNOWN_TEXT;
  }
  return FLEET_UNKNOWN_TEXT;
}

/**
 * Formats a host-supplied uptime in seconds. Genuine zero renders as `0s`; missing,
 * non-finite or negative values render as `unknown`, never as a faked zero.
 * @param {unknown} seconds - Host-supplied uptime in seconds.
 * @returns {string} Compact duration (`2d 4h`, `3h 12m`, `5m 30s`, `45s`) or `unknown`.
 */
export function formatFleetUptime(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return FLEET_UNKNOWN_TEXT;
  }
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }
  return `${rest}s`;
}

/**
 * Normalizes one host capsule record. Never throws on plain input; invalid ids,
 * kinds, states and modes fall back to `unknown` so the census renders honestly
 * instead of crashing.
 * @param {unknown} raw
 * @returns {FleetCapsule} Frozen normalized capsule.
 */
export function normalizeFleetCapsule(raw) {
  const input = raw !== null && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const id = isFleetEntityId(input.id) ? /** @type {string} */ (input.id) : FLEET_UNKNOWN_TEXT;
  const label = typeof input.label === 'string' && input.label.trim().length > 0
    ? input.label.trim()
    : id;
  const kind = normalizeFleetCapsuleKind(input.kind);
  const state = normalizeFleetCapsuleState(input.state);
  const owner = typeof input.owner === 'string' && input.owner.trim().length > 0
    ? input.owner.trim()
    : null;
  const inputMode = normalizeFleetInputMode(input.inputMode);
  const resources = Array.isArray(input.resources)
    ? Object.freeze(input.resources.map(normalizeFleetResource))
    : Object.freeze([]);
  const uptimeSeconds = typeof input.uptimeSeconds === 'number'
    && Number.isFinite(input.uptimeSeconds)
    && input.uptimeSeconds >= 0
    ? input.uptimeSeconds
    : null;
  const sessionId = isFleetEntityId(input.sessionId)
    ? /** @type {string} */ (input.sessionId)
    : null;
  const epoch = typeof input.epoch === 'number'
    && Number.isSafeInteger(input.epoch)
    && input.epoch >= 0
    ? input.epoch
    : null;
  return Object.freeze({
    id, label, kind, state, owner, inputMode, resources, uptimeSeconds, sessionId, epoch,
  });
}

/**
 * Normalizes a host selection: keeps valid entity ids, drops anything else,
 * removes duplicates, preserves first-seen order. Never throws on plain input.
 * @param {unknown} value - Host selection list.
 * @returns {readonly string[]} Frozen normalized selection.
 */
export function normalizeSelectedIds(value) {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  const seen = new Set();
  const ids = [];
  for (const entry of value) {
    if (isFleetEntityId(entry) && !seen.has(entry)) {
      seen.add(entry);
      ids.push(entry);
    }
  }
  return Object.freeze(ids);
}

/**
 * @param {unknown} selectedIds - Host selection list.
 * @param {unknown} capsuleId - Capsule identity to test.
 * @returns {boolean} Whether the capsule is selected.
 */
export function isFleetSelected(selectedIds, capsuleId) {
  if (!isFleetEntityId(capsuleId) || !Array.isArray(selectedIds)) {
    return false;
  }
  return selectedIds.includes(capsuleId);
}

/**
 * Returns the selection with one capsule toggled. Pure: never mutates the input.
 * Invalid capsule ids leave the selection unchanged.
 * @param {unknown} selectedIds - Host selection list.
 * @param {unknown} capsuleId - Capsule identity to toggle.
 * @returns {readonly string[]} Frozen toggled selection.
 */
export function toggleFleetSelection(selectedIds, capsuleId) {
  const current = normalizeSelectedIds(selectedIds);
  if (!isFleetEntityId(capsuleId)) {
    return current;
  }
  const id = /** @type {string} */ (capsuleId);
  if (current.includes(id)) {
    return Object.freeze(current.filter((entry) => entry !== id));
  }
  return Object.freeze([...current, id]);
}

/**
 * Resolves the inspector capsule: the most recently selected capsule that is still
 * present in the census (last entry of the host selection order). Pure.
 * @param {unknown} capsules - Host census list.
 * @param {unknown} selectedIds - Host selection list.
 * @returns {FleetCapsule|null} Normalized inspector capsule, null when none resolves.
 */
export function fleetInspectorCapsule(capsules, selectedIds) {
  const list = Array.isArray(capsules) ? capsules : [];
  const normalized = list.map(normalizeFleetCapsule);
  const ids = normalizeSelectedIds(selectedIds);
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const found = normalized.find((capsule) => capsule.id === ids[index]);
    if (found) {
      return found;
    }
  }
  return null;
}

/**
 * Builds the intent toggling selection of one capsule.
 * @param {{ capsuleId?: unknown, selected?: unknown }} input
 * @returns {{ type: string, capsuleId: string, selected: boolean }} Frozen intent payload.
 */
export function buildFleetSelectIntent(input) {
  const candidate = input !== null && typeof input === 'object'
    ? /** @type {Record<string, unknown>} */ (input)
    : {};
  return Object.freeze({
    type: FLEET_SELECT_INTENT,
    capsuleId: isFleetEntityId(candidate.capsuleId)
      ? /** @type {string} */ (candidate.capsuleId)
      : FLEET_UNKNOWN_TEXT,
    selected: candidate.selected === true,
  });
}

/**
 * Builds one bulk intent over the host selection. Capsule ids are coerced with
 * `normalizeSelectedIds`; an unknown intent type is a programmer error and throws.
 * @param {unknown} type - Bulk intent type from `FLEET_BULK_INTENTS`.
 * @param {unknown} capsuleIds - Host selection list.
 * @returns {{ type: string, capsuleIds: readonly string[] }} Frozen intent payload.
 */
export function buildFleetBulkIntent(type, capsuleIds) {
  if (!FLEET_BULK_INTENTS.includes(/** @type {string} */ (type))) {
    throw new Error(`Unknown fleet bulk intent "${String(type)}"`);
  }
  return Object.freeze({
    type: /** @type {string} */ (type),
    capsuleIds: normalizeSelectedIds(capsuleIds),
  });
}

/**
 * Non-throwing shape check for a bulk intent payload.
 * @param {unknown} value
 * @returns {boolean} Whether the value is a well-formed bulk intent.
 */
export function isFleetBulkIntent(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const input = /** @type {Record<string, unknown>} */ (value);
  if (!FLEET_BULK_INTENTS.includes(/** @type {string} */ (input.type))) {
    return false;
  }
  if (!Array.isArray(input.capsuleIds)) {
    return false;
  }
  return input.capsuleIds.every(isFleetEntityId);
}

/**
 * @param {unknown} selectedIds - Host selection list.
 * @returns {string|null} Literal reason while the bulk bar is empty, null otherwise.
 */
export function fleetBulkReason(selectedIds) {
  return normalizeSelectedIds(selectedIds).length === 0 ? FLEET_BULK_EMPTY_REASON : null;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the census row (never switches with state).
 */
export function fleetRowDomId(capsuleId) {
  return `cuk-fleet-row-${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Semantic anchor of the census row.
 */
export function fleetRowAnchor(capsuleId) {
  return `fleet/${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}/row`;
}

/**
 * @param {unknown} raw - Capsule record (normalized before naming).
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function fleetRowAccessibleName(raw) {
  const capsule = normalizeFleetCapsule(raw);
  return `Capsule ${capsule.label}: ${fleetKindLabel(capsule.kind)}, ${capsule.state}.`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the compact card (presentational container).
 */
export function fleetCardDomId(capsuleId) {
  return `cuk-fleet-card-${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the row/card select button.
 */
export function fleetSelectDomId(capsuleId) {
  return `cuk-fleet-select-${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Semantic anchor of the row/card select button.
 */
export function fleetSelectAnchor(capsuleId) {
  return `dialog/${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}/select`;
}

/**
 * @param {unknown} raw - Capsule record (normalized before naming).
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function fleetSelectAccessibleName(raw) {
  const capsule = normalizeFleetCapsule(raw);
  return `Select capsule ${capsule.label}.`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the inspector region.
 */
export function fleetInspectorDomId(capsuleId) {
  return `cuk-fleet-inspector-${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Semantic anchor of the inspector region.
 */
export function fleetInspectorAnchor(capsuleId) {
  return `inspector/${isFleetEntityId(capsuleId) ? capsuleId : FLEET_UNKNOWN_TEXT}/field`;
}

/**
 * @param {unknown} raw - Capsule record or null (normalized before naming).
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function fleetInspectorAccessibleName(raw) {
  if (raw === null || raw === undefined) {
    return 'Inspector. No capsule selected.';
  }
  const capsule = normalizeFleetCapsule(raw);
  return `Inspector for ${capsule.label}.`;
}
