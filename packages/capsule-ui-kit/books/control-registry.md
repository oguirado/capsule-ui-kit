# Semantic Control Registry (`controlRegistry`)

## Purpose and Scope

`packages/capsule-ui-kit/src/agent/controlRegistry.js` implements the declarative component control inventory and AI-operability contract defined in the shared UI architecture document (`docs/UI_ARCHITECTURE.md` in the consuming product) §§3, 4, 5, 6, 7, 9, 10 and 13 (unit: **Semantic registry**).

The registry is a pure JavaScript ES module with JSDoc types, zero external runtime dependencies, and zero consumer imports. It enforces the separation between:

- DOM `id`, framework key, and AX handle
- Declarative `semanticAnchor` matching the closed 13-row control-family matrix
- Canonical collision-checked tuple `(windowId, presentationInstance, entityId, controlSlot)`
- Reviewed lane producer mapping from `semanticAnchor` + `(epoch, generation)` to `stableId`

## Normative Invariants (`UI_ARCHITECTURE.md` §9 & §13)

| Invariant | Enforcement in `controlRegistry.js` | Negative Contrast / Error Code |
|---|---|---|
| Closed 13-row control-family inventory | `matchControlFamily(semanticAnchor)` validates concrete anchors against `CONTROL_FAMILY_INVENTORY` and checks allowed ARIA/semantic roles | `ERR_UNKNOWN_CONTROL_FAMILY`, `ERR_INVALID_ROLE` |
| Immutable entity identities | `assertImmutableId` rejects empty, whitespace-containing, or bare numeric list-index/length tokens | `ERR_INVALID_IDENTITY`, `ERR_NUMERIC_INDEX_ID` |
| Canonical tuple and anchor uniqueness | Rejects duplicate `(windowId, presentationInstance, entityId, controlSlot)` tuples or duplicate `(windowId, presentationInstance, semanticAnchor)` registrations | `ERR_CONTROL_COLLISION` |
| Window/presentation namespacing | Popout and mirror windows use distinct `windowId` and `presentationInstance` namespaces and epochs; never add offsets to main-window boxes | `ERR_CONTROL_COLLISION`, `ERR_INVALID_BOX_SPACE` |
| Epoch freshness and revalidation | Registration, target resolution, and canonical export verify `entry.epoch === registry.epoch` and reject pending layout/scroll/sort/modal/theme/zoom/scale invalidations | `ERR_STALE_EPOCH`, `ERR_REVALIDATION_REQUIRED` |
| Reviewed lane producer boundary | UI cannot pass `stableId` (`ERR_UI_STABLE_ID_FORBIDDEN`). Canonical export requires an explicit reviewed non-bare-Electron producer and is blocked in retail builds | `ERR_UI_STABLE_ID_FORBIDDEN`, `ERR_LANE_PRODUCER_BLOCKED`, `ERR_RETAIL_EXPORT_FORBIDDEN` |
| Materialized content-window boxes | Boxes use rounded content-window CSS pixels (`x`, `y`, `width > 0`, `height > 0`). Hidden, folded, off-DOM, or synthetic nodes must have `box: null` | `ERR_FABRICATED_BOX`, `ERR_INVALID_BOX`, `ERR_INVALID_BOX_SPACE`, `ERR_TARGET_NOT_ACTIONABLE` |
| Disabled capsule action explanation | Disabled controls in `capsule/{id}/{fold,pin,control,close,popout,dock-back}` must carry a non-empty `state.unavailableReason` | `ERR_MISSING_UNAVAILABLE_REASON` |
| Unknown values never coerced to zero | `fleet/{id}/row` and `inspector/{id}/field` entries with `valueKnown: false` reject `value: 0` | `ERR_UNKNOWN_VALUE_ZERO` |
| Active modal scope and invoker restoration | `enterModalScope(dialogId, invokerAnchor)` marks background controls outside `dialog/{dialogId}/*` inert; `exitModalScope(dialogId)` returns the invoker anchor | `ERR_MODAL_BACKGROUND_INERT`, `ERR_MODAL_SCOPE_MISMATCH` |
| Battery digest vs. frame-binding digest | `computeStateDigests(state)` hashes canonical JSON with every `node.box` set to `null` (`batteryDigest`) and with boxes preserved (`frameBindingDigest`) | Moving a box changes `frameBindingDigest` only; changing role/name/state changes `batteryDigest` |
| Closed native `agent_lane` frame check | `validateAgentLaneFrame(frame)` enforces exact keys `nonce,seq,verb,body` (`observe` or `submit`) and T2 `submit` body keys `tick,seq,cmd,args` | `ERR_INVALID_LANE_FRAME` |

## Public API Summary

- `CONTROL_FAMILY_INVENTORY`: Frozen 13-row descriptor table from `UI_ARCHITECTURE.md` §9.
- `matchControlFamily(semanticAnchor)`: Returns the matched `ControlFamilyRule` or `null`.
- `createControlRegistry(config)`: Creates a window-scoped registry (`register`, `advanceEpoch`, `markNeedsRevalidation`, `revalidateControl`, `enterModalScope`, `exitModalScope`, `resolveActionableTarget`, `exportCanonicalState`).
- `canonicalizeStateJson(state, options)`: Deterministic sorted-key compact JSON serializer supporting `{ nullBoxes: true }`.
- `computeStateDigests(canonicalState)`: Computes `{ batteryDigest, frameBindingDigest, geometryFreeCanonicalJson, frameCanonicalJson }`.
- `validateAgentLaneFrame(frame)`: Validates closed native `agent_lane` envelopes and T2 `submit` bodies.

## AUSENTE Items

- **Reviewed Electron lane producer wire schema**: Direct Electron semantic export remains `BLOCKED` pending a reviewed producer contract because bare Electron is absent from the inspected peer enum (`UI_ARCHITECTURE.md` §9, §14 R8; `WEB:513`). `controlRegistry.js` accepts an injected `reviewedProducer` contract seam and fails closed (`ERR_LANE_PRODUCER_BLOCKED`) when absent.
- **Native `state_sha256` witness equivalence fixture**: Equivalence between `batteryDigest` and ARCH's `state_sha256` or session-record hash is `AUSENTE` (`UI_ARCHITECTURE.md` §9, §14 R10) and is not assumed.

## Verification Command

```bash
node --test packages/capsule-ui-kit/test/controlRegistry.test.js
```
