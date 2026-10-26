/**
 * @file Capsule health board entry: room MV1 lane H kit components plus the model and
 * agent_lane registry rows. Components take generic props and emit intents only;
 * product bindings live in the consumer adapter.
 */

export { default as CapsuleHealthBoard } from './CapsuleHealthBoard.vue';
export { default as HealthAlertList } from './HealthAlertList.vue';
export { default as HealthCapsuleRow } from './HealthCapsuleRow.vue';
export { default as HealthTelemetryStrip } from './HealthTelemetryStrip.vue';
export * from './healthModel.js';
export * from './healthRegistryRows.js';
