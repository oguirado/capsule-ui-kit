<script setup>
import S1StatusPill from './S1StatusPill.vue';

/**
 * Generic S1 inspector side panel: subject header with a status headline,
 * fact key-values, ledger rows with a total, matrix tiles and an action
 * bar. The host supplies every label, value, tone and action id; the panel
 * carries no application names.
 * @module widgets/InspectorPanel
 */

/**
 * @typedef {object} InspectorFact
 * @property {string} label Row label.
 * @property {string} value Row value (monospace).
 * @property {string} [sub] Optional secondary value.
 * @property {string} [tone] Value tone (success, warning, error, info).
 */

/**
 * @typedef {object} InspectorLedgerRow
 * @property {string} label Row label.
 * @property {string} value Row value (monospace).
 */

/**
 * @typedef {object} InspectorLedgerTotal
 * @property {string} label Total label.
 * @property {string} value Total value (monospace).
 * @property {string} [note] Optional unit note after the value.
 */

/**
 * @typedef {object} InspectorTile
 * @property {string} label Tile label.
 * @property {string} value Tile value (monospace).
 */

/**
 * @typedef {object} InspectorAction
 * @property {string} id Stable button id (host-owned).
 * @property {string} label Button text (accessible name).
 * @property {('primary'|'secondary'|'ghost'|'danger')} [kind] Button kind.
 * @property {boolean} [disabled] True when no intent backs the action.
 * @property {string} [reason] Disabled explanation (tooltip + name suffix).
 */

const props = defineProps({
  id: { type: String, required: true },
  title: { type: String, required: true },
  subject: { type: String, default: '' },
  headline: { type: String, default: '' },
  headlineNote: { type: String, default: '' },
  dismissLabel: { type: String, default: '' },
  factsTitle: { type: String, default: '' },
  facts: { type: Array, default: () => [] },
  ledgerTitle: { type: String, default: '' },
  ledgerBadge: { type: [Object, null], default: null },
  ledgerRows: { type: Array, default: () => [] },
  ledgerTotal: { type: [Object, null], default: null },
  ledgerFoot: { type: [Object, null], default: null },
  matrixTitle: { type: String, default: '' },
  matrixNote: { type: String, default: '' },
  matrixTiles: { type: Array, default: () => [] },
  actions: { type: Array, default: () => [] },
  actionsLabel: { type: String, default: 'Actions' },
  emptyText: { type: String, default: 'Nothing selected.' },
});
const emit = defineEmits(['action', 'dismiss']);

const factTones = Object.freeze(['success', 'warning', 'error', 'info']);
const actionKinds = Object.freeze(['primary', 'secondary', 'ghost', 'danger']);

/**
 * @param {InspectorFact} fact Fact row.
 * @returns {string} Tone modifier class, or empty for the default tone.
 */
function factToneClass(fact) {
  const tone = fact.tone ?? '';
  return factTones.includes(tone) ? ` s1-inspector-tone-${tone}` : '';
}

/**
 * @param {InspectorAction} action Action descriptor.
 * @returns {string} Button class list, falling back to secondary.
 */
function actionClass(action) {
  const kind = actionKinds.includes(action.kind ?? '') ? action.kind : 'secondary';
  return `s1-inspector-btn s1-inspector-btn-${kind}`;
}

/**
 * @param {InspectorAction} action Action descriptor.
 * @returns {string} Accessible name; disabled actions append the reason.
 */
function actionName(action) {
  if (action.disabled === true && typeof action.reason === 'string' && action.reason.length > 0) {
    return `${action.label}, ${action.reason}`;
  }
  return action.label;
}

/**
 * @param {InspectorAction} action Action descriptor.
 * @returns {void}
 */
function onAction(action) {
  if (action.disabled === true) return;
  emit('action', action.id);
}

/**
 * @returns {boolean} True when the ledger section has any content.
 */
function hasLedger() {
  return props.ledgerTitle.length > 0
    || props.ledgerBadge !== null
    || props.ledgerRows.length > 0
    || props.ledgerTotal !== null
    || props.ledgerFoot !== null;
}

/**
 * @returns {boolean} True when the matrix section has any content.
 */
