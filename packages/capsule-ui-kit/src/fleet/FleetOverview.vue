<script setup>
/**
 * Fleet overview: capsule census as a table or compact cards, with selection, a
 * bulk-intent bar and an inspector slot. Generic presentation; the host supplies
 * the census and the selection and performs every action. The overview emits
 * `submit-intent` only and writes nothing. Unknown or unavailable data renders as
 * such, never as faked zeros. The `inspector` slot receives the resolved capsule;
 * its default fallback renders a read-only key-value summary.
 * @module fleet/FleetOverview
 */
import { computed } from 'vue';
import FleetBulkBar from './FleetBulkBar.vue';
import {
  FLEET_EMPTY_TEXT,
  FLEET_INSPECTOR_EMPTY_TEXT,
  FLEET_UNKNOWN_TEXT,
  buildFleetSelectIntent,
  fleetCardDomId,
  fleetInspectorAccessibleName,
  fleetInspectorAnchor,
  fleetInspectorCapsule,
  fleetInspectorDomId,
  fleetInputModeLabel,
  fleetKindLabel,
  fleetRowAccessibleName,
  fleetRowAnchor,
  fleetRowDomId,
  fleetSelectAccessibleName,
  fleetSelectAnchor,
  fleetSelectDomId,
  fleetStateTone,
  formatFleetResourceValue,
  formatFleetUptime,
  isFleetEntityId,
  isFleetSelected,
  normalizeFleetCapsule,
  normalizeFleetLayout,
  normalizeSelectedIds,
} from './fleetModel.js';

