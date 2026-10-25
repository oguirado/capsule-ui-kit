/**
 * @fileoverview Behavioral and structural tests for `DockWorkspace.vue` (unit `Dock host`,
 * `UI_ARCHITECTURE.md` §3, §4, §5, §6, §7, §8, §9, §10, §13, §14).
 *
 * Tests:
 * 1. `@vue/compiler-sfc` parsing, template compilation, no-TypeScript (`lang="ts"` absent),
 *    no consumer imports, and §9 actionable control attributes (`id`, `role`, `aria-label`).
 * 2. Exact `dockview-vue version 8.4.1` / `dockview-core version 8.4.1` type/option contracts, closed panel
 *    registry, `defaultRenderer: 'always'` for live capsules, and shared `DockviewTheme` adapter.
 * 3. Restore barrier pipeline with `layoutProfile.js`: sequential v1->v2 migration, `MissingPanel`
 *    replacement preserving IDs and structural references, veil gate until all readiness
 *    conditions settle, and read-only quarantine on future/corrupt schema.
 * 4. Negative contrast (binding row requirement): panel move, tab switch, float, dock-back,
 *    close, or Dockview `onDidRemovePanel` / `onDidAddPanel` callbacks NEVER destroy a capsule,
 *    never drop terminal/capture bindings, and never spawn a second `OrchestratorDrawer` instance.
 * 5. R2 popout failure fallback (`onDidOpenPopoutWindowFail`) preserving saved wall placements,
 *    keyboard navigation (`activateNext`/`activatePrevious`, separator resize, terminal keystroke
 *    isolation), and §9 semantic control inventory boxes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SFC_PATH = path.resolve(__dirname, '../src/workspace/DockWorkspace.vue');
const LOCAL_LAYOUT_PROFILE_PATH = path.resolve(__dirname, '../src/workspace/layoutProfile.js');
const COMPILER_SFC_PATH =
  '@vue/compiler-sfc';

/** Loads the sibling layout profile module. */
async function loadLayoutProfileModule() {
  return import(pathToFileURL(LOCAL_LAYOUT_PROFILE_PATH).href);
}

/**
 * Parses `DockWorkspace.vue` using `@vue/compiler-sfc` (if installed) and evaluates its
 * `<script>` module exports with the real `layoutProfile.js` module injected.
 */
