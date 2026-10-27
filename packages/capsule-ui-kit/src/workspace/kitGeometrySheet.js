/**
 * @fileoverview Kit-owned dynamic geometry sheet: the strict-CSP way to apply
 * host-measured geometry (panel widths, float frames, pane sizes, dialog caps)
 * with no style attributes, no `:style` bindings, no `setAttribute('style')`
 * and no `element.style` writes anywhere in kit components.
 *
 * Rules live in a single kit-owned `<style>` element bearing the consumer's
 * per-response nonce. The nonce is read from the same
 * `meta[name$="-style-nonce"]` tag the theme installer (`design/aura.js`) and
 * the terminal document override (`terminal/nonceDocument.js`) use, so the
 * sheet stays inside the admitted style realm of the consuming product
 * (`style-src 'self'` + per-response nonce, no `unsafe-inline`).
 *
 * - Server-side rendering: every entry point accepts a nullable document and
 *   returns `false` without throwing when no document (or no `<head>`, or no
 *   nonce) is available. Components therefore keep calling the sheet from an
 *   immediate watcher: SSR output carries no geometry (static CSS fallbacks
 *   apply) and the client applies the rules on setup.
 * - Rule keys are namespaced per component instance
 *   (`'<component>:<instance>'`); components clear their keys on unmount and
 *   whenever the geometry collapses to empty (docked frames carry no rule).
 * - Selectors use validated element ids or geometry attribute keys so
 *   capsule- or session-derived ids cannot inject rules; declaration names and
 *   values are validated for the same reason.
 *
 * Plain JavaScript with JSDoc; zero imports; no product names.
 */

/** Marker attribute of the kit-owned geometry `<style>` element. @type {string} */
export const KIT_GEOMETRY_SHEET_ATTR = 'data-cuk-geometry';

/** Per-response nonce meta selector shared with the theme installer. @type {string} */
const NONCE_META_SELECTOR = 'meta[name$="-style-nonce"]';

/** Admitted element ids: kit DOM ids (`cuk-*`, `cui-*`, `shell/*`, ...). @type {RegExp} */
const ID_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/;

/** Admitted declaration names: camelCase, kebab-case or `--` custom props. @type {RegExp} */
const PROP_PATTERN = /^(--)?[a-zA-Z][a-zA-Z0-9-]*$/;

/**
 * Admitted declaration values: lengths, keywords, functions (`calc()`,
 * `var()`), colours. Never `;{}` quotes, backslashes or angle brackets, so a
 * value cannot escape its declaration. @type {RegExp}
 */
