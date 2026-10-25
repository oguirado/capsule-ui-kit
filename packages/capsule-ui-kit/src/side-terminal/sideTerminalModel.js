/**
 * Side-terminal session model: PTY display adapter for the overlay terminal
 * panel. Model output never becomes input or readiness evidence. Sessions are
 * data-driven (commands come from broker capabilities, titles and kinds from
 * the launch entry), exited sessions keep their exit code and stay readable
 * until the operator closes the tab, and closing a live tab kills its process
 * tree. Pure state plus the injected facade and stream registry: no DOM, no
 * framework, storage only through the settings seam.
 * @module side-terminal/sideTerminalModel
 */

import {
  SETTINGS_STORAGE_KEYS,
  readStoredSetting,
  writeStoredSetting
} from '../shell/SettingsModel.js';

/** Panel width on first open. */
export const SIDE_TERMINAL_DEFAULT_WIDTH_PX = 640;

/** Narrowest panel width. */
export const SIDE_TERMINAL_MIN_WIDTH_PX = 420;

/** Widest panel width as a share of the viewport width. */
export const SIDE_TERMINAL_MAX_WIDTH_RATIO = 0.75;

/** Keyboard resize step for the panel edge. */
export const SIDE_TERMINAL_RESIZE_STEP_PX = 8;

/** Large keyboard resize step (Shift held) for the panel edge. */
export const SIDE_TERMINAL_RESIZE_LARGE_STEP_PX = 60;

/** Maximum live PTY sessions (broker cap). */
export const SIDE_TERMINAL_MAX_SESSIONS = 8;

/** Maximum total session views (live plus exited) kept mounted. */
export const SIDE_TERMINAL_MAX_VIEWS = 8;

/** Fixed first new-menu entry: the interactive login shell. */
export const SIDE_TERMINAL_SYSTEM_ENTRY = Object.freeze({
  id: 'shell',
  label: 'System shell',
  hint: 'Interactive login shell',
  argv: Object.freeze([]),
  command: 'shell'
});

/** Default broker command for provider entries without an explicit command. */
export const SIDE_TERMINAL_PROVIDER_COMMAND = 'provider';

/** Maximum argv elements accepted from the custom dialog (broker cap). */
export const SIDE_TERMINAL_CUSTOM_MAX_ARGS = 32;

/** Maximum bytes per custom argv element (broker cap). */
export const SIDE_TERMINAL_CUSTOM_MAX_ARG_BYTES = 4096;

/**
 * Resolves the widest panel width for a viewport.
 * @param {unknown} viewportWidth Viewport width in pixels.
 * @returns {number} Max width in pixels, never below the minimum.
 */
export function maxSideTerminalWidth(viewportWidth) {
  const viewport = typeof viewportWidth === 'number' && Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : 1280;
  return Math.max(SIDE_TERMINAL_MIN_WIDTH_PX, Math.floor(viewport * SIDE_TERMINAL_MAX_WIDTH_RATIO));
}

/**
 * Clamps a panel width into the allowed range.
 * @param {unknown} px Requested width in pixels.
 * @param {unknown} viewportWidth Viewport width in pixels.
 * @returns {number} Clamped width in pixels.
 */
export function clampSideTerminalWidth(px, viewportWidth) {
  const max = maxSideTerminalWidth(viewportWidth);
  const fallback = Math.min(SIDE_TERMINAL_DEFAULT_WIDTH_PX, max);
  if (typeof px !== 'number' || !Number.isFinite(px)) return fallback;
  return Math.min(max, Math.max(SIDE_TERMINAL_MIN_WIDTH_PX, Math.round(px)));
}

/**
 * Steps a panel width by one keyboard increment.
 * @param {number} current Current width in pixels.
 * @param {1 | -1} direction Grow (+1) or shrink (-1).
 * @param {unknown} viewportWidth Viewport width in pixels.
 * @param {boolean} [large] True for the large step.
 * @returns {number} Clamped stepped width in pixels.
 */
