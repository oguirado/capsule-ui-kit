<script>
/**
 * @fileoverview SaaS accessible dispatch box: single-line plan summary for agents and readers.
 * Presentation only; the plan fields are projected by the consumer from drawer state.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const SAAS_ACCESSIBLE_BOX_SCHEMA = 'capsule-ui-kit.saas-accessible-box/v1';

export const SAAS_ACCESSIBLE_BOX_ANCHOR = 'drawer/accessible-text';

/**
 * Builds the box anchor: per-session output region once the drawer assigns the
 * active session identity, drawer-scoped while no session is active yet.
 *
 * @param {unknown} sessionId
 * @returns {string}
 */
export function saasAccessibleBoxAnchor(sessionId) {
  if (typeof sessionId === 'string' && sessionId.length > 0) {
    return `output/${sessionId}/text`;
  }
  return SAAS_ACCESSIBLE_BOX_ANCHOR;
}

/**
 * @typedef {Object} SaasDispatchPlanSummary
 * @property {string} session - Neutral dispatch session label.
 * @property {readonly string[]} targets - Neutral included target labels.
 * @property {readonly string[]} excluded - Neutral excluded target labels.
 * @property {string} payloadHash - Short neutral payload digest (hex prefix).
 * @property {number} [streamTimeoutSecs] - Stream timeout in seconds.
 * @property {boolean} [autoRetryOnFailure] - Whether failed targets auto-retry.
 * @property {number} [expectedAckNodes] - Expected acknowledgement count (defaults to targets.length).
 */

/**
 * Validates the plan summary shape (fail-closed; never renders a partial plan line).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, plan: SaasDispatchPlanSummary } | { ok: false, code: string, message: string }}
 */
export function validateAccessibleDispatchPlan(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'PLAN_NOT_OBJECT', message: 'Dispatch plan must be an object.' };
  }
  const candidate = /** @type {Record<string, unknown>} */ (raw);
  if (typeof candidate.session !== 'string' || candidate.session.length === 0) {
    return { ok: false, code: 'PLAN_BAD_SESSION', message: 'Dispatch plan session must be a non-empty string.' };
  }
  for (const field of ['targets', 'excluded']) {
    if (!Array.isArray(candidate[field])) {
      return { ok: false, code: 'PLAN_BAD_LIST', message: `Dispatch plan ${field} must be an array.` };
    }
    for (const entry of /** @type {unknown[]} */ (candidate[field])) {
      if (typeof entry !== 'string' || entry.length === 0) {
        return { ok: false, code: 'PLAN_BAD_ENTRY', message: `Dispatch plan ${field} entries must be non-empty strings.` };
      }
    }
  }
  if (typeof candidate.payloadHash !== 'string' || !/^[0-9a-f]{8,64}$/.test(candidate.payloadHash)) {
    return { ok: false, code: 'PLAN_BAD_HASH', message: 'Dispatch plan payloadHash must be 8-64 lowercase hex.' };
  }
  if (candidate.streamTimeoutSecs !== undefined) {
    if (typeof candidate.streamTimeoutSecs !== 'number' || !(candidate.streamTimeoutSecs >= 0)) {
      return { ok: false, code: 'PLAN_BAD_TIMEOUT', message: 'Dispatch plan streamTimeoutSecs must be a finite non-negative number.' };
    }
  }
  if (candidate.autoRetryOnFailure !== undefined && typeof candidate.autoRetryOnFailure !== 'boolean') {
    return { ok: false, code: 'PLAN_BAD_RETRY', message: 'Dispatch plan autoRetryOnFailure must be a boolean.' };
  }
  if (candidate.expectedAckNodes !== undefined) {
    if (typeof candidate.expectedAckNodes !== 'number' || !Number.isSafeInteger(candidate.expectedAckNodes) || candidate.expectedAckNodes < 0) {
      return { ok: false, code: 'PLAN_BAD_ACKS', message: 'Dispatch plan expectedAckNodes must be a non-negative integer.' };
    }
  }
  return { ok: true, plan: /** @type {SaasDispatchPlanSummary} */ (candidate) };
}

