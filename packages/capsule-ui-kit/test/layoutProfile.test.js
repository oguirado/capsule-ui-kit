import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_LAYOUT_SCHEMA_VERSION,
  MISSING_PANEL_TYPE,
  PINNED_VERSIONS,
  createDefaultLayoutProfile,
  decodeAndMigrateLayoutProfile,
  serializeLayoutProfile,
  resolvePopoutFallbackView,
  createLayoutProfileController,
} from '../src/workspace/layoutProfile.js';

const TEST_SCOPE = Object.freeze({
  product: 'consumer',
  profileId: 'operator-default',
  workspaceId: 'desk-main',
});

/**
 * Pinned v2 serialization fixture with main grid, floatingGroup (`data`), and
 * popoutGroup (nested `grid`) matching `dockview-core version 8.4.1` `SerializedDockview`.
 */
const PINNED_V2_FIXTURE = Object.freeze({
  format: 'capsule-ui-kit.layout-profile',
  schemaVersion: 2,
  scope: {
    product: 'consumer',
    profileId: 'operator-default',
    workspaceId: 'desk-main',
  },
  sharedKitVersion: PINNED_VERSIONS.sharedKitVersion,
  dockviewVersion: PINNED_VERSIONS.dockviewVersion,
  panelRegistryVersion: PINNED_VERSIONS.panelRegistryVersion,
  shell: {
    leftRailMode: 'expanded',
    leftRailSize: 240,
    rightRailMode: 'collapsed',
    rightRailSize: 280,
    drawerMode: 'expanded',
    drawerExpandedHeight: 300,
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
            size: 900,
            visible: true,
            data: {
              id: 'group-wall',
              views: ['panel-cap-1'],
              activeView: 'panel-cap-1',
            },
          },
          {
            type: 'leaf',
            size: 380,
            visible: true,
            data: {
              id: 'group-side',
              views: ['panel-insp-1'],
              activeView: 'panel-insp-1',
            },
          },
        ],
      },
      width: 1280,
      height: 720,
      orientation: 'HORIZONTAL',
    },
    floatingGroups: [
      {
        data: {
          id: 'group-float-1',
          views: ['panel-alerts-1'],
          activeView: 'panel-alerts-1',
        },
        position: { x: 80, y: 60, width: 420, height: 260 },
      },
    ],
    popoutGroups: [
      {
        grid: {
          root: {
            type: 'leaf',
            size: 800,
            visible: true,
            data: {
              id: 'group-popout-1',
              views: ['panel-timeline-1'],
              activeView: 'panel-timeline-1',
            },
          },
          width: 800,
          height: 600,
          orientation: 'VERTICAL',
        },
        gridReferenceGroup: 'group-wall',
        position: { x: 100, y: 100, width: 800, height: 600 },
      },
    ],
    panels: {
      'panel-cap-1': {
        id: 'panel-cap-1',
        contentComponent: 'CapsulePanel',
        title: 'Production Line',
        renderer: 'always',
        params: {
          capsuleId: 'cap-prod-01',
          routeId: 'h3-nav-production',
          slotFolded: false,
        },
      },
      'panel-insp-1': {
        id: 'panel-insp-1',
        contentComponent: 'InspectorPanel',
        title: 'Inspector',
        renderer: 'onlyWhenVisible',
        params: {
          inspectorSection: 'provenance',
        },
      },
      'panel-alerts-1': {
        id: 'panel-alerts-1',
        contentComponent: 'AlertBoard',
        title: 'Alerts',
        renderer: 'onlyWhenVisible',
        params: {},
      },
      'panel-timeline-1': {
        id: 'panel-timeline-1',
        contentComponent: 'TimelinePanel',
        title: 'Timeline',
        renderer: 'onlyWhenVisible',
        params: {},
      },
    },
    activeGroup: 'group-wall',
  },
  savedWallPlacements: {
    'panel-cap-1': { groupId: 'group-wall', index: 0 },
    'panel-timeline-1': { groupId: 'group-wall', index: 1 },
  },
});

/**
 * Pinned v1 fixture with legacy shell fields (`railCollapsed`, `drawerState`, `drawerSize`),
 * legacy `component` key on panels, and a retired panel type (`LegacyXpMonitorPanel`).
 */
