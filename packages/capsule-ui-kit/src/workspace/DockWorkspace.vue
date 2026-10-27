<script>
/**
 * @fileoverview Shared DockWorkspace host module and pure presentation coordinator
 * (unit `Dock host`, `UI_ARCHITECTURE.md` §3, §4, §5, §6, §7, §8, §9, §10, §13, §14).
 *
 * Grounded strictly in:
 * - Installed `dockview-vue version 8.4.1` (`dist/types/index.d.ts`, `dist/types/dockview/types.d.ts`,
 *   `dist/types/dockview/dockview.vue.d.ts`, `dist/types/utils.d.ts`)
 * - Installed `dockview-core version 8.4.1` (`dist/cjs/api/component.api.d.ts`, `dist/cjs/api/dockviewPanelApi.d.ts`,
 *   `dist/cjs/api/dockviewGroupPanelApi.d.ts`, `dist/cjs/dockview/options.d.ts`,
 *   `dist/cjs/dockview/dockviewComponent.d.ts`, `dist/cjs/dockview/theme.d.ts`,
 *   `dist/cjs/overlay/overlayRenderContainer.d.ts`, `dist/cjs/popoutWindow.d.ts`)
 * - Installed `@vue/runtime-core version 3.5.43` and `@vue/reactivity version 3.5.43`
 * - Sibling `layoutProfile.js` (`createLayoutProfileController`, `decodeAndMigrateLayoutProfile`,
 *   `resolvePopoutFallbackView`, `DEFAULT_ACTIVE_PANEL_TYPES`, `DEFAULT_ALLOWED_PANEL_PARAM_KEYS`,
 *   `FORBIDDEN_PARAM_KEYS`, `MISSING_PANEL_TYPE`, `cloneAndFreeze`)
 *
 * Binding Architectural Rules:
 * 1. `DockWorkspace` owns: Panel registry, Dockview adapter, presentation moves/tabs/size,
 *    and restoration barrier (`UI_ARCHITECTURE.md` §3 line 99).
 * 2. `DockWorkspace` excludes: Capsule creation/destruction or authority from add/remove
 *    callbacks (`UI_ARCHITECTURE.md` §3 line 99, §6 line 175, §13 line 384).
 * 3. `dockview-core` `onDidAddPanel` and `onDidRemovePanel` fire during panel moves across groups
 *    (`component.api.d.ts:397-404`). Panel move, tab switch, float, dock-back, or presentation close
 *    NEVER calls `destroy` on a capsule or drops its core identity, terminal binding, or capture lease.
 * 4. (Retired rule) The former bottom orchestrator drawer and its singular-identity
 *    rule were removed; terminal presentation lives in the side terminal panel
 *    and is not a dock panel.
 *
 * Notice on AUSENTE contracts:
 * - `dockview-vue version 8.6.1`: AUSENTE in `node_modules` (installed version is `8.4.1`; `UI_ARCHITECTURE.md` §2, §14 R1).
 * - Built-in `suspendLayout` or `silent` restore API in `dockview-core`: AUSENTE (`UI_ARCHITECTURE.md` §4 Q02).
 *   Handled via an explicit restore veil barrier (`wallRevealed`) + `origin: 'user' | 'api'` disambiguation.
 * - Custom popout `window.open` factory / Electron `BrowserWindow` transfer hook: AUSENTE in `dockview-core`
 *   (`popoutWindow.d.ts:4-58`) and blocked by R2 (`UI_ARCHITECTURE.md` §14 R2). Popout controls are rendered
 *   disabled with an explicit R2 reason, and `onDidOpenPopoutWindowFail` triggers non-destructive in-memory
 *   fallback (`resolvePopoutFallbackView`).
 * - Enterprise Dockview modules (`KeyboardNavigation`, `PinnedTabs`, `MultiRowTabs`, `AdvancedOverflow`,
 *   `SmartGuides`, `DndCompass`, `LayoutHistory`, `AutoHideEdgeGroup`, `AutoEdgeGroup`): AUSENTE in free
 *   `dockview-core version 8.4.1` (`modules.d.ts:88-94`). Keyboard group navigation and layout persistence are
 *   implemented directly in kit code.
 */

import * as defaultLayoutProfileModule from './layoutProfile.js';

/**
 * @typedef {'left' | 'right' | 'above' | 'below' | 'within'} DockviewDirection
 */

/**
 * @typedef {'top' | 'bottom' | 'left' | 'right' | 'center'} DockviewPosition
 */

/**
 * @typedef {'onlyWhenVisible' | 'always'} DockviewPanelRenderer
 */

/**
 * @typedef {'user' | 'api'} DockviewOrigin
 */

/**
 * @typedef {'add' | 'remove' | 'move' | 'float' | 'popout' | 'maximize' | 'tab-group' | 'load' | 'clear'} DockviewLayoutMutationKind
 */

/**
 * @typedef {Object} DockviewThemeConfig
 * @property {string} name
 * @property {string} className
 * @property {'light' | 'dark'} [colorScheme]
 * @property {number} [gap]
 * @property {number} [edgeGroupCollapsedSize]
 * @property {'absolute' | 'relative'} [dndOverlayMounting]
 * @property {'content' | 'group'} [dndPanelOverlay]
 * @property {'line' | 'fill'} [dndTabIndicator]
 * @property {string} [dndOverlayBorder]
 * @property {'wrap' | 'none'} [tabGroupIndicator]
 */

/**
 * @typedef {Object} AddPanelPositionOptions
 * @property {DockviewDirection} [direction]
 * @property {string} [referencePanel]
 * @property {string} [referenceGroup]
 * @property {number} [index]
 */

/**
 * @typedef {Object} AddPanelOptionsInput
 * @property {string} id
 * @property {string} component
 * @property {string} [tabComponent]
 * @property {string} [title]
 * @property {DockviewPanelRenderer} [renderer]
 * @property {Record<string, string | number | boolean | null>} [params]
 * @property {AddPanelPositionOptions} [position]
 * @property {boolean | { x?: number, y?: number, width?: number, height?: number }} [floating]
 * @property {boolean} [inactive]
 * @property {number} [initialWidth]
 * @property {number} [initialHeight]
 * @property {number} [minimumWidth]
 * @property {number} [minimumHeight]
 * @property {number} [maximumWidth]
 * @property {number} [maximumHeight]
 */

/**
 * @typedef {Object} CapsuleBindingRecord
 * @property {string} panelId
 * @property {string} capsuleId
 * @property {number} epoch
 * @property {number} generation
 * @property {'active' | 'standby' | 'ceded' | 'destroyed' | 'lost'} lifecycle
 * @property {string | null} terminalSessionId
 * @property {string | null} captureLeaseId
 * @property {'grid' | 'floating' | 'popout' | 'edge' | 'closed-in-view'} presentationLocation
 * @property {boolean} destroyedByPresentation
 * @property {number} moveCount
 */

/**
 * Closed list of substantive panel component types registered in `DockWorkspace`
 * (`UI_ARCHITECTURE.md` §3 lines 99-108).
 * @type {readonly string[]}
 */
export const DOCK_PANEL_REGISTRY_TYPES = Object.freeze([
  'CapsulePanel',
  'FleetPanel',
  'InspectorPanel',
  'AlertBoard',
  'TimelinePanel',
  'HelpSettingsPanel',
  'MissingPanel',
]);

/**
 * Valid `Direction` union values from `dockview-core` (`baseComponentGridview.d.ts:12`).
 * @type {ReadonlySet<string>}
 */
export const VALID_DOCKVIEW_DIRECTIONS = Object.freeze(
  new Set(['left', 'right', 'above', 'below', 'within'])
);

/**
 * Valid `Position` union values from `dockview-core` (`droptarget.d.ts:34`).
 * @type {ReadonlySet<string>}
 */
export const VALID_DOCKVIEW_POSITIONS = Object.freeze(
  new Set(['top', 'bottom', 'left', 'right', 'center'])
);

/**
 * Valid `DockviewPanelRenderer` union values from `dockview-core` (`overlayRenderContainer.d.ts:5`).
 * @type {ReadonlySet<string>}
 */
export const VALID_DOCKVIEW_RENDERERS = Object.freeze(
  new Set(['onlyWhenVisible', 'always'])
);

/**
 * Density-to-gap pixel map for `DockviewTheme.gap` (`UI_ARCHITECTURE.md` §8).
 * @type {Readonly<Record<string, number>>}
 */
const DENSITY_GAP_MAP = Object.freeze({
  compact: 2,
  regular: 4,
  comfortable: 6,
});

/**
 * Creates a coded error for deterministic assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function dockHostError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Checks whether a value is a plain object.
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
 * Validates that a panel ID is a non-empty immutable string and never a list-length
 * or numeric index (`UI_ARCHITECTURE.md` §6, §9).
 * @param {unknown} id
 * @returns {{ ok: true, id: string } | { ok: false, code: 'ERR_INVALID_PANEL_ID', reason: string }}
 */
