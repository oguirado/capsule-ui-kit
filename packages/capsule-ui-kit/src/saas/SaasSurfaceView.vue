<script>
/**
 * Generic SaaS live-surface host (SAAS-1 §1 surface canvas).
 * Renders the consumer-provided live surface via the default slot; never
 * placeholder DOM. Uses the existing `component.surfaceView.*` tokens.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module saas/SaasSurfaceView
 */

/** Surface presentation states. @type {ReadonlyArray<string>} */
export const SAAS_SURFACE_STATES = Object.freeze(['live', 'connecting', 'lost', 'empty']);

/**
 * @param {unknown} state
 * @returns {string} Known state, falling back to `empty` (never fake live).
 */
export function normalizeSurfaceState(state) {
  return SAAS_SURFACE_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'empty';
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, state?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function surfaceAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId;
  const state = normalizeSurfaceState(input.state);
  if (state === 'live') return `Live surface for ${label}`;
  if (state === 'connecting') return `Surface connecting for ${label}`;
  if (state === 'lost') return `Surface lost for ${label}`;
  return `No surface for ${label}`;
}

/**
 * @param {string} capsuleId
 * @param {string} [presentationInstance]
 * @returns {{ host: string, slot: string }} Stable DOM ids.
 */
export function surfaceViewDomIds(capsuleId, presentationInstance = '') {
  const qualifier = presentationInstance && presentationInstance.trim().length > 0
    ? `${capsuleId}-${presentationInstance.trim()}`
    : capsuleId;
  return {
    host: `cuk-saas-surface-${qualifier}`,
    slot: `cuk-saas-surface-slot-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor (existing `capsule/{id}/slot` family).
 */
export function surfaceViewAnchor(capsuleId) {
  return `capsule/${capsuleId}/slot`;
}

/**
 * @param {{ capsuleId: string, state?: unknown }} input
 * @returns {{ capsuleId: string, state: string }} Activation payload.
 */
export function buildActivateSurfacePayload(input) {
  return Object.freeze({
    capsuleId: input.capsuleId,
    state: normalizeSurfaceState(input.state),
  });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, presentationInstance: string, state: string }}
 */
export function saasSurfaceViewFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleLabel: 'Capsule-01',
    presentationInstance: 'wall-main',
    state: 'live',
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
  presentationInstance: { type: String, default: '' },
  state: { type: String, default: 'live' },
});

const emit = defineEmits(['activate-surface']);

const normalized = computed(() => normalizeSurfaceState(props.state));
const accessibleName = computed(() =>
  surfaceAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    state: props.state,
  }),
);
const domIds = computed(() => surfaceViewDomIds(props.capsuleId, props.presentationInstance));
const anchor = computed(() => surfaceViewAnchor(props.capsuleId));

function activate() {
  emit('activate-surface', buildActivateSurfacePayload({ capsuleId: props.capsuleId, state: props.state }));
}
</script>

<template>
  <div
    :id="domIds.host"
    :class="'saas-surface saas-surface-' + normalized"
    role="region"
    :aria-label="accessibleName"
    :data-semantic-anchor="anchor"
    :data-surface-state="normalized"
    tabindex="0"
    @pointerdown="activate"
    @focus="activate"
  >
    <div :id="domIds.slot" class="saas-surface-slot">
      <slot />
    </div>
  </div>
</template>

<style>
.saas-surface {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  position: relative;
  padding: var(--cuk-primitive-space-4);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  border-radius: var(--cuk-semantic-radius-md);
  background: var(--cuk-component-surface-view-backdrop);
}
.saas-surface:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-component-surface-view-outline-focus);
  outline-offset: 1px;
}
.saas-surface-slot {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
