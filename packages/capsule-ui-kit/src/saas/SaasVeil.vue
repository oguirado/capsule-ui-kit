<script>
/**
 * Generic SaaS state veils over the wall tile surface (SAAS-1 §3):
 * switching (amber), agent-held (sky), booting skeleton, error card.
 * Plain JavaScript with JSDoc; no imports; no product names.
 * @module saas/SaasVeil
 */

/** Veil kinds; `none` renders nothing. @type {ReadonlyArray<string>} */
export const SAAS_VEIL_KINDS = Object.freeze(['none', 'switching', 'ai-held', 'booting', 'error']);

/**
 * @param {unknown} kind
 * @returns {string} Known kind, falling back to `none`.
 */
export function normalizeVeilKind(kind) {
  return SAAS_VEIL_KINDS.includes(/** @type {string} */ (kind))
    ? /** @type {string} */ (kind)
    : 'none';
}

/**
 * Maps a generic backend projection to a veil kind. The explicit `veilKind`
 * prop always wins over this projection mapping.
 * @param {{ mode?: unknown, lifecycle?: unknown }|null|undefined} projection
 * @returns {string} One of `none|switching|ai-held|booting|error`.
 */
export function resolveSaasVeilKind(projection) {
  if (!projection || typeof projection !== 'object') return 'none';
  const lifecycle = projection.lifecycle;
  const mode = projection.mode;
  if (lifecycle === 'failed' || lifecycle === 'error') return 'error';
  if (mode === 'agent_locked' || mode === 'agent-held') return 'ai-held';
  if (mode === 'switching') return 'switching';
  if (lifecycle === 'booting' || lifecycle === 'starting') return 'booting';
  return 'none';
}

/**
 * @param {unknown} lines
 * @returns {Array<{ text: string, tone: string }>} At most 3 detail lines.
 */
export function visibleDetailLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 3).map((line) => {
    if (typeof line === 'string') return { text: line, tone: 'neutral' };
    const text = line && typeof line.text === 'string' ? line.text : '';
    const tone = line && (line.tone === 'critical' || line.tone === 'muted') ? line.tone : 'neutral';
    return { text, tone };
  });
}

/**
 * @param {unknown} stats
 * @returns {[{ key: string, value: string }, { key: string, value: string }]} Exactly 2 stat cells.
 */
export function visibleErrorStats(stats) {
  const fallback = { key: 'Unavailable', value: 'Unavailable' };
  const list = Array.isArray(stats) ? stats : [];
  const cell = (entry) => {
    if (!entry || typeof entry !== 'object') return { ...fallback };
    return {
      key: typeof entry.key === 'string' && entry.key ? entry.key : fallback.key,
      value: typeof entry.value === 'string' && entry.value ? entry.value : fallback.value,
    };
  };
  return [cell(list[0]), cell(list[1])];
}

/**
 * @param {string} capsuleId
 * @param {string} kind
 * @returns {{ veil: string, retry: string, export: string, override: string }} Stable DOM ids.
 */
export function veilDomIds(capsuleId, kind) {
  const scope = `cuk-saas-veil-${kind}-${capsuleId}`;
  return {
    veil: scope,
    retry: `${scope}-retry`,
    export: `${scope}-export`,
    override: `${scope}-override`,
  };
}

/**
 * @param {string} capsuleId
 * @returns {{ control: string, retry: string, export: string }} Semantic anchors.
 */
export function veilAnchors(capsuleId) {
  return {
    control: `capsule/${capsuleId}/control`,
    retry: `capsule/${capsuleId}/retry`,
    export: `capsule/${capsuleId}/export`,
  };
}

/**
 * @param {{ capsuleId: string, verb?: string }} input
 * @returns {{ capsuleId: string, verb: string }} Control payload (CapsulePanel shape).
 */
export function buildVeilControlPayload(input) {
  return Object.freeze({ capsuleId: input.capsuleId, verb: input.verb || 'take-control' });
}

/**
 * @param {{ type: string, capsuleId: string }} input
 * @returns {{ type: string, capsuleId: string }} Intent payload (CapsulePanel shape).
 */
export function buildVeilIntent(input) {
  return Object.freeze({ type: input.type, capsuleId: input.capsuleId });
}

