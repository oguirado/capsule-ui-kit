<script>
/**
 * @fileoverview SaaS broadcast dispatch drawer skin over the orchestrator drawer models.
 * Presentation only: 705px drawer geometry, session tabs, composer, target row, frozen
 * review, accessible box and result rows. Prompts, review freeze, eligibility, dispatch
 * admission and retry/cancel authority stay in drawerModel/TargetPicker/DispatchResults.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const SAAS_DISPATCH_SKIN_SCHEMA = 'capsule-ui-kit.saas-dispatch-skin/v1';

export const SAAS_DISPATCH_DRAWER_HEIGHT_PX = 705;

export const SAAS_DISPATCH_PRESENTATIONS = Object.freeze(['collapsed', 'expanded', 'maximized']);

/**
 * @typedef {Object} SaasDispatchSession
 * @property {string} sessionId
 * @property {string} [label]
 * @property {string} [activity] - Drawer session activity for the status dot.
 */

/**
 * @typedef {Object} SaasDispatchTabView
 * @property {string} sessionId
 * @property {string} label
 * @property {'idle' | 'busy' | 'exited'} dot
 * @property {boolean} active
 * @property {string} accessibleName
 */

/**
 * Maps a session activity to the tab dot status (mirrors drawerModel tab mapping).
 *
 * @param {unknown} activity
 * @returns {'idle' | 'busy' | 'exited'}
 */
export function resolveSaasDispatchTabDot(activity) {
  if (activity === 'exited' || activity === 'failed') return 'exited';
  if (activity === 'busy' || activity === 'waiting-input' || activity === 'waiting-permission') return 'busy';
  return 'idle';
}

/**
 * Projects one dispatch session into a tab view with a stable accessible name.
 *
 * @param {SaasDispatchSession} session
 * @param {string} activeSessionId
 * @returns {SaasDispatchTabView}
 */
export function projectSaasDispatchTab(session, activeSessionId) {
  const label =
    typeof session.label === 'string' && session.label.length > 0 ? session.label : session.sessionId;
  const dot = resolveSaasDispatchTabDot(session.activity);
  const active = session.sessionId === activeSessionId;
  return Object.freeze({
    sessionId: session.sessionId,
    label,
    dot,
    active,
    accessibleName: `Dispatch session ${label} (${dot}${active ? ', active' : ''})`
  });
}

/**
 * Send gate: empty targets disable Send; empty never means all. Prompt readiness and
 * IME composition come from the consumer (drawer model owns prompt validation).
 *
 * @param {{ targetIds: readonly string[] | null | undefined, promptReady: unknown, imeComposing: unknown }} input
 * @returns {boolean}
 */
export function isSaasSendEnabled(input) {
  if (!input || !Array.isArray(input.targetIds) || input.targetIds.length === 0) return false;
  if (input.promptReady !== true) return false;
  if (input.imeComposing === true) return false;
  return true;
}

/**
 * @param {{ targetIds: readonly string[] | null | undefined, promptReady: unknown, imeComposing: unknown }} input
 * @returns {string}
 */
export function saasSendUnavailableReason(input) {
  if (!input || !Array.isArray(input.targetIds) || input.targetIds.length === 0) {
    return 'Send unavailable: no targets selected (empty never means all)';
  }
  if (input.promptReady !== true) return 'Send unavailable: prompt is not ready for review';
  if (input.imeComposing === true) return 'Send unavailable: IME composition in progress';
  return '';
}

/**
 * Exact UTF-8 byte length of composer text.
 *
 * @param {unknown} text
 * @returns {number}
 */
