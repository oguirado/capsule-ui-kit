<script>
/**
 * Operator input-mode chip helpers (MS1 lane L2).
 * Plain JavaScript with JSDoc; no imports; no product names.
 * The chip renders the host-projected operator input mode (`read|write`)
 * and emits `submit-intent` with `input-mode-read|input-mode-write` for the
 * target mode. The kit never invents a mode: unknown input renders `read`.
 * @module multislot/AiInputModeChip
 */

/** Operator input modes. @type {ReadonlyArray<string>} */
export const MULTISLOT_INPUT_MODES = Object.freeze(['read', 'write']);

/** Emits declared by the chip setup block. @type {ReadonlyArray<string>} */
export const AI_INPUT_MODE_CHIP_EMITS = Object.freeze(['submit-intent']);

/** agent_lane/v1 id of the chip (registry row owned by lane L4). @type {string} */
export const MULTISLOT_INPUT_MODE_AGENT_LANE = 'multislot.input-mode';

/**
 * @param {unknown} mode
 * @returns {string} Known mode, falling back to `read`.
 */
export function normalizeInputMode(mode) {
  return MULTISLOT_INPUT_MODES.includes(/** @type {string} */ (mode))
    ? /** @type {string} */ (mode)
    : 'read';
}

/**
 * @param {unknown} mode
 * @returns {string} The mode a toggle click requests.
 */
export function targetInputMode(mode) {
  return normalizeInputMode(mode) === 'read' ? 'write' : 'read';
}

/**
 * @param {unknown} mode Current projected mode.
 * @returns {string} Intent type naming the target mode.
 */
export function inputModeIntentType(mode) {
  return `input-mode-${targetInputMode(mode)}`;
}

/**
 * @param {unknown} mode
 * @returns {string} Visible chip text.
 */
export function inputModeChipLabel(mode) {
  return normalizeInputMode(mode) === 'read' ? 'READ' : 'WRITE';
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, mode?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function inputModeAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId || 'unknown slot';
  const mode = normalizeInputMode(input.mode);
  const target = targetInputMode(mode);
  return `Operator input mode for ${label}: ${mode}. Activate to switch to ${target}.`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id (never switches with the mode).
 */
export function inputModeDomId(capsuleId) {
  return `cuk-multislot-input-mode-${capsuleId}`;
}

/**
 * Static anchor: the chip is one control; the intent type (not the anchor)
 * names the target mode.
 * @param {string} capsuleId
 * @returns {string} Semantic anchor of the chip.
 */
export function inputModeAnchor(capsuleId) {
  return `capsule/${capsuleId}/input-mode`;
}

/**
 * Shape matches the lane L3 intent builder: the target mode travels both in
 * the intent type and in `mode`.
 * @param {{ capsuleId: string, mode?: unknown }} input
 * @returns {{ type: string, capsuleId: string, mode: string }} Frozen intent payload.
 */
export function buildInputModeIntent(input) {
  const target = targetInputMode(input.mode);
  return Object.freeze({
    type: `input-mode-${target}`,
    capsuleId: input.capsuleId,
    mode: target,
  });
}

/**
 * Focus guard beside live surfaces: `pointerdown`/`mousedown` call
 * `preventDefault()` while `click` and keyboard activation stay intact.
 * @param {{ type?: string, preventDefault?: () => void }} event
 * @returns {{ preservedFocus: boolean }}
 */
export function preserveMultislotControlFocusGuard(event) {
  if (!event || typeof event !== 'object') {
    return Object.freeze({ preservedFocus: false });
  }
  if (
    (event.type === 'pointerdown' || event.type === 'mousedown') &&
    typeof event.preventDefault === 'function'
  ) {
    event.preventDefault();
    return Object.freeze({ preservedFocus: true });
  }
  return Object.freeze({ preservedFocus: false });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, mode: string, disabled: boolean, unavailableReason: string }}
 */
export function aiInputModeChipFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule 01',
    mode: 'read',
    disabled: false,
    unavailableReason: '',
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
  mode: { type: String, default: 'read' },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const normalized = computed(() => normalizeInputMode(props.mode));
const label = computed(() => inputModeChipLabel(props.mode));
const accessibleName = computed(() =>
  inputModeAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    mode: props.mode,
  }),
);
const domId = computed(() => inputModeDomId(props.capsuleId));
const anchor = computed(() => inputModeAnchor(props.capsuleId));
const laneId = computed(() => MULTISLOT_INPUT_MODE_AGENT_LANE);
const reason = computed(() => props.unavailableReason);

function onFocusGuard(event) {
  preserveMultislotControlFocusGuard(event);
}

function onClick() {
  if (props.disabled) return;
  emit('submit-intent', buildInputModeIntent({ capsuleId: props.capsuleId, mode: props.mode }));
}
</script>

<template>
  <button
    :id="domId"
    type="button"
    role="switch"
    :class="'ms2-mode-chip ms2-mode-chip-' + normalized"
    :data-semantic-anchor="anchor"
    :data-agent-lane-id="laneId"
    :aria-label="accessibleName"
    :aria-checked="normalized === 'write' ? 'true' : 'false'"
    :title="reason || accessibleName"
    :disabled="disabled"
    :data-unavailable-reason="reason || undefined"
    @pointerdown="onFocusGuard"
    @mousedown="onFocusGuard"
    @click="onClick"
  >
    <span class="ms2-mode-chip-dot" aria-hidden="true"></span>
    <span class="ms2-mode-chip-label">{{ label }}</span>
  </button>
</template>

<style>
.ms2-mode-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-component-ai-multi-slot-input-mode-chip-radius, var(--cuk-semantic-radius-pill));
  border: var(--cuk-semantic-border-width) solid
    var(--cuk-component-ai-multi-slot-input-mode-read-border, var(--cuk-semantic-border-default));
  background: var(--cuk-component-ai-multi-slot-input-mode-read-fill, var(--cuk-semantic-surface-panel));
  color: var(--cuk-component-ai-multi-slot-input-mode-read-color, var(--cuk-semantic-text-primary));
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-component-ai-multi-slot-input-mode-font-size, var(--cuk-semantic-typography-font-size-xs));
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.ms2-mode-chip-write {
  border-color: var(--cuk-component-ai-multi-slot-input-mode-write-border, var(--cuk-semantic-border-default));
  background: var(--cuk-component-ai-multi-slot-input-mode-write-fill, var(--cuk-semantic-surface-panel));
  color: var(--cuk-component-ai-multi-slot-input-mode-write-color, var(--cuk-semantic-text-primary));
}
.ms2-mode-chip-dot {
  width: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-component-ai-multi-slot-input-mode-read-color, var(--cuk-semantic-status-success-icon));
  flex: none;
}
.ms2-mode-chip-write .ms2-mode-chip-dot {
  background: var(--cuk-component-ai-multi-slot-input-mode-write-color, var(--cuk-semantic-status-warning-icon));
}
.ms2-mode-chip:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.ms2-mode-chip:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
</style>
