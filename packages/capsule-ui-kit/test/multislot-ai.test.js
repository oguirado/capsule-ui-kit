/**
 * @file AI multislot kit behaviour suite (lanes 1-4 contract, conductor overrides applied).
 * Covers the shell/panes/splitter keep-alive rules, record/screenshot gating,
 * copy-ID schema, anchor registry coverage, keyboard map, kit-write tripwire and
 * publication hygiene. Input-mode chip/intents/guidance live in
 * `multislot-ai-input-mode.test.js`. Lease verbs are FORBIDDEN everywhere: the
 * conductor override replaces the lease chip with the READ/WRITE input-mode chip.
 * Tests that need `src/multislot/` skip until lanes 1-4 merge; contract and demo
 * tests always run. Plain JS, node:test, no Electron.
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
const BOOK_PATH = path.join(KIT_ROOT, 'books', 'multislot-ai.md');
const TOKENS_PATH = path.join(KIT_ROOT, 'src', 'design', 'tokens.json');

/** Lane 1 shell/pane/splitter SFCs (sole writer: lane 1). */
const LANE1_SFC = Object.freeze([
  'AiMultiSlot.vue',
  'AiSurfacePane.vue',
  'AiTerminalPane.vue',
  'AiSlotSplitter.vue',
]);
/** Lane 2 control bar / input-mode chip / identity plate (sole writer: lane 2). */
const LANE2_SFC = Object.freeze([
  'AiSlotControlBar.vue',
  'AiInputModeChip.vue',
  'AiIdentityPlate.vue',
]);
/** Lane 3 record cluster (sole writer: lane 3). */
const LANE3_SFC = Object.freeze(['AiRecordCluster.vue']);
/** Every multislot SFC. */
const ALL_SFC = Object.freeze([...LANE1_SFC, ...LANE2_SFC, ...LANE3_SFC]);
/** Plain-JS multislot modules: lane 3 intents, lane 4 registry rows + index. */
const EXPECTED_JS = Object.freeze([
  'multislotIntents.js',
  'multislotRegistryRows.js',
  'index.js',
]);

/**
 * Normative submit-intent vocabulary (conductor override: input-mode verbs
 * replace lease-take/lease-cede; operator-guidance is the WRITE-mode host event).
 * @type {readonly string[]}
 */
const REQUIRED_INTENTS = Object.freeze([
  'record-ai',
  'record-disk',
  'screenshot',
  'copy-id',
  'hide-surface',
  'show-surface',
  'hide-terminal',
  'show-terminal',
  'input-mode-read',
  'input-mode-write',
  'operator-guidance',
  'fold',
  'unfold',
  'float',
  'dock-back',
  'close',
]);

/** Forbidden intent/control verbs (pre-override lease model). */
const FORBIDDEN_VERBS = Object.freeze(['lease-take', 'lease-cede', 'AiLeaseChip']);

/** Record axis phases (spec section 5). @type {readonly string[]} */
const RECORD_PHASES = Object.freeze([
  'idle',
  'starting',
  'recording',
  'stopping',
  'sealed',
  'error',
]);

/** Surface presentation states (never fake live). @type {readonly string[]} */
const SURFACE_STATES = Object.freeze(['live', 'connecting', 'lost', 'empty']);

/** Operator input modes (conductor override). @type {readonly string[]} */
const INPUT_MODES = Object.freeze(['read', 'write']);

/**
 * Core agent_lane ids every multislot registry must cover; the input-mode chip
 * id is matched by prefix so lane 2/4 keep naming freedom.
 * @type {readonly string[]}
 */
const CORE_AGENT_IDS = Object.freeze([
  'multislot.record.ai',
  'multislot.record.disk',
  'multislot.screenshot',
  'multislot.copy-id',
  'multislot.hide-surface',
  'multislot.hide-terminal',
  'multislot.fold',
  'multislot.float',
  'multislot.dock-back',
  'multislot.close',
]);
const INPUT_MODE_ID_PREFIX = 'multislot.input-mode';

/**
 * Terminal-session passthrough emits reused from the kit terminal views
 * (spec section 1: the attached terminal reuses the overlay terminal facade).
 * @type {readonly string[]}
 */
const TERMINAL_PASSTHROUGH_EMITS = Object.freeze([
  'select-session',
  'close-session',
  'launch-request',
  'request-attach',
  'request-stop',
  'request-replay',
  'select-target',
  'confirm-staged-paste',
]);

/** Allowed defineEmits per SFC (host effects travel via submit-intent). */
const ALLOWED_EMITS = Object.freeze({
  'AiMultiSlot.vue': Object.freeze(['submit-intent', 'resize', ...TERMINAL_PASSTHROUGH_EMITS]),
  'AiSurfacePane.vue': Object.freeze(['activate-surface', 'surface-input']),
  'AiTerminalPane.vue': Object.freeze(['submit-intent', ...TERMINAL_PASSTHROUGH_EMITS]),
  'AiSlotSplitter.vue': Object.freeze(['resize']),
  'AiSlotControlBar.vue': Object.freeze(['submit-intent']),
  'AiInputModeChip.vue': Object.freeze(['submit-intent']),
  'AiIdentityPlate.vue': Object.freeze(['submit-intent']),
  'AiRecordCluster.vue': Object.freeze(['submit-intent']),
});

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
 * Loads @vue/compiler-sfc lazily (integration tests only).
 * @returns {import('@vue/compiler-sfc')}
 */
function loadCompilerSfc() {
  return createRequire(import.meta.url)('@vue/compiler-sfc');
}

/**
 * Parses one multislot SFC.
 * @param {string} name
 * @returns {{ source: string, descriptor: import('@vue/compiler-sfc').SFCDescriptor }}
 */
function parseSfc(name) {
  const compilerSfc = loadCompilerSfc();
  const source = read(path.join(MULTISLOT_DIR, name));
  const { descriptor, errors } = compilerSfc.parse(source, { filename: name });
  assert.equal(errors.length, 0, `${name} parse errors: ${errors.map((e) => e.message).join('; ')}`);
  return { source, descriptor };
}

/**
 * Extracts the plain-<script> module block (kit SFC convention: no imports).
 * @param {import('@vue/compiler-sfc').SFCDescriptor} descriptor
 * @param {string} name
 * @returns {string} Module source.
 */
