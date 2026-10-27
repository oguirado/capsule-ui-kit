/**
 * @file SaaS agent_lane registry rows: plan control ids mapped to kit semantic anchors.
 * Covers every new control of lanes B (wall), C (detail) and D (dispatch) plus the
 * shell slots of lane E. Rows marked `new` need the additive families in
 * `src/agent/controlRegistry.js`; rows marked `existing` reuse a pre-existing family.
 * Data only: no component imports, no product names, no backend verbs.
 * Plain JavaScript ES module with JSDoc types.
 */

/**
 * @typedef {Object} SaasRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'B'|'C'|'D'|'E'|'T'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new SaaS row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const SAAS_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
  sessionId: 'sess-01',
  dispatchId: 'disp-01',
});

/**
 * Full lane B-D (+E shell) control surface: 34 rows.
 * @type {readonly SaasRegistryRow[]}
 */
export const SAAS_REGISTRY_ROWS = Object.freeze([
  // Lane B — wall tile, folded rail, veil and record states (SAAS-1).
  Object.freeze({ agentLaneId: 'wall.nav.wall', anchorTemplate: 'shell/navigation/{id}', anchorExample: 'shell/navigation/wall', role: 'button', lane: 'E', component: 'Sidebar', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.fold', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/fold', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.pin', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/pin', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.take-control', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/control', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.record', anchorTemplate: 'capsule/{id}/{record,destroy}', anchorExample: 'capsule/cap-01/record', role: 'button', lane: 'B', component: 'SaasRecordButton', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'wall.capsule.hide-panel', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/hide', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.destroy', anchorTemplate: 'capsule/{id}/{record,destroy}', anchorExample: 'capsule/cap-01/destroy', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'wall.capsule.float', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/float', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.popout-disabled', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/popout', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.terminal-toggle', anchorTemplate: 'session/{sid}/{attach,stop,replay,target}', anchorExample: 'session/sess-01/target', role: 'button', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.session-tab', anchorTemplate: 'capsule/{id}/session/{sid}/tab', anchorExample: 'capsule/cap-01/session/sess-01/tab', role: 'tab', lane: 'B', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.capsule.surface-toggle', anchorTemplate: 'capsule/{id}/slot', anchorExample: 'capsule/cap-01/slot', role: 'region', lane: 'B', component: 'SaasSurfaceView', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.status.layout-save', anchorTemplate: 'shell/layout-save', anchorExample: 'shell/layout-save', role: 'button', lane: 'E', component: 'StatusBar', anchorStatus: 'new' }),
  // Lane C — capsule detail split (SAAS-2).
  Object.freeze({ agentLaneId: 'detail.surface.scaled-badge', anchorTemplate: 'detail/{id}/scaled-badge', anchorExample: 'detail/cap-01/scaled-badge', role: 'status', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'detail.geometry.stepper-w', anchorTemplate: 'detail/{id}/stepper-{w,h}', anchorExample: 'detail/cap-01/stepper-w', role: 'spinbutton', lane: 'C', component: 'SaasGeometryBar', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'detail.geometry.stepper-h', anchorTemplate: 'detail/{id}/stepper-{w,h}', anchorExample: 'detail/cap-01/stepper-h', role: 'spinbutton', lane: 'C', component: 'SaasGeometryBar', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'detail.session.tab', anchorTemplate: 'capsule/{id}/session/{sid}/tab', anchorExample: 'capsule/cap-01/session/sess-01/tab', role: 'tab', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.session.attach', anchorTemplate: 'session/{sid}/{attach,stop,replay,target}', anchorExample: 'session/sess-01/attach', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.session.replay', anchorTemplate: 'session/{sid}/{attach,stop,replay,target}', anchorExample: 'session/sess-01/replay', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.slot.fold', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/fold', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.slot.hide-surface', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/hide', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.slot.hide-terminal', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/hide', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.separator.handle', anchorTemplate: 'workspace/separator/{id}', anchorExample: 'workspace/separator/detail-main', role: 'separator', lane: 'C', component: 'SaasSplitter', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'detail.console.pty-toggle', anchorTemplate: 'detail/{id}/pty-toggle', anchorExample: 'detail/cap-01/pty-toggle', role: 'switch', lane: 'C', component: 'SaasShellToggle', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'detail.panel.popout-disabled', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/popout', role: 'button', lane: 'C', component: 'SaasDetailLayout', anchorStatus: 'existing' }),
  // Lane D — dispatch skin (SAAS-4).
  Object.freeze({ agentLaneId: 'dispatch.drawer.toggle', anchorTemplate: 'drawer/{toggle,maximize,composer,send}', anchorExample: 'drawer/toggle', role: 'button', lane: 'D', component: 'SaasDispatchSkin', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.drawer.maximize', anchorTemplate: 'drawer/{toggle,maximize,composer,send}', anchorExample: 'drawer/maximize', role: 'button', lane: 'D', component: 'SaasDispatchSkin', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.target.checkbox', anchorTemplate: 'drawer/targets/{sid,all,clear}', anchorExample: 'drawer/targets/sess-01', role: 'checkbox', lane: 'D', component: 'SaasTargetRow', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.target.select-all', anchorTemplate: 'drawer/targets/{sid,all,clear}', anchorExample: 'drawer/targets/all', role: 'button', lane: 'D', component: 'SaasTargetRow', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.composer.send', anchorTemplate: 'drawer/{toggle,maximize,composer,send}', anchorExample: 'drawer/send', role: 'button', lane: 'D', component: 'SaasDispatchSkin', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.review.confirm', anchorTemplate: 'dispatch/{did}/review-confirm', anchorExample: 'dispatch/disp-01/review-confirm', role: 'button', lane: 'D', component: 'SaasFrozenReview', anchorStatus: 'new' }),
  Object.freeze({ agentLaneId: 'dispatch.result.retry', anchorTemplate: 'dispatch/{did}/target/{sid}/{result,retry,cancel}', anchorExample: 'dispatch/disp-01/target/sess-01/retry', role: 'button', lane: 'D', component: 'SaasResultRows', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.result.cancel', anchorTemplate: 'dispatch/{did}/target/{sid}/{result,retry,cancel}', anchorExample: 'dispatch/disp-01/target/sess-01/cancel', role: 'button', lane: 'D', component: 'SaasResultRows', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'dispatch.results.accessible-text', anchorTemplate: 'output/{sid}/text', anchorExample: 'output/sess-01/text', role: 'region', lane: 'D', component: 'SaasAccessibleBox', anchorStatus: 'existing' }),
]);

/**
 * Every plan control id on the SaaS agent_lane surface.
 * @type {readonly string[]}
 */
export const SAAS_AGENT_LANE_IDS = Object.freeze(SAAS_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `SAAS_AGENT_LANE_IDS`.
 * @param {{ id?: string, sid?: string, did?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function saasAnchorFor(agentLaneId, params = {}) {
  const row = SAAS_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown SaaS agent_lane id "${String(agentLaneId)}"`);
  }
  let anchor = row.anchorExample;
  const id = params.id ?? SAAS_FIXTURE_IDS.capsuleId;
  const sid = params.sid ?? SAAS_FIXTURE_IDS.sessionId;
  const did = params.did ?? SAAS_FIXTURE_IDS.dispatchId;
  anchor = anchor.split(SAAS_FIXTURE_IDS.capsuleId).join(id);
  anchor = anchor.split(SAAS_FIXTURE_IDS.sessionId).join(sid);
  anchor = anchor.split(SAAS_FIXTURE_IDS.dispatchId).join(did);
  return anchor;
}

/**
 * kw1 lane T additive rows: the wall-tile take_control / release_control
 * pair for the tile-state surface. Kept separate from `SAAS_REGISTRY_ROWS`
 * (whose 34-row shape stays pinned); both anchors reuse pre-existing
 * control families that require an unavailable reason when disabled.
 * Data only: no component imports, no product names, no backend verbs.
 * @type {readonly SaasRegistryRow[]}
 */
export const KW1_TILE_STATE_ROWS = Object.freeze([
  Object.freeze({ agentLaneId: 'wall.tile.take-control', anchorTemplate: 'capsule/{id}/{fold,pin,control,close,popout,dock-back,float,maximize,hide,show}', anchorExample: 'capsule/cap-01/control', role: 'button', lane: 'T', component: 'SaasWallTile', anchorStatus: 'existing' }),
  Object.freeze({ agentLaneId: 'wall.tile.release-control', anchorTemplate: 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}', anchorExample: 'capsule/cap-01/release-control', role: 'button', lane: 'T', component: 'SaasWallTile', anchorStatus: 'existing' }),
]);

/**
 * Every plan control id on the kw1 tile-state agent_lane surface.
 * @type {readonly string[]}
 */
export const KW1_TILE_AGENT_LANE_IDS = Object.freeze(KW1_TILE_STATE_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a kw1 tile-state plan control id.
 * @param {string} agentLaneId - Plan control id from `KW1_TILE_AGENT_LANE_IDS`.
 * @param {{ id?: string }} [params] - Entity token for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function kw1TileAnchorFor(agentLaneId, params = {}) {
  const row = KW1_TILE_STATE_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown kw1 tile agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? SAAS_FIXTURE_IDS.capsuleId;
  return row.anchorExample.split(SAAS_FIXTURE_IDS.capsuleId).join(id);
}
