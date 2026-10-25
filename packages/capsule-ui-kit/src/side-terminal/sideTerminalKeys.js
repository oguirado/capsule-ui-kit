/**
 * Pure terminal key and IME decisions for the side terminal. No DOM, no
 * framework, no imports: the live view owns listeners and clipboard transport,
 * this module only decides what a key chord or IME event means.
 * @module side-terminal/sideTerminalKeys
 */

/** Delay before a Shift-less Ctrl+C copy releases the selection so the next Ctrl+C reaches the shell as SIGINT. */
export const TERMINAL_COPY_RELEASE_MS = 150;

/** Post-composition window where echoed bytes are dropped instead of forwarded. */
export const TERMINAL_IME_SUPPRESS_MS = 50;

/** Composition age after which the coordinator declares the IME stuck and lets keys pass. */
export const TERMINAL_IME_STUCK_MS = 4000;

/**
 * @typedef {object} TerminalKeyEvent
 * @property {string} [key] Key value (`key` of the DOM event).
 * @property {string} [code] Physical code (`code` of the DOM event).
 * @property {boolean} [ctrlKey] Control modifier.
 * @property {boolean} [shiftKey] Shift modifier.
 * @property {boolean} [metaKey] Meta modifier.
 * @property {boolean} [altKey] Alt modifier.
 * @property {boolean} [hasSelection] True when the terminal currently has a text selection.
 */

/**
 * @typedef {object} TerminalKeyDecision
 * @property {'copy' | 'paste' | 'select-all' | 'pass'} action Decision for the chord.
 * @property {number} [releaseSelectionAfterMs] When present, release the selection after this delay.
 */

/**
 * Decides a terminal key chord with the reference-emulator set: Ctrl+Shift+C
 * copies, Ctrl+Shift+V pastes, Ctrl+Shift+A selects all, Shift-less Ctrl+C
 * copies only with a selection (otherwise the chord passes through so the
 * shell sees SIGINT) and Shift-less Ctrl+V always pastes. Anything else (in
 * particular chords with Meta or Alt) passes through untouched.
 * @param {TerminalKeyEvent} event Key chord plus selection state.
 * @returns {TerminalKeyDecision} Decision for the caller to execute.
 */
export function decideTerminalKey(event) {
  const source = event ?? {};
  const ctrl = source.ctrlKey === true;
  const shift = source.shiftKey === true;
  if (!ctrl || source.metaKey === true || source.altKey === true) {
    return { action: 'pass' };
  }
  let code = typeof source.code === 'string' ? source.code : '';
  if (code === '' && typeof source.key === 'string' && source.key.length === 1) {
    code = `Key${source.key.toUpperCase()}`;
  }
  if (shift) {
    if (code === 'KeyC') return { action: 'copy' };
    if (code === 'KeyV') return { action: 'paste' };
    if (code === 'KeyA') return { action: 'select-all' };
    return { action: 'pass' };
  }
  if (code === 'KeyC') {
    if (source.hasSelection === true) {
      return { action: 'copy', releaseSelectionAfterMs: TERMINAL_COPY_RELEASE_MS };
    }
    return { action: 'pass' };
  }
  if (code === 'KeyV') return { action: 'paste' };
  return { action: 'pass' };
}

/**
 * @typedef {object} ImeCoordinatorOptions
 * @property {() => number} [now] Clock in milliseconds.
 * @property {(text: string) => void} [onSend] Receives composed text exactly once per composition.
 */

/**
 * @typedef {object} ImeCompositionResult
 * @property {boolean} sent True when composed text was forwarded.
 * @property {boolean} clearTextarea True when the caller must clear the hidden textarea.
 */

/**
 * Creates the IME coordinator: `compositionend` data is the only source of
 * composed text (forwarded once), the hidden textarea is cleared, echoed
 * bytes inside the post-composition window are dropped, any physical keydown
 * closes that window instantly, a composition older than the stuck budget is
 * declared dead, and blur/cancel hard-resets the state.
 * @param {ImeCoordinatorOptions} [options] Clock and send sink.
 * @returns {{ compositionStart: () => void, compositionEnd: (data: unknown) => ImeCompositionResult, keyDown: () => void, handleData: (data: string) => string, blur: () => void, cancel: () => void }} Coordinator.
 */
export function createImeCoordinator(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const onSend = typeof options.onSend === 'function' ? options.onSend : () => {};
  let composing = false;
  let startedAt = 0;
  let suppressUntil = 0;

  function reset() {
    composing = false;
    startedAt = 0;
    suppressUntil = 0;
  }

  return {
    compositionStart() {
      composing = true;
      startedAt = now();
    },
    compositionEnd(data) {
      if (!composing) return { sent: false, clearTextarea: false };
      composing = false;
      startedAt = 0;
      suppressUntil = now() + TERMINAL_IME_SUPPRESS_MS;
      const text = typeof data === 'string' ? data : '';
      if (text.length > 0) onSend(text);
      return { sent: text.length > 0, clearTextarea: true };
    },
    keyDown() {
      suppressUntil = 0;
      if (composing && now() - startedAt > TERMINAL_IME_STUCK_MS) {
        composing = false;
        startedAt = 0;
      }
    },
    handleData(data) {
      if (typeof data !== 'string' || data.length === 0) return '';
      if (composing && now() - startedAt > TERMINAL_IME_STUCK_MS) {
        composing = false;
        startedAt = 0;
        return data;
      }
      if (now() < suppressUntil) return '';
      return data;
    },
    blur() {
      reset();
    },
    cancel() {
      reset();
    }
  };
}

/**
 * Reports whether an event target is an editable surface (terminal host,
 * input, textarea or content-editable node) where global shortcuts must stay
 * disabled so the focused control keeps every key.
 * @param {any} target Event target (runtime-checked).
 * @returns {boolean} True when the target is editable.
 */
export function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable === true) return true;
  if (typeof target.closest !== 'function') return false;
  try {
    return target.closest('.xterm, input, textarea, [contenteditable="true"], [contenteditable=""]') !== null;
  } catch {
    return false;
  }
}
