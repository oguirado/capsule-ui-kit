<script>
/**
 * @fileoverview SAAS-2 edge strip helpers: preserved-slot identity and the
 * restore intent for a missing panel slot. Presentation never invents slots;
 * every label arrives via props from the layout projection.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_EDGE_STRIP_SCHEMA = 'capsule-ui-kit.saas-edge-strip/v1';

/**
 * Builds the restore payload for a preserved slot.
 * @param {unknown} capsuleId
 * @param {unknown} slotId
 * @returns {{ capsuleId: string, slotId: string, anchor: string }}
 */
export function buildEdgeRestore(capsuleId, slotId) {
  const id = typeof capsuleId === 'string' ? capsuleId : '';
  const slot = typeof slotId === 'string' ? slotId : '';
  return { capsuleId: id, slotId: slot, anchor: `capsule/${id}/show` };
}

/**
 * Accessible name for the restore control.
 * @param {unknown} slotLabel
 * @returns {string}
 */
export function edgeRestoreName(slotLabel) {
  const label = typeof slotLabel === 'string' ? slotLabel.trim() : '';
  return label.length > 0 ? `Restore ${label}` : 'Restore reserved panel';
}
</script>
<script setup>
import { computed } from 'vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  slotId: { type: String, default: '' },
  slotLabel: { type: String, default: 'RESERVED SLOT' },
  slotDetail: { type: String, default: 'RESERVED CONTAINER' },
  preserved: { type: Boolean, default: true },
});

const emit = defineEmits(['restore']);

const restoreName = computed(() => edgeRestoreName(props.slotLabel));
const restoreAnchor = computed(() => `capsule/${props.capsuleId}/show`);

function onRestore() {
  emit('restore', buildEdgeRestore(props.capsuleId, props.slotId));
}
</script>
<template>
  <aside
    class="saas-edge-strip"
    :aria-label="slotLabel"
  >
    <div class="saas-edge-strip__head">
      <span class="saas-edge-strip__dot" aria-hidden="true"></span>
      <span class="saas-edge-strip__label">{{ slotLabel }} // {{ slotDetail }}</span>
    </div>
    <div class="saas-edge-strip__foot">
      <button
        type="button"
        class="saas-edge-strip__restore"
        :data-semantic-anchor="restoreAnchor"
        :aria-label="restoreName"
        title="Restore reserved panel"
        @click="onRestore"
      >
        <span aria-hidden="true">+</span>
      </button>
      <span v-if="preserved" class="saas-edge-strip__caption">PRESERVED</span>
    </div>
  </aside>
</template>
<style scoped>
.saas-edge-strip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  flex: none;
  width: var(
    --cuk-component-saas-detail-edge-strip-width,
    calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-4))
  );
  padding: var(--cuk-primitive-space-6) var(--cuk-primitive-space-0);
  background-color: var(--cuk-component-saas-detail-edge-strip-background, var(--cuk-semantic-surface-sunken));
  border-left: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-edge-strip__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  min-height: 0;
}
.saas-edge-strip__dot {
  width: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-2);
  flex: none;
  border-radius: 50%;
  background-color: var(--cuk-component-saas-detail-missing-dot-color, var(--cuk-semantic-status-warning-text));
}
.saas-edge-strip__label {
  writing-mode: vertical-rl;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-detail-missing-label-font-size, var(--cuk-semantic-typography-font-size-s1_10));
  letter-spacing: 0.08em;
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
}
.saas-edge-strip__foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
}
.saas-edge-strip__restore {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-font-size-s1_14);
  line-height: 1;
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
}
.saas-edge-strip__restore:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-edge-strip__restore:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-edge-strip__caption {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
}
</style>
