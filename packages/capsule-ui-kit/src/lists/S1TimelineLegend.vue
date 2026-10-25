<script setup>
/**
 * Generic S1 timeline legend: tone dots plus an optional tick readout.
 * The host supplies every entry; nothing renders without entries.
 * @module lists/S1TimelineLegend
 */

/**
 * @typedef {object} S1LegendEntry
 * @property {string} label Visible label.
 * @property {string} [tone] Dot tone: success, primary, warning or muted.
 */

const props = defineProps({
  entries: { type: /** @type {import('vue').PropType<ReadonlyArray<S1LegendEntry>>} */ (Array), required: true },
  tickLabel: { type: String, default: '' },
  label: { type: String, default: 'Timeline legend' },
});

/** @param {unknown} tone @returns {string} */
function toneOf(tone) {
  return tone === 'success' || tone === 'primary' || tone === 'warning' ? tone : 'muted';
}
</script>
<template>
  <div class="s1-timeline-legend" role="list" :aria-label="label">
    <span
      v-for="(entry, index) in /** @type {S1LegendEntry[]} */ (/** @type {unknown} */ (entries))"
      :key="index"
      class="s1-timeline-legend-entry"
      role="listitem"
    >
      <span class="s1-timeline-legend-dot" :class="'s1-timeline-legend-dot-' + toneOf(entry.tone)" aria-hidden="true" />
      <span>{{ entry.label }}</span>
    </span>
    <span v-if="tickLabel" class="s1-timeline-legend-tick">{{ tickLabel }}</span>
  </div>
</template>
<style>
.s1-timeline-legend{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-4); flex-wrap: wrap;
  padding-top: var(--cuk-primitive-space-4);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-timeline-legend-entry{
  display: inline-flex; align-items: center;
  gap: var(--cuk-primitive-space-2);
  white-space: nowrap;
}
.s1-timeline-legend-dot{
  width: var(--cuk-primitive-space-3); height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  flex: none;
}
.s1-timeline-legend-dot-success{
  background: var(--cuk-primitive-color-emerald-400);
}
.s1-timeline-legend-dot-primary{
  background: var(--cuk-semantic-text-accent);
}
.s1-timeline-legend-dot-warning{
  background: var(--cuk-primitive-color-amber-400);
}
.s1-timeline-legend-dot-muted{
  background: var(--cuk-semantic-border-subtle);
}
.s1-timeline-legend-tick{
  white-space: nowrap;
}
</style>
