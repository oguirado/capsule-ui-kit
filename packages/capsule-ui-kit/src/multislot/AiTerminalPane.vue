<script>
/**
 * @fileoverview AI multislot attached-terminal pane: thin host around the
 * session tab strip, the terminal view and the new-session menu. One terminal
 * view stays mounted per session (v-show on selection; never unmount on
 * switch, hide or fold); exited tabs stay visible until the operator closes
 * them. Plain JavaScript with JSDoc; no authored TypeScript, no product
 * imports.
 */

export const AI_TERMINAL_PANE_SCHEMA = 'capsule-ui-kit.ai-terminal-pane/v1';

/**
 * @typedef {Object} TerminalPaneSession
 * @property {string} sessionId
 * @property {string} [title]
 * @property {string} [kind]
 * @property {string} [activity]
 * @property {number} [unreadCount]
 * @property {boolean} [restoring]
 * @property {boolean} [replay]
 */

/**
 * Keeps only sessions with a non-empty string id; never invents or renames.
 * @param {unknown} sessions
 * @returns {TerminalPaneSession[]}
 */
export function normalizeTerminalSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(
    (sess) => sess && typeof sess.sessionId === 'string' && sess.sessionId.length > 0,
  );
}

/**
 * Effective viewed session: the selection only when it names a mounted
 * session, else '' (the pane never auto-selects).
 * @param {unknown} sessions
 * @param {unknown} selectedId
 * @returns {string}
 */
export function effectiveSessionId(sessions, selectedId) {
  const list = normalizeTerminalSessions(sessions);
  if (typeof selectedId === 'string' && selectedId.length > 0
    && list.some((sess) => sess.sessionId === selectedId)) {
    return selectedId;
  }
  return '';
}

/**
 * @param {string} capsuleId
 * @returns {{ host: string, hide: string, empty: string }} Stable DOM ids.
 */
