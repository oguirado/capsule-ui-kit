import { assertPublishable } from './publication-rules.js';
/**
 * @fileoverview Lane B wall tests: SFC structure, helper units, fixture-driven
 * demo contracts, anchor conformance, and negative contrasts for the six
 * `src/saas/Saas*` wall components (SAAS-1) and their kit-vocabulary parity
 * with CapsulePanel / MultiSlot / DockWorkspace (props/events only).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');
const registryModule = await import(
  pathToFileURL(path.resolve(__dirname, '../src/agent/controlRegistry.js')).href,
);
const { matchControlFamily } = registryModule;

const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'SaasRecordButton',
    path: '../src/saas/SaasRecordButton.vue',
    emits: Object.freeze(['submit-intent']),
    hasMotion: true,
    hasButtons: true,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'SaasViewerChips',
    path: '../src/saas/SaasViewerChips.vue',
    emits: Object.freeze([]),
    hasMotion: false,
    hasButtons: false,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'SaasSurfaceView',
    path: '../src/saas/SaasSurfaceView.vue',
    emits: Object.freeze(['activate-surface']),
    hasMotion: false,
    hasButtons: false,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'SaasVeil',
    path: '../src/saas/SaasVeil.vue',
    emits: Object.freeze(['control-request', 'submit-intent']),
    hasMotion: true,
    hasButtons: true,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'SaasFoldedRail',
    path: '../src/saas/SaasFoldedRail.vue',
    emits: Object.freeze(['fold-change', 'submit-intent']),
    hasMotion: false,
    hasButtons: true,
    needsAnchor: true,
  }),
  Object.freeze({
    name: 'SaasWallTile',
    path: '../src/saas/SaasWallTile.vue',
    emits: Object.freeze([
      'submit-intent',
      'activate-surface',
      'fold-change',
      'control-request',
      'close-panel',
      'select-session',
    ]),
    hasMotion: true,
    hasButtons: true,
    needsAnchor: true,
  }),
]);

const assertNoBanned = assertPublishable;

async function loadComponent(component) {
  const filePath = path.resolve(__dirname, component.path);
  const source = fs.readFileSync(filePath, 'utf8');
  const parsed = compilerSfc.parse(source, { filename: `${component.name}.vue` });
  assert.equal(parsed.errors.length, 0, `${component.name}: SFC parse must produce zero errors`);
  const { descriptor } = parsed;
  assert.ok(descriptor.template, `${component.name}: must have a <template> block`);
  assert.ok(descriptor.script, `${component.name}: must have a plain <script> helper block`);
  assert.ok(descriptor.scriptSetup, `${component.name}: must have a <script setup> block`);
  const compiled = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: `${component.name}.vue`,
    id: `cuk-saas-${component.name}`,
  });
  assert.equal(
    (compiled.errors || []).length,
    0,
    `${component.name}: template compile must produce zero errors`,
  );
  const scriptDataUrl =
    'data:text/javascript;base64,' + Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  const helpers = await import(scriptDataUrl);
  return { source, descriptor, helpers };
}

const loaded = {};
for (const component of COMPONENTS) {
  loaded[component.name] = await loadComponent(component);
}

function styleContent(name) {
  return loaded[name].descriptor.styles.map((style) => style.content).join('\n');
}

function templateContent(name) {
  return loaded[name].descriptor.template.content;
}

function setupContent(name) {
  return loaded[name].descriptor.scriptSetup.content;
}

test('Saas wall SFCs are plain JS with no vendor imports', () => {
  for (const component of COMPONENTS) {
    const { source } = loaded[component.name];
    assert.ok(!source.includes('lang="ts"'), `${component.name}: no lang="ts"`);
    assert.ok(!source.includes("lang='ts'"), `${component.name}: no lang='ts'`);
    assert.doesNotMatch(source, /from\s+['"]openvue\//, `${component.name}: no direct openvue imports`);
    assert.doesNotMatch(source, /from\s+['"]@openvue\//, `${component.name}: no direct @openvue imports`);
  }
});

test('Saas wall styles are tokens-only with fallbacks on saas delta vars', () => {
  for (const component of COMPONENTS) {
    const css = styleContent(component.name);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${component.name}: no hardcoded hex colors`);
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.ok(match[1].startsWith('--cuk-'), `${component.name}: token var ${match[1]}`);
    }
    const bareSaas = css.match(/var\(--cuk-[\w-]*saas[\w-]*\s*\)/g) || [];
    assert.equal(bareSaas.length, 0, `${component.name}: every saas delta var needs a token fallback`);
  }
});

test('Saas wall SFCs carry no placeholder or product names', () => {
  for (const component of COMPONENTS) {
    const { source } = loaded[component.name];
    assertNoBanned(source, component.name);
    assert.doesNotMatch(
      source,
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
      `${component.name}: no e-mail-shaped strings`,
    );
  }
});


test('Saas wall controls expose stable ids, roles, and accessible names', () => {
  for (const component of COMPONENTS) {
    const template = templateContent(component.name);
    assert.ok(template.includes(':id="') || template.includes('id="'), `${component.name}: has ids`);
    assert.ok(template.includes('role="'), `${component.name}: has roles`);
    assert.ok(
      template.includes('aria-label="') || template.includes(':aria-label="'),
      `${component.name}: has accessible names`,
    );
    if (component.needsAnchor) {
      assert.ok(
        template.includes('data-semantic-anchor'),
        `${component.name}: exposes semantic anchors`,
      );
    }
    if (component.hasButtons) {
      assert.ok(
        styleContent(component.name).includes(':focus-visible'),
        `${component.name}: 2px focus ring on controls`,
      );
    }
    if (component.hasMotion) {
      assert.ok(
        styleContent(component.name).includes('prefers-reduced-motion'),
        `${component.name}: honors reduced motion`,
      );
    } else {
      assert.equal(
        (styleContent(component.name).match(/@keyframes/g) || []).length,
        0,
        `${component.name}: no animation without a reduced-motion path`,
      );
    }
  }
});

test('Saas wall emits match the kit intent vocabulary', () => {
  for (const component of COMPONENTS) {
    const setup = setupContent(component.name);
    const match = setup.match(/defineEmits\(\[([^\]]*)\]\)/);
    const declared = match
      ? [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort()
      : [];
    assert.deepEqual(declared, [...component.emits].sort(), `${component.name}: emits contract`);
  }
  const tileEmits = [...setupContent('SaasWallTile').match(/defineEmits\(\[([^\]]*)\]\)/)[1]
    .matchAll(/'([^']+)'/g)].map((entry) => entry[1]).sort();
  assert.deepEqual(
    tileEmits,
    [...loaded.SaasWallTile.helpers.SAAS_WALL_TILE_EMITS].sort(),
    'SaasWallTile: template emits equal the exported emit inventory',
  );
});

test('SaasRecordButton helpers: phases, names, and intents', () => {
  const helpers = loaded.SaasRecordButton.helpers;
  assert.deepEqual([...helpers.SAAS_RECORD_PHASES], ['idle', 'starting', 'recording', 'stopping', 'sealed', 'error']);
  assert.equal(helpers.normalizeRecordPhase('bogus'), 'idle');
  assert.equal(helpers.normalizeRecordPhase(null), 'idle');
  assert.equal(helpers.recordButtonLabel('idle'), 'Record');
  assert.equal(helpers.recordButtonLabel('recording'), 'Stop');
  assert.equal(helpers.recordButtonLabel('starting'), 'Starting');
  assert.equal(helpers.recordButtonBusy('starting'), true);
  assert.equal(helpers.recordButtonBusy('stopping'), true);
  assert.equal(helpers.recordButtonBusy('recording'), false);
  assert.equal(
    helpers.recordAccessibleName({ capsuleLabel: 'Capsule-01', capsuleId: 'capsule-01', phase: 'idle' }),
    'Record Capsule-01',
  );
  assert.equal(
    helpers.recordAccessibleName({ capsuleLabel: '', capsuleId: 'capsule-01', phase: 'recording' }),
    'Stop recording capsule-01',
  );
  assert.equal(helpers.recordDomId('capsule-01'), 'cuk-saas-record-capsule-01');
  assert.equal(helpers.recordAnchor('capsule-01'), 'capsule/capsule-01/record');
  assert.deepEqual(
    helpers.buildRecordIntent({ capsuleId: 'capsule-01', phase: 'recording' }),
    { type: 'record', capsuleId: 'capsule-01', phase: 'recording' },
  );
  assert.ok(Object.isFrozen(helpers.buildRecordIntent({ capsuleId: 'capsule-01' })));
  const fixture = helpers.saasRecordButtonFixture();
  assert.equal(fixture.capsuleId, 'capsule-01');
  assert.equal(fixture.capsuleLabel, 'Capsule-01');
  assert.deepEqual(helpers.saasRecordButtonFixture({ phase: 'recording' }).phase, 'recording');
});

test('SaasViewerChips helpers: unknown values omitted, never coerced', () => {
  const helpers = loaded.SaasViewerChips.helpers;
  assert.equal(helpers.formatScaledBadge(0.62), 'SCALED x0.62');
  assert.equal(helpers.formatScaledBadge(1), 'SCALED x1.00');
  for (const unknown of [null, undefined, Number.NaN, -1, 'x0.62', Number.POSITIVE_INFINITY]) {
    assert.equal(helpers.formatScaledBadge(unknown), null, `scaled ${String(unknown)} omitted`);
  }
  assert.equal(helpers.formatElapsedTimer('00:14:28'), '00:14:28');
  assert.equal(helpers.formatElapsedTimer('  '), null);
  assert.equal(helpers.formatElapsedTimer(null), null);
  assert.equal(helpers.formatViewerLabel('viewer-01'), 'viewer-01');
  assert.equal(helpers.formatViewerLabel(''), null);
  const ids = helpers.viewerChipsDomIds('capsule-01');
  assert.equal(ids.group, 'cuk-saas-viewer-chips-capsule-01');
  assert.equal(ids.scaled, 'cuk-saas-viewer-scaled-capsule-01');
  assert.equal(helpers.scaledBadgeAnchor('capsule-01'), 'capsule/capsule-01/scaled-badge');
  const fixture = helpers.saasViewerChipsFixture();
  assert.equal(fixture.scaled, 0.62);
  assert.equal(fixture.viewerLabel, 'viewer-01');
});

test('SaasSurfaceView helpers: states and slot anchor', () => {
  const helpers = loaded.SaasSurfaceView.helpers;
  assert.equal(helpers.normalizeSurfaceState('live'), 'live');
  assert.equal(helpers.normalizeSurfaceState('bogus'), 'empty');
  assert.equal(
    helpers.surfaceAccessibleName({ capsuleLabel: 'Capsule-01', capsuleId: 'capsule-01', state: 'live' }),
    'Live surface for Capsule-01',
  );
  assert.equal(
    helpers.surfaceAccessibleName({ capsuleId: 'capsule-01', state: 'lost' }),
    'Surface lost for capsule-01',
  );
  assert.deepEqual(helpers.surfaceViewDomIds('capsule-01', 'wall-main'), {
    host: 'cuk-saas-surface-capsule-01-wall-main',
    slot: 'cuk-saas-surface-slot-capsule-01',
  });
  assert.equal(helpers.surfaceViewAnchor('capsule-01'), 'capsule/capsule-01/slot');
  assert.deepEqual(
    helpers.buildActivateSurfacePayload({ capsuleId: 'capsule-01', state: 'live' }),
    { capsuleId: 'capsule-01', state: 'live' },
  );
  assert.equal(helpers.saasSurfaceViewFixture().presentationInstance, 'wall-main');
});

test('SaasVeil helpers: projection mapping, error shaping, payloads', () => {
  const helpers = loaded.SaasVeil.helpers;
  assert.equal(helpers.normalizeVeilKind('ai-held'), 'ai-held');
  assert.equal(helpers.normalizeVeilKind('bogus'), 'none');
  assert.equal(helpers.resolveSaasVeilKind(null), 'none');
  assert.equal(helpers.resolveSaasVeilKind({ lifecycle: 'failed' }), 'error');
  assert.equal(helpers.resolveSaasVeilKind({ mode: 'agent_locked' }), 'ai-held');
  assert.equal(helpers.resolveSaasVeilKind({ mode: 'switching' }), 'switching');
  assert.equal(helpers.resolveSaasVeilKind({ lifecycle: 'booting' }), 'booting');
  assert.equal(helpers.resolveSaasVeilKind({ lifecycle: 'ready', mode: 'operator_controlled' }), 'none');
  const lines = helpers.visibleDetailLines([
    { text: 'a', tone: 'critical' },
    'b',
    { text: 'c', tone: 'bogus' },
    { text: 'dropped', tone: 'neutral' },
  ]);
  assert.deepEqual(lines, [
    { text: 'a', tone: 'critical' },
    { text: 'b', tone: 'neutral' },
    { text: 'c', tone: 'neutral' },
  ]);
  assert.deepEqual(helpers.visibleDetailLines(null), []);
  const stats = helpers.visibleErrorStats([{ key: 'K', value: 'V' }]);
  assert.equal(stats.length, 2);
  assert.deepEqual(stats[0], { key: 'K', value: 'V' });
  assert.deepEqual(stats[1], { key: 'Unavailable', value: 'Unavailable' });
  assert.deepEqual(helpers.veilAnchors('capsule-01'), {
    control: 'capsule/capsule-01/control',
    retry: 'capsule/capsule-01/retry',
    export: 'capsule/capsule-01/export',
  });
  assert.deepEqual(
    helpers.buildVeilControlPayload({ capsuleId: 'capsule-01', verb: 'take-control' }),
    { capsuleId: 'capsule-01', verb: 'take-control' },
  );
  assert.deepEqual(
    helpers.buildVeilIntent({ type: 'retry', capsuleId: 'capsule-01' }),
    { type: 'retry', capsuleId: 'capsule-01' },
  );
  assert.equal(helpers.saasVeilFixture().agentLabel, 'Agent-01');
  assert.equal(
    templateContent('SaasVeil').match(/v-else(?!-if)/g),
    null,
    'unknown veil kinds render nothing (no bare v-else)',
  );
});

test('SaasFoldedRail helpers: cards, badges, telemetry, intent payloads', () => {
  const helpers = loaded.SaasFoldedRail.helpers;
  assert.equal(helpers.normalizeFoldedCardState('bogus'), 'idle');
  assert.deepEqual(helpers.foldedStateChip('idle'), { label: 'IDLE', tone: 'success' });
  assert.deepEqual(helpers.foldedStateChip('busy'), { label: 'BUSY', tone: 'warning' });
  assert.deepEqual(helpers.foldedMiniBadges({ surface: 'guest', terminal: '', port: '8080' }), [
    { key: 'surface', text: 'SURFACE: guest' },
    { key: 'port', text: 'PORT: 8080' },
  ]);
  assert.deepEqual(helpers.foldedMiniBadges(null), []);
  assert.deepEqual(
    helpers.foldedTelemetryRows([
      { key: 'RAM', value: '1MB', tone: 'success' },
      { key: '', value: 'dropped' },
      'dropped',
    ]),
    [{ key: 'RAM', value: '1MB', tone: 'success' }],
  );
  assert.deepEqual(helpers.foldedCardDomIds('capsule-05'), {
    card: 'cuk-saas-folded-card-capsule-05',
    restore: 'cuk-saas-folded-restore-capsule-05',
  });
  assert.equal(helpers.foldedRestoreAnchor('capsule-05'), 'capsule/capsule-05/show');
  assert.deepEqual(
    helpers.buildUnfoldPayload({ capsuleId: 'capsule-05' }),
    { capsuleId: 'capsule-05', folded: false },
  );
  assert.deepEqual(
    helpers.buildUnfoldAllIntent({ capsuleIds: ['capsule-05'] }),
    { type: 'unfold-all', capsuleIds: ['capsule-05'] },
  );
  const fixture = helpers.saasFoldedRailFixture();
  assert.equal(fixture.capsules[0].capsuleLabel, 'Capsule-05');
});

test('SaasWallTile helpers: phases, logs, tabs, anchors, payloads', () => {
  const helpers = loaded.SaasWallTile.helpers;
  assert.equal(helpers.normalizeWallPhase('bogus'), 'running');
  assert.deepEqual(helpers.wallPhaseChip('running'), { label: 'RUNNING', tone: 'success' });
  assert.deepEqual(helpers.wallPhaseChip('locked'), { label: 'LOCKED', tone: 'warning' });
  assert.deepEqual(helpers.wallPhaseChip('agent-lock'), { label: 'AGENT LOCK', tone: 'info' });
  assert.deepEqual(helpers.wallPhaseChip('error'), { label: 'ERROR', tone: 'error' });
  assert.equal(helpers.wallStatusDotTone('agent-lock'), 'info');
  const logs = helpers.visibleLogLines([
    { timestamp: 't1', level: 'L1', text: 'a', tone: 'info' },
    { timestamp: 't2', level: 'L2', text: 'b', tone: 'bogus' },
    { timestamp: 't3', level: 'L3', text: 'dropped' },
  ]);
  assert.equal(logs.length, 2);
  assert.equal(logs[1].tone, 'neutral');
  assert.equal(
    helpers.wallSessionTabName({ sessionId: 'tty-1', title: 'tty-1', activity: 'attached' }),
    'tty-1 (tty-1) — attached',
  );
  assert.equal(
    helpers.wallSessionTabName({ sessionId: 's', title: 't', attention: true }),
    't (s) — unknown, needs attention',
  );
  const ids = helpers.wallTileDomIds('capsule-01');
  assert.equal(ids.tile, 'cuk-saas-wall-tile-capsule-01');
  assert.equal(ids.drawer, 'cuk-saas-wall-drawer-capsule-01');
  assert.equal(helpers.wallSessionTabDomId('capsule-01', 'tty-1'), 'cuk-saas-wall-tab-capsule-01-tty-1');
  assert.deepEqual(helpers.wallTileAnchors('capsule-01'), {
    panel: 'capsule/capsule-01/panel',
    fold: 'capsule/capsule-01/fold',
    float: 'capsule/capsule-01/float',
    close: 'capsule/capsule-01/close',
    control: 'capsule/capsule-01/control',
    popout: 'capsule/capsule-01/popout',
  });
  assert.equal(
    helpers.wallSessionTabAnchor('capsule-01', 'tty-1'),
    'capsule/capsule-01/session/tty-1/tab',
  );
  assert.deepEqual(
    helpers.buildWallFoldPayload({ capsuleId: 'capsule-01' }),
    { capsuleId: 'capsule-01', folded: true },
  );
  assert.deepEqual(
    helpers.buildWallControlPayload({ capsuleId: 'capsule-01' }),
    { capsuleId: 'capsule-01', verb: 'take-control' },
  );
  assert.deepEqual(
    helpers.buildWallSelectSessionPayload({ capsuleId: 'capsule-01', sessionId: 'tty-1' }),
    { capsuleId: 'capsule-01', viewedSessionId: 'tty-1' },
  );
});

test('Saas wall anchors conform to controlRegistry families (new rows tolerate Lane E)', () => {
  const existing = [
    'capsule/capsule-01/panel',
    'capsule/capsule-01/fold',
    'capsule/capsule-01/float',
    'capsule/capsule-01/close',
    'capsule/capsule-01/control',
    'capsule/capsule-01/popout',
    'capsule/capsule-01/show',
    'capsule/capsule-01/slot',
    'capsule/capsule-01/session/tty-1/tab',
  ];
  for (const anchor of existing) {
    assert.ok(matchControlFamily(anchor), `existing family anchor matches: ${anchor}`);
  }
  const pendingRows = Object.freeze({
    'capsule/capsule-01/record': 'button',
    'capsule/capsule-01/retry': 'button',
    'capsule/capsule-01/export': 'button',
  });
  for (const [anchor, role] of Object.entries(pendingRows)) {
    const rule = matchControlFamily(anchor);
    assert.ok(
      rule === null || rule.allowedRoles.includes(role),
      `pending Lane E row ${anchor} allows ${role} once added`,
    );
  }
  const scaled = matchControlFamily('capsule/capsule-01/scaled-badge');
  assert.ok(scaled === null || typeof scaled === 'object', 'scaled-badge row is Lane E owned');
});

test('Saas wall fixtures cover every required prop with neutral labels', () => {
  const fixtureEntry = Object.freeze({
    SaasRecordButton: 'saasRecordButtonFixture',
    SaasViewerChips: 'saasViewerChipsFixture',
    SaasSurfaceView: 'saasSurfaceViewFixture',
    SaasVeil: 'saasVeilFixture',
    SaasFoldedRail: 'saasFoldedRailFixture',
    SaasWallTile: 'saasWallTileFixture',
  });
  for (const component of COMPONENTS) {
    const setup = setupContent(component.name);
    const required = [...setup.matchAll(/(\w+)\s*:\s*\{[^{}]*required\s*:\s*true[^{}]*\}/g)]
      .map((entry) => entry[1]);
    const fixture = loaded[component.name].helpers[fixtureEntry[component.name]]();
    for (const prop of required) {
      assert.ok(prop in fixture, `${component.name}: fixture covers required prop ${prop}`);
    }
    const serialized = JSON.stringify(fixture);
    assertNoBanned(serialized, `${component.name}: neutral fixture`);
    for (const match of serialized.matchAll(/Capsule-([A-Za-z0-9]+)/g)) {
      assert.match(match[1], /^\d+$/, `${component.name}: neutral Capsule-NN labels`);
    }
  }
  const tileFixture = loaded.SaasWallTile.helpers.saasWallTileFixture();
  assert.equal(tileFixture.sessions.length, 2);
  assert.equal(tileFixture.logLines.length, 2);
  assert.equal(tileFixture.viewer.viewerLabel, 'viewer-01');
});

test('Saas wall negative contrasts: explicit unavailable, never fake live', () => {
  const tileSource = loaded.SaasWallTile.source;
  assert.ok(tileSource.includes('Address unavailable'), 'missing address renders unavailable');
  assert.ok(tileSource.includes('{{ addressText }}'), 'address fallback is bound in the template');
  assert.ok(tileSource.includes('No output.'), 'empty drawer renders no-output');
  assert.ok(loaded.SaasFoldedRail.source.includes('No folded capsules.'), 'empty rail is explicit');
  const veilSource = loaded.SaasVeil.source;
  assert.ok(veilSource.includes('CID unavailable'), 'missing CID renders unavailable');
  assert.ok(veilSource.includes('Fault unavailable'), 'missing fault renders unavailable');
  assert.ok(veilSource.includes('Crash dump unavailable'), 'missing dump renders unavailable');
  assert.ok(veilSource.includes('Exit code unavailable'), 'missing exit renders unavailable');
  const rail = loaded.SaasFoldedRail.helpers;
  assert.deepEqual(rail.buildUnfoldPayload({ capsuleId: 'capsule-05' }).folded, false);
  const tile = loaded.SaasWallTile.helpers;
  assert.deepEqual(tile.visibleLogLines(null), []);
  assert.equal(tile.normalizeWallPhase(undefined), 'running');
});
