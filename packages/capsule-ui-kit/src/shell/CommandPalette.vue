<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import Dialog from 'openvue/dialog';
import SearchIcon from '@openvue/icons/search';
import ChevronRightIcon from '@openvue/icons/chevronright';
import ThLargeIcon from '@openvue/icons/thlarge';
import UiButton from '../ui/UiButton.vue';
import UiTextInput from '../ui/UiTextInput.vue';
import {
  cyclePaletteGroup,
  filterPaletteItems,
  flattenPaletteGroups,
  groupPaletteItems,
  movePaletteIndex,
} from './CommandPaletteModel.js';

/**
 * Generic S1 command palette (Ctrl+K overlay). No application names: the
 * host supplies jump targets and commands via props and binds the global
 * Ctrl+K shortcut to the exposed `openPalette` method.
 * @module shell/CommandPalette
 */

/**
 * @typedef {import('./CommandPaletteModel.js').PaletteItem} PaletteItem
 * @typedef {import('./CommandPaletteModel.js').PaletteGroup} PaletteGroup
 */

const props = defineProps({
  visible: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Command palette' },
  inputLabel: { type: String, default: 'Find a command or capsule' },
  placeholder: { type: String, default: 'Type a command, search capsules, or jump to workspace…' },
  emptyText: { type: String, default: 'No matching entries. Try another name.' },
});
const emit = defineEmits(['update:visible', 'select', 'close']);

const query = ref('');
const groupFilter = ref(/** @type {string|null} */ (null));
const activeIndex = ref(-1);

/** @type {import('vue').ComputedRef<PaletteItem[]>} */
const entries = computed(() => /** @type {PaletteItem[]} */ (/** @type {unknown} */ (props.items)));
/** @type {import('vue').ComputedRef<PaletteItem[]>} */
const filtered = computed(() => {
  const found = filterPaletteItems(entries.value, query.value);
  return groupFilter.value === null ? found : found.filter((item) => (item.group ?? '') === groupFilter.value);
});
/** @type {import('vue').ComputedRef<PaletteGroup[]>} */
const groups = computed(() => groupPaletteItems(filtered.value));
/** @type {import('vue').ComputedRef<PaletteItem[]>} */
const rows = computed(() => flattenPaletteGroups(groups.value));
/** @type {import('vue').ComputedRef<PaletteItem|null>} */
const activeItem = computed(() => rows.value[activeIndex.value] ?? null);
const groupNames = computed(() => groups.value.map((group) => group.group));

function reset() {
  query.value = '';
  groupFilter.value = null;
  activeIndex.value = -1;
}
async function focusInput() {
  await nextTick();
  document.getElementById('shell/palette/input')?.focus();
}
async function showPalette() {
  emit('update:visible', true);
  await focusInput();
}
function closePalette() {
  reset();
  emit('update:visible', false);
  emit('close');
}
/** @param {boolean} open */
function onVisible(open) {
  if (!open) closePalette();
}
/** @param {PaletteItem} item */
function select(item) {
  emit('select', item);
  closePalette();
}
/** @param {PaletteItem} item */
function actionName(item) {
  return `${item.kind === 'command' ? 'Run' : 'Open'} ${item.label}`;
}
/** @param {KeyboardEvent} event */
function onKey(event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = movePaletteIndex(rows.value.length, activeIndex.value, 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = movePaletteIndex(rows.value.length, activeIndex.value, -1);
  } else if (event.key === 'Enter') {
    const target = activeItem.value ?? rows.value[0] ?? null;
    if (target) select(target);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closePalette();
  } else if (event.key === 'Tab') {
    event.preventDefault();
    groupFilter.value = cyclePaletteGroup(groupNames.value, groupFilter.value);
    activeIndex.value = -1;
  }
}
watch(() => props.visible, (open) => {
  if (open) {
    reset();
    void focusInput();
  }
});
defineExpose({ openPalette: showPalette, closePalette });
</script>
<template>
  <Dialog
    id="shell/palette/dialog"
    :visible="visible"
    modal
    :show-header="false"
    :draggable="false"
    :dismissable-mask="true"
    :close-on-escape="true"
    :aria-label="label"
    class="s1-palette"
    @update:visible="onVisible"
  >
    <div class="s1-palette-search">
      <SearchIcon aria-hidden="true" />
      <UiTextInput
        id="shell/palette/input"
        data-semantic-anchor="shell/navigation/palette-search"
        v-model="query"
        :label="inputLabel"
        :placeholder="placeholder"
        aria-expanded="true"
        aria-controls="shell/palette/list"
        aria-autocomplete="list"
        @keydown="onKey"
      />
      <kbd class="s1-palette-kbd" aria-hidden="true"><span>esc</span></kbd>
    </div>
    <div v-if="groupFilter !== null" class="s1-palette-filter">
      <span>Group: {{ groupFilter === '' ? 'Entries' : groupFilter }}</span>
      <UiButton
        id="shell/palette/group-clear"
        data-semantic-anchor="shell/navigation/palette-group-clear"
        label="Clear group filter"
        aria-label="Clear group filter"
        class="s1-palette-clear"
        @click="groupFilter = null"
      />
    </div>
    <div id="shell/palette/list" role="list" :aria-label="label" class="s1-palette-list">
      <div v-for="group in groups" :key="group.group || 'entries'" class="s1-palette-group">
        <p v-if="group.group !== ''" class="s1-palette-group-label" aria-hidden="true">{{ group.group }}</p>
        <UiButton
          v-for="item in group.items"
          :key="item.id"
          :id="'shell/palette/item-' + item.id"
          :data-semantic-anchor="'shell/navigation/command-' + item.id"
          :label="item.label"
          :aria-label="actionName(item)"
          :aria-current="activeItem && activeItem.id === item.id ? 'true' : undefined"
          class="s1-palette-item"
          :class="{ 's1-palette-active': activeItem && activeItem.id === item.id }"
          @click="select(item)"
          @mousemove="activeIndex = rows.findIndex((row) => row.id === item.id)"
        >
          <slot name="item-icon" :item="item">
            <ChevronRightIcon v-if="item.kind === 'command'" aria-hidden="true" />
            <ThLargeIcon v-else aria-hidden="true" />
          </slot>
          <span class="s1-palette-text">
            <span class="s1-palette-label">{{ item.label }}</span>
            <span v-if="item.description" class="s1-palette-description">{{ item.description }}</span>
          </span>
          <kbd v-if="item.hint" class="s1-palette-kbd" aria-hidden="true">{{ item.hint }}</kbd>
        </UiButton>
      </div>
    </div>
    <slot name="empty">
      <p v-if="!rows.length" id="shell/palette/empty" role="status" class="s1-palette-empty">{{ emptyText }}</p>
    </slot>
    <div class="s1-palette-hints">
      <span><kbd class="s1-palette-kbd" aria-hidden="true">↑↓</kbd> Navigate</span>
      <span><kbd class="s1-palette-kbd" aria-hidden="true">↵</kbd> Select</span>
      <span><kbd class="s1-palette-kbd" aria-hidden="true">esc</kbd> Close</span>
      <span><kbd class="s1-palette-kbd" aria-hidden="true">tab</kbd> Filter by Group</span>
      <span><kbd class="s1-palette-kbd" aria-hidden="true">⌘K</kbd> Re-focus</span>
    </div>
  </Dialog>
