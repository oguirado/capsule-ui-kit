<script>
/**
 * Generic SaaS live capsule wall tile (SAAS-1 §1 protagonist).
 * Contract-compatible with CapsulePanel / MultiSlot / DockWorkspace: same
 * prop names (`capsuleId`, `projection`, `epoch`), same emit vocabulary
 * (`submit-intent`, `control-request`, `fold-change`, `close-panel`,
 * `activate-surface`, `select-session`) and same `capsule/{id}/…` anchor
 * families. Renders exact SAAS-1 chrome (32px header, 28px address bar,
 * 96px drawer) composed from the Saas* children; no edits to kit files.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module saas/SaasWallTile
 */

/** Tile lifecycle/mode phases. @type {ReadonlyArray<string>} */
export const SAAS_WALL_PHASES = Object.freeze(['running', 'locked', 'agent-lock', 'error', 'booting']);

/** Emits this tile may produce. @type {ReadonlyArray<string>} */
export const SAAS_WALL_TILE_EMITS = Object.freeze([
  'submit-intent',
  'activate-surface',
  'fold-change',
  'control-request',
  'close-panel',
  'select-session',
]);

/**
 * @param {unknown} phase
 * @returns {string} Known phase, falling back to `running`.
 */
export function normalizeWallPhase(phase) {
  return SAAS_WALL_PHASES.includes(/** @type {string} */ (phase))
    ? /** @type {string} */ (phase)
    : 'running';
}

/**
 * @param {unknown} phase
 * @returns {{ label: string, tone: string }} Phase chip descriptor.
 */
export function wallPhaseChip(phase) {
  const normalized = normalizeWallPhase(phase);
  if (normalized === 'locked') return { label: 'LOCKED', tone: 'warning' };
  if (normalized === 'agent-lock') return { label: 'AGENT LOCK', tone: 'info' };
  if (normalized === 'error') return { label: 'ERROR', tone: 'error' };
  if (normalized === 'booting') return { label: 'BOOTING', tone: 'neutral' };
  return { label: 'RUNNING', tone: 'success' };
}

/**
 * @param {unknown} phase
 * @returns {string} Status dot tone.
 */
export function wallStatusDotTone(phase) {
  const normalized = normalizeWallPhase(phase);
  if (normalized === 'locked') return 'warning';
  if (normalized === 'agent-lock') return 'info';
  if (normalized === 'error') return 'error';
  if (normalized === 'booting') return 'neutral';
  return 'success';
}

/**
 * @param {unknown} lines
 * @returns {Array<{ timestamp: string, level: string, text: string, tone: string }>}
 *   Exactly the first 2 log lines; unknown omitted.
 */
export function visibleLogLines(lines) {
  if (!Array.isArray(lines)) return [];
  const tones = ['success', 'info', 'warning', 'error', 'neutral'];
  return lines.slice(0, 2).map((line) => {
    if (!line || typeof line !== 'object') return { timestamp: '', level: '', text: '', tone: 'neutral' };
    return {
      timestamp: typeof line.timestamp === 'string' ? line.timestamp : '',
      level: typeof line.level === 'string' ? line.level : '',
      text: typeof line.text === 'string' ? line.text : '',
      tone: tones.includes(line.tone) ? line.tone : 'neutral',
    };
  });
}

/**
 * Mirrors MultiSlot `formatSessionTabAccessibleName` (`title (id) — activity`).
 * @param {{ sessionId: string, title?: string, disambiguator?: string, activity?: string, attention?: boolean }} session
 * @returns {string} Accessible tab name.
 */
export function wallSessionTabName(session) {
  const title = (session.title || '').trim() || session.sessionId;
  const disamb = (session.disambiguator || '').trim() || session.sessionId;
  const activity = (session.activity || '').trim() || 'unknown';
  const attentionSuffix = session.attention ? ', needs attention' : '';
  return `${title} (${disamb}) — ${activity}${attentionSuffix}`;
}

