<script>
/**
 * Generic canvas frame tile (room MV1 lane C).
 * Frames arrive as ImageBitmap or ArrayBuffer (RGBA/RGB24 with declared
 * width/height) through a host-supplied MessagePort and are drawn to the
 * canvas OUTSIDE Vue reactivity: frame payloads live in plain closure
 * variables only, while reactive state holds numbers and booleans (sizes,
 * flags) that never contain a frame object. The tile posts one
 * back-pressure ack per received frame on the supplied port and never opens
 * its own channel. Folded or hidden tiles stop drawing and release held
 * bitmaps. A badge marks downscaled presentation; a stale indicator appears
 * after the host-declared timeout without a new frame.
 * Drop inside the default slot of the shared surface view or AI surface pane;
 * the tile fills the slot box (those hosts are composed by the consumer and
 * are never imported here). The kit performs no disk, network or clipboard
 * writes; unknown or unavailable data renders as such.
 * Plain JavaScript with JSDoc; tokens only; no product names.
 * @module surfaces/FrameCanvasTile
 */
</script>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  buildFrameAck,
  buildFrameDroppedPayload,
  buildFramePresentedPayload,
  buildStaleChangePayload,
  canvasAccessibleName,
  deriveTileState,
  formatFrameDims,
  frameTileAnchors,
  frameTileDomIds,
  isDownscaled,
  isTileStale,
  tileAccessibleName,
  validateFrameEnvelope,
} from './frameTileModel.js';

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  presentationInstance: { type: String, default: '' },
  port: { type: Object, default: null },
  folded: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false },
  staleAfterMs: { type: Number, default: 2000 },
});

const emit = defineEmits(['frame-presented', 'frame-dropped', 'stale-change']);

const canvasRef = ref(null);
const hostRef = ref(null);

/* Reactive state holds numbers and booleans only: never a frame object. */
const hasFrame = ref(false);
const stale = ref(false);
const frameWidth = ref(0);
const frameHeight = ref(0);
const displayWidth = ref(0);
const displayHeight = ref(0);

/**
 * Non-reactive frame holder: the latest host bitmap lives in this plain
 * closure variable (never in a ref or reactive object) so frame arrival
 * cannot trigger Vue updates. Released on replace, fold, hide and unmount.
 * @type {any} Held ImageBitmap or null; closed before release.
 */
let liveFrame = null;
/** @type {any} 2d rendering context acquired once on mount. */
let ctx2d = null;
/** @type {any} Attached host port or null. */
let attachedPort = null;
/** @type {number} Timestamp of the last presented frame, -1 when none. */
let lastPresentAtMs = -1;
/** @type {number} Stale-check timer id, 0 when stopped. */
let staleTimerId = 0;
/** @type {any} Resize observer or null when unsupported. */
let resizeObserver = null;
/** @type {boolean} Last emitted stale flag (transition-only emits). */
let lastStaleEmitted = false;

const domIds = computed(() => frameTileDomIds(props.capsuleId, props.presentationInstance));
const anchors = computed(() => frameTileAnchors(props.capsuleId));

/**
 * @param {unknown} candidate
 * @returns {boolean} True when the candidate can carry the frame protocol.
 */
function isUsablePort(candidate) {
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof /** @type {any} */ (candidate).postMessage === 'function' &&
    (typeof /** @type {any} */ (candidate).addEventListener === 'function' ||
      typeof /** @type {any} */ (candidate).start === 'function')
  );
}

const usablePort = computed(() => (isUsablePort(props.port) ? props.port : null));

const tileName = computed(() =>
  tileAccessibleName({
    capsuleId: props.capsuleId,
    capsuleLabel: props.capsuleLabel,
    state: deriveTileState({
      hasPort: usablePort.value !== null,
      folded: props.folded,
      hidden: props.hidden,
      hasFrame: hasFrame.value,
      stale: stale.value,
    }),
  }),
);
const canvasName = computed(() =>
  canvasAccessibleName({ capsuleId: props.capsuleId, capsuleLabel: props.capsuleLabel }),
);
const state = computed(() =>
  deriveTileState({
    hasPort: usablePort.value !== null,
    folded: props.folded,
    hidden: props.hidden,
    hasFrame: hasFrame.value,
    stale: stale.value,
  }),
);
const scaled = computed(
  () =>
    hasFrame.value &&
    !props.folded &&
    !props.hidden &&
    isDownscaled(frameWidth.value, frameHeight.value, displayWidth.value, displayHeight.value),
);
const scaledTitle = computed(
  () => `Frame ${formatFrameDims(frameWidth.value, frameHeight.value)} downscaled to fit`,
);
const showStateText = computed(
  () => state.value === 'empty' || state.value === 'no-source' || state.value === 'folded',
);
const stateText = computed(() => {
  if (state.value === 'no-source') return 'No frame source.';
  if (state.value === 'folded') return 'Folded.';
  return 'No frame yet.';
});

