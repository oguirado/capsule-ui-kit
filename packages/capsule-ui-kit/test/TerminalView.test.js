/**
 * @file Behavioral and structural verification oracle for Stream view (`TerminalView.vue`).
 * Covers architecture contract §§3, 4, 5, 6, 7, 8, 9, 10, 12, 13:
 * - Broker/display attachment lifecycle (detached -> attaching -> restoring -> live -> disconnected/replay/disposed)
 * - Negative contrast: stale attach (epoch/attachmentId mismatch), sequence gap resync (never skip VT bytes)
 * - Negative contrast: output -> input loop rejection (sync write re-entrancy, non-user input, protocol responses)
 * - Negative contrast: player closed AI console / replay / unleased / non-live input rejection
 * - Security controls: OSC 52 blocked, OSC 8 non-navigating linkHandler, allowProposedApi false, unreviewed addons rejected, ANSI title never implies ready/done
 * - Staged paste composer with control/newline inspection and explicit Send confirmation
 * - Fold continuity (v-show, focus moved to invoker, PTY/session preserved), rAF + 120ms empty-box geometry guard, and G5 3-layer focus retry cancellation
 * - Vue 3.5 SFC compilation check via @vue/compiler-sfc (plain JS/JSDoc, no lang="ts", §9 semantic anchors)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const SFC_PATH = path.resolve(__dirname, '../src/terminal/TerminalView.vue');
const BOOK_PATH = path.resolve(__dirname, '../books/terminal-view.md');
const COMPILER_SFC_PATH =
  '@vue/compiler-sfc';

const compilerSfc = require(COMPILER_SFC_PATH);

/**
 * Extracts and dynamically imports the pure JS module `<script>` block from `TerminalView.vue`.
 * @returns {Promise<Record<string, any>>}
 */
