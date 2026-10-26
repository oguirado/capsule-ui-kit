<script>
/**
 * Generic recordings control bar (RAM record-for-AI toggle, phase and store
 * readouts, RAM screenshot). Plain JavaScript with JSDoc; no imports; no
 * product names. Contract-compatible with the kit intent vocabulary: emits
 * `submit-intent` with `{ type, capsuleId, ... }` built by
 * `recordingsIntents.js`. The kit renders host projections only; it performs
 * no disk, network or clipboard writes itself.
 * @module recordings/RecordingControlBar
 */

/**
 * Emits declared by this component (single intent channel).
 * @type {ReadonlyArray<string>}
 */
export const RECORDING_CONTROL_BAR_EMITS = Object.freeze(['submit-intent']);

/** Recording axis phases. @type {ReadonlyArray<string>} */
export const RECORDING_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/** Screenshot axis states. @type {ReadonlyArray<string>} */
export const RECORDING_SCREENSHOT_STATES = Object.freeze([
  'idle',
  'capturing',
  'done',
  'error',
]);

/**
 * @param {unknown} phase
 * @returns {string} Known record phase, falling back to `idle`.
 */
export function normalizeRecordPhase(phase) {
  return RECORDING_PHASES.includes(/** @type {string} */ (phase))
    ? /** @type {string} */ (phase)
    : 'idle';
}

/**
 * @param {unknown} phase
 * @returns {boolean} True while the host transition is pending.
 */
export function recordPhaseBusy(phase) {
  const normalized = normalizeRecordPhase(phase);
  return normalized === 'starting' || normalized === 'stopping';
}

/**
 * @param {unknown} state
 * @returns {string} Known screenshot state, falling back to `idle`.
 */
export function normalizeScreenshotState(state) {
  return RECORDING_SCREENSHOT_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'idle';
}

/**
 * @param {unknown} state
 * @returns {boolean} True while the capture is in flight.
 */
export function screenshotStateBusy(state) {
  return normalizeScreenshotState(state) === 'capturing';
}

/**
 * Formats a host-projected elapsed-seconds count as `MM:SS`.
 * Unreadable values render `--:--`, never a fabricated zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatElapsed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--:--';
  }
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @param {unknown} store
 * @returns {string} Store chip label (`RAM` or `Unknown`).
 */
export function storeLabel(store) {
  return store === 'ram' ? 'RAM' : 'Unknown';
}

/**
 * @param {unknown} phase
 * @returns {string} Generic record toggle label for the phase.
 */
export function recordToggleLabel(phase) {
  const normalized = normalizeRecordPhase(phase);
  if (normalized === 'recording') return 'Stop';
  if (normalized === 'starting') return 'Starting';
  if (normalized === 'stopping') return 'Stopping';
  if (normalized === 'error') return 'Retry';
  if (normalized === 'sealed') return 'Record again';
  return 'Record for AI';
}

/**
 * @param {unknown} state
 * @returns {string} Generic screenshot button label for the state.
 */
export function screenshotButtonLabel(state) {
  const normalized = normalizeScreenshotState(state);
  if (normalized === 'capturing') return 'Capturing';
  if (normalized === 'done') return 'Captured';
  if (normalized === 'error') return 'Retry capture';
  return 'Screenshot';
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string }} input
 * @returns {string} Human label used inside accessible names.
 */
function controlLabel(input) {
  return (input.capsuleLabel || '').trim() || input.capsuleId;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, phase?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function recordToggleAccessibleName(input) {
  const label = controlLabel(input);
  const phase = normalizeRecordPhase(input.phase);
  if (phase === 'recording') return `Stop AI recording on ${label}`;
  if (phase === 'starting' || phase === 'stopping') {
    return `AI recording transition pending on ${label}`;
  }
  if (phase === 'error') return `Retry AI recording on ${label}`;
  return `Record ${label} for AI`;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, state?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function screenshotAccessibleName(input) {
  const label = controlLabel(input);
  const state = normalizeScreenshotState(input.state);
  if (state === 'capturing') return `Screenshot capture pending on ${label}`;
  if (state === 'done') return `Screenshot captured on ${label}`;
  if (state === 'error') return `Retry screenshot on ${label}`;
  return `Screenshot ${label}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the control bar group.
 */
export function controlBarDomId(capsuleId) {
  return `cuk-recordings-bar-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the record toggle control.
 */
export function recordToggleDomId(capsuleId) {
  return `cuk-recordings-toggle-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the screenshot control.
 */
export function screenshotDomId(capsuleId) {
  return `cuk-recordings-screenshot-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the phase readout.
 */
export function phaseDomId(capsuleId) {
  return `cuk-recordings-phase-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the store chip.
 */
export function storeChipDomId(capsuleId) {
  return `cuk-recordings-store-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the record toggle control.
 */
export function recordToggleAnchor(capsuleId) {
  return `recording/${capsuleId}/toggle`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the screenshot control.
 */
export function screenshotAnchor(capsuleId) {
  return `recording/${capsuleId}/screenshot`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the phase readout.
 */
export function phaseAnchor(capsuleId) {
  return `recording/${capsuleId}/phase`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the store chip.
 */
export function storeChipAnchor(capsuleId) {
  return `recording/${capsuleId}/store-chip`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, phase: string, elapsedSeconds: null, store: string, screenshotState: string, disabled: boolean, unavailableReason: string }}
 */
export function recordingControlBarFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule-01',
    phase: 'idle',
    elapsedSeconds: null,
    store: 'ram',
    screenshotState: 'idle',
    disabled: false,
    unavailableReason: '',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
import { buildRecordAiIntent, buildScreenshotIntent } from './recordingsIntents.js';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  phase: { type: String, default: 'idle' },
  elapsedSeconds: { type: Number, default: null },
  store: { type: String, default: 'ram' },
  screenshotState: { type: String, default: 'idle' },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const phaseN = computed(() => normalizeRecordPhase(props.phase));
const shotN = computed(() => normalizeScreenshotState(props.screenshotState));

const toggleBusy = computed(() => recordPhaseBusy(props.phase));
const shotBusy = computed(() => screenshotStateBusy(props.screenshotState));

const toggleLabel = computed(() => recordToggleLabel(props.phase));
const shotLabel = computed(() => screenshotButtonLabel(props.screenshotState));
const elapsedLabel = computed(() => formatElapsed(props.elapsedSeconds));
const storeText = computed(() => storeLabel(props.store));

const toggleName = computed(() =>
  recordToggleAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    phase: props.phase,
  }),
);
const shotName = computed(() =>
  screenshotAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    state: props.screenshotState,
  }),
);
const barName = computed(() => {
  const label = (props.capsuleLabel || '').trim() || props.capsuleId;
  return `Record controls for ${label}`;
});

const barId = computed(() => controlBarDomId(props.capsuleId));
const toggleId = computed(() => recordToggleDomId(props.capsuleId));
const shotId = computed(() => screenshotDomId(props.capsuleId));
const phaseId = computed(() => phaseDomId(props.capsuleId));
const storeId = computed(() => storeChipDomId(props.capsuleId));

const toggleAnchorValue = computed(() => recordToggleAnchor(props.capsuleId));
const shotAnchorValue = computed(() => screenshotAnchor(props.capsuleId));
const phaseAnchorValue = computed(() => phaseAnchor(props.capsuleId));
const storeAnchorValue = computed(() => storeChipAnchor(props.capsuleId));

const toggleDisabled = computed(() => props.disabled || toggleBusy.value);
const shotDisabled = computed(() => props.disabled || shotBusy.value);

const toggleReason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (toggleBusy.value) return `Recording is ${phaseN.value}`;
  return '';
});
const shotReason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (shotBusy.value) return 'Screenshot capture is pending';
  return '';
});

