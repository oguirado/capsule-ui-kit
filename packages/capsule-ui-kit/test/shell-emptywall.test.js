/**
 * @fileoverview Lane E EmptyWall tests: SFC structure, real-SSR render of the
 * compiled component (defaults, slots, secondary fallback), anchor and
 * agent_lane/v1 registry conformance, CSP (no style attributes in rendered
 * HTML), token-only styling, dock-area container responsiveness, WCAG AA
 * contrast in all 12 kit modes, and the 0.2.1 release bump. Plain JS,
 * node:test, no Electron.
 *
 * SSR graph: the real EmptyWall.vue and the real UiButton.vue are compiled
 * with @vue/compiler-sfc and rendered with @vue/server-renderer; only the
 * vendor Button is a button-faithful stub (native `<button>`, attrs
 * spread), so slot flow and the UiButton intent mapping are genuinely
 * exercised while vendor CSS stays out of Node.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { tokenValue, validateTokenContract } from '../src/design/tokenContract.js';
import { matchControlFamily } from '../src/agent/controlRegistry.js';
import {
  EMPTY_WALL_AGENT_LANE_IDS,
  EMPTY_WALL_FAMILY_RULES,
  EMPTY_WALL_REGISTRY_ROWS,
  emptyWallAnchorFor,
  matchEmptyWallControlFamily,
} from '../src/agent/emptyWallRegistryRows.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const kitRoot = path.resolve(__dirname, '..');
const readKit = (relPath) => readFileSync(path.resolve(kitRoot, relPath), 'utf8');

const SFC_REL = 'src/shell/EmptyWall.vue';
const sfcSource = readKit(SFC_REL);
const parsed = parse(sfcSource, { filename: 'EmptyWall.vue' });
assert.equal(parsed.errors.length, 0, 'SFC parse must produce zero errors');
const { descriptor } = parsed;
const template = descriptor.template.content;
const setup = descriptor.scriptSetup.content;
const plainScript = descriptor.script.content;
const style = descriptor.styles.map((entry) => entry.content).join('\n');
const themeCss = readKit('src/design/theme.css');
const tokens = JSON.parse(readKit('src/design/tokens.json'));

// Every scheme the kit ships, in both contrast modes.
const MODES = Object.freeze([
  'dark.normal', 'dark.high',
  'light.normal', 'light.high',
  'saas-dark.normal', 'saas-dark.high',
  'saas-light.normal', 'saas-light.high',
  'mv-dark.normal', 'mv-dark.high',
  'mv-light.normal', 'mv-light.high',
]);

/**
 * @param {string} value Raw regex source.
 * @returns {string} Escaped source.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites bare/relative import specifiers to absolute module URLs.
 * @param {string} code Compiled module code.
 * @param {Array<[string, string]>} rewrites Specifier-to-URL pairs.
 * @returns {string} Rewritten code.
 */
function rewriteImports(code, rewrites) {
  let out = code;
  for (const [spec, url] of rewrites) {
    out = out.replace(new RegExp(`from\\s*(['"])${escapeRegExp(spec)}\\1`, 'g'), `from '${url}'`);
  }
  return out;
}

/**
 * Builds an embeddable module URL. Quotes are encoded too, so the URL nests
 * safely inside another module's import specifier.
 * @param {string} code Module code.
 * @returns {string} Data URL.
 */
function dataUrl(code) {
  return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code).replace(/'/g, '%27');
}

/**
 * Compiles an SFC to an importable module with rewritten imports.
 * @param {string} relPath Kit-relative SFC path.
 * @param {string} id Compile id.
 * @param {Array<[string, string]>} rewrites Specifier-to-URL pairs.
 * @returns {Promise<{ code: string, url: string, namespace: Record<string, any> }>}
 */
async function compileSfcModule(relPath, id, rewrites) {
  const source = readKit(relPath);
  const filename = path.basename(relPath);
  const found = parse(source, { filename });
  assert.equal(found.errors.length, 0, `${filename} parses cleanly`);
  const compiled = compileScript(found.descriptor, { id, inlineTemplate: true });
  const code = rewriteImports(compiled.content, rewrites);
  const url = dataUrl(code);
  return { code, url, namespace: await import(url) };
}

