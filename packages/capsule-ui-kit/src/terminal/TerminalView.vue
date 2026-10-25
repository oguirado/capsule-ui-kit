<script>
/**
 * @file Stream view (`TerminalView.vue`) broker/display contract, non-reactive `StreamRegistry`,
 * security interceptors, staged paste composer, and G5 focus/refit lifecycle helpers.
 * Grounded in UI_ARCHITECTURE.md §§3, 4, 5, 6, 7, 8, 9, 10, 12, 13 and verified against
 * installed `@xterm/xterm version 6.0.0`, `@xterm/addon-fit version 0.11.0`, and `vue version 3.5.43` declarations.
 * Plain JavaScript with JSDoc; no authored TypeScript, no consumer imports.
 */

export const TERMINAL_VIEW_SCHEMA = 'capsule-ui-kit.terminal-view/v1';

export const TERMINAL_ERROR_CODES = Object.freeze({
  ERR_INVALID_IDENTITY: 'ERR_INVALID_IDENTITY',
  ERR_NUMERIC_INDEX_ID: 'ERR_NUMERIC_INDEX_ID',
  ERR_INVALID_INTEGER: 'ERR_INVALID_INTEGER',
  ERR_STALE_ATTACH: 'ERR_STALE_ATTACH',
  ERR_STALE_EPOCH: 'ERR_STALE_EPOCH',
  ERR_SEQUENCE_GAP: 'ERR_SEQUENCE_GAP',
  ERR_DISPOSED_SESSION: 'ERR_DISPOSED_SESSION',
  ERR_OUTPUT_BACKPRESSURE: 'ERR_OUTPUT_BACKPRESSURE',
  ERR_OUTPUT_TO_INPUT_REJECTED: 'ERR_OUTPUT_TO_INPUT_REJECTED',
  ERR_PROTOCOL_RESPONSE_NOT_HUMAN_INTENT: 'ERR_PROTOCOL_RESPONSE_NOT_HUMAN_INTENT',
  ERR_PLAYER_CONSOLE_INPUT_FORBIDDEN: 'ERR_PLAYER_CONSOLE_INPUT_FORBIDDEN',
  ERR_REPLAY_READ_ONLY: 'ERR_REPLAY_READ_ONLY',
  ERR_NOT_LIVE_ATTACHMENT: 'ERR_NOT_LIVE_ATTACHMENT',
  ERR_NO_CONTROL_LEASE: 'ERR_NO_CONTROL_LEASE',
  ERR_UNREVIEWED_ADDON: 'ERR_UNREVIEWED_ADDON',
  ERR_PROPOSED_API_FORBIDDEN: 'ERR_PROPOSED_API_FORBIDDEN',
  ERR_EMPTY_BOX_GEOMETRY: 'ERR_EMPTY_BOX_GEOMETRY',
  ERR_STALE_FOCUS_INTENT: 'ERR_STALE_FOCUS_INTENT',
  ERR_UNCONFIRMED_PASTE: 'ERR_UNCONFIRMED_PASTE'
});

export const ATTACHMENT_STATES = Object.freeze([
  'detached',
  'attaching',
  'restoring',
  'live',
  'disconnected'
]);

export const SESSION_ACTIVITY_STATES = Object.freeze([
  'unknown',
  'ready',
  'busy',
  'waiting-input',
  'waiting-permission',
  'exited',
  'failed'
]);

export const VIEW_RETENTION_STATES = Object.freeze([
  'live-view',
  'replay-view',
  'disposed'
]);

export const TERMINAL_MODES = Object.freeze(['structured', 'pty']);

const DEFAULT_MAX_SCROLLBACK_ROWS = 2000;
const DEFAULT_MAX_PENDING_OUTPUT_BYTES = 262144;
const DEFAULT_MAX_AGGREGATE_OUTPUT_BYTES = 2097152;
const DEFAULT_MAX_ACCESSIBLE_LINES = 200;

/**
 * Creates a coded error for deterministic gate assertions.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
export function createTerminalError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

/**
 * Validates an immutable identifier token (rejects empty strings, whitespace, and bare numeric list indices).
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
export function assertImmutableId(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createTerminalError(
      TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
      `${label} must be a non-empty string`
    );
  }
  if (value !== value.trim() || /\s/.test(value)) {
    throw createTerminalError(
      TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
      `${label} must not contain leading/trailing or internal whitespace: "${value}"`
    );
  }
  if (/^\d+$/.test(value)) {
    throw createTerminalError(
      TERMINAL_ERROR_CODES.ERR_NUMERIC_INDEX_ID,
      `${label} must use an immutable identity, never a bare numeric index or list length: "${value}"`
    );
  }
  return value;
}

/**
 * Validates a non-negative safe integer for epochs, generations, and byte sequences.
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
export function assertSafeNonNegativeInt(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw createTerminalError(
      TERMINAL_ERROR_CODES.ERR_INVALID_INTEGER,
      `${label} must be a non-negative safe integer`
    );
  }
  return value;
}

/**
 * Computes UTF-8 byte length of a string or Uint8Array chunk.
 * @param {string | Uint8Array} data
 * @returns {number}
 */
export function getChunkByteLength(data) {
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength;
  }
  throw createTerminalError(
    TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
    'Terminal chunk data must be a string or Uint8Array'
  );
}

/**
 * Detects whether a terminal data payload is a terminal-generated protocol response
 * (DA1/DA2/DA3, CPR, DSR, DECRQM, OSC color/selection report, DCS/XTGETTCAP report, or CSI window report).
 * UI_ARCHITECTURE.md §7 ("Terminal-generated protocol responses are separately inventoried, never classified as human intent").
 *
 * @param {unknown} data
 * @returns {boolean}
 */
