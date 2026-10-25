<script>
/**
 * Identity plate helpers (MS1 lane L2): identity chips + copy-capsule-ID.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * The plate renders host-projected identity only: unmeasured fields read
 * `unknown` (never `0`), and copy emits a `copy-id` intent — the kit never
 * touches the clipboard itself. The kit never invents an id: a missing or
 * unstable capsule id disables copy with a reason.
 * @module multislot/AiIdentityPlate
 */

/** Copy states projected by the host. @type {ReadonlyArray<string>} */
export const MULTISLOT_COPY_STATES = Object.freeze(['ready', 'copying', 'copied', 'unavailable']);

/** Emits declared by the plate setup block. @type {ReadonlyArray<string>} */
export const AI_IDENTITY_PLATE_EMITS = Object.freeze(['submit-intent']);

/** agent_lane/v1 id of the copy control. @type {string} */
export const MULTISLOT_COPY_ID_AGENT_LANE = 'multislot.copy-id';

/**
 * Stable capsule id format: `cap-<lower-alphanumeric-dashes>`, at most 40
 * characters in total (aligned with the lane L3 informational check).
 * @type {RegExp}
 */
export const CAPSULE_ID_PATTERN = /^cap-[a-z0-9-]{1,36}$/;

/**
 * Live-surface kinds admitted in copy-id payloads (aligned with lane L3).
 * @type {ReadonlyArray<string>}
 */
export const MULTISLOT_SURFACE_KINDS = Object.freeze(['program', 'browser', 'vm']);

/**
 * @param {unknown} value
 * @returns {boolean} True for a stable, host-assigned capsule id.
 */
export function isValidCapsuleId(value) {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value !== value.trim()) return false;
  if (/\s/.test(value)) return false;
  if (/^\d+$/.test(value)) return false;
  return CAPSULE_ID_PATTERN.test(value);
}

/**
 * @param {unknown} state
 * @returns {string} Known copy state, failing closed to `unavailable`.
 */
export function normalizeCopyState(state) {
  return MULTISLOT_COPY_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'unavailable';
}

/**
 * @param {unknown} state
 * @returns {string} Generic copy button label for the state.
 */
export function copyButtonLabel(state) {
  const normalized = normalizeCopyState(state);
  if (normalized === 'copying') return 'Copying';
  if (normalized === 'copied') return 'Copied';
  return 'Copy ID';
}

/**
 * @param {unknown} state
 * @returns {boolean} True while the host copy transition is pending.
 */
export function copyButtonBusy(state) {
  return normalizeCopyState(state) === 'copying';
}

/**
 * @param {unknown} value
 * @returns {string} Trimmed display text, or `unknown` when unmeasured.
 */
export function formatIdentityField(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'unknown';
  }
  if (typeof value === 'number' && Number.isFinite(value) && value !== 0) {
    return String(value);
  }
  return 'unknown';
}

/**
 * @param {string} capsuleId
 * @returns {{ plate: string, copy: string }} Stable DOM ids.
 */
