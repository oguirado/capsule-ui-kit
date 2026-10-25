# Orchestrator Drawer View (`packages/capsule-ui-kit/src/orchestrator/OrchestratorDrawer.vue`)

## Purpose and Scope

`OrchestratorDrawer.vue` implements the customer-support-style bottom orchestrator drawer view and its exported view controller (`createOrchestratorDrawerController`, `handleSeparatorKeydown`, `preserveLiveSurfaceFocusOnPointerDown`, `syncDrawerControlsToRegistry`) for the shared capsule UI kit (`UI_ARCHITECTURE.md` §§3, 6 G5, 7, 8, 9, 10, 12, 13).

It owns:
- Discoverable bottom launcher (`drawer/toggle`), maximize/restore chrome (`drawer/maximize`), and keyboard-operable resize separator (`workspace/separator/drawer-height`).
- Session tabs (`capsule/{id}/session/{sid}/tab`) and per-session operation buttons (`session/{sid}/{attach,replay,target,stop}`) with independent viewed, focused, controlling, and target-checked session identities (`§6`, `§7`).
- Explicit recipient target picker (`drawer/targets/{sid}`, `drawer/targets/all`, `drawer/targets/clear`) where empty targets disable `Send` and never mean all (`§7`).
- Plain multiline prompt composer (`drawer/composer`), untrusted clipboard paste staging (`alerts/paste-staging`), review freeze banner, invalidation alert (`alerts/review-invalidation`), and review/send action button (`drawer/send`).
- Per-target dispatch receipts (`dispatch/{did}/target/{sid}/{result,retry,cancel}`) and browsable plain-text output regions (`output/{sid}/text`).
- Single-instance presentation mobility (`bottom-track`, `docked-panel`, `tabbed-panel`, `popout-pending`) that preserves composer and dispatch ownership without creating a second composer (`§3`).

## Architecture and Invariants

### 1. No-Collapse-Kill & Permanent Host Continuity (`§6`, `§7`, `§12`, `§13`)
- The drawer is a labelled non-modal region (`role="region"`, `aria-label="Orchestrator Drawer"`; `aria-modal` is never set).
- The drawer body stays mounted via `v-show` when collapsed (`presentation === 'collapsed'`).
- Collapsing or toggling the drawer (`collapseDrawer()`, `toggleDrawer()`) preserves all running sessions, in-flight dispatches, prompt draft text, selected targets, and scroll offset (`sessionsKilled === 0`, `runsCancelled === 0`), and never invokes `onStopSession` or `onCancelRun`.
- `Stop-this-run` (`dispatch/{did}/target/{sid}/cancel` → `requestCancelTargetRun`) and `Stop-session` (`session/{sid}/stop` → `requestStopSession`) are strictly separate controls and handlers (`§7`).

### 2. Keyboard, IME Composition, and Terminal Isolation (`§7`, `§13`)
- **Composer keys:** Plain `Enter` inserts a newline (`insert-newline`); `Ctrl+Enter` / `Cmd+Enter` triggers `beginReview()` when in draft or `submitReviewedDispatch()` when an active review is valid.
- **IME guard:** `compositionstart` / `compositionend` and `event.isComposing` block `Ctrl/Cmd+Enter` and disable `drawer/send` while IME composition is active (`ignore-ime`).
- **Escape hierarchy:** `Escape` closes an open target picker first (`close-picker`), cancels an active frozen review second (`cancel-review`), or collapses the expanded drawer third (`collapse-drawer`), and never cancels an active run (`cancelRun: false`).
- **Terminal key isolation:** Any key event originating inside a terminal surface (`fromTerminal: true` or `[data-terminal-surface="true"]`), including `Ctrl+C`, `Ctrl+Enter`, or `Escape`, is ignored by the drawer (`ignore-terminal-key`) so terminal keystrokes never bubble into pane shortcuts.

### 3. Focus Retry Guards and Live-Surface Pointer Preservation (`§6 G5`)
- Expanding the drawer focuses `drawer/composer` immediately and schedules bounded retries at `120 ms` and `400 ms` (`FOCUS_RETRY_DELAYS_MS`).
- Collapsing the drawer or unmounting the component immediately cancels all pending focus retry timers (`cancelPendingFocusRetries()`) and moves focus to the launcher (`drawer/toggle`), preventing late timers from stealing focus into hidden content.
- Action buttons beside live surfaces bind `preserveLiveSurfaceFocusOnPointerDown` on `pointerdown` and `mousedown` (`event.preventDefault()`) so clicking chrome controls does not steal DOM focus from a live surface while keeping button click and keyboard activation intact.
- Arriving streamed output (`appendTargetStreamResult`) appends to the target's bounded plain-text projection with `stoleFocus: false` and `stoleScroll: false`.

### 4. AI-Operability & Semantic Control Registry Synchronization (`§9`)
- Every control declares a stable `id`, `data-semantic-anchor`, `role`, and computed `aria-label`.
- `syncDrawerControlsToRegistry` registers drawer controls into `controlRegistry.js`. When the drawer is collapsed, only `drawer/toggle` is marked `visible: true` with a measured content-window box; all inner controls are registered with `visible: false` and `box: null` so no fabricated box is ever exported while hidden.

## AUSENTE Items (`§5`, `§7`, `§14 R2–R3`)

- **Prompt/session/dispatch/cancel wire contract in `envelope/v0.1`:** `AUSENTE` (`UI_ARCHITECTURE.md` §5, §14 R3). `OrchestratorDrawer.vue` delegates review and submission to `drawerModel.js`, which produces a local `intentPreview` with `wireContractStatus: 'AUSENTE'` rather than inventing an unapproved IPC wire payload.
- **Structured adapter protocol name, version, and capabilities:** `AUSENTE` (`UI_ARCHITECTURE.md` §7). Session descriptors default `adapterProtocol` to `'AUSENTE'` unless supplied by a reviewed adapter projection.
- **Reviewed main-process popout window transfer contract:** `AUSENTE` (`UI_ARCHITECTURE.md` §14 R2). `movePresentationHost` tracks logical host presentation without calling `window.open`.

## Verification

Run the behavioral and SFC compilation test suite with `node:test`:

```bash
node --test packages/capsule-ui-kit/test/OrchestratorDrawer.test.js
```
