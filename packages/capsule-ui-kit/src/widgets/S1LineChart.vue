<script setup>
import { computed, ref } from 'vue';
import { areaAttr, polylineAttr, scalePoints, summarizeSeries, S1_GRIDLINES } from './chartGeometry.js';

/**
 * Generic S1 line chart card (spec section 5): own SVG on the 500x80 export
 * grid, header with title/meta/legend, month tickers, an accessible data
 * table toggle, and a quick-actions toolbar slot. The host supplies generic
 * series; no application names.
 * @module widgets/S1LineChart
 */

/**
 * @typedef {object} S1ChartPoint
 * @property {string} label Point label (ticker / table stub).
 * @property {number} value Point value.
 */

/**
 * @typedef {object} S1ChartSeries
 * @property {string} [id] Stable series id.
 * @property {string} label Legend label.
 * @property {('primary'|'muted'|'tertiary')} [tone] Line tone.
 * @property {boolean} [dashed] True for the dashed burn style.
 * @property {boolean} [area] True to fill under the line.
 * @property {boolean} [dots] True to draw endpoint dots (default on primary).
 * @property {Array<S1ChartPoint>} points Series points in order.
 */

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  meta: { type: String, default: '' },
  series: { type: Array, default: () => [] },
  formatValue: { type: Function, default: (/** @type {unknown} */ value) => String(value) },
  emptyText: { type: String, default: 'No data.' },
  actionsLabel: { type: String, default: '' },
  tableCaption: { type: String, default: '' },
});

const showTable = ref(false);
/** @returns {void} */
function toggleTable() { showTable.value = !showTable.value; }

/** @type {import('vue').ComputedRef<Array<any>>} */
const normSeries = computed(() => (
  /** @type {Array<S1ChartSeries>} */ (/** @type {unknown} */ (props.series)).map((entry, index) => {
    const points = Array.isArray(entry.points) ? entry.points : [];
    const values = points.map((point) => point.value);
    const scaled = scalePoints(values);
    const tone = entry.tone === 'muted' || entry.tone === 'tertiary' ? entry.tone : 'primary';
    return {
      key: typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : `series-${index}`,
      label: entry.label,
      tone,
      dashed: entry.dashed === true,
      area: entry.area === true,
      dots: entry.dots === undefined ? tone === 'primary' : entry.dots === true,
      points,
      polyline: polylineAttr(scaled),
      areaPath: areaAttr(scaled),
      dotsOn: scaled,
      summary: summarizeSeries(entry.label, values),
    };
  })
));

