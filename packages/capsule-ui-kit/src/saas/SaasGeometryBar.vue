<script>
/**
 * @fileoverview SAAS-2 geometry bar helpers: slot-size steppers with the
 * OpenNewton geometry law (900x800 default, 200 floor, 4096x2160 ceiling),
 * preset chips, snap intent, pane-visibility toggles and folded siblings.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_GEOMETRY_BAR_SCHEMA = 'capsule-ui-kit.saas-geometry-bar/v1';

export const DEFAULT_SLOT_GEOMETRY = Object.freeze({
  width: 900,
  height: 800,
  floor: 200,
  maxWidth: 4096,
  maxHeight: 2160,
});

export const GEOMETRY_STEP = 1;

export const SIBLING_TONES = Object.freeze(['running', 'idle', 'warning']);

/**
 * Semantic anchor for one stepper value (spinbutton per the registry row
 * `detail/{id}/stepper-{w,h}`). The -/+ buttons are unanchored affordances
 * with stable DOM ids; the value carries the agent anchor.
 * @param {unknown} capsuleId
 * @param {'w'|'h'} axis
 * @returns {string}
 */
export function geometryStepperAnchor(capsuleId, axis) {
  const id = typeof capsuleId === 'string' ? capsuleId : '';
  return `detail/${id}/stepper-${axis === 'h' ? 'h' : 'w'}`;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function asInt(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Clamps slot geometry into the geometry law bounds.
 * @param {unknown} width
 * @param {unknown} height
 * @param {{ floor?: unknown, maxWidth?: unknown, maxHeight?: unknown }} [bounds={}]
 * @returns {{ width: number, height: number }}
 */
export function clampGeometry(width, height, bounds = {}) {
  const floor = asInt(bounds.floor, DEFAULT_SLOT_GEOMETRY.floor);
  const maxWidth = asInt(bounds.maxWidth, DEFAULT_SLOT_GEOMETRY.maxWidth);
  const maxHeight = asInt(bounds.maxHeight, DEFAULT_SLOT_GEOMETRY.maxHeight);
  const low = Math.max(1, floor);
  return {
    width: Math.min(Math.max(low, maxWidth), Math.max(low, asInt(width, DEFAULT_SLOT_GEOMETRY.width))),
    height: Math.min(Math.max(low, maxHeight), Math.max(low, asInt(height, DEFAULT_SLOT_GEOMETRY.height))),
  };
}

/**
 * Steps one geometry axis, clamped; returns null when the step is a no-op.
 * @param {unknown} value
 * @param {unknown} delta
 * @param {{ min?: unknown, max?: unknown }} [bounds={}]
 * @returns {number|null}
 */
export function stepGeometryAxis(value, delta, bounds = {}) {
  const min = asInt(bounds.min, DEFAULT_SLOT_GEOMETRY.floor);
  const max = asInt(bounds.max, DEFAULT_SLOT_GEOMETRY.maxWidth);
  const low = Math.max(1, min);
  const high = Math.max(low, max);
  const current = Math.min(high, Math.max(low, asInt(value, low)));
  const next = Math.min(high, Math.max(low, current + asInt(delta, 0)));
  return next === current ? null : next;
}

/**
 * Validates a sibling dot tone.
 * @param {unknown} tone
 * @returns {'running'|'idle'|'warning'}
 */
export function siblingTone(tone) {
  if (tone === 'running' || tone === 'warning') return tone;
  return 'idle';
}
</script>
<script setup>
import { computed } from 'vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  width: { type: Number, default: 900 },
  height: { type: Number, default: 800 },
  floor: { type: Number, default: 200 },
  maxWidth: { type: Number, default: 4096 },
  maxHeight: { type: Number, default: 2160 },
  presets: {
    type: /** @type {import('vue').PropType<Array<{ presetId: string, label: string, width: number, height: number }>>} */ (Array),
    default: () => [],
  },
  activePresetId: { type: String, default: '' },
  surfaceHidden: { type: Boolean, default: false },
  terminalHidden: { type: Boolean, default: false },
  siblings: {
    type: /** @type {import('vue').PropType<Array<{ capsuleId: string, label: string, tone?: string }>>} */ (Array),
    default: () => [],
  },
  presentationInstance: { type: String, default: 'detail-geometry' },
});

const emit = defineEmits(['submit-intent']);

const stepUnit = GEOMETRY_STEP;
const stepperAnchorFor = geometryStepperAnchor;
const toneFor = siblingTone;

const bounds = computed(() => ({ floor: props.floor, maxWidth: props.maxWidth, maxHeight: props.maxHeight }));
const size = computed(() => clampGeometry(props.width, props.height, bounds.value));
const controlBase = computed(() => `saas-geometry-${props.capsuleId}`);

