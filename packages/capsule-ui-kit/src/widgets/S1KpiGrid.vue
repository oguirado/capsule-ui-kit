<script setup>
/**
 * Generic S1 KPI grid (spec section 4: 8px gap, wrapping 2-up/4-up). The
 * card basis derives from the space tokens only (5 x 32px = 160px), so the
 * grid wraps with the viewport and uses no raw sizes or breakpoints.
 * @module widgets/S1KpiGrid
 */
defineProps({
  id: { type: String, default: '' },
  label: { type: String, default: '' },
});
</script>
<template>
  <div :id="id || undefined" class="s1-kpi-grid" role="group" :aria-label="label || undefined">
    <slot />
  </div>
</template>
<style>
.s1-kpi-grid{
  display: flex; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-4);
}
.s1-kpi-grid > *{
  flex: 1 1 calc(var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16) + var(--cuk-primitive-space-16));
  min-width: 0;
}
</style>
