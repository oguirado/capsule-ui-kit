<script>
/**
 * @fileoverview Overlay side terminal panel: the operator terminal lives in a
 * right-side overlay that floats above the dock layer without reflowing it.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SIDE_TERMINAL_PANEL_SCHEMA = 'capsule-ui-kit.side-terminal-panel/v1';
</script>
<script setup>
import { shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, markRaw } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import TerminalView, { createStreamRegistry } from '../terminal/TerminalView.vue';
import TerminalSessionTabs from '../terminal/TerminalSessionTabs.vue';
import SideTerminalNewMenu from './SideTerminalNewMenu.vue';
import {
  SIDE_TERMINAL_MIN_WIDTH_PX,
  SIDE_TERMINAL_MAX_SESSIONS,
  clampSideTerminalWidth,
  maxSideTerminalWidth,
  readSideTerminalOpen,
  readSideTerminalWidth,
  stepSideTerminalWidth,
  writeSideTerminalState,
  createSideTerminalModel
} from './sideTerminalModel.js';
import { isEditableTarget } from './sideTerminalKeys.js';
import { createTerminalDocument } from '../terminal/nonceDocument.js';
import { tokenValue } from '../design/tokenContract.js';
import mappings from '../design/tokenMappings.json' with { type: 'json' };

const props = defineProps({
  facade: {
    type: Object,
    default: null
  },
  providers: {
    type: /** @type {import('vue').PropType<Array<{id?:unknown,label?:unknown,hint?:unknown,argv?:unknown,command?:unknown}>>} */ (Array),
    default: () => []
  },
  storage: {
    type: /** @type {import('vue').PropType<Pick<Storage, 'getItem' | 'setItem'>|null|undefined>} */ (Object),
    default: undefined
  },
  open: {
    type: Boolean,
    default: null
  },
  topOffset: {
    type: Number,
    default: 0
  },
  bottomOffset: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['update:open', 'state-change']);

/**
 * @returns {Pick<Storage, 'getItem' | 'setItem'>|null}
 */