/**
 * Generic fixture-driven demo props; neutral labels only.
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>} Fixture props.
 */
export function saasVeilFixture(overrides = {}) {
  return {
    capsuleId: 'capsule-01',
    capsuleLabel: 'Capsule-01',
    veilKind: 'switching',
    projection: null,
    switchingBanner: 'Switching identity context',
    switchingNote: 'Waiting for clearance confirmation',
    agentLabel: 'Agent-01',
    agentNote: 'Autonomous maintenance in progress. Operator override revokes the lease.',
    overridePending: false,
    overrideReason: '',
    cid: 'CID: capsule-01',
    faultLine: 'FAULT: surface backend unavailable',
    detailLines: [
      { text: 'CRITICAL: surface backend stopped responding.', tone: 'critical' },
      { text: 'Last frame acknowledged; no new frames accepted.', tone: 'neutral' },
      { text: 'Retry re-attaches the live surface.', tone: 'muted' },
    ],
    stats: [
      { key: 'UPTIME AT FAULT', value: '18h 42m' },
      { key: 'SEALED BYTES', value: '4.2 MB' },
    ],
    dumpLabel: 'core.capsule-01.zst (Ready)',
    exitLabel: 'Exit code 1',
    ...overrides,
  };
}
</script>

<script setup>
import { computed } from 'vue';
/* Plain-<script> helpers above share this module scope (kit SFC convention). */

const props = defineProps({
  capsuleId: { type: String, required: true },
  capsuleLabel: { type: String, default: '' },
  veilKind: { type: String, default: '' },
  projection: { type: Object, default: null },
  switchingBanner: { type: String, default: 'Switching identity context' },
  switchingNote: { type: String, default: '' },
  agentLabel: { type: String, default: '' },
  agentNote: { type: String, default: '' },
  overridePending: { type: Boolean, default: false },
  overrideReason: { type: String, default: '' },
  cid: { type: String, default: null },
  faultLine: { type: String, default: null },
  detailLines: { type: Array, default: () => [] },
  stats: { type: Array, default: () => [] },
  dumpLabel: { type: String, default: null },
  exitLabel: { type: String, default: null },
});

const emit = defineEmits(['control-request', 'submit-intent']);

const kind = computed(() => {
  const explicit = normalizeVeilKind(props.veilKind || undefined);
  if (props.veilKind) return explicit;
  return resolveSaasVeilKind(props.projection);
});
const domIds = computed(() => veilDomIds(props.capsuleId, kind.value));
const anchors = computed(() => veilAnchors(props.capsuleId));
const label = computed(() => (props.capsuleLabel || '').trim() || props.capsuleId);
const agentPill = computed(() => {
  const agent = (props.agentLabel || '').trim();
  return agent ? `AGENT IN CONTROL (${agent})` : 'AGENT IN CONTROL';
});
const cidText = computed(() => (props.cid || '').trim() || 'CID unavailable');
const faultText = computed(() => (props.faultLine || '').trim() || 'Fault unavailable');
const lines = computed(() => visibleDetailLines(props.detailLines));
const cells = computed(() => visibleErrorStats(props.stats));
const dumpText = computed(() => (props.dumpLabel || '').trim() || 'Crash dump unavailable');
const exitText = computed(() => (props.exitLabel || '').trim() || 'Exit code unavailable');
const overrideBlockReason = computed(() => {
  if (props.overrideReason) return props.overrideReason;
  if (props.overridePending) return 'Control lease pending';
  return '';
});

function requestOverride() {
  if (props.overridePending) return;
  emit('control-request', buildVeilControlPayload({ capsuleId: props.capsuleId, verb: 'take-control' }));
}

function requestRetry() {
  emit('submit-intent', buildVeilIntent({ type: 'retry', capsuleId: props.capsuleId }));
}

function requestExport() {
  emit('submit-intent', buildVeilIntent({ type: 'export-dump', capsuleId: props.capsuleId }));
}
</script>

