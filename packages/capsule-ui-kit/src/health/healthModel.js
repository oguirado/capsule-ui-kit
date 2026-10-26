/**
 * @file Capsule health board model: states, severities, validators, formatters and intent builders.
 * Generic presentation model for a per-capsule health and alerts board. Every value is
 * host-supplied through props; unknown or unavailable data renders as such and is never
 * coerced to zero. The board emits intents only; the kit never acknowledges alerts itself
 * and never writes disk, network or clipboard.
 * Plain JavaScript ES module with JSDoc types; no framework imports, no product names.
 * @module health/healthModel
 */

/**
 * Per-capsule states on the health board surface (room contract).
 * @type {ReadonlyArray<string>}
 */
export const HEALTH_CAPSULE_STATES = Object.freeze(['ready', 'starting', 'lost', 'error', 'stopped']);

/**
 * Alert severities on the health board surface.
 * @type {ReadonlyArray<string>}
 */
export const HEALTH_ALERT_SEVERITIES = Object.freeze(['info', 'warning', 'error', 'critical']);

/**
 * Severity filter options (`all` plus every severity).
 * @type {ReadonlyArray<string>}
 */
export const HEALTH_SEVERITY_FILTERS = Object.freeze(['all', 'info', 'warning', 'error', 'critical']);

/**
 * Visible labels for the severity filter options.
 * @type {Readonly<Record<string, string>>}
 */
export const HEALTH_SEVERITY_FILTER_LABELS = Object.freeze({
  all: 'All severities',
  info: 'Info',
  warning: 'Warning',
  error: 'Error',
  critical: 'Critical',
});

/**
 * Display text for a value the host did not supply.
 * @type {string}
 */
export const HEALTH_UNKNOWN_TEXT = 'unknown';

/**
 * Intent type requesting host acknowledgement of one alert.
 * @type {string}
 */
export const HEALTH_ACKNOWLEDGE_ALERT_INTENT = 'acknowledge-alert';

/**
 * Intent type reporting a board filter change (host may persist it).
 * @type {string}
 */
export const HEALTH_FILTER_CHANGE_INTENT = 'filter-change';

/**
 * Event names emitted by the health board components.
 * @type {ReadonlyArray<string>}
 */
export const HEALTH_BOARD_EMITS = Object.freeze(['submit-intent']);

/**
 * Stable DOM id of the severity filter control.
 * @type {string}
 */
export const HEALTH_SEVERITY_FILTER_DOM_ID = 'cuk-health-filter-severity';

/**
 * Semantic anchor of the severity filter control.
 * @type {string}
 */
export const HEALTH_SEVERITY_FILTER_ANCHOR = 'settings/health-severity';

/**
 * Stable DOM id of the unread-only filter control.
 * @type {string}
 */
export const HEALTH_UNREAD_FILTER_DOM_ID = 'cuk-health-filter-unread';

/**
 * Semantic anchor of the unread-only filter control.
 * @type {string}
 */
export const HEALTH_UNREAD_FILTER_ANCHOR = 'settings/health-unread-only';

/**
 * @typedef {Object} HealthMetric
 * @property {string} key - Stable metric key.
 * @property {string} label - Visible metric label.
 * @property {unknown} value - Host-supplied value (number, string, null or undefined).
 * @property {string} unit - Unit suffix, empty when none.
 */

/**
 * @typedef {Object} HealthCapsule
 * @property {string} id - Capsule identity (`unknown` when the host id is invalid).
 * @property {string} label - Visible capsule label (falls back to the id).
 * @property {string} state - Known capsule state or `unknown`.
 * @property {string|null} reason - State reason, null when the host gave none.
 * @property {readonly HealthMetric[]} telemetry - Normalized host metrics.
 */

/**
 * @typedef {Object} HealthAlert
 * @property {string} id - Alert identity (`unknown` when the host id is invalid).
 * @property {string|null} capsuleId - Owning capsule, null when unscoped.
 * @property {string} severity - Known severity or `unknown`.
 * @property {string} summary - Short alert summary.
 * @property {string|null} detail - Long detail, null when the host gave none.
 * @property {boolean} acknowledged - Whether the host marks the alert acknowledged.
 */

/**
 * Whether a value is a usable entity identity: a non-empty anchor token that is
 * never a bare numeric index (registry identities are immutable, never list positions).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHealthEntityId(value) {
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
export function normalizeHealthCapsuleState(value) {
  return HEALTH_CAPSULE_STATES.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : HEALTH_UNKNOWN_TEXT;
}

/**
 * @param {unknown} state
 * @returns {string} Pill tone for a capsule state (`neutral` when unknown).
 */
export function healthStateTone(state) {
  switch (normalizeHealthCapsuleState(state)) {
    case 'ready': return 'success';
    case 'starting': return 'info';
    case 'lost': return 'warning';
    case 'error': return 'error';
    default: return 'neutral';
  }
}

/**
 * Normalizes one host capsule record. Never throws on plain input; invalid ids and
 * states fall back to `unknown` so the board renders honestly instead of crashing.
 * @param {unknown} raw
 * @returns {HealthCapsule} Frozen normalized capsule.
 */
