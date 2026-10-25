/**
 * Pure geometry helpers for the generic S1 line chart (S1LineChart.vue).
 * Fixed export coordinate system: viewBox 500x80 with gridlines at y=20/45
 * (dashed 2,2) and y=70 (solid). No DOM, no Vue, no tokens: node-testable.
 * @module widgets/chartGeometry
 */

/** Export plot width in viewBox units. @type {number} */
export const S1_CHART_WIDTH = 500;
/** Export plot height in viewBox units. @type {number} */
export const S1_CHART_HEIGHT = 80;
/** Top of the value band (dot-radius margin). @type {number} */
export const S1_PLOT_TOP = 6;
/** Bottom of the value band. @type {number} */
export const S1_PLOT_BOTTOM = 72;
/** Horizontal dot-radius margin. @type {number} */
export const S1_PLOT_PAD_X = 4;

/**
 * @typedef {object} S1Gridline
 * @property {number} y ViewBox y of the gridline.
 * @property {boolean} dashed True for the dashed 2,2 lines.
 */

/** Fixed export gridlines, independent of data. @type {ReadonlyArray<S1Gridline>} */
export const S1_GRIDLINES = Object.freeze([
  Object.freeze({ y: 20, dashed: true }),
  Object.freeze({ y: 45, dashed: true }),
  Object.freeze({ y: 70, dashed: false }),
]);

/**
 * @typedef {object} S1ScaledPoint
 * @property {number} x ViewBox x, rounded to 2 decimals.
 * @property {number} y ViewBox y, rounded to 2 decimals.
 */

/** @param {number} value @returns {number} Rounded to 2 decimals. */
function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Scale one value series into the plot band. A flat series renders on the
 * band middle; a single value centers horizontally.
 * @param {ReadonlyArray<number>} values Raw series values.
 * @param {number} [width] ViewBox width.
 * @param {number} [height] ViewBox height (unused, kept for call shape).
 * @returns {Array<S1ScaledPoint>} Scaled points in input order.
 */
export function scalePoints(values, width = S1_CHART_WIDTH, height = S1_CHART_HEIGHT) {
  void height;
  const span = width - S1_PLOT_PAD_X * 2;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (typeof value !== 'number' || Number.isNaN(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === Infinity) return [];
  const flat = max === min;
  const mid = (S1_PLOT_TOP + S1_PLOT_BOTTOM) / 2;
  return values.map((value, index) => {
    const x = values.length < 2 ? width / 2 : S1_PLOT_PAD_X + (index / (values.length - 1)) * span;
    const y = flat || typeof value !== 'number' || Number.isNaN(value)
      ? mid
      : S1_PLOT_BOTTOM - ((value - min) / (max - min)) * (S1_PLOT_BOTTOM - S1_PLOT_TOP);
    return { x: round2(x), y: round2(y) };
  });
}

/**
 * @param {ReadonlyArray<S1ScaledPoint>} scaled Scaled points.
 * @returns {string} SVG polyline points attribute.
 */
export function polylineAttr(scaled) {
  return scaled.map((point) => `${point.x},${point.y}`).join(' ');
}

/**
 * @param {ReadonlyArray<S1ScaledPoint>} scaled Scaled points.
 * @param {number} [height] ViewBox height (area closes at the bottom).
 * @returns {string} SVG area path attribute.
 */
export function areaAttr(scaled, height = S1_CHART_HEIGHT) {
  const first = scaled[0];
  const last = scaled[scaled.length - 1];
  if (first === undefined || last === undefined) return '';
  const line = scaled.map((point) => `L${point.x},${point.y}`).join(' ');
  return `M${first.x},${height} ${line} L${last.x},${height} Z`;
}

/**
 * @param {string} label Series label.
 * @param {ReadonlyArray<number>} values Raw series values.
 * @returns {string} One-line screen-reader summary of the series.
 */
export function summarizeSeries(label, values) {
  const finite = values.filter((value) => typeof value === 'number' && !Number.isNaN(value));
  if (finite.length < 1) return `${label}: no data`;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const last = finite[finite.length - 1];
  if (last === undefined) return `${label}: no data`;
  return `${label}: last ${last} (min ${min}, max ${max}, ${finite.length} points)`;
}
