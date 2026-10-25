/**
 * Pure geometry helpers for the generic S1 donut chart (DonutChart.vue).
 * Fixed export coordinate system: viewBox 120x120, ring radius 47 with a
 * normalized pathLength of 100 so every slice arc is an exact percentage
 * of the ring. No DOM, no Vue, no tokens: node-testable.
 * @module widgets/DonutGeometry
 */

/** Export plot size in viewBox units (square). @type {number} */
export const DONUT_SIZE = 120;
/** Ring center in viewBox units. @type {number} */
export const DONUT_CENTER = 60;
/** Ring radius in viewBox units. @type {number} */
export const DONUT_RADIUS = 47;
/** Gap between adjacent slices in pathLength units. @type {number} */
export const DONUT_GAP = 1.5;

/**
 * Slice tone cycle, resolved to semantic token strokes by DonutChart.vue.
 * @type {ReadonlyArray<string>}
 */
export const DONUT_TONES = Object.freeze([
  'primary',
  'tertiary',
  'success',
  'info',
  'warning',
  'error',
  'muted',
]);

/**
 * @typedef {object} DonutSlice
 * @property {number} value Chartable value (>= 0, else 0).
 * @property {number} fraction Share of the total, 0..1.
 * @property {number} pct Share of the total, 0..100, rounded to 1 decimal.
 * @property {string} dashArray SVG stroke-dasharray in pathLength units.
 * @property {number} dashOffset SVG stroke-dashoffset in pathLength units.
 */

/** @param {number} value @returns {number} Rounded to 2 decimals. */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve the stroke tone for one slice: the host tone when it names a
 * known tone, otherwise the palette entry for the slice index (wrapping).
 * @param {unknown} requested Host-supplied tone.
 * @param {number} index Slice index.
 * @returns {string} Valid tone.
 */
export function toneFor(requested, index) {
  if (typeof requested === 'string' && DONUT_TONES.includes(requested)) return requested;
  const slot = ((index % DONUT_TONES.length) + DONUT_TONES.length) % DONUT_TONES.length;
  const fallback = DONUT_TONES[slot];
  return fallback === undefined ? 'primary' : fallback;
}

/**
 * Scale one value series into ring arcs. Non-positive and non-finite
 * values keep their slot with a zero arc and split nothing: only positive
 * finite values advance the cursor. A single chartable value renders the
 * full ring; several slices are separated by DONUT_GAP.
 * @param {ReadonlyArray<number>} values Raw slice values.
 * @returns {Array<DonutSlice>} Arcs in input order.
 */
export function donutSlices(values) {
  const clean = values.map((value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
  ));
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return clean.map(() => ({
      value: 0, fraction: 0, pct: 0, dashArray: '0 100', dashOffset: 0,
    }));
  }
  const chartable = clean.filter((value) => value > 0).length;
  const gap = chartable > 1 ? DONUT_GAP : 0;
  let cursor = 0;
  return clean.map((value) => {
    if (value <= 0) {
      return { value: 0, fraction: 0, pct: 0, dashArray: '0 100', dashOffset: 0 };
    }
    const fraction = value / total;
    const arc = Math.max(0, fraction * 100 - gap);
    const offset = round2(-cursor);
    const slice = {
      value,
      fraction,
      pct: Math.round(fraction * 1000) / 10,
      dashArray: `${round2(arc)} 100`,
      dashOffset: offset === 0 ? 0 : offset,
    };
    cursor += fraction * 100;
    return slice;
  });
}

/**
 * @param {string} label Chart label.
 * @param {ReadonlyArray<number>} values Raw slice values.
 * @returns {string} One-line screen-reader summary of the ring.
 */
export function summarizeSlices(label, values) {
  const chartable = values.filter((value) => (
    typeof value === 'number' && Number.isFinite(value) && value > 0
  ));
  if (chartable.length < 1) return `${label}: no data`;
  const total = chartable.reduce((sum, value) => sum + value, 0);
  const unit = chartable.length === 1 ? 'slice' : 'slices';
  return `${label}: total ${total} across ${chartable.length} ${unit}`;
}
