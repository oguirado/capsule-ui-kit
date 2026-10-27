<script setup>
/**
 * Generic S1 timeline control ribbon: speed segment, advance buttons, cycle
 * readout and flag chip. The host supplies buttons with stable ids and the
 * readout strings; activation emits the button id.
 * @module lists/S1TimelineControls
 */

/**
 * @typedef {object} S1TimelineButton
 * @property {string} id Stable button id rendered verbatim.
 * @property {string} label Visible label.
 * @property {string} [name] Accessible name (defaults to label).
 * @property {string} [intent] Intent token rendered as data-intent.
 * @property {string} [kind] Button kind: segment or advance.
 * @property {boolean} [pressed] Pressed state (omitted when not boolean).
 * @property {boolean} [disabled] Disabled state.
 */

const props = defineProps({
  buttons: { type: /** @type {import('vue').PropType<ReadonlyArray<S1TimelineButton>>} */ (Array), required: true },
  cycleKey: { type: String, default: '' },
  cycleValue: { type: String, default: '' },
  flagLabel: { type: String, default: '' },
  label: { type: String, default: 'Timeline controls' },
  speedLabel: { type: String, default: 'Speed' },
});
const emit = defineEmits(['activate']);

/** @returns {S1TimelineButton[]} */
function all() {
  return /** @type {S1TimelineButton[]} */ (/** @type {unknown} */ (props.buttons));
}
/** @param {S1TimelineButton} button @returns {boolean} */
function isSegment(button) {
  return button.kind !== 'advance';
}
/** @returns {S1TimelineButton[]} */
function segmentButtons() {
  return all().filter(isSegment);
}
/** @returns {S1TimelineButton[]} */
function advanceButtons() {
  return all().filter((button) => !isSegment(button));
}
/** @param {S1TimelineButton} button @returns {string} */
function accessName(button) {
  return typeof button.name === 'string' && button.name.length > 0 ? button.name : button.label;
}
/** @param {S1TimelineButton} button @returns {'true'|'false'|undefined} */
function pressedState(button) {
  if (typeof button.pressed !== 'boolean') {
    return undefined;
  }
  return button.pressed ? 'true' : 'false';
}
/** @param {S1TimelineButton} button */
function activate(button) {
  if (button.disabled === true) {
    return;
  }
  emit('activate', button.id);
}
</script>
<template>
  <div class="s1-timeline-controls" role="group" :aria-label="label">
    <div class="s1-timeline-controls-buttons">
      <div v-if="segmentButtons().length" class="s1-timeline-segment" role="group" :aria-label="speedLabel">
        <button :data-semantic-anchor="'settings/control-' + (button.id).replace(/[^A-Za-z0-9._-]/g, '-')"
          v-for="button in segmentButtons()"
          :key="button.id"
          type="button"
          :id="button.id"
          :data-intent="button.intent || undefined"
          :title="accessName(button)"
          :aria-label="accessName(button)"
          :aria-pressed="pressedState(button)"
          :disabled="button.disabled === true"
          class="s1-timeline-segment-btn"
          :class="{ 's1-timeline-segment-active': button.pressed === true }"
          @click="activate(button)"
        >{{ button.label }}</button>
      </div>
      <button :data-semantic-anchor="'settings/control-' + (button.id).replace(/[^A-Za-z0-9._-]/g, '-')"
        v-for="button in advanceButtons()"
        :key="button.id"
        type="button"
        :id="button.id"
        :data-intent="button.intent || undefined"
        :title="accessName(button)"
        :aria-label="accessName(button)"
        :disabled="button.disabled === true"
        class="s1-timeline-advance"
        @click="activate(button)"
      >{{ button.label }}</button>
    </div>
    <div v-if="cycleKey || cycleValue || flagLabel" class="s1-timeline-readout">
      <span v-if="cycleKey || cycleValue" class="s1-timeline-cycle">
        <span v-if="cycleKey" class="s1-timeline-cycle-key">{{ cycleKey }}</span>
        <span v-if="cycleValue" class="s1-timeline-cycle-value">{{ cycleValue }}</span>
      </span>
      <span v-if="flagLabel" class="s1-timeline-flag">{{ flagLabel }}</span>
    </div>
  </div>
</template>
<style>
.s1-timeline-controls{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-4); flex-wrap: wrap;
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-sunken);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-timeline-controls-buttons{
  display: flex; align-items: center;
  gap: var(--cuk-primitive-space-4); flex-wrap: wrap;
}
.s1-timeline-segment{
  display: flex; align-items: center;
  padding: var(--cuk-primitive-space-1);
  background: var(--cuk-semantic-surface-chrome);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.s1-timeline-segment-btn{
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-3);
  background: transparent;
  border: var(--cuk-semantic-border-width) solid transparent;
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer; white-space: nowrap;
}
.s1-timeline-segment-btn:hover{
  color: var(--cuk-semantic-text-primary);
}
.s1-timeline-segment-active{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-subtle);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-accent);
}
.s1-timeline-advance{
  height: var(--cuk-component-app-shell-status-height);
  display: inline-flex; align-items: center;
  padding: 0 var(--cuk-primitive-space-5);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-text-accent);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-accent);
  cursor: pointer; white-space: nowrap;
}
.s1-timeline-advance:disabled{
  border-color: var(--cuk-semantic-border-subtle);
  color: var(--cuk-semantic-text-disabled);
  cursor: default;
}
.s1-timeline-readout{
  display: flex; align-items: center;
  gap: var(--cuk-primitive-space-6); flex-wrap: wrap;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.s1-timeline-cycle{
  display: inline-flex; align-items: center;
  gap: var(--cuk-primitive-space-2);
  white-space: nowrap;
}
.s1-timeline-cycle-key{
  color: var(--cuk-semantic-text-disabled);
}
.s1-timeline-cycle-value{
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  color: var(--cuk-semantic-text-primary);
}
.s1-timeline-flag{
  display: inline-flex; align-items: center;
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-primitive-color-amber-400);
  white-space: nowrap;
}
.s1-timeline-controls :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-text-accent);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
