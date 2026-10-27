/**
 * @file Side-terminal model contract: geometry and persistence helpers,
 * session launch/select/close against a fake facade and a fake stream
 * registry, exit-code retention, and the tab-status mapping. No DOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDE_TERMINAL_DEFAULT_WIDTH_PX,
  SIDE_TERMINAL_MIN_WIDTH_PX,
  SIDE_TERMINAL_MAX_WIDTH_RATIO,
  SIDE_TERMINAL_RESIZE_STEP_PX,
  SIDE_TERMINAL_MAX_SESSIONS,
  SIDE_TERMINAL_MENU_EDGE_GAP_PX,
  SIDE_TERMINAL_SYSTEM_ENTRY,
  SIDE_TERMINAL_PROVIDER_COMMAND,
  capSideTerminalMenuWidth,
  clampSideTerminalWidth,
  maxSideTerminalWidth,
  stepSideTerminalWidth,
  readSideTerminalWidth,
  readSideTerminalOpen,
  writeSideTerminalState,
  defaultSideTerminalTitle,
  createSideTerminalModel
} from '../src/side-terminal/sideTerminalModel.js';
import { resolveSessionTabStatus } from '../src/side-terminal/sessionTabStatus.js';

/**
 * @param {{commands?:string[],developerMode?:boolean,enabled?:boolean,attachedSessions?:any[]}} [options]
 */
function createFakeFacade(options = {}) {
  const commands = options.commands ?? ['shell', 'provider'];
  const calls = { open: [], write: [], resize: [], close: [], ack: [], setEnabled: [] };
  let nextId = 0;
  const dataListeners = new Set();
  const exitListeners = new Set();
  return {
    calls,
    emitData(frame) { for (const cb of dataListeners) cb(frame); },
    emitExit(event) { for (const cb of exitListeners) cb(event); },
    capabilities: async () => ({ developerMode: options.developerMode === true, commands: [...commands] }),
    attach: async () => ({ owner: 'fake-owner', enabled: options.enabled !== false, sessions: options.attachedSessions ?? [] }),
    setEnabled: async (value) => { calls.setEnabled.push(value); return value; },
    open: async (request) => { calls.open.push(request); nextId += 1; return { session: `sess-${nextId}` }; },
    write: async (request) => { calls.write.push(request); return true; },
    resize: async (request) => { calls.resize.push(request); return true; },
    close: async (request) => { calls.close.push(request); return true; },
    ack: async (request) => { calls.ack.push(request); return true; },
    onData: (cb) => { dataListeners.add(cb); return () => { dataListeners.delete(cb); }; },
    onExit: (cb) => { exitListeners.add(cb); return () => { exitListeners.delete(cb); }; }
  };
}

function createFakeRegistryHarness() {
  const calls = {
    createSession: [],
    beginAttach: [],
    applyRestoreSnapshot: [],
    writeOutputChunk: [],
    setControlLease: [],
    disposeSession: [],
    forgetSession: []
  };
  const seen = [];
  function createRegistry(options) {
    seen.push(options);
    return {
      options,
      createSession: (params) => { calls.createSession.push(params); },
      beginAttach: (params) => { calls.beginAttach.push(params); },
      applyRestoreSnapshot: (params) => { calls.applyRestoreSnapshot.push(params); },
      writeOutputChunk: (params) => { calls.writeOutputChunk.push(params); },
      setControlLease: (params) => { calls.setControlLease.push(params); },
      disposeSession: (id) => { calls.disposeSession.push(id); },
      forgetSession: (id) => { calls.forgetSession.push(id); return true; }
    };
  }
  return { createRegistry, calls, seen };
}

function createStorageDouble() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); }
  };
}

/**
 * @param {any} facade
 * @param {any} harness
 * @param {any} [extra]
 */
async function createReadyModel(facade, harness, extra = {}) {
  const states = [];
  const model = createSideTerminalModel({
    facade,
    createRegistry: harness.createRegistry,
    onChange: (state) => { states.push(state); },
    ...extra
  });
  await model.initialize();
  return { model, states };
}