async function loadDockWorkspaceSfcAndHelpers() {
  const sfcSource = fs.readFileSync(SFC_PATH, 'utf8');
  const layoutProfileMod = await loadLayoutProfileModule();

  let descriptor = null;
  let templateCompiled = null;
  {
    const require = createRequire(import.meta.url);
    const compilerSfc = require(COMPILER_SFC_PATH);
    const parsed = compilerSfc.parse(sfcSource, { filename: 'DockWorkspace.vue' });
    assert.equal(parsed.errors.length, 0, 'SFC parse must produce zero errors');
    descriptor = parsed.descriptor;

    assert.ok(descriptor.template, 'DockWorkspace.vue must have a <template> block');
    templateCompiled = compilerSfc.compileTemplate({
      source: descriptor.template.content,
      filename: 'DockWorkspace.vue',
      id: 'data-v-dockworkspace',
    });
    assert.equal(
      templateCompiled.errors.length,
      0,
      `Template compilation must succeed with zero errors: ${JSON.stringify(templateCompiled.errors)}`
    );
  }

  // Extract the normal <script> block (which exports pure JS helpers for node:test)
  const scriptContent = descriptor
    ? descriptor.script?.content
    : sfcSource.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(scriptContent, 'DockWorkspace.vue must contain a plain <script> block exporting pure helpers');

  // Inject layoutProfile module via globalThis so data: ESM import has zero cross-scheme file:// imports
  globalThis.__CAPSULE_UI_KIT_LAYOUT_PROFILE__ = layoutProfileMod;
  const rewrittenScript = scriptContent.replace(
    /import\s+\*\s+as\s+defaultLayoutProfileModule\s+from\s+['"]\.\/layoutProfile\.js['"];?/,
    'const defaultLayoutProfileModule = globalThis.__CAPSULE_UI_KIT_LAYOUT_PROFILE__;'
  );

  const dataUrl = `data:text/javascript;base64,${Buffer.from(rewrittenScript, 'utf8').toString('base64')}`;
  const helpers = await import(dataUrl);

  return {
    sfcSource,
    descriptor,
    templateCompiled,
    layoutProfileMod,
    helpers,
  };
}

/**
 * Creates a deterministic mock `DockviewApi` matching `dockview-core version 8.4.1` `component.api.d.ts`.
 */
function createMockDockviewApi() {
  /** @type {Record<string, Set<Function>>} */
  const listeners = {
    onDidAddPanel: new Set(),
    onDidRemovePanel: new Set(),
    onDidMovePanel: new Set(),
    onDidActivePanelChange: new Set(),
    onDidActiveGroupChange: new Set(),
    onDidAddGroup: new Set(),
    onDidRemoveGroup: new Set(),
    onDidLayoutFromJSON: new Set(),
    onDidLayoutChange: new Set(),
    onWillMutateLayout: new Set(),
    onDidMutateLayout: new Set(),
    onDidOpenPopoutWindowFail: new Set(),
    onWillClosePopoutWindow: new Set(),
    onDidMaximizedGroupChange: new Set(),
  };

  /**
   * @param {string} eventName
   */
  function makeEvent(eventName) {
    return (cb) => {
      listeners[eventName].add(cb);
      return {
        dispose() {
          listeners[eventName].delete(cb);
        },
      };
    };
  }

  /**
   * @param {string} eventName
   * @param {any} payload
   */
  function emit(eventName, payload) {
    for (const cb of listeners[eventName]) {
      cb(payload);
    }
  }

  /** @type {Map<string, any>} */
  const panels = new Map();
  /** @type {Map<string, any>} */
  const groups = new Map();
  /** @type {any[]} */
  const floatingGroups = [];
  /** @type {any[]} */
  const callLog = [];

  let width = 1280;
  let height = 720;
  let activePanel = undefined;
  let activeGroup = undefined;
  /** @type {any} */
  let lastSerialized = null;
  let resolvePopoutRestore = () => {};
  const popoutRestorationPromise = new Promise((resolve) => {
    resolvePopoutRestore = resolve;
  });

  function ensureGroup(groupId) {
    if (!groups.has(groupId)) {
      const groupObj = {
        id: groupId,
        panels: [],
        activePanel: undefined,
        locked: false,
        size: 640,
        api: {
          location: { type: 'grid' },
          locked: false,
          moveTo(opts) {
            callLog.push({ method: 'group.api.moveTo', groupId, opts });
          },
          setVisible(visible) {
            callLog.push({ method: 'group.api.setVisible', groupId, visible });
          },
          maximize() {
            callLog.push({ method: 'group.api.maximize', groupId });
          },
          isMaximized() {
            return false;
          },
          exitMaximized() {
            callLog.push({ method: 'group.api.exitMaximized', groupId });
          },
          close() {
            callLog.push({ method: 'group.api.close', groupId });
          },
        },
      };
      groups.set(groupId, groupObj);
    }
    return groups.get(groupId);
  }

  function makePanelObject(opts, groupObj) {
    const locationListeners = new Set();
    const visibilityListeners = new Set();
    const dimensionListeners = new Set();
    let currentGroup = groupObj;
    let currentRenderer = opts.renderer ?? 'onlyWhenVisible';
    let isVisible = true;
    let panelWidth = opts.initialWidth ?? 640;
    let panelHeight = opts.initialHeight ?? 480;
    let params = { ...(opts.params ?? {}) };

    const panelObj = {
      id: opts.id,
      title: opts.title ?? opts.id,
      get group() {
        return currentGroup;
      },
      set group(nextGrp) {
        currentGroup = nextGrp;
      },
      get params() {
        return params;
      },
      api: {
        id: opts.id,
        component: opts.component,
        get renderer() {
          return currentRenderer;
        },
        get isVisible() {
          return isVisible;
        },
        get width() {
          return panelWidth;
        },
        get height() {
          return panelHeight;
        },
        get location() {
          return currentGroup?.api?.location ?? { type: 'grid' };
        },
        onDidLocationChange: (cb) => {
          locationListeners.add(cb);
          return { dispose: () => locationListeners.delete(cb) };
        },
        onDidVisibilityChange: (cb) => {
          visibilityListeners.add(cb);
          return { dispose: () => visibilityListeners.delete(cb) };
        },
        onDidDimensionsChange: (cb) => {
          dimensionListeners.add(cb);
          return { dispose: () => dimensionListeners.delete(cb) };
        },
        setRenderer(r) {
          currentRenderer = r;
          callLog.push({ method: 'panel.api.setRenderer', id: opts.id, renderer: r });
        },
        setSize(sizeEvt) {
          if (typeof sizeEvt.width === 'number') panelWidth = sizeEvt.width;
          if (typeof sizeEvt.height === 'number') panelHeight = sizeEvt.height;
          callLog.push({ method: 'panel.api.setSize', id: opts.id, sizeEvt });
          for (const cb of dimensionListeners) {
            cb({ width: panelWidth, height: panelHeight });
          }
        },
        setConstraints(constraints) {
          callLog.push({ method: 'panel.api.setConstraints', id: opts.id, constraints });
        },
        updateParameters(nextParams) {
          params = { ...params, ...nextParams };
          callLog.push({ method: 'panel.api.updateParameters', id: opts.id, nextParams });
        },
        moveTo(moveParams) {
          callLog.push({ method: 'panel.api.moveTo', id: opts.id, moveParams });
          const fromGroup = currentGroup;
          const toGroup = moveParams.group ?? ensureGroup('group-moved-target');
          // Simulate Dockview's documented behavior: onDidRemovePanel and onDidAddPanel
          // may fire during panel movement across groups (component.api.d.ts:397-404).
          emit('onWillMutateLayout', { kind: 'move', origin: 'user' });
          emit('onDidRemovePanel', panelObj);
          currentGroup = toGroup;
          emit('onDidAddPanel', panelObj);
          emit('onDidMovePanel', { panel: panelObj, from: fromGroup, to: toGroup });
          emit('onDidMutateLayout', { kind: 'move', origin: 'user' });
          emit('onDidLayoutChange', undefined);
        },
        close() {
          callLog.push({ method: 'panel.api.close', id: opts.id });
          emit('onWillMutateLayout', { kind: 'remove', origin: 'user' });
          panels.delete(opts.id);
          emit('onDidRemovePanel', panelObj);
          emit('onDidMutateLayout', { kind: 'remove', origin: 'user' });
          emit('onDidLayoutChange', undefined);
        },
        setActive() {
          activePanel = panelObj;
          callLog.push({ method: 'panel.api.setActive', id: opts.id });
          emit('onDidActivePanelChange', { panel: panelObj, origin: 'user' });
        },
      },
      _setVisibleForTest(v) {
        isVisible = v;
        for (const cb of visibilityListeners) cb({ isVisible: v });
      },
    };
    return panelObj;
  }

  const api = {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get activePanel() {
      return activePanel;
    },
    get activeGroup() {
      return activeGroup;
    },
    get popoutRestorationPromise() {
      return popoutRestorationPromise;
    },
    onDidAddPanel: makeEvent('onDidAddPanel'),
    onDidRemovePanel: makeEvent('onDidRemovePanel'),
    onDidMovePanel: makeEvent('onDidMovePanel'),
    onDidActivePanelChange: makeEvent('onDidActivePanelChange'),
    onDidActiveGroupChange: makeEvent('onDidActiveGroupChange'),
    onDidAddGroup: makeEvent('onDidAddGroup'),
    onDidRemoveGroup: makeEvent('onDidRemoveGroup'),
    onDidLayoutFromJSON: makeEvent('onDidLayoutFromJSON'),
    onDidLayoutChange: makeEvent('onDidLayoutChange'),
    onWillMutateLayout: makeEvent('onWillMutateLayout'),
    onDidMutateLayout: makeEvent('onDidMutateLayout'),
    onDidOpenPopoutWindowFail: makeEvent('onDidOpenPopoutWindowFail'),
    onWillClosePopoutWindow: makeEvent('onWillClosePopoutWindow'),
    onDidMaximizedGroupChange: makeEvent('onDidMaximizedGroupChange'),

    getPanel(id) {
      return panels.get(id);
    },
    getGroup(id) {
      return groups.get(id);
    },
    addGroup(opts = {}) {
      const grp = ensureGroup(opts.id ?? `group-${groups.size + 1}`);
      callLog.push({ method: 'api.addGroup', opts });
      emit('onDidAddGroup', grp);
      return grp;
    },
    addPanel(opts) {
      callLog.push({ method: 'api.addPanel', opts });
      const grp = ensureGroup('group-main-wall');
      const p = makePanelObject(opts, grp);
      panels.set(opts.id, p);
      grp.panels.push(p);
      activePanel = p;
      activeGroup = grp;
      emit('onDidAddPanel', p);
      return p;
    },
    removePanel(panel) {
      callLog.push({ method: 'api.removePanel', id: panel.id });
      panels.delete(panel.id);
      emit('onDidRemovePanel', panel);
    },
    addFloatingGroup(item, opts = {}) {
      callLog.push({ method: 'api.addFloatingGroup', id: item.id, opts });
      emit('onWillMutateLayout', { kind: 'float', origin: 'user' });
      const floatGrp = ensureGroup(`float-${item.id}`);
      floatGrp.api.location = { type: 'floating' };
      if (panels.has(item.id)) {
        // Simulate Dockview reparenting into floating group
        emit('onDidRemovePanel', item);
        item.group = floatGrp;
        emit('onDidAddPanel', item);
      }
      floatingGroups.push({ group: floatGrp, position: opts });
      emit('onDidMutateLayout', { kind: 'float', origin: 'user' });
      emit('onDidLayoutChange', undefined);
    },
    layout(w, h, force = false) {
      width = w;
      height = h;
      callLog.push({ method: 'api.layout', width: w, height: h, force });
    },
    activateNext(opts) {
      callLog.push({ method: 'api.activateNext', opts });
    },
    activatePrevious(opts) {
      callLog.push({ method: 'api.activatePrevious', opts });
    },
    moveToNext() {
      callLog.push({ method: 'DEPRECATED_moveToNext' });
      throw new Error('Deprecated moveToNext must never be called');
    },
    moveToPrevious() {
      callLog.push({ method: 'DEPRECATED_moveToPrevious' });
      throw new Error('Deprecated moveToPrevious must never be called');
    },
    fromJSON(data, options) {
      callLog.push({ method: 'api.fromJSON', data, options });
      lastSerialized = JSON.parse(JSON.stringify(data));
      panels.clear();
      groups.clear();
      emit('onWillMutateLayout', { kind: 'load', origin: 'api' });
      const grp = ensureGroup(data.activeGroup ?? 'group-main-wall');
      activeGroup = grp;
      for (const [pid, pState] of Object.entries(data.panels ?? {})) {
        const p = makePanelObject(
          {
            id: pid,
            title: pState.title ?? pid,
            component: pState.contentComponent ?? 'CapsulePanel',
            renderer: pState.renderer ?? 'onlyWhenVisible',
            params: pState.params ?? {},
          },
          grp
        );
        panels.set(pid, p);
        grp.panels.push(p);
      }
      emit('onDidLayoutFromJSON', undefined);
      emit('onDidMutateLayout', { kind: 'load', origin: 'api' });
    },
    toJSON() {
      callLog.push({ method: 'api.toJSON' });
      if (lastSerialized) {
        return JSON.parse(JSON.stringify(lastSerialized));
      }
      return {
        grid: {
          root: {
            type: 'leaf',
            size: 1280,
            visible: true,
            data: {
              id: 'group-main-wall',
              views: Array.from(panels.keys()),
              activeView: Array.from(panels.keys())[0],
            },
          },
          width,
          height,
          orientation: 'HORIZONTAL',
        },
        panels: Object.fromEntries(
          Array.from(panels.entries()).map(([id, p]) => [
            id,
            {
              id,
              contentComponent: p.api.component,
              title: p.title,
              renderer: p.api.renderer,
              params: p.params,
            },
          ])
        ),
        activeGroup: 'group-main-wall',
      };
    },
    _emit(eventName, payload) {
      emit(eventName, payload);
    },
    _resolvePopoutRestore() {
      resolvePopoutRestore();
    },
    _callLog: callLog,
    _panels: panels,
    _groups: groups,
  };

  return api;
}

test('Dock host unit — DockWorkspace.vue', async (t) => {
  const { sfcSource, descriptor, templateCompiled, layoutProfileMod, helpers } =
    await loadDockWorkspaceSfcAndHelpers();

  await t.test(
    '1. SFC compilation & template smoke test: plain JS + JSDoc, no TypeScript, no consumer imports, and §9 actionable attributes',
    () => {
      assert.ok(descriptor, '@vue/compiler-sfc must parse DockWorkspace.vue');
      assert.ok(descriptor.scriptSetup, 'DockWorkspace.vue must use <script setup>');
      assert.equal(
        descriptor.scriptSetup.lang,
        undefined,
        '<script setup> must not use lang="ts"'
      );
      assert.equal(descriptor.script?.lang, undefined, '<script> must not use lang="ts"');

      // Verify no consumer imports anywhere in the file
      assert.doesNotMatch(
        sfcSource,
        /\u0048oldings|h3-app-root|h3-app-route/i,
        'DockWorkspace.vue must contain zero consumer imports or symbols'
      );

      // Verify Dockview CSS import and DockviewVue usage
      assert.match(
        sfcSource,
        /dockview-vue\/dist\/styles\/dockview\.css/,
        'DockWorkspace.vue must import dockview-vue/dist/styles/dockview.css'
      );
      assert.match(sfcSource, /DockviewVue/, 'DockWorkspace.vue must render <DockviewVue>');

      // Verify every <button> and separator in template carries stable id, role, and aria-label
      const templateHtml = descriptor.template.content;
      const buttonMatches = [...templateHtml.matchAll(/<button\b([^>]*)>/g)];
      assert.ok(buttonMatches.length >= 3, 'Template must contain actionable buttons');
      for (const [, attrs] of buttonMatches) {
        assert.match(attrs, /\bid=/, `Every <button> must have a stable id: ${attrs}`);
        assert.match(attrs, /\brole="button"/, `Every <button> must have role="button": ${attrs}`);
        assert.match(
          attrs,
          /(?::aria-label|aria-label)=/,
          `Every <button> must have an accessible name via aria-label: ${attrs}`
        );
      }

      assert.match(
        templateHtml,
        /role="separator"/,
        'Template must include a keyboard-operable workspace separator with role="separator"'
      );
      assert.ok(
        templateCompiled && templateCompiled.code.length > 100,
        'Template must compile cleanly for runtime-only Vite execution'
      );
    }
  );

  await t.test(
    '2. Closed panel registry, shared DockviewTheme adapter, and exact Dockview 8.4.1 AddPanelOptions validation',
    () => {
      const {
        DOCK_PANEL_REGISTRY_TYPES,
        createPanelRegistry,
        createSharedDockviewTheme,
        buildAddPanelOptions,
      } = helpers;

      // Verify all substantive panel types from UI_ARCHITECTURE.md §3
      for (const expectedType of [
        'CapsulePanel',
        'FleetPanel',
        'InspectorPanel',
        'AlertBoard',
        'TimelinePanel',
        'HelpSettingsPanel',
        'MissingPanel',
      ]) {
        assert.ok(
          DOCK_PANEL_REGISTRY_TYPES.includes(expectedType),
          `Registry must include ${expectedType}`
        );
      }

      const registry = createPanelRegistry({
        CapsulePanel: { name: 'CapsulePanelStub' },
        MissingPanel: { name: 'MissingPanelStub' },
      });
      assert.equal(registry.resolveComponentName('CapsulePanel'), 'CapsulePanel');
      assert.equal(DOCK_PANEL_REGISTRY_TYPES.includes('OrchestratorDrawer'), false);
      assert.equal(registry.resolveComponentName('OrchestratorDrawer'), 'MissingPanel', 'Retired drawer cannot instantiate in the active registry');
      assert.equal(
        registry.resolveComponentName('RetiredLegacyGraph'),
        'MissingPanel',
        'Unknown or retired component types must resolve to MissingPanel'
      );

      // Shared theme adapter (UI_ARCHITECTURE.md §8, ar_p_dockview §9.1)
      const darkTheme = createSharedDockviewTheme({
        colorScheme: 'dark',
        density: 'compact',
      });
      assert.equal(darkTheme.name, 'mv-shared');
      assert.equal(darkTheme.className, 'mv-dockview-theme');
      assert.equal(darkTheme.colorScheme, 'dark');
      assert.equal(typeof darkTheme.gap, 'number');
      assert.equal(darkTheme.dndOverlayMounting, 'relative');
      assert.equal(darkTheme.dndPanelOverlay, 'content');
      assert.equal(darkTheme.dndTabIndicator, 'line');
      assert.ok(Object.isFrozen(darkTheme), 'Theme object must be frozen');

      // Live CapsulePanel defaults to renderer: 'always' (UI_ARCHITECTURE.md §6 line 197, ar_p_dockview §8.2)
      const capsuleAddOpts = buildAddPanelOptions({
        id: 'panel-cap-1',
        component: 'CapsulePanel',
        title: 'Primary Capsule',
        params: { capsuleId: 'cap-1', slotFolded: false },
        position: { direction: 'right', referenceGroup: 'group-main-wall' },
        minimumWidth: 320,
        minimumHeight: 240,
      });
      assert.equal(capsuleAddOpts.ok, true);
      assert.equal(capsuleAddOpts.options.renderer, 'always');
      assert.equal(capsuleAddOpts.options.component, 'CapsulePanel');
      assert.deepEqual(capsuleAddOpts.options.position, {
        direction: 'right',
        referenceGroup: 'group-main-wall',
      });

      // Rejects numeric list-length IDs and forbidden sensitive params
      const badNumericId = buildAddPanelOptions({
        id: '0',
        component: 'CapsulePanel',
      });
      assert.equal(badNumericId.ok, false);
      assert.equal(badNumericId.code, 'ERR_INVALID_PANEL_ID');

      const badForbiddenParam = buildAddPanelOptions({
        id: 'panel-cap-2',
        component: 'CapsulePanel',
        params: { capsuleId: 'cap-2', credentials: 'secret-token' },
      });
      assert.equal(badForbiddenParam.ok, false);
      assert.equal(badForbiddenParam.code, 'FORBIDDEN_DATA');
    }
  );

  await t.test(
    '3. Migration + Restore barrier pipeline: v1->v2 migration, MissingPanel replacement, veil gate, and gesture save after settle',
    async () => {
      const { createDockWorkspaceHost } = helpers;
      const mockApi = createMockDockviewApi();

      /** @type {string[]} */
      const savedPayloads = [];
      // v1 profile containing a retired panel type `LegacyChartPanel` and v1 shell keys
      const rawV1Profile = JSON.stringify({
        format: 'capsule-ui-kit.layout-profile',
        schemaVersion: 1,
        scope: {
          product: 'sample-host',
          profileId: 'operator-default',
          workspaceId: 'ws-main',
        },
        sharedKitVersion: '0.1.0',
        dockviewVersion: '8.4.1',
        panelRegistryVersion: 1,
        shell: {
          railCollapsed: false,
          leftRailSize: 240,
          rightRailSize: 280,
          drawerState: 'collapsed',
          drawerSize: 260,
          selectedPresentation: 'standard',
        },
        dockview: {
          grid: {
            root: {
              type: 'leaf',
              size: 1280,
              visible: true,
              data: {
                id: 'group-main-wall',
                views: ['panel-cap-alpha', 'panel-retired-chart'],
                activeView: 'panel-cap-alpha',
              },
            },
            width: 1280,
            height: 720,
            orientation: 'HORIZONTAL',
          },
          panels: {
            'panel-cap-alpha': {
              id: 'panel-cap-alpha',
              component: 'CapsulePanel',
              title: 'Alpha Surface',
              renderer: 'always',
              params: { capsuleId: 'cap-alpha', slotFolded: false },
            },
            'panel-retired-chart': {
              id: 'panel-retired-chart',
              component: 'LegacyChartPanel',
              title: 'Old Chart',
              renderer: 'onlyWhenVisible',
              params: { queryId: 'owner/share_price' },
            },
          },
          activeGroup: 'group-main-wall',
        },
      });

      const host = createDockWorkspaceHost({
        scope: {
          product: 'sample-host',
          profileId: 'operator-default',
          workspaceId: 'ws-main',
        },
        ownerWindowId: 'win-main-1',
        storage: {
          async readRaw() {
            return rawV1Profile;
          },
          async writeAtomic(payload) {
            savedPayloads.push(payload);
          },
        },
      });

      // Attach DockviewApi and start cold restore
      host.attachDockviewApi(mockApi);
      const restoreRes = await host.restoreWorkspaceLayout();

      assert.equal(restoreRes.status, 'restored');
      assert.deepEqual(restoreRes.migratedFromVersions, ['1->2']);
      assert.deepEqual(restoreRes.replacedPanels, ['panel-retired-chart']);

      // Verify retired type was replaced with MissingPanel while preserving ID and structural reference
      const restoredRetiredPanel = mockApi.getPanel('panel-retired-chart');
      assert.ok(restoredRetiredPanel, 'Retired panel ID must be preserved in Dockview');
      assert.equal(restoredRetiredPanel.api.component, 'MissingPanel');
      assert.equal(restoredRetiredPanel.params.originalPanelType, 'LegacyChartPanel');

      // Before barrier conditions settle, wallRevealed must be false (veil covers workspace)
      // and saveOnGesture must be refused!
      assert.equal(host.getState().wallRevealed, false);
      const prematureSave = await host.flushPendingGestureSave();
      assert.equal(prematureSave.ok, false);
      assert.equal(prematureSave.code, 'RESTORE_NOT_SETTLED');
      assert.equal(savedPayloads.length, 0);

      // Complete remaining restore barrier gates: popouts, visible panels, fonts, viewport
      mockApi._resolvePopoutRestore();
      await mockApi.popoutRestorationPromise;
      host.markBarrierCondition('popoutsRestored', true);
      host.markBarrierCondition('visiblePanelsReady', true);
      host.markBarrierCondition('fontsReady', true);
      host.setViewportDimensions(1280, 800); // Steam Deck 1280x800 matrix

      const settledState = host.getState();
      assert.equal(settledState.wallRevealed, true, 'Wall must reveal once all barrier gates settle');
      assert.equal(settledState.restorePhase, 'settled');
      assert.equal(settledState.saveOnGestureEnabled, true);

      // Programmatic ('api') layout mutation must NOT trigger gesture save
      mockApi._emit('onWillMutateLayout', { kind: 'move', origin: 'api' });
      mockApi._emit('onDidMutateLayout', { kind: 'move', origin: 'api' });
      mockApi._emit('onDidLayoutChange', undefined);
      assert.equal(savedPayloads.length, 0, 'API-origin layout changes must not auto-save');

      // User gesture ('user') layout mutation triggers atomic save after gesture completion
      mockApi._emit('onWillMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidLayoutChange', undefined);
      const gestureSaveRes = await host.flushPendingGestureSave();
      assert.equal(gestureSaveRes.ok, true);
      assert.equal(savedPayloads.length, 1);
    }
  );

  await t.test(
    '4. NEGATIVE CONTRAST (binding): panel move, tab switch, float, dock-back, close, or Dockview remove/add callbacks CANNOT destroy capsule or instantiate a retired drawer',
    async () => {
      const { createDockWorkspaceHost } = helpers;
      const mockApi = createMockDockviewApi();

      /** @type {string[]} */
      const backendDestroyCalls = [];

      // Attempting to construct DockWorkspaceHost with a capsule destruction callback must refuse
      assert.throws(
        () =>
          createDockWorkspaceHost({
            scope: { product: 'consumer', profileId: 'p1', workspaceId: 'w1' },
            ownerWindowId: 'win-1',
            storage: { async readRaw() { return null; }, async writeAtomic() {} },
            // @ts-expect-error testing forbidden authority injection
            onDestroyCapsule: (id) => backendDestroyCalls.push(id),
          }),
        (err) => err && err.code === 'ERR_DOCKHOST_FORBIDS_CAPSULE_DESTROY',
        'DockWorkspace must refuse any capsule destruction callback authority'
      );

      const host = createDockWorkspaceHost({
        scope: { product: 'consumer', profileId: 'p1', workspaceId: 'w1' },
        ownerWindowId: 'win-1',
        storage: {
          async readRaw() {
            return null;
          },
          async writeAtomic() {},
        },
      });

      host.attachDockviewApi(mockApi);
      await host.restoreWorkspaceLayout();
      mockApi._resolvePopoutRestore();
      host.markBarrierCondition('popoutsRestored', true);
      host.markBarrierCondition('visiblePanelsReady', true);
      host.markBarrierCondition('fontsReady', true);
      host.setViewportDimensions(1280, 720);

      // Register authoritative core capsule projection (cap-alpha) with live terminal & capture lease
      host.trackCapsuleBinding({
        panelId: 'panel-capsule-primary',
        capsuleId: 'cap-alpha',
        epoch: 7,
        generation: 3,
        lifecycle: 'active',
        terminalSessionId: 'term-session-1',
        captureLeaseId: 'capture-lease-99',
      });

      // 1. Move panel across groups (triggers Dockview onDidRemovePanel + onDidAddPanel + onDidMovePanel)
      const moveRes = host.movePanel('panel-capsule-primary', {
        targetGroupId: 'group-inspector',
        position: 'right',
        index: 0,
      });
      assert.equal(moveRes.ok, true);

      // 2. Float panel into floating group (triggers another reparenting remove+add cycle)
      const floatRes = host.floatPanel('panel-capsule-primary', {
        x: 100,
        y: 80,
        width: 700,
        height: 500,
      });
      assert.equal(floatRes.ok, true);

      // 3. Dock floating panel back into the wall grid
      const dockBackRes = host.dockBackPanel('panel-capsule-primary', {
        targetGroupId: 'group-main-wall',
        position: 'center',
      });
      assert.equal(dockBackRes.ok, true);

      // 4. Close panel in presentation (triggers panel.api.close() -> onDidRemovePanel)
      const closePresRes = host.closePanelPresentation('panel-capsule-primary');
      assert.equal(closePresRes.ok, true);
      assert.equal(closePresRes.capsuleDestroyed, false);

      // Verify capsule binding is still intact in core tracking and was NEVER destroyed!
      const bindingAfterMoves = host.getCapsuleBinding('cap-alpha');
      assert.ok(bindingAfterMoves, 'Capsule binding must survive panel move, float, dock-back, and presentation close');
      assert.equal(bindingAfterMoves.capsuleId, 'cap-alpha');
      assert.equal(bindingAfterMoves.epoch, 7);
      assert.equal(bindingAfterMoves.generation, 3);
      assert.equal(bindingAfterMoves.lifecycle, 'active');
      assert.equal(bindingAfterMoves.terminalSessionId, 'term-session-1');
      assert.equal(bindingAfterMoves.captureLeaseId, 'capture-lease-99');
      assert.equal(bindingAfterMoves.destroyedByPresentation, false);
      assert.equal(backendDestroyCalls.length, 0);
      assert.equal(host.getState().capsuleDestroyAttemptsBlocked, 0);

      // 5. Explicit attempt to call forbidden destroyCapsuleFromWorkspace must refuse
      const forbiddenDestroy = host.attemptDestroyCapsuleFromWorkspace('cap-alpha');
      assert.equal(forbiddenDestroy.ok, false);
      assert.equal(forbiddenDestroy.code, 'ERR_DOCKHOST_FORBIDS_CAPSULE_DESTROY');
      assert.equal(host.getState().capsuleDestroyAttemptsBlocked, 1);

      // 6. Retired drawer references restore as inert placeholders. Neither
      // reference may create a composer or dispatch owner in the current host.
      const addDrawer1 = host.mountPanel({
        id: 'panel-orchestrator-drawer',
        component: 'OrchestratorDrawer',
        title: 'Orchestrator',
        params: { viewMode: 'expanded' },
      });
      assert.equal(addDrawer1.ok, true);

      const addDrawer2 = host.mountPanel({
        id: 'panel-orchestrator-drawer-duplicate',
        component: 'OrchestratorDrawer',
        title: 'Orchestrator Copy',
      });
      assert.equal(addDrawer2.ok, true);
      for (const id of ['panel-orchestrator-drawer', 'panel-orchestrator-drawer-duplicate']) {
        assert.equal(mockApi.getPanel(id).api.component, 'MissingPanel', 'Retired references must never instantiate a drawer or dispatch owner');
      }
      assert.equal(backendDestroyCalls.length, 0, 'Retirement never acquires capsule destruction authority');
    }
  );

  await t.test(
    '5. Read-only quarantine on future/corrupt schema, R2 popout failure guard, keyboard navigation, and §9 semantic boxes',
    async () => {
      const { createDockWorkspaceHost } = helpers;
      const mockApi = createMockDockviewApi();

      /** @type {string[]} */
      const diskWrites = [];
      const futureSchemaJson = JSON.stringify({
        format: 'capsule-ui-kit.layout-profile',
        schemaVersion: 99,
        scope: { product: 'consumer', profileId: 'p1', workspaceId: 'w1' },
      });

      const host = createDockWorkspaceHost({
        scope: { product: 'consumer', profileId: 'p1', workspaceId: 'w1' },
        ownerWindowId: 'win-main',
        storage: {
          async readRaw() {
            return futureSchemaJson;
          },
          async writeAtomic(payload) {
            diskWrites.push(payload);
          },
        },
      });

      host.attachDockviewApi(mockApi);
      const restoreQuarantined = await host.restoreWorkspaceLayout();
      assert.equal(restoreQuarantined.status, 'quarantined-safe-fallback');
      assert.equal(restoreQuarantined.readOnly, true);
      assert.equal(restoreQuarantined.errorCode, 'FUTURE_SCHEMA');

      // Settle barrier so safe fallback wall reveals with quarantine alert banner
      mockApi._resolvePopoutRestore();
      host.markBarrierCondition('popoutsRestored', true);
      host.markBarrierCondition('visiblePanelsReady', true);
      host.markBarrierCondition('fontsReady', true);
      host.setViewportDimensions(1280, 720);

      assert.equal(host.getState().wallRevealed, true);
      assert.equal(host.getState().isReadOnlyQuarantine, true);

      // Gesture save must be refused while in quarantine
      mockApi._emit('onWillMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidLayoutChange', undefined);
      const quarantineSave = await host.flushPendingGestureSave();
      assert.equal(quarantineSave.ok, false);
      assert.equal(quarantineSave.code, 'READ_ONLY_QUARANTINE');
      assert.equal(diskWrites.length, 0, 'Untouched future-schema profile must not be overwritten');

      // Explicit operator recovery clears quarantine and writes safe layout
      const recoverRes = await host.recoverLayoutExplicitly();
      assert.equal(recoverRes.ok, true);
      assert.equal(host.getState().isReadOnlyQuarantine, false);
      assert.equal(diskWrites.length, 1);

      // R2 Popout guard: direct UI popout request is disabled with explicit R2 reason
      const popoutAttempt = host.requestPanelPopout('panel-capsule-primary');
      assert.equal(popoutAttempt.ok, false);
      assert.equal(popoutAttempt.code, 'POPOUT_BLOCKED_BY_R2_POLICY');
      assert.match(popoutAttempt.reason, /R2/);

      // When Dockview emits onDidOpenPopoutWindowFail during restore/runtime, fallback activates
      // and blocks overwriting saved wall placements
      mockApi._emit('onDidOpenPopoutWindowFail', { reason: 'blocked' });
      assert.equal(host.getState().isPopoutFallbackActive, true);
      assert.equal(host.getState().lastPopoutFailureReason, 'blocked');

      mockApi._emit('onWillMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidMutateLayout', { kind: 'move', origin: 'user' });
      mockApi._emit('onDidLayoutChange', undefined);
      const fallbackSave = await host.flushPendingGestureSave();
      assert.equal(fallbackSave.ok, false);
      assert.equal(fallbackSave.code, 'POPOUT_FALLBACK_NO_OVERWRITE');

      // Keyboard navigation: F6 / Shift+F6 calls activateNext / activatePrevious, never deprecated moveToNext,
      // and ignores keystrokes originating from a terminal input target (UI_ARCHITECTURE.md §7)
      const termKeyIgnored = host.handleWorkspaceKeydown({
        key: 'F6',
        shiftKey: false,
        isTerminalTarget: true,
      });
      assert.equal(termKeyIgnored.handled, false);

      const f6Handled = host.handleWorkspaceKeydown({
        key: 'F6',
        shiftKey: false,
        isTerminalTarget: false,
      });
      assert.equal(f6Handled.handled, true);
      assert.equal(f6Handled.action, 'focus-next-group');
      assert.ok(
        mockApi._callLog.some((entry) => entry.method === 'api.activateNext'),
        'F6 must invoke DockviewApi.activateNext()'
      );

      // §9 Semantic control descriptors: visible vs hidden/veil boxes
      const controlsVisible = host.buildWorkspaceSemanticControls({
        windowId: 'win-main',
        epoch: 10,
      });
      const sepControl = controlsVisible.find(
        (c) => c.semanticAnchor === 'workspace/separator/main-wall'
      );
      assert.ok(sepControl, 'Must export workspace/separator/{id} control');
      assert.equal(sepControl.role, 'separator');
      assert.ok(sepControl.box !== null, 'Visible separator must have a rounded CSS pixel box');

      const popoutControl = controlsVisible.find(
        (c) => c.semanticAnchor === 'capsule/panel-capsule-primary/popout'
      );
      assert.ok(popoutControl, 'Must export capsule/{id}/popout control');
      assert.equal(popoutControl.state.disabled, true);
      assert.match(String(popoutControl.state.unavailableReason), /R2/);
    }
  );
});