const VALUE_PATTERN = /^[A-Za-z0-9\s_#.,()%/+*-]{1,256}$/;

/** @type {WeakMap<object, Map<string, string>>} Rules recorded per document. */
const rulesByDocument = new WeakMap();

/**
 * Escapes one CSS identifier without touching `element.style`.
 * @param {string} value Raw identifier.
 * @returns {string} Escaped identifier.
 */
function escapeIdentifier(value) {
  const native = globalThis?.CSS?.escape;
  if (typeof native === 'function') return native(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

/**
 * Builds the validated selector for one element id.
 * @param {unknown} elementId Target element id.
 * @returns {string} `#`-prefixed escaped selector.
 */
export function geometrySelectorForId(elementId) {
  if (typeof elementId !== 'string' || !ID_PATTERN.test(elementId)) {
    throw new Error('kitGeometrySheet requires a kit-shaped element id');
  }
  return `#${escapeIdentifier(elementId)}`;
}

/**
 * Converts one declaration name to kebab-case.
 * @param {string} property Raw property name.
 * @returns {string} Kebab-case property name.
 */
function kebabProperty(property) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Renders one validated rule body. Pure and DOM-free for unit tests.
 * @param {string} selector Validated selector.
 * @param {Record<string, unknown>} declarations Property/value pairs.
 * @returns {string} `selector{prop:value;...}` with sorted properties, or `''`
 * when no usable declaration remains.
 */
export function geometryRuleText(selector, declarations) {
  if (typeof selector !== 'string' || selector.length === 0) {
    throw new Error('kitGeometrySheet requires a selector');
  }
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (const [property, raw] of Object.entries(declarations ?? {})) {
    if (raw === null || raw === undefined || raw === '') continue;
    if (typeof property !== 'string' || !PROP_PATTERN.test(property)) {
      throw new Error(`kitGeometrySheet rejects declaration name ${JSON.stringify(property)}`);
    }
    const value = String(raw);
    if (!VALUE_PATTERN.test(value)) {
      throw new Error(`kitGeometrySheet rejects declaration value for ${property}`);
    }
    pairs.push([kebabProperty(property), value]);
  }
  if (pairs.length === 0) return '';
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${selector}{${pairs.map(([name, value]) => `${name}:${value};`).join('')}}`;
}

/**
 * Finds or creates the kit-owned sheet element. Creation needs the consumer
 * nonce; without it the geometry upgrade is skipped (static CSS stands in).
 * @param {any} doc Host document or null.
 * @returns {any} The sheet element, or null when unavailable.
 */
function ensureSheet(doc) {
  const head = doc?.head ?? null;
  if (!head || typeof doc.querySelector !== 'function' || typeof doc.createElement !== 'function') return null;
  const nonce = doc.querySelector(NONCE_META_SELECTOR)?.getAttribute?.('content') ?? '';
  if (typeof nonce !== 'string' || nonce.length === 0) return null;
  const existing = head.querySelector(`style[${KIT_GEOMETRY_SHEET_ATTR}]`);
  if (existing) return existing.getAttribute('nonce') === nonce ? existing : null;
  const element = doc.createElement('style');
  element.setAttribute('nonce', nonce);
  element.setAttribute(KIT_GEOMETRY_SHEET_ATTR, '');
  head.appendChild(element);
  return element;
}

/**
 * Rewrites the sheet text from the recorded rules. Mutating `textContent` of
 * the already-nonce-bearing element stays inside the admitted style realm.
 * @param {any} doc Host document or null.
 * @returns {boolean} True when the sheet was rewritten.
 */
function syncSheet(doc) {
  const element = ensureSheet(doc);
  if (!element) return false;
  const rules = rulesByDocument.get(doc);
  element.textContent = rules ? [...rules.values()].join('') : '';
  return true;
}

/**
 * Records and applies one geometry rule. Empty declarations remove the rule
 * (docked/resting geometry leaves no trace in the sheet).
 * @param {any} doc Host document or null (SSR-safe no-op).
 * @param {string} key Namespaced rule key (`'<component>:<instance>'`).
 * @param {string} elementId Target element id.
 * @param {Record<string, unknown>} declarations Property/value pairs.
 * @param {boolean} [attribute=false] Target a geometry data attribute.
 * @returns {boolean} True when the rule reached the sheet.
 */
export function setKitGeometryRule(doc, key, elementId, declarations, attribute = false) {
  if (!doc || typeof key !== 'string' || key.length === 0) return false;
  const usable = Object.fromEntries(
    Object.entries(declarations ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== ''),
  );
  if (Object.keys(usable).length === 0) return clearKitGeometryRule(doc, key);
  geometrySelectorForId(elementId);
  const text = geometryRuleText(attribute ? `[data-cuk-geometry-id="${elementId}"]` : geometrySelectorForId(elementId), usable);
  let rules = rulesByDocument.get(doc);
  if (!rules) {
    rules = new Map();
    rulesByDocument.set(doc, rules);
  }
  const previous = rules.get(key);
  rules.set(key, text);
  if (!syncSheet(doc)) {
    if (previous === undefined) rules.delete(key);
    else rules.set(key, previous);
    return false;
  }
  return true;
}

/**
 * Removes one geometry rule and rewrites the sheet.
 * @param {any} doc Host document or null (SSR-safe no-op).
 * @param {string} key Namespaced rule key.
 * @returns {boolean} True when a recorded rule was removed.
 */
export function clearKitGeometryRule(doc, key) {
  if (!doc || typeof key !== 'string' || key.length === 0) return false;
  const rules = rulesByDocument.get(doc);
  if (!rules || !rules.has(key)) return false;
  rules.delete(key);
  syncSheet(doc);
  return true;
}