export function isTerminalProtocolResponse(data) {
  if (typeof data !== 'string' || data.length === 0) {
    return false;
  }
  // Primary/Secondary/Tertiary Device Attributes: ESC [ ? ... c or ESC [ > ... c or ESC [ = ... c
  if (/^\x1b\[[?>=]?[0-9;]*c$/.test(data)) {
    return true;
  }
  // Cursor Position Report (CPR): ESC [ <row> ; <col> R or DECXCPR ESC [ ? <row> ; <col> R
  if (/^\x1b\[\??\d+;\d+(?:;\d+)?R$/.test(data)) {
    return true;
  }
  // Device Status Report (DSR): ESC [ 0 n, ESC [ 3 n, ESC [ ? ... n
  if (/^\x1b\[\??\d+(?:;\d+)*n$/.test(data)) {
    return true;
  }
  // DECRPM (Mode report): ESC [ ? <mode> ; <status> $ y
  if (/^\x1b\[\??\d+;\d+\$y$/.test(data)) {
    return true;
  }
  // CSI window manipulation report: ESC [ <ps> ; <h> ; <w> t
  if (/^\x1b\[\d+(?:;\d+)*t$/.test(data)) {
    return true;
  }
  // OSC response (e.g. OSC 4/10/11/12/52 color or query response terminated by BEL or ST)
  if (/^\x1b\]\d+;[\s\S]*(?:\x07|\x1b\\)$/.test(data)) {
    return true;
  }
  // DCS / XTGETTCAP / DECRQSS response: ESC P ... ESC \
  if (/^\x1bP[\s\S]*\x1b\\$/.test(data)) {
    return true;
  }
  return false;
}

/**
 * Inspects staged paste text for control characters, newlines, and bracketed-paste breakout attempts.
 * UI_ARCHITECTURE.md §7 ("Stage paste in a separate composer, expose control/newline content and require explicit Send; bracketed paste is compatibility, not authorization").
 *
 * @param {string} rawText
 * @returns {{
 *   rawText: string,
 *   byteLength: number,
 *   hasControlChars: boolean,
 *   hasNewlines: boolean,
 *   controlTokens: readonly string[],
 *   visualPreview: string,
 *   sanitizedPlainText: string,
 *   sanitizedBracketedText: string
 * }}
 */
export function inspectStagedPaste(rawText) {
  const text = typeof rawText === 'string' ? rawText : String(rawText ?? '');
  /** @type {string[]} */
  const tokens = [];
  let hasControlChars = false;
  let hasNewlines = false;
  let preview = '';

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code === 0x0d) {
      hasControlChars = true;
      hasNewlines = true;
      if (!tokens.includes('<CR>')) tokens.push('<CR>');
      preview += '<CR>';
    } else if (code === 0x0a) {
      hasControlChars = true;
      hasNewlines = true;
      if (!tokens.includes('<LF>')) tokens.push('<LF>');
      preview += '<LF>\n';
    } else if (code === 0x09) {
      if (!tokens.includes('<TAB>')) tokens.push('<TAB>');
      preview += '\t';
    } else if (code === 0x1b) {
      hasControlChars = true;
      if (!tokens.includes('<ESC>')) tokens.push('<ESC>');
      preview += '<ESC>';
    } else if (code === 0x03) {
      hasControlChars = true;
      if (!tokens.includes('<CTRL-C>')) tokens.push('<CTRL-C>');
      preview += '<CTRL-C>';
    } else if (code === 0x04) {
      hasControlChars = true;
      if (!tokens.includes('<CTRL-D>')) tokens.push('<CTRL-D>');
      preview += '<CTRL-D>';
    } else if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) {
      hasControlChars = true;
      const hex = `<0x${code.toString(16).toUpperCase().padStart(2, '0')}>`;
      if (!tokens.includes(hex)) tokens.push(hex);
      preview += hex;
    } else {
      preview += text[i];
    }
  }

  // Strip embedded bracketed-paste delimiters so untrusted clipboard text cannot close bracketed paste early
  const sanitizedPlainText = text.replace(/\x1b\[20[01]~/g, '');
  const sanitizedBracketedText = `\x1b[200~${sanitizedPlainText}\x1b[201~`;

  return Object.freeze({
    rawText: text,
    byteLength: getChunkByteLength(text),
    hasControlChars,
    hasNewlines,
    controlTokens: Object.freeze(tokens),
    visualPreview: preview,
    sanitizedPlainText,
    sanitizedBracketedText
  });
}

/**
 * Default repository-aligned `ITheme` fallback used when caller does not supply resolved design tokens.
 */
const DEFAULT_TERMINAL_THEME = Object.freeze({
  foreground: '#e5e7eb',
  background: '#0e1014',
  cursor: '#38bdf8',
  cursorAccent: '#0e1014',
  selectionBackground: 'rgba(56, 189, 248, 0.28)',
  selectionForeground: '#f8fafc',
  selectionInactiveBackground: 'rgba(148, 163, 184, 0.2)',
  scrollbarSliderBackground: 'rgba(148, 163, 184, 0.28)',
  scrollbarSliderHoverBackground: 'rgba(148, 163, 184, 0.44)',
  scrollbarSliderActiveBackground: 'rgba(148, 163, 184, 0.6)',
  overviewRulerBorder: '#1e293b',
  black: '#0e1014',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#64748b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc'
});

/**
 * Builds verified `@xterm/xterm version 6.0.0` `ITerminalOptions & ITerminalInitOnlyOptions`.
 * Note: `ITerminalOptions.cursor` is AUSENTE in `typings/xterm.d.ts`; individual `cursorBlink`,
 * `cursorStyle`, `cursorWidth`, and `cursorInactiveStyle` properties are used instead.
 *
 * @param {Object} [config]
 * @param {'structured' | 'pty'} [config.mode]
 * @param {'detached' | 'attaching' | 'restoring' | 'live' | 'disconnected'} [config.attachmentState]
 * @param {'live-view' | 'replay-view' | 'disposed'} [config.viewRetention]
 * @param {boolean} [config.hasControlLease]
 * @param {boolean} [config.focused]
 * @param {boolean} [config.reducedMotion]
 * @param {boolean} [config.cIdleGate]
 * @param {'normal' | 'high'} [config.contrast]
 * @param {Record<string, string>} [config.theme]
 * @param {number} [config.cols]
 * @param {number} [config.rows]
 * @param {number} [config.scrollback]
 * @param {string} [config.fontFamily]
 * @param {number} [config.fontSize]
 * @param {number} [config.lineHeight]
 * @param {boolean} [config.allowProposedApi]
 * @param {(url: string) => void} [config.onInspectSafeLink]
 * @returns {Record<string, any>}
 */
export function buildTerminalOptions(config = {}) {
  if (config.allowProposedApi === true) {
    throw createTerminalError(
      TERMINAL_ERROR_CODES.ERR_PROPOSED_API_FORBIDDEN,
      'allowProposedApi must remain false; experimental xterm APIs are forbidden'
    );
  }

  const mode = config.mode ?? 'structured';
  const attachmentState = config.attachmentState ?? 'detached';
  const viewRetention = config.viewRetention ?? 'live-view';
  const hasControlLease = config.hasControlLease === true;
  const focused = config.focused === true;
  const reducedMotion = config.reducedMotion === true;
  const cIdleGate = config.cIdleGate === true;
  const contrast = config.contrast === 'high' ? 'high' : 'normal';

  const canEnableStdin =
    mode === 'pty' &&
    attachmentState === 'live' &&
    viewRetention === 'live-view' &&
    hasControlLease;

  const convertEol = mode === 'structured' || viewRetention === 'replay-view';
  const cursorBlink = focused && !reducedMotion && !cIdleGate && canEnableStdin;
  const cursorInactiveStyle = canEnableStdin ? 'outline' : 'none';

  // Always clone theme to a fresh object reference as required by xterm.d.ts:878-911
  const resolvedTheme = {
    ...DEFAULT_TERMINAL_THEME,
    ...(config.theme && typeof config.theme === 'object' ? config.theme : {})
  };

  return {
    cols: typeof config.cols === 'number' && config.cols > 0 ? Math.round(config.cols) : 80,
    rows: typeof config.rows === 'number' && config.rows > 0 ? Math.round(config.rows) : 24,
    allowProposedApi: false,
    convertEol,
    disableStdin: !canEnableStdin,
    screenReaderMode: true,
    cursorBlink,
    cursorStyle: 'block',
    cursorWidth: 2,
    cursorInactiveStyle,
    altClickMovesCursor: false,
    reflowCursorLine: false,
    fontFamily: config.fontFamily ?? 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: typeof config.fontSize === 'number' ? config.fontSize : 13,
    fontWeight: '400',
    fontWeightBold: '700',
    letterSpacing: 0,
    lineHeight: typeof config.lineHeight === 'number' ? config.lineHeight : 1.35,
    scrollback: Math.min(
      typeof config.scrollback === 'number' && config.scrollback >= 0
        ? config.scrollback
        : DEFAULT_MAX_SCROLLBACK_ROWS,
      DEFAULT_MAX_SCROLLBACK_ROWS
    ),
    scrollOnEraseInDisplay: false,
    scrollOnUserInput: true,
    smoothScrollDuration: 0,
    allowTransparency: false,
    minimumContrastRatio: contrast === 'high' ? 7 : 4.5,
    theme: resolvedTheme,
    rightClickSelectsWord: false,
    ignoreBracketedPasteMode: false,
    windowOptions: {},
    linkHandler: {
      allowNonHttpProtocols: false,
      /** @param {MouseEvent} _event @param {string} text */
      activate(_event, text) {
        if (typeof text === 'string' && /^https?:\/\//i.test(text)) {
          if (typeof config.onInspectSafeLink === 'function') {
            config.onInspectSafeLink(text);
          }
        }
      },
      hover() {},
      leave() {}
    }
  };
}

/**
 * Trailing debounce applied to container resize bursts before xterm fit.
 */
export const TERMINAL_FIT_DEBOUNCE_MS = 80;

/**
 * Creates a debounced fit gate: container rects are rounded to whole pixels
 * (sub-pixel changes never schedule), sterile (zero-area) frames are dropped,
 * and the latest distinct rect syncs once the burst settles, on an animation
 * frame. Timers are injectable for deterministic tests.
 *
 * @param {{ setTimeoutFn?: any, clearTimeoutFn?: any, rafFn?: any, debounceMs?: number }} [options]
 * @returns {{ request: (rect: any, sync: (rect: any) => void) => string, cancel: () => void, dispose: () => void }}
 */
export function createFitGate(options = {}) {
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const rafFn = options.rafFn
    ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (/** @type {() => void} */ cb) => setTimeout(cb, 16));
  const waitMs = typeof options.debounceMs === 'number' && options.debounceMs >= 0
    ? options.debounceMs
    : TERMINAL_FIT_DEBOUNCE_MS;
  /** @type {any} */
  let timer;
  /** @type {any} */
  let frame;
  let lastKey = '';
  /** @param {any} rect */
  function keyOf(rect) {
    if (!rect || typeof rect.width !== 'number' || typeof rect.height !== 'number') return '';
    return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }
  function cancel() {
    if (timer !== undefined) { clearTimeoutFn(timer); timer = undefined; }
    if (frame !== undefined && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
  }
  return {
    /**
     * @param {any} rect Container rect.
     * @param {(rect: any) => void} sync Sync callback.
     * @returns {string} `scheduled`, `ignored` (sub-pixel repeat) or `sterile`.
     */
    request(rect, sync) {
      if (!rect || rect.width <= 0 || rect.height <= 0 || typeof sync !== 'function') return 'sterile';
      const key = keyOf(rect);
      if (key === lastKey) return 'ignored';
      cancel();
      timer = setTimeoutFn(() => {
        timer = undefined;
        lastKey = key;
        frame = rafFn(() => { frame = undefined; sync(rect); });
      }, waitMs);
      return 'scheduled';
    },
    cancel,
    dispose() { cancel(); lastKey = ''; }
  };
}

/**
 * Extracts plain-text lines from `terminal.buffer.active` using `getLine(y)?.translateToString(true)`
 * while joining wrapped lines (`isWrapped`) for the browsable `output/{sid}/text` region.
 * Note: Built-in full-buffer serializer is AUSENTE in `@xterm/xterm version 6.0.0`.
 *
 * @param {any} terminal
 * @param {{ maxLines?: number }} [options]
 * @returns {string}
 */
export function extractAccessibleBufferText(terminal, options = {}) {
  const active = terminal?.buffer?.active;
  if (!active || typeof active.getLine !== 'function') {
    return '';
  }
  const totalLines = typeof active.length === 'number' ? active.length : 0;
  if (totalLines <= 0) {
    return '';
  }
  const maxLines = options.maxLines ?? DEFAULT_MAX_ACCESSIBLE_LINES;
  const startLine = Math.max(0, totalLines - maxLines);
  const logicalLines = [];

  for (let y = startLine; y < totalLines; y += 1) {
    const line = active.getLine(y);
    if (!line || typeof line.translateToString !== 'function') {
      continue;
    }
    const text = line.translateToString(true);
    if (line.isWrapped && logicalLines.length > 0) {
      logicalLines[logicalLines.length - 1] += text;
    } else {
      logicalLines.push(text);
    }
  }

  return logicalLines.join('\n').trimEnd();
}

/**
 * Builds the UI_ARCHITECTURE.md §9 semantic control inventory rows owned by `TerminalView.vue`:
 * - `output/{sid}/text` (region / Accessible output)
 * - `session/{sid}/{attach,stop,replay,target}` (button / full operation and session)
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {string} params.sessionTitle
 * @param {string} params.presentationInstance
 * @param {number} params.epoch
 * @param {number} [params.generation]
 * @param {boolean} [params.visible]
 * @param {boolean} [params.folded]
 * @param {'detached' | 'attaching' | 'restoring' | 'live' | 'disconnected'} [params.attachmentState]
 * @param {'unknown' | 'ready' | 'busy' | 'waiting-input' | 'waiting-permission' | 'exited' | 'failed'} [params.activityState]
 * @param {'live-view' | 'replay-view' | 'disposed'} [params.viewRetention]
 * @param {Record<string, { x: number, y: number, width: number, height: number } | null>} [params.boxes]
 * @returns {readonly Record<string, any>[]}
 */
export function buildTerminalSemanticControls(params) {
  const sid = assertImmutableId(params.sessionId, 'sessionId');
  const title = typeof params.sessionTitle === 'string' && params.sessionTitle.trim().length > 0
    ? params.sessionTitle.trim()
    : sid;
  const presentationInstance = assertImmutableId(
    params.presentationInstance ?? 'terminal-view-default',
    'presentationInstance'
  );
  const epoch = assertSafeNonNegativeInt(params.epoch ?? 0, 'epoch');
  const generation = assertSafeNonNegativeInt(params.generation ?? 0, 'generation');
  const visible = params.visible === true && params.folded !== true && params.viewRetention !== 'disposed';
  const attachmentState = params.attachmentState ?? 'detached';
  const activityState = params.activityState ?? 'unknown';
  const viewRetention = params.viewRetention ?? 'live-view';
  const boxes = params.boxes ?? {};

  /**
   * @param {string} key
   */
  const resolveBox = (key) => {
    if (!visible) return null;
    const raw = boxes[key];
    if (!raw || raw.width <= 0 || raw.height <= 0) return null;
    return Object.freeze({
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width: Math.round(raw.width),
      height: Math.round(raw.height)
    });
  };

  return Object.freeze([
    Object.freeze({
      semanticAnchor: `output/${sid}/text`,
      entityId: sid,
      presentationInstance,
      controlSlot: 'output-text',
      role: 'region',
      accessibleName: `Accessible output for ${title}`,
      state: Object.freeze({
        browsable: true,
        attachmentState,
        viewRetention
      }),
      visible,
      materialized: visible,
      inDom: params.viewRetention !== 'disposed',
      synthetic: false,
      coordinateSpace: 'content-window',
      box: resolveBox('output'),
      epoch,
      generation
    }),
    Object.freeze({
      semanticAnchor: `session/${sid}/attach`,
      entityId: sid,
      presentationInstance,
      controlSlot: 'session-attach',
      role: 'button',
      accessibleName: `Attach session ${title}`,
      state: Object.freeze({
        disabled: attachmentState === 'live' || viewRetention === 'disposed',
        attachmentState
      }),
      visible,
      materialized: visible,
      inDom: params.viewRetention !== 'disposed',
      synthetic: false,
      coordinateSpace: 'content-window',
      box: resolveBox('attach'),
      epoch,
      generation
    }),
    Object.freeze({
      semanticAnchor: `session/${sid}/stop`,
      entityId: sid,
      presentationInstance,
      controlSlot: 'session-stop',
      role: 'button',
      accessibleName: `Stop session ${title}`,
      state: Object.freeze({
        disabled: activityState === 'exited' || activityState === 'failed' || viewRetention === 'replay-view',
        activityState
      }),
      visible,
      materialized: visible,
      inDom: params.viewRetention !== 'disposed',
      synthetic: false,
      coordinateSpace: 'content-window',
      box: resolveBox('stop'),
      epoch,
      generation
    }),
    Object.freeze({
      semanticAnchor: `session/${sid}/replay`,
      entityId: sid,
      presentationInstance,
      controlSlot: 'session-replay',
      role: 'button',
      accessibleName: `Replay session ${title}`,
      state: Object.freeze({
        pressed: viewRetention === 'replay-view',
        disabled: viewRetention === 'disposed',
        viewRetention
      }),
      visible,
      materialized: visible,
      inDom: params.viewRetention !== 'disposed',
      synthetic: false,
      coordinateSpace: 'content-window',
      box: resolveBox('replay'),
      epoch,
      generation
    }),
    Object.freeze({
      semanticAnchor: `session/${sid}/target`,
      entityId: sid,
      presentationInstance,
      controlSlot: 'session-target',
      role: 'button',
      accessibleName: `Select target session ${title}`,
      state: Object.freeze({
        disabled: !(activityState === 'ready' || activityState === 'waiting-input') || attachmentState !== 'live',
        activityState,
        attachmentState
      }),
      visible,
      materialized: visible,
      inDom: params.viewRetention !== 'disposed',
      synthetic: false,
      coordinateSpace: 'content-window',
      box: resolveBox('target'),
      epoch,
      generation
    })
  ]);
}

/**
 * Fallback headless terminal stub used only when `@xterm/xterm` is not injected or running in headless Node tests.
 */
class DefaultHeadlessTerminal {
  /** @param {{rows?:number,cols?:number}} [options] */
  constructor(options = {}) {
    this.options = { ...options };
    this.rows = options.rows ?? 24;
    this.cols = options.cols ?? 80;
    /** @type {HTMLElement|undefined} */
    this.element = undefined;
    /** @type {HTMLTextAreaElement|undefined} */
    this.textarea = undefined;
    this.modes = {bracketedPasteMode:false};
    /** @type {string[]} */
    this._lines = [];
    /** @type {Set<()=>void>} */
    this._writeParsedListeners = new Set();
    this.parser = {
      registerOscHandler: () => ({ dispose() {} }),
      registerCsiHandler: () => ({ dispose() {} })
    };
    const self = this;
    this.buffer = {
      active: {
        type: 'normal',
        cursorY: 0,
        cursorX: 0,
        viewportY: 0,
        baseY: 0,
        get length() {
          return self._lines.length;
        },
        /** @param {number} y */
        getLine(y) {
          const text = self._lines[y];
          if (typeof text !== 'string') return undefined;
          return {
            isWrapped: false,
            length: text.length,
            translateToString(trimRight = false) {
              return trimRight ? text.replace(/\s+$/, '') : text;
            }
          };
        }
      }
    };
  }
  /** @param {HTMLElement} el */
  open(el) {
    this.element = el;
  }
  /** @param {{activate?:(term:DefaultHeadlessTerminal)=>void}} addon */
  loadAddon(addon) {
    if (addon && typeof addon.activate === 'function') addon.activate(this);
  }
  attachCustomKeyEventHandler() {}
  onData() {
    return { dispose() {} };
  }
  onBinary() {
    return { dispose() {} };
  }
  onResize() {
    return { dispose() {} };
  }
  /** @param {()=>void} cb */
  onWriteParsed(cb) {
    this._writeParsedListeners.add(cb);
    return {
      dispose: () => this._writeParsedListeners.delete(cb)
    };
  }
  onTitleChange() {
    return { dispose() {} };
  }
  /** @param {string|Uint8Array} data @param {()=>void} [cb] */
  write(data, cb) {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    for (const line of str.split(/\r?\n/)) {
      if (line.length > 0) this._lines.push(line);
    }
    if (typeof cb === 'function') cb();
    for (const listener of this._writeParsedListeners) listener();
  }
  /** @param {number} cols @param {number} rows */
  resize(cols, rows) {
    this.cols = cols;
    this.rows = rows;
  }
  reset() {
    /** @type {string[]} */
    this._lines = [];
  }
  clear() {
    /** @type {string[]} */
    this._lines = [];
  }
  focus() {}
  blur() {}
  dispose() {}
}

class DefaultHeadlessFitAddon {
  /** @param {DefaultHeadlessTerminal} term */
  activate(term) {
    this.terminal = term;
  }
  proposeDimensions() {
    return { cols: 80, rows: 24 };
  }
  fit() {}
  dispose() {}
}

/**
 * Creates the non-reactive `StreamRegistry` service (`UI_ARCHITECTURE.md` §4, §6, §7, §10).
 * Stamped with `__v_skip: true` (`ReactiveFlags.SKIP`) so Vue never converts the registry or its
 * `Terminal` / `FitAddon` / writer handles into reactive proxies.
 *
 * @param {Object} [options]
 * @param {any} [options.TerminalClass]
 * @param {any} [options.FitAddonClass]
 * @param {number} [options.maxPendingOutputBytesPerSession]
 * @param {number} [options.maxAggregateOutputBytes]
 * @param {(ack: { sessionId: string, epoch: number, attachmentId: string, acknowledgedSeq: number, creditBytes: number }) => void} [options.onAckOutput]
 * @param {(evt: { sessionId: string, epoch: number, attachmentId: string | null, expectedSeq: number, receivedSeq: number, reason: string }) => void} [options.onResyncRequired]
 * @param {(payload: { sessionId: string, epoch: number, attachmentId: string, inputSeq: number, data: string }) => void} [options.onSendAuthorizedPtyInput]
 * @param {(evt: { sessionId: string, epoch: number, attachmentId: string | null, cols: number, rows: number }) => void} [options.onResizePty]
 * @param {(sessionId: string, text: string) => void} [options.onAccessibleTextUpdated]
 * @param {(cb: () => void) => any} [options.requestAnimationFrameFn]
 * @param {(cb: () => void, ms: number) => any} [options.setTimeoutFn]
 * @param {(handle: any) => void} [options.clearTimeoutFn]
 */
export function createStreamRegistry(options = {}) {
  const TerminalClass = options.TerminalClass ?? DefaultHeadlessTerminal;
  const FitAddonClass = options.FitAddonClass ?? DefaultHeadlessFitAddon;
  const maxPendingPerSession =
    options.maxPendingOutputBytesPerSession ?? DEFAULT_MAX_PENDING_OUTPUT_BYTES;
  const maxAggregateBytes =
    options.maxAggregateOutputBytes ?? DEFAULT_MAX_AGGREGATE_OUTPUT_BYTES;
  const rafFn =
    options.requestAnimationFrameFn ??
    (typeof requestAnimationFrame === 'function'
      ? (/** @type {()=>void} */ cb) => requestAnimationFrame(cb)
      : (/** @type {()=>void} */ cb) => setTimeout(cb, 16));
  const setTimeoutFn = options.setTimeoutFn ?? ((/** @type {()=>void} */ cb, /** @type {number} */ ms) => setTimeout(cb, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((/** @type {ReturnType<typeof setTimeout>} */ id) => clearTimeout(id));

  /** @type {Map<string, any>} */
  const sessions = new Map();
  let aggregatePendingBytes = 0;

  /**
   * Synchronizes `terminal.options.disableStdin` and cursor styles with current session state.
   * @param {any} record
   */
  function syncInputGate(record) {
    const canInput =
      record.mode === 'pty' &&
      record.attachmentState === 'live' &&
      record.viewRetention === 'live-view' &&
      record.hasControlLease === true &&
      record.folded === false;

    record.terminal.options.disableStdin = !canInput;
    record.terminal.options.cursorBlink =
      canInput && record.focused && !record.reducedMotion && !record.cIdleGate;
    record.terminal.options.cursorInactiveStyle = canInput ? 'outline' : 'none';
  }

  /**
   * Cancels all pending focus retry and refit timers for a session.
   * @param {any} record
   */
  function cancelTimers(record) {
    for (const timer of record._focusTimers) {
      clearTimeoutFn(timer);
    }
    record._focusTimers.length = 0;
    record.activeFocusIntentId = null;

    for (const timer of record._refitTimers) {
      clearTimeoutFn(timer);
    }
    record._refitTimers.length = 0;
  }

  /**
   * Disposes event listeners registered on the underlying `Terminal` instance.
   * @param {any} record
   */
  function disposeTerminalListeners(record) {
    for (const disp of record._disposables) {
      if (disp && typeof disp.dispose === 'function') {
        disp.dispose();
      }
    }
    record._disposables.length = 0;
  }

  /**
   * Enqueues a verified contiguous write to `terminal.write(chunk, callback)` and emits cumulative ACK only on parse completion.
   * @param {any} record
   * @param {string | Uint8Array} data
   * @param {number} endSeq
   * @param {boolean} isRestoreStep
   */
  function enqueueVerifiedWrite(record, data, endSeq, isRestoreStep) {
    const byteLength = getChunkByteLength(data);
    if (
      record.pendingOutputBytes + byteLength > maxPendingPerSession ||
      aggregatePendingBytes + byteLength > maxAggregateBytes
    ) {
      throw createTerminalError(
        TERMINAL_ERROR_CODES.ERR_OUTPUT_BACKPRESSURE,
        `Output backpressure watermark exceeded for session "${record.sessionId}"`
      );
    }

    record.pendingOutputBytes += byteLength;
    aggregatePendingBytes += byteLength;
    if (isRestoreStep) {
      record.pendingRestoreWrites += 1;
    }

    const expectedEpoch = record.epoch;
    const expectedAttachmentId = record.attachmentId;

    record.writingOutputDepth += 1;
    try {
      record.terminal.write(data, () => {
        record.pendingOutputBytes = Math.max(0, record.pendingOutputBytes - byteLength);
        aggregatePendingBytes = Math.max(0, aggregatePendingBytes - byteLength);

        // Ignore stale callback if epoch or attachment changed while parser was working
        if (
          record.viewRetention === 'disposed' ||
          record.epoch !== expectedEpoch ||
          record.attachmentId !== expectedAttachmentId
        ) {
          return;
        }

        if (endSeq > record.acknowledgedOutSeq) {
          record.acknowledgedOutSeq = endSeq;
        }

        if (isRestoreStep && record.pendingRestoreWrites > 0) {
          record.pendingRestoreWrites -= 1;
          if (record.pendingRestoreWrites === 0 && record.attachmentState === 'restoring') {
            record.attachmentState = 'live';
            syncInputGate(record);
          }
        }

        record.accessibleText = extractAccessibleBufferText(record.terminal);
        if (typeof options.onAccessibleTextUpdated === 'function') {
          options.onAccessibleTextUpdated(record.sessionId, record.accessibleText);
        }

        if (typeof options.onAckOutput === 'function') {
          options.onAckOutput({
            sessionId: record.sessionId,
            epoch: record.epoch,
            attachmentId: record.attachmentId,
            acknowledgedSeq: record.acknowledgedOutSeq,
            creditBytes: Math.max(0, maxPendingPerSession - record.pendingOutputBytes)
          });
        }
      });
    } finally {
      record.writingOutputDepth -= 1;
    }
  }

  /**
   * Forces session into resync state on sequence gap (`UI_ARCHITECTURE.md:195, 264`).
   * @param {any} record
   * @param {number} expectedSeq
   * @param {number} receivedSeq
   * @param {string} reason
   */
  function triggerGapResync(record, expectedSeq, receivedSeq, reason) {
    record.attachmentState = 'attaching';
    record.restoreBuffer.length = 0;
    record.pendingRestoreWrites = 0;
    syncInputGate(record);
    if (typeof options.onResyncRequired === 'function') {
      options.onResyncRequired({
        sessionId: record.sessionId,
        epoch: record.epoch,
        attachmentId: record.attachmentId,
        expectedSeq,
        receivedSeq,
        reason
      });
    }
  }

  /**
   * Look up an existing session record or throw.
   * @param {string} sessionId
   */
  function requireSession(sessionId) {
    const id = assertImmutableId(sessionId, 'sessionId');
    const record = sessions.get(id);
    if (!record) {
      throw createTerminalError(
        TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
        `Unknown terminal session "${id}"`
      );
    }
    if (record.viewRetention === 'disposed') {
      throw createTerminalError(
        TERMINAL_ERROR_CODES.ERR_DISPOSED_SESSION,
        `Terminal session "${id}" has already been disposed`
      );
    }
    return record;
  }

  const registry = {
    __v_skip: true,

    /**
     * Creates and registers a non-reactive terminal session record.
     * Mounting a panel never spawns a backend PTY process (`UI_ARCHITECTURE.md` §6).
     *
     * @param {Object} config
     * @param {string} config.sessionId
     * @param {string} config.capsuleId
     * @param {string} [config.slotId]
     * @param {number} [config.generation]
     * @param {number} config.epoch
     * @param {'structured' | 'pty'} [config.mode]
     * @param {boolean} [config.hasControlLease]
     * @param {'unknown' | 'ready' | 'busy' | 'waiting-input' | 'waiting-permission' | 'exited' | 'failed'} [config.activityState]
     * @param {Record<string, string>} [config.theme]
     * @param {'normal' | 'high'} [config.contrast]
     * @param {boolean} [config.cIdleGate]
     * @param {boolean} [config.reducedMotion]
     */
    createSession(config) {
      const sessionId = assertImmutableId(config.sessionId, 'sessionId');
      const capsuleId = assertImmutableId(config.capsuleId, 'capsuleId');
      const slotId = config.slotId ? assertImmutableId(config.slotId, 'slotId') : `slot-${sessionId}`;
      const epoch = assertSafeNonNegativeInt(config.epoch, 'epoch');
      const generation = assertSafeNonNegativeInt(config.generation ?? 0, 'generation');
      const mode = config.mode === 'pty' ? 'pty' : 'structured';
      if (!TERMINAL_MODES.includes(mode)) {
        throw createTerminalError(TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY, `Invalid mode: ${mode}`);
      }
      const activityState = config.activityState ?? 'unknown';
      if (!SESSION_ACTIVITY_STATES.includes(activityState)) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
          `Invalid activityState: ${activityState}`
        );
      }

      /** @type {string[]} */
      const inspectedLinks = [];
      const termOptions = buildTerminalOptions({
        mode,
        attachmentState: 'detached',
        viewRetention: 'live-view',
        hasControlLease: Boolean(config.hasControlLease),
        focused: false,
        reducedMotion: Boolean(config.reducedMotion),
        contrast: config.contrast ?? 'normal',
        theme: config.theme,
        onInspectSafeLink: (url) => {
          inspectedLinks.push(url);
        }
      });

      const terminal = new TerminalClass(termOptions);
      const fitAddon = new FitAddonClass();
      terminal.loadAddon(fitAddon);

      const record = {
        __v_skip: true,
        sessionId,
        capsuleId,
        slotId,
        generation,
        epoch,
        attachmentId: null,
        mode,
        attachmentState: 'detached',
        activityState,
        viewRetention: 'live-view',
        hasControlLease: Boolean(config.hasControlLease),
        folded: false,
        focused: false,
        reducedMotion: Boolean(config.reducedMotion),
        cIdleGate: Boolean(config.cIdleGate),
        contrast: config.contrast === 'high' ? 'high' : 'normal',
        terminal,
        fitAddon,
        nextExpectedOutSeq: 0,
        acknowledgedOutSeq: 0,
        inputSeq: 0,
        pendingOutputBytes: 0,
        pendingRestoreWrites: 0,
        writingOutputDepth: 0,
        rejectedOutputToInputCount: 0,
        blockedOsc52Count: 0,
        lastUntrustedTitle: /** @type {string|null} */ (null),
        accessibleText: '',
        stagedPaste: null,
        inspectedLinks,
        protocolResponseInventory: /** @type {Array<{epoch:number,data:string}>} */ ([]),
        restoreBuffer: /** @type {Array<{epoch:number,startSeq:number,endSeq:number,data:string}>} */ ([]),
        activeFocusIntentId: null,
        _disposables: /** @type {Array<{dispose:()=>void}>} */ ([]),
        _focusTimers: /** @type {any[]} */ ([]),
        _refitTimers: []
      };

      // Block OSC 52 clipboard reads/writes unconditionally (ar_p_xterm/PACK.md §8.2)
      if (terminal.parser && typeof terminal.parser.registerOscHandler === 'function') {
        record._disposables.push(
          terminal.parser.registerOscHandler(52, () => {
            record.blockedOsc52Count += 1;
            return true;
          })
        );
      }

      // Neutralize OSC 0/2 title changes: record as untrusted display metadata only, never alter activityState
      if (typeof terminal.onTitleChange === 'function') {
        record._disposables.push(
          terminal.onTitleChange((/** @type {string} */ title) => {
            record.lastUntrustedTitle = typeof title === 'string' ? title.slice(0, 256) : '';
          })
        );
      }

      // Wire xterm onData with strict output->input and protocol-response guards
      if (typeof terminal.onData === 'function') {
        record._disposables.push(
          terminal.onData((/** @type {string} */ data) => {
            if (record.writingOutputDepth > 0) {
              record.rejectedOutputToInputCount += 1;
              if (isTerminalProtocolResponse(data)) {
                record.protocolResponseInventory.push({
                  epoch: record.epoch,
                  data
                });
              }
              return;
            }
            if (isTerminalProtocolResponse(data)) {
              record.protocolResponseInventory.push({
                epoch: record.epoch,
                data
              });
              record.rejectedOutputToInputCount += 1;
              return;
            }
            try {
              registry.submitTerminalInput({
                sessionId: record.sessionId,
                epoch: record.epoch,
                attachmentId: record.attachmentId ?? '',
                data,
                wasUserInput: true,
                source: 'user'
              });
            } catch {
              record.rejectedOutputToInputCount += 1;
            }
          })
        );
      }

      // Keep Ctrl+C and terminal keys inside terminal without bubbling into workspace shortcuts
      if (typeof terminal.attachCustomKeyEventHandler === 'function') {
        terminal.attachCustomKeyEventHandler((/** @type {KeyboardEvent} */ event) => {
          if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
          return true;
        });
      }

      sessions.set(sessionId, record);
      return record;
    },

    /**
     * Rejects loading any unreviewed addon outside the commissioned `@xterm/addon-fit`.
     * @param {string} sessionId
     * @param {any} _addon
     */
    loadSessionAddon(sessionId, _addon) {
      requireSession(sessionId);
      throw createTerminalError(
        TERMINAL_ERROR_CODES.ERR_UNREVIEWED_ADDON,
        'Unreviewed xterm addons are forbidden; only commissioned FitAddon is permitted'
      );
    },

    /**
     * Begins an epoch-bound attachment (`detached | disconnected -> attaching`).
     * Rejects stale epochs (`epoch < session.epoch`).
     *
     * @param {{ sessionId: string, epoch: number, attachmentId: string }} params
     */
    beginAttach(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      const attachmentId = assertImmutableId(params.attachmentId, 'attachmentId');

      if (epoch < record.epoch) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_ATTACH,
          `Stale attach epoch ${epoch} < current epoch ${record.epoch}`
        );
      }

      record.epoch = epoch;
      record.attachmentId = attachmentId;
      record.attachmentState = 'attaching';
      record.restoreBuffer.length = 0;
      record.pendingRestoreWrites = 0;
      syncInputGate(record);

      return {
        sessionId: record.sessionId,
        epoch: record.epoch,
        attachmentId: record.attachmentId,
        attachmentState: record.attachmentState
      };
    },

    /**
     * Applies the consistent restore snapshot up to `snapshotCursorSeq`, replays any contiguous buffered
     * tail events, and transitions to `live` once the xterm parser finishes consuming them.
     *
     * @param {{
     *   sessionId: string,
     *   epoch: number,
     *   attachmentId: string,
     *   snapshotCursorSeq: number,
     *   snapshotData: string | Uint8Array
     * }} params
     */
    applyRestoreSnapshot(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      const attachmentId = assertImmutableId(params.attachmentId, 'attachmentId');
      const snapshotCursorSeq = assertSafeNonNegativeInt(
        params.snapshotCursorSeq,
        'snapshotCursorSeq'
      );

      if (
        epoch !== record.epoch ||
        attachmentId !== record.attachmentId ||
        (record.attachmentState !== 'attaching' && record.attachmentState !== 'restoring')
      ) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_ATTACH,
          `Snapshot restore rejected: mismatched epoch/attachmentId or invalid state "${record.attachmentState}"`
        );
      }

      record.terminal.reset();
      record.attachmentState = 'restoring';
      record.nextExpectedOutSeq = snapshotCursorSeq;
      record.acknowledgedOutSeq = 0;
      record.pendingRestoreWrites = 0;
      syncInputGate(record);

      // Sort buffered tail chunks by startSeq and verify contiguous cut from snapshotCursorSeq
      const sortedTail = [...record.restoreBuffer].sort((a, b) => a.startSeq - b.startSeq);
      record.restoreBuffer.length = 0;

      const tailToWrite = [];
      let cursor = snapshotCursorSeq;
      for (const chunk of sortedTail) {
        if (chunk.endSeq <= cursor) {
          continue;
        }
        if (chunk.startSeq > cursor) {
          triggerGapResync(record, cursor, chunk.startSeq, 'restore_tail_gap');
          throw createTerminalError(
            TERMINAL_ERROR_CODES.ERR_SEQUENCE_GAP,
            `Sequence gap in buffered restore tail: expected ${cursor}, got ${chunk.startSeq}`
          );
        }
        tailToWrite.push(chunk);
        cursor = chunk.endSeq;
      }
      record.nextExpectedOutSeq = cursor;

      const hasSnapshotBytes = getChunkByteLength(params.snapshotData) > 0;
      if (!hasSnapshotBytes && tailToWrite.length === 0) {
        record.acknowledgedOutSeq = snapshotCursorSeq;
        record.attachmentState = 'live';
        syncInputGate(record);
      } else {
        if (hasSnapshotBytes || tailToWrite.length === 0) {
          enqueueVerifiedWrite(record, params.snapshotData, snapshotCursorSeq, true);
        }
        for (const chunk of tailToWrite) {
          enqueueVerifiedWrite(record, chunk.data, chunk.endSeq, true);
        }
      }

      return {
        sessionId: record.sessionId,
        epoch: record.epoch,
        attachmentId: record.attachmentId,
        attachmentState: record.attachmentState,
        nextExpectedOutSeq: record.nextExpectedOutSeq
      };
    },

    /**
     * Writes an arriving output chunk to the per-session non-reactive writer (`UI_ARCHITECTURE.md:195, 264`).
     * Rejects stale epoch or attachmentId (`ERR_STALE_ATTACH`) and forces resync on sequence gaps (`ERR_SEQUENCE_GAP`).
     *
     * @param {{
     *   sessionId: string,
     *   epoch: number,
     *   attachmentId: string,
     *   startSeq: number,
     *   endSeq: number,
     *   data: string | Uint8Array
     * }} params
     */
    writeOutputChunk(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      const attachmentId = assertImmutableId(params.attachmentId, 'attachmentId');
      const startSeq = assertSafeNonNegativeInt(params.startSeq, 'startSeq');
      const endSeq = assertSafeNonNegativeInt(params.endSeq, 'endSeq');

      if (endSeq < startSeq) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_INVALID_INTEGER,
          `endSeq (${endSeq}) must be >= startSeq (${startSeq})`
        );
      }

      if (epoch !== record.epoch || attachmentId !== record.attachmentId) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_ATTACH,
          `Rejected output chunk for stale attachment/epoch (${epoch}/${attachmentId})`
        );
      }

      if (record.attachmentState === 'attaching') {
        const byteLength = getChunkByteLength(params.data);
        if (record.pendingOutputBytes + byteLength > maxPendingPerSession) {
          throw createTerminalError(
            TERMINAL_ERROR_CODES.ERR_OUTPUT_BACKPRESSURE,
            `Pre-restore tail buffer overflow for session "${record.sessionId}"`
          );
        }
        record.restoreBuffer.push({
          startSeq,
          endSeq,
          data: params.data
        });
        return { bufferedForRestore: true, nextExpectedOutSeq: record.nextExpectedOutSeq };
      }

      if (record.attachmentState !== 'restoring' && record.attachmentState !== 'live') {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_ATTACH,
          `Cannot write output in attachment state "${record.attachmentState}"`
        );
      }

      // Idempotent duplicate of already-accepted prefix
      if (endSeq <= record.nextExpectedOutSeq) {
        return { duplicateIgnored: true, nextExpectedOutSeq: record.nextExpectedOutSeq };
      }

      // Sequence gap: never skip VT bytes and continue
      if (startSeq > record.nextExpectedOutSeq) {
        const expected = record.nextExpectedOutSeq;
        triggerGapResync(record, expected, startSeq, 'live_stream_gap');
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_SEQUENCE_GAP,
          `Output sequence gap on "${record.sessionId}": expected ${expected}, received ${startSeq}`
        );
      }

      record.nextExpectedOutSeq = endSeq;
      const isRestore = record.attachmentState === 'restoring';
      enqueueVerifiedWrite(record, params.data, endSeq, isRestore);

      return {
        bufferedForRestore: false,
        nextExpectedOutSeq: record.nextExpectedOutSeq
      };
    },

    /**
     * Submits human terminal input to the narrow PTY preload boundary after verifying:
     * 1. Not triggered synchronously by output parsing (`writingOutputDepth === 0`, `source !== 'output'`, `wasUserInput === true`).
     * 2. Not a terminal-generated protocol response (DA1/CPR/DSR/OSC/DCS).
     * 3. Session is in authorized `'pty'` mode, `'live-view'`, `'live'` attachment, with active human control lease and matching `(epoch, attachmentId)`.
     *
     * @param {{
     *   sessionId: string,
     *   epoch: number,
     *   attachmentId: string,
     *   data: string,
     *   wasUserInput?: boolean,
     *   source?: string
     * }} params
     */
    submitTerminalInput(params) {
      const record = requireSession(params.sessionId);

      if (
        record.writingOutputDepth > 0 ||
        params.source === 'output' ||
        params.wasUserInput !== true
      ) {
        record.rejectedOutputToInputCount += 1;
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_OUTPUT_TO_INPUT_REJECTED,
          'Output-to-input loop or programmatic non-user input is forbidden'
        );
      }

      if (typeof params.data !== 'string' || params.data.length === 0) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
          'Terminal input data must be a non-empty string'
        );
      }

      if (isTerminalProtocolResponse(params.data)) {
        record.protocolResponseInventory.push({
          epoch: record.epoch,
          data: params.data
        });
        record.rejectedOutputToInputCount += 1;
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_PROTOCOL_RESPONSE_NOT_HUMAN_INTENT,
          'Terminal protocol responses are inventoried separately and never forwarded as human input'
        );
      }

      if (record.mode !== 'pty') {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_PLAYER_CONSOLE_INPUT_FORBIDDEN,
          'Player closed AI console does not accept raw terminal input'
        );
      }

      if (record.viewRetention === 'replay-view') {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_REPLAY_READ_ONLY,
          'Replay views are read-only and reject live input reinjection'
        );
      }

      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      const attachmentId = assertImmutableId(params.attachmentId, 'attachmentId');
      if (epoch !== record.epoch || attachmentId !== record.attachmentId) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_ATTACH,
          'Terminal input rejected: stale epoch or attachmentId'
        );
      }

      if (record.attachmentState !== 'live') {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_NOT_LIVE_ATTACHMENT,
          `Terminal input requires live attachment (current: "${record.attachmentState}")`
        );
      }

      if (!record.hasControlLease) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_NO_CONTROL_LEASE,
          'Terminal input requires an admitted human control lease'
        );
      }

      record.inputSeq += 1;
      const payload = Object.freeze({
        sessionId: record.sessionId,
        epoch: record.epoch,
        attachmentId: record.attachmentId,
        inputSeq: record.inputSeq,
        data: params.data
      });

      if (typeof options.onSendAuthorizedPtyInput === 'function') {
        options.onSendAuthorizedPtyInput(payload);
      }

      return {
        accepted: true,
        inputSeq: record.inputSeq
      };
    },

    /**
     * Stages clipboard paste text in the separate paste composer for user inspection before Send.
     * @param {{ sessionId: string, text: string }} params
     */
    stagePaste(params) {
      const record = requireSession(params.sessionId);
      const inspected = inspectStagedPaste(params.text);
      record.stagedPaste = inspected;
      return inspected;
    },

    /**
     * Confirms and sends the currently staged paste only when `explicitUserSend === true`.
     * @param {{ sessionId: string, epoch: number, attachmentId: string, explicitUserSend: boolean }} params
     */
    confirmStagedPaste(params) {
      const record = requireSession(params.sessionId);
      if (params.explicitUserSend !== true || !record.stagedPaste) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_UNCONFIRMED_PASTE,
          'Staged paste requires explicit user Send confirmation'
        );
      }
      const wireData = record.terminal.modes?.bracketedPasteMode
        ? record.stagedPaste.sanitizedBracketedText
        : record.stagedPaste.sanitizedPlainText;

      const res = registry.submitTerminalInput({
        sessionId: record.sessionId,
        epoch: params.epoch,
        attachmentId: params.attachmentId,
        data: wireData,
        wasUserInput: true,
        source: 'user'
      });
      record.stagedPaste = null;
      return res;
    },

    /**
     * Clears any staged paste draft without sending.
     * @param {string} sessionId
     */
    clearStagedPaste(sessionId) {
      const record = requireSession(sessionId);
      record.stagedPaste = null;
    },

    /**
     * Updates the core-admitted control lease for a session.
     * @param {{ sessionId: string, epoch: number, hasControlLease: boolean }} params
     */
    setControlLease(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      if (epoch < record.epoch) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_EPOCH,
          `Stale epoch ${epoch} on setControlLease`
        );
      }
      record.epoch = epoch;
      record.hasControlLease = Boolean(params.hasControlLease);
      if (!record.hasControlLease) {
        cancelTimers(record);
      }
      syncInputGate(record);
    },

    /**
     * Updates core-projected session activity (`UI_ARCHITECTURE.md:192`).
     * @param {{ sessionId: string, epoch: number, activityState: 'unknown' | 'ready' | 'busy' | 'waiting-input' | 'waiting-permission' | 'exited' | 'failed' }} params
     */
    updateActivityFromCore(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      if (epoch < record.epoch) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_EPOCH,
          `Stale epoch ${epoch} on updateActivityFromCore`
        );
      }
      if (!SESSION_ACTIVITY_STATES.includes(params.activityState)) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_INVALID_IDENTITY,
          `Invalid activityState "${params.activityState}"`
        );
      }
      record.epoch = epoch;
      record.activityState = params.activityState;
    },

    /**
     * Transitions an exited session into bounded read-only `replay-view`.
     * @param {{ sessionId: string, epoch: number }} params
     */
    transitionToReplay(params) {
      const record = requireSession(params.sessionId);
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      if (epoch < record.epoch) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_EPOCH,
          `Stale epoch ${epoch} on transitionToReplay`
        );
      }
      record.epoch = epoch;
      record.viewRetention = 'replay-view';
      record.terminal.options.convertEol = true;
      cancelTimers(record);
      syncInputGate(record);
    },

    /**
     * Marks a session disconnected on transport/broker loss, invalidating active input capabilities
     * and setting activity to `unknown` (`UI_ARCHITECTURE.md:191, 195`).
     * @param {{ sessionId: string, epoch?: number }} params
     */
    markDisconnected(params) {
      const record = requireSession(params.sessionId);
      if (params.epoch !== undefined) {
        record.epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      }
      record.attachmentState = 'disconnected';
      record.activityState = 'unknown';
      record.attachmentId = null;
      cancelTimers(record);
      syncInputGate(record);
    },

    /**
     * Sets folded presentation state (`UI_ARCHITECTURE.md:189, 197, 207`).
     * Moves focus to `foldInvoker` before hiding, cancels pending focus retries, and keeps session alive.
     *
     * @param {{ sessionId: string, folded: boolean, foldInvoker?: { focus?: () => void } | null }} params
     */
    setFolded(params) {
      const record = requireSession(params.sessionId);
      const nextFolded = Boolean(params.folded);
      if (nextFolded) {
        cancelTimers(record);
        if (params.foldInvoker && typeof params.foldInvoker.focus === 'function') {
          params.foldInvoker.focus();
        }
        if (typeof record.terminal.blur === 'function') {
          record.terminal.blur();
        }
        record.focused = false;
      }
      record.folded = nextFolded;
      syncInputGate(record);
    },

    /**
     * Refits the terminal viewport immediately if and only if both the container box and
     * `fitAddon.proposeDimensions()` report positive geometry (`UI_ARCHITECTURE.md:208`).
     *
     * @param {{ sessionId: string, containerRect: { width: number, height: number } }} params
     */
    refitNow(params) {
      const record = requireSession(params.sessionId);
      const rect = params.containerRect;
      const width = rect && typeof rect.width === 'number' ? Math.round(rect.width) : 0;
      const height = rect && typeof rect.height === 'number' ? Math.round(rect.height) : 0;
      const proposed = record.fitAddon.proposeDimensions();

      if (
        record.folded ||
        width <= 0 ||
        height <= 0 ||
        !proposed ||
        proposed.cols <= 0 ||
        proposed.rows <= 0
      ) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_EMPTY_BOX_GEOMETRY,
          'Refit rejected: empty-box (0x0) container or non-positive proposed dimensions'
        );
      }

      record.fitAddon.fit();
      if (typeof options.onResizePty === 'function') {
        options.onResizePty({
          sessionId: record.sessionId,
          epoch: record.epoch,
          attachmentId: record.attachmentId,
          cols: proposed.cols,
          rows: proposed.rows
        });
      }
      if (record.terminal && typeof record.terminal.scrollToBottom === 'function') {
        record.terminal.scrollToBottom();
      }
      return { cols: proposed.cols, rows: proposed.rows };
    },

    /**
     * Schedules `rAF` + `120 ms` geometry refit after restore/unfold (`UI_ARCHITECTURE.md:208`).
     * @param {{ sessionId: string, getContainerRect: () => { width: number, height: number } }} params
     */
    scheduleRefit(params) {
      const record = requireSession(params.sessionId);
      for(const timer of record._refitTimers)clearTimeoutFn(timer);
      record._refitTimers.length=0;
      const attemptRefit = () => {
        if (record.folded || record.viewRetention === 'disposed') return;
        try {
          registry.refitNow({
            sessionId: record.sessionId,
            containerRect: params.getContainerRect()
          });
        } catch {
          // Ignore empty-box frame and wait for 120ms retry
        }
      };

      rafFn(() => {
        attemptRefit();
      });
      const timer = setTimeoutFn(() => {
        attemptRefit();
      }, 120);
      record._refitTimers.push(timer);
    },

    /**
     * Executes the DOM leg of the G5 three-layer focus protocol (`now`, `120 ms`, `400 ms`),
     * revalidating slot identity, generation, epoch, visibility, and control lease on every retry (`UI_ARCHITECTURE.md:209-210`).
     *
     * @param {{
     *   sessionId: string,
     *   slotId: string,
     *   generation: number,
     *   epoch: number,
     *   focusIntentId: string
     * }} params
     */
    scheduleFocus(params) {
      const record = requireSession(params.sessionId);
      const slotId = assertImmutableId(params.slotId, 'slotId');
      const generation = assertSafeNonNegativeInt(params.generation, 'generation');
      const epoch = assertSafeNonNegativeInt(params.epoch, 'epoch');
      const focusIntentId = assertImmutableId(params.focusIntentId, 'focusIntentId');

      cancelTimers(record);
      record.activeFocusIntentId = focusIntentId;

      const isStillValid = () =>
        record.viewRetention !== 'disposed' &&
        !record.folded &&
        record.slotId === slotId &&
        record.generation === generation &&
        record.epoch === epoch &&
        record.hasControlLease === true &&
        record.activeFocusIntentId === focusIntentId;

      let attemptsRun = 0;
      const runFocusAttempt = () => {
        if (!isStillValid()) {
          return false;
        }
        attemptsRun += 1;
        record.focused = true;
        syncInputGate(record);
        record.terminal.focus();
        return true;
      };

      if (!runFocusAttempt()) {
        throw createTerminalError(
          TERMINAL_ERROR_CODES.ERR_STALE_FOCUS_INTENT,
          'Focus attempt rejected: slot/generation/epoch/visibility/lease check failed'
        );
      }

      const t120 = setTimeoutFn(() => {
        runFocusAttempt();
      }, 120);
      const t400 = setTimeoutFn(() => {
        runFocusAttempt();
      }, 400);
      record._focusTimers.push(t120, t400);

      return { attemptsRun, focusIntentId };
    },

    /**
     * Updates a session's theme by assigning a fresh `{ ...theme }` object reference (`xterm.d.ts:878-911`).
     * @param {{
     *   sessionId: string,
     *   theme: Record<string, string>,
     *   contrast?: 'normal' | 'high',
     *   reducedMotion?: boolean,
     *   cIdleGate?: boolean
     * }} params
     */
    updateSessionTheme(params) {
      const record = requireSession(params.sessionId);
      if (params.contrast === 'high' || params.contrast === 'normal') {
        record.contrast = params.contrast;
      }
      if (typeof params.reducedMotion === 'boolean') {
        record.reducedMotion = params.reducedMotion;
      }
      if (typeof params.cIdleGate === 'boolean') {
        record.cIdleGate = params.cIdleGate;
      }
      record.terminal.options.theme = {
        ...DEFAULT_TERMINAL_THEME,
        ...(params.theme && typeof params.theme === 'object' ? params.theme : {})
      };
      record.terminal.options.minimumContrastRatio = record.contrast === 'high' ? 7 : 4.5;
      syncInputGate(record);
    },

    /**
     * Explicitly disposes view resources when a session view transitions to `disposed` (`UI_ARCHITECTURE.md:193`).
     * Never called on panel fold or Dockview move.
     *
     * @param {string} sessionId
     */
    disposeSession(sessionId) {
      const id = assertImmutableId(sessionId, 'sessionId');
      const record = sessions.get(id);
      if (!record || record.viewRetention === 'disposed') {
        return;
      }
      cancelTimers(record);
      disposeTerminalListeners(record);
      aggregatePendingBytes = Math.max(0, aggregatePendingBytes - record.pendingOutputBytes);
      record.pendingOutputBytes = 0;
      record.restoreBuffer.length = 0;
      record.viewRetention = 'disposed';
      record.attachmentState = 'detached';
      if (record.fitAddon && typeof record.fitAddon.dispose === 'function') {
        record.fitAddon.dispose();
      }
      if (record.terminal && typeof record.terminal.dispose === 'function') {
        record.terminal.dispose();
      }
    },

    /**
     * Returns the non-reactive session record for inspection.
     * @param {string} sessionId
     */
    forgetSession(sessionId) {
      const record = sessions.get(sessionId);
      if (record && record.viewRetention !== 'disposed') throw new Error('Cannot forget a live terminal');
      return sessions.delete(sessionId);
    },

    /** @param {string} sessionId */
    getSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    }
  };

  return registry;
}
</script>

