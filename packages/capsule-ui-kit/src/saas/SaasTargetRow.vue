<script>
/**
 * @fileoverview SaaS broadcast target row: pure projection over the drawer target model.
 * Presentation only; G3/G4 eligibility and recipient-selection authority stay in the
 * drawer model and TargetPicker. Consumes model-evaluated eligibility via props.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const SAAS_TARGET_ROW_SCHEMA = 'capsule-ui-kit.saas-target-row/v1';

/**
 * @typedef {Object} SaasTargetDescriptor
 * @property {string} sessionId - Immutable target session identity.
 * @property {string} capsuleId - Bound capsule identity.
 * @property {string} [label] - Neutral display label (defaults to sessionId).
 * @property {boolean} eligible - Model-evaluated G3/G4 eligibility.
 * @property {string} [ineligibleCode] - Named refusal code when ineligible.
 * @property {string} [ineligibleReason] - Human-readable refusal reason when ineligible.
 * @property {string} [statusBadge] - Badge override (defaults to Ready/Ineligible).
 */

/**
 * @typedef {Object} SaasTargetRowView
 * @property {string} sessionId
 * @property {string} capsuleId
 * @property {string} label
 * @property {boolean} eligible
 * @property {boolean} checked
 * @property {string} anchor - Stable agent_lane anchor `drawer/targets/{sid}`.
 * @property {string} accessibleName
 * @property {string} statusBadge
 * @property {string | null} ineligibleCode
 * @property {string | null} ineligibleReason
 */

/**
 * Validates one target descriptor (fail-closed, no coercion of identities).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, descriptor: SaasTargetDescriptor } | { ok: false, code: string, message: string }}
 */
export function validateSaasTargetDescriptor(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, code: 'TARGET_NOT_OBJECT', message: 'Target descriptor must be an object.' };
  }
  const candidate = /** @type {Record<string, unknown>} */ (raw);
  if (typeof candidate.sessionId !== 'string' || candidate.sessionId.trim().length === 0) {
    return { ok: false, code: 'TARGET_BAD_SESSION_ID', message: 'Target sessionId must be a non-empty string.' };
  }
  if (typeof candidate.capsuleId !== 'string' || candidate.capsuleId.trim().length === 0) {
    return { ok: false, code: 'TARGET_BAD_CAPSULE_ID', message: 'Target capsuleId must be a non-empty string.' };
  }
  if (typeof candidate.eligible !== 'boolean') {
    return { ok: false, code: 'TARGET_BAD_ELIGIBILITY', message: 'Target eligible must be a model-evaluated boolean.' };
  }
  if (candidate.label !== undefined && typeof candidate.label !== 'string') {
    return { ok: false, code: 'TARGET_BAD_LABEL', message: 'Target label must be a string when present.' };
  }
  return { ok: true, descriptor: /** @type {SaasTargetDescriptor} */ (candidate) };
}

/**
 * Projects one descriptor into a checkbox row view with stable anchor and name.
 *
 * @param {SaasTargetDescriptor} descriptor
 * @param {readonly string[]} selectedIds
 * @returns {SaasTargetRowView}
 */
export function projectSaasTargetRow(descriptor, selectedIds) {
  const checked = selectedIds.includes(descriptor.sessionId);
  const label =
    typeof descriptor.label === 'string' && descriptor.label.trim().length > 0
      ? descriptor.label
      : descriptor.sessionId;
  const statusBadge =
    typeof descriptor.statusBadge === 'string' && descriptor.statusBadge.length > 0
      ? descriptor.statusBadge
      : descriptor.eligible
        ? 'Ready'
        : 'Ineligible';
  const ineligibleCode =
    typeof descriptor.ineligibleCode === 'string' && descriptor.ineligibleCode.length > 0
      ? descriptor.ineligibleCode
      : null;
  const ineligibleReason =
    typeof descriptor.ineligibleReason === 'string' && descriptor.ineligibleReason.length > 0
      ? descriptor.ineligibleReason
      : null;
  const accessibleName = descriptor.eligible
    ? `Target session ${descriptor.sessionId} (${descriptor.capsuleId}, ${statusBadge})`
    : `Target session ${descriptor.sessionId} (${descriptor.capsuleId}, ineligible${ineligibleReason ? `: ${ineligibleReason}` : ''})`;
  return Object.freeze({
    sessionId: descriptor.sessionId,
    capsuleId: descriptor.capsuleId,
    label,
    eligible: descriptor.eligible,
    checked,
    anchor: `drawer/targets/${descriptor.sessionId}`,
    accessibleName,
    statusBadge,
    ineligibleCode,
    ineligibleReason
  });
}

