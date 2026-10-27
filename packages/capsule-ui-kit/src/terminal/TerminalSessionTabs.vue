<script>
/**
 * @fileoverview S1 session tab strip for the terminal capsule (S4): one tab per
 * agent session with a kind tag, an activity chip (idle/busy/exited) and an
 * unread-output count. Render-only: selection, close and arrow-key moves are
 * explicit parent-handled emits; nothing launches, executes or auto-selects.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const TERMINAL_SESSION_TAB_SCHEMA = 'capsule-ui-kit.terminal-session-tabs/v1';
</script>
<script setup>
import { computed, useId } from 'vue';
import { resolveSessionTabStatus } from '../side-terminal/sessionTabStatus.js';

const idPrefix = `cuk-terminal-tabs-${useId()}`;

const props = defineProps({
  sessions: {
    type: /** @type {import('vue').PropType<Array<{sessionId:string,title?:string,kind?:string,activity?:string,unreadCount?:number}>>} */ (Array),
    default: () => []
  },
  selectedId: {
    type: String,
    default: ''
  },
  closable: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['select-tab', 'close-tab']);

const sessionIds = computed(() =>
  props.sessions.map((sess) => sess?.sessionId).filter((id) => typeof id === 'string' && id.length > 0)
);

/**
 * Visible tab label in `{title} #{shortId}` form so same-titled sessions stay
 * distinguishable. Falls back to the raw session id when untitled.
 * @param {{ sessionId?: string, title?: string, kind?: string, activity?: string, unreadCount?: number } | null | undefined} sess
 * @returns {string}
 */
function tabTitle(sess) {
  const title = typeof sess?.title === 'string' ? sess.title.trim() : '';
  const id = typeof sess?.sessionId === 'string' ? sess.sessionId : '';
  const base = title.length > 0 ? title : id;
  if (base.length === 0 || id.length === 0) return base;
  return `${base} #${id.slice(0, 6)}`;
}

/**
 * @param {{ activity?: string } | null | undefined} sess
 * @returns {'idle' | 'busy' | 'exited'}
 */
function tabStatus(sess) {
  return resolveSessionTabStatus(sess?.activity);
}

/**
 * @param {{ sessionId?: string, title?: string, activity?: string, unreadCount?: number } | null | undefined} sess
 * @returns {string}
 */
function tabName(sess) {
  const unread = Number(sess?.unreadCount ?? 0);
  const unreadSuffix = Number.isFinite(unread) && unread > 0 ? `, ${unread} unread` : '';
  return `Session ${tabTitle(sess)} (${tabStatus(sess)}${unreadSuffix})`;
}

/**
 * @param {{ sessionId?: string } | null | undefined} sess
 * @returns {boolean}
 */
function isSelected(sess) {
  return typeof sess?.sessionId === 'string' && sess.sessionId.length > 0 && sess.sessionId === props.selectedId;
}

/**
 * Roving tabindex: the selected tab (or the first tab when nothing is
 * selected) is in tab order; the rest are reachable via arrow keys.
 * @param {{ sessionId?: string } | null | undefined} sess
 * @param {number} index
 * @returns {string}
 */
function tabIndex(sess, index) {
  if (!sessionIds.value.includes(props.selectedId)) return index === 0 ? '0' : '-1';
  return isSelected(sess) ? '0' : '-1';
}

/**
 * @param {{ sessionId?: string } | null | undefined} sess
 */
function onSelect(sess) {
  if (typeof sess?.sessionId === 'string' && sess.sessionId.length > 0) {
    emit('select-tab', { sessionId: sess.sessionId });
  }
}

/**
 * @param {{ sessionId?: string } | null | undefined} sess
 */
function onClose(sess) {
  if (typeof sess?.sessionId === 'string' && sess.sessionId.length > 0) {
    emit('close-tab', { sessionId: sess.sessionId });
  }
}

/**
 * Arrow-key / Home / End navigation across tabs; emits the move and focuses
 * the newly selected tab without activating any session side effect.
 * @param {KeyboardEvent} event
 */
