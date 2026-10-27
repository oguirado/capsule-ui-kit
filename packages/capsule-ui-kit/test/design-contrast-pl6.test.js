import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';

// PL6 NEW-2 + P5 (+ lane M chips/close): every walked pair holds its
// threshold in every scheme. Token values are pinned by the legacy
// snapshots, so the rooms fix the component-to-token mapping; these tests
// pin the mapping and the ratios. Thresholds: 4.5:1 text, 3:1 UI
// (aria-hidden adornments redundant with the accessible name).

// Every scheme the kit ships, in both contrast modes.
const MODES = Object.freeze([
  'dark.normal', 'dark.high',
  'light.normal', 'light.high',
  'saas-dark.normal', 'saas-dark.high',
  'saas-light.normal', 'saas-light.high',
  'mv-dark.normal', 'mv-dark.high',
  'mv-light.normal', 'mv-light.high',
]);

const root = new URL('../', import.meta.url);
const text = (path) => readFileSync(new URL(path, root), 'utf8');
const tokens = JSON.parse(text('src/design/tokens.json'));
const css = text('src/design/theme.css');

/**
 * Relative luminance of an opaque hex color.
 * @param {string} hex Opaque sRGB hex color.
 * @returns {number} Relative luminance.
 */
function luminance(hex) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/**
 * WCAG contrast ratio of two opaque hex colors.
 * @param {string} a First color.
 * @param {string} b Second color.
 * @returns {number} Contrast ratio.
 */
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Parse a hex or rgb()/rgba() color token value.
 * @param {string} color Token value.
 * @returns {[number, number, number, number]} RGBA channels.
 */
function parseColor(color) {
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) {
    const channels = color.slice(1).match(/../g).map((x) => parseInt(x, 16));
    return [...channels, 1];
  }
  return rgba[1].split(',').map(Number);
}

/**
 * Composite a translucent foreground over an opaque background.
 * @param {string} fg Foreground token value.
 * @param {string} bg Opaque background token value.
 * @returns {string} Opaque hex result.
 */
function compositeOver(fg, bg) {
  const [r1, g1, b1, a1] = parseColor(fg);
  const [r2, g2, b2] = parseColor(bg);
  const mix = (f, b) => Math.round(f * a1 + b * (1 - a1));
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Painted NEW-pill fill: color-mix(in srgb, X 30%, transparent) over the
 * opaque panel equals the container at alpha 0.3 over the panel.
 * @param {string} mode Token mode.
 * @returns {string} Opaque hex fill.
 */
function newPillFill(mode) {
  const [r, g, b] = parseColor(tokenValue('semantic.accent.tertiaryContainer', mode));
  return compositeOver(`rgba(${r},${g},${b},0.3)`, tokenValue('semantic.surface.panel', mode));
}

test('token contract validates for the PL6 pairs', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0);
});

test('PL6 nav labels reach 4.5:1 in every scheme (NEW-2)', () => {
  // Item labels, group captions and the sidebar divider share the
  // muted-on-panel pair.
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(ratio >= 4.5, `${mode}/nav-label: ${ratio}`);
  }
});

test('PL6 active label reaches 4.5:1 in every scheme (NEW-2)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.primary', mode), tokenValue('semantic.surface.elevated', mode));
    assert.ok(ratio >= 4.5, `${mode}/active-label: ${ratio}`);
  }
});

test('PL6 count badge reaches 4.5:1 in every scheme (NEW-2)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.elevated', mode));
    assert.ok(ratio >= 4.5, `${mode}/count-badge: ${ratio}`);
  }
});

test('PL6 unread badge reaches 4.5:1 in every scheme (NEW-2)', () => {
  for (const mode of MODES) {
    const ratio = contrast(
      tokenValue('semantic.accent.onSecondaryContainer', mode),
      tokenValue('semantic.accent.secondaryContainer', mode),
    );
    assert.ok(ratio >= 4.5, `${mode}/unread-badge: ${ratio}`);
  }
});

