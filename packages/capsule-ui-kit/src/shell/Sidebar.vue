<script>
/**
 * Collapse-choice persistence for the navigation rail. Self-contained (no
 * imports) so hosts restore the choice and tests reuse it unmounted.
 */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'capsule-kit-sidebar-collapsed';
/**
 * Reads the persisted collapse choice: collapsed unless explicitly '0'.
 * @param {Pick<Storage, 'getItem'>|null|undefined} storage Web storage or a test double.
 * @returns {boolean} True (collapsed rail) by default.
 */
export function readSidebarCollapsed(storage) {
  let value = '';
  try {
    const raw = storage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    value = typeof raw === 'string' ? raw : '';
  } catch {
    value = '';
  }
  if (value === '') return true;
  return value !== '0';
}
/**
 * Persists the collapse choice without ever throwing.
 * @param {Pick<Storage, 'setItem'>|null|undefined} storage Web storage or a test double.
 * @param {unknown} collapsed Explicit collapse choice.
 * @returns {boolean} True when the write succeeded.
 */
export function writeSidebarCollapsed(storage, collapsed) {
  try {
    storage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed === true ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}
</script>
<script setup>
/**
 * @file Generic S1 navigation rail (Stitch S1 spec section 2).
 * 240px group rail with workspace header, active/count/unread/NEW/price
 * adornments, user card and engine strip. Data arrives via props, visual
 * overrides via the icon/header/footer/telemetry slots (telemetry renders
 * nothing by default). Contains no application names:
 * product strings live in the consumer navigation model (renderer-v2).
 * Overlay mode (default): the collapsed icon rail reserves its width in
 * flow while the expanded panel floats above the dock layer (absolute,
 * drawer z-index, floating shadow) without reflowing siblings. The
 * consumer must give the sidebar's offset parent position:relative.
 * P3: the expanded panel pins the rail token width with an opaque token surface.
 * R4: the rail opens collapsed by default. `collapsed` is tri-state: null
 * (default) resolves the persisted choice (collapsed rail when nothing was
 * stored) while an explicit boolean overrides it; every explicit choice
 * persists under SIDEBAR_COLLAPSED_STORAGE_KEY for hosts to restore.
 * Every surface and text color resolves from scheme tokens.
 * Plain JS + JSDoc, no TypeScript.
 *
 * @typedef {Object} SidebarItem
 * @property {string} id - Immutable item id (drives stable DOM ids).
 * @property {string} label - Display label.
 * @property {string} [name] - Stable accessible name; adornments become the description.
 * @property {string} [icon] - Glyph name from SidebarIcon; unknown falls back.
 * @property {boolean} [active] - Active-section state.
 * @property {string|number} [count] - Neutral count badge.
 * @property {string|number} [unread] - Accent unread badge (wins over count).
 * @property {boolean} [isNew] - NEW pill.
 * @property {string} [price] - Trailing price text.
 * @property {string} [priceDelta] - Trailing delta text (e.g. an index move).
 * @property {'up'|'down'} [priceTrend] - Delta tone; default 'up'.
 * @property {boolean} [disabled] - Disabled state.
 *
 * @typedef {Object} SidebarGroup
 * @property {string} id - Immutable group id.
 * @property {string} label - Group label.
 * @property {SidebarItem[]} items - Group items.
 *
 * @typedef {Object} SidebarUser
 * @property {string} initials - Avatar monogram.
 * @property {string} name - Display name.
 * @property {string} role - Role line.
 * @property {string} [tier] - Tier chip (e.g. PRO).
 * @property {'online'|'offline'} [presence] - Presence dot; default 'offline'.
 *
 * @typedef {Object} SidebarEngine
 * @property {string} label - Key text (e.g. Engine:).
 * @property {string} status - Status text (e.g. Synced (48ms)).
 * @property {'synced'|'syncing'|'offline'} [state] - Dot tone; default 'synced'.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VendorMenu from 'openvue/menu';
import { createCspMenu } from '../workspace/cspMenu.js';
import Badge from 'openvue/badge';
import Tag from 'openvue/tag';
import Avatar from 'openvue/avatar';
import Button from 'openvue/button';
import SidebarIcon from './SidebarIcon.vue';

const Menu = createCspMenu(VendorMenu);

const props = defineProps({
  groups: { type: Array, required: true },
  workspaceLabel: { type: String, default: 'Workspace' },
  workspaceVersion: { type: String, default: '' },
  collapsed: { type: Boolean, default: null },
  storage: {
    type: /** @type {import('vue').PropType<Pick<Storage, 'getItem' | 'setItem'>|null|undefined>} */ (Object),
    default: undefined
  },
  autoCollapse: { type: Boolean, default: true },
  collapseBreakpoint: { type: Number, default: 1280 },
  overlay: { type: Boolean, default: true },
  activeId: { type: String, default: '' },
  user: { type: Object, default: null },
  engine: { type: Object, default: null },
  navLabel: { type: String, default: 'Capsules' },
});
/** 'open' mirrors 'select' for AppShell-compatible consumers. */
const emit = defineEmits(['select', 'open', 'sync', 'user-menu', 'collapsed-change']);