/**
 * @param {string} capsuleId
 * @returns {Record<string, string>} Stable DOM ids.
 */
export function wallTileDomIds(capsuleId) {
  return {
    tile: `cuk-saas-wall-tile-${capsuleId}`,
    header: `cuk-saas-wall-head-${capsuleId}`,
    name: `cuk-saas-wall-name-${capsuleId}`,
    phase: `cuk-saas-wall-phase-${capsuleId}`,
    identity: `cuk-saas-wall-identity-${capsuleId}`,
    takeControl: `cuk-saas-wall-control-${capsuleId}`,
    popout: `cuk-saas-wall-popout-${capsuleId}`,
    popoutTip: `cuk-saas-wall-popout-tip-${capsuleId}`,
    fold: `cuk-saas-wall-fold-${capsuleId}`,
    float: `cuk-saas-wall-float-${capsuleId}`,
    close: `cuk-saas-wall-close-${capsuleId}`,
    address: `cuk-saas-wall-address-${capsuleId}`,
    drawer: `cuk-saas-wall-drawer-${capsuleId}`,
    activity: `cuk-saas-wall-activity-${capsuleId}`,
    log: `cuk-saas-wall-log-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @param {string} sessionId
 * @returns {string} Stable session tab DOM id.
 */
export function wallSessionTabDomId(capsuleId, sessionId) {
  return `cuk-saas-wall-tab-${capsuleId}-${sessionId}`;
}

/**
 * @param {string} capsuleId
 * @returns {Record<string, string>} Semantic anchors (existing families).
 */
export function wallTileAnchors(capsuleId) {
  return {
    panel: `capsule/${capsuleId}/panel`,
    fold: `capsule/${capsuleId}/fold`,
    float: `capsule/${capsuleId}/float`,
    close: `capsule/${capsuleId}/close`,
    control: `capsule/${capsuleId}/control`,
    popout: `capsule/${capsuleId}/popout`,
  };
}

/**
 * @param {string} capsuleId
 * @param {string} sessionId
 * @returns {string} Session tab anchor (existing family).
 */
export function wallSessionTabAnchor(capsuleId, sessionId) {
  return `capsule/${capsuleId}/session/${sessionId}/tab`;
}

/**
 * @param {{ capsuleId: string, folded?: boolean }} input
 * @returns {{ capsuleId: string, folded: boolean }} Fold payload.
 */
export function buildWallFoldPayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId, folded: input.folded !== false });
}

/**
 * @param {{ capsuleId: string, verb?: string }} input
 * @returns {{ capsuleId: string, verb: string }} Control payload (CapsulePanel shape).
 */
export function buildWallControlPayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId, verb: input.verb || 'take-control' });
}

/**
 * @param {unknown} controlHeld
 * @returns {string} Control verb for the header button (`release-control` when
 *   the operator holds the lease, else `take-control`).
 */
export function wallControlVerb(controlHeld) {
  return controlHeld === true ? 'release-control' : 'take-control';
}

/**
 * @param {unknown} controlHeld
 * @returns {string} Visible label of the header control button.
 */
export function wallControlLabel(controlHeld) {
  return controlHeld === true ? 'Release Control' : 'Take Control';
}

/**
 * @param {{ capsuleTitle?: string, capsuleId: string, controlHeld?: unknown }} input
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function wallControlAccessibleName(input) {
  const label = (input.capsuleTitle || '').trim() || input.capsuleId;
  if (input.controlHeld === true) return `Release control of ${label}`;
  return `Take control of ${label}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Semantic anchor of the release-control button.
 */
export function wallReleaseControlAnchor(capsuleId) {
  return `capsule/${capsuleId}/release-control`;
}

/**
 * @param {{ type: string, capsuleId: string }} input
 * @returns {{ type: string, capsuleId: string }} Intent payload (CapsulePanel shape).
 */
export function buildWallIntent(input) {
  return Object.freeze({ type: input.type, capsuleId: input.capsuleId });
}

/**
 * @param {{ capsuleId: string }} input
 * @returns {{ capsuleId: string }} Close payload.
 */
export function buildWallClosePayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId });
}

