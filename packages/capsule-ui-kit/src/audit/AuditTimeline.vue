<script>
/**
 * Generic audit timeline panel (SAAS-9 audit timeline and receipts).
 * Composes stream tabs, a capsule/verdict filter bar, a virtualised record
 * list and a receipt viewer slot. The host owns every record and applies
 * every filter; the panel emits intents only and never writes anywhere.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module audit/AuditTimeline
 */

/** Emits this component may produce. @type {ReadonlyArray<string>} */
export const AUDIT_TIMELINE_EMITS = Object.freeze(['select-stream', 'select-record', 'filter-change']);

/** Default row height in px for the virtualised list. @type {number} */
export const AUDIT_TIMELINE_ROW_HEIGHT = 44;

/** Default overscan rows above and below the viewport. @type {number} */
export const AUDIT_TIMELINE_OVERSCAN = 4;

/**
 * @param {unknown} value
 * @returns {number} Positive finite row height, or the default.
 */
export function normalizeRowHeight(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : AUDIT_TIMELINE_ROW_HEIGHT;
}

/**
 * @param {unknown} value
 * @returns {number} Non-negative safe overscan, or the default.
 */
export function normalizeOverscan(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : AUDIT_TIMELINE_OVERSCAN;
}

/**
 * Computes the visible slice of a fixed-height virtualised list.
 * @param {{ count?: unknown, rowHeight?: unknown, viewportHeight?: unknown, scrollTop?: unknown, overscan?: unknown }} [input]
 * @returns {Readonly<{ start: number, end: number, top: number, bottom: number }>}
 *   Frozen slice indices plus top/bottom spacer heights in px.
 */
export function visibleWindow(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const count = typeof raw.count === 'number' && Number.isSafeInteger(raw.count) && raw.count > 0
    ? raw.count
    : 0;
  if (count === 0) return Object.freeze({ start: 0, end: 0, top: 0, bottom: 0 });
  const rowHeight = normalizeRowHeight(raw.rowHeight);
  const viewport = typeof raw.viewportHeight === 'number' && Number.isFinite(raw.viewportHeight) && raw.viewportHeight > 0
    ? raw.viewportHeight
    : rowHeight;
  const scroll = typeof raw.scrollTop === 'number' && Number.isFinite(raw.scrollTop) && raw.scrollTop > 0
    ? raw.scrollTop
    : 0;
  const overscan = normalizeOverscan(raw.overscan);
  const start = Math.min(count, Math.max(0, Math.floor(scroll / rowHeight) - overscan));
  const visible = Math.ceil(viewport / rowHeight) + overscan * 2;
  const end = Math.min(count, start + Math.max(1, visible));
  return Object.freeze({ start, end, top: start * rowHeight, bottom: (count - end) * rowHeight });
}

/**
 * @param {unknown} options
 * @returns {Array<{ value: string, label: string }>} Sanitized verdict options.
 */
export function normalizeVerdictOptions(options) {
  if (!Array.isArray(options)) return [];
  const out = [];
  for (const entry of options) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = /** @type {{ value?: unknown, label?: unknown }} */ (entry);
    if (typeof raw.value !== 'string' || raw.value.trim().length === 0) continue;
    const value = raw.value.trim();
    out.push({
      value,
      label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : value,
    });
  }
  return out;
}

/**
 * @returns {Record<string, string>} Stable DOM ids.
 */
export function timelineDomIds() {
  return {
    root: 'cuk-audit-timeline',
    filters: 'cuk-audit-filters',
    capsule: 'cuk-audit-filter-capsule',
    verdict: 'cuk-audit-filter-verdict',
    clear: 'cuk-audit-filter-clear',
    list: 'cuk-audit-list',
    status: 'cuk-audit-status',
    receipt: 'cuk-audit-receipt-wrap',
  };
}

/**
 * @returns {string} Capsule filter anchor (registry row owned by lane A).
 */
export function filterCapsuleAnchor() {
  return 'audit/filter/capsule';
}

/**
 * @returns {string} Verdict filter anchor (registry row owned by lane A).
 */
export function filterVerdictAnchor() {
  return 'audit/filter/verdict';
}

/**
 * @returns {string} Filter clear anchor (registry row owned by lane A).
 */
export function filterClearAnchor() {
  return 'audit/filter/clear';
}

