<script>
/**
 * @fileoverview SAAS-2 developer-gated shell toggle helpers: locked for the
 * default role, interactive only when explicitly unlocked by the parent.
 * The kit never decides the role; it renders the gate it is given.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_SHELL_TOGGLE_SCHEMA = 'capsule-ui-kit.saas-shell-toggle/v1';

/**
 * Semantic anchor for the PTY toggle of one capsule.
 * @param {unknown} capsuleId
 * @returns {string}
 */
export function shellToggleAnchor(capsuleId) {
  return `detail/${typeof capsuleId === 'string' ? capsuleId : ''}/pty-toggle`;
}

/**
 * Resolves the effective toggle state from the gate props.
 * @param {{ locked?: unknown, disabled?: unknown, checked?: unknown, devGated?: unknown }} [input={}]
 * @returns {{ interactive: boolean, checked: boolean, caption: string }}
 */
export function resolveShellToggle(input = {}) {
  const locked = input.locked !== false;
  const disabled = input.disabled === true;
  const checked = input.checked === true && !locked && !disabled;
  const interactive = !locked && !disabled && input.devGated === true;
  let caption = 'OFF';
  if (locked || disabled) caption = 'LOCKED';
  else if (checked) caption = 'ON';
  return { interactive, checked, caption };
}
</script>
<script setup>
import { computed } from 'vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  checked: { type: Boolean, default: false },
  locked: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  devGated: { type: Boolean, default: false },
  label: { type: String, default: 'Dev Gated Shell' },
});

const emit = defineEmits(['change']);

const state = computed(() => resolveShellToggle({
  locked: props.locked,
  disabled: props.disabled,
  checked: props.checked,
  devGated: props.devGated,
}));
const anchor = computed(() => shellToggleAnchor(props.capsuleId));
const controlId = computed(() => `saas-shell-${props.capsuleId}`);
const accessibleName = computed(() => `${props.label}, ${state.value.caption}`);

/**
 * @param {Event} event
 */
function onChange(event) {
  if (!state.value.interactive) return;
  const target = /** @type {HTMLInputElement|null} */ (event.target);
  emit('change', { capsuleId: props.capsuleId, checked: target ? target.checked === true : false });
}
</script>
<template>
  <div class="saas-shell">
    <span class="saas-shell__label">
      <span class="saas-shell__dot" aria-hidden="true"></span>
      <span>{{ label }}</span>
    </span>
    <label class="saas-shell__switch" :class="{ 'saas-shell__switch--locked': !state.interactive }">
      <input
        :id="controlId"
        class="saas-shell__input"
        type="checkbox"
        role="switch"
        :checked="state.checked"
        :disabled="!state.interactive"
        :data-semantic-anchor="anchor"
        :aria-checked="state.checked ? 'true' : 'false'"
        :aria-label="accessibleName"
        @change="onChange"
      />
      <span class="saas-shell__track" aria-hidden="true"></span>
      <span class="saas-shell__caption">{{ state.caption }}</span>
    </label>
  </div>
</template>
<style scoped>
.saas-shell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding-top: var(--cuk-primitive-space-2);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-shell__label {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-detail-shell-toggle-label-font-size, var(--cuk-semantic-typography-font-size-xs));
  color: var(--cuk-semantic-text-muted);
}
.saas-shell__dot {
  width: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-2);
  flex: none;
  border-radius: 50%;
  background-color: var(--cuk-semantic-status-warning-text);
}
.saas-shell__switch {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  cursor: pointer;
}
.saas-shell__switch--locked {
  cursor: not-allowed;
  opacity: 0.6;
}
.saas-shell__input {
  position: absolute;
  width: var(--cuk-primitive-space-1);
  height: var(--cuk-primitive-space-1);
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.saas-shell__track {
  position: relative;
  flex: none;
  width: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  height: var(--cuk-primitive-space-8);
  border-radius: var(--cuk-primitive-space-8);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
}
.saas-shell__track::after {
  content: '';
  position: absolute;
  top: var(--cuk-primitive-space-1);
  left: var(--cuk-primitive-space-1);
  width: var(--cuk-primitive-space-6);
  height: var(--cuk-primitive-space-6);
  border-radius: 50%;
  background-color: var(--cuk-semantic-text-muted);
}
.saas-shell__input:checked + .saas-shell__track {
  background-color: var(--cuk-semantic-accent-primary);
  border-color: var(--cuk-semantic-accent-primary);
}
.saas-shell__input:checked + .saas-shell__track::after {
  left: calc(100% - var(--cuk-primitive-space-6) - var(--cuk-primitive-space-1));
  background-color: var(--cuk-semantic-surface-canvas);
}
.saas-shell__input:focus-visible + .saas-shell__track {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-shell__caption {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
}
</style>