export function validatePanelIdentity(id) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    return {
      ok: false,
      code: 'ERR_INVALID_PANEL_ID',
      reason: 'Panel ID must be a non-empty string',
    };
  }
  if (id !== id.trim() || /\s/.test(id)) {
    return {
      ok: false,
      code: 'ERR_INVALID_PANEL_ID',
      reason: `Panel ID "${id}" must not contain whitespace`,
    };
  }
  if (/^\d+$/.test(id)) {
    return {
      ok: false,
      code: 'ERR_INVALID_PANEL_ID',
      reason: `Panel ID "${id}" cannot be a numeric list index or length`,
    };
  }
  return { ok: true, id };
}

/**
 * Builds the closed panel component registry for `<DockviewVue :components="...">`
 * (`UI_ARCHITECTURE.md` §3, `dockview-vue` `VueProps.components`).
 * Any unknown or retired component type resolves deterministically to `MissingPanel`.
 *
 * @param {Record<string, unknown>} [componentMap]
 */
export function createPanelRegistry(componentMap = {}) {
  const missingFallback = componentMap.MissingPanel ?? {
    name: 'MissingPanelFallback',
  };

  /** @type {Record<string, unknown>} */
  const components = {};
  for (const typeName of DOCK_PANEL_REGISTRY_TYPES) {
    components[typeName] = componentMap[typeName] ?? missingFallback;
  }

  return Object.freeze({
    components: Object.freeze(components),
    allowedTypes: DOCK_PANEL_REGISTRY_TYPES,
    /**
     * Resolves any component name to an admitted panel type or `'MissingPanel'`.
     * @param {unknown} requestedName
     * @returns {string}
     */
    resolveComponentName(requestedName) {
      if (
        typeof requestedName === 'string' &&
        DOCK_PANEL_REGISTRY_TYPES.includes(requestedName)
      ) {
        return requestedName;
      }
      return 'MissingPanel';
    },
  });
}

/**
 * Creates the repository-owned `DockviewTheme` metadata object (`dockview-core` `theme.d.ts:2-21`,
 * `UI_ARCHITECTURE.md` §8 lines 271-275).
 * Shared tokens drive `.mv-dockview-theme`; vendor preset palettes are never used as authority.
 *
 * @param {Object} [options]
 * @param {'light' | 'dark'} [options.colorScheme='dark']
 * @param {'compact' | 'regular' | 'comfortable'} [options.density='regular']
 * @returns {DockviewThemeConfig}
 */
export function createSharedDockviewTheme(options = {}) {
  const colorScheme = options.colorScheme === 'light' ? 'light' : 'dark';
  const density =
    typeof options.density === 'string' && Object.prototype.hasOwnProperty.call(DENSITY_GAP_MAP, options.density)
      ? options.density
      : 'regular';

  return Object.freeze({
    name: 'mv-shared',
    className: 'mv-dockview-theme',
    colorScheme,
    gap: DENSITY_GAP_MAP[density],
    edgeGroupCollapsedSize: 28,
    dndOverlayMounting: 'relative',
    dndPanelOverlay: 'content',
    dndTabIndicator: 'line',
    dndOverlayBorder: '1px solid var(--mv-focus-ring-color, #388bfd)',
    tabGroupIndicator: 'wrap',
  });
}

/**
 * Validates and constructs exact `AddPanelOptions` for `DockviewApi.addPanel`
 * (`dockview-core` `options.d.ts:710-775`).
 * Live `CapsulePanel` instances default to `renderer: 'always'` so live surfaces and
 * xterm instances remain mounted in `.dv-overlay-render-container` across tab switches
 * and moves (`UI_ARCHITECTURE.md` §6 line 197, `ar_p_dockview` §8.2).
 *
 * @param {AddPanelOptionsInput} input
 * @param {Object} [options]
 * @param {ReadonlySet<string>} [options.allowedParamKeys]
 * @param {ReadonlySet<string>} [options.forbiddenParamKeys]
 * @returns {{ ok: true, options: AddPanelOptionsInput } | { ok: false, code: string, reason: string }}
 */
export function buildAddPanelOptions(input, options = {}) {
  if (!isPlainObject(input)) {
    return {
      ok: false,
      code: 'ERR_INVALID_ADD_OPTIONS',
      reason: 'AddPanelOptions input must be a plain object',
    };
  }

  const idCheck = validatePanelIdentity(input.id);
  if (!idCheck.ok) {
    return idCheck;
  }

  const allowedParams =
    options.allowedParamKeys ?? defaultLayoutProfileModule.DEFAULT_ALLOWED_PANEL_PARAM_KEYS;
  const forbiddenParams =
    options.forbiddenParamKeys ?? defaultLayoutProfileModule.FORBIDDEN_PARAM_KEYS;

  const component =
    typeof input.component === 'string' && DOCK_PANEL_REGISTRY_TYPES.includes(input.component)
      ? input.component
      : 'MissingPanel';

  /** @type {Record<string, string | number | boolean | null>} */
  const cleanParams = {};
  if (input.params !== undefined) {
    if (!isPlainObject(input.params)) {
      return {
        ok: false,
        code: 'ERR_INVALID_ADD_OPTIONS',
        reason: 'params must be a plain object',
      };
    }
    for (const [k, v] of Object.entries(input.params)) {
      if (forbiddenParams.has(k)) {
        return {
          ok: false,
          code: 'FORBIDDEN_DATA',
          reason: `Forbidden authoritative/sensitive parameter "${k}" in panel "${input.id}"`,
        };
      }
      if (!allowedParams.has(k)) {
        return {
          ok: false,
          code: 'ERR_UNALLOWLISTED_PARAM',
          reason: `Unallowlisted parameter "${k}" in panel "${input.id}"`,
        };
      }
      if (
        v !== null &&
        typeof v !== 'string' &&
        typeof v !== 'boolean' &&
        !(typeof v === 'number' && Number.isFinite(v))
      ) {
        return {
          ok: false,
          code: 'ERR_INVALID_PARAM_VALUE',
          reason: `Parameter "${k}" must be a primitive JSON value`,
        };
      }
      cleanParams[k] = v;
    }
  }

  if (component === 'MissingPanel' && input.component !== 'MissingPanel') {
    cleanParams.originalPanelType = String(input.component ?? 'unknown');
    cleanParams.unavailableReason = `Panel type "${String(input.component)}" is not in the active panel registry`;
  }

  const defaultRenderer = component === 'CapsulePanel' ? 'always' : 'onlyWhenVisible';
  const renderer = input.renderer !== undefined ? input.renderer : defaultRenderer;
  if (!VALID_DOCKVIEW_RENDERERS.has(renderer)) {
    return {
      ok: false,
      code: 'ERR_INVALID_RENDERER',
      reason: `Invalid DockviewPanelRenderer "${String(renderer)}"`,
    };
  }

  /** @type {AddPanelOptionsInput} */
  const out = {
    id: idCheck.id,
    component,
    title: typeof input.title === 'string' && input.title.trim() ? input.title : idCheck.id,
    renderer: /** @type {DockviewPanelRenderer} */ (renderer),
    params: cleanParams,
  };

  if (input.tabComponent !== undefined) {
    if (typeof input.tabComponent !== 'string' || !input.tabComponent.trim()) {
      return {
        ok: false,
        code: 'ERR_INVALID_ADD_OPTIONS',
        reason: 'tabComponent must be a non-empty string when provided',
      };
    }
    out.tabComponent = input.tabComponent;
  }

  if (input.position !== undefined) {
    if (!isPlainObject(input.position)) {
      return {
        ok: false,
        code: 'ERR_INVALID_POSITION',
        reason: 'position must be a plain object',
      };
    }
    if (
      input.position.direction !== undefined &&
      !VALID_DOCKVIEW_DIRECTIONS.has(input.position.direction)
    ) {
      return {
        ok: false,
        code: 'ERR_INVALID_DIRECTION',
        reason: `Invalid Dockview Direction "${String(input.position.direction)}"`,
      };
    }
    out.position = { ...input.position };
  }

  for (const dimKey of /** @type {const} */ ([
    'initialWidth',
    'initialHeight',
    'minimumWidth',
    'minimumHeight',
    'maximumWidth',
    'maximumHeight',
  ])) {
    if (input[dimKey] !== undefined) {
      const val = input[dimKey];
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
        return {
          ok: false,
          code: 'ERR_INVALID_CONSTRAINT',
          reason: `${dimKey} must be a non-negative finite number`,
        };
      }
      out[dimKey] = val;
    }
  }

  return { ok: true, options: defaultLayoutProfileModule.cloneAndFreeze(out) };
}

/**
 * Creates the stateful `DockWorkspace` presentation host coordinating `DockviewApi`,
 * `layoutProfile.js` migrations and restore barrier, non-destructive capsule move/close
 * guarantees, R2 popout fallback, keyboard group navigation, and §9 semantic controls.
 *
 * @param {Object} config
 * @param {{ product: string, profileId: string, workspaceId: string }} config.scope
 * @param {string} config.ownerWindowId
 * @param {{ readRaw: () => Promise<string | null>, writeAtomic: (payload: string, meta: any) => Promise<void> }} config.storage
 * @param {any} [config.defaultProfile]
 * @param {typeof defaultLayoutProfileModule} [config.layoutProfileModule]
 */
