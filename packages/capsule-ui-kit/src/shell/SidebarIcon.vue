<script setup>
/**
 * @file Generic sidebar glyph set for the kit shell rail (S1 sidebar, spec section 2).
 * Closed set of geometric stroke icons; no application names. Decorative only:
 * always aria-hidden, the owning control carries the accessible name.
 * Legacy AppShell names grid/info alias onto the set.
 * Plain JS + JSDoc, no TypeScript.
 */
const props = defineProps({ name: { type: String, default: 'marker' } });
/** Resolved glyph key; unknown names fall back to the neutral marker. */
const GLYPHS = Object.freeze([
  'dashboard', 'people', 'mail', 'calendar', 'industry', 'box', 'chart-pie',
  'trend-up', 'bank', 'save', 'console', 'cog', 'dots', 'sync', 'marker',
]);
function glyph() {
  if (props.name === 'grid') return 'dashboard';
  if (props.name === 'info') return 'marker';
  return GLYPHS.includes(props.name) ? props.name : 'marker';
}
</script>
<template>
  <svg class="cuk-sidebar-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <g v-if="glyph() === 'dashboard'">
      <rect x="2.2" y="2.2" width="4.8" height="4.8" rx="1" />
      <rect x="9" y="2.2" width="4.8" height="4.8" rx="1" />
      <rect x="2.2" y="9" width="4.8" height="4.8" rx="1" />
      <rect x="9" y="9" width="4.8" height="4.8" rx="1" />
    </g>
    <g v-else-if="glyph() === 'people'">
      <circle cx="5.8" cy="5.4" r="2.4" />
      <path d="M2 13.2c0-2.2 1.7-3.8 3.8-3.8s3.8 1.6 3.8 3.8" />
      <circle cx="11.6" cy="5.8" r="1.9" />
      <path d="M11.2 9.6c1.5.4 2.6 1.7 2.6 3.4" />
    </g>
    <g v-else-if="glyph() === 'mail'">
      <rect x="2" y="3.8" width="12" height="8.9" rx="1" />
      <path d="M2.6 4.8L8 9l5.4-4.2" />
    </g>
    <g v-else-if="glyph() === 'calendar'">
      <rect x="2" y="3.4" width="12" height="10.2" rx="1" />
      <path d="M2 6.4h12M5.4 1.8v2.6M10.6 1.8v2.6" />
    </g>
    <g v-else-if="glyph() === 'industry'">
      <path d="M2.2 13.4V6.8l3 1.7V5.2l3 1.7V3.2h2v10.2" />
      <path d="M1.6 13.4h12.8" />
    </g>
    <g v-else-if="glyph() === 'box'">
      <path d="M8 2.2l5.4 3.1v5.9L8 14.3l-5.4-3.1V5.3z" />
      <path d="M2.6 5.3L8 8.25l5.4-2.95M8 8.25v6.05" />
    </g>
    <g v-else-if="glyph() === 'chart-pie'">
      <circle cx="8" cy="8.4" r="5.6" />
      <path d="M8 8.4V2.8M8 8.4h5.6" />
    </g>
    <g v-else-if="glyph() === 'trend-up'">
      <path d="M2.4 12.6l3.6-4.1 2.4 2.4 4.2-5.4" />
      <path d="M9.9 5.5h2.7v2.7" />
    </g>
    <g v-else-if="glyph() === 'bank'">
      <path d="M1.8 6.4L8 2.8l6.2 3.6" />
      <path d="M3.6 6.4v4.8M6.1 6.4v4.8M9.9 6.4v4.8M12.4 6.4v4.8" />
      <path d="M1.8 13.4h12.4" />
    </g>
    <g v-else-if="glyph() === 'save'">
      <path d="M3 13.5V3h7.2l2.3 2.3v8.2z" />
      <path d="M5.2 3v3.4h5.1V3M5.2 13.5v-3.2h5.6v3.2" />
    </g>
    <g v-else-if="glyph() === 'console'">
      <rect x="2" y="3.6" width="12" height="8.8" rx="1" />
      <path d="M5.4 6.6l1.9 1.7-1.9 1.7M8.6 10.6h2.4" />
    </g>
    <g v-else-if="glyph() === 'cog'">
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.7v2.1M8 12.2v2.1M1.7 8h2.1M12.2 8h2.1M3.6 3.6l1.5 1.5M10.9 10.9l1.5 1.5M12.4 3.6l-1.5 1.5M5.1 10.9l-1.5 1.5" />
    </g>
    <g v-else-if="glyph() === 'dots'" stroke="none" fill="currentColor">
      <circle cx="8" cy="3.4" r="1.15" />
      <circle cx="8" cy="8" r="1.15" />
      <circle cx="8" cy="12.6" r="1.15" />
    </g>
    <g v-else-if="glyph() === 'sync'">
      <path d="M13.6 6.9a5.6 5.6 0 0 0-10.2-1.5" />
      <path d="M3.1 2.9v2.6h2.6" />
      <path d="M2.4 9.1a5.6 5.6 0 1 1 10.2 1.5" />
      <path d="M12.9 13.1v-2.6h-2.6" />
    </g>
    <g v-else>
      <circle cx="8" cy="8" r="2.6" />
    </g>
  </svg>
</template>
<style scoped>
.cuk-sidebar-icon {
  width: var(--cuk-primitive-space-8);
  height: var(--cuk-primitive-space-8);
  flex-shrink: 0;
}
</style>
