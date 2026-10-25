# AI multislot kit surface (`multislot-ai`)

## Purpose and Scope

`packages/capsule-ui-kit/src/multislot/` implements the generic AI multislot: one capsule
(program, browser or virtual-machine live surface) with an ATTACHED, hideable AI terminal
that travel together as a pair and are never separated. The components are authored in
plain JavaScript with JSDoc annotations (`<script setup>` bindings, no `lang="ts"`), take
generic props, and emit `submit-intent` objects only; product bindings live in the consumer
adapter. Lane L1 owns the shell, panes and splitter; lane L2 the control bar, input-mode
chip and identity plate; lane L3 the record cluster and intent builders; lane L4 (this
book) the `component.aiMultiSlot.*` tokens, the agent_lane registry rows and the entry
index. Lane L5 owns the behaviour suites and the bench demo page.

Slot buttons are operator tools, never AI states. The operator addresses the AI only
through the multislot terminal. There is no AI-activity indicator and no pause-AI button.

## Orthogonal Slot Axes

| Axis | Admitted States | Behavioral Law |
|---|---|---|
| Pair presentation | `expanded`, `folded` | Fold hides the whole body with `v-show` (never unmount); focus moves to the fold control before hiding; sessions, capture and PTY keep running; fold duration `0ms` |
| Surface half | `shown`, `hidden` | Independent per-half `v-show`; the live surface host stays mounted; hidden panes report no geometry |
| Terminal half | `shown`, `hidden` | Independent per-half `v-show`; PTY buffers and AI processes keep running; exited tabs stay dimmed and readable until closed |
| Attachment | `detached`, `attaching`, `restoring`, `live`, `disconnected` | Attach installs handlers first, then snapshot/cursor reconciliation, then `live` |
| Projected session activity | `unknown`, `ready`, `busy`, `waiting-input`, `waiting-permission`, `exited`, `failed` | Updated only from authenticated host projections; output silence never implies `ready` |
| View retention | `live-view`, `replay-view`, `disposed` | Exited/failed sessions retain bounded read-only `replay-view`; disposal is view-only |
| Operator input mode | `read`, `write` (default `read`) | `read`: operator pointer/keyboard input to the surface is not forwarded. `write`: operator input acts on the capsule WHILE the AI keeps working. Switching mode never takes control away from the AI |
| Record phase | `idle`, `starting`, `recording`, `stopping`, `sealed`, `error` | One click toggles; busy phases set `aria-busy` with a reason; elapsed `MM:SS` plus `RAM`/`DISK` store chip |
| Surface state | `live`, `connecting`, `lost`, `empty` | Never render a faked `live` surface |
| Dock state | `docked`, `floating` | Detach moves the whole pair to a host-owned float frame presentation-only; `dock-back` returns it |

## Host Capabilities (consumed, never implemented)

The kit renders host projections and emits intents; sinks, sessions and enforcement live
in the consumer adapter:

| Capability | Contract |
|---|---|
| `SurfaceStream` | `subscribe(capsuleId, onFrame)`, `setInputEnabled(capsuleId, bool)`, `geometry(capsuleId)` |
| `RecordingSink` | `destination('ai'|'disk')`, `start`/`stop`, `onPhase`; disk start refused when `destination()` is `null` |
| `ScreenshotSink` | `capture(capsuleId, 'ram'|'disk')`; RAM default |
| `TerminalSession` | `open`/`input`/`resize`/`close`/`onOutput`/`onExit`; PTY in the user shell, shell entry first |
| Input-mode enforcement | Host forwards or refuses surface input per mode and journals WRITE-mode operator input |

Intent vocabulary (all via `submit-intent` `{type, capsuleId, ...}`): `record-ai`,
`record-disk`, `screenshot`, `copy-id`, `hide-surface`, `show-surface`, `hide-terminal`,
`show-terminal`, `input-mode-read`, `input-mode-write`, `fold`, `unfold`, `float`,
`dock-back`, `close`; plus the host event `operator-guidance` (`{capsuleId, ts,
inputKind}`) emitted when the operator acts in WRITE mode.

## Tokens, Registry Rows, Entry Index (lane L4 surface)

- `src/design/tokens.json` carries the additive `component.aiMultiSlot.*` family (`pane`,
  `splitter`, `controlBar`, `inputMode`, `identity`, `record`, `veil`, `motion`): every
  value references `semantic.*` only (never raw hex, never vendor variables); `light` +
  `dark` (+ `saas-light`/`saas-dark`) resolve through the referenced semantic modes; pill
  radii and the SYSTEM font stack come from `semantic.radius.pill` and
  `semantic.typography.fontFamily.sans`; `motion.foldDuration` is `0ms` in all modes.
- `src/multislot/multislotRegistryRows.js` maps the 14 `multislot.*` agent_lane ids to
  anchor templates (same row shape as the SaaS registry module, which is not edited);
  every id resolves through `multislotAnchorFor`. Rows marked `new` need additive
  families in the agent control registry (see AUSENTE).
- `src/multislot/index.js` re-exports exactly the eight lane components and nothing else.

## Normative Invariants and Negative Contrasts

| Gate / Invariant | Enforcement | Negative Contrast / Error Code |
|---|---|---|
| Fold, hide/show, float/dock-back and tab switches are presentation-only | `v-show` keep-alive; live hosts stay mounted; spawn/kill counts stay `0` | `ERR_MULTISLOT_SPAWN_OR_KILL`, `ERR_MULTISLOT_UNMOUNT_ON_HIDE` |
| Input mode never takes control from the AI | Visible `read|write` chip, default `read`, one-click toggle; WRITE-mode input emits `operator-guidance` for the host journal | Any take/cede, activity or pause control is out of contract and refused |
| Disk-gated capture | Disk controls disabled with a literal reason when the host offers no destination | `ERR_DISK_RECORD_WITHOUT_DESTINATION` |
| Kit performs zero disk/network/clipboard writes | Intents and host sinks only; no `fs`/fetch/clipboard imports in `src/multislot/` | `ERR_KIT_DISK_WRITE` |
| No hidden boxes | Hidden/folded controls report `box: null`; every control keeps label + role + stable id + anchor | `ERR_FABRICATED_HIDDEN_BOX` |
| Stable capsule identity | Immutable `cap-*` ids assigned by the host, never invented; unmeasured fields render `unknown`, never `0`; copy states `ready|copying|copied|unavailable` | `ERR_INVENTED_CAPSULE_ID`, `ERR_REVIVE_OLD_IDENTITY_FORBIDDEN` |
| Tokens only | Components consume `component.aiMultiSlot.*` variables; the family references `semantic.*` only | Raw hex or vendor variables in kit components fail publication hygiene |

## AUSENTE Items

- **Additive agent-registry families for the nine `new` multislot anchors**: `AUSENTE` — no
  room lane owns the agent control registry; the rows document the templates and the
  registry refuses unknown families until they land.
- **Host-side input-mode enforcement and guidance journal**: `AUSENTE` in the kit by
  design — the kit emits `input-mode-read`/`input-mode-write` intents and the
  `operator-guidance` event; forwarding and journaling live in the consumer adapter.
- **Generated `theme.css` variables for `component.aiMultiSlot.*`**: `AUSENTE` until the
  next `theme.css` regeneration from `tokens.json` (the stylesheet carries no independent
  values); components consume `var(--cuk-component-ai-multi-slot-*)` after that step.

## Verification Command

```bash
node --test packages/capsule-ui-kit/test/multislot-ai.test.js
```
