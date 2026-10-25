/**
 * @file Operator input-mode suite (conductor override): READ/WRITE chip,
 * input-mode intents and the operator-guidance host event. Replaces the
 * pre-override lease suite: no take/cede verbs, no AI-activity or pause-AI
 * controls. The mode switch never takes control away from the AI; WRITE-mode
 * operator input is journalled guidance. Plain JS, node:test, no Electron.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KIT_ROOT = path.resolve(__dirname, '..');
const MULTISLOT_DIR = path.join(KIT_ROOT, 'src', 'multislot');
const DEMO_PATH = path.join(KIT_ROOT, 'demo', 'multislot-ai.html');

/** Operator input modes; default is read. @type {readonly string[]} */
const INPUT_MODES = Object.freeze(['read', 'write']);

/** Input kinds journalled with operator guidance. @type {readonly string[]} */
const GUIDANCE_INPUT_KINDS = Object.freeze(['pointer', 'keyboard', 'wheel']);

/**
 * @param {string} p
 * @returns {boolean}
 */
function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} p
 * @returns {string}
 */
function read(p) {
  return fs.readFileSync(p, 'utf8');
}

/**
 * Imports one SFC's pure helper module (integration tests only).
 * @param {string} name
 * @returns {Promise<Record<string, any>>}
 */