const VUE_URL = import.meta.resolve('vue');

// Button-faithful vendor stub: native button, attrs (id, anchors, aria,
// listeners) spread to the element, default slot preferred like the vendor.
const buttonStubUrl = dataUrl(`
import { h } from '${VUE_URL}';
export default {
  name: 'ButtonStub',
  inheritAttrs: false,
  props: {
    label: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    severity: { type: String, default: undefined },
    size: { type: String, default: undefined },
  },
  setup(props, { slots, attrs }) {
    return () => h('button', {
      ...attrs,
      type: 'button',
      'data-severity': props.severity ?? 'primary',
      'data-loading': String(props.loading),
    }, slots.default ? slots.default() : props.label);
  },
};
`);

const uiButtonModule = await compileSfcModule('src/ui/UiButton.vue', 'cuk-ui-button', [
  ['vue', VUE_URL],
  ['openvue/button', buttonStubUrl],
]);
const emptyWallModule = await compileSfcModule(SFC_REL, 'cuk-shell-empty-wall', [
  ['vue', VUE_URL],
  ['../ui/UiButton.vue', uiButtonModule.url],
]);
const EmptyWall = emptyWallModule.namespace.default;
const { EMPTY_WALL_IDS, EMPTY_WALL_ANCHORS } = emptyWallModule.namespace;

/**
 * @param {Record<string, unknown>} [props] Component props.
 * @param {Record<string, () => unknown>} [slots] Slot render functions.
 * @returns {Promise<string>} Rendered HTML.
 */
async function renderEmptyWall(props = {}, slots = {}) {
  return renderToString(createSSRApp({ render: () => h(EmptyWall, props, slots) }));
}

const htmlDefault = await renderEmptyWall();
const htmlSlotted = await renderEmptyWall({}, {
  'primary-action': () => 'Launch now',
  'secondary-action': () => 'Learn more',
});
const htmlSecondaryLabel = await renderEmptyWall({ secondaryLabel: 'Browse templates' });
const htmlCustomCopy = await renderEmptyWall({
  title: 'Nothing here',
  hint: 'Capsules & views appear here.',
  primaryLabel: 'Start',
});
const ALL_HTML = [htmlDefault, htmlSlotted, htmlSecondaryLabel, htmlCustomCopy];

/**
 * Strips SSR slot comments so content assertions read plainly.
 * @param {string} html Rendered HTML.
 * @returns {string} Comment-free HTML.
 */
function text(html) {
  return html.replace(/<!--.*?-->/gs, '');
}

/**
 * Central registry with the additive ew1 families as fallback, so rows
 * validate both before and after the conductor merges the families.
 * @param {string} anchor Concrete semantic anchor.
 * @returns {{ template: string, allowedRoles: readonly string[] } | null}
 */
function resolveFamily(anchor) {
  return matchControlFamily(anchor) ?? matchEmptyWallControlFamily(anchor);
}

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

test('empty-wall SFC is plain JS with setup, helpers and a clean template compile', () => {
  assert.ok(!sfcSource.includes('lang="ts"') && !sfcSource.includes("lang='ts'"), 'plain JS, no TypeScript');
  assert.ok(descriptor.scriptSetup, 'script setup block present');
  assert.ok(descriptor.script, 'plain script block with exported identities present');
  const compiled = compileTemplate({
    source: template,
    filename: 'EmptyWall.vue',
    id: 'cuk-shell-empty-wall',
  });
  assert.equal((compiled.errors || []).length, 0, 'template compile must produce zero errors');
});

test('empty-wall reaches OpenVue only through the kit UiButton wrapper', () => {
  assert.ok(setup.includes("from '../ui/UiButton.vue'"), 'UiButton kit wrapper import');
  assert.equal(template.split('<UiButton').length - 1, 2, 'primary and secondary bind through UiButton');
  assert.ok(!setup.includes('openvue'), 'no direct vendor import in setup');
  assert.ok(!sfcSource.includes('@openvue'), 'no vendor icon import');
});

