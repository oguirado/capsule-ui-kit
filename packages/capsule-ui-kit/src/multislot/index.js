/**
 * @file AI multislot entry: room MS1 kit components plus the intent builders and
 * agent_lane registry rows. Components take generic props and emit intents only;
 * product bindings live in the consumer adapter. Lane L1 owns the shell files, lane L2
 * the bar files, lane L3 the record files and intent builders, lane L4 this index and
 * the registry rows; this index only re-exports their named bindings.
 */

// Lane L1 — slot shell, panes, splitter.
export { default as AiMultiSlot } from './AiMultiSlot.vue';
export { default as AiSurfacePane } from './AiSurfacePane.vue';
export { default as AiTerminalPane } from './AiTerminalPane.vue';
export { default as AiSlotSplitter } from './AiSlotSplitter.vue';
// Lane L2 — control bar, input-mode chip, identity plate.
export { default as AiSlotControlBar } from './AiSlotControlBar.vue';
export { default as AiInputModeChip } from './AiInputModeChip.vue';
export { default as AiIdentityPlate } from './AiIdentityPlate.vue';
// Lane L3 — record cluster.
export { default as AiRecordCluster } from './AiRecordCluster.vue';
// Lane L3 — intent builders and validators.
export * from './multislotIntents.js';
// Lane L4 — agent_lane registry rows.
export * from './multislotRegistryRows.js';
