<script>
/**
 * @fileoverview AI multislot shell: one capsule live surface with its attached
 * AI terminal, travelling together. Fold, per-half hide and detach-to-float
 * are presentation-only (v-show; live hosts stay mounted, nothing spawns or
 * dies). The shell owns the fold + float controls; the essential slot controls
 * mount through the `controls` slot. Emits `submit-intent` only.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const AI_MULTI_SLOT_SCHEMA = 'capsule-ui-kit.ai-multi-slot/v1';

/** Terminal attach sides. @type {ReadonlyArray<string>} */
export const ATTACH_SIDES = Object.freeze(['right', 'bottom']);

/** Shell presentations. @type {ReadonlyArray<string>} */
export const SLOT_PRESENTATIONS = Object.freeze(['expanded', 'folded']);

/** Surface refocus passes after reveal, in ms. @type {ReadonlyArray<number>} */
export const REFOCUS_PASS_DELAYS = Object.freeze([0, 120, 400]);

/**
 * @param {unknown} side
 * @returns {'right'|'bottom'} Known side, defaulting to `bottom`.
 */
export function normalizeAttachSide(side) {
  return side === 'right' ? 'right' : 'bottom';
}

/**
 * @param {unknown} folded
 * @returns {'expanded'|'folded'}
 */
export function presentationOf(folded) {
  return folded === true ? 'folded' : 'expanded';
}

/**
 * @param {unknown} side
 * @returns {'vertical'|'horizontal'} Splitter axis following the attach side.
 */
export function splitterAxisForSide(side) {
  return normalizeAttachSide(side) === 'right' ? 'vertical' : 'horizontal';
}

/**
 * @param {string} capsuleId
 * @returns {{ root: string, fold: string, float: string, body: string, surface: string, terminal: string, splitter: string, rail: string }} Stable DOM ids.
 */
export function multislotDomIds(capsuleId) {
  return {
    root: `cuk-ai-slot-${capsuleId}`,
    fold: `cuk-ai-slot-${capsuleId}-fold`,
    float: `cuk-ai-slot-${capsuleId}-float`,
    body: `cuk-ai-slot-${capsuleId}-body`,
    surface: `cuk-ai-surface-${capsuleId}`,
    terminal: `cuk-ai-terminal-${capsuleId}`,
    splitter: `cuk-ai-splitter-${capsuleId}`,
    rail: `cuk-ai-slot-${capsuleId}-rail`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {{ slot: string, fold: string, float: string, dockBack: string }} Semantic anchors.
 */
export function multislotAnchors(capsuleId) {
  return {
    slot: `capsule/${capsuleId}/slot`,
    fold: `capsule/${capsuleId}/fold`,
    float: `capsule/${capsuleId}/float`,
    dockBack: `capsule/${capsuleId}/dock-back`,
  };
}

/**
 * Builds a frozen shell intent (`submit-intent` shape `{type, capsuleId, …}`).
 * @param {unknown} type
 * @param {string} capsuleId
 * @param {Record<string, unknown>} [extra={}]
 * @returns {{ type: string, capsuleId: string }} Frozen intent.
 */
export function buildSlotIntent(type, capsuleId, extra = {}) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new Error('buildSlotIntent requires a non-empty intent type');
  }
  return Object.freeze({ type, capsuleId, ...extra });
}

/**
 * Folded-rail card state from the live projections (rail vocabulary
 * `idle|busy|attention|error`; unmeasured stays `idle`, never invented).
 * @param {unknown} surfaceState
 * @param {unknown} activityState
 * @returns {'idle'|'busy'|'attention'|'error'}
 */
export function railCardState(surfaceState, activityState) {
  if (surfaceState === 'lost' || activityState === 'failed' || activityState === 'exited') return 'error';
  if (surfaceState === 'connecting' || activityState === 'busy') return 'busy';
  if (activityState === 'waiting-input' || activityState === 'waiting-permission') return 'attention';
  return 'idle';
}