const surfaceAnchor = computed(() => `capsule/${props.capsuleId}/${props.surfaceHidden ? 'show' : 'hide'}`);
const terminalAnchor = computed(() => `capsule/${props.capsuleId}/${props.terminalHidden ? 'show' : 'hide'}`);

/**
 * @param {'w'|'h'} axis
 * @param {number} delta
 */
function onStep(axis, delta) {
  const current = axis === 'h' ? size.value.height : size.value.width;
  const next = stepGeometryAxis(current, delta, {
    min: props.floor,
    max: axis === 'h' ? props.maxHeight : props.maxWidth,
  });
  if (next === null) return;
  const geometry = axis === 'h'
    ? { width: size.value.width, height: next }
    : { width: next, height: size.value.height };
  emit('submit-intent', { intent: 'geometry.set', capsuleId: props.capsuleId, ...geometry });
}

/**
 * @param {{ presetId?: string, width?: number, height?: number }} preset
 */
function onPreset(preset) {
  const geometry = clampGeometry(preset.width, preset.height, bounds.value);
  emit('submit-intent', {
    intent: 'geometry.preset',
    capsuleId: props.capsuleId,
    presetId: typeof preset.presetId === 'string' ? preset.presetId : '',
    ...geometry,
  });
}

function onSnap() {
  emit('submit-intent', { intent: 'geometry.snap', capsuleId: props.capsuleId });
}

function onToggleSurface() {
  emit('submit-intent', { intent: 'slot.hide-surface', capsuleId: props.capsuleId, hidden: !props.surfaceHidden });
}

function onToggleTerminal() {
  emit('submit-intent', { intent: 'slot.hide-terminal', capsuleId: props.capsuleId, hidden: !props.terminalHidden });
}

/**
 * Arrow-key stepping on a spinbutton value (Up/Right +1, Down/Left -1).
 * @param {'w'|'h'} axis
 * @param {KeyboardEvent} event
 */
function onSpinKey(axis, event) {
  let delta = 0;
  if (event.key === 'ArrowUp' || event.key === 'ArrowRight') delta = GEOMETRY_STEP;
  else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') delta = -GEOMETRY_STEP;
  else return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  onStep(axis, delta);
}

/**
 * @param {{ capsuleId?: string }} sibling
 */
function onSibling(sibling) {
  if (typeof sibling.capsuleId !== 'string' || sibling.capsuleId.length === 0) return;
  emit('submit-intent', { intent: 'slot.unfold-sibling', capsuleId: props.capsuleId, siblingId: sibling.capsuleId });
}
</script>
<template>
  <div
    class="saas-geometry"
    role="toolbar"
    aria-label="Capsule geometry"
    :data-presentation-instance="presentationInstance"
  >
    <div class="saas-geometry__group">
      <button
        :id="`${controlBase}-hide-surface`"
        type="button"
        class="saas-geometry__toggle"
        :data-semantic-anchor="surfaceAnchor"
        :aria-pressed="surfaceHidden ? 'true' : 'false'"
        @click="onToggleSurface"
      >
        {{ surfaceHidden ? 'Show Surface' : 'Hide Surface' }}
      </button>
      <button
        :id="`${controlBase}-hide-terminal`"
        type="button"
        class="saas-geometry__toggle"
        :data-semantic-anchor="terminalAnchor"
        :aria-pressed="terminalHidden ? 'true' : 'false'"
        @click="onToggleTerminal"
      >
        {{ terminalHidden ? 'Show Terminal' : 'Hide Terminal' }}
      </button>
      <span class="saas-geometry__divider" aria-hidden="true"></span>
      <span class="saas-geometry__siblings-label">Siblings:</span>
      <button
        v-for="sibling in siblings"
        :key="sibling.capsuleId"
        type="button"
        class="saas-geometry__sibling"
        :data-semantic-anchor="`capsule/${sibling.capsuleId}/fold`"
        :aria-label="`Unfold ${sibling.label}`"
        @click="onSibling(sibling)"
      >
        <span :class="`saas-geometry__dot saas-geometry__dot--${toneFor(sibling.tone)}`" aria-hidden="true"></span>
        <span>{{ sibling.label }}</span>
      </button>
    </div>
    <div class="saas-geometry__group">
      <div class="saas-geometry__stepper" role="group" aria-label="Slot width">
        <span class="saas-geometry__axis" aria-hidden="true">W:</span>
        <button
          :id="`${controlBase}-w-down`"
          type="button"
          class="saas-geometry__step"
          aria-label="Decrease width"
          @click="onStep('w', -stepUnit)"
        >
          <span aria-hidden="true">−</span>
        </button>
        <span
          class="saas-geometry__value"
          role="spinbutton"
          tabindex="0"
          :data-semantic-anchor="stepperAnchorFor(capsuleId, 'w')"
          aria-label="Width in pixels"
          :aria-valuenow="size.width"
          :aria-valuemin="floor"
          :aria-valuemax="maxWidth"
          :aria-valuetext="`${size.width} pixels`"
          @keydown="onSpinKey('w', $event)"
        >{{ size.width }}</span>
        <button
          :id="`${controlBase}-w-up`"
          type="button"
          class="saas-geometry__step"
          aria-label="Increase width"
          @click="onStep('w', stepUnit)"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <div class="saas-geometry__stepper" role="group" aria-label="Slot height">
        <span class="saas-geometry__axis" aria-hidden="true">H:</span>
        <button
          :id="`${controlBase}-h-down`"
          type="button"
          class="saas-geometry__step"
          aria-label="Decrease height"
          @click="onStep('h', -stepUnit)"
        >
          <span aria-hidden="true">−</span>
        </button>
        <span
          class="saas-geometry__value"
          role="spinbutton"
          tabindex="0"
          :data-semantic-anchor="stepperAnchorFor(capsuleId, 'h')"
          aria-label="Height in pixels"
          :aria-valuenow="size.height"
          :aria-valuemin="floor"
          :aria-valuemax="maxHeight"
          :aria-valuetext="`${size.height} pixels`"
          @keydown="onSpinKey('h', $event)"
        >{{ size.height }}</span>
        <button
          :id="`${controlBase}-h-up`"
          type="button"
          class="saas-geometry__step"
          aria-label="Increase height"
          @click="onStep('h', stepUnit)"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
      <span class="saas-geometry__divider" aria-hidden="true"></span>
      <button
        v-for="preset in presets"
        :key="preset.presetId"
        type="button"
        class="saas-geometry__preset"
        :class="{ 'saas-geometry__preset--active': preset.presetId === activePresetId }"
        :id="`${controlBase}-preset-${preset.presetId}`"
        :aria-pressed="preset.presetId === activePresetId ? 'true' : 'false'"
        @click="onPreset(preset)"
      >
        {{ preset.label }}
      </button>
      <button
        :id="`${controlBase}-snap`"
        type="button"
        class="saas-geometry__snap"
        @click="onSnap"
      >
        Snap to Size
      </button>
    </div>
  </div>
