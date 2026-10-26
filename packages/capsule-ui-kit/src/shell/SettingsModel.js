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

/** Storage keys shared with the kit theme adapter. @type {{readonly scheme: string, readonly schemePreference: string, readonly density: string, readonly snap: string, readonly aiTerminal: string, readonly sideTerminalOpen: string, readonly sideTerminalWidth: string, readonly sideTerminalCustom: string}} */
export const SETTINGS_STORAGE_KEYS = Object.freeze({
  scheme: 'capsule-kit-scheme',
  schemePreference: 'capsule-kit-scheme-preference',
  density: 'capsule-kit-density',
  snap: 'capsule-kit-grid-snap',
  aiTerminal: 'capsule-kit-ai-terminal',
  sideTerminalOpen: 'capsule-kit-side-terminal-open',
  sideTerminalWidth: 'capsule-kit-side-terminal-width',
  sideTerminalCustom: 'capsule-kit-side-terminal-custom',
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

/**
 * Host-supplied settings keys for consumers that manage their own theme,
 * provider, record-destination and limit values. Anchors live in the
 * EXISTING `settings/{key}` family; the host supplies every value and
 * applies every change, the kit only renders and emits.
 * @type {{readonly theme: string, readonly providers: string, readonly recordDestination: string, readonly limits: string}}
 */
export const SETTINGS_KEY_ANCHORS = Object.freeze({
  theme: 'settings/theme',
  providers: 'settings/providers',
  recordDestination: 'settings/record-destination',
  limits: 'settings/limits',
});

/**
 * Bounds for the generic numeric limit control.
 * @typedef {object} SettingsLimitBounds
 * @property {number} [min] Inclusive minimum.
 * @property {number} [max] Inclusive maximum.
 */

/**
 * Resolve a host-supplied option value to a listed option id so a
 * controlled select never renders a blank mismatch.
 * @param {SettingsOption[]} options Candidate options in host order.
 * @param {unknown} value Requested option id.
 * @returns {string} The value when listed, else the first option id, else ''.
 */
export function resolveSettingsOptionId(options, value) {
  const list = Array.isArray(options) ? options : [];
  if (typeof value === 'string' && value !== '' && list.some((option) => option?.id === value)) return value;
  const first = list.find((option) => typeof option?.id === 'string' && option.id !== '');
  return first?.id ?? '';
}

/**
 * Normalize a record-destination value. The kit never enumerates
 * destinations itself: the value always arrives from the host capability.
 * @param {unknown} value Raw host value.
 * @returns {string} Trimmed destination or ''.
 */
export function normalizeRecordDestination(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalize a numeric limit to a finite value inside the host bounds.
 * @param {unknown} value Raw control value.
 * @param {SettingsLimitBounds} [bounds] Inclusive host bounds.
 * @returns {number|null} Clamped finite number or null when not numeric.
 */
export function normalizeSettingsLimit(value, bounds = {}) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const raw = bounds ?? {};
  const min = typeof raw.min === 'number' && Number.isFinite(raw.min) ? raw.min : Number.NEGATIVE_INFINITY;
  const max = typeof raw.max === 'number' && Number.isFinite(raw.max) ? raw.max : Number.POSITIVE_INFINITY;
  if (min > max) return numeric;
  return Math.min(Math.max(numeric, min), max);
}