/**
 * @param {{ capsuleId: string, sessionId: string }} input
 * @returns {{ capsuleId: string, viewedSessionId: string }} Session payload (MultiSlot shape).
 */
export function buildWallSelectSessionPayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId, viewedSessionId: input.sessionId });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>} Fixture props.
 */
export function saasWallTileFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleTitle: 'Capsule-01',
    projection: null,
    epoch: 1,
    generation: 1,
    phase: 'running',
    identityLabel: 'id:capsule-01',
    surfaceAddress: 'surface://capsule-01',
    surfaceState: 'live',
    presentationInstance: 'wall-main',
    viewer: { live: true, elapsed: '00:14:28', scaled: 0.62, viewerLabel: 'viewer-01', resolution: '1280x900' },
    veilKind: '',
    veil: {},
    recording: { phase: 'idle' },
    recordDisabled: false,
    recordReason: '',
    takeControlDisabled: false,
    takeControlReason: '',
    controlHeld: false,
    popoutDisabled: true,
    popoutReason: 'Policy: window open disabled',
    sessions: [
      { sessionId: 'tty-1', title: 'tty-1', activity: 'attached' },
      { sessionId: 'daemon-log', title: 'daemon-log', activity: 'following' },
    ],
    viewedSessionId: 'tty-1',
    activityChip: { label: 'I/O SYNC', tone: 'indigo' },
    logLines: [
      { timestamp: '[00:14:28.042]', level: 'SESSION', text: 'handshake complete (14ms)', tone: 'neutral' },
      { timestamp: '[00:14:29.190]', level: 'SURFACE', text: 'frame channel attached to slot', tone: 'info' },
    ],
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
import SaasRecordButton from './SaasRecordButton.vue';
import SaasViewerChips from './SaasViewerChips.vue';
import SaasSurfaceView from './SaasSurfaceView.vue';
import SaasVeil from './SaasVeil.vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleTitle: { type: String, required: true },
  projection: { type: Object, default: null },
  epoch: { type: Number, default: 1 },
  generation: { type: Number, default: 1 },
  phase: { type: String, default: 'running' },
  identityLabel: { type: String, default: null },
  surfaceAddress: { type: String, default: null },
  surfaceState: { type: String, default: 'live' },
  presentationInstance: { type: String, default: 'wall-main' },
  viewer: { type: Object, default: () => ({}) },
  veilKind: { type: String, default: '' },
  veil: { type: Object, default: () => ({}) },
  recording: { type: Object, default: () => ({ phase: 'idle' }) },
  recordDisabled: { type: Boolean, default: false },
  recordReason: { type: String, default: '' },
  takeControlDisabled: { type: Boolean, default: false },
  takeControlReason: { type: String, default: '' },
  controlHeld: { type: Boolean, default: false },
  popoutDisabled: { type: Boolean, default: true },
  popoutReason: { type: String, default: 'Policy: window open disabled' },
  sessions: { type: Array, default: () => [] },
  viewedSessionId: { type: String, default: '' },
  activityChip: { type: Object, default: null },
  logLines: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'submit-intent',
  'activate-surface',
  'fold-change',
  'control-request',
  'close-panel',
  'select-session',
]);