/**
 * Posts an ack on the attached host port. The ack is the only message the
 * kit ever sends, and only on the host-supplied port. Never throws.
 * @param {{ kind: string, seq: number, status: string, reason: string|null }} ack
 */
function postAck(ack) {
  if (!isUsablePort(attachedPort)) return;
  try {
    attachedPort.postMessage(ack);
  } catch {
    /* Host endpoint gone: the kit stays silent and keeps the tile usable. */
  }
}

/**
 * Closes and drops the held bitmap (non-reactive release path).
 */
function releaseLiveFrame() {
  if (liveFrame !== null && typeof liveFrame.close === 'function') {
    try {
      liveFrame.close();
    } catch {
      /* A broken bitmap still leaves the holder empty. */
    }
  }
  liveFrame = null;
}

/**
 * Clears the canvas backing store without drawing a frame.
 */
function clearCanvas() {
  const canvas = canvasRef.value;
  if (!canvas || !ctx2d) return;
  try {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  } catch {
    /* Clearing is best-effort presentation hygiene. */
  }
}

/**
 * Stops the display branch: no further draws, held bitmap released, numeric
 * presentation state reset so unfold/hide-off resumes from a clean slate.
 */
function stopDisplayBranch() {
  releaseLiveFrame();
  lastPresentAtMs = -1;
  hasFrame.value = false;
  frameWidth.value = 0;
  frameHeight.value = 0;
  setStale(false);
  clearCanvas();
}

/**
 * Updates the stale flag, emitting `stale-change` on transitions only.
 * @param {boolean} next
 */
function setStale(next) {
  const flag = next === true;
  stale.value = flag;
  if (flag !== lastStaleEmitted) {
    lastStaleEmitted = flag;
    emit('stale-change', buildStaleChangePayload(flag));
  }
}

/**
 * Draws one validated frame to the canvas. Runs outside reactivity: the
 * payload is never stored in reactive state.
 * @param {{ seq: number, width: number, height: number, format: string, payload: unknown }} frame
 * @returns {boolean} True when the frame reached the canvas.
 */
function drawFrame(frame) {
  const canvas = canvasRef.value;
  if (!canvas || !ctx2d) return false;
  try {
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
    }
    if (frame.format === 'bitmap') {
      releaseLiveFrame();
      liveFrame = frame.payload;
      ctx2d.drawImage(/** @type {any} */ (frame.payload), 0, 0);
      return true;
    }
    const buffer = /** @type {ArrayBuffer} */ (frame.payload);
    if (frame.format === 'rgba') {
      const image = new ImageData(new Uint8ClampedArray(buffer), frame.width, frame.height);
      ctx2d.putImageData(image, 0, 0);
      return true;
    }
    const rgb = new Uint8Array(buffer);
    const rgba = new Uint8ClampedArray(frame.width * frame.height * 4);
    for (let src = 0, dst = 0; src < rgb.length; src += 3, dst += 4) {
      rgba[dst] = rgb[src] ?? 0;
      rgba[dst + 1] = rgb[src + 1] ?? 0;
      rgba[dst + 2] = rgb[src + 2] ?? 0;
      rgba[dst + 3] = 255;
    }
    ctx2d.putImageData(new ImageData(rgba, frame.width, frame.height), 0, 0);
    return true;
  } catch {
    if (frame.format === 'bitmap') releaseLiveFrame();
    return false;
  }
}

/**
 * Handles one host port message: validate, draw when the display branch is
 * open, ack every received frame exactly once.
 * @param {MessageEvent} event
 */
function onPortMessage(event) {
  const validation = validateFrameEnvelope(event ? event.data : null);
  if (!validation.ok) {
    postAck(buildFrameAck(validation.seq, 'dropped', validation.reason));
    emit('frame-dropped', buildFrameDroppedPayload(validation.seq, validation.reason));
    return;
  }
  const frame = validation.frame;
  if (props.folded || props.hidden) {
    if (frame.format === 'bitmap') {
      const payload = /** @type {any} */ (frame.payload);
      if (payload && typeof payload.close === 'function') {
        try {
          payload.close();
        } catch {
          /* Dropped payloads never leak the holder. */
        }
      }
    }
    const reason = props.folded ? 'FOLDED' : 'HIDDEN';
    postAck(buildFrameAck(frame.seq, 'dropped', reason));
    emit('frame-dropped', buildFrameDroppedPayload(frame.seq, reason));
    return;
  }
  if (!drawFrame(frame)) {
    postAck(buildFrameAck(frame.seq, 'dropped', 'DRAW_FAILED'));
    emit('frame-dropped', buildFrameDroppedPayload(frame.seq, 'DRAW_FAILED'));
    return;
  }
  frameWidth.value = frame.width;
  frameHeight.value = frame.height;
  hasFrame.value = true;
  lastPresentAtMs = Date.now();
  setStale(false);
  postAck(buildFrameAck(frame.seq, 'presented'));
  emit('frame-presented', buildFramePresentedPayload(frame));
}

/**
 * Re-evaluates staleness against the host-declared timeout.
 */
