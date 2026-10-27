/**
 * @file Generic wall-tile state model for the kit wall (kw1 lane T): seven
 * tile states with icon, label, colour token and accessible description,
 * take/release control helpers with disabled reasons, a tile-state to
 * veil-kind mapping, and stable badge ids/anchors. Colour tokens apply to
 * the badge icon and border only; the badge label stays bright neutral so
 * text contrast holds on the always-dark tile chrome in every scheme.
 * Data + pure helpers only: no imports, no product names.
 * Plain JavaScript ES module with JSDoc types.
 * @module saas/SaasTileState
 */

/**
 * @typedef {Object} TileStateMeta
 * @property {string} label - Uppercase chip label.
 * @property {string} tone - Chip tone key (`success|warning|info|danger|neutral|accent`).
 * @property {string} colorToken - Primary CSS custom property for icon/border.
 * @property {string|null} colorFallbackToken - Token fallback for kit delta vars, if any.
 * @property {string} colorTokenPath - Dot path of the colour token in tokens.json.
 * @property {string} description - Accessible description of the state.
 * @property {string} iconPath - Single SVG path (`d`) for the 16px state glyph.
 * @property {boolean} captureAlive - True when capture keeps running in this state.
 */

/** Tile states in wall order. @type {ReadonlyArray<string>} */
export const TILE_STATES = Object.freeze([
  'connecting',
  'live',
  'folded',
  'human-control',
  'agent-acting',
  'lost',
  'error',
]);

/**
 * Per-state chrome descriptor. Unknown input never resolves to `live`.
 * @type {Readonly<Record<string, TileStateMeta>>}
 */
export const TILE_STATE_META = Object.freeze({
  connecting: Object.freeze({
    label: 'CONNECTING',
    tone: 'info',
    colorToken: '--cuk-primitive-color-saas-sky500',
    colorFallbackToken: '--cuk-primitive-color-cyan-500',
    colorTokenPath: 'primitive.color.saas.sky500',
    description: 'Establishing the live surface; frames are not flowing yet.',
    iconPath: 'M8 2a6 6 0 105.2 3',
    captureAlive: false,
  }),
  live: Object.freeze({
    label: 'LIVE',
    tone: 'success',
    colorToken: '--cuk-primitive-color-emerald-500',
    colorFallbackToken: null,
    colorTokenPath: 'primitive.color.emerald.500',
    description: 'Live surface; frames are flowing.',
    iconPath: 'M2 8h3l2-4 3 6 2-2h2',
    captureAlive: false,
  }),
  folded: Object.freeze({
    label: 'FOLDED',
    tone: 'neutral',
    colorToken: '--cuk-primitive-color-neutral-400',
    colorFallbackToken: null,
    colorTokenPath: 'primitive.color.neutral.400',
    description: 'Folded; capture keeps running in the background.',
    iconPath: 'M4 10l4-4 4 4',
    captureAlive: true,
  }),
  'human-control': Object.freeze({
    label: 'HUMAN CONTROL',
    tone: 'accent',
    colorToken: '--cuk-primitive-color-saas-indigo500',
    colorFallbackToken: '--cuk-primitive-color-accent-500',
    colorTokenPath: 'primitive.color.saas.indigo500',
    description: 'Operator holds the control lease; peer input is parked.',
    iconPath: 'M8 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3.5 13.5c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4',
    captureAlive: false,
  }),
  'agent-acting': Object.freeze({
    label: 'AGENT ACTING',
    tone: 'info',
    colorToken: '--cuk-primitive-color-saas-sky500',
    colorFallbackToken: '--cuk-primitive-color-cyan-500',
    colorTokenPath: 'primitive.color.saas.sky500',
    description: 'Automated peer is acting; override revokes the lease.',
    iconPath: 'M8 2l2.2 4.3 4.3 1.7-4.3 1.7L8 14l-2.2-4.3L1.5 8l4.3-1.7z',
    captureAlive: false,
  }),
  lost: Object.freeze({
    label: 'LOST',
    tone: 'warning',
    colorToken: '--cuk-primitive-color-amber-500',
    colorFallbackToken: null,
    colorTokenPath: 'primitive.color.amber.500',
    description: 'Signal lost; the last frame is held while the tile retries.',
    iconPath: 'M8 2a6 6 0 110 12A6 6 0 018 2zM4 4l8 8',
    captureAlive: false,
  }),
  error: Object.freeze({
    label: 'ERROR',
    tone: 'danger',
    colorToken: '--cuk-primitive-color-rose-500',
    colorFallbackToken: null,
    colorTokenPath: 'primitive.color.rose.500',
    description: 'Fault; retry re-attaches the live surface.',
    iconPath: 'M8 2.5L14.5 13.5h-13zM8 6.5v3.2M8 11.6v.1',
    captureAlive: false,
  }),
});