export function createDockWorkspaceHost(config) {
  if (!isPlainObject(config)) {
    throw dockHostError('ERR_INVALID_CONFIG', 'createDockWorkspaceHost requires a config object');
  }

  // Binding negative-contrast enforcement (`UI_ARCHITECTURE.md` §3 line 99, §6 line 175, §13 line 384):
  // DockWorkspace excludes capsule creation/destruction or authority from add/remove callbacks.
  if (
    'onDestroyCapsule' in config ||
    'destroyCapsule' in config ||
    'onDestroyCapsuleOnRemove' in config ||
    'onSpawnCapsuleOnAdd' in config
  ) {
    throw dockHostError(
      'ERR_DOCKHOST_FORBIDS_CAPSULE_DESTROY',
      'DockWorkspace excludes capsule creation/destruction authority; panel add/remove callbacks cannot spawn or destroy backend capsules'
    );
  }

  const lpMod = config.layoutProfileModule ?? defaultLayoutProfileModule;
  const profileController = lpMod.createLayoutProfileController({
    scope: config.scope,
    ownerWindowId: config.ownerWindowId,
    storage: config.storage,
    ...(config.defaultProfile ? { defaultProfile: config.defaultProfile } : {}),
  });

  /** @type {any | null} */
  let dockviewApi = null;
  /** @type {Array<{ dispose: () => void }>} */
  const disposables = [];

  // Restore barrier flags (`UI_ARCHITECTURE.md` §4 line 131:
  // restore presentation -> await visible-panel readiness/fonts/final viewport -> reveal settled/error wall -> enable save-on-gesture-completion)
  const barrier = {
    layoutLoadedFromJSON: false,
    popoutsRestored: false,
    visiblePanelsReady: false,
    fontsReady: false,
    viewportReady: false,
  };

  let wallRevealed = false;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let separatorPositionPx = 920;
  const separatorMinPx = 320;
  const separatorMaxPx = 1120;

  let activeMutationOrigin = /** @type {DockviewOrigin | null} */ (null);
  let activeMutationKind = /** @type {DockviewLayoutMutationKind | null} */ (null);
  let pendingUserGestureSave = false;
  let isPopoutFallbackActive = false;
  /** @type {string | null} */
  let lastPopoutFailureReason = null;
  let capsuleDestroyAttemptsBlocked = 0;
  /** @type {string | null} */
  let activePanelId = null;

  /**
   * Non-authoritative presentation tracking of core capsule bindings (`UI_ARCHITECTURE.md` §6).
   * Keyed by immutable `capsuleId`.
   * @type {Map<string, CapsuleBindingRecord>}
   */
  const capsuleBindingsById = new Map();
  /** @type {Map<string, string>} */
  const capsuleIdByPanelId = new Map();

  /**
   * Evaluates whether all restore barrier gates are satisfied; if so, reveals the wall
   * and enables save-on-gesture-completion (unless in read-only quarantine).
   */
  function checkAndSettleRestoreBarrier() {
    if (wallRevealed) {
      return true;
    }
    const allReady =
      barrier.layoutLoadedFromJSON &&
      barrier.popoutsRestored &&
      barrier.visiblePanelsReady &&
      barrier.fontsReady &&
      barrier.viewportReady;

    if (!allReady) {
      return false;
    }

    wallRevealed = true;
    const ctrlState = profileController.getState();
    if (!ctrlState.readOnly && ctrlState.phase !== 'read-only-quarantine') {
      profileController.markSettled();
    }
    return true;
  }

  /**
   * Attaches a `DockviewApi` instance from `@ready` (`DockviewReadyEvent.api`).
   * @param {any} api
   */
  function attachDockviewApi(api) {
    disposeListeners();
    dockviewApi = api;

    disposables.push(
      api.onDidLayoutFromJSON(() => {
        barrier.layoutLoadedFromJSON = true;
        checkAndSettleRestoreBarrier();
      })
    );

    disposables.push(
      api.onWillMutateLayout((event) => {
        activeMutationOrigin = event?.origin ?? 'api';
        activeMutationKind = event?.kind ?? null;
      })
    );

    disposables.push(
      api.onDidMutateLayout((event) => {
        const origin = event?.origin ?? activeMutationOrigin ?? 'api';
        const kind = event?.kind ?? activeMutationKind;
        if (origin === 'user' && kind !== 'load') {
          pendingUserGestureSave = true;
        }
        activeMutationOrigin = null;
        activeMutationKind = null;
      })
    );

    disposables.push(
      api.onDidLayoutChange(() => {
        // Microtask-buffered layout change notification from Dockview;
        // only marks gesture save pending when triggered by user interaction after barrier settles.
        if (activeMutationOrigin === 'user') {
          pendingUserGestureSave = true;
        }
      })
    );

    // `onDidAddPanel` and `onDidRemovePanel` fire multiple times when moving panels
    // (`component.api.d.ts:397-404`). They update presentation location only and NEVER
    // spawn or destroy backend capsules (`UI_ARCHITECTURE.md` §3, §6, §13).
    disposables.push(
      api.onDidRemovePanel((panel) => {
        const pid = panel?.id;
        if (typeof pid === 'string' && capsuleIdByPanelId.has(pid)) {
          const capId = capsuleIdByPanelId.get(pid);
          const rec = capId ? capsuleBindingsById.get(capId) : undefined;
          if (rec) {
            rec.presentationLocation = 'closed-in-view';
            rec.destroyedByPresentation = false;
          }
        }
      })
    );

    disposables.push(
      api.onDidAddPanel((panel) => {
        const pid = panel?.id;
        if (typeof pid === 'string' && capsuleIdByPanelId.has(pid)) {
          const capId = capsuleIdByPanelId.get(pid);
          const rec = capId ? capsuleBindingsById.get(capId) : undefined;
          if (rec) {
            const locType = panel?.api?.location?.type ?? 'grid';
            rec.presentationLocation = locType;
            rec.destroyedByPresentation = false;
          }
        }
      })
    );

    disposables.push(
      api.onDidMovePanel((event) => {
        const pid = event?.panel?.id;
        if (typeof pid === 'string' && capsuleIdByPanelId.has(pid)) {
          const capId = capsuleIdByPanelId.get(pid);
          const rec = capId ? capsuleBindingsById.get(capId) : undefined;
          if (rec) {
            rec.moveCount += 1;
            const locType = event?.to?.api?.location?.type ?? 'grid';
            rec.presentationLocation = locType;
            rec.destroyedByPresentation = false;
          }
        }
      })
    );

    disposables.push(
      api.onDidActivePanelChange((event) => {
        activePanelId = event?.panel?.id ?? null;
      })
    );

    // R2 Popout failure handler (`dockview-core` `popoutWindow.d.ts:15-31`, `UI_ARCHITECTURE.md` §4, §14 R2):
    // When a popout window is blocked or refused, switch to the in-memory fallback view and prevent
    // gesture saves from overwriting the intended saved wall placement.
    disposables.push(
      api.onDidOpenPopoutWindowFail((failure) => {
        isPopoutFallbackActive = true;
        lastPopoutFailureReason = failure?.reason ?? 'blocked';
        const currentProfile = profileController.getState().activeProfile;
        const fallback = lpMod.resolvePopoutFallbackView(currentProfile);
        if (dockviewApi && fallback.fallbackPanelIds.length > 0) {
          dockviewApi.fromJSON(fallback.inMemoryDockview, { reuseExistingPanels: true });
        }
      })
    );
  }

  function disposeListeners() {
    while (disposables.length > 0) {
      const d = disposables.pop();
      try {
        d?.dispose?.();
      } catch {
        // ignore dispose errors on teardown
      }
    }
  }

  /**
   * Executes the cold restore pipeline (`UI_ARCHITECTURE.md` §4 line 131):
   * cold read -> closed decode -> sequential pure migrations -> panel normalization
   * -> replace retired types with `MissingPanel` preserving IDs and structural references
   * -> `dockviewApi.fromJSON(..., { reuseExistingPanels: true })`.
   */
  async function restoreWorkspaceLayout() {
    wallRevealed = false;
    barrier.layoutLoadedFromJSON = false;
    barrier.popoutsRestored = false;
    barrier.visiblePanelsReady = false;
    barrier.fontsReady = false;

    const res = await profileController.restore();
    const targetProfile =
      res.status === 'quarantined-safe-fallback' ? res.inMemorySafeProfile : res.profile;

    // Detect if the restored profile has popoutGroups; under R2 default-deny window.open,
    // prepare the non-destructive fallback if popouts fail.
    if (dockviewApi) {
      const presentationLayout=structuredClone(targetProfile.dockview);
      for (const panel of Object.values(presentationLayout.panels)) {
        if (panel.contentComponent === 'CapsulePanel') {panel.minimumWidth=Math.max(240,panel.minimumWidth ?? 240);panel.minimumHeight=Math.max(200,panel.minimumHeight ?? 200);}
      }
      dockviewApi.fromJSON(presentationLayout, { reuseExistingPanels: true });
    }

    return res;
  }

  /**
   * Marks one of the restore barrier conditions (`popoutsRestored`, `visiblePanelsReady`, `fontsReady`)
   * as ready and checks whether the settled wall can be revealed.
   *
   * @param {'popoutsRestored' | 'visiblePanelsReady' | 'fontsReady'} condition
   * @param {boolean} [isReady=true]
   */
  function markBarrierCondition(condition, isReady = true) {
    if (!Object.prototype.hasOwnProperty.call(barrier, condition)) {
      throw dockHostError('ERR_UNKNOWN_BARRIER_CONDITION', `Unknown barrier condition "${condition}"`);
    }
    barrier[condition] = Boolean(isReady);
    checkAndSettleRestoreBarrier();
    return getState();
  }

  /**
   * Sets the measured viewport dimensions (`1280x720` minimum / `1280x800` Deck matrix,
   * `UI_ARCHITECTURE.md` §8 line 278) and forwards to `DockviewApi.layout(width, height)`.
   *
   * @param {number} width
   * @param {number} height
   */
  function setViewportDimensions(width, height) {
    if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
      return { ok: false, code: 'ERR_INVALID_VIEWPORT', reason: 'Viewport dimensions must be positive numbers' };
    }
    viewportWidth = Math.round(width);
    viewportHeight = Math.round(height);
    if (dockviewApi) {
      dockviewApi.layout(viewportWidth, viewportHeight, true);
    }
    barrier.viewportReady = true;
    checkAndSettleRestoreBarrier();
    return { ok: true, width: viewportWidth, height: viewportHeight, wallRevealed };
  }

  /**
   * Registers or updates a core-projected capsule binding in the workspace (`UI_ARCHITECTURE.md` §6).
   * Mounting or moving a panel never spawns or kills a capsule process.
   *
   * @param {Object} binding
   * @param {string} binding.panelId
   * @param {string} binding.capsuleId
   * @param {number} binding.epoch
   * @param {number} binding.generation
   * @param {'active' | 'standby' | 'ceded' | 'destroyed' | 'lost'} [binding.lifecycle='active']
   * @param {string | null} [binding.terminalSessionId=null]
   * @param {string | null} [binding.captureLeaseId=null]
   */
  function trackCapsuleBinding(binding) {
    const pidCheck = validatePanelIdentity(binding?.panelId);
    if (!pidCheck.ok) {
      throw dockHostError(pidCheck.code, pidCheck.reason);
    }
    const cidCheck = validatePanelIdentity(binding?.capsuleId);
    if (!cidCheck.ok) {
      throw dockHostError('ERR_INVALID_CAPSULE_ID', cidCheck.reason);
    }

    /** @type {CapsuleBindingRecord} */
    const record = {
      panelId: pidCheck.id,
      capsuleId: cidCheck.id,
      epoch: Number.isSafeInteger(binding.epoch) ? binding.epoch : 1,
      generation: Number.isSafeInteger(binding.generation) ? binding.generation : 1,
      lifecycle: binding.lifecycle ?? 'active',
      terminalSessionId: binding.terminalSessionId ?? null,
      captureLeaseId: binding.captureLeaseId ?? null,
      presentationLocation: 'grid',
      destroyedByPresentation: false,
      moveCount: 0,
    };
    capsuleBindingsById.set(record.capsuleId, record);
    capsuleIdByPanelId.set(record.panelId, record.capsuleId);
    return lpMod.cloneAndFreeze(record);
  }

  /**
   * Returns a frozen snapshot of the tracked capsule binding for `capsuleId`.
   * @param {string} capsuleId
   * @returns {CapsuleBindingRecord | null}
   */
  function getCapsuleBinding(capsuleId) {
    const rec = capsuleBindingsById.get(capsuleId);
    return rec ? lpMod.cloneAndFreeze(rec) : null;
  }

  /**
   * Mounts a panel in the Dockview presentation grid (`DockviewApi.addPanel`).
   * Unknown or retired component types resolve to `MissingPanel` via
   * `buildAddPanelOptions`; no panel type carries a singular-identity rule.
   *
   * @param {AddPanelOptionsInput} input
   */
  function mountPanel(input) {
    const built = buildAddPanelOptions(input);
    if (!built.ok) {
      return built;
    }

    if (dockviewApi) {
      const panel = dockviewApi.addPanel(built.options);
      return { ok: true, panelId: built.options.id, panel };
    }
    return { ok: true, panelId: built.options.id, panel: null };
  }

  /**
   * Moves a panel to a target group and `Position` (`'top' | 'bottom' | 'left' | 'right' | 'center'`)
   * via `DockviewPanelApi.moveTo` (`dockviewPanelApi.d.ts:23,58`).
   * Preserves capsule identity, terminal session binding, and capture lease (`UI_ARCHITECTURE.md` §6 line 175).
   *
   * @param {string} panelId
   * @param {Object} moveTarget
   * @param {string} [moveTarget.targetGroupId]
   * @param {DockviewPosition} [moveTarget.position='center']
   * @param {number} [moveTarget.index]
   * @param {boolean} [moveTarget.skipSetActive=false]
   */
  function movePanel(panelId, moveTarget = {}) {
    const position = moveTarget.position ?? 'center';
    if (!VALID_DOCKVIEW_POSITIONS.has(position)) {
      return {
        ok: false,
        code: 'ERR_INVALID_POSITION',
        reason: `Invalid Dockview Position "${String(position)}"`,
      };
    }

    if (!dockviewApi) {
      return { ok: false, code: 'ERR_DOCKVIEW_NOT_READY', reason: 'DockviewApi is not attached' };
    }

    const panel = dockviewApi.getPanel(panelId);
    if (!panel) {
      return { ok: false, code: 'ERR_PANEL_NOT_FOUND', reason: `Panel "${panelId}" not found` };
    }

    const targetGroup = moveTarget.targetGroupId
      ? dockviewApi.getGroup(moveTarget.targetGroupId) ??
        dockviewApi.addGroup({ id: moveTarget.targetGroupId })
      : undefined;

    panel.api.moveTo({
      group: targetGroup,
      position,
      index: moveTarget.index,
      skipSetActive: Boolean(moveTarget.skipSetActive),
    });

    return {
      ok: true,
      panelId,
      position,
      targetGroupId: targetGroup?.id ?? null,
      capsuleDestroyed: false,
    };
  }

  /**
   * Moves a panel into a viewport-bounded floating group (`DockviewApi.addFloatingGroup`,
   * `component.api.d.ts:588`). Preserves capsule lifecycle and bindings (`UI_ARCHITECTURE.md` §6).
   *
   * @param {string} panelId
   * @param {{ x?: number, y?: number, width?: number, height?: number }} [bounds]
   */
  function floatPanel(panelId, bounds = {}) {
    if (!dockviewApi) {
      return { ok: false, code: 'ERR_DOCKVIEW_NOT_READY', reason: 'DockviewApi is not attached' };
    }
    const panel = dockviewApi.getPanel(panelId);
    if (!panel) {
      return { ok: false, code: 'ERR_PANEL_NOT_FOUND', reason: `Panel "${panelId}" not found` };
    }
    dockviewApi.addFloatingGroup(panel, {
      x: bounds.x ?? 80,
      y: bounds.y ?? 60,
      width: bounds.width ?? 640,
      height: bounds.height ?? 480,
    });
    return { ok: true, panelId, location: 'floating', capsuleDestroyed: false };
  }

  /**
   * Docks a floating panel or group back into the main wall grid (`UI_ARCHITECTURE.md` §5 line 153, §6 line 177).
   *
   * @param {string} panelId
   * @param {{ targetGroupId?: string, position?: DockviewPosition }} [options]
   */
  function dockBackPanel(panelId, options = {}) {
    return movePanel(panelId, {
      targetGroupId: options.targetGroupId ?? 'group-main-wall',
      position: options.position ?? 'center',
    });
  }

  /**
   * Closes a panel in the UI presentation layer ONLY (`DockviewPanelApi.close`, `UI_ARCHITECTURE.md` §5 line 144, §6 line 177).
   * Closing a panel is strictly distinct from destroying a backend capsule (`surface_request destroy`).
   *
   * @param {string} panelId
   */
  function closePanelPresentation(panelId) {
    if (!dockviewApi) {
      return { ok: false, code: 'ERR_DOCKVIEW_NOT_READY', reason: 'DockviewApi is not attached' };
    }
    const panel = dockviewApi.getPanel(panelId);
    if (!panel) {
      return { ok: false, code: 'ERR_PANEL_NOT_FOUND', reason: `Panel "${panelId}" not found` };
    }
    panel.api.close();
    return {
      ok: true,
      panelId,
      presentationClosed: true,
      capsuleDestroyed: false,
    };
  }

  /**
   * Explicitly refuses any attempt to trigger backend capsule destruction through `DockWorkspace`
   * (`UI_ARCHITECTURE.md` §3 line 99, §6 line 175, §13 line 384).
   *
   * @param {string} capsuleId
   */
  function attemptDestroyCapsuleFromWorkspace(capsuleId) {
    capsuleDestroyAttemptsBlocked += 1;
    return {
      ok: false,
      code: /** @type {const} */ ('ERR_DOCKHOST_FORBIDS_CAPSULE_DESTROY'),
      reason: `DockWorkspace cannot destroy capsule "${String(capsuleId)}"; backend destruction requires an explicit core surface_request.destroy intent outside presentation callbacks`,
    };
  }

  /**
   * Refuses direct UI popout creation under R2 (`UI_ARCHITECTURE.md` §14 R2) with an explicit
   * human- and agent-readable reason, never calling `window.open`.
   *
   * @param {string} panelId
   */
  function requestPanelPopout(panelId) {
    return {
      ok: false,
      code: /** @type {const} */ ('POPOUT_BLOCKED_BY_R2_POLICY'),
      panelId,
      reason:
        'Popout window unavailable (R2): built-in Dockview window.open is denied by Electron security policy until the reviewed host window transfer contract is ratified',
    };
  }

  /**
   * Flushes any pending user gesture layout change to the authenticated profile persistence
   * boundary via `layoutProfile.js` (`saveOnGesture`).
   * Enforces:
   * - Restore barrier must be settled (`RESTORE_NOT_SETTLED`).
   * - Read-only quarantine blocks overwrite (`READ_ONLY_QUARANTINE`).
   * - Popout fallback active blocks overwrite (`POPOUT_FALLBACK_NO_OVERWRITE`).
   */
  async function flushPendingGestureSave() {
    const ctrlState = profileController.getState();
    const currentDockviewJson = dockviewApi
      ? dockviewApi.toJSON()
      : ctrlState.activeProfile.dockview;

    const candidateProfile = {
      ...ctrlState.activeProfile,
      dockview: currentDockviewJson,
    };

    const res = await profileController.saveOnGesture(candidateProfile, {
      requestingWindowId: config.ownerWindowId,
      isPopoutFallback: isPopoutFallbackActive,
    });

    if (res.ok) {
      pendingUserGestureSave = false;
    }
    return res;
  }

  /**
   * Explicit operator recovery from read-only quarantine (`UI_ARCHITECTURE.md` §4 line 133).
   */
  async function recoverLayoutExplicitly() {
    const res = await profileController.recoverExplicitly();
    if (res.ok && dockviewApi) {
      isPopoutFallbackActive = false;
      lastPopoutFailureReason = null;
      dockviewApi.fromJSON(res.profile.dockview, { reuseExistingPanels: true });
    }
    return res;
  }

  /**
   * Keyboard navigation and separator handler (`UI_ARCHITECTURE.md` §7 line 219, §8 line 277):
   * - Terminal keystrokes (`isTerminalTarget === true`) never bubble into workspace pane shortcuts.
   * - `F6` / `Shift+F6` uses `DockviewApi.activateNext()` / `activatePrevious()` (never deprecated `moveToNext`).
   * - `ArrowLeft` / `ArrowRight` on separator resizes the primary split region deterministically.
   *
   * @param {Object} event
   * @param {string} event.key
   * @param {boolean} [event.shiftKey=false]
   * @param {boolean} [event.isTerminalTarget=false]
   * @param {'workspace' | 'separator'} [event.targetRegion='workspace']
   */
  function handleWorkspaceKeydown(event) {
    if (!event || event.isTerminalTarget) {
      return { handled: false, reason: 'terminal-keystroke-isolated' };
    }

    if (event.key === 'F6') {
      if (dockviewApi) {
        if (event.shiftKey) {
          dockviewApi.activatePrevious();
          return { handled: true, action: 'focus-prev-group' };
        }
        dockviewApi.activateNext();
        return { handled: true, action: 'focus-next-group' };
      }
    }

    if (event.targetRegion === 'separator') {
      const step = event.shiftKey ? 48 : 16;
      if (event.key === 'ArrowLeft') {
        separatorPositionPx = Math.max(separatorMinPx, separatorPositionPx - step);
        pendingUserGestureSave = true;
        return { handled: true, action: 'separator-resize', value: separatorPositionPx };
      }
      if (event.key === 'ArrowRight') {
        separatorPositionPx = Math.min(separatorMaxPx, separatorPositionPx + step);
        pendingUserGestureSave = true;
        return { handled: true, action: 'separator-resize', value: separatorPositionPx };
      }
    }

    return { handled: false };
  }

  /**
   * Builds the §9 semantic control descriptors owned by `DockWorkspace`
   * (`workspace/separator/{id}`, `capsule/{id}/panel`, `capsule/{id}/tab`,
   * `capsule/{id}/popout`, `capsule/{id}/dock-back`).
   * Hidden or veil-covered nodes receive `box: null` (`UI_ARCHITECTURE.md` §9 line 302).
   *
   * @param {Object} [context]
   * @param {string} [context.windowId]
   * @param {number} [context.epoch=1]
   */
  function buildWorkspaceSemanticControls(context = {}) {
    const winId = context.windowId ?? config.ownerWindowId;
    const epoch = Number.isSafeInteger(context.epoch) ? context.epoch : 1;
    const isMaterializedAndVisible = wallRevealed && viewportWidth > 0 && viewportHeight > 0;

    /** @type {Array<Record<string, any>>} */
    const controls = [
      {
        semanticAnchor: 'workspace/separator/main-wall',
        entityId: 'separator-main-wall',
        presentationInstance: `${winId}:grid`,
        controlSlot: 'separator',
        role: 'separator',
        accessibleName: 'Resize named region Primary Wall and Inspector',
        state: {
          orientation: 'vertical',
           valueNow: separatorPositionPx,
          valueMin: separatorMinPx,
          valueMax: separatorMaxPx,
          disabled: false,
        },
        visible: isMaterializedAndVisible,
        materialized: isMaterializedAndVisible,
        inDom: true,
        synthetic: false,
        coordinateSpace: 'content-window',
        box: isMaterializedAndVisible
          ? {
              x: Math.round(separatorPositionPx),
              y: 0,
              width: 6,
              height: Math.round(viewportHeight),
            }
          : null,
        epoch,
        generation: 1,
      },
    ];

    const panelsMap = dockviewApi?._panels instanceof Map ? dockviewApi._panels : new Map();
    let indexOffset = 0;
    for (const [pid, panelObj] of panelsMap.entries()) {
      const panelVisible =
        isMaterializedAndVisible && (panelObj?.api?.isVisible ?? true) !== false;
      const pWidth = Math.max(1, Math.round(panelObj?.api?.width ?? 640));
      const pHeight = Math.max(1, Math.round(panelObj?.api?.height ?? 480));
      const pTitle = panelObj?.title ?? pid;
      const locType = panelObj?.api?.location?.type ?? 'grid';

      controls.push(
        {
          semanticAnchor: `capsule/${pid}/panel`,
          entityId: pid,
          presentationInstance: `${winId}:${locType}`,
          controlSlot: 'panel',
          role: 'region',
          accessibleName: pTitle,
          state: {
            location: locType,
            active: activePanelId === pid,
          },
          visible: panelVisible,
          materialized: panelVisible,
          inDom: true,
          synthetic: false,
          coordinateSpace: 'content-window',
          box: panelVisible
            ? { x: indexOffset * 40, y: 36, width: pWidth, height: pHeight }
            : null,
          epoch,
          generation: 1,
        },
        {
          semanticAnchor: `capsule/${pid}/tab`,
          entityId: pid,
          presentationInstance: `${winId}:${locType}`,
          controlSlot: 'tab',
          role: 'tab',
          accessibleName: `${pTitle} (${locType})`,
          state: {
            selected: activePanelId === pid,
          },
          visible: isMaterializedAndVisible,
          materialized: isMaterializedAndVisible,
          inDom: true,
          synthetic: false,
          coordinateSpace: 'content-window',
          box: isMaterializedAndVisible
            ? { x: indexOffset * 140, y: 0, width: 136, height: 35 }
            : null,
          epoch,
          generation: 1,
        },
        {
          semanticAnchor: `capsule/${pid}/popout`,
          entityId: pid,
          presentationInstance: `${winId}:${locType}`,
          controlSlot: 'popout',
          role: 'button',
          accessibleName: `Pop out ${pTitle}`,
          state: {
            disabled: true,
            unavailableReason:
              'Blocked by R2 security policy: built-in window.open popout is disabled until the reviewed host-window transfer contract is ratified',
          },
          visible: isMaterializedAndVisible,
          materialized: isMaterializedAndVisible,
          inDom: true,
          synthetic: false,
          coordinateSpace: 'content-window',
          box: isMaterializedAndVisible
            ? { x: indexOffset * 140 + 112, y: 6, width: 20, height: 20 }
            : null,
          epoch,
          generation: 1,
        },
        {
          semanticAnchor: `capsule/${pid}/dock-back`,
          entityId: pid,
          presentationInstance: `${winId}:${locType}`,
          controlSlot: 'dock-back',
          role: 'button',
          accessibleName: `Dock back ${pTitle}`,
          state: {
            disabled: locType === 'grid',
            unavailableReason:
              locType === 'grid' ? 'Panel is already docked in the main workspace grid' : undefined,
          },
          visible: isMaterializedAndVisible,
          materialized: isMaterializedAndVisible,
          inDom: true,
          synthetic: false,
          coordinateSpace: 'content-window',
          box: isMaterializedAndVisible
            ? { x: indexOffset * 140 + 90, y: 6, width: 20, height: 20 }
            : null,
          epoch,
          generation: 1,
        }
      );
      indexOffset += 1;
    }

    return lpMod.cloneAndFreeze(controls);
  }

  function getState() {
    const ctrl = profileController.getState();
    return Object.freeze({
      restorePhase: ctrl.phase,
      isReadOnlyQuarantine: ctrl.readOnly || ctrl.phase === 'read-only-quarantine',
      quarantineCode: ctrl.quarantineCode,
      quarantineReason: ctrl.quarantineReason,
      saveOnGestureEnabled: ctrl.saveOnGestureEnabled,
      wallRevealed,
      barrier: { ...barrier },
      viewportWidth,
      viewportHeight,
      separatorPositionPx,
      separatorMinPx,
      separatorMaxPx,
      pendingUserGestureSave,
      isPopoutFallbackActive,
      lastPopoutFailureReason,
      capsuleDestroyAttemptsBlocked,
      activePanelId,
      activeProfile: ctrl.activeProfile,
    });
  }

  function dispose() {
    disposeListeners();
    dockviewApi = null;
  }

  return Object.freeze({
    attachDockviewApi,
    restoreWorkspaceLayout,
    markBarrierCondition,
    setViewportDimensions,
    trackCapsuleBinding,
    getCapsuleBinding,
    mountPanel,
    movePanel,
    floatPanel,
    dockBackPanel,
    closePanelPresentation,
    attemptDestroyCapsuleFromWorkspace,
    requestPanelPopout,
    flushPendingGestureSave,
    completeUserGesture: async () => {
      if (!wallRevealed) return { ok: false, reason: 'restore-not-settled' };
      pendingUserGestureSave = true;
      return flushPendingGestureSave();
    },
    recoverLayoutExplicitly,
    handleWorkspaceKeydown,
    buildWorkspaceSemanticControls,
    getState,
    dispose,
  });
}
</script>