<script setup>
import {
  shallowRef,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  markRaw
} from 'vue';

const props = defineProps({
  embedded: { type: Boolean, default: false },
  placeholder: { type: Boolean, default: false },
  sessionId: {
    type: String,
    required: true
  },
  sessionTitle: {
    type: String,
    default: ''
  },
  capsuleId: {
    type: String,
    required: true
  },
  slotId: {
    type: String,
    default: ''
  },
  presentationInstance: {
    type: String,
    default: 'terminal-view-default'
  },
  epoch: {
    type: Number,
    default: 0
  },
  generation: {
    type: Number,
    default: 0
  },
  mode: {
    type: String,
    default: 'structured'
  },
  attachmentState: {
    type: /** @type {import('vue').PropType<'detached'|'attaching'|'restoring'|'live'|'disconnected'>} */ (String),
    default: 'detached'
  },
  activityState: {
    type: /** @type {import('vue').PropType<'unknown'|'ready'|'busy'|'waiting-input'|'waiting-permission'|'exited'|'failed'>} */ (String),
    default: 'unknown'
  },
  viewRetention: {
    type: /** @type {import('vue').PropType<'live-view'|'replay-view'|'disposed'>} */ (String),
    default: 'live-view'
  },
  hasControlLease: {
    type: Boolean,
    default: false
  },
  folded: {
    type: Boolean,
    default: false
  },
  contrast: {
    type: String,
    default: 'normal'
  },
  reducedMotion: {
    type: Boolean,
    default: false
  },
  streamRegistry: {
    type: Object,
    default: null
  }
});