/** Narrow-viewport probe; narrowing only adds collapse, never persists it. */
const narrow = ref(false);
/** @type {{ matches: boolean, addEventListener?: Function, removeEventListener?: Function } | null} */
let media = null;
function syncNarrow() {
  narrow.value = media !== null && media.matches === true;
}
onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function' && Number.isFinite(props.collapseBreakpoint)) {
    media = window.matchMedia(`(max-width: ${props.collapseBreakpoint - 1}px)`);
    syncNarrow();
    if (media && typeof media.addEventListener === 'function') media.addEventListener('change', syncNarrow);
  }
  emit('collapsed-change', isCollapsed.value);
});
onBeforeUnmount(() => {
  if (media && typeof media.removeEventListener === 'function') media.removeEventListener('change', syncNarrow);
  media = null;
});
/**
 * @returns {Pick<Storage, 'getItem' | 'setItem'>|null}
 */
function resolveStorage() {
  if (props.storage !== undefined && props.storage !== null) return props.storage;
  try {
    const candidate = globalThis?.localStorage ?? null;
    if (candidate && typeof candidate.getItem === 'function' && typeof candidate.setItem === 'function') {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

const storageRef = resolveStorage();
/** Uncontrolled collapse choice: explicit prop wins, otherwise the persisted choice (collapsed rail by default). */
const collapsedState = ref(typeof props.collapsed === 'boolean' ? props.collapsed : readSidebarCollapsed(storageRef));
/** Explicit collapse choice before viewport narrowing. */
const explicitCollapsed = computed(() => (typeof props.collapsed === 'boolean' ? props.collapsed : collapsedState.value));
const isCollapsed = computed(() => explicitCollapsed.value || (props.autoCollapse && narrow.value));
watch(explicitCollapsed, (value) => { writeSidebarCollapsed(storageRef, value); });
watch(isCollapsed, (value) => emit('collapsed-change', value));

/** OpenVue Menu model: one submenu per group, separators between groups. */
const menuModel = computed(() => {
  /** @type {Array<Record<string, any>>} */
  const model = [];
  const groups = /** @type {SidebarGroup[]} */ (props.groups);
  groups.forEach((group, index) => {
    if (index > 0) model.push({ separator: true, key: `sep-${group.id}` });
    model.push({
      label: group.label,
      key: group.id,
      items: group.items.map((item) => {
        const nav = { ...item, active: item.active === true || item.id === props.activeId };
        return {
          label: nav.label,
          key: nav.id,
          disabled: nav.disabled === true,
          command: () => { emit('select', nav); emit('open', nav); },
          _nav: nav,
        };
      }),
    });
  });
  return model;
});
/** Pass-through classes for Menu-owned nodes (slots cover the rest). */
const menuPt = {
  list: { class: 'cuk-sidebar__menulist', 'data-semantic-anchor': 'shell/menu/sidebar-list' },
  /** @param {{context: {item: {key: string}}}} options */
  item: ({ context }) => ({ style: undefined, 'data-semantic-anchor': `shell/menu/item-${context.item.key}` }),
  submenuLabel: { class: 'cuk-sidebar__menugroup' },
  separator: { class: 'cuk-sidebar__separator' },
};

/**
 * Single accessible name per item; adornments stay aria-hidden so they are
 * announced once through the name instead of twice.
 * @param {SidebarItem} nav
 * @returns {string}
 */
function itemName(nav) {
  return nav.name || itemDescription(nav);
}
/** @param {SidebarItem} nav @returns {string} */
function itemDescription(nav) {
  const parts = [nav.label];
  if (nav.active) parts.push('current section');
  if (nav.unread !== undefined && nav.unread !== null && nav.unread !== '') parts.push(`${nav.unread} unread`);
  else if (nav.count !== undefined && nav.count !== null && nav.count !== '') parts.push(`count ${nav.count}`);
  if (nav.isNew) parts.push('new');
  if (nav.price) parts.push(`price ${nav.price}${nav.priceDelta ? `, ${nav.priceDelta}` : ''}`);
  return parts.join(', ');
}
</script>
<template>
  <aside id="shell/navigation" class="cuk-sidebar" :class="{ 'cuk-sidebar--collapsed': isCollapsed, 'cuk-sidebar--overlay': overlay }" :aria-label="navLabel">
    <div class="cuk-sidebar__body">
      <slot name="header" :workspace-label="workspaceLabel" :workspace-version="workspaceVersion" :collapsed="isCollapsed">
        <div class="cuk-sidebar__workspace">
          <span class="cuk-sidebar__workspace-label">{{ workspaceLabel }}</span>
          <span v-if="workspaceVersion" class="cuk-sidebar__version">{{ workspaceVersion }}</span>
        </div>
      </slot>
      <Menu id="shell-sidebar-menu" :model="menuModel" class="cuk-sidebar__menu" aria-label="Capsule menu" :pt="menuPt">
        <template #submenulabel="{ item }">
          <span class="cuk-sidebar__group">{{ item.label }}</span>
        </template>
        <template #item="{ item, props: bindings }">
          <a v-bind="bindings.action" role="button" :id="'shell-menu-' + item.key"
            :data-semantic-anchor="'shell/navigation/menu-' + item.key" :aria-label="itemName(item._nav)" :aria-description="item._nav.name ? itemDescription(item._nav) : undefined"
            :aria-current="item._nav.active ? 'page' : undefined" :title="isCollapsed ? item._nav.label : undefined"
            class="cuk-sidebar__item" :class="{ 'cuk-sidebar__item--active': item._nav.active }">
            <slot name="icon" :item="item._nav" :collapsed="isCollapsed">
              <SidebarIcon :name="item._nav.icon" />
            </slot>
            <span class="cuk-sidebar__label">{{ item._nav.label }}</span>
            <span v-if="item._nav.active" class="cuk-sidebar__active-dot" aria-hidden="true"></span>
            <Badge v-else-if="item._nav.unread !== undefined && item._nav.unread !== null && item._nav.unread !== ''"
              :value="String(item._nav.unread)" severity="contrast" class="cuk-sidebar__badge cuk-sidebar__badge--unread" aria-hidden="true" />
            <Badge v-else-if="item._nav.count !== undefined && item._nav.count !== null && item._nav.count !== ''"
              :value="String(item._nav.count)" severity="secondary" class="cuk-sidebar__badge cuk-sidebar__badge--count" aria-hidden="true" />
            <Tag v-else-if="item._nav.isNew" value="NEW" severity="info" class="cuk-sidebar__new" aria-hidden="true" />
            <span v-else-if="item._nav.price" class="cuk-sidebar__price" aria-hidden="true">
              <span class="cuk-sidebar__price-value">{{ item._nav.price }}</span>
              <span v-if="item._nav.priceDelta" class="cuk-sidebar__price-delta"
                :class="{ 'cuk-sidebar__price-delta--down': item._nav.priceTrend === 'down' }">{{ item._nav.priceDelta }}</span>
            </span>
          </a>
        </template>
      </Menu>
    </div>
    <div class="cuk-sidebar__footer">
      <slot name="telemetry" :collapsed="isCollapsed" />
      <slot name="footer" :user="user" :engine="engine" :collapsed="isCollapsed">
        <div v-if="user" class="cuk-sidebar__user">
          <div class="cuk-sidebar__identity">
            <span class="cuk-sidebar__avatarwrap">
              <Avatar :label="user.initials" shape="square" :aria-label="user.name" class="cuk-sidebar__avatar" />
              <span v-if="user.presence === 'online'" class="cuk-sidebar__presence" aria-hidden="true"></span>
            </span>
            <span class="cuk-sidebar__who">
              <span class="cuk-sidebar__who-row">
                <span class="cuk-sidebar__name">{{ user.name }}</span>
                <Tag v-if="user.tier" :value="user.tier" severity="info" class="cuk-sidebar__tier" aria-hidden="true" />
              </span>
              <span class="cuk-sidebar__role">{{ user.role }}</span>
            </span>
          </div>
          <Button text id="shell-sidebar-user-menu" data-semantic-anchor="shell/navigation/sidebar-user-menu"
            class="cuk-sidebar__ghost" aria-label="Account and workspace settings" title="Account & Workspace Settings"
            @click="emit('user-menu')">
            <SidebarIcon name="dots" />
          </Button>
        </div>
        <div v-if="engine" class="cuk-sidebar__engine">
          <span class="cuk-sidebar__engine-meta">
            <span class="cuk-sidebar__engine-dot" :class="'cuk-sidebar__engine-dot--' + (engine.state || 'synced')" aria-hidden="true"></span>
            <span class="cuk-sidebar__engine-key">{{ engine.label }}</span>
            <span class="cuk-sidebar__engine-status">{{ engine.status }}</span>
          </span>
          <Button text id="shell-sidebar-sync" data-semantic-anchor="shell/navigation/sidebar-sync"
            class="cuk-sidebar__sync" :aria-label="'Force sync, ' + engine.status" title="Force Sync" @click="emit('sync')">
            <SidebarIcon name="sync" />
            <span class="cuk-sidebar__sync-label">Sync</span>
          </Button>
        </div>
      </slot>
    </div>
  </aside>
</template>
<style scoped>
.cuk-sidebar {
  width: var(--cuk-component-app-shell-sidebar-width-s1);
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex-shrink: 0;
  overflow: hidden;
  background: var(--cuk-semantic-surface-panel);
  border-right: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  z-index: var(--cuk-semantic-z-index-panel);
  transition: width var(--cuk-primitive-duration-150);
}
.cuk-sidebar--collapsed {
  width: var(--cuk-semantic-size-rail-collapsed-width);
}
/* Overlay mode (default): the expanded panel floats above the dock layer
   while the collapsed rail stays in flow, so expanding never reflows
   siblings. Requires a positioned offset parent (see file docs). */
/* P3: the expanded overlay pins the rail token width so its edge never
   slices a content label beneath it, and restates its opaque token
   surface beside the shadow that lifts it above the dock layer. */
.cuk-sidebar--overlay:not(.cuk-sidebar--collapsed) {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--cuk-semantic-size-rail-expanded-width);
  background: var(--cuk-semantic-surface-panel);
  z-index: var(--cuk-semantic-z-index-drawer);
  box-shadow: var(--cuk-semantic-elevation-s1-floating);
}
.cuk-sidebar :deep(.p-menu) { min-width: 0; width: 100%; max-width: 100%; background: transparent; color: var(--cuk-semantic-text-primary); }
/* R1 + PL6 NEW-2: vendor-owned menu nodes stay transparent so every
   sidebar surface resolves from scheme tokens in every scheme (no light
   vendor default under dark-scheme text). Covers the item content
   wrappers that paint the vendor menu fill, not just the list, the
   submenu labels and the separators. */
.cuk-sidebar :deep(.p-menu-list),
.cuk-sidebar :deep(.p-menu-submenu-label),
.cuk-sidebar :deep(.p-menu-item-content),
.cuk-sidebar :deep(.p-menu-separator) {
  background: transparent;
}
.cuk-sidebar__item { box-sizing: border-box; max-width: 100%; }
.cuk-sidebar__body {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-4);
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--cuk-primitive-space-4);
  overflow-y: auto;
}
.cuk-sidebar__workspace {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-3) var(--cuk-primitive-space-6);
}
/* PL6: captions keep the muted text tone so they hold 4.5:1 on the
   panel in every scheme (the disabled tone drops to 1.8:1). */
