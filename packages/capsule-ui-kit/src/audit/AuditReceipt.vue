<script>
/**
 * Generic audit receipt viewer (SAAS-9 receipt detail).
 * Display-only: the host supplies counts, gate verdict, hash, method and
 * explanation. Unknown numbers render as unknown, never as zero.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module audit/AuditReceipt
 */

/** Emits this component may produce. @type {ReadonlyArray<string>} */
export const AUDIT_RECEIPT_EMITS = Object.freeze([]);

/** Known gate verdicts. @type {ReadonlyArray<string>} */
export const AUDIT_GATE_VERDICTS = Object.freeze(['verified', 'unverified']);

/**
 * @param {unknown} value
 * @returns {string|null} Count text (real zeros render as `0`), or null when unknown.
 */
export function formatReceiptCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return String(Math.trunc(value));
}

/**
 * @param {unknown} verdict
 * @returns {string} `verified`, `unverified` or `unknown`.
 */
export function normalizeGateVerdict(verdict) {
  return AUDIT_GATE_VERDICTS.includes(/** @type {string} */ (verdict))
    ? /** @type {string} */ (verdict)
    : 'unknown';
}

/**
 * @param {unknown} verdict
 * @returns {{ label: string, tone: string }} Frozen gate chip descriptor.
 */
export function gateChip(verdict) {
  const normalized = normalizeGateVerdict(verdict);
  if (normalized === 'verified') return Object.freeze({ label: 'VERIFIED', tone: 'success' });
  if (normalized === 'unverified') return Object.freeze({ label: 'UNVERIFIED', tone: 'error' });
  return Object.freeze({ label: 'UNKNOWN', tone: 'neutral' });
}

/**
 * @param {unknown} value
 * @returns {string|null} Trimmed text, or null when unknown.
 */
export function formatReceiptText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {string} recordId
 * @returns {Record<string, string>} Stable DOM ids.
 */
export function receiptDomIds(recordId) {
  const id = typeof recordId === 'string' && recordId.trim() !== '' ? recordId.trim() : 'unknown';
  return {
    root: `cuk-audit-receipt-${id}`,
    counts: `cuk-audit-receipt-counts-${id}`,
    gate: `cuk-audit-receipt-gate-${id}`,
    hash: `cuk-audit-receipt-hash-${id}`,
    method: `cuk-audit-receipt-method-${id}`,
  };
}

/**
 * @param {string} recordId
 * @returns {{ counts: string, gate: string }} Semantic anchors (registry rows owned by lane A).
 */
export function receiptAnchors(recordId) {
  const id = typeof recordId === 'string' && recordId.trim() !== '' ? recordId.trim() : 'unknown';
  return {
    counts: `audit/receipt/${id}/counts`,
    gate: `audit/receipt/${id}/gate`,
  };
}

/**
 * @param {string} recordId
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function receiptAccessibleName(recordId) {
  const id = typeof recordId === 'string' && recordId.trim() !== '' ? recordId.trim() : 'unknown record';
  return `Receipt for ${id}`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ recordId: string, admitted: number|null, refused: number|null, uncertain: number|null, verdict: string, hash: string, method: string, explanation: string }}
 */
export function auditReceiptFixture(overrides = {}) {
  return {
    recordId: 'rec-0001',
    admitted: 41,
    refused: 2,
    uncertain: 0,
    verdict: 'verified',
    hash: '9f2c41ab',
    method: 'typed review',
    explanation: 'Two frames refused on stale views.',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  recordId: { type: String, default: '' },
  admitted: { type: Number, default: null },
  refused: { type: Number, default: null },
  uncertain: { type: Number, default: null },
  verdict: { type: String, default: 'unknown' },
  hash: { type: String, default: '' },
  method: { type: String, default: '' },
  explanation: { type: String, default: '' },
});

const ids = computed(() => receiptDomIds(props.recordId));
const anchors = computed(() => receiptAnchors(props.recordId));
const accessibleName = computed(() => receiptAccessibleName(props.recordId));
const gate = computed(() => gateChip(props.verdict));
const admittedText = computed(() => formatReceiptCount(props.admitted));
const refusedText = computed(() => formatReceiptCount(props.refused));
const uncertainText = computed(() => formatReceiptCount(props.uncertain));
const hashText = computed(() => formatReceiptText(props.hash));
const methodText = computed(() => formatReceiptText(props.method));
const explanationText = computed(() => formatReceiptText(props.explanation));
const gateName = computed(() => `Gate verdict: ${gate.value.label}`);
</script>

<template>
  <section :id="ids.root" class="audit-receipt" role="region" :aria-label="accessibleName">
    <div :id="ids.counts" class="audit-receipt-counts" role="region" aria-label="Frame counts" :data-semantic-anchor="anchors.counts">
      <span class="audit-receipt-count">
        <span class="audit-receipt-count-label">Admitted</span>
        <span class="audit-receipt-count-value" :class="{ 'audit-receipt-unknown': admittedText === null }">{{ admittedText === null ? 'unknown' : admittedText }}</span>
      </span>
      <span class="audit-receipt-count">
        <span class="audit-receipt-count-label">Refused</span>
        <span class="audit-receipt-count-value" :class="{ 'audit-receipt-unknown': refusedText === null }">{{ refusedText === null ? 'unknown' : refusedText }}</span>
      </span>
      <span class="audit-receipt-count">
        <span class="audit-receipt-count-label">Uncertain</span>
        <span class="audit-receipt-count-value" :class="{ 'audit-receipt-unknown': uncertainText === null }">{{ uncertainText === null ? 'unknown' : uncertainText }}</span>
      </span>
    </div>
    <div :id="ids.gate" class="audit-receipt-gate" role="status" :aria-label="gateName" :data-semantic-anchor="anchors.gate">
      <span class="audit-receipt-gate-chip" :class="'audit-receipt-tone-' + gate.tone">{{ gate.label }}</span>
    </div>
    <div :id="ids.hash" class="audit-receipt-hash" :class="{ 'audit-receipt-unknown': hashText === null }">
      {{ hashText === null ? 'hash unknown' : hashText }}
    </div>
    <div v-if="methodText !== null" :id="ids.method" class="audit-receipt-method">{{ methodText }}</div>
    <p v-if="explanationText !== null" class="audit-receipt-explain">{{ explanationText }}</p>
  </section>
</template>

<style>
.audit-receipt {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  padding: var(--cuk-primitive-space-3);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
}
.audit-receipt-counts {
  display: flex;
  gap: var(--cuk-primitive-space-4);
  flex-wrap: wrap;
}
.audit-receipt-count {
  display: inline-flex;
  align-items: baseline;
  gap: var(--cuk-primitive-space-2);
}
.audit-receipt-count-label {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.audit-receipt-count-value {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
}
.audit-receipt-unknown {
  color: var(--cuk-semantic-text-disabled);
}
.audit-receipt-gate {
  display: flex;
}
.audit-receipt-gate-chip {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  border-radius: var(--cuk-semantic-radius-pill);
  padding: 1px var(--cuk-primitive-space-2);
  line-height: 1.4;
  border: var(--cuk-semantic-border-width) solid transparent;
}
.audit-receipt-tone-success {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.audit-receipt-tone-error {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
.audit-receipt-tone-neutral {
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-sunken);
  border-color: var(--cuk-semantic-border-subtle);
}
.audit-receipt-hash {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.audit-receipt-method {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
}
.audit-receipt-explain {
  margin: 0;
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
}
</style>