<script setup>
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, markRaw, nextTick, provide } from 'vue';
import { bindDockTabIdentities } from './dockTabIdentity.js';
import { DockviewVue } from 'dockview-vue';
import { createWindowPresentation } from './windowPresentation.js';

const props = defineProps({
  defaultProfile: { type: Object, default: null },
  scope: {
    type: Object,
    required: true,
  },
  ownerWindowId: {
    type: String,
    default: 'window-main',
  },
  storage: {
    type: Object,
    required: true,
  },
  tabComponents: { type: Object, default: () => ({}) },
  defaultTabComponent: { type: String, default: undefined },
  panelComponents: {
    type: Object,
    default: () => ({}),
  },
  colorScheme: {
    type: String,
    default: 'dark',
  },
  density: {
    type: String,
    default: 'regular',
  },
  workspaceTitle: {
    type: String,
    default: 'Capsule Workspace Wall',
  },
  initialViewportWidth: {
    type: Number,
    default: 1280,
  },
  initialViewportHeight: {
    type: Number,
    default: 720,
  },
});

const emit = defineEmits([
  'ready',
  'wall-settled',
  'layout-saved',
  'quarantine-detected',
  'popout-blocked',
  'active-panel-change',
]);

// Keep DockviewApi and host coordinator out of deep Vue reactivity (UI_ARCHITECTURE.md §10, ar_p_vue §11)
const dockviewApiRef = shallowRef(null);
const stageElementRef = shallowRef(null);
let stageObserver = null;
let tabIdentityObserver = null;
const hostRef = shallowRef(null);

