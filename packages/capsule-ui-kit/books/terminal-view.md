# Stream View and Non-Reactive `StreamRegistry` (`TerminalView.vue`)

## Ownership and Unit Scope

| Field | Value |
|---|---|
| Unit | Stream view (`UI_ARCHITECTURE.md` §13) |
| Source component | `packages/capsule-ui-kit/src/terminal/TerminalView.vue` |
| Verification test | `packages/capsule-ui-kit/test/TerminalView.test.js` |
| Companion book | `packages/capsule-ui-kit/books/terminal-view.md` |
| Governing sections | `UI_ARCHITECTURE.md` §§3, 4, 5, 6, 7, 8, 9, 10, 12, 13 |
| Pinned vendor APIs | `@xterm/xterm version 6.0.0`, `@xterm/addon-fit version 0.11.0`, `vue version 3.5.43` |

## Architectural Contract

1. **External Non-Reactive `StreamRegistry` (`UI_ARCHITECTURE.md` §4, §6, §10)**:
   - `createStreamRegistry` instantiates a non-reactive service stamped with `__v_skip: true` (`ReactiveFlags.SKIP`). Live `Terminal` instances, `FitAddon` instances, bounded restore/output buffers, and `IDisposable` listeners stay outside Vue's reactive proxy graph.
   - Mounting `TerminalView.vue` registers the DOM host element and presentation handle only; mounting a panel never spawns a backend capsule or PTY process (`UI_ARCHITECTURE.md` §6).
2. **Broker / Display Attachment State Machine and Stale Attach / Sequence Gap Rejection (`UI_ARCHITECTURE.md` §6, §7, §13)**:
   - Session axes remain orthogonal: `attachmentState` (`detached | attaching | restoring | live | disconnected`), `activityState` (`unknown | ready | busy | waiting-input | waiting-permission | exited | failed`), and `viewRetention` (`live-view | replay-view | disposed`).
   - `beginAttach` transitions a session to `attaching` under a monotonic `(epoch, attachmentId)` pair while keeping `disableStdin: true` and buffering arriving tail chunks.
   - `applyRestoreSnapshot` validates `(epoch, attachmentId)`, calls `terminal.reset()`, writes the snapshot up to `snapshotCursorSeq`, verifies that buffered tail chunks form a contiguous cut from `snapshotCursorSeq`, and transitions to `live` only when the xterm parser finishes consuming the restore stream.
   - Any stale epoch, mismatched `attachmentId`, or non-contiguous byte sequence gap (`startSeq > nextExpectedOutSeq`) fails closed (`ERR_STALE_ATTACH` / `ERR_SEQUENCE_GAP`), immediately disables `stdin`, transitions out of `live` into resync (`attaching`), and notifies `onResyncRequired` without skipping VT bytes.
3. **Cumulative Parser ACKs and Per-Session Byte Watermarks (`UI_ARCHITECTURE.md` §4, §6, §7, §10)**:
   - `writeOutputChunk` enforces per-session (`maxPendingOutputBytesPerSession`) and aggregate (`maxAggregateOutputBytes`) pending byte ceilings, failing closed (`ERR_OUTPUT_BACKPRESSURE`) before unbounded queue growth.
   - Cumulative parser ACKs (`acknowledgedSeq`, `creditBytes`) are emitted exclusively inside the `terminal.write(data, callback)` parser completion callback.
4. **Output → Input Loop Rejection and Protocol Response Separation (`UI_ARCHITECTURE.md` §6, §7, §12, §13)**:
   - `TerminalView.vue` never exposes an `onTermReady(send)` or `terminal.input(...)` prompt-injection callback.
   - `submitTerminalInput` rejects any input triggered while `writingOutputDepth > 0`, any call with `source === 'output'` or `wasUserInput !== true` (`ERR_OUTPUT_TO_INPUT_REJECTED`), and any terminal-generated protocol response (`DA1/DA2/DA3`, `CPR`, `DSR`, `DECRPM`, `OSC` color/selection reports, `DCS/XTGETTCAP`, `CSI` window reports) detected by `isTerminalProtocolResponse` (`ERR_PROTOCOL_RESPONSE_NOT_HUMAN_INTENT`), recording protocol responses in a separate `protocolResponseInventory` ledger.
   - Raw terminal input is rejected in player closed AI consoles (`mode: 'structured'`, `ERR_PLAYER_CONSOLE_INPUT_FORBIDDEN`), in `replay-view` (`ERR_REPLAY_READ_ONLY`), when `attachmentState !== 'live'` (`ERR_NOT_LIVE_ATTACHMENT`), or when the human control lease is absent (`ERR_NO_CONTROL_LEASE`).
5. **Escape-Sequence Hardening and Staged Paste Composer (`UI_ARCHITECTURE.md` §7)**:
   - `buildTerminalOptions` forces `allowProposedApi: false` (rejecting `allowProposedApi: true` with `ERR_PROPOSED_API_FORBIDDEN`), `rightClickSelectsWord: false`, `windowOptions: {}`, and a non-navigating `linkHandler` (`allowNonHttpProtocols: false`).
   - `terminal.parser.registerOscHandler(52, () => true)` blocks untrusted OSC 52 clipboard access. OSC 0/2 `onTitleChange` events are recorded only as untrusted display strings and never update `activityState`.
   - `stagePaste` / `inspectStagedPaste` intercepts paste events into a separate review composer exposing control/newline tokens (`<CR>`, `<LF>`, `<ESC>`, `<CTRL-C>`, etc.) and stripping embedded `\x1b[200~`/`\x1b[201~` delimiters, requiring explicit user confirmation (`confirmStagedPaste` with `explicitUserSend: true`) before sending.