const emit = defineEmits([
  'request-attach',
  'request-stop',
  'request-replay',
  'select-target',
  'confirm-staged-paste'
]);

const viewportHostRef = shallowRef(/** @type {HTMLDivElement|null} */ (null));
const accessibleTextRef = shallowRef('');
const stagedPasteInfoRef = shallowRef(/** @type {{visualPreview:string}|null} */ (null));

const localRegistry = markRaw(
  props.streamRegistry ??
    createStreamRegistry({
      onAccessibleTextUpdated: (/** @type {string} */ sid, /** @type {string} */ text) => {
        if (sid === props.sessionId) {
          accessibleTextRef.value = text;
        }
      }
    })
);

const effectiveTitle = computed(() =>
  props.sessionTitle && props.sessionTitle.trim().length > 0
    ? props.sessionTitle.trim()
    : props.sessionId
);

const outputAnchor = computed(() => `output/${props.sessionId}/text`);
const attachAnchor = computed(() => `session/${props.sessionId}/attach`);
const stopAnchor = computed(() => `session/${props.sessionId}/stop`);
const replayAnchor = computed(() => `session/${props.sessionId}/replay`);
const targetAnchor = computed(() => `session/${props.sessionId}/target`);

const isAttachDisabled = computed(
  () => props.placeholder || props.attachmentState === 'live' || props.viewRetention === 'disposed'
);
const isStopDisabled = computed(
  () =>
    props.placeholder || props.activityState === 'exited' ||
    props.activityState === 'failed' ||
    props.viewRetention === 'replay-view'
);
const isReplayDisabled = computed(() => props.placeholder || props.viewRetention === 'disposed');
const isTargetDisabled = computed(
  () =>
    props.placeholder || !(props.activityState === 'ready' || props.activityState === 'waiting-input') ||
    props.attachmentState !== 'live'
);

