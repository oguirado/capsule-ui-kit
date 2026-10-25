<script setup>
/**
 * Generic S1 KPI card (spec section 4: 10px pad, 4px radius, 11px label,
 * 13px mono semibold value, 11px mono sub-line). The host supplies label,
 * value, tone and sub-line; no application names.
 * @module widgets/S1KpiCard
 */
const props = defineProps({
  id: { type: String, default: '' },
  label: { type: String, required: true },
  value: { type: String, required: true },
  tone: { type: String, default: 'default' },
  sub: { type: String, default: '' },
});
const tones = Object.freeze(['default', 'positive', 'negative', 'accent', 'muted']);
/** @returns {string} Tone class, falling back to default. */
function toneClass() {
  return tones.includes(props.tone) ? props.tone : 'default';
}
</script>
<template>
  <article :id="id || undefined" class="s1-kpi-card">
    <p class="s1-kpi-label">{{ label }}</p>
    <p :class="'s1-kpi-value s1-kpi-value-' + toneClass()">{{ value }}</p>
    <p v-if="sub" class="s1-kpi-sub">{{ sub }}</p>
  </article>
</template>
<style>
.s1-kpi-card{
  display: flex; flex-direction: column;
  padding: var(--cuk-primitive-space-5);
  background: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  min-width: 0;
}
.s1-kpi-label{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
}
.s1-kpi-value{
  margin: var(--cuk-primitive-space-1) 0 0;
  font-family: var(--cuk-component-s1-kpi-value-font-family);
  font-size: var(--cuk-component-s1-kpi-value-font-size);
  font-weight: var(--cuk-component-s1-kpi-value-font-weight);
  line-height: var(--cuk-semantic-typography-roles-code-md-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-semantic-text-primary);
}
.s1-kpi-value-positive{color: var(--cuk-semantic-status-success-text);}
.s1-kpi-value-negative{color: var(--cuk-semantic-status-error-text);}
.s1-kpi-value-accent{color: var(--cuk-semantic-accent-primary);}
.s1-kpi-value-muted{color: var(--cuk-semantic-text-disabled);}
.s1-kpi-sub{
  margin: var(--cuk-primitive-space-2) 0 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
</style>
