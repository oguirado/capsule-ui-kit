<script>
/**
 * @fileoverview SAAS-2 capsule detail layout helpers: surface + attached
 * terminal split with geometry bar, separator, console row, shell gate and
 * edge strip. Panes hide with mounted hidden classes and never unmount; the live surface is
 * a consumer slot, never placeholder DOM.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_DETAIL_LAYOUT_SCHEMA = 'capsule-ui-kit.saas-detail-layout/v1';

export const DETAIL_SURFACE_STATES = Object.freeze(['live', 'connecting', 'lost', 'none']);

/**
 * @typedef {Object} DetailSession
 * @property {string} sessionId
 * @property {string} [title]
 * @property {string} [activity]
 * @property {boolean} [restoring]
 * @property {boolean} [replay]
 */

/**
 * @typedef {Object} DetailPreset
 * @property {string} presetId
 * @property {string} label
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} DetailSibling
 * @property {string} capsuleId
 * @property {string} label
 * @property {string} [tone]
 */

/**
 * Validates the surface state; unknown values fall back to 'none'.
 * @param {unknown} value
 * @returns {'live'|'connecting'|'lost'|'none'}
 */
export function surfaceState(value) {
  if (value === 'live' || value === 'connecting' || value === 'lost' || value === 'none') return value;
  return 'none';
}

/**
 * Chip tone for a lifecycle label.
 * @param {unknown} lifecycle
 * @returns {'success'|'warning'|'error'|'info'|'neutral'}
 */
export function lifecycleTone(lifecycle) {
  const text = typeof lifecycle === 'string' ? lifecycle.trim().toLowerCase() : '';
  if (text === 'running' || text === 'ready' || text === 'live') return 'success';
  if (text === 'booting' || text === 'starting' || text === 'attaching' || text === 'restoring') return 'warning';
  if (text === 'error' || text === 'failed' || text === 'lost') return 'error';
  if (text === 'locked' || text === 'held') return 'info';
  return 'neutral';
}

/**
 * Tab dot tone for a session activity label.
 * @param {unknown} activity
 * @returns {'success'|'warning'|'error'}
 */
export function tabDotTone(activity) {
  const text = typeof activity === 'string' ? activity.trim().toLowerCase() : '';
  if (text === 'exited' || text === 'failed') return 'error';
  if (text === 'busy' || text === 'waiting-input' || text === 'waiting-permission') return 'warning';
  return 'success';
}

/**
 * Formats the SCALED badge text; '' when no factor is projected.
 * @param {unknown} factor
 * @returns {string}
 */
export function formatScaled(factor) {
  const value = Number(factor);
  if (!Number.isFinite(value) || value <= 0) return '';
  return `SCALED x${value.toFixed(2)}`;
}

/**
 * Builds a deterministic, DOM-free snapshot of the detail surface for one
 * fixture: concrete anchors, visible chips and pane states. Used by the
 * fixture-driven demo tests and as the agent surface description.
 * @param {Record<string, any>} [fixture={}]
 * @returns {{ schema: string, capsuleId: string, anchors: Record<string, string>, controls: Record<string, string>, tabs: Record<string, string>, chips: string[], surface: string, surfaceVisible: boolean, terminalVisible: boolean }}
 */