function checkStale() {
  if (props.folded || props.hidden || !hasFrame.value) {
    setStale(false);
    return;
  }
  setStale(isTileStale(lastPresentAtMs, Date.now(), props.staleAfterMs));
}

/**
 * Attaches the host port, replacing any previous attachment.
 */
function attachPort() {
  detachPort();
  const port = usablePort.value;
  if (!port) return;
  attachedPort = port;
  try {
    if (typeof attachedPort.addEventListener === 'function') {
      attachedPort.addEventListener('message', onPortMessage);
    } else {
      attachedPort.onmessage = onPortMessage;
    }
    if (typeof attachedPort.start === 'function') attachedPort.start();
  } catch {
    attachedPort = null;
  }
}

/**
 * Detaches the host port without posting (acks belong to received frames).
 */
function detachPort() {
  if (isUsablePort(attachedPort)) {
    try {
      if (typeof attachedPort.removeEventListener === 'function') {
        attachedPort.removeEventListener('message', onPortMessage);
      }
      if (attachedPort.onmessage === onPortMessage) attachedPort.onmessage = null;
    } catch {
      /* Detach is best-effort. */
    }
  }
  attachedPort = null;
}

watch(usablePort, () => {
  attachPort();
});

watch(
  () => [props.folded, props.hidden],
  () => {
    if (props.folded || props.hidden) stopDisplayBranch();
    else checkStale();
  },
);

watch(
  () => props.staleAfterMs,
  () => {
    checkStale();
  },
);

onMounted(() => {
  const canvas = canvasRef.value;
  if (canvas && typeof canvas.getContext === 'function') {
    try {
      ctx2d = canvas.getContext('2d');
    } catch {
      ctx2d = null;
    }
  }
  attachPort();
  try {
    staleTimerId = /** @type {any} */ (setInterval(checkStale, 250));
  } catch {
    staleTimerId = 0;
  }
  const host = hostRef.value;
  if (host && typeof ResizeObserver !== 'undefined') {
    try {
      resizeObserver = new ResizeObserver((entries) => {
        const box = entries && entries[0] ? entries[0].contentRect : null;
        if (!box) return;
        displayWidth.value = Math.max(0, Math.floor(box.width));
        displayHeight.value = Math.max(0, Math.floor(box.height));
      });
      resizeObserver.observe(host);
    } catch {
      resizeObserver = null;
    }
  }
});

onBeforeUnmount(() => {
  detachPort();
  releaseLiveFrame();
  ctx2d = null;
  if (staleTimerId !== 0) {
    try {
      clearInterval(staleTimerId);
    } catch {
      /* Timer teardown is best-effort. */
    }
    staleTimerId = 0;
  }
  if (resizeObserver) {
    try {
      resizeObserver.disconnect();
    } catch {
      /* Observer teardown is best-effort. */
    }
    resizeObserver = null;
  }
});
</script>

<template>
  <div
    v-show="!hidden"
    :id="domIds.host"
    ref="hostRef"
    class="frame-tile"
    role="region"
    :aria-label="tileName"
    :data-semantic-anchor="anchors.tile"
    :data-tile-state="state"
  >
    <canvas
      :id="domIds.canvas"
      ref="canvasRef"
      class="frame-tile__canvas"
      role="img"
      :aria-label="canvasName"
      :data-semantic-anchor="anchors.canvas"
    ></canvas>
    <p v-if="showStateText" :id="domIds.state" class="frame-tile__state" role="status">
      {{ stateText }}
    </p>
    <p
      v-if="scaled"
      :id="domIds.scaled"
      class="frame-tile__badge frame-tile__badge--scaled"
      role="status"
      :data-semantic-anchor="anchors.scaled"
      :title="scaledTitle"
    >
      SCALED
    </p>
    <p
      v-if="stale"
      :id="domIds.stale"
      class="frame-tile__badge frame-tile__badge--stale"
      role="status"
      :data-semantic-anchor="anchors.stale"
    >
      STALE
    </p>
  </div>
</template>

<style scoped>
.frame-tile {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--cuk-component-surface-view-backdrop);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-divider);
  border-radius: var(--cuk-semantic-radius-md);
}
.frame-tile__canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.frame-tile__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-label-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.frame-tile__badge {
  position: absolute;
  top: var(--cuk-semantic-spacing-xs);
  margin: 0;
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-xs);
  border-radius: var(--cuk-semantic-radius-pill);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
}
.frame-tile__badge--scaled {
  inset-inline-start: var(--cuk-semantic-spacing-xs);
  background: var(
    --cuk-component-saas-viewer-scaled-badge-background,
    var(--cuk-semantic-status-info-surface)
  );
  color: var(--cuk-component-saas-viewer-scaled-badge-color, var(--cuk-semantic-status-info-text));
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-info-border);
}
.frame-tile__badge--stale {
  inset-inline-end: var(--cuk-semantic-spacing-xs);
  background: var(--cuk-semantic-status-warning-surface);
  color: var(--cuk-semantic-status-warning-text);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-warning-border);
}
</style>
