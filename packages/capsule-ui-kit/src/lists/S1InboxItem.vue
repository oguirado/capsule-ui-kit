<script setup>
/**
 * Generic S1 feed row body: read-state dot, title, tags, meta and excerpt.
 * No application names: the host supplies text via props and explicit row
 * actions through the actions slot.
 * @module lists/S1InboxItem
 */

/**
 * @typedef {object} S1InboxTag
 * @property {string} label Visible tag label.
 * @property {string} [tone] Tag tone: critical, info, neutral or warning.
 */

const props = defineProps({
  title: { type: String, required: true },
  excerpt: { type: String, default: '' },
  meta: { type: String, default: '' },
  unread: { type: Boolean, default: false },
  tags: { type: /** @type {import('vue').PropType<ReadonlyArray<S1InboxTag>>} */ (Array), default: () => [] },
});

/** @param {unknown} tone @returns {string} */
function tagTone(tone) {
  return tone === 'critical' || tone === 'info' || tone === 'warning' ? tone : 'neutral';
}
</script>
<template>
  <div class="s1-inbox-item">
    <span class="s1-inbox-item-dot" :class="{ 's1-inbox-item-read': !unread }" aria-hidden="true" />
    <div class="s1-inbox-item-body">
      <div class="s1-inbox-item-title-row">
        <span class="s1-inbox-item-title-group">
          <span class="s1-inbox-item-title">{{ title }}</span>
          <span
            v-for="(tag, index) in /** @type {S1InboxTag[]} */ (/** @type {unknown} */ (tags))"
            :key="index"
            class="s1-inbox-item-tag"
            :class="'s1-inbox-item-tag-' + tagTone(tag.tone)"
          >{{ tag.label }}</span>
        </span>
        <span v-if="meta" class="s1-inbox-item-meta">{{ meta }}</span>
      </div>
      <p v-if="excerpt" class="s1-inbox-item-excerpt">{{ excerpt }}</p>
      <div class="s1-inbox-item-actions"><slot name="actions" /></div>
    </div>
  </div>
</template>
<style>
.s1-inbox-item{
  display: flex; align-items: flex-start;
  gap: var(--cuk-primitive-space-5);
  padding: var(--cuk-primitive-space-5);
}
.s1-inbox-item:hover{
  background: var(--cuk-semantic-surface-hover-s1);
}
.s1-inbox-item-dot{
  width: var(--cuk-primitive-space-4); height: var(--cuk-primitive-space-4);
  margin-top: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-text-accent);
  flex: none;
}
.s1-inbox-item-read{
  background: var(--cuk-semantic-border-subtle);
}
.s1-inbox-item-body{
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  gap: var(--cuk-primitive-space-1);
}
.s1-inbox-item-title-row{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-primitive-space-3);
}
.s1-inbox-item-title-group{
  display: flex; align-items: center;
  gap: var(--cuk-primitive-space-3);
  min-width: 0; flex: 1;
}
.s1-inbox-item-title{
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  color: var(--cuk-semantic-text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
.s1-inbox-item-tag{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  padding: 0 var(--cuk-primitive-space-2);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  white-space: nowrap; flex: none;
}
.s1-inbox-item-tag-critical{
  background: var(--cuk-semantic-status-error-surface);
  border-color: var(--cuk-semantic-status-error-border);
  color: var(--cuk-semantic-status-error-text);
}
.s1-inbox-item-tag-info{
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-accent-tertiary);
}
.s1-inbox-item-tag-neutral{
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
}
.s1-inbox-item-tag-warning{
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-primitive-color-amber-400);
}
.s1-inbox-item-meta{
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
  white-space: nowrap; flex: none;
}
.s1-inbox-item-excerpt{
  margin: 0;
  font-size: var(--cuk-semantic-typography-font-size-sm);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  color: var(--cuk-semantic-text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.s1-inbox-item-actions{
  display: flex; gap: var(--cuk-primitive-space-2); flex-wrap: wrap;
}
.s1-inbox-item-actions:empty{
  display: none;
}
</style>