test('geometry constants match the operator overlay contract', () => {
  assert.equal(SIDE_TERMINAL_DEFAULT_WIDTH_PX, 640);
  assert.equal(SIDE_TERMINAL_MIN_WIDTH_PX, 420);
  assert.equal(SIDE_TERMINAL_MAX_WIDTH_RATIO, 0.75);
  assert.equal(SIDE_TERMINAL_RESIZE_STEP_PX, 8);
  assert.equal(SIDE_TERMINAL_MAX_SESSIONS, 8);
  assert.equal(SIDE_TERMINAL_SYSTEM_ENTRY.id, 'shell');
  assert.equal(SIDE_TERMINAL_SYSTEM_ENTRY.command, 'shell');
  assert.deepEqual([...SIDE_TERMINAL_SYSTEM_ENTRY.argv], []);
  assert.equal(SIDE_TERMINAL_PROVIDER_COMMAND, 'provider');
});

test('width clamps to 420px..75% with a default fallback', () => {
  assert.equal(maxSideTerminalWidth(1280), 960);
  assert.equal(maxSideTerminalWidth(100), 420);
  assert.equal(clampSideTerminalWidth(100, 1280), 420);
  assert.equal(clampSideTerminalWidth(2000, 1280), 960);
  assert.equal(clampSideTerminalWidth(640, 1280), 640);
  assert.equal(clampSideTerminalWidth(Number.NaN, 1280), 640);
  assert.equal(clampSideTerminalWidth(undefined, 1280), 640);
  assert.equal(stepSideTerminalWidth(640, 1, 1280), 648);
  assert.equal(stepSideTerminalWidth(640, -1, 1280), 632);
  assert.equal(stepSideTerminalWidth(640, 1, 1280, true), 700);
  assert.equal(clampSideTerminalWidth(640, 400), 420);
});

test('PL2 R7b: menu width cap keeps the right-anchored dialog inside the panel', () => {
  assert.equal(SIDE_TERMINAL_MENU_EDGE_GAP_PX, 8);
  // PL1 bench geometry (pl1-020): 640px panel at 1280, 352px dialog, trigger
  // right edge near the panel edge: the dialog fits, no cap binds.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1223, dialogWidth: 352, panelLeft: 640, viewportWidth: 1280 }), null);
  // Exact fit leaves the dialog alone.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1000, dialogWidth: 352, panelLeft: 640, viewportWidth: 1280 }), null);
  // Minimum 420px panel with the trigger further left: the dialog shrinks to
  // the measured space (1200 - 868 = 332) instead of leaving the panel.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1200, dialogWidth: 352, panelLeft: 860, viewportWidth: 1280 }), 332);
  // Long provider labels at minimum width: 1223 - 868 = 355.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1223, dialogWidth: 360, panelLeft: 860, viewportWidth: 1280 }), 355);
  // The viewport bound wins when the trigger sits past it: 1272 - 1008 = 264.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1275, dialogWidth: 352, panelLeft: 1000, viewportWidth: 1280 }), 264);
  // Panel hanging past the left edge clamps to the viewport: 300 - 8 = 292.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 300, dialogWidth: 352, panelLeft: -50, viewportWidth: 1280 }), 292);
  // Degenerate geometry never caps: the CSS right anchor stays the fallback.
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 100, dialogWidth: 352, panelLeft: 640, viewportWidth: 1280 }), null);
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1223, dialogWidth: 0, panelLeft: 640, viewportWidth: 1280 }), null);
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1223, dialogWidth: -5, panelLeft: 640, viewportWidth: 1280 }), null);
  assert.equal(capSideTerminalMenuWidth({ triggerRight: Number.NaN, dialogWidth: 352, panelLeft: 640, viewportWidth: 1280 }), null);
  assert.equal(capSideTerminalMenuWidth({ triggerRight: 1223, dialogWidth: 352, panelLeft: 640, viewportWidth: Number.POSITIVE_INFINITY }), null);
});

