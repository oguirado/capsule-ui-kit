<script setup>
/**
 * @file Generic skip link for the kit shell (PL2 K3, pl1-017 companion).
 * First Tab stop: visually hidden until keyboard focus, then jumps to the
 * main landmark. No application names: the host supplies the target id.
 * Plain JS + JSDoc, no TypeScript.
 * @module shell/SkipLink
 */
import { computed } from 'vue';

const props = defineProps({
  id: { type: String, default: 'shell/skip-link' },
  targetId: { type: String, default: 'shell/wall' },
  label: { type: String, default: 'Skip to main content' },
  anchor: { type: String, default: 'shell/skip-link' },
});

/** @type {import('vue').ComputedRef<string>} */
const href = computed(() => `#${props.targetId}`);

/**
 * Move focus to the main landmark; give it a transient tabindex when it is
 * not natively focusable. getElementById (not querySelector) so ids with
 * slashes keep working.
 * @param {Event} event
 * @returns {void}
 */
function jump(event) {
  event.preventDefault();
  if (typeof document === 'undefined') return;
  const target = document.getElementById(props.targetId);
  if (!(target instanceof HTMLElement)) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus();
}
</script>
<template>
  <a :id="id" class="cuk-skip-link" :href="href" :data-semantic-anchor="anchor" @click="jump">{{ label }}</a>
</template>
<style>
.cuk-skip-link{
  position: absolute;
  top: var(--cuk-semantic-spacing-sm);
  left: var(--cuk-semantic-spacing-sm);
  z-index: var(--cuk-semantic-z-index-overlay);
  display: inline-block;
  padding: var(--cuk-semantic-spacing-sm) var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  text-decoration: none;
  white-space: nowrap;
  transform: translateY(-300%);
}
.cuk-skip-link:focus-visible{
  transform: none;
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
@media (forced-colors: active){
  .cuk-skip-link:focus-visible{
    outline-color: Highlight;
  }
}
</style>
