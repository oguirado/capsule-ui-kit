# Dock Workspace Host (`books/dock-workspace.md`)

## Scope and Authority

This companion book documents the `DockWorkspace` component and presentation coordinator implemented in `packages/capsule-ui-kit/src/workspace/DockWorkspace.vue` and verified by `packages/capsule-ui-kit/test/DockWorkspace.test.js`.

Governing sections in the shared UI architecture document (`architecture contract` in the consuming product):
- **§3 Component inventory and ownership**:
  - `DockWorkspace` owns: `Panel registry, Dockview adapter, presentation moves/tabs/size and restoration barrier`.
  - `DockWorkspace` excludes: `Capsule creation/destruction or authority from add/remove callbacks`.
  - Closed panel registry covers: `CapsulePanel`, `FleetPanel`, `InspectorPanel`, `AlertBoard`, `TimelinePanel`, `HelpSettingsPanel`, and `MissingPanel`. Retired types (e.g. the former bottom orchestrator drawer) resolve to `MissingPanel` with `originalPanelType` preserved.
- **§4 Non-authoritative state and persistence (`UiLayout`)**:
  - Integrates with `layoutProfile.js` (`createLayoutProfileController`, `decodeAndMigrateLayoutProfile`, `resolvePopoutFallbackView`).
  - Enforces the restore barrier: `cold read → closed decode → sequential pure migrations → panel-type/parameter normalization → replace retired types with MissingPanel preserving IDs and structural references → restore presentation → await visible-panel readiness/fonts/final viewport → reveal settled/error wall → enable save-on-gesture-completion`.
  - Unknown future schema or corrupt profile locks persistence in read-only quarantine, mounts the in-memory safe default layout without overwriting disk, displays an accessible quarantine banner, and writes only after explicit operator recovery (`recoverLayoutExplicitly`).
- **§5 & §6 Capsule lifecycle vs presentation moves**:
  - Moving, resizing, tabbing, floating (`addFloatingGroup`), docking back (`moveTo`), or closing a panel (`panel.api.close()`) is a local presentation operation only.
  - Because `dockview-core` (`component.api.d.ts:397-404`) fires `onDidRemovePanel` and `onDidAddPanel` multiple times during panel movement across groups, `DockWorkspace` never maps `onDidRemovePanel` or `close` to backend capsule destruction (`surface_request destroy`).
  - Live `CapsulePanel` instances use `renderer: 'always'` (`OverlayRenderContainer`) so live surfaces and `@xterm/xterm` instances stay mounted in the document DOM across tab switches and group moves.
- **§7 & §8 Shared design system and keyboard navigation**:
  - Uses a repository-owned `DockviewTheme` adapter (`name: 'mv-shared'`, `className: 'mv-dockview-theme'`) mapping `--dv-*` variables to shared `--mv-*` semantic roles.
  - Uses `DockviewApi.activateNext()` and `activatePrevious()` (never the deprecated `moveToNext` / `moveToPrevious`) for `F6` / `Shift+F6` group focus traversal, and isolates terminal keystrokes (`isTerminalTarget: true`) from workspace shortcuts.
  - Provides a keyboard-operable `role="separator"` (`workspace/separator/main-wall`) for primary wall/inspector resizing.
- **§9 AI-operability contract**:
  - Every actionable control in `<template>` and `buildWorkspaceSemanticControls` carries a stable `id` / `semanticAnchor`, effective `role`, and computed `accessibleName`.
  - Boxes are rounded content-window CSS pixels when visible after the restore veil lifts, and `null` while hidden or covered by the restore barrier veil.
- **§10 Live rendering & Vue reactivity isolation**:
  - `DockviewApi` and the host coordinator are wrapped in `markRaw` / `shallowRef` so Dockview internals, frame handles, and terminal instances never enter Vue deep reactivity.

## Exported Helpers and Component Contract

| Symbol | Kind | Purpose |
|---|---|---|
| `DOCK_PANEL_REGISTRY_TYPES` | `readonly string[]` | Frozen list of the 7 admitted panel component types. |
| `VALID_DOCKVIEW_DIRECTIONS` | `ReadonlySet<string>` | `'left' \| 'right' \| 'above' \| 'below' \| 'within'` (`dockview-core` `Direction`). |
| `VALID_DOCKVIEW_POSITIONS` | `ReadonlySet<string>` | `'top' \| 'bottom' \| 'left' \| 'right' \| 'center'` (`dockview-core` `Position`). |
| `VALID_DOCKVIEW_RENDERERS` | `ReadonlySet<string>` | `'onlyWhenVisible' \| 'always'` (`dockview-core` `DockviewPanelRenderer`). |
| `validatePanelIdentity(id)` | Function | Validates non-empty immutable string panel IDs and rejects numeric list-index IDs. |
| `createPanelRegistry(componentMap)` | Function | Builds the closed component map for `<DockviewVue :components>` and resolves retired/unknown types to `MissingPanel`. |
| `createSharedDockviewTheme(options)` | Function | Returns a frozen `DockviewTheme` (`mv-shared` / `mv-dockview-theme`) driven by committed scheme and density. |
| `buildAddPanelOptions(input, options)` | Function | Validates `AddPanelOptions` against `dockview-core version 8.4.1`, enforcing allowlisted params, forbidden-key rejection, and `renderer: 'always'` default for `CapsulePanel`. |
| `createDockWorkspaceHost(config)` | Function | Stateful coordinator binding `DockviewApi` and `layoutProfile.js` restore barrier, non-destructive move/float/dock-back/close handlers, R2 popout guard, keyboard navigation, and §9 semantic control export. |
| `DockWorkspace.vue` (`default`) | Vue SFC | `<script setup>` runtime-only friendly component mounting `<DockviewVue>`, restore veil, quarantine recovery bar, and keyboard navigation toolbar. |