/**
 * Folded-rail badges: explicit badge props win, else the live projections;
 * empty strings are omitted by the rail (never fabricated).
 * @param {{ surfaceBadge?: unknown, terminalBadge?: unknown, surfaceState?: unknown, sessionId?: unknown, activity?: unknown }} [input={}]
 * @returns {{ surface: string, terminal: string }}
 */
export function railCardBadges(input = {}) {
  const text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value.trim() : '');
  const surface = text(input.surfaceBadge) || text(input.surfaceState);
  const terminal = text(input.terminalBadge) || text(input.sessionId) || text(input.activity);
  return { surface, terminal };
}

/**
 * Hidden or folded panes report no geometry; visible panes are measured by
 * the host (the kit never fabricates boxes).
 * @param {unknown} visible
 * @returns {boolean}
 */
export function reportsGeometry(visible) {
  return visible === true;
}

/**
 * Float-frame style from host-owned geometry; non-finite entries stay unset
 * so the frame falls back to its anchored CSS position.
 * @param {{ floating?: unknown, x?: unknown, y?: unknown, width?: unknown, height?: unknown }} [input={}]
 * @returns {Record<string, string>} Vue style object (empty when docked).
 */
export function floatFrameStyle(input = {}) {
  if (input.floating !== true) return {};
  const style = { position: 'fixed' };
  const px = (/** @type {unknown} */ value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${numeric}px` : '';
  };
  const left = px(input.x);
  const top = px(input.y);
  const width = px(input.width);
  const height = px(input.height);
  if (left) style.left = left;
  if (top) style.top = top;
  if (width) style.width = width;
  if (height) style.height = height;
  return style;
}

/**
 * Creates a 3-pass refocus scheduler with injectable timers (DOM-free; the
 * caller supplies the focus function). `schedule` replaces any pending
 * passes; `cancel` drops them (fold and unmount paths).
 * @param {(fn: () => void, ms: number) => unknown} scheduleTimer
 * @param {(id: unknown) => void} cancelTimer
 * @returns {{ schedule: (focus: () => void) => void, cancel: () => void }}
 */
export function createRefocusScheduler(scheduleTimer, cancelTimer) {
  let pending = [];
  return {
    schedule(focus) {
      for (const id of pending) cancelTimer(id);
      const batch = [];
      pending = batch;
      if (typeof focus !== 'function') return;
      for (const delay of REFOCUS_PASS_DELAYS) {
        batch.push(scheduleTimer(() => {
          if (pending !== batch) return;
          focus();
        }, delay));
      }
    },
    cancel() {
      for (const id of pending) cancelTimer(id);
      pending = [];
    },
  };
}
</script>
<script setup>
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue';
import AiSurfacePane from './AiSurfacePane.vue';
import AiTerminalPane from './AiTerminalPane.vue';
import AiSlotSplitter from './AiSlotSplitter.vue';
import SaasFoldedRail from '../saas/SaasFoldedRail.vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  presentationInstance: { type: String, default: 'multislot-main' },
  attachSide: { type: String, default: 'bottom' },
  folded: { type: Boolean, default: false },
  surfaceHidden: { type: Boolean, default: false },
  terminalHidden: { type: Boolean, default: false },
  floating: { type: Boolean, default: false },
  floatX: { type: Number, default: null },
  floatY: { type: Number, default: null },
  floatWidth: { type: Number, default: null },
  floatHeight: { type: Number, default: null },
  paneSize: { type: Number, default: 360 },
  splitterMin: { type: Number, default: 100 },
  splitterMax: { type: Number, default: 1000 },
  surfaceMin: { type: Number, default: 200 },
  surfaceState: { type: String, default: 'live' },
  inputMode: { type: String, default: 'read' },
  sessions: {
    type: /** @type {import('vue').PropType<Array<{sessionId:string,title?:string,kind?:string,activity?:string,unreadCount?:number,restoring?:boolean,replay?:boolean}>>} */ (Array),
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
  providers: { type: Array, default: () => [] },
  commands: { type: Array, default: () => [] },
  launching: { type: Boolean, default: false },
  maxSessions: { type: Number, default: null },
  surfaceBadge: { type: String, default: '' },
  terminalBadge: { type: String, default: '' },
  reducedMotion: { type: Boolean, default: false },
});

const emit = defineEmits([
  'submit-intent',
  'resize',
  'select-session',
  'close-session',
  'launch-request',
  'request-attach',
  'request-stop',
  'request-replay',
  'select-target',
  'confirm-staged-paste',
]);

const domIds = computed(() => multislotDomIds(props.capsuleId));
const anchors = computed(() => multislotAnchors(props.capsuleId));
const side = computed(() => normalizeAttachSide(props.attachSide));
const presentation = computed(() => presentationOf(props.folded));
const splitterAxis = computed(() => splitterAxisForSide(props.attachSide));
const surfaceVisible = computed(() => !props.folded && !props.surfaceHidden);
const terminalVisible = computed(() => !props.folded && !props.terminalHidden);
const slotLabel = computed(() => (props.capsuleLabel.trim() || props.capsuleId));
const accessibleName = computed(() => `AI slot for ${slotLabel.value}${props.floating ? ', floating' : ''}`);
const frameStyle = computed(() => floatFrameStyle({
  floating: props.floating,
  x: props.floatX,
  y: props.floatY,
  width: props.floatWidth,
  height: props.floatHeight,
}));
const terminalStyle = computed(() => (side.value === 'right'
  ? { width: `${props.paneSize}px`, minWidth: `${props.splitterMin}px` }
  : { height: `${props.paneSize}px`, minHeight: `${props.splitterMin}px` }));
const surfaceStyle = computed(() => (side.value === 'right'
  ? { minWidth: `${props.surfaceMin}px` }
  : { minHeight: `${props.surfaceMin}px` }));
const railCapsules = computed(() => [{
  capsuleId: props.capsuleId,
  capsuleLabel: slotLabel.value,
  state: railCardState(props.surfaceState, props.activityState),
  badges: railCardBadges({
    surfaceBadge: props.surfaceBadge,
    terminalBadge: props.terminalBadge,
    surfaceState: props.surfaceState,
    sessionId: props.selectedSessionId,
    activity: props.activityState,
  }),
}]);

const foldControlRef = shallowRef(/** @type {HTMLButtonElement|null} */ (null));
const refocus = createRefocusScheduler(
  (fn, ms) => setTimeout(fn, ms),
  (id) => clearTimeout(/** @type {any} */ (id)),
);

/**
 * Focus guard: shell control clicks never steal the live host focus; click
 * and keyboard activation stay intact.
 * @param {Event} event
 */
function guardFocus(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
}

/**
 * @param {Record<string, unknown>} intent
 */
function forwardIntent(intent) {
  emit('submit-intent', intent);
}

function onFoldToggle() {
  const willFold = !props.folded;
  if (willFold) {
    refocus.cancel();
    if (foldControlRef.value && typeof foldControlRef.value.focus === 'function') {
      foldControlRef.value.focus();
    }
  }
  emit('submit-intent', buildSlotIntent(willFold ? 'fold' : 'unfold', props.capsuleId));
}

function onFloatToggle() {
  emit('submit-intent', buildSlotIntent(props.floating ? 'dock-back' : 'float', props.capsuleId));
}

/**
 * @param {{ capsuleId?: string, folded?: boolean }|null|undefined} _payload
 */
function onRailRestore(_payload) {
  emit('submit-intent', buildSlotIntent('unfold', props.capsuleId));
}

/**
 * @param {{ capsuleId?: string, size?: number }} payload
 */
function onSplitResize(payload) {
  emit('resize', { capsuleId: props.capsuleId, size: payload.size });
}

/**
 * @param {{ capsuleId?: string, sessionId?: string }} payload
 */
function onSelectSession(payload) {
  emit('select-session', payload);
}

/**
 * @param {{ capsuleId?: string, sessionId?: string }} payload
 */
function onCloseSession(payload) {
  emit('close-session', payload);
}

/**
 * @param {Record<string, unknown>} payload
 */
function onLaunchRequest(payload) {
  emit('launch-request', payload);
}

/**
 * Re-emits a terminal event under its own kit name.
 * @param {'request-attach'|'request-stop'|'request-replay'|'select-target'|'confirm-staged-paste'} name
 * @returns {(payload: unknown) => void}
 */
function passThrough(name) {
  return (payload) => emit(name, payload);
}

/**
 * WRITE-mode surface input becomes a host journal event carrying the kit
 * timestamp; READ-mode input is shielded by the pane and stays silent here.
 * Kinds outside the intent-lane vocabulary are never forwarded.
 * @param {{ capsuleId?: string, inputKind?: unknown }} payload
 */
function onSurfaceInput(payload) {
  if (props.inputMode !== 'write') return;
  const kind = payload.inputKind;
  if (kind !== 'pointer' && kind !== 'keyboard' && kind !== 'wheel') return;
  emit('submit-intent', buildSlotIntent('operator-guidance', props.capsuleId, {
    inputKind: kind,
    ts: Date.now(),
  }));
}

function focusSurfaceHost() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  document.getElementById(domIds.value.surface)?.focus?.();
}

watch(surfaceVisible, (visible) => {
  if (visible === true) refocus.schedule(focusSurfaceHost);
  else refocus.cancel();
});

onBeforeUnmount(() => refocus.cancel());
</script>
<template>
  <div
    :id="domIds.root"
    class="ai-slot"
    :class="{
      'ai-slot--folded': folded,
      'ai-slot--floating': floating,
      'ai-slot--side-right': side === 'right',
      'ai-slot--side-bottom': side === 'bottom',
      'ai-slot--reduced': reducedMotion,
    }"
    :style="frameStyle"
    role="region"
    :aria-label="accessibleName"
    :data-semantic-anchor="anchors.slot"
    :data-presentation="presentation"
    :data-attach-side="side"
  >
    <header class="ai-slot__header">
      <span class="ai-slot__title">{{ slotLabel }}</span>
      <span class="ai-slot__pair" role="status" aria-label="Surface and terminal travel together">PAIRED</span>
      <span class="ai-slot__spacer" aria-hidden="true"></span>
      <slot name="controls" :capsule-id="capsuleId" :folded="folded" :floating="floating" />
      <button
        :id="domIds.float"
        type="button"
        class="ai-slot__action"
        :data-semantic-anchor="floating ? anchors.dockBack : anchors.float"
        :aria-label="floating ? 'Dock slot back' : 'Detach slot to float'"
        @pointerdown="guardFocus"
        @mousedown="guardFocus"
        @click="onFloatToggle"
      >
        {{ floating ? 'Dock back' : 'Float' }}
      </button>
      <button
        :id="domIds.fold"
        ref="foldControlRef"
        type="button"
        class="ai-slot__action"
        :data-semantic-anchor="anchors.fold"
        :aria-label="folded ? 'Unfold slot' : 'Fold slot'"
        :aria-expanded="folded ? 'false' : 'true'"
        :aria-controls="domIds.body"
        @pointerdown="guardFocus"
        @mousedown="guardFocus"
        @click="onFoldToggle"
      >
        {{ folded ? 'Unfold' : 'Fold' }}
      </button>
    </header>

    <div v-show="!folded" :id="domIds.body" class="ai-slot__body">
      <AiSurfacePane
        embedded
        v-show="surfaceVisible"
        :capsule-id="capsuleId"
        :capsule-label="capsuleLabel"
        :presentation-instance="presentationInstance"
        :state="surfaceState"
        :hidden="!surfaceVisible"
        :input-mode="inputMode"
        :style="surfaceStyle"
        @surface-input="onSurfaceInput"
      >
        <slot name="surface" />
      </AiSurfacePane>

      <AiSlotSplitter
        v-show="surfaceVisible && terminalVisible"
        :capsule-id="capsuleId"
        :separator-id="presentationInstance"
        :axis="splitterAxis"
        :position="paneSize"
        :min-size="splitterMin"
        :max-size="splitterMax"
        :pane-id="domIds.terminal"
        pane-label="Terminal pane"
        :reduced-motion="reducedMotion"
        @resize="onSplitResize"
      />

      <AiTerminalPane
        v-show="terminalVisible"
        :capsule-id="capsuleId"
        :sessions="sessions"
        :selected-session-id="selectedSessionId"
        :terminal-mode="terminalMode"
        :attachment-state="attachmentState"
        :activity-state="activityState"
        :view-retention="viewRetention"
        :has-control-lease="hasControlLease"
        :stream-registry="streamRegistry"
        :epoch="epoch"
        :generation="generation"
        :hidden="!terminalVisible"
        :providers="providers"
        :commands="commands"
        :launching="launching"
        :max-sessions="maxSessions ?? undefined"
        :presentation-instance="presentationInstance"
        :reduced-motion="reducedMotion"
        :style="terminalStyle"
        @select-session="onSelectSession"
        @close-session="onCloseSession"
        @launch-request="onLaunchRequest"
        @request-attach="passThrough('request-attach')"
        @request-stop="passThrough('request-stop')"
        @request-replay="passThrough('request-replay')"
        @select-target="passThrough('select-target')"
        @confirm-staged-paste="passThrough('confirm-staged-paste')"
        @submit-intent="forwardIntent"
      />
    </div>

    <SaasFoldedRail
      v-show="folded"
      :id="domIds.rail"
      :capsules="railCapsules"
      @fold-change="onRailRestore"
      @submit-intent="forwardIntent"
    />
  </div>
</template>
<style scoped>
.ai-slot {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: var(--cuk-component-ai-multi-slot-pane-border-width, var(--cuk-semantic-border-width)) solid var(--cuk-component-ai-multi-slot-pane-border-color, var(--cuk-semantic-border-default));
  border-radius: var(--cuk-component-ai-multi-slot-pane-radius, var(--cuk-semantic-radius-md));
  background-color: var(--cuk-semantic-surface-canvas);
  font-family: var(--cuk-component-ai-multi-slot-font-family, var(--cuk-semantic-typography-font-family-sans));
}
.ai-slot--floating {
  z-index: 40;
  box-shadow: var(--cuk-semantic-elevation-floating-shadow);
}
.ai-slot__header {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  min-height: var(--cuk-primitive-space-10);
  padding: 0 var(--cuk-primitive-space-3);
  border-bottom: var(--cuk-component-ai-multi-slot-pane-border-width, var(--cuk-semantic-border-width)) solid var(--cuk-component-ai-multi-slot-pane-border-color, var(--cuk-semantic-border-default));
  background-color: var(--cuk-semantic-surface-sunken);
}
.ai-slot__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--cuk-semantic-typography-font-size-sm);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  color: var(--cuk-semantic-text-primary);
}
.ai-slot__pair {
  flex: none;
  padding: 0 var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-pill);
  background-color: var(--cuk-semantic-surface-interactive);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.ai-slot__spacer {
  flex: 1 1 auto;
}
.ai-slot__action {
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
.ai-slot__action:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.ai-slot__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  gap: 0;
}
.ai-slot--side-right .ai-slot__body {
  flex-direction: row;
}
.ai-slot--side-bottom .ai-slot__body {
  flex-direction: column;
}
.ai-slot--reduced .ai-slot__body {
  transition: none;
}
@media (prefers-reduced-motion: reduce) {
  .ai-slot__body {
    transition: none;
  }
}
</style>
