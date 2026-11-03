/**
 * @file pl6 agent_lane registry rows + additive control families: the
 * multislot terminal host (`capsule/{id}/terminal`, rendered by
 * `AiTerminalPane`) had no declared kit family, so the gallery lane
 * skipped it on every frame (`known kit gap: family undeclared`). This
 * module declares the additive row-5 family and its registry row; the
 * conductor merges `PL6_FAMILY_RULES` into
 * `src/agent/controlRegistry.js` (`FAMILY_RULES` plus the row-5 inventory
 * templates) when wiring the room, and the gallery drops its known-gap
 * entry then. Data only: no component imports, no product names, no
 * backend verbs. Plain JavaScript ES module with JSDoc types.
 */

/**
 * @typedef {Object} Pl6FamilyRule
 * @property {number} rowIndex - 1-based row index from architecture contract §9 matrix.
 * @property {string} template - Canonical family template label.
 * @property {RegExp} pattern - Pattern matching concrete semantic anchors.
 * @property {readonly string[]} allowedRoles - Permitted ARIA/semantic roles for this control family.
 * @property {boolean} requiresReasonWhenDisabled - Whether disabled/unavailable state requires unavailableReason.
 * @property {boolean} forbidsZeroWhenUnknown - Whether unknown values must never be coerced to zero.
 */

/**
 * @typedef {Object} Pl6RegistryRow
 * @property {string} agentLaneId - Plan control id on the agent_lane/v1 surface.
 * @property {string} anchorTemplate - Kit semantic-anchor family template.
 * @property {string} anchorExample - Concrete example anchor built from fixture ids.
 * @property {string} role - Effective ARIA/semantic role for this control.
 * @property {'M'} lane - Room lane owning the carrying component.
 * @property {string} component - Carrying kit component name.
 * @property {'new'|'existing'} anchorStatus - Whether the anchor family is a new pl6 row.
 */

/**
 * Fixture ids used by `anchorExample` (neutral labels only).
 */
export const PL6_FIXTURE_IDS = Object.freeze({
  capsuleId: 'cap-01',
});

/**
 * Additive control families for this room, shaped exactly like the
 * central `FAMILY_RULES` entries so the conductor merge is mechanical.
 * The terminal host is a labelled section (region role) on the slot row.
 * @type {readonly Pl6FamilyRule[]}
 */
export const PL6_FAMILY_RULES = Object.freeze([
  Object.freeze({
    rowIndex: 5,
    template: 'capsule/{id}/terminal',
    pattern: /^capsule\/([A-Za-z0-9._-]+)\/terminal$/,
    allowedRoles: Object.freeze(['region']),
    requiresReasonWhenDisabled: false,
    forbidsZeroWhenUnknown: false,
  }),
]);

/**
 * pl6 control surface without a prior row: 1 row.
 * @type {readonly Pl6RegistryRow[]}
 */
export const PL6_REGISTRY_ROWS = Object.freeze([
  // Multislot attached-terminal host (lane M).
  Object.freeze({ agentLaneId: 'multislot.terminal', anchorTemplate: 'capsule/{id}/terminal', anchorExample: 'capsule/cap-01/terminal', role: 'region', lane: 'M', component: 'AiTerminalPane', anchorStatus: 'new' }),
]);

/**
 * Every plan control id on the pl6 agent_lane surface.
 * @type {readonly string[]}
 */
export const PL6_AGENT_LANE_IDS = Object.freeze(PL6_REGISTRY_ROWS.map((row) => row.agentLaneId));

/**
 * Builds a concrete semantic anchor for a plan control id.
 * @param {string} agentLaneId - Plan control id from `PL6_AGENT_LANE_IDS`.
 * @param {{ id?: string }} [params] - Entity tokens for the template.
 * @returns {string} Concrete semantic anchor.
 */
export function pl6AnchorFor(agentLaneId, params = {}) {
  const row = PL6_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
  if (!row) {
    throw new Error(`Unknown pl6 agent_lane id "${String(agentLaneId)}"`);
  }
  const id = params.id ?? PL6_FIXTURE_IDS.capsuleId;
  return row.anchorExample.split(PL6_FIXTURE_IDS.capsuleId).join(id);
}

/**
 * Matches a concrete semantic anchor against the additive pl6 families,
 * mirroring the central `matchControlFamily` semantics (empty input and
 * purely numeric entity tokens never match).
 * @param {string} semanticAnchor
 * @returns {Pl6FamilyRule | null}
 */
export function matchPl6ControlFamily(semanticAnchor) {
  if (typeof semanticAnchor !== 'string' || semanticAnchor.length === 0) {
    return null;
  }
  for (const rule of PL6_FAMILY_RULES) {
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
