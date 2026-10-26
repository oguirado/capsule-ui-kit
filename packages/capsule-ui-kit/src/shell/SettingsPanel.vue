<script setup>
import { computed, nextTick, ref } from 'vue';
import InfoIcon from '@openvue/icons/infocircle';
import UiButton from '../ui/UiButton.vue';
import UiField from '../ui/UiField.vue';
import { DENSITY_OPTIONS, SCHEME_OPTIONS, SECTION_LABELS, SETTINGS_SECTIONS, normalizeRecordDestination, normalizeSettingsLimit, resolveSettingsOptionId } from './SettingsModel.js';

/**
 * Generic S1 settings panel (Stitch S6 settings workspace). No application
 * names: the host supplies shortcuts, about facts and the current values,
 * and applies every change (scheme, density, layout restore). Controlled
 * props with `update:*` events; the active section is internal state.
 * @module shell/SettingsPanel
 */

/**
 * @typedef {import('./SettingsModel.js').SettingsOption} SettingsOption
 * @typedef {import('./SettingsModel.js').ShortcutEntry} ShortcutEntry
 */

/**
 * @typedef {object} AboutFacts
 * @property {string} [product] Product name.
 * @property {string} [version] Product version.
 * @property {string} [license] License line.
 * @property {string} [updateStatus] Update state line.
 */

const props = defineProps({
  scheme: { type: String, default: 'dark' },
  density: { type: String, default: 'compact' },
  snapToGrid: { type: Boolean, default: true },
  aiTerminal: { type: Boolean, default: false },
  aiTitle: { type: String, default: 'Permit Autonomous Agent Execution' },
  aiDescription: { type: String, default: 'Allow assisted sessions to run approved workspace commands on your behalf.' },
  aiWarning: { type: String, default: 'Autonomous actions run without a confirmation step. Enable only on trusted workstations.' },
  shortcuts: { type: Array, default: () => [] },
  about: { type: Object, default: () => ({}) },
  section: { type: String, default: 'appearance' },
  schemeOptions: { type: Array, default: () => SCHEME_OPTIONS },
  densityOptions: { type: Array, default: () => DENSITY_OPTIONS },
  theme: { type: String, default: '' },
  themeOptions: { type: Array, default: () => [] },
  themeLabel: { type: String, default: 'Theme' },
  provider: { type: String, default: '' },
  providerOptions: { type: Array, default: () => [] },
  providerLabel: { type: String, default: 'Provider' },
  recordDestination: { type: String, default: '' },
  recordDestinationOptions: { type: Array, default: () => [] },
  recordDestinationLabel: { type: String, default: 'Record destination' },
  recordDestinationHelp: { type: String, default: 'Destinations come from the host recording capability.' },
  limit: { type: Number, default: undefined },
  limitMin: { type: Number, default: 1 },
  limitMax: { type: Number, default: 100 },
  limitStep: { type: Number, default: 1 },
  limitLabel: { type: String, default: 'Limits' },
});
const emit = defineEmits([
  'update:scheme',
  'update:density',
  'update:snap-to-grid',
  'update:ai-terminal',
  'update:theme',
  'update:provider',
  'update:record-destination',
  'update:limit',
  'restore-layout',
  'reset-layout',
  'check-updates',
  'open-licences',
  'section-change',
]);

const active = ref(SETTINGS_SECTIONS.includes(props.section) ? props.section : 'appearance');
/** @type {import('vue').ComputedRef<ShortcutEntry[]>} */
const shortcutList = computed(() => /** @type {ShortcutEntry[]} */ (/** @type {unknown} */ (props.shortcuts)));
/** @type {import('vue').ComputedRef<SettingsOption[]>} */
const schemes = computed(() => /** @type {SettingsOption[]} */ (/** @type {unknown} */ (props.schemeOptions)));
/** @type {import('vue').ComputedRef<SettingsOption[]>} */
const densities = computed(() => /** @type {SettingsOption[]} */ (/** @type {unknown} */ (props.densityOptions)));
/** @type {import('vue').ComputedRef<AboutFacts>} */
const facts = computed(() => /** @type {AboutFacts} */ (/** @type {unknown} */ (props.about ?? {})));
/** @type {import('vue').ComputedRef<SettingsOption[]>} */
const themeList = computed(() => /** @type {SettingsOption[]} */ (/** @type {unknown} */ (props.themeOptions)));
const themeValue = computed(() => resolveSettingsOptionId(themeList.value, props.theme));
/** @type {import('vue').ComputedRef<SettingsOption[]>} */
const providerList = computed(() => /** @type {SettingsOption[]} */ (/** @type {unknown} */ (props.providerOptions)));
/** @type {import('vue').ComputedRef<SettingsOption[]>} */
const recordDestinationList = computed(() => /** @type {SettingsOption[]} */ (/** @type {unknown} */ (props.recordDestinationOptions)));
const recordDestinationVisible = computed(() => normalizeRecordDestination(props.recordDestination) !== '' || recordDestinationList.value.length > 0);
const limitShown = computed(() => typeof props.limit === 'number' && Number.isFinite(props.limit));

