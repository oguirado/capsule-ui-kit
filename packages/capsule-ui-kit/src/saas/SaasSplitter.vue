<script>
/**
 * @fileoverview SAAS-2 vertical splitter helpers: keyboard (1px, Shift 10px)
 * and pointer resize of the attached terminal pane. The splitter is
 * stateless: the parent owns the pane width and clamps through props.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_SPLITTER_SCHEMA = 'capsule-ui-kit.saas-splitter/v1';

export const SPLITTER_STEP = 1;
export const SPLITTER_LARGE_STEP = 10;

/**
 * Semantic anchor for the separator handle (existing kit family
 * `workspace/separator/{id}`). The detail layout passes its presentation
 * instance as the handle id; standalone use falls back to the capsule id.
 * @param {unknown} handleId
 * @returns {string}
 */
export function splitterAnchor(handleId) {
  return `workspace/separator/${typeof handleId === 'string' && handleId.length > 0 ? handleId : ''}`;
}

/**
 * Clamps a pane width into [min, max]; non-finite input falls back to min.
 * @param {unknown} width
 * @param {{ min?: unknown, max?: unknown }} [bounds={}]
 * @returns {number}
 */
export function clampPaneWidth(width, bounds = {}) {
  const min = Number(bounds.min);
  const max = Number(bounds.max);
  const low = Number.isFinite(min) ? min : 200;
  const high = Number.isFinite(max) && max >= low ? max : low;
  const value = Number(width);
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * Terminal-pane width delta for a splitter key press. Arrow keys move the
 * separator itself, so the handle always follows the pressed direction: Left
 * moves the separator left (the right-hand terminal pane grows), Right moves
 * it right (the terminal pane shrinks).
 * @param {unknown} key
 * @param {unknown} shiftKey
 * @returns {number|null} Null when the key does not resize.
 */
export function splitterDeltaForKey(key, shiftKey) {
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
  const step = shiftKey === true ? SPLITTER_LARGE_STEP : SPLITTER_STEP;
  return key === 'ArrowLeft' ? step : -step;
}

/**
 * Clamped pane width for a splitter key press.
 * @param {unknown} position
 * @param {unknown} key
 * @param {unknown} shiftKey
 * @param {{ min?: unknown, max?: unknown }} [bounds={}]
 * @returns {number|null} Null when the key does not resize.
 */
export function splitterWidthForKey(position, key, shiftKey, bounds = {}) {
  const delta = splitterDeltaForKey(key, shiftKey);
  if (delta === null) return null;
  return clampPaneWidth(Number(position) + delta, bounds);
}
</script>
<script setup>
import { computed, shallowRef } from 'vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  separatorId: { type: String, default: '' },
  position: { type: Number, default: 450 },
  minWidth: { type: Number, default: 200 },
  maxWidth: { type: Number, default: 900 },
  paneId: { type: String, default: '' },
  paneLabel: { type: String, default: 'Terminal pane' },
  hintText: { type: String, default: 'Left / Right 1px | Shift 10px' },
  disabled: { type: Boolean, default: false },
  reducedMotion: { type: Boolean, default: false },
});

const emit = defineEmits(['resize']);

const anchor = computed(() => splitterAnchor(
  props.separatorId.length > 0 ? props.separatorId : props.capsuleId,
));
const hintId = computed(() => `saas-splitter-${props.capsuleId}-hint`);
const bounds = computed(() => ({ min: props.minWidth, max: props.maxWidth }));
const clamped = computed(() => clampPaneWidth(props.position, bounds.value));
const accessibleName = computed(() => `Resize ${props.paneLabel}`);
const dragState = shallowRef(/** @type {{ x: number, width: number }|null} */ (null));

/**
 * @param {number} width
 */
function emitResize(width) {
  emit('resize', { capsuleId: props.capsuleId, width: clampPaneWidth(width, bounds.value) });
}

/**
 * @param {KeyboardEvent} event
 */
function onKeydown(event) {
  if (props.disabled === true) return;
  const next = splitterWidthForKey(props.position, event.key, event.shiftKey === true, bounds.value);
  if (next === null) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  emitResize(next);
}

/**
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
  if (props.disabled === true || event.button !== 0) return;
  const target = /** @type {HTMLElement|null} */ (event.currentTarget);
  dragState.value = { x: event.clientX, width: clamped.value };
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
  emitResize(drag.width - (event.clientX - drag.x));
}

function onPointerUp() {
  dragState.value = null;
}
</script>
<template>
  <div
    class="saas-splitter"
    :class="{ 'saas-splitter--reduced': reducedMotion }"
    role="separator"
    tabindex="0"
    aria-orientation="vertical"
    :data-semantic-anchor="anchor"
    :aria-label="accessibleName"
    :aria-describedby="hintId"
    :aria-controls="paneId.length > 0 ? paneId : undefined"
    :aria-disabled="disabled ? 'true' : 'false'"
    @keydown="onKeydown"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <span class="saas-splitter__grip" aria-hidden="true"></span>
    <span :id="hintId" class="saas-splitter__hint">{{ hintText }}</span>
  </div>
</template>
<style scoped>
.saas-splitter {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  width: var(--cuk-component-saas-detail-splitter-width, var(--cuk-primitive-space-3));
  background-color: var(--cuk-semantic-surface-interactive);
  cursor: col-resize;
}
.saas-splitter:hover,
.saas-splitter:focus-visible {
  background-color: var(--cuk-component-saas-detail-splitter-active-background, var(--cuk-semantic-accent-primary));
}
.saas-splitter:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: calc(var(--cuk-semantic-focus-ring-offset) * -1);
}
.saas-splitter__grip {
  width: var(--cuk-primitive-space-1);
  height: var(--cuk-primitive-space-12);
  background-color: var(--cuk-semantic-border-default);
}
.saas-splitter:hover .saas-splitter__grip,
.saas-splitter:focus-visible .saas-splitter__grip {
  background-color: var(--cuk-semantic-surface-canvas);
}
.saas-splitter__hint {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 1;
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  transform: translate(-50%, -100%);
  border: var(--cuk-semantic-border-width) solid var(--cuk-component-saas-detail-splitter-hint-border, var(--cuk-semantic-border-default));
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--cuk-component-saas-detail-splitter-hint-background, var(--cuk-semantic-surface-sunken));
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-detail-splitter-hint-font-size, var(--cuk-semantic-typography-font-size-s1_10));
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  opacity: 0;
  pointer-events: none;
}
.saas-splitter:hover .saas-splitter__hint,
.saas-splitter:focus-visible .saas-splitter__hint {
  opacity: 1;
}
.saas-splitter--reduced .saas-splitter__hint {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .saas-splitter__hint {
    transition: none;
  }
}
</style>
