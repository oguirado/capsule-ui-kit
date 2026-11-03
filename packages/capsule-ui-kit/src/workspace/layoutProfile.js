/**
 * @fileoverview Pure layout profile persistence, closed decode, sequential
 * pure migrations, panel-type/parameter normalization, retired-type replacement
 * (`MissingPanel`), and read-only corruption/future-schema guard for the shared
 * capsule UI kit.
 *
 * Grounding:
 * - architecture contract §3 (MissingPanel, DockWorkspace, ShellGrid)
 * - architecture contract §4 (UiLayout boundary, layout profile rules, restore pipeline, atomic save guards)
 * - architecture contract §5 (Read / save layout and preferences)
 * - architecture contract §6 (Presentation moves vs backend lifecycle)
 * - architecture contract §7 (retired bottom-drawer presentation states: collapsed, expanded, maximized)
 * - architecture contract §13 (Layout migration unit)
 * - Installed `dockview-core version 8.4.1` `SerializedDockview` / `GroupviewPanelState` / `Orientation` declarations
 *
 * Notice on AUSENTE contracts:
 * - Host IPC profile read/save wire protocol (`envelope/v0.1` has no message for layout preferences; architecture contract §5) is AUSENTE. This module accepts an injected profile storage boundary adapter (`readRaw`, `writeAtomic`) and never touches `window.localStorage` or direct filesystem/IPC globals.
 * - Dockview runtime `suspendLayout` or `silent` restore API is AUSENTE (architecture contract §4); restoration produces pure validated `SerializedDockview` payloads ready for `fromJSON`.
 */

/**
 * Current layout profile application schema version.
 * @type {number}
 */
export const CURRENT_LAYOUT_SCHEMA_VERSION = 2;

/**
 * Minimum supported layout schema version for sequential pure migration.
 * @type {number}
 */
export const MIN_SUPPORTED_LAYOUT_SCHEMA_VERSION = 1;

/**
 * Pinned versions from the kit baseline and installed `dockview-core` package.
 */
export const PINNED_VERSIONS = Object.freeze({
  sharedKitVersion: '0.1.0',
  dockviewVersion: '8.4.1',
  panelRegistryVersion: 1,
});

/**
 * Canonical panel component type used when a saved panel references a retired
 * or unavailable panel component type (architecture contract §3, §4).
 * @type {string}
 */
export const MISSING_PANEL_TYPE = 'MissingPanel';

/**
 * Default admitted substantive panel types in the shared capsule kit (architecture contract §3).
 * Types absent from this set decode to `MissingPanel` with `originalPanelType`
 * preserved (retired types, e.g. the former bottom drawer, included).
 * @type {ReadonlySet<string>}
 */
export const DEFAULT_ACTIVE_PANEL_TYPES = Object.freeze(
  new Set([
    'CapsulePanel',
    'FleetPanel',
    'InspectorPanel',
    'AlertBoard',
    'TimelinePanel',
    'HelpSettingsPanel',
    MISSING_PANEL_TYPE,
  ])
);

/**
 * Explicitly forbidden keys in any panel parameters or profile metadata
 * (architecture contract §4: No credentials, live process state, budgets,
 * permissions, pending admissions, capture paths, focus/scroll/control lease
 * or authoritative game state).
 * @type {ReadonlySet<string>}
 */
export const FORBIDDEN_PARAM_KEYS = Object.freeze(
  new Set([
    'credentials',
    'token',
    'secret',
    'password',
    'apiKey',
    'pid',
    'processState',
    'ptyHandle',
    'budget',
    'budgets',
    'balance',
    'money',
    'permissions',
    'controlLease',
    'leaseOwner',
    'pendingAdmissions',
    'pendingPrompts',
    'capturePath',
    'socketPath',
    'executable',
    'argv',
    'env',
    'focusState',
    'scrollTop',
    'scrollLeft',
    'scrollState',
    'gameState',
    'authoritativeState',
  ])
);

/**
 * Default allowlisted presentation parameter keys per panel (architecture contract §4:
 * Resource IDs are navigation hints revalidated against core state; allowlisted
 * per-panel presentation data only).
 * @type {ReadonlySet<string>}
 */
export const DEFAULT_ALLOWED_PANEL_PARAM_KEYS = Object.freeze(
  new Set([
    'capsuleId',
    'surfaceId',
    'sessionId',
    'routeId',
    'queryId',
    'slotFolded',
    'viewMode',
    'density',
    'inspectorSection',
    'filterPreset',
    'sortColumn',
    'sortDirection',
    'originalPanelType',
    'unavailableReason',
    'retiredAtSchemaVersion',
  ])
);

/**
 * Valid Dockview grid orientations from `dockview-core` (`Orientation.HORIZONTAL` | `Orientation.VERTICAL`).
 * @type {ReadonlySet<string>}
 */
const VALID_ORIENTATIONS = Object.freeze(new Set(['HORIZONTAL', 'VERTICAL']));

/**
 * Valid Dockview panel renderer modes from `dockview-core` (`DockviewPanelRenderer`).
 * @type {ReadonlySet<string>}
 */
const VALID_PANEL_RENDERERS = Object.freeze(new Set(['onlyWhenVisible', 'always']));

/**
 * Valid retired-drawer chrome modes (architecture contract §7). The shell keeps
 * validating `drawerMode`/`drawerExpandedHeight` so profiles saved before the
 * drawer retirement still decode; the values no longer drive any surface.
 * @type {ReadonlySet<string>}
 */
const VALID_DRAWER_MODES = Object.freeze(new Set(['collapsed', 'expanded', 'maximized']));

/**
 * Valid ShellGrid navigation rail modes (architecture contract §3, §4).
 * @type {ReadonlySet<string>}
 */
const VALID_RAIL_MODES = Object.freeze(new Set(['expanded', 'collapsed']));

/**
 * Valid presentation modes (architecture contract §4, §8).
 * @type {ReadonlySet<string>}
 */
const VALID_PRESENTATION_MODES = Object.freeze(new Set(['standard', 'fullscreen', 'monitor-wall']));

/**
 * @typedef {'HORIZONTAL' | 'VERTICAL'} DockviewOrientation
 */

/**
 * @typedef {Object} BoxGeometry
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} GroupPanelViewState
 * @property {string} id
 * @property {string[]} views
 * @property {string} [activeView]
 * @property {boolean} [locked]
 * @property {boolean} [hideHeader]
 * @property {'top' | 'bottom' | 'left' | 'right'} [headerPosition]
 */

/**
 * @typedef {Object} SerializedGridObject
 * @property {'leaf' | 'branch'} type
 * @property {GroupPanelViewState | SerializedGridObject[]} data
 * @property {number} [size]
 * @property {boolean} [visible]
 */

/**
 * @typedef {Object} GroupviewPanelState
 * @property {string} id
 * @property {string} [contentComponent]
 * @property {string} [tabComponent]
 * @property {string} [title]
 * @property {'onlyWhenVisible' | 'always'} [renderer]
 * @property {Record<string, string | number | boolean | null>} [params]
 * @property {number} [minimumWidth]
 * @property {number} [minimumHeight]
 * @property {number} [maximumWidth]
 * @property {number} [maximumHeight]
 * @property {boolean} [pinned]
 */

/**
 * @typedef {Object} SerializedFloatingGroup
 * @property {GroupPanelViewState} [data]
 * @property {{ root: SerializedGridObject, width: number, height: number, orientation: DockviewOrientation }} [grid]
 * @property {{ x?: number, y?: number, width?: number, height?: number, left?: number, top?: number, right?: number, bottom?: number }} position
 */

/**
 * @typedef {Object} SerializedPopoutGroup
 * @property {GroupPanelViewState} [data]
 * @property {{ root: SerializedGridObject, width: number, height: number, orientation: DockviewOrientation }} [grid]
 * @property {string} [url]
 * @property {string} [gridReferenceGroup]
 * @property {BoxGeometry | null} position
 */

/**
 * @typedef {Object} SerializedDockviewPayload
 * @property {{ root: SerializedGridObject, width: number, height: number, orientation: DockviewOrientation }} grid
 * @property {Record<string, GroupviewPanelState>} panels
 * @property {string} [activeGroup]
 * @property {SerializedFloatingGroup[]} [floatingGroups]
 * @property {SerializedPopoutGroup[]} [popoutGroups]
 * @property {Record<string, { size: number, visible: boolean, collapsed?: boolean }>} [edgeGroups]
 */

