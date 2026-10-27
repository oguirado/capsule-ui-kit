<script>
/**
 * Generic audit timeline row: one session record with actor, action,
 * capsule id, result and refusal reason.
 * Unknown fields render as unknown, never as invented values; the exact
 * refusal code stays visible next to its human text.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module audit/AuditRow
 */

/** Emits this component may produce. @type {ReadonlyArray<string>} */
export const AUDIT_ROW_EMITS = Object.freeze(['select-record']);

/** Known actor values. @type {ReadonlyArray<string>} */
export const AUDIT_ACTORS = Object.freeze(['operator', 'ai']);

/** Known result values across journal streams. @type {ReadonlyArray<string>} */
export const AUDIT_RESULTS = Object.freeze([
  'admitted',
  'refused',
  'executed',
  'verified',
  'approved',
  'denied',
  'private',
  'acquire',
  'reclaim',
  'uncertain',
]);

/**
 * @param {unknown} actor
 * @returns {string} `operator`, `ai` or `unknown`.
 */
export function normalizeActor(actor) {
  return AUDIT_ACTORS.includes(/** @type {string} */ (actor))
    ? /** @type {string} */ (actor)
    : 'unknown';
}

/**
 * @param {unknown} actor
 * @returns {{ label: string, tone: string }} Frozen actor chip descriptor.
 */
export function actorChip(actor) {
  const normalized = normalizeActor(actor);
  if (normalized === 'operator') return Object.freeze({ label: 'Operator', tone: 'info' });
  if (normalized === 'ai') return Object.freeze({ label: 'Agent', tone: 'accent' });
  return Object.freeze({ label: 'Unknown', tone: 'neutral' });
}

/**
 * @param {unknown} result
 * @returns {string} Known result, or `unknown`.
 */
export function normalizeResult(result) {
  return AUDIT_RESULTS.includes(/** @type {string} */ (result))
    ? /** @type {string} */ (result)
    : 'unknown';
}

/**
 * @param {unknown} result
 * @returns {{ label: string, tone: string }} Frozen result chip descriptor.
 */
export function resultChip(result) {
  const normalized = normalizeResult(result);
  if (normalized === 'refused' || normalized === 'denied') {
    return Object.freeze({ label: normalized.toUpperCase(), tone: 'error' });
  }
  if (normalized === 'verified' || normalized === 'admitted' || normalized === 'approved') {
    return Object.freeze({ label: normalized.toUpperCase(), tone: 'success' });
  }
  if (normalized === 'executed' || normalized === 'acquire' || normalized === 'reclaim') {
    return Object.freeze({ label: normalized.toUpperCase(), tone: 'info' });
  }
  if (normalized === 'uncertain' || normalized === 'private') {
    return Object.freeze({ label: normalized.toUpperCase(), tone: 'warning' });
  }
  return Object.freeze({ label: 'UNKNOWN', tone: 'neutral' });
}

/**
 * @param {unknown} result
 * @returns {boolean} True when the result carries a refusal reason.
 */
export function refusalExpected(result) {
  const normalized = normalizeResult(result);
  return normalized === 'refused' || normalized === 'denied';
}

/**
 * @param {unknown} seq
 * @returns {string|null} Sequence text (`#n` from 1), or null when unknown.
 */
export function formatSeq(seq) {
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 1) return null;
  return `#${seq}`;
}

/**
 * Trims host-supplied free text.
 * @param {unknown} value
 * @returns {string|null} Trimmed text, or null when unknown.
 */
export function formatRecordText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalizes one host-supplied record into display-ready fields.
 * @param {unknown} record
 * @returns {Readonly<{ id: string, seqText: string|null, stampText: string|null, actor: string, actionText: string|null, capsuleText: string|null, result: string, refusalCode: string, summaryText: string|null }>}
 */