.cuk-sidebar__workspace-label {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.cuk-sidebar__version {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-xs);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.cuk-sidebar__menu {
  background: transparent;
  border: 0;
  width: 100%;
  padding: 0;
}
.cuk-sidebar :deep(.cuk-sidebar__menulist) {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.cuk-sidebar :deep(.cuk-sidebar__menugroup) {
  margin: 0;
  padding: 0;
}
/* PL6 P5: the group divider keeps the muted text tone so it holds
   >= 3:1 on the panel in every scheme (border-subtle is 1.2-1.8:1). */
.cuk-sidebar :deep(.cuk-sidebar__separator) {
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-text-muted);
  margin-block: calc(var(--cuk-primitive-space-4) - var(--cuk-primitive-space-1));
  margin-inline: var(--cuk-primitive-space-4);
  list-style: none;
}
.cuk-sidebar__group {
  display: block;
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-6);
  font-size: var(--cuk-semantic-typography-roles-table-header-font-size);
  font-family: var(--cuk-semantic-typography-roles-table-header-font-family);
  font-weight: var(--cuk-semantic-typography-roles-table-header-font-weight);
  line-height: var(--cuk-semantic-typography-roles-table-header-line-height);
  letter-spacing: var(--cuk-semantic-typography-roles-table-header-letter-spacing);
  text-transform: uppercase;
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.cuk-sidebar__item {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-3) var(--cuk-primitive-space-6);
  border-radius: var(--cuk-semantic-radius-sm);
  border-left: var(--cuk-primitive-space-1) solid transparent;
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-family: var(--cuk-semantic-typography-roles-label-md-font-family);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  color: var(--cuk-semantic-text-muted);
  text-decoration: none;
  cursor: pointer;
  transition: background-color var(--cuk-primitive-duration-150), color var(--cuk-primitive-duration-150);
}
.cuk-sidebar__item:hover {
  background: var(--cuk-semantic-surface-chrome);
  color: var(--cuk-semantic-text-primary);
}
/* PL6: the active label keeps the primary text tone so it holds
   4.5:1 on the elevated row in every scheme; the accent edge stays the
   current-section indicator. */