/**
 * @typedef {Object} ShellChromeState
 * @property {'expanded' | 'collapsed'} leftRailMode
 * @property {number} leftRailSize
 * @property {'expanded' | 'collapsed'} rightRailMode
 * @property {number} rightRailSize
 * @property {'collapsed' | 'expanded' | 'maximized'} drawerMode
 * @property {number} drawerExpandedHeight
 * @property {'standard' | 'fullscreen' | 'monitor-wall'} selectedPresentation
 */

/**
 * @typedef {Object} LayoutProfileScope
 * @property {string} product
 * @property {string} profileId
 * @property {string} workspaceId
 */

/**
 * @typedef {Object} LayoutProfileEnvelope
 * @property {'capsule-ui-kit.layout-profile'} format
 * @property {number} schemaVersion
 * @property {LayoutProfileScope} scope
 * @property {string} sharedKitVersion
 * @property {string} dockviewVersion
 * @property {number} panelRegistryVersion
 * @property {ShellChromeState} shell
 * @property {SerializedDockviewPayload} dockview
 * @property {Record<string, { groupId: string, index: number }>} [savedWallPlacements]
 */

/**
 * @typedef {Object} DecodeSuccess
 * @property {true} ok
 * @property {LayoutProfileEnvelope} profile
 * @property {readonly string[]} migratedFromVersions
 * @property {readonly string[]} replacedPanels
 */

/**
 * @typedef {Object} DecodeFailure
 * @property {false} ok
 * @property {'FUTURE_SCHEMA' | 'UNSUPPORTED_SCHEMA' | 'CORRUPT_JSON' | 'INVALID_ENVELOPE' | 'SCOPE_MISMATCH' | 'FORBIDDEN_DATA' | 'INVALID_DOCKVIEW'} code
 * @property {string} reason
 * @property {boolean} readOnlyRequired
 */

/**
 * Checks whether a value is a plain object (not null, not array, prototype is Object.prototype or null).
 * @param {unknown} val
 * @returns {val is Record<string, unknown>}
 */
function isPlainObject(val) {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) {
    return false;
  }
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks whether a value is a finite safe integer.
 * @param {unknown} val
 * @returns {val is number}
 */
function isExactSafeInteger(val) {
  return typeof val === 'number' && Number.isSafeInteger(val);
}

/**
 * Checks whether a value is a finite positive or non-negative number.
 * @param {unknown} val
 * @param {boolean} [allowZero=false]
 * @returns {val is number}
 */
function isFiniteDimension(val, allowZero = false) {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return false;
  }
  return allowZero ? val >= 0 : val > 0;
}

/**
 * Deeply clones and freezes a plain JSON-serializable structure so no mutable
 * alias can corrupt admitted state.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function cloneAndFreeze(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    const arrCopy = obj.map((item) => cloneAndFreeze(item));
    return /** @type {T} */ (Object.freeze(arrCopy));
  }
  /** @type {Record<string, unknown>} */
  const copy = {};
  for (const key of Object.keys(obj)) {
    copy[key] = cloneAndFreeze(/** @type {Record<string, unknown>} */ (obj)[key]);
  }
  return /** @type {T} */ (Object.freeze(copy));
}

/**
 * Validates that an object only contains keys from `allowedKeys`.
 * @param {Record<string, unknown>} obj
 * @param {ReadonlySet<string>} allowedKeys
 * @param {string} contextLabel
 * @returns {{ ok: true } | { ok: false, code: 'INVALID_ENVELOPE' | 'FORBIDDEN_DATA', reason: string }}
 */
function checkClosedKeys(obj, allowedKeys, contextLabel) {
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_PARAM_KEYS.has(key)) {
      return {
        ok: false,
        code: 'FORBIDDEN_DATA',
        reason: `Forbidden authoritative/sensitive key "${key}" in ${contextLabel}`,
      };
    }
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        code: 'INVALID_ENVELOPE',
        reason: `Unknown key "${key}" in closed object ${contextLabel}`,
      };
    }
  }
  return { ok: true };
}

/**
 * Validates a Dockview `GroupPanelViewState` leaf data object and returns all referenced panel IDs.
 * @param {unknown} data
 * @param {Set<string>} seenGroupIds
 * @param {Set<string>} referencedPanelIds
 * @param {string} pathLabel
 * @returns {{ ok: true, normalized: GroupPanelViewState } | { ok: false, code: 'INVALID_DOCKVIEW' | 'FORBIDDEN_DATA', reason: string }}
 */
