<script>
/**
 * @fileoverview SaaS per-target execution rows: four-state chips over dispatch run records.
 * Presentation only; run-status authority stays in the drawer model and DispatchResults.
 * Gating mirrors DispatchResults (`TERMINAL_FAILURE_RETRYABLE_STATUSES`,
 * `CANCELLABLE_IN_FLIGHT_STATUSES`); parity is asserted in test/saas-dispatch.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const SAAS_RESULT_ROWS_SCHEMA = 'capsule-ui-kit.saas-result-rows/v1';

export const SAAS_TARGET_RUN_STATUSES = Object.freeze([
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

export const SAAS_RETRYABLE_STATUSES = Object.freeze(['verified-failure', 'refused', 'cancelled']);

export const SAAS_CANCELLABLE_STATUSES = Object.freeze([
  'pending',
  'accepted',
  'queued',
  'executing',
  'waiting-permission',
  'waiting-input'
]);

/**
 * @typedef {Object} SaasResultInput
 * @property {string} requestId - Parent dispatch identity.
 * @property {string} sessionId - Target session identity.
 * @property {string} [capsuleLabel] - Neutral capsule display label.
 * @property {string} [hostLabel] - Neutral host display label.
 * @property {string} status - Drawer TargetRunStatus value.
 * @property {number} [elapsedSecs] - Elapsed seconds for the mono readout.
 * @property {string} [refusalCode] - Named refusal/failure code (rc text).
 * @property {string} [refusalMessage] - Full refusal detail.
 * @property {boolean} [cancelRequested] - Explicit Stop-this-run already requested.
 * @property {boolean} [hasOutput] - Streamed output available for View Output.
 */

/**
 * @typedef {Object} SaasResultChip
 * @property {'ACCEPTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED'} label
 * @property {'info' | 'warning' | 'success' | 'error'} tone
 * @property {boolean} spinner
 */

/**
 * @typedef {Object} SaasResultRowView
 * @property {string} requestId
 * @property {string} sessionId
 * @property {string} capsuleLabel
 * @property {string} hostLabel
 * @property {string} status
 * @property {SaasResultChip} chip
 * @property {string} elapsedText
 * @property {string} detailText
 * @property {boolean} retryAllowed
 * @property {string} retryReason
 * @property {boolean} cancelAllowed
 * @property {string} cancelReason
 * @property {boolean} viewOutputAllowed
 * @property {string} resultAnchor
 * @property {string} retryAnchor
 * @property {string} cancelAnchor
 * @property {string} accessibleName
 */

/**
 * Validates one result input (fail-closed on identities and status vocabulary).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, run: SaasResultInput } | { ok: false, code: string, message: string }}
 */
export function validateSaasResultInput(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'RESULT_NOT_OBJECT', message: 'Result input must be an object.' };
  }
  const candidate = /** @type {Record<string, unknown>} */ (raw);
  if (typeof candidate.requestId !== 'string' || candidate.requestId.trim().length === 0) {
    return { ok: false, code: 'RESULT_BAD_REQUEST_ID', message: 'Result requestId must be a non-empty string.' };
  }
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.trim().length === 0) {
    return { ok: false, code: 'RESULT_BAD_SESSION_ID', message: 'Result sessionId must be a non-empty string.' };
  }
  if (typeof candidate.status !== 'string' || !SAAS_TARGET_RUN_STATUSES.includes(candidate.status)) {
    return { ok: false, code: 'RESULT_BAD_STATUS', message: 'Result status must be a known TargetRunStatus.' };
  }
  if (candidate.elapsedSecs !== undefined) {
    if (typeof candidate.elapsedSecs !== 'number' || !(candidate.elapsedSecs >= 0)) {
      return { ok: false, code: 'RESULT_BAD_ELAPSED', message: 'Result elapsedSecs must be a finite non-negative number.' };
    }
  }
  return { ok: true, run: /** @type {SaasResultInput} */ (candidate) };
}

/**
 * Maps a run status to one of the four SAAS chips. `uncertain` renders the FAILED
 * chip with a reconcile detail (never a success chip, never silent).
 *
 * @param {string} status
 * @returns {SaasResultChip}
 */
export function mapSaasResultChip(status) {
  if (status === 'executing') {
    return Object.freeze({ label: 'EXECUTING', tone: 'warning', spinner: true });
  }
  if (status === 'completed-unverified' || status === 'verified-success') {
    return Object.freeze({ label: 'COMPLETED', tone: 'success', spinner: false });
  }
  if (
    status === 'verified-failure' ||
    status === 'refused' ||
    status === 'cancelled' ||
    status === 'uncertain'
  ) {
    return Object.freeze({ label: 'FAILED', tone: 'error', spinner: false });
  }
  return Object.freeze({ label: 'ACCEPTED', tone: 'info', spinner: false });
}

/**
 * @param {string} status
 * @returns {boolean}
 */
export function isSaasRetryAllowed(status) {
  return SAAS_RETRYABLE_STATUSES.includes(status);
}

