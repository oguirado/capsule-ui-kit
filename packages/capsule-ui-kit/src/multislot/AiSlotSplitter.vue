<script>
/**
 * @fileoverview AI multislot pane splitter: horizontal + vertical separator.
 * The splitter is stateless: the parent owns the pane size and clamps through
 * props. Keyboard moves the separator 1px (Shift 10px); pointer drags use
 * capture with cancel shields. Plain JavaScript with JSDoc; no authored
 * TypeScript, no product imports.
 */

export const AI_SLOT_SPLITTER_SCHEMA = 'capsule-ui-kit.ai-slot-splitter/v1';

export const SPLITTER_STEP = 1;
export const SPLITTER_LARGE_STEP = 10;

/** Admitted separator axes. @type {ReadonlyArray<string>} */
export const SPLITTER_AXES = Object.freeze(['vertical', 'horizontal']);

/**
 * @param {unknown} axis
 * @returns {'vertical'|'horizontal'} Known axis, defaulting to `vertical`.
 */
export function normalizeSplitterAxis(axis) {
  return axis === 'horizontal' ? 'horizontal' : 'vertical';
}

/**
 * Clamps a pane size into [min, max]; non-finite input falls back to min.
 * @param {unknown} size
 * @param {{ min?: unknown, max?: unknown }} [bounds={}]
 * @returns {number}
 */
export function clampPaneSize(size, bounds = {}) {
  const min = Number(bounds.min);
  const max = Number(bounds.max);
  const low = Number.isFinite(min) ? min : 100;
  const high = Number.isFinite(max) && max >= low ? max : low;
  const value = Number(size);
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Terminal-pane size delta for a splitter key press. Arrow keys move the
 * separator itself: Left/Up move it towards the surface (the terminal pane
 * grows), Right/Down move it towards the terminal (the pane shrinks).
 * @param {unknown} key
 * @param {unknown} shiftKey
 * @param {unknown} [axis='vertical']
 * @returns {number|null} Null when the key does not resize on this axis.
 */
export function splitterDeltaForKey(key, shiftKey, axis = 'vertical') {
  const mode = normalizeSplitterAxis(axis);
  const grow = mode === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
  const shrink = mode === 'vertical' ? 'ArrowRight' : 'ArrowDown';
  if (key !== grow && key !== shrink) return null;
  const step = shiftKey === true ? SPLITTER_LARGE_STEP : SPLITTER_STEP;
  return key === grow ? step : -step;
}

/**
 * Clamped pane size for a splitter key press.
 * @param {unknown} position
 * @param {unknown} key
 * @param {unknown} shiftKey
 * @param {unknown} [axis='vertical']
 * @param {{ min?: unknown, max?: unknown }} [bounds={}]
 * @returns {number|null} Null when the key does not resize on this axis.
 */
export function splitterSizeForKey(position, key, shiftKey, axis = 'vertical', bounds = {}) {
  const delta = splitterDeltaForKey(key, shiftKey, axis);
  if (delta === null) return null;
  return clampPaneSize(Number(position) + delta, bounds);
}

/**
 * Semantic anchor for the separator handle (existing kit family
 * `workspace/separator/{id}`).
 * @param {unknown} handleId
 * @returns {string}
 */
export function splitterAnchor(handleId) {
  return `workspace/separator/${typeof handleId === 'string' && handleId.length > 0 ? handleId : ''}`;
}

/**
 * @param {unknown} axis
 * @returns {string} Keyboard hint for the badge on this axis.
 */
export function splitterHintText(axis) {
  return normalizeSplitterAxis(axis) === 'horizontal'
    ? 'Up / Down 1px | Shift 10px'
    : 'Left / Right 1px | Shift 10px';
}
</script>
<script setup>
import { computed, shallowRef } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  separatorId: { type: String, default: '' },
  axis: { type: String, default: 'vertical' },
  position: { type: Number, default: 360 },
  minSize: { type: Number, default: 100 },
  maxSize: { type: Number, default: 1000 },
  paneId: { type: String, default: '' },
  paneLabel: { type: String, default: 'Terminal pane' },
  hintText: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  reducedMotion: { type: Boolean, default: false },
});

const emit = defineEmits(['resize']);

const orientation = computed(() => normalizeSplitterAxis(props.axis));
const anchor = computed(() => splitterAnchor(
  props.separatorId.length > 0 ? props.separatorId : props.capsuleId,
));
const hintId = computed(() => `cuk-ai-splitter-${props.capsuleId}-hint`);
const bounds = computed(() => ({ min: props.minSize, max: props.maxSize }));
const clamped = computed(() => clampPaneSize(props.position, bounds.value));
const accessibleName = computed(() => `Resize ${props.paneLabel}`);
const hint = computed(() => (props.hintText.length > 0 ? props.hintText : splitterHintText(props.axis)));
const dragState = shallowRef(/** @type {{ origin: number, size: number }|null} */ (null));