.cuk-sidebar__item--active {
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-primary);
  border-left-color: var(--cuk-semantic-accent-primary);
}
.cuk-sidebar__item:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
.cuk-sidebar__label {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* P3: expanded labels wrap instead of ellipsizing, so long consumer
   labels stay fully legible in the overlay panel. */
.cuk-sidebar:not(.cuk-sidebar--collapsed) .cuk-sidebar__label {
  white-space: normal;
  overflow: hidden;
  text-overflow: clip;
}
.cuk-sidebar__active-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-accent-primary);
  flex-shrink: 0;
}
.cuk-sidebar__badge {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-xs);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  min-width: 0;
  height: auto;
}
.cuk-sidebar__badge--count {
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-text-muted);
}
.cuk-sidebar__badge--unread {
  background: var(--cuk-semantic-accent-secondary-container);
  color: var(--cuk-semantic-accent-on-secondary-container);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.cuk-sidebar__new {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-sans);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  line-height: var(--cuk-semantic-typography-roles-label-sm-line-height);
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-xs);
  background: color-mix(in srgb, var(--cuk-semantic-accent-tertiary-container) 30%, transparent);
  color: var(--cuk-semantic-text-accent);
  border: var(--cuk-semantic-border-width) solid color-mix(in srgb, var(--cuk-semantic-accent-tertiary) 40%, transparent);
}
.cuk-sidebar__price {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  white-space: nowrap;
}
.cuk-sidebar__price-value {
  font-size: var(--cuk-semantic-typography-font-size-xs);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  color: var(--cuk-semantic-text-primary);
}
.cuk-sidebar__price-delta {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  color: var(--cuk-semantic-status-success-icon);
}
.cuk-sidebar__price-delta--down {
  color: var(--cuk-semantic-status-error-text);
}
.cuk-sidebar__footer {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-primitive-space-3);
  flex-shrink: 0;
  padding: var(--cuk-primitive-space-4);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  background: color-mix(in srgb, var(--cuk-semantic-surface-sunken) 50%, transparent);
}
.cuk-sidebar__user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-3) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-sm);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.cuk-sidebar__identity {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-4);
  min-width: 0;
}
.cuk-sidebar__avatarwrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}
.cuk-sidebar__avatar {
  width: var(--cuk-primitive-space-12);
  height: var(--cuk-primitive-space-12);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-weight: var(--cuk-semantic-typography-font-weight-semibold);
  background: var(--cuk-semantic-surface-elevated);
  color: var(--cuk-semantic-accent-primary);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
}
.cuk-sidebar__presence {
  position: absolute;
  right: calc(var(--cuk-primitive-space-1) * -1);
  bottom: calc(var(--cuk-primitive-space-1) * -1);
  width: var(--cuk-primitive-space-4);
  height: var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-status-success-icon);
  box-shadow: 0 0 0 var(--cuk-primitive-space-1) var(--cuk-semantic-surface-panel);
}
.cuk-sidebar__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1;
}
.cuk-sidebar__who-row {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  min-width: 0;
}
.cuk-sidebar__name {
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-family: var(--cuk-semantic-typography-roles-label-md-font-family);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  line-height: var(--cuk-semantic-typography-roles-label-md-line-height);
  color: var(--cuk-semantic-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cuk-sidebar__role {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  color: var(--cuk-semantic-text-disabled);
  margin-top: var(--cuk-primitive-space-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cuk-sidebar__tier {
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
  padding: var(--cuk-semantic-border-width) var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-xs);
  background: color-mix(in srgb, var(--cuk-semantic-accent-primary) 10%, transparent);
  color: var(--cuk-semantic-accent-primary);
  border: var(--cuk-semantic-border-width) solid color-mix(in srgb, var(--cuk-semantic-accent-primary) 30%, transparent);
}
.cuk-sidebar__ghost {
  color: var(--cuk-semantic-text-disabled);
  padding: var(--cuk-primitive-space-2);
  border-radius: var(--cuk-semantic-radius-xs);
  flex-shrink: 0;
}
.cuk-sidebar__ghost:hover {
  color: var(--cuk-semantic-text-primary);
  background: var(--cuk-semantic-surface-elevated);
}
.cuk-sidebar__ghost .cuk-sidebar-icon {
  width: var(--cuk-primitive-space-7);
  height: var(--cuk-primitive-space-7);
}
.cuk-sidebar__engine {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cuk-primitive-space-4);
  padding: var(--cuk-primitive-space-2) var(--cuk-primitive-space-4);
  border-radius: var(--cuk-semantic-radius-xs);
  background: var(--cuk-semantic-surface-sunken);
  border: var(--cuk-semantic-border-width) solid color-mix(in srgb, var(--cuk-semantic-border-subtle) 60%, transparent);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  line-height: var(--cuk-semantic-typography-roles-code-sm-line-height);
}
.cuk-sidebar__engine-meta {
  display: flex;
  align-items: center;
  gap: var(--cuk-primitive-space-3);
  min-width: 0;
}
.cuk-sidebar__engine-dot {
  width: var(--cuk-primitive-space-3);
  height: var(--cuk-primitive-space-3);
  border-radius: var(--cuk-semantic-radius-pill);
  background: var(--cuk-semantic-status-success-icon);
  flex-shrink: 0;
}
.cuk-sidebar__engine-dot--syncing {
  background: var(--cuk-semantic-accent-tertiary);
}
.cuk-sidebar__engine-dot--offline {
  background: var(--cuk-semantic-text-disabled);
}
.cuk-sidebar__engine-key {
  color: var(--cuk-semantic-text-disabled);
  white-space: nowrap;
}
.cuk-sidebar__engine-status {
  color: var(--cuk-semantic-status-success-icon);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cuk-sidebar__sync {
  color: var(--cuk-semantic-text-disabled);
  display: inline-flex;
  align-items: center;
  gap: var(--cuk-primitive-space-2);
  padding: 0;
  font: inherit;
  flex-shrink: 0;
}
.cuk-sidebar__sync:hover {
  color: var(--cuk-semantic-accent-primary);
  background: transparent;
}
.cuk-sidebar__sync .cuk-sidebar-icon {
  width: var(--cuk-primitive-space-6);
  height: var(--cuk-primitive-space-6);
}
.cuk-sidebar--collapsed .cuk-sidebar__item {
  justify-content: center;
  padding-left: 0; padding-right: 0; min-width: 0;
}
.cuk-sidebar--collapsed .cuk-sidebar__label,
.cuk-sidebar--collapsed .cuk-sidebar__badge,
.cuk-sidebar--collapsed .cuk-sidebar__new,
.cuk-sidebar--collapsed .cuk-sidebar__price,
.cuk-sidebar--collapsed .cuk-sidebar__active-dot,
.cuk-sidebar--collapsed .cuk-sidebar__group,
.cuk-sidebar--collapsed .cuk-sidebar__workspace,
.cuk-sidebar--collapsed .cuk-sidebar__who,
.cuk-sidebar--collapsed .cuk-sidebar__ghost,
.cuk-sidebar--collapsed .cuk-sidebar__engine-meta,
.cuk-sidebar--collapsed .cuk-sidebar__sync-label {
  display: none;
}
.cuk-sidebar--collapsed .cuk-sidebar__user {
  justify-content: center;
  padding: var(--cuk-primitive-space-2);
}
.cuk-sidebar--collapsed .cuk-sidebar__engine {
  justify-content: center;
}
@media (prefers-reduced-motion: reduce) {
  .cuk-sidebar,
  .cuk-sidebar__item {
    transition: none;
  }
}
</style>