test('empty-wall identities are frozen, stable and kebab-shaped', () => {
  assert.deepEqual(EMPTY_WALL_IDS, {
    root: 'shell/empty-wall',
    title: 'shell/empty-wall/title',
    hint: 'shell/empty-wall/hint',
    actions: 'shell/empty-wall/actions',
    primary: 'shell/empty-wall/primary',
    secondary: 'shell/empty-wall/secondary',
  });
  assert.deepEqual(EMPTY_WALL_ANCHORS, {
    root: 'shell/empty-wall',
    primary: 'shell/empty-wall/primary',
    secondary: 'shell/empty-wall/secondary',
  });
  assert.ok(Object.isFrozen(EMPTY_WALL_IDS) && Object.isFrozen(EMPTY_WALL_ANCHORS), 'identities frozen');
  for (const anchor of Object.values(EMPTY_WALL_ANCHORS)) {
    for (const segment of String(anchor).split('/').slice(1)) {
      assert.match(segment, /^[a-z][a-z0-9-]*$/, `kebab segment in ${anchor}`);
    }
  }
});

test('default render shows title, hint and a labelled primary button, no secondary', () => {
  assert.match(htmlDefault, /<h2[^>]*id="shell\/empty-wall\/title"[^>]*>No capsules yet<\/h2>/);
  assert.ok(htmlDefault.includes('<p id="shell/empty-wall/hint" class="s1-empty-wall-hint">Create a capsule to fill this workspace.</p>'), 'hint paragraph');
  assert.match(htmlDefault, /<button[^>]*id="shell\/empty-wall\/primary"[^>]*>/, 'primary is a native button');
  assert.ok(htmlDefault.includes('data-semantic-anchor="shell/empty-wall/primary"'), 'primary anchor');
  assert.ok(htmlDefault.includes('aria-label="New capsule"'), 'primary accessible name');
  assert.ok(text(htmlDefault).includes('>New capsule</button>'), 'primary fallback label');
  assert.ok(htmlDefault.includes('data-severity="primary"'), 'primary intent reaches the wrapper');
  assert.ok(!htmlDefault.includes('shell/empty-wall/secondary'), 'no secondary by default');
  assert.ok(htmlDefault.includes('aria-labelledby="shell/empty-wall/title"'), 'section labelled by the title');
  assert.ok(htmlDefault.includes('data-semantic-anchor="shell/empty-wall"'), 'root anchor');
});

test('slots replace button labelling while kit ids, anchors and buttons stay', () => {
  assert.ok(text(htmlSlotted).includes('>Launch now</button>'), 'primary slot content rendered');
  assert.ok(text(htmlSlotted).includes('>Learn more</button>'), 'secondary slot content rendered');
  assert.match(htmlSlotted, /<button[^>]*id="shell\/empty-wall\/primary"[^>]*>/, 'primary stays a kit button');
  assert.match(htmlSlotted, /<button[^>]*id="shell\/empty-wall\/secondary"[^>]*>/, 'secondary appears via slot');
  assert.ok(htmlSlotted.includes('data-semantic-anchor="shell/empty-wall/secondary"'), 'secondary anchor');
  assert.ok(htmlSlotted.includes('data-severity="secondary"'), 'secondary keeps the neutral wrapper intent');
  assert.ok(!htmlSlotted.includes('aria-label=""'), 'no empty accessible-name override');
});

test('secondary label prop renders a named secondary fallback button', () => {
  assert.ok(text(htmlSecondaryLabel).includes('>Browse templates</button>'), 'secondary fallback label');
  assert.ok(htmlSecondaryLabel.includes('aria-label="Browse templates"'), 'secondary accessible name');
  assert.ok(htmlSecondaryLabel.includes('data-semantic-anchor="shell/empty-wall/secondary"'), 'secondary anchor');
});

