<script>
/**
 * @fileoverview New-session menu for the side terminal: a "+ New" trigger
 * opening a dialog with the fixed System shell entry first, then the
 * host-supplied provider entries, then a custom executable dialog. The menu
 * starts closed and a launch emits only from an explicit option click or an
 * explicit custom-dialog confirm; Escape, Cancel and outside pointer close it.
 * Entries render one line each (icon, label, hint) inside a token-width dialog.
 * The kit holds no provider names: every provider entry arrives via props.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SIDE_TERMINAL_NEW_MENU_SCHEMA = 'capsule-ui-kit.side-terminal-new-menu/v1';

export {
  SIDE_TERMINAL_SYSTEM_ENTRY,
  SIDE_TERMINAL_PROVIDER_COMMAND,
  SIDE_TERMINAL_CUSTOM_MAX_ARGS,
  SIDE_TERMINAL_CUSTOM_MAX_ARG_BYTES
} from './sideTerminalModel.js';
</script>
<script setup>
import { setKitGeometryRule, clearKitGeometryRule } from '../workspace/kitGeometrySheet.js';
import { shallowRef, computed, nextTick, onBeforeUnmount } from 'vue';
import {
  SIDE_TERMINAL_MAX_SESSIONS,
  SIDE_TERMINAL_SYSTEM_ENTRY,
  SIDE_TERMINAL_PROVIDER_COMMAND,
  SIDE_TERMINAL_CUSTOM_MAX_ARGS,
  SIDE_TERMINAL_CUSTOM_MAX_ARG_BYTES,
  capSideTerminalMenuWidth
} from './sideTerminalModel.js';

const props = defineProps({
  providers: {
    type: /** @type {import('vue').PropType<Array<{id?:unknown,label?:unknown,hint?:unknown,argv?:unknown,command?:unknown}>>} */ (Array),
    default: () => []
  },
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
    default: SIDE_TERMINAL_MAX_SESSIONS
  }
});

const emit = defineEmits(['launch', 'opened', 'closed']);

const open = shallowRef(false);
const customOpen = shallowRef(false);
const triggerRef = shallowRef(/** @type {HTMLButtonElement|null} */ (null));
const dialogRef = shallowRef(/** @type {HTMLDivElement|null} */ (null));
const customDialogRef = shallowRef(/** @type {HTMLDivElement|null} */ (null));
const executableRef = shallowRef('');
const argsTextRef = shallowRef('');
const customErrorRef = shallowRef('');

const full = computed(() => props.sessionCount >= props.maxSessions);

/**
 * Host entries that carry a usable id, label and argv array.
 * @returns {Array<{id:string,label:string,hint:string,argv:string[],command:string|undefined}>}
 */
const validProviders = computed(() => {
  const out = [];
  for (const entry of props.providers ?? []) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const argv = Array.isArray(entry.argv) ? entry.argv : null;
    if (id.length === 0 || label.length === 0 || argv === null) continue;
    if (argv.some((x) => typeof x !== 'string')) continue;
    const hint = typeof entry.hint === 'string' ? entry.hint : '';
    const command = typeof entry.command === 'string' && entry.command.length > 0 ? entry.command : undefined;
    out.push({ id, label, hint, argv: [...argv], command });
  }
  return out;
});

/**
 * @typedef {object} SideMenuEntry
 * @property {string} id Entry id.
 * @property {string} label Visible label.
 * @property {readonly string[]} argv Executable plus arguments.
 * @property {string} [hint] Secondary description.
 * @property {string|undefined} [command] Broker command override.
 */

/**
 * @param {SideMenuEntry} entry
 * @returns {string}
 */
function resolvedCommand(entry) {
  if (typeof entry.command === 'string' && entry.command.length > 0) return entry.command;
  return entry.id === SIDE_TERMINAL_SYSTEM_ENTRY.id
    ? SIDE_TERMINAL_SYSTEM_ENTRY.command
    : SIDE_TERMINAL_PROVIDER_COMMAND;
}

/**
 * @param {SideMenuEntry} entry
 * @returns {boolean}
 */
function canLaunch(entry) {
  return props.commands.includes(resolvedCommand(entry)) && !props.launching && !full.value;
}