function moduleSourceOf(descriptor, name) {
  assert.ok(descriptor.script, `${name} ships a pure <script> module`);
  assert.equal(descriptor.script.lang, undefined, `${name} <script> must be plain JS (no lang)`);
  assert.ok(
    !/\bimport\s+[^;]*\bfrom\b|\bimport\s*\(/.test(descriptor.script.content),
    `${name} <script> module must have zero imports (pure helpers)`,
  );
  return descriptor.script.content;
}

/**
 * Dynamically imports a pure module-block source string.
 * @param {string} scriptContent
 * @returns {Promise<Record<string, any>>}
 */
function importModuleSource(scriptContent) {
  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(scriptContent)}`;
  return import(dataUrl);
}

/**
 * Imports one SFC's pure helper module.
 * @param {string} name
 * @returns {Promise<Record<string, any>>}
 */
async function importSfcModule(name) {
  const { descriptor } = parseSfc(name);
  return importModuleSource(moduleSourceOf(descriptor, name));
}

/**
 * Imports one plain-JS kit module by path (integration tests only).
 * @param {string} filePath
 * @returns {Promise<Record<string, any>>}
 */
function importKitModule(filePath) {
  return import(pathToFileURL(filePath).href);
}

/**
 * Scans a directory tree for files matching a predicate.
 * @param {string} dir
 * @param {(name: string) => boolean} match
 * @returns {string[]}
 */
function collectFiles(dir, match) {
  const out = [];
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, match));
    else if (match(entry.name)) out.push(full);
  }
  return out;
}

const multislotPresent =
  exists(MULTISLOT_DIR) &&
  [...ALL_SFC, ...EXPECTED_JS].every((n) => exists(path.join(MULTISLOT_DIR, n)));
const skipIntegration = multislotPresent
  ? undefined
  : 'src/multislot/ lanes 1-4 not merged yet (merge-gate section)';

// ---------------------------------------------------------------------------
// Contract section: always runs (no lane 1-4 files needed).
// ---------------------------------------------------------------------------

test('contract: submit-intent vocabulary is closed, unique and lease-free', () => {
  assert.equal(REQUIRED_INTENTS.length, 16);
  assert.equal(new Set(REQUIRED_INTENTS).size, 16);
  for (const verb of REQUIRED_INTENTS) {
    assert.match(verb, /^[a-z][a-z0-9-]*$/, `kebab-case verb ${verb}`);
  }
  assert.ok(REQUIRED_INTENTS.includes('input-mode-read'));
  assert.ok(REQUIRED_INTENTS.includes('input-mode-write'));
  assert.ok(REQUIRED_INTENTS.includes('operator-guidance'));
  for (const verb of FORBIDDEN_VERBS) {
    assert.equal(REQUIRED_INTENTS.includes(verb), false, `override forbids ${verb}`);
  }
  assert.deepEqual([...RECORD_PHASES], ['idle', 'starting', 'recording', 'stopping', 'sealed', 'error']);
  assert.deepEqual([...SURFACE_STATES], ['live', 'connecting', 'lost', 'empty']);
  assert.deepEqual([...INPUT_MODES], ['read', 'write']);
});

test('contract: our files carry no lease codes and no AI-state controls', () => {
  const own = collectFiles(__dirname, (n) => n.startsWith('multislot-ai')).map(read).join('\n');
  const demo = exists(DEMO_PATH) ? read(DEMO_PATH) : '';
  const hay = `${own}\n${demo}`;
  assert.equal(/ERR_LEASE_[A-Z_]+/.test(hay), false, 'no lease error codes in lane 5 files');
  assert.equal(/pause\s*ai\b/i.test(hay), false, 'no pause-AI control in lane 5 files');
  assert.equal(/ai\s*activity/i.test(hay), false, 'no AI-activity indicator in lane 5 files');
});

test('contract: bench demo page ships the stub host and review checklist', () => {
  assert.ok(exists(DEMO_PATH), 'demo/multislot-ai.html must exist');
  const html = read(DEMO_PATH);
  assert.ok(html.includes('<!doctype html>') || html.includes('<!DOCTYPE html>'), 'standalone document');
  // Stub host: all section-7 capabilities in memory (input-mode service, not lease).
  for (const cap of ['SurfaceStream', 'RecordingSink', 'ScreenshotSink', 'InputMode', 'TerminalSession']) {
    assert.ok(html.includes(cap), `stub host capability ${cap}`);
  }
  assert.ok(/ram/i.test(html), 'RAM sinks documented');
  assert.ok(/fake\s*pty|stub\s*pty|pty\s*facade/i.test(html), 'fake PTY facade documented');
  assert.ok(/system\s*shell/i.test(html), 'shell-first launch menu in demo');
  // Both attach sides x light/dark.
  assert.ok(html.includes('attachSide') || html.includes('attach-side'), 'attach side switch');
  assert.ok(html.includes("'right'") || html.includes('"right"') || html.includes('>right<'), 'right side');
  assert.ok(html.includes("'bottom'") || html.includes('"bottom"') || html.includes('>bottom<'), 'bottom side');
  assert.ok(html.includes('data-theme-scheme'), 'light/dark scheme switch');
  assert.ok(html.includes('light') && html.includes('dark'), 'both schemes named');
  // Intent vocabulary + log + checklist.
  for (const verb of REQUIRED_INTENTS) {
    assert.ok(html.includes(verb), `demo exercises intent ${verb}`);
  }
  for (const verb of FORBIDDEN_VERBS) {
    assert.equal(html.includes(verb), false, `demo is lease-free (${verb})`);
  }
  assert.ok(/intent\s*log/i.test(html), 'intent log panel');
  assert.ok(/checklist/i.test(html), 'review checklist panel');
  assert.ok(/spawn/i.test(html) && /kill/i.test(html), 'spawn/kill counters in demo');
  // Kit law: the demo performs no backend calls itself (stub host only).
  assert.equal(/fetch\s*\(/.test(html), false, 'demo performs no fetch');
  assert.equal(/XMLHttpRequest/.test(html), false, 'demo performs no XHR');
  assert.equal(/navigator\.clipboard/.test(html), false, 'demo writes no clipboard');
  assert.equal(/\brequire\s*\(\s*['"]fs['"]/.test(html), false, 'demo touches no fs');
  // Real kit modules when served over http, with an honest fallback notice.
  assert.ok(
    html.includes('src/multislot/multislotIntents.js'),
    'demo imports the real intents module relatively',
  );
  assert.ok(
    /serve|http|fallback/i.test(html),
    'demo documents how to serve it / fallback mode',
  );
});

test('contract: lane 5 files pass publication hygiene', () => {
  const product = new RegExp(
    ['ho', 'ldings'].join('') + '|' + ['me', 'taviewer'].join('') + '|' + ['te', 'amwork'].join(''),
    'i',
  );
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  const homePath = new RegExp(`/(?:${['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|')})/[\\w.-]+`, 'i');
  const targets = [
    ...collectFiles(__dirname, (n) => n.startsWith('multislot-ai')),
    ...(exists(DEMO_PATH) ? [DEMO_PATH] : []),
  ];
  assert.ok(targets.length >= 2, 'lane 5 ships tests + demo');
  for (const file of targets) {
    const label = path.relative(KIT_ROOT, file);
    const text = read(file);
    assert.doesNotMatch(text, email, `${label}: e-mail-shaped string`);
    assert.doesNotMatch(text, homePath, `${label}: absolute home path`);
    assert.equal(product.test(text), false, `${label}: product name`);
  }
});

// ---------------------------------------------------------------------------
// Merge-gate section: needs lanes 1-4 merged into src/multislot/.
// ---------------------------------------------------------------------------

test('multislot file inventory is exactly the room-plan surface', { skip: skipIntegration }, () => {
  for (const name of [...ALL_SFC, ...EXPECTED_JS]) {
    assert.ok(exists(path.join(MULTISLOT_DIR, name)), `missing src/multislot/${name}`);
  }
  assert.equal(
    exists(path.join(MULTISLOT_DIR, 'AiLeaseChip.vue')),
    false,
    'override deletes AiLeaseChip.vue (AiInputModeChip replaces it)',
  );
  const actual = fs
    .readdirSync(MULTISLOT_DIR)
    .filter((n) => n.endsWith('.vue') || n.endsWith('.js'))
    .sort();
  assert.deepEqual(actual, [...ALL_SFC, ...EXPECTED_JS].sort(), 'no extra files in src/multislot/');
});

for (const name of ALL_SFC) {
  test(`SFC gate: ${name} parses, compiles, stays plain JS with documented emits`, { skip: skipIntegration }, () => {
    const compilerSfc = loadCompilerSfc();
    const { source, descriptor } = parseSfc(name);
    assert.ok(!source.includes('lang="ts"') && !source.includes("lang='ts'"), `${name}: no authored TS`);
    assert.ok(descriptor.template, `${name} needs <template>`);
    assert.ok(descriptor.scriptSetup, `${name} needs <script setup>`);
    assert.equal(descriptor.scriptSetup.lang, undefined, `${name} <script setup> must be plain JS`);
    const script = compilerSfc.compileScript(descriptor, { id: `multislot-ai-${name}` });
    const template = compilerSfc.compileTemplate({
      source: descriptor.template.content,
      filename: name,
      id: `multislot-ai-${name}`,
      compilerOptions: { bindingMetadata: script.bindings },
    });
    assert.equal(template.errors.length, 0, `${name} template errors`);
    const consumerMark = new RegExp(
      ['h3-app-root', 'h3-app-route', ['ho', 'ldings'].join('') + '.owner-projection'].join('|'),
      'i',
    );
    assert.ok(!consumerMark.test(source), `${name}: zero consumer imports`);
    assert.ok(
      !/from\s+['"]openvue['"]|from\s+['"]@openvue\//.test(source),
      `${name}: OpenVue only through kit wrappers`,
    );
    const emits = [...source.matchAll(/defineEmits\s*\(\s*\[([\s\S]*?)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((s) => s[1]));
    const allowed = ALLOWED_EMITS[name];
    for (const e of emits) {
      assert.ok(allowed.includes(e), `${name}: unexpected emit ${e} (host effects travel via submit-intent)`);
    }
    if (name !== 'AiSlotSplitter.vue' && name !== 'AiSurfacePane.vue') {
      assert.ok(emits.includes('submit-intent'), `${name} emits submit-intent`);
    }
    for (const verb of FORBIDDEN_VERBS) {
      assert.equal(source.includes(verb), false, `${name} is lease-free (${verb})`);
    }
  });
}

test('SFC helper modules import cleanly with zero imports', { skip: skipIntegration }, async () => {
  for (const name of ALL_SFC) {
    const helpers = await importSfcModule(name);
    assert.ok(
      Object.values(helpers).some((v) => typeof v === 'function'),
      `${name} module exports pure helpers`,
    );
  }
});

test('tokens only and SYSTEM font across multislot SFCs', { skip: skipIntegration }, () => {
  const hex = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;
  for (const name of ALL_SFC) {
    const source = read(path.join(MULTISLOT_DIR, name));
    assert.equal(hex.test(source), false, `${name}: no raw hex (tokens only)`);
    for (const m of source.matchAll(/var\(\s*(--[^,)]+)/g)) {
      assert.ok(m[1].startsWith('--cuk-'), `${name}: vendor var ${m[1]} (tokens only)`);
    }
    assert.equal(/@import\s+url\(/i.test(source), false, `${name}: no remote font/style import`);
    for (const m of source.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const decl = m[1].trim();
      assert.ok(
        decl.includes('var(--cuk-') || decl === 'inherit',
        `${name}: SYSTEM font via tokens (or inherit), got ${decl}`,
      );
    }
  }
});

test('focus guard on every multislot control surface', { skip: skipIntegration }, async () => {
  for (const name of ['AiMultiSlot.vue', 'AiSlotControlBar.vue', 'AiInputModeChip.vue', 'AiIdentityPlate.vue', 'AiRecordCluster.vue']) {
    const source = read(path.join(MULTISLOT_DIR, name));
    const hasHelper = /preserve\w*FocusGuard/.test(source);
    const hasInline = source.includes('pointerdown') && source.includes('mousedown')
      && (source.includes('preventDefault') || source.includes('.prevent'));
    assert.ok(hasHelper || hasInline, `${name}: pointerdown+mousedown preventDefault, click+keyboard intact`);
  }
  // Behavioural: the guard preserves focus without swallowing activation.
  const bar = await importSfcModule('AiSlotControlBar.vue');
  let prevented = 0;
  const out = bar.preserveMultislotControlFocusGuard({ type: 'pointerdown', preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1);
  assert.deepEqual(out, { preservedFocus: true });
});

test('INV-1: fold/hide/float keep live hosts mounted with zero spawn/kill (ERR_MULTISLOT_*)', { skip: skipIntegration }, () => {
  for (const name of ['AiMultiSlot.vue', 'AiSurfacePane.vue', 'AiTerminalPane.vue']) {
    const source = read(path.join(MULTISLOT_DIR, name));
    assert.ok(source.includes("'cuk-csp-hidden':"), `${name}: hide via a mounted hidden class, never unmount (ERR_MULTISLOT_UNMOUNT_ON_HIDE)`);
  }
  const shell = read(path.join(MULTISLOT_DIR, 'AiMultiSlot.vue'));
  assert.ok((shell.match(/cuk-csp-hidden/g) || []).length >= 2, 'shell hidden classes cover fold + per-half hide');
  assert.ok(shell.includes('float') && shell.includes('dock-back'), 'shell offers float + dock-back');
  const all = [...ALL_SFC, ...EXPECTED_JS].map((n) => read(path.join(MULTISLOT_DIR, n))).join('\n');
  for (const verb of ['ClosePTY', 'killTree', 'process.kill', 'spawn(', "from 'node:", 'from "node:']) {
    assert.equal(all.includes(verb), false, `kit never spawns/kills (ERR_MULTISLOT_SPAWN_OR_KILL: ${verb})`);
  }
});

test('shell: attach sides, presentation, 3-pass refocus, geometry truth', { skip: skipIntegration }, async () => {
  const shell = await importSfcModule('AiMultiSlot.vue');
  assert.deepEqual([...shell.ATTACH_SIDES], ['right', 'bottom']);
  assert.equal(shell.normalizeAttachSide('right'), 'right');
  assert.equal(shell.normalizeAttachSide('bottom'), 'bottom');
  assert.equal(shell.splitterAxisForSide('right'), 'vertical');
  assert.equal(shell.splitterAxisForSide('bottom'), 'horizontal');
  assert.deepEqual([...shell.SLOT_PRESENTATIONS], ['expanded', 'folded']);
  assert.equal(shell.presentationOf(true), 'folded');
  assert.equal(shell.presentationOf(false), 'expanded');
  // 3-pass refocus schedule [0, 120, 400] with cancellation on reschedule.
  assert.deepEqual([...shell.REFOCUS_PASS_DELAYS], [0, 120, 400]);
  const delays = [];
  const cancelled = [];
  const scheduler = shell.createRefocusScheduler(
    (fn, d) => { delays.push(d); return delays.length; },
    (id) => { cancelled.push(id); },
  );
  let runs = 0;
  scheduler.schedule(() => { runs += 1; });
  assert.deepEqual(delays, [0, 120, 400]);
  scheduler.schedule(() => { runs += 1; });
  assert.equal(cancelled.length, 3, 'reschedule cancels the pending batch');
  void runs;
  // Hidden panes report no geometry; the kit never fabricates boxes.
  assert.equal(shell.reportsGeometry(true), true);
  assert.equal(shell.reportsGeometry(false), false);
  assert.equal(shell.reportsGeometry(1), false, 'only visible===true reports (ERR_FABRICATED_HIDDEN_BOX)');
  assert.deepEqual(shell.floatFrameStyle({}), {}, 'docked frame carries no style');
  assert.deepEqual(
    shell.floatFrameStyle({ floating: true, width: 100, height: 200 }),
    { position: 'fixed', width: '100px', height: '200px' },
  );
  // Slot intents are frozen and always typed.
  const intent = shell.buildSlotIntent('fold', 'cap-01');
  assert.deepEqual({ ...intent }, { type: 'fold', capsuleId: 'cap-01' });
  assert.throws(() => shell.buildSlotIntent('', 'cap-01'), /non-empty intent type/);
  const ids = shell.multislotDomIds('cap-01');
  assert.ok(ids.root.includes('cap-01') && ids.fold.includes('cap-01'), 'stable DOM ids');
  const anchors = shell.multislotAnchors('cap-01');
  assert.equal(anchors.fold, 'capsule/cap-01/ai-slot/fold');
  assert.equal(anchors.slot, 'capsule/cap-01/slot');
  assert.ok(['idle', 'busy', 'attention', 'error'].includes(shell.railCardState('live', 'ready')));
});

test('splitter: both axes, 1px/Shift-10px keys, clamp-via-props', { skip: skipIntegration }, async () => {
  const source = read(path.join(MULTISLOT_DIR, 'AiSlotSplitter.vue'));
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    assert.ok(source.includes(key), `splitter handles ${key}`);
  }
  assert.ok(source.includes('role="separator"') || source.includes("role='separator'"), 'separator role');
  assert.ok(source.includes('tabindex') || source.includes('tabIndex'), 'splitter is focusable');
  assert.ok(source.includes('keydown') || source.includes('keyDown'), 'keyboard resize path');
  assert.ok(source.includes('pointer') && source.includes('capture'), 'pointer drag with capture');
  assert.ok(/cancel|lostpointercapture|pointercancel/i.test(source), 'drag cancel shields');
  const splitter = await importSfcModule('AiSlotSplitter.vue');
  assert.equal(splitter.SPLITTER_STEP, 1);
  assert.equal(splitter.SPLITTER_LARGE_STEP, 10);
  assert.deepEqual([...splitter.SPLITTER_AXES], ['vertical', 'horizontal']);
  // Vertical axis: Left grows the terminal pane, Right shrinks it.
  assert.equal(splitter.splitterDeltaForKey('ArrowLeft', false, 'vertical'), 1);
  assert.equal(splitter.splitterDeltaForKey('ArrowRight', false, 'vertical'), -1);
  assert.equal(splitter.splitterDeltaForKey('ArrowLeft', true, 'vertical'), 10);
  assert.equal(splitter.splitterDeltaForKey('ArrowRight', true, 'vertical'), -10);
  // Horizontal axis: Up grows, Down shrinks; cross-axis keys are ignored.
  assert.equal(splitter.splitterDeltaForKey('ArrowUp', false, 'horizontal'), 1);
  assert.equal(splitter.splitterDeltaForKey('ArrowDown', true, 'horizontal'), -10);
  assert.equal(splitter.splitterDeltaForKey('ArrowUp', false, 'vertical'), null);
  assert.equal(splitter.splitterDeltaForKey('ArrowLeft', false, 'horizontal'), null);
  assert.equal(splitter.splitterDeltaForKey('Enter', false, 'vertical'), null);
  // Clamp via parent-owned bounds.
  assert.equal(splitter.clampPaneSize(50, { min: 100, max: 1000 }), 100);
  assert.equal(splitter.clampPaneSize(5000, { min: 100, max: 1000 }), 1000);
  assert.equal(splitter.clampPaneSize(500, { min: 100, max: 1000 }), 500);
  assert.equal(splitter.splitterSizeForKey(100, 'ArrowRight', false, 'vertical', { min: 100, max: 1000 }), 100);
  assert.equal(splitter.splitterAnchor('cap-01'), 'workspace/separator/cap-01');
  assert.ok(splitter.splitterHintText('vertical').length > 0);
});

test('terminal pane: session helpers keep exited tabs readable until closed', { skip: skipIntegration }, async () => {
  const pane = await importSfcModule('AiTerminalPane.vue');
  const sessions = pane.normalizeTerminalSessions([
    { sessionId: 'sess-01', activity: 'exited' },
    { sessionId: '', activity: 'busy' },
    null,
  ]);
  assert.ok(sessions.some((s) => s.sessionId === 'sess-01'), 'exited tabs stay visible');
  assert.equal(sessions.some((s) => s.sessionId === ''), false, 'blank ids dropped');
  assert.deepEqual(pane.buildSelectSessionPayload('cap-01', 'sess-01'), { capsuleId: 'cap-01', sessionId: 'sess-01' });
  assert.deepEqual(pane.buildCloseSessionPayload('cap-01', 'sess-01'), { capsuleId: 'cap-01', sessionId: 'sess-01' });
  const launch = pane.buildLaunchRequestPayload('cap-01', { entryId: 'shell' });
  assert.equal(launch.capsuleId, 'cap-01');
  assert.equal(launch.entryId, 'shell');
  const ids = pane.terminalPaneDomIds('cap-01');
  assert.ok(ids.host.includes('cap-01') || Object.values(ids).some((v) => v.includes('cap-01')));
});

test('INV-3: record/screenshot gating with RAM default and literal reasons', { skip: skipIntegration }, async () => {
  const clusterSource = read(path.join(MULTISLOT_DIR, 'AiRecordCluster.vue'));
  for (const phase of RECORD_PHASES) {
    assert.ok(clusterSource.includes(phase), `record cluster covers phase ${phase}`);
  }
  assert.ok(clusterSource.includes('RAM') && clusterSource.includes('DISK'), 'store chips RAM + DISK');
  assert.ok(/elapsed/i.test(clusterSource), 'elapsed indicator');
  assert.ok(clusterSource.includes('aria-busy'), 'busy phases set aria-busy');
  assert.ok(/reason/i.test(clusterSource), 'disabled disk controls carry a literal reason');
  const cluster = await importSfcModule('AiRecordCluster.vue');
  assert.deepEqual([...cluster.MULTISLOT_RECORD_PHASES], [...RECORD_PHASES]);
  assert.deepEqual([...cluster.MULTISLOT_SCREENSHOT_STATES], ['idle', 'capturing', 'done', 'error']);
  assert.equal(cluster.normalizeRecordPhase('recording'), 'recording');
  assert.equal(cluster.normalizeRecordPhase('nope'), 'idle');
  assert.equal(cluster.recordPhaseBusy('starting'), true);
  assert.equal(cluster.recordPhaseBusy('recording'), false);
  assert.equal(cluster.screenshotStateBusy('capturing'), true);
  assert.equal(cluster.screenshotStateBusy('done'), false);
  assert.equal(cluster.formatElapsed(65), '01:05');
  assert.equal(cluster.formatElapsed(-1), '--:--', 'unreadable elapsed never fabricates zero');
  assert.equal(cluster.aiRecordAnchor('cap-01'), 'capsule/cap-01/record-ai');
  assert.equal(cluster.diskRecordAnchor('cap-01'), 'capsule/cap-01/record-disk');
  assert.equal(cluster.screenshotAnchor('cap-01'), 'capsule/cap-01/screenshot');
  const intents = await importKitModule(path.join(MULTISLOT_DIR, 'multislotIntents.js'));
  assert.deepEqual(intents.buildRecordAiIntent({ capsuleId: 'cap-01', phase: 'recording' }), {
    type: 'record-ai', capsuleId: 'cap-01', phase: 'recording',
  });
  assert.throws(
    () => intents.buildRecordDiskIntent({ capsuleId: 'cap-01', phase: 'recording' }),
    /ERR_DISK_RECORD_WITHOUT_DESTINATION/,
    'disk record refused without destination',
  );
  assert.deepEqual(
    intents.buildRecordDiskIntent({ capsuleId: 'cap-01', phase: 'idle', destination: 'stub://disk' }).destination,
    'stub://disk',
  );
  assert.deepEqual(intents.buildScreenshotIntent({ capsuleId: 'cap-01' }).target, 'ram');
  assert.throws(
    () => intents.buildScreenshotIntent({ capsuleId: 'cap-01', target: 'disk' }),
    /ERR_DISK_RECORD_WITHOUT_DESTINATION/,
    'disk screenshot refused without destination',
  );
});

test('intents module covers the full overridden vocabulary and imports cleanly', { skip: skipIntegration }, async () => {
  const source = read(path.join(MULTISLOT_DIR, 'multislotIntents.js'));
  for (const verb of REQUIRED_INTENTS) {
    assert.ok(source.includes(verb), `multislotIntents.js covers ${verb}`);
  }
  for (const verb of FORBIDDEN_VERBS) {
    assert.equal(source.includes(verb), false, `intents are lease-free (${verb})`);
  }
  assert.ok(source.includes('capsule_id'), 'copy-id payload carries capsule_id');
  const mod = await importKitModule(path.join(MULTISLOT_DIR, 'multislotIntents.js'));
  assert.deepEqual([...mod.MULTISLOT_INTENT_TYPES].sort(), [...REQUIRED_INTENTS].sort());
  assert.deepEqual([...mod.MULTISLOT_HOST_EVENT_TYPES], ['operator-guidance']);
  assert.deepEqual([...mod.MULTISLOT_INPUT_MODES], ['read', 'write']);
  assert.deepEqual([...mod.MULTISLOT_CAP_STORES], ['ram', 'disk']);
  // Validators: lease verbs rejected, disk gated, bad payloads refused.
  assert.deepEqual(mod.validateIntent({ type: 'lease-take', capsuleId: 'cap-01' }).error.code, 'ERR_UNKNOWN_INTENT_TYPE');
  assert.deepEqual(mod.validateIntent({ type: 'lease-cede', capsuleId: 'cap-01' }).error.code, 'ERR_UNKNOWN_INTENT_TYPE');
  assert.deepEqual(
    mod.validateIntent({ type: 'record-disk', capsuleId: 'cap-01', phase: 'recording' }).error.code,
    'ERR_DISK_RECORD_WITHOUT_DESTINATION',
  );
  assert.equal(
    mod.validateIntent({ type: 'record-disk', capsuleId: 'cap-01', phase: 'recording', destination: 'stub://d' }).ok,
    true,
  );
  assert.equal(mod.validateIntent({ type: 'fold', capsuleId: 'cap-01' }).ok, true);
  assert.deepEqual(mod.validateIntent({ type: 'fold', capsuleId: '7' }).error.code, 'ERR_NUMERIC_INDEX_ID');
  assert.deepEqual(mod.buildVisibilityIntent({ capsuleId: 'cap-01', verb: 'hide-surface' }), {
    type: 'hide-surface', capsuleId: 'cap-01',
  });
  assert.throws(() => mod.buildVisibilityIntent({ capsuleId: 'cap-01', verb: 'fold' }), /ERR_UNKNOWN_INTENT_TYPE/);
  assert.deepEqual(mod.buildPresentationIntent({ capsuleId: 'cap-01', verb: 'dock-back' }), {
    type: 'dock-back', capsuleId: 'cap-01',
  });
  assert.throws(() => mod.buildPresentationIntent({ capsuleId: 'cap-01', verb: 'hide-surface' }), /ERR_UNKNOWN_INTENT_TYPE/);
  const fixture = mod.multislotIntentFixture('fold');
  assert.equal(fixture.capsuleId, 'cap-01');
  assert.equal(mod.multislotIntentFixture('fold', { capsuleId: 'cap-02' }).capsuleId, 'cap-02');
});

test('INV-3b: kit-write tripwire (ERR_KIT_DISK_WRITE)', { skip: skipIntegration }, () => {
  const all = [...ALL_SFC, ...EXPECTED_JS].map((n) => read(path.join(MULTISLOT_DIR, n))).join('\n');
  for (const mark of [
    "from 'fs'",
    'from "fs"',
    'node:fs',
    'fetch(',
    'XMLHttpRequest',
    'navigator.clipboard',
    'document.execCommand',
    'localStorage',
    'sessionStorage',
    'OpenTerminal',
    'SendStdin',
    'ResizePTY',
  ]) {
    assert.equal(all.includes(mark), false, `kit performs zero host writes (ERR_KIT_DISK_WRITE tripwire: ${mark})`);
  }
});

test('copy-ID contract: stable format, honest plate, schema-valid payload', { skip: skipIntegration }, async () => {
  const plateSource = read(path.join(MULTISLOT_DIR, 'AiIdentityPlate.vue'));
  for (const state of ['ready', 'copying', 'copied', 'unavailable']) {
    assert.ok(plateSource.includes(state), `identity plate covers copy state ${state}`);
  }
  const plate = await importSfcModule('AiIdentityPlate.vue');
  assert.deepEqual([...plate.MULTISLOT_COPY_STATES], ['ready', 'copying', 'copied', 'unavailable']);
  assert.equal(plate.normalizeCopyState('copied'), 'copied');
  assert.equal(plate.normalizeCopyState('nope'), 'unavailable', 'copy fails closed');
  assert.equal(plate.copyButtonBusy('copying'), true);
  assert.equal(plate.copyButtonBusy('ready'), false);
  assert.equal(plate.isValidCapsuleId('cap-demo-01'), true);
  assert.equal(plate.isValidCapsuleId('7'), false, 'bare numeric index refused');
  assert.equal(plate.isValidCapsuleId(''), false, 'empty id refused');
  assert.equal(plate.isValidCapsuleId('cap white'), false, 'whitespace refused');
  assert.equal(plate.formatIdentityField(undefined), 'unknown');
  assert.equal(plate.formatIdentityField(''), 'unknown');
  assert.equal(plate.formatIdentityField(0), 'unknown', 'unmeasured fields never render 0');
  assert.equal(plate.copyIdAnchor('cap-01'), 'capsule/cap-01/copy-id');
  assert.equal(plate.MULTISLOT_COPY_ID_AGENT_LANE, 'multislot.copy-id');
  assert.ok(
    plate.copyDisabledReason({ capsuleId: '' }).length > 0,
    'missing id disables copy with reason',
  );
  const built = plate.buildCopyIdIntent({ capsuleId: 'cap-01', ts: 42 });
  assert.equal(built.type, 'copy-id');
  assert.equal(built.payload.capsule_id, 'cap-01');
  assert.equal(built.payload.ts, 42);
  const intents = await importKitModule(path.join(MULTISLOT_DIR, 'multislotIntents.js'));
  assert.equal(intents.validateCopyIdPayload({ capsule_id: 'cap-01', ts: 1 }, 'cap-01').ok, true);
  assert.equal(
    intents.validateCopyIdPayload({ capsule_id: 'cap-02', ts: 1 }, 'cap-01').ok,
    false,
    'payload capsule_id must equal the intent capsuleId',
  );
  assert.equal(
    intents.validateCopyIdPayload({ capsule_id: 'cap-01', surface: { kind: 'toaster' }, ts: 1 }, 'cap-01').ok,
    false,
    'surface kind is program|browser|vm',
  );
  assert.equal(intents.isCanonicalCapsuleId('cap-abc-01'), true);
  assert.equal(intents.isCanonicalCapsuleId('CAP-01'), false);
  assert.deepEqual(intents.validateCapsuleId('7').error.code, 'ERR_NUMERIC_INDEX_ID');
});

test('INV-4: anchors cover every multislot id; hidden controls report no geometry', { skip: skipIntegration }, async () => {
  const mod = await importKitModule(path.join(MULTISLOT_DIR, 'multislotRegistryRows.js'));
  const rows = mod.MULTISLOT_REGISTRY_ROWS;
  assert.ok(Array.isArray(rows) && rows.length > 0, 'registry rows exported');
  assert.deepEqual([...mod.MULTISLOT_AGENT_LANE_IDS].sort(), rows.map((r) => r.agentLaneId).sort());
  const ids = rows.map((r) => r.agentLaneId);
  assert.equal(new Set(ids).size, ids.length, 'agent_lane ids are unique');
  for (const id of CORE_AGENT_IDS) {
    assert.ok(ids.includes(id), `registry covers ${id}`);
  }
  assert.ok(
    ids.some((id) => id.startsWith(INPUT_MODE_ID_PREFIX)),
    'registry covers the input-mode chip id',
  );
  assert.equal(ids.some((id) => id.includes('lease')), false, 'no lease ids in the registry');
  for (const row of rows) {
    assert.ok(row.agentLaneId && row.anchorTemplate && row.anchorExample && row.role, `row shape ${row.agentLaneId}`);
    assert.ok(row.component && !/\s/.test(row.component), `row component ${row.agentLaneId}`);
    assert.ok(['L1', 'L2', 'L3'].includes(row.lane), `row lane ${row.agentLaneId}`);
    assert.ok(['new', 'existing'].includes(row.anchorStatus), `row anchor status ${row.agentLaneId}`);
    assert.ok(row.anchorTemplate.includes('{'), `template carries a slot ${row.agentLaneId}`);
    assert.ok(
      /cap-01|sess-01|shell\/|workspace\/|terminal\//.test(row.anchorExample),
      `fixture-built example ${row.agentLaneId}`,
    );
    assert.equal(/\/\d+\//.test(row.anchorExample), false, `no numeric ids ${row.agentLaneId}`);
  }
  // Both original and additive families are integrated in the control registry.
  const registry = await importKitModule(path.join(KIT_ROOT, 'src', 'agent', 'controlRegistry.js'));
  for (const row of rows.filter((r) => r.anchorStatus === 'existing')) {
    const rule = registry.matchControlFamily(row.anchorExample);
    assert.ok(rule, `control family admits ${row.agentLaneId}`);
    assert.equal(rule.template, row.anchorTemplate);
    assert.ok(rule.allowedRoles.includes(row.role), `role ${row.role} for ${row.agentLaneId}`);
  }
  for (const row of rows.filter((r) => r.anchorStatus === 'new')) {
    const rule = registry.matchControlFamily(row.anchorExample);
    assert.ok(rule, `integrated family for ${row.agentLaneId}`);
    assert.equal(rule.template, row.role === 'button'
      ? 'capsule/{id}/{release-control,retry,export,record-ai,record-disk,screenshot,copy-id,hide-surface,hide-terminal}'
      : row.anchorTemplate);
    assert.deepEqual(rule.allowedRoles, [row.role], `role for ${row.agentLaneId}`);
  }
  for (const anchor of ['capsule/cap-01/record-invented', 'capsule/1/input-mode',
    'capsule/cap-01/operator-guidance/invented']) {
    assert.equal(registry.matchControlFamily(anchor), null, anchor);
  }
  assert.equal(
    mod.multislotAnchorFor('multislot.fold', { id: 'cap-09' }),
    'capsule/cap-09/multislot/fold',
  );
  assert.throws(() => mod.multislotAnchorFor('multislot.nope'), /Unknown multislot agent_lane id/);
  const shellSource = read(path.join(MULTISLOT_DIR, 'AiMultiSlot.vue'));
  assert.ok(
    /no geometry|never fabricat/i.test(shellSource),
    'hidden/folded controls report no geometry (ERR_FABRICATED_HIDDEN_BOX)',
  );
  const all = [...ALL_SFC, ...EXPECTED_JS].map((n) => read(path.join(MULTISLOT_DIR, n))).join('\n');
  assert.equal(all.includes('getBoundingClientRect'), false, 'the kit never measures boxes itself');
});

test('control bar: five toggles with stable ids, anchors and literal reasons', { skip: skipIntegration }, async () => {
  const bar = await importSfcModule('AiSlotControlBar.vue');
  assert.deepEqual([...bar.MULTISLOT_BAR_CONTROLS], ['hide-surface', 'hide-terminal', 'fold', 'float', 'close']);
  assert.deepEqual([...bar.MULTISLOT_BAR_INTENT_TYPES].sort(), [
    'close', 'dock-back', 'float', 'fold', 'hide-surface', 'hide-terminal', 'show-surface', 'show-terminal', 'unfold',
  ].sort());
  assert.equal(bar.surfaceIntentType(true), 'hide-surface');
  assert.equal(bar.surfaceIntentType(false), 'show-surface');
  assert.equal(bar.terminalIntentType(true), 'hide-terminal');
  assert.equal(bar.terminalIntentType(false), 'show-terminal');
  assert.equal(bar.foldIntentType(true), 'unfold');
  assert.equal(bar.foldIntentType(false), 'fold');
  assert.equal(bar.floatIntentType(false), 'float');
  assert.equal(bar.floatIntentType(true), 'dock-back');
  assert.equal(bar.barTargetIntent({ control: 'fold', folded: true }), 'unfold');
  assert.equal(bar.barTargetIntent({ control: 'close' }), 'close');
  assert.equal(bar.barTargetIntent({ control: 'nope' }), null);
  assert.deepEqual(bar.buildBarIntent({ type: 'fold', capsuleId: 'cap-01' }), { type: 'fold', capsuleId: 'cap-01' });
  assert.equal(bar.buildBarIntent({ type: 'nope', capsuleId: 'cap-01' }), null);
  assert.equal(bar.barControlAgentLaneId('fold'), 'multislot.fold');
  assert.equal(bar.barControlDomId('fold', 'cap-01'), 'cuk-multislot-fold-cap-01');
  assert.equal(bar.controlDisabledReason({}), '');
  assert.equal(bar.controlDisabledReason({ controlDisabled: true, controlReason: 'Busy' }), 'Busy');
  assert.ok(bar.controlDisabledReason({ barDisabled: true }).length > 0, 'literal reason when disabled');
});

test('keyboard map: splitter, chip, fold and record stay keyboard-operable', { skip: skipIntegration }, () => {
  const splitter = read(path.join(MULTISLOT_DIR, 'AiSlotSplitter.vue'));
  assert.ok(splitter.includes('tabindex') || splitter.includes('tabIndex'), 'splitter is focusable');
  const chip = read(path.join(MULTISLOT_DIR, 'AiInputModeChip.vue'));
  assert.ok(chip.includes('<button'), 'input-mode chip is a one-click button');
  const cluster = read(path.join(MULTISLOT_DIR, 'AiRecordCluster.vue'));
  assert.ok(cluster.includes('<button'), 'record cluster toggles with one click');
  const shell = read(path.join(MULTISLOT_DIR, 'AiMultiSlot.vue'));
  assert.ok(shell.includes('.focus()'), 'shell moves focus to the fold control before hiding');
});

test('stable ids, roles and accessible names on every control', { skip: skipIntegration }, async () => {
  for (const name of ['AiSlotControlBar.vue', 'AiInputModeChip.vue', 'AiIdentityPlate.vue', 'AiRecordCluster.vue']) {
    const source = read(path.join(MULTISLOT_DIR, name));
    assert.ok(source.includes('aria-label') || source.includes('accessibleName'), `${name}: accessible name`);
    assert.ok(source.includes('role='), `${name}: explicit role`);
    assert.ok(
      source.includes('data-semantic-anchor') || source.includes('Anchor(') || source.includes('anchor'),
      `${name}: semantic anchor`,
    );
  }
  const chip = await importSfcModule('AiInputModeChip.vue');
  assert.equal(chip.inputModeDomId('cap-01'), chip.inputModeDomId('cap-01'), 'chip id is stable');
  assert.equal(chip.inputModeAnchor('cap-01'), 'capsule/cap-01/input-mode');
  assert.equal(chip.MULTISLOT_INPUT_MODE_AGENT_LANE, 'multislot.input-mode');
  const plate = await importSfcModule('AiIdentityPlate.vue');
  const ids = plate.identityPlateDomIds('cap-01');
  assert.ok(Object.values(ids).every((v) => v.includes('cap-01')), 'plate ids derive from the capsule id');
});

test('no take/cede, AI-activity or pause-AI controls anywhere on the surface', { skip: skipIntegration }, () => {
  const scope = [...ALL_SFC, ...EXPECTED_JS].map((n) => read(path.join(MULTISLOT_DIR, n))).join('\n');
  assert.equal(/pause\s*ai\b/i.test(scope), false, 'no pause-AI control');
  assert.equal(/ai\s*activity/i.test(scope), false, 'no AI-activity indicator');
  for (const verb of FORBIDDEN_VERBS) {
    assert.equal(scope.includes(verb), false, `override removes ${verb}`);
  }
  const demo = read(DEMO_PATH);
  assert.equal(/pause\s*ai\b/i.test(demo), false, 'demo has no pause-AI control');
  assert.equal(/ai\s*activity/i.test(demo), false, 'demo has no AI-activity indicator');
  const book = read(BOOK_PATH);
  for (const verb of FORBIDDEN_VERBS) {
    assert.equal(book.includes(verb), false, `book is lease-free (${verb})`);
  }
  // The book may name the forbidden controls only to refuse them (negative contrast).
  for (const line of book.split('\n')) {
    if (/pause\s*ai\b|ai\s*activity/i.test(line)) {
      assert.ok(/no\b|never|without|refused|forbidden|not\b/i.test(line), `book negates the control: ${line.trim()}`);
    }
  }
});

test('geometry clamps follow the study-derived defaults', { skip: skipIntegration }, () => {
  const lane1 = LANE1_SFC.map((n) => read(path.join(MULTISLOT_DIR, n))).join('\n');
  assert.ok(/surfaceMin[^;]*200|min[^;]*200/.test(lane1), 'surface minimum 200px');
  assert.ok(lane1.includes('100') && lane1.includes('1000'), 'terminal clamp 100-1000px');
  assert.ok(
    (lane1.includes('300') && lane1.includes('2400')) || (lane1.includes('floatWidth') && lane1.includes('floatHeight')),
    'slot width clamp 300-2400px or host-owned float geometry',
  );
});

test('lane 4: tokens, index exports, book', { skip: skipIntegration }, async () => {
  assert.ok(exists(BOOK_PATH), 'books/multislot-ai.md documents the feature');
  const book = read(BOOK_PATH);
  for (const axis of ['read', 'write']) {
    assert.ok(book.includes(axis), `book documents input mode ${axis}`);
  }
  for (const topic of ['fold', 'record', 'screenshot', 'anchor', 'host']) {
    assert.ok(book.toLowerCase().includes(topic), `book covers ${topic}`);
  }
  const tokens = JSON.parse(read(TOKENS_PATH));
  const family = tokens?.component?.aiMultiSlot;
  assert.ok(family && typeof family === 'object', 'component.aiMultiSlot token family exists');
  const leaves = [];
  (function walk(node, trail) {
    if (node && typeof node === 'object' && '$type' in node) {
      leaves.push(trail);
      return;
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`);
  })(family, 'component.aiMultiSlot');
  assert.ok(leaves.length >= 4, 'token family carries the pane/splitter/bar/chip leaves');
  const familyText = JSON.stringify(family);
  assert.equal(/#[0-9a-fA-F]{3}/.test(familyText), false, 'token family references semantic, never raw hex');
  for (const m of familyText.matchAll(/\{([\w.]+)\}/g)) {
    assert.ok(m[1].startsWith('semantic.'), `token ref ${m[1]} targets semantic.*`);
  }
  const contract = await importKitModule(path.join(KIT_ROOT, 'src', 'design', 'tokenContract.js'));
  assert.doesNotThrow(() => contract.validateTokenContract(tokens), 'merged tokens validate');
  const indexSource = read(path.join(MULTISLOT_DIR, 'index.js'));
  for (const name of ['AiMultiSlot', 'AiSurfacePane', 'AiTerminalPane', 'AiSlotSplitter', 'AiSlotControlBar', 'AiInputModeChip', 'AiIdentityPlate', 'AiRecordCluster']) {
    assert.ok(indexSource.includes(name), `index.js re-exports ${name}`);
  }
  assert.ok(indexSource.includes('multislotIntents.js'), 'index.js re-exports the intent builders');
  assert.ok(indexSource.includes('multislotRegistryRows.js'), 'index.js re-exports the registry rows');
});

test('multislot tree passes publication hygiene', { skip: skipIntegration }, () => {
  const product = new RegExp(
    ['ho', 'ldings'].join('') + '|' + ['me', 'taviewer'].join('') + '|' + ['te', 'amwork'].join(''),
    'i',
  );
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
  const homePath = new RegExp(`/(?:${['ho' + 'me', 'Us' + 'ers', 'ro' + 'ot'].join('|')})/[\\w.-]+`, 'i');
  const targets = [
    ...[...ALL_SFC, ...EXPECTED_JS].map((n) => path.join(MULTISLOT_DIR, n)),
    DEMO_PATH,
    ...(exists(BOOK_PATH) ? [BOOK_PATH] : []),
  ];
  for (const file of targets) {
    const label = path.relative(KIT_ROOT, file);
    const text = read(file);
    assert.doesNotMatch(text, email, `${label}: e-mail-shaped string`);
    assert.doesNotMatch(text, homePath, `${label}: absolute home path`);
    assert.equal(product.test(text), false, `${label}: product name`);
  }
});