const PINNED_V1_WITH_RETIRED_PANEL_FIXTURE = Object.freeze({
  format: 'capsule-ui-kit.layout-profile',
  schemaVersion: 1,
  scope: {
    product: 'consumer',
    profileId: 'operator-default',
    workspaceId: 'desk-main',
  },
  sharedKitVersion: '0.0.9',
  dockviewVersion: '8.4.1',
  panelRegistryVersion: 1,
  shell: {
    railCollapsed: true,
    leftRailSize: 220,
    rightRailSize: 260,
    drawerState: 'maximized',
    drawerSize: 340,
    selectedPresentation: 'fullscreen',
  },
  dockview: {
    grid: {
      root: {
        type: 'leaf',
        size: 1280,
        visible: true,
        data: {
          id: 'group-v1-root',
          views: ['panel-cap-main', 'panel-retired-xpra'],
          activeView: 'panel-retired-xpra',
        },
      },
      width: 1280,
      height: 800,
      orientation: 'HORIZONTAL',
    },
    panels: {
      'panel-cap-main': {
        id: 'panel-cap-main',
        component: 'CapsulePanel',
        title: 'Main Capsule',
        params: {
          capsuleId: 'cap-01',
        },
      },
      'panel-retired-xpra': {
        id: 'panel-retired-xpra',
        component: 'LegacyXpMonitorPanel',
        title: 'Old Xpra View',
        params: {
          surfaceId: 'surf-legacy-9',
        },
      },
    },
    activeGroup: 'group-v1-root',
  },
});

/**
 * Helper to create an in-memory mock storage boundary that tracks all reads and atomic writes.
 * @param {string | null} initialRaw
 */
function createMockStorage(initialRaw = null) {
  let storedRaw = initialRaw;
  let readCount = 0;
  let writeCount = 0;
  /** @type {Array<{ payload: string, meta: unknown }>} */
  const writes = [];

  return {
    getStoredRaw: () => storedRaw,
    getReadCount: () => readCount,
    getWriteCount: () => writeCount,
    getWrites: () => writes,
    storage: {
      async readRaw() {
        readCount += 1;
        return storedRaw;
      },
      async writeAtomic(payload, meta) {
        writeCount += 1;
        storedRaw = payload;
        writes.push({ payload, meta });
      },
    },
  };
}

