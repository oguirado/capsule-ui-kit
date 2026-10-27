<script>
/**
 * Stable EmptyWall DOM ids. Hosts rendering custom `primary-action` or
 * `secondary-action` slot content keep these ids on the kit buttons (slot
 * content only replaces button labelling), so agent tooling can rely on
 * them across slot overrides.
 */
export const EMPTY_WALL_IDS = Object.freeze({
  root: 'shell/empty-wall',
  title: 'shell/empty-wall/title',
  hint: 'shell/empty-wall/hint',
  actions: 'shell/empty-wall/actions',
  primary: 'shell/empty-wall/primary',
  secondary: 'shell/empty-wall/secondary',
});

/**
 * EmptyWall semantic anchors on the agent_lane/v1 surface. Mirrored by
 * `src/agent/emptyWallRegistryRows.js`; the row examples must equal these.
 */
export const EMPTY_WALL_ANCHORS = Object.freeze({
  root: 'shell/empty-wall',
  primary: 'shell/empty-wall/primary',
  secondary: 'shell/empty-wall/secondary',
});
</script>
<script setup>
import { computed, useSlots } from 'vue';
import UiButton from '../ui/UiButton.vue';

/**
 * Generic S1 empty-workspace wall: title, hint text and action slots for a
 * dock area with no capsules yet. The host opens its launcher by handling
 * `primary` (and optionally `secondary`); slot content only replaces button
 * labelling, so ids, anchors, roles and keyboard focus stay kit-owned and
 * stable. Styling is classes plus `--cuk-*` tokens only (CSP: no inline
 * styles, no style writes). No application names.
 * @module shell/EmptyWall
 * @slot primary-action Replaces the primary button label (default: `primaryLabel`).
 * @slot secondary-action Replaces the secondary button label (default: `secondaryLabel`).
 */

const props = defineProps({
  title: { type: String, default: 'No capsules yet' },
  hint: { type: String, default: 'Create a capsule to fill this workspace.' },
  primaryLabel: { type: String, default: 'New capsule' },
  secondaryLabel: { type: String, default: '' },
});
const emit = defineEmits(['primary', 'secondary']);
const slots = useSlots();
/** @type {import('vue').ComputedRef<boolean>} */
const hasPrimarySlot = computed(() => slots['primary-action'] !== undefined);
/** @type {import('vue').ComputedRef<boolean>} */
const hasSecondarySlot = computed(() => slots['secondary-action'] !== undefined);
/** @type {import('vue').ComputedRef<boolean>} */
const hasSecondary = computed(() => hasSecondarySlot.value || props.secondaryLabel !== '');
</script>
<template>
  <section
    id="shell/empty-wall"
    data-semantic-anchor="shell/empty-wall"
    aria-labelledby="shell/empty-wall/title"
    class="s1-empty-wall"
  >
    <div class="s1-empty-wall-body">
      <h2 id="shell/empty-wall/title" class="s1-empty-wall-title">{{ title }}</h2>
      <p id="shell/empty-wall/hint" class="s1-empty-wall-hint">{{ hint }}</p>
      <div id="shell/empty-wall/actions" class="s1-empty-wall-actions">
        <UiButton
          id="shell/empty-wall/primary"
          data-semantic-anchor="shell/empty-wall/primary"
          :label="primaryLabel"
          :aria-label="hasPrimarySlot ? undefined : primaryLabel"
          intent="primary"
          class="s1-empty-wall-primary"
          @click="emit('primary')"
        >
          <slot name="primary-action">{{ primaryLabel }}</slot>
        </UiButton>
        <UiButton
          v-if="hasSecondary"
          id="shell/empty-wall/secondary"
          data-semantic-anchor="shell/empty-wall/secondary"
          :label="secondaryLabel"
          :aria-label="hasSecondarySlot ? undefined : secondaryLabel"
          class="s1-empty-wall-secondary"
          @click="emit('secondary')"
        >
          <slot name="secondary-action">{{ secondaryLabel }}</slot>
        </UiButton>
      </div>
    </div>
  </section>
</template>
<style>
.s1-empty-wall{
  container-type: inline-size;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  max-width: 100%;
  background: var(--cuk-semantic-surface-panel);
  padding: var(--cuk-semantic-spacing-xl) var(--cuk-semantic-spacing-lg);
}
.s1-empty-wall-body{
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  max-width: 100%;
  text-align: center;
}
.s1-empty-wall-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-section-title-font-family);
  font-size: var(--cuk-semantic-typography-roles-section-title-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  line-height: var(--cuk-semantic-typography-line-height-tight);
  color: var(--cuk-semantic-text-primary);
}
.s1-empty-wall-hint{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-supporting-font-family);
  font-size: var(--cuk-semantic-typography-roles-supporting-font-size);
  line-height: var(--cuk-semantic-typography-line-height-normal);
  color: var(--cuk-semantic-text-muted);
}
.s1-empty-wall-actions{
  display: flex;
  flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-sm);
  justify-content: center;
}
/* Narrow dock areas (not viewports: the wall answers to its own inline
   size): stack the actions so labels never clip. em units keep the
   breakpoint root-relative (var() is invalid in container queries). */
@container (max-width: 30em){
  .s1-empty-wall{ padding: var(--cuk-semantic-spacing-lg) var(--cuk-semantic-spacing-md); }
  .s1-empty-wall-actions{ flex-direction: column; align-items: stretch; }
}
</style>
