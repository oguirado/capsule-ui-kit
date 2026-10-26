/**
 * @file Frame tile model: host frame-port protocol, validators, ack builders,
 * staleness and downscale predicates, stable ids, anchors and accessible names.
 * Generic presentation model for one canvas frame tile. Frames arrive through a
 * host-supplied MessagePort only; the kit never opens its own channel and never
 * writes disk, network or clipboard. Unknown or unavailable data renders as
 * such and is never coerced to zero.
 * Plain JavaScript ES module with JSDoc types; no framework imports, no product names.
 * @module surfaces/frameTileModel
 */

/**
 * Schema id of the frame-tile port protocol.
 * @type {string}
 */
export const FRAME_TILE_SCHEMA = 'capsule-ui-kit.frame-tile/v1';

/**
 * Frame payload formats accepted on the port.
 * `bitmap` carries an ImageBitmap; `rgba`/`rgb24` carry an ArrayBuffer with
 * the declared width/height (4 and 3 bytes per pixel respectively).
 * @type {ReadonlyArray<string>}
 */
export const FRAME_FORMATS = Object.freeze(['rgba', 'rgb24', 'bitmap']);

/**
 * Bytes per pixel for the buffer formats.
 * @type {Readonly<Record<string, number>>}
 */
export const FRAME_BYTES_PER_PIXEL = Object.freeze({ rgba: 4, rgb24: 3 });

/**
 * Maximum frame area in pixels (7680x4320). Larger declarations are refused
 * without allocation so a corrupt header cannot hang the tile.
 * @type {number}
 */
export const FRAME_MAX_PIXELS = 33177600;

/**
 * Tile presentation states. `folded`/`hidden` stop the display branch;
 * `no-source` means the host supplied no port; `empty` means a port is
 * attached but no frame has been presented yet.
 * @type {ReadonlyArray<string>}
 */
export const TILE_STATES = Object.freeze(['live', 'stale', 'empty', 'no-source', 'folded', 'hidden']);

/**
 * Ack statuses posted back on the host port (one ack per received frame).
 * @type {ReadonlyArray<string>}
 */
export const FRAME_ACK_STATUSES = Object.freeze(['presented', 'dropped']);

/**
 * Display text for a value the host did not supply.
 * @type {string}
 */
export const FRAME_TILE_UNKNOWN_TEXT = 'unknown';

/**
 * Event names emitted by the frame tile components.
 * @type {ReadonlyArray<string>}
 */
export const FRAME_TILE_EMITS = Object.freeze(['frame-presented', 'frame-dropped', 'stale-change']);

/**
 * @typedef {Object} FrameEnvelope
 * @property {unknown} seq - Monotonic frame sequence number from the host.
 * @property {unknown} width - Declared frame width in pixels.
 * @property {unknown} height - Declared frame height in pixels.
 * @property {unknown} format - Payload format (`rgba`, `rgb24` or `bitmap`).
 * @property {unknown} payload - ImageBitmap or ArrayBuffer frame body.
 */

/**
 * @typedef {Object} ValidFrame
 * @property {number} seq - Validated sequence number.
 * @property {number} width - Validated frame width in pixels.
 * @property {number} height - Validated frame height in pixels.
 * @property {string} format - Validated payload format.
 * @property {unknown} payload - Untouched host payload (drawn outside reactivity).
 */

/**
 * @typedef {Object} FrameAck
 * @property {string} kind - Always `ack`.
 * @property {number} seq - Sequence number being acknowledged (`-1` when the
 * envelope had no readable seq).
 * @property {string} status - `presented` or `dropped`.
 * @property {string|null} reason - Machine reason for a drop, null when presented.
 */

/**
 * Whether a value is a usable entity identity: a non-empty anchor token that
 * is never a bare numeric index (registry identities are immutable, never
 * list positions).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isFrameTileEntityId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim() && !/^\d+$/.test(value);
}

/**
 * @param {unknown} value
 * @returns {boolean} True for a positive safe integer pixel dimension.
 */
