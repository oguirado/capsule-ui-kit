<script setup>
/**
 * Fleet bulk bar: fold, hide and stop intents over the host selection.
 * Generic presentation; the host supplies the selection and performs every action.
 * The bar emits `submit-intent` only and writes nothing. While the selection is
 * empty the buttons stay disabled and carry the literal reason.
 * @module fleet/FleetBulkBar
 */
import { computed } from 'vue';
import {
  FLEET_BULK_FOLD_ACCESSIBLE_NAME,
  FLEET_BULK_FOLD_ANCHOR,
  FLEET_BULK_FOLD_DOM_ID,
  FLEET_BULK_HIDE_ACCESSIBLE_NAME,
  FLEET_BULK_HIDE_ANCHOR,
  FLEET_BULK_HIDE_DOM_ID,
  FLEET_BULK_STOP_ACCESSIBLE_NAME,
  FLEET_BULK_STOP_ANCHOR,
  FLEET_BULK_STOP_DOM_ID,
  FLEET_FOLD_INTENT,
  FLEET_HIDE_INTENT,
  FLEET_STOP_INTENT,
  buildFleetBulkIntent,
  fleetBulkReason,
  normalizeSelectedIds,
} from './fleetModel.js';

const props = defineProps({
  selectedIds: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['submit-intent']);

const normalizedIds = computed(() => normalizeSelectedIds(props.selectedIds));
const isEmpty = computed(() => normalizedIds.value.length === 0);
const reason = computed(() => fleetBulkReason(props.selectedIds));
const countText = computed(() => (
  isEmpty.value ? 'No capsules selected.' : `${normalizedIds.value.length} selected.`
));

/**
 * @param {string} type - Bulk intent type from the fleet vocabulary.
 */
function requestBulk(type) {
  emit('submit-intent', buildFleetBulkIntent(type, normalizedIds.value));
}

/**
 * @param {string} type - Bulk intent type from the fleet vocabulary.
 * @returns {boolean} Whether the button for the intent is available.
 */
function isAvailable(type) {
  return !isEmpty.value
    && (type === FLEET_FOLD_INTENT || type === FLEET_HIDE_INTENT || type === FLEET_STOP_INTENT);
}
</script>

<template>
  <section id="cuk-fleet-bulk" class="fleet-bulk" aria-label="Bulk actions">
    <p id="cuk-fleet-bulk-count" class="fleet-bulk__count" role="status">{{ countText }}</p>
    <div class="fleet-bulk__buttons">
      <button
        :id="FLEET_BULK_FOLD_DOM_ID"
        class="fleet-bulk__button"
        type="button"
        :disabled="!isAvailable(FLEET_FOLD_INTENT)"
        :aria-label="FLEET_BULK_FOLD_ACCESSIBLE_NAME"
        :data-semantic-anchor="FLEET_BULK_FOLD_ANCHOR"
        @click="requestBulk(FLEET_FOLD_INTENT)"
      >
        Fold selected
      </button>
      <button
        :id="FLEET_BULK_HIDE_DOM_ID"
        class="fleet-bulk__button"
        type="button"
        :disabled="!isAvailable(FLEET_HIDE_INTENT)"
        :aria-label="FLEET_BULK_HIDE_ACCESSIBLE_NAME"
        :data-semantic-anchor="FLEET_BULK_HIDE_ANCHOR"
        @click="requestBulk(FLEET_HIDE_INTENT)"
      >
        Hide selected
      </button>
      <button
        :id="FLEET_BULK_STOP_DOM_ID"
        class="fleet-bulk__button fleet-bulk__button-danger"
        type="button"
        :disabled="!isAvailable(FLEET_STOP_INTENT)"
        :aria-label="FLEET_BULK_STOP_ACCESSIBLE_NAME"
        :data-semantic-anchor="FLEET_BULK_STOP_ANCHOR"
        @click="requestBulk(FLEET_STOP_INTENT)"
      >
        Stop selected
      </button>
    </div>
    <p v-if="reason !== null" id="cuk-fleet-bulk-reason" class="fleet-bulk__reason" role="status">
      {{ reason }}
    </p>
  </section>
</template>

<style scoped>
.fleet-bulk {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.fleet-bulk__count,
.fleet-bulk__reason {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-secondary);
}
.fleet-bulk__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-xs);
}
.fleet-bulk__button {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  cursor: pointer;
}
.fleet-bulk__button:disabled {
  color: var(--cuk-semantic-text-muted);
  cursor: not-allowed;
}
.fleet-bulk__button-danger {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
</style>
