<script setup>
import S1StatusPill from './S1StatusPill.vue';

/**
 * Generic S1 data table (spec section 6): 28px sticky header, 32px dense
 * rows, typed columns (text, identity with avatar initials, level chip,
 * progress/morale bar, money, status pill, row actions) and token-only
 * 4px scrollbars. The host supplies generic columns/rows plus optional
 * attribute and text callbacks; no application names.
 * @module widgets/S1DataTable
 */

/**
 * @typedef {object} S1TableColumn
 * @property {string} key Row value key.
 * @property {string} label Header label.
 * @property {('text'|'identity'|'level'|'bar'|'money'|'status'|'actions')} [kind] Cell kind.
 * @property {('left'|'right'|'center')} [align] Cell alignment.
 * @property {string} [tone] Bar tone (success, warning, error, info).
 */

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, default: 'Data table' },
  role: { type: String, default: 'table' },
  columns: { type: Array, required: true },
  rows: { type: Array, default: () => [] },
  rowKey: { type: [String, Function], default: 'id' },
  rowAttrs: { type: [Function, null], default: null },
  cellAttrs: { type: [Function, null], default: null },
  cellText: { type: [Function, null], default: null },
  cellValue: { type: [Function, null], default: null },
  stickyHeader: { type: Boolean, default: true },
  emptyText: { type: String, default: 'No rows.' },
  tableAttrs: { type: Object, default: () => ({}) },
  caption: { type: String, default: '' },
});
const emit = defineEmits(['row-action']);

/**
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {string} Stable row key.
 */
function rowKeyOf(row, rowIndex) {
  if (typeof props.rowKey === 'function') return String(props.rowKey(row, rowIndex));
  const key = row === null || typeof row !== 'object' ? undefined : row[props.rowKey];
  return String(key === undefined || key === null ? rowIndex : key);
}
/**
 * @param {unknown} value Raw key part.
 * @returns {string} Id-safe part.
 */
function sanitizeIdPart(value) {
  return String(value).replace(/[^A-Za-z0-9-_.]/g, '-');
}
/**
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {Record<string, unknown>} Extra tr attributes from the host.
 */
