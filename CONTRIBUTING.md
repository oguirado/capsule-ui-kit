# Contributing

The source of truth for the kit is the owner's package. Never edit `packages/capsule-ui-kit/` in this repository: it is replaced wholesale by the owner's export (`tools/sync_ui_kit.mjs`), so local edits are lost and break the sealed hashes. Everything else (starter, docs, router tooling, tests, CI, root `package.json`) is edited here.

## Flow

1. Branch from `main`; never push to `main`. A pull request merges only with green required checks and the maintainer's approval.
2. Keep the kit rules: tokens only, no remote fonts, CDN or Tailwind, no real product, company or person names.
3. If the kit changed, rebuild the router index with `python3 tools/router_index.py` and commit it with your change.
4. Run the checks below from the repository root and paste the result in the pull request.

## Checks (same commands as CI and the pull request template)

```sh
npm ci
npm run test:kit
node --test test/security.test.mjs test/router-negative.test.mjs
npm run check
npm run build
npm run router
(cd router/kit && python3 -I -m unittest discover -s tests -p 'test_*.py')
python3 -I -m unittest discover -s test -p 'test_*.py'
npm run lint:publication
npm run claims
```

`npm run proof` (offline Electron copy-and-boot proof) is host-only and not part of CI; see `docs/CI.md`.

## Local guard

Install the pre-push hook once per clone: `install -m 755 tools/hooks/pre-push .git/hooks/pre-push`. It runs the publication lint, the claims check and gitleaks, and blocks the push when gitleaks is not installed.

## Rules for contributed content

- English only. No absolute host paths, user or machine names, credentials or e-mail addresses.
- Machine-specific settings go in an ignored `local/` folder, never in tracked files.
- Licence stays UNLICENSED until the owner decides; this repository is private.