function validateGroupPanelViewState(data, seenGroupIds, referencedPanelIds, pathLabel) {
  if (!isPlainObject(data)) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel} must be a plain object` };
  }
  const allowedKeys = new Set([
    'id',
    'views',
    'activeView',
    'locked',
    'hideHeader',
    'headerPosition',
  ]);
  for (const k of Object.keys(data)) {
    if (FORBIDDEN_PARAM_KEYS.has(k)) {
      return { ok: false, code: 'FORBIDDEN_DATA', reason: `Forbidden key "${k}" in ${pathLabel}` };
    }
    if (!allowedKeys.has(k)) {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `Unknown key "${k}" in ${pathLabel}` };
    }
  }
  if (typeof data.id !== 'string' || data.id.trim() === '') {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.id must be a non-empty string` };
  }
  if (seenGroupIds.has(data.id)) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `Duplicate group id "${data.id}" at ${pathLabel}` };
  }
  seenGroupIds.add(data.id);

  if (!Array.isArray(data.views) || data.views.some((v) => typeof v !== 'string' || v.trim() === '')) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.views must be an array of non-empty panel IDs` };
  }
  const localViews = new Set();
  for (const panelId of data.views) {
    if (localViews.has(panelId) || referencedPanelIds.has(panelId)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Duplicate panel reference "${panelId}" in ${pathLabel}.views`,
      };
    }
    localViews.add(panelId);
    referencedPanelIds.add(panelId);
  }

  /** @type {GroupPanelViewState} */
  const normalized = {
    id: data.id,
    views: [...data.views],
  };

  if (data.activeView !== undefined) {
    if (typeof data.activeView !== 'string' || !localViews.has(data.activeView)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `${pathLabel}.activeView "${String(data.activeView)}" is not in group views`,
      };
    }
    normalized.activeView = data.activeView;
  } else if (normalized.views.length > 0) {
    normalized.activeView = normalized.views[0] ?? ''; 
  }

  if (data.locked !== undefined) {
    if (typeof data.locked !== 'boolean') {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.locked must be boolean` };
    }
    normalized.locked = data.locked;
  }
  if (data.hideHeader !== undefined) {
    if (typeof data.hideHeader !== 'boolean') {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.hideHeader must be boolean` };
    }
    normalized.hideHeader = data.hideHeader;
  }
  if (data.headerPosition !== undefined) {
    if (!['top', 'bottom', 'left', 'right'].includes(/** @type {string} */ (data.headerPosition))) {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.headerPosition invalid` };
    }
    normalized.headerPosition = /** @type {'top' | 'bottom' | 'left' | 'right'} */ (data.headerPosition);
  }

  return { ok: true, normalized };
}

/**
 * Recursively validates a `SerializedGridObject<GroupPanelViewState>`.
 * @param {unknown} node
 * @param {Set<string>} seenGroupIds
 * @param {Set<string>} referencedPanelIds
 * @param {string} pathLabel
 * @param {number} depth
 * @returns {{ ok: true, normalized: SerializedGridObject } | { ok: false, code: 'INVALID_DOCKVIEW' | 'FORBIDDEN_DATA', reason: string }}
 */
function validateGridNode(node, seenGroupIds, referencedPanelIds, pathLabel, depth = 0) {
  if (depth > 16) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel} exceeds maximum grid depth` };
  }
  if (!isPlainObject(node)) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel} must be a plain object` };
  }
  const allowedNodeKeys = new Set(['type', 'data', 'size', 'visible']);
  for (const k of Object.keys(node)) {
    if (FORBIDDEN_PARAM_KEYS.has(k)) {
      return { ok: false, code: 'FORBIDDEN_DATA', reason: `Forbidden key "${k}" in ${pathLabel}` };
    }
    if (!allowedNodeKeys.has(k)) {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `Unknown key "${k}" in ${pathLabel}` };
    }
  }

  if (node.size !== undefined && !isFiniteDimension(node.size, true)) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.size must be a non-negative finite number` };
  }
  if (node.visible !== undefined && typeof node.visible !== 'boolean') {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel}.visible must be boolean` };
  }

  if (node.type === 'leaf') {
    const leafRes = validateGroupPanelViewState(
      node.data,
      seenGroupIds,
      referencedPanelIds,
      `${pathLabel}.data`
    );
    if (!leafRes.ok) {
      return leafRes;
    }
    /** @type {SerializedGridObject} */
    const out = {
      type: 'leaf',
      data: leafRes.normalized,
    };
    if (node.size !== undefined) out.size = /** @type {number} */ (node.size);
    if (node.visible !== undefined) out.visible = /** @type {boolean} */ (node.visible);
    return { ok: true, normalized: out };
  }

  if (node.type === 'branch') {
    if (!Array.isArray(node.data) || node.data.length === 0) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `${pathLabel}.data for branch must be a non-empty array`,
      };
    }
    /** @type {SerializedGridObject[]} */
    const children = [];
    for (let i = 0; i < node.data.length; i++) {
      const childRes = validateGridNode(
        node.data[i],
        seenGroupIds,
        referencedPanelIds,
        `${pathLabel}.data[${i}]`,
        depth + 1
      );
      if (!childRes.ok) {
        return childRes;
      }
      children.push(childRes.normalized);
    }
    /** @type {SerializedGridObject} */
    const out = {
      type: 'branch',
      data: children,
    };
    if (node.size !== undefined) out.size = /** @type {number} */ (node.size);
    if (node.visible !== undefined) out.visible = /** @type {boolean} */ (node.visible);
    return { ok: true, normalized: out };
  }

  return {
    ok: false,
    code: 'INVALID_DOCKVIEW',
    reason: `${pathLabel}.type must be "leaf" or "branch"`,
  };
}

/**
 * Validates a nested `SerializedGridview<GroupPanelViewState>` (used in main grid, floatingGroups.grid, popoutGroups.grid).
 * @param {unknown} grid
 * @param {Set<string>} seenGroupIds
 * @param {Set<string>} referencedPanelIds
 * @param {string} pathLabel
 * @returns {{ ok: true, normalized: { root: SerializedGridObject, width: number, height: number, orientation: DockviewOrientation } } | { ok: false, code: 'INVALID_DOCKVIEW' | 'FORBIDDEN_DATA', reason: string }}
 */
function validateSerializedGridview(grid, seenGroupIds, referencedPanelIds, pathLabel) {
  if (!isPlainObject(grid)) {
    return { ok: false, code: 'INVALID_DOCKVIEW', reason: `${pathLabel} must be a plain object` };
  }
  const allowedGridKeys = new Set(['root', 'width', 'height', 'orientation', 'maximizedNode']);
  for (const k of Object.keys(grid)) {
    if (FORBIDDEN_PARAM_KEYS.has(k)) {
      return { ok: false, code: 'FORBIDDEN_DATA', reason: `Forbidden key "${k}" in ${pathLabel}` };
    }
    if (!allowedGridKeys.has(k)) {
      return { ok: false, code: 'INVALID_DOCKVIEW', reason: `Unknown key "${k}" in ${pathLabel}` };
    }
  }
  if (!isFiniteDimension(grid.width, false) || !isFiniteDimension(grid.height, false)) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: `${pathLabel} width and height must be positive finite numbers`,
    };
  }
  if (typeof grid.orientation !== 'string' || !VALID_ORIENTATIONS.has(grid.orientation)) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: `${pathLabel}.orientation must be HORIZONTAL or VERTICAL`,
    };
  }
  const rootRes = validateGridNode(grid.root, seenGroupIds, referencedPanelIds, `${pathLabel}.root`, 0);
  if (!rootRes.ok) {
    return rootRes;
  }
  return {
    ok: true,
    normalized: {
      root: rootRes.normalized,
      width: grid.width,
      height: grid.height,
      orientation: /** @type {DockviewOrientation} */ (grid.orientation),
    },
  };
}

/**
 * Pure migration from schemaVersion 1 to schemaVersion 2.
 * In v1:
 * - `shell.drawerState` was used instead of `shell.drawerMode`, and `shell.drawerSize` instead of `shell.drawerExpandedHeight`.
 * - `shell.railCollapsed` boolean was used instead of `leftRailMode`/`rightRailMode`.
 * - Panel `component` field was used instead of `contentComponent` in `dockview.panels`.
 *
 * Notice: Migrations are purely structural and never relaunch old processes or resend pending prompts (architecture contract §4).
 *
 * @param {Record<string, unknown>} rawV1
 * @returns {{ ok: true, migrated: Record<string, unknown> } | { ok: false, code: 'INVALID_ENVELOPE' | 'FORBIDDEN_DATA', reason: string }}
 */
function migrateV1ToV2(rawV1) {
  const allowedV1TopKeys = new Set([
    'format',
    'schemaVersion',
    'scope',
    'sharedKitVersion',
    'dockviewVersion',
    'panelRegistryVersion',
    'shell',
    'dockview',
    'savedWallPlacements',
  ]);
  const keyCheck = checkClosedKeys(rawV1, allowedV1TopKeys, 'v1 profile root');
  if (!keyCheck.ok) {
    return keyCheck;
  }

  if (!isPlainObject(rawV1.shell)) {
    return { ok: false, code: 'INVALID_ENVELOPE', reason: 'v1 profile missing plain object shell' };
  }
  const rawShell = rawV1.shell;
  const allowedV1ShellKeys = new Set([
    'railCollapsed',
    'leftRailSize',
    'rightRailSize',
    'drawerState',
    'drawerSize',
    'selectedPresentation',
    // Also permit already-v2 shell keys if present in transitional v1
    'leftRailMode',
    'rightRailMode',
    'drawerMode',
    'drawerExpandedHeight',
  ]);
  const shellKeyCheck = checkClosedKeys(rawShell, allowedV1ShellKeys, 'v1 profile shell');
  if (!shellKeyCheck.ok) {
    return shellKeyCheck;
  }

  const railMode =
    typeof rawShell.railCollapsed === 'boolean'
      ? rawShell.railCollapsed
        ? 'collapsed'
        : 'expanded'
      : 'expanded';

  const migratedShell = {
    leftRailMode: typeof rawShell.leftRailMode === 'string' ? rawShell.leftRailMode : railMode,
    leftRailSize: typeof rawShell.leftRailSize === 'number' ? rawShell.leftRailSize : 240,
    rightRailMode: typeof rawShell.rightRailMode === 'string' ? rawShell.rightRailMode : railMode,
    rightRailSize: typeof rawShell.rightRailSize === 'number' ? rawShell.rightRailSize : 280,
    drawerMode:
      typeof rawShell.drawerMode === 'string'
        ? rawShell.drawerMode
        : typeof rawShell.drawerState === 'string'
          ? rawShell.drawerState
          : 'collapsed',
    drawerExpandedHeight:
      typeof rawShell.drawerExpandedHeight === 'number'
        ? rawShell.drawerExpandedHeight
        : typeof rawShell.drawerSize === 'number'
          ? rawShell.drawerSize
          : 260,
    selectedPresentation:
      typeof rawShell.selectedPresentation === 'string'
        ? rawShell.selectedPresentation
        : 'standard',
  };

  if (!isPlainObject(rawV1.dockview) || !isPlainObject(rawV1.dockview.panels)) {
    return { ok: false, code: 'INVALID_ENVELOPE', reason: 'v1 profile missing dockview.panels' };
  }

  /** @type {Record<string, unknown>} */
  const migratedPanels = {};
  for (const [panelId, rawPanel] of Object.entries(rawV1.dockview.panels)) {
    if (!isPlainObject(rawPanel)) {
      return {
        ok: false,
        code: 'INVALID_ENVELOPE',
        reason: `v1 panel "${panelId}" is not a plain object`,
      };
    }
    const copyPanel = { ...rawPanel };
    if (typeof copyPanel.component === 'string' && copyPanel.contentComponent === undefined) {
      copyPanel.contentComponent = copyPanel.component;
      delete copyPanel.component;
    }
    migratedPanels[panelId] = copyPanel;
  }

  /** @type {Record<string, unknown>} */
  const migrated = {
    ...rawV1,
    schemaVersion: 2,
    shell: migratedShell,
    dockview: {
      ...rawV1.dockview,
      panels: migratedPanels,
    },
  };

  return { ok: true, migrated };
}

/**
 * Normalizes a single panel state entry, enforcing the allowlisted parameter rule,
 * rejecting forbidden keys, and replacing retired or unknown panel component types
 * with `MissingPanel` while preserving panel ID and structural references (architecture contract §4).
 *
 * @param {string} panelKey
 * @param {unknown} rawPanel
 * @param {ReadonlySet<string>} activePanelTypes
 * @param {ReadonlySet<string>} allowedParamKeys
 * @param {number} sourceSchemaVersion
 * @returns {{ ok: true, panel: GroupviewPanelState, replaced: boolean } | { ok: false, code: 'INVALID_DOCKVIEW' | 'FORBIDDEN_DATA', reason: string }}
 */
function normalizePanelState(
  panelKey,
  rawPanel,
  activePanelTypes,
  allowedParamKeys,
  sourceSchemaVersion
) {
  if (!isPlainObject(rawPanel)) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: `dockview.panels["${panelKey}"] must be a plain object`,
    };
  }
  const allowedPanelKeys = new Set([
    'id',
    'contentComponent',
    'tabComponent',
    'title',
    'renderer',
    'params',
    'minimumWidth',
    'minimumHeight',
    'maximumWidth',
    'maximumHeight',
    'pinned',
  ]);
  for (const k of Object.keys(rawPanel)) {
    if (FORBIDDEN_PARAM_KEYS.has(k)) {
      return {
        ok: false,
        code: 'FORBIDDEN_DATA',
        reason: `Forbidden key "${k}" in panel "${panelKey}"`,
      };
    }
    if (!allowedPanelKeys.has(k)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Unknown key "${k}" in panel "${panelKey}"`,
      };
    }
  }

  if (typeof rawPanel.id !== 'string' || rawPanel.id !== panelKey) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: `Panel id "${String(rawPanel.id)}" does not match key "${panelKey}"`,
    };
  }
  if (typeof rawPanel.contentComponent !== 'string' || rawPanel.contentComponent.trim() === '') {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: `Panel "${panelKey}" must have a non-empty contentComponent string`,
    };
  }

  /** @type {Record<string, string | number | boolean | null>} */
  const cleanParams = {};
  if (rawPanel.params !== undefined) {
    if (!isPlainObject(rawPanel.params)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Panel "${panelKey}".params must be a plain object`,
      };
    }
    for (const [paramKey, paramVal] of Object.entries(rawPanel.params)) {
      if (FORBIDDEN_PARAM_KEYS.has(paramKey)) {
        return {
          ok: false,
          code: 'FORBIDDEN_DATA',
          reason: `Forbidden authoritative/sensitive key "${paramKey}" in panel "${panelKey}".params`,
        };
      }
      if (!allowedParamKeys.has(paramKey)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `Unallowlisted parameter key "${paramKey}" in panel "${panelKey}".params`,
        };
      }
      if (
        paramVal !== null &&
        typeof paramVal !== 'string' &&
        typeof paramVal !== 'boolean' &&
        !(typeof paramVal === 'number' && Number.isFinite(paramVal))
      ) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `Non-primitive or non-finite parameter "${paramKey}" in panel "${panelKey}".params`,
        };
      }
      cleanParams[paramKey] = paramVal;
    }
  }

  let contentComponent = rawPanel.contentComponent;
  let replaced = false;

  if (!activePanelTypes.has(contentComponent)) {
    replaced = true;
    cleanParams.originalPanelType = contentComponent;
    cleanParams.unavailableReason = `Panel type "${contentComponent}" is retired or unavailable in current registry`;
    cleanParams.retiredAtSchemaVersion = sourceSchemaVersion;
    contentComponent = MISSING_PANEL_TYPE;
  }

  /** @type {GroupviewPanelState} */
  const normalized = {
    id: rawPanel.id,
    contentComponent,
    params: cleanParams,
  };

  if (rawPanel.tabComponent !== undefined) {
    if (typeof rawPanel.tabComponent !== 'string' || rawPanel.tabComponent.trim() === '') {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Panel "${panelKey}".tabComponent must be a non-empty string`,
      };
    }
    normalized.tabComponent = rawPanel.tabComponent;
  }
  if (rawPanel.title !== undefined) {
    if (typeof rawPanel.title !== 'string') {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Panel "${panelKey}".title must be a string`,
      };
    }
    normalized.title = rawPanel.title;
  }
  if (rawPanel.renderer !== undefined) {
    if (
      typeof rawPanel.renderer !== 'string' ||
      !VALID_PANEL_RENDERERS.has(rawPanel.renderer)
    ) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Panel "${panelKey}".renderer must be "onlyWhenVisible" or "always"`,
      };
    }
    normalized.renderer = /** @type {'onlyWhenVisible' | 'always'} */ (rawPanel.renderer);
  }
  for (const dimKey of /** @type {const} */ ([
    'minimumWidth',
    'minimumHeight',
    'maximumWidth',
    'maximumHeight',
  ])) {
    if (rawPanel[dimKey] !== undefined) {
      if (!isFiniteDimension(rawPanel[dimKey], true)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `Panel "${panelKey}".${dimKey} must be a non-negative finite number`,
        };
      }
      normalized[dimKey] = /** @type {number} */ (rawPanel[dimKey]);
    }
  }
  if (rawPanel.pinned !== undefined) {
    if (typeof rawPanel.pinned !== 'boolean') {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Panel "${panelKey}".pinned must be boolean`,
      };
    }
    normalized.pinned = rawPanel.pinned;
  }

  return { ok: true, panel: normalized, replaced };
}

/**
 * Decodes, validates, sequentially migrates, and normalizes a serialized layout profile
 * JSON string or raw parsed value.
 *
 * Pipeline (architecture contract §4):
 * cold read → closed decode → sequential pure migrations → panel-type/parameter normalization
 * → replace retired types with `MissingPanel` preserving IDs and structural references.
 *
 * Unknown future schema or corrupt profile returns `{ ok: false, readOnlyRequired: true }`.
 *
 * @param {string | unknown} rawInput
 * @param {Object} [options]
 * @param {LayoutProfileScope} [options.expectedScope]
 * @param {ReadonlySet<string>} [options.activePanelTypes]
 * @param {ReadonlySet<string>} [options.allowedParamKeys]
 * @returns {DecodeSuccess | DecodeFailure}
 */
export function decodeAndMigrateLayoutProfile(rawInput, options = {}) {
  const activePanelTypes = options.activePanelTypes ?? DEFAULT_ACTIVE_PANEL_TYPES;
  const allowedParamKeys = options.allowedParamKeys ?? DEFAULT_ALLOWED_PANEL_PARAM_KEYS;

  /** @type {unknown} */
  let parsed = rawInput;
  if (typeof rawInput === 'string') {
    try {
      parsed = JSON.parse(rawInput);
    } catch (err) {
      return {
        ok: false,
        code: 'CORRUPT_JSON',
        reason: `Corrupt layout profile JSON: ${err instanceof Error ? err.message : String(err)}`,
        readOnlyRequired: true,
      };
    }
  }

  if (!isPlainObject(parsed)) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'Layout profile root must be a plain JSON object',
      readOnlyRequired: true,
    };
  }

  if (parsed.format !== 'capsule-ui-kit.layout-profile') {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: `Invalid or missing layout profile format "${String(parsed.format)}"`,
      readOnlyRequired: true,
    };
  }

  if (!isExactSafeInteger(parsed.schemaVersion)) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'schemaVersion must be an exact safe integer',
      readOnlyRequired: true,
    };
  }

  const initialSchemaVersion = parsed.schemaVersion;
  if (initialSchemaVersion > CURRENT_LAYOUT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'FUTURE_SCHEMA',
      reason: `Layout profile schemaVersion ${initialSchemaVersion} is newer than supported version ${CURRENT_LAYOUT_SCHEMA_VERSION}; retaining untouched in read-only mode`,
      readOnlyRequired: true,
    };
  }

  if (initialSchemaVersion < MIN_SUPPORTED_LAYOUT_SCHEMA_VERSION) {
    return {
      ok: false,
      code: 'UNSUPPORTED_SCHEMA',
      reason: `Layout profile schemaVersion ${initialSchemaVersion} is below minimum supported version ${MIN_SUPPORTED_LAYOUT_SCHEMA_VERSION}`,
      readOnlyRequired: true,
    };
  }

  /** @type {Record<string, unknown>} */
  let working = cloneAndFreeze(parsed);
  /** @type {string[]} */
  const migratedFromVersions = [];

  if (working.schemaVersion === 1) {
    const mig1 = migrateV1ToV2(working);
    if (!mig1.ok) {
      return {
        ok: false,
        code: mig1.code,
        reason: mig1.reason,
        readOnlyRequired: true,
      };
    }
    migratedFromVersions.push('1->2');
    working = mig1.migrated;
  }

  // Closed top-level check for v2
  const allowedTopKeys = new Set([
    'format',
    'schemaVersion',
    'scope',
    'sharedKitVersion',
    'dockviewVersion',
    'panelRegistryVersion',
    'shell',
    'dockview',
    'savedWallPlacements',
  ]);
  const topCheck = checkClosedKeys(working, allowedTopKeys, 'profile root');
  if (!topCheck.ok) {
    return {
      ok: false,
      code: topCheck.code,
      reason: topCheck.reason,
      readOnlyRequired: true,
    };
  }

  // Scope validation
  if (!isPlainObject(working.scope)) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'profile.scope must be a plain object',
      readOnlyRequired: true,
    };
  }
  const scopeKeyCheck = checkClosedKeys(
    working.scope,
    new Set(['product', 'profileId', 'workspaceId']),
    'profile.scope'
  );
  if (!scopeKeyCheck.ok) {
    return {
      ok: false,
      code: scopeKeyCheck.code,
      reason: scopeKeyCheck.reason,
      readOnlyRequired: true,
    };
  }
  const { product, profileId, workspaceId } = working.scope;
  if (
    typeof product !== 'string' ||
    product.trim() === '' ||
    typeof profileId !== 'string' ||
    profileId.trim() === '' ||
    typeof workspaceId !== 'string' ||
    workspaceId.trim() === ''
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'profile.scope requires non-empty string product, profileId, and workspaceId',
      readOnlyRequired: true,
    };
  }

  if (options.expectedScope) {
    if (
      product !== options.expectedScope.product ||
      profileId !== options.expectedScope.profileId ||
      workspaceId !== options.expectedScope.workspaceId
    ) {
      return {
        ok: false,
        code: 'SCOPE_MISMATCH',
        reason: `Profile scope (${product}/${profileId}/${workspaceId}) does not match expected (${options.expectedScope.product}/${options.expectedScope.profileId}/${options.expectedScope.workspaceId})`,
        readOnlyRequired: true,
      };
    }
  }

  if (
    typeof working.sharedKitVersion !== 'string' ||
    working.sharedKitVersion.trim() === '' ||
    typeof working.dockviewVersion !== 'string' ||
    working.dockviewVersion.trim() === '' ||
    !isExactSafeInteger(working.panelRegistryVersion) ||
    working.panelRegistryVersion < 1
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'Invalid sharedKitVersion, dockviewVersion, or panelRegistryVersion',
      readOnlyRequired: true,
    };
  }

  // Shell validation
  if (!isPlainObject(working.shell)) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'profile.shell must be a plain object',
      readOnlyRequired: true,
    };
  }
  const allowedShellKeys = new Set([
    'leftRailMode',
    'leftRailSize',
    'rightRailMode',
    'rightRailSize',
    'drawerMode',
    'drawerExpandedHeight',
    'selectedPresentation',
  ]);
  const shellCheck = checkClosedKeys(working.shell, allowedShellKeys, 'profile.shell');
  if (!shellCheck.ok) {
    return {
      ok: false,
      code: shellCheck.code,
      reason: shellCheck.reason,
      readOnlyRequired: true,
    };
  }

  const rawShell = working.shell;
  if (
    typeof rawShell.leftRailMode !== 'string' ||
    !VALID_RAIL_MODES.has(rawShell.leftRailMode) ||
    typeof rawShell.rightRailMode !== 'string' ||
    !VALID_RAIL_MODES.has(rawShell.rightRailMode) ||
    !isFiniteDimension(rawShell.leftRailSize, true) ||
    !isFiniteDimension(rawShell.rightRailSize, true) ||
    typeof rawShell.drawerMode !== 'string' ||
    !VALID_DRAWER_MODES.has(rawShell.drawerMode) ||
    !isFiniteDimension(rawShell.drawerExpandedHeight, false) ||
    typeof rawShell.selectedPresentation !== 'string' ||
    !VALID_PRESENTATION_MODES.has(rawShell.selectedPresentation)
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      reason: 'Invalid shell layout mode or dimension values',
      readOnlyRequired: true,
    };
  }

  /** @type {ShellChromeState} */
  const normalizedShell = {
    leftRailMode: /** @type {'expanded' | 'collapsed'} */ (rawShell.leftRailMode),
    leftRailSize: /** @type {number} */ (rawShell.leftRailSize),
    rightRailMode: /** @type {'expanded' | 'collapsed'} */ (rawShell.rightRailMode),
    rightRailSize: /** @type {number} */ (rawShell.rightRailSize),
    drawerMode: /** @type {'collapsed' | 'expanded' | 'maximized'} */ (rawShell.drawerMode),
    drawerExpandedHeight: /** @type {number} */ (rawShell.drawerExpandedHeight),
    selectedPresentation: /** @type {'standard' | 'fullscreen' | 'monitor-wall'} */ (
      rawShell.selectedPresentation
    ),
  };

  // Dockview payload validation
  if (!isPlainObject(working.dockview)) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: 'profile.dockview must be a plain object',
      readOnlyRequired: true,
    };
  }
  const allowedDockviewKeys = new Set([
    'grid',
    'panels',
    'activeGroup',
    'floatingGroups',
    'popoutGroups',
    'edgeGroups',
  ]);
  const dvKeyCheck = checkClosedKeys(working.dockview, allowedDockviewKeys, 'profile.dockview');
  if (!dvKeyCheck.ok) {
    return {
      ok: false,
      code: dvKeyCheck.code === 'FORBIDDEN_DATA' ? 'FORBIDDEN_DATA' : 'INVALID_DOCKVIEW',
      reason: dvKeyCheck.reason,
      readOnlyRequired: true,
    };
  }

  const seenGroupIds = new Set();
  const referencedPanelIds = new Set();

  const mainGridRes = validateSerializedGridview(
    working.dockview.grid,
    seenGroupIds,
    referencedPanelIds,
    'dockview.grid'
  );
  if (!mainGridRes.ok) {
    return {
      ok: false,
      code: mainGridRes.code,
      reason: mainGridRes.reason,
      readOnlyRequired: true,
    };
  }

  // Floating groups validation (supports both legacy `data` and multi-group nested `grid` per dockview-core 8.4.1)
  /** @type {SerializedFloatingGroup[] | undefined} */
  let normalizedFloatingGroups;
  if (working.dockview.floatingGroups !== undefined) {
    if (!Array.isArray(working.dockview.floatingGroups)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: 'dockview.floatingGroups must be an array',
        readOnlyRequired: true,
      };
    }
    normalizedFloatingGroups = [];
    for (let i = 0; i < working.dockview.floatingGroups.length; i++) {
      const fg = working.dockview.floatingGroups[i];
      const fgLabel = `dockview.floatingGroups[${i}]`;
      if (!isPlainObject(fg)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `${fgLabel} must be a plain object`,
          readOnlyRequired: true,
        };
      }
      const fgKeyCheck = checkClosedKeys(fg, new Set(['data', 'grid', 'position']), fgLabel);
      if (!fgKeyCheck.ok) {
        return {
          ok: false,
          code: fgKeyCheck.code === 'FORBIDDEN_DATA' ? 'FORBIDDEN_DATA' : 'INVALID_DOCKVIEW',
          reason: fgKeyCheck.reason,
          readOnlyRequired: true,
        };
      }
      if ((fg.data !== undefined && fg.grid !== undefined) || (fg.data === undefined && fg.grid === undefined)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `${fgLabel} must specify exactly one of "data" or "grid"`,
          readOnlyRequired: true,
        };
      }
      if (!isPlainObject(fg.position)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `${fgLabel}.position must be a plain object`,
          readOnlyRequired: true,
        };
      }
      /** @type {SerializedFloatingGroup} */
      const normFg = {
        position: /** @type {SerializedFloatingGroup['position']} */ ({ ...fg.position }),
      };
      if (fg.data !== undefined) {
        const dataRes = validateGroupPanelViewState(
          fg.data,
          seenGroupIds,
          referencedPanelIds,
          `${fgLabel}.data`
        );
        if (!dataRes.ok) {
          return {
            ok: false,
            code: dataRes.code,
            reason: dataRes.reason,
            readOnlyRequired: true,
          };
        }
        normFg.data = dataRes.normalized;
      } else {
        const gridRes = validateSerializedGridview(
          fg.grid,
          seenGroupIds,
          referencedPanelIds,
          `${fgLabel}.grid`
        );
        if (!gridRes.ok) {
          return {
            ok: false,
            code: gridRes.code,
            reason: gridRes.reason,
            readOnlyRequired: true,
          };
        }
        normFg.grid = gridRes.normalized;
      }
      normalizedFloatingGroups.push(normFg);
    }
  }

  // Popout groups validation (supports both `data` and nested `grid` per dockview-core 8.4.1)
  /** @type {SerializedPopoutGroup[] | undefined} */
  let normalizedPopoutGroups;
  if (working.dockview.popoutGroups !== undefined) {
    if (!Array.isArray(working.dockview.popoutGroups)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: 'dockview.popoutGroups must be an array',
        readOnlyRequired: true,
      };
    }
    normalizedPopoutGroups = [];
    for (let i = 0; i < working.dockview.popoutGroups.length; i++) {
      const pg = working.dockview.popoutGroups[i];
      const pgLabel = `dockview.popoutGroups[${i}]`;
      if (!isPlainObject(pg)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `${pgLabel} must be a plain object`,
          readOnlyRequired: true,
        };
      }
      const pgKeyCheck = checkClosedKeys(
        pg,
        new Set(['data', 'grid', 'url', 'gridReferenceGroup', 'position']),
        pgLabel
      );
      if (!pgKeyCheck.ok) {
        return {
          ok: false,
          code: pgKeyCheck.code === 'FORBIDDEN_DATA' ? 'FORBIDDEN_DATA' : 'INVALID_DOCKVIEW',
          reason: pgKeyCheck.reason,
          readOnlyRequired: true,
        };
      }
      if ((pg.data !== undefined && pg.grid !== undefined) || (pg.data === undefined && pg.grid === undefined)) {
        return {
          ok: false,
          code: 'INVALID_DOCKVIEW',
          reason: `${pgLabel} must specify exactly one of "data" or "grid"`,
          readOnlyRequired: true,
        };
      }
      /** @type {BoxGeometry | null} */
      let normPos = null;
      if (pg.position !== null && pg.position !== undefined) {
        if (
          !isPlainObject(pg.position) ||
          typeof pg.position.x !== 'number' ||
          !Number.isFinite(pg.position.x) ||
          typeof pg.position.y !== 'number' ||
          !Number.isFinite(pg.position.y) ||
          !isFiniteDimension(pg.position.width, false) ||
          !isFiniteDimension(pg.position.height, false)
        ) {
          return {
            ok: false,
            code: 'INVALID_DOCKVIEW',
            reason: `${pgLabel}.position must be null or a valid Box {x,y,width,height}`,
            readOnlyRequired: true,
          };
        }
        normPos = {
          x: pg.position.x,
          y: pg.position.y,
          width: pg.position.width,
          height: pg.position.height,
        };
      }

      /** @type {SerializedPopoutGroup} */
      const normPg = { position: normPos };
      if (pg.url !== undefined) {
        if (typeof pg.url !== 'string') {
          return {
            ok: false,
            code: 'INVALID_DOCKVIEW',
            reason: `${pgLabel}.url must be string`,
            readOnlyRequired: true,
          };
        }
        normPg.url = pg.url;
      }
      if (pg.gridReferenceGroup !== undefined) {
        if (typeof pg.gridReferenceGroup !== 'string') {
          return {
            ok: false,
            code: 'INVALID_DOCKVIEW',
            reason: `${pgLabel}.gridReferenceGroup must be string`,
            readOnlyRequired: true,
          };
        }
        normPg.gridReferenceGroup = pg.gridReferenceGroup;
      }

      if (pg.data !== undefined) {
        const dataRes = validateGroupPanelViewState(
          pg.data,
          seenGroupIds,
          referencedPanelIds,
          `${pgLabel}.data`
        );
        if (!dataRes.ok) {
          return {
            ok: false,
            code: dataRes.code,
            reason: dataRes.reason,
            readOnlyRequired: true,
          };
        }
        normPg.data = dataRes.normalized;
      } else {
        const gridRes = validateSerializedGridview(
          pg.grid,
          seenGroupIds,
          referencedPanelIds,
          `${pgLabel}.grid`
        );
        if (!gridRes.ok) {
          return {
            ok: false,
            code: gridRes.code,
            reason: gridRes.reason,
            readOnlyRequired: true,
          };
        }
        normPg.grid = gridRes.normalized;
      }
      normalizedPopoutGroups.push(normPg);
    }
  }

  // Panels dictionary validation & MissingPanel replacement
  if (!isPlainObject(working.dockview.panels)) {
    return {
      ok: false,
      code: 'INVALID_DOCKVIEW',
      reason: 'dockview.panels must be a plain object',
      readOnlyRequired: true,
    };
  }

  /** @type {Record<string, GroupviewPanelState>} */
  const normalizedPanels = {};
  /** @type {string[]} */
  const replacedPanels = [];

  for (const [panelKey, rawPanel] of Object.entries(working.dockview.panels)) {
    const panelRes = normalizePanelState(
      panelKey,
      rawPanel,
      activePanelTypes,
      allowedParamKeys,
      initialSchemaVersion
    );
    if (!panelRes.ok) {
      return {
        ok: false,
        code: panelRes.code,
        reason: panelRes.reason,
        readOnlyRequired: true,
      };
    }
    normalizedPanels[panelKey] = panelRes.panel;
    if (panelRes.replaced) {
      replacedPanels.push(panelKey);
    }
  }

  // Verify every panel referenced in grid/floating/popout exists in `dockview.panels`,
  // and no orphan unreferenced panel exists.
  for (const refId of referencedPanelIds) {
    if (!Object.prototype.hasOwnProperty.call(normalizedPanels, refId)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Grid references missing panel ID "${refId}" not present in dockview.panels`,
        readOnlyRequired: true,
      };
    }
  }
  for (const panelId of Object.keys(normalizedPanels)) {
    if (!referencedPanelIds.has(panelId)) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `Orphan panel ID "${panelId}" in dockview.panels is not referenced by any group`,
        readOnlyRequired: true,
      };
    }
  }

  if (working.dockview.activeGroup !== undefined) {
    if (
      typeof working.dockview.activeGroup !== 'string' ||
      !seenGroupIds.has(working.dockview.activeGroup)
    ) {
      return {
        ok: false,
        code: 'INVALID_DOCKVIEW',
        reason: `dockview.activeGroup "${String(working.dockview.activeGroup)}" does not reference an existing group`,
        readOnlyRequired: true,
      };
    }
  }

  /** @type {Record<string, { groupId: string, index: number }> | undefined} */
  let normalizedWallPlacements;
  if (working.savedWallPlacements !== undefined) {
    if (!isPlainObject(working.savedWallPlacements)) {
      return {
        ok: false,
        code: 'INVALID_ENVELOPE',
        reason: 'savedWallPlacements must be a plain object',
        readOnlyRequired: true,
      };
    }
    normalizedWallPlacements = {};
    for (const [panelId, placement] of Object.entries(working.savedWallPlacements)) {
      if (
        !isPlainObject(placement) ||
        typeof placement.groupId !== 'string' ||
        !isExactSafeInteger(placement.index) ||
        placement.index < 0
      ) {
        return {
          ok: false,
          code: 'INVALID_ENVELOPE',
          reason: `Invalid savedWallPlacements entry for "${panelId}"`,
          readOnlyRequired: true,
        };
      }
      normalizedWallPlacements[panelId] = {
        groupId: placement.groupId,
        index: placement.index,
      };
    }
  }

  /** @type {SerializedDockviewPayload} */
  const normalizedDockview = {
    grid: mainGridRes.normalized,
    panels: normalizedPanels,
  };
  if (working.dockview.activeGroup !== undefined) {
    normalizedDockview.activeGroup = /** @type {string} */ (working.dockview.activeGroup);
  }
  if (normalizedFloatingGroups !== undefined) {
    normalizedDockview.floatingGroups = normalizedFloatingGroups;
  }
  if (normalizedPopoutGroups !== undefined) {
    normalizedDockview.popoutGroups = normalizedPopoutGroups;
  }

  /** @type {LayoutProfileEnvelope} */
  const finalProfile = {
    format: 'capsule-ui-kit.layout-profile',
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    scope: {
      product,
      profileId,
      workspaceId,
    },
    sharedKitVersion: /** @type {string} */ (working.sharedKitVersion),
    dockviewVersion: /** @type {string} */ (working.dockviewVersion),
    panelRegistryVersion: /** @type {number} */ (working.panelRegistryVersion),
    shell: normalizedShell,
    dockview: normalizedDockview,
  };
  if (normalizedWallPlacements !== undefined) {
    finalProfile.savedWallPlacements = normalizedWallPlacements;
  }

  return {
    ok: true,
    profile: cloneAndFreeze(finalProfile),
    migratedFromVersions: Object.freeze(migratedFromVersions),
    replacedPanels: Object.freeze(replacedPanels),
  };
}

