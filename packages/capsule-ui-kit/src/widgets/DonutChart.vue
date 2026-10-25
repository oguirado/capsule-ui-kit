<script setup>
import { computed, ref } from 'vue';
import { donutSlices, summarizeSlices, toneFor } from './DonutGeometry.js';

/**
 * Generic S1 donut chart card: own SVG on the 120x120 export ring, header
 * with title/meta, center total, a legend list, an accessible data table
 * toggle, and a quick-actions toolbar slot. The host supplies generic
 * slices; no application names.
 * @module widgets/DonutChart
 */

/**
 * @typedef {object} DonutSliceInput
 * @property {string} [id] Stable slice id.
 * @property {string} label Legend label.
 * @property {number} value Slice value.
 * @property {string} [sub] Legend sub-line.
 * @property {string} [tone] Slice tone (falls back to the palette cycle).
 */

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  meta: { type: String, default: '' },
  totalLabel: { type: String, default: '' },
  totalValue: { type: String, default: '' },
  slices: { type: Array, default: () => [] },
  formatValue: { type: Function, default: (/** @type {unknown} */ value) => String(value) },
  emptyText: { type: String, default: 'No data.' },
  actionsLabel: { type: String, default: '' },
  tableCaption: { type: String, default: '' },
});

const showTable = ref(false);
/** @returns {void} */
function toggleTable() { showTable.value = !showTable.value; }

/** @type {import('vue').ComputedRef<Array<any>>} */
const normSlices = computed(() => {
  const entries = /** @type {Array<DonutSliceInput>} */ (/** @type {unknown} */ (props.slices));
  const arcs = donutSlices(entries.map((entry) => entry.value));
  return entries.map((entry, index) => {
    const arc = arcs[index];
    return {
      key: typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : `slice-${index}`,
      label: entry.label,
      sub: typeof entry.sub === 'string' ? entry.sub : '',
      value: entry.value,
      text: props.formatValue(entry.value),
      tone: toneFor(entry.tone, index),
      chartable: arc !== undefined && arc.value > 0,
      pct: arc === undefined ? 0 : arc.pct,
      share: arc === undefined ? '0%' : `${arc.pct}%`,
      dashArray: arc === undefined ? '0 100' : arc.dashArray,
      dashOffset: arc === undefined ? 0 : arc.dashOffset,
    };
  });
});

