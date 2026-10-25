<script>
/**
 * Generic SaaS viewer-identity chips for the tile address bar (SAAS-1 §1):
 * LIVE badge, elapsed timer, SCALED badge, viewer endpoint chip.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * Unknown numerics are omitted, never coerced (kit unavailable law).
 * @module saas/SaasViewerChips
 */

/**
 * @param {unknown} scale
 * @returns {string|null} `SCALED x0.62` label, or null when unknown.
 */
export function formatScaledBadge(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0) return null;
  return `SCALED x${scale.toFixed(2)}`;
}

/**
 * @param {unknown} elapsed
 * @returns {string|null} Trimmed timer text, or null when unknown.
 */
export function formatElapsedTimer(elapsed) {
  if (typeof elapsed !== 'string') return null;
  const trimmed = elapsed.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {unknown} label
 * @returns {string|null} Trimmed viewer label, or null when unknown.
 */
export function formatViewerLabel(label) {
  if (typeof label !== 'string') return null;
  const trimmed = label.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {string} capsuleId
 * @returns {{ group: string, live: string, elapsed: string, scaled: string, viewer: string }}
 */
export function viewerChipsDomIds(capsuleId) {
  return {
    group: `cuk-saas-viewer-chips-${capsuleId}`,
    live: `cuk-saas-viewer-live-${capsuleId}`,
    elapsed: `cuk-saas-viewer-elapsed-${capsuleId}`,
    scaled: `cuk-saas-viewer-scaled-${capsuleId}`,
    viewer: `cuk-saas-viewer-endpoint-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the SCALED badge (registry row by Lane E).
 */
export function scaledBadgeAnchor(capsuleId) {
  return `capsule/${capsuleId}/scaled-badge`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, live: boolean, elapsed: string|null, scaled: number|null, viewerLabel: string|null, resolution: string|null }}
 */
export function saasViewerChipsFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleLabel: 'Capsule-01',
    live: true,
    elapsed: '00:14:28',
    scaled: 0.62,
    viewerLabel: 'viewer-01',
    resolution: '1280x900',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  live: { type: Boolean, default: false },
  elapsed: { type: String, default: null },
  scaled: { type: Number, default: null },
  viewerLabel: { type: String, default: null },
  resolution: { type: String, default: null },
});

const domIds = computed(() => viewerChipsDomIds(props.capsuleId));
const elapsedText = computed(() => formatElapsedTimer(props.elapsed));
const scaledText = computed(() => formatScaledBadge(props.scaled));
const viewerText = computed(() => formatViewerLabel(props.viewerLabel));
const resolutionText = computed(() => formatViewerLabel(props.resolution));
const groupName = computed(() => {
  const label = (props.capsuleLabel || '').trim() || props.capsuleId;
  return `Viewer status for ${label}`;
});
</script>

<template>
  <div :id="domIds.group" class="saas-viewer-chips" role="group" :aria-label="groupName">
    <span v-if="live" :id="domIds.live" class="saas-viewer-chip saas-viewer-live">LIVE</span>
    <span v-if="resolutionText" class="saas-viewer-resolution">{{ resolutionText }}</span>
    <span v-if="elapsedText" :id="domIds.elapsed" class="saas-viewer-elapsed">{{ elapsedText }}</span>
    <span
      v-if="scaledText"
      :id="domIds.scaled"
      class="saas-viewer-chip saas-viewer-scaled"
      :data-semantic-anchor="scaledBadgeAnchor(capsuleId)"
    >{{ scaledText }}</span>
    <span v-if="viewerText" :id="domIds.viewer" class="saas-viewer-chip saas-viewer-endpoint">{{ viewerText }}</span>
  </div>
</template>

<style>
.saas-viewer-chips {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  flex: none;
}
.saas-viewer-chip {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: 1.5;
  white-space: nowrap;
}
.saas-viewer-live {
  font-weight: var(--cuk-primitive-font-weight-bold);
  color: var(--cuk-primitive-color-emerald-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-emerald-500) 15%, transparent);
}
.saas-viewer-resolution {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-primitive-color-neutral-500);
  white-space: nowrap;
}
.saas-viewer-elapsed {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-primitive-color-neutral-500);
  white-space: nowrap;
}
.saas-viewer-scaled {
  background: var(--cuk-primitive-color-neutral-800);
  color: var(--cuk-primitive-color-neutral-400);
}
.saas-viewer-endpoint {
  background: var(--cuk-primitive-color-neutral-800);
  color: var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-400));
}
</style>