/**
 * Sanitizes one line atom: single line, no quotes breaking the `key="value"` shape.
 *
 * @param {string} value
 * @returns {string}
 */
export function sanitizePlanAtom(value) {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/"/g, "'").trim();
}

/**
 * Formats the single machine-readable plan line.
 *
 * @param {SaasDispatchPlanSummary} plan
 * @returns {string}
 */
export function formatAccessibleDispatchLine(plan) {
  const targets = plan.targets.map(sanitizePlanAtom).join(', ');
  const excluded = plan.excluded.map(sanitizePlanAtom).join(', ');
  const timeout = plan.streamTimeoutSecs === undefined ? 45 : plan.streamTimeoutSecs;
  const retry = plan.autoRetryOnFailure === true;
  const acks = plan.expectedAckNodes === undefined ? plan.targets.length : plan.expectedAckNodes;
  return (
    `[ORCHESTRATOR_DISPATCH_PLAN] session="${sanitizePlanAtom(plan.session)}" | ` +
    `targets=[${targets}] | excluded=[${excluded}] | payload_hash="${plan.payloadHash}" | ` +
    `stream_timeout=${timeout.toFixed(1)}s | auto_retry_on_failure=${retry} | expected_ack_nodes=${acks}`
  );
}
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  plan: {
    type: Object,
    default: null
  },
  sessionId: {
    type: String,
    default: ''
  },
  heading: {
    type: String,
    default: 'Structured Accessibility & Automation Summary'
  },
  formatNote: {
    type: String,
    default: 'FORMAT: RFC-8259 PARSED'
  }
});

const validated = computed(() => {
  if (props.plan === null || props.plan === undefined) return null;
  const result = validateAccessibleDispatchPlan(props.plan);
  return result.ok ? result.plan : null;
});

const validationError = computed(() => {
  if (props.plan === null || props.plan === undefined) return null;
  const result = validateAccessibleDispatchPlan(props.plan);
  if (result.ok) return null;
  const failed = /** @type {{ code: string, message: string }} */ (/** @type {unknown} */ (result));
  return { code: failed.code, message: failed.message };
});

const line = computed(() => (validated.value ? formatAccessibleDispatchLine(validated.value) : ''));

const boxAnchor = computed(() => saasAccessibleBoxAnchor(props.sessionId));
</script>

<template>
  <section
    id="cuk-saas-accessible-box"
    class="saas-accessible-box"
    role="region"
    aria-label="Structured accessibility and automation summary"
    :data-semantic-anchor="boxAnchor"
  >
    <header class="saas-accessible-box__header">
      <span class="saas-accessible-box__heading">{{ props.heading }}</span>
      <span class="saas-accessible-box__format">{{ props.formatNote }}</span>
    </header>
    <p v-if="validated" class="saas-accessible-box__line">{{ line }}</p>
    <p v-else-if="validationError" class="saas-accessible-box__invalid" role="alert">
      {{ validationError.code }}: {{ validationError.message }}
    </p>
    <p v-else class="saas-accessible-box__empty" role="status">No dispatch plan staged.</p>
  </section>
</template>

<style scoped>
.saas-accessible-box {
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-component-accessible-output-background);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.saas-accessible-box__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  margin-bottom: var(--cuk-semantic-spacing-xs);
}
.saas-accessible-box__heading {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
}
.saas-accessible-box__format {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-accessible-box__line {
  font-family: var(--cuk-component-accessible-output-font-family);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: var(--cuk-semantic-typography-line-height-normal);
  color: var(--cuk-component-accessible-output-text-color);
  margin: var(--cuk-semantic-spacing-none);
  overflow-wrap: anywhere;
}
.saas-accessible-box__empty {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-accessible-box__invalid {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-status-error-text);
  margin: var(--cuk-semantic-spacing-none);
}
@media (prefers-reduced-motion: reduce) {
  .saas-accessible-box {
    transition: none;
  }
}
</style>