<template>
  <div v-if="kind === 'switching'" :id="domIds.veil" class="saas-veil saas-veil-switching" role="status" :aria-label="'Switching identity context for ' + label">
    <div class="saas-veil-spinner" aria-hidden="true"></div>
    <div class="saas-veil-banner">{{ switchingBanner }}</div>
    <p v-if="switchingNote" class="saas-veil-subnote">{{ switchingNote }}</p>
  </div>

  <div v-else-if="kind === 'ai-held'" :id="domIds.veil" class="saas-veil saas-veil-ai" role="alertdialog" :aria-label="'Agent in control of ' + label">
    <div class="saas-veil-card">
      <div class="saas-veil-pill"><span class="saas-veil-ping" aria-hidden="true"></span><span>{{ agentPill }}</span></div>
      <p v-if="agentNote" class="saas-veil-note">{{ agentNote }}</p>
      <button
        :id="domIds.override"
        type="button"
        role="button"
        class="saas-veil-override"
        :data-semantic-anchor="anchors.control"
        :aria-label="'Take control override for ' + label"
        :title="overrideBlockReason || ('Take control override for ' + label)"
        :disabled="overridePending"
        :data-unavailable-reason="overrideBlockReason || undefined"
        @click="requestOverride"
      >Take Control Override</button>
    </div>
  </div>

  <div v-else-if="kind === 'booting'" :id="domIds.veil" class="saas-veil saas-veil-booting" role="status" :aria-label="'Surface booting for ' + label">
    <div class="saas-skeleton-row"><span class="saas-skeleton saas-skeleton-wide"></span><span class="saas-skeleton saas-skeleton-narrow"></span></div>
    <div class="saas-skeleton-grid"><span class="saas-skeleton saas-skeleton-block"></span><span class="saas-skeleton saas-skeleton-block"></span></div>
    <div class="saas-skeleton-lines"><span class="saas-skeleton saas-skeleton-line"></span><span class="saas-skeleton saas-skeleton-line"></span><span class="saas-skeleton saas-skeleton-line-short"></span></div>
  </div>

  <div v-else-if="kind === 'error'" :id="domIds.veil" class="saas-veil saas-veil-error" role="alert" :aria-label="'Surface error for ' + label">
    <div class="saas-error-head">
      <span class="saas-error-dot" aria-hidden="true"></span>
      <span class="saas-error-chip">ERROR</span>
      <span class="saas-error-cid">{{ cidText }}</span>
    </div>
    <p class="saas-error-fault">{{ faultText }}</p>
    <div v-if="lines.length > 0" class="saas-error-well">
      <p v-for="(line, index) in lines" :key="index" :class="'saas-error-line-' + line.tone">{{ line.text }}</p>
    </div>
    <div class="saas-error-stats">
      <div v-for="(cell, index) in cells" :key="index" class="saas-error-cell">
        <span class="saas-error-key">{{ cell.key }}</span>
        <span class="saas-error-value">{{ cell.value }}</span>
      </div>
    </div>
    <div class="saas-error-actions">
      <button :id="domIds.export" type="button" role="button" class="saas-error-export" :data-semantic-anchor="anchors.export" :aria-label="'Export diagnostic dump for ' + label" @click="requestExport">Export</button>
      <button :id="domIds.retry" type="button" role="button" class="saas-error-retry" :data-semantic-anchor="anchors.retry" :aria-label="'Retry capsule ' + label" @click="requestRetry">Retry</button>
    </div>
    <div class="saas-error-strip"><span>{{ dumpText }}</span><span>{{ exitText }}</span></div>
  </div>
</template>