/**
 * @param {string} status
 * @param {boolean} cancelRequested
 * @returns {boolean}
 */
export function isSaasCancelAllowed(status, cancelRequested) {
  return SAAS_CANCELLABLE_STATUSES.includes(status) && cancelRequested !== true;
}

/**
 * Formats the mono elapsed readout (`0.14s`); unknown stays `—`, never zero.
 *
 * @param {unknown} elapsedSecs
 * @returns {string}
 */
export function formatSaasElapsed(elapsedSecs) {
  if (typeof elapsedSecs !== 'number' || !Number.isFinite(elapsedSecs) || elapsedSecs < 0) return '—';
  return `${elapsedSecs.toFixed(2)}s`;
}

/**
 * Projects one run into a row view with chips, gating, anchors and names.
 *
 * @param {SaasResultInput} run
 * @returns {SaasResultRowView}
 */
export function projectSaasResultRow(run) {
  const chip = mapSaasResultChip(run.status);
  const cancelRequested = run.cancelRequested === true;
  const retryAllowed = isSaasRetryAllowed(run.status);
  const cancelAllowed = isSaasCancelAllowed(run.status, cancelRequested);
  const viewOutputAllowed = run.hasOutput === true;
  const capsuleLabel =
    typeof run.capsuleLabel === 'string' && run.capsuleLabel.length > 0 ? run.capsuleLabel : run.sessionId;
  const hostLabel = typeof run.hostLabel === 'string' ? run.hostLabel : '';
  let detailText = '';
  if (run.status === 'uncertain') {
    detailText = 'uncertain outcome — reconcile required';
  } else if (typeof run.refusalCode === 'string' && run.refusalCode.length > 0) {
    detailText = `(${run.refusalCode})`;
  } else if (typeof run.refusalMessage === 'string' && run.refusalMessage.length > 0) {
    detailText = run.refusalMessage;
  }
  let retryReason = '';
  if (!retryAllowed) {
    retryReason =
      run.status === 'uncertain'
        ? 'Uncertain outcome requires reconciliation before retry'
        : `Retry unavailable while target status is ${run.status}`;
  }
  let cancelReason = '';
  if (!cancelAllowed) {
    cancelReason =
      cancelRequested && run.status !== 'cancelled'
        ? 'Cancellation already requested; awaiting terminal outcome'
        : `Cancel unavailable in status ${run.status}`;
  }
  return Object.freeze({
    requestId: run.requestId,
    sessionId: run.sessionId,
    capsuleLabel,
    hostLabel,
    status: run.status,
    chip,
    elapsedText: formatSaasElapsed(run.elapsedSecs),
    detailText,
    retryAllowed,
    retryReason,
    cancelAllowed,
    cancelReason,
    viewOutputAllowed,
    resultAnchor: `dispatch/${run.requestId}/target/${run.sessionId}/result`,
    retryAnchor: `dispatch/${run.requestId}/target/${run.sessionId}/retry`,
    cancelAnchor: `dispatch/${run.requestId}/target/${run.sessionId}/cancel`,
    accessibleName: `Result for ${run.sessionId} in dispatch ${run.requestId}: ${chip.label}`
  });
}
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  results: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['cancel-target-run', 'stage-retry', 'view-output']);

const rows = computed(() => {
  if (!Array.isArray(props.results)) return [];
  /** @type {SaasResultRowView[]} */
  const views = [];
  for (const raw of props.results) {
    const validated = validateSaasResultInput(raw);
    if (!validated.ok) continue;
    views.push(projectSaasResultRow(validated.run));
  }
  return views;
});

function onCancel(requestId, sessionId) {
  emit('cancel-target-run', { requestId, sessionId });
}

function onRetry(requestId, sessionId) {
  emit('stage-retry', { requestId, sessionId });
}

function onViewOutput(requestId, sessionId) {
  emit('view-output', { requestId, sessionId });
}
</script>

