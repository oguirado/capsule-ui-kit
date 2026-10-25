<script setup>
/**
 * Generic S1 filter tab strip. No application names: the host supplies the
 * tabs, the active id and the controlled element id via props. Selection
 * follows focus (automatic activation); every gesture emits select.
 * @module lists/S1FilterTabs
 */

/**
 * @typedef {object} S1FilterTab
 * @property {string} id Stable tab id.
 * @property {string} label Visible label.
 * @property {number} [count] Optional count appended as " (N)".
 * @property {boolean} [hasDot] True to render the marker dot.
 */

const props = defineProps({
  tabs: { type: /** @type {import('vue').PropType<ReadonlyArray<S1FilterTab>>} */ (Array), required: true },
  activeId: { type: String, default: '' },
  idPrefix: { type: String, default: 's1-filter' },
  controlsId: { type: String, default: '' },
  label: { type: String, default: 'Filters' },
});
const emit = defineEmits(['select']);

/** @returns {S1FilterTab[]} */
function all() {
  return /** @type {S1FilterTab[]} */ (/** @type {unknown} */ (props.tabs));
}
/** @param {S1FilterTab} tab @returns {string} */
function tabDomId(tab) {
  return `${props.idPrefix}:tab:${tab.id}`;
}
/** @param {S1FilterTab} tab @returns {string} */
function tabText(tab) {
  if (typeof tab.count === 'number' && Number.isInteger(tab.count) && tab.count >= 0) {
    return `${tab.label} (${tab.count})`;
  }
  return tab.label;
}
/** @param {number} index @returns {'0'|'-1'} */
function tabIndex(index) {
  const list = all();
  const active = list.findIndex((tab) => tab.id === props.activeId);
  return index === (active >= 0 ? active : 0) ? '0' : '-1';
}
/** @param {string} id */
function select(id) {
  emit('select', id);
}
/** Focus moves through sibling tabs, so no element refs are stored.
 * @param {KeyboardEvent} event @param {number} index */
function onKey(event, index) {
  const list = all();
  if (list.length < 1) {
    return;
  }
  let next = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    next = (index + 1) % list.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    next = (index - 1 + list.length) % list.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = list.length - 1;
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const current = list[index];
    if (current) {
      select(current.id);
    }
    return;
  } else {
    return;
  }
  event.preventDefault();
  const target = list[next];
  if (!target) {
    return;
  }
  select(target.id);
  const self = event.currentTarget;
  if (!(self instanceof HTMLElement)) {
    return;
  }
  const siblings = self.parentElement?.querySelectorAll('[role="tab"]') ?? [];
  const el = siblings[next];
  if (el instanceof HTMLElement) {
    el.focus();
  }
}
</script>
<template>
  <div class="s1-filter-tabs" role="tablist" :aria-label="label">
    <button
      v-for="(tab, index) in /** @type {S1FilterTab[]} */ (/** @type {unknown} */ (tabs))"
      :key="tab.id"
      type="button"
      role="tab"
      :id="tabDomId(tab)"
      :aria-selected="tab.id === activeId ? 'true' : 'false'"
      :aria-controls="controlsId || undefined"
      :tabindex="tabIndex(index)"
      class="s1-filter-tab"
      :class="{ 's1-filter-tab-active': tab.id === activeId }"
      @click="select(tab.id)"
      @keydown="onKey($event, index)"
    >
      <span class="s1-filter-tab-text">{{ tabText(tab) }}</span>
      <span v-if="tab.hasDot" class="s1-filter-tab-dot" aria-hidden="true" />
    </button>
  </div>
</template>
<style>
.s1-filter-tabs{
  height: var(--cuk-component-app-shell-status-height);
  display: flex; align-items: center;
  gap: var(--cuk-primitive-space-6);
  padding: 0 var(--cuk-primitive-space-6);
  background: var(--cuk-semantic-surface-sunken);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  flex: none;
}
.s1-filter-tab{
  display: inline-flex; align-items: center;
  gap: var(--cuk-primitive-space-2);
  padding: 0;
  background: transparent; border: 0;
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-muted);
  cursor: pointer;
  white-space: nowrap;
}
.s1-filter-tab:hover{
  color: var(--cuk-semantic-text-primary);
}
.s1-filter-tab-active{
  padding-bottom: var(--cuk-primitive-space-1);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-text-accent);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-semantic-text-accent);
}
.s1-filter-tab-dot{
  width: var(--cuk-primitive-space-3); height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-accent-secondary);
  flex: none;
}
.s1-filter-tabs :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-text-accent);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
