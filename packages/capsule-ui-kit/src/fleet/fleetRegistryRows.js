/**
 * @file Fleet overview agent_lane registry rows: plan control ids mapped to kit
 * semantic anchors. Covers every control of room MV1 lane F (census rows, row and
 * card select buttons, bulk fold/hide/stop buttons, inspector region). Rows marked
 * `existing` reuse a pre-existing family in `src/agent/controlRegistry.js`: census
 * rows use the fleet row family, the inspector uses the inspector field family,
 * and selection plus bulk actions reuse the generic dialog action family, so lane F
 * needs no new families. Compact cards are presentational containers; their select
 * buttons carry `fleet.row.select`. Data only: no imports, no product names, no
 * backend verbs. Plain JavaScript ES module with JSDoc types.
 * @module fleet/fleetRegistryRows
 */

/**
 * @typedef {Object} FleetRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'F'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new fleet row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const FLEET_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
  bulkId: 'fleet-bulk',
});

/**
 * Full lane F control surface: 6 rows.
 * @type {readonly FleetRegistryRow[]}
 */
export const FLEET_REGISTRY_ROWS = Object.freeze([
  Object.freeze({ agentLaneId: 'fleet.row', anchorTemplate: 'fleet/{id}/row', anchorExample: 'fleet/cap-01/row', role: 'row', lane: 'F', component: 'FleetOverview', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'fleet.row.select', anchorTemplate: 'dialog/{id}/{action}', anchorExample: 'dialog/cap-01/select', role: 'button', lane: 'F', component: 'FleetOverview', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'fleet.bulk.fold', anchorTemplate: 'dialog/{id}/{action}', anchorExample: 'dialog/fleet-bulk/fold', role: 'button', lane: 'F', component: 'FleetBulkBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'fleet.bulk.hide', anchorTemplate: 'dialog/{id}/{action}', anchorExample: 'dialog/fleet-bulk/hide', role: 'button', lane: 'F', component: 'FleetBulkBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'fleet.bulk.stop', anchorTemplate: 'dialog/{id}/{action}', anchorExample: 'dialog/fleet-bulk/stop', role: 'button', lane: 'F', component: 'FleetBulkBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'fleet.inspector.field', anchorTemplate: 'inspector/{id}/field', anchorExample: 'inspector/cap-01/field', role: 'region', lane: 'F', component: 'FleetOverview', anchorStatus: 'existing' }),
]);

/**
 * Every plan control id on the fleet agent_lane surface.
 * @type {readonly string[]}
 */
export const FLEET_AGENT_LANE_IDS = Object.freeze(FLEET_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `FLEET_AGENT_LANE_IDS`.
 * @param {{ id?: string, bulk?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function fleetAnchorFor(agentLaneId, params = {}) {
  const row = FLEET_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown fleet agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? FLEET_FIXTURE_IDS.capsuleId;
  const bulk = params.bulk ?? FLEET_FIXTURE_IDS.bulkId;
  return row.anchorExample
    .split(FLEET_FIXTURE_IDS.capsuleId).join(id)
    .split(FLEET_FIXTURE_IDS.bulkId).join(bulk);
}