async function loadTerminalViewHelpers() {
  const source = fs.readFileSync(SFC_PATH, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename: 'TerminalView.vue' });
  assert.equal(errors.length, 0, `SFC parse errors: ${errors.map((e) => e.message).join('; ')}`);
  assert.ok(descriptor.script, 'Expected a <script> block exporting pure JS helpers');
  assert.ok(descriptor.scriptSetup, 'Expected a <script setup> block for component composition');
  assert.equal(descriptor.script.lang, undefined, '<script> must not use lang="ts"');
  assert.equal(descriptor.scriptSetup.lang, undefined, '<script setup> must not use lang="ts"');

  const encoded = Buffer.from(descriptor.script.content, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

/**
 * Creates a deterministic fake xterm.js 6 `Terminal` and `@xterm/addon-fit` `FitAddon` pair
 * matching the exact signatures from `typings/xterm.d.ts` and `typings/addon-fit.d.ts`.
 */
function createFakeXtermHarness(options = {}) {
  const instances = [];
  const fitAddons = [];

  class FakeTerminal {
    constructor(termOptions = {}) {
      this.options = { ...termOptions };
      this.rows = termOptions.rows ?? 24;
      this.cols = termOptions.cols ?? 80;
      this.element = undefined;
      this.textarea = { focused: false };
      this.modes = {bracketedPasteMode:Boolean(options.bracketedPasteMode)};
      this.disposed = false;
      this.resetCount = 0;
      this.clearCount = 0;
      this.focusCount = 0;
      this.blurCount = 0;
      this.writes = [];
      this.pendingWrites = [];
      this.loadedAddons = [];
      this.customKeyHandler = null;
      this._lines = [];
      this._dataListeners = new Set();
      this._binaryListeners = new Set();
      this._resizeListeners = new Set();
      this._writeParsedListeners = new Set();
      this._titleListeners = new Set();
      this._oscHandlers = new Map();
      this._csiHandlers = new Map();

      this.parser = {
        registerOscHandler: (ident, cb) => {
          this._oscHandlers.set(ident, cb);
          return {
            dispose: () => {
              this._oscHandlers.delete(ident);
            }
          };
        },
        registerCsiHandler: (id, cb) => {
          this._csiHandlers.set(id, cb);
          return {
            dispose: () => {
              this._csiHandlers.delete(id);
            }
          };
        }
      };

      const self = this;
      this.buffer = {
        active: {
          type: 'normal',
          get cursorY() {
            return Math.max(0, self._lines.length - 1);
          },
          cursorX: 0,
          viewportY: 0,
          baseY: 0,
          get length() {
            return self._lines.length;
          },
          getLine(y) {
            const entry = self._lines[y];
            if (!entry) return undefined;
            return {
              isWrapped: Boolean(entry.isWrapped),
              length: entry.text.length,
              translateToString(trimRight = false) {
                return trimRight ? entry.text.replace(/\s+$/, '') : entry.text;
              }
            };
          }
        }
      };

      this.onData = (listener) => {
        this._dataListeners.add(listener);
        return {
          dispose: () => {
            this._dataListeners.delete(listener);
          }
        };
      };

      this.onBinary = (listener) => {
        this._binaryListeners.add(listener);
        return {
          dispose: () => {
            this._binaryListeners.delete(listener);
          }
        };
      };

      this.onResize = (listener) => {
        this._resizeListeners.add(listener);
        return {
          dispose: () => {
            this._resizeListeners.delete(listener);
          }
        };
      };

      this.onWriteParsed = (listener) => {
        this._writeParsedListeners.add(listener);
        return {
          dispose: () => {
            this._writeParsedListeners.delete(listener);
          }
        };
      };

      this.onTitleChange = (listener) => {
        this._titleListeners.add(listener);
        return {
          dispose: () => {
            this._titleListeners.delete(listener);
          }
        };
      };

      instances.push(this);
    }

    open(parent) {
      this.element = parent;
    }

    loadAddon(addon) {
      this.loadedAddons.push(addon);
      if (addon && typeof addon.activate === 'function') {
        addon.activate(this);
      }
    }

    attachCustomKeyEventHandler(handler) {
      this.customKeyHandler = handler;
    }

    write(data, callback) {
      const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
      this.writes.push(text);

      // Simulate untrusted terminal query triggering synchronous onData during write
      if (options.syncEchoOnQuery && text.includes('\x1b[c')) {
        for (const fn of this._dataListeners) {
          fn('\x1b[?1;2c');
        }
      }
      if (options.syncEchoPlainOnWrite && text.includes('TRIGGER_LOOP')) {
        for (const fn of this._dataListeners) {
          fn('echoed-from-output\n');
        }
      }

      const completeWrite = () => {
        const rawLines = text.split(/\r?\n/);
        for (let i = 0; i < rawLines.length; i += 1) {
          const lineText = rawLines[i];
          if (lineText.length > 0 || i < rawLines.length - 1) {
            this._lines.push({
              text: lineText.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''),
              isWrapped: false
            });
          }
        }
        if (typeof callback === 'function') {
          callback();
        }
        for (const listener of this._writeParsedListeners) {
          listener();
        }
      };

      if (options.deferWriteCallbacks) {
        this.pendingWrites.push(completeWrite);
      } else {
        completeWrite();
      }
    }

    resize(cols, rows) {
      this.cols = cols;
      this.rows = rows;
      for (const listener of this._resizeListeners) {
        listener({ cols, rows });
      }
    }

    reset() {
      this.resetCount += 1;
      this._lines = [];
    }

    clear() {
      this.clearCount += 1;
      this._lines = [];
    }

    focus() {
      this.focusCount += 1;
      this.textarea.focused = true;
    }

    blur() {
      this.blurCount += 1;
      this.textarea.focused = false;
    }

    dispose() {
      this.disposed = true;
      this._dataListeners.clear();
      this._binaryListeners.clear();
      this._resizeListeners.clear();
      this._writeParsedListeners.clear();
      this._titleListeners.clear();
    }

    emitData(str) {
      for (const listener of this._dataListeners) {
        listener(str);
      }
    }

    emitTitle(title) {
      for (const listener of this._titleListeners) {
        listener(title);
      }
    }

    triggerOsc(ident, payload) {
      const handler = this._oscHandlers.get(ident);
      return handler ? handler(payload) : false;
    }
  }

  class FakeFitAddon {
    constructor() {
      this.terminal = null;
      this.disposed = false;
      this.fitCount = 0;
      this.proposedDimensions = options.proposedDimensions ?? { cols: 100, rows: 32 };
      fitAddons.push(this);
    }

    activate(terminal) {
      this.terminal = terminal;
    }

    proposeDimensions() {
      return this.proposedDimensions;
    }

    fit() {
      this.fitCount += 1;
      const dims = this.proposeDimensions();
      if (dims && this.terminal && dims.cols > 0 && dims.rows > 0) {
        this.terminal.resize(dims.cols, dims.rows);
      }
    }

    dispose() {
      this.disposed = true;
    }
  }

  return { FakeTerminal, FakeFitAddon, instances, fitAddons };
}

