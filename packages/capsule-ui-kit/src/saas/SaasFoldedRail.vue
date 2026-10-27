<script>
/**
 * Generic SaaS folded-capsule rail (SAAS-1 §2 multislot fold).
 * Fold is presentation-only: 0ms, without unmounting surface or PTY.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module saas/SaasFoldedRail
 */

/** Folded card states. @type {ReadonlyArray<string>} */
export const SAAS_FOLDED_CARD_STATES = Object.freeze(['idle', 'busy', 'attention', 'error']);

/**
 * @param {unknown} state
 * @returns {string} Known state, falling back to `idle`.
 */
export function normalizeFoldedCardState(state) {
  return SAAS_FOLDED_CARD_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'idle';
}

/**
 * @param {unknown} state
 * @returns {{ label: string, tone: string }} State chip descriptor.
 */
export function foldedStateChip(state) {
  const normalized = normalizeFoldedCardState(state);
  if (normalized === 'busy') return { label: 'BUSY', tone: 'warning' };
  if (normalized === 'attention') return { label: 'ATTENTION', tone: 'info' };
  if (normalized === 'error') return { label: 'FAULT', tone: 'error' };
  return { label: 'IDLE', tone: 'success' };
}

/**
 * @param {unknown} badges
 * @returns {Array<{ key: string, text: string }>} SURFACE/TERM/PORT badges; unknown omitted.
 */
export function foldedMiniBadges(badges) {
  const source = badges && typeof badges === 'object' ? badges : {};
  const out = [];
  for (const key of ['surface', 'terminal', 'port']) {
    const value = source[key];
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    const prefix = key === 'surface' ? 'SURFACE' : key === 'terminal' ? 'TERM' : 'PORT';
    out.push({ key, text: `${prefix}: ${value.trim()}` });
  }
  return out;
}

/**
 * @param {unknown} rows
 * @returns {Array<{ key: string, value: string, tone: string }>} Telemetry rows; unknown omitted.
 */
export function foldedTelemetryRows(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.key !== 'string' || typeof row.value !== 'string') continue;
    if (row.key.trim().length === 0 || row.value.trim().length === 0) continue;
    const tone = row.tone === 'success' || row.tone === 'warning' || row.tone === 'error'
      ? row.tone
      : 'neutral';
    out.push({ key: row.key.trim(), value: row.value.trim(), tone });
  }
  return out;
}

/**
 * @param {string} capsuleId
 * @returns {{ card: string, restore: string }} Stable DOM ids.
 */