/** @type {import('vue').ComputedRef<boolean>} */
const hasData = computed(() => normSlices.value.some((entry) => entry.chartable));
/** @type {import('vue').ComputedRef<string>} */
const summary = computed(() => summarizeSlices(
  props.title,
  /** @type {Array<DonutSliceInput>} */ (/** @type {unknown} */ (props.slices)).map((entry) => entry.value),
));
</script>
<template>
  <section :id="id" class="s1-donut-chart" :aria-label="title">
    <div class="s1-donut-head">
      <p class="s1-donut-title">{{ title }}</p>
      <p v-if="meta" class="s1-donut-meta">{{ meta }}</p>
    </div>
    <div v-if="hasData" class="s1-donut-plot">
      <svg class="s1-donut-svg" viewBox="0 0 120 120" role="img" :aria-label="summary">
        <circle cx="60" cy="60" r="47" pathLength="100" class="s1-donut-track" />
        <g transform="rotate(-90 60 60)">
          <circle
            v-for="entry in normSlices"
            v-show="entry.chartable"
            :key="entry.key"
            cx="60" cy="60" r="47" pathLength="100"
            :stroke-dasharray="entry.dashArray"
            :stroke-dashoffset="entry.dashOffset"
            :class="'s1-donut-slice s1-donut-slice-' + entry.tone"
          />
        </g>
        <text v-if="totalValue" x="60" y="58" text-anchor="middle" class="s1-donut-center-value">{{ totalValue }}</text>
        <text v-if="totalLabel" x="60" y="72" text-anchor="middle" class="s1-donut-center-label">{{ totalLabel }}</text>
      </svg>
    </div>
    <p v-else class="s1-donut-empty" role="status">{{ emptyText }}</p>
    <ul v-if="normSlices.length" class="s1-donut-legend" aria-label="Slices">
      <li v-for="entry in normSlices" :key="entry.key" class="s1-donut-legend-item">
        <span :class="'s1-donut-swatch s1-donut-swatch-' + entry.tone" aria-hidden="true" />
        <span class="s1-donut-legend-label">{{ entry.label }}</span>
        <span v-if="entry.sub" class="s1-donut-legend-sub">{{ entry.sub }}</span>
        <span class="s1-donut-legend-value">{{ entry.text }}</span>
        <span class="s1-donut-legend-share">{{ entry.share }}</span>
      </li>
    </ul>
    <button
      type="button"
      :id="id + '-table-toggle'"
      class="s1-donut-btn s1-donut-toggle"
      :aria-expanded="showTable"
      :aria-controls="id + '-table'"
      @click="toggleTable"
    >{{ showTable ? 'Hide data' : 'Show data' }}</button>
    <table v-if="showTable" :id="id + '-table'" class="s1-donut-table">
      <caption>{{ tableCaption || title + ' data' }}</caption>
      <thead>
        <tr>
          <th scope="col">Slice</th>
          <th scope="col">Value</th>
          <th scope="col">Share</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in normSlices" :key="entry.key">
          <th scope="row">{{ entry.label }}</th>
          <td>{{ entry.text }}</td>
          <td>{{ entry.share }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="$slots.actions" class="s1-donut-actions">
      <span v-if="actionsLabel" class="s1-donut-actions-label">{{ actionsLabel }}</span>
      <slot name="actions" />
    </div>
  </section>
</template>
<style>
.s1-donut-chart{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  padding: var(--cuk-primitive-space-5);
  background: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  min-width: 0;
}
.s1-donut-chart :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.s1-donut-head{
  display: flex; align-items: baseline; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-3);
}
.s1-donut-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-donut-meta{
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-donut-plot{min-width: 0; max-width: calc(var(--cuk-primitive-space-16) * 8);}
.s1-donut-svg{display: block; width: 100%; height: auto;}
.s1-donut-track{fill: none; stroke: var(--cuk-semantic-surface-chrome); stroke-width: 14;}
.s1-donut-slice{fill: none; stroke-width: 14;}
.s1-donut-slice-primary{stroke: var(--cuk-semantic-accent-primary);}
.s1-donut-slice-tertiary{stroke: var(--cuk-semantic-accent-tertiary);}
.s1-donut-slice-success{stroke: var(--cuk-semantic-status-success-text);}
.s1-donut-slice-info{stroke: var(--cuk-semantic-status-info-text);}
.s1-donut-slice-warning{stroke: var(--cuk-semantic-status-warning-text);}
.s1-donut-slice-error{stroke: var(--cuk-semantic-status-error-text);}
.s1-donut-slice-muted{stroke: var(--cuk-semantic-text-disabled);}
.s1-donut-center-value{
  font-family: var(--cuk-component-s1-kpi-value-font-family);
  font-size: var(--cuk-component-s1-kpi-value-font-size);
  font-weight: var(--cuk-component-s1-kpi-value-font-weight);
  fill: var(--cuk-semantic-text-primary);
}
.s1-donut-center-label{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  fill: var(--cuk-semantic-text-disabled);
}
.s1-donut-empty{
  margin: 0;
  padding: var(--cuk-primitive-space-4) 0;
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
.s1-donut-legend{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-2);
  list-style: none;
  margin: 0; padding: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-donut-legend-item{
  display: flex; align-items: baseline;
  gap: var(--cuk-primitive-space-2);
}
.s1-donut-swatch{
  align-self: center;
  width: var(--cuk-primitive-space-3); height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-accent-primary);
  flex: none;
}
.s1-donut-swatch-primary{background: var(--cuk-semantic-accent-primary);}
.s1-donut-swatch-tertiary{background: var(--cuk-semantic-accent-tertiary);}
.s1-donut-swatch-success{background: var(--cuk-semantic-status-success-text);}
.s1-donut-swatch-info{background: var(--cuk-semantic-status-info-text);}
.s1-donut-swatch-warning{background: var(--cuk-semantic-status-warning-text);}
.s1-donut-swatch-error{background: var(--cuk-semantic-status-error-text);}
.s1-donut-swatch-muted{background: var(--cuk-semantic-text-disabled);}
.s1-donut-legend-label{color: var(--cuk-semantic-text-primary);}
.s1-donut-legend-sub{color: var(--cuk-semantic-text-disabled);}
.s1-donut-legend-value{margin-left: auto; color: var(--cuk-semantic-text-primary); font-variant-numeric: tabular-nums;}
.s1-donut-legend-share{min-width: calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-4)); text-align: right; font-variant-numeric: tabular-nums;}
.s1-donut-toggle{align-self: flex-start;}
.s1-donut-table{width: 100%; border-collapse: collapse;}
.s1-donut-table caption{
  text-align: left;
  padding: 0 0 var(--cuk-primitive-space-2);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  color: var(--cuk-semantic-text-muted);
}
.s1-donut-table th{
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
.s1-donut-table td{
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-semantic-text-primary);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-donut-actions{
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-3);
  padding-top: var(--cuk-primitive-space-3);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-donut-actions-label{
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-donut-btn{
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
.s1-donut-btn:hover{background: var(--cuk-semantic-surface-interactive);}
.s1-donut-btn:disabled{
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
</style>