export function normalizeAuditRecord(record) {
  const source = record && typeof record === 'object'
    ? /** @type {Record<string, unknown>} */ (record)
    : {};
  const rawId = source.id;
  return Object.freeze({
    id: typeof rawId === 'string' ? rawId.trim() : '',
    seqText: formatSeq(source.seq),
    stampText: formatRecordText(source.stamp),
    actor: normalizeActor(source.actor),
    actionText: formatRecordText(source.action),
    capsuleText: formatRecordText(source.capsuleId),
    result: normalizeResult(source.result),
    refusalCode: typeof source.refusalCode === 'string' ? source.refusalCode.trim() : '',
    summaryText: formatRecordText(source.summary),
  });
}

/**
 * @param {string} recordId
 * @returns {string} Stable row DOM id.
 */
export function rowDomId(recordId) {
  const id = typeof recordId === 'string' ? recordId.trim() : '';
  return id === '' ? 'cuk-audit-row-unidentified' : `cuk-audit-row-${id}`;
}

/**
 * @param {string} recordId
 * @returns {string} Semantic anchor, or '' when the record has no id.
 */
export function rowAnchor(recordId) {
  const id = typeof recordId === 'string' ? recordId.trim() : '';
  return id === '' ? '' : `audit/record/${id}/select`;
}

/**
 * @param {{ seqText: string|null, resultLabel: string, capsuleText: string|null, actorLabel: string, refusalCode: string }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function rowAccessibleName(input) {
  const parts = [
    `Record ${input.seqText === null ? 'unknown' : input.seqText}`,
    input.resultLabel,
    `capsule ${input.capsuleText === null ? 'unknown' : input.capsuleText}`,
    input.actorLabel,
  ];
  if (input.refusalCode !== '') parts.push(input.refusalCode);
  return parts.join(', ');
}

/**
 * @param {{ recordId: string }} input
 * @returns {{ type: string, recordId: string }} Intent payload.
 */
export function buildSelectRecordPayload(input) {
  return Object.freeze({ type: 'select-record', recordId: input.recordId });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ record: Record<string, unknown>, selected: boolean }}
 */
export function auditRowFixture(overrides = {}) {
  return {
    record: {
      id: 'rec-0001',
      seq: 12,
      stamp: '12:04:31',
      actor: 'operator',
      action: 'move pointer',
      capsuleId: 'cap-01',
      result: 'refused',
      refusalCode: 'STALE_FRAME',
      summary: 'Refused on frame 881.',
    },
    selected: false,
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
import { refusalChip } from './auditRefusals.js';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  record: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});

const emit = defineEmits(['select-record']);

const view = computed(() => normalizeAuditRecord(props.record));
const actor = computed(() => actorChip(view.value.actor));
const result = computed(() => resultChip(view.value.result));
const refusal = computed(() => refusalChip(view.value.refusalCode));
const showRefusal = computed(() => refusalExpected(view.value.result));
const domId = computed(() => rowDomId(view.value.id));
const anchor = computed(() => rowAnchor(view.value.id));
const accessibleName = computed(() =>
  rowAccessibleName({
    seqText: view.value.seqText,
    resultLabel: result.value.label,
    capsuleText: view.value.capsuleText,
    actorLabel: actor.value.label,
    refusalCode: showRefusal.value ? refusal.value.code : '',
  }),
);
const titleText = computed(() => {
  const detail = showRefusal.value
    ? (refusal.value.code === '' ? refusal.value.text : `${refusal.value.code}: ${refusal.value.text}`)
    : (view.value.summaryText === null ? '' : view.value.summaryText);
  const head = `${view.value.seqText === null ? 'Record unknown' : `Record ${view.value.seqText}`} — ${result.value.label}`;
  return detail === '' ? head : `${head} — ${detail}`;
});

/**
 * @param {string|null} value
 * @returns {string} Display text with honest unknown.
 */
function displayOrUnknown(value) {
  return value === null ? 'unknown' : value;
}

