# Drawer Model (`packages/capsule-ui-kit/src/orchestrator/drawerModel.js`)

## Purpose and Scope

`drawerModel.js` implements the pure state machine, closed draft/target validation schemas, review freeze and invalidation guards, deterministic request identity derivation (G2), per-slot dispatch reservation checks (G3), target eligibility rules (G4), and semantic control inventory projection for the Orchestrator Drawer (`UI_ARCHITECTURE.md` §§3, 4, 5, 6, 7, 9, 13, 14).

It owns:
- Presentation state transitions (`collapsed`, `expanded`, `maximized`) with height clamping and scroll/draft/session preservation across collapse (`§7`).
- Independent session identities for viewed tab, focused terminal, controlling session, and checked recipient targets (`§6`, `§7`).
- Closed schema validation for prompt drafts (`validatePromptDraft`) and projected session target descriptors (`validateSessionTargetDescriptor`) before review or submission (`§13`).
- Explicit target selection modes (`one`, `many`, `all`) where `all` expands into the explicit visible workspace session set prior to review, and empty targets always disable `Send` (`§7`, `§13`).
- Review snapshot freezing (`beginReview`) and automatic invalidation whenever the prompt text, selected targets, workspace scope, visible `"all"` scope, or per-target capability/readiness basis changes (`§7`, `§13`).
- Deterministic `request_id` derivation (`resolveDispatchRequestId`), envelope `(nonce, seq)` deduplication, body-collision detection (`G2`), per-slot lock tracking (`G3`), and target readiness re-verification (`G4`).
- Attributed per-target lifecycle tracking (`pending`, `accepted`, `queued`, `executing`, `completed-unverified`, `verified-success`, `verified-failure`, `refused`, `cancelled`, `uncertain`) with state/tick witness enforcement and guarded retry staging (`§7`).
- Declarative semantic control inventory generation for `drawer/*` and `dispatch/{did}/target/{sid}/*` anchors (`§9`).

## Architecture and Invariants

### 1. Prompt and Target Schemas First (`§13`)
- `validatePromptDraft(promptText, options)` rejects non-strings, empty or whitespace-only text, NUL bytes (`\u0000`), and UTF-8 byte lengths exceeding `maxPromptBytes`.
- `validateSessionTargetDescriptor(raw)` enforces a closed property set (`sessionId`, `capsuleId`, `workspaceId`, `slotId`, `generation`, `epoch`, `activity`, `attachment`, `visibleInWorkspace`, `supportsQueue`, `maxQueueDepth`, `currentQueueDepth`, `inFlightLock`, `ownership`, `adapterProtocol`) with exact safe-integer and enum checks.

### 2. Review Freeze and Invalidation (`§7`, `§13`)
- **Empty targets never mean all:** Calling `beginReview()` with zero selected targets fails with `TARGETS_EMPTY`, and `drawer/send` remains disabled.
- **Explicit `"All"` expansion and invalidation:** `selectAllVisibleInWorkspace()` expands into the sorted visible sessions in the current workspace. If a new visible session is created or visibility changes after `beginReview()`, the review is immediately invalidated with `REVIEW_INVALIDATED_ALL_SCOPE_CHANGED` so a newly created session can never silently join an already reviewed dispatch.
- **Basis/Prompt/Target invalidation:** Editing the prompt draft, toggling or clearing targets, changing workspace scope, or receiving a session projection update that alters a target's `epoch`, `generation`, `activity`, `attachment`, `ownership`, or `adapterProtocol` invalidates the active review.

### 3. Dispatch Admission Invariants (`G2`, `G3`, `G4`)
- **G2 Request Identity & Dedup:** When `request_id` is omitted, `resolveDispatchRequestId` computes `sha256(UTF-8 canonical JSON(["dispatch-request/v1", session, authenticated_sender_instance, nonce, seq]))` in lowercase hex. Missing `session`, `authenticated_sender_instance`, `nonce`, or `seq` refuses immediately. Replaying an accepted `(session, sender, nonce, seq)` tuple refuses with `G2_DUPLICATE_NONCE_SEQ`. Reconciling an existing `request_id` under a fresh envelope returns the original record without a second effect only if the canonical `bodyDigest` matches; any changed prompt or target set under the same `request_id` refuses with `G2_REQUEST_ID_COLLISION`.
- **G3 Per-Slot Dispatch Lock:** Each target slot is keyed by `${slotId}@${generation}`. At most one in-flight dispatch lock is held per slot unless the adapter explicitly advertises `supportsQueue: true` with remaining capacity (`currentQueueDepth < maxQueueDepth`) and queue admission is requested. Locks release only on verified terminal receipt, core refusal, or core-confirmed cancellation; `uncertain` outcomes retain the slot reservation.
- **G4 Target Eligibility:** Only sessions with `attachment === 'live'` and `activity` in `['ready', 'waiting-input']` are directly eligible. Sessions in `unknown`, `busy` (without explicit queue eligibility), `waiting-permission`, `exited`, or `failed` states are rejected before admission.

### 4. Separation of Acceptance, Completion, and Verification (`§7`)
- `recordCoreAccepted` transitions targets to `accepted`, never `verified-success`.
- `recordAdapterCompletion` marks `adapterCompleted: true` and `status: 'completed-unverified'`.
- `recordVerifiedReceipt` requires a non-empty `receiptId`, `stateSha256` witness, and non-negative integer `tick` before marking `verified-success` or `verified-failure`.
- `stageRetryForFailedTargets` refuses to retry `uncertain` targets (`RETRY_UNCERTAIN_FORBIDDEN`) or `verified-success` targets (`RETRY_SUCCESSFUL_FORBIDDEN`).

## AUSENTE Items (`§5`, `§7`, `§14 R3`)

- **Wire schema for prompt/session/dispatch/cancel in `envelope/v0.1`:** Declared `AUSENTE` in `UI_ARCHITECTURE.md` §5 and §14 R3. `submitReviewedDispatch` emits a local `intentPreview` marked with `wireContractStatus: 'AUSENTE'` and never fabricates a privileged IPC or PTY payload.
- **Adapter structured protocol identity and capabilities:** Declared `AUSENTE` in `UI_ARCHITECTURE.md` §7 (`adapterProtocol` defaults to `'AUSENTE'` until a reviewed protocol contract is supplied).

## Verification

Run the unit test suite with `node:test`:

```bash
node --test packages/capsule-ui-kit/test/drawerModel.test.js
```