<style>
.saas-veil {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--cuk-primitive-space-8);
  overflow: hidden;
}
.saas-veil-switching {
  background: color-mix(in srgb, var(--cuk-primitive-color-amber-500) 10%, transparent);
  backdrop-filter: blur(2px);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-amber-500) 30%, transparent);
  background-image: radial-gradient(
    color-mix(in srgb, var(--cuk-primitive-color-amber-500) 15%, transparent) 1px,
    transparent 1px
  );
  background-size: 12px 12px;
}
.saas-veil-spinner {
  width: var(--cuk-primitive-space-16);
  height: var(--cuk-primitive-space-16);
  border-radius: var(--cuk-semantic-radius-pill);
  border: 2px solid var(--cuk-primitive-color-amber-500);
  border-top-color: transparent;
  margin-bottom: var(--cuk-primitive-space-6);
  animation: saas-veil-spin 1s linear infinite;
}
.saas-veil-banner {
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-5);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-amber-500) 50%, transparent);
  color: var(--cuk-primitive-color-amber-500);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-semibold);
}
.saas-veil-subnote {
  margin: var(--cuk-primitive-space-3) 0 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-primitive-color-neutral-400);
}
.saas-veil-ai {
  background: color-mix(in srgb, var(--cuk-primitive-color-neutral-900) 75%, transparent);
  backdrop-filter: blur(2px);
}
.saas-veil-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 24rem;
  padding: var(--cuk-primitive-space-8);
  border-radius: var(--cuk-semantic-radius-lg);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 40%, transparent);
}
.saas-veil-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-5);
  border-radius: var(--cuk-semantic-radius-pill);
  margin-bottom: var(--cuk-primitive-space-4);
  background: color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 10%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500)) 30%, transparent);
  color: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500));
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-weight: var(--cuk-primitive-font-weight-bold);
  white-space: nowrap;
}
.saas-veil-ping {
  width: var(--cuk-primitive-space-4);
  height: var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-saas-sky500, var(--cuk-primitive-color-cyan-500));
  animation: saas-veil-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.saas-veil-note {
  margin: 0 0 var(--cuk-primitive-space-6);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: 1.5;
  color: var(--cuk-primitive-color-neutral-400);
}
.saas-veil-override {
  height: var(--cuk-primitive-space-16);
  padding: 0 var(--cuk-primitive-space-8);
  border-radius: var(--cuk-semantic-radius-sm);
  border: var(--cuk-semantic-border-width) solid
    var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500));
  background: var(--cuk-primitive-color-saas-indigo500, var(--cuk-primitive-color-accent-500));
  color: var(--cuk-primitive-color-neutral-0);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  font-weight: var(--cuk-primitive-font-weight-semibold);
  cursor: pointer;
}
.saas-veil-override:hover {
  background: var(--cuk-primitive-color-saas-indigo600, var(--cuk-primitive-color-accent-600));
  border-color: var(--cuk-primitive-color-saas-indigo600, var(--cuk-primitive-color-accent-600));
}
.saas-veil-override:disabled {
  cursor: not-allowed;
  opacity: var(--cuk-primitive-opacity-disabled);
}
.saas-veil-booting {
  align-items: stretch;
  justify-content: flex-start;
  gap: var(--cuk-primitive-space-6);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  opacity: 1;
}
.saas-skeleton-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.saas-skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cuk-primitive-space-6);
}
.saas-skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-4);
}
.saas-skeleton {
  display: block;
  border-radius: var(--cuk-semantic-radius-sm);
  background: linear-gradient(
    90deg,
    var(--cuk-primitive-color-neutral-800) 0%,
    var(--cuk-primitive-color-neutral-700) 50%,
    var(--cuk-primitive-color-neutral-800) 100%
  );
  background-size: 200% 100%;
  animation: saas-veil-shimmer 2s ease-in-out infinite;
}
.saas-skeleton-wide { height: var(--cuk-primitive-space-8); width: 12rem; }
.saas-skeleton-narrow { height: var(--cuk-primitive-space-8); width: 4rem; }
.saas-skeleton-block { height: 4rem; }
.saas-skeleton-line { height: var(--cuk-primitive-space-6); width: 100%; }
.saas-skeleton-line-short { height: var(--cuk-primitive-space-6); width: 66%; }
.saas-veil-error {
  align-items: stretch;
  justify-content: flex-start;
  text-align: left;
  gap: var(--cuk-primitive-space-6);
  background: var(--cuk-primitive-color-saas-error-wash3, var(--cuk-primitive-color-neutral-950));
}
.saas-error-head {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  min-height: var(--cuk-primitive-space-16);
  padding: 0 var(--cuk-primitive-space-6);
  margin: calc(-1 * var(--cuk-primitive-space-8)) calc(-1 * var(--cuk-primitive-space-8)) 0;
  background: var(--cuk-primitive-color-saas-error-wash1, var(--cuk-primitive-color-rose-950));
  border-bottom: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 40%, transparent);
}
.saas-error-dot {
  width: var(--cuk-primitive-space-4);
  height: var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-primitive-color-rose-500);
  animation: saas-veil-ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;
}
.saas-error-chip {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  background: color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 40%, transparent);
  color: var(--cuk-primitive-color-rose-500);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-weight: var(--cuk-primitive-font-weight-bold);
}
.saas-error-cid {
  padding: 1px var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 30%, transparent);
  color: var(--cuk-primitive-color-rose-500);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
}
.saas-error-fault {
  margin: 0;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-md);
  font-weight: var(--cuk-primitive-font-weight-bold);
  color: var(--cuk-primitive-color-rose-500);
}
.saas-error-well {
  padding: var(--cuk-primitive-space-5);
  border-radius: var(--cuk-semantic-radius-md);
  background: var(--cuk-primitive-color-saas-canvas, var(--cuk-semantic-surface-canvas));
  border: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 30%, transparent);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.saas-error-well p { margin: 0 0 var(--cuk-primitive-space-2); }