function rowAttrsFor(row, rowIndex) {
  if (typeof props.rowAttrs !== 'function') return {};
  const attrs = props.rowAttrs(row, rowIndex);
  return attrs === null || typeof attrs !== 'object' ? {} : attrs;
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {Record<string, unknown>} Extra td attributes from the host.
 */
function cellAttrsFor(column, row, rowIndex) {
  if (typeof props.cellAttrs !== 'function') return {};
  const attrs = props.cellAttrs(column, row, rowIndex);
  return attrs === null || typeof attrs !== 'object' ? {} : attrs;
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {any} Raw cell value.
 */
function valueOf(column, row, rowIndex) {
  if (typeof props.cellValue === 'function') return props.cellValue(column, row, rowIndex);
  return row === null || typeof row !== 'object' ? undefined : row[column.key];
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {string} Text cell content.
 */
function textOf(column, row, rowIndex) {
  if (typeof props.cellText === 'function') return String(props.cellText(column, row, rowIndex));
  const value = valueOf(column, row, rowIndex);
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {{pct: number, label: string, tone: string}} Normalized bar props.
 */
function barOf(column, row, rowIndex) {
  const raw = valueOf(column, row, rowIndex);
  const source = raw !== null && typeof raw === 'object' ? raw : { pct: raw };
  const numeric = Number(source.pct);
  const pct = Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
  const label = typeof source.label === 'string' ? source.label : `${pct}%`;
  const tone = typeof column.tone === 'string' ? column.tone : 'success';
  return { pct, label, tone };
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {{initials: string, name: string, sub: string, hue: string}} Normalized identity.
 */
function identityOf(column, row, rowIndex) {
  const raw = valueOf(column, row, rowIndex);
  const source = raw !== null && typeof raw === 'object' ? raw : {};
  const hue = source.hue === 'tertiary' ? 'tertiary' : (rowIndex % 2 === 1 && source.hue === undefined ? 'tertiary' : 'primary');
  return {
    initials: typeof source.initials === 'string' ? source.initials : '',
    name: typeof source.name === 'string' ? source.name : '',
    sub: typeof source.sub === 'string' ? source.sub : '',
    hue,
  };
}
/**
 * @param {S1TableColumn} column Column definition.
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {{label: string, tone: string}} Normalized status props.
 */
function statusOf(column, row, rowIndex) {
  const raw = valueOf(column, row, rowIndex);
  if (raw !== null && typeof raw === 'object') {
    return {
      label: typeof raw.label === 'string' ? raw.label : '',
      tone: typeof raw.tone === 'string' ? raw.tone : 'neutral',
    };
  }
  return { label: raw === undefined || raw === null ? '' : String(raw), tone: 'neutral' };
}
/**
 * @param {S1TableColumn} column Column definition.
 * @returns {string} Effective alignment.
 */
function alignOf(column) {
  if (column.align === 'right' || column.align === 'center' || column.align === 'left') return column.align;
  return column.kind === 'money' || column.kind === 'actions' ? 'right' : 'left';
}
/**
 * @param {S1TableColumn} column Column definition.
 * @returns {string} td class list.
 */
function cellClass(column) {
  return `s1-data-table-cell s1-data-table-cell-${column.kind ?? 'text'} s1-data-table-align-${alignOf(column)}`;
}
/**
 * @param {S1TableColumn} column Column definition.
 * @returns {string} th class list.
 */
function headClass(column) {
  return `s1-data-table-head-cell s1-data-table-align-${alignOf(column)}`;
}
/**
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {string} Stable default action-button id.
 */
function rowActionId(row, rowIndex) {
  return `${props.id}-row-${sanitizeIdPart(rowKeyOf(row, rowIndex))}-actions`;
}
/**
 * @param {any} row Row value.
 * @param {number} rowIndex Row index.
 * @returns {void}
 */
function onRowAction(row, rowIndex) {
  emit('row-action', { row, rowIndex });
}
/** @returns {boolean} True for grid semantics. */
function isGrid() {
  return props.role === 'grid';
}
</script>
<template>
  <div :id="id" :class="'s1-data-table' + (stickyHeader ? ' s1-data-table-sticky' : '')">
    <div class="s1-data-table-scroll">
      <table
        v-bind="tableAttrs"
        :role="role"
        :aria-label="label"
        :aria-colcount="columns.length"
        class="s1-data-table-table"
      >
        <caption v-if="caption" class="s1-data-table-caption">{{ caption }}</caption>
        <thead>
          <tr :role="isGrid() ? 'row' : undefined" :aria-rowindex="isGrid() ? 1 : undefined">
            <th
              v-for="(column, columnIndex) in /** @type {Array<S1TableColumn>} */ (/** @type {unknown} */ (columns))"
              :key="column.key"
              scope="col"
              :role="isGrid() ? 'columnheader' : undefined"
              :class="headClass(column)"
            ><slot name="header-cell" :column="column" :index="columnIndex">{{ column.label }}</slot></th>
          </tr>
        </thead>
        <tbody v-if="rows.length">
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowKeyOf(row, rowIndex)"
            :role="isGrid() ? 'row' : undefined"
            v-bind="rowAttrsFor(row, rowIndex)"
            class="s1-data-table-row"
          >
            <td
              v-for="column in /** @type {Array<S1TableColumn>} */ (/** @type {unknown} */ (columns))"
              :key="column.key"
              :role="isGrid() ? 'gridcell' : undefined"
              v-bind="cellAttrsFor(column, row, rowIndex)"
              :class="cellClass(column)"
            ><slot name="cell" :column="column" :row="row" :rowIndex="rowIndex">
              <template v-if="column.kind === 'identity'">
                <span class="s1-data-table-identity">
                  <span :class="'s1-data-table-avatar s1-data-table-avatar-' + identityOf(column, row, rowIndex).hue" aria-hidden="true">{{ identityOf(column, row, rowIndex).initials }}</span>
                  <span class="s1-data-table-who">
                    <span class="s1-data-table-name">{{ identityOf(column, row, rowIndex).name }}</span>
                    <span v-if="identityOf(column, row, rowIndex).sub" class="s1-data-table-sub">{{ identityOf(column, row, rowIndex).sub }}</span>
                  </span>
                </span>
              </template>
              <template v-else-if="column.kind === 'level'">
                <span class="s1-data-table-level">{{ textOf(column, row, rowIndex) }}</span>
              </template>
              <template v-else-if="column.kind === 'bar'">
                <span class="s1-data-table-bar">
                  <span class="s1-data-table-bar-track">
                    <span :class="'s1-data-table-bar-fill s1-data-table-tone-' + barOf(column, row, rowIndex).tone" :style="{ width: barOf(column, row, rowIndex).pct + '%' }" />
                  </span>
                  <span :class="'s1-data-table-bar-value s1-data-table-tone-' + barOf(column, row, rowIndex).tone">{{ barOf(column, row, rowIndex).label }}</span>
                </span>
              </template>
              <template v-else-if="column.kind === 'money'">
                <span class="s1-data-table-money">{{ textOf(column, row, rowIndex) }}</span>
              </template>
              <template v-else-if="column.kind === 'status'">
                <S1StatusPill :label="statusOf(column, row, rowIndex).label" :tone="statusOf(column, row, rowIndex).tone" />
              </template>
              <template v-else-if="column.kind === 'actions'">
                <slot name="row-actions" :row="row" :rowIndex="rowIndex">
                  <button
                    type="button"
                    :id="rowActionId(row, rowIndex)"
                    class="s1-data-table-row-btn"
                    aria-label="Row actions"
                    @click="onRowAction(row, rowIndex)"
                  >…</button>
                </slot>
              </template>
              <template v-else>{{ textOf(column, row, rowIndex) }}</template>
            </slot></td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr :role="isGrid() ? 'row' : undefined">
            <td :colspan="columns.length" :role="isGrid() ? 'gridcell' : undefined" class="s1-data-table-empty"><slot name="empty">{{ emptyText }}</slot></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style>
.s1-data-table{min-width: 0;}
.s1-data-table :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}
.s1-data-table-scroll{
  overflow: auto;
  max-height: 100%;
  scrollbar-width: thin;
  scrollbar-color: var(--cuk-primitive-color-s1-highest) var(--cuk-semantic-surface-canvas);
}
.s1-data-table-scroll::-webkit-scrollbar{width: var(--cuk-primitive-space-2); height: var(--cuk-primitive-space-2);}
.s1-data-table-scroll::-webkit-scrollbar-track{background: var(--cuk-semantic-surface-canvas);}
.s1-data-table-scroll::-webkit-scrollbar-thumb{
  background: var(--cuk-primitive-color-s1-highest);
  border-radius: var(--cuk-semantic-radius-xs);
}
.s1-data-table-scroll::-webkit-scrollbar-thumb:hover{background: var(--cuk-semantic-border-subtle);}
.s1-data-table-table{width: 100%; border-collapse: collapse;}
.s1-data-table-caption{
  text-align: left;
  padding: 0 0 var(--cuk-primitive-space-2);
  font-family: var(--cuk-semantic-typography-roles-label-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  color: var(--cuk-semantic-text-muted);
}
.s1-data-table-head-cell{
  height: var(--cuk-component-s1-table-header-height);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-sunken);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-family: var(--cuk-semantic-typography-roles-table-header-font-family);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-weight: var(--cuk-semantic-typography-roles-table-header-font-weight);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  text-transform: var(--cuk-semantic-typography-roles-table-header-text-transform);
  color: var(--cuk-semantic-text-disabled);
  white-space: nowrap;
}
.s1-data-table-sticky .s1-data-table-head-cell{
  position: sticky; top: 0;
  z-index: var(--cuk-primitive-z-index-sticky);
}
.s1-data-table-row{height: var(--cuk-component-s1-table-row-height);}
.s1-data-table-row:hover{background: var(--cuk-semantic-surface-chrome);}
.s1-data-table-cell{
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-font-size-sm);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-data-table-head-cell:first-child,
.s1-data-table-cell:first-child{padding-left: var(--cuk-primitive-space-6);}
.s1-data-table-align-left{text-align: left;}
.s1-data-table-align-right{text-align: right;}
.s1-data-table-align-center{text-align: center;}
.s1-data-table-cell-identity{
  padding-top: var(--cuk-semantic-border-width);
  padding-bottom: var(--cuk-semantic-border-width);
}
.s1-data-table-identity{display: flex; align-items: center; gap: var(--cuk-primitive-space-2); min-width: 0;}
.s1-data-table-avatar{
  display: inline-flex; align-items: center; justify-content: center;
  flex: none;
  width: var(--cuk-primitive-space-10); height: var(--cuk-primitive-space-10);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-accent-primary);
}
.s1-data-table-avatar-tertiary{color: var(--cuk-semantic-accent-tertiary);}
.s1-data-table-who{display: flex; flex-direction: column; min-width: 0;}
.s1-data-table-name{
  font-family: var(--cuk-semantic-typography-roles-label-md-font-family);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  color: var(--cuk-semantic-text-primary);
  white-space: nowrap;
}
.s1-data-table-sub{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-disabled);
  white-space: nowrap;
}
.s1-data-table-level{
  display: inline-flex; align-items: center;
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-chrome);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-data-table-bar{display: inline-flex; align-items: center; gap: var(--cuk-primitive-space-2);}
.s1-data-table-bar-track{
  display: inline-block;
  width: var(--cuk-component-s1-morale-bar-width);
  height: var(--cuk-component-s1-morale-bar-height);
  background: var(--cuk-semantic-surface-elevated);
  border-radius: var(--cuk-semantic-radius-pill);
  overflow: hidden;
}
.s1-data-table-bar-fill{display: block; height: 100%; border-radius: var(--cuk-semantic-radius-pill); background: currentColor;}
.s1-data-table-bar-value{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.s1-data-table-tone-success{color: var(--cuk-semantic-status-success-text);}
.s1-data-table-tone-warning{color: var(--cuk-semantic-status-warning-text);}
.s1-data-table-tone-error{color: var(--cuk-semantic-status-error-text);}
.s1-data-table-tone-info{color: var(--cuk-semantic-status-info-text);}
.s1-data-table-cell-money{
  font-family: var(--cuk-semantic-typography-roles-code-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  font-variant-numeric: tabular-nums;
}
.s1-data-table-row-btn{
  display: inline-flex; align-items: center; justify-content: center;
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
.s1-data-table-row-btn:hover{
  color: var(--cuk-semantic-accent-primary);
  background: var(--cuk-semantic-surface-interactive);
}
.s1-data-table-empty{
  padding: var(--cuk-primitive-space-4);
  font-family: var(--cuk-semantic-typography-roles-body-sm-font-family);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-sm-line-height);
  color: var(--cuk-semantic-text-muted);
}
</style>
