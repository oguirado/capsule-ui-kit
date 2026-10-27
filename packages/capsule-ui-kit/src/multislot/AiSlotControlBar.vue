<script>
/**
 * Slot control bar helpers (MS1 lane L2): essential operator controls.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * The bar composes the input-mode chip and the identity plate with the
 * hide/show, fold and float toggles plus an armed close control; every
 * control emits `submit-intent` only. Anchors name the control (static, one
 * registry row each; only float switches `float`/`dock-back`); DOM ids stay
 * stable across toggle states.
 * @module multislot/AiSlotControlBar
 */

/** Emits declared by the bar setup block. @type {ReadonlyArray<string>} */
export const AI_SLOT_CONTROL_BAR_EMITS = Object.freeze(['submit-intent']);

/** Toggle controls rendered directly by the bar. @type {ReadonlyArray<string>} */
export const MULTISLOT_BAR_CONTROLS = Object.freeze([
  'hide-surface',
  'hide-terminal',
  'fold',
  'float',
  'close',
]);

/** Intent types the bar may emit. @type {ReadonlyArray<string>} */
export const MULTISLOT_BAR_INTENT_TYPES = Object.freeze([
  'hide-surface',
  'show-surface',
  'hide-terminal',
  'show-terminal',
  'fold',
  'unfold',
  'float',
  'dock-back',
  'close',
]);

/**
 * @param {unknown} surfaceVisible
 * @returns {string} Intent type for the surface toggle target.
 */
export function surfaceIntentType(surfaceVisible) {
  return surfaceVisible === false ? 'show-surface' : 'hide-surface';
}

/**
 * @param {unknown} terminalVisible
 * @returns {string} Intent type for the terminal toggle target.
 */
export function terminalIntentType(terminalVisible) {
  return terminalVisible === false ? 'show-terminal' : 'hide-terminal';
}

/**
 * @param {unknown} folded
 * @returns {string} Intent type for the fold toggle target.
 */
export function foldIntentType(folded) {
  return folded === true ? 'unfold' : 'fold';
}

/**
 * @param {unknown} floating
 * @returns {string} Intent type for the float toggle target.
 */
export function floatIntentType(floating) {
  return floating === true ? 'dock-back' : 'float';
}

/**
 * @param {unknown} surfaceVisible
 * @returns {string} Visible label of the surface toggle.
 */
export function surfaceToggleLabel(surfaceVisible) {
  return surfaceVisible === false ? 'Show surface' : 'Hide surface';
}

/**
 * @param {unknown} terminalVisible
 * @returns {string} Visible label of the terminal toggle.
 */
export function terminalToggleLabel(terminalVisible) {
  return terminalVisible === false ? 'Show terminal' : 'Hide terminal';
}

/**
 * @param {unknown} folded
 * @returns {string} Visible label of the fold toggle.
 */
export function foldToggleLabel(folded) {
  return folded === true ? 'Unfold' : 'Fold';
}

/**
 * @param {unknown} floating
 * @returns {string} Visible label of the float toggle.
 */
export function floatToggleLabel(floating) {
  return floating === true ? 'Dock back' : 'Float';
}

/**
 * @param {unknown} armed
 * @returns {string} Visible label of the close control.
 */
export function closeButtonLabel(armed) {
  return armed === true ? 'Confirm close' : 'Close';
}

/**
 * @param {{ control: string, surfaceVisible?: unknown, terminalVisible?: unknown, folded?: unknown, floating?: unknown }} input
 * @returns {string|null} Intent type for the control target, or null when unknown.
 */
export function barTargetIntent(input) {
  if (input.control === 'hide-surface') return surfaceIntentType(input.surfaceVisible);
  if (input.control === 'hide-terminal') return terminalIntentType(input.terminalVisible);
  if (input.control === 'fold') return foldIntentType(input.folded);
  if (input.control === 'float') return floatIntentType(input.floating);
  if (input.control === 'close') return 'close';
  return null;
}

/**
 * @param {string} control Canonical control key.
 * @param {string} capsuleId
 * @returns {string} Stable DOM id (never switches with toggle state).
 */
export function barControlDomId(control, capsuleId) {
  if (MULTISLOT_BAR_CONTROLS.includes(control)) {
    return `cuk-multislot-${control}-${capsuleId}`;
  }
  return `cuk-multislot-control-${capsuleId}`;
}