const windowRevision = ref(0);
const windows = shallowRef(null);
const dropPreview = ref('');
const isDragging = ref(false);
const tabStripTarget = ref(false);
let dragSourcePanelId = null;
function onHeaderDrop(event) {
  if (!isDragging.value || !dragSourcePanelId) return;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (!target?.closest('.dv-tabs-and-actions-container')) return;
  const api = dockviewApiRef.value;
  const sourceId = dragSourcePanelId;
  const group = api?.groups.find(group => group.element.contains(target));
  if (!group || api.getPanel(sourceId)?.group === group) return;
  // Let Dockview finish pointer cleanup before committing the header merge.
  // A native merge already at this destination needs no second move.
  requestAnimationFrame(() => {
    const source = api.getPanel(sourceId);
    if (source && source.group !== group && api.getGroup(group.id)) {
      source.api.moveTo({group, position: 'center'});
      void windowChanged();
    }
  });
}
function clearDropPreview() {dragSourcePanelId=null;isDragging.value=false;tabStripTarget.value=false;dropPreview.value='';}
function onDragPointerMove(event) {
  if (!isDragging.value) return;
  const {clientX,clientY}=event;
  queueMicrotask(() => {
    if (!isDragging.value) return;
    const target=document.elementFromPoint(clientX,clientY);
    tabStripTarget.value=!!target?.closest('.dv-tabs-and-actions-container');
  });
}
const hiddenWindows = computed(() => {windowRevision.value; return windows.value?.listHidden() ?? [];});
provide('capsuleWindowPresentation', {revision: windowRevision, get: () => windows.value});
function labelResizeHandles() {
  const api = dockviewApiRef.value;
  if (!api) return;
  for (const group of api.groups) {
    bindDockTabIdentities(group.element);
    const panel = group.activePanel;
    const floating = group.element.closest('.dv-resize-container');
    if (!panel || !floating) continue;
    for (const handle of floating.querySelectorAll('[class^="dv-resize-handle-"]')) {
      const edge = handle.className.replace('dv-resize-handle-', '');
      handle.id = `window-resize-${panel.id}-${edge}`;
      handle.dataset.semanticAnchor = `workspace/separator/window-${panel.id}-${edge}`;
      handle.setAttribute('role','separator');
      handle.setAttribute('aria-label',`Resize ${panel.title ?? panel.id} ${edge}`);
      const horizontal = edge === 'top' || edge === 'bottom';
      handle.setAttribute('aria-orientation', horizontal ? 'horizontal' : 'vertical');
      const bounds = floating.getBoundingClientRect();
      handle.setAttribute('aria-valuenow',String(Math.round(horizontal ? bounds.height : bounds.width)));
      handle.setAttribute('aria-valuemin','240');
      handle.setAttribute('aria-valuemax',String(Math.round(horizontal ? api.height : api.width)));
      handle.tabIndex = 0;
      handle.onkeydown = event => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        group.api.setSize({width:Math.max(240,panel.api.width + (event.key === 'ArrowLeft' ? -8 : event.key === 'ArrowRight' ? 8 : 0)),height:Math.max(240,panel.api.height + (event.key === 'ArrowUp' ? -8 : event.key === 'ArrowDown' ? 8 : 0))});
        void onUserGesture();
      };
    }
  }
}
async function windowChanged() {
  windowRevision.value++;
  await nextTick();
  // The hidden strip changes the host viewport. Let ResizeObserver and Dockview
  // apply that layout before recording the completed window gesture.
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  labelResizeHandles();
  await onUserGesture();
}
function onWindowShortcut(event) {
  if (event.key === 'Escape') clearDropPreview();
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'h') {event.preventDefault(); windows.value?.showAll();}
  if (event.ctrlKey && event.key === 'F6') {event.preventDefault(); windows.value?.focusNext();}
}
const restorePhase = ref('uninitialized');
const wallRevealed = ref(false);
const isReadOnlyQuarantine = ref(false);
const quarantineReason = ref('');
const isPopoutFallbackActive = ref(false);
const separatorNow = ref(920);
const separatorMin = ref(320);
const separatorMax = ref(1120);