export function describeSaasDetail(fixture = {}) {
  const capsuleId = typeof fixture.capsuleId === 'string' ? fixture.capsuleId : '';
  const mode = surfaceState(fixture.surfaceState ?? 'live');
  const folded = fixture.folded === true;
  const surfaceVisible = !folded && fixture.surfaceHidden !== true;
  const terminalVisible = !folded && fixture.terminalHidden !== true;
  const sessions = Array.isArray(fixture.sessions) ? fixture.sessions : [];
  const tabs = /** @type {Record<string, string>} */ ({});
  for (const sess of sessions) {
    if (sess && typeof sess.sessionId === 'string' && sess.sessionId.length > 0) {
      tabs[sess.sessionId] = `capsule/${capsuleId}/session/${sess.sessionId}/tab`;
    }
  }
  const chips = [];
  if (typeof fixture.lifecycle === 'string' && fixture.lifecycle.trim().length > 0) {
    chips.push(fixture.lifecycle.trim().toUpperCase());
  }
  if (fixture.recordingActive === true) chips.push('REC: ACTIVE');
  const presentationInstance = typeof fixture.presentationInstance === 'string' && fixture.presentationInstance.length > 0
    ? fixture.presentationInstance
    : 'detail-main';
  return {
    schema: SAAS_DETAIL_LAYOUT_SCHEMA,
    capsuleId,
    anchors: {
      back: 'shell/navigation/detail-back',
      fold: `capsule/${capsuleId}/fold`,
      control: `capsule/${capsuleId}/control`,
      record: `capsule/${capsuleId}/record`,
      close: `capsule/${capsuleId}/close`,
      popout: `capsule/${capsuleId}/popout`,
      scaledBadge: `detail/${capsuleId}/scaled-badge`,
      separator: `workspace/separator/${presentationInstance}`,
      ptyToggle: `detail/${capsuleId}/pty-toggle`,
    },
    controls: {
      attachCta: `saas-detail-${capsuleId}-attach`,
      surfaceRetry: `saas-detail-${capsuleId}-surface-retry`,
    },
    tabs,
    chips,
    surface: mode,
    surfaceVisible,
    terminalVisible,
  };
}
</script>
<script setup>
import { useKitGeometry } from '../workspace/useKitGeometry.js';
import { computed } from 'vue';
import TerminalView from '../terminal/TerminalView.vue';
import SaasGeometryBar from './SaasGeometryBar.vue';
import SaasSplitter from './SaasSplitter.vue';
import SaasConsoleRow from './SaasConsoleRow.vue';
import SaasShellToggle from './SaasShellToggle.vue';
import SaasEdgeStrip from './SaasEdgeStrip.vue';
import SaasFrameStrip from './SaasFrameStrip.vue';

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleName: { type: String, default: '' },
  identityLabel: { type: String, default: '' },
  lifecycle: { type: String, default: 'running' },
  modeLabel: { type: String, default: '' },
  healthLabel: { type: String, default: '' },
  recordingActive: { type: Boolean, default: false },
  roleLabel: { type: String, default: 'Operator' },
  folded: { type: Boolean, default: false },
  surfaceHidden: { type: Boolean, default: false },
  terminalHidden: { type: Boolean, default: false },
  surfaceState: { type: String, default: 'live' },
  surfaceCid: { type: String, default: '' },
  viewerLabel: { type: String, default: '' },
  resolutionLabel: { type: String, default: '' },
  scaledFactor: { type: Number, default: null },
  uptimeLabel: { type: String, default: '' },
  ramOnly: { type: Boolean, default: true },
  frame: { type: String, default: '' },
  frameGeneration: { type: String, default: '' },
  digest: { type: String, default: '' },
  width: { type: Number, default: 900 },
  height: { type: Number, default: 800 },
  floor: { type: Number, default: 200 },
  maxWidth: { type: Number, default: 4096 },
  maxHeight: { type: Number, default: 2160 },
  presets: {
    type: /** @type {import('vue').PropType<DetailPreset[]>} */ (Array),
    default: () => [],
  },
  activePresetId: { type: String, default: '' },
  siblings: {
    type: /** @type {import('vue').PropType<DetailSibling[]>} */ (Array),
    default: () => [],
  },
  paneWidth: { type: Number, default: 450 },
  splitterMin: { type: Number, default: 200 },
  splitterMax: { type: Number, default: 900 },
  sessions: {
    type: /** @type {import('vue').PropType<DetailSession[]>} */ (Array),
    default: () => [],
  },
  selectedSessionId: { type: String, default: '' },
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
  contrast: { type: String, default: 'normal' },
  reducedMotion: { type: Boolean, default: false },
  epoch: { type: Number, default: 0 },
  generation: { type: Number, default: 0 },
  consoleDraft: { type: String, default: '' },
  consoleDisabled: { type: Boolean, default: false },
  consoleBusy: { type: Boolean, default: false },
  shellLocked: { type: Boolean, default: true },
  shellChecked: { type: Boolean, default: false },
  shellDevGated: { type: Boolean, default: false },
  edgeSlotId: { type: String, default: '' },
  edgeSlotLabel: { type: String, default: 'RESERVED SLOT' },
  edgeSlotDetail: { type: String, default: 'RESERVED CONTAINER' },
  edgePreserved: { type: Boolean, default: true },
  presentationInstance: { type: String, default: 'detail-main' },
});