export function isPixelDimension(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Validates one host frame envelope without touching the payload bytes beyond
 * a length check. Invalid envelopes are refused with a machine reason; the
 * tile draws nothing and (when a seq is readable) still acks the drop so the
 * host back-pressure loop never stalls.
 * @param {unknown} message - Raw `event.data` from the host port.
 * @returns {{ ok: true, frame: ValidFrame } | { ok: false, reason: string, seq: number }}
 */
export function validateFrameEnvelope(message) {
  const unreadableSeq = -1;
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { ok: false, reason: 'NOT_OBJECT', seq: unreadableSeq };
  }
  const envelope = /** @type {Record<string, unknown>} */ (message);
  const rawSeq = envelope.seq;
  const seq = typeof rawSeq === 'number' && Number.isSafeInteger(rawSeq) && rawSeq >= 0
    ? rawSeq
    : unreadableSeq;
  if (seq === unreadableSeq) {
    return { ok: false, reason: 'BAD_SEQ', seq: unreadableSeq };
  }
  const width = envelope.width;
  const height = envelope.height;
  if (!isPixelDimension(width) || !isPixelDimension(height)) {
    return { ok: false, reason: 'BAD_GEOMETRY', seq };
  }
  const pixels = /** @type {number} */ (width) * /** @type {number} */ (height);
  if (pixels > FRAME_MAX_PIXELS) {
    return { ok: false, reason: 'PIXELS_EXCEEDED', seq };
  }
  const format = envelope.format;
  if (format !== 'rgba' && format !== 'rgb24' && format !== 'bitmap') {
    return { ok: false, reason: 'UNKNOWN_FORMAT', seq };
  }
  const payload = envelope.payload;
  if (payload === null || payload === undefined) {
    return { ok: false, reason: 'MISSING_PAYLOAD', seq };
  }
  if (format === 'bitmap') {
    const bitmap = /** @type {Record<string, unknown>} */ (payload);
    if (bitmap.width !== width || bitmap.height !== height || typeof bitmap.close !== 'function') {
      return { ok: false, reason: 'BITMAP_MISMATCH', seq };
    }
  } else {
    const channels = FRAME_BYTES_PER_PIXEL[/** @type {string} */ (format)];
    const expected = pixels * channels;
    const actual = payload instanceof ArrayBuffer ? payload.byteLength : -1;
    if (actual !== expected) {
      return { ok: false, reason: 'PAYLOAD_MISMATCH', seq };
    }
  }
  return {
    ok: true,
    frame: {
      seq,
      width: /** @type {number} */ (width),
      height: /** @type {number} */ (height),
      format: /** @type {string} */ (format),
      payload,
    },
  };
}

/**
 * Builds the back-pressure ack posted on the host port for one received frame.
 * @param {unknown} seq - Sequence number being acknowledged.
 * @param {unknown} status - `presented` or `dropped`.
 * @param {unknown} [reason] - Machine reason for a drop.
 * @returns {FrameAck} Frozen ack envelope.
 */
export function buildFrameAck(seq, status, reason = null) {
  const safeSeq = typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0 ? seq : -1;
  const safeStatus = status === 'presented' ? 'presented' : 'dropped';
  const safeReason = safeStatus === 'dropped' && typeof reason === 'string' && reason.length > 0
    ? reason
    : null;
  return Object.freeze({ kind: 'ack', seq: safeSeq, status: safeStatus, reason: safeReason });
}

/**
 * Derives the tile presentation state from host-driven facts. Folded and
 * hidden win over staleness (the display branch is stopped, not stale).
 * @param {{ hasPort: boolean, folded: boolean, hidden: boolean, hasFrame: boolean, stale: boolean }} input
 * @returns {string} One of `TILE_STATES`.
 */
export function deriveTileState(input) {
  if (input.folded === true) return 'folded';
  if (input.hidden === true) return 'hidden';
  if (input.hasPort !== true) return 'no-source';
  if (input.hasFrame !== true) return 'empty';
  if (input.stale === true) return 'stale';
  return 'live';
}

/**
 * @param {unknown} state
 * @returns {string} Known tile state, falling back to `empty` (never fake live).
 */
export function normalizeTileState(state) {
  return TILE_STATES.includes(/** @type {string} */ (state))
    ? /** @type {string} */ (state)
    : 'empty';
}

/**
 * @param {{ capsuleId: string, capsuleLabel?: string, state?: unknown }} input
 * @returns {string} Stable accessible name for the tile host (agent_lane/v1).
 */
export function tileAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId;
  switch (normalizeTileState(input.state)) {
    case 'live': return `Live frame tile for ${label}`;
    case 'stale': return `Stale frame tile for ${label}`;
    case 'folded': return `Folded frame tile for ${label}`;
    case 'hidden': return `Hidden frame tile for ${label}`;
    case 'no-source': return `Frame tile without source for ${label}`;
    default: return `Frame tile without frame for ${label}`;
  }
}

/**
 * @param {{ capsuleId: string, capsuleLabel?: string }} input
 * @returns {string} Stable accessible name for the frame canvas.
 */
export function canvasAccessibleName(input) {
  const label = (input.capsuleLabel || '').trim() || input.capsuleId;
  return `Frame image for ${label}`;
}