/**
 * Single launch commit: every menu click and the custom confirm funnel here
 * so `launch` emits from exactly one explicit handler.
 * @param {{entryId:string,command:string,args:string[],title:string,kind:string}} spec
 */
function commitLaunch(spec) {
  open.value = false;
  customOpen.value = false;
  stopResizeWatch();
  emit('closed');
  emit('launch', {
    entryId: spec.entryId,
    command: spec.command,
    args: spec.args,
    title: spec.title,
    kind: spec.kind
  });
  focusTrigger();
}

/**
 * @param {SideMenuEntry} entry
 */
function onLaunchOption(entry) {
  if (!canLaunch(entry)) return;
  commitLaunch({
    entryId: entry.id,
    command: resolvedCommand(entry),
    args: [...entry.argv],
    title: entry.label,
    kind: entry.id
  });
}

function focusFirstOption() {
  const dialog = customOpen.value ? customDialogRef.value : dialogRef.value;
  if (dialog && typeof dialog.querySelector === 'function') {
    const target = dialog.querySelector('button:not([disabled]), input:not([disabled])');
    if (target && target instanceof HTMLElement && typeof target.focus === 'function') target.focus();
  }
}

function focusTrigger() {
  const trigger = triggerRef.value;
  if (trigger && typeof trigger.focus === 'function') trigger.focus();
}

/**
 * @returns {number} Viewport width in pixels, defaulting to the 1280 reference.
 */
function viewportWidth() {
  try {
    const width = globalThis?.window?.innerWidth ?? 0;
    return typeof width === 'number' && width > 0 ? width : 1280;
  } catch {
    return 1280;
  }
}

/**
 * Shrinks the right-anchored dialog when its natural width would push it
 * past the panel's left edge (pl1-020..025): the dialog keeps its right edge
 * at the trigger while long hints ellipsize. Best-effort: when measurement
 * is unavailable the CSS right anchor stands alone.
 */
function fitDialogToPanel() {
  const dialog = customOpen.value ? customDialogRef.value : dialogRef.value;
  const trigger = triggerRef.value;
  if (!dialog || !trigger) return;
  try {
    if (typeof dialog.getBoundingClientRect !== 'function' || typeof trigger.getBoundingClientRect !== 'function') return;
    clearKitGeometryRule(dialog.ownerDocument, `side-menu:${dialog.id}`);
    const naturalWidth = dialog.offsetWidth;
    const triggerRight = trigger.getBoundingClientRect().right;
    let panelLeft = 0;
    const panel = trigger.closest('[data-semantic-anchor="terminal/side/panel"]');
    if (panel && typeof panel.getBoundingClientRect === 'function') {
      panelLeft = panel.getBoundingClientRect().left;
    }
    const cap = capSideTerminalMenuWidth({ triggerRight, dialogWidth: naturalWidth, panelLeft, viewportWidth: viewportWidth() });
    if (cap !== null) {
      setKitGeometryRule(dialog.ownerDocument, `side-menu:${dialog.id}`, dialog.id, { maxWidth: `${cap}px`, minWidth: '0px' });
    }
  } catch {
    /* Measurement is best-effort: the CSS right anchor still holds. */
  }
}

function onWindowResize() {
  if (open.value) fitDialogToPanel();
}

function stopResizeWatch() {
  try {
    globalThis?.window?.removeEventListener?.('resize', onWindowResize);
  } catch {
    /* Listener teardown is best-effort. */
  }
}

onBeforeUnmount(stopResizeWatch);

function onOpen() {
  if (open.value) return;
  open.value = true;
  emit('opened');
  try {
    globalThis?.window?.addEventListener?.('resize', onWindowResize);
  } catch {
    /* Resize refit is best-effort outside a browser window. */
  }
  nextTick(() => { focusFirstOption(); fitDialogToPanel(); });
}

function onClose() {
  if (!open.value) return;
  open.value = false;
  customOpen.value = false;
  stopResizeWatch();
  emit('closed');
  focusTrigger();
}

