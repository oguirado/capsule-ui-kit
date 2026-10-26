/**
 * @file Recordings agent_lane registry rows: plan control ids mapped to kit
 * semantic anchors. Covers every control of lane R (recordings control bar
 * and recordings panel). Rows marked `new` need the additive families in
 * `src/agent/controlRegistry.js`; the conductor adds them when wiring the
 * top-level export. Data only: no component imports, no product names, no
 * backend verbs. Plain JavaScript ES module with JSDoc types.
 * @module recordings/recordingsRegistryRows
 */

/**
 * @typedef {Object} RecordingsRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'R'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new recordings row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const RECORDINGS_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
  recordingId: 'rec-01',
});

/**
 * Full lane R control surface: 8 rows.
 * @type {readonly RecordingsRegistryRow[]}
 */
export const RECORDINGS_REGISTRY_ROWS = Object.freeze([
  // Recordings control bar — RAM record toggle, phase, store chip, screenshot.
  Object.freeze({ agentLaneId: 'rec.toggle', anchorTemplate: 'recording/{id}/toggle', anchorExample: 'recording/cap-01/toggle', role: 'button', lane: 'R', component: 'RecordingControlBar', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.phase', anchorTemplate: 'recording/{id}/phase', anchorExample: 'recording/cap-01/phase', role: 'status', lane: 'R', component: 'RecordingControlBar', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.store-chip', anchorTemplate: 'recording/{id}/store-chip', anchorExample: 'recording/cap-01/store-chip', role: 'status', lane: 'R', component: 'RecordingControlBar', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.screenshot', anchorTemplate: 'recording/{id}/screenshot', anchorExample: 'recording/cap-01/screenshot', role: 'button', lane: 'R', component: 'RecordingControlBar', anchorStatus: 'new' }),
  // Recordings panel — RAM manifest rows with select, export and export gate.
  Object.freeze({ agentLaneId: 'rec.manifest.row', anchorTemplate: 'recording/{rid}/row', anchorExample: 'recording/rec-01/row', role: 'row', lane: 'R', component: 'RecordingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.manifest.select', anchorTemplate: 'recording/{rid}/select', anchorExample: 'recording/rec-01/select', role: 'button', lane: 'R', component: 'RecordingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.export', anchorTemplate: 'recording/{rid}/export', anchorExample: 'recording/rec-01/export', role: 'button', lane: 'R', component: 'RecordingsPanel', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'rec.export.gate', anchorTemplate: 'recording/{rid}/export-gate', anchorExample: 'recording/rec-01/export-gate', role: 'status', lane: 'R', component: 'RecordingsPanel', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the recordings agent_lane surface.
 * @type {readonly string[]}
 */
export const RECORDINGS_AGENT_LANE_IDS = Object.freeze(
  RECORDINGS_REGISTRY_ROWS.map((row) => row.agentLaneId),
);

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `RECORDINGS_AGENT_LANE_IDS`.
 * @param {{ id?: string, rid?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function recordingsAnchorFor(agentLaneId, params = {}) {
  const row = RECORDINGS_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown recordings agent_lane id "${String(agentLaneId)}"`);
  }
  let anchor = row.anchorExample;
  const id = params.id ?? RECORDINGS_FIXTURE_IDS.capsuleId;
  const rid = params.rid ?? RECORDINGS_FIXTURE_IDS.recordingId;
  anchor = anchor.split(RECORDINGS_FIXTURE_IDS.capsuleId).join(id);
  anchor = anchor.split(RECORDINGS_FIXTURE_IDS.recordingId).join(rid);
  return anchor;
}
