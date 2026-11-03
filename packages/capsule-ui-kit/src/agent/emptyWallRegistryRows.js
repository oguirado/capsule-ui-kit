/**
 * @file ew1 agent_lane registry rows + additive control families: the generic
 * empty-workspace wall (`shell/empty-wall`, carried by `EmptyWall`) had no
 * declared kit family. This module declares the additive row-1 families and
 * their registry rows; the conductor merges `EMPTY_WALL_FAMILY_RULES` into
 * `src/agent/controlRegistry.js` (`FAMILY_RULES` plus the row-1 inventory
 * templates) when wiring the room. Data only: no component imports, no
 * product names, no backend verbs. Plain JavaScript ES module with JSDoc
 * types.
 */

/**
 * @typedef {Object} EmptyWallFamilyRule
 * @property {number} rowIndex - 1-based row index from architecture contract §9 matrix.
 * @property {string} template - Canonical family template label.
 * @property {RegExp} pattern - Pattern matching concrete semantic anchors.
 * @property {readonly string[]} allowedRoles - Permitted ARIA/semantic roles for this control family.
 * @property {boolean} requiresReasonWhenDisabled - Whether disabled/unavailable state requires unavailableReason.
 * @property {boolean} forbidsZeroWhenUnknown - Whether unknown values must never be coerced to zero.
 */

/**
 * @typedef {Object} EmptyWallRegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'E'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new ew1 row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only). Empty-wall
 * anchors are fully static, so no entity tokens are needed; the map stays
 * for the shared rows-file shape.
 */
export const EMPTY_WALL_FIXTURE_IDS = Object.freeze({});

/**
 * Additive control families for this room, shaped exactly like the central
 * `FAMILY_RULES` entries so the conductor merge is mechanical. The wall
 * root is a labelled section (region role); its two actions are buttons on
 * one family. Row 1 is the shell-chrome row (`shell/fullscreen`,
 * `shell/navigation/{id}`).
 * @type {readonly EmptyWallFamilyRule[]}
 */
export const EMPTY_WALL_FAMILY_RULES = Object.freeze([
  Object.freeze({
    rowIndex: 1,
    template: 'shell/empty-wall',
    pattern: /^shell\/empty-wall$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
  Object.freeze({
    rowIndex: 1,
    template: 'shell/empty-wall/{primary,secondary}',
    pattern: /^shell\/empty-wall\/(primary|secondary)$/,
    allowedRoles: Object.freeze(['button']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
]);

/**
 * ew1 control surface: 3 rows.
 * @type {readonly EmptyWallRegistryRow[]}
 */
export const EMPTY_WALL_REGISTRY_ROWS = Object.freeze([
  // Empty-workspace wall root (lane E).
  Object.freeze({ agentLaneId: 'wall.empty.region', anchorTemplate: 'shell/empty-wall', anchorExample: 'shell/empty-wall', role: 'region', lane: 'E', component: 'EmptyWall', anchorStatus: 'new' }),
  // Primary action: the host opens its launcher via the `primary` event (lane E).
  Object.freeze({ agentLaneId: 'wall.empty.primary', anchorTemplate: 'shell/empty-wall/{primary,secondary}', anchorExample: 'shell/empty-wall/primary', role: 'button', lane: 'E', component: 'EmptyWall', anchorStatus: 'new' }),
  // Optional secondary action (lane E).
  Object.freeze({ agentLaneId: 'wall.empty.secondary', anchorTemplate: 'shell/empty-wall/{primary,secondary}', anchorExample: 'shell/empty-wall/secondary', role: 'button', lane: 'E', component: 'EmptyWall', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the ew1 agent_lane surface.
 * @type {readonly string[]}
 */
export const EMPTY_WALL_AGENT_LANE_IDS = Object.freeze(EMPTY_WALL_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds the concrete semantic anchor for a plan control id. Empty-wall
 * anchors carry no entity tokens, so the row example is the anchor.
 * @param {string} agentLaneId - Plan control id from `EMPTY_WALL_AGENT_LANE_IDS`.
 * @returns {string} Concrete semantic anchor.
 */
export function emptyWallAnchorFor(agentLaneId) {
  const row = EMPTY_WALL_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown empty-wall agent_lane id "${String(agentLaneId)}"`);
  }
  return row.anchorExample;
}

/**
 * Matches a concrete semantic anchor against the additive empty-wall
 * families, mirroring the central `matchControlFamily` semantics (empty
 * input and purely numeric entity tokens never match).
 * @param {string} semanticAnchor
 * @returns {EmptyWallFamilyRule | null}
 */
export function matchEmptyWallControlFamily(semanticAnchor) {
  if (typeof semanticAnchor !== 'string' || semanticAnchor.length === 0) {
    return null;
  }
  for (const rule of EMPTY_WALL_FAMILY_RULES) {
    const match = rule.pattern.exec(semanticAnchor);
    if (match) {
      for (let i = 1; i < match.length; i += 1) {
        if (/^\d+$/.test(match[i] ?? '')) {
          return null;
        }
      }
      return rule;
    }
  }
  return null;
}