</template>
<style scoped>
.saas-geometry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  flex: none;
  min-height: var(--cuk-component-saas-detail-geometry-bar-height, var(--cuk-primitive-space-16));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-6);
  background-color: var(--cuk-component-saas-detail-geometry-bar-background, var(--cuk-semantic-surface-chrome));
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-geometry__group {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  min-width: 0;
}
.saas-geometry__toggle {
  display: flex;
  align-items: center;
  height: var(--cuk-primitive-space-12);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.saas-geometry__toggle:hover {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-geometry__toggle:focus-visible,
.saas-geometry__sibling:focus-visible,
.saas-geometry__step:focus-visible,
.saas-geometry__value:focus-visible,
.saas-geometry__preset:focus-visible,
.saas-geometry__snap:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-geometry__divider {
  width: var(--cuk-semantic-border-width);
  height: var(--cuk-primitive-space-6);
  background-color: var(--cuk-semantic-border-default);
}
.saas-geometry__siblings-label {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-geometry__sibling {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  background-color: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.saas-geometry__sibling:hover {
  color: var(--cuk-semantic-text-primary);
}
.saas-geometry__dot {
  width: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-2);
  flex: none;
  border-radius: 50%;
  background-color: var(--cuk-semantic-text-muted);
}
.saas-geometry__dot--running {
  background-color: var(--cuk-component-saas-chip-success-text, var(--cuk-semantic-status-success-text));
}
.saas-geometry__dot--warning {
  background-color: var(--cuk-component-saas-chip-warning-text, var(--cuk-semantic-status-warning-text));
}
.saas-geometry__stepper {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  color: var(--cuk-semantic-text-muted);
}
.saas-geometry__axis {
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.saas-geometry__step {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--cuk-primitive-space-10);
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-2);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
}
.saas-geometry__step:hover {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-geometry__value {
  min-width: var(--cuk-primitive-space-16);
  text-align: center;
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-primary);
  border-radius: var(--cuk-semantic-radius-xs);
  cursor: default;
}
.saas-geometry__preset {
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.saas-geometry__preset:hover {
  color: var(--cuk-semantic-text-primary);
}
.saas-geometry__preset--active {
  color: var(--cuk-component-saas-chip-accent-text, var(--cuk-semantic-text-accent));
  border-color: var(--cuk-component-saas-chip-accent-border, var(--cuk-semantic-accent-primary));
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.saas-geometry__snap {
  display: flex;
  align-items: center;
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.saas-geometry__snap:hover {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
</style>
