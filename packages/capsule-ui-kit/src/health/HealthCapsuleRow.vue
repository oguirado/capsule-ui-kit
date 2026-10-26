<script setup>
/**
 * Per-capsule health row: identity, state pill and host reason.
 * Generic presentation; the host supplies the capsule record. Unknown states and
 * missing reasons render as `unknown`, never as invented values.
 * @module health/HealthCapsuleRow
 */
import { computed } from 'vue';
import {
  HEALTH_UNKNOWN_TEXT,
  healthCapsuleRowAccessibleName,
  healthCapsuleRowAnchor,
  healthCapsuleRowDomId,
  healthStateTone,
  normalizeHealthCapsule,
} from './healthModel.js';

const props = defineProps({
  capsule: {
    type: Object,
    required: true,
  },
});

const normalized = computed(() => normalizeHealthCapsule(props.capsule));
const rowDomId = computed(() => healthCapsuleRowDomId(normalized.value.id));
const anchor = computed(() => healthCapsuleRowAnchor(normalized.value.id));
const accessibleName = computed(() => healthCapsuleRowAccessibleName(normalized.value));
const tone = computed(() => healthStateTone(normalized.value.state));
const reasonText = computed(() => normalized.value.reason ?? HEALTH_UNKNOWN_TEXT);
const showLabel = computed(() => normalized.value.label !== normalized.value.id);
</script>

<template>
  <tr
    :id="rowDomId"
    class="health-row"
    role="row"
    :aria-label="accessibleName"
    :data-semantic-anchor="anchor"
  >
    <td class="health-row__capsule">
      <span class="health-row__id">{{ normalized.id }}</span>
      <span v-if="showLabel" class="health-row__label">{{ normalized.label }}</span>
    </td>
    <td class="health-row__state">
      <span :class="'health-pill health-pill-' + tone">{{ normalized.state }}</span>
    </td>
    <td class="health-row__reason">{{ reasonText }}</td>
  </tr>
</template>

<style scoped>
.health-row__capsule,
.health-row__state,
.health-row__reason {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  vertical-align: middle;
}
.health-row__capsule {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
}
.health-row__id {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.health-row__label {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.health-row__reason {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-cell-font-size);
  color: var(--cuk-semantic-text-secondary);
}
.health-pill {
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
.health-pill-success {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.health-pill-info {
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.health-pill-warning {
  color: var(--cuk-semantic-status-warning-text);
  background: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.health-pill-error {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
</style>
