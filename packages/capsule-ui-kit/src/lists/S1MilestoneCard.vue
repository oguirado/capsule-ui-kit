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
      <div class="s1-milestone-card-fill" :class="['s1-milestone-card-fill-' + toneOf(tone), 's1-milestone-pct-' + clamped()]" />
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
.s1-milestone-pct-0 { width: 0%; }
.s1-milestone-pct-1 { width: 1%; }
.s1-milestone-pct-2 { width: 2%; }
.s1-milestone-pct-3 { width: 3%; }
.s1-milestone-pct-4 { width: 4%; }
.s1-milestone-pct-5 { width: 5%; }
.s1-milestone-pct-6 { width: 6%; }
.s1-milestone-pct-7 { width: 7%; }
.s1-milestone-pct-8 { width: 8%; }
.s1-milestone-pct-9 { width: 9%; }
.s1-milestone-pct-10 { width: 10%; }
.s1-milestone-pct-11 { width: 11%; }
.s1-milestone-pct-12 { width: 12%; }
.s1-milestone-pct-13 { width: 13%; }
.s1-milestone-pct-14 { width: 14%; }
.s1-milestone-pct-15 { width: 15%; }
.s1-milestone-pct-16 { width: 16%; }
.s1-milestone-pct-17 { width: 17%; }
.s1-milestone-pct-18 { width: 18%; }
.s1-milestone-pct-19 { width: 19%; }
.s1-milestone-pct-20 { width: 20%; }
.s1-milestone-pct-21 { width: 21%; }
.s1-milestone-pct-22 { width: 22%; }
.s1-milestone-pct-23 { width: 23%; }
.s1-milestone-pct-24 { width: 24%; }
.s1-milestone-pct-25 { width: 25%; }
.s1-milestone-pct-26 { width: 26%; }
.s1-milestone-pct-27 { width: 27%; }
.s1-milestone-pct-28 { width: 28%; }
.s1-milestone-pct-29 { width: 29%; }
.s1-milestone-pct-30 { width: 30%; }
.s1-milestone-pct-31 { width: 31%; }
.s1-milestone-pct-32 { width: 32%; }
.s1-milestone-pct-33 { width: 33%; }
.s1-milestone-pct-34 { width: 34%; }
.s1-milestone-pct-35 { width: 35%; }
.s1-milestone-pct-36 { width: 36%; }
.s1-milestone-pct-37 { width: 37%; }
.s1-milestone-pct-38 { width: 38%; }
.s1-milestone-pct-39 { width: 39%; }
.s1-milestone-pct-40 { width: 40%; }
.s1-milestone-pct-41 { width: 41%; }
.s1-milestone-pct-42 { width: 42%; }
.s1-milestone-pct-43 { width: 43%; }
.s1-milestone-pct-44 { width: 44%; }
.s1-milestone-pct-45 { width: 45%; }
.s1-milestone-pct-46 { width: 46%; }
.s1-milestone-pct-47 { width: 47%; }
.s1-milestone-pct-48 { width: 48%; }
.s1-milestone-pct-49 { width: 49%; }
.s1-milestone-pct-50 { width: 50%; }
.s1-milestone-pct-51 { width: 51%; }
.s1-milestone-pct-52 { width: 52%; }
.s1-milestone-pct-53 { width: 53%; }
.s1-milestone-pct-54 { width: 54%; }
.s1-milestone-pct-55 { width: 55%; }
.s1-milestone-pct-56 { width: 56%; }
.s1-milestone-pct-57 { width: 57%; }
.s1-milestone-pct-58 { width: 58%; }
.s1-milestone-pct-59 { width: 59%; }
.s1-milestone-pct-60 { width: 60%; }
.s1-milestone-pct-61 { width: 61%; }
.s1-milestone-pct-62 { width: 62%; }
.s1-milestone-pct-63 { width: 63%; }
.s1-milestone-pct-64 { width: 64%; }
.s1-milestone-pct-65 { width: 65%; }
.s1-milestone-pct-66 { width: 66%; }
.s1-milestone-pct-67 { width: 67%; }
.s1-milestone-pct-68 { width: 68%; }
.s1-milestone-pct-69 { width: 69%; }
.s1-milestone-pct-70 { width: 70%; }
.s1-milestone-pct-71 { width: 71%; }
.s1-milestone-pct-72 { width: 72%; }
.s1-milestone-pct-73 { width: 73%; }
.s1-milestone-pct-74 { width: 74%; }
.s1-milestone-pct-75 { width: 75%; }
.s1-milestone-pct-76 { width: 76%; }
.s1-milestone-pct-77 { width: 77%; }
.s1-milestone-pct-78 { width: 78%; }
.s1-milestone-pct-79 { width: 79%; }
.s1-milestone-pct-80 { width: 80%; }
.s1-milestone-pct-81 { width: 81%; }
.s1-milestone-pct-82 { width: 82%; }
.s1-milestone-pct-83 { width: 83%; }
.s1-milestone-pct-84 { width: 84%; }
.s1-milestone-pct-85 { width: 85%; }
.s1-milestone-pct-86 { width: 86%; }
.s1-milestone-pct-87 { width: 87%; }
.s1-milestone-pct-88 { width: 88%; }
.s1-milestone-pct-89 { width: 89%; }
.s1-milestone-pct-90 { width: 90%; }
.s1-milestone-pct-91 { width: 91%; }
.s1-milestone-pct-92 { width: 92%; }
.s1-milestone-pct-93 { width: 93%; }
.s1-milestone-pct-94 { width: 94%; }
.s1-milestone-pct-95 { width: 95%; }
.s1-milestone-pct-96 { width: 96%; }
.s1-milestone-pct-97 { width: 97%; }
.s1-milestone-pct-98 { width: 98%; }
.s1-milestone-pct-99 { width: 99%; }
.s1-milestone-pct-100 { width: 100%; }
</style>