/**
 * Static anchors per control (registry rows owned by lane L4): only the
 * float control switches anchors, because `multislot.float` and
 * `multislot.dock-back` are two registered ids. Intent types still name the
 * target action; anchors name the control.
 * @param {string} control Canonical control key.
 * @param {string} capsuleId
 * @param {string} intentType Target action.
 * @returns {string} Semantic anchor of the control.
 */
export function barControlAnchor(control, capsuleId, intentType) {
  if (control === 'float' && (intentType === 'float' || intentType === 'dock-back')) {
    return `capsule/${capsuleId}/multislot/${intentType}`;
  }
  if (MULTISLOT_BAR_CONTROLS.includes(control)) {
    return `capsule/${capsuleId}/multislot/${control}`;
  }
  return `capsule/${capsuleId}/multislot/control`;
}

/**
 * @param {string} control Canonical control key.
 * @param {string} intentType Target action.
 * @returns {string} agent_lane/v1 id of the control.
 */
export function barControlAgentLaneId(control, intentType) {
  if (control === 'float' && (intentType === 'float' || intentType === 'dock-back')) {
    return `multislot.${intentType}`;
  }
  if (MULTISLOT_BAR_CONTROLS.includes(control)) {
    return `multislot.${control}`;
  }
  return 'multislot.control';
}

/** Human labels per intent type. @type {Readonly<Record<string, string>>} */
export const MULTISLOT_BAR_INTENT_LABELS = Object.freeze({
  'hide-surface': 'Hide surface',
  'show-surface': 'Show surface',
  'hide-terminal': 'Hide terminal',
  'show-terminal': 'Show terminal',
  fold: 'Fold',
  unfold: 'Unfold',
  float: 'Float',
  'dock-back': 'Dock back',
  close: 'Close',
});

/**
 * @param {{ intentType: string, capsuleLabel?: string, capsuleId: string, armed?: boolean }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function barControlAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId || 'unknown slot';
  if (input.intentType === 'close' && input.armed === true) {
    return `Confirm closing ${label}`;
  }
  const human = MULTISLOT_BAR_INTENT_LABELS[input.intentType] || 'Slot control';
  return `${human} for ${label}`;
}

/**
 * @param {{ type: string, capsuleId: string }} input
 * @returns {{ type: string, capsuleId: string }|null} Frozen intent, or null when unknown.
 */
export function buildBarIntent(input) {
  if (!MULTISLOT_BAR_INTENT_TYPES.includes(input.type)) return null;
  return Object.freeze({ type: input.type, capsuleId: input.capsuleId });
}

/**
 * @param {{ barDisabled?: boolean, barReason?: string, controlDisabled?: boolean, controlReason?: string }} input
 * @returns {string} Literal reason when disabled, or `` when offered.
 */
export function controlDisabledReason(input) {
  const isDisabled = input.barDisabled === true || input.controlDisabled === true;
  if (!isDisabled) return '';
  if (input.controlReason) return input.controlReason;
  if (input.controlDisabled === true) return 'Control unavailable';
  if (input.barReason) return input.barReason;
  return 'Slot controls unavailable';
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
 * @returns {Record<string, any>} Demo props for the bar.
 */
export function aiSlotControlBarFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule 01',
    inputMode: 'read',
    inputModeDisabled: false,
    inputModeReason: '',
    copyState: 'ready',
    copyDisabled: false,
    copyReason: '',
    slotId: 'slot-01',
    sessionId: 'sess-01',
    surfaceKind: 'program',
    surfaceDisplay: ':1',
    surfaceGeometry: '1280x900',
    surfaceVisible: true,
    terminalVisible: true,
    folded: false,
    floating: false,
    hideSurfaceDisabled: false,
    hideSurfaceReason: '',
    hideTerminalDisabled: false,
    hideTerminalReason: '',
    foldDisabled: false,
    foldReason: '',
    floatDisabled: false,
    floatReason: '',
    closeDisabled: false,
    closeReason: '',
    barDisabled: false,
    barReason: '',
    ...overrides,
  };
}
</script>

