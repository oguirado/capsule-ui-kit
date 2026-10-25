/**
 * @file SaaS capsule component entry: default re-exports of the lane B-D kit components.
 * Components take generic props and emit intents only; product bindings live in the
 * consumer adapter. Lane B owns the wall files, lane C the detail files, lane D the
 * dispatch files; this index only re-exports their default component objects.
 */

// Lane B — wall tile, folded rail, veil and record states (SAAS-1).
export { default as SaasWallTile } from './SaasWallTile.vue';
export { default as SaasSurfaceView } from './SaasSurfaceView.vue';
export { default as SaasFoldedRail } from './SaasFoldedRail.vue';
export { default as SaasVeil } from './SaasVeil.vue';
export { default as SaasRecordButton } from './SaasRecordButton.vue';
export { default as SaasViewerChips } from './SaasViewerChips.vue';
// Lane C — capsule detail split (SAAS-2).
export { default as SaasDetailLayout } from './SaasDetailLayout.vue';
export { default as SaasGeometryBar } from './SaasGeometryBar.vue';
export { default as SaasSplitter } from './SaasSplitter.vue';
export { default as SaasConsoleRow } from './SaasConsoleRow.vue';
export { default as SaasShellToggle } from './SaasShellToggle.vue';
export { default as SaasEdgeStrip } from './SaasEdgeStrip.vue';
export { default as SaasFrameStrip } from './SaasFrameStrip.vue';
// Lane D — dispatch skin (SAAS-4).
export { default as SaasDispatchSkin } from './SaasDispatchSkin.vue';
export { default as SaasTargetRow } from './SaasTargetRow.vue';
export { default as SaasFrozenReview } from './SaasFrozenReview.vue';
export { default as SaasAccessibleBox } from './SaasAccessibleBox.vue';
export { default as SaasResultRows } from './SaasResultRows.vue';