const panelRegistry = computed(() => createPanelRegistry(props.panelComponents));
const registeredComponents = computed(() => panelRegistry.value.components);

const themeConfig = computed(() =>
  createSharedDockviewTheme({
    colorScheme: props.colorScheme === 'light' ? 'light' : 'dark',
    density:
      props.density === 'compact' || props.density === 'comfortable'
        ? props.density
        : 'regular',
  })
);

function syncSnapshotFromHost() {
  const host = hostRef.value;
  if (!host) return;
  const st = host.getState();
  const prevRevealed = wallRevealed.value;
  restorePhase.value = st.restorePhase;
  wallRevealed.value = st.wallRevealed;
  isReadOnlyQuarantine.value = st.isReadOnlyQuarantine;
  quarantineReason.value = st.quarantineReason ?? '';
  isPopoutFallbackActive.value = st.isPopoutFallbackActive;
  separatorNow.value = st.separatorPositionPx;
  separatorMin.value = st.separatorMinPx;
  separatorMax.value = st.separatorMaxPx;

  if (!prevRevealed && st.wallRevealed) {
    emit('wall-settled', {
      restorePhase: st.restorePhase,
      isReadOnlyQuarantine: st.isReadOnlyQuarantine,
    });
  }
}

/**
 * Handles `@ready` from `<DockviewVue>` (`DockviewReadyEvent`).
 * @param {{ api: any }} event
 */
