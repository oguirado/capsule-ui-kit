# Capsule Chrome (`CapsulePanel.vue`)

## 1. Purpose and Ownership Boundary

`packages/capsule-ui-kit/src/capsules/CapsulePanel.vue` implements the canonical **Capsule chrome** unit defined in the shared UI architecture document (`docs/UI_ARCHITECTURE.md` in the consuming product) §§3, 4, 5, 6, 8, 9, 10, 12, 13 and 14.

- **Owns (`UI_ARCHITECTURE.md` §3)**:
  - Canonical capsule header (`title`, 5 separate status axes, stale/readiness-error banners, and the 6 action controls: `fold`, `pin`, `control`, `popout`, `dock-back`, `close`).
  - Permanent body host (`v-show`, `data-permanent-host="true"`) housing the visual surface slot (`#surface`), the G5 activation veil, and the bound `MultiSlot` AI-session region (`#multislot`).
  - Read-only `PublicProjection` snapshot reader (`readCapsuleFromProjection`), declarative §9 semantic control inventory (`buildCapsuleSemanticInventory`, `syncCapsuleControlsToRegistry`), G5 fold/restore/take-control focus retry controller (`createFocusRetryController`), activation veil truth-table evaluator (`evaluateActivationVeil`, `arbitrateKeyboardOwnership`), and display-branch fold coordination (`createCapsuleChromeController`).
- **Excludes (`UI_ARCHITECTURE.md` §3, §6)**:
  - Credentials, PTY process ownership, shell execution, or duplicate per-host card implementations.
  - Spawning backend processes on panel mount (`mount()` sets `spawnedProcess: false`).
  - Treating presentation moves, tab switches, or Dockview panel remove/close callbacks as backend capsule destruction (`surface_request.destroy` is never emitted by panel close/move).

## 2. Five-Axis Status Separation & Snapshot Reader (`UI_ARCHITECTURE.md` §4, §6)

`readCapsuleFromProjection(projectionSnapshotOrView, capsuleId, options)` reads exclusively from an admitted `PublicProjection` snapshot or view (`packages/capsule-ui-kit/src/state/publicProjection.js`) and enforces strict separation across the 5 orthogonal axes:

| Axis | Admitted Values | Rule / Negative Contrast |
|---|---|---|
| `backendLifecycle` | `active`, `standby`, `ceded`, `destroyed`, `lost` (`ARCH:110`) | Unknown or invented enum values fail closed (`ERR_INVENTED_LIFECYCLE_ENUM`); single green/red boolean payloads fail closed (`ERR_COLLAPSED_STATUS_BOOLEAN`) |
| `uiPresentation` | `{ folded, slotFolded, pinned, presentationMode, panelOpen, panelSelected, controlRequestPhase }` | UI request phases (`creating`, `taking-control`, etc.) stay in `controlRequestPhase` and are never added to `backendLifecycle` |
| `aiSessionActivity` | `unknown`, `ready`, `busy`, `waiting-input`, `waiting-permission`, `exited`, `failed` | Only authenticated adapter/core projections change activity; quiet output (`outputQuietMs`) remains `unknown`, never `ready` |
| `attachmentState` | `detached`, `attaching`, `restoring`, `live`, `disconnected` | Separate from backend capsule lifecycle and session activity |
| `dispatchOutcome` | `none`, `admitting`, `accepted`, `executing`, `completed-unverified`, `verified`, `refused`, `uncertain`, `cancelled` | Transport/admission acceptance (`accepted`) is never presented as `verified` completion |

Additional snapshot invariants:
- **Exact immutable identity (`assertImmutableCapsuleId`)**: Rejects empty strings, whitespace, numeric list-length/index IDs (`ERR_NUMERIC_INDEX_ID`), display-number credentials (`:99`, `display:1` → `ERR_DISPLAY_CREDENTIAL_ID`), synthetic terminal success IDs (`term-ok-*` → `ERR_SYNTHETIC_TERM_ID`), and prefix matching (`ERR_CAPSULE_NOT_FOUND`).
- **Missing monetary/resource amounts**: Null or undefined `amount`, `balance`, `cost`, `price`, `cash`, `loan`, `equity`, `revenue`, `salary`, or `capacity` fields remain `'unavailable'` and are never coerced to `0` (`UI_ARCHITECTURE.md` §4, §12 `C-PUBLIC`).
- **Stale & error preservation**: When a newer batch is refused by `PublicProjection`, `readCapsuleFromProjection` preserves the last-good capsule projection with `stale: true` and `lastError` exposed in the header banner.

## 3. Fold Cannot Stop Capture (`UI_ARCHITECTURE.md` §6, §10, §12, §13)

