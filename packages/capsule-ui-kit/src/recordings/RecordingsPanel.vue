<script>
/**
 * Generic recordings panel (RAM recording control plus manifest list with
 * explicit export to a host-chosen destination). Plain JavaScript with
 * JSDoc; no imports; no product names. Contract-compatible with the kit
 * intent vocabulary: emits `submit-intent` with `{ type, capsuleId, ... }`
 * built by `recordingsIntents.js`. The kit renders host projections only;
 * it performs no disk, network or clipboard writes itself.
 * @module recordings/RecordingsPanel
 */

/**
 * Emits declared by this component (single intent channel).
 * @type {ReadonlyArray<string>}
 */
export const RECORDINGS_PANEL_EMITS = Object.freeze(['submit-intent']);

/** Recording axis phases. @type {ReadonlyArray<string>} */
export const RECORDING_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/**
 * Literal reason shown when export has no host destination.
 * @type {string}
 */
export const EXPORT_DESTINATION_REASON = 'No export destination advertised by the host';

/**
 * Literal reason shown when export targets a recording that is not sealed.
 * @type {string}
 */
export const EXPORT_UNSEALED_REASON = 'Only sealed recordings can be exported';

/**
 * Empty-list copy (generic, placeholder-free).
 * @type {string}
 */
export const RECORDINGS_EMPTY_TEXT = 'No recordings yet.';

/**
 * @param {unknown} phase
 * @returns {string} Known record phase, falling back to `idle`.
 */
export function normalizeRecordPhase(phase) {
  return RECORDING_PHASES.includes(/** @type {string} */ (phase))
    ? /** @type {string} */ (phase)
    : 'idle';
}

/**
 * Formats a host-projected elapsed-seconds count as `MM:SS`.
 * Unreadable values render `--:--`, never a fabricated zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatElapsed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return '--:--';
  }
  const total = Math.floor(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Formats a host-projected counter (frames, dropped, duplicated).
 * Unreadable values render `Unknown`, never a fabricated zero.
 * @param {unknown} value
 * @returns {string}
 */
export function formatCount(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return 'Unknown';
  }
  return String(value);
}

/**
 * Formats a host-projected TTL in seconds. Unreadable values render
 * `Unknown`, never a fabricated zero; a spent TTL renders `Expired`.
 * @param {unknown} value
 * @returns {string}
 */
export function formatTtl(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Unknown';
  }
  if (value <= 0) {
    return 'Expired';
  }
  return formatElapsed(value);
}

/**
 * @param {unknown} store
 * @returns {string} Store chip label (`RAM` or `Unknown`).
 */
export function storeLabel(store) {
  return store === 'ram' ? 'RAM' : 'Unknown';
}

/**
 * @param {unknown} phase
 * @returns {string} Human phase label for manifest chips.
 */
export function phaseLabel(phase) {
  const normalized = normalizeRecordPhase(phase);
  if (normalized === 'idle') return 'Idle';
  if (normalized === 'starting') return 'Starting';
  if (normalized === 'recording') return 'Recording';
  if (normalized === 'stopping') return 'Stopping';
  if (normalized === 'sealed') return 'Sealed';
  return 'Error';
}

/**
 * @param {unknown} phase
 * @returns {string} Status tone for the phase chip.
 */
export function phaseTone(phase) {
  const normalized = normalizeRecordPhase(phase);
  if (normalized === 'recording') return 'error';
  if (normalized === 'starting' || normalized === 'stopping') return 'warning';
  if (normalized === 'sealed') return 'success';
  if (normalized === 'error') return 'error';
  return 'neutral';
}

/**
 * @param {{ error?: unknown, phase?: unknown }} row
 * @returns {string} Host-supplied error text, or `Unknown error` when absent.
 */
export function rowErrorText(row) {
  if (normalizeRecordPhase(row.phase) !== 'error') return '';
  if (typeof row.error === 'string' && row.error.trim().length > 0) return row.error;
  return 'Unknown error';
}

/**
 * @param {{ id?: unknown, capsuleLabel?: unknown, capsuleId?: unknown }} row
 * @returns {string} Human label used inside accessible names.
 */
function rowLabel(row) {
  if (typeof row.capsuleLabel === 'string' && row.capsuleLabel.trim().length > 0) {
    return row.capsuleLabel.trim();
  }
  if (typeof row.id === 'string' && row.id.length > 0) return row.id;
  return typeof row.capsuleId === 'string' ? row.capsuleId : 'recording';
}

/**
 * Export gate for one manifest row: sealed recordings export to the
 * host-chosen destination only; every refusal carries a literal reason.
 * Precedence: panel unavailable reason, unsealed phase, missing destination.
 * @param {{ phase?: unknown, destination?: unknown, unavailableReason?: unknown }} input
 * @returns {{ disabled: boolean, reason: string, gate: string, gateLabel: string }}
 */
