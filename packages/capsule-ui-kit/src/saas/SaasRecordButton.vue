<script>
/**
 * Generic SaaS record toggle (SAAS-1 record states).
 * Plain JavaScript with JSDoc; no imports; no product names.
 * Contract-compatible with the kit intent vocabulary: emits `submit-intent`
 * with `{ type: 'record', capsuleId, phase }` (CapsulePanel emits
 * `submit-intent` as `{ type, capsuleId }`).
 * @module saas/SaasRecordButton
 */

/** Recording axis phases (plan P:32). @type {ReadonlyArray<string>} */
export const SAAS_RECORD_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/** Button labels per phase; generic verbs only. @type {Readonly<Record<string, string>>} */
export const SAAS_RECORD_BUTTON_LABELS = Object.freeze({
  idle: 'Record',
  starting: 'Starting',
  recording: 'Stop',
  stopping: 'Stopping',
  sealed: 'Record',
  error: 'Record',
});

/**
 * @param {unknown} phase
 * @returns {string} Known phase, falling back to `idle`.
 */
export function normalizeRecordPhase(phase) {
  return SAAS_RECORD_PHASES.includes(/** @type {string} */ (phase))
    ? /** @type {string} */ (phase)
    : 'idle';
}

/**
 * @param {unknown} phase
 * @returns {string} Generic button label for the phase.
 */
export function recordButtonLabel(phase) {
  return SAAS_RECORD_BUTTON_LABELS[normalizeRecordPhase(phase)];
}

/**
 * @param {unknown} phase
 * @returns {boolean} True while the backend transition is pending.
 */
export function recordButtonBusy(phase) {
  const normalized = normalizeRecordPhase(phase);
  return normalized === 'starting' || normalized === 'stopping';
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, phase?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function recordAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId;
  const phase = normalizeRecordPhase(input.phase);
  if (phase === 'recording') return `Stop recording ${label}`;
  if (phase === 'starting' || phase === 'stopping') return `Recording transition pending for ${label}`;
  if (phase === 'error') return `Retry recording ${label}`;
  return `Record ${label}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id.
 */
export function recordDomId(capsuleId) {
  return `cuk-saas-record-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor (registry row owned by Lane E).
 */
export function recordAnchor(capsuleId) {
  return `capsule/${capsuleId}/record`;
}

/**
 * @param {{ capsuleId: string, phase?: unknown }} input
 * @returns {{ type: string, capsuleId: string, phase: string }} Intent payload.
 */
export function buildRecordIntent(input) {
  return Object.freeze({
    type: 'record',
    capsuleId: input.capsuleId,
    phase: normalizeRecordPhase(input.phase),
  });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, phase: string, disabled: boolean, unavailableReason: string }}
 */
export function saasRecordButtonFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleLabel: 'Capsule-01',
    phase: 'idle',
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
  phase: { type: String, default: 'idle' },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const normalized = computed(() => normalizeRecordPhase(props.phase));
const label = computed(() => recordButtonLabel(props.phase));
const busy = computed(() => recordButtonBusy(props.phase));
const isDisabled = computed(() => props.disabled || busy.value);
const accessibleName = computed(() =>
  recordAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    phase: props.phase,
  }),
);
const domId = computed(() => recordDomId(props.capsuleId));
const anchor = computed(() => recordAnchor(props.capsuleId));
const reason = computed(() => {
  if (props.unavailableReason) return props.unavailableReason;
  if (busy.value) return `Recording is ${normalized.value}`;
  return '';
});

function onClick() {
  if (isDisabled.value) return;
  emit('submit-intent', buildRecordIntent({ capsuleId: props.capsuleId, phase: props.phase }));
}
</script>

<template>
  <button
    :id="domId"
    type="button"
    role="button"
    :class="'saas-record saas-record-' + normalized"
    :data-semantic-anchor="anchor"
    :aria-label="accessibleName"
    :title="reason || accessibleName"
    :disabled="isDisabled"
    :aria-busy="busy ? 'true' : undefined"
    :data-unavailable-reason="reason || undefined"
    @click="onClick"
  >
    <span class="saas-record-dot" aria-hidden="true"></span>
    <span class="saas-record-label">{{ label }}</span>
  </button>
</template>

<style>
.saas-record {
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
.saas-record:hover {
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
}
.saas-record-recording {
  background: var(--cuk-primitive-color-rose-500);
  border-color: var(--cuk-primitive-color-rose-500);
  color: var(--cuk-primitive-color-neutral-0);
}
.saas-record-recording:hover {
  background: var(--cuk-primitive-color-rose-600);
  border-color: var(--cuk-primitive-color-rose-600);
}
.saas-record-recording .saas-record-dot {
  background: var(--cuk-primitive-color-neutral-0);
}
.saas-record-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-rose-500);
  flex: none;
  animation: saas-rec-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.saas-record:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.saas-record:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid
    var(--cuk-primitive-color-saas-indigo500, var(--cuk-semantic-focus-ring-color));
  outline-offset: 1px;
}
@keyframes saas-rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .saas-record-dot { animation: none; }
}
</style>
