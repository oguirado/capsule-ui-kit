<script setup>
/**
 * Generic S1 milestone card: title, meta and a determinate progress bar.
 * Tones are generic (success, primary, warning); the host supplies all
 * text and the percent, which clamps defensively to 0-100.
 * @module lists/S1MilestoneCard
 */

const props = defineProps({
  title: { type: String, required: true },
  meta: { type: String, default: '' },
  metaTone: { type: String, default: 'primary' },
  percent: { type: [Number, String], default: 0 },
  tone: { type: String, default: 'primary' },
  cardId: { type: String, default: '' },
});

/** @returns {number} */
function clamped() {
  const raw = typeof props.percent === 'string' ? Number(props.percent) : props.percent;
  if (typeof raw !== 'number' || Number.isNaN(raw)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** @param {unknown} tone @returns {string} */
function toneOf(tone) {
  return tone === 'success' || tone === 'warning' ? tone : 'primary';
}
</script>
<template>
  <div class="s1-milestone-card" :id="cardId || undefined">
    <div class="s1-milestone-card-row">
      <span class="s1-milestone-card-title">{{ title }}</span>
      <span v-if="meta" class="s1-milestone-card-meta" :class="'s1-milestone-card-meta-' + toneOf(metaTone)">{{ meta }}</span>
    </div>
    <div
      class="s1-milestone-card-track"
      role="progressbar"
      :aria-label="title"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="clamped()"
      :aria-valuetext="clamped() + '%'"
    >
      <div class="s1-milestone-card-fill" :class="'s1-milestone-card-fill-' + toneOf(tone)" :style="{ width: clamped() + '%' }" />
    </div>
  </div>
</template>
<style>
.s1-milestone-card{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.s1-milestone-card-row{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
}
.s1-milestone-card-title{
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  color: var(--cuk-semantic-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.s1-milestone-card-meta{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  white-space: nowrap; flex: none;
}
.s1-milestone-card-meta-success{
  color: var(--cuk-primitive-color-emerald-400);
}
.s1-milestone-card-meta-primary{
  color: var(--cuk-semantic-text-accent);
}
.s1-milestone-card-meta-warning{
  color: var(--cuk-primitive-color-amber-400);
}
.s1-milestone-card-track{
  height: var(--cuk-primitive-space-3);
  background: var(--cuk-semantic-surface-elevated);
  border-radius: var(--cuk-semantic-radius-pill);
  overflow: hidden;
}
.s1-milestone-card-fill{
  height: 100%;
  border-radius: var(--cuk-semantic-radius-pill);
}
.s1-milestone-card-fill-success{
  background: var(--cuk-primitive-color-emerald-400);
}
.s1-milestone-card-fill-primary{
  background: var(--cuk-semantic-text-accent);
}
.s1-milestone-card-fill-warning{
  background: var(--cuk-primitive-color-amber-400);
}
</style>