const emit = defineEmits([
  'fold-change',
  'control-request',
  'close-panel',
  'submit-intent',
  'select-session',
  'request-attach',
  'request-stop',
  'request-replay',
  'select-target',
  'confirm-staged-paste',
  'resize',
  'update:consoleDraft',
]);

const surfaceMode = computed(() => surfaceState(props.surfaceState));
const surfaceVisible = computed(() => !props.folded && !props.surfaceHidden);
const terminalVisible = computed(() => !props.folded && !props.terminalHidden);
const lifeTone = computed(() => lifecycleTone(props.lifecycle));
const scaledText = computed(() => formatScaled(props.scaledFactor));
const terminalPaneId = computed(() => `saas-detail-${props.capsuleId}-terminal`);
const controlBase = computed(() => `saas-detail-${props.capsuleId}`);
const terminalStyle = computed(() => ({ width: `${props.paneWidth}px` }));
const dotFor = tabDotTone;

const sessionList = computed(() => (Array.isArray(props.sessions) ? props.sessions : []).filter(
  (sess) => sess && typeof sess.sessionId === 'string' && sess.sessionId.length > 0,
));
const activeSession = computed(
  () => sessionList.value.find((sess) => sess.sessionId === props.selectedSessionId) ?? null,
);
const effectiveRetention = computed(() => {
  if (activeSession.value && activeSession.value.replay === true) return 'replay-view';
  return props.viewRetention;
});
const sessionIds = computed(() => sessionList.value.map((sess) => sess.sessionId));

/**
 * @param {{ sessionId?: string, title?: string, restoring?: boolean, replay?: boolean }|null|undefined} sess
 * @returns {string}
 */
function tabTitle(sess) {
  const title = typeof sess?.title === 'string' ? sess.title.trim() : '';
  if (title.length > 0) return title;
  return typeof sess?.sessionId === 'string' ? sess.sessionId : '';
}

/**
 * @param {{ sessionId?: string, title?: string, restoring?: boolean, replay?: boolean, activity?: string }|null|undefined} sess
 * @returns {string}
 */
function tabName(sess) {
  const parts = [`Session ${tabTitle(sess)}`];
  if (sess?.restoring === true) parts.push('restoring');
  if (sess?.replay === true) parts.push('read only replay');
  return parts.join(', ');
}

/**
 * @param {{ sessionId?: string }|null|undefined} sess
 * @param {number} index
 * @returns {string}
 */
function tabIndex(sess, index) {
  if (!sessionIds.value.includes(props.selectedSessionId)) return index === 0 ? '0' : '-1';
  return sess?.sessionId === props.selectedSessionId ? '0' : '-1';
}

/**
 * @param {{ sessionId?: string }|null|undefined} sess
 */
function onSelectSession(sess) {
  if (typeof sess?.sessionId === 'string' && sess.sessionId.length > 0) {
    emit('select-session', { capsuleId: props.capsuleId, sessionId: sess.sessionId });
  }
}

/**
 * @param {KeyboardEvent} event
 */
function onTablistKeydown(event) {
  const ids = sessionIds.value;
  if (ids.length === 0) return;
  const current = ids.indexOf(props.selectedSessionId);
  let next = -1;
  if (event.key === 'ArrowRight') next = (current + 1 + ids.length) % ids.length;
  else if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = ids.length - 1;
  else return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  emit('select-session', { capsuleId: props.capsuleId, sessionId: ids[next] });
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    document.getElementById(`${controlBase.value}-tab-${ids[next]}`)?.focus?.();
  }
}

function onFold() {
  emit('fold-change', { capsuleId: props.capsuleId, folded: !props.folded });
}

function onControl() {
  emit('control-request', { capsuleId: props.capsuleId });
}

function onClose() {
  emit('close-panel', { capsuleId: props.capsuleId });
}

function onRecord() {
  emit('submit-intent', { intent: 'record.toggle', capsuleId: props.capsuleId, source: 'detail-top' });
}

function onBack() {
  emit('submit-intent', { intent: 'detail.back', capsuleId: props.capsuleId });
}

function onAttach() {
  emit('request-attach', { capsuleId: props.capsuleId });
}

/**
 * @param {{ capsuleId?: string, checked?: boolean }} payload
 */
function onShellChange(payload) {
  emit('submit-intent', {
    intent: 'shell.change',
    capsuleId: props.capsuleId,
    checked: payload.checked === true,
  });
}