/**
 * @returns {string} Timeline list anchor (registry row owned by lane A).
 */
export function timelineListAnchor() {
  return 'audit/timeline/list';
}

/**
 * @param {{ capsule?: unknown, verdict?: unknown }} input
 * @returns {{ type: string, capsule: string, verdict: string }} Frozen filter intent.
 */
export function buildFilterChangePayload(input) {
  const capsule = typeof input.capsule === 'string' ? input.capsule.trim() : '';
  const verdict = typeof input.verdict === 'string' ? input.verdict.trim() : '';
  return Object.freeze({ type: 'filter-change', capsule, verdict });
}

/**
 * @param {{ count?: unknown }} input
 * @returns {string} Stable list name with an honest count.
 */
export function timelineListName(input) {
  const count = input && typeof input.count === 'number' && Number.isSafeInteger(input.count) && input.count >= 0
    ? input.count
    : null;
  return count === null ? 'Audit timeline' : `Audit timeline, ${count} records`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ streams: Array<Record<string, unknown>>, activeStream: string, records: Array<Record<string, unknown>>, selectedId: string }}
 */
export function auditTimelineFixture(overrides = {}) {
  return {
    streams: [
      { id: 'session-records', label: 'Session Records', count: 2 },
      { id: 'custody-journal', label: 'Custody Journal', count: 0 },
    ],
    activeStream: 'session-records',
    records: [
      {
        id: 'rec-0001',
        seq: 1,
        stamp: '12:04:31',
        actor: 'operator',
        action: 'move pointer',
        capsuleId: 'cap-01',
        result: 'refused',
        refusalCode: 'STALE_FRAME',
        summary: 'Refused on frame 881.',
        receipt: { admitted: 40, refused: 1, uncertain: 0, verdict: 'unverified', hash: '9f2c41ab', method: 'typed review', explanation: '' },
      },
      {
        id: 'rec-0002',
        seq: 2,
        stamp: '12:04:33',
        actor: 'ai',
        action: 'read text',
        capsuleId: 'cap-01',
        result: 'verified',
        refusalCode: '',
        summary: '',
        receipt: { admitted: 12, refused: 0, uncertain: null, verdict: 'verified', hash: '', method: '', explanation: '' },
      },
    ],
    selectedId: 'rec-0001',
    ...overrides,
  };
}
</script>

<script setup>
import { computed, onMounted, ref } from 'vue';
import AuditStreamTabs from './AuditStreamTabs.vue';
import AuditRow from './AuditRow.vue';
import AuditReceipt from './AuditReceipt.vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  streams: { type: Array, default: () => [] },
  activeStream: { type: String, default: '' },
  records: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  capsuleFilter: { type: String, default: '' },
  verdictFilter: { type: String, default: '' },
  verdictOptions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  chainBreak: { type: String, default: '' },
  rowHeight: { type: Number, default: 44 },
  overscan: { type: Number, default: 4 },
});

const emit = defineEmits(['select-stream', 'select-record', 'filter-change']);

const ids = timelineDomIds();
const scroller = ref(null);
const scrollTop = ref(0);
const viewportPx = ref(360);

const recordsArray = computed(() => (Array.isArray(props.records) ? props.records : []));
const verdictList = computed(() => normalizeVerdictOptions(props.verdictOptions));
const rowPx = computed(() => normalizeRowHeight(props.rowHeight));
const listName = computed(() => timelineListName({ count: recordsArray.value.length }));
const win = computed(() =>
  visibleWindow({
    count: recordsArray.value.length,
    rowHeight: props.rowHeight,
    viewportHeight: viewportPx.value,
    scrollTop: scrollTop.value,
    overscan: props.overscan,
  }),
);
const visibleRecords = computed(() => recordsArray.value.slice(win.value.start, win.value.end));
const selectedRecord = computed(() => {
  const wanted = typeof props.selectedId === 'string' ? props.selectedId.trim() : '';
  if (wanted === '') return null;
  for (const entry of recordsArray.value) {
    if (entry && typeof entry === 'object' && /** @type {{ id?: unknown }} */ (entry).id === wanted) {
      return /** @type {Record<string, any>} */ (entry);
    }
  }
  return null;
});
const receiptFields = computed(() => {
  const receipt = selectedRecord.value && typeof selectedRecord.value.receipt === 'object'
    ? selectedRecord.value.receipt
    : {};
  return {
    recordId: selectedRecord.value ? String(selectedRecord.value.id === undefined ? '' : selectedRecord.value.id) : '',
    admitted: typeof receipt.admitted === 'number' ? receipt.admitted : null,
    refused: typeof receipt.refused === 'number' ? receipt.refused : null,
    uncertain: typeof receipt.uncertain === 'number' ? receipt.uncertain : null,
    verdict: typeof receipt.verdict === 'string' ? receipt.verdict : 'unknown',
    hash: typeof receipt.hash === 'string' ? receipt.hash : '',
    method: typeof receipt.method === 'string' ? receipt.method : '',
    explanation: typeof receipt.explanation === 'string' ? receipt.explanation : '',
  };
});