.saas-error-well p:last-child { margin-bottom: 0; }
.saas-error-line-critical { color: var(--cuk-primitive-color-rose-500); }
.saas-error-line-neutral { color: var(--cuk-primitive-color-neutral-400); }
.saas-error-line-muted { color: var(--cuk-primitive-color-neutral-500); }
.saas-error-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
}
.saas-error-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-md);
  background: color-mix(in srgb, var(--cuk-primitive-color-neutral-800) 40%, transparent);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
}
.saas-error-key {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-primitive-color-neutral-500);
}
.saas-error-value {
  font-weight: var(--cuk-primitive-font-weight-medium);
  color: var(--cuk-primitive-color-neutral-50);
}
.saas-error-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cuk-primitive-space-4);
  padding-top: var(--cuk-primitive-space-4);
  border-top: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 20%, transparent);
}
.saas-error-export,
.saas-error-retry {
  height: var(--cuk-primitive-space-16);
  padding: 0 var(--cuk-primitive-space-6);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  cursor: pointer;
}
.saas-error-export {
  background: var(--cuk-primitive-color-neutral-900);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-neutral-700);
  color: var(--cuk-primitive-color-neutral-0);
  font-weight: var(--cuk-primitive-font-weight-medium);
}
.saas-error-export:hover { background: var(--cuk-primitive-color-neutral-800); }
.saas-error-retry {
  background: var(--cuk-primitive-color-rose-500);
  border: var(--cuk-semantic-border-width) solid var(--cuk-primitive-color-rose-500);
  color: var(--cuk-primitive-color-neutral-0);
  font-weight: var(--cuk-primitive-font-weight-semibold);
}
.saas-error-retry:hover {
  background: var(--cuk-primitive-color-rose-600);
  border-color: var(--cuk-primitive-color-rose-600);
}
.saas-error-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  min-height: 40px;
  padding: 0 var(--cuk-primitive-space-6);
  margin: 0 calc(-1 * var(--cuk-primitive-space-8)) calc(-1 * var(--cuk-primitive-space-8));
  background: var(--cuk-primitive-color-saas-error-wash4, var(--cuk-primitive-color-neutral-1000));
  border-top: var(--cuk-semantic-border-width) solid
    color-mix(in srgb, var(--cuk-primitive-color-rose-500) 30%, transparent);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-xs);
  color: var(--cuk-primitive-color-neutral-500);
}
.saas-error-strip span:first-child { color: var(--cuk-primitive-color-rose-500); }
.saas-veil-override:focus-visible,
.saas-error-export:focus-visible,
.saas-error-retry:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid
    var(--cuk-primitive-color-saas-indigo500, var(--cuk-semantic-focus-ring-color));
  outline-offset: 1px;
}
@keyframes saas-veil-spin {
  to { transform: rotate(360deg); }
}
@keyframes saas-veil-ping {
  0% { transform: scale(1); opacity: 1; }
  75%, 100% { transform: scale(2); opacity: 0; }
}
@keyframes saas-veil-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes saas-veil-skeleton-fade {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .saas-veil-spinner,
  .saas-veil-ping,
  .saas-error-dot { animation: none; }
  .saas-skeleton {
    animation: saas-veil-skeleton-fade 2s ease-in-out infinite;
    background: var(--cuk-primitive-color-neutral-800);
    background-size: auto;
  }
}
</style>
