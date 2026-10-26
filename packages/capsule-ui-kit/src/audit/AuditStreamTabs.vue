<script>
/**
 * Generic audit stream tabs (SAAS-9 stream tabs).
 * The host supplies the stream list; unknown counts are omitted, never
 * zero-filled. Selection emits an intent only; the host owns the records.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module audit/AuditStreamTabs
 */

/** Emits this component may produce. @type {ReadonlyArray<string>} */
export const AUDIT_STREAM_TABS_EMITS = Object.freeze(['select-stream']);

/**
 * @param {unknown} streams
 * @returns {Array<{ id: string, label: string, count: unknown }>} Sanitized
 *   streams; entries without a string id are dropped.
 */
export function normalizeStreams(streams) {
  if (!Array.isArray(streams)) return [];
  const out = [];
  for (const entry of streams) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = /** @type {{ id?: unknown, label?: unknown, count?: unknown }} */ (entry);
    if (typeof raw.id !== 'string' || raw.id.trim().length === 0) continue;
    const id = raw.id.trim();
    out.push({
      id,
      label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : id,
      count: raw.count,
    });
  }
  return out;
}

/**
 * @param {unknown} count
 * @returns {string|null} Count text, or null when unknown (never a fake zero).
 */
export function formatStreamCount(count) {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  return String(Math.trunc(count));
}

/**
 * @param {string} streamId
 * @returns {string} Stable tab DOM id.
 */
export function streamTabDomId(streamId) {
  return `cuk-audit-stream-tab-${streamId}`;
}

/**
 * @returns {string} Stable tablist DOM id.
 */
export function streamTabsDomId() {
  return 'cuk-audit-stream-tabs';
}

/**
 * @param {string} streamId
 * @returns {string} Semantic anchor (registry row owned by lane A).
 */
export function streamTabAnchor(streamId) {
  return `audit/stream/${streamId}/tab`;
}

/**
 * @param {{ label: string, count?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function streamTabAccessibleName(input) {
  const count = formatStreamCount(input.count);
  return count === null ? input.label : `${input.label}, ${count} records`;
}

/**
 * @param {{ streamId: string }} input
 * @returns {{ type: string, streamId: string }} Intent payload.
 */
export function buildSelectStreamPayload(input) {
  return Object.freeze({ type: 'select-stream', streamId: input.streamId });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ streams: Array<{ id: string, label: string, count: unknown }>, activeStream: string }}
 */
export function auditStreamTabsFixture(overrides = {}) {
  return {
    streams: [
      { id: 'session-records', label: 'Session Records', count: 12 },
      { id: 'custody-journal', label: 'Custody Journal', count: 3 },
      { id: 'identity-audit', label: 'Identity Audit', count: 0 },
      { id: 'egress-proxy', label: 'Egress Proxy', count: null },
    ],
    activeStream: 'session-records',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  streams: { type: Array, default: () => [] },
  activeStream: { type: String, default: '' },
});

const emit = defineEmits(['select-stream']);

const listId = computed(() => streamTabsDomId());
const tabs = computed(() =>
  normalizeStreams(props.streams).map((stream) => ({
    id: stream.id,
    label: stream.label,
    countText: formatStreamCount(stream.count),
    name: streamTabAccessibleName(stream),
  })),
);

/**
 * @param {string} id
 * @returns {boolean} True when the tab is the active stream.
 */
function isActive(id) {
  return id === props.activeStream;
}

/**
 * @param {string} id
 */
function onSelect(id) {
  if (id === props.activeStream) return;
  emit('select-stream', buildSelectStreamPayload({ streamId: id }));
}
</script>

<template>
  <div :id="listId" class="audit-streams" role="tablist" aria-label="Journal streams">
    <span v-if="tabs.length === 0" class="audit-streams-empty" role="status">No streams</span>
    <button
      v-for="stream in tabs"
      :key="stream.id"
      :id="streamTabDomId(stream.id)"
      type="button"
      role="tab"
      class="audit-streams-tab"
      :class="{ 'audit-streams-tab-active': isActive(stream.id) }"
      :data-semantic-anchor="streamTabAnchor(stream.id)"
      :aria-label="stream.name"
      :aria-selected="isActive(stream.id) ? 'true' : 'false'"
      @click="onSelect(stream.id)"
    >
      <span class="audit-streams-label">{{ stream.label }}</span>
      <span v-if="stream.countText !== null" class="audit-streams-count">{{ stream.countText }}</span>
    </button>
  </div>
</template>

<style>
.audit-streams {
  display: flex;
  align-items: stretch;
  gap: var(--cuk-primitive-space-2);
  flex-wrap: wrap;
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  padding-bottom: var(--cuk-primitive-space-2);
}
.audit-streams-empty {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-muted);
  padding: var(--cuk-primitive-space-2) 0;
}
.audit-streams-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: 32px;
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  background: transparent;
  color: var(--cuk-semantic-text-secondary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.audit-streams-tab:hover {
  background: var(--cuk-semantic-surface-interactive-hover);
  color: var(--cuk-semantic-text-primary);
}
.audit-streams-tab-active {
  background: var(--cuk-semantic-surface-interactive);
  color: var(--cuk-semantic-text-primary);
  border-bottom: 2px solid var(--cuk-semantic-accent-primary);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
.audit-streams-count {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-sunken);
  border-radius: var(--cuk-semantic-radius-pill);
  padding: 1px var(--cuk-primitive-space-2);
  line-height: 1.4;
}
.audit-streams-tab:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: 1px;
}
</style>
