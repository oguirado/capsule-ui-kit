/**
 * @file Audit timeline entry: room MV1 lane A kit components plus the refusal
 * codes and agent_lane registry rows. Components take generic props and emit
 * intents only; product bindings live in the consumer adapter. This index
 * only re-exports the lane bindings; the conductor wires the top-level
 * export after the room closes.
 * @module audit/index
 */

// Lane A — audit timeline panel, stream tabs, record rows, receipt viewer.
export { default as AuditTimeline } from './AuditTimeline.vue';
export { default as AuditStreamTabs } from './AuditStreamTabs.vue';
export { default as AuditRow } from './AuditRow.vue';
export { default as AuditReceipt } from './AuditReceipt.vue';
// Lane A — refusal codes and human text.
export * from './auditRefusals.js';
// Lane A — agent_lane registry rows.
export * from './auditRegistryRows.js';