/**
 * @param {{ capsuleId?: string, slotId?: string }} payload
 */
function onEdgeRestore(payload) {
  emit('submit-intent', {
    intent: 'edge.restore',
    capsuleId: props.capsuleId,
    slotId: typeof payload.slotId === 'string' ? payload.slotId : '',
  });
}

/**
 * @param {Record<string, unknown>} intent
 */
function forwardIntent(intent) {
  emit('submit-intent', intent);
}

/**
 * Re-emits a TerminalView event under its own kit name.
 * @param {'request-attach'|'request-stop'|'request-replay'|'select-target'|'confirm-staged-paste'} name
 * @returns {(payload: unknown) => void}
 */
function passThrough(name) {
  return (payload) => emit(name, payload);
}

/**
 * @param {string} value
 */
function onConsoleDraft(value) {
  emit('update:consoleDraft', value);
}

/**
 * @param {{ capsuleId?: string, width?: number }} payload
 */
function onSplitResize(payload) {
  emit('resize', { capsuleId: props.capsuleId, width: payload.width });
}

const cspGeometry1 = useKitGeometry(() => (terminalStyle));
</script>
<template>
  <div
    class="saas-detail"
    :class="{ 'saas-detail--reduced': reducedMotion }"
    :data-presentation-instance="presentationInstance"
  >
    <header class="saas-detail__top">
      <div class="saas-detail__cluster">
        <button
          :id="`${controlBase}-back`"
          type="button"
          class="saas-detail__back"
          data-semantic-anchor="shell/navigation/detail-back"
          aria-label="Back to wall"
          @click="onBack"
        >
          <span aria-hidden="true">‹</span>
          <span>Wall / Fleet</span>
        </button>
        <span class="saas-detail__divider" aria-hidden="true"></span>
        <span v-if="capsuleName.length > 0" class="saas-detail__name">{{ capsuleName }}</span>
        <span v-if="identityLabel.length > 0" class="saas-detail__identity">{{ identityLabel }}</span>
        <span :class="`saas-detail__chip saas-detail__chip--${lifeTone}`">
          <span class="saas-detail__chip-dot" aria-hidden="true"></span>
          {{ lifecycle.toUpperCase() }}
        </span>
        <span v-if="modeLabel.length > 0" class="saas-detail__chip saas-detail__chip--neutral">MODE: {{ modeLabel }}</span>
        <span v-if="healthLabel.length > 0" class="saas-detail__chip saas-detail__chip--neutral">HEALTH: {{ healthLabel }}</span>
        <span v-if="recordingActive" class="saas-detail__chip saas-detail__chip--rec">
          <span class="saas-detail__rec-dot" aria-hidden="true"></span>
          REC: ACTIVE
        </span>
      </div>
      <div class="saas-detail__cluster">
        <span class="saas-detail__role">{{ roleLabel }}</span>
        <button
          :id="`${controlBase}-fold`"
          type="button"
          class="saas-detail__action"
          :data-semantic-anchor="`capsule/${capsuleId}/fold`"
          :aria-label="folded ? 'Unfold capsule' : 'Fold capsule'"
          @click="onFold"
        >
          {{ folded ? 'Unfold' : 'Fold' }}
        </button>
        <button
          :id="`${controlBase}-control`"
          type="button"
          class="saas-detail__action saas-detail__action--primary"
          :data-semantic-anchor="`capsule/${capsuleId}/control`"
          aria-label="Take control"
          @click="onControl"
        >
          Take Control
        </button>
        <button
          :id="`${controlBase}-record`"
          type="button"
          class="saas-detail__action"
          :data-semantic-anchor="`capsule/${capsuleId}/record`"
          :aria-label="recordingActive ? 'Stop recording' : 'Start recording'"
          @click="onRecord"
        >
          Record
        </button>
        <button
          :id="`${controlBase}-close`"
          type="button"
          class="saas-detail__action saas-detail__action--icon"
          :data-semantic-anchor="`capsule/${capsuleId}/close`"
          aria-label="Close detail"
          @click="onClose"
        >
          <span aria-hidden="true">×</span>
        </button>
        <span class="saas-detail__popout">
          <button
            :id="`${controlBase}-popout`"
            type="button"
            class="saas-detail__action saas-detail__action--icon"
            :data-semantic-anchor="`capsule/${capsuleId}/popout`"
            aria-label="Open in new window, unavailable"
            aria-disabled="true"
            disabled
          >
            <span aria-hidden="true">↗</span>
          </button>
          <span class="saas-detail__policy">Policy: window open disabled</span>
        </span>
      </div>
    </header>

    <SaasGeometryBar
      :capsule-id="capsuleId"
      :width="width"
      :height="height"
      :floor="floor"
      :max-width="maxWidth"
      :max-height="maxHeight"
      :presets="presets"
      :active-preset-id="activePresetId"
      :surface-hidden="surfaceHidden"
      :terminal-hidden="terminalHidden"
      :siblings="siblings"
      @submit-intent="forwardIntent"
    />

    <div class="saas-detail__main">
      <section
        
        class="saas-detail__surface"
        aria-label="Capsule surface"
       :class="{ 'cuk-csp-hidden': !(surfaceVisible) }">
        <div class="saas-detail__pane-head">
          <div class="saas-detail__pane-cluster">
            <span class="saas-detail__live">
              <span class="saas-detail__live-dot" aria-hidden="true"></span>
              LIVE
            </span>
            <span v-if="resolutionLabel.length > 0" class="saas-detail__mono">{{ resolutionLabel }}</span>
            <span
              v-if="scaledText.length > 0"
              class="saas-detail__scaled"
              role="status"
              :data-semantic-anchor="`detail/${capsuleId}/scaled-badge`"
              :aria-label="`Surface scale ${scaledText}`"
            >
              {{ scaledText }}
            </span>
            <span v-if="viewerLabel.length > 0" class="saas-detail__mono saas-detail__viewer">{{ viewerLabel }}</span>
          </div>
          <div class="saas-detail__pane-cluster">
            <span v-if="uptimeLabel.length > 0" class="saas-detail__mono">UPTIME: {{ uptimeLabel }}</span>
            <span v-if="ramOnly" class="saas-detail__ram">RAM only</span>
          </div>
        </div>

        <SaasFrameStrip :frame="frame" :generation="frameGeneration" :digest="digest" />

        <div v-if="surfaceMode === 'live'" class="saas-detail__canvas">
          <slot name="surface" />
        </div>
        <div v-else-if="surfaceMode === 'connecting'" class="saas-detail__canvas" role="status" aria-label="Surface connecting">
          <span class="saas-detail__skeleton" aria-hidden="true"></span>
          <span class="saas-detail__skeleton saas-detail__skeleton--short" aria-hidden="true"></span>
        </div>
        <div v-else class="saas-detail__canvas">
          <div class="saas-detail__notice" role="alert">
            <span v-if="surfaceCid.length > 0" class="saas-detail__cid">{{ surfaceCid }}</span>
            <span class="saas-detail__notice-text">Surface unavailable.</span>
            <button :data-semantic-anchor="'settings/control-' + (`${controlBase}-surface-retry`).replace(/[^A-Za-z0-9._-]/g, '-')"
              :id="`${controlBase}-surface-retry`"
              type="button"
              class="saas-detail__retry"
              aria-label="Retry surface attach"
              @click="onAttach"
            >
              Retry
            </button>
          </div>
        </div>
      </section>

      <SaasSplitter
        
        :capsule-id="capsuleId"
        :separator-id="presentationInstance"
        :position="paneWidth"
        :min-width="splitterMin"
        :max-width="splitterMax"
        :pane-id="terminalPaneId"
        :reduced-motion="reducedMotion"
        @resize="onSplitResize"
      :class="{ 'cuk-csp-hidden': !(surfaceVisible && terminalVisible) }" />

      <section
        
        :id="terminalPaneId"
        class="saas-detail__terminal"
        :data-cuk-geometry-id="cspGeometry1"
        aria-label="Attached terminal"
       :class="{ 'cuk-csp-hidden': !(terminalVisible) }">
        <div class="saas-detail__tabs" :id="`${controlBase}-tabs`" role="tablist" aria-label="Detail sessions" @keydown="onTablistKeydown">
          <button
            v-for="(sess, index) in sessionList"
            :id="`${controlBase}-tab-${sess.sessionId}`"
            :key="sess.sessionId"
            type="button"
            role="tab"
            class="saas-detail__tab"
            :class="{ 'saas-detail__tab--active': sess.sessionId === selectedSessionId }"
            :data-semantic-anchor="`capsule/${capsuleId}/session/${sess.sessionId}/tab`"
            :aria-label="tabName(sess)"
            :aria-selected="sess.sessionId === selectedSessionId ? 'true' : 'false'"
            :tabindex="tabIndex(sess, index)"
            @click="onSelectSession(sess)"
          >
            <span
              v-if="sess.restoring === true"
              class="saas-detail__spinner"
              aria-hidden="true"
            ></span>
            <span
              v-else
              :class="`saas-detail__tab-dot saas-detail__tab-dot--${dotFor(sess.activity)}`"
              aria-hidden="true"
            ></span>
            <span class="saas-detail__tab-title">{{ tabTitle(sess) }}</span>
            <span v-if="sess.replay === true" class="saas-detail__replay">READ ONLY REPLAY</span>
          </button>
          <p v-if="sessionList.length === 0" class="saas-detail__tabs-empty" role="status">No sessions.</p>
        </div>

        <div v-if="activeSession !== null" class="saas-detail__stream">
          <TerminalView
            :key="selectedSessionId"
            :embedded="true"
            :session-id="selectedSessionId"
            :session-title="tabTitle(activeSession)"
            :capsule-id="capsuleId"
            :presentation-instance="presentationInstance"
            :epoch="epoch"
            :generation="generation"
            :attachment-state="attachmentState"
            :activity-state="activityState"
            :view-retention="effectiveRetention"
            :has-control-lease="hasControlLease"
            :folded="folded"
            :contrast="contrast"
            :reduced-motion="reducedMotion"
            :stream-registry="streamRegistry"
            @request-attach="passThrough('request-attach')"
            @request-stop="passThrough('request-stop')"
            @request-replay="passThrough('request-replay')"
            @select-target="passThrough('select-target')"
            @confirm-staged-paste="passThrough('confirm-staged-paste')"
          />
        </div>
        <div v-else class="saas-detail__stream">
          <div class="saas-detail__notice" role="status">
            <span class="saas-detail__notice-text">No session attached.</span>
            <button :data-semantic-anchor="'settings/control-' + (`${controlBase}-attach`).replace(/[^A-Za-z0-9._-]/g, '-')"
              :id="`${controlBase}-attach`"
              type="button"
              class="saas-detail__retry"
              aria-label="Attach session"
              @click="onAttach"
            >
              Attach
            </button>
          </div>
        </div>

        <div class="saas-detail__console">
          <SaasConsoleRow
            :capsule-id="capsuleId"
            :draft="consoleDraft"
            :disabled="consoleDisabled"
            :busy="consoleBusy"
            @update:draft="onConsoleDraft"
            @submit-intent="forwardIntent"
          />
          <SaasShellToggle
            :capsule-id="capsuleId"
            :checked="shellChecked"
            :locked="shellLocked"
            :dev-gated="shellDevGated"
            @change="onShellChange"
          />
        </div>
      </section>

      <SaasEdgeStrip
        :capsule-id="capsuleId"
        :slot-id="edgeSlotId"
        :slot-label="edgeSlotLabel"
        :slot-detail="edgeSlotDetail"
        :preserved="edgePreserved"
        @restore="onEdgeRestore"
      />
    </div>
  </div>