const domIds = computed(() => wallTileDomIds(props.capsuleId));
const anchors = computed(() => wallTileAnchors(props.capsuleId));
const controlVerb = computed(() => wallControlVerb(props.controlHeld));
const controlLabel = computed(() => wallControlLabel(props.controlHeld));
const controlName = computed(() =>
  wallControlAccessibleName({
    capsuleTitle: props.capsuleTitle,
    capsuleId: props.capsuleId,
    controlHeld: props.controlHeld,
  }),
);
const controlAnchor = computed(() =>
  props.controlHeld === true
    ? wallReleaseControlAnchor(props.capsuleId)
    : anchors.value.control,
);
const phaseChip = computed(() => wallPhaseChip(props.phase));
const dotTone = computed(() => wallStatusDotTone(props.phase));
const recordPhase = computed(() =>
  props.recording && typeof props.recording.phase === 'string' ? props.recording.phase : 'idle',
);
const isRecording = computed(() => recordPhase.value === 'recording');
const identityText = computed(() => {
  const raw = props.identityLabel;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
});
const addressText = computed(() => {
  const raw = props.surfaceAddress;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : 'Address unavailable';
});
const activityText = computed(() =>
  props.activityChip && typeof props.activityChip.label === 'string' ? props.activityChip.label : '',
);
const activityTone = computed(() => {
  const tone = props.activityChip && props.activityChip.tone;
  return tone === 'warning' || tone === 'info' || tone === 'indigo' ? tone : 'indigo';
});
const logPair = computed(() => visibleLogLines(props.logLines));
const activeSessionId = computed(() => {
  if (props.viewedSessionId) return props.viewedSessionId;
  const first = props.sessions[0];
  return first ? first.sessionId : '';
});

function forwardIntent(payload) {
  emit('submit-intent', payload);
}

function forwardActivate(payload) {
  emit('activate-surface', payload);
}

function forwardControl(payload) {
  emit('control-request', payload);
}

function fold() {
  emit('fold-change', buildWallFoldPayload({ capsuleId: props.capsuleId, folded: true }));
}

function floatTile() {
  emit('submit-intent', buildWallIntent({ type: 'float', capsuleId: props.capsuleId }));
}

function close() {
  emit('close-panel', buildWallClosePayload({ capsuleId: props.capsuleId }));
}

function requestControl() {
  if (props.takeControlDisabled) return;
  emit('control-request', buildWallControlPayload({ capsuleId: props.capsuleId, verb: controlVerb.value }));
}

function selectSession(sessionId) {
  emit('select-session', buildWallSelectSessionPayload({ capsuleId: props.capsuleId, sessionId }));
}
</script>

