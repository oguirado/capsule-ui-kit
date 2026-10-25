<script setup>
/**
 * Generic S1 status pill (spec section 6: 1px/6px pad, 2px radius, 10px
 * label). Tones map to the semantic status tokens; no application names.
 * @module widgets/S1StatusPill
 */
const props = defineProps({
  label: { type: String, required: true },
  tone: { type: String, default: 'neutral' },
});
const tones = Object.freeze(['neutral', 'success', 'warning', 'info', 'error']);
/** @returns {string} Tone class, falling back to neutral. */
function toneClass() {
  return tones.includes(props.tone) ? props.tone : 'neutral';
}
</script>
<template>
  <span :class="'s1-status-pill s1-status-pill-' + toneClass()">{{ label }}</span>
</template>
<style>
.s1-status-pill{
  display: inline-flex; align-items: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-primitive-font-weight-medium);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-elevated);
}
.s1-status-pill-success{
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.s1-status-pill-warning{
  color: var(--cuk-semantic-status-warning-text);
  background: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.s1-status-pill-info{
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.s1-status-pill-error{
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
</style>