/**
 * @param {unknown} state
 * @returns {boolean} True for a known tile state.
 */
export function isTileState(state) {
  return TILE_STATES.includes(/** @type {string} */ (state));
}

/**
 * @param {unknown} state
 * @returns {string} Known state, falling back to `connecting` (never `live`,
 *   so unknown input can never render a fake live tile).
 */
export function normalizeTileState(state) {
  return isTileState(state) ? /** @type {string} */ (state) : 'connecting';
}

/**
 * @param {unknown} state
 * @returns {TileStateMeta} Meta of the normalized state.
 */
export function tileStateMeta(state) {
  return TILE_STATE_META[normalizeTileState(state)];
}

/**
 * @param {unknown} state
 * @returns {{ label: string, tone: string }} Badge chip descriptor.
 */
export function tileStateChip(state) {
  const meta = tileStateMeta(state);
  return { label: meta.label, tone: meta.tone };
}

/**
 * @param {unknown} state
 * @returns {string} Accessible description of the normalized state.
 */
export function tileStateDescription(state) {
  return tileStateMeta(state).description;
}

/**
 * Maps a tile state to the veil it needs over the tile surface.
 * @param {unknown} state
 * @returns {string|null} Veil kind, or null when the input is not a tile
 *   state (the caller falls through to explicit kinds and projections).
 */
export function tileStateVeilKind(state) {
  if (!isTileState(state)) return null;
  if (state === 'connecting') return 'connecting';
  if (state === 'agent-acting') return 'ai-held';
  if (state === 'lost') return 'lost';
  if (state === 'error') return 'error';
  return 'none';
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable badge DOM id.
 */
export function tileStateBadgeDomId(capsuleId) {
  return `cuk-saas-wall-state-${capsuleId}`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Badge semantic anchor (pending family, same lane-E
 *   precedent as the viewer SCALED badge).
 */
export function tileStateBadgeAnchor(capsuleId) {
  return `capsule/${capsuleId}/tile-state`;
}

/**
 * @param {{ capsuleTitle?: string, capsuleId: string, state?: unknown }} input
 * @returns {string} Stable accessible name carrying label + description.
 */
export function tileStateAccessibleName(input) {
  const title = (input.capsuleTitle || '').trim() || input.capsuleId;
  const meta = tileStateMeta(input.state);
  return `${meta.label} for ${title}: ${meta.description}`;
}

/**
 * Selects the take/release disabled flag by lease mode.
 * @param {{ controlHeld?: unknown, takeControlDisabled?: unknown, releaseControlDisabled?: unknown }} input
 * @returns {boolean} True when the mode button is disabled.
 */
export function tileControlDisabled(input) {
  if (input.controlHeld === true) return input.releaseControlDisabled === true;
  return input.takeControlDisabled === true;
}

/**
 * Selects the take/release disabled reason by lease mode.
 * @param {{ controlHeld?: unknown, takeControlReason?: unknown, releaseControlReason?: unknown }} input
 * @returns {string} Non-empty whenever the mode button is disabled.
 */
export function tileControlReason(input) {
  const raw = input.controlHeld === true ? input.releaseControlReason : input.takeControlReason;
  return typeof raw === 'string' ? raw : '';
}
