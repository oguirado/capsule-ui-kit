/**
 * @file Fleet overview entry: room MV1 lane F kit components plus the model and
 * agent_lane registry rows. Components take generic props and emit intents only;
 * product bindings live in the consumer adapter. This index only re-exports the
 * lane bindings; the conductor wires the top-level export later.
 * @module fleet/index
 */

// Lane F — fleet overview panel and bulk bar.
export { default as FleetOverview } from './FleetOverview.vue';
export { default as FleetBulkBar } from './FleetBulkBar.vue';
// Lane F — census model and intent builders.
export * from './fleetModel.js';
// Lane F — agent_lane registry rows.
export * from './fleetRegistryRows.js';