<template>
  <section
    :id="domIds.tile"
    class="saas-tile"
    role="region"
    :aria-label="'Capsule ' + capsuleTitle"
    :data-semantic-anchor="anchors.panel"
  >
    <header :id="domIds.header" class="saas-tile-head">
      <div class="saas-tile-cluster">
        <span :class="'saas-dot saas-dot-' + dotTone" aria-hidden="true"></span>
        <span :id="domIds.name" class="saas-tile-name">{{ capsuleTitle }}</span>
        <span :id="domIds.phase" :class="'saas-chip saas-chip-' + phaseChip.tone">{{ phaseChip.label }}</span>
        <span v-if="isRecording" class="saas-chip saas-chip-rec"><span class="saas-chip-dot" aria-hidden="true"></span>REC ACTIVE</span>
        <span v-if="identityText" :id="domIds.identity" class="saas-identity">{{ identityText }}</span>
      </div>
      <div class="saas-tile-cluster">
        <SaasRecordButton
          :capsule-id="capsuleId"
          :capsule-label="capsuleTitle"
          :phase="recordPhase"
          :disabled="recordDisabled"
          :unavailable-reason="recordReason"
          @submit-intent="forwardIntent"
        />
        <button
          :id="domIds.takeControl"
          type="button"
          role="button"
          class="saas-take-control"
          :data-semantic-anchor="controlAnchor"
          :aria-label="controlName"
          :title="takeControlReason || controlName"
          :disabled="takeControlDisabled"
          :data-unavailable-reason="takeControlReason || undefined"
          @click="requestControl"
        >{{ controlLabel }}</button>
        <span class="saas-divider" aria-hidden="true"></span>
        <span class="saas-popout-wrap">
          <button
            :id="domIds.popout"
            type="button"
            role="button"
            class="saas-ghost saas-popout"
            :data-semantic-anchor="anchors.popout"
            :aria-label="'Open ' + capsuleTitle + ' in a new window'"
            :aria-describedby="domIds.popoutTip"
            :disabled="popoutDisabled"
            :data-unavailable-reason="popoutReason || undefined"
          ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.5 3.5h3v3M12.5 3.5 8 8M6.5 5.5h-3v7h7v-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
          <span :id="domIds.popoutTip" class="saas-popout-tip" role="tooltip">{{ popoutReason || 'Window open unavailable' }}</span>
        </span>
        <button
          :id="domIds.fold"
          type="button"
          role="button"
          class="saas-ghost"
          :data-semantic-anchor="anchors.fold"
          :aria-label="'Fold ' + capsuleTitle"
          @click="fold"
        ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
        <button
          :id="domIds.float"
          type="button"
          role="button"
          class="saas-ghost"
          :data-semantic-anchor="anchors.float"
          :aria-label="'Float ' + capsuleTitle"
          @click="floatTile"
        ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M6 3.5h6.5V10M3.5 6v6.5H10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><rect x="3.5" y="3.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.5" /></svg></button>
        <button
          :id="domIds.close"
          type="button"
          role="button"
          class="saas-ghost saas-close"
          :data-semantic-anchor="anchors.close"
          :aria-label="'Close ' + capsuleTitle"
          @click="close"
        ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button>
      </div>
    </header>

    <div class="saas-tile-body">
      <div :id="domIds.address" class="saas-address">
        <div class="saas-address-url">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="4.5" y="7" width="7" height="5.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M6 7V5.5a2 2 0 014 0V7" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
          <span class="saas-address-text">{{ addressText }}</span>
        </div>
        <SaasViewerChips
          :capsule-id="capsuleId"
          :capsule-label="capsuleTitle"
          :live="viewer.live === true"
          :elapsed="viewer.elapsed ?? null"
          :scaled="viewer.scaled ?? null"
          :viewer-label="viewer.viewerLabel ?? null"
          :resolution="viewer.resolution ?? null"
        />
      </div>
      <div class="saas-tile-surface">
        <SaasSurfaceView
          :capsule-id="capsuleId"
          :capsule-label="capsuleTitle"
          :presentation-instance="presentationInstance"
          :state="surfaceState"
          @activate-surface="forwardActivate"
        ><slot /></SaasSurfaceView>
        <SaasVeil
          :capsule-id="capsuleId"
          :capsule-label="capsuleTitle"
          :veil-kind="veilKind"
          :projection="projection"
          :switching-banner="veil.switchingBanner || 'Switching identity context'"
          :switching-note="veil.switchingNote || ''"
          :agent-label="veil.agentLabel || ''"
          :agent-note="veil.agentNote || ''"
          :override-pending="veil.overridePending === true"
          :override-reason="veil.overrideReason || ''"
          :cid="veil.cid ?? null"
          :fault-line="veil.faultLine ?? null"
          :detail-lines="veil.detailLines ?? []"
          :stats="veil.stats ?? []"
          :dump-label="veil.dumpLabel ?? null"
          :exit-label="veil.exitLabel ?? null"
          @control-request="forwardControl"
          @submit-intent="forwardIntent"
        />
      </div>
    </div>

    <div :id="domIds.drawer" class="saas-drawer">
      <div class="saas-drawer-bar">
        <div role="tablist" :aria-label="'Sessions for ' + capsuleTitle" class="saas-tabs">
          <button
            v-for="session in sessions"
            :key="session.sessionId"
            :id="wallSessionTabDomId(capsuleId, session.sessionId)"
            type="button"
            role="tab"
            :class="'saas-tab' + (session.sessionId === activeSessionId ? ' saas-tab-active' : '')"
            :aria-selected="session.sessionId === activeSessionId ? 'true' : 'false'"
            :aria-label="wallSessionTabName(session)"
            :data-semantic-anchor="wallSessionTabAnchor(capsuleId, session.sessionId)"
            @click="selectSession(session.sessionId)"
          >{{ session.title || session.sessionId }}</button>
        </div>
        <span v-if="activityText" :id="domIds.activity" :class="'saas-activity saas-activity-' + activityTone">{{ activityText }}</span>
      </div>
      <div :id="domIds.log" class="saas-log" role="log" :aria-label="'Session output for ' + capsuleTitle">
        <p v-for="(line, index) in logPair" :key="index" class="saas-log-line">
          <span v-if="line.timestamp" class="saas-log-time">{{ line.timestamp }}</span>
          <span v-if="line.level" :class="'saas-log-level-' + line.tone">{{ line.level }}</span>
          <span class="saas-log-text">{{ line.text }}</span>
        </p>
        <p v-if="logPair.length === 0" class="saas-log-empty">No output.</p>
      </div>
    </div>
  </section>
