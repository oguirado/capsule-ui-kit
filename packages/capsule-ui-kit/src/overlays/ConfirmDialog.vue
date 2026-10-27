<script setup>
import { nextTick, ref, watch } from 'vue';

/**
 * Generic S1 confirmation overlay: a modal dialog with an explicit Back /
 * Confirm pair and no implicit dismissal. The host owns the open state and
 * the consent invariant; the dialog only reports gestures. No application
 * names.
 * @module overlays/ConfirmDialog
 */

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  open: { type: Boolean, required: true },
  confirmLabel: { type: String, default: 'Confirm' },
  backLabel: { type: String, default: 'Back' },
  confirmDisabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'back']);

/** @type {import('vue').Ref<HTMLElement|null>} */
const panel = ref(/** @type {HTMLElement|null} */ (null));

watch(() => props.open, async (next) => {
  if (next) await nextTick();
  if (next) panel.value?.focus();
});

/** @returns {void} */
function onConfirm() {
  if (props.busy || props.confirmDisabled) return;
  emit('confirm');
}
/** @returns {void} */
function onBack() {
  emit('back');
}
</script>
<template>
  <div v-if="open" class="s1-confirm-backdrop">
    <div
      :id="id"
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="id + '-title'"
      :aria-describedby="description ? id + '-desc' : undefined"
      tabindex="-1"
      class="s1-confirm-panel"
      @keydown.escape="onBack"
    >
      <h3 :id="id + '-title'" class="s1-confirm-title">{{ title }}</h3>
      <p v-if="description" :id="id + '-desc'" class="s1-confirm-desc">{{ description }}</p>
      <div class="s1-confirm-body">
        <slot />
      </div>
      <div class="s1-confirm-footer">
        <button :data-semantic-anchor="'settings/control-' + (id + '-back').replace(/[^A-Za-z0-9._-]/g, '-')"
          type="button"
          :id="id + '-back'"
          class="s1-confirm-btn"
          @click="onBack"
        >{{ backLabel }}</button>
        <button :data-semantic-anchor="'settings/control-' + (id + '-confirm').replace(/[^A-Za-z0-9._-]/g, '-')"
          type="button"
          :id="id + '-confirm'"
          class="s1-confirm-btn s1-confirm-btn-primary"
          :disabled="busy || confirmDisabled"
          @click="onConfirm"
        >{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>
<style>
.s1-confirm-backdrop{
  position: fixed;
  inset: 0;
  background: var(--cuk-component-dialog-host-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--cuk-component-dialog-host-z-index);
}
.s1-confirm-panel{
  background: var(--cuk-component-dialog-host-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-component-dialog-host-border-color);
  border-radius: var(--cuk-component-dialog-host-border-radius);
  color: var(--cuk-semantic-text-primary);
  padding: var(--cuk-primitive-space-8);
  max-width: calc(var(--cuk-primitive-space-16) * 12);
  width: 100%;
}
.s1-confirm-panel :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.s1-confirm-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-headline-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-headline-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-headline-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-confirm-desc{
  margin: var(--cuk-primitive-space-3) 0 0;
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
.s1-confirm-body{
  margin-top: var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-confirm-footer{
  display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-3);
  margin-top: var(--cuk-primitive-space-5);
  padding-top: var(--cuk-primitive-space-4);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-confirm-btn{
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-5);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-canvas);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.s1-confirm-btn:hover{background: var(--cuk-semantic-surface-interactive);}
.s1-confirm-btn:disabled{
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.s1-confirm-btn-primary{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-accent-primary);
}
.s1-confirm-btn-primary:hover{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-accent-primary);
}
</style>
