<script>
/**
 * @fileoverview SaaS frozen review pane: schematic pre-commit summary over the drawer review.
 * Presentation only; review freeze/invalidation authority stays in the drawer model.
 * The dispatch wire contract is AUSENTE, so this pane renders the frozen-bytes shape only.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const SAAS_FROZEN_REVIEW_SCHEMA = 'capsule-ui-kit.saas-frozen-review/v1';

export const SAAS_REVIEW_CONFIRM_ANCHOR = 'drawer/review/confirm';

/**
 * Builds the confirm anchor: per-dispatch once the drawer assigns an identity,
 * drawer-scoped while the review is pre-submit (no dispatch id yet).
 *
 * @param {unknown} dispatchId
 * @returns {string}
 */
export function saasReviewConfirmAnchor(dispatchId) {
  if (typeof dispatchId === 'string' && dispatchId.length > 0) {
    return `dispatch/${dispatchId}/review-confirm`;
  }
  return SAAS_REVIEW_CONFIRM_ANCHOR;
}

/**
 * @typedef {Object} SaasFrozenReviewInput
 * @property {string} promptSha256 - Lowercase hex SHA-256 of the frozen prompt bytes.
 * @property {number} [promptByteLength] - Exact UTF-8 byte length of the frozen prompt.
 * @property {readonly string[]} targetIds - Ordered frozen target session ids.
 * @property {readonly string[]} [targetLabels] - Neutral display labels parallel to targetIds.
 * @property {string} [signatureLabel] - Neutral signing-key label.
 * @property {string} [ceilingLabel] - Neutral execution-window ceiling label.
 */

/**
 * @typedef {Object} SaasFrozenReviewRow
 * @property {string} key
 * @property {string} value
 * @property {'digest' | 'eligible' | 'signature' | 'ceiling'} tone
 */

/**
 * Validates the frozen-review shape (fail-closed; never renders a partial review).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, review: SaasFrozenReviewInput } | { ok: false, code: string, message: string }}
 */
export function validateFrozenReviewShape(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'REVIEW_NOT_OBJECT', message: 'Frozen review must be an object.' };
  }
  const candidate = /** @type {Record<string, unknown>} */ (raw);
  if (typeof candidate.promptSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(candidate.promptSha256)) {
    return { ok: false, code: 'REVIEW_BAD_DIGEST', message: 'Frozen review promptSha256 must be 64 lowercase hex.' };
  }
  if (!Array.isArray(candidate.targetIds) || candidate.targetIds.length === 0) {
    return { ok: false, code: 'REVIEW_EMPTY_TARGETS', message: 'Frozen review must freeze at least one target.' };
  }
  for (const id of candidate.targetIds) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      return { ok: false, code: 'REVIEW_BAD_TARGET_ID', message: 'Frozen review target ids must be non-empty strings.' };
    }
  }
  if (candidate.targetLabels !== undefined) {
    if (!Array.isArray(candidate.targetLabels) || candidate.targetLabels.length !== candidate.targetIds.length) {
      return { ok: false, code: 'REVIEW_BAD_LABELS', message: 'Frozen review targetLabels must parallel targetIds.' };
    }
    for (const label of candidate.targetLabels) {
      if (typeof label !== 'string' || label.length === 0) {
        return { ok: false, code: 'REVIEW_BAD_LABEL', message: 'Frozen review target labels must be non-empty strings.' };
      }
    }
  }
  return { ok: true, review: /** @type {SaasFrozenReviewInput} */ (candidate) };
}

/**
 * Shortens a 64-hex digest to the 8+...+6 review shape (`8f3b2a9d...c041ee`).
 *
 * @param {unknown} sha256
 * @returns {string}
 */
export function shortFrozenDigest(sha256) {
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return 'digest unavailable';
  return `${sha256.slice(0, 8)}...${sha256.slice(-6)}`;
}

/**
 * Summarizes eligible targets as `N Eligible (Label-01, Label-02)`.
 *
 * @param {SaasFrozenReviewInput} review
 * @returns {string}
 */
export function eligibleTargetsSummary(review) {
  const labels =
    Array.isArray(review.targetLabels) && review.targetLabels.length === review.targetIds.length
      ? review.targetLabels
      : [...review.targetIds];
  return `${review.targetIds.length} Eligible (${labels.join(', ')})`;
}

/**
 * Projects a validated review into the four schematic rows.
 *
 * @param {SaasFrozenReviewInput} review
 * @returns {readonly SaasFrozenReviewRow[]}
 */