/**
 * Preserves live-host keyboard focus when clicking controls beside the terminal (`UI_ARCHITECTURE.md:212`).
 * @param {Event} event
 */
function preserveLiveHostFocus(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
}

function handleAttachClick() {
  if (!isAttachDisabled.value) {
    emit('request-attach', {
      sessionId: props.sessionId,
      capsuleId: props.capsuleId,
      epoch: props.epoch
    });
  }
}

function handleStopClick() {
  if (!isStopDisabled.value) {
    emit('request-stop', {
      sessionId: props.sessionId,
      capsuleId: props.capsuleId,
      epoch: props.epoch
    });
  }
}

function handleReplayClick() {
  if (!isReplayDisabled.value) {
    emit('request-replay', {
      sessionId: props.sessionId,
      capsuleId: props.capsuleId,
      epoch: props.epoch
    });
  }
}

function handleTargetClick() {
  if (!isTargetDisabled.value) {
    emit('select-target', {
      sessionId: props.sessionId,
      capsuleId: props.capsuleId,
      epoch: props.epoch
    });
  }
}

/**
 * Stages paste text for user review without automatic execution.
 * @param {ClipboardEvent} event
 */
function handlePasteIntercept(event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  event?.stopPropagation?.();
  const text = event?.clipboardData?.getData?.('text/plain') ?? '';
  if (text.length > 0) {
    stagedPasteInfoRef.value = localRegistry.stagePaste({
      sessionId: props.sessionId,
      text
    });
  }
}