test('open state and width persist through the settings seam', () => {
  const storage = createStorageDouble();
  assert.equal(readSideTerminalOpen(storage), false);
  assert.equal(readSideTerminalWidth(storage, 1280), 640);
  writeSideTerminalState(storage, { open: true, widthPx: 700 });
  assert.equal(readSideTerminalOpen(storage), true);
  assert.equal(readSideTerminalWidth(storage, 1280), 700);
  writeSideTerminalState(storage, { open: false, widthPx: 100 });
  assert.equal(readSideTerminalOpen(storage), false);
  assert.equal(readSideTerminalWidth(storage, 1280), 420);
  assert.equal(readSideTerminalOpen(null), false);
  assert.equal(readSideTerminalWidth(null, 1280), 640);
});

test('tab status maps activities to idle/busy/exited chips', () => {
  assert.equal(resolveSessionTabStatus('exited'), 'exited');
  assert.equal(resolveSessionTabStatus('failed'), 'exited');
  assert.equal(resolveSessionTabStatus('busy'), 'busy');
  assert.equal(resolveSessionTabStatus('waiting-input'), 'busy');
  assert.equal(resolveSessionTabStatus('waiting-permission'), 'busy');
  assert.equal(resolveSessionTabStatus('unknown'), 'idle');
  assert.equal(resolveSessionTabStatus('ready'), 'idle');
  assert.equal(resolveSessionTabStatus(undefined), 'idle');
  assert.equal(resolveSessionTabStatus(null), 'idle');
  assert.equal(resolveSessionTabStatus('invented'), 'idle');
});

test('default titles stay generic for reattached commands', () => {
  assert.equal(defaultSideTerminalTitle('shell'), 'System shell');
  assert.equal(defaultSideTerminalTitle('provider'), 'provider');
  assert.equal(defaultSideTerminalTitle(''), 'Terminal session');
  assert.equal(defaultSideTerminalTitle(null), 'Terminal session');
});

test('shell launch sends no env key and selects the session', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  const id = await model.launch({ command: 'shell', args: [] });
  assert.equal(id, 'sess-1');
  assert.equal(facade.calls.open.length, 1);
  assert.deepEqual(facade.calls.open[0], { command: 'shell', args: [], cols: 80, rows: 24 });
  assert.equal('env' in facade.calls.open[0], false);
  const snap = model.snapshot();
  assert.equal(snap.selected, 'sess-1');
  assert.equal(snap.liveCount, 1);
  assert.equal(snap.sessions.length, 1);
  assert.equal(snap.sessions[0].title, 'System shell');
  assert.equal(snap.sessions[0].kind, 'shell');
  assert.equal(snap.sessions[0].exitCode, null);
  assert.equal(harness.calls.createSession.length, 1);
  model.dispose();
});

test('provider launch forwards full argv and never sends env', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  const id = await model.launch({
    command: 'provider',
    args: ['alpha-cli', '--fast'],
    title: 'Alpha',
    kind: 'alpha'
  });
  assert.equal(id, 'sess-1');
  assert.deepEqual(facade.calls.open[0], {
    command: 'provider',
    args: ['alpha-cli', '--fast'],
    cols: 80,
    rows: 24
  });
  const snap = model.snapshot();
  assert.equal(snap.sessions[0].title, 'Alpha');
  assert.equal(snap.sessions[0].kind, 'alpha');
  model.dispose();
});

test('launch refuses unknown commands, bad argv, bad env and the live cap', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await assert.rejects(() => model.launch({ command: 'invented', args: [] }), /Terminal launch unavailable/);
  await assert.rejects(() => model.launch({ command: 'shell', args: new Array(33).fill('x') }), /Terminal launch unavailable/);
  await assert.rejects(() => model.launch({ command: 'shell', args: ['a\0b'] }), /Terminal launch unavailable/);
  await assert.rejects(() => model.launch({ command: 'shell', args: ['x'.repeat(4097)] }), /Terminal launch unavailable/);
  for (let i = 0; i < SIDE_TERMINAL_MAX_SESSIONS; i += 1) {
    await model.launch({ command: 'shell', args: [] });
  }
  assert.equal(model.snapshot().liveCount, SIDE_TERMINAL_MAX_SESSIONS);
  await assert.rejects(() => model.launch({ command: 'shell', args: [] }), /Terminal launch unavailable/);
  model.dispose();
});