describe('Layout migration unit — layoutProfile.js', () => {
  describe('Positive cases: pinned serialization fixtures, migration, MissingPanel, and restore pipeline', () => {
    it('round-trips the pinned v2 fixture deterministically with floating and nested popout groups', () => {
      const ser1 = serializeLayoutProfile(PINNED_V2_FIXTURE);
      assert.equal(ser1.ok, true);
      if (!ser1.ok) return;

      const decoded = decodeAndMigrateLayoutProfile(ser1.json, {
        expectedScope: TEST_SCOPE,
      });
      assert.equal(decoded.ok, true);
      if (!decoded.ok) return;

      assert.equal(decoded.profile.schemaVersion, CURRENT_LAYOUT_SCHEMA_VERSION);
      assert.deepEqual(decoded.migratedFromVersions, []);
      assert.deepEqual(decoded.replacedPanels, []);
      assert.equal(decoded.profile.dockview.floatingGroups?.length, 1);
      assert.equal(decoded.profile.dockview.popoutGroups?.length, 1);
      assert.equal(
        decoded.profile.dockview.popoutGroups?.[0].grid?.orientation,
        'VERTICAL'
      );

      const ser2 = serializeLayoutProfile(decoded.profile);
      assert.equal(ser2.ok, true);
      if (!ser2.ok) return;
      assert.equal(ser2.json, ser1.json, 'Deterministic offline serialization must be byte-identical');
    });

    it('migrates v1 profile sequentially to v2 and replaces retired panel types with MissingPanel while preserving IDs and structural references', () => {
      const rawJson = JSON.stringify(PINNED_V1_WITH_RETIRED_PANEL_FIXTURE);
      const res = decodeAndMigrateLayoutProfile(rawJson, {
        expectedScope: TEST_SCOPE,
      });

      assert.equal(res.ok, true);
      if (!res.ok) return;

      assert.equal(res.profile.schemaVersion, 2);
      assert.deepEqual(res.migratedFromVersions, ['1->2']);
      assert.deepEqual(res.replacedPanels, ['panel-retired-xpra']);

      // Shell v1 -> v2 migration check
      assert.equal(res.profile.shell.leftRailMode, 'collapsed');
      assert.equal(res.profile.shell.rightRailMode, 'collapsed');
      assert.equal(res.profile.shell.drawerMode, 'maximized');
      assert.equal(res.profile.shell.drawerExpandedHeight, 340);
      assert.equal(res.profile.shell.selectedPresentation, 'fullscreen');

      // Structural group references preserved
      const rootLeaf = res.profile.dockview.grid.root;
      assert.equal(rootLeaf.type, 'leaf');
      if (rootLeaf.type === 'leaf' && !Array.isArray(rootLeaf.data)) {
        assert.deepEqual(rootLeaf.data.views, ['panel-cap-main', 'panel-retired-xpra']);
        assert.equal(rootLeaf.data.activeView, 'panel-retired-xpra');
      }

      // Retired panel replaced by MissingPanel with original metadata preserved in allowlisted params
      const replaced = res.profile.dockview.panels['panel-retired-xpra'];
      assert.equal(replaced.id, 'panel-retired-xpra');
      assert.equal(replaced.contentComponent, MISSING_PANEL_TYPE);
      assert.equal(replaced.params?.originalPanelType, 'LegacyXpMonitorPanel');
      assert.equal(replaced.params?.surfaceId, 'surf-legacy-9');
      assert.equal(replaced.params?.retiredAtSchemaVersion, 1);
      assert.equal(typeof replaced.params?.unavailableReason, 'string');
    });

    it('preserves intended saved wall placement when resolving in-memory popout fallback', () => {
      const decoded = decodeAndMigrateLayoutProfile(PINNED_V2_FIXTURE);
      assert.equal(decoded.ok, true);
      if (!decoded.ok) return;

      const fallback = resolvePopoutFallbackView(decoded.profile);
      assert.deepEqual(fallback.fallbackPanelIds, ['panel-timeline-1']);
      assert.equal(fallback.inMemoryDockview.popoutGroups, undefined);

      // Persisted profile keeps its popoutGroups and savedWallPlacements untouched
      assert.equal(fallback.preservedProfile.dockview.popoutGroups?.length, 1);
      assert.deepEqual(fallback.preservedProfile.savedWallPlacements?.['panel-timeline-1'], {
        groupId: 'group-wall',
        index: 1,
      });
    });

    it('completes restore pipeline and saves atomically after markSettled()', async () => {
      const mock = createMockStorage(null);
      const ctrl = createLayoutProfileController({
        scope: TEST_SCOPE,
        ownerWindowId: 'win-main-1',
        storage: mock.storage,
      });

      const restoreRes = await ctrl.restore();
      assert.equal(restoreRes.status, 'default-initialized');
      assert.equal(restoreRes.readOnly, false);

      const settledRes = ctrl.markSettled();
      assert.equal(settledRes.ok, true);

      const saveRes = await ctrl.saveOnGesture(PINNED_V2_FIXTURE);
      assert.equal(saveRes.ok, true);
      assert.equal(mock.getWriteCount(), 1);
    });
  });

  describe('Negative contrasts: future schema/corrupt overwrite refused, forbidden keys, and restore guards', () => {
    it('refuses unknown future schemaVersion (e.g. v99), retains original bytes untouched, and blocks saveOnGesture in read-only quarantine', async () => {
      const futureRaw = JSON.stringify({
        ...PINNED_V2_FIXTURE,
        schemaVersion: 99,
        futureExperimentalField: { layoutMode: 'holodeck' },
      });

      const mock = createMockStorage(futureRaw);
      const ctrl = createLayoutProfileController({
        scope: TEST_SCOPE,
        ownerWindowId: 'win-main-1',
        storage: mock.storage,
      });

      const restoreRes = await ctrl.restore();
      assert.equal(restoreRes.status, 'quarantined-safe-fallback');
      assert.equal(restoreRes.readOnly, true);
      assert.equal(restoreRes.errorCode, 'FUTURE_SCHEMA');
      assert.ok(restoreRes.inMemorySafeProfile);

      // Trying to markSettled must fail while quarantined
      const settleAttempt = ctrl.markSettled();
      assert.equal(settleAttempt.ok, false);

      // Trying to save a gesture must refuse and NEVER overwrite the future schema on disk
      const saveAttempt = await ctrl.saveOnGesture(PINNED_V2_FIXTURE);
      assert.equal(saveAttempt.ok, false);
      assert.equal(saveAttempt.code, 'READ_ONLY_QUARANTINE');
      assert.equal(mock.getWriteCount(), 0);
      assert.equal(mock.getStoredRaw(), futureRaw, 'Future schema profile must remain untouched on disk');
    });

    it('refuses corrupt JSON payload, retains corrupt payload untouched, and refuses overwrite until explicit recovery', async () => {
      const corruptRaw = '{"format":"capsule-ui-kit.layout-profile","schemaVersion":2,"dockview":TRUNCATED...';
      const mock = createMockStorage(corruptRaw);
      const ctrl = createLayoutProfileController({
        scope: TEST_SCOPE,
        ownerWindowId: 'win-main-1',
        storage: mock.storage,
      });

      const restoreRes = await ctrl.restore();
      assert.equal(restoreRes.status, 'quarantined-safe-fallback');
      assert.equal(restoreRes.readOnly, true);
      assert.equal(restoreRes.errorCode, 'CORRUPT_JSON');

      // Gesture save must be refused
      const saveAttempt = await ctrl.saveOnGesture(createDefaultLayoutProfile(TEST_SCOPE));
      assert.equal(saveAttempt.ok, false);
      assert.equal(saveAttempt.code, 'READ_ONLY_QUARANTINE');
      assert.equal(mock.getWriteCount(), 0);
      assert.equal(mock.getStoredRaw(), corruptRaw, 'Corrupt payload must remain untouched on disk');

      // Explicit operator recovery unlocks persistence and writes clean profile
      const recovery = await ctrl.recoverExplicitly(PINNED_V2_FIXTURE);
      assert.equal(recovery.ok, true);
      assert.equal(mock.getWriteCount(), 1);
      assert.equal(ctrl.getState().readOnly, false);
    });

    it('refuses forbidden authoritative/sensitive keys (credentials, pid, budget, permissions, controlLease, scrollTop, gameState)', () => {
      const forbiddenKeysToTest = [
        'credentials',
        'pid',
        'budget',
        'permissions',
        'controlLease',
        'pendingPrompts',
        'capturePath',
        'scrollTop',
        'gameState',
      ];

      for (const badKey of forbiddenKeysToTest) {
        const cloned = JSON.parse(JSON.stringify(PINNED_V2_FIXTURE));
        cloned.dockview.panels['panel-cap-1'].params[badKey] = 'injected-value';

        const res = decodeAndMigrateLayoutProfile(cloned);
        assert.equal(res.ok, false, `Should reject forbidden key "${badKey}"`);
        if (!res.ok) {
          assert.equal(res.code, 'FORBIDDEN_DATA');
          assert.equal(res.readOnlyRequired, true);
        }
      }
    });

    it('refuses unallowlisted keys in root, shell, dockview, and panel params (closed decode)', () => {
      const withRootUnknown = {
        ...PINNED_V2_FIXTURE,
        unexpectedRootKey: 123,
      };
      const resRoot = decodeAndMigrateLayoutProfile(withRootUnknown);
      assert.equal(resRoot.ok, false);
      if (!resRoot.ok) {
        assert.equal(resRoot.code, 'INVALID_ENVELOPE');
      }

      const withParamUnknown = JSON.parse(JSON.stringify(PINNED_V2_FIXTURE));
      withParamUnknown.dockview.panels['panel-cap-1'].params.arbitraryCustomBlob = 'nope';
      const resParam = decodeAndMigrateLayoutProfile(withParamUnknown);
      assert.equal(resParam.ok, false);
      if (!resParam.ok) {
        assert.equal(resParam.code, 'INVALID_DOCKVIEW');
      }
    });

    it('refuses saveOnGesture before markSettled(), from a non-owner window, or during popout fallback', async () => {
      const mock = createMockStorage(JSON.stringify(PINNED_V2_FIXTURE));
      const ctrl = createLayoutProfileController({
        scope: TEST_SCOPE,
        ownerWindowId: 'win-primary',
        storage: mock.storage,
      });

      await ctrl.restore();

      // 1. Before markSettled() -> refused
      const beforeSettled = await ctrl.saveOnGesture(PINNED_V2_FIXTURE);
      assert.equal(beforeSettled.ok, false);
      assert.equal(beforeSettled.code, 'RESTORE_NOT_SETTLED');
      assert.equal(mock.getWriteCount(), 0);

      ctrl.markSettled();

      // 2. Non-owner window -> refused
      const wrongWin = await ctrl.saveOnGesture(PINNED_V2_FIXTURE, {
        requestingWindowId: 'win-popout-child',
      });
      assert.equal(wrongWin.ok, false);
      assert.equal(wrongWin.code, 'NON_OWNER_WINDOW');
      assert.equal(mock.getWriteCount(), 0);

      // 3. Popout fallback -> refused so saved wall placement is not overwritten
      const popoutFallbackSave = await ctrl.saveOnGesture(PINNED_V2_FIXTURE, {
        isPopoutFallback: true,
      });
      assert.equal(popoutFallbackSave.ok, false);
      assert.equal(popoutFallbackSave.code, 'POPOUT_FALLBACK_NO_OVERWRITE');
      assert.equal(mock.getWriteCount(), 0);
    });

    it('prevents mutable alias corruption of decoded profiles', () => {
      const res = decodeAndMigrateLayoutProfile(PINNED_V2_FIXTURE);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      assert.throws(() => {
        // @ts-expect-error testing runtime immutability
        res.profile.shell.drawerMode = 'collapsed';
      }, TypeError);

      assert.throws(() => {
        // @ts-expect-error testing runtime immutability
        res.profile.dockview.panels['panel-cap-1'].params.capsuleId = 'mutated';
      }, TypeError);
    });
  });
});