const props = defineProps({
  capsules: {
    type: Array,
    default: () => [],
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
  layout: {
    type: String,
    default: 'table',
  },
  heading: {
    type: String,
    default: 'Fleet overview',
  },
});

const emit = defineEmits(['submit-intent']);

const normalizedCapsules = computed(() => (
  Array.isArray(props.capsules) ? props.capsules.map(normalizeFleetCapsule) : []
));
const normalizedLayout = computed(() => normalizeFleetLayout(props.layout));
const normalizedSelection = computed(() => normalizeSelectedIds(props.selectedIds));
const hasCapsules = computed(() => normalizedCapsules.value.length > 0);
const inspectorCapsule = computed(() => (
  fleetInspectorCapsule(props.capsules, props.selectedIds)
));
const inspectorId = computed(() => (
  inspectorCapsule.value === null ? FLEET_UNKNOWN_TEXT : inspectorCapsule.value.id
));
const inspectorDomId = computed(() => fleetInspectorDomId(inspectorId.value));
const inspectorAnchor = computed(() => fleetInspectorAnchor(inspectorId.value));
const inspectorName = computed(() => fleetInspectorAccessibleName(inspectorCapsule.value));

/**
 * @param {unknown} capsule
 * @param {number} index
 * @returns {string} Stable list key (identity when valid, indexed fallback otherwise).
 */
function rowKey(capsule, index) {
  const id = capsule !== null && typeof capsule === 'object'
    ? /** @type {Record<string, unknown>} */ (capsule).id
    : undefined;
  return isFleetEntityId(id) ? /** @type {string} */ (id) : `unknown-${index}`;
}

/**
 * @param {unknown} capsuleId
 * @returns {boolean} Whether the capsule is selected.
 */
function selected(capsuleId) {
  return isFleetSelected(normalizedSelection.value, capsuleId);
}

/**
 * @param {unknown} capsule - Normalized capsule record.
 */
function requestSelect(capsule) {
  const record = normalizeFleetCapsule(capsule);
  emit('submit-intent', buildFleetSelectIntent({
    capsuleId: record.id,
    selected: !selected(record.id),
  }));
}

/**
 * @param {unknown} intent - Intent payload from the bulk bar.
 */
function forwardIntent(intent) {
  emit('submit-intent', intent);
}

/**
 * @param {unknown} capsule - Normalized capsule record.
 * @returns {string} Compact resource line, `unknown` when the host gave none.
 */
function resourcesText(capsule) {
  const record = normalizeFleetCapsule(capsule);
  if (record.resources.length === 0) {
    return FLEET_UNKNOWN_TEXT;
  }
  return record.resources
    .map((resource) => `${resource.label} ${formatFleetResourceValue(resource.value, resource.unit)}`)
    .join(' · ');
}

/**
 * @param {unknown} capsule - Normalized capsule record.
 * @returns {string} Owner text, `unknown` when the host gave none.
 */
function ownerText(capsule) {
  return normalizeFleetCapsule(capsule).owner ?? FLEET_UNKNOWN_TEXT;
}

/**
 * @param {unknown} capsule - Normalized capsule record.
 * @returns {string} Session text, `unknown` when the host gave none.
 */
function sessionText(capsule) {
  return normalizeFleetCapsule(capsule).sessionId ?? FLEET_UNKNOWN_TEXT;
}

/**
 * @param {unknown} capsule - Normalized capsule record.
 * @returns {string} Epoch text, `unknown` when the host gave none.
 */
function epochText(capsule) {
  const epoch = normalizeFleetCapsule(capsule).epoch;
  return epoch === null ? FLEET_UNKNOWN_TEXT : String(epoch);
}
</script>

<template>
  <section id="cuk-fleet-overview" class="fleet-overview" role="region" :aria-label="props.heading">
    <h2 class="fleet-overview__title">{{ props.heading }}</h2>
    <FleetBulkBar :selected-ids="props.selectedIds" @submit-intent="forwardIntent" />
    <section id="cuk-fleet-census" class="fleet-overview__section" aria-label="Capsule census">
      <table v-if="hasCapsules && normalizedLayout === 'table'" id="cuk-fleet-table" class="fleet-table">
        <thead>
          <tr>
            <th scope="col">Capsule</th>
            <th scope="col">Kind</th>
            <th scope="col">State</th>
            <th scope="col">Owner / Mode</th>
            <th scope="col">Resources</th>
            <th scope="col">Uptime</th>
            <th scope="col">Select</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(capsule, index) in normalizedCapsules"
            :key="rowKey(capsule, index)"
            :id="fleetRowDomId(capsule.id)"
            :class="['fleet-table__row', { 'fleet-table__row-selected': selected(capsule.id) }]"
            role="row"
            :aria-label="fleetRowAccessibleName(capsule)"
            :data-semantic-anchor="fleetRowAnchor(capsule.id)"
          >
            <td class="fleet-table__capsule">
              <span class="fleet-table__id">{{ capsule.id }}</span>
              <span v-if="capsule.label !== capsule.id" class="fleet-table__label">{{ capsule.label }}</span>
            </td>
            <td><span class="fleet-chip">{{ fleetKindLabel(capsule.kind) }}</span></td>
            <td><span :class="'fleet-pill fleet-pill-' + fleetStateTone(capsule.state)">{{ capsule.state }}</span></td>
            <td class="fleet-table__owner">
              <span class="fleet-table__owner-name">{{ ownerText(capsule) }}</span>
              <span class="fleet-chip">{{ fleetInputModeLabel(capsule.inputMode) }}</span>
            </td>
            <td class="fleet-table__resources">{{ resourcesText(capsule) }}</td>
            <td class="fleet-table__uptime">{{ formatFleetUptime(capsule.uptimeSeconds) }}</td>
            <td>
              <button
                :id="fleetSelectDomId(capsule.id)"
                class="fleet-select"
                type="button"
                :aria-pressed="selected(capsule.id)"
                :aria-label="fleetSelectAccessibleName(capsule)"
                :data-semantic-anchor="fleetSelectAnchor(capsule.id)"
                @click="requestSelect(capsule)"
              >
                Select
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else-if="hasCapsules" id="cuk-fleet-cards" class="fleet-cards">
        <article
          v-for="(capsule, index) in normalizedCapsules"
          :key="'card-' + rowKey(capsule, index)"
          :id="fleetCardDomId(capsule.id)"
          :class="['fleet-card', { 'fleet-card-selected': selected(capsule.id) }]"
          :aria-label="fleetRowAccessibleName(capsule)"
        >
          <header class="fleet-card__header">
            <span class="fleet-table__id">{{ capsule.id }}</span>
            <button
              :id="fleetSelectDomId(capsule.id)"
              class="fleet-select"
              type="button"
              :aria-pressed="selected(capsule.id)"
              :aria-label="fleetSelectAccessibleName(capsule)"
              :data-semantic-anchor="fleetSelectAnchor(capsule.id)"
              @click="requestSelect(capsule)"
            >
              Select
            </button>
          </header>
          <p class="fleet-card__chips">
            <span class="fleet-chip">{{ fleetKindLabel(capsule.kind) }}</span>
            <span :class="'fleet-pill fleet-pill-' + fleetStateTone(capsule.state)">{{ capsule.state }}</span>
            <span class="fleet-chip">{{ fleetInputModeLabel(capsule.inputMode) }}</span>
          </p>
          <p class="fleet-card__line">Owner {{ ownerText(capsule) }}</p>
          <p class="fleet-card__line">{{ resourcesText(capsule) }}</p>
          <p class="fleet-card__line">Up {{ formatFleetUptime(capsule.uptimeSeconds) }}</p>
        </article>
      </div>
      <p v-else class="fleet-overview__empty" role="status">{{ FLEET_EMPTY_TEXT }}</p>
    </section>
    <section
      :id="inspectorDomId"
      class="fleet-overview__inspector"
      role="region"
      :aria-label="inspectorName"
      :data-semantic-anchor="inspectorAnchor"
    >
      <slot name="inspector" :capsule="inspectorCapsule">
        <dl v-if="inspectorCapsule !== null" class="fleet-inspector__list">
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Capsule</dt>
            <dd class="fleet-inspector__value">{{ inspectorCapsule.id }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Kind</dt>
            <dd class="fleet-inspector__value">{{ fleetKindLabel(inspectorCapsule.kind) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">State</dt>
            <dd class="fleet-inspector__value">{{ inspectorCapsule.state }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Owner</dt>
            <dd class="fleet-inspector__value">{{ ownerText(inspectorCapsule) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Mode</dt>
            <dd class="fleet-inspector__value">{{ fleetInputModeLabel(inspectorCapsule.inputMode) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Uptime</dt>
            <dd class="fleet-inspector__value">{{ formatFleetUptime(inspectorCapsule.uptimeSeconds) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Session</dt>
            <dd class="fleet-inspector__value">{{ sessionText(inspectorCapsule) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Epoch</dt>
            <dd class="fleet-inspector__value">{{ epochText(inspectorCapsule) }}</dd>
          </div>
          <div class="fleet-inspector__row">
            <dt class="fleet-inspector__key">Resources</dt>
            <dd class="fleet-inspector__value">{{ resourcesText(inspectorCapsule) }}</dd>
          </div>
        </dl>
        <p v-else class="fleet-overview__empty" role="status">{{ FLEET_INSPECTOR_EMPTY_TEXT }}</p>
      </slot>
    </section>
  </section>
</template>

<style scoped>
.fleet-overview {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.fleet-overview__title {
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-section-title-font-family);
  font-size: var(--cuk-semantic-typography-roles-section-title-font-size);
  color: var(--cuk-semantic-text-primary);
}
.fleet-overview__section,
.fleet-overview__inspector {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
}
.fleet-overview__inspector {
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.fleet-overview__empty {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.fleet-table {
  width: 100%;
  border-collapse: collapse;
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.fleet-table th {
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
.fleet-table td {
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  vertical-align: middle;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-cell-font-size);
  color: var(--cuk-semantic-text-secondary);
}
.fleet-table__row-selected td {
  background-color: var(--cuk-semantic-surface-elevated);
}
.fleet-table__capsule,
.fleet-table__owner {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
}
.fleet-table__id {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.fleet-table__label,
.fleet-table__owner-name {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.fleet-table__resources,
.fleet-table__uptime {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
}
.fleet-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
  gap: var(--cuk-semantic-spacing-sm);
}
.fleet-card {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-sm);
  background-color: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.fleet-card-selected {
  border-color: var(--cuk-semantic-status-info-border);
  background-color: var(--cuk-semantic-surface-elevated);
}
.fleet-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-semantic-spacing-xs);
}
.fleet-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-xxs);
  margin: 0;
}
.fleet-card__line {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-secondary);
}
.fleet-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  white-space: nowrap;
  color: var(--cuk-semantic-text-muted);
  background: var(--cuk-semantic-surface-elevated);
}
.fleet-pill {
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
.fleet-pill-success {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.fleet-pill-info {
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.fleet-pill-warning {
  color: var(--cuk-semantic-status-warning-text);
  background: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.fleet-pill-error {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
.fleet-select {
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
.fleet-select[aria-pressed="true"] {
  color: var(--cuk-semantic-status-info-text);
  background: var(--cuk-semantic-status-info-surface);
  border-color: var(--cuk-semantic-status-info-border);
}
.fleet-inspector__list {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xxs);
  margin: 0;
}
.fleet-inspector__row {
  display: flex;
  gap: var(--cuk-semantic-spacing-sm);
}
.fleet-inspector__key {
  min-width: 6rem;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-font-size);
  color: var(--cuk-semantic-text-muted);
}
.fleet-inspector__value {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
</style>
