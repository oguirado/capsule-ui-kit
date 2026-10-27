/**
 * @file AI multislot agent_lane registry rows: plan control ids mapped to kit semantic anchors.
 * Covers every control of lanes L1 (shell, panes, splitter), L2 (control bar, input-mode
 * chip, identity plate) and L3 (record cluster). Rows marked `new` need the additive
 * families in `src/agent/controlRegistry.js`; rows marked `existing` reuse a pre-existing
 * family. Data only: no component imports, no product names, no backend verbs.
 * Plain JavaScript ES module with JSDoc types.
 *
 * Operator overrides applied: slot buttons are operator tools; the former control-lease
 * verbs are replaced by the operator input-mode toggle (`multislot.input-mode`, states
 * `read|write`, default `read`), and WRITE-mode operator input is journaled by the host
 * from the `multislot.operator-guidance` event row. There are no take/cede, activity or
 * pause controls on this surface.
 */

/**
 * @typedef {Object} MultislotRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'L1'|'L2'|'L3'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new multislot row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const MULTISLOT_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
  sessionId: 'sess-01',
});

/**
 * Lane L1-L3 control surface, including independently rendered header families.
 * @type {readonly MultislotRegistryRow[]}
 */
export const MULTISLOT_REGISTRY_ROWS = Object.freeze([
  // Lane L3 — record-for-AI / record-to-disk / screenshot cluster.
  Object.freeze({ agentLaneId: 'multislot.record.ai', anchorTemplate: 'capsule/{id}/record-ai', anchorExample: 'capsule/cap-01/record-ai', role: 'button', lane: 'L3', component: 'AiRecordCluster', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'multislot.record.disk', anchorTemplate: 'capsule/{id}/record-disk', anchorExample: 'capsule/cap-01/record-disk', role: 'button', lane: 'L3', component: 'AiRecordCluster', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'multislot.screenshot', anchorTemplate: 'capsule/{id}/screenshot', anchorExample: 'capsule/cap-01/screenshot', role: 'button', lane: 'L3', component: 'AiRecordCluster', anchorStatus: 'new' }),
  // Lane L2 — control bar, input-mode chip, identity plate.
  Object.freeze({ agentLaneId: 'multislot.copy-id', anchorTemplate: 'capsule/{id}/copy-id', anchorExample: 'capsule/cap-01/copy-id', role: 'button', lane: 'L2', component: 'AiIdentityPlate', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'multislot.hide-surface', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/hide-surface', role: 'button', lane: 'L2', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.hide-terminal', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/hide-terminal', role: 'button', lane: 'L2', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.input-mode', anchorTemplate: 'capsule/{id}/input-mode', anchorExample: 'capsule/cap-01/input-mode', role: 'switch', lane: 'L2', component: 'AiInputModeChip', anchorStatus: 'new' }),
  // Lane L1 — slot shell, panes, splitter.
  Object.freeze({ agentLaneId: 'multislot.fold', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/fold', role: 'button', lane: 'L1', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.float', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/float', role: 'button', lane: 'L1', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.dock-back', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/dock-back', role: 'button', lane: 'L1', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.close', anchorTemplate: 'capsule/{id}/multislot/{fold,float,dock-back,close,hide-surface,hide-terminal,control}', anchorExample: 'capsule/cap-01/multislot/close', role: 'button', lane: 'L1', component: 'AiSlotControlBar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'multislot.splitter', anchorTemplate: 'capsule/{id}/splitter', anchorExample: 'capsule/cap-01/splitter', role: 'separator', lane: 'L1', component: 'AiSlotSplitter', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'multislot.slot', anchorTemplate: 'capsule/{id}/slot', anchorExample: 'capsule/cap-01/slot', role: 'region', lane: 'L1', component: 'AiMultiSlot', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'ai-slot.fold', anchorTemplate: 'capsule/{id}/ai-slot/{fold,float,dock-back}', anchorExample: 'capsule/cap-01/ai-slot/fold', role: 'button', lane: 'L1', component: 'AiMultiSlot', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'ai-slot.float', anchorTemplate: 'capsule/{id}/ai-slot/{fold,float,dock-back}', anchorExample: 'capsule/cap-01/ai-slot/float', role: 'button', lane: 'L1', component: 'AiMultiSlot', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'ai-slot.dock-back', anchorTemplate: 'capsule/{id}/ai-slot/{fold,float,dock-back}', anchorExample: 'capsule/cap-01/ai-slot/dock-back', role: 'button', lane: 'L1', component: 'AiMultiSlot', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'ai-terminal.hide-terminal', anchorTemplate: 'capsule/{id}/ai-terminal/{hide-terminal}', anchorExample: 'capsule/cap-01/ai-terminal/hide-terminal', role: 'button', lane: 'L1', component: 'AiTerminalPane', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'session-slot.fold', anchorTemplate: 'capsule/{id}/session-slot/fold', anchorExample: 'capsule/cap-01/session-slot/fold', role: 'button', lane: 'L1', component: 'MultiSlot', anchorStatus: 'existing' }),
  // Lane L1 — host event (not a button): operator input while input mode is `write`.
  Object.freeze({ agentLaneId: 'multislot.operator-guidance', anchorTemplate: 'capsule/{id}/operator-guidance', anchorExample: 'capsule/cap-01/operator-guidance', role: 'status', lane: 'L1', component: 'AiMultiSlot', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the multislot agent_lane surface.
 * @type {readonly string[]}
 */
export const MULTISLOT_AGENT_LANE_IDS = Object.freeze(MULTISLOT_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `MULTISLOT_AGENT_LANE_IDS`.
 * @param {{ id?: string, sid?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function multislotAnchorFor(agentLaneId, params = {}) {
  const row = MULTISLOT_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown multislot agent_lane id "${String(agentLaneId)}"`);
  }
  let anchor = row.anchorExample;
  const id = params.id ?? MULTISLOT_FIXTURE_IDS.capsuleId;
  const sid = params.sid ?? MULTISLOT_FIXTURE_IDS.sessionId;
  anchor = anchor.split(MULTISLOT_FIXTURE_IDS.capsuleId).join(id);
  anchor = anchor.split(MULTISLOT_FIXTURE_IDS.sessionId).join(sid);
  return anchor;
}
