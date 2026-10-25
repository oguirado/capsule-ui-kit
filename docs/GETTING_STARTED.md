# Getting started

Use a supported Node runtime with npm, Python, and the Electron desktop libraries. Versions are pinned in package-lock.json; do not substitute newer packages during an upgrade proof.

From the repository root:

```sh
npm ci
npm test
npm run check
npm run build
npm run router
npm start --workspace starter
```

For an offline workstation use `npm ci --offline --ignore-scripts`. Electron's install hook normally obtains a platform binary; offline users must provide an already installed matching runtime through `ELECTRON_OVERRIDE_DIST_PATH` (directory containing the executable). The copy-ready proof accepts `CAPSULE_ELECTRON_EXECUTABLE` as the executable path and never downloads anything.

`npm run proof` copies the source into a fresh folder, installs offline, runs kit/security tests, checks Vue, builds, checks router coverage and boots the built app under xvfb. If the cache is incomplete it explicitly reports a node_modules symlink fallback. The proof retains its log files in `.proof/copy-ready`.

The package lives in `packages/capsule-ui-kit`; `starter` is an ordinary workspace consumer of its explicit public exports. Main owns the layout file; the renderer owns notes and theme preferences. Notes are session-only. Terminal is an honest disconnected placeholder until a consumer implements a broker. No shell command execution ships in the starter.

Source files: `starter/src/main.js`, `starter/src/App.vue`, `starter/electron/main.js`, `starter/electron/preload.js`. See router/llms.txt for the full package index.
