<script setup>
/**
 * Telemetry strip: host-supplied per-capsule numbers rendered honestly.
 * Missing or non-finite values render as `unknown`, never as faked zeros.
 * Generic presentation; the host supplies every metric.
 * @module health/HealthTelemetryStrip
 */
import { computed } from 'vue';
import {
  formatHealthMetricValue,
  healthTelemetryAccessibleName,
  healthTelemetryAnchor,
  healthTelemetryDomId,
  isHealthEntityId,
  normalizeHealthMetric,
} from './healthModel.js';

const props = defineProps({
  capsuleId: {
    type: String,
    required: true,
  },
  capsuleLabel: {
    type: String,
    default: '',
  },
  metrics: {
    type: Array,
    default: () => [],
  },
});

const safeId = computed(() => (isHealthEntityId(props.capsuleId) ? props.capsuleId : 'unknown'));
const stripDomId = computed(() => healthTelemetryDomId(safeId.value));
const anchor = computed(() => healthTelemetryAnchor(safeId.value));
const accessibleName = computed(() => healthTelemetryAccessibleName({
  capsuleId: safeId.value,
  capsuleLabel: props.capsuleLabel,
}));
const rows = computed(() => props.metrics.map((entry) => {
  const metric = normalizeHealthMetric(entry);
  return {
    key: metric.key,
    label: metric.label,
    text: formatHealthMetricValue(metric.value, metric.unit),
  };
}));
const hasRows = computed(() => rows.value.length > 0);
</script>

<template>
  <div
    :id="stripDomId"
    class="health-strip"
    role="group"
    :aria-label="accessibleName"
    :data-semantic-anchor="anchor"
  >
    <span class="health-strip__capsule">{{ safeId }}</span>
    <dl v-if="hasRows" class="health-strip__list">
      <div v-for="(row, index) in rows" :key="`${row.key}-${index}`" class="health-strip__metric">
        <dt class="health-strip__label">{{ row.label }}</dt>
        <dd class="health-strip__value">{{ row.text }}</dd>
      </div>
    </dl>
    <p v-else class="health-strip__empty" role="status">No telemetry available.</p>
  </div>
</template>

<style scoped>
.health-strip {
  display: flex;
  align-items: baseline;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.health-strip__capsule {
  flex: none;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-strip__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-sm) var(--cuk-semantic-spacing-md);
  margin: 0;
  padding: 0;
}
.health-strip__metric {
  display: flex;
  align-items: baseline;
  gap: var(--cuk-semantic-spacing-xs);
}
.health-strip__label {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-strip__value {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-font-size);
  color: var(--cuk-semantic-text-primary);
}
.health-strip__empty {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
</style>
