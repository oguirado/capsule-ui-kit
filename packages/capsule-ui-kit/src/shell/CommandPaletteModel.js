/**
 * Pure index helpers for the generic shell command palette. No DOM, no
 * framework: the component owns focus and visibility, the host owns entries.
 * @module shell/CommandPaletteModel
 */

/**
 * @typedef {object} PaletteItem
 * @property {string} id Stable entry id.
 * @property {string} label Visible label.
 * @property {string} [description] Secondary line under the label.
 * @property {string} [hint] Shortcut or meta text shown at the row end.
 * @property {string} [group] Group label; empty means the default group.
 * @property {string} [kind] Entry kind (`jump` or `command`).
 * @property {string[]} [keywords] Extra match terms never shown.
 */

/**
 * @typedef {object} PaletteGroup
 * @property {string} group Group label, empty for the default group.
 * @property {PaletteItem[]} items Entries in first-seen order.
 */

/**
 * Case-insensitive substring filter over label, description, group and
 * keywords. An empty query returns every item in order.
 * @param {PaletteItem[]} items Candidate entries.
 * @param {string} query Raw user input.
 * @returns {PaletteItem[]} Matching entries.
 */
export function filterPaletteItems(items, query) {
  const needle = String(query ?? '').trim().toLowerCase();
  if (needle === '') return [...items];
  return items.filter((item) => {
    const haystack = [item.label, item.description ?? '', item.group ?? '', ...(item.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

/**
 * Stable grouping that preserves first-seen group order.
 * @param {PaletteItem[]} items Entries to group.
 * @returns {PaletteGroup[]} Groups in first-seen order.
 */
export function groupPaletteItems(items) {
  /** @type {Map<string, PaletteGroup>} */
  const byGroup = new Map();
  for (const item of items) {
    const group = item.group ?? '';
    let target = byGroup.get(group);
    if (!target) {
      target = { group, items: [] };
      byGroup.set(group, target);
    }
    target.items.push(item);
  }
  return [...byGroup.values()];
}

/**
 * Flatten groups back into row order for keyboard navigation.
 * @param {PaletteGroup[]} groups Grouped entries.
 * @returns {PaletteItem[]} Entries in row order.
 */
export function flattenPaletteGroups(groups) {
  return groups.flatMap((group) => group.items);
}

/**
 * Move the active row with wraparound. Returns -1 when there is no row.
 * @param {number} count Row count.
 * @param {number} active Current index, -1 for none.
 * @param {number} delta Step, usually +1 or -1.
 * @returns {number} Next index.
 */
export function movePaletteIndex(count, active, delta) {
  if (count <= 0) return -1;
  const base = active < 0 ? (delta > 0 ? -1 : 0) : active;
  return (((base + delta) % count) + count) % count;
}

/**
 * Cycle the group filter for the Tab shortcut. Returns the next group
 * label, or null to clear the filter after the last group.
 * @param {string[]} groups Group labels in row order.
 * @param {string|null} current Active filter, null for none.
 * @returns {string|null} Next filter.
 */
export function cyclePaletteGroup(groups, current) {
  if (groups.length === 0) return null;
  if (current === null) return groups[0] ?? null;
  const at = groups.indexOf(current);
  if (at < 0) return groups[0] ?? null;
  return at + 1 < groups.length ? (groups[at + 1] ?? null) : null;
}
