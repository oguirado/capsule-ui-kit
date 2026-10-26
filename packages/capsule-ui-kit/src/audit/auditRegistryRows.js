/**
 * @file Audit agent_lane registry rows: plan control ids mapped to kit semantic anchors.
 * Covers every control of lane A (stream tabs, filter bar, timeline list,
 * record rows, receipt viewer). Rows marked `new` need the additive families
 * in `src/agent/controlRegistry.js`; the conductor adds the `audit/*`
 * families after the room closes. Data only: no component imports, no
 * product names, no backend verbs.
 * Plain JavaScript ES module with JSDoc types.
 * @module audit/auditRegistryRows
 */

/**
 * @typedef {Object} AuditRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'A'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new audit row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const AUDIT_FIXTURE_IDS = Object.freeze({
  streamId: 'session-records',
  recordId: 'rec-0001',
  capsuleId: 'cap-01',
});

/**
 * Full lane A control surface: 8 rows.
 * @type {readonly AuditRegistryRow[]}
 */
export const AUDIT_REGISTRY_ROWS = Object.freeze([
  // Stream tabs (SAAS-9 stream tabs).
  Object.freeze({ agentLaneId: 'audit.stream.tab', anchorTemplate: 'audit/stream/{stream}/tab', anchorExample: 'audit/stream/session-records/tab', role: 'tab', lane: 'A', component: 'AuditStreamTabs', anchorStatus: 'new' }),
  // Filter bar (SAAS-9 capsule and verdict filters plus clear).
  Object.freeze({ agentLaneId: 'audit.filter.capsule', anchorTemplate: 'audit/filter/capsule', anchorExample: 'audit/filter/capsule', role: 'searchbox', lane: 'A', component: 'AuditTimeline', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'audit.filter.verdict', anchorTemplate: 'audit/filter/verdict', anchorExample: 'audit/filter/verdict', role: 'combobox', lane: 'A', component: 'AuditTimeline', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'audit.filter.clear', anchorTemplate: 'audit/filter/clear', anchorExample: 'audit/filter/clear', role: 'button', lane: 'A', component: 'AuditTimeline', anchorStatus: 'new' }),
  // Timeline list and record rows (SAAS-9 timeline list).
  Object.freeze({ agentLaneId: 'audit.timeline.list', anchorTemplate: 'audit/timeline/list', anchorExample: 'audit/timeline/list', role: 'list', lane: 'A', component: 'AuditTimeline', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'audit.row.select', anchorTemplate: 'audit/record/{rid}/select', anchorExample: 'audit/record/rec-0001/select', role: 'button', lane: 'A', component: 'AuditRow', anchorStatus: 'new' }),
  // Receipt viewer (SAAS-9 receipt detail).
  Object.freeze({ agentLaneId: 'audit.receipt.counts', anchorTemplate: 'audit/receipt/{rid}/counts', anchorExample: 'audit/receipt/rec-0001/counts', role: 'region', lane: 'A', component: 'AuditReceipt', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'audit.receipt.gate', anchorTemplate: 'audit/receipt/{rid}/gate', anchorExample: 'audit/receipt/rec-0001/gate', role: 'status', lane: 'A', component: 'AuditReceipt', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the audit agent_lane surface.
 * @type {readonly string[]}
 */
export const AUDIT_AGENT_LANE_IDS = Object.freeze(AUDIT_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `AUDIT_AGENT_LANE_IDS`.
 * @param {{ stream?: string, rid?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function auditAnchorFor(agentLaneId, params = {}) {
  const row = AUDIT_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown audit agent_lane id "${String(agentLaneId)}"`);
  }
  let anchor = row.anchorExample;
  const stream = params.stream ?? AUDIT_FIXTURE_IDS.streamId;
  const rid = params.rid ?? AUDIT_FIXTURE_IDS.recordId;
  anchor = anchor.split(AUDIT_FIXTURE_IDS.streamId).join(stream);
  anchor = anchor.split(AUDIT_FIXTURE_IDS.recordId).join(rid);
  return anchor;
}
