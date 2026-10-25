<script setup>
import { computed } from 'vue';
import EyeSlashIcon from '@openvue/icons/eyeslash';
import UndoIcon from '@openvue/icons/undo';
import ChevronDownIcon from '@openvue/icons/chevrondown';
import ChevronUpIcon from '@openvue/icons/chevronup';
import UiButton from '../ui/UiButton.vue';

/**
 * Generic S1 hidden-capsules strip. The host owns window presentation
 * (hide/show/home retention); this strip only lists hidden entries and
 * reports restore intent. No application names.
 * @module shell/HiddenStrip
 */

/**
 * @typedef {object} HiddenStripItem
 * @property {string} id Stable capsule id.
 * @property {string} title Visible capsule title.
 * @property {string} [badge] Optional count or state badge.
 */

const props = defineProps({
  items: { type: Array, default: () => [] },
  expanded: { type: Boolean, default: true },
  title: { type: String, default: 'Hidden capsules' },
  showLabel: { type: String, default: 'Show' },
  showAllLabel: { type: String, default: 'Show all' },
  emptyText: { type: String, default: 'No hidden capsules.' },
});
const emit = defineEmits(['show', 'show-all', 'update:expanded']);

/** @type {import('vue').ComputedRef<HiddenStripItem[]>} */
const entries = computed(() => /** @type {HiddenStripItem[]} */ (/** @type {unknown} */ (props.items)));
const toggleLabel = computed(() => (props.expanded ? 'Collapse hidden capsules' : 'Expand hidden capsules'));

/** @param {string} id */
function show(id) {
  emit('show', id);
}
</script>
<template>
  <section id="shell/hidden-strip" :aria-label="title" class="s1-hidden">
    <div class="s1-hidden-head">
      <EyeSlashIcon aria-hidden="true" />
      <strong class="s1-hidden-title">{{ title }}</strong>
      <span class="s1-hidden-count" :aria-label="`${entries.length} hidden`">{{ entries.length }}</span>
      <span class="s1-hidden-spacer" aria-hidden="true" />
      <UiButton
        id="shell/hidden-strip/toggle"
        data-semantic-anchor="shell/navigation/hidden-toggle"
        :label="toggleLabel"
        :aria-label="toggleLabel"
        :aria-expanded="String(expanded)"
        aria-controls="shell/hidden-strip/list"
        class="s1-hidden-toggle"
        @click="emit('update:expanded', !expanded)"
      >
        <ChevronUpIcon v-if="expanded" aria-hidden="true" />
        <ChevronDownIcon v-else aria-hidden="true" />
      </UiButton>
      <UiButton
        id="shell/hidden-strip/show-all"
        data-semantic-anchor="shell/navigation/hidden-show-all"
        :label="showAllLabel"
        :aria-label="showAllLabel"
        :disabled="entries.length === 0"
        class="s1-hidden-all"
        @click="emit('show-all')"
      >
        <UndoIcon aria-hidden="true" />
        <span>{{ showAllLabel }}</span>
      </UiButton>
    </div>
    <ul v-if="expanded && entries.length > 0" id="shell/hidden-strip/list" class="s1-hidden-list">
      <li v-for="item in entries" :key="item.id" :id="'shell/hidden-strip/item-' + item.id" class="s1-hidden-chip">
        <span class="s1-hidden-name">{{ item.title }}</span>
        <span v-if="item.badge" class="s1-hidden-badge">{{ item.badge }}</span>
        <UiButton
          :id="'shell/hidden-strip/show-' + item.id"
          :data-semantic-anchor="'capsule/' + item.id + '/show'"
          :label="showLabel"
          :aria-label="'Show ' + item.title"
          class="s1-hidden-show"
          @click="show(item.id)"
        />
      </li>
    </ul>
    <p v-if="expanded && entries.length === 0" id="shell/hidden-strip/empty" role="status" class="s1-hidden-empty">
      {{ emptyText }}
    </p>
  </section>
</template>
<style>
.s1-hidden{
  background: var(--cuk-semantic-surface-panel);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  padding: var(--cuk-primitive-space-4) var(--cuk-primitive-space-8);
}
.s1-hidden .s1-hidden-head{display: flex; align-items: center; gap: var(--cuk-semantic-spacing-md);}
.s1-hidden .s1-hidden-head > svg{
  width: var(--cuk-semantic-typography-font-size-lg);
  height: var(--cuk-semantic-typography-font-size-lg);
  flex: none; color: var(--cuk-semantic-text-muted);
}
.s1-hidden .s1-hidden-title{
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  color: var(--cuk-semantic-text-primary);
}
.s1-hidden .s1-hidden-count{
  min-width: var(--cuk-primitive-space-8);
  padding: 0 var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-muted);
  text-align: center;
}
.s1-hidden .s1-hidden-spacer{flex: 1;}
.s1-hidden .s1-hidden-toggle{min-width: 0;}
.s1-hidden .s1-hidden-toggle svg{
  width: var(--cuk-semantic-typography-font-size-lg);
  height: var(--cuk-semantic-typography-font-size-lg);
}
.s1-hidden .s1-hidden-all{display: inline-flex; align-items: center; gap: var(--cuk-primitive-space-2);}
.s1-hidden .s1-hidden-all svg{
  width: var(--cuk-semantic-typography-font-size-s1_14);
  height: var(--cuk-semantic-typography-font-size-s1_14);
}
.s1-hidden .s1-hidden-list{
  display: flex; align-items: stretch; flex-wrap: wrap;
  gap: var(--cuk-semantic-spacing-md);
  margin: var(--cuk-semantic-spacing-md) 0 0; padding: 0; list-style: none;
}
.s1-hidden .s1-hidden-chip{
  display: inline-flex; align-items: center;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-2) var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  background: var(--cuk-semantic-surface-chrome);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
}
.s1-hidden .s1-hidden-name{
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-hidden .s1-hidden-badge{
  padding: 0 var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-accent);
}
.s1-hidden .s1-hidden-show{min-width: 0;}
.s1-hidden .s1-hidden-empty{
  margin: var(--cuk-semantic-spacing-md) 0 0;
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-hidden :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
