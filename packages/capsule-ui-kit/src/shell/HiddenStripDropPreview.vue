<script setup>
import { computed } from 'vue';

/**
 * Generic S1 drop-preview overlay for capsule drags. The host owns drag
 * tracking and layout mutation; this overlay renders the tab bar slot,
 * the four edge split zones and the center swap zone as operable
 * controls plus a live target/action footer. No application names.
 * @module shell/HiddenStripDropPreview
 */

/**
 * @typedef {object} DropZone
 * @property {string} id Stable zone id (`tab`, `split-top`, `split-bottom`, `split-left`, `split-right`, `swap`).
 * @property {string} label Visible zone label.
 * @property {string} [sub] Secondary zone line.
 */

const ALL_ZONES = Object.freeze(/** @type {DropZone[]} */ ([
  { id: 'tab', label: 'Drop Zone: Add as Tab', sub: 'Tab Bar Slot' },
  { id: 'split-top', label: '▲ Edge = Split Horizontal Top' },
  { id: 'split-bottom', label: '▼ Edge = Split Horizontal Bottom' },
  { id: 'split-left', label: '◀ Split Vertical' },
  { id: 'split-right', label: '▶ Split Vertical' },
  { id: 'swap', label: 'Center = Swap Capsule', sub: 'Drop here to replace active panel in grid' },
]));

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Drop preview' },
  draggedLabel: { type: String, default: '' },
  targetLabel: { type: String, default: '' },
  actionLabel: { type: String, default: 'Auto-Snap Active' },
  floatingHint: { type: String, default: 'Press Shift to force Floating Window' },
  zones: { type: Array, default: () => ['tab', 'split-top', 'split-bottom', 'split-left', 'split-right', 'swap'] },
});
const emit = defineEmits(['zone-activate']);

/** @type {import('vue').ComputedRef<DropZone[]>} */
const enabled = computed(() => {
  const wanted = new Set(/** @type {string[]} */ (/** @type {unknown} */ (props.zones)));
  return ALL_ZONES.filter((zone) => wanted.has(zone.id));
});
/** @param {string} id */
function has(id) {
  return enabled.value.some((zone) => zone.id === id);
}
/** @param {DropZone} zone */
function zoneLabel(zone) {
  const parts = [zone.label];
  if (zone.sub) parts.push(zone.sub);
  if (props.targetLabel !== '') parts.push(`Target: ${props.targetLabel}`);
  return parts.join('. ');
}
/** @param {DropZone} zone */
function activate(zone) {
  emit('zone-activate', zone.id);
}
</script>
<template>
  <section v-if="visible" id="shell/drop-preview" :aria-label="title" class="s1-drop">
    <p v-if="draggedLabel !== ''" id="shell/drop-preview/dragged" role="status" class="s1-drop-ghost">
      {{ draggedLabel }}
    </p>
    <button
      v-if="has('tab')"
      type="button"
      id="shell/drop-preview/zone-tab"
      data-semantic-anchor="shell/navigation/drop-tab"
      :aria-label="zoneLabel(enabled.find((zone) => zone.id === 'tab') ?? { id: 'tab', label: 'Add as Tab' })"
      class="s1-drop-zone s1-drop-tab"
      @click="activate(enabled.find((zone) => zone.id === 'tab') ?? { id: 'tab', label: 'Add as Tab' })"
    >
      <span class="s1-drop-label">Drop Zone: Add as Tab</span>
      <span class="s1-drop-sub">Tab Bar Slot</span>
    </button>
    <button
      v-if="has('split-top')"
      type="button"
      id="shell/drop-preview/zone-split-top"
      data-semantic-anchor="shell/navigation/drop-split-top"
      aria-label="Split horizontal top"
      class="s1-drop-zone s1-drop-edge s1-drop-top"
      @click="activate({ id: 'split-top', label: 'Split Horizontal Top' })"
    >
      <span class="s1-drop-label" aria-hidden="true">▲ Edge = Split Horizontal Top</span>
    </button>
    <button
      v-if="has('split-bottom')"
      type="button"
      id="shell/drop-preview/zone-split-bottom"
      data-semantic-anchor="shell/navigation/drop-split-bottom"
      aria-label="Split horizontal bottom"
      class="s1-drop-zone s1-drop-edge s1-drop-bottom"
      @click="activate({ id: 'split-bottom', label: 'Split Horizontal Bottom' })"
    >
      <span class="s1-drop-label" aria-hidden="true">▼ Edge = Split Horizontal Bottom</span>
    </button>
    <button
      v-if="has('split-left')"
      type="button"
      id="shell/drop-preview/zone-split-left"
      data-semantic-anchor="shell/navigation/drop-split-left"
      aria-label="Split vertical left"
      class="s1-drop-zone s1-drop-edge s1-drop-left"
      @click="activate({ id: 'split-left', label: 'Split Vertical Left' })"
    >
      <span class="s1-drop-label" aria-hidden="true">◀ Split Vertical</span>
    </button>
    <button
      v-if="has('split-right')"
      type="button"
      id="shell/drop-preview/zone-split-right"
      data-semantic-anchor="shell/navigation/drop-split-right"
      aria-label="Split vertical right"
      class="s1-drop-zone s1-drop-edge s1-drop-right"
      @click="activate({ id: 'split-right', label: 'Split Vertical Right' })"
    >
      <span class="s1-drop-label" aria-hidden="true">▶ Split Vertical</span>
    </button>
    <button
      v-if="has('swap')"
      type="button"
      id="shell/drop-preview/zone-swap"
      data-semantic-anchor="shell/navigation/drop-swap"
      :aria-label="zoneLabel({ id: 'swap', label: 'Center = Swap Capsule', sub: 'Drop here to replace active panel in grid' })"
      class="s1-drop-zone s1-drop-swap"
      @click="activate({ id: 'swap', label: 'Center = Swap Capsule' })"
    >
      <span class="s1-drop-label">Center = Swap Capsule</span>
      <span class="s1-drop-sub">Drop here to replace active panel in grid</span>
    </button>
    <footer class="s1-drop-foot">
      <p id="shell/drop-preview/status" role="status" class="s1-drop-target">
        <span v-if="targetLabel !== ''">Target: {{ targetLabel }}</span>
        <span>Action: {{ actionLabel }}</span>
      </p>
      <p class="s1-drop-hint"><kbd class="s1-drop-kbd">Shift</kbd> {{ floatingHint }}</p>
    </footer>
  </section>
