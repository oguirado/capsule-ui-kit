import { assertPublishable } from './publication-rules.js';
/**
 * @fileoverview kw1 lane T tile-state tests: the seven-state model (icon,
 * label, colour token, description per state), badge chrome and take/release
 * control pair on SaasWallTile, the connecting/lost SaasVeil branches, the
 * additive registry rows, CSP (no inline style in source or SSR HTML),
 * token-only styles, and WCAG AA contrast in all 12 kit modes. Real SFCs are
 * compiled with @vue/compiler-sfc and rendered with @vue/server-renderer;
 * the veil/tile graphs have no vendor imports, so no stub is needed.
 * Plain JS, node:test, no Electron.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import {
  TILE_STATES,
  TILE_STATE_META,
  isTileState,
  normalizeTileState,
  tileStateMeta,
  tileStateChip,
  tileStateDescription,
  tileStateVeilKind,
  tileStateBadgeDomId,
  tileStateBadgeAnchor,
  tileStateAccessibleName,
  tileControlDisabled,
  tileControlReason,
} from '../src/saas/SaasTileState.js';
import {
  SAAS_REGISTRY_ROWS,
  SAAS_FIXTURE_IDS,
  KW1_TILE_STATE_ROWS,
  KW1_TILE_AGENT_LANE_IDS,
  kw1TileAnchorFor,
} from '../src/saas/saasRegistryRows.js';
import { createControlRegistry, matchControlFamily } from '../src/agent/controlRegistry.js';
import { tokenValue } from '../src/design/tokenContract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');
const kitRoot = path.resolve(__dirname, '..');
const readKit = (relPath) => fs.readFileSync(path.resolve(kitRoot, relPath), 'utf8');

const TILE_REL = 'src/saas/SaasWallTile.vue';
const VEIL_REL = 'src/saas/SaasVeil.vue';
const MODEL_REL = 'src/saas/SaasTileState.js';
const ROWS_REL = 'src/saas/saasRegistryRows.js';
const tileSource = readKit(TILE_REL);
const veilSource = readKit(VEIL_REL);
const modelSource = readKit(MODEL_REL);
const rowsSource = readKit(ROWS_REL);
const themeCss = readKit('src/design/theme.css');

function loadSfc(relPath, name) {
  const source = readKit(relPath);
  const parsed = compilerSfc.parse(source, { filename: `${name}.vue` });
  assert.equal(parsed.errors.length, 0, `${name}: SFC parse must produce zero errors`);
  const { descriptor } = parsed;
  assert.ok(descriptor.template, `${name}: must have a <template> block`);
  assert.ok(descriptor.script, `${name}: must have a plain <script> helper block`);
  assert.ok(descriptor.scriptSetup, `${name}: must have a <script setup> block`);
  const compiled = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: `${name}.vue`,
    id: `cuk-saas-${name}`,
  });
  assert.equal((compiled.errors || []).length, 0, `${name}: template compile must produce zero errors`);
  return { source, descriptor };
}

const tileSfc = loadSfc(TILE_REL, 'SaasWallTile');
const veilSfc = loadSfc(VEIL_REL, 'SaasVeil');
const tileTemplate = tileSfc.descriptor.template.content;
const tileSetup = tileSfc.descriptor.scriptSetup.content;
const tilePlain = tileSfc.descriptor.script.content;
const tileStyle = tileSfc.descriptor.styles.map((entry) => entry.content).join('\n');
const veilTemplate = veilSfc.descriptor.template.content;
const veilSetup = veilSfc.descriptor.scriptSetup.content;
const veilPlain = veilSfc.descriptor.script.content;
const veilStyle = veilSfc.descriptor.styles.map((entry) => entry.content).join('\n');

async function plainHelpers(descriptor) {
  const url = 'data:text/javascript;base64,' + Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  return import(url);
}

const tileHelpers = await plainHelpers(tileSfc.descriptor);
const veilHelpers = await plainHelpers(veilSfc.descriptor);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteImports(code, rewrites) {
  let out = code;
  for (const [spec, url] of rewrites) {
    out = out.replace(new RegExp(`from\\s*(['"])${escapeRegExp(spec)}\\1`, 'g'), `from '${url}'`);
  }
  return out;
}

function dataUrl(code) {
  return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(code).replace(/'/g, '%27');
}

async function compileSfcModule(relPath, id, rewrites) {
  const source = readKit(relPath);
  const filename = path.basename(relPath);
  const found = compilerSfc.parse(source, { filename });
  assert.equal(found.errors.length, 0, `${filename} parses cleanly`);
  const compiled = compilerSfc.compileScript(found.descriptor, { id, inlineTemplate: true });
  const code = rewriteImports(compiled.content, rewrites);
  const url = dataUrl(code);
  return { code, url, namespace: await import(url) };
}

const VUE_URL = import.meta.resolve('vue');
const TILE_STATE_URL = pathToFileURL(path.resolve(kitRoot, 'src/saas/SaasTileState.js')).href;

const recordModule = await compileSfcModule('src/saas/SaasRecordButton.vue', 'cuk-saas-tile-record', [['vue', VUE_URL]]);
const chipsModule = await compileSfcModule('src/saas/SaasViewerChips.vue', 'cuk-saas-tile-chips', [['vue', VUE_URL]]);
const surfaceModule = await compileSfcModule('src/saas/SaasSurfaceView.vue', 'cuk-saas-tile-surface', [['vue', VUE_URL]]);
const veilModule = await compileSfcModule(VEIL_REL, 'cuk-saas-tile-veil', [
  ['vue', VUE_URL],
  ['./SaasTileState.js', TILE_STATE_URL],
]);
const tileModule = await compileSfcModule(TILE_REL, 'cuk-saas-tile', [
  ['vue', VUE_URL],
  ['./SaasRecordButton.vue', recordModule.url],
  ['./SaasViewerChips.vue', chipsModule.url],
  ['./SaasSurfaceView.vue', surfaceModule.url],
  ['./SaasVeil.vue', veilModule.url],
  ['./SaasTileState.js', TILE_STATE_URL],
]);
const SaasWallTile = tileModule.namespace.default;
const SaasVeil = veilModule.namespace.default;

async function renderTile(props = {}) {
  return renderToString(createSSRApp({ render: () => h(SaasWallTile, props) }));
}

async function renderVeil(props = {}) {
  return renderToString(createSSRApp({ render: () => h(SaasVeil, props) }));
}

const tileFixture = tileHelpers.saasWallTileFixture();
const veilFixture = veilHelpers.saasVeilFixture();

const htmlByState = {};
for (const state of TILE_STATES) {
  htmlByState[state] = await renderTile({ ...tileFixture, tileState: state });
}
const htmlLegacy = await renderTile({ ...tileFixture });
const htmlTakeDisabled = await renderTile({
  ...tileFixture,
  tileState: 'live',
  takeControlDisabled: true,
  takeControlReason: 'Policy: lease denied',
});
const htmlRelease = await renderTile({ ...tileFixture, tileState: 'human-control', controlHeld: true });
const htmlReleaseDisabled = await renderTile({
  ...tileFixture,
  tileState: 'human-control',
  controlHeld: true,
  releaseControlDisabled: true,
  releaseControlReason: 'Policy: release denied',
});
const htmlVeilLost = await renderTile({ ...tileFixture, veilKind: 'lost' });
const htmlVeilConnecting = await renderTile({ ...tileFixture, veilKind: 'connecting' });
const htmlVeilAgent = await renderTile({ ...tileFixture, veilKind: 'agent-acting' });
const htmlVeilLive = await renderTile({ ...tileFixture, veilKind: 'live' });
const htmlVeilBogus = await renderTile({ ...tileFixture, veilKind: 'bogus' });
const htmlVeilStandaloneLost = await renderVeil({ ...veilFixture, veilKind: 'lost' });
const htmlVeilStandaloneConnecting = await renderVeil({ ...veilFixture, veilKind: 'connecting' });
const htmlVeilProjectionLost = await renderVeil({
  ...veilFixture,
  veilKind: '',
  projection: { lifecycle: 'lost' },
});
const ALL_HTML = [
  ...Object.values(htmlByState),
  htmlLegacy,
  htmlTakeDisabled,
  htmlRelease,
  htmlReleaseDisabled,
  htmlVeilLost,
  htmlVeilConnecting,
  htmlVeilAgent,
  htmlVeilLive,
  htmlVeilBogus,
  htmlVeilStandaloneLost,
  htmlVeilStandaloneConnecting,
  htmlVeilProjectionLost,
];

const MODES = Object.freeze([
  'dark.normal', 'dark.high',
  'light.normal', 'light.high',
  'saas-dark.normal', 'saas-dark.high',
  'saas-light.normal', 'saas-light.high',
  'mv-dark.normal', 'mv-dark.high',
  'mv-light.normal', 'mv-light.high',
]);

function luminance(hex) {
  const a = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function composite(fgHex, bgHex, alpha) {
  const fg = fgHex.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const bg = bgHex.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const mix = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function reviewedProducer() {
  return {
    contractId: 'test/saas-tile-states/v1',
    peer: 'test-harness',
    reviewed: true,
    mapStableId: (input) => `${input.windowId}:${input.presentationInstance}:${input.semanticAnchor}@e${input.epoch}.g${input.generation}`,
  };
}

const assertNoBanned = assertPublishable;

test('tile states list the seven wall states frozen in wall order', () => {
  assert.deepEqual([...TILE_STATES], ['connecting', 'live', 'folded', 'human-control', 'agent-acting', 'lost', 'error']);
  assert.ok(Object.isFrozen(TILE_STATES));
  assert.ok(Object.isFrozen(TILE_STATE_META));
  for (const state of TILE_STATES) {
    assert.ok(Object.isFrozen(TILE_STATE_META[state]), `meta frozen for ${state}`);
  }
});

test('every state carries icon, label, colour token and description', () => {
  const tones = new Set(['success', 'warning', 'info', 'danger', 'neutral', 'accent']);
  const seenLabels = new Set();
  const seenIcons = new Set();
  for (const state of TILE_STATES) {
    const meta = TILE_STATE_META[state];
    assert.equal(typeof meta.label, 'string', `${state}: label`);
    assert.ok(meta.label.length > 0 && meta.label === meta.label.toUpperCase(), `${state}: uppercase label`);
    assert.ok(tones.has(meta.tone), `${state}: chip tone ${meta.tone}`);
    assert.match(meta.colorToken, /^--cuk-[\w-]+$/, `${state}: token var`);
    assert.equal(typeof meta.colorTokenPath, 'string', `${state}: token path`);
    assert.ok(meta.colorFallbackToken === null || meta.colorFallbackToken.startsWith('--cuk-'), `${state}: fallback`);
    assert.ok(meta.description.length > 12, `${state}: description`);
    assert.match(meta.iconPath, /^[Mm][0-9a-zA-Z .,-]+$/, `${state}: icon path`);
    assert.equal(typeof meta.captureAlive, 'boolean', `${state}: capture flag`);
    assert.equal(seenLabels.has(meta.label), false, `label unique: ${meta.label}`);
    assert.equal(seenIcons.has(meta.iconPath), false, `icon unique for ${state}`);
    seenLabels.add(meta.label);
    seenIcons.add(meta.iconPath);
  }
  assert.equal(TILE_STATE_META.folded.captureAlive, true, 'folded keeps capturing');
  for (const state of TILE_STATES.filter((s) => s !== 'folded')) {
    assert.equal(TILE_STATE_META[state].captureAlive, false, `${state}: no capture flag`);
  }
});

test('unknown states normalize to connecting, never to live', () => {
  for (const unknown of ['bogus', '', null, undefined, 0, 42, {}, [], 'LIVE', 'running']) {
    assert.equal(normalizeTileState(unknown), 'connecting', `fallback for ${String(unknown)}`);
    assert.equal(tileStateMeta(unknown).label, 'CONNECTING');
    assert.equal(tileStateChip(unknown).label, 'CONNECTING');
  }
  assert.equal(isTileState('live'), true);
  assert.equal(isTileState('bogus'), false);
  assert.equal(isTileState(''), false);
  assert.equal(tileStateDescription('lost'), TILE_STATE_META.lost.description);
});

test('tile states map to veils; non-states pass through as null', () => {
  assert.deepEqual(
    TILE_STATES.map((state) => tileStateVeilKind(state)),
    ['connecting', 'none', 'none', 'none', 'ai-held', 'lost', 'error'],
  );
  for (const other of ['none', 'switching', 'ai-held', 'booting', '', null, undefined, 'bogus']) {
    assert.equal(tileStateVeilKind(other), null, `pass-through for ${String(other)}`);
  }
});

test('badge ids and anchors are stable and kebab-shaped', () => {
  assert.equal(tileStateBadgeDomId('capsule-01'), 'cuk-saas-wall-state-capsule-01');
  assert.equal(tileStateBadgeAnchor('capsule-01'), 'capsule/capsule-01/tile-state');
  assert.match(tileStateBadgeAnchor('cap-01'), /^capsule\/[^/\s]+\/tile-state$/);
  const slot = tileStateBadgeAnchor('cap-01').split('/').pop();
  assert.match(slot, /^[a-z][a-z0-9-]*$/, 'kebab slot, never a numeric token');
  assert.equal(
    tileStateAccessibleName({ capsuleTitle: 'Capsule-01', capsuleId: 'capsule-01', state: 'live' }),
    'LIVE for Capsule-01: Live surface; frames are flowing.',
  );
  assert.equal(
    tileStateAccessibleName({ capsuleId: 'capsule-01', state: 'bogus' }),
    'CONNECTING for capsule-01: Establishing the live surface; frames are not flowing yet.',
  );
});

test('take/release disabled flags and reasons follow the lease mode', () => {
  assert.equal(tileControlDisabled({ controlHeld: false, takeControlDisabled: true }), true);
  assert.equal(tileControlDisabled({ controlHeld: false, takeControlDisabled: false }), false);
  assert.equal(tileControlDisabled({ controlHeld: true, releaseControlDisabled: true }), true);
  assert.equal(tileControlDisabled({ controlHeld: true, releaseControlDisabled: false }), false);
  assert.equal(tileControlDisabled({ controlHeld: 'held', takeControlDisabled: true }), true);
  assert.equal(tileControlDisabled({}), false);
  assert.equal(
    tileControlReason({ controlHeld: false, takeControlReason: 'take-denied', releaseControlReason: 'release-denied' }),
    'take-denied',
  );
  assert.equal(
    tileControlReason({ controlHeld: true, takeControlReason: 'take-denied', releaseControlReason: 'release-denied' }),
    'release-denied',
  );
  assert.equal(tileControlReason({}), '');
  assert.equal(tileControlReason({ controlHeld: true, releaseControlReason: 42 }), '');
});

test('wall tile and veil stay plain JS with locked emits (props-only extension)', () => {
  for (const [name, source, setup] of [['SaasWallTile', tileSource, tileSetup], ['SaasVeil', veilSource, veilSetup]]) {
    assert.equal(source.includes('lang="ts"'), false, `${name}: no lang="ts"`);
    assert.doesNotMatch(source, /from\s+['"]openvue\//, `${name}: no direct openvue imports`);
    assert.doesNotMatch(source, /from\s+['"]@openvue\//, `${name}: no direct @openvue imports`);
    assert.ok(setup.includes("from './SaasTileState.js'"), `${name}: uses the tile-state model`);
  }
  const tileEmits = [...tileSetup.match(/defineEmits\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)]
    .map((entry) => entry[1]).sort();
  assert.deepEqual(
    tileEmits,
    ['submit-intent', 'activate-surface', 'fold-change', 'control-request', 'close-panel', 'select-session'].sort(),
    'tile emits unchanged',
  );
  const veilEmits = [...veilSetup.match(/defineEmits\(\[([^\]]*)\]\)/)[1].matchAll(/'([^']+)'/g)]
    .map((entry) => entry[1]).sort();
  assert.deepEqual(veilEmits, ['control-request', 'submit-intent'].sort(), 'veil emits unchanged');
  assert.equal(/^\s*import\s/m.test(modelSource), false, 'model stays data-only');
  assert.equal(/^\s*import\s/m.test(rowsSource), false, 'rows stay data-only');
});

test('no inline styles in source or rendered HTML (CSP)', () => {
  for (const [name, template, setup, plain] of [
    ['SaasWallTile', tileTemplate, tileSetup, tilePlain],
    ['SaasVeil', veilTemplate, veilSetup, veilPlain],
  ]) {
    assert.ok(!template.includes('style='), `${name}: template has no style attribute`);
    assert.ok(!template.includes(':style') && !template.includes('v-bind:style'), `${name}: no style binding`);
    assert.ok(!setup.includes('.style'), `${name}: setup never touches element.style`);
    assert.ok(!setup.includes("setAttribute('style'") && !setup.includes('setAttribute("style"'), `${name}: never sets style`);
    assert.ok(!plain.includes('.style'), `${name}: helpers never touch style`);
  }
  assert.ok(!modelSource.includes('style='), 'model has no style attribute');
  assert.ok(!rowsSource.includes('style='), 'rows have no style attribute');
  for (const html of ALL_HTML) {
    assert.ok(!html.includes('style='), 'rendered HTML has no style attribute');
  }
});

test('tile and veil styles are tokens-only with fallbacks on kit delta vars', () => {
  for (const [name, css] of [['SaasWallTile', tileStyle], ['SaasVeil', veilStyle]]) {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${name}: no hardcoded hex colors`);
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.ok(match[1].startsWith('--cuk-'), `${name}: token var ${match[1]}`);
    }
    const bareSaas = css.match(/var\(--cuk-[\w-]*saas[\w-]*\s*\)/g) || [];
    assert.equal(bareSaas.length, 0, `${name}: every saas delta var needs a token fallback`);
  }
});

test('tile and veil carry stable ids, roles, anchors, focus and reduced motion', () => {
  for (const [name, template, css] of [['SaasWallTile', tileTemplate, tileStyle], ['SaasVeil', veilTemplate, veilStyle]]) {
    assert.ok(template.includes(':id="') || template.includes('id="'), `${name}: has ids`);
    assert.ok(template.includes('role="'), `${name}: has roles`);
    assert.ok(template.includes('aria-label="') || template.includes(':aria-label="'), `${name}: has accessible names`);
    assert.ok(template.includes('data-semantic-anchor'), `${name}: exposes semantic anchors`);
    assert.ok(css.includes(':focus-visible'), `${name}: focus ring on controls`);
    assert.ok(css.includes('prefers-reduced-motion'), `${name}: honors reduced motion`);
  }
  assert.equal(veilTemplate.match(/v-else(?!-if)/g), null, 'unknown veil kinds render nothing (no bare v-else)');
  assert.ok(tileStyle.includes('.saas-state-capture-dot { animation: none; }'), 'capture dot rests under reduced motion');
  assert.ok(veilStyle.includes('.saas-connecting-spinner,'), 'connecting spinner rests under reduced motion');
});

test('badge renders every state with id, anchor, icon and description', () => {
  for (const state of TILE_STATES) {
    const meta = TILE_STATE_META[state];
    const html = htmlByState[state];
    assert.ok(html.includes('id="cuk-saas-wall-state-capsule-01"'), `${state}: stable badge id`);
    assert.ok(html.includes('data-semantic-anchor="capsule/capsule-01/tile-state"'), `${state}: badge anchor`);
    assert.ok(html.includes('role="status"'), `${state}: status role`);
    assert.ok(html.includes(`saas-state-${meta.tone}`), `${state}: tone class`);
    assert.ok(html.includes(`>${meta.label}<`), `${state}: visible label`);
    assert.ok(html.includes(meta.description), `${state}: description exposed`);
    assert.ok(html.includes(`d="${meta.iconPath}"`), `${state}: state glyph`);
  }
  assert.ok(htmlByState.folded.includes('CAPTURING'), 'folded shows the capture-alive indicator');
  for (const state of TILE_STATES.filter((s) => s !== 'folded')) {
    assert.equal(htmlByState[state].includes('CAPTURING'), false, `${state}: no capture flag`);
  }
  assert.equal(htmlLegacy.includes('cuk-saas-wall-state-'), false, 'legacy tiles (empty tileState) render no badge');
});

test('control button keeps one stable id with swapped anchor, name and label', () => {
  for (const html of [htmlLegacy, htmlByState.live]) {
    assert.ok(html.includes('id="cuk-saas-wall-control-capsule-01"'), 'stable control id');
    assert.ok(html.includes('data-semantic-anchor="capsule/capsule-01/control"'), 'take anchor');
    assert.ok(html.includes('aria-label="Take control of Capsule-01"'), 'take name');
    assert.ok(html.includes('>Take Control<'), 'take label');
  }
  assert.ok(htmlRelease.includes('id="cuk-saas-wall-control-capsule-01"'), 'release keeps the stable id');
  assert.ok(htmlRelease.includes('data-semantic-anchor="capsule/capsule-01/release-control"'), 'release anchor');
  assert.ok(htmlRelease.includes('aria-label="Release control of Capsule-01"'), 'release name');
  assert.ok(htmlRelease.includes('>Release Control<'), 'release label');
});

test('disabled take/release buttons expose reasons in both modes', () => {
  assert.ok(htmlTakeDisabled.includes('disabled'), 'take mode disables the button');
  assert.ok(htmlTakeDisabled.includes('data-unavailable-reason="Policy: lease denied"'), 'take reason exposed');
  assert.ok(htmlTakeDisabled.includes('title="Policy: lease denied"'), 'take reason in title');
  assert.ok(htmlReleaseDisabled.includes('disabled'), 'release mode disables the button');
  assert.ok(htmlReleaseDisabled.includes('data-unavailable-reason="Policy: release denied"'), 'release reason exposed');
  assert.ok(htmlReleaseDisabled.includes('title="Policy: release denied"'), 'release reason in title');
  assert.equal(htmlLegacy.includes('lease denied'), false, 'enabled take button carries no reason');
  assert.equal(htmlLegacy.includes('release denied'), false, 'enabled release button carries no reason');
});

test('veil accepts tile states, new kinds and new lifecycles', () => {
  assert.deepEqual([...veilHelpers.SAAS_VEIL_KINDS], ['none', 'switching', 'ai-held', 'booting', 'error', 'connecting', 'lost']);
  assert.equal(veilHelpers.normalizeVeilKind('connecting'), 'connecting');
  assert.equal(veilHelpers.normalizeVeilKind('lost'), 'lost');
  assert.equal(veilHelpers.normalizeVeilKind('bogus'), 'none');
  assert.equal(veilHelpers.resolveSaasVeilKind({ lifecycle: 'connecting' }), 'connecting');
  assert.equal(veilHelpers.resolveSaasVeilKind({ lifecycle: 'lost' }), 'lost');
  assert.equal(veilHelpers.resolveSaasVeilKind({ lifecycle: 'failed' }), 'error');
  assert.equal(veilHelpers.resolveSaasVeilKind({ mode: 'agent_locked' }), 'ai-held');
  assert.equal(veilHelpers.resolveSaasVeilKind({ lifecycle: 'ready', mode: 'operator_controlled' }), 'none');
  assert.deepEqual(veilHelpers.veilDomIds('capsule-01', 'lost'), {
    veil: 'cuk-saas-veil-lost-capsule-01',
    retry: 'cuk-saas-veil-lost-capsule-01-retry',
    export: 'cuk-saas-veil-lost-capsule-01-export',
    override: 'cuk-saas-veil-lost-capsule-01-override',
  });
  assert.ok(htmlVeilLost.includes('id="cuk-saas-veil-lost-capsule-01"'), 'lost veil id');
  assert.ok(htmlVeilLost.includes('data-semantic-anchor="capsule/capsule-01/retry"'), 'lost retry anchor');
  assert.ok(htmlVeilLost.includes('aria-label="Retry capsule Capsule-01"'), 'lost retry name');
  assert.ok(htmlVeilLost.includes('Signal lost'), 'lost banner');
  assert.ok(htmlVeilConnecting.includes('id="cuk-saas-veil-connecting-capsule-01"'), 'connecting veil id');
  assert.ok(htmlVeilConnecting.includes('Connecting live surface'), 'connecting banner');
  assert.ok(htmlVeilStandaloneLost.includes('id="cuk-saas-veil-lost-capsule-01"'), 'standalone lost render');
  assert.ok(htmlVeilStandaloneConnecting.includes('saas-connecting-spinner'), 'standalone connecting render');
  assert.ok(htmlVeilProjectionLost.includes('Signal lost'), 'projection lifecycle lost renders the lost veil');
  assert.ok(htmlVeilAgent.includes('AGENT IN CONTROL'), 'agent-acting maps to the ai-held veil');
  assert.equal(htmlVeilLive.includes('saas-veil-connecting'), false, 'live renders no veil');
  assert.equal(htmlVeilLive.includes('saas-veil-lost'), false, 'live renders no lost veil');
  assert.equal(htmlVeilBogus.includes('saas-veil-connecting'), false, 'bogus kinds render nothing');
  assert.equal(htmlVeilBogus.includes('saas-veil-lost'), false, 'bogus kinds render nothing');
});

test('fixtures cover the new props with neutral labels', () => {
  assert.equal(tileFixture.tileState, '');
  assert.equal(tileFixture.releaseControlDisabled, false);
  assert.equal(tileFixture.releaseControlReason, '');
  assert.equal(tileHelpers.saasWallTileFixture({ tileState: 'folded' }).tileState, 'folded');
  assert.equal(tileHelpers.saasWallTileFixture({ controlHeld: true }).controlHeld, true);
  assert.equal(veilFixture.connectingBanner, 'Connecting live surface');
  assert.equal(veilFixture.lostBanner, 'Signal lost');
  assert.equal(veilHelpers.saasVeilFixture({ veilKind: 'lost' }).veilKind, 'lost');
  for (const [name, fixture] of [['SaasWallTile', tileFixture], ['SaasVeil', veilFixture]]) {
    const serialized = JSON.stringify(fixture);
    assertNoBanned(serialized, `${name}: neutral fixture`);
    for (const match of serialized.matchAll(/Capsule-([A-Za-z0-9]+)/g)) {
      assert.match(match[1], /^\d+$/, `${name}: neutral Capsule-NN labels`);
    }
  }
  for (const html of ALL_HTML) {
    assertNoBanned(html, 'rendered tile HTML');
  }
  assertNoBanned(tileSource, 'SaasWallTile');
  assertNoBanned(veilSource, 'SaasVeil');
  assertNoBanned(modelSource, 'SaasTileState');
  assertNoBanned(rowsSource, 'saasRegistryRows');
});

test('kw1 tile rows reuse pre-existing families with the declared roles', () => {
  assert.equal(SAAS_REGISTRY_ROWS.length, 34, 'the 34-row shape stays pinned');
  assert.equal(KW1_TILE_STATE_ROWS.length, 2);
  assert.deepEqual([...KW1_TILE_AGENT_LANE_IDS], ['wall.tile.take-control', 'wall.tile.release-control']);
  for (const row of KW1_TILE_STATE_ROWS) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, 'row shape ' + row.agentLaneId);
    assert.equal(row.lane, 'T');
    assert.equal(row.component, 'SaasWallTile');
    assert.equal(row.anchorStatus, 'existing');
    const rule = matchControlFamily(row.anchorExample);
    assert.ok(rule, 'family for ' + row.agentLaneId);
    assert.equal(rule.template, row.anchorTemplate);
    assert.ok(rule.allowedRoles.includes(row.role), `role ${row.role} for ${row.agentLaneId}`);
    assert.equal(rule.requiresReasonWhenDisabled, true, `${row.agentLaneId}: disabled needs a reason`);
  }
  assert.equal(kw1TileAnchorFor('wall.tile.take-control'), 'capsule/cap-01/control');
  assert.equal(kw1TileAnchorFor('wall.tile.release-control', { id: 'cap-07' }), 'capsule/cap-07/release-control');
  assert.throws(() => kw1TileAnchorFor('wall.tile.invented'), /Unknown kw1 tile agent_lane id/);
  const pending = matchControlFamily('capsule/cap-01/tile-state');
  assert.ok(
    pending === null || (pending.allowedRoles.includes('status')),
    'tile-state badge anchor stays pending until its family lands',
  );
});

test('kw1 tile controls register, resolve and refuse reason-less disabled state', () => {
  const registry = createControlRegistry({
    windowId: 'win-kw1',
    epoch: 5,
    generation: 2,
    reviewedProducer: reviewedProducer(),
  });
  const journey = [
    { anchor: 'capsule/cap-01/control', slot: 'control', name: 'Take control of capsule 01' },
    { anchor: 'capsule/cap-01/release-control', slot: 'release-control', name: 'Release control of capsule 01' },
  ];
  journey.forEach((control, index) => {
    const record = registry.register({
      semanticAnchor: control.anchor,
      entityId: 'cap-01',
      presentationInstance: 'saas-primary',
      controlSlot: control.slot,
      role: 'button',
      accessibleName: control.name,
      state: { disabled: false },
      visible: true,
      materialized: true,
      inDom: true,
      box: { x: 10 + index * 4, y: 20, width: 80, height: 24 },
      epoch: 5,
      generation: 2,
    });
    assert.ok(record.stableId?.includes('win-kw1:saas-primary:'), control.anchor);
  });
  for (const control of journey) {
    const target = registry.resolveActionableTarget(control.anchor, 'saas-primary');
    assert.equal(target.accessibleName, control.name);
  }
  for (const anchor of ['capsule/cap-09/control', 'capsule/cap-09/release-control']) {
    assert.throws(
      () => registry.register({
        semanticAnchor: anchor,
        entityId: 'cap-09',
        presentationInstance: 'saas-primary',
        controlSlot: 'control',
        role: 'button',
        accessibleName: 'Control capsule 09',
        state: { disabled: true },
        visible: true,
        materialized: true,
        inDom: true,
        box: { x: 1, y: 1, width: 8, height: 8 },
        epoch: 5,
        generation: 2,
      }),
      (err) => err.code === 'ERR_MISSING_UNAVAILABLE_REASON',
      anchor,
    );
  }
  const gated = registry.register({
    semanticAnchor: 'capsule/cap-09/release-control',
    entityId: 'cap-09',
    presentationInstance: 'saas-primary',
    controlSlot: 'release-control',
    role: 'button',
    accessibleName: 'Release control of capsule 09',
    state: { disabled: true, unavailableReason: 'Policy: release denied' },
    visible: true,
    materialized: true,
    inDom: true,
    box: { x: 1, y: 1, width: 8, height: 8 },
    epoch: 5,
    generation: 2,
  });
  assert.equal(gated.state.unavailableReason, 'Policy: release denied');
});

test('state colours resolve in the kit stylesheet and hold still across schemes', () => {
  const paths = new Set(TILE_STATES.map((state) => TILE_STATE_META[state].colorTokenPath));
  for (const mode of MODES) {
    for (const tokenPath of paths) {
      const value = tokenValue(tokenPath, mode);
      assert.match(value, /^#[0-9a-f]{6}$/, `${mode}/${tokenPath}`);
    }
  }
  for (const tokenPath of paths) {
    const values = MODES.map((mode) => tokenValue(tokenPath, mode));
    assert.equal(new Set(values).size, 1, `${tokenPath}: identical in every scheme (runtime-switch safe)`);
  }
  const vars = new Set();
  for (const state of TILE_STATES) {
    vars.add(TILE_STATE_META[state].colorToken);
    if (TILE_STATE_META[state].colorFallbackToken) vars.add(TILE_STATE_META[state].colorFallbackToken);
  }
  for (const ref of vars) {
    assert.ok(themeCss.includes(`${ref}:`), `token ${ref} defined in the kit stylesheet`);
  }
});

test('tile-state paint reaches WCAG AA in every scheme (text 4.5, indicators 3)', () => {
  for (const mode of MODES) {
    const header = composite(
      tokenValue('primitive.color.neutral.800', mode),
      tokenValue('primitive.color.neutral.900', mode),
      0.9,
    );
    const label = tokenValue('primitive.color.neutral.50', mode);
    assert.ok(contrast(label, header) >= 4.5, `${mode}/badge-label: ${contrast(label, header)}`);
    for (const state of TILE_STATES) {
      const color = tokenValue(TILE_STATE_META[state].colorTokenPath, mode);
      assert.ok(contrast(color, header) >= 3, `${mode}/${state}-indicator: ${contrast(color, header)}`);
    }
    const card = tokenValue('primitive.color.saas.canvas', mode);
    assert.ok(
      contrast(tokenValue('primitive.color.saas.sky500', mode), card) >= 4.5,
      `${mode}/connecting-banner`,
    );
    assert.ok(contrast(tokenValue('primitive.color.neutral.50', mode), card) >= 4.5, `${mode}/lost-banner`);
    assert.ok(contrast(tokenValue('primitive.color.neutral.400', mode), card) >= 4.5, `${mode}/lost-note`);
    assert.ok(
      contrast(tokenValue('primitive.color.neutral.900', mode), tokenValue('primitive.color.amber.500', mode)) >= 4.5,
      `${mode}/lost-retry`,
    );
  }
});