/**
 * Pure selection toggle; ineligible sessions never enter the selection.
 *
 * @param {readonly string[]} selectedIds
 * @param {string} sessionId
 * @param {boolean} eligible
 * @returns {readonly string[]}
 */
export function toggleSaasTargetSelection(selectedIds, sessionId, eligible) {
  if (!eligible) return Object.freeze([...selectedIds]);
  if (selectedIds.includes(sessionId)) {
    return Object.freeze(selectedIds.filter((id) => id !== sessionId));
  }
  return Object.freeze([...selectedIds, sessionId].sort());
}

/**
 * Selects every eligible session id in sorted order.
 *
 * @param {readonly SaasTargetRowView[]} rows
 * @returns {readonly string[]}
 */
export function selectAllSaasTargets(rows) {
  return Object.freeze(rows.filter((row) => row.eligible).map((row) => row.sessionId).sort());
}

/**
 * Summarizes the current selection for the Send gate and the live summary.
 *
 * @param {readonly SaasTargetRowView[]} rows
 * @param {readonly string[]} selectedIds
 * @returns {{ selected: number, eligible: number, total: number, sendBlockedByTargets: boolean }}
 */
export function summarizeSaasTargetSelection(rows, selectedIds) {
  const eligibleRows = rows.filter((row) => row.eligible);
  const selectedEligible = selectedIds.filter((id) =>
    eligibleRows.some((row) => row.sessionId === id)
  );
  return Object.freeze({
    selected: selectedEligible.length,
    eligible: eligibleRows.length,
    total: rows.length,
    sendBlockedByTargets: selectedEligible.length === 0
  });
}
</script>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  targets: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: /** @type {import('vue').PropType<string[]>} */ (Array),
    default: () => []
  },
  workspaceId: {
    type: String,
    default: 'workspace-default'
  },
  heading: {
    type: String,
    default: 'Broadcast Targets:'
  }
});

const emit = defineEmits(['update:modelValue', 'targets-changed']);

const selectedIds = computed(() =>
  Array.isArray(props.modelValue) ? [...props.modelValue] : []
);

const rows = computed(() => {
  if (!Array.isArray(props.targets)) return [];
  /** @type {SaasTargetRowView[]} */
  const views = [];
  for (const raw of props.targets) {
    const validated = validateSaasTargetDescriptor(raw);
    if (!validated.ok) continue;
    views.push(projectSaasTargetRow(validated.descriptor, selectedIds.value));
  }
  views.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return views;
});

const summary = computed(() => summarizeSaasTargetSelection(rows.value, selectedIds.value));

function applySelection(next) {
  const frozen = Object.freeze([...next].sort());
  emit('update:modelValue', [...frozen]);
  emit('targets-changed', { targetIds: [...frozen] });
}

function onToggle(sessionId, eligible) {
  applySelection(toggleSaasTargetSelection(selectedIds.value, sessionId, eligible));
}

function onSelectAll() {
  applySelection(selectAllSaasTargets(rows.value));
}

function onClear() {
  applySelection([]);
}
</script>

