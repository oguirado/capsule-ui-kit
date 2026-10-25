/**
 * Pure catalog helpers for the generic New Capsule launcher dialog. No DOM,
 * no framework: the component owns focus and visibility, the host owns the
 * catalog entries (ids, labels, descriptions, footprints).
 * @module shell/NewCapsuleModel
 */

/**
 * @typedef {'tab'|'split'|'floating'} NewCapsulePlacement Placement mode the
 * host opens the chosen capsule with.
 */

/**
 * @typedef {object} NewCapsuleType
 * @property {string} id Stable type id (host-defined, URL-safe slug).
 * @property {string} label Visible type name.
 * @property {string} category Category label; empty means uncategorised.
 * @property {string} description One-line summary shown on the card.
 * @property {NewCapsulePlacement} opensAs Suggested placement for this type.
 * @property {string} footprint Display footprint (host estimate, e.g. "~8 MB heap").
 * @property {string} [icon] Glyph name rendered through the `type-icon` slot.
 * @property {string[]} [keywords] Extra match terms never shown.
 */

/**
 * @typedef {object} NewCapsuleCategory
 * @property {string} id Slug derived from the label for stable control ids.
 * @property {string} label Category label as supplied by the host.
 * @property {number} count Types in this category.
 */

/**
 * Placement modes in segmented-control order.
 * @type {readonly NewCapsulePlacement[]}
 */
export const NEWCAPSULE_PLACEMENTS = Object.freeze(
  /** @type {NewCapsulePlacement[]} */ (['tab', 'split', 'floating']),
);

/**
 * Card grid column count shared by the dialog and keyboard navigation.
 * @type {number}
 */
export const NEWCAPSULE_GRID_COLUMNS = 2;

/**
 * Resolve a placement preference to a supported mode.
 * @param {unknown} preferred Raw preference from catalog or UI.
 * @param {NewCapsulePlacement} [fallback] Fallback when unsupported.
 * @returns {NewCapsulePlacement} Supported placement mode.
 */
export function resolveCapsulePlacement(preferred, fallback = 'tab') {
  if (preferred === 'tab' || preferred === 'split' || preferred === 'floating') return preferred;
  if (fallback === 'tab' || fallback === 'split' || fallback === 'floating') return fallback;
  return 'tab';
}

/**
 * Slugify a category label for stable ids and semantic anchors.
 * @param {unknown} label Raw category label.
 * @returns {string} Lowercase slug; 'uncategorised' when empty.
 */
export function capsuleCategoryId(label) {
  const slug = String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'uncategorised' : slug;
}

/**
 * Normalize one host catalog entry. Returns null when the entry has no
 * usable id or label.
 * @param {unknown} entry Raw host entry.
 * @returns {NewCapsuleType|null} Normalized type or null.
 */
export function normalizeCapsuleType(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const candidate = /** @type {Partial<NewCapsuleType>} */ (entry);
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
  if (id === '' || label === '') return null;
  const keywords = Array.isArray(candidate.keywords)
    ? candidate.keywords.filter((term) => typeof term === 'string' && term !== '')
    : [];
  /** @type {NewCapsuleType} */
  const normalized = {
    id,
    label,
    category: typeof candidate.category === 'string' ? candidate.category.trim() : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    opensAs: resolveCapsulePlacement(candidate.opensAs),
    footprint: typeof candidate.footprint === 'string' ? candidate.footprint : '',
    keywords,
  };
  if (typeof candidate.icon === 'string' && candidate.icon.trim() !== '') {
    normalized.icon = candidate.icon.trim();
  }
  return normalized;
}

/**
 * Normalize a host catalog, dropping invalid entries.
 * @param {unknown} entries Raw host catalog.
 * @returns {NewCapsuleType[]} Normalized types in host order.
 */
export function normalizeCapsuleCatalog(entries) {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (const entry of entries) {
    const type = normalizeCapsuleType(entry);
    if (type) out.push(type);
  }
  return out;
}

/**
 * Case-insensitive substring filter over id, label, description, category
 * and keywords. An empty query returns every type in order.
 * @param {NewCapsuleType[]} types Candidate types.
 * @param {string} query Raw user input.
 * @returns {NewCapsuleType[]} Matching types.
 */
export function filterCapsuleTypes(types, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle === '') return [...types];
  return types.filter((type) => {
    const haystack = [type.id, type.label, type.description, type.category, ...(type.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Category rail model with per-category counts in first-seen order.
 * @param {NewCapsuleType[]} types Normalized catalog.
 * @returns {NewCapsuleCategory[]} Categories with counts.
 */
export function capsuleCategories(types) {
  /** @type {Map<string, NewCapsuleCategory>} */
  const byId = new Map();
  for (const type of types) {
    const id = capsuleCategoryId(type.category);
    let target = byId.get(id);
    if (!target) {
      target = { id, label: type.category === '' ? 'Uncategorised' : type.category, count: 0 };
      byId.set(id, target);
    }
    target.count += 1;
  }
  return [...byId.values()];
}

/**
 * Restrict types to one category. Null, undefined or '' returns all types.
 * @param {NewCapsuleType[]} types Candidate types.
 * @param {string|null|undefined} categoryId Category slug or null for all.
 * @returns {NewCapsuleType[]} Types in that category.
 */
export function filterCapsuleTypesByCategory(types, categoryId) {
  if (categoryId === null || categoryId === undefined || categoryId === '') return [...types];
  return types.filter((type) => capsuleCategoryId(type.category) === categoryId);
}

/**
 * Move the active card in a grid with wraparound. Returns -1 when there is
 * no card. Unknown keys return the active index unchanged.
 * @param {number} count Card count.
 * @param {number} active Current index, -1 for none.
 * @param {string} key KeyboardEvent key.
 * @param {number} [columns] Grid columns, at least 1.
 * @returns {number} Next index.
 */
export function moveCapsuleCardIndex(count, active, key, columns = NEWCAPSULE_GRID_COLUMNS) {
  if (count <= 0) return -1;
  const cols = Number.isSafeInteger(columns) && columns > 0 ? columns : 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  /** @type {number|null} */
  let delta = null;
  if (key === 'ArrowRight' || key === 'ArrowDown') delta = key === 'ArrowRight' ? 1 : cols;
  if (key === 'ArrowLeft' || key === 'ArrowUp') delta = key === 'ArrowLeft' ? -1 : -cols;
  if (delta === null) return active >= 0 && active < count ? active : -1;
  if (active < 0 || active >= count) return delta > 0 ? 0 : count - 1;
  return (((active + delta) % count) + count) % count;
}
