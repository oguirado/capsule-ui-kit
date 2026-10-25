/**
 * @file Side-terminal key decisions: clipboard chords, the IME coordinator
 * and the editable-target predicate. Pure functions, no DOM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TERMINAL_COPY_RELEASE_MS,
  TERMINAL_IME_SUPPRESS_MS,
  TERMINAL_IME_STUCK_MS,
  decideTerminalKey,
  createImeCoordinator,
  isEditableTarget
} from '../src/side-terminal/sideTerminalKeys.js';

test('timing constants match the reference behavior', () => {
  assert.equal(TERMINAL_COPY_RELEASE_MS, 150);
  assert.equal(TERMINAL_IME_SUPPRESS_MS, 50);
  assert.equal(TERMINAL_IME_STUCK_MS, 4000);
});

test('shifted clipboard chords copy, paste and select unconditionally', () => {
  assert.deepEqual(decideTerminalKey({ code: 'KeyC', ctrlKey: true, shiftKey: true }), { action: 'copy' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyV', ctrlKey: true, shiftKey: true }), { action: 'paste' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyA', ctrlKey: true, shiftKey: true }), { action: 'select-all' });
  assert.deepEqual(
    decideTerminalKey({ code: 'KeyC', ctrlKey: true, shiftKey: true, hasSelection: false }),
    { action: 'copy' }
  );
});

test('bare Ctrl+C copies only with a selection, else the shell keeps SIGINT', () => {
  assert.deepEqual(
    decideTerminalKey({ code: 'KeyC', ctrlKey: true, hasSelection: true }),
    { action: 'copy', releaseSelectionAfterMs: 150 }
  );
  assert.deepEqual(decideTerminalKey({ code: 'KeyC', ctrlKey: true }), { action: 'pass' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyC', ctrlKey: true, hasSelection: false }), { action: 'pass' });
});

test('bare Ctrl+V always pastes', () => {
  assert.deepEqual(decideTerminalKey({ code: 'KeyV', ctrlKey: true }), { action: 'paste' });
  assert.deepEqual(
    decideTerminalKey({ code: 'KeyV', ctrlKey: true, hasSelection: true }),
    { action: 'paste' }
  );
});

test('chords fall back to the key value when no physical code is present', () => {
  assert.deepEqual(decideTerminalKey({ key: 'c', ctrlKey: true, shiftKey: true }), { action: 'copy' });
  assert.deepEqual(decideTerminalKey({ key: 'v', ctrlKey: true }), { action: 'paste' });
  assert.deepEqual(
    decideTerminalKey({ key: 'c', ctrlKey: true, hasSelection: true }),
    { action: 'copy', releaseSelectionAfterMs: 150 }
  );
});

test('anything else passes through untouched', () => {
  assert.deepEqual(decideTerminalKey({ code: 'KeyX', ctrlKey: true, shiftKey: true }), { action: 'pass' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyC' }), { action: 'pass' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyC', ctrlKey: true, metaKey: true }), { action: 'pass' });
  assert.deepEqual(decideTerminalKey({ code: 'KeyV', ctrlKey: true, altKey: true }), { action: 'pass' });
  assert.deepEqual(decideTerminalKey({}), { action: 'pass' });
  assert.deepEqual(decideTerminalKey(undefined), { action: 'pass' });
});

test('composition end sends once and clears the hidden textarea', () => {
  const sent = [];
  const ime = createImeCoordinator({ now: () => 1000, onSend: (text) => { sent.push(text); } });
  ime.compositionStart();
  assert.deepEqual(ime.compositionEnd('n'), { sent: true, clearTextarea: true });
  assert.deepEqual(sent, ['n']);
  assert.deepEqual(ime.compositionEnd('n'), { sent: false, clearTextarea: false });
  assert.deepEqual(sent, ['n']);
});

test('composition echo is dropped inside the suppress window only', () => {
  let now = 1000;
  const ime = createImeCoordinator({ now: () => now });
  ime.compositionStart();
  ime.compositionEnd('n');
  now = 1020;
  assert.equal(ime.handleData('n'), '');
  now = 1060;
  assert.equal(ime.handleData('n'), 'n');
});

test('a physical keydown closes the suppress window instantly', () => {
  let now = 1000;
  const ime = createImeCoordinator({ now: () => now });
  ime.compositionStart();
  ime.compositionEnd('n');
  now = 1010;
  ime.keyDown();
  assert.equal(ime.handleData('real typing'), 'real typing');
});

test('a stuck composition declares itself dead instead of eating keys', () => {
  let now = 1000;
  const sent = [];
  const ime = createImeCoordinator({ now: () => now, onSend: (text) => { sent.push(text); } });
  ime.compositionStart();
  now = 6000;
  assert.equal(ime.handleData('k'), 'k');
  assert.deepEqual(ime.compositionEnd('k'), { sent: false, clearTextarea: false });
  assert.deepEqual(sent, []);
});

test('blur and cancel hard-reset the coordinator', () => {
  let now = 1000;
  const sent = [];
  const ime = createImeCoordinator({ now: () => now, onSend: (text) => { sent.push(text); } });
  ime.compositionStart();
  ime.blur();
  assert.deepEqual(ime.compositionEnd('x'), { sent: false, clearTextarea: false });
  ime.compositionStart();
  ime.compositionEnd('y');
  assert.deepEqual(sent, ['y']);
  ime.cancel();
  now = 1010;
  assert.equal(ime.handleData('y'), 'y');
  assert.deepEqual(sent, ['y']);
});

test('editable targets keep global shortcuts disabled', () => {
  assert.equal(isEditableTarget(null), false);
  assert.equal(isEditableTarget(undefined), false);
  assert.equal(isEditableTarget({}), false);
  assert.equal(isEditableTarget({ isContentEditable: true }), true);
  assert.equal(
    isEditableTarget({ closest: () => ({ tagName: 'TEXTAREA' }) }),
    true
  );
  assert.equal(isEditableTarget({ closest: () => null }), false);
  assert.equal(
    isEditableTarget({
      closest: () => { throw new Error('denied'); }
    }),
    false
  );
});
