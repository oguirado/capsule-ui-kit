<script setup>
/**
 * Alert list with severity, acknowledgement intents and filters.
 * Generic presentation; the host supplies every alert and performs every
 * acknowledgement. The list emits `submit-intent` only and writes nothing.
 * Unknown severities render as `unknown`, never as an invented level.
 * @module health/HealthAlertList
 */
import { computed, ref } from 'vue';
import {
  HEALTH_SEVERITY_FILTER_ANCHOR,
  HEALTH_SEVERITY_FILTER_DOM_ID,
  HEALTH_SEVERITY_FILTER_LABELS,
  HEALTH_SEVERITY_FILTERS,
  HEALTH_UNREAD_FILTER_ANCHOR,
  HEALTH_UNREAD_FILTER_DOM_ID,
  alertSeverityTone,
  buildAcknowledgeAlertIntent,
  buildFilterChangeIntent,
  filterHealthAlerts,
  healthAckAccessibleName,
  healthAckAnchor,
  healthAckDomId,
  healthAlertAccessibleName,
  healthAlertAnchor,
  healthAlertDomId,
  normalizeHealthAlert,
} from './healthModel.js';

const props = defineProps({
  alerts: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['submit-intent']);

const severity = ref('all');
const unreadOnly = ref(false);

const visibleAlerts = computed(() => filterHealthAlerts(props.alerts, {
  severity: severity.value,
  unreadOnly: unreadOnly.value,
}).map(normalizeHealthAlert));
const hasAlerts = computed(() => props.alerts.length > 0);

function emitFilterChange() {
  emit('submit-intent', buildFilterChangeIntent({
    severity: severity.value,
    unreadOnly: unreadOnly.value,
  }));
}

function onAcknowledge(alertId) {
  emit('submit-intent', buildAcknowledgeAlertIntent({ alertId }));
}
</script>

<template>
  <div class="health-alerts">
    <div class="health-alerts__filters">
      <label class="health-alerts__filter-label" :for="HEALTH_SEVERITY_FILTER_DOM_ID">Severity</label>
      <select
        :id="HEALTH_SEVERITY_FILTER_DOM_ID"
        v-model="severity"
        class="health-alerts__select"
        role="combobox"
        aria-label="Filter alerts by severity"
        :data-semantic-anchor="HEALTH_SEVERITY_FILTER_ANCHOR"
        @change="emitFilterChange"
      >
        <option v-for="option in HEALTH_SEVERITY_FILTERS" :key="option" :value="option">
          {{ HEALTH_SEVERITY_FILTER_LABELS[option] }}
        </option>
      </select>
      <label class="health-alerts__check" :for="HEALTH_UNREAD_FILTER_DOM_ID">
        <input
          :id="HEALTH_UNREAD_FILTER_DOM_ID"
          v-model="unreadOnly"
          type="checkbox"
          role="checkbox"
          aria-label="Show unread alerts only"
          :data-semantic-anchor="HEALTH_UNREAD_FILTER_ANCHOR"
          @change="emitFilterChange"
        />
        Unread only
      </label>
    </div>
    <ul v-if="visibleAlerts.length > 0" class="health-alerts__list" aria-label="Alerts">
      <li
        v-for="(alert, index) in visibleAlerts"
        :key="`${alert.id}-${index}`"
        :id="healthAlertDomId(alert.id)"
        class="health-alerts__item"
        role="alert"
        :aria-label="healthAlertAccessibleName(alert)"
        :data-semantic-anchor="healthAlertAnchor(alert.id)"
      >
        <span :class="'health-pill health-pill-' + alertSeverityTone(alert.severity)">
          {{ alert.severity }}
        </span>
        <div class="health-alerts__body">
          <p class="health-alerts__summary">{{ alert.summary }}</p>
          <p v-if="alert.detail" class="health-alerts__detail">{{ alert.detail }}</p>
          <p v-if="alert.capsuleId" class="health-alerts__capsule">{{ alert.capsuleId }}</p>
        </div>
        <button
          v-if="!alert.acknowledged"
          :id="healthAckDomId(alert.id)"
          type="button"
          class="health-alerts__ack"
          :aria-label="healthAckAccessibleName(alert.id)"
          :data-semantic-anchor="healthAckAnchor(alert.id)"
          @click="onAcknowledge(alert.id)"
        >
          Acknowledge
        </button>
        <span v-else class="health-alerts__acked" role="status">Acknowledged</span>
      </li>
    </ul>
    <p v-else-if="hasAlerts" class="health-alerts__empty" role="status">
      No alerts match the current filter.
    </p>
    <p v-else class="health-alerts__empty" role="status">No alerts.</p>
  </div>
</template>

<style scoped>
.health-alerts {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
}
.health-alerts__filters {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
}
.health-alerts__filter-label {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-alerts__select {
  height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-primitive-space-0) var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-primary);
}
.health-alerts__select:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.health-alerts__check {
  display: flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-secondary);
  cursor: pointer;
}
.health-alerts__check input:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.health-alerts__list {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
}
.health-alerts__item {
  display: flex;
  align-items: flex-start;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.health-alerts__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
}
.health-alerts__summary {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-cell-font-size);
  color: var(--cuk-semantic-text-primary);
}
.health-alerts__detail {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-secondary);
}
.health-alerts__capsule {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-alerts__ack {
  flex: none;
  height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-primitive-space-0) var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-interactive);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
}
.health-alerts__ack:hover {
  background-color: var(--cuk-semantic-surface-interactive-hover);
}
.health-alerts__ack:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.health-alerts__acked {
  flex: none;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-alerts__empty {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-elevated);
}
.health-pill-info {
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.health-pill-warning {
  color: var(--cuk-component-alert-board-warning-text);
  background: var(--cuk-component-alert-board-warning-surface);
  border-color: var(--cuk-component-alert-board-warning-border);
}
.health-pill-error {
  color: var(--cuk-component-alert-board-error-text);
  background: var(--cuk-component-alert-board-error-surface);
  border-color: var(--cuk-component-alert-board-error-border);
}
</style>
