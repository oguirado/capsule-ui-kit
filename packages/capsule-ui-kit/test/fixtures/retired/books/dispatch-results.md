# Dispatch Results (`packages/capsule-ui-kit/src/orchestrator/DispatchResults.vue`)

## Purpose and Scope

`DispatchResults.vue` implements the correlated per-target dispatch results presentation, non-authoritative `IntentStatus` tracking, witness-gated verification rules, uncertainty reconciliation, and guarded retry/cancel actions for the shared capsule UI kit (`architecture contract` §§3, 4, 6 G5, 7, 8, 9, 10, 12, 13).

It owns:
- Request correlation across `(requestId, sessionId, runId, epoch)` for core admission replies, named refusal alerts (`alerts/dispatch-{did}`), streamed plain-text output chunks (`output/{sid}/text`), adapter completion events, and verified core receipts (`§4`, `§7`, `§13`).
- Strict separation between core acceptance (`accepted`), in-flight execution (`executing`), adapter completion (`completed-unverified`), CLI outcomes without a structured completion witness (`Outcome Unknown (Unverified CLI)`), transport uncertainty (`uncertain`), and witness-verified outcomes (`verified-success`, `verified-failure`) so that **acceptance never appears verified** (`§7`, `§12`, `§13`).
- Per-target semantic result regions (`dispatch/{did}/target/{sid}/result`), guarded retry buttons (`dispatch/{did}/target/{sid}/retry`), and run cancellation buttons (`dispatch/{did}/target/{sid}/cancel`, `Stop-this-run` distinct from `Stop-session`, `§7`, `§9`).
- Browsable plain-text accessible output regions (`output/{sid}/text`) with no arbitrary HTML (`v-html` prohibited), no focus/scroll theft on arriving output, and no token-by-token live announcements (`§3`, `§7`, `§9`).
- Declarative semantic control inventory projection and synchronization (`syncDispatchResultsToRegistry`) into `controlRegistry.js` with `box: null` when hidden (`§9`).

## Architecture and Invariants

### 1. Correlation Contract & Non-Authoritative `IntentStatus` (`§4`, `§7`, `§13`)
- `registerDispatch` validates that `requestId`, `workspaceId`, and every `targetId` in `targetIds` are non-empty immutable strings (rejecting numeric index IDs, empty target lists, or duplicate targets) and binds a non-negative safe integer `epoch`.
- Every lifecycle mutation (`correlateCoreAcceptance`, `correlateCoreRefusal`, `correlateStreamChunk`, `correlateTargetAttention`, `correlateAdapterCompletion`, `correlateVerifiedReceipt`, `correlateDisconnectOrLostReply`, `reconcileUncertainTarget`, `requestCancelRun`) verifies `(requestId, sessionId, runId, epoch)` correlation first and fails closed on unknown dispatches, targets outside the frozen `targetIds` set, run ID mismatches, or stale epochs.
- Acknowledgements (`correlateCoreAcceptance`) never patch `PublicProjection` (`patchedProjection: false`, `§4`).

### 2. Negative Contrast: Acceptance & Adapter Completion Cannot Appear Verified (`§7`, `§12`, `§13`)
- `correlateCoreAcceptance` transitions pending targets to `accepted` (`verificationState: 'unverified-accepted'`, `verificationBadge: 'Accepted — Unverified'`, `appearsVerified: false`).
- `correlateStreamChunk` appends plain text within `maxStreamBytes` and enforces `mintedControlEvents: 0`, `escalatedCapability: false`, `appearsVerified: false`, `stoleFocus: false`, `stoleScroll: false`, and `announcedToken: false`. Forged strings, JSON fragments, or ANSI OSC sequences inside streamed text cannot alter verification status.
- `correlateAdapterCompletion` rejects output silence (`quietOutputOnly`), ANSI title changes (`ansiTitleOnly`), or regex matches (`regexMatchOnly`) with `COMPLETION_SENTINEL_REJECTED` (`§7`). CLI adapters lacking a structured completion witness (`hasStructuredCompletionWitness: false`) project `verificationState: 'outcome-unknown-unverified'` (`appearsVerified: false`). Structured adapter completion transitions to `completed-unverified` (`appearsVerified: false`).
- `correlateVerifiedReceipt` rejects transport-ack-only claims (`ACCEPTANCE_NOT_VERIFIED`), pixel-difference-only claims (`RECEIPT_PIXEL_DIFF_INSUFFICIENT`), and receipts missing a non-empty `receiptId`, non-empty `stateSha256` witness, or non-negative integer `tick` (`RECEIPT_MISSING_WITNESS`). Only a complete state/tick witness transitions a target to `verified-success` or `verified-failure` (`appearsVerified: true`).

### 3. Uncertainty Reconciliation, Cancel Run vs. Stop Session, and Guarded Retry (`§7`, `§9`, `§12`)
- `correlateDisconnectOrLostReply` marks non-terminal targets `uncertain` (`reconcileByRequestId: requestId`, `autoResentUnderNewId: false`).
- `requestRetryFailedTargets` enforces guarded retry: it refuses `uncertain` targets (`RETRY_UNCERTAIN_FORBIDDEN`), `verified-success` targets (`RETRY_SUCCESSFUL_FORBIDDEN`), and non-terminal targets (`RETRY_TARGET_NOT_TERMINAL_FAILURE`). Only terminal failure states (`verified-failure`, `refused`, `cancelled`) can be staged into a new explicitly reviewed retry linked to `parentRequestId` (`requiresExplicitReview: true`, `autoSubmitted: false`).
- `requestCancelRun` submits an explicit `Stop-this-run` cancel intent (`rolledBackCommittedEffects: false`, `stoppedSession: false`).

## AUSENTE Items (`§5`, `§7`, `§14 R3`)

- **UI subscription/cursor/catch-up and dispatch/cancel wire schemas in `envelope/v0.1`:** Declared `AUSENTE` in `architecture contract` §5 (`Observe agent results`, `Request agent work / cancel / resolve prompt uncertainty`) and §14 R3. `DispatchResults.vue` consumes correlated gateway events without inventing unapproved wire envelopes.
- **Structured adapter completion protocol name, version, and capabilities:** Declared `AUSENTE` in `architecture contract` §7 (ACP in Q21 is a candidate only, not an adopted API).
- **Authoritative workload stream byte caps:** Declared `AUSENTE` in `architecture contract` §5 and §7 (`maxStreamBytes` is configurable per instance without claiming a ratified product limit).

## Verification

Run the behavioral and SFC compilation test suite with `node:test`:

```bash
node --test packages/capsule-ui-kit/test/DispatchResults.test.js
```