export function exportGateFor(input) {
  if (typeof input.unavailableReason === 'string' && input.unavailableReason.length > 0) {
    return Object.freeze({
      disabled: true,
      reason: input.unavailableReason,
      gate: 'unavailable',
      gateLabel: 'Unavailable',
    });
  }
  if (normalizeRecordPhase(input.phase) !== 'sealed') {
    return Object.freeze({
      disabled: true,
      reason: EXPORT_UNSEALED_REASON,
      gate: 'sealed-required',
      gateLabel: 'Sealed required',
    });
  }
  if (
    typeof input.destination !== 'string' ||
    input.destination.length === 0 ||
    input.destination !== input.destination.trim()
  ) {
    return Object.freeze({
      disabled: true,
      reason: EXPORT_DESTINATION_REASON,
      gate: 'destination-required',
      gateLabel: 'Destination required',
    });
  }
  return Object.freeze({ disabled: false, reason: '', gate: 'ready', gateLabel: 'Export ready' });
}

/**
 * @param {{ id?: unknown, capsuleLabel?: unknown, capsuleId?: unknown }} row
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function selectAccessibleName(row) {
  return `Select ${rowLabel(row)}`;
}

/**
 * @param {{ id?: unknown, capsuleLabel?: unknown, capsuleId?: unknown }} row
 * @returns {string} Stable accessible name (agent_lane/v1).
 */
export function exportAccessibleName(row) {
  return `Export ${rowLabel(row)} to host destination`;
}

/**
 * @param {string} capsuleId
 * @returns {string} Stable DOM id for the panel.
 */
export function panelDomId(capsuleId) {
  return `cuk-recordings-panel-${capsuleId}`;
}

/**
 * @param {string} recordingId
 * @returns {string} Stable DOM id for a manifest row.
 */
export function manifestRowDomId(recordingId) {
  return `cuk-recordings-row-${recordingId}`;
}

/**
 * @param {string} recordingId
 * @returns {string} Stable DOM id for a row select control.
 */
export function manifestSelectDomId(recordingId) {
  return `cuk-recordings-select-${recordingId}`;
}

/**
 * @param {string} recordingId
 * @returns {string} Stable DOM id for a row export control.
 */
export function exportDomId(recordingId) {
  return `cuk-recordings-export-${recordingId}`;
}

/**
 * @param {string} recordingId
 * @returns {string} Stable DOM id for a row export gate readout.
 */
export function exportGateDomId(recordingId) {
  return `cuk-recordings-gate-${recordingId}`;
}

/**
 * @param {string} recordingId
 * @returns {string} Semantic anchor for a manifest row.
 */
export function manifestRowAnchor(recordingId) {
  return `recording/${recordingId}/row`;
}

/**
 * @param {string} recordingId
 * @returns {string} Semantic anchor for a row select control.
 */
export function manifestSelectAnchor(recordingId) {
  return `recording/${recordingId}/select`;
}

/**
 * @param {string} recordingId
 * @returns {string} Semantic anchor for a row export control.
 */
export function exportAnchor(recordingId) {
  return `recording/${recordingId}/export`;
}

/**
 * @param {string} recordingId
 * @returns {string} Semantic anchor for a row export gate readout.
 */
