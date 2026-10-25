import { createApp } from 'vue';
import StarterApp from './App.vue';
import 'capsule-ui-kit/theme.css';
import { createDefaultLayoutProfile, decodeAndMigrateLayoutProfile } from 'capsule-ui-kit/layout';

const STARTER_SCOPE = Object.freeze({
  product: 'capsule-starter',
  profileId: 'default',
  workspaceId: 'starter-wall',
});

const STARTER_PANELS = Object.freeze([
  Object.freeze({ id: 'hello', title: 'Hello' }),
  Object.freeze({ id: 'notes', title: 'Notes' }),
  Object.freeze({ id: 'terminal', title: 'Terminal' }),
]);

function createStarterLayout() {
  const base = structuredClone(createDefaultLayoutProfile(STARTER_SCOPE));
  base.dockview.grid.height = 720;
  base.dockview.panels = {};
  base.savedWallPlacements = {};
  /**
   * @param {string} id
   * @param {string[]} views
   * @param {string} activeView
   * @param {number} size
   * @returns {import("capsule-ui-kit/layout").SerializedGridObject}
   */
  const leaf = (id, views, activeView, size) => ({
    type: 'leaf',
    size,
    visible: true,
    data: { id, views, activeView },
  });
  base.dockview.grid.root = {
    type: 'branch',
    size: 1280,
    data: [
      leaf('starter-group-main', ['panel-hello', 'panel-notes'], 'panel-hello', 880),
      leaf('starter-group-side', ['panel-terminal'], 'panel-terminal', 400),
    ],
  };
  base.dockview.activeGroup = 'starter-group-main';
  const placements = {
    'panel-hello': { groupId: 'starter-group-main', index: 0 },
    'panel-notes': { groupId: 'starter-group-main', index: 1 },
    'panel-terminal': { groupId: 'starter-group-side', index: 0 },
  };
  for (const panel of STARTER_PANELS) {
    base.dockview.panels[`panel-${panel.id}`] = {
      id: `panel-${panel.id}`,
      contentComponent: 'CapsulePanel',
      title: panel.title,
      renderer: 'always',
      params: { capsuleId: panel.id },
    };
    base.savedWallPlacements[`panel-${panel.id}`] = placements[`panel-${panel.id}`];
  }
  const checked = decodeAndMigrateLayoutProfile(base, { expectedScope: STARTER_SCOPE });
  if (!checked.ok) throw new Error(checked.reason);
  return checked.profile;
}

/** Presentation-only preload boundary; storage failures stay visible to the kit. */
function createLayoutStorage() {
  const facade = /** @type {any} */ (window).capsuleStarter;
  return {
    readRaw: async () => {
      if (!facade) throw new Error('Layout service unavailable');
      // Mount can precede main's handler binding. Wait only for handler
      // installation; schema and storage errors never become missing profiles.
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          return await facade.load();
        } catch (error) {
          if (!String(error).includes('No handler registered')) throw error;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      throw new Error('Layout service did not become ready');
    },
    writeAtomic: async (/** @type {string} */ json) => {
      if (!facade) throw new Error('Layout service unavailable');
      await facade.save(json);
    },
  };
}

Object.assign(document.documentElement.dataset, { themeScheme: 'dark', themeContrast: 'normal', themeDensity: 'regular' });
const application = createApp(StarterApp, {
  layout: createStarterLayout(),
  storage: createLayoutStorage(),
  scope: STARTER_SCOPE,
});

application.mount('#capsule-starter');
