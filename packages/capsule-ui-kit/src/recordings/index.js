/**
 * @file Recordings entry: room MV1 lane R kit components plus the intent
 * builders and agent_lane registry rows. Components take generic props and
 * emit intents only; product bindings live in the consumer adapter. This
 * index only re-exports the lane bindings; the conductor wires the
 * top-level export later.
 * @module recordings/index
 */

// Lane R — recordings control bar and recordings panel.
export { default as RecordingControlBar } from './RecordingControlBar.vue';
export { default as RecordingsPanel } from './RecordingsPanel.vue';
// Lane R — intent builders and validators.
export * from './recordingsIntents.js';
// Lane R — agent_lane registry rows.
export * from './recordingsRegistryRows.js';