6. **Fold Continuity (`v-show`), Empty-Box Refit Guard (`rAF` + `120 ms`), G5 Focus Protocol, and §9 Operability (`UI_ARCHITECTURE.md` §§6, 8, 9)**:
   - Folded hosts remain mounted via `v-show="!folded"`; `setFolded` moves focus to `foldInvoker` before hiding, cancels pending focus/refit timers, and preserves the session and terminal instance.
   - `refitNow` / `scheduleRefit` (`rAF` + `120 ms`) verify positive container dimensions and positive `fitAddon.proposeDimensions()` before calling `fitAddon.fit()`, rejecting `0x0` empty-box frames (`ERR_EMPTY_BOX_GEOMETRY`).
   - `scheduleFocus` runs G5 DOM focus retries at `now`, `+120 ms`, and `+400 ms`, revalidating `(slotId, generation, epoch, !folded, hasControlLease, focusIntentId)` on every retry.
   - Exposes `output/{sid}/text` (`role="region"`) populated from `terminal.buffer.active.getLine(y)?.translateToString(true)` and `session/{sid}/{attach,stop,replay,target}` (`role="button"`) with `preventDefault()` on `pointerdown`/`mousedown` to preserve live-host focus.

## Exported API

- `TERMINAL_VIEW_SCHEMA`, `TERMINAL_ERROR_CODES`, `ATTACHMENT_STATES`, `SESSION_ACTIVITY_STATES`, `VIEW_RETENTION_STATES`, `TERMINAL_MODES`
- `isTerminalProtocolResponse(data)`
- `inspectStagedPaste(rawText)`
- `buildTerminalOptions(config)`
- `extractAccessibleBufferText(terminal, options)`
- `buildTerminalSemanticControls(params)`
- `createStreamRegistry(options)`

## AUSENTE Items (Not Invented)

- **PTY / session / attach / resize IPC envelope body schemas and ratified byte/timeout quotas** (`UI_ARCHITECTURE.md` §5 "Attach / resize / read / interrupt / terminate developer terminal", §7, §14 R3/R12): **AUSENTE** in `ARCH` — `StreamRegistry` consumes narrow callback seams (`onAckOutput`, `onResyncRequired`, `onSendAuthorizedPtyInput`, `onResizePty`) without inventing IPC channels or wire schemas.
- **Single `ITerminalOptions.cursor` property**: **AUSENTE** in `@xterm/xterm version 6.0.0` `typings/xterm.d.ts` — individual `cursorBlink`, `cursorStyle`, `cursorWidth`, `cursorInactiveStyle`, and `ITheme.cursor` / `cursorAccent` properties are used.
- **Built-in byte-credit / watermark option, full-buffer serializer, or OSC 52 toggle on `Terminal`**: **AUSENTE** in `@xterm/xterm version 6.0.0` `typings/xterm.d.ts` (`@xterm/addon-serialize`, `@xterm/addon-clipboard`, and `@xterm/addon-web-links` are external uncommissioned addons and are not loaded).

## TP7 consumer bridge

`SideTerminalPanel` receives an admitted facade as a prop. The shared kit never imports application IPC, gameplay commands, a socket client, or a Node runtime. The facade supplies `capabilities()`, `setEnabled(boolean)`, `open({command,args,cols,rows})`, `write({session,bytes})`, `resize({session,cols,rows})`, `close({session})`, `ack({session,seq,bytes})` and `onData`/`onExit` unsubscribe functions. The terminal capsule and its composer/launcher wrappers are retired; the side panel is the only terminal surface.

The panel uses the installed xterm and FitAddon implementations through the external StreamRegistry. The adapter translates frame sequence positions to registry intervals and turns parser completion into a cumulative byte ACK. Main retains command discovery and admission. The first open starts the user's real login shell; provider entries launch inside that shell so the provider's own TUI is used. Player builds require explicit AI terminal opt-in; developer builds can advertise the capability as enabled. Tab selection transfers the local input lease without launching or stopping a process. Output is inspected as terminal data and never passed to input. Quiet output leaves activity unknown; busy/ready inference from text is forbidden. Exit arrives through the authoritative facade event.

TerminalSessionTabs supplies the tab strip with activity chips and unread counts. Embedded TerminalView suppresses duplicate controls and output anchors, retains its paste-review composer and keeps real terminal objects outside Vue reactivity. All session views stay mounted; collapsing the panel never kills sessions, and an exited tab stays dimmed and readable until closed. Viewport observation requests geometry-checked refits. Scheme changes apply the declared xterm token mappings by fresh theme object. Unsupported reconnect is visibly disabled through `attachmentAvailable`; no reconnect operation is invented.

The UI retains a bounded session collection and startup output buffer. Closing a tab kills its process tree and releases listeners and terminal resources; collapsing the panel preserves them. Cross-document reload/reconnect persistence is AUSENTE — no inventar.