function onToggleClick() {
  if (toggleDisabled.value) return;
  emit('submit-intent', buildRecordAiIntent({ capsuleId: props.capsuleId, phase: props.phase }));
}

function onScreenshotClick() {
  if (shotDisabled.value) return;
  emit('submit-intent', buildScreenshotIntent({ capsuleId: props.capsuleId }));
}
</script>

<template>
  <div :id="barId" class="rec-bar" role="group" :aria-label="barName">
    <button
      :id="toggleId"
      type="button"
      role="button"
      :class="'rec-toggle rec-toggle-' + phaseN"
      :data-semantic-anchor="toggleAnchorValue"
      :aria-label="toggleName"
      :title="toggleReason || toggleName"
      :disabled="toggleDisabled"
      :aria-busy="toggleBusy ? 'true' : undefined"
      :data-unavailable-reason="toggleReason || undefined"
      @click="onToggleClick"
    >
      <span class="rec-toggle-dot" aria-hidden="true"></span>
      <span class="rec-toggle-label">{{ toggleLabel }}</span>
    </button>
    <span
      :id="phaseId"
      class="rec-chip rec-phase"
      role="status"
      :data-semantic-anchor="phaseAnchorValue"
      :title="'Phase ' + phaseN"
    >{{ phaseN }}</span>
    <span class="rec-elapsed" :title="'Elapsed ' + elapsedLabel">{{ elapsedLabel }}</span>
    <span
      :id="storeId"
      class="rec-chip rec-store"
      role="status"
      :data-semantic-anchor="storeAnchorValue"
      :title="'Store ' + storeText"
    >{{ storeText }}</span>
    <button
      :id="shotId"
      type="button"
      role="button"
      :class="'rec-shot rec-shot-' + shotN"
      :data-semantic-anchor="shotAnchorValue"
      :aria-label="shotName"
      :title="shotReason || shotName"
      :disabled="shotDisabled"
      :aria-busy="shotBusy ? 'true' : undefined"
      :data-unavailable-reason="shotReason || undefined"
      @click="onScreenshotClick"
    >
      <span class="rec-shot-label">{{ shotLabel }}</span>
    </button>
  </div>
</template>

<style>
.rec-bar {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  flex-wrap: wrap;
}
.rec-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 30%, transparent);
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 10%, transparent);
  color: var(--cuk-primitive-color-rose-500);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.rec-toggle:hover {
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
}
.rec-toggle-recording {
  background: var(--cuk-primitive-color-rose-500);
  border-color: var(--cuk-primitive-color-rose-500);
  color: var(--cuk-primitive-color-neutral-0);
}
.rec-toggle-recording:hover {
  background: var(--cuk-primitive-color-rose-600);
  border-color: var(--cuk-primitive-color-rose-600);
}
.rec-toggle-recording .rec-toggle-dot {
  background: var(--cuk-primitive-color-neutral-0);
}
.rec-toggle-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-rose-500);
  flex: none;
  animation: rec-toggle-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.rec-toggle:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.rec-toggle:focus-visible,
.rec-shot:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: 1px;
}
@keyframes rec-toggle-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.rec-chip {
  display: inline-flex;
  align-items: center;
  height: var(--cuk-primitive-space-8);
  padding: 0 var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-primitive-font-weight-medium);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  white-space: nowrap;
}
.rec-elapsed {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.rec-shot {
  display: inline-flex;
  align-items: center;
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.rec-shot:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
@media (prefers-reduced-motion: reduce) {
  .rec-toggle-dot { animation: none; }
}
</style>