test('concurrent launch attempts refuse while one is in flight', async () => {
  const facade = createFakeFacade();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  facade.open = async (request) => { facade.calls.open.push(request); await gate; return { session: 'sess-gated' }; };
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  const first = model.launch({ command: 'shell', args: [] });
  await assert.rejects(() => model.launch({ command: 'shell', args: [] }), /Terminal launch unavailable/);
  release();
  assert.equal(await first, 'sess-gated');
  model.dispose();
});

test('exit marks the session and keeps the view readable with its code', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  facade.emitData({ session: 'sess-1', seq: 1, bytes: [104, 105], byteLength: 2 });
  assert.equal(harness.calls.writeOutputChunk.length, 1);
  facade.emitExit({ session: 'sess-1', code: 3 });
  const snap = model.snapshot();
  assert.equal(snap.sessions.length, 1);
  assert.equal(snap.sessions[0].activity, 'exited');
  assert.equal(snap.sessions[0].exitCode, 3);
  assert.equal(snap.sessions[0].hasControlLease, false);
  assert.equal(snap.liveCount, 0);
  assert.equal(snap.selected, 'sess-1');
  model.dispose();
});

test('sequence gaps fail the session and release its lease', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  facade.emitData({ session: 'sess-1', seq: 2, bytes: [104], byteLength: 1 });
  const snap = model.snapshot();
  assert.equal(snap.sessions[0].activity, 'failed');
  assert.equal(snap.error.includes('sequence gap'), true);
  model.dispose();
});

test('closing a live tab kills it and selects the last remaining tab', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  await model.launch({ command: 'shell', args: [] });
  await model.launch({ command: 'shell', args: [] });
  assert.equal(model.snapshot().selected, 'sess-3');
  assert.equal(await model.closeTab('sess-3'), true);
  assert.deepEqual(facade.calls.close.map((c) => c.session), ['sess-3']);
  let snap = model.snapshot();
  assert.deepEqual(snap.sessions.map((s) => s.sessionId), ['sess-1', 'sess-2']);
  assert.equal(snap.selected, 'sess-2');
  assert.equal(await model.closeTab('sess-1'), true);
  assert.equal(model.snapshot().selected, 'sess-2');
  assert.equal(await model.closeTab('sess-2'), true);
  snap = model.snapshot();
  assert.deepEqual(snap.sessions, []);
  assert.equal(snap.selected, null);
  assert.equal(await model.closeTab('sess-2'), false);
  assert.equal(harness.calls.disposeSession.length, 3);
  assert.equal(harness.calls.forgetSession.length, 3);
  model.dispose();
});

test('closing an exited tab removes the view without a second kill', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  facade.emitExit({ session: 'sess-1', code: 0 });
  assert.equal(await model.closeTab('sess-1'), true);
  assert.equal(facade.calls.close.length, 0);
  assert.equal(model.snapshot().sessions.length, 0);
  model.dispose();
});

test('snapshot carries no capsule projection fields', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  const snap = model.snapshot();
  assert.equal('projection' in snap, false);
  assert.equal('capsuleId' in snap, false);
  for (const key of ['capsuleId', 'capsuleTitle', 'backendLifecycle', 'epoch', 'generation']) {
    assert.equal(key in snap.sessions[0], false, `session must not carry ${key}`);
  }
  assert.deepEqual(
    Object.keys(snap.sessions[0]).sort(),
    ['accessibleText', 'activity', 'attachment', 'exitCode', 'hasControlLease', 'kind', 'sessionId', 'title', 'viewRetention'].sort()
  );
  model.dispose();
});

