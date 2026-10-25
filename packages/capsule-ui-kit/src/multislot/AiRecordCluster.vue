<script>
/**
 * Generic AI multislot record cluster (record-for-AI / record-to-disk /
 * screenshot). Plain JavaScript with JSDoc; no imports; no product names.
 * Contract-compatible with the kit intent vocabulary: emits `submit-intent`
 * with `{ type, capsuleId, ... }` built by `multislotIntents.js`.
 * The kit renders host projections only; it performs no disk, network or
 * clipboard writes itself.
 * @module multislot/AiRecordCluster
 */

/**
 * Emits declared by this component (single intent channel).
 * @type {ReadonlyArray<string>}
 */
export const AI_RECORD_CLUSTER_EMITS = Object.freeze(['submit-intent']);

/** Recording axis phases. @type {ReadonlyArray<string>} */
export const MULTISLOT_RECORD_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/** Screenshot axis states. @type {ReadonlyArray<string>} */
export const MULTISLOT_SCREENSHOT_STATES = Object.freeze([
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
  return MULTISLOT_RECORD_PHASES.includes(/** @type {string} */ (phase))
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
  return MULTISLOT_SCREENSHOT_STATES.includes(/** @type {string} */ (state))
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
 * @param {unknown} phase
 * @returns {string} Generic record-for-AI button label for the phase.
 */
export function aiRecordLabel(phase) {
  const normalized = normalizeRecordPhase(phase);
  if (normalized === 'recording') return 'Stop';
  if (normalized === 'starting') return 'Starting';
  if (normalized === 'stopping') return 'Stopping';
  if (normalized === 'error') return 'Retry';
  return 'Record for AI';
}

/**
 * @param {unknown} phase
 * @returns {string} Generic record-to-disk button label for the phase.
 */
export function diskRecordLabel(phase) {
  const normalized = normalizeRecordPhase(phase);
  if (normalized === 'recording') return 'Stop';
  if (normalized === 'starting') return 'Starting';
  if (normalized === 'stopping') return 'Stopping';
  if (normalized === 'error') return 'Retry';
  return 'Record to disk';
}

/**
 * @param {unknown} state
 * @returns {string} Generic screenshot button label for the state.
 */
export function screenshotLabel(state) {
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
function clusterLabel(input) {
  return (input.capsuleLabel || '').trim() || input.capsuleId;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, phase?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function aiRecordAccessibleName(input) {
  const label = clusterLabel(input);
  const phase = normalizeRecordPhase(input.phase);
  if (phase === 'recording') return `Stop AI recording on ${label}`;
  if (phase === 'starting' || phase === 'stopping') {
    return `AI recording transition pending on ${label}`;
  }
  if (phase === 'error') return `Retry AI recording on ${label}`;
  return `Record ${label} for AI`;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, phase?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function diskRecordAccessibleName(input) {
  const label = clusterLabel(input);
  const phase = normalizeRecordPhase(input.phase);
  if (phase === 'recording') return `Stop disk recording on ${label}`;
  if (phase === 'starting' || phase === 'stopping') {
    return `Disk recording transition pending on ${label}`;
  }
  if (phase === 'error') return `Retry disk recording on ${label}`;
  return `Record ${label} to disk`;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, state?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function screenshotAccessibleName(input) {
  const label = clusterLabel(input);
  const state = normalizeScreenshotState(input.state);
  if (state === 'capturing') return `Screenshot capture pending on ${label}`;
  if (state === 'done') return `Screenshot captured on ${label}`;
  if (state === 'error') return `Retry screenshot on ${label}`;
  return `Screenshot ${label}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the cluster group.
 */
export function recordClusterDomId(capsuleId) {
  return `cuk-multislot-record-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the record-for-AI control.
 */
export function aiRecordDomId(capsuleId) {
  return `cuk-multislot-record-ai-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the record-to-disk control.
 */
export function diskRecordDomId(capsuleId) {
  return `cuk-multislot-record-disk-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the screenshot control.
 */
export function screenshotDomId(capsuleId) {
  return `cuk-multislot-screenshot-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the record-for-AI control.
 */
export function aiRecordAnchor(capsuleId) {
  return `capsule/${capsuleId}/record-ai`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the record-to-disk control.
 */
export function diskRecordAnchor(capsuleId) {
  return `capsule/${capsuleId}/record-disk`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor for the screenshot control.
 */
export function screenshotAnchor(capsuleId) {
  return `capsule/${capsuleId}/screenshot`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, aiPhase: string, diskPhase: string, screenshotState: string, elapsedAi: null, elapsedDisk: null, diskDestination: null, captureTarget: string, disabled: boolean, unavailableReason: string }}
 */
export function aiRecordClusterFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule-01',
    aiPhase: 'idle',
    diskPhase: 'idle',
    screenshotState: 'idle',
    elapsedAi: null,
    elapsedDisk: null,
    diskDestination: null,
    captureTarget: 'ram',
    disabled: false,
    unavailableReason: '',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
import {
  buildRecordAiIntent,
  buildRecordDiskIntent,
  buildScreenshotIntent,
  DISK_DESTINATION_REASON,
} from './multislotIntents.js';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  aiPhase: { type: String, default: 'idle' },
  diskPhase: { type: String, default: 'idle' },
  screenshotState: { type: String, default: 'idle' },
  elapsedAi: { type: Number, default: null },
  elapsedDisk: { type: Number, default: null },
  diskDestination: { type: String, default: null },
  captureTarget: { type: String, default: 'ram' },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const aiPhaseN = computed(() => normalizeRecordPhase(props.aiPhase));
const diskPhaseN = computed(() => normalizeRecordPhase(props.diskPhase));
const shotN = computed(() => normalizeScreenshotState(props.screenshotState));

const aiBusy = computed(() => recordPhaseBusy(props.aiPhase));
const diskBusy = computed(() => recordPhaseBusy(props.diskPhase));
const shotBusy = computed(() => screenshotStateBusy(props.screenshotState));

const hasDestination = computed(
  () =>
    typeof props.diskDestination === 'string' &&
    props.diskDestination.length > 0 &&
    props.diskDestination === props.diskDestination.trim(),
);
const shotTarget = computed(() => (props.captureTarget === 'disk' ? 'disk' : 'ram'));

const aiLabel = computed(() => aiRecordLabel(props.aiPhase));
const diskLabel = computed(() => diskRecordLabel(props.diskPhase));
const shotLabel = computed(() => screenshotLabel(props.screenshotState));

const aiName = computed(() =>
  aiRecordAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    phase: props.aiPhase,
  }),
);
const diskName = computed(() =>
  diskRecordAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    phase: props.diskPhase,
  }),
);
const shotName = computed(() =>
  screenshotAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    state: props.screenshotState,
  }),
);
const clusterName = computed(() => {
  const label = (props.capsuleLabel || '').trim() || props.capsuleId;
  return `Record controls for ${label}`;
});

const clusterId = computed(() => recordClusterDomId(props.capsuleId));
const aiId = computed(() => aiRecordDomId(props.capsuleId));
const diskId = computed(() => diskRecordDomId(props.capsuleId));
const shotId = computed(() => screenshotDomId(props.capsuleId));

const aiAnchor = computed(() => aiRecordAnchor(props.capsuleId));
const diskAnchor = computed(() => diskRecordAnchor(props.capsuleId));
const shotAnchor = computed(() => screenshotAnchor(props.capsuleId));

const aiElapsedLabel = computed(() => formatElapsed(props.elapsedAi));
const diskElapsedLabel = computed(() => formatElapsed(props.elapsedDisk));

const aiDisabled = computed(() => props.disabled || aiBusy.value);
const diskDisabled = computed(() => props.disabled || diskBusy.value || !hasDestination.value);
const shotDisabled = computed(
  () => props.disabled || shotBusy.value || (shotTarget.value === 'disk' && !hasDestination.value),
);

const aiReason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (aiBusy.value) return `Recording is ${aiPhaseN.value}`;
  return '';
});
const diskReason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (!hasDestination.value) return DISK_DESTINATION_REASON;
  if (diskBusy.value) return `Recording is ${diskPhaseN.value}`;
  return '';
});
const shotReason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (shotTarget.value === 'disk' && !hasDestination.value) return DISK_DESTINATION_REASON;
  if (shotBusy.value) return 'Screenshot capture is pending';
  return '';
});

function onAiClick() {
  if (aiDisabled.value) return;
  emit(
    'submit-intent',
    buildRecordAiIntent({ capsuleId: props.capsuleId, phase: props.aiPhase }),
  );
}

function onDiskClick() {
  if (diskDisabled.value) return;
  emit(
    'submit-intent',
    buildRecordDiskIntent({
      capsuleId: props.capsuleId,
      phase: props.diskPhase,
      destination: props.diskDestination,
    }),
  );
}

function onShotClick() {
  if (shotDisabled.value) return;
  emit(
    'submit-intent',
    buildScreenshotIntent({
      capsuleId: props.capsuleId,
      target: shotTarget.value,
      destination: props.diskDestination,
    }),
  );
}
</script>

<template>
  <div :id="clusterId" class="ms-record-cluster" role="group" :aria-label="clusterName">
    <button
      :id="aiId"
      type="button"
      role="button"
      :class="'ms-record ms-record-ai ms-record-' + aiPhaseN"
      :data-semantic-anchor="aiAnchor"
      :aria-label="aiName"
      :title="aiReason || aiName"
      :disabled="aiDisabled"
      :aria-busy="aiBusy ? 'true' : undefined"
      :data-unavailable-reason="aiReason || undefined"
      @pointerdown.prevent
      @mousedown.prevent
      @click="onAiClick"
    >
      <span class="ms-record-dot" aria-hidden="true"></span>
      <span class="ms-record-label">{{ aiLabel }}</span>
      <span class="ms-record-elapsed" aria-hidden="true">{{ aiElapsedLabel }}</span>
      <span class="ms-record-store" aria-hidden="true">RAM</span>
    </button>
    <button
      :id="diskId"
      type="button"
      role="button"
      :class="'ms-record ms-record-disk ms-record-' + diskPhaseN"
      :data-semantic-anchor="diskAnchor"
      :aria-label="diskName"
      :title="diskReason || diskName"
      :disabled="diskDisabled"
      :aria-busy="diskBusy ? 'true' : undefined"
      :data-unavailable-reason="diskReason || undefined"
      @pointerdown.prevent
      @mousedown.prevent
      @click="onDiskClick"
    >
      <span class="ms-record-dot" aria-hidden="true"></span>
      <span class="ms-record-label">{{ diskLabel }}</span>
      <span class="ms-record-elapsed" aria-hidden="true">{{ diskElapsedLabel }}</span>
      <span class="ms-record-store" aria-hidden="true">DISK</span>
      <span v-if="hasDestination" class="ms-record-destination" aria-hidden="true">{{
        diskDestination
      }}</span>
    </button>
    <button
      :id="shotId"
      type="button"
      role="button"
      :class="'ms-record ms-record-shot ms-record-' + shotN"
      :data-semantic-anchor="shotAnchor"
      :aria-label="shotName"
      :title="shotReason || shotName"
      :disabled="shotDisabled"
      :aria-busy="shotBusy ? 'true' : undefined"
      :data-unavailable-reason="shotReason || undefined"
      @pointerdown.prevent
      @mousedown.prevent
      @click="onShotClick"
    >
      <span class="ms-record-dot" aria-hidden="true"></span>
      <span class="ms-record-label">{{ shotLabel }}</span>
      <span class="ms-record-store" aria-hidden="true">{{ shotTarget === 'disk' ? 'DISK' : 'RAM' }}</span>
    </button>
  </div>
</template>

<style>
.ms-record-cluster {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
}
.ms-record {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 30%, transparent);
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 10%, transparent);
  color: var(--cuk-primitive-color-rose-500);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.ms-record:hover {
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
}
.ms-record-recording,
.ms-record-capturing {
  background: var(--cuk-primitive-color-rose-500);
  border-color: var(--cuk-primitive-color-rose-500);
  color: var(--cuk-primitive-color-neutral-0);
}
.ms-record-recording:hover,
.ms-record-capturing:hover {
  background: var(--cuk-primitive-color-rose-600);
  border-color: var(--cuk-primitive-color-rose-600);
}
.ms-record-recording .ms-record-dot,
.ms-record-capturing .ms-record-dot {
  background: var(--cuk-primitive-color-neutral-0);
}
.ms-record-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-rose-500);
  flex: none;
  animation: ms-rec-pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.ms-record-elapsed {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-variant-numeric: tabular-nums;
}
.ms-record-store {
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-pill);
  padding: 0 var(--cuk-primitive-space-2);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.ms-record-recording .ms-record-store,
.ms-record-capturing .ms-record-store {
  border-color: var(--cuk-primitive-color-neutral-0);
  color: var(--cuk-primitive-color-neutral-0);
}
.ms-record-destination {
  max-width: var(--cuk-primitive-space-16);
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--cuk-semantic-text-muted);
}
.ms-record-recording .ms-record-destination {
  color: var(--cuk-primitive-color-neutral-0);
}
.ms-record:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.ms-record:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
@keyframes ms-rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .ms-record-dot { animation: none; }
}
</style>
