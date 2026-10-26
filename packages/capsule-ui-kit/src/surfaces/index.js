/**
 * @file Frame tile entry: room MV1 lane C kit component plus the port-protocol
 * model and agent_lane registry rows. The tile takes generic props (a
 * host-supplied MessagePort, display flags, a host-declared staleness timeout)
 * and posts back-pressure acks on that port only; product bindings live in the
 * consumer adapter.
 */

export { default as FrameCanvasTile } from './FrameCanvasTile.vue';
export * from './frameTileModel.js';
export * from './surfacesRegistryRows.js';