</template>
<style scoped>
.saas-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: var(
    --cuk-primitive-color-saas-canvas,
    var(--cuk-semantic-surface-canvas)
  );
  color: var(--cuk-semantic-text-primary);
}
.saas-detail__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  flex: none;
  min-height: calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-8));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-8);
  background-color: var(--cuk-semantic-surface-sunken);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-detail__cluster {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  min-width: 0;
}
.saas-detail__back {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: transparent;
  border: none;
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.saas-detail__back:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-interactive);
}
.saas-detail__back:focus-visible,
.saas-detail__action:focus-visible,
.saas-detail__retry:focus-visible,
.saas-detail__tab:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-detail__divider {
  width: var(--cuk-semantic-border-width);
  height: var(--cuk-primitive-space-8);
  background-color: var(--cuk-semantic-border-default);
}
.saas-detail__name {
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  white-space: nowrap;
}
.saas-detail__identity {
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-3);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-detail__chip {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  white-space: nowrap;
}
.saas-detail__chip-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: 50%;
  background-color: currentColor;
}
.saas-detail__chip--success {
  color: var(--cuk-component-saas-chip-success-text, var(--cuk-semantic-status-success-text));
  background-color: var(--cuk-component-saas-chip-success-fill, var(--cuk-semantic-status-success-surface));
  border-color: var(--cuk-component-saas-chip-success-border, var(--cuk-semantic-status-success-border));
}
.saas-detail__chip--warning {
  color: var(--cuk-component-saas-chip-warning-text, var(--cuk-semantic-status-warning-text));
  background-color: var(--cuk-component-saas-chip-warning-fill, var(--cuk-semantic-status-warning-surface));
  border-color: var(--cuk-component-saas-chip-warning-border, var(--cuk-semantic-status-warning-border));
}
.saas-detail__chip--error {
  color: var(--cuk-component-saas-chip-danger-text, var(--cuk-semantic-status-error-text));
  background-color: var(--cuk-component-saas-chip-danger-fill, var(--cuk-semantic-status-error-surface));
  border-color: var(--cuk-component-saas-chip-danger-border, var(--cuk-semantic-status-error-border));
}
.saas-detail__chip--info {
  color: var(--cuk-component-saas-chip-info-text, var(--cuk-semantic-status-info-text));
  background-color: var(--cuk-component-saas-chip-info-fill, var(--cuk-semantic-status-info-surface));
  border-color: var(--cuk-component-saas-chip-info-border, var(--cuk-semantic-status-info-border));
}
.saas-detail__chip--neutral {
  color: var(--cuk-component-saas-chip-neutral-text, var(--cuk-semantic-text-muted));
  background-color: var(--cuk-component-saas-chip-neutral-fill, var(--cuk-semantic-surface-interactive));
  border-color: var(--cuk-component-saas-chip-neutral-border, var(--cuk-semantic-border-default));
}
.saas-detail__chip--rec {
  color: var(--cuk-component-saas-chip-danger-text, var(--cuk-semantic-status-error-text));
  background-color: var(--cuk-component-saas-chip-danger-fill, var(--cuk-semantic-status-error-surface));
  border-color: var(--cuk-component-saas-chip-danger-border, var(--cuk-semantic-status-error-border));
}
.saas-detail__rec-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: 50%;
  background-color: currentColor;
  animation: saas-detail-rec 1.4s ease-in-out infinite;
}
.saas-detail__role {
  display: flex;
  align-items: center;
  height: var(--cuk-primitive-space-12);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-detail__action {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-16);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.saas-detail__action:hover:not(:disabled) {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-detail__action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.saas-detail__action--primary {
  background-color: var(--cuk-semantic-accent-primary);
  border-color: var(--cuk-semantic-accent-primary);
  color: var(--cuk-semantic-surface-canvas);
}
.saas-detail__action--icon {
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  font-size: var(--cuk-semantic-typography-font-size-s1_16);
}
.saas-detail__popout {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
}
.saas-detail__policy {
  height: var(--cuk-primitive-space-10);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  background-color: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-primitive-space-10);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-detail__main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.saas-detail__surface {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border-right: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-detail__pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  flex: none;
  min-height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-6);
  background-color: var(--cuk-semantic-surface-chrome);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-detail__pane-cluster {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  min-width: 0;
}
.saas-detail__live {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  height: var(--cuk-primitive-space-8);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-2);
  background-color: var(--cuk-component-saas-viewer-live-badge-fill, var(--cuk-semantic-status-success-surface));
  border: var(--cuk-semantic-border-width) solid var(--cuk-component-saas-chip-success-border, var(--cuk-semantic-status-success-border));
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-component-saas-viewer-live-badge-color, var(--cuk-semantic-status-success-text));
  white-space: nowrap;
}
.saas-detail__live-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: 50%;
  background-color: currentColor;
}
.saas-detail__mono {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-viewer-resolution-font-size, var(--cuk-semantic-typography-font-size-xs));
  color: var(--cuk-component-saas-viewer-resolution-color, var(--cuk-semantic-text-muted));
  white-space: nowrap;
}
.saas-detail__viewer {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(var(--cuk-primitive-space-16) * 7);
}
.saas-detail__scaled {
  height: var(--cuk-primitive-space-8);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  background-color: var(--cuk-component-saas-viewer-scaled-badge-background, var(--cuk-semantic-surface-interactive));
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-primitive-space-8);
  color: var(--cuk-component-saas-viewer-scaled-badge-color, var(--cuk-semantic-text-muted));
  white-space: nowrap;
}
.saas-detail__ram {
  height: var(--cuk-primitive-space-8);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-2);
  background-color: var(--cuk-component-saas-chip-warning-fill, var(--cuk-semantic-status-warning-surface));
  border: var(--cuk-semantic-border-width) solid var(--cuk-component-saas-chip-warning-border, var(--cuk-semantic-status-warning-border));
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-primitive-space-8);
  color: var(--cuk-component-saas-chip-warning-text, var(--cuk-semantic-status-warning-text));
  white-space: nowrap;
}
.saas-detail__canvas {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cuk-primitive-space-6);
  min-height: 0;
  overflow: auto;
  padding: var(--cuk-primitive-space-6);
}
.saas-detail__skeleton {
  display: block;
  height: var(--cuk-primitive-space-12);
  border-radius: var(--cuk-semantic-radius-xs);
  background-color: var(--cuk-semantic-surface-interactive);
  animation: saas-detail-pulse 2s ease-in-out infinite;
}
.saas-detail__skeleton--short {
  width: 62%;
}
.saas-detail__notice {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-6);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
}
.saas-detail__cid {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
}
.saas-detail__notice-text {
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.saas-detail__retry {
  height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-5);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
}
.saas-detail__retry:hover {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.saas-detail__terminal {
  display: flex;
  flex: none;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background-color: var(--cuk-semantic-surface-canvas);
  border-right: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-detail__tabs {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  flex: none;
  min-height: calc(var(--cuk-primitive-space-12) + var(--cuk-primitive-space-2));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-3);
  overflow-x: auto;
  background-color: var(--cuk-semantic-surface-chrome);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.saas-detail__tab {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  flex: none;
  height: var(--cuk-primitive-space-12);
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-4);
  background-color: transparent;
  border: var(--cuk-semantic-border-width) solid transparent;
  border-radius: var(--cuk-semantic-radius-xs) var(--cuk-semantic-radius-xs) 0 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.saas-detail__tab:hover {
  color: var(--cuk-semantic-text-primary);
  background-color: var(--cuk-semantic-surface-interactive);
}
.saas-detail__tab--active {
  background-color: var(--cuk-semantic-surface-interactive);
  border-color: var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-text-primary);
}
.saas-detail__tab-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  flex: none;
  border-radius: 50%;
}
.saas-detail__tab-dot--success {
  background-color: var(--cuk-component-saas-chip-success-text, var(--cuk-semantic-status-success-text));
}
.saas-detail__tab-dot--warning {
  background-color: var(--cuk-component-saas-chip-warning-text, var(--cuk-semantic-status-warning-text));
}
.saas-detail__tab-dot--error {
  background-color: var(--cuk-component-saas-chip-danger-text, var(--cuk-semantic-status-error-text));
}
.saas-detail__spinner {
  width: var(--cuk-component-saas-detail-restoring-spinner-size, var(--cuk-primitive-space-6));
  height: var(--cuk-component-saas-detail-restoring-spinner-size, var(--cuk-primitive-space-6));
  flex: none;
  border-radius: 50%;
  border: var(--cuk-primitive-space-1) solid var(--cuk-component-saas-detail-restoring-spinner-color, var(--cuk-semantic-status-info-border));
  border-top-color: transparent;
  animation: saas-detail-spin 1s linear infinite;
}
.saas-detail__tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
}
.saas-detail__replay {
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  background-color: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-detail-replay-badge-font-size, var(--cuk-semantic-typography-font-size-s1_10));
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-detail__tabs-empty {
  margin: var(--cuk-primitive-space-0);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.saas-detail__stream {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.saas-detail__console {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  padding: var(--cuk-primitive-space-4);
  background-color: var(--cuk-semantic-surface-chrome);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
@keyframes saas-detail-rec {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes saas-detail-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
@keyframes saas-detail-spin {
  to { transform: rotate(360deg); }
}
.saas-detail--reduced .saas-detail__rec-dot,
.saas-detail--reduced .saas-detail__skeleton,
.saas-detail--reduced .saas-detail__spinner {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .saas-detail__rec-dot,
  .saas-detail__skeleton,
  .saas-detail__spinner {
    animation: none;
  }
}

.cuk-csp-hidden { display: none !important; }
</style>