test('SFC compilation & structural audit: <script setup> plain JS/JSDoc, no lang="ts", §9 semantic anchors, and companion book', async () => {
  const source = fs.readFileSync(SFC_PATH, 'utf8');
  const { descriptor, errors } = compilerSfc.parse(source, { filename: 'TerminalView.vue' });
  assert.equal(errors.length, 0);
  assert.ok(descriptor.template, 'TerminalView.vue must have a <template>');
  assert.ok(descriptor.script, 'TerminalView.vue must have a <script> block');
  assert.ok(descriptor.scriptSetup, 'TerminalView.vue must have a <script setup> block');
  assert.equal(descriptor.script.lang, undefined, 'No lang="ts" on <script>');
  assert.equal(descriptor.scriptSetup.lang, undefined, 'No lang="ts" on <script setup>');

  const compiledScript = compilerSfc.compileScript(descriptor, {
    id: 'terminal-view-scope'
  });
  assert.ok(compiledScript.content.includes('defineComponent') || compiledScript.content.includes('setup'));

  const compiledTemplate = compilerSfc.compileTemplate({
    source: descriptor.template.content,
    filename: 'TerminalView.vue',
    id: 'terminal-view-scope'
  });
  assert.equal(compiledTemplate.errors.length, 0);

  // Verify v-show is used for folded host retention and required §9 semantic anchors exist
  assert.ok(descriptor.template.content.includes("'cuk-csp-hidden':"), 'Folded live host must remain mounted via a mounted hidden class');
  assert.ok(descriptor.template.content.includes('output/'), 'Must render output/{sid}/text semantic anchor');
  assert.ok(descriptor.template.content.includes('/attach'), 'Must render session/{sid}/attach semantic anchor');
  assert.ok(descriptor.template.content.includes('/stop'), 'Must render session/{sid}/stop semantic anchor');
  assert.ok(descriptor.template.content.includes('/replay'), 'Must render session/{sid}/replay semantic anchor');
  assert.ok(descriptor.template.content.includes('/target'), 'Must render session/{sid}/target semantic anchor');
  assert.ok(!descriptor.template.content.includes('v-html'), 'Must never render arbitrary HTML via v-html');

  assert.ok(fs.existsSync(BOOK_PATH), 'Companion book books/terminal-view.md must exist');
  const bookText = fs.readFileSync(BOOK_PATH, 'utf8');
  assert.ok(bookText.includes('AUSENTE'), 'Companion book must document AUSENTE items');
});

test('positive: broker/display attachment lifecycle, snapshot restore, contiguous tail, and cumulative parser ACKs', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry } = mod;

  const acks = [];
  const resyncs = [];
  const ptyInputs = [];
  const harness = createFakeXtermHarness({ deferWriteCallbacks: true });

  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    onAckOutput: (ack) => acks.push(ack),
    onResyncRequired: (evt) => resyncs.push(evt),
    onSendAuthorizedPtyInput: (payload) => ptyInputs.push(payload)
  });

  // StreamRegistry itself and its session records must carry Vue skip marker (__v_skip: true)
  assert.equal(registry.__v_skip, true, 'StreamRegistry must be marked non-reactive (__v_skip: true)');

  const record = registry.createSession({
    sessionId: 'sess-alpha-1',
    capsuleId: 'cap-main-1',
    epoch: 10,
    mode: 'pty',
    hasControlLease: true
  });
  assert.equal(record.__v_skip, true, 'Session handle must be marked non-reactive');
  assert.equal(record.attachmentState, 'detached');
  assert.equal(record.terminal.options.disableStdin, true, 'Stdin disabled while detached');
  assert.equal(record.terminal.options.allowProposedApi, false);

  // 1. Begin attach
  const attachRes = registry.beginAttach({
    sessionId: 'sess-alpha-1',
    epoch: 10,
    attachmentId: 'att-10-a'
  });
  assert.equal(attachRes.attachmentState, 'attaching');
  assert.equal(record.terminal.options.disableStdin, true, 'Stdin remains disabled during attaching');

  // Buffer tail chunk that arrives while snapshot is in flight (bytes 10..15)
  const tailBuffered = registry.writeOutputChunk({
    sessionId: 'sess-alpha-1',
    epoch: 10,
    attachmentId: 'att-10-a',
    startSeq: 10,
    endSeq: 16,
    data: 'world\n'
  });
  assert.equal(tailBuffered.bufferedForRestore, true);
  assert.equal(acks.length, 0, 'No parser ACK emitted before snapshot and parser callback complete');

  // 2. Apply snapshot up to cursor 10 ("hello \n")
  const restoreRes = registry.applyRestoreSnapshot({
    sessionId: 'sess-alpha-1',
    epoch: 10,
    attachmentId: 'att-10-a',
    snapshotCursorSeq: 10,
    snapshotData: 'hello \n'
  });
  assert.equal(restoreRes.attachmentState, 'restoring');
  assert.equal(record.terminal.resetCount, 1, 'terminal.reset() must run before applying snapshot');
  assert.equal(acks.length, 0, 'Still waiting on async xterm parser write callbacks');
  assert.equal(record.terminal.options.disableStdin, true, 'Stdin still disabled until restore writes parse');

  // Flush snapshot parser write callback, then buffered tail write callback
  assert.equal(record.terminal.pendingWrites.length, 2);
  record.terminal.pendingWrites.shift()();
  assert.equal(acks.length, 1);
  assert.equal(acks[0].acknowledgedSeq, 10);

  record.terminal.pendingWrites.shift()();
  assert.equal(acks.length, 2);
  assert.equal(acks[1].acknowledgedSeq, 16);

  // Now restore is complete and attachment is live; PTY with control lease enables stdin
  assert.equal(record.attachmentState, 'live');
  assert.equal(record.terminal.options.disableStdin, false);
  assert.match(record.accessibleText, /hello/);
  assert.match(record.accessibleText, /world/);

  // 3. Authorized human input in live PTY mode with control lease succeeds
  const inputRes = registry.submitTerminalInput({
    sessionId: 'sess-alpha-1',
    epoch: 10,
    attachmentId: 'att-10-a',
    data: 'ls -la\r',
    wasUserInput: true,
    source: 'user'
  });
  assert.equal(inputRes.accepted, true);
  assert.equal(ptyInputs.length, 1);
  assert.equal(ptyInputs[0].inputSeq, 1);
  assert.equal(ptyInputs[0].data, 'ls -la\r');
  assert.equal(resyncs.length, 0);
});