function resolveStorage() {
  if (props.storage !== undefined && props.storage !== null) return props.storage;
  try {
    const candidate = globalThis?.localStorage ?? null;
    if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * @returns {number}
 */
function viewportWidth() {
  try {
    const width = globalThis?.window?.innerWidth ?? 0;
    return typeof width === 'number' && width > 0 ? width : 1280;
  } catch {
    return 1280;
  }
}

const storageRef = resolveStorage();

/**
 * @returns {Record<string, string>}
 */
function terminalTheme() {
  let mode = 'dark.normal';
  try {
    mode = globalThis?.document?.documentElement?.dataset?.themeScheme === 'light' ? 'light.normal' : 'dark.normal';
  } catch {
    mode = 'dark.normal';
  }
  const tokens = mappings?.vendorSurfaces?.xterm?.tokens;
  if (!Array.isArray(tokens)) return {};
  return Object.fromEntries(tokens.filter((t) => t?.status === 'mapped').map((t) => {
    if (typeof t.sourceToken !== 'string') throw new Error('Mapped terminal token lacks a source');
    return [t.vendorToken, tokenValue(t.sourceToken, mode)];
  }));
}

class SideTerminal extends Terminal {
  /** @param {any} options */
  constructor(options) {
    super({ ...options, documentOverride: createTerminalDocument(globalThis.document) });
  }
}

const model = markRaw(createSideTerminalModel({
  facade: /** @type {any} */ (props.facade),
  createRegistry: createStreamRegistry,
  getTheme: terminalTheme,
  registryOptions: { TerminalClass: SideTerminal, FitAddonClass: FitAddon },
  onChange: (state) => {
    view.value = state;
    emit('state-change', state);
  }
}));
const view = shallowRef(model.snapshot());

const viewportRef = shallowRef(viewportWidth());
const widthPx = shallowRef(readSideTerminalWidth(storageRef, viewportRef.value));
const openState = shallowRef(
  typeof props.open === 'boolean' ? props.open : readSideTerminalOpen(storageRef)
);
const isOpen = computed(() => (typeof props.open === 'boolean' ? props.open : openState.value));
const maxWidthPx = computed(() => maxSideTerminalWidth(viewportRef.value));

const rootStyle = computed(() => ({
  top: `${Math.max(0, Math.round(props.topOffset))}px`,
  bottom: `${Math.max(0, Math.round(props.bottomOffset))}px`,
  width: isOpen.value ? `${widthPx.value}px` : 'auto'
}));

const statusText = computed(() => {
  if (view.value.launching) return 'Starting session';
  if (view.value.enabled) return 'Terminal enabled';
  return 'Enable AI terminal mode to launch a session';
});

/** @param {boolean} value */
function persistOpen(value) {
  writeSideTerminalState(storageRef, { open: value, widthPx: widthPx.value });
}

/** @param {number} px */
function setWidth(px) {
  widthPx.value = clampSideTerminalWidth(px, viewportRef.value);
  writeSideTerminalState(storageRef, { open: isOpen.value, widthPx: widthPx.value });
}

let initialShellDone = false;

/**
 * Starts the first login shell on first open. Opening the panel (or enabling
 * the gated mode while open) is the explicit user action; nothing else
 * launches without a menu click or dialog confirm.
 */
function maybeStartInitialShell() {
  if (initialShellDone || !isOpen.value) return;
  const snap = model.snapshot();
  if (snap.sessions.length > 0) {
    initialShellDone = true;
    return;
  }
  if (!snap.enabled) return;
  initialShellDone = true;
  void model.launch({ command: 'shell', args: [] }).catch(() => {});
}

/**
 * @param {string} sessionId
 */
function focusSession(sessionId) {
  try {
    if (typeof model.registry.getSession !== 'function') return;
    if (typeof model.registry.scheduleFocus !== 'function') return;
    const record = model.registry.getSession(sessionId);
    if (!record || record.hasControlLease !== true) return;
    model.registry.scheduleFocus({
      sessionId,
      slotId: `slot-${sessionId}`,
      generation: 1,
      epoch: 1,
      focusIntentId: `side-terminal-focus-${sessionId}`
    });
  } catch {
    /* Focus is best-effort: a hidden or unleased view keeps its state. */
  }
}

function focusActive() {
  void nextTick().then(() => {
    const selected = model.snapshot().selected;
    if (typeof selected === 'string' && selected.length > 0) focusSession(selected);
  }).catch(() => {});
}

/** @param {boolean} value */
function onOpenChanged(value) {
  if (!value) return;
  maybeStartInitialShell();
  focusActive();
}

/** @param {boolean} next */
function setOpen(next) {
  const value = next === true;
  persistOpen(value);
  if (typeof props.open !== 'boolean') {
    openState.value = value;
    onOpenChanged(value);
  }
  emit('update:open', value);
}

watch(() => props.open, (value) => {
  if (typeof value !== 'boolean') return;
  openState.value = value;
  persistOpen(value);
  onOpenChanged(value);
});

/**
 * Left-edge handle: Left grows the panel, Right shrinks it, Home jumps to the
 * minimum width and End to the maximum; Shift selects the large step.
 * @param {{ key: string, shiftKey?: boolean, preventDefault?: () => void }} event
 */
function onSeparatorKey(event) {
  const large = event.shiftKey === true;
  let next = widthPx.value;
  let handled = true;
  if (event.key === 'ArrowLeft') next = stepSideTerminalWidth(widthPx.value, 1, viewportRef.value, large);
  else if (event.key === 'ArrowRight') next = stepSideTerminalWidth(widthPx.value, -1, viewportRef.value, large);
  else if (event.key === 'Home') next = SIDE_TERMINAL_MIN_WIDTH_PX;
  else if (event.key === 'End') next = maxWidthPx.value;
  else handled = false;
  if (!handled) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  setWidth(next);
}

let dragActive = false;
let dragStartX = 0;
let dragStartWidth = 0;

/** @param {PointerEvent} event */
function onResizeStart(event) {
  if (event.button !== 0) return;
  dragActive = true;
  dragStartX = event.clientX;
  dragStartWidth = widthPx.value;
  try {
    const target = event.currentTarget;
    if (target instanceof Element && typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
  } catch {
    /* Pointer capture is best-effort. */
  }
}

/** @param {PointerEvent} event */
function onResizeMove(event) {
  if (!dragActive) return;
  setWidth(dragStartWidth + (dragStartX - event.clientX));
}

function onResizeEnd() {
  dragActive = false;
}

/**
 * Ctrl+Backquote toggles the panel unless focus is inside the terminal or
 * another editable control, which keeps every key.
 * @param {KeyboardEvent} event
 */
function onWindowKeydown(event) {
  if (!event || event.ctrlKey !== true || event.shiftKey === true || event.metaKey === true || event.altKey === true) return;
  if (event.key !== '`' && event.code !== 'Backquote') return;
  if (isEditableTarget(event.target)) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  setOpen(!isOpen.value);
}

function onWindowResize() {
  viewportRef.value = viewportWidth();
  setWidth(widthPx.value);
}

/** @param {{entryId:string,command:string,args:string[],title:string,kind:string}} spec */
function onLaunchMenu(spec) {
  void model.launch({
    command: spec.command,
    args: spec.args,
    title: spec.title,
    kind: spec.kind
  }).catch(() => {});
}

/** @param {{sessionId:string}} event */
function onSelectTab(event) {
  model.select(event.sessionId);
  focusActive();
}

/** @param {{sessionId:string}} event */
function onCloseTab(event) {
  void model.closeTab(event.sessionId).catch(() => {});
}

/** @param {Event} event */
async function onOptIn(event) {
  const checked = /** @type {HTMLInputElement} */ (event.target).checked === true;
  await model.optIn(checked).catch(() => {});
  maybeStartInitialShell();
}

function updateThemes() {
  if (typeof model.registry.updateSessionTheme !== 'function') return;
  for (const session of view.value.sessions) {
    model.registry.updateSessionTheme({ sessionId: session.sessionId, theme: terminalTheme() });
  }
}

/** @type {MutationObserver|undefined} */
let themeObserver;

onMounted(() => {
  void model.initialize();
  maybeStartInitialShell();
  if (isOpen.value) focusActive();
  try {
    if (typeof globalThis?.window?.addEventListener === 'function') {
      globalThis.window.addEventListener('keydown', onWindowKeydown);
      globalThis.window.addEventListener('resize', onWindowResize);
    }
    if (typeof MutationObserver !== 'undefined' && globalThis?.document?.documentElement) {
      themeObserver = new MutationObserver(updateThemes);
      themeObserver.observe(globalThis.document.documentElement, { attributes: true, attributeFilter: ['data-theme-scheme'] });
    }
  } catch {
    /* Host listeners are best-effort outside a browser window. */
  }
});

onBeforeUnmount(() => {
  try {
    globalThis?.window?.removeEventListener?.('keydown', onWindowKeydown);
    globalThis?.window?.removeEventListener?.('resize', onWindowResize);
  } catch {
    /* Listener teardown is best-effort. */
  }
  themeObserver?.disconnect();
  model.dispose({ closeSessions: false });
});
</script>
<template>
  <aside
    id="side-terminal"
    class="cui-side-terminal"
    data-semantic-anchor="terminal/side/panel"
    role="complementary"
    aria-label="Terminal panel"
    :style="rootStyle"
  >
    <div v-show="isOpen" class="cui-side-terminal__body">
      <div
        id="side-terminal-resize"
        class="cui-side-terminal__resize"
        role="separator"
        tabindex="0"
        data-semantic-anchor="workspace/separator/side-width"
        aria-label="Resize terminal panel"
        aria-orientation="vertical"
        :aria-valuenow="widthPx"
        :aria-valuemin="SIDE_TERMINAL_MIN_WIDTH_PX"
        :aria-valuemax="maxWidthPx"
        @keydown="onSeparatorKey"
        @pointerdown="onResizeStart"
        @pointermove="onResizeMove"
        @pointerup="onResizeEnd"
        @pointercancel="onResizeEnd"
      />
      <div class="cui-side-terminal__main">
        <header class="cui-side-terminal__header">
          <h2 class="cui-side-terminal__title">
            Terminal
          </h2>
          <SideTerminalNewMenu
            :providers="providers"
            :commands="view.enabled ? view.commands : []"
            :launching="view.launching"
            :session-count="view.liveCount"
            :max-sessions="SIDE_TERMINAL_MAX_SESSIONS"
            @launch="onLaunchMenu"
          />
          <button
            id="side-terminal-collapse"
            type="button"
            class="cui-side-terminal__collapse"
            role="button"
            data-semantic-anchor="terminal/side/collapse"
            aria-label="Collapse terminal panel"
            :aria-expanded="isOpen ? 'true' : 'false'"
            aria-controls="side-terminal"
            @click="setOpen(false)"
          >
            Collapse
          </button>
        </header>
        <p
          v-show="!view.enabled"
          id="side-terminal-real-shell-disclosure"
          class="cui-side-terminal__disclosure"
        >
          AI terminal mode opens a real operating-system shell with your full user permissions.
          Commands can read, change or delete your files and access the network.
          Enable it only if you accept this access. Nothing runs until you explicitly launch a session.
        </p>
        <label v-if="view.ready && !view.developerMode" class="cui-side-terminal__opt-in">
          <input
            id="side-terminal-ai-mode"
            data-semantic-anchor="settings/ai-terminal-mode"
            aria-label="Enable AI terminal mode"
            aria-describedby="side-terminal-real-shell-disclosure"
            type="checkbox"
            :checked="view.enabled"
            @change="onOptIn"
          />
          Enable AI terminal mode
        </label>
        <p v-if="!view.ready" class="cui-side-terminal__status" role="status">
          Terminal service unavailable.
        </p>
        <TerminalSessionTabs
          :sessions="view.sessions"
          :selected-id="view.selected ?? ''"
          @select-tab="onSelectTab"
          @close-tab="onCloseTab"
        />
        <p class="cui-side-terminal__status" role="status" aria-live="polite">
          {{ statusText }}
        </p>
        <p v-if="view.error" class="cui-side-terminal__error" role="alert">
          {{ view.error }}
        </p>
        <div class="cui-side-terminal__views">
          <div v-for="session in view.sessions" :key="session.sessionId" v-show="session.sessionId === view.selected" class="cui-side-terminal__session">
          <TerminalView
            embedded
            :session-id="session.sessionId"
            capsule-id="side-terminal"
            :session-title="session.title"
            :epoch="1"
            :generation="1"
            mode="pty"
            :attachment-state="session.attachment"
            :activity-state="session.activity"
            :has-control-lease="session.hasControlLease"
            :folded="session.sessionId !== view.selected"
            :stream-registry="model.registry"
          />
            <details class="cui-side-terminal__transcript">
              <summary :data-semantic-anchor="`terminal/session/${session.sessionId}/output`" role="button" :aria-label="`Read output for ${session.title}`">Accessible terminal output</summary>
              <div :data-semantic-anchor="`output/${session.sessionId}/text`" role="region" :aria-label="`Accessible output for ${session.title}`" tabindex="0"><pre>{{ session.accessibleText }}</pre></div>
            </details>
          </div>
        </div>
      </div>
    </div>
    <button
      v-show="!isOpen"
      id="side-terminal-edge-tab"
      type="button"
      class="cui-side-terminal__edge"
      role="button"
      data-semantic-anchor="terminal/side/edge-tab"
      aria-label="Open terminal panel"
      :aria-expanded="isOpen ? 'true' : 'false'"
      aria-controls="side-terminal"
      @click="setOpen(true)"
    >
      Terminal
    </button>
  </aside>
</template>
<style scoped>
.cui-side-terminal__session { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.cui-side-terminal__transcript { flex: none; max-height: 25%; overflow: auto; }
.cui-side-terminal__transcript pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.cui-side-terminal {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: var(--cuk-semantic-z-index-overlay);
  display: flex;
  flex-direction: row;
  align-items: stretch;
}
.cui-side-terminal__body {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  overflow: hidden;
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  border-left: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.cui-side-terminal__resize {
  flex: none;
  width: var(--cuk-semantic-size-control-padding-xsm);
  cursor: col-resize;
  background-color: var(--cuk-primitive-color-alpha-transparent);
}
.cui-side-terminal__resize:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}
.cui-side-terminal__resize:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-side-terminal__main {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-semantic-spacing-sm) var(--cuk-semantic-spacing-md);
  overflow-y: auto;
}
.cui-side-terminal__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
}
.cui-side-terminal__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: var(--cuk-semantic-spacing-none);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
}
.cui-side-terminal__collapse {
  min-height: var(--cuk-semantic-size-control-height-md);
  padding: var(--cuk-semantic-size-control-padding-ysm) var(--cuk-semantic-size-control-padding-xmd);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  cursor: pointer;
}
.cui-side-terminal__collapse:hover {
  background-color: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-strong);
}
.cui-side-terminal__collapse:focus-visible,
.cui-side-terminal__edge:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-side-terminal__disclosure {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal__opt-in {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal__status {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal__error {
  margin: var(--cuk-semantic-spacing-none);
  color: var(--cuk-semantic-status-error-text);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}
.cui-side-terminal__views {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
.cui-side-terminal__edge {
  align-self: stretch;
  padding: var(--cuk-semantic-spacing-md) var(--cuk-semantic-spacing-xs);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-muted);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-right: none;
  border-radius: var(--cuk-semantic-radius-md) 0 0 var(--cuk-semantic-radius-md);
  writing-mode: vertical-rl;
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  cursor: pointer;
}
.cui-side-terminal__edge:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-elevated);
}
</style>