export function terminalPaneDomIds(capsuleId) {
  return {
    host: `cuk-ai-terminal-${capsuleId}`,
    hide: `cuk-ai-terminal-${capsuleId}-hide`,
    empty: `cuk-ai-terminal-${capsuleId}-empty`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {{ host: string, hide: string }} Semantic anchors.
 */
export function terminalPaneAnchors(capsuleId) {
  return {
    host: `capsule/${capsuleId}/terminal`,
    hide: `capsule/${capsuleId}/hide-terminal`,
  };
}

/**
 * Visible view title: trimmed title, else the raw session id (never invented).
 * @param {TerminalPaneSession|null|undefined} sess
 * @returns {string}
 */
export function terminalViewTitle(sess) {
  const title = typeof sess?.title === 'string' ? sess.title.trim() : '';
  if (title.length > 0) return title;
  return typeof sess?.sessionId === 'string' ? sess.sessionId : '';
}

/**
 * @param {string} capsuleId
 * @param {string} sessionId
 * @returns {{ capsuleId: string, sessionId: string }} Frozen payload.
 */
export function buildSelectSessionPayload(capsuleId, sessionId) {
  return Object.freeze({ capsuleId, sessionId });
}

/**
 * @param {string} capsuleId
 * @param {string} sessionId
 * @returns {{ capsuleId: string, sessionId: string }} Frozen payload.
 */
export function buildCloseSessionPayload(capsuleId, sessionId) {
  return Object.freeze({ capsuleId, sessionId });
}

/**
 * @param {string} capsuleId
 * @param {{ entryId?: unknown, command?: unknown, args?: unknown, title?: unknown, kind?: unknown }|null|undefined} launch
 * @returns {{ capsuleId: string, entryId: string, command: string, args: readonly string[], title: string, kind: string }} Frozen payload.
 */
export function buildLaunchRequestPayload(capsuleId, launch) {
  const text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value : '');
  const args = Array.isArray(launch?.args)
    ? launch.args.filter((arg) => typeof arg === 'string')
    : [];
  return Object.freeze({
    capsuleId,
    entryId: text(launch?.entryId),
    command: text(launch?.command),
    args: Object.freeze([...args]),
    title: text(launch?.title),
    kind: text(launch?.kind),
  });
}
</script>
<script setup>
import { computed } from 'vue';
import TerminalView from '../terminal/TerminalView.vue';
import TerminalSessionTabs from '../terminal/TerminalSessionTabs.vue';
import SideTerminalNewMenu from '../side-terminal/SideTerminalNewMenu.vue';
import { SIDE_TERMINAL_MAX_SESSIONS } from '../side-terminal/sideTerminalModel.js';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  sessions: {
    type: /** @type {import('vue').PropType<TerminalPaneSession[]>} */ (Array),
    default: () => [],
  },
  selectedSessionId: { type: String, default: '' },
  terminalMode: { type: String, default: 'pty' },
  attachmentState: {
    type: /** @type {import('vue').PropType<'detached'|'attaching'|'restoring'|'live'|'disconnected'>} */ (String),
    default: 'live',
  },
  activityState: {
    type: /** @type {import('vue').PropType<'unknown'|'ready'|'busy'|'waiting-input'|'waiting-permission'|'exited'|'failed'>} */ (String),
    default: 'unknown',
  },
  viewRetention: {
    type: /** @type {import('vue').PropType<'live-view'|'replay-view'|'disposed'>} */ (String),
    default: 'live-view',
  },
  hasControlLease: { type: Boolean, default: false },
  streamRegistry: { type: Object, default: null },
  epoch: { type: Number, default: 0 },
  generation: { type: Number, default: 0 },
  hidden: { type: Boolean, default: false },
  closable: { type: Boolean, default: true },
  providers: { type: Array, default: () => [] },
  commands: { type: Array, default: () => [] },
  launching: { type: Boolean, default: false },
  maxSessions: { type: Number, default: SIDE_TERMINAL_MAX_SESSIONS },
  paneLabel: { type: String, default: 'Attached terminal' },
  presentationInstance: { type: String, default: 'multislot-terminal' },
  reducedMotion: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select-session',
  'close-session',
  'launch-request',
  'request-attach',
  'request-stop',
  'request-replay',
  'select-target',
  'confirm-staged-paste',
  'submit-intent',
]);

const sessionList = computed(() => normalizeTerminalSessions(props.sessions));
const effectiveSelectedId = computed(() => effectiveSessionId(props.sessions, props.selectedSessionId));
const domIds = computed(() => terminalPaneDomIds(props.capsuleId));
const anchors = computed(() => terminalPaneAnchors(props.capsuleId));
const titleFor = terminalViewTitle;

/**
 * Focus guard: reading the pane controls never steals the live host focus;
 * click and keyboard activation stay intact.
 * @param {Event} event
 */