</template>
<style>
.s1-drop{
  position: absolute; inset: 0;
  background: var(--cuk-semantic-surface-overlay);
  z-index: var(--cuk-semantic-z-index-floating);
}
.s1-drop .s1-drop-ghost{
  position: absolute;
  top: var(--cuk-semantic-spacing-md); left: var(--cuk-semantic-spacing-md);
  margin: 0; padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-accent-primary);
  border-radius: var(--cuk-semantic-radius-sm);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
  pointer-events: none;
}
.s1-drop .s1-drop-zone{
  position: absolute;
  display: flex; align-items: center; justify-content: center;
  gap: var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-selection-background);
  border: var(--cuk-semantic-border-width) dashed var(--cuk-semantic-accent-primary);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-accent);
  cursor: pointer;
}
.s1-drop .s1-drop-zone:hover{background: var(--cuk-semantic-surface-interactive-hover);}
.s1-drop .s1-drop-label{overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
.s1-drop .s1-drop-sub{
  padding: 0 var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-drop .s1-drop-tab{
  top: var(--cuk-semantic-spacing-md); left: var(--cuk-semantic-spacing-md); right: var(--cuk-semantic-spacing-md);
  min-height: var(--cuk-semantic-size-tab-height);
  padding: 0 var(--cuk-semantic-spacing-md);
}
.s1-drop .s1-drop-edge{padding: 0 var(--cuk-primitive-space-2);}
.s1-drop .s1-drop-top{
  top: calc(var(--cuk-semantic-size-tab-height) + var(--cuk-semantic-spacing-lg));
  left: var(--cuk-semantic-spacing-md); right: var(--cuk-semantic-spacing-md);
  min-height: var(--cuk-primitive-space-8);
}
.s1-drop .s1-drop-bottom{
  bottom: calc(var(--cuk-primitive-space-16) + var(--cuk-semantic-spacing-md));
  left: var(--cuk-semantic-spacing-md); right: var(--cuk-semantic-spacing-md);
  min-height: var(--cuk-primitive-space-8);
}
.s1-drop .s1-drop-left{
  top: calc(var(--cuk-semantic-size-tab-height) + var(--cuk-primitive-space-16));
  bottom: calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16));
  left: var(--cuk-semantic-spacing-md);
  min-width: var(--cuk-primitive-space-8);
}
.s1-drop .s1-drop-left .s1-drop-label{writing-mode: vertical-rl; transform: rotate(180deg);}
.s1-drop .s1-drop-right{
  top: calc(var(--cuk-semantic-size-tab-height) + var(--cuk-primitive-space-16));
  bottom: calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16));
  right: var(--cuk-semantic-spacing-md);
  min-width: var(--cuk-primitive-space-8);
}
.s1-drop .s1-drop-right .s1-drop-label{writing-mode: vertical-rl;}
.s1-drop .s1-drop-swap{
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  flex-direction: column;
  padding: var(--cuk-semantic-spacing-lg);
  background: var(--cuk-semantic-surface-elevated);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.s1-drop .s1-drop-swap .s1-drop-label{
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-headline-sm-font-weight);
  color: var(--cuk-semantic-text-primary);
  white-space: normal; text-align: center;
}
.s1-drop .s1-drop-foot{
  position: absolute; left: 0; right: 0; bottom: 0;
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-2) var(--cuk-semantic-spacing-md);
  background: var(--cuk-semantic-surface-panel);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-drop .s1-drop-target{
  margin: 0; display: inline-flex; flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-lg);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-drop .s1-drop-hint{
  margin: 0; display: inline-flex; align-items: center;
  gap: var(--cuk-primitive-space-2);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-drop .s1-drop-kbd{
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
}
.s1-drop :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