function onSelect() {
  if (view.value.id === '') return;
  emit('select-record', buildSelectRecordPayload({ recordId: view.value.id }));
}
</script>

<template>
  <button
    :id="domId"
    type="button"
    role="button"
    class="audit-row"
    :class="{ 'audit-row-selected': props.selected }"
    :data-semantic-anchor="anchor || ('settings/control-' + domId)"
    :aria-label="accessibleName"
    :aria-pressed="props.selected ? 'true' : 'false'"
    :title="titleText"
    @click="onSelect"
  >
    <span class="audit-row-line">
      <span class="audit-row-seq" :class="{ 'audit-row-unknown': view.seqText === null }">{{ displayOrUnknown(view.seqText) }}</span>
      <span class="audit-row-stamp" :class="{ 'audit-row-unknown': view.stampText === null }">{{ displayOrUnknown(view.stampText) }}</span>
      <span class="audit-row-chip" :class="'audit-row-tone-' + actor.tone">{{ actor.label }}</span>
      <span class="audit-row-action" :class="{ 'audit-row-unknown': view.actionText === null }">{{ displayOrUnknown(view.actionText) }}</span>
      <span class="audit-row-capsule" :class="{ 'audit-row-unknown': view.capsuleText === null }">{{ displayOrUnknown(view.capsuleText) }}</span>
      <span class="audit-row-chip" :class="'audit-row-tone-' + result.tone">{{ result.label }}</span>
    </span>
    <span v-if="showRefusal" class="audit-row-line audit-row-detail">
      <span v-if="refusal.code !== ''" class="audit-row-code">{{ refusal.code }}</span>
      <span class="audit-row-refusal" :class="{ 'audit-row-unknown': refusal.code === '' }">{{ refusal.text }}</span>
    </span>
    <span v-else-if="view.summaryText !== null" class="audit-row-line audit-row-detail">
      <span class="audit-row-summary">{{ view.summaryText }}</span>
    </span>
  </button>
</template>

<style>
.audit-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  width: 100%;
  overflow: hidden;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  padding: 2px var(--cuk-primitive-space-3);
  cursor: pointer;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
}
.audit-row:hover {
  background: var(--cuk-semantic-surface-interactive-hover);
}
.audit-row-selected {
  background: var(--cuk-semantic-selection-background);
}
.audit-row-line {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  min-width: 0;
  white-space: nowrap;
}
.audit-row-detail {
  min-height: 16px;
}
.audit-row-seq {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
  flex: none;
  min-width: 34px;
}
.audit-row-stamp {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
  flex: none;
}
.audit-row-action {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
  min-width: 0;
}
.audit-row-capsule {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  flex: none;
  max-width: 120px;
}
.audit-row-chip {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  border-radius: var(--cuk-semantic-radius-pill);
  padding: 1px var(--cuk-primitive-space-2);
  line-height: 1.4;
  flex: none;
  border: var(--cuk-semantic-border-width) solid transparent;
}
.audit-row-code {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-error-border);
  border-radius: var(--cuk-semantic-radius-xs);
  padding: 0 var(--cuk-primitive-space-1);
  flex: none;
}
.audit-row-refusal,
.audit-row-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-secondary);
  min-width: 0;
}
.audit-row-unknown {
  color: var(--cuk-semantic-text-disabled);
}
.audit-row-tone-info {
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.audit-row-tone-accent {
  color: var(--cuk-semantic-text-accent);
  background: var(--cuk-semantic-accent-secondary-container);
  border-color: var(--cuk-semantic-accent-secondary);
}
.audit-row-tone-neutral {
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-sunken);
  border-color: var(--cuk-semantic-border-subtle);
}
.audit-row-tone-success {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.audit-row-tone-error {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
.audit-row-tone-warning {
  color: var(--cuk-semantic-status-warning-text);
  background: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.audit-row:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: -2px;
}
</style>
