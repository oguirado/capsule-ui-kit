<script>
/**
 * @fileoverview S1 prompt composer for the terminal capsule (S4): the kit
 * target picker plus a multiline prompt field and an explicit Send. The
 * component only emits a `send` intent on Send click or Ctrl/Cmd+Enter (never
 * on mount, input, or paste); admission stays with the parent review path.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const TERMINAL_COMPOSER_SCHEMA = 'capsule-ui-kit.terminal-composer/v1';
</script>
<script setup>
import { shallowRef, computed } from 'vue';
import TargetPicker from '../orchestrator/TargetPicker.vue';

const props = defineProps({
  inputMode: {type:String,default:'structured'},
  sessions: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: /** @type {import('vue').PropType<string[]>} */ (Array),
    default: () => []
  },
  workspaceId: {
    type: String,
    default: 'ws-main'
  },
  epoch: {
    type: Number,
    default: 1
  },
  allowQueue: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    default: 'Compose prompt…'
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue', 'targets-changed', 'recipient-refused', 'send']);

const draft = shallowRef('');
const imeComposing = shallowRef(false);

const ptyRecipients = computed(() => props.sessions.flatMap(session => {
  if(!session || typeof session!=='object' || !('sessionId' in session) || typeof session.sessionId!=='string')return [];
  const title='title' in session && typeof session.title==='string' ? session.title : session.sessionId;
  return [{sessionId:session.sessionId,title}];
}));
const targets = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));

const canSend = computed(
  () =>
    !props.disabled &&
    !imeComposing.value &&
    targets.value.length > 0 &&
    draft.value.trim().length > 0
);

const sendName = computed(
  () => `Send to ${targets.value.length} target${targets.value.length === 1 ? '' : 's'}`
);

/**
 * @param {unknown} value
 */
function onTargets(value) {
  emit('update:modelValue', Array.isArray(value) ? [...value] : []);
}

/**
 * @param {{ mode?: string, targetIds?: readonly string[] }} payload
 */
function onTargetsChanged(payload) {
  emit('targets-changed', payload);
}

/**
 * @param {{ code?: string, message?: string, targetId?: string }} refusal
 */
function onRecipientRefused(refusal) {
  emit('recipient-refused', refusal);
}

/**
 * @param {Event} event
 */
function onInput(event) {
  const target = /** @type {HTMLTextAreaElement | null} */ (event?.target ?? null);
  draft.value = target && typeof target.value === 'string' ? target.value : '';
}

/** @param {Event} event */
function onPtyRecipient(event){const value=/** @type {HTMLSelectElement} */ (event.target).value;onTargets(value ? [value] : []);}

function onSend() {
  if (!canSend.value) return;
  emit('send', { text: draft.value, targetIds: [...targets.value] });
}

/**
 * @param {KeyboardEvent} event
 */
function onComposerKeydown(event) {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    onSend();
  }
}
</script>
<template>
  <div class="cui-terminal-composer">
    <TargetPicker v-if="inputMode !== 'pty'"
      :sessions="sessions"
      :model-value="targets"
      :workspace-id="workspaceId"
      :epoch="epoch"
      :allow-queue="allowQueue"
      @update:modelValue="onTargets"
      @targets-changed="onTargetsChanged"
      @recipient-refused="onRecipientRefused"
    />
    <label v-if="inputMode === 'pty'">Shell recipient
      <select id="terminal-composer-recipient" aria-label="Shell recipient" :value="targets[0] ?? ''" @change="onPtyRecipient">
        <option value="">Choose the active session</option>
        <option v-for="session in ptyRecipients" :key="session.sessionId" :value="session.sessionId">{{session.title}}</option>
      </select>
    </label>
    <label class="cui-terminal-composer__label" for="cui-terminal-composer">Prompt</label>
    <textarea
      id="cui-terminal-composer"
      class="cui-terminal-composer__input"
      role="textbox"
      aria-multiline="true"
      aria-label="Terminal prompt"
      data-semantic-anchor="terminal/composer"
      :value="draft"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
      @keydown="onComposerKeydown"
      @compositionstart="imeComposing = true"
      @compositionend="imeComposing = false"
    />
    <div class="cui-terminal-composer__row">
      <span class="cui-terminal-composer__hint">Ctrl+Enter to send</span>
      <button
        id="cui-terminal-composer-send"
        type="button"
        class="cui-terminal-composer__send"
        role="button"
        data-semantic-anchor="terminal/composer/send"
        :aria-label="sendName"
        :disabled="!canSend"
        :aria-disabled="!canSend ? 'true' : 'false'"
        @click="onSend"
      >
        Send
      </button>
    </div>
  </div>
</template>
<style scoped>
.cui-terminal-composer {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-md);
  min-width: 0;
  color: var(--cuk-semantic-text-primary);
}
.cui-terminal-composer__label {
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
}
.cui-terminal-composer__input {
  min-height: calc(var(--cuk-semantic-size-control-height-md) * 2);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-sunken);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  resize: vertical;
}
.cui-terminal-composer__input::placeholder {
  color: var(--cuk-semantic-text-disabled);
}
.cui-terminal-composer__input:focus-visible {
  border-color: var(--cuk-semantic-accent-primary);
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-terminal-composer__input:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
}
.cui-terminal-composer__row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
}
.cui-terminal-composer__hint {
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-terminal-composer__send {
  min-height: var(--cuk-semantic-size-control-height-md);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-semantic-accent-primary);
  color: var(--cuk-semantic-accent-primary-contrast);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-accent-primary);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  cursor: pointer;
}
.cui-terminal-composer__send:hover {
  background-color: var(--cuk-semantic-accent-primary-hover);
  border-color: var(--cuk-semantic-accent-primary-hover);
}
.cui-terminal-composer__send:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.cui-terminal-composer__send:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
</style>