/**
 * Creates a documented default safe layout profile for a given scope when no stored
 * profile exists or when offering an in-memory safe layout during read-only quarantine
 * (architecture contract §4).
 *
 * @param {LayoutProfileScope} scope
 * @returns {LayoutProfileEnvelope}
 */
export function createDefaultLayoutProfile(scope) {
  if (
    !isPlainObject(scope) ||
    typeof scope.product !== 'string' ||
    !scope.product.trim() ||
    typeof scope.profileId !== 'string' ||
    !scope.profileId.trim() ||
    typeof scope.workspaceId !== 'string' ||
    !scope.workspaceId.trim()
  ) {
    throw new TypeError('createDefaultLayoutProfile requires a valid {product, profileId, workspaceId} scope');
  }

  /** @type {LayoutProfileEnvelope} */
  const profile = {
    format: 'capsule-ui-kit.layout-profile',
    schemaVersion: CURRENT_LAYOUT_SCHEMA_VERSION,
    scope: {
      product: scope.product,
      profileId: scope.profileId,
      workspaceId: scope.workspaceId,
    },
    sharedKitVersion: PINNED_VERSIONS.sharedKitVersion,
    dockviewVersion: PINNED_VERSIONS.dockviewVersion,
    panelRegistryVersion: PINNED_VERSIONS.panelRegistryVersion,
    shell: {
      leftRailMode: 'expanded',
      leftRailSize: 240,
      rightRailMode: 'collapsed',
      rightRailSize: 280,
      drawerMode: 'collapsed',
      drawerExpandedHeight: 260,
      selectedPresentation: 'standard',
    },
    dockview: {
      grid: {
        root: {
          type: 'branch',
          size: 1280,
          data: [
            {
              type: 'leaf',
              size: 920,
              visible: true,
              data: {
                id: 'group-main-wall',
                views: ['panel-capsule-primary'],
                activeView: 'panel-capsule-primary',
              },
            },
            {
              type: 'leaf',
              size: 360,
              visible: true,
              data: {
                id: 'group-inspector',
                views: ['panel-inspector-main', 'panel-fleet-main'],
                activeView: 'panel-inspector-main',
              },
            },
          ],
        },
        width: 1280,
        height: 720,
        orientation: 'HORIZONTAL',
      },
      panels: {
        'panel-capsule-primary': {
          id: 'panel-capsule-primary',
          contentComponent: 'CapsulePanel',
          title: 'Primary Capsule',
          renderer: 'always',
          params: {
            slotFolded: false,
          },
        },
        'panel-inspector-main': {
          id: 'panel-inspector-main',
          contentComponent: 'InspectorPanel',
          title: 'Inspector',
          renderer: 'onlyWhenVisible',
          params: {
            inspectorSection: 'identity',
          },
        },
        'panel-fleet-main': {
          id: 'panel-fleet-main',
          contentComponent: 'FleetPanel',
          title: 'Fleet Census',
          renderer: 'onlyWhenVisible',
          params: {},
        },
      },
      activeGroup: 'group-main-wall',
    },
    savedWallPlacements: {
      'panel-capsule-primary': { groupId: 'group-main-wall', index: 0 },
      'panel-inspector-main': { groupId: 'group-inspector', index: 0 },
      'panel-fleet-main': { groupId: 'group-inspector', index: 1 },
    },
  };

  return cloneAndFreeze(profile);
}

