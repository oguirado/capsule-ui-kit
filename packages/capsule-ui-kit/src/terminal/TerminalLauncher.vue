<script>
/**
 * @fileoverview S1 session launcher popover for the terminal capsule (S4):
 * a "New Session" trigger opening a dialog with the available session kinds
 * (shell/pi/claude/codex). The popover starts closed and a launch emits only
 * from an explicit option click; Escape, Cancel and outside pointer close it.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const TERMINAL_LAUNCHER_SCHEMA = 'capsule-ui-kit.terminal-launcher/v1';
</script>
<script setup>
import { shallowRef, computed, nextTick } from 'vue';
import { TERMINAL_LAUNCHERS, TERMINAL_LAUNCHER_HINTS } from './terminalCapsuleModel.js';

const props = defineProps({
  commands: {
    type: Array,
    default: () => []
  },
  launching: {
    type: Boolean,
    default: false
  },
  sessionCount: {
    type: Number,
    default: 0
  },
  maxSessions: {
    type: Number,
    default: 8
  }
});

const emit = defineEmits(['launch', 'opened', 'closed']);

const open = shallowRef(false);
const triggerRef = shallowRef(/** @type {HTMLButtonElement|null} */ (null));
const dialogRef = shallowRef(/** @type {HTMLDivElement|null} */ (null));

const full = computed(() => props.sessionCount >= props.maxSessions);

/**
 * @param {string} id
 * @returns {boolean}
 */
function canLaunch(id) {
  return props.commands.includes(id) && !props.launching && !full.value;
}

/**
 * @param {string} id
 * @returns {string}
 */
function launcherHint(id) {
  return (/** @type {Readonly<Record<string,string>>} */ (TERMINAL_LAUNCHER_HINTS))[id] ?? '';
}

function focusFirstOption() {
  const dialog = dialogRef.value;
  if (dialog && typeof dialog.querySelector === 'function') {
    const target = dialog.querySelector('button:not([disabled])');
    if (target && target instanceof HTMLElement && typeof target.focus === 'function') target.focus();
  }
}

function focusTrigger() {
  const trigger = triggerRef.value;
  if (trigger && typeof trigger.focus === 'function') trigger.focus();
}

function onOpen() {
  if (open.value) return;
  open.value = true;
  emit('opened');
  nextTick(() => focusFirstOption());
}

function onClose() {
  if (!open.value) return;
  open.value = false;
  emit('closed');
  focusTrigger();
}

function onToggle() {
  if (open.value) onClose();
  else onOpen();
}

/**
 * @param {string} id
 */
function onLaunchOption(id) {
  if (!canLaunch(id)) return;
  open.value = false;
  emit('closed');
  emit('launch', { command: id });
  focusTrigger();
}

/**
 * @param {KeyboardEvent} event
 */
function onDialogKeydown(event) {
  if (event.key === 'Escape') {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    onClose();
  }
}
</script>
<template>
  <div class="cui-terminal-launcher">
    <button
      id="cui-terminal-launcher-trigger"
      ref="triggerRef"
      type="button"
      class="cui-terminal-launcher__trigger"
      role="button"
      data-semantic-anchor="terminal/launcher"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="cui-terminal-launcher-dialog"
      aria-label="Spawn agent session"
      @click="onToggle"
    >
      + New Session
    </button>
    <div
      v-if="open"
      class="cui-terminal-launcher__veil"
      aria-hidden="true"
      @pointerdown="onClose"
    />
    <div
      v-if="open"
      id="cui-terminal-launcher-dialog"
      ref="dialogRef"
      class="cui-terminal-launcher__dialog"
      role="dialog"
      aria-labelledby="cui-terminal-launcher-heading"
      aria-modal="false"
      @keydown="onDialogKeydown"
    >
      <p id="cui-terminal-launcher-heading" class="cui-terminal-launcher__heading">
        Select session kind
      </p>
      <ul class="cui-terminal-launcher__list" role="list" aria-label="Available session kinds">
        <li v-for="launcher in TERMINAL_LAUNCHERS" :key="launcher.id" class="cui-terminal-launcher__item">
          <button
            :id="`cui-terminal-launch-${launcher.id}`"
            type="button"
            class="cui-terminal-launcher__option"
            role="button"
            :data-semantic-anchor="`terminal/launch/${launcher.id}`"
            :aria-label="`Launch ${launcher.label} session${canLaunch(launcher.id) ? '' : ' (unavailable)'}`"
            :disabled="!canLaunch(launcher.id)"
            :aria-disabled="!canLaunch(launcher.id) ? 'true' : 'false'"
            @click="onLaunchOption(launcher.id)"
          >
            <span class="cui-terminal-launcher__option-label">{{ launcher.label }}</span>
            <span class="cui-terminal-launcher__option-hint">{{ launcherHint(launcher.id) }}</span>
          </button>
        </li>
      </ul>
      <p v-if="launching" class="cui-terminal-launcher__status" role="status">
        Starting session…
      </p>
      <p v-else-if="full" class="cui-terminal-launcher__status" role="status">
        Session limit reached ({{ maxSessions }}).
      </p>
      <button
        id="cui-terminal-launcher-cancel"
        type="button"
        class="cui-terminal-launcher__cancel"
        role="button"
        aria-label="Cancel session launcher"
        @click="onClose"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
<style scoped>
.cui-terminal-launcher {
  position: relative;
  display: inline-block;
}
.cui-terminal-launcher__trigger {
  min-height: var(--cuk-semantic-size-control-height-md);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-roles-label-md-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  cursor: pointer;
}
.cui-terminal-launcher__trigger:hover {
  background-color: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-strong);
}
.cui-terminal-launcher__trigger:focus-visible,
.cui-terminal-launcher__option:focus-visible,
.cui-terminal-launcher__cancel:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-terminal-launcher__veil {
  position: fixed;
  inset: 0;
  z-index: var(--cuk-semantic-z-index-overlay);
  background-color: var(--cuk-primitive-color-alpha-transparent);
}
.cui-terminal-launcher__dialog {
  position: absolute;
  top: calc(100% + var(--cuk-semantic-spacing-xs));
  left: 0;
  z-index: var(--cuk-semantic-z-index-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
  width: max-content;
  max-width: 100%;
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-md);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.cui-terminal-launcher__heading {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  text-transform: uppercase;
}
.cui-terminal-launcher__list {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
  list-style: none;
}
.cui-terminal-launcher__item {
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
}
.cui-terminal-launcher__option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--cuk-semantic-spacing-xxs);
  width: 100%;
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  border-radius: var(--cuk-semantic-radius-sm);
  text-align: left;
  cursor: pointer;
}
.cui-terminal-launcher__option:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}
.cui-terminal-launcher__option:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.cui-terminal-launcher__option-label {
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.cui-terminal-launcher__option-hint {
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-terminal-launcher__status {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-terminal-launcher__cancel {
  align-self: flex-end;
  min-height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-muted);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  cursor: pointer;
}
.cui-terminal-launcher__cancel:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-elevated);
}
</style>