/**
 * @param {number} size
 */
function emitResize(size) {
  emit('resize', { capsuleId: props.capsuleId, size: clampPaneSize(size, bounds.value) });
}

/**
 * @param {KeyboardEvent} event
 */
function onKeydown(event) {
  if (props.disabled === true) return;
  const next = splitterSizeForKey(props.position, event.key, event.shiftKey === true, props.axis, bounds.value);
  if (next === null) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  emitResize(next);
}

/**
 * @param {PointerEvent} event
 * @returns {number} Drag cursor on the resize axis.
 */
function cursorOnAxis(event) {
  return orientation.value === 'horizontal' ? event.clientY : event.clientX;
}

/**
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
  if (props.disabled === true || event.button !== 0) return;
  const target = /** @type {HTMLElement|null} */ (event.currentTarget);
  dragState.value = { origin: cursorOnAxis(event), size: clamped.value };
  if (target && typeof target.setPointerCapture === 'function' && event.pointerId !== undefined) {
    try { target.setPointerCapture(event.pointerId); } catch { /* no capture */ }
  }
}

/**
 * @param {PointerEvent} event
 */
function onPointerMove(event) {
  const drag = dragState.value;
  if (!drag) return;
  emitResize(drag.size - (cursorOnAxis(event) - drag.origin));
}

function onPointerEnd() {
  dragState.value = null;
}
</script>
<template>
  <div
    :id="`cuk-ai-splitter-${capsuleId}-${separatorId || 'main'}`"
    class="ai-splitter"
    :class="{ 'ai-splitter--horizontal': orientation === 'horizontal', 'ai-splitter--reduced': reducedMotion }"
    role="separator"
    tabindex="0"
    :aria-orientation="orientation"
    :data-semantic-anchor="anchor"
    :aria-label="accessibleName"
    :aria-describedby="hintId"
    :aria-controls="paneId.length > 0 ? paneId : undefined"
    :aria-disabled="disabled ? 'true' : 'false'"
    @keydown="onKeydown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerEnd"
    @pointercancel="onPointerEnd"
    @lostpointercapture="onPointerEnd"
    @blur="onPointerEnd"
  >
    <span class="ai-splitter__grip" aria-hidden="true"></span>
    <span :id="hintId" class="ai-splitter__hint">{{ hint }}</span>
  </div>
</template>
<style scoped>
.ai-splitter {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  width: var(--cuk-component-ai-multi-slot-splitter-thickness, var(--cuk-primitive-space-3));
  background-color: var(--cuk-component-ai-multi-slot-splitter-track-color, var(--cuk-semantic-surface-interactive));
  cursor: col-resize;
}
.ai-splitter--horizontal {
  width: auto;
  height: var(--cuk-component-ai-multi-slot-splitter-thickness, var(--cuk-primitive-space-3));
  cursor: row-resize;
}
.ai-splitter:hover {
  background-color: var(--cuk-component-ai-multi-slot-splitter-hover-color, var(--cuk-semantic-accent-primary));
}
.ai-splitter:focus-visible {
  background-color: var(--cuk-component-ai-multi-slot-splitter-active-color, var(--cuk-semantic-accent-primary));
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-component-ai-multi-slot-splitter-focus-ring-color, var(--cuk-semantic-focus-ring-color));
  outline-offset: calc(var(--cuk-semantic-focus-ring-offset) * -1);
}
.ai-splitter__grip {
  width: var(--cuk-primitive-space-1);
  height: var(--cuk-primitive-space-12);
  background-color: var(--cuk-semantic-border-default);
}
.ai-splitter--horizontal .ai-splitter__grip {
  width: var(--cuk-primitive-space-12);
  height: var(--cuk-primitive-space-1);
}
.ai-splitter:hover .ai-splitter__grip,
.ai-splitter:focus-visible .ai-splitter__grip {
  background-color: var(--cuk-semantic-surface-canvas);
}
.ai-splitter__hint {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 1;
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  transform: translate(-50%, -100%);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--cuk-semantic-surface-sunken);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  opacity: 0;
  pointer-events: none;
}
.ai-splitter:hover .ai-splitter__hint,
.ai-splitter:focus-visible .ai-splitter__hint {
  opacity: 1;
}
.ai-splitter--reduced .ai-splitter__hint {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .ai-splitter__hint {
    transition: none;
  }
}
</style>