export function saasComposerByteLength(text) {
  if (typeof text !== 'string') return 0;
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Formats the composer byte counter (`384 / 4096 BYTES`).
 *
 * @param {number} usedBytes
 * @param {number} maxBytes
 * @returns {string}
 */
export function formatSaasByteCount(usedBytes, maxBytes) {
  const used = Number.isSafeInteger(usedBytes) && usedBytes >= 0 ? usedBytes : 0;
  const max = Number.isSafeInteger(maxBytes) && maxBytes > 0 ? maxBytes : 4096;
  return `${used} / ${max} BYTES`;
}
</script>

<script setup>
import { computed } from 'vue';
import SaasTargetRow from './SaasTargetRow.vue';
import SaasFrozenReview from './SaasFrozenReview.vue';
import SaasAccessibleBox from './SaasAccessibleBox.vue';
import SaasResultRows from './SaasResultRows.vue';

const props = defineProps({
  presentation: {
    type: String,
    default: 'expanded'
  },
  sessions: {
    type: Array,
    default: () => []
  },
  activeSessionId: {
    type: String,
    default: ''
  },
  targets: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: /** @type {import('vue').PropType<string[]>} */ (Array),
    default: () => []
  },
  composerValue: {
    type: String,
    default: ''
  },
  maxComposerBytes: {
    type: Number,
    default: 4096
  },
  promptReady: {
    type: Boolean,
    default: false
  },
  imeComposing: {
    type: Boolean,
    default: false
  },
  methodLabel: {
    type: String,
    default: 'METHOD: STANDARD'
  },
  priorityLabel: {
    type: String,
    default: 'PRIORITY: NORMAL'
  },
  streamChipLabel: {
    type: String,
    default: 'STANDARD STREAM'
  },
  review: {
    type: Object,
    default: null
  },
  dispatchId: {
    type: String,
    default: ''
  },
  confirmDisabled: {
    type: Boolean,
    default: false
  },
  plan: {
    type: Object,
    default: null
  },
  results: {
    type: Array,
    default: () => []
  },
  showScrim: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits([
  'presentation-change',
  'select-session',
  'new-task',
  'close-session',
  'update:modelValue',
  'targets-changed',
  'update:composerValue',
  'dry-run',
  'send-payload',
  'confirm-dispatch',
  'cancel-target-run',
  'stage-retry',
  'view-output'
]);

const effectivePresentation = computed(() =>
  SAAS_DISPATCH_PRESENTATIONS.includes(props.presentation) ? props.presentation : 'expanded'
);

const bodyVisible = computed(() => effectivePresentation.value !== 'collapsed');

const tabs = computed(() => {
  if (!Array.isArray(props.sessions)) return [];
  /** @type {SaasDispatchTabView[]} */
  const views = [];
  for (const raw of props.sessions) {
    if (!raw || typeof raw !== 'object') continue;
    const session = /** @type {SaasDispatchSession} */ (raw);
    if (typeof session.sessionId !== 'string' || session.sessionId.length === 0) continue;
    views.push(projectSaasDispatchTab(session, props.activeSessionId));
  }
  return views;
});

const selectedIds = computed(() =>
  Array.isArray(props.modelValue) ? [...props.modelValue] : []
);

const sendEnabled = computed(() =>
  isSaasSendEnabled({
    targetIds: selectedIds.value,
    promptReady: props.promptReady,
    imeComposing: props.imeComposing
  })
);

const sendReason = computed(() =>
  saasSendUnavailableReason({
    targetIds: selectedIds.value,
    promptReady: props.promptReady,
    imeComposing: props.imeComposing
  })
);

const byteCount = computed(() => formatSaasByteCount(saasComposerByteLength(props.composerValue), props.maxComposerBytes));

function onToggle() {
  emit('presentation-change', {
    presentation: effectivePresentation.value === 'collapsed' ? 'expanded' : 'collapsed'
  });
}

function onMaximize() {
  emit('presentation-change', {
    presentation: effectivePresentation.value === 'maximized' ? 'expanded' : 'maximized'
  });
}

function onCloseSession() {
  emit('close-session', { sessionId: props.activeSessionId });
}

function onSelectSession(sessionId) {
  emit('select-session', { sessionId });
}

function onNewTask() {
  emit('new-task');
}

function onTargetsUpdate(next) {
  emit('update:modelValue', next);
}

function onTargetsChanged(payload) {
  emit('targets-changed', payload);
}

function onComposerInput(/** @type {Event} */ event) {
  const target = /** @type {HTMLTextAreaElement | null} */ (event.target);
  emit('update:composerValue', target ? target.value : '');
}

function onDryRun() {
  emit('dry-run', { targetIds: [...selectedIds.value] });
}

function onSend() {
  if (!sendEnabled.value) return;
  emit('send-payload', { promptText: props.composerValue, targetIds: [...selectedIds.value] });
}

function onConfirm(payload) {
  emit('confirm-dispatch', payload);
}

function onCancelRun(payload) {
  emit('cancel-target-run', payload);
}

function onStageRetry(payload) {
  emit('stage-retry', payload);
}

function onViewOutput(payload) {
  emit('view-output', payload);
}
</script>

<template>
  <section
    id="cuk-saas-dispatch-drawer"
    class="saas-dispatch"
    :class="`saas-dispatch--${effectivePresentation}`"
    role="region"
    aria-label="Broadcast dispatch drawer"
    :data-presentation="effectivePresentation"
  >
    <div v-if="props.showScrim" class="saas-dispatch__scrim" aria-hidden="true" />
    <header class="saas-dispatch__bar">
      <div class="saas-dispatch__tabs" role="tablist" aria-label="Dispatch sessions">
        <button
          id="cuk-saas-dispatch-new-task"
          type="button"
          role="button"
          class="saas-dispatch__launcher"
          aria-label="New orchestrator task"
          @click="onNewTask"
        >
          + Orchestrator Task
        </button>
        <span class="saas-dispatch__divider" aria-hidden="true" />
        <button
          v-for="tab in tabs"
          :key="tab.sessionId"
          :id="`cuk-saas-dispatch-tab-${tab.sessionId}`"
          type="button"
          role="tab"
          class="saas-dispatch__tab"
          :class="{ 'saas-dispatch__tab--active': tab.active }"
          :aria-selected="tab.active ? 'true' : 'false'"
          :aria-label="tab.accessibleName"
          :data-tab-dot="tab.dot"
          @click="onSelectSession(tab.sessionId)"
        >
          <span class="saas-dispatch__dot" :class="`saas-dispatch__dot--${tab.dot}`" aria-hidden="true" />
          <span>{{ tab.label }}</span>
        </button>
      </div>
      <div class="saas-dispatch__window-controls">
        <span class="saas-dispatch__caption">DRAWER: BROADCAST DISPATCH</span>
        <button
          id="cuk-saas-dispatch-toggle"
          type="button"
          role="button"
          class="saas-dispatch__window-btn"
          data-semantic-anchor="drawer/toggle"
          aria-label="Collapse dispatch drawer"
          @click="onToggle"
        >
          –
        </button>
        <button
          id="cuk-saas-dispatch-maximize"
          type="button"
          role="button"
          class="saas-dispatch__window-btn"
          data-semantic-anchor="drawer/maximize"
          aria-label="Maximize dispatch drawer"
          @click="onMaximize"
        >
          +
        </button>
        <button
          id="cuk-saas-dispatch-close"
          type="button"
          role="button"
          class="saas-dispatch__window-btn"
          aria-label="Close dispatch session"
          @click="onCloseSession"
        >
          ×
        </button>
      </div>
    </header>
    <div v-show="bodyVisible" class="saas-dispatch__body">
      <SaasTargetRow
        :targets="props.targets"
        :model-value="selectedIds"
        @update:model-value="onTargetsUpdate"
        @targets-changed="onTargetsChanged"
      />
      <div class="saas-dispatch__split">
        <div class="saas-dispatch__composer" role="group" aria-label="Payload dispatch composer">
          <header class="saas-dispatch__composer-header">
            <span class="saas-dispatch__pane-title">Payload Dispatch Composer</span>
            <span class="saas-dispatch__stream-chip">{{ props.streamChipLabel }}</span>
            <span class="saas-dispatch__byte-count">{{ byteCount }} • UTF-8</span>
          </header>
          <textarea
            id="cuk-saas-dispatch-composer"
            class="saas-dispatch__textarea"
            role="textbox"
            aria-multiline="true"
            aria-label="Dispatch payload composer"
            data-semantic-anchor="drawer/composer"
            placeholder="Enter dispatch payload..."
            :value="props.composerValue"
            @input="onComposerInput"
          />
          <footer class="saas-dispatch__composer-footer">
            <span class="saas-dispatch__method">{{ props.methodLabel }} · {{ props.priorityLabel }}</span>
            <span class="saas-dispatch__composer-actions">
              <button
                id="cuk-saas-dispatch-dry-run"
                type="button"
                role="button"
                class="saas-dispatch__dry-run"
                aria-label="Dry run dispatch"
                @click="onDryRun"
              >
                Dry Run
              </button>
              <button
                id="cuk-saas-dispatch-send"
                type="button"
                role="button"
                class="saas-dispatch__send"
                data-semantic-anchor="drawer/send"
                aria-label="Send payload"
                :disabled="!sendEnabled"
                :aria-disabled="!sendEnabled ? 'true' : 'false'"
                :data-unavailable-reason="sendReason || undefined"
                :title="sendReason || 'Send payload'"
                @click="onSend"
              >
                Send Payload
              </button>
            </span>
          </footer>
        </div>
        <SaasFrozenReview
          :review="props.review"
          :dispatch-id="props.dispatchId"
          :confirm-disabled="props.confirmDisabled"
          @confirm-dispatch="onConfirm"
        />
      </div>
      <SaasAccessibleBox :plan="props.plan" :session-id="props.activeSessionId" />
      <SaasResultRows
        :results="props.results"
        @cancel-target-run="onCancelRun"
        @stage-retry="onStageRetry"
        @view-output="onViewOutput"
      />
    </div>
  </section>
</template>

<style scoped>
.saas-dispatch {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Expanded drawer geometry: 32px rows x 22 + 1px border = 705px, tokens only. */
  height: calc(var(--cuk-component-s1-table-row-height) * 22 + var(--cuk-semantic-border-width));
  background-color: var(--cuk-semantic-surface-panel);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  color: var(--cuk-semantic-text-primary);
  z-index: var(--cuk-component-orchestrator-drawer-z-index);
  overflow: hidden;
}
.saas-dispatch--maximized {
  height: 100%;
}
.saas-dispatch--collapsed {
  height: auto;
}
.saas-dispatch__scrim {
  position: absolute;
  inset: var(--cuk-semantic-spacing-none);
  background-color: var(--cuk-semantic-surface-overlay);
  pointer-events: none;
}
.saas-dispatch__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
  /* Header geometry: 32px control - 4px space = 28px, tokens only. */
  min-height: calc(var(--cuk-semantic-size-control-height-md) - var(--cuk-primitive-space-2));
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-canvas);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  position: relative;
}
.saas-dispatch__tabs {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  min-width: var(--cuk-semantic-spacing-none);
  overflow: hidden;
}
.saas-dispatch__launcher {
  display: inline-flex;
  align-items: center;
  min-height: var(--cuk-primitive-space-10);
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  cursor: pointer;
  white-space: nowrap;
}
.saas-dispatch__divider {
  width: var(--cuk-semantic-border-width);
  height: var(--cuk-primitive-space-6);
  background-color: var(--cuk-semantic-border-subtle);
}
.saas-dispatch__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  align-self: stretch;
  padding: var(--cuk-semantic-spacing-none) var(--cuk-primitive-space-5);
  border: none;
  border-bottom: calc(var(--cuk-semantic-border-width) * 2) solid transparent;
  background-color: transparent;
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  cursor: pointer;
  white-space: nowrap;
}
.saas-dispatch__tab--active {
  border-bottom-color: var(--cuk-semantic-accent-primary);
  background-color: var(--cuk-semantic-surface-panel);
  color: var(--cuk-semantic-text-primary);
}
.saas-dispatch__dot {
  display: inline-block;
  width: var(--cuk-semantic-spacing-sm);
  height: var(--cuk-semantic-spacing-sm);
  border-radius: var(--cuk-semantic-radius-pill);
}
.saas-dispatch__dot--idle {
  background-color: var(--cuk-semantic-status-success-icon);
}
.saas-dispatch__dot--busy {
  background-color: var(--cuk-semantic-status-warning-icon);
}
.saas-dispatch__dot--exited {
  background-color: var(--cuk-semantic-text-disabled);
}
.saas-dispatch__window-controls {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
}
.saas-dispatch__caption {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  margin-right: var(--cuk-semantic-spacing-sm);
  white-space: nowrap;
}
.saas-dispatch__window-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--cuk-primitive-space-10);
  height: var(--cuk-primitive-space-10);
  border: none;
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: transparent;
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  cursor: pointer;
}
.saas-dispatch__window-btn:hover {
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
}
.saas-dispatch__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-5);
  padding: var(--cuk-semantic-spacing-md);
  overflow: hidden;
  position: relative;
}
.saas-dispatch__split {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: var(--cuk-semantic-spacing-md);
  /* Pane geometry: 24px space x 10 = 240px, tokens only. */
  height: calc(var(--cuk-primitive-space-12) * 10);
}
.saas-dispatch__composer {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
  overflow: hidden;
}
.saas-dispatch__composer-header {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  padding-bottom: var(--cuk-semantic-spacing-sm);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-dispatch__pane-title {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  color: var(--cuk-semantic-text-primary);
  white-space: nowrap;
}
.saas-dispatch__stream-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-sm);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-status-success-text);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}
.saas-dispatch__byte-count {
  margin-left: auto;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-dispatch__textarea {
  flex: 1 1 auto;
  width: 100%;
  resize: none;
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  color: var(--cuk-semantic-text-primary);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
}
.saas-dispatch__textarea:focus {
  border-color: var(--cuk-semantic-accent-primary);
}
.saas-dispatch__textarea:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-dispatch__composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-sm);
  padding-top: var(--cuk-semantic-spacing-xs);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-dispatch__method {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-dispatch__composer-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
}
.saas-dispatch__dry-run {
  display: inline-flex;
  align-items: center;
  min-height: calc(var(--cuk-semantic-size-control-height-md) - var(--cuk-primitive-space-2));
  padding: var(--cuk-semantic-spacing-none) var(--cuk-primitive-space-5);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
  white-space: nowrap;
}
.saas-dispatch__send {
  display: inline-flex;
  align-items: center;
  min-height: calc(var(--cuk-semantic-size-control-height-md) - var(--cuk-primitive-space-2));
  padding: var(--cuk-semantic-spacing-none) var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid transparent;
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-accent-primary);
  color: var(--cuk-semantic-accent-primary-contrast);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  cursor: pointer;
  white-space: nowrap;
}
.saas-dispatch__send:disabled {
  cursor: not-allowed;
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-disabled);
}
.saas-dispatch__launcher:focus-visible,
.saas-dispatch__tab:focus-visible,
.saas-dispatch__window-btn:focus-visible,
.saas-dispatch__dry-run:focus-visible,
.saas-dispatch__send:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
@media (prefers-reduced-motion: reduce) {
  .saas-dispatch,
  .saas-dispatch__send,
  .saas-dispatch__dry-run {
    transition: none;
  }
}
</style>