async function onDockviewReady(event) {
  const rawApi = markRaw(event.api);
  dockviewApiRef.value = rawApi;
  // Child-list observation covers tab creation/recreation after ready, restore,
  // and moves. Attributes are deliberately excluded to avoid observing our writes.
  tabIdentityObserver = new MutationObserver(() => {
    for (const group of rawApi.groups) bindDockTabIdentities(group.element);
  });
  if (stageElementRef.value) tabIdentityObserver.observe(stageElementRef.value, {childList: true, subtree: true});

  const host = markRaw(
    createDockWorkspaceHost({
      scope: props.scope,
      ownerWindowId: props.ownerWindowId,
      storage: props.storage,
      defaultProfile: props.defaultProfile,
    })
  );
  hostRef.value = host;
  host.attachDockviewApi(rawApi);
  // fromJSON restores serialized dimensions as well as structure. Those may
  // describe a different viewport; remeasure the outer stage, not api.width /
  // api.height (which describe the inner grid after shell borders and tracks).
  rawApi.onDidLayoutFromJSON(() => {
    const rect = stageElementRef.value?.getBoundingClientRect();
    if (rect?.width > 0 && rect?.height > 0) host.setViewportDimensions(rect.width, rect.height);
    labelResizeHandles();
  });
  windows.value = markRaw(createWindowPresentation(rawApi, () => {void windowChanged();}));
  rawApi.onDidLayoutChange(() => {windowRevision.value++;requestAnimationFrame(labelResizeHandles);});
  rawApi.onWillDragPanel(() => {isDragging.value=true;dropPreview.value='Move capsule';});
  rawApi.onWillDragGroup(() => {isDragging.value=true;dropPreview.value='Move group';});
  rawApi.onWillShowOverlay((event) => {
    isDragging.value=true;
    const transfer=event.getData();
    dragSourcePanelId=transfer?.panelId ?? null;
    const count=transfer?.panelId ? 1 : rawApi.getGroup(transfer?.groupId)?.panels.length;
    dropPreview.value = event.position !== 'center' ? `Split ${event.position}` : event.kind === 'content' ? (count === 1 ? 'Swap capsules' : 'Add as tabs') : 'Add as tab';
  });

  const restoreResult = await host.restoreWorkspaceLayout();
  if (restoreResult.status === 'quarantined-safe-fallback') {
    emit('quarantine-detected', {
      code: restoreResult.errorCode,
      reason: restoreResult.errorReason,
    });
  }

  if (rawApi.popoutRestorationPromise) {
    try {
      await rawApi.popoutRestorationPromise;
    } catch {
      // handled via onDidOpenPopoutWindowFail
    }
  }
  labelResizeHandles();
  host.markBarrierCondition('popoutsRestored', true);
  await nextTick();
  windowRevision.value++;
  if (document.fonts) await document.fonts.ready;
  host.markBarrierCondition('visiblePanelsReady', true);
  host.markBarrierCondition('fontsReady', true);
  const stage = stageElementRef.value;
  if (stage) {
    const updateViewport = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) host.setViewportDimensions(rect.width, rect.height);
      labelResizeHandles();
      syncSnapshotFromHost();
    };
    updateViewport();
    stageObserver = new ResizeObserver(updateViewport);
    stageObserver.observe(stage);
  }

  syncSnapshotFromHost();
  emit('ready', { api: rawApi, host, windows: windows.value, revision: windowRevision });
}

function onWillDrop(event) {
  const transfer=event.getData();
  const sourceGroup=transfer ? dockviewApiRef.value?.getGroup(transfer.groupId) : null;
  const sourceId=transfer?.panelId ?? (sourceGroup?.panels.length === 1 ? sourceGroup.panels[0].id : null);
  const target = event.group?.activePanel;
  if (event.kind === 'content' && event.position === 'center' && sourceId && target && sourceId !== target.id) {
    event.preventDefault();
    // Finish outside the native drop stack: fromJSON rebuilds the target groups.
    queueMicrotask(() => windows.value?.swap(sourceId, target.id));
  }
  clearDropPreview();
  syncSnapshotFromHost();
}

async function onDidDrop() {
  const host = hostRef.value;
  if (!host) return;
  const res = await host.flushPendingGestureSave();
  syncSnapshotFromHost();
  if (res.ok) {
    emit('layout-saved', { bytesWritten: res.bytesWritten });
  }
}

// Custom tabs call panel.setActive(), which Dockview labels as API origin.
// A completed DOM gesture supplies the presentation provenance explicitly.
async function onUserGesture() {
  await nextTick();
  const host = hostRef.value;
  if (!host) return;
  const res = await host.completeUserGesture();
  syncSnapshotFromHost();
  if (res.ok) emit('layout-saved', { bytesWritten: res.bytesWritten });
}

function onFocusNextGroup() {
  const host = hostRef.value;
  if (!host) return;
  host.handleWorkspaceKeydown({ key: 'F6', shiftKey: false, isTerminalTarget: false });
  syncSnapshotFromHost();
}

function onFocusPrevGroup() {
  const host = hostRef.value;
  if (!host) return;
  host.handleWorkspaceKeydown({ key: 'F6', shiftKey: true, isTerminalTarget: false });
  syncSnapshotFromHost();
}

function onRequestPopoutDisabled() {
  const host = hostRef.value;
  if (!host) return;
  const refusal = host.requestPanelPopout(host.getState().activePanelId ?? 'panel-capsule-primary');
  emit('popout-blocked', refusal);
}

/**
 * Keyboard handler for the primary workspace region separator (`workspace/separator/main-wall`).
 * @param {KeyboardEvent} event
 */
async function onSeparatorKeydown(event) {
  const host = hostRef.value;
  if (!host) return;
  const res = host.handleWorkspaceKeydown({
    key: event.key,
    shiftKey: event.shiftKey,
    isTerminalTarget: false,
    targetRegion: 'separator',
  });
  if (res.handled) {
    event.preventDefault();
    await host.flushPendingGestureSave();
    syncSnapshotFromHost();
  }
}

async function onRecoverQuarantinedLayout() {
  const host = hostRef.value;
  if (!host) return;
  const res = await host.recoverLayoutExplicitly();
  syncSnapshotFromHost();
  if (res.ok) {
    emit('layout-saved', { recovered: true });
  }
}

watch(
  () => [props.initialViewportWidth, props.initialViewportHeight],
  ([w, h]) => {
    if (hostRef.value && typeof w === 'number' && typeof h === 'number') {
      hostRef.value.setViewportDimensions(w, h);
      syncSnapshotFromHost();
    }
  }
);

onMounted(() => {
  document.addEventListener('keydown', onWindowShortcut);
  window.addEventListener('pointerup', onHeaderDrop, true);
  window.addEventListener('pointerup', clearDropPreview);
  window.addEventListener('pointermove', onDragPointerMove, true);
  syncSnapshotFromHost();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onWindowShortcut);
  window.removeEventListener('pointerup', onHeaderDrop, true);
  window.removeEventListener('pointerup', clearDropPreview);
  window.removeEventListener('pointermove', onDragPointerMove, true);
  tabIdentityObserver?.disconnect();
  tabIdentityObserver = null;
  stageObserver?.disconnect();
  stageObserver = null;
  if (hostRef.value) {
    hostRef.value.dispose();
    hostRef.value = null;
  }
  dockviewApiRef.value = null;
});

defineExpose({
  getHost: () => hostRef.value,
  getDockviewApi: () => dockviewApiRef.value,
});
</script>