function onToggle() {
  if (open.value) onClose();
  else onOpen();
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

function onOpenCustom() {
  if (props.launching || full.value) return;
  customOpen.value = true;
  customErrorRef.value = '';
  nextTick(() => { focusFirstOption(); fitDialogToPanel(); });
}

function onBackToMenu() {
  customOpen.value = false;
  customErrorRef.value = '';
  nextTick(() => { focusFirstOption(); fitDialogToPanel(); });
}

/**
 * Parses the custom dialog fields into a validated argv array.
 * @returns {{argv:string[]|null,error:string}}
 */
function parseCustomArgv() {
  const executable = executableRef.value.trim();
  if (executable.length === 0) return { argv: null, error: 'Enter an executable.' };
  if (executable.startsWith('-')) return { argv: null, error: 'The executable must not start with a dash.' };
  const rest = argsTextRef.value.trim().length === 0 ? [] : argsTextRef.value.trim().split(/\s+/);
  const argv = [executable, ...rest];
  if (argv.length > SIDE_TERMINAL_CUSTOM_MAX_ARGS) {
    return { argv: null, error: `Too many arguments (at most ${SIDE_TERMINAL_CUSTOM_MAX_ARGS}).` };
  }
  for (const arg of argv) {
    if (arg.includes('\0')) return { argv: null, error: 'Arguments must not contain null bytes.' };
    if (new TextEncoder().encode(arg).length > SIDE_TERMINAL_CUSTOM_MAX_ARG_BYTES) {
      return { argv: null, error: 'One argument exceeds the size limit.' };
    }
  }
  if (!props.commands.includes(SIDE_TERMINAL_PROVIDER_COMMAND)) {
    return { argv: null, error: 'Custom commands are unavailable.' };
  }
  return { argv, error: '' };
}

function onConfirmCustom() {
  if (props.launching || full.value) return;
  const parsed = parseCustomArgv();
  if (!parsed.argv) {
    customErrorRef.value = parsed.error;
    return;
  }
  customErrorRef.value = '';
  commitLaunch({
    entryId: 'custom',
    command: SIDE_TERMINAL_PROVIDER_COMMAND,
    args: parsed.argv,
    title: 'Custom command',
    kind: 'custom'
  });
}
</script>
<template>
  <div class="cui-side-terminal-new">
    <button
      id="cui-side-terminal-new"
      ref="triggerRef"
      type="button"
      class="cui-side-terminal-new__trigger"
      role="button"
      data-semantic-anchor="terminal/side/new"
      aria-haspopup="dialog"
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="cui-side-terminal-dialog"
      aria-label="New terminal session"
      @click="onToggle"
    >
      + New
    </button>
    <div
      v-if="open"
      class="cui-side-terminal-new__veil"
      aria-hidden="true"
      @pointerdown="onClose"
    />
    <div
      v-if="open && !customOpen"
      id="cui-side-terminal-dialog"
      aria-label="New terminal session"
      data-semantic-anchor="terminal/side/dialog"
      ref="dialogRef"
      class="cui-side-terminal-new__dialog"
      role="dialog"
      aria-labelledby="cui-side-terminal-heading"
      aria-modal="false"
      @keydown="onDialogKeydown"
    >
      <p id="cui-side-terminal-heading" class="cui-side-terminal-new__heading">
        New terminal session
      </p>
      <ul class="cui-side-terminal-new__list" role="list" aria-label="Available session kinds">
        <li class="cui-side-terminal-new__item">
          <button
            id="cui-side-terminal-launch-shell"
            type="button"
            class="cui-side-terminal-new__option"
            role="button"
            data-semantic-anchor="terminal/launch/shell"
            :aria-label="`Launch ${SIDE_TERMINAL_SYSTEM_ENTRY.label} session${canLaunch(SIDE_TERMINAL_SYSTEM_ENTRY) ? '' : ' (unavailable)'}`"
            :title="SIDE_TERMINAL_SYSTEM_ENTRY.hint"
            :disabled="!canLaunch(SIDE_TERMINAL_SYSTEM_ENTRY)"
            :aria-disabled="!canLaunch(SIDE_TERMINAL_SYSTEM_ENTRY) ? 'true' : 'false'"
            @click="onLaunchOption(SIDE_TERMINAL_SYSTEM_ENTRY)"
          >
            <span class="cui-side-terminal-new__option-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3.6" width="12" height="8.8" rx="1" />
                <path d="M5.4 6.6l1.9 1.7-1.9 1.7M8.6 10.6h2.4" />
              </svg>
            </span>
            <span class="cui-side-terminal-new__option-text">
              <span class="cui-side-terminal-new__option-label">{{ SIDE_TERMINAL_SYSTEM_ENTRY.label }}</span>
              <span class="cui-side-terminal-new__option-hint">{{ SIDE_TERMINAL_SYSTEM_ENTRY.hint }}</span>
            </span>
          </button>
        </li>
        <li v-for="provider in validProviders" :key="provider.id" class="cui-side-terminal-new__item">
          <button
            :id="`cui-side-terminal-launch-${provider.id}`"
            type="button"
            class="cui-side-terminal-new__option"
            role="button"
            :data-semantic-anchor="`terminal/launch/${'provider/' + provider.id}`"
            :aria-label="`Launch ${provider.label} session${canLaunch(provider) ? '' : ' (unavailable)'}`"
            :title="provider.hint || provider.label"
            :disabled="!canLaunch(provider)"
            :aria-disabled="!canLaunch(provider) ? 'true' : 'false'"
            @click="onLaunchOption(provider)"
          >
            <span class="cui-side-terminal-new__option-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3.6" width="12" height="8.8" rx="1" />
                <path d="M5.4 6.6l1.9 1.7-1.9 1.7M8.6 10.6h2.4" />
              </svg>
            </span>
            <span class="cui-side-terminal-new__option-text">
              <span class="cui-side-terminal-new__option-label">{{ provider.label }}</span>
              <span v-if="provider.hint" class="cui-side-terminal-new__option-hint">{{ provider.hint }}</span>
            </span>
          </button>
        </li>
        <li class="cui-side-terminal-new__item">
          <button
            id="cui-side-terminal-custom"
            type="button"
            class="cui-side-terminal-new__option"
            role="button"
            data-semantic-anchor="terminal/side/custom-open"
            aria-label="Run a custom command"
            title="Executable plus arguments, typed by you"
            :disabled="launching || full"
            :aria-disabled="launching || full ? 'true' : 'false'"
            @click="onOpenCustom"
          >
            <span class="cui-side-terminal-new__option-icon" aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3.6" width="12" height="8.8" rx="1" />
                <path d="M5.4 6.6l1.9 1.7-1.9 1.7M8.6 10.6h2.4" />
              </svg>
            </span>
            <span class="cui-side-terminal-new__option-text">
              <span class="cui-side-terminal-new__option-label">Custom…</span>
              <span class="cui-side-terminal-new__option-hint">Executable plus arguments, typed by you</span>
            </span>
          </button>
        </li>
      </ul>
      <p v-if="launching" class="cui-side-terminal-new__status" role="status">
        Starting session…
      </p>
      <p v-else-if="full" class="cui-side-terminal-new__status" role="status">
        Session limit reached ({{ maxSessions }}).
      </p>
      <button
        id="cui-side-terminal-cancel"
      data-semantic-anchor="terminal/side/cancel"
        type="button"
        class="cui-side-terminal-new__cancel"
        role="button"
        aria-label="Cancel new session menu"
        @click="onClose"
      >
        Cancel
      </button>
    </div>
    <div
      v-if="open && customOpen"
      id="cui-side-terminal-custom-dialog"
      aria-label="Custom command"
      ref="customDialogRef"
      class="cui-side-terminal-new__dialog"
      role="dialog"
      data-semantic-anchor="terminal/side/custom-dialog"
      aria-labelledby="cui-side-terminal-custom-heading"
      aria-modal="false"
      @keydown="onDialogKeydown"
    >
      <p id="cui-side-terminal-custom-heading" class="cui-side-terminal-new__heading">
        Custom command
      </p>
      <label class="cui-side-terminal-new__field" for="cui-side-terminal-custom-executable">
        Executable
      </label>
      <input
        id="cui-side-terminal-custom-executable"
      aria-label="Custom command executable"
      data-semantic-anchor="terminal/side/custom-executable"
        v-model="executableRef"
        class="cui-side-terminal-new__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="cui-side-terminal-custom-help"
      />
      <label class="cui-side-terminal-new__field" for="cui-side-terminal-custom-args">
        Arguments
      </label>
      <input
        id="cui-side-terminal-custom-args"
      aria-label="Custom command arguments"
      data-semantic-anchor="terminal/side/custom-args"
        v-model="argsTextRef"
        class="cui-side-terminal-new__input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        aria-describedby="cui-side-terminal-custom-help"
      />
      <p id="cui-side-terminal-custom-help" class="cui-side-terminal-new__help">
        Arguments are split on whitespace. Nothing runs until you confirm.
      </p>
      <p v-if="customErrorRef" class="cui-side-terminal-new__error" role="alert">
        {{ customErrorRef }}
      </p>
      <div class="cui-side-terminal-new__actions">
        <button
          id="cui-side-terminal-custom-back"
      data-semantic-anchor="terminal/side/custom-back"
          type="button"
          class="cui-side-terminal-new__cancel"
          role="button"
          aria-label="Back to session kinds"
          @click="onBackToMenu"
        >
          Back
        </button>
        <button
          id="cui-side-terminal-custom-confirm"
      data-semantic-anchor="terminal/side/custom-confirm"
          type="button"
          class="cui-side-terminal-new__confirm"
          role="button"
          aria-label="Run custom command"
          :disabled="launching || full"
          :aria-disabled="launching || full ? 'true' : 'false'"
          @click="onConfirmCustom"
        >
          Run
        </button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.cui-side-terminal-new {
  position: relative;
  display: inline-block;
}
.cui-side-terminal-new__trigger {
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
.cui-side-terminal-new__trigger:hover {
  background-color: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-strong);
}
.cui-side-terminal-new__trigger:focus-visible,
.cui-side-terminal-new__option:focus-visible,
.cui-side-terminal-new__cancel:focus-visible,
.cui-side-terminal-new__confirm:focus-visible,
.cui-side-terminal-new__input:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-side-terminal-new__veil {
  position: fixed;
  inset: 0;
  z-index: var(--cuk-semantic-z-index-overlay);
  background-color: var(--cuk-primitive-color-alpha-transparent);
}
.cui-side-terminal-new__dialog {
  position: absolute;
  top: calc(100% + var(--cuk-semantic-spacing-xs));
  /* PL2 R7b (pl1-020..025): right-anchored so the dialog grows left into the
     panel instead of clipping ~220px past the viewport's right edge. */
  right: 0;
  left: auto;
  z-index: var(--cuk-semantic-z-index-overlay);
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
  width: max-content;
  /* R7: comfortable token width for one-line entries; never wider than the viewport. */
  min-width: calc(var(--cuk-primitive-space-16) * 11);
  max-width: calc(100vw - var(--cuk-semantic-spacing-xl));
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-md);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.cui-side-terminal-new__heading {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  text-transform: uppercase;
}
.cui-side-terminal-new__list {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
  list-style: none;
}
.cui-side-terminal-new__item {
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
}
.cui-side-terminal-new__option {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  width: 100%;
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  border-radius: var(--cuk-semantic-radius-sm);
  text-align: left;
  cursor: pointer;
}
.cui-side-terminal-new__option:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}
.cui-side-terminal-new__option:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.cui-side-terminal-new__option-icon {
  display: inline-flex;
  flex: none;
  width: var(--cuk-primitive-space-8);
  height: var(--cuk-primitive-space-8);
  color: var(--cuk-semantic-text-muted);
}
.cui-side-terminal-new__option-icon svg {
  width: 100%;
  height: 100%;
}
.cui-side-terminal-new__option-text {
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: var(--cuk-semantic-spacing-xs);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.cui-side-terminal-new__option-label {
  flex: none;
  white-space: nowrap;
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.cui-side-terminal-new__option-hint {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal-new__status {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal-new__cancel {
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
.cui-side-terminal-new__cancel:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-elevated);
}
.cui-side-terminal-new__field {
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal-new__input {
  min-height: var(--cuk-semantic-size-control-height-md);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
}
.cui-side-terminal-new__help {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal-new__error {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-status-error-text);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal-new__actions {
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  gap: var(--cuk-semantic-spacing-sm);
}
.cui-side-terminal-new__confirm {
  min-height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  cursor: pointer;
}
.cui-side-terminal-new__confirm:hover {
  background-color: var(--cuk-semantic-surface-elevated);
}
.cui-side-terminal-new__confirm:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
</style>