/**
 * Serializes a validated layout profile deterministically (sorted keys, 2-space indent)
 * after running full closed validation. Refuses if the profile is invalid or contains
 * forbidden keys.
 *
 * @param {LayoutProfileEnvelope} profile
 * @param {Object} [options]
 * @param {ReadonlySet<string>} [options.activePanelTypes]
 * @param {ReadonlySet<string>} [options.allowedParamKeys]
 * @returns {{ ok: true, json: string, profile: LayoutProfileEnvelope } | DecodeFailure}
 */
export function serializeLayoutProfile(profile, options = {}) {
  const validation = decodeAndMigrateLayoutProfile(profile, options);
  if (!validation.ok) {
    return validation;
  }
  const canonicalJson = JSON.stringify(sortKeysDeep(validation.profile), null, 2);
  return {
    ok: true,
    json: canonicalJson,
    profile: validation.profile,
  };
}

/**
 * Recursively sorts object keys for deterministic offline serialization.
 * @param {unknown} value
 * @returns {unknown}
 */
function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  /** @type {Record<string, unknown>} */
  const sorted = {};
  for (const k of Object.keys(value).sort()) {
    sorted[k] = sortKeysDeep(/** @type {Record<string, unknown>} */ (value)[k]);
  }
  return sorted;
}

