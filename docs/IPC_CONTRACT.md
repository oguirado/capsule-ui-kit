# IPC contract

The sandboxed CommonJS preload is built by esbuild. It exposes a frozen `window.capsuleStarter` with only `load()` and `save(json)`. It never exposes ipcRenderer, a generic channel argument, filesystem paths or native handles.

| Method | Fixed channel | Result |
| --- | --- | --- |
| load | capsule-starter:layout.load | stored JSON string or null |
| save | capsule-starter:layout.save | true after atomic main-process write |

The preload bounds UTF-8 payloads; main rechecks JSON, byte size and product/profile/workspace scope. Main accepts only its own webContents and main frame at the bundled origin. Malformed input and foreign senders throw before writing. Persistence stores presentation data, with a temporary exclusive file, file fsync and rename (directory fsync on POSIX); the kit independently decodes full layout semantics on load.

Electron uses contextIsolation, sandbox, disabled Node integration, denied permissions, denied new windows and origin-checked navigation. The app protocol serves only canonical files beneath the renderer bundle and supplies a strict CSP on successes and refusals. Neither eval nor inline scripts/styles are admitted. No remote URLs, shell execution, PTY or economic command API is exposed. No DevTools protocol is used by the smoke proof.

Read `starter/electron/main.js`, `starter/electron/preload.js` and `test/security.test.mjs` for the exact boundary and its negative controls. For a consumer command backend, add a separately reviewed narrow method with main-side identity and authority validation; layout storage cannot supply that authority.