/**
 * @param {string} capsuleId
 * @param {string} [presentationInstance]
 * @returns {{ host: string, canvas: string, scaled: string, stale: string, state: string }}
 * Stable DOM ids.
 */
export function frameTileDomIds(capsuleId, presentationInstance = '') {
  const qualifier = presentationInstance && presentationInstance.trim().length > 0
    ? `${capsuleId}-${presentationInstance.trim()}`
    : capsuleId;
  return {
    host: `cuk-frame-tile-${qualifier}`,
    canvas: `cuk-frame-canvas-${capsuleId}`,
    scaled: `cuk-frame-scaled-${capsuleId}`,
    stale: `cuk-frame-stale-${capsuleId}`,
    state: `cuk-frame-state-${capsuleId}`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {{ tile: string, canvas: string, scaled: string, stale: string }}
 * Concrete semantic anchors for the tile controls.
 */
export function frameTileAnchors(capsuleId) {
  return {
    tile: `surface/${capsuleId}/tile`,
    canvas: `surface/${capsuleId}/canvas`,
    scaled: `surface/${capsuleId}/scaled-badge`,
    stale: `surface/${capsuleId}/stale`,
  };
}

/**
 * Whether the presented frame is downscaled by the tile: the frame pixel size
 * exceeds the tile content-box size on either axis. Unreadable sizes never
 * raise the badge.
 * @param {unknown} frameWidth
 * @param {unknown} frameHeight
 * @param {unknown} displayWidth
 * @param {unknown} displayHeight
 * @returns {boolean}
 */
export function isDownscaled(frameWidth, frameHeight, displayWidth, displayHeight) {
  const dims = [frameWidth, frameHeight, displayWidth, displayHeight];
  if (!dims.every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    return false;
  }
  return (
    /** @type {number} */ (frameWidth) > /** @type {number} */ (displayWidth) ||
    /** @type {number} */ (frameHeight) > /** @type {number} */ (displayHeight)
  );
}

/**
 * Whether the tile is stale: a frame was presented before and the
 * host-declared timeout has elapsed since. Tiles without a presented frame
 * are `empty`, never stale; unreadable timeouts never raise the indicator.
 * @param {unknown} lastPresentAtMs - Timestamp of the last presented frame, null when none.
 * @param {unknown} nowMs - Current timestamp.
 * @param {unknown} staleAfterMs - Host-declared staleness timeout in ms.
 * @returns {boolean}
 */
export function isTileStale(lastPresentAtMs, nowMs, staleAfterMs) {
  if (typeof lastPresentAtMs !== 'number' || !Number.isFinite(lastPresentAtMs) || lastPresentAtMs < 0) {
    return false;
  }
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;
  if (typeof staleAfterMs !== 'number' || !Number.isFinite(staleAfterMs) || staleAfterMs < 0) {
    return false;
  }
  return nowMs - lastPresentAtMs > staleAfterMs;
}

/**
 * Formats frame pixel dimensions for the scaled badge title. Unreadable
 * values render as unknown, never fabricated zeros.
 * @param {unknown} width
 * @param {unknown} height
 * @returns {string}
 */
export function formatFrameDims(width, height) {
  if (!isPixelDimension(width) || !isPixelDimension(height)) return FRAME_TILE_UNKNOWN_TEXT;
  return `${/** @type {number} */ (width)}x${/** @type {number} */ (height)}`;
}

/**
 * Builds a frozen `frame-presented` notification payload.
 * @param {{ seq: number, width: number, height: number, format: string }} frame
 * @returns {{ seq: number, width: number, height: number, format: string }}
 */
export function buildFramePresentedPayload(frame) {
  return Object.freeze({ seq: frame.seq, width: frame.width, height: frame.height, format: frame.format });
}

/**
 * Builds a frozen `frame-dropped` notification payload.
 * @param {number} seq - Dropped sequence (`-1` when unreadable).
 * @param {string} reason - Machine reason for the drop.
 * @returns {{ seq: number, reason: string }}
 */
export function buildFrameDroppedPayload(seq, reason) {
  return Object.freeze({ seq, reason });
}

/**
 * Builds a frozen `stale-change` notification payload.
 * @param {boolean} stale
 * @returns {{ stale: boolean }}
 */
export function buildStaleChangePayload(stale) {
  return Object.freeze({ stale: stale === true });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, presentationInstance: string,
 *   port: null, folded: boolean, hidden: boolean, staleAfterMs: number }}
 */
export function frameTileFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleLabel: 'Capsule-01',
    presentationInstance: 'wall-main',
    port: null,
    folded: false,
    hidden: false,
    staleAfterMs: 2000,
    ...overrides,
  };
}
