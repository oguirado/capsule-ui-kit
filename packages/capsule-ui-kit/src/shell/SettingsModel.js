/**
 * Pure settings helpers for the generic shell settings panel. No DOM, no
 * framework: the component owns rendering, the host owns persistence and
 * side effects such as scheme switching or layout restore.
 * @module shell/SettingsModel
 */

/**
 * @typedef {object} SettingsOption
 * @property {string} id Stable option id.
 * @property {string} label Visible label.
 * @property {string} [detail] Secondary description.
 */

/**
 * @typedef {object} ShortcutEntry
 * @property {string} id Stable shortcut id.
 * @property {string} label Visible action label.
 * @property {string} kbd Shortcut text shown in the key chip.
 */

/** Color palette options in Stitch S6 order. @type {readonly SettingsOption[]} */
export const SCHEME_OPTIONS = Object.freeze([
  { id: 'dark', label: 'Dark Slate (Default)', detail: 'Optimized for low-glare operations' },
  { id: 'light', label: 'Light Operational', detail: 'High ambient daytime environments' },
  { id: 'system', label: 'System Synchronized', detail: 'Follow host OS display preference' },
]);

/** Density options in Stitch S6 order. @type {readonly SettingsOption[]} */
export const DENSITY_OPTIONS = Object.freeze([
  { id: 'comfortable', label: 'Comfortable', detail: '40px rows, 14px body typography' },
  { id: 'compact', label: 'Compact (High Density)', detail: '32px headers, 8px padding, 12px code telemetry' },
]);

/** Settings sections in Stitch S6 nav order. @type {readonly string[]} */
export const SETTINGS_SECTIONS = Object.freeze(['appearance', 'workspace', 'ai-terminal', 'shortcuts', 'about']);

/** @type {Record<string, string>} */
export const SECTION_LABELS = Object.freeze({
  appearance: 'Appearance',
  workspace: 'Workspace',
  'ai-terminal': 'AI Terminal Mode',
  shortcuts: 'Shortcuts',
  about: 'About',
});

/** Storage keys shared with the kit theme adapter. @type {{readonly scheme: string, readonly schemePreference: string, readonly density: string, readonly snap: string, readonly aiTerminal: string}} */
export const SETTINGS_STORAGE_KEYS = Object.freeze({
  scheme: 'capsule-kit-scheme',
  schemePreference: 'capsule-kit-scheme-preference',
  density: 'capsule-kit-density',
  snap: 'capsule-kit-grid-snap',
  aiTerminal: 'capsule-kit-ai-terminal',
});

/**
 * Resolve a scheme preference to a concrete scheme.
 * @param {string} preference `light`, `dark` or `system`.
 * @param {boolean} systemIsLight True when the host OS prefers light.
 * @returns {'light'|'dark'} Concrete scheme.
 */
export function resolveScheme(preference, systemIsLight) {
  if (preference === 'light') return 'light';
  if (preference === 'dark') return 'dark';
  if (preference === 'system') return systemIsLight ? 'light' : 'dark';
  throw new Error(`Unknown scheme preference: ${String(preference)}`);
}

/**
 * Read a stored setting without ever throwing (private mode, missing
 * storage and foreign values all fall back).
 * @param {Pick<Storage, 'getItem'>|null|undefined} storage Web storage or a test double.
 * @param {string} key Storage key.
 * @param {string} fallback Fallback value.
 * @returns {string} Stored value or the fallback.
 */
export function readStoredSetting(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return typeof value === 'string' && value !== '' ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persist a setting without ever throwing.
 * @param {Pick<Storage, 'setItem'>|null|undefined} storage Web storage or a test double.
 * @param {string} key Storage key.
 * @param {string} value Value to store.
 * @returns {boolean} True when the write succeeded.
 */
export function writeStoredSetting(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
