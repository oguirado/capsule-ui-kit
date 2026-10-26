/**
 * @fileoverview Lane R recordings tests: SFC structure, helper units,
 * fixture-driven demo contracts, anchor conformance, export gating, and
 * negative contrasts for the two `src/recordings/Rec*` components (MV1),
 * the intent vocabulary and the agent_lane registry rows. Plain JS,
 * node:test, no Electron.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const compilerSfc = require('@vue/compiler-sfc');

const intentsModule = await import(
  pathToFileURL(path.resolve(__dirname, '../src/recordings/recordingsIntents.js')).href,
);
const registryModule = await import(
  pathToFileURL(path.resolve(__dirname, '../src/recordings/recordingsRegistryRows.js')).href,
);

const COMPONENTS = Object.freeze([
  Object.freeze({
    name: 'RecordingControlBar',
    path: '../src/recordings/RecordingControlBar.vue',
    emits: Object.freeze(['submit-intent']),
    hasMotion: true,
    buttons: 2,
  }),
  Object.freeze({
    name: 'RecordingsPanel',
    path: '../src/recordings/RecordingsPanel.vue',
    emits: Object.freeze(['submit-intent']),
    hasMotion: false,
    buttons: 2,
  }),
]);

const LANE_JS = Object.freeze([
  '../src/recordings/recordingsIntents.js',
  '../src/recordings/recordingsRegistryRows.js',
  '../src/recordings/index.js',
]);

// Hashed deny-list: sha256 hex of lowercased private terms; public tokens stay literal.
const FORBIDDEN_HASHES = new Set([
  '3b122b9d4638c4ddb162f8b7c7de993f1ed87faafb21796fcebe2540fe6d8f4d',
  'f3e0f62e477c2a77c0e0030333940766ebf08b2bccac871646ac86aea5672e01',
  '3b0493733cf2cf82565a9a7ac636f0d6298bf4b2530e1ad017aeb1de4a735933',
  'b8412a7082b42c4b616e8349ad13462a8650ff4706388191ab3b530013eed281',
  '4d0f43f3e81b83426c793bc8b321d5c1930c909ac3f27a83821fcac0718c2343',
  '3a7a45ec9c91cfab9b56ba3c34cc1e0086a739987b5f547514d8561f5623c745',
  '4526396bddaf5799499e344f4ba219846d008bef46fe662b6c29d6c07b330765',
  '94819eaebc292ccdf747102ba9dc6f452e0b7fbbb7b80bdd17e3e7fcb36e2833',
  'd2779f2492ad4922036cb8054402ba72b67485f002e986e5df903f914b69a992',
]);
const FORBIDDEN_LENS = [5, 6, 8, 10, 11, 12, 21, 30];
const FORBIDDEN_PUBLIC = [
  'opensuperficies',
  'claude',
  'gpt',
  'openai',
  'anthropic',
  'gemini',
  'vance',
  'sec-ops',
  '127.0.0.1',
];

// Rebuilt samples without spelling terms: char codes of lowercased terms.
const FORBIDDEN_CODES = [
  [47, 104, 111, 109, 101, 47],
  [109, 101, 116, 97, 118, 105, 101, 119, 101, 114],
  [104, 111, 108, 100, 105, 110, 103, 115, 45, 105, 110, 116],
  [104, 111, 108, 100, 105, 110, 103, 115],
  [116, 101, 97, 109, 119, 111, 114, 107, 95, 97, 110, 116, 105, 103, 114, 97, 118, 105, 116, 121, 50],
  [118, 105, 115, 117, 97, 108, 45, 113, 97, 45, 48],
  [97, 114, 95, 107, 95],
  [112, 97, 112, 101, 114, 115, 109, 97, 116, 104, 45, 48],
  [111, 114, 113, 117, 101, 115, 116, 97, 100, 111, 114, 95, 119, 97, 118, 101, 109, 105, 110, 100, 95, 112, 114, 111, 121, 101, 99, 116, 111, 115],
];

function sha256hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function findForbiddenHash(lower) {
  const runs = lower.split(/[^a-z0-9_./-]+/);
  for (const run of runs) {
    for (const len of FORBIDDEN_LENS) {
      if (run.length < len) continue;
      for (let i = 0; i + len <= run.length; i += 1) {
        const digest = sha256hex(run.slice(i, i + len));
        if (FORBIDDEN_HASHES.has(digest)) return digest;
      }
    }
  }
  return null;
}

function homePathPattern() {
  const roots = ['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|');
  return new RegExp('/(?:' + roots + ')/[\\w.-]+', 'i');
}

function assertPublishable(text, label) {
  const normalized = text.toLowerCase();
  for (const banned of FORBIDDEN_PUBLIC) {
    assert.equal(normalized.includes(banned), false, `${label}: must not contain ${banned}`);
  }
  const hit = findForbiddenHash(normalized);
  assert.equal(hit, null, `${label}: private path or internal name (hash ${hit})`);
  assert.doesNotMatch(
    text,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
    `${label}: no e-mail-shaped strings`,
  );
  assert.doesNotMatch(text, homePathPattern(), `${label}: no absolute home path`);
}

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
    id: `cuk-recordings-${component.name}`,
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

const laneJsSources = LANE_JS.map((rel) => ({
  rel,
  source: fs.readFileSync(path.resolve(__dirname, rel), 'utf8'),
}));

function styleContent(name) {
  return loaded[name].descriptor.styles.map((style) => style.content).join('\n');
}

function templateContent(name) {
  return loaded[name].descriptor.template.content;
}

function setupContent(name) {
  return loaded[name].descriptor.scriptSetup.content;
}

function scriptContent(name) {
  return loaded[name].descriptor.script.content;
}

test('recordings SFCs are plain JS with no vendor imports', () => {
  for (const component of COMPONENTS) {
    const { source } = loaded[component.name];
    assert.ok(!source.includes('lang="ts"'), `${component.name}: no lang="ts"`);
    assert.ok(!source.includes("lang='ts'"), `${component.name}: no lang='ts'`);
    assert.doesNotMatch(source, /from\s+['"]openvue\//, `${component.name}: no direct openvue imports`);
    assert.doesNotMatch(source, /from\s+['"]@openvue\//, `${component.name}: no direct @openvue imports`);
  }
  for (const { rel, source } of laneJsSources) {
    assert.doesNotMatch(source, /from\s+['"]openvue\//, `${rel}: no direct openvue imports`);
    assert.doesNotMatch(source, /from\s+['"]@openvue\//, `${rel}: no direct @openvue imports`);
  }
});

test('recordings styles are tokens-only', () => {
  for (const component of COMPONENTS) {
    const css = styleContent(component.name);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${component.name}: no hardcoded hex colors`);
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
      assert.ok(match[1].startsWith('--cuk-'), `${component.name}: token var ${match[1]}`);
    }
  }
});

test('recordings motion honors reduced-motion', () => {
  for (const component of COMPONENTS) {
    const css = styleContent(component.name);
    if (!component.hasMotion) continue;
    assert.ok(css.includes('@keyframes'), `${component.name}: documents its keyframes`);
    assert.ok(
      css.includes('prefers-reduced-motion'),
      `${component.name}: honors prefers-reduced-motion`,
    );
  }
});

test('recordings lane files carry no placeholder, product or path names', () => {
  for (const component of COMPONENTS) {
    assertPublishable(loaded[component.name].source, component.name);
  }
  for (const { rel, source } of laneJsSources) {
    assertPublishable(source, rel);
  }
});

test('recordings hashed guard rejects each private sample (must-FAIL)', () => {
  assert.equal(FORBIDDEN_CODES.length, FORBIDDEN_HASHES.size);
  for (const codes of FORBIDDEN_CODES) {
    const term = String.fromCharCode(...codes);
    assert.ok(FORBIDDEN_HASHES.has(sha256hex(term)));
    for (const sample of [term, term.toUpperCase()]) {
      assert.throws(() => assertPublishable(`prefix ${sample} suffix`, 'sample'));
    }
  }
  assert.doesNotThrow(() => assertPublishable(
    'See docs/UI_ARCHITECTURE.md in the consuming product; Vue 3.5.',
    'clean',
  ));
});

test('recordings kit-write tripwire: no sink APIs in lane sources', () => {
  const sinks = [
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'fetch(',
    'XMLHttpRequest',
    'navigator.clipboard',
    'writeText(',
    'writeFile',
    'appendFile',
    'createWriteStream',
    'document.write',
    'window.open',
    'sendBeacon',
    'WebSocket(',
  ];
  for (const component of COMPONENTS) {
    for (const sink of sinks) {
      assert.equal(
        loaded[component.name].source.includes(sink),
        false,
        `${component.name}: must not contain ${sink}`,
      );
    }
  }
  for (const { rel, source } of laneJsSources) {
    for (const sink of sinks) {
      assert.equal(source.includes(sink), false, `${rel}: must not contain ${sink}`);
    }
  }
});

test('recordings components emit intents only', () => {
  for (const component of COMPONENTS) {
    const helpers = loaded[component.name].helpers;
    const emitsKey =
      component.name === 'RecordingControlBar'
        ? 'RECORDING_CONTROL_BAR_EMITS'
        : 'RECORDINGS_PANEL_EMITS';
    assert.deepEqual([...helpers[emitsKey]], [...component.emits]);
    const setup = setupContent(component.name);
    assert.ok(
      setup.includes("defineEmits(['submit-intent'])"),
      `${component.name}: declares the single intent channel`,
    );
    for (const match of setup.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      const ok = specifier === 'vue' || specifier.startsWith('./');
      assert.ok(ok, `${component.name}: import ${specifier} must be vue or a lane-relative file`);
    }
  }
});

test('control bar helpers: phases, labels and busy states', () => {
  const h = loaded.RecordingControlBar.helpers;
  assert.deepEqual([...h.RECORDING_PHASES], ['idle', 'starting', 'recording', 'stopping', 'sealed', 'error']);
  assert.deepEqual([...h.RECORDING_SCREENSHOT_STATES], ['idle', 'capturing', 'done', 'error']);
  assert.equal(h.normalizeRecordPhase('recording'), 'recording');
  assert.equal(h.normalizeRecordPhase('bogus'), 'idle');
  assert.equal(h.normalizeRecordPhase(undefined), 'idle');
  assert.equal(h.recordPhaseBusy('starting'), true);
  assert.equal(h.recordPhaseBusy('stopping'), true);
  assert.equal(h.recordPhaseBusy('recording'), false);
  assert.equal(h.recordPhaseBusy('idle'), false);
  assert.equal(h.normalizeScreenshotState('capturing'), 'capturing');
  assert.equal(h.normalizeScreenshotState('bogus'), 'idle');
  assert.equal(h.screenshotStateBusy('capturing'), true);
  assert.equal(h.screenshotStateBusy('done'), false);
  assert.equal(h.recordToggleLabel('idle'), 'Record for AI');
  assert.equal(h.recordToggleLabel('recording'), 'Stop');
  assert.equal(h.recordToggleLabel('starting'), 'Starting');
  assert.equal(h.recordToggleLabel('stopping'), 'Stopping');
  assert.equal(h.recordToggleLabel('error'), 'Retry');
  assert.equal(h.recordToggleLabel('sealed'), 'Record again');
  assert.equal(h.screenshotButtonLabel('idle'), 'Screenshot');
  assert.equal(h.screenshotButtonLabel('capturing'), 'Capturing');
  assert.equal(h.screenshotButtonLabel('done'), 'Captured');
  assert.equal(h.screenshotButtonLabel('error'), 'Retry capture');
  assert.equal(h.formatElapsed(125), '02:05');
  assert.equal(h.formatElapsed(0), '00:00');
  assert.equal(h.formatElapsed(null), '--:--');
  assert.equal(h.formatElapsed(undefined), '--:--');
  assert.equal(h.formatElapsed(-1), '--:--');
  assert.equal(h.formatElapsed(NaN), '--:--');
  assert.equal(h.storeLabel('ram'), 'RAM');
  assert.equal(h.storeLabel('disk'), 'Unknown');
  assert.equal(h.storeLabel(null), 'Unknown');
});

test('control bar helpers: accessible names, ids and anchors', () => {
  const h = loaded.RecordingControlBar.helpers;
  assert.equal(
    h.recordToggleAccessibleName({ capsuleId: 'cap-01', capsuleLabel: 'Capsule-01', phase: 'idle' }),
    'Record Capsule-01 for AI',
  );
  assert.equal(
    h.recordToggleAccessibleName({ capsuleId: 'cap-01', phase: 'recording' }),
    'Stop AI recording on cap-01',
  );
  assert.equal(
    h.recordToggleAccessibleName({ capsuleId: 'cap-01', phase: 'starting' }),
    'AI recording transition pending on cap-01',
  );
  assert.equal(
    h.recordToggleAccessibleName({ capsuleId: 'cap-01', phase: 'error' }),
    'Retry AI recording on cap-01',
  );
  assert.equal(
    h.screenshotAccessibleName({ capsuleId: 'cap-01', state: 'idle' }),
    'Screenshot cap-01',
  );
  assert.equal(
    h.screenshotAccessibleName({ capsuleId: 'cap-01', state: 'capturing' }),
    'Screenshot capture pending on cap-01',
  );
  assert.equal(h.controlBarDomId('cap-01'), 'cuk-recordings-bar-cap-01');
  assert.equal(h.recordToggleDomId('cap-01'), 'cuk-recordings-toggle-cap-01');
  assert.equal(h.screenshotDomId('cap-01'), 'cuk-recordings-screenshot-cap-01');
  assert.equal(h.phaseDomId('cap-01'), 'cuk-recordings-phase-cap-01');
  assert.equal(h.storeChipDomId('cap-01'), 'cuk-recordings-store-cap-01');
  assert.equal(h.recordToggleAnchor('cap-01'), 'recording/cap-01/toggle');
  assert.equal(h.screenshotAnchor('cap-01'), 'recording/cap-01/screenshot');
  assert.equal(h.phaseAnchor('cap-01'), 'recording/cap-01/phase');
  assert.equal(h.storeChipAnchor('cap-01'), 'recording/cap-01/store-chip');
  const fixture = h.recordingControlBarFixture();
  assert.equal(fixture.capsuleId, 'cap-01');
  assert.equal(fixture.phase, 'idle');
  assert.equal(fixture.store, 'ram');
  assert.equal(h.recordingControlBarFixture({ phase: 'recording' }).phase, 'recording');
});

test('panel helpers: labels, tones and unknown-honest formats', () => {
  const h = loaded.RecordingsPanel.helpers;
  assert.equal(h.phaseLabel('idle'), 'Idle');
  assert.equal(h.phaseLabel('starting'), 'Starting');
  assert.equal(h.phaseLabel('recording'), 'Recording');
  assert.equal(h.phaseLabel('stopping'), 'Stopping');
  assert.equal(h.phaseLabel('sealed'), 'Sealed');
  assert.equal(h.phaseLabel('error'), 'Error');
  assert.equal(h.phaseLabel('bogus'), 'Idle');
  assert.equal(h.phaseTone('recording'), 'error');
  assert.equal(h.phaseTone('starting'), 'warning');
  assert.equal(h.phaseTone('stopping'), 'warning');
  assert.equal(h.phaseTone('sealed'), 'success');
  assert.equal(h.phaseTone('error'), 'error');
  assert.equal(h.phaseTone('idle'), 'neutral');
  assert.equal(h.formatElapsed(61), '01:01');
  assert.equal(h.formatElapsed(null), '--:--');
  assert.equal(h.formatCount(3750), '3750');
  assert.equal(h.formatCount(0), '0');
  assert.equal(h.formatCount(null), 'Unknown');
  assert.equal(h.formatCount(undefined), 'Unknown');
  assert.equal(h.formatCount(-2), 'Unknown');
  assert.equal(h.formatCount(1.5), 'Unknown');
  assert.equal(h.formatTtl(600), '10:00');
  assert.equal(h.formatTtl(null), 'Unknown');
  assert.equal(h.formatTtl(undefined), 'Unknown');
  assert.equal(h.formatTtl(0), 'Expired');
  assert.equal(h.formatTtl(-5), 'Expired');
  assert.equal(h.storeLabel('ram'), 'RAM');
  assert.equal(h.storeLabel('tape'), 'Unknown');
  assert.equal(
    h.rowErrorText({ phase: 'error', error: 'backend refused' }),
    'backend refused',
  );
  assert.equal(h.rowErrorText({ phase: 'error', error: '' }), 'Unknown error');
  assert.equal(h.rowErrorText({ phase: 'error' }), 'Unknown error');
  assert.equal(h.rowErrorText({ phase: 'sealed', error: 'stale' }), '');
  assert.equal(h.RECORDINGS_EMPTY_TEXT, 'No recordings yet.');
});

test('panel helpers: export gate precedence and literal reasons', () => {
  const h = loaded.RecordingsPanel.helpers;
  assert.equal(h.EXPORT_DESTINATION_REASON, 'No export destination advertised by the host');
  assert.equal(h.EXPORT_UNSEALED_REASON, 'Only sealed recordings can be exported');
  assert.deepEqual(h.exportGateFor({ phase: 'sealed', destination: 'host-picker' }), {
    disabled: false,
    reason: '',
    gate: 'ready',
    gateLabel: 'Export ready',
  });
  assert.deepEqual(
    h.exportGateFor({ phase: 'recording', destination: 'host-picker' }),
    {
      disabled: true,
      reason: 'Only sealed recordings can be exported',
      gate: 'sealed-required',
      gateLabel: 'Sealed required',
    },
  );
  assert.deepEqual(h.exportGateFor({ phase: 'sealed', destination: null }), {
    disabled: true,
    reason: 'No export destination advertised by the host',
    gate: 'destination-required',
    gateLabel: 'Destination required',
  });
  assert.deepEqual(h.exportGateFor({ phase: 'sealed', destination: '  ' }), {
    disabled: true,
    reason: 'No export destination advertised by the host',
    gate: 'destination-required',
    gateLabel: 'Destination required',
  });
  assert.deepEqual(
    h.exportGateFor({ phase: 'sealed', destination: 'host-picker', unavailableReason: 'panel held' }),
    { disabled: true, reason: 'panel held', gate: 'unavailable', gateLabel: 'Unavailable' },
  );
  // Unsealed wins over a missing destination: the phase reason is actionable first.
  assert.deepEqual(h.exportGateFor({ phase: 'idle', destination: null }), {
    disabled: true,
    reason: 'Only sealed recordings can be exported',
    gate: 'sealed-required',
    gateLabel: 'Sealed required',
  });
});

test('panel helpers: names, ids, anchors and fixture', () => {
  const h = loaded.RecordingsPanel.helpers;
  const row = { id: 'rec-01', capsuleId: 'cap-01', capsuleLabel: 'Capsule-01' };
  assert.equal(h.selectAccessibleName(row), 'Select Capsule-01');
  assert.equal(h.exportAccessibleName(row), 'Export Capsule-01 to host destination');
  assert.equal(h.selectAccessibleName({ id: 'rec-09' }), 'Select rec-09');
  assert.equal(h.panelDomId('cap-01'), 'cuk-recordings-panel-cap-01');
  assert.equal(h.manifestRowDomId('rec-01'), 'cuk-recordings-row-rec-01');
  assert.equal(h.manifestSelectDomId('rec-01'), 'cuk-recordings-select-rec-01');
  assert.equal(h.exportDomId('rec-01'), 'cuk-recordings-export-rec-01');
  assert.equal(h.exportGateDomId('rec-01'), 'cuk-recordings-gate-rec-01');
  assert.equal(h.manifestRowAnchor('rec-01'), 'recording/rec-01/row');
  assert.equal(h.manifestSelectAnchor('rec-01'), 'recording/rec-01/select');
  assert.equal(h.exportAnchor('rec-01'), 'recording/rec-01/export');
  assert.equal(h.exportGateAnchor('rec-01'), 'recording/rec-01/export-gate');
  const fixture = h.recordingsPanelFixture();
  assert.equal(fixture.capsuleId, 'cap-01');
  assert.equal(fixture.recordings.length, 1);
  assert.equal(fixture.recordings[0].id, 'rec-01');
  assert.equal(fixture.recordings[0].phase, 'sealed');
  assert.equal(h.recordingsPanelFixture({ selectedId: 'rec-01' }).selectedId, 'rec-01');
});

test('recordings intents: builders produce frozen intent objects', () => {
  const m = intentsModule;
  assert.deepEqual([...m.RECORDING_INTENT_TYPES], [
    'record-ai',
    'screenshot',
    'recording-select',
    'recording-export',
  ]);
  assert.deepEqual([...m.RECORDING_STORES], ['ram']);
  const toggle = m.buildRecordAiIntent({ capsuleId: 'cap-01', phase: 'recording' });
  assert.deepEqual(toggle, { type: 'record-ai', capsuleId: 'cap-01', phase: 'recording' });
  assert.ok(Object.isFrozen(toggle));
  assert.equal(m.buildRecordAiIntent({ capsuleId: 'cap-01', phase: 'bogus' }).phase, 'idle');
  const shot = m.buildScreenshotIntent({ capsuleId: 'cap-01' });
  assert.deepEqual(shot, { type: 'screenshot', capsuleId: 'cap-01', target: 'ram' });
  assert.ok(Object.isFrozen(shot));
  const select = m.buildRecordingSelectIntent({ capsuleId: 'cap-01', recordingId: 'rec-01' });
  assert.deepEqual(select, { type: 'recording-select', capsuleId: 'cap-01', recordingId: 'rec-01' });
  const exported = m.buildRecordingExportIntent({
    capsuleId: 'cap-01',
    recordingId: 'rec-01',
    phase: 'sealed',
    destination: 'host-picker',
  });
  assert.deepEqual(exported, {
    type: 'recording-export',
    capsuleId: 'cap-01',
    recordingId: 'rec-01',
    phase: 'sealed',
    destination: 'host-picker',
  });
  assert.ok(Object.isFrozen(exported));
});

test('recordings intents: builders refuse with coded errors', () => {
  const m = intentsModule;
  assert.throws(
    () =>
      m.buildRecordingExportIntent({
        capsuleId: 'cap-01',
        recordingId: 'rec-01',
        phase: 'sealed',
        destination: null,
      }),
    { code: 'ERR_EXPORT_WITHOUT_DESTINATION' },
  );
  assert.throws(
    () =>
      m.buildRecordingExportIntent({
        capsuleId: 'cap-01',
        recordingId: 'rec-01',
        phase: 'recording',
        destination: 'host-picker',
      }),
    { code: 'ERR_EXPORT_UNSEALED_RECORDING' },
  );
  assert.throws(() => m.buildRecordAiIntent({ capsuleId: '', phase: 'idle' }), {
    code: 'ERR_INVENTED_CAPSULE_ID',
  });
  assert.throws(() => m.buildRecordAiIntent({ capsuleId: '42', phase: 'idle' }), {
    code: 'ERR_NUMERIC_INDEX_ID',
  });
  assert.throws(
    () => m.buildRecordingSelectIntent({ capsuleId: 'cap-01', recordingId: '' }),
    { code: 'ERR_INVENTED_RECORDING_ID' },
  );
  assert.throws(
    () => m.buildRecordingSelectIntent({ capsuleId: 'cap-01', recordingId: '7' }),
    { code: 'ERR_NUMERIC_INDEX_ID' },
  );
  assert.equal(m.validateCapsuleId('cap-01').ok, true);
  assert.equal(m.validateCapsuleId('  ').ok, false);
  assert.equal(m.validateRecordingId('rec-01').ok, true);
  assert.equal(m.validateRecordingId('nope nope').error.code, 'ERR_INVALID_IDENTITY');
  assert.equal(m.normalizeStore('ram'), 'ram');
  assert.equal(m.normalizeStore('disk'), 'unknown');
});

test('recordings intents: non-throwing validator matrix', () => {
  const m = intentsModule;
  assert.deepEqual(m.validateIntent({ type: 'record-ai', capsuleId: 'cap-01', phase: 'idle' }), {
    ok: true,
    type: 'record-ai',
  });
  assert.deepEqual(m.validateIntent({ type: 'screenshot', capsuleId: 'cap-01', target: 'ram' }), {
    ok: true,
    type: 'screenshot',
  });
  assert.deepEqual(
    m.validateIntent({ type: 'recording-select', capsuleId: 'cap-01', recordingId: 'rec-01' }),
    { ok: true, type: 'recording-select' },
  );
  assert.deepEqual(
    m.validateIntent({
      type: 'recording-export',
      capsuleId: 'cap-01',
      recordingId: 'rec-01',
      phase: 'sealed',
      destination: 'host-picker',
    }),
    { ok: true, type: 'recording-export' },
  );
  assert.equal(m.validateIntent(null).error.code, 'ERR_INVALID_INTENT_PAYLOAD');
  assert.equal(
    m.validateIntent({ type: 'record-disk', capsuleId: 'cap-01' }).error.code,
    'ERR_UNKNOWN_INTENT_TYPE',
  );
  assert.equal(
    m.validateIntent({ type: 'record-ai', capsuleId: 'cap-01', phase: 'bogus' }).error.code,
    'ERR_INVALID_INTENT_PAYLOAD',
  );
  assert.equal(
    m.validateIntent({ type: 'screenshot', capsuleId: 'cap-01', target: 'disk' }).error.code,
    'ERR_INVALID_INTENT_PAYLOAD',
  );
  assert.equal(
    m.validateIntent({ type: 'recording-select', capsuleId: 'cap-01', recordingId: '' }).error.code,
    'ERR_INVENTED_RECORDING_ID',
  );
  assert.equal(
    m.validateIntent({
      type: 'recording-export',
      capsuleId: 'cap-01',
      recordingId: 'rec-01',
      phase: 'sealed',
      destination: null,
    }).error.code,
    'ERR_EXPORT_WITHOUT_DESTINATION',
  );
  assert.equal(
    m.validateIntent({
      type: 'recording-export',
      capsuleId: 'cap-01',
      recordingId: 'rec-01',
      phase: 'idle',
      destination: 'host-picker',
    }).error.code,
    'ERR_EXPORT_UNSEALED_RECORDING',
  );
  for (const type of m.RECORDING_INTENT_TYPES) {
    const fixture = m.recordingsIntentFixture(type);
    assert.deepEqual(m.validateIntent(fixture), { ok: true, type });
  }
  assert.equal(m.recordingsIntentFixture('record-ai', { phase: 'sealed' }).phase, 'sealed');
  assert.throws(() => m.recordingsIntentFixture('bogus'), { code: 'ERR_UNKNOWN_INTENT_TYPE' });
});

test('recordings registry rows: shape, uniqueness and anchor builder', () => {
  const m = registryModule;
  assert.deepEqual(m.RECORDINGS_FIXTURE_IDS, { capsuleId: 'cap-01', recordingId: 'rec-01' });
  assert.equal(m.RECORDINGS_REGISTRY_ROWS.length, 8);
  const ids = m.RECORDINGS_REGISTRY_ROWS.map((row) => row.agentLaneId);
  assert.deepEqual(ids, [...m.RECORDINGS_AGENT_LANE_IDS]);
  assert.equal(new Set(ids).size, ids.length);
  const allowedRoles = new Set(['button', 'status', 'row']);
  for (const row of m.RECORDINGS_REGISTRY_ROWS) {
    assert.ok(Object.isFrozen(row), `${row.agentLaneId}: row is frozen`);
    assert.ok(allowedRoles.has(row.role), `${row.agentLaneId}: role ${row.role}`);
    assert.equal(row.lane, 'R');
    assert.equal(row.anchorStatus, 'new');
    assert.ok(
      row.anchorTemplate.startsWith('recording/'),
      `${row.agentLaneId}: template ${row.anchorTemplate}`,
    );
    assert.ok(
      COMPONENTS.some((component) => component.name === row.component),
      `${row.agentLaneId}: component ${row.component} exists`,
    );
  }
  assert.equal(m.recordingsAnchorFor('rec.toggle'), 'recording/cap-01/toggle');
  assert.equal(m.recordingsAnchorFor('rec.phase'), 'recording/cap-01/phase');
  assert.equal(m.recordingsAnchorFor('rec.store-chip'), 'recording/cap-01/store-chip');
  assert.equal(m.recordingsAnchorFor('rec.screenshot'), 'recording/cap-01/screenshot');
  assert.equal(m.recordingsAnchorFor('rec.manifest.row'), 'recording/rec-01/row');
  assert.equal(m.recordingsAnchorFor('rec.manifest.select'), 'recording/rec-01/select');
  assert.equal(m.recordingsAnchorFor('rec.export'), 'recording/rec-01/export');
  assert.equal(m.recordingsAnchorFor('rec.export.gate'), 'recording/rec-01/export-gate');
  assert.equal(m.recordingsAnchorFor('rec.toggle', { id: 'cap-09' }), 'recording/cap-09/toggle');
  assert.equal(m.recordingsAnchorFor('rec.export', { rid: 'rec-09' }), 'recording/rec-09/export');
  assert.throws(() => m.recordingsAnchorFor('rec.bogus'), /Unknown recordings agent_lane id/);
});

test('recordings registry rows match component anchor helpers', () => {
  const m = registryModule;
  const bar = loaded.RecordingControlBar.helpers;
  const panel = loaded.RecordingsPanel.helpers;
  const pairs = [
    ['rec.toggle', bar.recordToggleAnchor('cap-01')],
    ['rec.phase', bar.phaseAnchor('cap-01')],
    ['rec.store-chip', bar.storeChipAnchor('cap-01')],
    ['rec.screenshot', bar.screenshotAnchor('cap-01')],
    ['rec.manifest.row', panel.manifestRowAnchor('rec-01')],
    ['rec.manifest.select', panel.manifestSelectAnchor('rec-01')],
    ['rec.export', panel.exportAnchor('rec-01')],
    ['rec.export.gate', panel.exportGateAnchor('rec-01')],
  ];
  for (const [agentLaneId, helperAnchor] of pairs) {
    assert.equal(m.recordingsAnchorFor(agentLaneId), helperAnchor, agentLaneId);
    const row = m.RECORDINGS_REGISTRY_ROWS.find((entry) => entry.agentLaneId === agentLaneId);
    assert.equal(row.anchorExample, helperAnchor, agentLaneId);
  }
});

test('recordings templates: every control has id, role, name and anchor', () => {
  for (const component of COMPONENTS) {
    const template = templateContent(component.name);
    const buttons = template.match(/<button[\s\S]*?>/g) || [];
    assert.equal(buttons.length, component.buttons, `${component.name}: button count`);
    for (const button of buttons) {
      assert.ok(button.includes(':id='), `${component.name}: button carries :id`);
      assert.ok(button.includes('role="button"'), `${component.name}: button carries role`);
      assert.ok(button.includes(':aria-label='), `${component.name}: button carries :aria-label`);
      assert.ok(
        button.includes(':data-semantic-anchor='),
        `${component.name}: button carries :data-semantic-anchor`,
      );
      assert.ok(button.includes(':disabled='), `${component.name}: button carries :disabled`);
      assert.ok(button.includes(':title='), `${component.name}: button carries :title`);
    }
    const statuses = template.match(/role="status"[\s\S]*?>/g) || [];
    assert.ok(statuses.length > 0, `${component.name}: exposes status readouts`);
  }
  const panel = templateContent('RecordingsPanel');
  assert.ok(panel.includes('aria-label="RAM recordings manifest"'), 'manifest table is named');
  assert.ok(panel.includes('emptyText'), 'empty state renders the generic copy');
  assert.ok(
    setupContent('RecordingsPanel').includes('RECORDINGS_EMPTY_TEXT'),
    'setup bridges the empty copy into template scope',
  );
  assert.ok(panel.includes('<th scope="col">Export gate</th>'), 'gate column exists');
  assert.ok(panel.includes('role="row"'), 'manifest rows carry the row role');
  const bar = templateContent('RecordingControlBar');
  assert.ok(bar.includes('role="group"'), 'control bar is a named group');
  for (const name of ['RecordingControlBar', 'RecordingsPanel']) {
    const setup = setupContent(name);
    assert.ok(!setup.includes('setTimeout'), `${name}: no timers in kit controls`);
    assert.ok(!setup.includes('setInterval'), `${name}: no intervals in kit controls`);
  }
});

test('recordings templates resolve helpers through setup bindings', () => {
  // Plain-<script> exports are module scope, not template scope: the template
  // must never call them directly; <script setup> bridges every display value.
  const moduleHelpers = [
    'manifestRowDomId',
    'manifestSelectDomId',
    'exportDomId',
    'exportGateDomId',
    'manifestRowAnchor',
    'manifestSelectAnchor',
    'exportAnchor',
    'exportGateAnchor',
    'selectAccessibleName',
    'exportAccessibleName',
    'phaseLabel',
    'phaseTone',
    'storeLabel',
    'formatElapsed',
    'formatCount',
    'formatTtl',
    'rowErrorText',
    'exportGateFor',
    'RECORDINGS_EMPTY_TEXT',
  ];
  const panel = templateContent('RecordingsPanel');
  const setup = setupContent('RecordingsPanel');
  for (const helper of moduleHelpers) {
    if (helper === 'RECORDINGS_EMPTY_TEXT') {
      assert.equal(panel.includes(helper), false, `template must not reference ${helper}`);
      assert.ok(setup.includes(helper), `setup bridges ${helper}`);
    } else {
      assert.equal(panel.includes(`${helper}(`), false, `template must not call ${helper}`);
      assert.ok(setup.includes(`${helper}(`), `setup bridges ${helper}`);
    }
  }
  const bar = templateContent('RecordingControlBar');
  const barSetup = setupContent('RecordingControlBar');
  for (const helper of ['normalizeRecordPhase', 'recordPhaseBusy', 'formatElapsed', 'storeLabel']) {
    assert.equal(bar.includes(`${helper}(`), false, `control template must not call ${helper}`);
    assert.ok(barSetup.includes(`${helper}(`), `control setup bridges ${helper}`);
  }
});

test('recordings index re-exports the lane surface', () => {
  const entry = laneJsSources.find((file) => file.rel.endsWith('index.js'));
  assert.ok(entry.source.includes("from './RecordingControlBar.vue'"), 'exports the control bar');
  assert.ok(entry.source.includes("from './RecordingsPanel.vue'"), 'exports the panel');
  assert.ok(entry.source.includes("from './recordingsIntents.js'"), 'exports the intents');
  assert.ok(entry.source.includes("from './recordingsRegistryRows.js'"), 'exports the rows');
});