/** @param {string} id */
function goto(id) {
  active.value = id;
  emit('section-change', id);
}
/** Keep controlled inputs consistent when the host refuses an update.
 * @param {Event} event
 * @param {'snap'|'ai'} kind
 */
async function changeToggle(event, kind) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  if (kind === 'snap') emit('update:snap-to-grid', input.checked);
  else emit('update:ai-terminal', input.checked);
  await nextTick();
  input.checked = kind === 'snap' ? props.snapToGrid : props.aiTerminal;
}
/** Commit a host-supplied select/text control; restore the DOM value when
 * the host refuses the update (controlled props).
 * @param {Event} event Change event from the control.
 * @param {'theme'|'record-destination'} name Which control.
 */
async function changeHostSetting(event, name) {
  const input = /** @type {HTMLSelectElement|HTMLInputElement} */ (event.target);
  if (name === 'theme') emit('update:theme', input.value);
  else emit('update:record-destination', input.value);
  await nextTick();
  input.value = name === 'theme' ? themeValue.value : props.recordDestination;
}
/** Commit the numeric limit clamped to the host bounds; restore the DOM
 * value when the input is not a number or the host refuses the update.
 * @param {Event} event Change event from the control.
 */
async function changeLimit(event) {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const next = normalizeSettingsLimit(input.valueAsNumber, { min: props.limitMin, max: props.limitMax });
  if (next === null) {
    await nextTick();
    input.value = limitShown.value ? String(props.limit) : '';
    return;
  }
  emit('update:limit', next);
  await nextTick();
  input.value = limitShown.value ? String(props.limit) : String(next);
}
</script>
<template>
  <div class="s1-set">
    <nav class="s1-set-nav" aria-label="Settings sections">
      <UiButton
        v-for="id in SETTINGS_SECTIONS"
        :key="id"
        :id="'shell/settings/nav-' + id"
        :data-semantic-anchor="'settings/nav-' + id"
        :label="SECTION_LABELS[id] ?? id"
        :aria-label="SECTION_LABELS[id] ?? id"
        :aria-current="active === id ? 'page' : undefined"
        class="s1-set-navbtn"
        :class="{ 's1-set-navbtn-active': active === id }"
        @click="goto(id)"
      />
    </nav>
    <div class="s1-set-body">
      <section v-if="active === 'appearance'" id="shell/settings/section-appearance" aria-labelledby="shell/settings/heading-appearance" class="s1-set-section">
        <h2 id="shell/settings/heading-appearance" class="s1-set-heading">Appearance &amp; Canvas Density</h2>
        <p class="s1-set-lede">Control visual cadence, workspace contrast, and typographic vertical rhythm.</p>
        <fieldset class="s1-set-group">
          <legend class="s1-set-legend">Active Color Palette</legend>
          <label v-for="option in schemes" :key="option.id" class="s1-set-option" :class="{ 's1-set-option-active': scheme === option.id }">
            <input
              type="radio"
              name="settings-scheme"
              :id="'shell/settings/scheme-' + option.id"
              :data-semantic-anchor="'settings/scheme-' + option.id"
              :aria-label="option.label"
              :value="option.id"
              :checked="scheme === option.id"
              @change="emit('update:scheme', option.id)"
            />
            <span class="s1-set-option-text">
              <span class="s1-set-option-label">{{ option.label }}</span>
              <span v-if="option.detail" class="s1-set-option-detail">{{ option.detail }}</span>
            </span>
          </label>
        </fieldset>
        <fieldset class="s1-set-group">
          <legend class="s1-set-legend">Density Mode</legend>
          <label v-for="option in densities" :key="option.id" class="s1-set-option" :class="{ 's1-set-option-active': density === option.id }">
            <input
              type="radio"
              name="settings-density"
              :id="'shell/settings/density-' + option.id"
              :data-semantic-anchor="'settings/density-' + option.id"
              :aria-label="option.label"
              :value="option.id"
              :checked="density === option.id"
              @change="emit('update:density', option.id)"
            />
            <span class="s1-set-option-text">
              <span class="s1-set-option-label">{{ option.label }}</span>
              <span v-if="option.detail" class="s1-set-option-detail">{{ option.detail }}</span>
            </span>
          </label>
        </fieldset>
        <div v-if="themeList.length > 0" class="s1-set-card">
          <UiField :label="themeLabel" for-id="shell/settings/theme">
            <select
              id="shell/settings/theme"
              data-semantic-anchor="settings/theme"
              :value="themeValue"
              :aria-label="themeLabel"
              @change="changeHostSetting($event, 'theme')"
            >
              <option v-for="option in themeList" :key="option.id" :value="option.id">{{ option.label }}</option>
            </select>
          </UiField>
        </div>
        <p class="s1-set-note">Affects data row height, typography leading, and padding across all operational capsules.</p>
      </section>
      <section v-if="active === 'workspace'" id="shell/settings/section-workspace" aria-labelledby="shell/settings/heading-workspace" class="s1-set-section">
        <h2 id="shell/settings/heading-workspace" class="s1-set-heading">Workspace Orchestration</h2>
        <div class="s1-set-card">
          <h3 class="s1-set-subheading">Restore Default Layout</h3>
          <p class="s1-set-note">Reset all docked, floating, and minimized capsules to the standard grid. Session variables and runtime state are preserved.</p>
          <UiButton
            id="shell/settings/restore-layout"
            data-semantic-anchor="settings/restore-layout"
            label="Restore Default Layout"
            aria-label="Restore Default Layout"
            class="s1-set-action"
            @click="emit('restore-layout')"
          />
        </div>
        <div class="s1-set-card">
          <h3 class="s1-set-subheading">Reset Layout to Factory Spec</h3>
          <p class="s1-set-note">Discard every layout override and return to the shipped workspace arrangement.</p>
          <UiButton
            id="shell/settings/reset-layout"
            data-semantic-anchor="settings/reset-layout"
            label="Reset Layout to Factory Spec"
            aria-label="Reset Layout to Factory Spec"
            class="s1-set-action"
            @click="emit('reset-layout')"
          />
        </div>
        <div class="s1-set-card">
          <UiField label="Grid Snapping (4px Grid Rhythm)" for-id="shell/settings/snap" help="Forces window edges to adhere to system units.">
            <input
              type="checkbox"
              id="shell/settings/snap"
              data-semantic-anchor="settings/snap-grid"
              :checked="snapToGrid"
              @change="changeToggle($event, 'snap')"
            />
          </UiField>
        </div>
      </section>
      <section v-if="active === 'ai-terminal'" id="shell/settings/section-ai-terminal" aria-labelledby="shell/settings/heading-ai-terminal" class="s1-set-section">
        <h2 id="shell/settings/heading-ai-terminal" class="s1-set-heading">AI Terminal Mode &amp; Agent Autonomy</h2>
        <div class="s1-set-card">
          <UiField :label="aiTitle" for-id="shell/settings/ai-terminal" :help="aiDescription">
            <input
              type="checkbox"
              id="shell/settings/ai-terminal"
              data-semantic-anchor="settings/ai-terminal"
              :checked="aiTerminal"
              @change="changeToggle($event, 'ai')"
            />
          </UiField>
          <p class="s1-set-warning" role="note">{{ aiWarning }}</p>
        </div>
        <div v-if="providerList.length > 0" class="s1-set-card">
          <fieldset id="shell/settings/providers" data-semantic-anchor="settings/providers" class="s1-set-group">
            <legend class="s1-set-legend">{{ providerLabel }}</legend>
            <label v-for="option in providerList" :key="option.id" class="s1-set-option" :class="{ 's1-set-option-active': provider === option.id }">
              <input
                type="radio"
                name="settings-provider"
                :aria-label="option.label"
                :value="option.id"
                :checked="provider === option.id"
                @change="emit('update:provider', option.id)"
              />
              <span class="s1-set-option-text">
                <span class="s1-set-option-label">{{ option.label }}</span>
                <span v-if="option.detail" class="s1-set-option-detail">{{ option.detail }}</span>
              </span>
            </label>
          </fieldset>
        </div>
        <div v-if="recordDestinationVisible" class="s1-set-card">
          <UiField :label="recordDestinationLabel" for-id="shell/settings/record-destination" :help="recordDestinationHelp">
            <input
              type="text"
              id="shell/settings/record-destination"
              data-semantic-anchor="settings/record-destination"
              :value="recordDestination"
              :aria-label="recordDestinationLabel"
              :list="recordDestinationList.length > 0 ? 'shell/settings/record-destination-list' : undefined"
              @change="changeHostSetting($event, 'record-destination')"
            />
            <datalist v-if="recordDestinationList.length > 0" id="shell/settings/record-destination-list">
              <option v-for="option in recordDestinationList" :key="option.id" :value="option.id">{{ option.label }}</option>
            </datalist>
          </UiField>
        </div>
        <div v-if="limitShown" class="s1-set-card">
          <UiField :label="limitLabel" for-id="shell/settings/limits">
            <input
              type="number"
              id="shell/settings/limits"
              data-semantic-anchor="settings/limits"
              :value="limit"
              :aria-label="limitLabel"
              :min="limitMin"
              :max="limitMax"
              :step="limitStep"
              @change="changeLimit"
            />
          </UiField>
        </div>
      </section>
      <section v-if="active === 'shortcuts'" id="shell/settings/section-shortcuts" aria-labelledby="shell/settings/heading-shortcuts" class="s1-set-section">
        <h2 id="shell/settings/heading-shortcuts" class="s1-set-heading">Keyboard Shortcuts</h2>
        <ul id="shell/settings/shortcuts-list" data-semantic-anchor="settings/shortcuts" class="s1-set-shortcuts">
          <li v-for="entry in shortcutList" :key="entry.id" class="s1-set-shortcut">
            <span class="s1-set-shortcut-label">{{ entry.label }}</span>
            <kbd class="s1-set-kbd">{{ entry.kbd }}</kbd>
          </li>
        </ul>
        <p v-if="shortcutList.length === 0" role="status" class="s1-set-note">No shortcuts registered.</p>
      </section>
      <section v-if="active === 'about'" id="shell/settings/section-about" aria-labelledby="shell/settings/heading-about" class="s1-set-section">
        <h2 id="shell/settings/heading-about" class="s1-set-heading">About</h2>
        <dl class="s1-set-about">
          <div v-if="facts.product" class="s1-set-fact">
            <dt>Product</dt>
            <dd>{{ facts.product }}</dd>
          </div>
          <div v-if="facts.version" class="s1-set-fact">
            <dt>Version</dt>
            <dd>{{ facts.version }}</dd>
          </div>
          <div v-if="facts.license" class="s1-set-fact">
            <dt>License</dt>
            <dd>{{ facts.license }}</dd>
          </div>
          <div v-if="facts.updateStatus" class="s1-set-fact">
            <dt>Updates</dt>
            <dd role="status">{{ facts.updateStatus }}</dd>
          </div>
        </dl>
        <div class="s1-set-actions">
          <UiButton
            id="shell/settings/check-updates"
            data-semantic-anchor="settings/check-updates"
            label="Check for Updates"
            aria-label="Check for Updates"
            class="s1-set-action"
            @click="emit('check-updates')"
          />
          <UiButton
            id="shell/settings/licences"
            data-semantic-anchor="about/licences"
            label="View licences"
            aria-label="View licences"
            class="s1-set-action"
            @click="emit('open-licences')"
          >
            <InfoIcon aria-hidden="true" />
            <span>View licences</span>
          </UiButton>
        </div>
      </section>
    </div>
  </div>
