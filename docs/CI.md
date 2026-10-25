# Continuous integration

`.github/workflows/ci.yml` runs on `ubuntu-latest` (x64) with Node 24 and Python 3.12. Every action is pinned to a full commit SHA, the token has `contents: read` only, and the downloaded gitleaks binary is pinned by version (v8.18.4) and sha256.

| Job | What it runs |
| --- | --- |
| `verify` | `npm ci`, `npm run test:kit`, `node --test test/security.test.mjs test/router-negative.test.mjs`, `npm run check`, `npm run build`, `npm run router`, the router kit unit tests (`python3 -I -m unittest discover -s tests -p 'test_*.py'` from `router/kit`), the publication lint tests (`python3 -I -m unittest discover -s test -p 'test_*.py'`), `npm run lint:publication`, `npm run claims` |
| `secrets` | gitleaks over the full history (`fetch-depth: 0`), then four negative controls |

The `secrets` job plants four random credentials with the same binary and config, and each must be detected: (a) a `ghp_` token, (b) a 64-hex `secret_key`, (c) a token appended to a real line of the router manifest, (d) a private-key block. Nothing is allowlisted in `.gitleaks.toml`.

`ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set in `verify`: no hosted step needs the Electron binary.

## Why `proof` is host-only

`npm run proof` (`test/copy-ready.test.mjs`) copies the kit to a clean folder and boots the pinned Electron build offline. It needs a systemd user session (`systemd-run`, to cap the process tree and memory), a virtual display (`xvfb-run`) and the pinned Electron 44.9.2 binary installed by `npm ci` (or `CAPSULE_ELECTRON_EXECUTABLE`; the test never downloads), none of which the hosted job provides: it skips the Electron download. Run it on the host:

```sh
npm ci
npm run proof
```

Its log goes to `.proof/` (git-ignored). Record each manual run in the pull request.

## Local secret scan

Install gitleaks v8.18.4 for your platform and run `gitleaks detect --source . --config .gitleaks.toml --redact --no-banner --exit-code 1`. The pre-push hook (`tools/hooks/pre-push`) runs the same scan and fails closed when gitleaks is missing.

## Kit tests that need the host application

`npm run test:kit` runs `tools/kit_tests.mjs`, which runs every `packages/capsule-ui-kit/test/*.test.js` except `capsule-chrome-s1.test.js` and `shell-sidebar-navigation.test.js`. Those two read `app/shell/src/renderer-v2/` of the owner's host application, which this repository does not contain. They stay in the package untouched and run in the owner's repository.