export function stepSideTerminalWidth(current, direction, viewportWidth, large = false) {
  const step = large === true ? SIDE_TERMINAL_RESIZE_LARGE_STEP_PX : SIDE_TERMINAL_RESIZE_STEP_PX;
  return clampSideTerminalWidth(current + direction * step, viewportWidth);
}

/**
 * Reads the persisted panel width.
 * @param {Pick<Storage, 'getItem'>|null|undefined} storage Web storage or a test double.
 * @param {unknown} viewportWidth Viewport width in pixels.
 * @returns {number} Clamped persisted width, or the default.
 */
export function readSideTerminalWidth(storage, viewportWidth) {
  const raw = readStoredSetting(storage, SETTINGS_STORAGE_KEYS.sideTerminalWidth, '');
  const parsed = raw === '' ? Number.NaN : Number(raw);
  return clampSideTerminalWidth(parsed, viewportWidth);
}

/**
 * Reads the persisted panel open state.
 * @param {Pick<Storage, 'getItem'>|null|undefined} storage Web storage or a test double.
 * @returns {boolean} True when the panel was left open (default collapsed).
 */
export function readSideTerminalOpen(storage) {
  return readStoredSetting(storage, SETTINGS_STORAGE_KEYS.sideTerminalOpen, '0') === '1';
}

/**
 * Persists the panel open state and width without ever throwing.
 * @param {Pick<Storage, 'setItem'>|null|undefined} storage Web storage or a test double.
 * @param {{ open: boolean, widthPx: number }} state State to persist.
 * @returns {void}
 */
export function writeSideTerminalState(storage, state) {
  writeStoredSetting(storage, SETTINGS_STORAGE_KEYS.sideTerminalOpen, state.open === true ? '1' : '0');
  writeStoredSetting(
    storage,
    SETTINGS_STORAGE_KEYS.sideTerminalWidth,
    String(Math.round(state.widthPx))
  );
}

/**
 * Default title for reattached sessions whose launch entry is unknown.
 * @param {unknown} command Broker command name.
 * @returns {string} Display title.
 */
export function defaultSideTerminalTitle(command) {
  if (command === 'shell') return 'System shell';
  return typeof command === 'string' && command.length > 0 ? command : 'Terminal session';
}

/**
 * @typedef {object} SideTerminalLaunchSpec
 * @property {string} command Broker command name (must be advertised in capabilities).
 * @property {string[]|undefined} [args] Executable plus arguments array (never shell text).
 * @property {string|undefined} [title] Tab title.
 * @property {string|undefined} [kind] Tab kind tag.
 * @property {number|undefined} [cols] Initial columns.
 * @property {number|undefined} [rows] Initial rows.
 */

/**
 * @param {{facade:any,createRegistry:(options:any)=>any,onChange?:(state:any)=>void,registryOptions?:any,getTheme?:()=>any,resolveTitle?:(command:unknown)=>string}} options
 */