</template>

<style>
.saas-tile {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cuk-primitive-color-neutral-900);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  border-radius: var(--cuk-semantic-radius-lg);
}
.saas-tile-head {
  height: var(--cuk-primitive-space-16);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: 0 var(--cuk-primitive-space-6);
  background: color-mix(in srgb, var(--cuk-primitive-color-neutral-800) 90%, transparent);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
  user-select: none;
}
.saas-tile-cluster {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  min-width: 0;
}
.saas-dot {
  width: var(--cuk-primitive-space-4);
  height: var(--cuk-primitive-space-4);
  flex: none;
  border-radius: var(--cuk-semantic-radius-pill);
}
.saas-dot-success { background: var(--cuk-primitive-color-emerald-500); }
.saas-dot-warning { background: var(--cuk-primitive-color-amber-500); }
.saas-dot-info { background: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)); }
.saas-dot-error { background: var(--cuk-primitive-color-rose-500); }
.saas-dot-neutral { background: var(--cuk-primitive-color-neutral-500); }
.saas-tile-name {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  font-weight: var(--cuk-primitive-font-weight-semibold);
  color: var(--cuk-primitive-color-neutral-50);
  white-space: nowrap;
}
.saas-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}
.saas-chip-success {
  color: var(--cuk-primitive-color-emerald-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-emerald-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-emerald-500) 25%, transparent);
}
.saas-chip-warning {
  color: var(--cuk-primitive-color-amber-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 25%, transparent);
}
.saas-chip-info {
  color: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500));
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 25%, transparent);
}
.saas-chip-error {
  color: var(--cuk-primitive-color-rose-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 25%, transparent);
}
.saas-chip-neutral {
  color: var(--cuk-primitive-color-neutral-400);
  background: color-mix(in srgb, var(--cuk-primitive-color-neutral-400) 10%, transparent);
  border-color: var(--cuk-semantic-border-divider);
}
.saas-chip-rec {
  color: var(--cuk-primitive-color-rose-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 25%, transparent);
}
.saas-chip-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-rose-500);
  animation: saas-tile-rec-pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.saas-identity {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
  color: var(--cuk-primitive-color-neutral-400);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}