## AUSENTE Items and Conservative Boundaries

1. **`dockview-vue version 8.6.1`**: `AUSENTE` in the consuming product’s `node_modules/` (installed version is `8.4.1`; `architecture contract` §2, §14 R1). All types and APIs strictly match installed `8.4.1`.
2. **Dockview `suspendLayout` or `silent` Restore API**: `AUSENTE` in `dockview-core version 8.4.1` (`architecture contract` §4 `Q02`). `DockWorkspace.vue` uses a full-size covered restore veil (`#workspace-restore-veil`, `v-show="!wallRevealed"`) plus `DockviewLayoutMutationEvent.origin` (`'user'` vs `'api'`) disambiguation.
3. **Custom Popout Window Factory / Electron Host Transfer Contract**: `AUSENTE` in `dockview-core version 8.4.1` (`popoutWindow.d.ts:4-58` hardcodes `window.open` and rejects `file:` URLs; `architecture contract` §14 R2). Popout controls are rendered disabled with an explicit R2 explanation, and `onDidOpenPopoutWindowFail` switches to `resolvePopoutFallbackView` while blocking gesture-save overwrites of saved wall placements.
4. **Enterprise Dockview Modules (`KeyboardNavigation`, `PinnedTabs`, `MultiRowTabs`, `AdvancedOverflow`, `SmartGuides`, `DndCompass`, `LayoutHistory`, `AutoHideEdgeGroup`, `AutoEdgeGroup`)**: `AUSENTE` in free `dockview-core version 8.4.1` (`modules.d.ts:88-94`). Keyboard group navigation (`F6`/`Shift+F6`), separator resizing, and layout persistence (`layoutProfile.js`) are implemented directly in the kit without enterprise module dependencies.

## Verification Command

```sh
node --test packages/capsule-ui-kit/test/DockWorkspace.test.js
```

## Desktop window presentation

`windowPresentation.js` coordinates local window operations through the installed Dockview API. `DockWorkspace` provides it as `capsuleWindowPresentation`; `CapsulePanel` consumes it without product imports. Center content drops exchange structural panel references with `fromJSON(..., {reuseExistingPanels:true})`. The operation validates unique references before touching Dockview. Tab-strip drops retain native tab insertion, and edge drops retain native splitting. The pointer backend avoids reliance on HTML5 native drag in the embedded host. The drop status identifies Swap, Add as tab, or Split.

Float detaches an individual panel with native movable chrome and edge/corner resize handles. Floating constraints are 240 CSS pixels in each dimension [TARGET]. Restored docked capsules have a minimum width of 240 CSS pixels and a minimum height of 200 CSS pixels [TARGET], applied through the serialized panel model before construction so a saved split cannot collapse the body at the minimum window size. Dock back uses an available remembered grid group, or another visible grid group if that group no longer exists. Maximize brings a floating capsule into the workspace grid; Restore reinstates that capsule's floating bounds without replacing other panels' current layout. Docked splitters remain Dockview's native width/height splitters.

Hide moves a capsule into an invisible presentation group and applies `v-show` to its permanent capsule region. Neither body nor controller is unmounted. A registered presentation scheduler becomes ineligible, drains the drawable mailbox, retains capture and requests the newest generation when shown. The taskbar exposes Show and Show all; Control Shift H shows all hidden capsules, and Control F6 focuses the next capsule. New controls have stable anchors and accessible names. Floating resize handles also expose named separators and keyboard sizing.

The already-allowlisted `viewMode` parameter reserves the `window-hidden:` prefix for JSON presentation metadata: former group/index, former viewMode, and optional floating bounds. The metadata is checked before Show; it contains no backend state. Dockview's serialized group visibility and floating bounds pass through the existing layout decoder and authenticated layout service. No new profile schema or main-process permission is introduced. Capsule window booleans are exposed separately from backend lifecycle in the product lane adapter; hidden capsule regions retain a non-actionable record with null geometry.

Verification includes the kit's swap refusal controls and the consuming application’s private integration suite: independently repeated real pointer journeys, native-lane conformance and stable identity, center swap versus tab merge versus edge split, docked width/height splitters, floating resize, maximize/restore, hide/show, keyboard recovery and fresh-process persistence. Window battery pins and per-field justifications live under the host's v2 battery fixtures.
