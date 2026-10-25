import OpenVue from 'openvue/config';
import Aura from '@openvue/themes/aura';
import tokens from './tokens.json' with {type:'json'};
import {tokenValue} from './tokenContract.js';
/** Aura is an adapter. Every scheme consumes the same kit semantic authority. */
export function createAuraPreset() {
  const scheme = mode => ({...Aura.semantic.colorScheme[mode],
    surface:Object.fromEntries(Object.keys(tokens.primitive.color.neutral).map(shade=>[shade,tokenValue('primitive.color.neutral.'+shade)])),
    primary:{color:tokenValue('semantic.text.accent',mode+'.normal'),contrastColor:tokenValue('semantic.surface.canvas',mode+'.normal')},
    text:{color:tokenValue('semantic.text.primary',mode+'.normal'),mutedColor:tokenValue('semantic.text.muted',mode+'.normal')},
    content:{background:tokenValue('semantic.surface.panel',mode+'.normal'),borderColor:tokenValue('semantic.border.default',mode+'.normal'),color:tokenValue('semantic.text.primary',mode+'.normal')}
  });
  return {...Aura,semantic:{...Aura.semantic,colorScheme:{light:scheme('light'),dark:scheme('dark')}}};
}
export function installKitTheme(app) {
  const nonce=document.querySelector('meta[name$="-style-nonce"]')?.getAttribute('content');
  if(!nonce)throw new Error('Style nonce unavailable');
  app.use(OpenVue,{csp:{nonce},theme:{preset:createAuraPreset()}});
}
export const KIT_SCHEMES = Object.freeze(['light','dark','saas-dark','saas-light']);
/** Select a kit scheme; S1 dark and S7 light stay the default.
 * @param {string} scheme
 * @param {{dataset: DOMStringMap}} [root]
 */
export function setKitScheme(scheme, root = document.documentElement) {
  if (!KIT_SCHEMES.includes(scheme)) throw new Error('Unknown scheme');
  root.dataset.themeScheme=scheme; root.dataset.themeContrast='normal';
  root.dataset.density ||= 'compact';root.dataset.themeDensity=root.dataset.density;
}