/**
 * Applies a popout fallback when popouts are denied or unavailable (architecture contract §4, §14 R2:
 * "Popout fallback must not overwrite an intended saved wall placement").
 * Moves panels from `popoutGroups` back into the in-memory main grid for display, while preserving
 * `savedWallPlacements` and the original `popoutGroups` in the persisted profile copy unless an
 * explicit user gesture docks the panel back.
 *
 * @param {LayoutProfileEnvelope} profile
 * @returns {{ inMemoryDockview: SerializedDockviewPayload, preservedProfile: LayoutProfileEnvelope, fallbackPanelIds: readonly string[] }}
 */
export function resolvePopoutFallbackView(profile) {
  const preservedProfile = cloneAndFreeze(profile);
  const popouts = profile.dockview.popoutGroups ?? [];
  if (popouts.length === 0) {
    return {
      inMemoryDockview: preservedProfile.dockview,
      preservedProfile,
      fallbackPanelIds: [],
    };
  }

  /** @type {string[]} */
  const fallbackPanelIds = [];
  for (const pg of popouts) {
    if (pg.data) {
      fallbackPanelIds.push(...pg.data.views);
    } else if (pg.grid) {
      collectGridViews(pg.grid.root, fallbackPanelIds);
    }
  }

  // Deep clone dockview without mutating preservedProfile
  /** @type {SerializedDockviewPayload} */
  const rawDv = JSON.parse(JSON.stringify(profile.dockview));
  delete rawDv.popoutGroups;

  const firstLeaf = findFirstLeaf(rawDv.grid.root);
  if (firstLeaf) {
    for (const pid of fallbackPanelIds) {
      if (!firstLeaf.data.views.includes(pid)) {
        firstLeaf.data.views.push(pid);
      }
    }
  }

  return {
    inMemoryDockview: cloneAndFreeze(rawDv),
    preservedProfile,
    fallbackPanelIds: Object.freeze(fallbackPanelIds),
  };
}

