# Target Picker (`packages/capsule-ui-kit/src/orchestrator/TargetPicker.vue`)

## Purpose and Scope

`TargetPicker.vue` implements the core capability projection and explicit recipient selector for the Orchestrator Drawer (`architecture contract` §§3, 4, 6, 7, 8, 9, 13, 14). It is authored as a runtime-only-friendly Vue 3.5 SFC using `<script setup>` and a companion `<script>` module in plain JavaScript with JSDoc types (no `lang="ts"`, no consumer imports).

It owns:
- Closed-schema validation and deep-frozen ingress cloning for core-projected session capability descriptors (`validateSingleTargetCapability`, `validateTargetCapabilityProjection`, `§4`, `§6`).
- G3/G4 capability and eligibility projection (`projectTargetCapabilityRow`), mapping each session's `activity`, `attachment`, `inFlightLock`, and explicit `supportsQueue` bounds into `eligible`, `admissionMode` (`dispatch | queue | unavailable`), `statusBadge` (`Ready | Busy | Done | Error | Unavailable`), and human-readable `unavailableReason` (`§7`).
- Explicit recipient validation (`validateRecipientSelection`) and selection modes (`one`, `many`, `all`, and `clearTargets`) where duplicate, unknown, prefix-matched, bare-numeric, cross-workspace, same-slot (`slotId@generation`), or ineligible recipients refuse before any state mutation (`§6`, `§7`, `§9`, `§13`).
- Review target basis freezing (`freezeReviewTargets`) and automatic review invalidation whenever the selected target set, target capability basis, workspace scope, or visible `"all"` workspace scope changes (`§7`).
- Strict independence between checked recipient targets and `viewedSessionId`, `focusedTerminalSessionId`, and `controllingSessionId` (`§6`, `§7`, `§9`).
- Live-surface focus preservation (`preserveLiveSurfaceFocus` on `pointerdown` and `mousedown`, `§6 G5`), keyboard `Escape` handling (`close-picker` before `cancel-review`, never cancelling a run, `§7`), and declarative `§9` semantic control inventory generation (`drawer/targets/all`, `drawer/targets/clear`, `drawer/targets/{sid}`, and `session/{sid}/target`).

## Architecture and Invariants

### 1. Core Capability Projection and Alias Isolation (`§4`, `§6`, `§7 G3/G4`)
- `validateTargetCapabilityProjection(rawBatch, options)` enforces a closed property set (`sessionId`, `capsuleId`, `workspaceId`, `slotId`, `generation`, `epoch`, `activity`, `attachment`, `visibleInWorkspace`, `supportsQueue`, `maxQueueDepth`, `currentQueueDepth`, `inFlightLock`, `ownership`, `adapterProtocol`), rejects bare numeric list-index IDs (`SCHEMA_NUMERIC_INDEX_FORBIDDEN`), rejects duplicate `sessionId` or duplicate `slotId@generation` bindings in a batch, rejects stale epochs (`PROJECTION_STALE_EPOCH`), and freezes cloned descriptors so caller mutations cannot corrupt internal state.
- Only sessions in the active workspace with `attachment === 'live'` and `activity` in `['ready', 'waiting-input']` without an active `inFlightLock` are directly eligible (`admissionMode: 'dispatch'`).
- A `busy` or `inFlightLock` session is eligible (`admissionMode: 'queue'`) only when `allowQueue === true` and the authenticated adapter explicitly advertises `supportsQueue === true` with remaining capacity (`0 <= currentQueueDepth < maxQueueDepth`).

### 2. Duplicate, Unknown, Prefix, and Ineligible Recipient Refusal (`§6`, `§7`, `§9`, `§13`)
- `validateRecipientSelection` and `createTargetPickerState` refuse:
  - Duplicate recipient IDs (`TARGET_DUPLICATE_ID`)
  - Unknown or prefix-matched recipient IDs (`TARGET_UNKNOWN` — exact lookup only, never prefix matching)
  - Bare numeric index or whitespace IDs (`TARGET_INVALID_ID`)
  - Cross-workspace recipients (`TARGET_WRONG_WORKSPACE`)
  - Multiple recipients sharing the same `slotId@generation` lock (`G3_SAME_SLOT_CONFLICT`)
  - Ineligible recipients (`G4_ATTACHMENT_NOT_LIVE`, `G4_ACTIVITY_INELIGIBLE`, `G3_SLOT_BUSY_LOCKED`, `G3_QUEUE_FULL`)
- Refused selections preserve the prior valid recipient set and expose a named `role="alert"` refusal banner (`alerts/target-picker-refusal`).

### 3. Empty Never Means All & Review Invalidation (`§7`)
- Empty `selectedTargetIds` always disables `Send` (`sendEnabled: false`), and calling `freezeReviewTargets()` on an empty set refuses with `TARGETS_EMPTY`.
- `selectAllInWorkspace()` expands `"All"` into the explicit sorted visible and eligible session set in the active workspace prior to review. If a new session appears or visibility changes in the workspace while a review is frozen under `"all"` mode, the review is immediately invalidated with `REVIEW_INVALIDATED_ALL_SCOPE_CHANGED` so a newly created session can never silently join an already reviewed dispatch.

### 4. AI-Operability Contract (`§9`)
- Every actionable control carries a stable `id`, `data-semantic-anchor`, `role`, and computed accessible name:
  - `drawer/targets/all` (`button` / `Select all in workspace`)
  - `drawer/targets/clear` (`button` / `Clear targets`)
  - `drawer/targets/{sid}` (`checkbox` / session identity, capsule binding, status badge, and unavailable reason when disabled)
  - `session/{sid}/target` (`button` / explicit single-session target action)
- `getSemanticControls` returns `box: null` whenever the picker is hidden, unmaterialized, or off-DOM, and rounds content-window CSS pixel boxes when visible and materialized.

## AUSENTE Items (`§5`, `§7`, `§14 R3`)

- **Structured adapter protocol name, version, and capability schema:** Declared `AUSENTE` in `architecture contract` §7 (ACP in Q21 is a candidate to evaluate, not an adopted API). `adapterProtocol` defaults to `'AUSENTE'` unless supplied by a reviewed adapter projection.
- **Prompt/session/dispatch/cancel UI wire contract in `envelope/v0.1`:** Declared `AUSENTE` in `architecture contract` §5 and §14 R3. `TargetPicker.vue` manages UI-only explicit recipient selection and frozen review basis without synthesizing unapproved IPC or PTY wire payloads.

## Verification

Run the behavioral and SFC compilation test suite with `node:test`:

```bash
node --test packages/capsule-ui-kit/test/TargetPicker.test.js
```