function readViewport() {
  const el = /** @type {{ clientHeight?: unknown } | null} */ (scroller.value);
  const height = el && typeof el.clientHeight === 'number' ? el.clientHeight : 0;
  viewportPx.value = height > 0 ? height : 360;
}

onMounted(readViewport);

/**
 * @param {unknown} event
 */
function onScroll(event) {
  const target = event && typeof event === 'object'
    ? /** @type {{ target?: unknown }} */ (event).target
    : null;
  const top = target && typeof target === 'object'
    ? /** @type {{ scrollTop?: unknown }} */ (target).scrollTop
    : 0;
  scrollTop.value = typeof top === 'number' && Number.isFinite(top) && top > 0 ? top : 0;
  readViewport();
}

/**
 * @param {{ id?: unknown }} record
 * @param {number} index
 * @returns {string} Stable list key.
 */
function recordKey(record, index) {
  if (record && typeof record.id === 'string' && record.id.trim() !== '') return record.id.trim();
  return `audit-fallback-${win.value.start + index}`;
}

/**
 * @param {{ id?: unknown }} record
 * @returns {boolean} True when the row is the selected record.
 */
function isSelected(record) {
  const wanted = typeof props.selectedId === 'string' ? props.selectedId.trim() : '';
  return wanted !== '' && !!record && record.id === wanted;
}

/**
 * @param {{ streamId: string }} payload
 */
function forwardStream(payload) {
  emit('select-stream', payload);
}

/**
 * @param {{ recordId: string }} payload
 */
function forwardRecord(payload) {
  emit('select-record', payload);
}

/**
 * @param {unknown} event
 */
function onCapsuleInput(event) {
  const target = event && typeof event === 'object'
    ? /** @type {{ target?: unknown }} */ (event).target
    : null;
  const value = target && typeof target === 'object'
    ? String(/** @type {{ value?: unknown }} */ (target).value === undefined
      ? ''
      : /** @type {{ value?: unknown }} */ (target).value)
    : '';
  emit('filter-change', buildFilterChangePayload({ capsule: value, verdict: props.verdictFilter }));
}

/**
 * @param {unknown} event
 */
function onVerdictChange(event) {
  const target = event && typeof event === 'object'
    ? /** @type {{ target?: unknown }} */ (event).target
    : null;
  const value = target && typeof target === 'object'
    ? String(/** @type {{ value?: unknown }} */ (target).value === undefined
      ? ''
      : /** @type {{ value?: unknown }} */ (target).value)
    : '';
  emit('filter-change', buildFilterChangePayload({ capsule: props.capsuleFilter, verdict: value }));
}

function onClearFilters() {
  emit('filter-change', buildFilterChangePayload({ capsule: '', verdict: '' }));
}
</script>