<script setup>
import { computed, ref } from 'vue';
import AiInputModeChip from './AiInputModeChip.vue';
import AiIdentityPlate from './AiIdentityPlate.vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  inputMode: { type: String, default: 'read' },
  inputModeDisabled: { type: Boolean, default: false },
  inputModeReason: { type: String, default: '' },
  copyState: { type: String, default: 'ready' },
  copyDisabled: { type: Boolean, default: false },
  copyReason: { type: String, default: '' },
  slotId: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  surfaceKind: { type: String, default: '' },
  surfaceDisplay: { type: String, default: '' },
  surfaceGeometry: { type: String, default: '' },
  surfaceVisible: { type: Boolean, default: true },
  terminalVisible: { type: Boolean, default: true },
  folded: { type: Boolean, default: false },
  floating: { type: Boolean, default: false },
  hideSurfaceDisabled: { type: Boolean, default: false },
  hideSurfaceReason: { type: String, default: '' },
  hideTerminalDisabled: { type: Boolean, default: false },
  hideTerminalReason: { type: String, default: '' },
  foldDisabled: { type: Boolean, default: false },
  foldReason: { type: String, default: '' },
  floatDisabled: { type: Boolean, default: false },
  floatReason: { type: String, default: '' },
  closeDisabled: { type: Boolean, default: false },
  closeReason: { type: String, default: '' },
  barDisabled: { type: Boolean, default: false },
  barReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const closeArmed = ref(false);

const barLabel = computed(() => (props.capsuleLabel || '').trim() || props.capsuleId);
const barId = computed(() => `cuk-multislot-bar-${props.capsuleId}`);
const barName = computed(() => `Slot controls for ${barLabel.value}`);
const chipDisabled = computed(() => props.barDisabled || props.inputModeDisabled);
const chipReason = computed(() =>
  controlDisabledReason({
    barDisabled: props.barDisabled,
    barReason: props.barReason,
    controlDisabled: props.inputModeDisabled,
    controlReason: props.inputModeReason,
  }),
);
const plateDisabled = computed(() => props.barDisabled || props.copyDisabled);
const plateReason = computed(() =>
  controlDisabledReason({
    barDisabled: props.barDisabled,
    barReason: props.barReason,
    controlDisabled: props.copyDisabled,
    controlReason: props.copyReason,
  }),
);
const buttons = computed(() =>
  [
    {
      control: 'hide-surface',
      intentType: surfaceIntentType(props.surfaceVisible),
      label: surfaceToggleLabel(props.surfaceVisible),
      disabled: props.hideSurfaceDisabled,
      reason: props.hideSurfaceReason,
    },
    {
      control: 'hide-terminal',
      intentType: terminalIntentType(props.terminalVisible),
      label: terminalToggleLabel(props.terminalVisible),
      disabled: props.hideTerminalDisabled,
      reason: props.hideTerminalReason,
    },
    {
      control: 'fold',
      intentType: foldIntentType(props.folded),
      label: foldToggleLabel(props.folded),
      disabled: props.foldDisabled,
      reason: props.foldReason,
    },
    {
      control: 'float',
      intentType: floatIntentType(props.floating),
      label: floatToggleLabel(props.floating),
      disabled: props.floatDisabled,
      reason: props.floatReason,
    },
  ].map((entry) => ({
    ...entry,
    domId: barControlDomId(entry.control, props.capsuleId),
    anchor: barControlAnchor(entry.control, props.capsuleId, entry.intentType),
    laneId: barControlAgentLaneId(entry.control, entry.intentType),
    accessibleName: barControlAccessibleName({
      intentType: entry.intentType,
      capsuleLabel: props.capsuleLabel,
      capsuleId: props.capsuleId,
    }),
    isDisabled: props.barDisabled || entry.disabled,
    disabledReason: controlDisabledReason({
      barDisabled: props.barDisabled,
      barReason: props.barReason,
      controlDisabled: entry.disabled,
      controlReason: entry.reason,
    }),
  })),
);
const closeLabel = computed(() => closeButtonLabel(closeArmed.value));
const closeName = computed(() =>
  barControlAccessibleName({
    intentType: 'close',
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    armed: closeArmed.value,
  }),
);
const closeDomId = computed(() => barControlDomId('close', props.capsuleId));
const closeAnchor = computed(() => barControlAnchor('close', props.capsuleId, 'close'));
const closeLaneId = computed(() => barControlAgentLaneId('close', 'close'));
const closeIsDisabled = computed(() => props.barDisabled || props.closeDisabled);
const closeReasonText = computed(() =>
  controlDisabledReason({
    barDisabled: props.barDisabled,
    barReason: props.barReason,
    controlDisabled: props.closeDisabled,
    controlReason: props.closeReason,
  }),
);
const closeClass = computed(
  () => 'ms2-bar-button ms2-bar-button-close' + (closeArmed.value ? ' ms2-bar-button-armed' : ''),
);

