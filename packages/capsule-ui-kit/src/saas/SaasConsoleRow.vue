<script>
/**
 * @fileoverview SAAS-2 closed console row helpers: a typed directive draft
 * with explicit Inspect / Submit / Cancel intents. The kit never executes
 * the draft; the parent adapter translates intents into backend verbs.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_CONSOLE_ROW_SCHEMA = 'capsule-ui-kit.saas-console-row/v1';

export const CONSOLE_ACTIONS = Object.freeze(['inspect', 'submit', 'cancel']);

/** @type {string} Existing kit anchor family for the console composer. */
export const CONSOLE_INPUT_ANCHOR = 'terminal/composer';

/**
 * Builds the intent payload for a console action.
 * @param {unknown} action
 * @param {unknown} capsuleId
 * @param {unknown} value
 * @returns {{ intent: string, capsuleId: string, value: string }}
 */
export function buildConsoleIntent(action, capsuleId, value) {
  const name = typeof action === 'string' ? action : '';
  if (!CONSOLE_ACTIONS.includes(name)) {
    throw new Error(`Unknown console action "${name}"`);
  }
  return {
    intent: `console.${name}`,
    capsuleId: typeof capsuleId === 'string' ? capsuleId : '',
    value: name === 'cancel' ? '' : (typeof value === 'string' ? value : ''),
  };
}
</script>
<script setup>
import { computed } from 'vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  draft: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  placeholder: { type: String, default: 'Enter console directive' },
});

const emit = defineEmits(['update:draft', 'submit-intent']);

const consoleAnchor = CONSOLE_INPUT_ANCHOR;
const controlBase = computed(() => `saas-console-${props.capsuleId}`);
const inputId = computed(() => `${controlBase.value}-input`);
const primaryDisabled = computed(() => props.disabled === true || props.busy === true);

/**
 * @param {Event} event
 */
function onInput(event) {
  const target = /** @type {HTMLInputElement|null} */ (event.target);
  emit('update:draft', target ? target.value : '');
}

/**
 * @param {'inspect'|'submit'|'cancel'} action
 */
function onAction(action) {
  emit('submit-intent', buildConsoleIntent(action, props.capsuleId, props.draft));
}
</script>
<template>
  <div class="saas-console">
    <div class="saas-console__field">
      <span class="saas-console__prompt" aria-hidden="true">$</span>
      <input
        :id="inputId"
        class="saas-console__input"
        type="text"
        :value="draft"
        :disabled="disabled"
        :placeholder="placeholder"
        :data-semantic-anchor="consoleAnchor"
        aria-label="Console directive"
        autocomplete="off"
        spellcheck="false"
        @input="onInput"
      />
    </div>
    <button
      :id="`${controlBase}-inspect`"
      type="button"
      class="saas-console__button saas-console__button--neutral"
      :disabled="primaryDisabled"
      @click="onAction('inspect')"
    >
      Inspect
    </button>
    <button
      :id="`${controlBase}-submit`"
      type="button"
      class="saas-console__button saas-console__button--primary"
      :disabled="primaryDisabled"
      @click="onAction('submit')"
    >
      Submit
    </button>
    <button
      :id="`${controlBase}-cancel`"
      type="button"
      class="saas-console__button saas-console__button--ghost"
      :disabled="disabled && !busy"
      @click="onAction('cancel')"
    >
      Cancel
    </button>
  </div>
</template>
<style scoped>
.saas-console {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
}
.saas-console__field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  min-width: 0;
  height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: var(
    --cuk-component-saas-detail-console-input-background,
    var(--cuk-semantic-surface-sunken)
  );
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
}
.saas-console__prompt {
  flex: none;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.saas-console__input {
  flex: 1;
  min-width: 0;
  padding: var(--cuk-primitive-space-0);
  background-color: transparent;
  border: none;
  outline: none;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.saas-console__input::placeholder {
  color: var(--cuk-semantic-text-muted);
}
.saas-console__field:focus-within {
  border-color: var(--cuk-semantic-focus-ring-color);
}
.saas-console__button {
  flex: none;
  height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-5);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  cursor: pointer;
}
.saas-console__button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.saas-console__button:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-console__button--neutral {
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-text-primary);
}
.saas-console__button--neutral:hover:not(:disabled) {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-console__button--primary {
  background-color: var(--cuk-semantic-accent-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-accent-primary);
  color: var(--cuk-semantic-surface-canvas);
}
.saas-console__button--ghost {
  background-color: transparent;
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-text-muted);
}
.saas-console__button--ghost:hover:not(:disabled) {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
</style>