function onTablistKeydown(event) {
  const ids = sessionIds.value;
  if (ids.length === 0) return;
  const current = ids.indexOf(props.selectedId);
  let next = -1;
  if (event.key === 'ArrowRight') next = (current + 1 + ids.length) % ids.length;
  else if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = ids.length - 1;
  else return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  emit('select-tab', { sessionId: ids[next] });
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    document.getElementById(`cui-terminal-tab-${ids[next]}`)?.focus?.();
  }
}
</script>
<template>
  <div class="cui-terminal-tabs">
    <div
      class="cui-terminal-tabs__list" :id="`${idPrefix}-list`"
      role="tablist"
      aria-label="Terminal sessions"
      @keydown="onTablistKeydown"
    >
      <div
        v-for="(sess, index) in sessions"
        :key="sess.sessionId"
        class="cui-terminal-tabs__item"
        :data-active="isSelected(sess) ? 'true' : 'false'"
      >
        <button
          :id="`cui-terminal-tab-${sess.sessionId}`"
          type="button"
          role="tab"
          class="cui-terminal-tabs__tab"
          :class="{ 'cui-terminal-tabs__tab--active': isSelected(sess), 'cui-terminal-tabs__tab--exited': tabStatus(sess) === 'exited' }"
          :data-semantic-anchor="`terminal/session/${sess.sessionId}/tab`"
          :aria-label="tabName(sess)"
          :aria-selected="isSelected(sess) ? 'true' : 'false'"
          :tabindex="tabIndex(sess, index)"
          @click="onSelect(sess)"
        >
          <span v-if="sess.kind" class="cui-terminal-tabs__kind" aria-hidden="true">{{ sess.kind }}</span>
          <span class="cui-terminal-tabs__title">{{ tabTitle(sess) }}</span>
          <span :class="`cui-terminal-tabs__chip cui-terminal-tabs__chip--${tabStatus(sess)}`" aria-hidden="true">{{ tabStatus(sess) }}</span>
          <span v-if="Number(sess.unreadCount ?? 0) > 0" class="cui-terminal-tabs__unread" aria-hidden="true">{{ sess.unreadCount }}</span>
        </button>
        <button
          v-if="closable"
          :id="`cui-terminal-tab-${sess.sessionId}-close`"
          type="button"
          class="cui-terminal-tabs__close"
          :data-semantic-anchor="`terminal/session/${sess.sessionId}/close`"
          :aria-label="`Close session ${tabTitle(sess)}`"
          tabindex="-1"
          @click="onClose(sess)"
        >
          ×
        </button>
      </div>
    </div>
    <p v-if="sessions.length === 0" class="cui-terminal-tabs__empty" role="status">
      No terminal sessions.
    </p>
  </div>
</template>
<style scoped>
.cui-terminal-tabs {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background-color: var(--cuk-semantic-surface-sunken);
  color: var(--cuk-semantic-text-primary);
}
.cui-terminal-tabs__list {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: var(--cuk-semantic-spacing-xxs);
  min-height: var(--cuk-semantic-size-tab-height);
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-md);
  overflow-x: auto;
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.cui-terminal-tabs__item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xxs);
  min-width: 0;
}
.cui-terminal-tabs__tab {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  min-width: 0;
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-muted);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  cursor: pointer;
}
.cui-terminal-tabs__tab:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-hover-s1);
}
.cui-terminal-tabs__tab--active {
  color: var(--cuk-semantic-text-accent);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-accent-primary);
  margin-bottom: calc(var(--cuk-semantic-border-width) * -1);
}
.cui-terminal-tabs__tab--exited {
  opacity: var(--cuk-semantic-opacity-disabled);
}
.cui-terminal-tabs__tab:focus-visible,
.cui-terminal-tabs__close:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.cui-terminal-tabs__kind {
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.cui-terminal-tabs__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cui-terminal-tabs__chip {
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  white-space: nowrap;
}
.cui-terminal-tabs__chip--idle {
  color: var(--cuk-semantic-text-muted);
  background-color: var(--cuk-semantic-surface-interactive);
  border-color: var(--cuk-semantic-border-subtle);
}
.cui-terminal-tabs__chip--busy {
  color: var(--cuk-semantic-status-warning-text);
  background-color: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.cui-terminal-tabs__chip--exited {
  color: var(--cuk-semantic-text-muted);
  background-color: var(--cuk-semantic-surface-interactive);
  border-color: var(--cuk-semantic-border-subtle);
}
.cui-terminal-tabs__unread {
  min-width: var(--cuk-semantic-size-control-height-sm);
  text-align: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--cuk-semantic-accent-secondary-container);
  color: var(--cuk-semantic-accent-on-secondary-container);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.cui-terminal-tabs__close {
  padding: var(--cuk-semantic-spacing-xxs);
  background-color: var(--cuk-primitive-color-alpha-transparent);
  color: var(--cuk-semantic-text-secondary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-alpha-transparent);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  cursor: pointer;
}
.cui-terminal-tabs__close:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.cui-terminal-tabs__empty {
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-md);
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
}
</style>