/**
 * @param {SerializedGridObject} node
 * @param {string[]} out
 */
function collectGridViews(node, out) {
  if (node.type === 'leaf') {
    const leafData = /** @type {GroupPanelViewState} */ (node.data);
    out.push(...leafData.views);
  } else if (node.type === 'branch' && Array.isArray(node.data)) {
    for (const child of node.data) {
      collectGridViews(child, out);
    }
  }
}

/**
 * @param {SerializedGridObject} node
 * @returns {{ type: 'leaf', data: GroupPanelViewState } | null}
 */
function findFirstLeaf(node) {
  if (node.type === 'leaf') {
    return /** @type {{ type: 'leaf', data: GroupPanelViewState }} */ (node);
  }
  if (node.type === 'branch' && Array.isArray(node.data)) {
    for (const child of node.data) {
      const found = findFirstLeaf(child);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Stateful coordinator for the restore pipeline and atomic save guard (architecture contract §4):
 * - Cold read → closed decode → sequential pure migrations → panel normalization → MissingPanel replacement
 * - Unknown future schema or corrupt profile is retained untouched and makes persistence read-only
 *   until explicit recovery (`recoverWithProfile`); an in-memory safe layout is offered without overwriting.
 * - Save-on-gesture-completion is disabled until restoration readiness completes (`markSettled`).
 * - Cross-window owner is singular (`ownerWindowId`).
 * - Popout fallback does not overwrite saved wall placements or popout groups on gesture save.
 *
 * @param {Object} config
 * @param {LayoutProfileScope} config.scope
 * @param {string} config.ownerWindowId
 * @param {{ readRaw: () => Promise<string | null>, writeAtomic: (payload: string, meta: { ownerWindowId: string, scope: LayoutProfileScope }) => Promise<void> }} config.storage
 * @param {LayoutProfileEnvelope} [config.defaultProfile]
 * @param {ReadonlySet<string>} [config.activePanelTypes]
 * @param {ReadonlySet<string>} [config.allowedParamKeys]
 */
export function createLayoutProfileController(config) {
  if (!config || !config.storage || typeof config.storage.readRaw !== 'function' || typeof config.storage.writeAtomic !== 'function') {
    throw new TypeError('createLayoutProfileController requires a valid storage adapter {readRaw, writeAtomic}');
  }
  if (typeof config.ownerWindowId !== 'string' || !config.ownerWindowId.trim()) {
    throw new TypeError('createLayoutProfileController requires a non-empty ownerWindowId');
  }

  const scope = cloneAndFreeze(config.scope);
  const ownerWindowId = config.ownerWindowId;
  const activePanelTypes = config.activePanelTypes ?? DEFAULT_ACTIVE_PANEL_TYPES;
  const allowedParamKeys = config.allowedParamKeys ?? DEFAULT_ALLOWED_PANEL_PARAM_KEYS;
  const checkedDefault = decodeAndMigrateLayoutProfile(config.defaultProfile ?? createDefaultLayoutProfile(scope), { expectedScope: scope, activePanelTypes, allowedParamKeys });
  if (!checkedDefault.ok) throw new TypeError(`Invalid default layout: ${checkedDefault.reason}`);
  const safeDefault = checkedDefault.profile;

  /** @type {'uninitialized' | 'restoring' | 'settled' | 'read-only-quarantine'} */
  let phase = 'uninitialized';
  let readOnly = true;
  let saveOnGestureEnabled = false;
  /** @type {string | null} */
  let quarantineReason = null;
  /** @type {string | null} */
  let quarantineCode = null;
  /** @type {string | null} */
  let untouchedRawPayload = null;
  /** @type {LayoutProfileEnvelope} */
  let activeProfile = safeDefault;
  /** @type {string[]} */
  let lastMigratedVersions = [];
  /** @type {string[]} */
  let lastReplacedPanels = [];

  return Object.freeze({
    /**
     * Executes cold read, closed decode, sequential pure migrations, and normalization.
     * Enters `restoring` phase on success (or `read-only-quarantine` on corrupt/future schema,
     * returning an in-memory safe default layout without touching disk).
     */
    async restore() {
      phase = 'restoring';
      saveOnGestureEnabled = false;
      const raw = await config.storage.readRaw();

      if (raw === null || raw === undefined) {
        // Normal missing profile uses documented defaults and allows persistence once settled
        untouchedRawPayload = null;
        quarantineReason = null;
        quarantineCode = null;
        readOnly = false;
        lastMigratedVersions = [];
        lastReplacedPanels = [];
        activeProfile = safeDefault;
        return {
          status: /** @type {const} */ ('default-initialized'),
          readOnly: false,
          profile: activeProfile,
          migratedFromVersions: [],
          replacedPanels: [],
        };
      }

      const decoded = decodeAndMigrateLayoutProfile(raw, {
        expectedScope: scope,
        activePanelTypes,
        allowedParamKeys,
      });

      if (!decoded.ok) {
        // Retain untouched raw payload and lock persistence into read-only mode
        phase = 'read-only-quarantine';
        readOnly = true;
        saveOnGestureEnabled = false;
        untouchedRawPayload = typeof raw === 'string' ? raw : JSON.stringify(raw);
        quarantineCode = decoded.code;
        quarantineReason = decoded.reason;
        activeProfile = safeDefault;
        return {
          status: /** @type {const} */ ('quarantined-safe-fallback'),
          readOnly: true,
          errorCode: decoded.code,
          errorReason: decoded.reason,
          inMemorySafeProfile: activeProfile,
        };
      }

      untouchedRawPayload = null;
      quarantineReason = null;
      quarantineCode = null;
      readOnly = false;
      activeProfile = decoded.profile;
      lastMigratedVersions = [...decoded.migratedFromVersions];
      lastReplacedPanels = [...decoded.replacedPanels];

      return {
        status: /** @type {const} */ ('restored'),
        readOnly: false,
        profile: activeProfile,
        migratedFromVersions: lastMigratedVersions,
        replacedPanels: lastReplacedPanels,
      };
    },

    /**
     * Enables save-on-gesture-completion after visible-panel readiness, fonts, and
     * final viewport settle (architecture contract §4). Refuses if in read-only quarantine.
     */
    markSettled() {
      if (phase === 'read-only-quarantine' || readOnly) {
        return {
          ok: false,
          reason: 'Cannot enable save-on-gesture while profile is in read-only quarantine',
        };
      }
      if (phase !== 'restoring' && phase !== 'settled') {
        return {
          ok: false,
          reason: 'Must run restore() before markSettled()',
        };
      }
      phase = 'settled';
      saveOnGestureEnabled = true;
      return { ok: true };
    },

    /**
     * Saves an updated layout profile on gesture completion.
     * Enforces:
     * - No overwrite while in read-only quarantine (future schema / corrupt profile).
     * - No save before `markSettled()` (restore barrier).
     * - Singular cross-window owner (`requestingWindowId === ownerWindowId`).
     * - Popout fallback flag (`isPopoutFallback: true`) updates only in-memory view without overwriting saved wall placement on disk.
     *
     * @param {LayoutProfileEnvelope} nextProfile
     * @param {Object} [gestureOptions]
     * @param {string} [gestureOptions.requestingWindowId]
     * @param {boolean} [gestureOptions.isPopoutFallback]
     */
    async saveOnGesture(nextProfile, gestureOptions = {}) {
      const reqWindow = gestureOptions.requestingWindowId ?? ownerWindowId;
      if (reqWindow !== ownerWindowId) {
        return {
          ok: false,
          code: /** @type {const} */ ('NON_OWNER_WINDOW'),
          reason: `Window "${reqWindow}" is not the singular layout owner "${ownerWindowId}"`,
        };
      }

      if (readOnly || phase === 'read-only-quarantine') {
        return {
          ok: false,
          code: /** @type {const} */ ('READ_ONLY_QUARANTINE'),
          reason: `Persistence is read-only (${quarantineCode ?? 'quarantined'}): refusing to overwrite untouched profile`,
        };
      }

      if (!saveOnGestureEnabled || phase !== 'settled') {
        return {
          ok: false,
          code: /** @type {const} */ ('RESTORE_NOT_SETTLED'),
          reason: 'Save-on-gesture refused before restore barrier settles',
        };
      }

      if (gestureOptions.isPopoutFallback) {
        return {
          ok: false,
          code: /** @type {const} */ ('POPOUT_FALLBACK_NO_OVERWRITE'),
          reason: 'Popout fallback must not overwrite intended saved wall placement',
        };
      }

      const serialized = serializeLayoutProfile(nextProfile, {
        activePanelTypes,
        allowedParamKeys,
      });
      if (!serialized.ok) {
        return {
          ok: false,
          code: serialized.code,
          reason: serialized.reason,
        };
      }

      if (
        serialized.profile.scope.product !== scope.product ||
        serialized.profile.scope.profileId !== scope.profileId ||
        serialized.profile.scope.workspaceId !== scope.workspaceId
      ) {
        return {
          ok: false,
          code: /** @type {const} */ ('SCOPE_MISMATCH'),
          reason: 'Cannot save profile with altered scope',
        };
      }

      await config.storage.writeAtomic(serialized.json, {
        ownerWindowId,
        scope,
      });
      activeProfile = serialized.profile;

      return {
        ok: true,
        profile: activeProfile,
        bytesWritten: serialized.json.length,
      };
    },

    /**
     * Explicit operator recovery from read-only quarantine (architecture contract §4:
     * "makes persistence read-only until explicit recovery").
     *
     * @param {LayoutProfileEnvelope} [replacementProfile]
     */
    async recoverExplicitly(replacementProfile) {
      const candidate = replacementProfile ?? safeDefault;
      const serialized = serializeLayoutProfile(candidate, {
        activePanelTypes,
        allowedParamKeys,
      });
      if (!serialized.ok) {
        return {
          ok: false,
          code: serialized.code,
          reason: serialized.reason,
        };
      }
      await config.storage.writeAtomic(serialized.json, {
        ownerWindowId,
        scope,
      });
      activeProfile = serialized.profile;
      untouchedRawPayload = null;
      quarantineCode = null;
      quarantineReason = null;
      readOnly = false;
      phase = 'settled';
      saveOnGestureEnabled = true;
      return {
        ok: true,
        profile: activeProfile,
      };
    },

    /**
     * Returns current controller state snapshot.
     */
    getState() {
      return Object.freeze({
        phase,
        readOnly,
        saveOnGestureEnabled,
        ownerWindowId,
        scope,
        quarantineCode,
        quarantineReason,
        untouchedRawPayload,
        activeProfile,
        lastMigratedVersions: Object.freeze([...lastMigratedVersions]),
        lastReplacedPanels: Object.freeze([...lastReplacedPanels]),
      });
    },
  });
}