function hasMatrix() {
  return props.matrixTitle.length > 0 || props.matrixNote.length > 0 || props.matrixTiles.length > 0;
}
</script>
<template>
  <aside :id="id" class="s1-inspector" :aria-label="title">
    <div class="s1-inspector-head">
      <div class="s1-inspector-heading">
        <h3 class="s1-inspector-title">{{ title }}</h3>
        <p v-if="subject" class="s1-inspector-subject">{{ subject }}</p>
      </div>
      <button
        v-if="dismissLabel"
        type="button"
        :id="id + '-dismiss'"
        class="s1-inspector-dismiss"
        :aria-label="dismissLabel"
        @click="emit('dismiss')"
      >&#215;</button>
    </div>
    <div v-if="subject" class="s1-inspector-body">
      <p v-if="headline" class="s1-inspector-headline">
        <span>{{ headline }}</span>
        <span v-if="headlineNote" class="s1-inspector-note">{{ headlineNote }}</span>
      </p>
      <section v-if="factsTitle || facts.length" class="s1-inspector-card" :aria-label="factsTitle || 'Facts'">
        <h4 v-if="factsTitle" class="s1-inspector-card-title">{{ factsTitle }}</h4>
        <dl class="s1-inspector-facts">
          <div
            v-for="(fact, factIndex) in /** @type {Array<InspectorFact>} */ (/** @type {unknown} */ (facts))"
            :key="`${fact.label}-${factIndex}`"
            class="s1-inspector-fact"
          >
            <dt class="s1-inspector-label">{{ fact.label }}</dt>
            <dd :class="'s1-inspector-value' + factToneClass(fact)">
              {{ fact.value }}
              <span v-if="fact.sub" class="s1-inspector-sub">{{ fact.sub }}</span>
            </dd>
          </div>
        </dl>
      </section>
      <section v-if="hasLedger()" class="s1-inspector-card" :aria-label="ledgerTitle || 'Ledger'">
        <div v-if="ledgerTitle || ledgerBadge" class="s1-inspector-card-head">
          <h4 v-if="ledgerTitle" class="s1-inspector-card-title">{{ ledgerTitle }}</h4>
          <S1StatusPill v-if="ledgerBadge" :label="ledgerBadge.label" :tone="ledgerBadge.tone" />
        </div>
        <dl v-if="ledgerRows.length" class="s1-inspector-facts">
          <div
            v-for="(row, rowIndex) in /** @type {Array<InspectorLedgerRow>} */ (/** @type {unknown} */ (ledgerRows))"
            :key="`${row.label}-${rowIndex}`"
            class="s1-inspector-fact"
          >
            <dt class="s1-inspector-label">{{ row.label }}</dt>
            <dd class="s1-inspector-value">{{ row.value }}</dd>
          </div>
        </dl>
        <p v-if="ledgerTotal" class="s1-inspector-total">
          <span class="s1-inspector-total-label">{{ ledgerTotal.label }}</span>
          <span class="s1-inspector-total-value">{{ ledgerTotal.value }}<span v-if="ledgerTotal.note" class="s1-inspector-sub"> {{ ledgerTotal.note }}</span></span>
        </p>
        <p v-if="ledgerFoot" class="s1-inspector-total s1-inspector-foot">
          <span class="s1-inspector-total-label">{{ ledgerFoot.label }}</span>
          <span class="s1-inspector-total-value">{{ ledgerFoot.value }}<span v-if="ledgerFoot.note" class="s1-inspector-sub"> {{ ledgerFoot.note }}</span></span>
        </p>
      </section>
      <section v-if="hasMatrix()" class="s1-inspector-card" :aria-label="matrixTitle || 'Matrix'">
        <div v-if="matrixTitle || matrixNote" class="s1-inspector-card-head">
          <h4 v-if="matrixTitle" class="s1-inspector-card-title">{{ matrixTitle }}</h4>
          <span v-if="matrixNote" class="s1-inspector-note">{{ matrixNote }}</span>
        </div>
        <ul v-if="matrixTiles.length" class="s1-inspector-tiles">
          <li
            v-for="(tile, tileIndex) in /** @type {Array<InspectorTile>} */ (/** @type {unknown} */ (matrixTiles))"
            :key="`${tile.label}-${tileIndex}`"
            class="s1-inspector-tile"
          >
            <span class="s1-inspector-label">{{ tile.label }}</span>
            <span class="s1-inspector-tile-value">{{ tile.value }}</span>
          </li>
        </ul>
      </section>
      <div v-if="actions.length" class="s1-inspector-actions" role="group" :aria-label="actionsLabel">
        <slot name="actions" :actions="actions">
          <button
            v-for="action in /** @type {Array<InspectorAction>} */ (/** @type {unknown} */ (actions))"
            :key="action.id"
            type="button"
            :id="action.id"
            :class="actionClass(action)"
            :disabled="action.disabled === true"
            :title="action.reason || undefined"
            :aria-label="actionName(action)"
            @click="onAction(action)"
          >{{ action.label }}</button>
        </slot>
      </div>
    </div>
    <div v-else class="s1-inspector-empty" role="status">
      <slot name="empty">{{ emptyText }}</slot>
    </div>
  </aside>