export function foldedCardDomIds(capsuleId) {
  return {
    card: `cuk-saas-folded-card-${capsuleId}`,
    restore: `cuk-saas-folded-restore-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor (existing `capsule/{id}/show` family: restore = show).
 */
export function foldedRestoreAnchor(capsuleId) {
  return `capsule/${capsuleId}/show`;
}

/**
 * @param {{ capsuleId: string }} input
 * @returns {{ capsuleId: string, folded: boolean }} Fold payload (MultiSlot `fold-change` shape).
 */
export function buildUnfoldPayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId, folded: false });
}

/**
 * @param {{ capsuleIds: Array<string> }} input
 * @returns {{ type: string, capsuleIds: Array<string> }} Bulk unfold intent.
 */
export function buildUnfoldAllIntent(input) {
  return Object.freeze({
    type: 'unfold-all',
    capsuleIds: Object.freeze([...input.capsuleIds]),
  });
}

/**
 * @param {{ capsuleId: string }} input
 * @returns {{ type: string, capsuleId: string }} Dock intent.
 */
export function buildDockIntent(input) {
  return Object.freeze({ type: 'dock', capsuleId: input.capsuleId });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsules: Array<Record<string, any>>, dockDisabled: boolean, dockReason: string }}
 */
export function saasFoldedRailFixture(overrides = {}) {
  return {
    capsules: [
      {
        capsuleId: 'capsule-05',
        capsuleLabel: 'Capsule-05',
        state: 'idle',
        badges: { surface: 'guest', terminal: 'shell', port: '8080' },
        telemetry: [
          { key: 'RAM USAGE', value: '142MB / 512MB', tone: 'neutral' },
          { key: 'CPU TICK', value: '0.4%', tone: 'success' },
          { key: 'LAST I/O', value: '4m ago', tone: 'neutral' },
        ],
      },
    ],
    dockDisabled: false,
    dockReason: '',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsules: { type: Array, default: () => [] },
  dockDisabled: { type: Boolean, default: false },
  dockReason: { type: String, default: '' },
});

const emit = defineEmits(['fold-change', 'submit-intent']);

const count = computed(() => props.capsules.length);
const railTitle = computed(() => `FOLDED CAPSULES (${count.value})`);
const allIds = computed(() =>
  props.capsules.map((capsule) => capsule.capsuleId).filter((id) => typeof id === 'string'),
);

function cardLabel(capsule) {
  return (capsule.capsuleLabel || '').trim() || capsule.capsuleId;
}

function unfoldAll() {
  if (allIds.value.length === 0) return;
  emit('submit-intent', buildUnfoldAllIntent({ capsuleIds: allIds.value }));
}

function restore(capsuleId) {
  emit('fold-change', buildUnfoldPayload({ capsuleId }));
}

function dock() {
  if (props.dockDisabled) return;
  emit('submit-intent', buildDockIntent({ capsuleId: '' }));
}
</script>

<template>
  <aside id="cuk-saas-folded-rail" class="saas-rail" role="complementary" aria-label="Folded capsules">
    <div class="saas-rail-head">
      <span class="saas-rail-title">{{ railTitle }}</span>
      <button
        id="cuk-saas-folded-unfold" data-semantic-anchor="shell/navigation/folded-unfold"
        type="button"
        role="button"
        class="saas-rail-unfold"
        aria-label="Unfold all folded capsules"
        :disabled="count === 0"
        @click="unfoldAll"
      >Unfold</button>
    </div>
    <div class="saas-rail-cards" role="list" aria-label="Folded capsule cards">
      <div
        v-for="capsule in capsules"
        :key="capsule.capsuleId"
        :id="foldedCardDomIds(capsule.capsuleId).card"
        class="saas-rail-card"
        role="listitem"
      >
        <div class="saas-rail-card-head">
          <span class="saas-rail-card-name">{{ cardLabel(capsule) }}</span>
          <span :class="'saas-rail-state saas-rail-state-' + foldedStateChip(capsule.state).tone">{{
            foldedStateChip(capsule.state).label
          }}</span>
        </div>
        <div v-if="foldedMiniBadges(capsule.badges).length > 0" class="saas-rail-badges">
          <span v-for="badge in foldedMiniBadges(capsule.badges)" :key="badge.key" class="saas-rail-badge">{{ badge.text }}</span>
        </div>
        <div v-if="foldedTelemetryRows(capsule.telemetry).length > 0" class="saas-rail-telemetry">
          <div v-for="(row, index) in foldedTelemetryRows(capsule.telemetry)" :key="index" class="saas-rail-row">
            <span>{{ row.key }}</span>
            <span :class="'saas-rail-value-' + row.tone">{{ row.value }}</span>
          </div>
        </div>
        <button
          :id="foldedCardDomIds(capsule.capsuleId).restore"
          type="button"
          role="button"
          class="saas-rail-restore"
          :data-semantic-anchor="foldedRestoreAnchor(capsule.capsuleId)"
          :aria-label="'Restore ' + cardLabel(capsule) + ' into grid'"
          @click="restore(capsule.capsuleId)"
        >Restore into Grid</button>
      </div>
      <p v-if="count === 0" class="saas-rail-empty" role="status">No folded capsules.</p>
    </div>
    <div class="saas-rail-foot">
      <button
        id="cuk-saas-folded-dock" data-semantic-anchor="shell/navigation/folded-dock"
        type="button"
        role="button"
        class="saas-rail-dock"
        aria-label="Dock new capsule"
        :title="dockReason || 'Dock new capsule'"
        :disabled="dockDisabled"
        :data-unavailable-reason="dockReason || undefined"
        @click="dock"
      >Dock New Capsule</button>
    </div>
  </aside>
</template>

<style>
.saas-rail {
  width: 260px;
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  background: var(--cuk-primitive-color-neutral-900);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  border-radius: var(--cuk-semantic-radius-lg);
}
.saas-rail-head {
  height: 38px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: 0 var(--cuk-primitive-space-6);
  background: var(--cuk-primitive-color-neutral-800);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
}
.saas-rail-title {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  font-weight: var(--cuk-primitive-font-weight-bold);
  color: var(--cuk-primitive-color-neutral-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.saas-rail-unfold {
  padding: 1px var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500)) 30%, transparent);
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500)) 15%, transparent);
  color: var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-400));
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  white-space: nowrap;
  cursor: pointer;
}
.saas-rail-unfold:hover {
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500)) 25%, transparent);
}
.saas-rail-unfold:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.saas-rail-cards {
  flex: 1 1 auto;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-6);
  padding: var(--cuk-primitive-space-6);
}
.saas-rail-card {
  padding: var(--cuk-primitive-space-5);
  border-radius: var(--cuk-semantic-radius-md);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-4);
}
.saas-rail-card:hover { border-color: var(--cuk-primitive-color-neutral-700); }
.saas-rail-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
}
.saas-rail-card-name {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-semibold);
  color: var(--cuk-primitive-color-neutral-0);
}
.saas-rail-state {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-saas_9, 9px);
  white-space: nowrap;
}
.saas-rail-state-success {
  background: color-mix(in srgb, var(--cuk-primitive-color-emerald-500) 10%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-emerald-500) 20%, transparent);
  color: var(--cuk-primitive-color-emerald-500);
}
.saas-rail-state-warning {
  background: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 10%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-amber-500) 20%, transparent);
  color: var(--cuk-primitive-color-amber-500);
}
.saas-rail-state-info {
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 10%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 20%, transparent);
  color: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500));
}
.saas-rail-state-error {
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 10%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
  color: var(--cuk-primitive-color-rose-500);
}
.saas-rail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cuk-primitive-space-2);
}
.saas-rail-badge {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-neutral-800);
  color: var(--cuk-primitive-color-neutral-400);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
}
.saas-rail-telemetry {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-2);
  padding-top: var(--cuk-primitive-space-4);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
}
.saas-rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--cuk-primitive-color-neutral-500);
}
.saas-rail-value-neutral { color: var(--cuk-primitive-color-neutral-0); }
.saas-rail-value-success { color: var(--cuk-primitive-color-emerald-500); }
.saas-rail-value-warning { color: var(--cuk-primitive-color-amber-500); }
.saas-rail-value-error { color: var(--cuk-primitive-color-rose-500); }
.saas-rail-restore {
  width: 100%;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-800);
  background: var(--cuk-primitive-color-neutral-800);
  color: var(--cuk-primitive-color-neutral-0);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-medium);
  cursor: pointer;
}
.saas-rail-restore:hover {
  background: var(--cuk-primitive-color-neutral-700);
  border-color: var(--cuk-primitive-color-neutral-700);
}
.saas-rail-empty {
  margin: 0;
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-primitive-color-neutral-500);
}
.saas-rail-foot {
  flex: none;
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
}
.saas-rail-dock {
  width: 100%;
  padding: var(--cuk-primitive-space-3) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-md);
  border: var(--cuk-semantic-border-width) dashed var(--cuk-primitive-color-neutral-700);
  background: transparent;
  color: var(--cuk-primitive-color-neutral-400);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  cursor: pointer;
}
.saas-rail-dock:hover {
  color: var(--cuk-primitive-color-neutral-0);
  border-color: var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500));
}
.saas-rail-dock:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.saas-rail-unfold:focus-visible,
.saas-rail-restore:focus-visible,
.saas-rail-dock:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid
    var(--cuk-primitive-color-saas-indigo500, var(--cuk-semantic-focus-ring-color));
  outline-offset: 1px;
}
</style>