async function importSfcModule(name) {
  const compilerSfc = createRequire(import.meta.url)('@vue/compiler-sfc');
  const source = read(path.join(MULTISLOT_DIR, name));
  const { descriptor, errors } = compilerSfc.parse(source, { filename: name });
  assert.equal(errors.length, 0, name);
  assert.ok(descriptor.script, `${name} ships a pure <script> module`);
  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(descriptor.script.content)}`;
  return import(dataUrl);
}

/**
 * @param {string} filePath
 * @returns {Promise<Record<string, any>>}
 */
function importKitModule(filePath) {
  return import(pathToFileURL(filePath).href);
}

const CHIP = 'AiInputModeChip.vue';
const INTENTS = 'multislotIntents.js';
const present = (...names) =>
  exists(MULTISLOT_DIR) && names.every((n) => exists(path.join(MULTISLOT_DIR, n)));
const skipAll = present(CHIP, INTENTS, 'AiMultiSlot.vue', 'AiSurfacePane.vue')
  ? undefined
  : 'input-mode lanes not merged yet (merge-gate section)';

// ---------------------------------------------------------------------------
// Contract section: always runs.
// ---------------------------------------------------------------------------

test('contract: input-mode vocabulary is read/write with pointer/keyboard/wheel guidance', () => {
  assert.deepEqual([...INPUT_MODES], ['read', 'write']);
  assert.equal(INPUT_MODES[0], 'read', 'default mode is READ');
  assert.deepEqual([...GUIDANCE_INPUT_KINDS], ['pointer', 'keyboard', 'wheel']);
});

test('contract: demo exercises both modes plus the guidance event', () => {
  assert.ok(exists(DEMO_PATH), 'demo/multislot-ai.html must exist');
  const html = read(DEMO_PATH);
  assert.ok(html.includes('input-mode-read'), 'demo offers READ');
  assert.ok(html.includes('input-mode-write'), 'demo offers WRITE');
  assert.ok(html.includes('operator-guidance'), 'demo journals guidance');
  assert.ok(/input\s*mode/i.test(html), 'visible mode chip in demo');
  for (const kind of GUIDANCE_INPUT_KINDS) {
    assert.ok(html.includes(kind), `demo journals input kind ${kind}`);
  }
  assert.equal(/lease-take|lease-cede|AiLeaseChip/.test(html), false, 'demo is lease-free');
});

// ---------------------------------------------------------------------------
// Merge-gate section: needs lanes 1-3 merged.
// ---------------------------------------------------------------------------

test('chip: visible READ/WRITE toggle, default READ, one click', { skip: skipAll }, async () => {
  const source = read(path.join(MULTISLOT_DIR, CHIP));
  assert.ok(source.includes('<button'), 'chip is a one-click button');
  assert.ok(source.includes("'read'") || source.includes('"read"'), 'READ mode literal');
  assert.ok(source.includes("'write'") || source.includes('"write"'), 'WRITE mode literal');
  assert.ok(/default\s*:\s*['"]read['"]/.test(source), 'mode prop defaults to read');
  assert.ok(source.includes('submit-intent'), 'mode switch travels via submit-intent');
  assert.ok(source.includes('input-mode-read') && source.includes('input-mode-write'), 'chip emits both mode intents');
  assert.ok(source.includes('aria-label') || source.includes('accessibleName'), 'chip has an accessible name');
  assert.ok(source.includes('role='), 'chip carries a role');
  assert.ok(
    source.includes('data-semantic-anchor') || source.includes('multislot.input-mode'),
    'chip carries the input-mode anchor',
  );
  const hasGuard =
    source.includes('preserveMultislotControlFocusGuard') ||
    (source.includes('pointerdown') && source.includes('mousedown') && source.includes('preventDefault'));
  assert.ok(hasGuard, 'chip keeps the focus guard (click + keyboard intact)');
  assert.equal(source.includes('switching'), false, 'no lease-style switching transient on the chip');
  assert.equal(/lease/i.test(source), false, 'chip is fully lease-free');
  const chip = await importSfcModule(CHIP);
  assert.deepEqual([...chip.MULTISLOT_INPUT_MODES], ['read', 'write']);
  assert.deepEqual([...chip.AI_INPUT_MODE_CHIP_EMITS], ['submit-intent']);
  assert.equal(chip.MULTISLOT_INPUT_MODE_AGENT_LANE, 'multislot.input-mode');
  assert.equal(chip.normalizeInputMode('write'), 'write');
  assert.equal(chip.normalizeInputMode('zzz'), 'read', 'unknown mode fails closed to READ');
  assert.equal(chip.targetInputMode('read'), 'write');
  assert.equal(chip.targetInputMode('write'), 'read');
  assert.equal(chip.inputModeIntentType('read'), 'input-mode-write', 'intent names the target');
  assert.equal(chip.inputModeIntentType('write'), 'input-mode-read');
  assert.equal(chip.inputModeChipLabel('read'), 'READ');
  assert.equal(chip.inputModeChipLabel('write'), 'WRITE');
  assert.deepEqual(chip.buildInputModeIntent({ capsuleId: 'cap-01', mode: 'read' }), {
    type: 'input-mode-write', capsuleId: 'cap-01', mode: 'write',
  });
});

test('chip module compiles as plain JS with intent helpers', { skip: skipAll }, async () => {
  const compilerSfc = createRequire(import.meta.url)('@vue/compiler-sfc');
  const source = read(path.join(MULTISLOT_DIR, CHIP));
  const { descriptor, errors } = compilerSfc.parse(source, { filename: CHIP });
  assert.equal(errors.length, 0);
  assert.ok(descriptor.scriptSetup, 'chip needs <script setup>');
  assert.equal(descriptor.scriptSetup.lang, undefined, 'chip is plain JS');
  assert.ok(descriptor.script, 'chip ships a pure <script> module');
  const script = compilerSfc.compileScript(descriptor, { id: 'multislot-ai-input-mode' });
  const template = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: CHIP,
    id: 'multislot-ai-input-mode',
    compilerOptions: { bindingMetadata: script.bindings },
  });
  assert.equal(template.errors.length, 0);
});

test('intents: input-mode and guidance builders validate their payloads', { skip: skipAll }, async () => {
  const source = read(path.join(MULTISLOT_DIR, INTENTS));
  for (const verb of ['input-mode-read', 'input-mode-write', 'operator-guidance']) {
    assert.ok(source.includes(verb), `intents cover ${verb}`);
  }
  assert.ok(source.includes('inputKind'), 'guidance payload carries inputKind');
  assert.ok(source.includes('capsuleId') || source.includes('capsule_id'), 'guidance names its capsule');
  for (const kind of GUIDANCE_INPUT_KINDS) {
    assert.ok(source.includes(kind), `guidance admits input kind ${kind}`);
  }
  const mod = await importKitModule(path.join(MULTISLOT_DIR, INTENTS));
  assert.deepEqual([...mod.MULTISLOT_INPUT_KINDS], [...GUIDANCE_INPUT_KINDS]);
  assert.deepEqual(mod.buildInputModeIntent({ capsuleId: 'cap-01', mode: 'read' }), {
    type: 'input-mode-read', capsuleId: 'cap-01', mode: 'read',
  });
  assert.deepEqual(mod.buildInputModeIntent({ capsuleId: 'cap-01', mode: 'write' }), {
    type: 'input-mode-write', capsuleId: 'cap-01', mode: 'write',
  });
  assert.throws(
    () => mod.buildInputModeIntent({ capsuleId: 'cap-01', mode: 'owner' }),
    /ERR_UNKNOWN_INTENT_TYPE/,
  );
  const guided = mod.buildOperatorGuidanceEvent({ capsuleId: 'cap-01', inputKind: 'wheel' });
  assert.equal(guided.type, 'operator-guidance');
  assert.equal(guided.inputKind, 'wheel');
  assert.ok(Number.isSafeInteger(guided.ts) && guided.ts > 0, 'guidance stamps ts by default');
  assert.deepEqual(mod.buildOperatorGuidanceEvent({ capsuleId: 'cap-01', ts: 7, inputKind: 'pointer' }).ts, 7);
  assert.throws(
    () => mod.buildOperatorGuidanceEvent({ capsuleId: 'cap-01', ts: 7, inputKind: 'gesture' }),
    /ERR_INVALID_INTENT_PAYLOAD/,
  );
  assert.equal(
    mod.validateIntent({ type: 'operator-guidance', capsuleId: 'cap-01', ts: 7, inputKind: 'keyboard' }).ok,
    true,
  );
  const vocab = [...mod.MULTISLOT_INTENT_TYPES];
  for (const verb of ['input-mode-read', 'input-mode-write', 'operator-guidance']) {
    assert.ok(vocab.includes(verb), `exported vocabulary lists ${verb}`);
  }
  assert.equal(vocab.some((v) => /lease/.test(v)), false, 'exported vocabulary is lease-free');
});

test('READ shields surface input; WRITE forwards and journals guidance', { skip: skipAll }, () => {
  const shell = read(path.join(MULTISLOT_DIR, 'AiMultiSlot.vue'));
  const surface = read(path.join(MULTISLOT_DIR, 'AiSurfacePane.vue'));
  assert.ok(/inputMode|input-mode/i.test(`${shell}\n${surface}`), 'shell/surface consume the input mode');
  // The shell is the gate: READ-mode surface input stays silent, WRITE-mode
  // input becomes a submit-intent the host journals. The pane veils READ.
  assert.ok(
    shell.includes("inputMode !== 'write'") || shell.includes('inputMode === "write"') || /inputMode.*write/.test(shell),
    'shell gates guidance on WRITE mode',
  );
  assert.ok(shell.includes('operator-guidance'), 'WRITE-mode input emits operator-guidance');
  assert.ok(surface.includes('data-input-mode'), 'pane exposes the READ veil marker');
  assert.ok(surface.includes('isTrusted'), 'pane forwards trusted operator input only');
  assert.equal(/lease-take|lease-cede|AiLeaseChip/.test(`${shell}\n${surface}`), false, 'shell/surface are lease-free');
});

test('guidance event shape: capsule, timestamp, input kind', { skip: skipAll }, async () => {
  const pane = await importSfcModule('AiSurfacePane.vue');
  assert.deepEqual([...pane.SURFACE_INPUT_MODES], ['read', 'write']);
  assert.deepEqual([...pane.SURFACE_INPUT_KINDS], [...GUIDANCE_INPUT_KINDS]);
  assert.equal(pane.normalizeInputMode('zzz'), 'read');
  assert.equal(pane.normalizeInputKind('wheel'), 'wheel');
  assert.equal(pane.normalizeInputKind('gesture'), null);
  assert.deepEqual(pane.buildOperatorGuidanceIntent('cap-01', 'pointer', 9), {
    type: 'operator-guidance', capsuleId: 'cap-01', ts: 9, inputKind: 'pointer',
  });
  assert.throws(() => pane.buildOperatorGuidanceIntent('cap-01', 'gesture', 9), /known input kind/);
  assert.throws(() => pane.buildOperatorGuidanceIntent('cap-01', 'pointer', -1), /timestamp/);
  const payload = pane.buildSurfaceInputPayload('cap-01', 'keyboard');
  assert.equal(payload.capsuleId, 'cap-01');
  assert.equal(payload.inputKind, 'keyboard');
});

test('switching mode never claims AI control: no take/cede/activity/pause', { skip: skipAll }, () => {
  const scope = ['AiMultiSlot.vue', 'AiSurfacePane.vue', 'AiSlotControlBar.vue', CHIP, 'AiIdentityPlate.vue', 'AiRecordCluster.vue', INTENTS]
    .map((n) => read(path.join(MULTISLOT_DIR, n)))
    .join('\n');
  for (const verb of ['lease-take', 'lease-cede', 'AiLeaseChip']) {
    assert.equal(scope.includes(verb), false, `override removes ${verb}`);
  }
  assert.equal(/take\s+control/i.test(scope), false, 'no take-control language');
  // `cede` may appear only inside an explicit refusal (negative contrast).
  for (const line of scope.split('\n')) {
    if (/cede/i.test(line)) {
      assert.ok(/no\b|never|without|refused|forbidden|not\b/i.test(line), `cede is refused, not shipped: ${line.trim()}`);
    }
  }
  assert.equal(/pause\s*ai\b/i.test(scope), false, 'no pause-AI control');
  assert.equal(/ai\s*activity/i.test(scope), false, 'no AI-activity indicator');
  assert.equal(/ERR_LEASE_[A-Z_]+/.test(scope), false, 'no lease error codes');
});