</template>
<style>
.s1-palette{
  width: var(--cuk-component-app-shell-palette-width); max-width: 100vw;
  background: var(--cuk-component-dialog-host-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-component-dialog-host-border-color);
  border-radius: var(--cuk-primitive-radius-s1_xl);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.s1-palette .s1-palette-search{
  display: flex; align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md) var(--cuk-semantic-spacing-lg);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-palette .s1-palette-search svg{
  width: var(--cuk-semantic-typography-font-size-lg);
  height: var(--cuk-semantic-typography-font-size-lg);
  flex: none; color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-search input{
  width: 100%; flex: 1; min-width: 0;
  background: transparent; border-color: transparent;
  font-size: var(--cuk-semantic-typography-roles-body-md-font-size);
  line-height: var(--cuk-semantic-typography-roles-body-md-line-height);
  color: var(--cuk-semantic-text-primary);
}
.s1-palette-kbd{
  display: inline-flex; align-items: center;
  gap: var(--cuk-primitive-space-1);
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-palette .s1-palette-filter{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-2) var(--cuk-semantic-spacing-lg);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-filter .s1-palette-clear{min-width: 0;}
.s1-palette .s1-palette-list{
  display: flex; flex-direction: column;
  gap: var(--cuk-semantic-spacing-sm);
  padding: var(--cuk-semantic-spacing-md) var(--cuk-semantic-spacing-lg);
  max-height: calc(var(--cuk-component-app-shell-palette-width) * 0.75);
  overflow-y: auto;
}
.s1-palette .s1-palette-group{display: flex; flex-direction: column; gap: var(--cuk-primitive-space-1);}
.s1-palette .s1-palette-group-label{
  margin: 0; padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-3) 0;
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-sm-font-weight);
  text-transform: uppercase; color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-item{
  width: 100%; display: flex; align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-3) var(--cuk-primitive-space-4);
  background: transparent; border-color: transparent;
  border-radius: var(--cuk-semantic-radius-sm);
  text-align: left; min-width: 0;
}
.s1-palette .s1-palette-item svg{
  width: var(--cuk-semantic-typography-font-size-lg);
  height: var(--cuk-semantic-typography-font-size-lg);
  flex: none; color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-item:hover{background: var(--cuk-semantic-surface-hover-s1);}
.s1-palette .s1-palette-active{
  background: var(--cuk-semantic-selection-background);
  box-shadow: inset calc(var(--cuk-semantic-border-width) * 2) 0 0 var(--cuk-semantic-accent-primary);
}
.s1-palette .s1-palette-text{flex: 1; min-width: 0; display: flex; flex-direction: column;}
.s1-palette .s1-palette-label{
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--cuk-semantic-typography-roles-body-md-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-palette .s1-palette-description{
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-empty{color: var(--cuk-semantic-text-muted); padding: 0 var(--cuk-semantic-spacing-lg);}
.s1-palette .s1-palette-hints{
  display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md) var(--cuk-semantic-spacing-lg);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-palette .s1-palette-hints span{display: inline-flex; align-items: center; gap: var(--cuk-primitive-space-2);}
.s1-palette :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