export function createSideTerminalModel({
  facade,
  createRegistry,
  onChange = () => {},
  registryOptions = {},
  getTheme = () => undefined,
  resolveTitle = defaultSideTerminalTitle
}) {
  /** @type {Map<string,any>} */
  const sessions = new Map();
  /** @type {any} */
  let capabilities = null;
  let optedIn = false, disposed = false, launching = false;
  /** @type {string|null} */
  let selected = null;
  let error = '', earlyBytes = 0;
  /** @type {any[]} */
  let early = [];
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let outputTimer;
  let earlyOverflow = false;
  /** @param {any} e */
  const report = (e) => { error = String(e?.message ?? e); publish(); };
  const registry = createRegistry({
    ...registryOptions,
    /** @param {{sessionId:string,acknowledgedSeq:number}} event */
    onAckOutput({ sessionId, acknowledgedSeq }) {
      const s = sessions.get(sessionId), bytes = s?.credits.get(acknowledgedSeq);
      if (!s || bytes === undefined || disposed || ['exited', 'failed'].includes(s.activity)) return;
      for (const seq of s.credits.keys()) if (seq <= acknowledgedSeq) s.credits.delete(seq);
      Promise.resolve(facade.ack({ session: sessionId, seq: acknowledgedSeq, bytes })).catch(report);
    },
    /** @param {{sessionId:string,data:string}} event */
    onSendAuthorizedPtyInput({ sessionId, data }) {
      if (!enabled() || selected !== sessionId || !sessions.has(sessionId) || ['exited', 'failed'].includes(sessions.get(sessionId).activity)) return;
      Promise.resolve(facade.write({ session: sessionId, bytes: Array.from(new TextEncoder().encode(data)) })).catch(report);
    },
    /** @param {{sessionId:string,cols:number,rows:number}} event */
    onResizePty({ sessionId, cols, rows }) {
      if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2 || cols > 1000 || rows > 1000) return;
      if (!sessions.has(sessionId) || ['exited', 'failed'].includes(sessions.get(sessionId).activity)) return;
      Promise.resolve(facade.resize({ session: sessionId, cols, rows })).catch(report);
    },
    /** @param {string} sessionId @param {string} text */
    onAccessibleTextUpdated(sessionId, text) {
      const s = sessions.get(sessionId); if (s) { s.accessibleText = text; if (outputTimer === undefined) outputTimer = setTimeout(() => { outputTimer = undefined; publish(); }, 16); }
    }
  });
  function enabled() { return capabilities !== null && (capabilities.developerMode || optedIn); }
  function publish() { if (!disposed) onChange(snapshot()); }
  function liveSessions() {
    return Array.from(sessions.values()).filter((s) => !['exited', 'failed'].includes(s.activity));
  }
  function snapshot() {
    return {
      enabled: enabled(),
      developerMode: capabilities?.developerMode === true,
      ready: capabilities !== null,
      commands: capabilities?.commands ?? [],
      launching,
      error,
      selected,
      liveCount: liveSessions().length,
      sessions: Array.from(sessions.values(), (s) => ({
        sessionId: s.id,
        title: s.title,
        kind: s.kind,
        activity: s.activity,
        attachment: s.attachment,
        hasControlLease: enabled() && s.id === selected && s.activity !== 'exited' && s.activity !== 'failed',
        viewRetention: 'live-view',
        accessibleText: s.accessibleText,
        exitCode: s.exitCode
      }))
    };
  }
  /** @param {string|null} id */
  function applySelection(id) {
    selected = id;
    for (const s of sessions.values()) {
      registry.setControlLease({
        sessionId: s.id,
        epoch: 1,
        hasControlLease: enabled() && s.id === id && !['exited', 'failed'].includes(s.activity)
      });
    }
    publish();
  }
  /** @param {string|null} id */
  function select(id) {
    if (id === null || !sessions.has(id)) return;
    applySelection(id);
  }
  /** @param {any} frame */
  function receive(frame) {
    if (disposed) return;
    const s = sessions.get(frame?.session);
    if (!s) {
      if (launching) {
        const n = Array.isArray(frame?.bytes) ? frame.bytes.length : 0;
        if (early.length >= 128 || earlyBytes + n > 262144) { earlyOverflow = true; report('Terminal startup output overflow'); return; }
        early.push(frame); earlyBytes += n;
      }
      return;
    }
    if (['exited', 'failed'].includes(s.activity)) return;
    try {
      if (!Number.isSafeInteger(frame.seq) || frame.seq !== s.seq + 1 || !Array.isArray(frame.bytes) ||
        frame.bytes.length > 65536 || frame.bytes.some((/** @type {number} */ b) => !Number.isInteger(b) || b < 0 || b > 255) || frame.byteLength !== frame.bytes.length) {
        throw new Error('Invalid terminal frame or sequence gap');
      }
      s.seq = frame.seq; s.bytes += frame.bytes.length; s.credits.set(frame.seq, s.bytes);
      registry.writeOutputChunk({ sessionId: s.id, epoch: 1, attachmentId: s.id, startSeq: frame.seq - 1, endSeq: frame.seq, data: Uint8Array.from(frame.bytes) });
    } catch (e) {
      s.activity = 'failed'; s.attachment = 'disconnected';
      registry.setControlLease({ sessionId: s.id, epoch: 1, hasControlLease: false });
      void Promise.resolve(facade.close({ session: s.id })).catch(report);
      report(e);
    }
  }
  /** @param {any} event */
  function exit(event) {
    if (disposed) return;
    const s = sessions.get(event?.session);
    if (!s) { if (launching && early.length < 128) early.push({ exit: event }); return; }
    s.activity = 'exited'; s.attachment = 'disconnected';
    s.exitCode = Number.isInteger(event?.code) ? event.code : -1;
    registry.setControlLease({ sessionId: s.id, epoch: 1, hasControlLease: false });
    publish();
  }
  /**
   * @param {{session:string,command:string,seq?:number,ackedSeq?:number,bytes?:number,replay?:number[],title?:string,kind?:string}} attachment
   */
  function attachSession({ session: id, command, seq = 0, ackedSeq = 0, bytes = 0, replay = [], title, kind }) {
    if (typeof id !== 'string' || !id || sessions.has(id) || typeof command !== 'string' || !command ||
      !Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(bytes) || bytes < 0 || !Array.isArray(replay) ||
      replay.length > 131072 || replay.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) {
      throw new Error('Invalid terminal attachment');
    }
    const label = typeof title === 'string' && title.length > 0 ? title : resolveTitle(command);
    sessions.set(id, {
      id,
      title: label,
      kind: typeof kind === 'string' && kind.length > 0 ? kind : command,
      activity: 'unknown',
      attachment: 'live',
      accessibleText: '',
      exitCode: null,
      seq,
      bytes,
      credits: new Map(seq > ackedSeq ? [[seq, bytes]] : [])
    });
    registry.createSession({ sessionId: id, capsuleId: 'side-terminal', epoch: 1, generation: 1, mode: 'pty', hasControlLease: false, theme: getTheme() });
    registry.beginAttach({ sessionId: id, epoch: 1, attachmentId: id });
    registry.applyRestoreSnapshot({ sessionId: id, epoch: 1, attachmentId: id, snapshotCursorSeq: seq, snapshotData: Uint8Array.from(replay) });
  }
  const offData = facade?.onData(receive), offExit = facade?.onExit(exit);
  return {
    registry,
    snapshot,
    select,
    /**
     * Launches one session from an explicit operator action. Nothing launches
     * on mount, input, paste or projection change.
     * @param {SideTerminalLaunchSpec} spec Launch entry.
     * @returns {Promise<string>} New session id.
     */
    async launch(spec) {
      const command = spec?.command;
      const args = spec?.args ?? [];
      if (disposed || !enabled() || launching || liveSessions().length >= SIDE_TERMINAL_MAX_SESSIONS ||
        typeof command !== 'string' || !capabilities.commands.includes(command) ||
        !Array.isArray(args) || args.length > 32 ||
        args.some((x) => typeof x !== 'string' || x.includes('\0') || new TextEncoder().encode(x).length > 4096)) {
        throw new Error('Terminal launch unavailable');
      }
      const colsValue = spec?.cols;
      const rowsValue = spec?.rows;
      const cols = typeof colsValue === 'number' && Number.isInteger(colsValue) && colsValue >= 2 && colsValue <= 1000 ? colsValue : 80;
      const rows = typeof rowsValue === 'number' && Number.isInteger(rowsValue) && rowsValue >= 2 && rowsValue <= 1000 ? rowsValue : 24;
      launching = true; error = ''; publish();
      try {
        const reply = await facade.open({ command, args, cols, rows });
        if (disposed) { await facade.close({ session: reply.session }); return ''; }
        if (typeof reply?.session !== 'string' || !reply.session || sessions.has(reply.session)) {
          throw new Error('Invalid terminal session');
        }
        const id = reply.session;
        if (earlyOverflow) { await facade.close({ session: id }); throw new Error('Terminal startup output overflow'); }
        while (sessions.size >= SIDE_TERMINAL_MAX_VIEWS) {
          const old = Array.from(sessions.values()).find((s) => ['exited', 'failed'].includes(s.activity));
          if (!old) break;
          registry.disposeSession(old.id); registry.forgetSession(old.id); sessions.delete(old.id);
          if (selected === old.id) selected = null;
        }
        attachSession({
          session: id,
          command,
          title: typeof spec?.title === 'string' && spec.title.length > 0 ? spec.title : resolveTitle(command),
          kind: typeof spec?.kind === 'string' && spec.kind.length > 0 ? spec.kind : command
        });
        select(id);
        for (const frame of early) { if (frame.exit) exit(frame.exit); else receive(frame); }
        return id;
      } catch (e) { report(e); throw e; } finally { early = []; earlyBytes = 0; earlyOverflow = false; launching = false; publish(); }
    },
    /**
     * Closes a tab from an explicit operator action: a live session is killed
     * first, an exited one is only removed, and the last remaining tab is
     * selected. The final output of other exited tabs stays readable.
     * @param {string} id Session id.
     * @returns {Promise<boolean>} True when a tab was removed.
     */
    async closeTab(id) {
      const s = sessions.get(id);
      if (!s || disposed) return false;
      const live = !['exited', 'failed'].includes(s.activity);
      if (live) {
        try { await facade.close({ session: id }); } catch (e) { report(e); }
      }
      registry.disposeSession(id); registry.forgetSession(id); sessions.delete(id);
      if (selected === id) {
        const remaining = Array.from(sessions.keys());
        applySelection(remaining.length > 0 ? /** @type {string} */ (remaining[remaining.length - 1]) : null);
      } else {
        publish();
      }
      return true;
    },
    /**
     * Requests the broker-side kill of a live session without removing its view.
     * @param {string} id Session id.
     * @returns {Promise<void>}
     */
    async stop(id) {
      if (sessions.has(id) && !['exited', 'failed'].includes(sessions.get(id).activity)) {
        await facade.close({ session: id });
      }
    },
    async initialize() {
      try {
        const c = await facade.capabilities();
        if (disposed) return;
        if (typeof c?.developerMode !== 'boolean' || !Array.isArray(c.commands) || c.commands.some((/** @type {string} */ x) => typeof x !== 'string')) {
          throw new Error('Terminal capabilities unavailable');
        }
        capabilities = { developerMode: c.developerMode, commands: c.commands };
        if (typeof facade.attach === 'function') {
          launching = true;
          try {
            const attached = await facade.attach();
            if (disposed) return;
            if (!Array.isArray(attached?.sessions) || attached.sessions.length > 8 || typeof attached.enabled !== 'boolean') {
              throw new Error('Invalid terminal attachment');
            }
            optedIn = attached.enabled;
            for (const s of attached.sessions) attachSession(s);
            const first = sessions.keys().next().value ?? null;
            if (first !== null) select(first);
            for (const frame of early) { if (frame.exit) exit(frame.exit); else if (frame.seq > (sessions.get(frame.session)?.seq ?? 0)) receive(frame); }
          } finally { launching = false; early = []; earlyBytes = 0; }
        }
        publish();
      } catch (e) { capabilities = null; report(e); }
    },
    /** @param {boolean} value */
    async optIn(value) {
      optedIn = false; select(selected); publish();
      try {
        await facade.setEnabled(value === true);
        if (disposed) return;
        optedIn = value === true; select(selected); publish();
      } catch (e) { report(e); }
    },
    dispose({ closeSessions = true } = {}) {
      disposed = true; clearTimeout(outputTimer); offData?.(); offExit?.();
      for (const s of sessions.values()) {
        registry.disposeSession(s.id);
        if (closeSessions && !['exited', 'failed'].includes(s.activity)) {
          void Promise.resolve(facade.close({ session: s.id })).catch(() => {});
        }
      }
      sessions.clear(); early = [];
    }
  };
}
