/**
 * @file Capsule health board agent_lane registry rows: plan control ids mapped to kit
 * semantic anchors. Covers every control of room MV1 lane H (capsule state rows,
 * telemetry strips, alert items, acknowledgement buttons, alert filters). Rows marked
 * `existing` reuse a pre-existing family in `src/agent/controlRegistry.js`.
 * Data only: no imports, no product names, no backend verbs.
 * Plain JavaScript ES module with JSDoc types.
 */

/**
 * @typedef {Object} HealthRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'H'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new health row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const HEALTH_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
  alertId: 'alert-01',
});

/**
 * Full lane H control surface: 6 rows.
 * @type {readonly HealthRegistryRow[]}
 */
export const HEALTH_REGISTRY_ROWS = Object.freeze([
  Object.freeze({ agentLaneId: 'health.capsule.row', anchorTemplate: 'fleet/{id}/row', anchorExample: 'fleet/cap-01/row', role: 'row', lane: 'H', component: 'HealthCapsuleRow', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'health.telemetry.strip', anchorTemplate: 'inspector/{id}/field', anchorExample: 'inspector/cap-01/field', role: 'group', lane: 'H', component: 'HealthTelemetryStrip', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'health.alert.item', anchorTemplate: 'alerts/{aid}', anchorExample: 'alerts/alert-01', role: 'alert', lane: 'H', component: 'HealthAlertList', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'health.alert.ack', anchorTemplate: 'inbox/{mid}/{read,ack}', anchorExample: 'inbox/alert-01/ack', role: 'button', lane: 'H', component: 'HealthAlertList', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'health.alerts.filter-severity', anchorTemplate: 'settings/{key}', anchorExample: 'settings/health-severity', role: 'combobox', lane: 'H', component: 'HealthAlertList', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'health.alerts.filter-unread', anchorTemplate: 'settings/{key}', anchorExample: 'settings/health-unread-only', role: 'checkbox', lane: 'H', component: 'HealthAlertList', anchorStatus: 'existing' }),
]);

/**
 * Every plan control id on the health agent_lane surface.
 * @type {readonly string[]}
 */
export const HEALTH_AGENT_LANE_IDS = Object.freeze(HEALTH_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `HEALTH_AGENT_LANE_IDS`.
 * @param {{ id?: string, aid?: string, mid?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function healthAnchorFor(agentLaneId, params = {}) {
  const row = HEALTH_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown health agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? HEALTH_FIXTURE_IDS.capsuleId;
  const aid = params.aid ?? params.mid ?? HEALTH_FIXTURE_IDS.alertId;
  return row.anchorExample
    .split(HEALTH_FIXTURE_IDS.capsuleId).join(id)
    .split(HEALTH_FIXTURE_IDS.alertId).join(aid);
}