<template>
  <section
    class="saas-target-row"
    role="group"
    aria-label="Broadcast targets"
    :data-workspace-id="props.workspaceId"
  >
    <span class="saas-target-row__heading">{{ props.heading }}</span>
    <ul class="saas-target-row__list" role="list" aria-label="Dispatch target sessions">
      <li
        v-for="row in rows"
        :key="row.sessionId"
        class="saas-target-row__item"
        :class="{ 'saas-target-row__item--ineligible': !row.eligible }"
        :data-session-id="row.sessionId"
        :data-eligible="row.eligible ? 'true' : 'false'"
      >
        <label class="saas-target-row__label">
          <input
            :id="`cuk-saas-targets-${row.sessionId}`"
            type="checkbox"
            class="saas-target-row__checkbox"
            :data-semantic-anchor="row.anchor"
            :aria-label="row.accessibleName"
            :checked="row.checked"
            :disabled="!row.eligible"
            :aria-disabled="!row.eligible ? 'true' : 'false'"
            :title="!row.eligible && row.ineligibleReason ? row.ineligibleReason : row.accessibleName"
            @change="onToggle(row.sessionId, row.eligible)"
          />
          <span
            class="saas-target-row__name"
            :class="{ 'saas-target-row__name--struck': !row.eligible }"
          >{{ row.label }}</span>
          <span v-if="!row.eligible" class="saas-target-row__ineligible-chip">
            INELIGIBLE{{ row.ineligibleCode ? `: ${row.ineligibleCode}` : '' }}
          </span>
        </label>
      </li>
    </ul>
    <p v-if="rows.length === 0" class="saas-target-row__empty" role="status">
      No target sessions in this workspace.
    </p>
    <div class="saas-target-row__utilities">
      <button
        id="cuk-saas-targets-all"
        type="button"
        role="button"
        class="saas-target-row__select-all"
        data-semantic-anchor="drawer/targets/all"
        aria-label="Select all in workspace"
        :disabled="summary.eligible === 0"
        :aria-disabled="summary.eligible === 0 ? 'true' : 'false'"
        @click="onSelectAll"
      >
        Select all in workspace
      </button>
      <button
        id="cuk-saas-targets-clear"
        type="button"
        role="button"
        class="saas-target-row__clear"
        data-semantic-anchor="drawer/targets/clear"
        aria-label="Clear targets"
        :disabled="summary.selected === 0"
        :aria-disabled="summary.selected === 0 ? 'true' : 'false'"
        @click="onClear"
      >
        Clear
      </button>
      <span class="saas-target-row__summary" aria-live="polite">
        <template v-if="summary.selected === 0">No recipients selected (Send disabled)</template>
        <template v-else>{{ summary.selected }} target(s) selected</template>
      </span>
    </div>
  </section>
</template>

<style scoped>
.saas-target-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-sm) var(--cuk-semantic-spacing-lg);
  background-color: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
}
.saas-target-row__heading {
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.saas-target-row__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-semantic-spacing-lg);
  list-style: none;
  margin: var(--cuk-semantic-spacing-none);
  padding: var(--cuk-semantic-spacing-none);
}
.saas-target-row__item--ineligible {
  opacity: 0.6;
}
.saas-target-row__label {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  cursor: pointer;
}
.saas-target-row__item--ineligible .saas-target-row__label {
  cursor: not-allowed;
}
.saas-target-row__checkbox {
  width: var(--cuk-primitive-space-7);
  height: var(--cuk-primitive-space-7);
  border-radius: calc(var(--cuk-primitive-space-3) / 2);
  accent-color: var(--cuk-semantic-accent-primary);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-target-row__checkbox:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-target-row__name {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
  white-space: nowrap;
}
.saas-target-row__name--struck {
  text-decoration: line-through;
  color: var(--cuk-semantic-text-muted);
}
.saas-target-row__ineligible-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  white-space: nowrap;
}
.saas-target-row__empty {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  margin: var(--cuk-semantic-spacing-none);
}
.saas-target-row__utilities {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cuk-semantic-spacing-sm);
  margin-left: auto;
}
.saas-target-row__select-all {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-accent);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
}
.saas-target-row__clear {
  display: inline-flex;
  align-items: center;
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-sm);
  border: var(--cuk-semantic-border-width) solid transparent;
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: transparent;
  color: var(--cuk-semantic-text-muted);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
}
.saas-target-row__select-all:disabled,
.saas-target-row__clear:disabled {
  cursor: not-allowed;
  color: var(--cuk-semantic-text-disabled);
}
.saas-target-row__select-all:focus-visible,
.saas-target-row__clear:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.saas-target-row__summary {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .saas-target-row,
  .saas-target-row__label {
    transition: none;
  }
}
</style>