<template>
  <section :id="ids.root" class="audit-timeline" role="region" aria-label="Audit timeline">
    <AuditStreamTabs :streams="props.streams" :active-stream="props.activeStream" @select-stream="forwardStream" />
    <div :id="ids.filters" class="audit-filters" role="search" aria-label="Record filters">
      <label :for="ids.capsule" class="audit-filters-label">Capsule</label>
      <input
        :id="ids.capsule"
        class="audit-filters-capsule"
        type="search"
        role="searchbox"
        :data-semantic-anchor="filterCapsuleAnchor()"
        aria-label="Filter by capsule id"
        placeholder="Capsule id"
        :value="props.capsuleFilter"
        @input="onCapsuleInput"
      />
      <label :for="ids.verdict" class="audit-filters-label">Verdict</label>
      <select
        :id="ids.verdict"
        class="audit-filters-verdict"
        role="combobox"
        :data-semantic-anchor="filterVerdictAnchor()"
        aria-label="Filter by verdict"
        :value="props.verdictFilter"
        @change="onVerdictChange"
      >
        <option value="">All verdicts</option>
        <option v-for="opt in verdictList" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <button
        :id="ids.clear"
        type="button"
        role="button"
        class="audit-filters-clear"
        :data-semantic-anchor="filterClearAnchor()"
        aria-label="Clear filters"
        @click="onClearFilters"
      >
        Clear
      </button>
    </div>
    <div v-if="props.chainBreak !== ''" :id="ids.status" class="audit-chain-break" role="alert">
      {{ props.chainBreak }}
    </div>
    <div v-else-if="props.loading" :id="ids.status" class="audit-loading" role="status" aria-busy="true">
      <span class="audit-loading-row" aria-hidden="true"></span>
      <span>Loading records</span>
    </div>
    <div v-else-if="recordsArray.length === 0" :id="ids.status" class="audit-empty" role="status">
      No records in range.
    </div>
    <div
      v-else
      :id="ids.list"
      ref="scroller"
      class="audit-list"
      role="list"
      :aria-label="listName"
      :data-semantic-anchor="timelineListAnchor()"
      @scroll="onScroll"
    >
      <div class="audit-spacer" :style="{ height: win.top + 'px' }" aria-hidden="true"></div>
      <AuditRow
        v-for="(record, index) in visibleRecords"
        :key="recordKey(record, index)"
        :record="record"
        :selected="isSelected(record)"
        :style="{ height: rowPx + 'px' }"
        @select-record="forwardRecord"
      />
      <div class="audit-spacer" :style="{ height: win.bottom + 'px' }" aria-hidden="true"></div>
    </div>
    <div :id="ids.receipt" class="audit-receipt-wrap">
      <slot name="receipt" :record="selectedRecord">
        <AuditReceipt
          v-if="selectedRecord !== null"
          :record-id="receiptFields.recordId"
          :admitted="receiptFields.admitted"
          :refused="receiptFields.refused"
          :uncertain="receiptFields.uncertain"
          :verdict="receiptFields.verdict"
          :hash="receiptFields.hash"
          :method="receiptFields.method"
          :explanation="receiptFields.explanation"
        />
        <p v-else class="audit-receipt-empty" role="status">No record selected.</p>
      </slot>
    </div>
  </section>
</template>

<style>
.audit-timeline {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  padding: var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
}
.audit-filters {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  flex-wrap: wrap;
}
.audit-filters-label {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.audit-filters-capsule,
.audit-filters-verdict {
  height: 32px;
  padding: 0 var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  background: var(--cuk-semantic-surface-sunken);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  min-width: 0;
}
.audit-filters-capsule {
  width: 160px;
}
.audit-filters-verdict {
  max-width: 200px;
}
.audit-filters-clear {
  height: 32px;
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  background: var(--cuk-semantic-surface-interactive);
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  line-height: 1;
  cursor: pointer;
}
.audit-filters-clear:hover {
  background: var(--cuk-semantic-surface-interactive-hover);
}
.audit-chain-break {
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-error-border);
  background: var(--cuk-semantic-status-error-surface);
  color: var(--cuk-semantic-status-error-text);
  border-radius: var(--cuk-semantic-radius-sm);
  padding: var(--cuk-primitive-space-3);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.audit-loading,
.audit-empty {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  padding: var(--cuk-primitive-space-3) 0;
}
.audit-loading-row {
  display: block;
  width: 120px;
  height: 12px;
  border-radius: var(--cuk-semantic-radius-xs);
  background: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.audit-list {
  max-height: 360px;
  overflow-y: auto;
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-canvas);
}
.audit-spacer {
  width: 1px;
}
.audit-receipt-wrap {
  min-width: 0;
}
.audit-receipt-empty {
  margin: 0;
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-font-size-sm);
}
.audit-filters-capsule:focus-visible,
.audit-filters-verdict:focus-visible,
.audit-filters-clear:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: 1px;
}
</style>
