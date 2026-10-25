<script>
/**
 * @fileoverview SAAS-2 frame strip helpers: neutral formatting for the
 * read-only frame identity line (frame / generation / digest). Display-only;
 * every value arrives via props from the live backend projection.
 * Plain JavaScript with JSDoc; no authored TypeScript, no product imports.
 */

export const SAAS_FRAME_STRIP_SCHEMA = 'capsule-ui-kit.saas-frame-strip/v1';

/**
 * Shortens a digest for the 11px mono strip (head…tail).
 * @param {unknown} value
 * @param {number} [head=8]
 * @param {number} [tail=6]
 * @returns {string} '' when no digest was provided.
 */
export function shortenDigest(value, head = 8, tail = 6) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length === 0) return '';
  const cleanHead = Number.isFinite(head) && head > 0 ? Math.floor(head) : 8;
  const cleanTail = Number.isFinite(tail) && tail > 0 ? Math.floor(tail) : 6;
  if (text.length <= cleanHead + cleanTail + 1) return text;
  return `${text.slice(0, cleanHead)}…${text.slice(text.length - cleanTail)}`;
}

/**
 * Resolves the visible frame-strip fields from raw props.
 * @param {{ frame?: unknown, generation?: unknown, digest?: unknown, readOnly?: unknown, readOnlyLabel?: unknown }} [input={}]
 * @returns {{ frameText: string, generationText: string, digestText: string, readOnlyText: string }}
 */
export function formatFrameStrip(input = {}) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const label = text(input.readOnlyLabel);
  return {
    frameText: text(input.frame),
    generationText: text(input.generation),
    digestText: shortenDigest(input.digest),
    readOnlyText: input.readOnly === false ? '' : (label.length > 0 ? label : 'READ-ONLY ISOLATED EXECUTION'),
  };
}
</script>
<script setup>
import { computed } from 'vue';

const props = defineProps({
  frame: { type: String, default: '' },
  generation: { type: String, default: '' },
  digest: { type: String, default: '' },
  readOnly: { type: Boolean, default: true },
  readOnlyLabel: { type: String, default: 'READ-ONLY ISOLATED EXECUTION' },
  stripId: { type: String, default: '' },
});

const fields = computed(() => formatFrameStrip({
  frame: props.frame,
  generation: props.generation,
  digest: props.digest,
  readOnly: props.readOnly,
  readOnlyLabel: props.readOnlyLabel,
}));

const accessibleName = computed(() => {
  const parts = [];
  if (fields.value.frameText.length > 0) parts.push(`Frame ${fields.value.frameText}`);
  if (fields.value.generationText.length > 0) parts.push(`generation ${fields.value.generationText}`);
  if (fields.value.digestText.length > 0) parts.push(`digest ${fields.value.digestText}`);
  if (fields.value.readOnlyText.length > 0) parts.push(fields.value.readOnlyText);
  return parts.length > 0 ? parts.join(', ') : 'Frame state unavailable';
});
</script>
<template>
  <div
    class="saas-frame-strip"
    role="group"
    :id="stripId.length > 0 ? stripId : undefined"
    :aria-label="accessibleName"
  >
    <div class="saas-frame-strip__keys">
      <span class="saas-frame-strip__key">FRAME: {{ fields.frameText.length > 0 ? fields.frameText : '—' }}</span>
      <span class="saas-frame-strip__key">GEN: {{ fields.generationText.length > 0 ? fields.generationText : '—' }}</span>
      <span class="saas-frame-strip__key">SHA256: {{ fields.digestText.length > 0 ? fields.digestText : '—' }}</span>
    </div>
    <div v-if="fields.readOnlyText.length > 0" class="saas-frame-strip__guard">
      {{ fields.readOnlyText }}
    </div>
  </div>
</template>
<style scoped>
.saas-frame-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  min-height: var(--cuk-component-saas-viewer-frame-strip-height, var(--cuk-primitive-space-12));
  padding: var(--cuk-primitive-space-0) var(--cuk-primitive-space-6);
  background-color: var(
    --cuk-primitive-color-saas-well,
    var(--cuk-semantic-surface-sunken)
  );
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-component-saas-viewer-frame-strip-font-size, var(--cuk-semantic-typography-font-size-xs));
  color: var(--cuk-component-saas-viewer-frame-strip-color, var(--cuk-semantic-text-muted));
}
.saas-frame-strip__keys {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-6);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.saas-frame-strip__key {
  overflow: hidden;
  text-overflow: ellipsis;
}
.saas-frame-strip__guard {
  flex: none;
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  color: var(--cuk-component-saas-chip-danger-text, var(--cuk-semantic-status-error-text));
}
</style>