function handleConfirmStagedPaste() {
  const session = localRegistry.getSession(props.sessionId);
  if (!session || !session.stagedPaste || !session.attachmentId) return;
  localRegistry.confirmStagedPaste({
    sessionId: props.sessionId,
    epoch: session.epoch,
    attachmentId: session.attachmentId,
    explicitUserSend: true
  });
  stagedPasteInfoRef.value = null;
  emit('confirm-staged-paste', { sessionId: props.sessionId });
}

function handleCancelStagedPaste() {
  localRegistry.clearStagedPaste(props.sessionId);
  stagedPasteInfoRef.value = null;
}

/* DOM handles are created only after the viewport is available. */
/** @type {ResizeObserver|undefined} */
let resizeObserver;
const fitGate = createFitGate();
function openVisibleViewport(){
  const session=localRegistry.getSession(props.sessionId), host=viewportHostRef.value;
  if(!session || !host || props.folded)return;
  const rect=host.getBoundingClientRect();
  if(rect.width>0 && rect.height>0 && !session.terminal.element){
    session.terminal.open(host);
    if(session.terminal.textarea){
      session.terminal.textarea.id=`terminal-input-${props.sessionId}`;
      session.terminal.textarea.setAttribute('data-semantic-anchor',`settings/terminal-input-${props.sessionId}`);
      session.terminal.textarea.setAttribute('aria-label',`Terminal input for ${effectiveTitle.value}`);
    }
  }
}
onMounted(() => {
  let session = localRegistry.getSession(props.sessionId);
  if (!session) {
    session = localRegistry.createSession({
      sessionId: props.sessionId,
      capsuleId: props.capsuleId,
      slotId: props.slotId || `slot-${props.sessionId}`,
      generation: props.generation,
      epoch: props.epoch,
      mode: props.mode === 'pty' ? 'pty' : 'structured',
      hasControlLease: props.hasControlLease,
      activityState: props.activityState,
      contrast: props.contrast === 'high' ? 'high' : 'normal',
      reducedMotion: props.reducedMotion
    });
  }
  openVisibleViewport();
  if (viewportHostRef.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      fitGate.request(viewportHostRef.value?.getBoundingClientRect(), () => {
        openVisibleViewport();
        localRegistry.scheduleRefit({sessionId:props.sessionId,getContainerRect:()=>viewportHostRef.value?.getBoundingClientRect() ?? {width:0,height:0}});
      });
    });
    resizeObserver.observe(viewportHostRef.value);
  }
});

