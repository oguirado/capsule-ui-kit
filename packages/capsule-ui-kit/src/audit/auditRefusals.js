/**
 * @file Audit refusal reason codes: exact backend codes plus human text.
 * The kit renders the code itself next to the human text so the literal
 * backend reason stays visible; unknown codes render as unknown, never as
 * a default code. Generic presentation data only: no backend verbs, no
 * product names, no network or disk access.
 * Plain JavaScript ES module with JSDoc types.
 * @module audit/auditRefusals
 */

/**
 * Exact refusal codes in plan order. The strings are contractual: the kit
 * must render them verbatim.
 * @type {ReadonlyArray<string>}
 */
export const AUDIT_REFUSAL_CODES = Object.freeze([
  'STALE_FRAME',
  'SURFACE_NOT_AGENT_CONTROLLED',
  'LOCKED_BY_OTHER',
  'BUDGET_EXCEEDED',
  'OUT_OF_BOUNDS',
  'POLICY',
]);

/**
 * Human text per code. The code itself always stays visible next to it.
 * @type {Readonly<Record<string, string>>}
 */
export const AUDIT_REFUSAL_TEXT = Object.freeze({
  STALE_FRAME: 'Frame was stale; refused on an outdated view.',
  SURFACE_NOT_AGENT_CONTROLLED: 'Surface is not under agent control.',
  LOCKED_BY_OTHER: 'Locked by another holder.',
  BUDGET_EXCEEDED: 'Budget limit was exceeded.',
  OUT_OF_BOUNDS: 'Target is outside the allowed bounds.',
  POLICY: 'Refused by policy.',
});

/**
 * @param {unknown} code
 * @returns {boolean} True for one of the exact codes.
 */
export function isKnownRefusalCode(code) {
  return (
    typeof code === 'string' && AUDIT_REFUSAL_CODES.includes(code)
  );
}

/**
 * @param {unknown} code
 * @returns {string} The exact code, or '' when unknown.
 */
export function normalizeRefusalCode(code) {
  return isKnownRefusalCode(code) ? /** @type {string} */ (code) : '';
}

/**
 * @param {unknown} code
 * @returns {string} Human text for a known code, or '' when unknown.
 */
export function refusalText(code) {
  const normalized = normalizeRefusalCode(code);
  return normalized === '' ? '' : AUDIT_REFUSAL_TEXT[normalized];
}

/**
 * @param {unknown} code
 * @returns {{ code: string, text: string, tone: string }} Frozen chip
 *   descriptor; unknown codes keep an empty code with honest text.
 */
export function refusalChip(code) {
  const normalized = normalizeRefusalCode(code);
  if (normalized === '') {
    return Object.freeze({ code: '', text: 'Unknown reason', tone: 'neutral' });
  }
  return Object.freeze({ code: normalized, text: AUDIT_REFUSAL_TEXT[normalized], tone: 'error' });
}

/**
 * @param {unknown} code
 * @returns {string} Stable accessible name keeping the code visible.
 */
export function refusalAccessibleName(code) {
  const chip = refusalChip(code);
  if (chip.code === '') return 'Refusal reason unknown';
  return `${chip.code}: ${chip.text}`;
}