| Event / Guard | Required Behavior | Negative Contrast |
|---|---|---|
| Fold capsule (`controller.fold()`) | Moves logical/DOM focus to `capsule/{id}/fold` before hiding; cancels pending focus retries; calls `scheduler.foldSurface(surfaceId)` to disable only the display branch and drain the pending presentation mailbox lease (`FOLD_DRAIN`); submits `surface_visibility` (`visible: false`); keeps DOM host mounted via `v-show` | Never emits `frame_unsubscribe` or `surface_request.destroy`; never releases the authoritative capture lease (`captureLeaseActive: true`); `assertFoldNeverStopsCapture({ unsubscribeCapture: true })` throws `ERR_FOLD_CANNOT_STOP_CAPTURE` |
| Upstream capture while folded | `scheduler.recordCaptureWitness(...)` continues advancing `captureCount` and `lastCaptureGeneration` while raising `minAdmissibleFrameGen` | Any arrival-driven or hidden frame draw submission (`scheduler.submitFrame`) while folded is rejected with `FOLDED_DISPLAY_DISABLED` |
| Unfold / reopen (`controller.unfold()`) | Calls `scheduler.unfoldSurface(surfaceId, { geometry })`, requesting the newest generation beyond any hidden capture witness (`requestedAfterFrameGeneration >= lastCaptureGeneration`); schedules `rAF + 120ms` restore focus/refit when geometry is positive | Replaying a hidden backlog frame (`frameGeneration <= lastCaptureGeneration`) after unfold is rejected with `STALE_FRAME_GENERATION` |
| Terminal `destroyed` / `lost` replacement | `controller.requestReplacement({ newCapsuleId, newSurfaceId })` submits `surface_request.create` only with a brand-new identity | Reusing the old `capsuleId` or `surfaceId` throws `ERR_REVIVE_OLD_IDENTITY_FORBIDDEN` (`ARCH:226`) |

## 4. Semantic Control Inventory (`UI_ARCHITECTURE.md` §9)

`buildCapsuleSemanticInventory` and `syncCapsuleControlsToRegistry` register and revalidate the 9 concrete controls per capsule instance in `packages/capsule-ui-kit/src/agent/controlRegistry.js`:

| Semantic Anchor | Role | Computed Accessible Name | Box / State Rules |
|---|---|---|---|
| `capsule/{id}/panel` | `region` | `{title}` | Rounded content-window CSS pixel box when visible; carries 5-axis state summary |
| `capsule/{id}/tab` | `tab` | `{title} ({backendLifecycle})` | `selected` and `backendLifecycle` state |
| `capsule/{id}/fold` | `button` | `Fold {title}` / `Unfold {title}` | `expanded: !folded`; disabled with `unavailableReason` when capsule is terminal |
| `capsule/{id}/pin` | `button` | `Pin {title}` / `Unpin {title}` | `pressed: pinned`; disabled with `unavailableReason` when capsule is terminal |
| `capsule/{id}/control` | `button` | `Take control of {title}` / `Release control of {title}` | `pressed` and `pending` state; disabled with `unavailableReason` when terminal |
| `capsule/{id}/popout` | `button` | `Pop out {title}` | Disabled by default under §14 R2 (`deny-window.open` policy) with explicit `unavailableReason` |
| `capsule/{id}/dock-back` | `button` | `Dock back {title}` | Enabled only when `floating` or `popout`; carries `unavailableReason` when already docked |
| `capsule/{id}/close` | `button` | `Close {title}` | Presentation panel close intent (never backend `destroy`) |
| `capsule/{id}/slot` | `region` | `AI sessions for {title}` | `inDom: true` (`v-show`), `visible: !folded && !slotFolded`, `box: null` whenever folded |

## 5. G5 Focus Retry & Activation Veil (`UI_ARCHITECTURE.md` §6)

- **Restore focus (`onRestoreVisible`)**: Rejects empty `0x0` geometry (`ERR_EMPTY_RESTORE_GEOMETRY`); schedules `rAF` + `120 ms` (`[CITED: FOLD]`) to refit terminals and focus the host.
- **Three-layer human Take Control (`beginHumanControlFocus`)**: Requires core-admitted human ownership (`controlOwner === 'human'` and `controlLeaseId`); executes slot census witness check, DOM host focus, and native surface focus via core/adapter at `0 ms`, `120 ms`, and `400 ms` (`[CITED: SLOT]`), revalidating identity, generation, visibility, owner, and intent ID on every tick.
- **Activation veil (`evaluateActivationVeil`)**: Shown if and only if `liveSurfaceCount > 1 && !hasKeyboardOwnership && !underAiCommand` on a non-terminal surface.
- **Live-surface control pointer guard (`guardLiveSurfaceControlPointerEvent`)**: Calls `preventDefault()` on `pointerdown` and `mousedown` on header buttons so clicking beside a live surface preserves live-host focus while `click` and keyboard activation remain intact.

## 6. Explicit AUSENTE Declarations

- **Host-window popout transfer IPC contract (`UI_ARCHITECTURE.md` §3, §5, §14 R2)**: Built-in `window.open` is denied by policy and the host-created hardened window transfer contract is `AUSENTE` / `BLOCKED`. `capsule/{id}/popout` remains visible as disabled with `DEFAULT_POPOUT_UNAVAILABLE_REASON` unless `popoutTransferSupported: true` is supplied by an admitted host adapter.
- **Complete backend lifecycle schema beyond `ARCH:110` (`UI_ARCHITECTURE.md` §6)**: Only `active`, `standby`, `ceded`, `destroyed`, and `lost` are admitted; any additional enum value is `AUSENTE` and rejected fail-closed.
- **Renderer display transport & frame ACK wire protocol (`UI_ARCHITECTURE.md` §5, §10, §14 R4/R5)**: Transport-neutral `#surface` slot and `presentationScheduler` hooks are provided; concrete IPC framing is `AUSENTE`.

## 7. Verification Command

```bash
node --test packages/capsule-ui-kit/test/CapsulePanel.test.js
```

`externalAiSlot` delegates the canonical `capsule/{id}/slot` region to a surface-owned MultiSlot and omits the empty default multislot section. The consumer must provide that single canonical slot; it does not create another backend, change window ownership, or stop sessions.