<template>
  <section
    id="workspace-dock-host"
    class="mv-dock-workspace"
    role="region"
    :aria-label="workspaceTitle"
    :data-restore-phase="restorePhase"
    :data-wall-revealed="String(wallRevealed)"
    :data-popout-fallback="String(isPopoutFallbackActive)"
    @click="onUserGesture"
    @keyup="onUserGesture"
    @pointercancel="clearDropPreview"
    @pointerup="dropPreview = ''; onUserGesture()"
  >
    <!-- Read-only quarantine alert banner when saved layout has unknown future schema or corruption (UI_ARCHITECTURE.md §4) -->
    <div
      v-if="isReadOnlyQuarantine"
      id="workspace-quarantine-alert"
      class="mv-dock-workspace__quarantine-banner"
      role="alert"
      aria-label="Layout profile read-only quarantine notice"
    >
      <span class="mv-dock-workspace__quarantine-text">
        Layout persistence is in read-only quarantine ({{ quarantineReason }}). Displayed safe layout will not overwrite your saved profile unless you recover explicitly.
      </span>
      <button
        id="workspace-quarantine-recover"
        data-semantic-anchor="settings/recover-layout"
        type="button"
        role="button"
        class="mv-dock-workspace__action-btn"
        aria-label="Recover layout profile with safe defaults"
        @click="onRecoverQuarantinedLayout"
      >
        Recover Default Layout
      </button>
    </div>

    <!-- Accessible keyboard workspace controls and R2 popout status bar (UI_ARCHITECTURE.md §8, §9, §14 R2) -->
    <div
      id="workspace-keyboard-toolbar"
      class="mv-dock-workspace__toolbar"
      role="toolbar"
      aria-label="Workspace layout navigation and controls"
    >
      <button
        id="workspace-focus-prev-group"
        data-semantic-anchor="shell/navigation/previous-group"
        type="button"
        role="button"
        class="mv-dock-workspace__action-btn"
        aria-label="Focus previous dock group"
        @click="onFocusPrevGroup"
      >
        Previous Group
      </button>
      <button
        id="workspace-focus-next-group"
        data-semantic-anchor="shell/navigation/next-group"
        type="button"
        role="button"
        class="mv-dock-workspace__action-btn"
        aria-label="Focus next dock group"
        @click="onFocusNextGroup"
      >
        Next Group
      </button>
      <button id="workspace-focus-next-capsule" data-semantic-anchor="shell/navigation/focus-next-capsule" type="button" role="button" aria-label="Focus next capsule (Control F6)" aria-keyshortcuts="Control+F6" @click="windows?.focusNext()">Next capsule</button>
      <div
        id="workspace-separator-main-wall"
        data-semantic-anchor="workspace/separator/main-wall"
        class="mv-dock-workspace__separator"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-valuenow="separatorNow"
        :aria-valuemin="separatorMin"
        :aria-valuemax="separatorMax"
        aria-label="Resize named region Primary Wall and Inspector"
        @keydown="onSeparatorKeydown"
      />
      <button
        id="workspace-popout-unavailable"
        data-semantic-anchor="shell/navigation/popout"
        type="button"
        role="button"
        class="mv-dock-workspace__action-btn mv-dock-workspace__action-btn--disabled"
        aria-disabled="true"
        disabled
        title="Unavailable (R2): built-in window.open popout is denied by security policy until host window transfer contract is ratified"
        aria-label="Pop out active capsule (Unavailable: R2 security policy blocks window.open)"
        @click="onRequestPopoutDisabled"
      >
        Pop Out (Unavailable — R2)
      </button>
    </div>

    <div v-if="dropPreview" id="workspace-drop-preview" role="status" class="mv-window-drop-preview">{{ tabStripTarget ? 'Add as tab' : dropPreview }}</div>
    <!-- Main Dockview presentation host -->
    <div ref="stageElementRef" id="workspace-dockview-stage" class="mv-dock-workspace__stage">
      <DockviewVue
        class="mv-dock-workspace__dockview"
        :theme="themeConfig"
        :components="registeredComponents"
        :tab-components="tabComponents"
        :default-tab-component="defaultTabComponent"
        :default-renderer="'always'"
        dnd-strategy="pointer"
        :floating-group-bounds="'boundedWithinViewport'"
        :disable-auto-resizing="true"
        @ready="onDockviewReady"
        @will-drop="onWillDrop"
        @did-drop="onDidDrop"
      />

      <!-- Full-size restore barrier veil (UI_ARCHITECTURE.md §4 line 131, §12 G-VISUAL) -->
      <div
        
        id="workspace-restore-veil"
        class="mv-dock-workspace__veil"
        role="status"
        aria-live="polite"
        aria-label="Restoring workspace layout"
       :class="{ 'cuk-csp-hidden': !(!wallRevealed) }">
        <span class="mv-dock-workspace__veil-label">Restoring settled workspace layout…</span>
      </div>
    </div>
    <div id="workspace-hidden-windows" role="toolbar" aria-label="Hidden capsules" class="mv-window-taskbar">
      <button id="workspace-show-all" data-semantic-anchor="shell/navigation/show-all" role="button" aria-label="Show all hidden capsules (Control Shift H)" aria-keyshortcuts="Control+Shift+H" @click="windows?.showAll()">Show all</button>
      <button v-for="item in hiddenWindows" :key="item.id" :id="`window-show-${item.id}`" :data-semantic-anchor="`capsule/${item.capsuleId}/show`" role="button" :aria-label="`Show ${item.title}`" data-window-hidden="true" :data-window-capsule-id="item.capsuleId" @click="windows?.show(item.id)">Show {{ item.title }}</button>
    </div>
  </section>
</template>

<style>
@import 'dockview-vue/dist/styles/dockview.css';

.mv-dock-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 320px;
  min-height: 240px;
  background-color: var(--mv-surface-canvas, #121417);
  color: var(--mv-text-primary, #e6edf3);
  overflow: hidden;
}

.mv-dock-workspace__quarantine-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mv-space-3, 12px);
  padding: var(--mv-space-2, 8px) var(--mv-space-3, 12px);
  background-color: var(--mv-status-warning-surface, #3b2e12);
  color: var(--mv-status-warning-text, #f8e3a1);
  border-bottom: 1px solid var(--mv-border-default, #30363d);
}

.mv-dock-workspace:has(.mv-dock-workspace__quarantine-banner) {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.mv-dock-workspace__toolbar {
  display: flex;
  align-items: center;
  gap: var(--mv-space-2, 8px);
  padding: var(--mv-space-1, 4px) var(--mv-space-3, 12px);
  background-color: var(--mv-surface-chrome, #161b22);
  border-bottom: 1px solid var(--mv-border-default, #30363d);
}

.mv-dock-workspace__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--mv-control-height-sm, 26px);
  padding: 0 var(--mv-space-2, 8px);
  font-size: var(--mv-font-size-xs, 12px);
  color: var(--mv-text-primary, #e6edf3);
  background-color: var(--mv-surface-panel, #1f242c);
  border: 1px solid var(--mv-border-default, #30363d);
  border-radius: var(--mv-radius-sm, 4px);
  cursor: pointer;
}

.mv-dock-workspace__action-btn:focus-visible,
.mv-dock-workspace__separator:focus-visible {
  outline: 2px solid var(--mv-focus-ring-color, #388bfd);
  outline-offset: 1px;
}

.mv-dock-workspace__action-btn--disabled {
  color: var(--mv-text-disabled, #6e7681);
  cursor: not-allowed;
  opacity: 0.75;
}

.mv-dock-workspace__separator {
  width: var(--mv-separator-size, 6px);
  height: var(--mv-control-height-sm, 22px);
  background-color: var(--mv-border-default, #30363d);
  border-radius: var(--mv-radius-xs, 2px);
  cursor: col-resize;
}

.mv-dock-workspace__stage {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.mv-dock-workspace__dockview {
  width: 100%;
  height: 100%;
}

/* Overlay positioning permitted only for overlays/veils (UI_ARCHITECTURE.md §8 line 277) */
.mv-dock-workspace__veil {
  position: absolute;
  inset: 0;
  z-index: var(--mv-z-veil, 20);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--mv-surface-canvas, #121417);
  color: var(--mv-text-muted, #8b949e);
}

/* Shared Dockview theme adapter mapping --dv-* variables to repository-owned --mv-* roles (UI_ARCHITECTURE.md §8) */
.mv-dockview-theme {
  --dv-group-view-background-color: var(--mv-surface-panel, #161b22);
  --dv-tabs-and-actions-container-background-color: var(--mv-surface-chrome, #0d1117);
  --dv-tabs-and-actions-container-height: var(--mv-tab-strip-height, 34px);
  --dv-tabs-and-actions-container-font-size: var(--mv-font-size-sm, 12px);
  --dv-activegroup-visiblepanel-tab-background-color: var(--mv-surface-panel, #161b22);
  --dv-activegroup-hiddenpanel-tab-background-color: var(--mv-surface-chrome, #0d1117);
  --dv-inactivegroup-visiblepanel-tab-background-color: var(--mv-surface-panel, #161b22);
  --dv-inactivegroup-hiddenpanel-tab-background-color: var(--mv-surface-chrome, #0d1117);
  --dv-activegroup-visiblepanel-tab-color: var(--mv-text-primary, #e6edf3);
  --dv-activegroup-hiddenpanel-tab-color: var(--mv-text-muted, #8b949e);
  --dv-inactivegroup-visiblepanel-tab-color: var(--mv-text-muted, #8b949e);
  --dv-inactivegroup-hiddenpanel-tab-color: var(--mv-text-disabled, #6e7681);
  --dv-separator-border: var(--mv-border-default, #30363d);
  --dv-tab-divider-color: var(--mv-border-default, #30363d);
  --dv-paneview-active-outline-color: var(--mv-focus-ring-color, #388bfd);
  --dv-floating-border: 1px solid var(--mv-border-default, #30363d);
}

.cuk-csp-hidden { display: none !important; }
</style>

<style>
.mv-dock-workspace {grid-template-rows:auto minmax(0,1fr) auto;}
.mv-window-taskbar {display:flex;gap:.25rem;overflow:auto;min-height:2rem;}
/* Keep the floating overlay's box available to Dockview's bounds constraints
   while its contents remain hidden and cannot receive pointer input. A zero
   overlay rectangle during host resize otherwise overwrites its saved origin. */
.mv-dock-workspace .dv-resize-container.dv-hidden {
  display: block !important;
  content-visibility: hidden;
  visibility: hidden;
  pointer-events: none;
}

.mv-window-drop-preview {position:absolute;z-index:10000;top:3rem;left:40%;padding:.5rem;background:#25394c;color:white;pointer-events:none;}
</style>
