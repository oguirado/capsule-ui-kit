# Presentation Scheduler (`presentationScheduler.js`)

## Ownership and Unit Scope

| Field | Value |
|---|---|
| Unit | Surface scheduling (`UI_ARCHITECTURE.md` §13) |
| Source module | `packages/capsule-ui-kit/src/surfaces/presentationScheduler.js` |
| Verification test | `packages/capsule-ui-kit/test/presentationScheduler.test.js` |
| Companion book | `packages/capsule-ui-kit/books/presentation-scheduler.md` |
| Governing sections | `UI_ARCHITECTURE.md` §§3, 4, 5, 6, 9, 10, 13 |

## Architectural Contract

1. **External Non-Reactive Service Registry (§4, §10)**:
   Frames, single-slot mailboxes, presentation frame leases, and bounded warm resources live inside a non-reactive external scheduler registry (`createPresentationScheduler`), never inside reactive Vue stores, template interpolations, or arrival-driven watchers.
2. **Five-Axis Drawable Eligibility and Rounded Boxes (§9, §10)**:
   `evaluateDrawableEligibility(state)` admits draws and uploads only when all five conditions hold simultaneously:
   - Hosting panel is open and selected (`panelOpen === true && panelSelected === true`).
   - Surface display branch is unfolded (`folded === false`).
   - Materialized content dimensions are positive (`Math.round(width) > 0 && Math.round(height) > 0`; a first empty-box `0x0` frame never supplies fake geometry).
   - Surface intersects the visible viewport (`viewportIntersecting === true`).
   - Host window presentation permits drawing (`windowPresentationAllowed === true` and `contextLost !== true`).
   When eligible, the scheduler computes a frozen `{ x, y, width, height }` box in rounded content-window CSS pixels. When hidden or ineligible, `box` is `null`.
3. **Coordinated Fair Scheduling Under a Frozen Budget (§10, §12, §13)**:
   `validateFrozenBudget(budget)` enforces that `maxDrawsPerTick`, `maxUploadBytesPerTick`, `maxPresentMsPerTick`, `maxWarmResourcesPerSurface`, and `maxDrainSteps` are explicitly defined and frozen (`Object.isFrozen(budget)`) before execution. Missing, unfrozen, or unknown budget keys fail closed (`INVALID_BUDGET`). `runTick()` consumes each eligible surface's single-slot newest mailbox in fair round-robin order (`fairCursor`) without starving trailing surfaces when a tick ceiling is reached.
4. **Fold, Drain, Capture Continuity, and Fresh Reopen (§6, §10, §12)**:
   - `foldSurface(surfaceId, { drainSteps })` disables only the display branch, drains and releases any pending presentation mailbox lease (`FOLD_DRAIN`), and trims warm resources to `maxWarmResourcesPerSurface`.
   - Upstream capture leases (`captureLeaseId`, `captureLeaseActive`) are never released by DOM hide, fold, panel move, or GPU context loss; `recordCaptureWitness()` continues advancing `captureCount` and `lastCaptureGeneration` while folded.
   - `unfoldSurface(surfaceId, { geometry })` advances the minimum admissible frame generation floor to `max(lastPresentedFrameGen, minAdmissibleFrameGen, lastCaptureGeneration)` and invokes `onRequestNewestGeneration` so reopen presents only fresh generations and rejects any hidden backlog replay (`STALE_FRAME_GENERATION`).
5. **Generation, Lease, and Timing-Scope Enforcement (§10, §13)**:
   - `submitFrame()` and `runTick()` reject mismatched surface generations (`STALE_SURFACE_GENERATION`), non-monotonic or backlog frame generations (`STALE_FRAME_GENERATION`), missing or expired frame leases (`STALE_LEASE`), and hidden/folded draws (`HIDDEN_SURFACE`, `FOLDED_DISPLAY_DISABLED`), releasing rejected leases immediately.
   - Per-surface instrumentation tracks `captureCount`, `decodeCount`, `presentCount`, `drawSubmissions`, `uploadSubmissions`, `bytesUploadedTotal`, `mailboxReplacements`, `rejectedHiddenDraws`, `rejectedStaleFrames`, `warmResourceCount`, `warmResourceBytes`, `lastPresentAgeMs`, `inputToPresentMs`, and isolated timing scopes (`submissionMs`, `parserConsumptionMs`, `presentationMs`, `verifiedDomainEffectMs`).

## Exported API

- `SCHEDULER_REASONS`: Frozen dictionary of refusal and diagnostic reason codes.
- `validateFrozenBudget(budget, options)`: Validates a frozen scheduler budget object.
- `evaluateDrawableEligibility(state)`: Evaluates the 5 drawable eligibility axes and returns `{ eligible, reasons, box }`.
- `createPresentationScheduler(options)`: Instantiates the coordinated fair scheduler with methods `registerSurface`, `recordCaptureWitness`, `submitFrame`, `foldSurface`, `unfoldSurface`, `updateSurfaceState`, `presentSurfaceNow`, `runTick`, `allocateWarmResource`, `onContextLost`, `onContextRestored`, `destroySurface`, and `getInstrumentation`.

## AUSENTE Items (Not Invented)

- Renderer display transport wire framing, OpenSuperficies binary/socket protocol, and core-to-renderer IPC frame lease wire schema (`UI_ARCHITECTURE.md` §5, §14 R4): **AUSENTE** (designed via transport-neutral callback hooks `onPresent`, `onReleaseLease`, `onRequestNewestGeneration`).
- Production codec selection (MJPEG vs H.264/video vs WebRTC vs shared memory) and ratified wall capacity numbers (`UI_ARCHITECTURE.md` §2, §10, §14 R5): **AUSENTE** (callers must supply an explicitly frozen `FrozenSchedulerBudget` object).