export function projectFrozenReviewRows(review) {
  return Object.freeze([
    Object.freeze({ key: 'SHA-256 Digest:', value: shortFrozenDigest(review.promptSha256), tone: 'digest' }),
    Object.freeze({ key: 'Target Capsules:', value: eligibleTargetsSummary(review), tone: 'eligible' }),
    Object.freeze({
      key: 'Signature Auth:',
      value:
        typeof review.signatureLabel === 'string' && review.signatureLabel.length > 0
          ? review.signatureLabel
          : 'LOCAL SIGNING KEY',
      tone: 'signature'
    }),
    Object.freeze({
      key: 'Max Execution Window:',
      value:
        typeof review.ceilingLabel === 'string' && review.ceilingLabel.length > 0
          ? review.ceilingLabel
          : '60s HARD CEILING',
      tone: 'ceiling'
    })
  ]);
}
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  review: {
    type: Object,
    default: null
  },
  dispatchId: {
    type: String,
    default: ''
  },
  confirmLabel: {
    type: String,
    default: 'Confirm Dispatch (Lock & Broadcast)'
  },
  confirmDisabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['confirm-dispatch']);

const validated = computed(() => {
  if (props.review === null || props.review === undefined) return null;
  const result = validateFrozenReviewShape(props.review);
  return result.ok ? result.review : null;
});

const validationError = computed(() => {
  if (props.review === null || props.review === undefined) return null;
  const result = validateFrozenReviewShape(props.review);
  if (result.ok) return null;
  const failed = /** @type {{ code: string, message: string }} */ (/** @type {unknown} */ (result));
  return { code: failed.code, message: failed.message };
});

const rows = computed(() => (validated.value ? projectFrozenReviewRows(validated.value) : []));

const confirmAnchor = computed(() => saasReviewConfirmAnchor(props.dispatchId));

const confirmBlocked = computed(() => validated.value === null || props.confirmDisabled);

const confirmReason = computed(() => {
  if (validated.value === null) return 'Confirm unavailable: no frozen review staged';
  if (props.confirmDisabled) return 'Confirm unavailable: dispatch locked by the drawer model';
  return '';
});

function onConfirm() {
  if (validated.value === null || props.confirmDisabled) return;
  emit('confirm-dispatch', {
    targetIds: [...validated.value.targetIds],
    promptSha256: validated.value.promptSha256
  });
}
</script>

<template>
  <section
    class="saas-frozen-review"
    role="group"
    aria-label="Frozen review and verification"
  >
    <header class="saas-frozen-review__header">
      <span class="saas-frozen-review__title">Frozen Review &amp; Verification</span>
      <span class="saas-frozen-review__precommit">PRE-COMMIT</span>
    </header>
    <div v-if="validated" class="saas-frozen-review__rows">
      <div
        v-for="row in rows"
        :key="row.key"
        class="saas-frozen-review__row"
        :data-review-tone="row.tone"
      >
        <span class="saas-frozen-review__key">{{ row.key }}</span>
        <span class="saas-frozen-review__value" :class="`saas-frozen-review__value--${row.tone}`">
          {{ row.value }}
        </span>
      </div>
    </div>
    <p v-else-if="validationError" class="saas-frozen-review__invalid" role="alert">
      {{ validationError.code }}: {{ validationError.message }}
    </p>
    <p v-else class="saas-frozen-review__empty" role="status">
      No frozen review staged. Compose a payload and send to freeze a review.
    </p>
    <footer class="saas-frozen-review__footer">
      <button
        id="cuk-saas-review-confirm"
        type="button"
        role="button"
        class="saas-frozen-review__confirm"
        :data-semantic-anchor="confirmAnchor"
        aria-label="Confirm dispatch (lock and broadcast)"
        :disabled="confirmBlocked"
        :aria-disabled="confirmBlocked ? 'true' : 'false'"
        :data-unavailable-reason="confirmReason || undefined"
        :title="confirmReason || 'Confirm dispatch (lock and broadcast)'"
        @click="onConfirm"
      >
        {{ props.confirmLabel }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.saas-frozen-review {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
  min-height: var(--cuk-semantic-size-control-height-md);
}
.saas-frozen-review__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding-bottom: var(--cuk-semantic-spacing-sm);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-frozen-review__title {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  color: var(--cuk-semantic-text-primary);
}
.saas-frozen-review__precommit {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-sm);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-accent);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}
.saas-frozen-review__rows {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
  flex: 1 1 auto;
  overflow: hidden;
}
.saas-frozen-review__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-none);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-frozen-review__key {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-frozen-review__value {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.saas-frozen-review__value--digest,
.saas-frozen-review__value--signature {
  color: var(--cuk-semantic-text-primary);
}
.saas-frozen-review__value--eligible {
  color: var(--cuk-semantic-status-success-text);
}
.saas-frozen-review__value--ceiling {
  color: var(--cuk-semantic-status-warning-text);
}
.saas-frozen-review__empty {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-frozen-review__invalid {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-status-error-text);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-frozen-review__footer {
  padding-top: var(--cuk-semantic-spacing-sm);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-frozen-review__confirm {
  display: flex;
  width: 100%;
  min-height: var(--cuk-semantic-size-control-height-md);
  align-items: center;
  justify-content: center;
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  cursor: pointer;
}
.saas-frozen-review__confirm:disabled {
  cursor: not-allowed;
  color: var(--cuk-semantic-text-disabled);
}
.saas-frozen-review__confirm:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
@media (prefers-reduced-motion: reduce) {
  .saas-frozen-review,
  .saas-frozen-review__confirm {
    transition: none;
  }
}
</style>