test('opt-in gates launches until the operator enables the mode', async () => {
  const facade = createFakeFacade({ enabled: false });
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  assert.equal(model.snapshot().enabled, false);
  await assert.rejects(() => model.launch({ command: 'shell', args: [] }), /Terminal launch unavailable/);
  await model.optIn(true);
  assert.deepEqual(facade.calls.setEnabled, [true]);
  assert.equal(model.snapshot().enabled, true);
  await model.launch({ command: 'shell', args: [] });
  assert.equal(model.snapshot().liveCount, 1);
  model.dispose();
});

test('attach rehydrates broker sessions with resolved titles', async () => {
  const facade = createFakeFacade({
    attachedSessions: [{ session: 'old-1', command: 'shell', seq: 0, ackedSeq: 0, bytes: 0, replay: [] }]
  });
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness, {
    resolveTitle: (command) => (command === 'shell' ? 'Restored shell' : String(command))
  });
  const snap = model.snapshot();
  assert.equal(snap.sessions.length, 1);
  assert.equal(snap.sessions[0].title, 'Restored shell');
  assert.equal(snap.selected, 'old-1');
  model.dispose();
});

test('stop kills live sessions and ignores exited ones', async () => {
  const facade = createFakeFacade();
  const harness = createFakeRegistryHarness();
  const { model } = await createReadyModel(facade, harness);
  await model.launch({ command: 'shell', args: [] });
  await model.stop('sess-1');
  assert.equal(facade.calls.close.length, 1);
  facade.emitExit({ session: 'sess-1', code: 0 });
  await model.stop('sess-1');
  assert.equal(facade.calls.close.length, 1);
  model.dispose();
});


test('MV-1: absent or partial facades produce typed capability failure and safe copy', async () => {
  for (const facade of [null, undefined, {}]) {
    const harness = createFakeRegistryHarness();
    const model = createSideTerminalModel({ facade, createRegistry: harness.createRegistry });
    await model.initialize();
    assert.equal(model.snapshot().ready, false);
    assert.equal(model.snapshot().error, 'Terminal capabilities unavailable');
    assert.equal(model.snapshot().errorCode, 'TERMINAL_CAPABILITIES_UNAVAILABLE');
    model.dispose();
  }
});

test('MV-1: capability and operation exceptions never become user copy; codes remain data', async () => {
  const secret = 'private host-secret token=abc <script>alert(1)</script>';
  const failure = Object.assign(new Error(secret), {code: 'BROKER_PRIVATE'});
  const facade = createFakeFacade();
  facade.capabilities = async () => { throw failure; };
  const harness = createFakeRegistryHarness();
  const model = createSideTerminalModel({ facade, createRegistry: harness.createRegistry });
  await model.initialize();
  assert.equal(model.snapshot().error, 'Terminal capabilities unavailable');
  assert.equal(model.snapshot().errorCode, 'TERMINAL_CAPABILITIES_UNAVAILABLE');
  assert.equal(model.snapshot().diagnosticCode, 'BROKER_PRIVATE');
  model.dispose();
  const live = createFakeFacade();
  live.open = async () => { throw failure; };
  const ready = await createReadyModel(live, createFakeRegistryHarness());
  await assert.rejects(ready.model.launch({ command: 'shell' }), {message: secret});
  assert.equal(ready.model.snapshot().error, 'Terminal operation unavailable');
  assert.equal(ready.model.snapshot().errorCode, 'TERMINAL_OPERATION_FAILED');
  assert.equal(ready.model.snapshot().diagnosticCode, 'BROKER_PRIVATE');
  ready.model.dispose();
});


test('MV-1: malformed capabilities and non-Error rejections use fixed copy', async () => {
  for (const capabilities of [async () => null, async () => ({}), async () => { throw 'private broker text'; }]) {
    const facade = createFakeFacade();
    facade.capabilities = capabilities;
    const model = createSideTerminalModel({facade, createRegistry: createFakeRegistryHarness().createRegistry});
    await model.initialize();
    assert.equal(model.snapshot().error, 'Terminal capabilities unavailable');
    assert.equal(model.snapshot().errorCode, 'TERMINAL_CAPABILITIES_UNAVAILABLE');
    assert.equal(model.snapshot().ready, false);
    model.dispose();
  }
});