export function exportGateAnchor(recordingId) {
  return `recording/${recordingId}/export-gate`;
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {{ capsuleId: string, capsuleLabel: string, phase: string, elapsedSeconds: null, store: string, screenshotState: string, recordings: Array<Record<string, any>>, selectedId: null, exportDestination: null, disabled: boolean, unavailableReason: string }}
 */
export function recordingsPanelFixture(overrides = {}) {
  return {
    capsuleId: 'cap-01',
    capsuleLabel: 'Capsule-01',
    phase: 'idle',
    elapsedSeconds: null,
    store: 'ram',
    screenshotState: 'idle',
    recordings: [
      {
        id: 'rec-01',
        capsuleId: 'cap-01',
        capsuleLabel: 'Capsule-01',
        phase: 'sealed',
        store: 'ram',
        elapsedSeconds: 125,
        frames: 3750,
        dropped: 0,
        duplicated: 0,
        ttlSeconds: 600,
        sealedAt: 't-sealed',
        error: '',
      },
    ],
    selectedId: null,
    exportDestination: null,
    disabled: false,
    unavailableReason: '',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
import RecordingControlBar from './RecordingControlBar.vue';
import { buildRecordingExportIntent, buildRecordingSelectIntent } from './recordingsIntents.js';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  phase: { type: String, default: 'idle' },
  elapsedSeconds: { type: Number, default: null },
  store: { type: String, default: 'ram' },
  screenshotState: { type: String, default: 'idle' },
  recordings: { type: Array, default: () => [] },
  selectedId: { type: String, default: null },
  exportDestination: { type: String, default: null },
  disabled: { type: Boolean, default: false },
  unavailableReason: { type: String, default: '' },
});

const emit = defineEmits(['submit-intent']);

const panelId = computed(() => panelDomId(props.capsuleId));
const panelName = computed(() => {
  const label = (props.capsuleLabel || '').trim() || props.capsuleId;
  return `RAM recordings for ${label}`;
});
const hasRows = computed(() => Array.isArray(props.recordings) && props.recordings.length > 0);
const rowCount = computed(() => (Array.isArray(props.recordings) ? props.recordings.length : 0));
const emptyText = RECORDINGS_EMPTY_TEXT;

/**
 * Display rows: every manifest field is resolved through the plain-script
 * helpers here, so the template only touches setup bindings (kit SFC
 * convention: plain-script exports are module scope, not template scope).
 */
const displayRows = computed(() => {
  if (!Array.isArray(props.recordings)) return [];
  return props.recordings.map((row) => {
    const source = row !== null && typeof row === 'object' ? row : {};
    const id = typeof source.id === 'string' && source.id.length > 0 ? source.id : 'unknown';
    const gate = exportGateFor({
      phase: source.phase,
      destination: props.exportDestination,
      unavailableReason: props.unavailableReason,
    });
    const held = props.disabled && !gate.disabled;
    return {
      source,
      key: id,
      id,
      selected: props.selectedId === id,
      rowDomId: manifestRowDomId(id),
      rowAnchor: manifestRowAnchor(id),
      selectDomId: manifestSelectDomId(id),
      selectAnchor: manifestSelectAnchor(id),
      selectName: selectAccessibleName(source),
      exportDomId: exportDomId(id),
      exportAnchor: exportAnchor(id),
      exportName: exportAccessibleName(source),
      gateDomId: exportGateDomId(id),
      gateAnchor: exportGateAnchor(id),
      gate: held ? 'unavailable' : gate.gate,
      gateLabel: held ? 'Unavailable' : gate.gateLabel,
      exportDisabled: gate.disabled || props.disabled,
      exportReason: gate.reason || props.unavailableReason,
      phaseText: phaseLabel(source.phase),
      phaseTone: phaseTone(source.phase),
      storeText: storeLabel(source.store),
      elapsedText: formatElapsed(source.elapsedSeconds),
      framesText: formatCount(source.frames),
      droppedText: formatCount(source.dropped),
      duplicatedText: formatCount(source.duplicated),
      ttlText: formatTtl(source.ttlSeconds),
      errorText: rowErrorText(source),
    };
  });
});

function onControlIntent(payload) {
  emit('submit-intent', payload);
}

/**
 * @param {{ source: Record<string, any> }} entry
 */
function onSelect(entry) {
  if (props.disabled) return;
  const row = entry.source;
  emit(
    'submit-intent',
    buildRecordingSelectIntent({
      capsuleId: typeof row.capsuleId === 'string' ? row.capsuleId : props.capsuleId,
      recordingId: row.id,
    }),
  );
}

/**
 * @param {{ source: Record<string, any>, exportDisabled: boolean }} entry
 */
function onExport(entry) {
  if (entry.exportDisabled) return;
  const row = entry.source;
  emit(
    'submit-intent',
    buildRecordingExportIntent({
      capsuleId: typeof row.capsuleId === 'string' ? row.capsuleId : props.capsuleId,
      recordingId: row.id,
      phase: row.phase,
      destination: props.exportDestination,
    }),
  );
}
</script>

<template>
  <section :id="panelId" class="rec-panel" role="region" :aria-label="panelName">
    <div class="rec-panel-head">
      <h2 class="rec-panel-title">Recordings</h2>
      <span class="rec-panel-count" :title="'Manifest rows ' + rowCount">{{ rowCount }}</span>
    </div>
    <RecordingControlBar
      :capsule-id="capsuleId"
      :capsule-label="capsuleLabel"
      :phase="phase"
      :elapsed-seconds="elapsedSeconds"
      :store="store"
      :screenshot-state="screenshotState"
      :disabled="disabled"
      :unavailable-reason="unavailableReason"
      @submit-intent="onControlIntent"
    />
    <p v-if="!hasRows" class="rec-empty" role="status">{{ emptyText }}</p>
    <table v-else class="rec-table" aria-label="RAM recordings manifest">
      <thead>
        <tr>
          <th scope="col">Recording</th>
          <th scope="col">Phase</th>
          <th scope="col">Store</th>
          <th scope="col">Elapsed</th>
          <th scope="col">Frames</th>
          <th scope="col">TTL</th>
          <th scope="col">Export gate</th>
          <th scope="col"><span class="rec-visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="entry in displayRows"
          :key="entry.key"
          :id="entry.rowDomId"
          role="row"
          :class="'rec-row' + (entry.selected ? ' rec-row-selected' : '')"
          :data-semantic-anchor="entry.rowAnchor"
          :aria-selected="entry.selected ? 'true' : undefined"
        >
          <td>
            <button
              :id="entry.selectDomId"
              type="button"
              role="button"
              class="rec-select"
              :data-semantic-anchor="entry.selectAnchor"
              :aria-label="entry.selectName"
              :title="entry.selectName"
              :disabled="disabled"
              @click="onSelect(entry)"
            >
              {{ entry.id }}
            </button>
            <span v-if="entry.errorText" class="rec-row-error" :title="entry.errorText">{{ entry.errorText }}</span>
          </td>
          <td>
            <span :class="'rec-chip rec-tone-' + entry.phaseTone" :title="'Phase ' + entry.phaseText">{{ entry.phaseText }}</span>
          </td>
          <td>
            <span class="rec-chip" :title="'Store ' + entry.storeText">{{ entry.storeText }}</span>
          </td>
          <td class="rec-mono">
            {{ entry.elapsedText }}
          </td>
          <td class="rec-mono" :title="'Dropped ' + entry.droppedText + ', duplicated ' + entry.duplicatedText">
            {{ entry.framesText }}
          </td>
          <td class="rec-mono">
            {{ entry.ttlText }}
          </td>
          <td>
            <span
              :id="entry.gateDomId"
              :class="'rec-chip rec-gate rec-gate-' + entry.gate"
              role="status"
              :data-semantic-anchor="entry.gateAnchor"
              :title="entry.exportReason || entry.gateLabel"
            >{{ entry.gateLabel }}</span>
          </td>
          <td>
            <button
              :id="entry.exportDomId"
              type="button"
              role="button"
              class="rec-export"
              :data-semantic-anchor="entry.exportAnchor"
              :aria-label="entry.exportName"
              :title="entry.exportReason || entry.exportName"
              :disabled="entry.exportDisabled"
              :data-unavailable-reason="entry.exportReason || undefined"
              @click="onExport(entry)"
            >
              Export
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style>
.rec-panel {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-4);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-panel);
}
.rec-panel-head {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
}
.rec-panel-title {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  color: var(--cuk-semantic-text-primary);
  font-weight: var(--cuk-primitive-font-weight-medium);
}
.rec-panel-count {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.rec-empty {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-muted);
}
.rec-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-primary);
}
.rec-table thead th {
  height: var(--cuk-primitive-space-10);
  padding: 0 var(--cuk-primitive-space-3);
  text-align: left;
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  font-weight: var(--cuk-primitive-font-weight-medium);
  color: var(--cuk-semantic-text-muted);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  white-space: nowrap;
}
.rec-table tbody td {
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-3);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  vertical-align: middle;
  white-space: nowrap;
}
.rec-row-selected {
  background: color-mix(in srgb, var(--cuk-semantic-status-info-surface) 55%, transparent);
}
.rec-mono {
  font-family: var(--cuk-semantic-typography-font-family-mono);
  color: var(--cuk-semantic-text-muted);
}
.rec-chip {
  display: inline-flex;
  align-items: center;
  height: var(--cuk-primitive-space-8);
  padding: 0 var(--cuk-primitive-space-3);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-primitive-font-weight-medium);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  white-space: nowrap;
}
.rec-tone-success {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.rec-tone-warning {
  color: var(--cuk-semantic-status-warning-text);
  background: var(--cuk-semantic-status-warning-surface);
  border-color: var(--cuk-semantic-status-warning-border);
}
.rec-tone-error {
  color: var(--cuk-semantic-status-error-text);
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
}
.rec-gate-ready {
  color: var(--cuk-semantic-status-success-text);
  background: var(--cuk-semantic-status-success-surface);
  border-color: var(--cuk-semantic-status-success-border);
}
.rec-select {
  background: none;
  border: none;
  padding: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-semantic-text-primary);
  text-decoration: underline;
  cursor: pointer;
}
.rec-select:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
  text-decoration: none;
}
.rec-row-error {
  display: block;
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  color: var(--cuk-semantic-status-error-text);
  white-space: normal;
}
.rec-export {
  display: inline-flex;
  align-items: center;
  height: var(--cuk-primitive-space-12);
  padding: 0 var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-default);
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
}
.rec-export:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.rec-select:focus-visible,
.rec-export:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: 1px;
}
.rec-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .rec-panel * { animation: none; }
}
</style>