test('custom copy renders escaped through the same stable structure', () => {
  assert.ok(htmlCustomCopy.includes('>Nothing here</h2>'), 'custom title');
  assert.ok(htmlCustomCopy.includes('Capsules &amp; views appear here.'), 'custom hint escaped');
  assert.ok(text(htmlCustomCopy).includes('>Start</button>'), 'custom primary label');
  assert.ok(htmlCustomCopy.includes('id="shell/empty-wall/actions"'), 'actions group id stable');
});

test('primary action is keyboard-focusable in every render', () => {
  for (const html of ALL_HTML) {
    assert.match(html, /<button[^>]*id="shell\/empty-wall\/primary"[^>]*>/, 'native focusable button');
    assert.ok(!html.includes('tabindex="-1"'), 'never removed from tab order');
    assert.ok(!html.includes('disabled'), 'never disabled');
  }
});

test('rendered anchors equal the registry row examples', () => {
  const byId = new Map(EMPTY_WALL_REGISTRY_ROWS.map((row) => [row.agentLaneId, row]));
  assert.equal(EMPTY_WALL_ANCHORS.root, byId.get('wall.empty.region').anchorExample);
  assert.equal(EMPTY_WALL_ANCHORS.primary, byId.get('wall.empty.primary').anchorExample);
  assert.equal(EMPTY_WALL_ANCHORS.secondary, byId.get('wall.empty.secondary').anchorExample);
  for (const anchor of Object.values(EMPTY_WALL_ANCHORS)) {
    const html = anchor === EMPTY_WALL_ANCHORS.secondary ? htmlSlotted : htmlDefault;
    assert.ok(html.includes(`data-semantic-anchor="${anchor}"`), `rendered anchor ${anchor}`);
  }
});

test('empty-wall rows cover the lane E surface exactly once', () => {
  assert.equal(EMPTY_WALL_REGISTRY_ROWS.length, 3);
  assert.deepEqual(EMPTY_WALL_AGENT_LANE_IDS, ['wall.empty.region', 'wall.empty.primary', 'wall.empty.secondary']);
  assert.equal(new Set(EMPTY_WALL_AGENT_LANE_IDS).size, 3);
  for (const row of EMPTY_WALL_REGISTRY_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'E', 'lane ' + row.agentLaneId);
    assert.equal(row.component, 'EmptyWall', 'carrier ' + row.agentLaneId);
    assert.equal(row.anchorStatus, 'new', 'status ' + row.agentLaneId);
    assert.ok(row.agentLaneId.startsWith('wall.empty.'), 'plan id ' + row.agentLaneId);
    assert.ok(row.anchorExample.startsWith('shell/empty-wall'), 'anchor family ' + row.agentLaneId);
  }
  assert.equal(EMPTY_WALL_FAMILY_RULES.length, 2);
  assert.ok(Object.isFrozen(EMPTY_WALL_REGISTRY_ROWS) && Object.isFrozen(EMPTY_WALL_FAMILY_RULES), 'rows and rules frozen');
  for (const rule of EMPTY_WALL_FAMILY_RULES) {
    assert.equal(rule.rowIndex, 1, 'shell-chrome row');
    assert.ok(Object.isFrozen(rule) && Object.isFrozen(rule.allowedRoles), 'rule frozen');
    assert.equal(rule.requiresReasonWhenDisabled, false);
    assert.equal(rule.forbidsZeroWhenUnknown, false);
  }
});

test('every row example resolves in a declared family admitting its role', () => {
  for (const row of EMPTY_WALL_REGISTRY_ROWS) {
    const rule = resolveFamily(row.anchorExample);
    assert.ok(rule, `${row.agentLaneId} family admits ${row.anchorExample}`);
    assert.equal(rule.template, row.anchorTemplate, `${row.agentLaneId} template`);
    assert.ok(rule.allowedRoles.includes(row.role), `${row.agentLaneId} admits role ${row.role}`);
    assert.equal(emptyWallAnchorFor(row.agentLaneId), row.anchorExample, `${row.agentLaneId} builder`);
  }
});