/** @type {import('vue').ComputedRef<boolean>} */
const hasData = computed(() => normSeries.value.some((entry) => entry.points.length > 1));
/** @type {import('vue').ComputedRef<Array<string>>} */
const ticks = computed(() => {
  let longest = normSeries.value[0];
  for (const entry of normSeries.value) {
    if (longest === undefined || entry.points.length > longest.points.length) longest = entry;
  }
  return longest === undefined ? [] : longest.points.map((/** @type {S1ChartPoint} */ point) => point.label);
});
/** @type {import('vue').ComputedRef<string>} */
const summary = computed(() => normSeries.value.map((entry) => entry.summary).join('; '));
/** @type {import('vue').ComputedRef<Array<any>>} */
const tableRows = computed(() => {
  const width = normSeries.value.reduce((max, entry) => Math.max(max, entry.points.length), 0);
  const rows = [];
  for (let index = 0; index < width; index += 1) {
    const cells = normSeries.value.map((entry) => {
      const point = entry.points[index];
      return point === undefined ? '—' : props.formatValue(point.value);
    });
    const stub = normSeries.value.map((entry) => entry.points[index]).find((point) => point !== undefined);
    rows.push({ key: `row-${index}`, stub: stub === undefined ? `#${index + 1}` : stub.label, cells });
  }
  return rows;
});
</script>
<template>
  <section :id="id" class="s1-line-chart" :aria-label="title">
    <div class="s1-line-chart-head">
      <p class="s1-line-chart-title">{{ title }}</p>
      <p v-if="meta" class="s1-line-chart-meta">{{ meta }}</p>
      <ul v-if="normSeries.length" class="s1-line-chart-legend" aria-label="Series">
        <li v-for="entry in normSeries" :key="entry.key" class="s1-line-chart-legend-item">
          <span :class="'s1-line-chart-swatch s1-line-chart-swatch-' + entry.tone" aria-hidden="true" />
          <span>{{ entry.label }}</span>
        </li>
      </ul>
    </div>
    <div v-if="hasData" class="s1-line-chart-plot">
      <svg class="s1-line-chart-svg" viewBox="0 0 500 80" preserveAspectRatio="none" role="img" :aria-label="summary">
        <line
          v-for="(grid, gridIndex) in S1_GRIDLINES"
          :key="gridIndex"
          x1="0" x2="500" :y1="grid.y" :y2="grid.y"
          class="s1-line-chart-grid"
          :stroke-dasharray="grid.dashed ? '2 2' : undefined"
          vector-effect="non-scaling-stroke"
        />
        <g v-for="entry in normSeries" :key="entry.key">
          <path
            v-if="entry.area && entry.points.length > 1"
            :d="entry.areaPath"
            :class="'s1-line-chart-area s1-line-chart-area-' + entry.tone"
            fill-opacity="0.08"
          />
          <polyline
            v-if="entry.points.length > 1"
            :points="entry.polyline"
            :class="'s1-line-chart-line s1-line-chart-line-' + entry.tone"
            :stroke-dasharray="entry.dashed ? '3 3' : undefined"
            fill="none"
            vector-effect="non-scaling-stroke"
          />
          <circle
            v-if="entry.dots && entry.dotsOn.length > 0"
            :cx="entry.dotsOn[0].x" :cy="entry.dotsOn[0].y" r="2.5"
            :class="'s1-line-chart-dot s1-line-chart-dot-' + entry.tone"
          />
          <circle
            v-if="entry.dots && entry.dotsOn.length > 1"
            :cx="entry.dotsOn[entry.dotsOn.length - 1].x" :cy="entry.dotsOn[entry.dotsOn.length - 1].y" r="3"
            :class="'s1-line-chart-dot s1-line-chart-dot-' + entry.tone"
          />
        </g>
      </svg>
      <div class="s1-line-chart-ticks" aria-hidden="true">
        <span v-for="(tick, tickIndex) in ticks" :key="tickIndex">{{ tick }}</span>
      </div>
    </div>
    <p v-else class="s1-line-chart-empty" role="status">{{ emptyText }}</p>
    <button :data-semantic-anchor="'settings/control-' + (id + '-table-toggle').replace(/[^A-Za-z0-9._-]/g, '-')"
      type="button"
      :id="id + '-table-toggle'"
      class="s1-action-btn s1-line-chart-toggle"
      :aria-expanded="showTable"
      :aria-controls="id + '-table'"
      @click="toggleTable"
    >{{ showTable ? 'Hide data' : 'Show data' }}</button>
    <table v-if="showTable" :id="id + '-table'" class="s1-line-chart-table">
      <caption>{{ tableCaption || title + ' data' }}</caption>
      <thead>
        <tr>
          <th scope="col">Point</th>
          <th v-for="entry in normSeries" :key="entry.key" scope="col">{{ entry.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in tableRows" :key="row.key">
          <th scope="row">{{ row.stub }}</th>
          <td v-for="(cell, cellIndex) in row.cells" :key="cellIndex">{{ cell }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="$slots.actions" class="s1-line-chart-actions">
      <span v-if="actionsLabel" class="s1-line-chart-actions-label">{{ actionsLabel }}</span>
      <slot name="actions" />
    </div>
  </section>
</template>
<style>
.s1-line-chart{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  padding: var(--cuk-primitive-space-5);
  background: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  min-width: 0;
}
.s1-line-chart :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.s1-line-chart-head{
  display: flex; align-items: baseline; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-3);
}
.s1-line-chart-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-line-chart-meta{
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-line-chart-legend{
  display: flex; align-items: center;
  gap: var(--cuk-primitive-space-3);
  list-style: none;
  margin: 0 0 0 auto; padding: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-line-chart-legend-item{display: flex; align-items: center; gap: var(--cuk-primitive-space-1);}
.s1-line-chart-swatch{
  width: var(--cuk-primitive-space-4); height: var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-accent-primary);
}
.s1-line-chart-swatch-muted{background: var(--cuk-semantic-text-disabled);}
.s1-line-chart-swatch-tertiary{background: var(--cuk-semantic-accent-tertiary);}
.s1-line-chart-plot{min-width: 0;}
.s1-line-chart-svg{
  display: block; width: 100%;
  height: calc(var(--cuk-component-s1-table-row-height) + var(--cuk-component-s1-table-row-height) + var(--cuk-component-s1-table-row-height));
}
.s1-line-chart-grid{stroke: var(--cuk-semantic-surface-chrome); stroke-width: 1;}
.s1-line-chart-line{stroke-width: 1.75;}
.s1-line-chart-line-primary{stroke: var(--cuk-semantic-accent-primary);}
.s1-line-chart-line-muted{stroke: var(--cuk-semantic-text-disabled); stroke-width: 1;}
.s1-line-chart-line-tertiary{stroke: var(--cuk-semantic-accent-tertiary);}
.s1-line-chart-area-primary{fill: var(--cuk-semantic-accent-primary);}
.s1-line-chart-area-muted{fill: var(--cuk-semantic-text-disabled);}
.s1-line-chart-area-tertiary{fill: var(--cuk-semantic-accent-tertiary);}
.s1-line-chart-dot-primary{fill: var(--cuk-semantic-accent-primary);}
.s1-line-chart-dot-muted{fill: var(--cuk-semantic-text-disabled);}
.s1-line-chart-dot-tertiary{fill: var(--cuk-semantic-accent-tertiary);}
.s1-line-chart-ticks{
  display: flex; justify-content: space-between;
  gap: var(--cuk-primitive-space-2);
  margin: var(--cuk-primitive-space-2) 0 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-line-chart-empty{
  margin: 0;
  padding: var(--cuk-primitive-space-4) 0;
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
.s1-line-chart-toggle{align-self: flex-start;}
.s1-line-chart-table{width: 100%; border-collapse: collapse;}
.s1-line-chart-table caption{
  text-align: left;
  padding: 0 0 var(--cuk-primitive-space-2);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  color: var(--cuk-semantic-text-muted);
}
.s1-line-chart-table th{
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  text-align: left;
  font-family: var(--cuk-semantic-typography-roles-table-header-font-family);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-semantic-typography-roles-table-header-font-weight);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  text-transform: var(--cuk-semantic-typography-roles-table-header-text-transform);
  color: var(--cuk-semantic-text-disabled);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-line-chart-table td{
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-semantic-text-primary);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-line-chart-actions{
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-3);
  padding-top: var(--cuk-primitive-space-3);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-line-chart-actions-label{
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-action-btn{
  display: inline-flex; align-items: center; justify-content: center;
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-5);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-canvas);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.s1-action-btn:hover{background: var(--cuk-semantic-surface-interactive);}
.s1-action-btn:disabled{
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.s1-action-btn-primary{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-accent-primary);
}
.s1-action-btn-primary:hover{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-accent-primary);
}
</style>