watch(
  () => [props.folded, props.epoch, props.hasControlLease],
  ([folded, epoch, hasControlLease]) => {
    const session = localRegistry.getSession(props.sessionId);
    if (!session) return;
    localRegistry.setFolded({
      sessionId: props.sessionId,
      folded: Boolean(folded)
    });
    localRegistry.setControlLease({
      sessionId: props.sessionId,
      epoch: Number(epoch),
      hasControlLease: Boolean(hasControlLease)
    });
    if (!folded && viewportHostRef.value) {
      openVisibleViewport();
      localRegistry.scheduleRefit({
        sessionId: props.sessionId,
        getContainerRect: () =>
          viewportHostRef.value?.getBoundingClientRect?.() ?? { width: 0, height: 0 }
      });
    }
  },
  { flush: 'post' }
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  fitGate.dispose();
  const session = localRegistry.getSession(props.sessionId);
  if (session && props.viewRetention === 'disposed') {
    localRegistry.disposeSession(props.sessionId);
  }
});

defineExpose({
  getSemanticControls: (boxes = {}) =>
    buildTerminalSemanticControls({
      sessionId: props.sessionId,
      sessionTitle: effectiveTitle.value,
      presentationInstance: props.presentationInstance,
      epoch: props.epoch,
      generation: props.generation,
      visible: !props.folded,
      folded: props.folded,
      attachmentState: props.attachmentState,
      activityState: props.activityState,
      viewRetention: props.viewRetention,
      boxes
    })
});
</script>

