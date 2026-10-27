# Public Projection State Coordinator (`public-projection`)

## Purpose and Scope

`packages/capsule-ui-kit/src/state/publicProjection.js` implements the non-authoritative renderer state admission coordinator and read-only view facade specified in the shared UI architecture document (`architecture contract` in the consuming product) §§ 4, 12, and 13 (`Projection` writer unit).

The coordinator enforces a single admission boundary per renderer instance (`createPublicProjectionCoordinator`) while exposing only deeply frozen, alias-free snapshots through `getView()`.

## Closed Schema and Envelope Contract

Admitted envelopes must be plain objects containing only keys from `ALLOWED_ENVELOPE_KEYS`:

- `schema`: Non-empty string matching the coordinator's closed `allowedSchemas` set (defaults to `DEFAULT_ALLOWED_SCHEMAS` containing `PUBLIC_PROJECTION_SCHEMA_ID = "capsule-ui-kit.public-projection/v1"`).
- `epoch`: Non-negative exact safe integer (`Number.isSafeInteger`).
- `revision`: Non-negative exact safe integer (`ramRevision`).
- `durableRevision`: Optional non-negative exact safe integer (`<= revision`), tracked distinctly from `ramRevision`.
- `baseRevision`: Optional non-negative exact safe integer required when `mode === "delta"`.
- `mode`: `"snapshot"` (default) or `"delta"`.
- `query`: Non-empty string identifying the subscribed query.
- `projection`: Plain object payload containing domain rows/entities and summary values.

## Admission Rules and Negative Contrasts

1. **Subscription Readiness Gate**: `beginSession({ query, epoch })` creates a new local `generation` with `subscriptionReady: false` after invalidating any prior generation first (before invoking `onUnsubscribePrevious`). Snapshot requests (`canRequestSnapshot`) and admissions (`admit`, `admitInitialResponse`, `admitPush`) are refused with `ERR_SUBSCRIPTION_NOT_READY` until `markSubscriptionReady(generation)` succeeds.
2. **Unified Monotonic Admission (`C-FLOW`, `C-REV`)**: Both initial responses and push updates traverse `admit()`. A late initial response with `revision <= resident.revision` is refused (`ERR_STALE_REVISION`) and never rolls back a newer push. Mismatched `query`, older `epoch`, or invalidated `generation` are refused (`ERR_STALE_QUERY`, `ERR_STALE_EPOCH`, `ERR_STALE_GENERATION`).
3. **Exact Delta Base**: Delta envelopes require an admitted resident base matching `schema`, `epoch`, `query`, and `baseRevision === resident.revision` (`ERR_WRONG_DELTA_BASE`).
4. **All-or-Nothing Batch Validation (`C-PUBLIC`, `C-DECODE`, `C-INTEGER`)**:
   - Unknown top-level keys (`ERR_UNKNOWN_ENVELOPE_KEY`), floating-point or unsafe numbers (`ERR_INEXACT_INTEGER`), duplicate row IDs (`ERR_DUPLICATE_IDENTITY`), hidden facts (`ERR_HIDDEN_FACT`), or a malformed row anywhere in the batch including the last row (`ERR_MALFORMED_ROW`) reject the entire batch.
   - On any refusal, the previous admitted `lastGood` envelope remains intact and is marked `stale: true` with the structured `error` attached.
   - Missing monetary values (`null` or `undefined` on money fields) normalize to `'unavailable'`, never `0`.
5. **Alias Isolation and Read-Only Views (`C-OWN`)**: `cloneAndFreeze` deeply clones and freezes accepted payloads on ingress so caller mutations after admission have zero effect and view mutations throw `TypeError`.
6. **Selection and Intent Boundaries**:
   - `reconcileSelection(selectedIds)` returns only deduplicated stable string IDs present in the resident projection (`validIds`, `removedIds`), never entity copies.
   - `applyAcknowledgement()` always refuses (`ERR_ACK_CANNOT_PATCH_PROJECTION`).
   - `createPreviewDraft(payload, label)` produces an explicitly labelled frozen draft (`{ isDraft: true, label, draft }`) without modifying resident projection state.

## Verification

Run the unit test suite with Node's built-in test runner:

```bash
node --test packages/capsule-ui-kit/test/publicProjection.test.js
```