test('invented and numeric empty-wall anchors match no family', () => {
  for (const anchor of [
    '',
    'shell/empty-wall/tertiary',
    'shell/empty-wall/primary/extra',
    'shell/empty-wall-primary',
    'shell/empty-wall/0',
    'shell/empty-wall//primary',
  ]) {
    assert.equal(matchEmptyWallControlFamily(anchor), null, `additive rejects ${JSON.stringify(anchor)}`);
    if (anchor === '' || anchor === 'shell/empty-wall/tertiary' || anchor === 'shell/empty-wall/0') {
      assert.equal(matchControlFamily(anchor), null, `central rejects ${JSON.stringify(anchor)}`);
    }
  }
  assert.throws(() => emptyWallAnchorFor('wall.empty.tertiary'), /Unknown empty-wall agent_lane id/);
  assert.throws(() => emptyWallAnchorFor(''), /Unknown empty-wall agent_lane id/);
});

test('no inline styles in source or rendered HTML (CSP)', () => {
  assert.ok(!template.includes('style='), 'template has no style attribute');
  assert.ok(!template.includes(':style') && !template.includes('v-bind:style'), 'template has no style binding');
  assert.ok(!setup.includes('.style'), 'setup never touches element.style');
  assert.ok(!setup.includes("setAttribute('style'") && !setup.includes('setAttribute("style"'), 'setup never sets style');
  assert.ok(!plainScript.includes('.style'), 'helpers never touch style');
  for (const html of ALL_HTML) {
    assert.ok(!html.includes('style='), 'rendered HTML has no style attribute');
  }
});

test('empty-wall paint reaches 4.5:1 in every scheme (WCAG AA)', () => {
  assert.ok(validateTokenContract(tokens).leaves > 0, 'token contract validates');
  for (const mode of MODES) {
    const title = contrast(tokenValue('semantic.text.primary', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(title >= 4.5, `${mode}/title: ${title}`);
    const hint = contrast(tokenValue('semantic.text.muted', mode), tokenValue('semantic.surface.panel', mode));
    assert.ok(hint >= 4.5, `${mode}/hint: ${hint}`);
  }
});

test('style block pins the contrasted token mapping and nothing else', () => {
  assert.ok(style.includes('var(--cuk-semantic-text-primary)'), 'title token pinned');
  assert.ok(style.includes('var(--cuk-semantic-text-muted)'), 'hint token pinned');
  assert.ok(style.includes('var(--cuk-semantic-surface-panel)'), 'wall token pinned');
  const refs = [...style.matchAll(/var\(\s*(--[A-Za-z0-9-]+)/g)].map((match) => match[1]);
  assert.ok(refs.length > 0, 'style uses tokens');
  for (const ref of refs) {
    assert.ok(ref.startsWith('--cuk-'), `kit token ${ref}`);
    assert.ok(themeCss.includes(`${ref}:`), `token ${ref} defined in the kit stylesheet`);
  }
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(style), 'no hex literals');
  assert.ok(!/\dpx/.test(style), 'no px literals');
  assert.ok(!/rgba?\(/.test(style) && !/hsla?\(/.test(style), 'no rgb/hsl literals');
});

test('wall responds to the dock area through a container query', () => {
  assert.ok(style.includes('container-type: inline-size'), 'wall is a container for its area');
  assert.ok(style.includes('@container (max-width: 30em)'), 'narrow-area breakpoint pinned');
  assert.ok(style.includes('flex-direction: column'), 'actions stack when the area narrows');
});

test('shell index exports EmptyWall and the release reads 0.2.1', () => {
  assert.ok(
    readKit('src/index-shell.js').includes("export { default as EmptyWall } from './shell/EmptyWall.vue';"),
    'public shell export',
  );
  assert.equal(JSON.parse(readKit('package.json')).version, '0.2.1', 'kit version bumped');
  const changelog = readKit('CHANGELOG.md');
  assert.ok(changelog.includes('## 0.2.1'), 'changelog entry present');
  assert.ok(changelog.includes('EmptyWall'), 'changelog names the component');
  assert.ok(changelog.includes('live-scheme'), 'changelog names the overlay fix');
});