</template>
<style>
.s1-set{display: flex; flex-wrap: wrap; gap: var(--cuk-semantic-spacing-xl); align-items: flex-start;}
.s1-set .s1-set-nav{
  flex: none; width: var(--cuk-semantic-size-rail-expanded-width);
  display: flex; flex-direction: column; gap: var(--cuk-primitive-space-1);
  padding: var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-md);
}
.s1-set .s1-set-navbtn{justify-content: flex-start; text-align: left;}
.s1-set .s1-set-navbtn-active{
  background: var(--cuk-semantic-selection-background);
  color: var(--cuk-semantic-text-primary);
  font-weight: var(--cuk-semantic-typography-font-weight-medium);
}
.s1-set .s1-set-body{flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--cuk-semantic-spacing-lg);}
.s1-set .s1-set-section{
  display: flex; flex-direction: column; gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-lg);
  background: var(--cuk-semantic-surface-panel);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-lg);
}
.s1-set .s1-set-heading{
  margin: 0;
  font-size: var(--cuk-semantic-typography-roles-headline-sm-font-size);
  line-height: var(--cuk-semantic-typography-roles-headline-sm-line-height);
  font-weight: var(--cuk-semantic-typography-roles-headline-sm-font-weight);
  font-family: var(--cuk-semantic-typography-roles-headline-sm-font-family);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-lede,.s1-set .s1-set-note{
  margin: 0;
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-set .s1-set-group{
  margin: 0; padding: var(--cuk-semantic-spacing-md);
  display: flex; flex-direction: column; gap: var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-md);
}
.s1-set .s1-set-legend{
  padding: 0 var(--cuk-primitive-space-2);
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-option{
  display: flex; align-items: flex-start;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  cursor: pointer;
}
.s1-set .s1-set-option:hover{background: var(--cuk-semantic-surface-hover-s1);}
.s1-set .s1-set-option-active{
  border-color: var(--cuk-semantic-accent-primary);
  background: var(--cuk-semantic-selection-background);
}
.s1-set .s1-set-option input{
  margin: 0; flex: none;
  width: var(--cuk-semantic-size-control-icon-size);
  height: var(--cuk-semantic-size-control-icon-size);
  accent-color: var(--cuk-semantic-accent-primary);
}
.s1-set .s1-set-option-text{display: flex; flex-direction: column; gap: var(--cuk-primitive-space-1);}
.s1-set .s1-set-option-label{
  font-size: var(--cuk-semantic-typography-roles-body-md-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-option-detail{
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-set .s1-set-card{
  display: flex; flex-direction: column; gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-md);
}
.s1-set .s1-set-subheading{
  margin: 0;
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  font-weight: var(--cuk-semantic-typography-roles-label-md-font-weight);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-card input[type="checkbox"]{
  width: var(--cuk-semantic-size-control-icon-size);
  height: var(--cuk-semantic-size-control-icon-size);
  accent-color: var(--cuk-semantic-accent-primary);
}
.s1-set .s1-set-card select,
.s1-set .s1-set-card input[type="text"],
.s1-set .s1-set-card input[type="number"]{
  width: 100%;
  padding: var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-body-md-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-warning{
  margin: 0; padding: var(--cuk-semantic-spacing-md);
  background: var(--cuk-semantic-status-warning-surface);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-status-warning-border);
  border-radius: var(--cuk-semantic-radius-sm);
  font-size: var(--cuk-semantic-typography-roles-body-sm-font-size);
  color: var(--cuk-semantic-status-warning-text);
}
.s1-set .s1-set-shortcuts{
  margin: 0; padding: 0; list-style: none;
  display: flex; flex-direction: column;
}
.s1-set .s1-set-shortcut{
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-3) 0;
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  font-size: var(--cuk-semantic-typography-roles-body-md-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-kbd{
  padding: var(--cuk-primitive-space-1) var(--cuk-primitive-space-2);
  background: var(--cuk-semantic-surface-elevated);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-xs);
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-font-size-s1_10);
  color: var(--cuk-semantic-text-muted);
  white-space: nowrap;
}
.s1-set .s1-set-about{margin: 0; display: flex; flex-direction: column;}
.s1-set .s1-set-fact{
  display: flex; justify-content: space-between;
  gap: var(--cuk-semantic-spacing-md);
  padding: var(--cuk-primitive-space-3) 0;
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
.s1-set .s1-set-fact dt{
  margin: 0;
  font-size: var(--cuk-semantic-typography-roles-label-md-font-size);
  color: var(--cuk-semantic-text-muted);
}
.s1-set .s1-set-fact dd{
  margin: 0; text-align: right;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-code-sm-font-size);
  color: var(--cuk-semantic-text-primary);
}
.s1-set .s1-set-actions{display: flex; flex-wrap: wrap; gap: var(--cuk-semantic-spacing-md);}
.s1-set .s1-set-action{display: inline-flex; align-items: center; gap: var(--cuk-primitive-space-2);}
.s1-set .s1-set-action svg{
  width: var(--cuk-semantic-typography-font-size-s1_14);
  height: var(--cuk-semantic-typography-font-size-s1_14);
}
.s1-set :focus-visible{
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-component-app-shell-space-hairline);
}
</style>