function guardFocus(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

function onHide() {
  emit('submit-intent', Object.freeze({ type: 'hide-terminal', capsuleId: props.capsuleId }));
}

/**
 * @param {{ sessionId?: string }|null|undefined} sess
 */
function onSelectTab(sess) {
  if (typeof sess?.sessionId === 'string' && sess.sessionId.length > 0) {
    emit('select-session', buildSelectSessionPayload(props.capsuleId, sess.sessionId));
  }
}

/**
 * @param {{ sessionId?: string }|null|undefined} sess
 */
function onCloseTab(sess) {
  if (typeof sess?.sessionId === 'string' && sess.sessionId.length > 0) {
    emit('close-session', buildCloseSessionPayload(props.capsuleId, sess.sessionId));
  }
}

/**
 * @param {{ entryId?: unknown, command?: unknown, args?: unknown, title?: unknown, kind?: unknown }|null|undefined} launch
 */
function onLaunch(launch) {
  emit('launch-request', buildLaunchRequestPayload(props.capsuleId, launch));
}

/**
 * Re-emits a TerminalView event under its own kit name.
 * @param {'request-attach'|'request-stop'|'request-replay'|'select-target'|'confirm-staged-paste'} name
 * @returns {(payload: unknown) => void}
 */
function passThrough(name) {
  return (payload) => emit(name, payload);
}
</script>
<template>
  <section
    v-show="!hidden"
    :id="domIds.host"
    class="ai-terminal-pane"
    :class="{ 'ai-terminal-pane--reduced': reducedMotion }"
    :data-semantic-anchor="anchors.host"
    :aria-label="paneLabel"
  >
    <div class="ai-terminal-pane__head">
      <span class="ai-terminal-pane__title">{{ paneLabel }}</span>
      <span class="ai-terminal-pane__count" role="status" :aria-label="`${sessionList.length} sessions`">
        {{ sessionList.length }}
      </span>
      <span class="ai-terminal-pane__spacer" aria-hidden="true"></span>
      <SideTerminalNewMenu
        :providers="providers"
        :commands="commands"
        :launching="launching"
        :session-count="sessionList.length"
        :max-sessions="maxSessions"
        @launch="onLaunch"
      />
      <button
        :id="domIds.hide"
        type="button"
        class="ai-terminal-pane__hide"
        :data-semantic-anchor="anchors.hide"
        aria-label="Hide terminal"
        @pointerdown="guardFocus"
        @mousedown="guardFocus"
        @click="onHide"
      >
        Hide
      </button>
    </div>

    <TerminalSessionTabs
      :sessions="sessionList"
      :selected-id="effectiveSelectedId"
      :closable="closable"
      @select-tab="onSelectTab"
      @close-tab="onCloseTab"
    />

    <div
      v-for="sess in sessionList"
      v-show="sess.sessionId === effectiveSelectedId"
      :key="sess.sessionId"
      class="ai-terminal-pane__view"
    >
      <TerminalView
        :embedded="true"
        :session-id="sess.sessionId"
        :session-title="titleFor(sess)"
        :capsule-id="capsuleId"
        :presentation-instance="presentationInstance"
        :epoch="epoch"
        :generation="generation"
        :mode="terminalMode"
        :attachment-state="attachmentState"
        :activity-state="activityState"
        :view-retention="sess.replay === true ? 'replay-view' : viewRetention"
        :has-control-lease="hasControlLease"
        :stream-registry="streamRegistry"
        :reduced-motion="reducedMotion"
        @request-attach="passThrough('request-attach')"
        @request-stop="passThrough('request-stop')"
        @request-replay="passThrough('request-replay')"
        @select-target="passThrough('select-target')"
        @confirm-staged-paste="passThrough('confirm-staged-paste')"
      />
    </div>

    <div
      v-if="sessionList.length === 0"
      :id="domIds.empty"
      class="ai-terminal-pane__empty"
      role="status"
      aria-label="No terminal sessions"
    >
      <span class="ai-terminal-pane__empty-text">No sessions. Open the launcher to start one.</span>
    </div>
  </section>
</template>
<style scoped>
.ai-terminal-pane {
  display: flex;
  flex: none;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--cuk-component-ai-multi-slot-pane-radius, var(--cuk-semantic-radius-md));
  background-color: var(--cuk-component-ai-multi-slot-pane-terminal-background, var(--cuk-semantic-surface-sunken));
  font-family: var(--cuk-component-ai-multi-slot-font-family, var(--cuk-semantic-typography-font-family-sans));
}
.ai-terminal-pane__head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-3);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
}
.ai-terminal-pane__title {
  font-size: var(--cuk-semantic-typography-font-size-sm);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  color: var(--cuk-semantic-text-primary);
}
.ai-terminal-pane__count {
  padding: 0 var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-pill);
  background-color: var(--cuk-semantic-surface-interactive);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.ai-terminal-pane__spacer {
  flex: 1 1 auto;
}
.ai-terminal-pane__hide {
  flex: none;
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-pill);
  background-color: var(--cuk-semantic-surface-interactive);
  font-family: inherit;
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
}
.ai-terminal-pane__hide:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.ai-terminal-pane__view {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.ai-terminal-pane__empty {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: var(--cuk-primitive-space-4);
}
.ai-terminal-pane__empty-text {
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-muted);
}
</style>