function onFocusGuard(event) {
  preserveMultislotControlFocusGuard(event);
}

function forwardIntent(payload) {
  closeArmed.value = false;
  emit('submit-intent', payload);
}

function onToggleButton(entry) {
  closeArmed.value = false;
  if (entry.isDisabled) return;
  const intent = buildBarIntent({ type: entry.intentType, capsuleId: props.capsuleId });
  if (intent) emit('submit-intent', intent);
}

function onCloseClick() {
  if (closeIsDisabled.value) {
    closeArmed.value = false;
    return;
  }
  if (closeArmed.value !== true) {
    closeArmed.value = true;
    return;
  }
  closeArmed.value = false;
  const intent = buildBarIntent({ type: 'close', capsuleId: props.capsuleId });
  if (intent) emit('submit-intent', intent);
}

function onCloseEscape() {
  closeArmed.value = false;
}
</script>

<template>
  <div
    :id="barId"
    role="toolbar"
    class="ms2-bar"
    :aria-label="barName"
    :data-capsule-id="capsuleId"
  >
    <AiInputModeChip
      :capsule-id="capsuleId"
      :capsule-label="capsuleLabel"
      :mode="inputMode"
      :disabled="chipDisabled"
      :unavailable-reason="chipReason"
      @submit-intent="forwardIntent"
    />
    <button
      v-for="entry in buttons"
      :key="entry.control"
      :id="entry.domId"
      type="button"
      role="button"
      class="ms2-bar-button"
      :data-semantic-anchor="entry.anchor"
      :data-agent-lane-id="entry.laneId"
      :aria-label="entry.accessibleName"
      :title="entry.disabledReason || entry.accessibleName"
      :disabled="entry.isDisabled"
      :data-unavailable-reason="entry.disabledReason || undefined"
      @pointerdown="onFocusGuard"
      @mousedown="onFocusGuard"
      @click="onToggleButton(entry)"
    >{{ entry.label }}</button>
    <slot name="record" />
    <AiIdentityPlate
      :capsule-id="capsuleId"
      :capsule-label="capsuleLabel"
      :slot-id="slotId"
      :session-id="sessionId"
      :surface-kind="surfaceKind"
      :surface-display="surfaceDisplay"
      :surface-geometry="surfaceGeometry"
      :copy-state="copyState"
      :disabled="plateDisabled"
      :unavailable-reason="plateReason"
      @submit-intent="forwardIntent"
    />
    <button
      :id="closeDomId"
      type="button"
      role="button"
      :class="closeClass"
      :data-semantic-anchor="closeAnchor"
      :data-agent-lane-id="closeLaneId"
      :aria-label="closeName"
      :title="closeReasonText || closeName"
      :disabled="closeIsDisabled"
      :data-close-armed="closeArmed ? 'true' : 'false'"
      :data-unavailable-reason="closeReasonText || undefined"
      @pointerdown="onFocusGuard"
      @mousedown="onFocusGuard"
      @click="onCloseClick"
      @keydown.escape="onCloseEscape"
    >{{ closeLabel }}</button>
  </div>
</template>

<style>
.ms2-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cuk-component-ai-multi-slot-control-bar-gap, var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-3);
  background: var(--cuk-component-ai-multi-slot-control-bar-background, var(--cuk-semantic-surface-chrome));
  border-bottom: var(--cuk-semantic-border-width) solid
    var(--cuk-component-ai-multi-slot-control-bar-border-color, var(--cuk-semantic-border-default));
  font-family: var(--cuk-component-ai-multi-slot-control-bar-font-family, var(--cuk-semantic-typography-font-family-sans));
  font-size: var(--cuk-component-ai-multi-slot-control-bar-font-size, var(--cuk-semantic-typography-font-size-xs));
}
.ms2-bar-button {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-component-ai-multi-slot-control-bar-button-radius, var(--cuk-semantic-radius-pill));
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  background: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  font-family: inherit;
  font-size: inherit;
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.ms2-bar-button-close {
  margin-left: auto;
}
.ms2-bar-button-armed {
  border-color: var(--cuk-semantic-status-warning-icon);
}
.ms2-bar-button:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.ms2-bar-button:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
</style>