</template>
<style>
.s1-inspector{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-4);
  min-width: 0;
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
}
.s1-inspector :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.s1-inspector-head{
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
}
.s1-inspector-heading{display: flex; flex-direction: column; gap: var(--cuk-primitive-space-1); min-width: 0;}
.s1-inspector-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-headline-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-headline-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-headline-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-inspector-subject{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
  overflow-wrap: anywhere;
}
.s1-inspector-dismiss{
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
  padding: 0 var(--cuk-primitive-space-2);
  background: transparent;
  border: var(--cuk-semantic-border-width) solid transparent;
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  color: var(--cuk-semantic-text-disabled);
  cursor: pointer;
}
.s1-inspector-dismiss:hover{
  color: var(--cuk-semantic-text-primary);
  background: var(--cuk-semantic-surface-interactive);
}
.s1-inspector-body{display: flex; flex-direction: column; gap: var(--cuk-primitive-space-4); min-width: 0;}
.s1-inspector-headline{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
  margin: 0;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-3);
  background: var(--cuk-semantic-surface-chrome);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-inspector-note{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-inspector-card{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  margin: 0;
  padding: var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-canvas);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.s1-inspector-card-head{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
}
.s1-inspector-card-title{
  margin: 0;
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  text-transform: var(--cuk-semantic-typography-roles-table-header-text-transform);
  color: var(--cuk-semantic-text-disabled);
}
.s1-inspector-facts{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-2);
  margin: 0;
}
.s1-inspector-fact{
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
  padding-bottom: var(--cuk-primitive-space-2);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-inspector-fact:last-child{padding-bottom: 0; border-bottom: 0;}
.s1-inspector-label{
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-component-inspector-panel-label-color);
}
.s1-inspector-value{
  margin: 0;
  text-align: right;
  font-family: var(--cuk-component-inspector-panel-mono-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-component-inspector-panel-value-color);
  overflow-wrap: anywhere;
}
.s1-inspector-sub{
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-inspector-tone-success{color: var(--cuk-semantic-status-success-text);}
.s1-inspector-tone-warning{color: var(--cuk-semantic-status-warning-text);}
.s1-inspector-tone-error{color: var(--cuk-semantic-status-error-text);}
.s1-inspector-tone-info{color: var(--cuk-semantic-status-info-text);}
.s1-inspector-total{
  display: flex; align-items: baseline; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
  margin: 0;
  padding-top: var(--cuk-primitive-space-3);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-inspector-total-label{
  font-family: var(--cuk-semantic-typography-roles-label-md-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-inspector-total-value{
  font-family: var(--cuk-component-inspector-panel-mono-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-semantic-text-primary);
}
.s1-inspector-foot{border-top: 0; padding-top: 0;}
.s1-inspector-tiles{
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cuk-primitive-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.s1-inspector-tile{
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-1);
  padding: var(--cuk-primitive-space-3);
  background: var(--cuk-semantic-surface-chrome);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  min-width: 0;
}
.s1-inspector-tile-value{
  font-family: var(--cuk-component-inspector-panel-mono-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-md-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-md-line-height);
  font-variant-numeric: tabular-nums;
  color: var(--cuk-semantic-text-primary);
  overflow-wrap: anywhere;
}
.s1-inspector-actions{
  display: flex; flex-wrap: wrap;
  gap: var(--cuk-primitive-space-2);
}
.s1-inspector-btn{
  display: inline-flex; align-items: center; justify-content: center;
  flex: 1 1 auto;
  min-height: var(--cuk-primitive-space-16);
  padding: 0 var(--cuk-primitive-space-5);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-chrome);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.s1-inspector-btn:hover{background: var(--cuk-semantic-surface-interactive);}
.s1-inspector-btn:disabled{
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}
.s1-inspector-btn-secondary{
  background: var(--cuk-semantic-surface-chrome);
  color: var(--cuk-semantic-text-primary);
}
.s1-inspector-btn-primary{
  background: var(--cuk-semantic-surface-elevated);
  border-color: var(--cuk-semantic-border-default);
  color: var(--cuk-semantic-accent-primary);
}
.s1-inspector-btn-primary:hover{border-color: var(--cuk-semantic-accent-primary);}
.s1-inspector-btn-ghost{
  background: transparent;
  color: var(--cuk-semantic-text-muted);
}
.s1-inspector-btn-ghost:hover{color: var(--cuk-semantic-text-primary);}
.s1-inspector-btn-danger{
  flex-basis: 100%;
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
  color: var(--cuk-semantic-status-error-text);
}
.s1-inspector-empty{
  margin: 0;
  padding: var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
</style>
