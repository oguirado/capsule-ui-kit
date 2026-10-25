# Multislot Session Projection & Attachment (`multislot`)

## Purpose and Scope

`packages/capsule-ui-kit/src/capsules/MultiSlot.vue` implements the foldable AI session area, session tab switcher, attach/restore cursor reconciliation, G5 fold/restore focus and activation veil protocol, and §9 AI-operability semantic control inventory specified in the shared UI architecture document (`docs/UI_ARCHITECTURE.md` in the consuming product) §§ 3, 6, 7, 8, 9, 10, 12, and 13 (writer unit: **Multislot**).

The SFC is authored in plain JavaScript with JSDoc annotations (`<script>` module helpers plus `<script setup>` component bindings, no `lang="ts"`), zero consumer imports, and runtime-only precompiled templates.

## Five Orthogonal Multislot Axes (`UI_ARCHITECTURE.md` §6)

Backend lifecycle (`active`, `standby`, `ceded`, `destroyed`, `lost`), UI presentation, AI-session activity, attachment, and dispatch outcome remain strictly separate and never collapse into a single boolean:

| Axis | Admitted States | Behavioral Law |
|---|---|---|
| AI-region presentation | `expanded`, `folded` | Toggle moves DOM/logical focus to `capsule/{id}/fold` before hiding, keeps live hosts mounted via `v-show`, disables display scheduling, cancels pending focus retries, and never terminates sessions or capture |
| Session view selection | `selected`, `unselected` | Selecting a session tab changes only `viewedSessionId`; never alters `recipientSessionIds`, `activeControllerSessionId`, or backend process state |
| Attachment | `detached`, `attaching`, `restoring`, `live`, `disconnected` | Attach installs handlers first, requests snapshot/cursor, buffers bounded later chunks, applies snapshot and contiguous tail to a per-session non-reactive writer, then becomes `live` |
| Projected session activity | `unknown`, `ready`, `busy`, `waiting-input`, `waiting-permission`, `exited`, `failed` | Updated only from authenticated core/adapter projections; output silence never implies `ready` or completion |
| View retention | `live-view`, `replay-view`, `disposed` | Exited/failed sessions retain bounded read-only `replay-view`; explicit view disposal releases view state without killing independently owned backend processes |

## Normative Invariants and Negative Contrasts (`UI_ARCHITECTURE.md` §§ 6, 9, 12, 13)

| Gate / Invariant | Enforcement in `MultiSlot.vue` | Negative Contrast / Error Code |
|---|---|---|
| Session projection contract | `validateCapsuleSessionProjection` validates closed projection/session keys, exact safe integer `epoch`/`generation`, and immutable entity IDs | Rejects numeric list-length/index IDs (`ERR_NUMERIC_INDEX_ID`), display-number credentials (`ERR_DISPLAY_CREDENTIAL_ID`), and unknown keys (`ERR_UNKNOWN_PROJECTION_KEY`, `ERR_UNKNOWN_SESSION_KEY`) |
| Single active controller per capsule | At most one session tab per capsule may hold `role: 'controller'` or `hasControlLease: true`; passive reviewers cannot hold control leases | `ERR_MULTIPLE_CONTROLLERS`, `ERR_REVIEWER_CONTROL_LEASE_FORBIDDEN` |
| Mount, tab switch, fold, and remount cannot spawn or kill | `mountSlot`, `selectSessionTab`, `foldSlot`, `unfoldSlot`, and `remountPresentation` keep `spawnCount === 0` and `killCount === 0` | Passing spawn/kill options into `selectSessionTab` or `foldSlot` throws `ERR_TAB_CANNOT_SPAWN_OR_KILL` / `ERR_FOLD_CANNOT_SPAWN_OR_KILL` |
| Contiguous VT stream and parser ACKs | `applyRestoreSnapshot` and `writeLiveChunk` write directly to the registered non-reactive writer and update `acknowledgedOffset` only in the parser callback | Sequence gaps or stale epochs refuse to skip VT bytes (`ERR_STREAM_GAP_OR_STALE_EPOCH`) and restart reconciliation |
| Quiet output never implies ready | `recordOutputSilence` refuses to transition `busy` or `unknown` sessions to `ready` | `ERR_QUIET_OUTPUT_NOT_READY` |
| No revival under old identity | `reviveUnderSameIdentity` rejects reusing a destroyed/lost capsule or session ID (`ARCH:226`) | `ERR_REVIVE_OLD_IDENTITY_FORBIDDEN` |
| No prompt-injection callback hooks | `registerTerminalBridge` rejects `onTermReady(send)`, `sendStdin`, and `appendCrBroadcast` hooks | `ERR_FORBIDDEN_INJECTION_HOOK` |
| G5 fold/restore focus & retry schedule | Folding moves focus to `capsule/{id}/fold` before hiding and cancels pending retries; `notifyRestoreGeometry` schedules `[0, 120]` ms refit; `beginTakeControlFocus` schedules `[0, 120, 400]` ms retries across 3 layers | Empty-box frames rejected (`ERR_EMPTY_BOX_GEOMETRY`); late timers after fold/ownership change rejected (`ERR_FOCUS_RETRY_CANCELLED`) |
| G5 activation veil truth table | `computeActivationVeilState` shows the veil only when `liveSurfaceCount > 1`, `!hasKeyboardOwnership`, and `!underAiCommand` | Agent-owned targets (`underAiCommand: true`) never show an activation veil |
| Live-surface pointer focus guard | `preserveLiveSurfaceFocusGuard` calls `preventDefault()` on `pointerdown` and `mousedown` while keeping `click` and keyboard activation intact | Preserves live host focus during adjacent control clicks |
| §9 AI-operability & no hidden boxes | `buildMultiSlotSemanticControls` emits `capsule/{id}/slot`, `capsule/{id}/fold`, `capsule/{id}/session/{sid}/tab`, `session/{sid}/{attach,stop,replay,target}`, and `output/{sid}/text` | Hidden/folded controls always report `box: null` and reject fabricated boxes (`ERR_FABRICATED_HIDDEN_BOX`) |

## AUSENTE Items

- **UI-to-core session/attach/PTY wire schema and workload byte/watermark limits (`UI_ARCHITECTURE.md` §5, §6, §7, §14 R3/R12)**: `AUSENTE` — `MultiSlot.vue` consumes pre-validated projections and emits structured intents (`capsule_visibility_intent`, `session_stop_intent`) without inventing unapproved IPC wire bodies.
- **Complete backend lifecycle enum declarations beyond `active`, `standby`, `ceded`, `destroyed`, `lost` (`UI_ARCHITECTURE.md` §6:181)**: `AUSENTE` — `ALLOWED_BACKEND_LIFECYCLES` enforces the exact five ARCH states without adding unratified lifecycle enums.

## Verification Command

```bash
node --test packages/capsule-ui-kit/test/MultiSlot.test.js
```
