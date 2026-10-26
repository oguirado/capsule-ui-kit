/**
 * @file mv2 agent_lane registry rows: plan control ids mapped to kit semantic anchors.
 * Covers the mv2 controls whose anchors had no registry row yet: wall-tile
 * release-control, record-cluster export, the veil retry/export pair and the
 * four settings section keys. Rows marked `new` use families introduced for
 * this room in `src/agent/controlRegistry.js` (settings rows reuse the
 * existing family with the admitted `group` role). Data only: no component
 * imports, no product names, no backend verbs. Plain JavaScript ES module
 * with JSDoc types.
 *
 * Colocated surface rows stay in their surface `*RegistryRows.js` files (the
 * kit pattern: distributed rows re-exported from each surface index); this
 * module only carries rows whose surface files belong to another room.
 */

/**
 * @typedef {Object} MvRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'W'|'T'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new mv2 row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const MV_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
});

/**
 * mv2 control surface without a prior row: 8 rows.
 * @type {readonly MvRegistryRow[]}
 */
export const MV_REGISTRY_ROWS = Object.freeze([
  // Wall tile release-control (lane W).
  Object.freeze({ agentLaneId: 'wall.capsule.release-control', anchorTemplate: 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}', anchorExample: 'capsule/cap-01/release-control', role: 'button', lane: 'W', component: 'SaasWallTile', anchorStatus: 'new' }),
  // Record-cluster export to a host destination (lane W).
  Object.freeze({ agentLaneId: 'multislot.export', anchorTemplate: 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}', anchorExample: 'capsule/cap-01/export', role: 'button', lane: 'W', component: 'AiRecordCluster', anchorStatus: 'new' }),
  // Error-veil retry/export pair (lane W).
  Object.freeze({ agentLaneId: 'wall.veil.retry', anchorTemplate: 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}', anchorExample: 'capsule/cap-01/retry', role: 'button', lane: 'W', component: 'SaasVeil', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'wall.veil.export', anchorTemplate: 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}', anchorExample: 'capsule/cap-01/export', role: 'button', lane: 'W', component: 'SaasVeil', anchorStatus: 'new' }),
  // Settings sections (lane T): fixed keys in the existing settings family.
  Object.freeze({ agentLaneId: 'settings.theme', anchorTemplate: 'settings/{key}', anchorExample: 'settings/theme', role: 'combobox', lane: 'T', component: 'SettingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'settings.providers', anchorTemplate: 'settings/{key}', anchorExample: 'settings/providers', role: 'group', lane: 'T', component: 'SettingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'settings.record-destination', anchorTemplate: 'settings/{key}', anchorExample: 'settings/record-destination', role: 'textbox', lane: 'T', component: 'SettingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'settings.limits', anchorTemplate: 'settings/{key}', anchorExample: 'settings/limits', role: 'spinbutton', lane: 'T', component: 'SettingsPanel', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the mv2 agent_lane surface.
 * @type {readonly string[]}
 */
export const MV_AGENT_LANE_IDS = Object.freeze(MV_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `MV_AGENT_LANE_IDS`.
 * @param {{ id?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function mvAnchorFor(agentLaneId, params = {}) {
  const row = MV_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown mv agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? MV_FIXTURE_IDS.capsuleId;
  return row.anchorExample.split(MV_FIXTURE_IDS.capsuleId).join(id);
}