.saas-take-control {
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-neutral-900);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
  color: var(--cuk-primitive-color-neutral-0);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-medium);
  white-space: nowrap;
  cursor: pointer;
}
.saas-take-control:hover { background: var(--cuk-primitive-color-neutral-800); }
.saas-take-control:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.saas-divider {
  width: 1px;
  height: var(--cuk-primitive-space-8);
  background: var(--cuk-primitive-color-neutral-700);
  margin: 0 var(--cuk-primitive-space-2);
  flex: none;
}
.saas-popout-wrap {
  position: relative;
  display: inline-flex;
}
.saas-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  background: transparent;
  color: var(--cuk-primitive-color-neutral-400);
  cursor: pointer;
}
.saas-ghost svg {
  width: var(--cuk-semantic-typography-font-size-s1_14);
  height: var(--cuk-semantic-typography-font-size-s1_14);
}
.saas-ghost:hover { color: var(--cuk-primitive-color-neutral-0); }
.saas-close:hover { color: var(--cuk-primitive-color-rose-500); }
.saas-popout { color: var(--cuk-primitive-color-neutral-600); }
.saas-popout:disabled { cursor: not-allowed; }
.saas-popout-tip {
  display: none;
  position: absolute;
  right: 0;
  top: 28px;
  z-index: var(--cuk-semantic-z-index-tooltip);
  white-space: nowrap;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
  color: var(--cuk-primitive-color-neutral-400);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
}
.saas-popout-wrap:hover .saas-popout-tip,
.saas-popout-wrap:focus-within .saas-popout-tip { display: block; }
.saas-tile-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
}
.saas-address {
  height: 28px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: 0 var(--cuk-primitive-space-5);
  background: var(--cuk-primitive-color-neutral-900);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.saas-address-url {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  flex: 1 1 auto;
  min-width: 0;
  color: var(--cuk-primitive-color-emerald-500);
}
.saas-address-url svg {
  width: 13px;
  height: 13px;
  flex: none;
}
.saas-address-text {
  color: var(--cuk-primitive-color-neutral-50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.saas-tile-surface {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  position: relative;
}
.saas-tile-surface .saas-surface { flex: 1 1 auto; }
.saas-drawer {
  height: 96px;
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-primitive-color-saas-well, var(--cuk-semantic-surface-sunken));
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  font-family: var(--cuk-semantic-typography-font-family-mono);
}
.saas-drawer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding-bottom: var(--cuk-primitive-space-2);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
}
.saas-tabs {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
}
.saas-tab {
  padding: 1px var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  background: transparent;
  color: var(--cuk-primitive-color-neutral-500);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
  cursor: pointer;
}
.saas-tab:hover { color: var(--cuk-primitive-color-neutral-0); }
.saas-tab-active {
  background: var(--cuk-primitive-color-neutral-800);
  border-color: var(--cuk-primitive-color-neutral-700);
  color: var(--cuk-primitive-color-neutral-0);
  font-weight: var(--cuk-primitive-font-weight-medium);
}
.saas-activity {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  white-space: nowrap;
}
.saas-activity-indigo {
  color: var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-400));
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500)) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500)) 20%, transparent);
}
.saas-activity-warning {
  color: var(--cuk-primitive-color-amber-500);
  background: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 20%, transparent);
}
.saas-activity-info {
  color: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500));
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 10%, transparent);
  border-color: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 20%, transparent);
}
.saas-log {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-primitive-color-neutral-400);
  user-select: text;
}
.saas-log-line {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.saas-log-time { color: var(--cuk-primitive-color-emerald-500); }
.saas-log-level-neutral { color: var(--cuk-primitive-color-neutral-0); font-weight: var(--cuk-primitive-font-weight-semibold); }
.saas-log-level-success { color: var(--cuk-primitive-color-emerald-500); font-weight: var(--cuk-primitive-font-weight-semibold); }
.saas-log-level-info { color: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)); font-weight: var(--cuk-primitive-font-weight-semibold); }
.saas-log-level-warning { color: var(--cuk-primitive-color-amber-500); font-weight: var(--cuk-primitive-font-weight-semibold); }
.saas-log-level-error { color: var(--cuk-primitive-color-rose-500); font-weight: var(--cuk-primitive-font-weight-semibold); }
.saas-log-text { color: var(--cuk-primitive-color-neutral-400); }
.saas-log-empty {
  margin: 0;
  color: var(--cuk-primitive-color-neutral-500);
}
.saas-take-control:focus-visible,
.saas-ghost:focus-visible,
.saas-tab:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid
    var(--cuk-primitive-color-saas-indigo500, var(--cuk-semantic-focus-ring-color));
  outline-offset: 1px;
}
@keyframes saas-tile-rec-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@media (prefers-reduced-motion: reduce) {
  .saas-chip-dot { animation: none; }
}
</style>
