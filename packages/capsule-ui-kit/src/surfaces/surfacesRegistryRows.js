/**
 * @file Frame tile agent_lane registry rows: plan control ids mapped to kit
 * semantic anchors. Covers every control of room MV1 lane C (tile host, frame
 * canvas, scaled badge, stale indicator). Rows marked `new` need the additive
 * families in `src/agent/controlRegistry.js`; the conductor adds them when
 * wiring the top-level export. Data only: no component imports, no product
 * names, no backend verbs. Plain JavaScript ES module with JSDoc types.
 * @module surfaces/surfacesRegistryRows
 */

/**
 * @typedef {Object} SurfacesRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'C'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new surfaces row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const SURFACES_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
});

/**
 * Full lane C control surface: 4 rows.
 * @type {readonly SurfacesRegistryRow[]}
 */
export const SURFACES_REGISTRY_ROWS = Object.freeze([
  Object.freeze({ agentLaneId: 'surface.tile', anchorTemplate: 'surface/{id}/tile', anchorExample: 'surface/cap-01/tile', role: 'region', lane: 'C', component: 'FrameCanvasTile', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'surface.canvas', anchorTemplate: 'surface/{id}/canvas', anchorExample: 'surface/cap-01/canvas', role: 'img', lane: 'C', component: 'FrameCanvasTile', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'surface.scaled-badge', anchorTemplate: 'surface/{id}/scaled-badge', anchorExample: 'surface/cap-01/scaled-badge', role: 'status', lane: 'C', component: 'FrameCanvasTile', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'surface.stale', anchorTemplate: 'surface/{id}/stale', anchorExample: 'surface/cap-01/stale', role: 'status', lane: 'C', component: 'FrameCanvasTile', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the surfaces agent_lane surface.
 * @type {readonly string[]}
 */
export const SURFACES_AGENT_LANE_IDS = Object.freeze(
  SURFACES_REGISTRY_ROWS.map((row) => row.agentLaneId),
);

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `SURFACES_AGENT_LANE_IDS`.
 * @param {{ id?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function surfacesAnchorFor(agentLaneId, params = {}) {
  const row = SURFACES_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown surfaces agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? SURFACES_FIXTURE_IDS.capsuleId;
  return row.anchorExample.split(SURFACES_FIXTURE_IDS.capsuleId).join(id);
}
