<script>
/**
 * @fileoverview AI multislot live-surface pane: thin host around the shared
 * surface view. The consumer provides the live surface through the default
 * slot; the pane never renders placeholder DOM and never unmounts (hide uses
 * v-show). In `read` input mode a transparent shield stops operator pointer
 * input from reaching the surface; enforcement stays with the host. Plain
 * JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const AI_SURFACE_PANE_SCHEMA = 'capsule-ui-kit.ai-surface-pane/v1';

/** Operator input modes. @type {ReadonlyArray<string>} */
export const SURFACE_INPUT_MODES = Object.freeze(['read', 'write']);

/** Surface presentation states (mirrors the shared surface view). @type {ReadonlyArray<string>} */
export const SURFACE_PANE_STATES = Object.freeze(['live', 'connecting', 'lost', 'empty']);

/**
 * Observed operator input kinds. Mirrors the canonical `MULTISLOT_INPUT_KINDS`
 * of the intent lane (this helper block is import-free by kit convention, so
 * the list is duplicated, not imported).
 * @type {ReadonlyArray<string>}
 */
export const SURFACE_INPUT_KINDS = Object.freeze(['pointer', 'keyboard', 'wheel']);

/**
 * @param {unknown} mode
 * @returns {'read'|'write'} Known mode, defaulting to `read`.
 */
export function normalizeInputMode(mode) {
  return mode === 'write' ? 'write' : 'read';
}

/**
 * @param {unknown} state
 * @returns {string} Known state, falling back to `empty` (never fake live).
 */
export function normalizeSurfacePaneState(state) {
  return SURFACE_PANE_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'empty';
}

/**
 * @param {unknown} kind
 * @returns {'pointer'|'keyboard'|'wheel'|null} Known input kind, else null (never invented).
 */
export function normalizeInputKind(kind) {
  if (kind === 'pointer' || kind === 'keyboard' || kind === 'wheel') return kind;
  return null;
}

/**
 * @param {string} capsuleId
 * @param {string} [presentationInstance]
 * @returns {{ host: string, shield: string }} Stable DOM ids.
 */
export function surfacePaneDomIds(capsuleId, presentationInstance = '') {
  const qualifier = presentationInstance && presentationInstance.trim().length > 0
    ? `${capsuleId}-${presentationInstance.trim()}`
    : capsuleId;
  return {
    host: `cuk-ai-surface-${qualifier}`,
    shield: `cuk-ai-surface-shield-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor (existing `capsule/{id}/slot` family).
 */
export function surfacePaneAnchor(capsuleId) {
  return `capsule/${capsuleId}/slot`;
}

/**
 * @param {string} capsuleId
 * @param {unknown} inputKind
 * @returns {{ capsuleId: string, inputKind: string|null }} Frozen input payload.
 */
export function buildSurfaceInputPayload(capsuleId, inputKind) {
  return Object.freeze({ capsuleId, inputKind: normalizeInputKind(inputKind) });
}

/**
 * Host event emitted when the operator acts on the surface while the input
 * mode is `write`, so the host can journal the guidance. Carries the kit
 * timestamp; the host journals (timestamp, capsule id, input kind).
 * @param {string} capsuleId
 * @param {unknown} inputKind
 * @param {unknown} [ts=Date.now()]
 * @returns {{ type: string, capsuleId: string, ts: number, inputKind: string }} Frozen event.
 */
export function buildOperatorGuidanceIntent(capsuleId, inputKind, ts = Date.now()) {
  const kind = normalizeInputKind(inputKind);
  if (kind === null) {
    throw new Error('buildOperatorGuidanceIntent requires a known input kind');
  }
  const stamp = Number(ts);
  if (!Number.isSafeInteger(stamp) || stamp < 0) {
    throw new Error('buildOperatorGuidanceIntent requires a timestamp');
  }
  return Object.freeze({ type: 'operator-guidance', capsuleId, ts: stamp, inputKind: kind });
}
</script>
<script setup>
import { computed } from 'vue';
import SaasSurfaceView from '../saas/SaasSurfaceView.vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  presentationInstance: { type: String, default: '' },
  state: { type: String, default: 'live' },
  hidden: { type: Boolean, default: false },
  inputMode: { type: String, default: 'read' },
});

const emit = defineEmits(['activate-surface', 'surface-input']);

const normalizedState = computed(() => normalizeSurfacePaneState(props.state));
const readMode = computed(() => normalizeInputMode(props.inputMode) === 'read');
const domIds = computed(() => surfacePaneDomIds(props.capsuleId, props.presentationInstance));
const anchor = computed(() => surfacePaneAnchor(props.capsuleId));

/**
 * @param {unknown} payload
 */
function forwardActivate(payload) {
  emit('activate-surface', payload);
}

/**
 * @param {Event} event
 */
function onPointerInput(event) {
  if (event && typeof event.isTrusted === 'boolean' && event.isTrusted === false) return;
  emit('surface-input', buildSurfaceInputPayload(props.capsuleId, 'pointer'));
}

/**
 * @param {Event} event
 */
function onKeyboardInput(event) {
  if (event && typeof event.isTrusted === 'boolean' && event.isTrusted === false) return;
  emit('surface-input', buildSurfaceInputPayload(props.capsuleId, 'keyboard'));
}

/**
 * @param {Event} event
 */
function onWheelInput(event) {
  if (event && typeof event.isTrusted === 'boolean' && event.isTrusted === false) return;
  emit('surface-input', buildSurfaceInputPayload(props.capsuleId, 'wheel'));
}
</script>
<template>
  <div
    v-show="!hidden"
    :id="domIds.host"
    class="ai-surface-pane"
    :data-semantic-anchor="anchor"
    :data-surface-state="normalizedState"
    :data-input-mode="readMode ? 'read' : 'write'"
    @pointerdown="onPointerInput"
    @keydown="onKeyboardInput"
    @wheel="onWheelInput"
  >
    <SaasSurfaceView
      :capsule-id="capsuleId"
      :capsule-label="capsuleLabel"
      :presentation-instance="presentationInstance"
      :state="normalizedState"
      @activate-surface="forwardActivate"
    >
      <slot />
    </SaasSurfaceView>
    <div
      v-if="readMode"
      :id="domIds.shield"
      class="ai-surface-pane__shield"
      aria-hidden="true"
      data-input-shield="read"
    ></div>
  </div>
</template>
<style scoped>
.ai-surface-pane {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--cuk-component-ai-multi-slot-pane-radius, var(--cuk-semantic-radius-md));
  background-color: var(--cuk-component-ai-multi-slot-pane-surface-background, var(--cuk-semantic-surface-canvas));
}
.ai-surface-pane__shield {
  position: absolute;
  inset: 0;
  z-index: 1;
  background-color: var(--cuk-component-ai-multi-slot-veil-read-fill, transparent);
  cursor: not-allowed;
}
</style>