export function identityPlateDomIds(capsuleId) {
  const scope = `cuk-multislot-identity-${capsuleId}`;
  return {
    plate: scope,
    copy: `cuk-multislot-copy-id-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor of the copy control.
 */
export function copyIdAnchor(capsuleId) {
  return `capsule/${capsuleId}/copy-id`;
}

/**
 * @param {{ capsuleLabel?: string, capsuleId: string, copyState?: unknown, capsuleValid?: boolean }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function copyAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId || 'unknown slot';
  if (input.capsuleValid !== true) return `Copy capsule ID unavailable for ${label}`;
  const state = normalizeCopyState(input.copyState);
  if (state === 'copying') return `Copying capsule ID for ${label}`;
  if (state === 'copied') return `Capsule ID copied for ${label}`;
  if (state === 'unavailable') return `Copy capsule ID unavailable for ${label}`;
  return `Copy capsule ID for ${label}`;
}

/**
 * @param {{ capsuleValid?: boolean, copyState?: unknown, unavailableReason?: string }} input
 * @returns {string} Literal reason, or `` when copy is offered.
 */
export function copyDisabledReason(input) {
  if (input.unavailableReason) return input.unavailableReason;
  if (input.capsuleValid !== true) return 'Capsule ID is missing or unstable';
  if (normalizeCopyState(input.copyState) === 'unavailable') return 'Copy unavailable from host';
  return '';
}

/**
 * @param {unknown} value
 * @returns {string} Trimmed token, or `` when absent or malformed.
 */
function cleanToken(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) return '';
  return trimmed;
}

/**
 * Strict identity member: slot/session ids must also survive the lane L3
 * capsule-id rules (no bare numerics, no display credentials).
 * @param {unknown} value
 * @returns {string} Usable identity member, or `` when unusable.
 */
function cleanIdentityToken(value) {
  const trimmed = cleanToken(value);
  if (trimmed.length === 0) return '';
  if (/^\d+$/.test(trimmed)) return '';
  if (trimmed.startsWith(':') || /^display=/i.test(trimmed)) return '';
  return trimmed;
}

/**
 * Builds the generic copy intent. Shape matches the lane L3 validator: the
 * payload nests under `payload`, optional members travel only when the host
 * supplied a well-formed value, and `surface` travels only for a known
 * surface kind. Nothing is invented here.
 * @param {{ capsuleId: string, slotId?: unknown, sessionId?: unknown, surfaceKind?: unknown, surfaceDisplay?: unknown, surfaceGeometry?: unknown, ts?: unknown }} input
 * @returns {{ type: string, capsuleId: string, payload: { capsule_id: string, slot_id?: string, session_id?: string, surface?: { kind: string, display?: string, geometry?: string }, ts: number } }} Frozen intent.
 */
export function buildCopyIdIntent(input) {
  const slotId = cleanIdentityToken(input.slotId);
  const sessionId = cleanIdentityToken(input.sessionId);
  const kind = cleanToken(input.surfaceKind);
  const payload = {
    capsule_id: input.capsuleId,
    ts: typeof input.ts === 'number' && Number.isFinite(input.ts) ? input.ts : Date.now(),
  };
  if (slotId) payload.slot_id = slotId;
  if (sessionId) payload.session_id = sessionId;
  if (MULTISLOT_SURFACE_KINDS.includes(kind)) {
    const surface = { kind };
    const display = cleanToken(input.surfaceDisplay);
    const geometry = cleanToken(input.surfaceGeometry);
    if (display) surface.display = display;
    if (geometry) surface.geometry = geometry;
    payload.surface = surface;
  }
  return Object.freeze({
    type: 'copy-id',
    capsuleId: input.capsuleId,
    payload: Object.freeze(payload),
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
 * @returns {{ capsuleId: string, capsuleLabel: string, slotId: string, sessionId: string, surfaceKind: string, surfaceDisplay: string, surfaceGeometry: string, copyState: string, disabled: boolean, unavailableReason: string }}
 */
export function aiIdentityPlateFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule 01',
    slotId: 'slot-01',
    sessionId: 'sess-01',
    surfaceKind: 'program',
    surfaceDisplay: ':1',
    surfaceGeometry: '1280x900',
    copyState: 'ready',
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
  capsuleId: { type: String, default: '' },
  capsuleLabel: { type: String, default: '' },
  slotId: { type: String, default: '' },
  sessionId: { type: String, default: '' },
  surfaceKind: { type: String, default: '' },
  surfaceDisplay: { type: String, default: '' },
  surfaceGeometry: { type: String, default: '' },
  copyState: { type: String, default: 'ready' },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const valid = computed(() => isValidCapsuleId(props.capsuleId));
const normalized = computed(() => normalizeCopyState(props.copyState));
const busy = computed(() => copyButtonBusy(props.copyState));
const label = computed(() => copyButtonLabel(props.copyState));
const isDisabled = computed(
  () => props.disabled || busy.value || !valid.value || normalized.value === 'unavailable',
);
const reason = computed(() =>
  copyDisabledReason({
    capsuleValid: valid.value,
    copyState: props.copyState,
    unavailableReason: props.unavailableReason,
  }),
);
const accessibleName = computed(() =>
  copyAccessibleName({
    capsuleLabel: props.capsuleLabel,
    capsuleId: props.capsuleId,
    copyState: props.copyState,
    capsuleValid: valid.value,
  }),
);
const plateLabel = computed(
  () => (props.capsuleLabel || '').trim() || props.capsuleId || 'unknown slot',
);
const ids = computed(() => identityPlateDomIds(props.capsuleId));
const anchor = computed(() => copyIdAnchor(props.capsuleId));
const laneId = computed(() => MULTISLOT_COPY_ID_AGENT_LANE);
const copyClass = computed(
  () => 'ms2-plate-copy' + (normalized.value === 'copied' ? ' ms2-plate-copy-copied' : ''),
);
const chips = computed(() =>
  [
    { key: 'capsule', label: 'Capsule', text: formatIdentityField(props.capsuleId) },
    { key: 'slot', label: 'Slot', text: formatIdentityField(props.slotId) },
    { key: 'session', label: 'Session', text: formatIdentityField(props.sessionId) },
    { key: 'surface', label: 'Surface', text: formatIdentityField(props.surfaceKind) },
    { key: 'display', label: 'Display', text: formatIdentityField(props.surfaceDisplay) },
    { key: 'geometry', label: 'Geometry', text: formatIdentityField(props.surfaceGeometry) },
  ].map((chip) => ({
    ...chip,
    title: `${chip.label}: ${chip.text}`,
    unknown: chip.text === 'unknown',
  })),
);

function onFocusGuard(event) {
  preserveMultislotControlFocusGuard(event);
}

function onClick() {
  if (isDisabled.value) return;
  emit(
    'submit-intent',
    buildCopyIdIntent({
      capsuleId: props.capsuleId,
      slotId: props.slotId,
      sessionId: props.sessionId,
      surfaceKind: props.surfaceKind,
      surfaceDisplay: props.surfaceDisplay,
      surfaceGeometry: props.surfaceGeometry,
      ts: Date.now(),
    }),
  );
}
</script>

<template>
  <div
    :id="ids.plate"
    role="group"
    class="ms2-plate"
    :aria-label="'Identity for ' + plateLabel"
    @pointerdown="onFocusGuard"
    @mousedown="onFocusGuard"
  >
    <span
      v-for="chip in chips"
      :key="chip.key"
      :id="ids.plate + '-chip-' + chip.key"
      :class="'ms2-plate-chip' + (chip.unknown ? ' ms2-plate-chip-unknown' : '')"
      :title="chip.title"
    >{{ chip.text }}</span>
    <button
      :id="ids.copy"
      type="button"
      role="button"
      :class="copyClass"
      :data-semantic-anchor="anchor"
      :data-agent-lane-id="laneId"
      :aria-label="accessibleName"
      :title="reason || accessibleName"
      :disabled="isDisabled"
      :aria-busy="busy ? 'true' : undefined"
      :data-copy-state="normalized"
      :data-unavailable-reason="reason || undefined"
      @pointerdown="onFocusGuard"
      @mousedown="onFocusGuard"
      @click="onClick"
    >{{ label }}</button>
  </div>
</template>

<style>
.ms2-plate {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--cuk-primitive-space-2);
}
.ms2-plate-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  border: var(--cuk-semantic-border-width) solid
    var(--cuk-component-ai-multi-slot-identity-chip-border, var(--cuk-semantic-border-subtle));
  background: var(--cuk-component-ai-multi-slot-identity-chip-background, var(--cuk-semantic-surface-panel));
  color: var(--cuk-component-ai-multi-slot-identity-chip-color, var(--cuk-semantic-text-muted));
  font-family: var(--cuk-component-ai-multi-slot-identity-mono-font-family, var(--cuk-semantic-typography-font-family-mono));
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: 1;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ms2-plate-chip-unknown {
  color: var(--cuk-component-ai-multi-slot-identity-unknown-color, var(--cuk-semantic-text-muted));
}
.ms2-plate-copy {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  border: var(--cuk-semantic-border-width) solid
    var(--cuk-component-ai-multi-slot-identity-chip-border, var(--cuk-semantic-border-default));
  background: var(--cuk-component-ai-multi-slot-identity-chip-background, var(--cuk-semantic-surface-panel));
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-component-ai-multi-slot-control-bar-font-family, var(--cuk-semantic-typography-font-family-sans));
  font-size: var(--cuk-component-ai-multi-slot-control-bar-font-size, var(--cuk-semantic-typography-font-size-xs));
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.ms2-plate-copy-copied {
  border-color: var(--cuk-component-ai-multi-slot-identity-copied-confirm-color, var(--cuk-semantic-status-success-icon));
}
.ms2-plate-copy:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.ms2-plate-copy:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
</style>