<template>
  <div
    v-show="!folded"
    class="cui-terminal-view"
    :data-session-id="sessionId"
    :data-attachment-state="attachmentState"
    :data-activity-state="activityState"
    :data-view-retention="viewRetention"
    @paste.capture="handlePasteIntercept"
  >
    <div v-if="!embedded" class="cui-terminal-toolbar" role="toolbar" :aria-label="`Controls for ${effectiveTitle}`">
      <button
        :id="`cui-session-${sessionId}-attach`"
        type="button"
        role="button"
        class="cui-terminal-btn"
        :data-semantic-anchor="`session/${sessionId}/attach`"
        :aria-label="`Attach session ${effectiveTitle}`"
        :disabled="isAttachDisabled"
        @pointerdown="preserveLiveHostFocus"
        @mousedown="preserveLiveHostFocus"
        @click="handleAttachClick"
      >
        Attach
      </button>

      <button
        :id="`cui-session-${sessionId}-stop`"
        type="button"
        role="button"
        class="cui-terminal-btn"
        :data-semantic-anchor="`session/${sessionId}/stop`"
        :aria-label="`Stop session ${effectiveTitle}`"
        :disabled="isStopDisabled"
        @pointerdown="preserveLiveHostFocus"
        @mousedown="preserveLiveHostFocus"
        @click="handleStopClick"
      >
        Stop
      </button>

      <button
        :id="`cui-session-${sessionId}-replay`"
        type="button"
        role="button"
        class="cui-terminal-btn"
        :data-semantic-anchor="`session/${sessionId}/replay`"
        :aria-label="`Replay session ${effectiveTitle}`"
        :aria-pressed="viewRetention === 'replay-view' ? 'true' : 'false'"
        :disabled="isReplayDisabled"
        @pointerdown="preserveLiveHostFocus"
        @mousedown="preserveLiveHostFocus"
        @click="handleReplayClick"
      >
        Replay
      </button>

      <button
        :id="`cui-session-${sessionId}-target`"
        type="button"
        role="button"
        class="cui-terminal-btn"
        :data-semantic-anchor="`session/${sessionId}/target`"
        :aria-label="`Select target session ${effectiveTitle}`"
        :disabled="isTargetDisabled"
        @pointerdown="preserveLiveHostFocus"
        @mousedown="preserveLiveHostFocus"
        @click="handleTargetClick"
      >
        Target
      </button>
    </div>

    <div
      ref="viewportHostRef"
      class="cui-terminal-viewport"
      :data-mode="mode"
    />

    <div
      v-if="stagedPasteInfoRef"
      class="cui-terminal-paste-composer"
      role="region"
      :aria-label="`Staged paste review for ${effectiveTitle}`"
    >
      <pre class="cui-terminal-paste-preview">{{ stagedPasteInfoRef.visualPreview }}</pre>
      <div class="cui-terminal-paste-actions">
        <button
          :id="`cui-session-${sessionId}-paste-send`"
          type="button"
          role="button"
          class="cui-terminal-btn"
          :aria-label="`Send staged paste to ${effectiveTitle}`"
          @click="handleConfirmStagedPaste"
        >
          Send Paste
        </button>
        <button
          :id="`cui-session-${sessionId}-paste-cancel`"
          type="button"
          role="button"
          class="cui-terminal-btn"
          :aria-label="`Cancel staged paste for ${effectiveTitle}`"
          @click="handleCancelStagedPaste"
        >
          Cancel
        </button>
      </div>
    </div>

    <div
      v-if="!embedded"
      :id="`cui-output-${sessionId}-text`"
      role="region"
      class="cui-terminal-accessible-output"
      :data-semantic-anchor="`output/${sessionId}/text`"
      :aria-label="`Accessible output for ${effectiveTitle}`"
      tabindex="0"
    >
      <pre class="cui-terminal-accessible-pre">{{ accessibleTextRef }}</pre>
    </div>
  </div>
</template>

<style scoped>
.cui-terminal-view {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: var(--cuk-semantic-surface-sunken);
  color: var(--cuk-semantic-text-primary);
}

.cui-terminal-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  border-bottom: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  background-color: var(--cuk-semantic-surface-chrome);
}

.cui-terminal-btn {
  min-height: var(--cuk-semantic-size-control-height-sm);
  padding: var(--cuk-semantic-spacing-xxs) var(--cuk-semantic-spacing-md);
  border: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
  border-radius: var(--cuk-semantic-radius-sm);
  background-color: var(--cuk-semantic-surface-interactive);
  color: var(--cuk-semantic-text-primary);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
  cursor: pointer;
}

.cui-terminal-btn:hover {
  background-color: var(--cuk-semantic-surface-hover-s1);
}

.cui-terminal-btn:focus-visible {
  outline: var(--cuk-semantic-focus-ring-width) solid var(--cuk-semantic-focus-ring-color);
  outline-offset: var(--cuk-semantic-focus-ring-offset);
}

.cui-terminal-btn:disabled {
  opacity: var(--cuk-semantic-opacity-disabled);
  cursor: not-allowed;
}

.cui-terminal-viewport {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.cui-terminal-paste-composer {
  display: flex;
  flex-direction: column;
  gap: var(--cuk-semantic-spacing-xs);
  padding: var(--cuk-semantic-spacing-md);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-strong);
  background-color: var(--cuk-semantic-surface-elevated);
}

.cui-terminal-paste-preview,
.cui-terminal-accessible-pre {
  margin: var(--cuk-semantic-spacing-none);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--cuk-semantic-typography-font-family-mono);
  font-size: var(--cuk-semantic-typography-roles-label-sm-font-size);
}

.cui-terminal-accessible-output {
  max-height: calc(var(--cuk-semantic-size-control-height-md) * 3);
  overflow-y: auto;
  padding: var(--cuk-semantic-spacing-xs) var(--cuk-semantic-spacing-md);
  border-top: var(--cuk-semantic-border-width) solid var(--cuk-semantic-border-subtle);
}
</style>
