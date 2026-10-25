<script setup>
import { computed, onBeforeUnmount, shallowRef, ref } from 'vue';

import HiddenStrip from './HiddenStrip.vue';
import HiddenStripDropPreview from './HiddenStripDropPreview.vue';
defineOptions({ inheritAttrs: false });
defineProps({ workspaceComponent: { type: Object, required: true } });
const emit = defineEmits(['ready']);
const workspace = shallowRef(/** @type {any} */ (null));
const expanded = ref(true);
const drag = shallowRef(/** @type {any} */ (null));
/** @type {Array<{dispose:()=>void}>} */
const subscriptions = [];
const hidden = computed(() => { void workspace.value?.revision.value; return workspace.value?.windows.listHidden() ?? []; });
/** @param {any} event */
function ready(event) {
  workspace.value = event;
  subscriptions.push(event.api.onWillShowOverlay((/** @type {any} */ overlay) => {
    const data = overlay.getData();
    const source = data?.panelId ? event.api.getPanel(data.panelId) : null;
    const target = overlay.group?.activePanel;
    drag.value = source && target && source.id !== target.id ? { source, target, action: overlay.position === 'center' ? (overlay.kind === 'content' ? 'Swap capsules' : 'Add as tab') : `Split ${overlay.position}` } : null;
  }));
  emit('ready', event);
}
function endDrag() { drag.value = null; }
/** @param {string} zone */
function activateZone(zone) {
  const current = drag.value;
  if (!current || !workspace.value) return;
  if (zone === 'swap') workspace.value.windows.swap(current.source.id, current.target.id);
  else current.source.api.moveTo({ group: current.target.group, position: zone === 'tab' ? 'center' : zone.replace('split-', '') });
  endDrag();
}
onBeforeUnmount(() => { for (const subscription of subscriptions) subscription.dispose(); });
</script>
<template>
  <div class="cuk-shell-workspace" @pointerup="endDrag" @pointercancel="endDrag" @keydown.esc="endDrag">
    <component :is="workspaceComponent" v-bind="$attrs" @ready="ready" />
    <HiddenStrip v-model:expanded="expanded" :items="hidden" @show="workspace?.windows.show($event)" @show-all="workspace?.windows.showAll()" />
    <HiddenStripDropPreview :visible="!!drag" :dragged-label="drag?.source.title ?? ''" :target-label="drag?.target.title ?? ''" :action-label="drag?.action ?? ''" @zone-activate="activateZone" />
  </div>
</template>
<style>
.cuk-shell-workspace{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;}
.cuk-shell-workspace > .mv-dock-workspace{flex:1;min-height:0;}
.cuk-shell-workspace #workspace-hidden-windows,.cuk-shell-workspace #workspace-drop-preview{display:none;}
/* Dockview retains pointer hit testing during native drag. */
.cuk-shell-workspace > .s1-drop{pointer-events:none;}
.cuk-shell-workspace > .s1-drop:focus-within{pointer-events:auto;}
</style>