<template>
  <section
    class="saas-result-rows"
    role="group"
    aria-label="Target execution telemetry"
  >
    <header class="saas-result-rows__header">
      <span class="saas-result-rows__title">Target Execution Telemetry</span>
      <span class="saas-result-rows__count">{{ rows.length }} node(s) monitored</span>
    </header>
    <p v-if="rows.length === 0" class="saas-result-rows__empty" role="status">
      No target executions recorded.
    </p>
    <div v-else class="saas-result-rows__list" role="group" aria-label="Per-target execution results">
      <div
        v-for="row in rows"
        :key="`${row.requestId}-${row.sessionId}`"
        :id="`cuk-saas-dispatch-${row.requestId}-target-${row.sessionId}-result`"
        class="saas-result-rows__row"
        role="region"
        :data-semantic-anchor="row.resultAnchor"
        :data-target-status="row.status"
        :aria-label="row.accessibleName"
      >
        <div class="saas-result-rows__identity">
          <span class="saas-result-rows__name">{{ row.capsuleLabel }}</span>
          <span v-if="row.hostLabel" class="saas-result-rows__host">{{ row.hostLabel }}</span>
          <span
            class="saas-result-rows__chip"
            :class="`saas-result-rows__chip--${row.chip.tone}`"
            role="status"
          >
            <span v-if="row.chip.spinner" class="saas-result-rows__spinner" aria-hidden="true" />
            <span>{{ row.chip.label }}</span>
            <span v-if="row.detailText" class="saas-result-rows__detail">{{ row.detailText }}</span>
          </span>
        </div>
        <div class="saas-result-rows__actions">
          <span class="saas-result-rows__elapsed">Elapsed: {{ row.elapsedText }}</span>
          <button
            v-if="row.status === 'verified-success' || row.status === 'completed-unverified' || row.viewOutputAllowed"
            :id="`cuk-saas-dispatch-${row.requestId}-target-${row.sessionId}-output`"
            type="button"
            role="button"
            class="saas-result-rows__btn saas-result-rows__btn--output"
            :aria-label="`View output for ${row.sessionId}`"
            :disabled="!row.viewOutputAllowed"
            :aria-disabled="!row.viewOutputAllowed ? 'true' : 'false'"
            @click="onViewOutput(row.requestId, row.sessionId)"
          >
            View Output
          </button>
          <button
            v-else-if="row.retryAllowed || row.status === 'verified-failure' || row.status === 'refused' || row.status === 'cancelled'"
            :id="`cuk-saas-dispatch-${row.requestId}-target-${row.sessionId}-retry`"
            type="button"
            role="button"
            class="saas-result-rows__btn saas-result-rows__btn--retry"
            :data-semantic-anchor="row.retryAnchor"
            :aria-label="`Retry target ${row.sessionId}`"
            :disabled="!row.retryAllowed"
            :aria-disabled="!row.retryAllowed ? 'true' : 'false'"
            :data-unavailable-reason="row.retryReason || undefined"
            :title="row.retryReason || `Retry target ${row.sessionId}`"
            @click="onRetry(row.requestId, row.sessionId)"
          >
            Retry
          </button>
          <button
            v-else
            :id="`cuk-saas-dispatch-${row.requestId}-target-${row.sessionId}-cancel`"
            type="button"
            role="button"
            class="saas-result-rows__btn"
            :data-semantic-anchor="row.cancelAnchor"
            :aria-label="`Cancel run on ${row.sessionId}`"
            :disabled="!row.cancelAllowed"
            :aria-disabled="!row.cancelAllowed ? 'true' : 'false'"
            :data-unavailable-reason="row.cancelReason || undefined"
            :title="row.cancelReason || `Cancel run on ${row.sessionId}`"
            @click="onCancel(row.requestId, row.sessionId)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.saas-result-rows {
  padding: var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
}
.saas-result-rows__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding-bottom: var(--cuk-semantic-spacing-sm);
  margin-bottom: var(--cuk-semantic-spacing-sm);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-result-rows__title {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
}
.saas-result-rows__count {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-result-rows__empty {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-result-rows__list {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  list-style: none;
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
}
.saas-result-rows__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
  min-height: var(--cuk-component-s1-table-row-height);
  padding: var(--cuk-semantic-spacing-none) var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.saas-result-rows__row:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}
.saas-result-rows__identity {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  min-width: var(--cuk-semantic-spacing-none);
}
.saas-result-rows__name {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  white-space: nowrap;
}
.saas-result-rows__host {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-result-rows__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  min-height: var(--cuk-primitive-space-10);
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  white-space: nowrap;
}
.saas-result-rows__chip--info {
  color: var(--cuk-semantic-status-info-text);
  background-color: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.saas-result-rows__chip--warning {
  color: var(--cuk-semantic-status-warning-text);
  background-color: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.saas-result-rows__chip--success {
  color: var(--cuk-semantic-status-success-text);
  background-color: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.saas-result-rows__chip--error {
  color: var(--cuk-semantic-status-error-text);
  background-color: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
.saas-result-rows__detail {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  opacity: 0.75;
}
.saas-result-rows__spinner {
  display: inline-block;
  width: var(--cuk-semantic-spacing-sm);
  height: var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid currentColor;
  border-top-color: transparent;
  border-radius: var(--cuk-semantic-radius-pill);
  animation: saas-result-rows-spin 1s linear infinite;
}
.saas-result-rows__actions {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xl);
}
.saas-result-rows__elapsed {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-result-rows__btn {
  display: inline-flex;
  align-items: center;
  min-height: var(--cuk-primitive-space-12);
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
  white-space: nowrap;
}
.saas-result-rows__btn--output {
  color: var(--cuk-semantic-text-accent);
}
.saas-result-rows__btn--retry {
  color: var(--cuk-semantic-text-primary);
}
.saas-result-rows__btn:disabled {
  cursor: not-allowed;
  color: var(--cuk-semantic-text-disabled);
}
.saas-result-rows__btn:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
@keyframes saas-result-rows-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .saas-result-rows__spinner {
    animation: none;
  }
  .saas-result-rows,
  .saas-result-rows__btn {
    transition: none;
  }
}
</style>
