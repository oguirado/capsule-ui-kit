import OpenVue from 'openvue/config';
import Aura from '@openvue/themes/aura';
import tokens from './tokens.json' with {type:'json'};
import {tokenValue} from './tokenContract.js';
/** Aura is an adapter. Semantic values remain CSS references so mounted
 * vendor surfaces (including body-teleported overlays) follow the kit root
 * on every scheme change instead of retaining the preset's initial colours. */
export function createAuraPreset() {
  const scheme = mode => ({...Aura.semantic.colorScheme[mode],
    surface:Object.fromEntries(Object.keys(tokens.primitive.color.neutral).map(shade=>[shade,tokenValue('primitive.color.neutral.'+shade)])),
    primary:{color:'var(--cuk-semantic-text-accent)',contrastColor:'var(--cuk-semantic-surface-canvas)'},
    text:{color:'var(--cuk-semantic-text-primary)',mutedColor:'var(--cuk-semantic-text-muted)'},
    overlay:Object.fromEntries(['select','popover','modal'].map(kind=>[kind,{...Aura.semantic.colorScheme[mode].overlay[kind],background:'var(--cuk-semantic-surface-elevated)',borderColor:'var(--cuk-semantic-border-default)',color:'var(--cuk-semantic-text-primary)'}])),
    content:{background:'var(--cuk-semantic-surface-panel)',borderColor:'var(--cuk-semantic-border-default)',color:'var(--cuk-semantic-text-primary)'}
  });
  return {...Aura,semantic:{...Aura.semantic,colorScheme:{light:scheme('light'),dark:scheme('dark')}}};
}
/** Marker proving the kit theme was installed on the app instance (PL2 F1). @type {symbol} */
export const KIT_THEME_INSTALLED = Symbol.for('capsule-ui-kit.theme.installed');
/**
 * Install the kit theme exactly once; later calls are no-ops so boot can
 * safely ensure installation before mount without double registration.
 * Call before app.mount() so every capsule paints themed (PL2 F1).
 * @param {*} app Vue app instance.
 * @returns {*} The app instance.
 */
export function installKitTheme(app) {
  if (app && app[KIT_THEME_INSTALLED]) return app;
  const nonce=document.querySelector('meta[name$="-style-nonce"]')?.getAttribute('content');
  if(!nonce)throw new Error('Style nonce unavailable');
  app.use(OpenVue,{csp:{nonce},theme:{preset:createAuraPreset(),options:{darkModeSelector:':root[data-theme-scheme$="dark"]'}}});
  app[KIT_THEME_INSTALLED]=true;
  return app;
}
/**
 * @param {*} app Vue app instance or nothing.
 * @returns {boolean} True when installKitTheme already ran on the instance.
 */
export function isKitThemeInstalled(app) {
  return !!app && app[KIT_THEME_INSTALLED] === true;
}
export const KIT_SCHEMES = Object.freeze(['light','dark','saas-dark','saas-light','mv-light','mv-dark']);
/** Select a kit scheme; S1 dark and S7 light stay the default.
 * @param {string} scheme
 * @param {{dataset: DOMStringMap}} [root]
 */
export function setKitScheme(scheme, root = document.documentElement) {
  if (!KIT_SCHEMES.includes(scheme)) throw new Error('Unknown scheme');
  root.dataset.themeScheme=scheme; root.dataset.themeContrast='normal';
  root.dataset.density ||= 'compact';root.dataset.themeDensity=root.dataset.density;
}