test('PL6 NEW pill reaches 3:1 in every scheme (NEW-2)', () => {
  // The pill repeats the row accessible name and is aria-hidden, so the
  // decorative/UI threshold applies.
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.accent', mode), newPillFill(mode));
    assert.ok(ratio >= 3, `${mode}/new-pill: ${ratio}`);
  }
});

test('PL6 price reaches 4.5:1 and deltas 3:1 in every scheme (NEW-2)', () => {
  // Deltas repeat the row accessible name and are aria-hidden, so the
  // decorative/UI threshold applies to them.
  for (const mode of MODES) {
    const value = contrast(tokenValue('semantic.text.primary', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(value >= 4.5, `${mode}/price: ${value}`);
    const up = contrast(tokenValue('semantic.status.success.icon', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(up >= 3, `${mode}/delta-up: ${up}`);
    const down = contrast(tokenValue('semantic.status.error.text', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(down >= 3, `${mode}/delta-down: ${down}`);
  }
});

test('PL6 bar separators reach 3:1 in every scheme (P5)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.sunken', mode));
    assert.ok(ratio >= 3, `${mode}/bar-separator: ${ratio}`);
  }
});

// Lane M pairs (lane M M2): the terminal session close and the viewer
// chips. Thresholds follow the room contract: 4.5:1 text, 3:1 UI.
test('PL6 terminal close reaches 3:1 in every scheme (lane M)', () => {
  for (const mode of MODES) {
    const ratio = contrast(tokenValue('semantic.text.secondary', mode), tokenValue('semantic.surface.sunken', mode));
    assert.ok(ratio >= 3, `${mode}/close: ${ratio}`);
  }
});

test('PL6 viewer chips reach 4.5:1 in every scheme (lane M)', () => {
  const pairs = [
    ['live', 'semantic.text.primary', 'semantic.status.success.surface'],
    ['endpoint', 'semantic.text.primary', 'semantic.status.info.surface'],
    ['scaled', 'semantic.text.muted', 'semantic.surface.elevated'],
    ['elapsed-panel', 'semantic.text.muted', 'semantic.surface.panel'],
    ['elapsed-chrome', 'semantic.text.muted', 'semantic.surface.chrome'],
  ];
  for (const mode of MODES) {
    for (const [name, fg, bg] of pairs) {
      let back = tokenValue(bg, mode);
      if (back.startsWith('rgba')) back = compositeOver(back, tokenValue('semantic.surface.panel', mode));
      const ratio = contrast(tokenValue(fg, mode), back);
      assert.ok(ratio >= 4.5, `${mode}/${name}: ${ratio}`);
    }
  }
});

test('PL6 lane M components keep the published pairs (coupling)', () => {
  const tabs = ruleBlocks(text('src/terminal/TerminalSessionTabs.vue'), 'TerminalSessionTabs.vue');
  const close = tabs.filter((r) => r.selector.trim() === '.cui-terminal-tabs__close');
  assert.ok(close.length > 0, 'close rule present');
  assert.ok(close[0].body.includes('color: var(--cuk-semantic-text-secondary);'), 'close keeps secondary');
  const chips = ruleBlocks(text('src/saas/SaasViewerChips.vue'), 'SaasViewerChips.vue');
  const live = chips.find((r) => r.selector.includes('saas-viewer-live') && r.body.includes('background:'));
  assert.ok(live, 'live rule present');
  assert.ok(live.body.includes('color: var(--cuk-semantic-text-primary);'), 'live keeps primary');
  assert.ok(live.body.includes('var(--cuk-semantic-status-success-surface)'), 'live keeps success surface');
  const endpoint = chips.find((r) => r.selector.includes('saas-viewer-endpoint') && r.body.includes('background:'));
  assert.ok(endpoint, 'endpoint rule present');
  assert.ok(endpoint.body.includes('color: var(--cuk-semantic-text-primary);'), 'endpoint keeps primary');
  assert.ok(endpoint.body.includes('var(--cuk-semantic-status-info-surface)'), 'endpoint keeps info surface');
});

/**
 * Style rule blocks of a component: selector text plus declaration body.
 * @param {string} source Component source.
 * @param {string} filename Component filename for parse errors.
 * @returns {{ selector: string, body: string }[]} Rule blocks.
 */
function ruleBlocks(source, filename) {
  const { descriptor } = parse(source, { filename });
  const styles = descriptor.styles.map((style) => style.content).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  return Array.from(styles.matchAll(/([^{}]+)\{([^}]*)\}/g)).map((m) => ({ selector: m[1], body: m[2] }));
}

/**
 * Full start tags of one element name in a template, tolerating quoted >.
 * @param {string} template Template source.
 * @param {string} tag Element name.
 * @returns {string[]} Start tags.
 */
function startTags(template, tag) {
  return Array.from(template.matchAll(new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*")*?>`, 'g'))).map((m) => m[0]);
}

test('PL6 expanded nav keeps the panel token in every scheme (NEW-2 coupling)', () => {
  const rules = ruleBlocks(text('src/shell/Sidebar.vue'), 'Sidebar.vue');
  const panel = rules.filter((r) => r.selector.trim() === '.cuk-sidebar' && r.body.includes('background:'));
  assert.ok(panel.length > 0, 'panel rule present');
  for (const rule of panel) {
    assert.ok(rule.body.includes('background: var(--cuk-semantic-surface-panel);'), 'panel keeps the surface token');
  }
  const overlay = rules.find((r) => r.selector.includes('.cuk-sidebar--overlay'));
  assert.ok(overlay, 'expanded overlay rule present');
  assert.ok(overlay.body.includes('background: var(--cuk-semantic-surface-panel);'), 'overlay keeps the surface token');
});

test('PL6 vendor menu nodes stay transparent (NEW-2 coupling)', () => {
  const rules = ruleBlocks(text('src/shell/Sidebar.vue'), 'Sidebar.vue');
  const vendor = rules.find((r) => r.selector.includes('.p-menu-item-content'));
  assert.ok(vendor, 'vendor transparency rule present');
  for (const node of ['.p-menu-list', '.p-menu-submenu-label', '.p-menu-item-content', '.p-menu-separator']) {
    assert.ok(vendor.selector.includes(node), `covers ${node}`);
  }
  assert.ok(vendor.body.includes('background: transparent;'), 'vendor nodes stay transparent');
});

test('PL6 nav keeps the walked token pairs (NEW-2 coupling)', () => {
  const rules = ruleBlocks(text('src/shell/Sidebar.vue'), 'Sidebar.vue');
  const exact = (selector) => rules.filter((r) => r.selector.trim() === selector);
  const labels = exact('.cuk-sidebar__item').filter((r) => r.body.includes('color:'));
  assert.ok(labels.length > 0, 'label rule present');
  for (const rule of labels) {
    assert.ok(rule.body.includes('color: var(--cuk-semantic-text-muted);'), 'label keeps the muted tone');
  }
  for (const selector of ['.cuk-sidebar__workspace-label', '.cuk-sidebar__group']) {
    const caption = exact(selector);
    assert.ok(caption.length > 0, `${selector} rule present`);
    for (const rule of caption) {
      assert.ok(rule.body.includes('color: var(--cuk-semantic-text-muted);'), `${selector} keeps the muted tone`);
    }
  }
  const active = exact('.cuk-sidebar__item--active');
  assert.ok(active.length > 0, 'active rule present');
  assert.ok(active[0].body.includes('background: var(--cuk-semantic-surface-elevated);'), 'active row keeps elevated');
  assert.ok(active[0].body.includes('color: var(--cuk-semantic-text-primary);'), 'active label keeps primary');
  assert.ok(active[0].body.includes('border-left-color: var(--cuk-semantic-accent-primary);'), 'active edge keeps accent');
  const count = exact('.cuk-sidebar__badge--count');
  assert.ok(count.length > 0, 'count rule present');
  assert.ok(count[0].body.includes('background: var(--cuk-semantic-surface-elevated);'), 'count keeps elevated');
  assert.ok(count[0].body.includes('color: var(--cuk-semantic-text-muted);'), 'count keeps muted');
  const unread = exact('.cuk-sidebar__badge--unread');
  assert.ok(unread.length > 0, 'unread rule present');
  assert.ok(unread[0].body.includes('background: var(--cuk-semantic-accent-secondary-container);'), 'unread keeps its fill');
  assert.ok(unread[0].body.includes('color: var(--cuk-semantic-accent-on-secondary-container);'), 'unread keeps its text');
  const pill = exact('.cuk-sidebar__new');
  assert.ok(pill.length > 0, 'NEW pill rule present');
  assert.ok(pill[0].body.includes('color: var(--cuk-semantic-text-accent);'), 'NEW pill keeps accent text');
  assert.ok(
    pill[0].body.includes('var(--cuk-semantic-accent-tertiary-container) 30%'),
    'NEW pill keeps the container fill',
  );
  const price = exact('.cuk-sidebar__price-value');
  assert.ok(price.length > 0, 'price rule present');
  assert.ok(price[0].body.includes('color: var(--cuk-semantic-text-primary);'), 'price keeps primary');
  const divider = rules.find((r) => r.selector.includes('.cuk-sidebar__separator') && r.body.includes('border-top:'));
  assert.ok(divider, 'sidebar divider rule present');
  assert.ok(divider.body.includes('solid var(--cuk-semantic-text-muted);'), 'divider keeps the muted tone');
});

test('PL6 bar separators are aria-hidden and keep the muted tone (P5 coupling)', () => {
  const cases = [
    { file: 'src/shell/TopBar.vue', classes: ['s1-topbar-divider'], property: 'background' },
    { file: 'src/shell/StatusBar.vue', classes: ['s1-statusbar-sep', 's1-statusbar-bullet'], property: 'color' },
  ];
  for (const { file, classes, property } of cases) {
    const source = text(file);
    const { descriptor } = parse(source, { filename: file });
    assert.ok(descriptor.template, `${file}: template present`);
    const tags = startTags(descriptor.template.content, 'span');
    for (const cls of classes) {
      const uses = tags.filter((tag) => tag.includes(cls));
      assert.ok(uses.length > 0, `${file}: .${cls} used`);
      for (const tag of uses) assert.ok(tag.includes('aria-hidden="true"'), `${file}: .${cls} aria-hidden`);
      const styles = descriptor.styles.map((style) => style.content).join('\n');
      const rule = styles.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
      assert.ok(rule, `${file}: .${cls} rule present`);
      assert.ok(
        rule[1].includes(`${property}: var(--cuk-semantic-text-muted);`),
        `${file}: .${cls} keeps the muted tone`,
      );
    }
  }
});

/**
 * Painted value of a theme variable under one scheme block: base :root
 * declarations plus the scheme/contrast overrides, var() chains resolved.
 */
const PAINTED_VARS = Object.freeze({
  '--cuk-semantic-surface-panel': 'semantic.surface.panel',
  '--cuk-semantic-surface-sunken': 'semantic.surface.sunken',
  '--cuk-semantic-surface-elevated': 'semantic.surface.elevated',
  '--cuk-semantic-text-primary': 'semantic.text.primary',
  '--cuk-semantic-text-muted': 'semantic.text.muted',
  '--cuk-semantic-text-accent': 'semantic.text.accent',
  '--cuk-semantic-text-secondary': 'semantic.text.secondary',
  '--cuk-semantic-surface-chrome': 'semantic.surface.chrome',
  '--cuk-semantic-status-success-surface': 'semantic.status.success.surface',
  '--cuk-semantic-status-info-surface': 'semantic.status.info.surface',
  '--cuk-semantic-accent-secondary-container': 'semantic.accent.secondaryContainer',
  '--cuk-semantic-accent-on-secondary-container': 'semantic.accent.onSecondaryContainer',
  '--cuk-semantic-accent-tertiary-container': 'semantic.accent.tertiaryContainer',
  '--cuk-semantic-status-success-icon': 'semantic.status.success.icon',
  '--cuk-semantic-status-error-text': 'semantic.status.error.text',
});

/**
 * Declarations of the base :root block merged with one scheme block.
 * @param {string} scheme Scheme name.
 * @param {string} contrastMode Contrast mode.
 * @returns {Map<string, string>} Variable declarations.
 */
function schemeDeclarations(scheme, contrastMode) {
  const blocks = Array.from(css.matchAll(/(:root(?:\[[^\]]+\])*)\s*\{([^}]*)\}/g)).map((m) => ({
    selector: m[1],
    body: m[2],
  }));
  const read = (body) => new Map(Array.from(body.matchAll(/(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g)).map((m) => [m[1], m[2].trim()]));
  const base = read(blocks.find((b) => b.selector === ':root').body);
  const scoped = blocks.find((b) => b.selector === `:root[data-theme-scheme="${scheme}"][data-theme-contrast="${contrastMode}"]`);
  assert.ok(scoped, `scheme block present: ${scheme}.${contrastMode}`);
  return new Map([...base, ...read(scoped.body)]);
}

/**
 * Resolve a variable through var() chains to its painted value.
 * @param {Map<string, string>} declarations Declarations.
 * @param {string} name Variable name.
 * @param {Set<string>} [seen] Cycle guard.
 * @returns {string} Painted value.
 */
function paintedValue(declarations, name, seen = new Set()) {
  assert.ok(!seen.has(name), `variable cycle: ${name}`);
  const value = declarations.get(name);
  assert.ok(value !== undefined, `variable declared: ${name}`);
  return value.replace(/var\((--[A-Za-z0-9-_]+)\)/g, (_, ref) => paintedValue(declarations, ref, new Set([...seen, name])));
}

test('PL6 painted theme matches the token contract on the walked pairs', () => {
  // Guards the token-green/pixel-red gap class: the browser paints theme.css,
  // so every walked variable must resolve to the contracted token value.
  for (const scheme of ['dark', 'light', 'saas-dark', 'saas-light', 'mv-dark', 'mv-light']) {
    for (const contrastMode of ['normal', 'high']) {
      const declarations = schemeDeclarations(scheme, contrastMode);
      const mode = `${scheme}.${contrastMode}`;
      for (const [variable, path] of Object.entries(PAINTED_VARS)) {
        assert.equal(paintedValue(declarations, variable), tokenValue(path, mode), `${mode}/${variable}`);
      }
    }
  }
});

test('PL6 painted nav pairs hold their thresholds in every scheme', () => {
  for (const scheme of ['dark', 'light', 'saas-dark', 'saas-light', 'mv-dark', 'mv-light']) {
    for (const contrastMode of ['normal', 'high']) {
      const declarations = schemeDeclarations(scheme, contrastMode);
      const mode = `${scheme}.${contrastMode}`;
      const paint = (variable) => paintedValue(declarations, variable);
      const panel = paint('--cuk-semantic-surface-panel');
      assert.ok(contrast(paint('--cuk-semantic-text-muted'), panel) >= 4.5, `${mode}/painted-nav-label`);
      assert.ok(contrast(paint('--cuk-semantic-text-muted'), paint('--cuk-semantic-surface-sunken')) >= 3, `${mode}/painted-separator`);
      assert.ok(contrast(paint('--cuk-semantic-text-primary'), paint('--cuk-semantic-surface-elevated')) >= 4.5, `${mode}/painted-active`);
      const [r, g, b] = parseColor(paint('--cuk-semantic-accent-tertiary-container'));
      const fill = compositeOver(`rgba(${r},${g},${b},0.3)`, panel);
      assert.ok(contrast(paint('--cuk-semantic-text-accent'), fill) >= 3, `${mode}/painted-new-pill`);
    }
  }
});

test('PL6 painted lane M pairs hold their thresholds in every scheme', () => {
  for (const scheme of ['dark', 'light', 'saas-dark', 'saas-light', 'mv-dark', 'mv-light']) {
    for (const contrastMode of ['normal', 'high']) {
      const declarations = schemeDeclarations(scheme, contrastMode);
      const mode = `${scheme}.${contrastMode}`;
      const paint = (variable) => paintedValue(declarations, variable);
      const panel = paint('--cuk-semantic-surface-panel');
      const solid = (value) => (value.startsWith('rgba') ? compositeOver(value, panel) : value);
      assert.ok(contrast(paint('--cuk-semantic-text-secondary'), paint('--cuk-semantic-surface-sunken')) >= 3, `${mode}/painted-close`);
      assert.ok(contrast(paint('--cuk-semantic-text-primary'), solid(paint('--cuk-semantic-status-success-surface'))) >= 4.5, `${mode}/painted-live`);
      assert.ok(contrast(paint('--cuk-semantic-text-primary'), solid(paint('--cuk-semantic-status-info-surface'))) >= 4.5, `${mode}/painted-endpoint`);
      assert.ok(contrast(paint('--cuk-semantic-text-muted'), paint('--cuk-semantic-surface-elevated')) >= 4.5, `${mode}/painted-scaled`);
      assert.ok(contrast(paint('--cuk-semantic-text-muted'), paint('--cuk-semantic-surface-chrome')) >= 4.5, `${mode}/painted-elapsed`);
    }
  }
});

test('PL6 touched shell compiles as plain JS with tokens only and no consumer names', () => {
  const themeVars = new Set(Array.from(css.matchAll(/^\s*(--cuk-[A-Za-z0-9-_]+)\s*:/gm)).map((m) => m[1]));
  for (const file of ['src/shell/Sidebar.vue', 'src/shell/SidebarIcon.vue', 'src/shell/TopBar.vue', 'src/shell/StatusBar.vue']) {
    const short = file.slice('src/shell/'.length);
    const source = text(file);
    const { descriptor, errors } = parse(source, { filename: short });
    assert.deepEqual(errors, [], file);
    assert.equal(descriptor.script?.lang ?? descriptor.scriptSetup?.lang ?? undefined, undefined, file);
    const script = compileScript(descriptor, { id: 'design-contrast-pl6' });
    const template = compileTemplate({
      source: descriptor.template?.content ?? '',
      filename: short,
      id: 'design-contrast-pl6',
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.deepEqual(template.errors, [], file);
    assert.ok(descriptor.styles.length > 0, file);
    for (const style of descriptor.styles) {
      assert.equal(/(?:#[0-9a-f]{3,8}\b|\b\d*\.?\d+(?:px|rem)\b)/i.test(style.content), false, file);
      for (const match of style.content.matchAll(/var\((--cuk-[A-Za-z0-9-_]+)/g)) {
        assert.ok(themeVars.has(match[1]), `${file}: undeclared token ${match[1]}`);
      }
    }
    assert.ok(!/\u0048oldings|Sequoia|Vanguard|Apex|Meridian|Northgate|Halcyon/.test(source), file);
  }
});

// KWD MV-3/MV-4: pin the actual painted pairs, including high contrast.
for (const [item, file, selector, background, foreground] of [
  ['MV-3', 'src/shell/TopBar.vue', '.s1-topbar .s1-topbar-search', 'canvas', 'muted'],
  ['MV-4', 'src/terminal/TerminalSessionTabs.vue', '.cui-terminal-tabs__empty', 'sunken', 'primary'],
]) {
  test(`${item}: enabled/informational text uses ${foreground} on ${background} in every scheme`, () => {
    const rule = text(file).split(`${selector}{`)[1]?.split('}')[0]
      ?? text(file).split(`${selector} {`)[1]?.split('}')[0];
    assert.ok(rule.includes(`color: var(--cuk-semantic-text-${foreground})`));
    if (item === 'MV-3') {
      assert.ok(rule.includes('background: var(--cuk-semantic-surface-canvas)'));
    } else {
      const parentRule = text(file).split('.cui-terminal-tabs {')[1]?.split('}')[0];
      assert.ok(parentRule.includes('background-color: var(--cuk-semantic-surface-sunken)'));
    }
    for (const mode of MODES) {
      const ratio = contrast(tokenValue(`semantic.text.${foreground}`, mode), tokenValue(`semantic.surface.${background}`, mode));
      assert.ok(ratio >= 4.5, `${item}/${mode}: ${ratio}`);
    }
  });
}