export function normalizeHealthCapsule(raw) {
  const input = raw !== null && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const id = isHealthEntityId(input.id) ? /** @type {string} */ (input.id) : HEALTH_UNKNOWN_TEXT;
  const label = typeof input.label === 'string' && input.label.trim().length > 0
    ? input.label.trim()
    : id;
  const state = normalizeHealthCapsuleState(input.state);
  const reason = typeof input.reason === 'string' && input.reason.trim().length > 0
    ? input.reason.trim()
    : null;
  const telemetry = Array.isArray(input.telemetry)
    ? Object.freeze(input.telemetry.map(normalizeHealthMetric))
    : Object.freeze([]);
  return Object.freeze({ id, label, state, reason, telemetry });
}

/**
 * Normalizes one host telemetry metric. Never throws on plain input.
 * @param {unknown} raw
 * @returns {HealthMetric} Frozen normalized metric.
 */
export function normalizeHealthMetric(raw) {
  const input = raw !== null && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const key = typeof input.key === 'string' && input.key.trim().length > 0
    ? input.key.trim()
    : HEALTH_UNKNOWN_TEXT;
  const label = typeof input.label === 'string' && input.label.trim().length > 0
    ? input.label.trim()
    : key;
  const value = Object.prototype.hasOwnProperty.call(input, 'value') ? input.value : null;
  const unit = typeof input.unit === 'string' ? input.unit.trim() : '';
  return Object.freeze({ key, label, value, unit });
}

/**
 * Formats one host-supplied metric value. Genuine zeros render as `0`; missing or
 * non-finite values render as `unknown`, never as a faked zero.
 * @param {unknown} value - Host-supplied value.
 * @param {string} [unit] - Unit suffix appended to known values only.
 * @returns {string} Display text.
 */
