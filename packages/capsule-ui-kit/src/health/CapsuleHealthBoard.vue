<script setup>
/**
 * Capsule health board: per-capsule states, telemetry strips and the alert list.
 * Generic presentation; the host supplies every capsule and alert and performs every
 * acknowledgement. The board emits `submit-intent` only and writes nothing.
 * @module health/CapsuleHealthBoard
 */
import { computed } from 'vue';
import HealthAlertList from './HealthAlertList.vue';
import HealthCapsuleRow from './HealthCapsuleRow.vue';
import HealthTelemetryStrip from './HealthTelemetryStrip.vue';
import { isHealthEntityId } from './healthModel.js';

const props = defineProps({
  capsules: {
    type: Array,
    default: () => [],
  },
  alerts: {
    type: Array,
    default: () => [],
  },
  heading: {
    type: String,
    default: 'Capsule health',
  },
});

const emit = defineEmits(['submit-intent']);

const hasCapsules = computed(() => props.capsules.length > 0);

/**
 * @param {unknown} capsule
 * @param {number} index
 * @returns {string} Stable list key (identity when valid, indexed fallback otherwise).
 */
function rowKey(capsule, index) {
  const id = capsule !== null && typeof capsule === 'object'
    ? /** @type {Record<string, unknown>} */ (capsule).id
    : undefined;
  return isHealthEntityId(id) ? /** @type {string} */ (id) : `unknown-${index}`;
}

/**
 * @param {unknown} capsule
 * @param {number} index
 * @returns {string} Capsule id for the telemetry strip.
 */
function stripCapsuleId(capsule, index) {
  const id = capsule !== null && typeof capsule === 'object'
    ? /** @type {Record<string, unknown>} */ (capsule).id
    : undefined;
  return isHealthEntityId(id) ? /** @type {string} */ (id) : `unknown-${index}`;
}

/**
 * @param {unknown} capsule
 * @returns {string} Capsule label for the telemetry strip.
 */
function stripLabel(capsule) {
  const label = capsule !== null && typeof capsule === 'object'
    ? /** @type {Record<string, unknown>} */ (capsule).label
    : undefined;
  return typeof label === 'string' ? label : '';
}

/**
 * @param {unknown} capsule
 * @returns {unknown[]} Host telemetry list (empty when the host gave none).
 */
function stripMetrics(capsule) {
  const telemetry = capsule !== null && typeof capsule === 'object'
    ? /** @type {Record<string, unknown>} */ (capsule).telemetry
    : undefined;
  return Array.isArray(telemetry) ? [...telemetry] : [];
}

/**
 * @param {unknown} intent - Intent payload from the alert list.
 */
function forwardIntent(intent) {
  emit('submit-intent', intent);
}
</script>

<template>
  <section id="cuk-health-board" class="health-board" role="region" :aria-label="props.heading">
    <h2 class="health-board__title">{{ props.heading }}</h2>
    <section id="cuk-health-capsules" class="health-board__section" aria-label="Capsule states">
      <table v-if="hasCapsules" id="cuk-health-capsule-table" class="health-board__table">
        <thead>
          <tr>
            <th scope="col">Capsule</th>
            <th scope="col">State</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          <HealthCapsuleRow
            v-for="(capsule, index) in props.capsules"
            :key="rowKey(capsule, index)"
            :capsule="capsule"
          />
        </tbody>
      </table>
      <p v-else class="health-board__empty" role="status">No capsules.</p>
    </section>
    <section id="cuk-health-telemetry" class="health-board__section" aria-label="Telemetry">
      <HealthTelemetryStrip
        v-for="(capsule, index) in props.capsules"
        :key="'strip-' + rowKey(capsule, index)"
        :capsule-id="stripCapsuleId(capsule, index)"
        :capsule-label="stripLabel(capsule)"
        :metrics="stripMetrics(capsule)"
      />
      <p v-if="!hasCapsules" class="health-board__empty" role="status">No telemetry available.</p>
    </section>
    <section id="cuk-health-alerts" class="health-board__section" aria-label="Alerts">
      <HealthAlertList :alerts="props.alerts" @submit-intent="forwardIntent" />
    </section>
  </section>
</template>

<style scoped>
.health-board {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.health-board__title {
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-section-title-font-family);
  font-size: var(--cuk-semantic-typography-roles-section-title-font-size);
  color: var(--cuk-semantic-text-primary);
}
.health-board__section {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
}
.health-board__table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.health-board__table th {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  text-align: left;
  font-family: var(--cuk-semantic-typography-roles-table-header-font-family);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-semantic-typography-roles-table-header-font-weight);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  text-transform: var(--cuk-semantic-typography-roles-table-header-text-transform);
  color: var(--cuk-semantic-text-muted);
}
.health-board__empty {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
</style>
