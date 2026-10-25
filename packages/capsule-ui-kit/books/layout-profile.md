# Layout Profile and Migration (`books/layout-profile.md`)

## Scope and Authority

This companion book documents the `UiLayout` persistence boundary, closed layout profile schema, sequential pure migration pipeline, `MissingPanel` replacement rules, and read-only quarantine guard implemented in `packages/capsule-ui-kit/src/workspace/layoutProfile.js` and verified in `packages/capsule-ui-kit/test/layoutProfile.test.js`.

Governing design sections in the shared UI architecture document (`docs/UI_ARCHITECTURE.md` in the consuming product):
- **§3 Component inventory and ownership**: `DockWorkspace` (panel registry, Dockview adapter, restoration barrier) and `MissingPanel` (preserved layout identity and recoverable unavailable-type explanation; never fake content or synthetic backend handles).
- **§4 Non-authoritative state and persistence (`UiLayout`)**:
  - Layout profile stores application schema version, product/profile/workspace scope, shared-kit version, Dockview version (`8.4.1`), panel-registry version, structural layout (`shell` + `dockview`), and allowlisted per-panel presentation parameters.
  - Forbidden contents: credentials, live process state, budgets, permissions, pending admissions, capture paths, focus/scroll/control lease, or authoritative game state. Resource IDs (`capsuleId`, `surfaceId`, `sessionId`, `routeId`, `queryId`) are navigation hints revalidated against core state.
  - Restore pipeline: `cold read → closed decode → sequential pure migrations → panel-type/parameter normalization → replace retired types with MissingPanel preserving IDs and structural references → restore presentation → await visible-panel readiness/fonts/final viewport → reveal settled/error wall → enable save-on-gesture-completion`.
  - Unknown future schema or corrupt profile is retained untouched and makes persistence read-only until explicit recovery; an in-memory safe layout is offered without overwriting disk.
  - Normal missing profile uses documented defaults (`createDefaultLayoutProfile`).
  - Migrations are pure data transformations and never relaunch old processes or resend pending prompts.
  - Atomic save occurs through an authenticated profile boundary after migration/read guards (`markSettled()`); cross-window owner is singular (`ownerWindowId`); popout fallback must not overwrite an intended saved wall placement (`resolvePopoutFallbackView`). No `localStorage` is used.

## Pinned Dockview Serialization Alignment (`dockview-core version 8.4.1`)

The `dockview` payload inside `LayoutProfileEnvelope` validates directly against the installed `dockview-core` (`8.4.1`) declarations:
- `SerializedDockview`: `{ grid, panels, activeGroup?, floatingGroups?, popoutGroups?, edgeGroups? }`
- `grid`: `{ root: SerializedGridObject<GroupPanelViewState>, width, height, orientation: 'HORIZONTAL' | 'VERTICAL', maximizedNode? }`
- `floatingGroups`: array of `SerializedFloatingGroup` supporting either single-group `data` (`GroupPanelViewState`) or multi-group nested `grid` (`SerializedGridview<GroupPanelViewState>`) plus `position`.
- `popoutGroups`: array of `SerializedPopoutGroup` supporting either `data` or nested `grid`, optional `url` and `gridReferenceGroup`, and `position: Box | null`.
- `panels`: `Record<string, GroupviewPanelState>` with `id`, `contentComponent`, optional `tabComponent`, `title`, `renderer` (`'onlyWhenVisible' | 'always'`), sizing constraints, `pinned`, and allowlisted `params`.

## Exported API Surface

| Symbol | Purpose |
|---|---|
| `CURRENT_LAYOUT_SCHEMA_VERSION` | Current application layout schema version (`2`). |
| `MIN_SUPPORTED_LAYOUT_SCHEMA_VERSION` | Minimum supported schema version (`1`) for sequential pure migration. |
| `PINNED_VERSIONS` | Pinned `{ sharedKitVersion: '0.1.0', dockviewVersion: '8.4.1', panelRegistryVersion: 1 }`. |
| `MISSING_PANEL_TYPE` | Canonical `'MissingPanel'` replacement component identifier. |
| `DEFAULT_ACTIVE_PANEL_TYPES` | Frozen set of admitted substantive panel component names. |
| `DEFAULT_ALLOWED_PANEL_PARAM_KEYS` | Frozen set of allowlisted presentation parameter keys. |
| `FORBIDDEN_PARAM_KEYS` | Frozen set of explicitly forbidden sensitive/authoritative keys. |
| `decodeAndMigrateLayoutProfile(rawInput, options)` | Closed decode, sequential v1→v2 migration, allowlist check, and `MissingPanel` substitution. Returns frozen `{ ok: true, profile, migratedFromVersions, replacedPanels }` or `{ ok: false, code, reason, readOnlyRequired: true }`. |
| `serializeLayoutProfile(profile, options)` | Re-validates a profile and produces deterministic canonical JSON (sorted keys, 2-space indent). |
| `createDefaultLayoutProfile(scope)` | Returns a frozen default safe layout profile for `{ product, profileId, workspaceId }`. |
| `resolvePopoutFallbackView(profile)` | Produces an in-memory Dockview layout folding popout panels back into the main wall when popout windows are unavailable, while keeping `preservedProfile` and `savedWallPlacements` untouched. |
| `createLayoutProfileController(config)` | Stateful coordinator enforcing the restore barrier (`restore()` → `markSettled()`), read-only quarantine on corrupt/future schemas, singular `ownerWindowId`, popout fallback write guard, and `recoverExplicitly()`. |

## AUSENTE Contracts and Safe Boundaries

1. **Host IPC Profile Persistence Wire Message**: `UI_ARCHITECTURE.md` §5 specifies that `envelope/v0.1` has no existing message for reading/saving layout and preferences, and requires a narrow preload/host profile service contract (`AUSENTE`). `layoutProfile.js` therefore accepts an injected `{ readRaw, writeAtomic }` storage boundary and performs zero direct IPC or `localStorage` calls.
2. **Dockview `suspendLayout` / `silent` Restore API**: Declared `AUSENTE` by `UI_ARCHITECTURE.md` §4 (`Q02`). `layoutProfile.js` prepares pure validated `SerializedDockview` data structures without calling unverified runtime methods.