test('negative contrast: stale attach, stale epoch, mismatched attachmentId, and sequence gap are rejected', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry, TERMINAL_ERROR_CODES } = mod;

  const resyncs = [];
  const harness = createFakeXtermHarness();
  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    onResyncRequired: (evt) => resyncs.push(evt)
  });

  registry.createSession({
    sessionId: 'sess-beta-2',
    capsuleId: 'cap-main-2',
    epoch: 5,
    mode: 'pty',
    hasControlLease: true
  });

  registry.beginAttach({
    sessionId: 'sess-beta-2',
    epoch: 5,
    attachmentId: 'att-5-valid'
  });

  // 1. Stale epoch on beginAttach must fail closed
  assert.throws(
    () =>
      registry.beginAttach({
        sessionId: 'sess-beta-2',
        epoch: 4,
        attachmentId: 'att-4-stale'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_STALE_ATTACH
  );

  // 2. Stale attachmentId or wrong epoch on applyRestoreSnapshot must fail closed
  assert.throws(
    () =>
      registry.applyRestoreSnapshot({
        sessionId: 'sess-beta-2',
        epoch: 5,
        attachmentId: 'att-5-wrong',
        snapshotCursorSeq: 20,
        snapshotData: 'snapshot'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_STALE_ATTACH
  );

  assert.throws(
    () =>
      registry.applyRestoreSnapshot({
        sessionId: 'sess-beta-2',
        epoch: 4,
        attachmentId: 'att-5-valid',
        snapshotCursorSeq: 20,
        snapshotData: 'snapshot'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_STALE_ATTACH
  );

  // Complete valid restore at cursor 20
  registry.applyRestoreSnapshot({
    sessionId: 'sess-beta-2',
    epoch: 5,
    attachmentId: 'att-5-valid',
    snapshotCursorSeq: 20,
    snapshotData: 'line-1\n'
  });

  // 3. Stale attachmentId on writeOutputChunk must fail closed
  assert.throws(
    () =>
      registry.writeOutputChunk({
        sessionId: 'sess-beta-2',
        epoch: 5,
        attachmentId: 'att-old',
        startSeq: 20,
        endSeq: 25,
        data: 'hello'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_STALE_ATTACH
  );

  // 4. Sequence gap (expected 20, got 25) must reject and force resync (never skip VT bytes)
  assert.throws(
    () =>
      registry.writeOutputChunk({
        sessionId: 'sess-beta-2',
        epoch: 5,
        attachmentId: 'att-5-valid',
        startSeq: 25,
        endSeq: 30,
        data: 'skipped-bytes'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_SEQUENCE_GAP
  );
  assert.equal(resyncs.length, 1);
  assert.equal(resyncs[0].expectedSeq, 20);
  assert.equal(resyncs[0].receivedSeq, 25);

  const session = registry.getSession('sess-beta-2');
  assert.equal(session.attachmentState, 'attaching', 'Sequence gap must leave live state and require resync');
  assert.equal(session.terminal.options.disableStdin, true, 'Stdin must be disabled immediately on resync');
});

test('negative contrast: output -> input loops, terminal protocol responses, player console, replay, and unleased input are rejected', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry, isTerminalProtocolResponse, TERMINAL_ERROR_CODES } = mod;

  const forwardedInputs = [];
  const harness = createFakeXtermHarness({
    syncEchoOnQuery: true,
    syncEchoPlainOnWrite: true
  });

  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    onSendAuthorizedPtyInput: (payload) => forwardedInputs.push(payload)
  });

  registry.createSession({
    sessionId: 'sess-loop-guard',
    capsuleId: 'cap-loop-1',
    epoch: 1,
    mode: 'pty',
    hasControlLease: true
  });
  registry.beginAttach({
    sessionId: 'sess-loop-guard',
    epoch: 1,
    attachmentId: 'att-1'
  });
  registry.applyRestoreSnapshot({
    sessionId: 'sess-loop-guard',
    epoch: 1,
    attachmentId: 'att-1',
    snapshotCursorSeq: 0,
    snapshotData: ''
  });

  // 1. Output chunk containing DA1 query (\x1b[c) and TRIGGER_LOOP triggers synchronous onData during write()
  registry.writeOutputChunk({
    sessionId: 'sess-loop-guard',
    epoch: 1,
    attachmentId: 'att-1',
    startSeq: 0,
    endSeq: 20,
    data: 'query:\x1b[c TRIGGER_LOOP\n'
  });

  // Neither the synthetic DA1 response nor the synchronous output-triggered onData may reach PTY input!
  assert.equal(forwardedInputs.length, 0, 'Output-triggered onData must never be forwarded to PTY input');
  const session = registry.getSession('sess-loop-guard');
  assert.ok(session.rejectedOutputToInputCount >= 1, 'Must record rejected output->input attempts');

  // 2. Direct call with source === "output" or wasUserInput === false must fail closed
  assert.throws(
    () =>
      registry.submitTerminalInput({
        sessionId: 'sess-loop-guard',
        epoch: 1,
        attachmentId: 'att-1',
        data: 'echo injected\n',
        wasUserInput: true,
        source: 'output'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_OUTPUT_TO_INPUT_REJECTED
  );

  assert.throws(
    () =>
      registry.submitTerminalInput({
        sessionId: 'sess-loop-guard',
        epoch: 1,
        attachmentId: 'att-1',
        data: 'echo programmatic\n',
        wasUserInput: false,
        source: 'user'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_OUTPUT_TO_INPUT_REJECTED
  );

  // 3. Terminal-generated protocol responses (DA1, CPR, DSR, OSC 10/11 color report, DCS XTGETTCAP, window report)
  for (const protoResp of [
    '\x1b[?1;2c',
    '\x1b[?62;4c',
    '\x1b[24;80R',
    '\x1b[0n',
    '\x1b]10;rgb:ffff/ffff/ffff\x07',
    '\x1b]11;rgb:0000/0000/0000\x1b\\',
    '\x1bP1+r544e=787465726d\x1b\\',
    '\x1b[4;720;1280t'
  ]) {
    assert.equal(isTerminalProtocolResponse(protoResp), true, `Expected ${JSON.stringify(protoResp)} to be classified as protocol response`);
    assert.throws(
      () =>
        registry.submitTerminalInput({
          sessionId: 'sess-loop-guard',
          epoch: 1,
          attachmentId: 'att-1',
          data: protoResp,
          wasUserInput: true,
          source: 'user'
        }),
      (err) => err.code === TERMINAL_ERROR_CODES.ERR_PROTOCOL_RESPONSE_NOT_HUMAN_INTENT
    );
  }
  assert.equal(forwardedInputs.length, 0);
  assert.ok(session.protocolResponseInventory.length >= 8, 'Protocol responses must be inventoried separately');

  // 4. Revoking human control lease immediately blocks input and sets disableStdin = true
  registry.setControlLease({
    sessionId: 'sess-loop-guard',
    epoch: 1,
    hasControlLease: false
  });
  assert.equal(session.terminal.options.disableStdin, true);
  assert.throws(
    () =>
      registry.submitTerminalInput({
        sessionId: 'sess-loop-guard',
        epoch: 1,
        attachmentId: 'att-1',
        data: 'whoami\r',
        wasUserInput: true,
        source: 'user'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_NO_CONTROL_LEASE
  );

  // 5. Player closed AI console (mode: 'structured') and replay-view always reject raw terminal input
  registry.createSession({
    sessionId: 'sess-player-closed',
    capsuleId: 'cap-player-1',
    epoch: 1,
    mode: 'structured',
    hasControlLease: true
  });
  registry.beginAttach({
    sessionId: 'sess-player-closed',
    epoch: 1,
    attachmentId: 'att-p1'
  });
  registry.applyRestoreSnapshot({
    sessionId: 'sess-player-closed',
    epoch: 1,
    attachmentId: 'att-p1',
    snapshotCursorSeq: 0,
    snapshotData: 'Agent output line\n'
  });
  const playerSess = registry.getSession('sess-player-closed');
  assert.equal(playerSess.terminal.options.disableStdin, true, 'Player closed console never enables stdin');
  assert.throws(
    () =>
      registry.submitTerminalInput({
        sessionId: 'sess-player-closed',
        epoch: 1,
        attachmentId: 'att-p1',
        data: 'help\r',
        wasUserInput: true,
        source: 'user'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_PLAYER_CONSOLE_INPUT_FORBIDDEN
  );

  // Transition PTY session to replay-view on exit: read-only replay retained, input rejected
  registry.setControlLease({
    sessionId: 'sess-loop-guard',
    epoch: 1,
    hasControlLease: true
  });
  registry.transitionToReplay({
    sessionId: 'sess-loop-guard',
    epoch: 1
  });
  assert.equal(session.viewRetention, 'replay-view');
  assert.equal(session.terminal.options.disableStdin, true);
  assert.throws(
    () =>
      registry.submitTerminalInput({
        sessionId: 'sess-loop-guard',
        epoch: 1,
        attachmentId: 'att-1',
        data: 'ls\r',
        wasUserInput: true,
        source: 'user'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_REPLAY_READ_ONLY
  );
});

test('security & byte-plane controls: OSC 52 blocked, OSC 8 links neutralized, ANSI title never implies ready, staged paste requires confirmation', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry, buildTerminalOptions, inspectStagedPaste, TERMINAL_ERROR_CODES } = mod;

  const ptyInputs = [];
  const harness = createFakeXtermHarness({ bracketedPasteMode: true });
  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    onSendAuthorizedPtyInput: (payload) => ptyInputs.push(payload)
  });

  // 1. allowProposedApi: true or unreviewed addon must be rejected
  assert.throws(
    () => buildTerminalOptions({ allowProposedApi: true }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_PROPOSED_API_FORBIDDEN
  );

  const session = registry.createSession({
    sessionId: 'sess-sec-1',
    capsuleId: 'cap-sec-1',
    epoch: 2,
    mode: 'pty',
    hasControlLease: true,
    activityState: 'busy'
  });

  assert.throws(
    () => registry.loadSessionAddon('sess-sec-1', { name: '@xterm/addon-clipboard', activate() {} }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_UNREVIEWED_ADDON
  );

  // 2. OSC 52 clipboard sequence is intercepted and blocked (returns true, never touches clipboard)
  const osc52Handled = session.terminal.triggerOsc(52, 'c;SGVsbG8=');
  assert.equal(osc52Handled, true, 'OSC 52 must be intercepted and blocked');
  assert.equal(session.blockedOsc52Count, 1);

  // 3. OSC 8 linkHandler has allowNonHttpProtocols: false and never opens a window
  assert.equal(session.terminal.options.linkHandler.allowNonHttpProtocols, false);
  session.terminal.options.linkHandler.activate({}, 'https://example.com', {});
  session.terminal.options.linkHandler.activate({}, 'javascript:alert(1)', {});
  assert.equal(session.inspectedLinks.length, 1, 'Only http(s) links are recorded for passive inspection; javascript: is ignored');
  assert.equal(session.inspectedLinks[0], 'https://example.com');

  // 4. ANSI title change (OSC 0/2) or quiet output never changes activityState to ready/done
  session.terminal.emitTitle('DONE - Ready for input');
  assert.equal(session.activityState, 'busy', 'ANSI title change must never alter projected activityState');
  assert.equal(session.lastUntrustedTitle, 'DONE - Ready for input');

  // 5. Staged paste composer inspection and explicit confirmation
  registry.beginAttach({
    sessionId: 'sess-sec-1',
    epoch: 2,
    attachmentId: 'att-sec-2'
  });
  registry.applyRestoreSnapshot({
    sessionId: 'sess-sec-1',
    epoch: 2,
    attachmentId: 'att-sec-2',
    snapshotCursorSeq: 0,
    snapshotData: ''
  });

  const dangerousPaste = 'git status\r\ncurl http://evil\x1b[201~injected\x03';
  const pasteInfo = inspectStagedPaste(dangerousPaste);
  assert.equal(pasteInfo.hasControlChars, true);
  assert.equal(pasteInfo.hasNewlines, true);
  assert.ok(pasteInfo.controlTokens.includes('<CR>'));
  assert.ok(pasteInfo.controlTokens.includes('<LF>'));
  assert.ok(pasteInfo.controlTokens.includes('<ESC>'));
  assert.ok(pasteInfo.controlTokens.includes('<CTRL-C>'));
  assert.ok(!pasteInfo.sanitizedBracketedText.slice(6, -6).includes('\x1b[201~'), 'Embedded bracketed-paste closing sequence must be stripped');

  registry.stagePaste({
    sessionId: 'sess-sec-1',
    text: dangerousPaste
  });
  assert.equal(ptyInputs.length, 0, 'Staging paste must never transmit bytes before explicit Send');

  // Confirming without explicit user confirmation flag fails closed
  assert.throws(
    () =>
      registry.confirmStagedPaste({
        sessionId: 'sess-sec-1',
        epoch: 2,
        attachmentId: 'att-sec-2',
        explicitUserSend: false
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_UNCONFIRMED_PASTE
  );

  // Explicit Send confirmation transmits sanitized bracketed paste payload
  const pasteSent = registry.confirmStagedPaste({
    sessionId: 'sess-sec-1',
    epoch: 2,
    attachmentId: 'att-sec-2',
    explicitUserSend: true
  });
  assert.equal(pasteSent.accepted, true);
  assert.equal(ptyInputs.length, 1);
  assert.ok(ptyInputs[0].data.startsWith('\x1b[200~'));
  assert.ok(ptyInputs[0].data.endsWith('\x1b[201~'));
});

test('fold continuity, empty-box geometry rejection (rAF + 120ms), G5 3-layer focus retry cancellation, and theme fresh reference', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry, TERMINAL_ERROR_CODES } = mod;

  const resizeEvents = [];
  const scheduledTimers = [];
  const rafQueue = [];

  const harness = createFakeXtermHarness({
    proposedDimensions: { cols: 0, rows: 0 }
  });

  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    requestAnimationFrameFn: (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    setTimeoutFn: (cb, ms) => {
      const item = { cb, ms, cancelled: false };
      scheduledTimers.push(item);
      return item;
    },
    clearTimeoutFn: (item) => {
      if (item) item.cancelled = true;
    },
    onResizePty: (evt) => resizeEvents.push(evt)
  });

  const session = registry.createSession({
    sessionId: 'sess-g5-1',
    capsuleId: 'cap-g5-1',
    slotId: 'slot-g5-1',
    generation: 3,
    epoch: 7,
    mode: 'pty',
    hasControlLease: true
  });
  registry.beginAttach({
    sessionId: 'sess-g5-1',
    epoch: 7,
    attachmentId: 'att-7'
  });
  registry.applyRestoreSnapshot({
    sessionId: 'sess-g5-1',
    epoch: 7,
    attachmentId: 'att-7',
    snapshotCursorSeq: 0,
    snapshotData: 'ready\n'
  });

  // 1. Empty-box (0x0) geometry frame during unfold/restore must be rejected and never resize PTY to 0x0
  assert.throws(
    () =>
      registry.refitNow({
        sessionId: 'sess-g5-1',
        containerRect: { width: 0, height: 0 }
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_EMPTY_BOX_GEOMETRY
  );
  assert.equal(resizeEvents.length, 0);

  // When positive geometry arrives on rAF + 120ms, fitAddon.fit() resizes PTY
  harness.fitAddons[0].proposedDimensions = { cols: 120, rows: 40 };
  registry.scheduleRefit({
    sessionId: 'sess-g5-1',
    getContainerRect: () => ({ width: 960, height: 640 })
  });
  assert.equal(rafQueue.length, 1);
  rafQueue.shift()();
  assert.equal(resizeEvents.length, 1);
  assert.deepEqual({ cols: resizeEvents[0].cols, rows: resizeEvents[0].rows }, { cols: 120, rows: 40 });

  // 2. G5 three-layer focus protocol (now, 120ms, 400ms) and cancellation on fold
  let invokerFocused = 0;
  const foldInvoker = {
    focus() {
      invokerFocused += 1;
    }
  };

  const focusPlan = registry.scheduleFocus({
    sessionId: 'sess-g5-1',
    slotId: 'slot-g5-1',
    generation: 3,
    epoch: 7,
    focusIntentId: 'intent-1'
  });
  assert.equal(focusPlan.attemptsRun, 1);
  assert.equal(session.terminal.focusCount, 1);
  const retryTimers = scheduledTimers.filter((t) => t.ms === 120 || t.ms === 400);
  assert.ok(retryTimers.length >= 2, 'Expected 120ms and 400ms focus retries scheduled');

  // Fold before 120ms/400ms timers fire: moves focus to foldInvoker, keeps session alive, cancels pending focus retries
  registry.setFolded({
    sessionId: 'sess-g5-1',
    folded: true,
    foldInvoker
  });
  assert.equal(invokerFocused, 1, 'Focus must move to fold invoker before hiding');
  assert.equal(session.folded, true);
  assert.equal(session.terminal.disposed, false, 'Folding must never dispose terminal or stop session');

  // Even if late timer callbacks are invoked manually after fold, they must not focus the hidden terminal
  for (const timer of retryTimers) {
    if (!timer.cancelled) timer.cb();
  }
  assert.equal(session.terminal.focusCount, 1, 'Cancelled/stale focus retry must never steal focus while folded');

  // 3. Theme update assigns a fresh object reference and updates minimumContrastRatio
  const prevThemeRef = session.terminal.options.theme;
  const nextTheme = { background: '#000000', foreground: '#ffffff', cursor: '#00ff00' };
  registry.updateSessionTheme({
    sessionId: 'sess-g5-1',
    theme: nextTheme,
    contrast: 'high',
    reducedMotion: true
  });
  assert.notEqual(session.terminal.options.theme, prevThemeRef);
  assert.notEqual(session.terminal.options.theme, nextTheme, 'Theme must be cloned as a fresh object reference');
  assert.equal(session.terminal.options.minimumContrastRatio, 7);
  assert.equal(session.terminal.options.cursorBlink, false, 'Reduced motion disables cursorBlink');
});

test('semantic control inventory (§9) and negative contrast for numeric list-length IDs and output backpressure watermarks', async () => {
  const mod = await loadTerminalViewHelpers();
  const { createStreamRegistry, buildTerminalSemanticControls, TERMINAL_ERROR_CODES } = mod;

  // 1. Numeric list-length IDs must be rejected (architecture contract §6, §9)
  assert.throws(
    () =>
      buildTerminalSemanticControls({
        sessionId: '0',
        sessionTitle: 'Bad numeric ID',
        presentationInstance: 'term-1',
        epoch: 1
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_NUMERIC_INDEX_ID
  );

  // 2. Visible vs folded semantic control boxes
  const visibleControls = buildTerminalSemanticControls({
    sessionId: 'sess-sem-1',
    sessionTitle: 'Primary Agent',
    presentationInstance: 'term-inst-1',
    epoch: 4,
    generation: 2,
    visible: true,
    folded: false,
    attachmentState: 'live',
    activityState: 'ready',
    viewRetention: 'live-view',
    boxes: {
      output: { x: 10.4, y: 20.6, width: 600.2, height: 80.1 },
      attach: { x: 10, y: 0, width: 60, height: 24 },
      stop: { x: 74, y: 0, width: 60, height: 24 },
      replay: { x: 138, y: 0, width: 60, height: 24 },
      target: { x: 202, y: 0, width: 60, height: 24 }
    }
  });
  assert.equal(visibleControls.length, 5);
  assert.deepEqual(visibleControls[0].box, { x: 10, y: 21, width: 600, height: 80 });
  assert.equal(visibleControls[0].semanticAnchor, 'output/sess-sem-1/text');
  assert.equal(visibleControls[4].semanticAnchor, 'session/sess-sem-1/target');
  assert.equal(visibleControls[4].state.disabled, false, 'Ready + live session is eligible for target selection');

  const foldedControls = buildTerminalSemanticControls({
    sessionId: 'sess-sem-1',
    sessionTitle: 'Primary Agent',
    presentationInstance: 'term-inst-1',
    epoch: 4,
    generation: 2,
    visible: true,
    folded: true,
    attachmentState: 'live',
    activityState: 'ready',
    viewRetention: 'live-view',
    boxes: {
      output: { x: 10, y: 20, width: 600, height: 80 }
    }
  });
  for (const ctrl of foldedControls) {
    assert.equal(ctrl.box, null, 'Folded controls must never fabricate non-null boxes');
  }

  // 3. Per-session pending output watermark backpressure rejection
  const harness = createFakeXtermHarness({ deferWriteCallbacks: true });
  const registry = createStreamRegistry({
    TerminalClass: harness.FakeTerminal,
    FitAddonClass: harness.FakeFitAddon,
    maxPendingOutputBytesPerSession: 16
  });
  registry.createSession({
    sessionId: 'sess-bp-1',
    capsuleId: 'cap-bp-1',
    epoch: 1,
    mode: 'pty'
  });
  registry.beginAttach({
    sessionId: 'sess-bp-1',
    epoch: 1,
    attachmentId: 'att-bp-1'
  });
  registry.applyRestoreSnapshot({
    sessionId: 'sess-bp-1',
    epoch: 1,
    attachmentId: 'att-bp-1',
    snapshotCursorSeq: 0,
    snapshotData: ''
  });

  // First 12-byte chunk fits under 16-byte watermark
  registry.writeOutputChunk({
    sessionId: 'sess-bp-1',
    epoch: 1,
    attachmentId: 'att-bp-1',
    startSeq: 0,
    endSeq: 12,
    data: '0123456789ab'
  });

  // Second 8-byte chunk while first is still unparsed exceeds 16-byte cap -> ERR_OUTPUT_BACKPRESSURE
  assert.throws(
    () =>
      registry.writeOutputChunk({
        sessionId: 'sess-bp-1',
        epoch: 1,
        attachmentId: 'att-bp-1',
        startSeq: 12,
        endSeq: 20,
        data: 'cdefghij'
      }),
    (err) => err.code === TERMINAL_ERROR_CODES.ERR_OUTPUT_BACKPRESSURE
  );
});