export function formatHealthMetricValue(value, unit = '') {
  const suffix = typeof unit === 'string' && unit.trim().length > 0 ? ` ${unit.trim()}` : '';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}${suffix}` : HEALTH_UNKNOWN_TEXT;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0 ? `${value.trim()}${suffix}` : HEALTH_UNKNOWN_TEXT;
  }
  return HEALTH_UNKNOWN_TEXT;
}

/**
 * @param {unknown} value
 * @returns {string} Known severity, or `unknown`.
 */
export function normalizeAlertSeverity(value) {
  return HEALTH_ALERT_SEVERITIES.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : HEALTH_UNKNOWN_TEXT;
}

/**
 * @param {unknown} severity
 * @returns {string} Pill tone for a severity (`neutral` when unknown).
 */
export function alertSeverityTone(severity) {
  switch (normalizeAlertSeverity(severity)) {
    case 'info': return 'info';
    case 'warning': return 'warning';
    case 'error': return 'error';
    case 'critical': return 'error';
    default: return 'neutral';
  }
}

/**
 * Normalizes one host alert record. Never throws on plain input; invalid ids and
 * severities fall back to `unknown` so the board renders honestly instead of crashing.
 * @param {unknown} raw
 * @returns {HealthAlert} Frozen normalized alert.
 */
export function normalizeHealthAlert(raw) {
  const input = raw !== null && typeof raw === 'object'
    ? /** @type {Record<string, unknown>} */ (raw)
    : {};
  const id = isHealthEntityId(input.id) ? /** @type {string} */ (input.id) : HEALTH_UNKNOWN_TEXT;
  const capsuleId = isHealthEntityId(input.capsuleId)
    ? /** @type {string} */ (input.capsuleId)
    : null;
  const severity = normalizeAlertSeverity(input.severity);
  const summary = typeof input.summary === 'string' && input.summary.trim().length > 0
    ? input.summary.trim()
    : HEALTH_UNKNOWN_TEXT;
  const detail = typeof input.detail === 'string' && input.detail.trim().length > 0
    ? input.detail.trim()
    : null;
  const acknowledged = input.acknowledged === true;
  return Object.freeze({ id, capsuleId, severity, summary, detail, acknowledged });
}

/**
 * @param {unknown} value
 * @returns {string} Known severity filter, or `all`.
 */
export function normalizeSeverityFilter(value) {
  return HEALTH_SEVERITY_FILTERS.includes(/** @type {string} */ (value))
    ? /** @type {string} */ (value)
    : 'all';
}

/**
 * Filters host alerts by severity and acknowledgement. Pure: returns the matching
 * host entries unchanged (callers normalize for display).
 * @param {unknown} alerts - Host alert list.
 * @param {{ severity?: unknown, unreadOnly?: unknown }} [options]
 * @returns {readonly unknown[]} Frozen filtered list.
 */
export function filterHealthAlerts(alerts, options = {}) {
  const list = Array.isArray(alerts) ? alerts : [];
  const severity = normalizeSeverityFilter(options.severity);
  const unreadOnly = options.unreadOnly === true;
  return Object.freeze(list.filter((entry) => {
    const alert = normalizeHealthAlert(entry);
    if (severity !== 'all' && alert.severity !== severity) {
      return false;
    }
    if (unreadOnly && alert.acknowledged) {
      return false;
    }
    return true;
  }));
}

/**
 * Builds the intent requesting host acknowledgement of one alert.
 * @param {{ alertId?: unknown }} input
 * @returns {{ type: string, alertId: string }} Frozen intent payload.
 */
export function buildAcknowledgeAlertIntent(input) {
  const candidate = input !== null && typeof input === 'object'
    ? /** @type {Record<string, unknown>} */ (input).alertId
    : undefined;
  return Object.freeze({
    type: HEALTH_ACKNOWLEDGE_ALERT_INTENT,
    alertId: isHealthEntityId(candidate) ? /** @type {string} */ (candidate) : HEALTH_UNKNOWN_TEXT,
  });
}

/**
 * Builds the intent reporting a board filter change.
 * @param {{ severity?: unknown, unreadOnly?: unknown }} [input]
 * @returns {{ type: string, severity: string, unreadOnly: boolean }} Frozen intent payload.
 */
export function buildFilterChangeIntent(input = {}) {
  const candidate = input !== null && typeof input === 'object'
    ? /** @type {Record<string, unknown>} */ (input)
    : {};
  return Object.freeze({
    type: HEALTH_FILTER_CHANGE_INTENT,
    severity: normalizeSeverityFilter(candidate.severity),
    unreadOnly: candidate.unreadOnly === true,
  });
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the capsule state row (never switches with state).
 */
export function healthCapsuleRowDomId(capsuleId) {
  return `cuk-health-capsule-row-${isHealthEntityId(capsuleId) ? capsuleId : HEALTH_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Semantic anchor of the capsule state row.
 */
export function healthCapsuleRowAnchor(capsuleId) {
  return `fleet/${isHealthEntityId(capsuleId) ? capsuleId : HEALTH_UNKNOWN_TEXT}/row`;
}

/**
 * @param {unknown} raw - Capsule record (normalized before naming).
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function healthCapsuleRowAccessibleName(raw) {
  const capsule = normalizeHealthCapsule(raw);
  const reason = capsule.reason === null ? '' : `, ${capsule.reason}`;
  return `Capsule ${capsule.label}: ${capsule.state}${reason}.`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Stable DOM id of the telemetry strip.
 */
export function healthTelemetryDomId(capsuleId) {
  return `cuk-health-telemetry-${isHealthEntityId(capsuleId) ? capsuleId : HEALTH_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {string} Semantic anchor of the telemetry strip.
 */
export function healthTelemetryAnchor(capsuleId) {
  return `inspector/${isHealthEntityId(capsuleId) ? capsuleId : HEALTH_UNKNOWN_TEXT}/field`;
}

/**
 * @param {{ capsuleId?: unknown, capsuleLabel?: unknown }} [input]
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function healthTelemetryAccessibleName(input = {}) {
  const candidate = input !== null && typeof input === 'object'
    ? /** @type {Record<string, unknown>} */ (input)
    : {};
  const id = isHealthEntityId(candidate.capsuleId)
    ? /** @type {string} */ (candidate.capsuleId)
    : HEALTH_UNKNOWN_TEXT;
  const label = typeof candidate.capsuleLabel === 'string' && candidate.capsuleLabel.trim().length > 0
    ? candidate.capsuleLabel.trim()
    : id;
  return `Telemetry for ${label}.`;
}

/**
 * @param {unknown} alertId
 * @returns {string} Stable DOM id of the alert item.
 */
export function healthAlertDomId(alertId) {
  return `cuk-health-alert-${isHealthEntityId(alertId) ? alertId : HEALTH_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} alertId
 * @returns {string} Semantic anchor of the alert item.
 */
export function healthAlertAnchor(alertId) {
  return `alerts/${isHealthEntityId(alertId) ? alertId : HEALTH_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} raw - Alert record (normalized before naming).
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function healthAlertAccessibleName(raw) {
  const alert = normalizeHealthAlert(raw);
  const state = alert.acknowledged ? '. Acknowledged.' : '.';
  return `Alert ${alert.id}: ${alert.severity}, ${alert.summary}${state}`;
}

/**
 * @param {unknown} alertId
 * @returns {string} Stable DOM id of the acknowledge button.
 */
export function healthAckDomId(alertId) {
  return `cuk-health-ack-${isHealthEntityId(alertId) ? alertId : HEALTH_UNKNOWN_TEXT}`;
}

/**
 * @param {unknown} alertId
 * @returns {string} Semantic anchor of the acknowledge button.
 */
export function healthAckAnchor(alertId) {
  return `inbox/${isHealthEntityId(alertId) ? alertId : HEALTH_UNKNOWN_TEXT}/ack`;
}

/**
 * @param {unknown} alertId
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function healthAckAccessibleName(alertId) {
  const id = isHealthEntityId(alertId) ? alertId : HEALTH_UNKNOWN_TEXT;
  return `Acknowledge alert ${id}.`;
}
