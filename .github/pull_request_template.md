## What changed

## Checks (run from the repository root; same commands as CONTRIBUTING.md)

- [ ] `npm ci`
- [ ] `npm run digest`
- [ ] `npm run test:kit`
- [ ] `node --test test/security.test.mjs test/router-negative.test.mjs test/kit-digest.test.mjs`
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] `npm run router`
- [ ] router kit unit tests (`cd router/kit && python3 -I -m unittest discover -s tests -p 'test_*.py'`) and `python3 -I -m unittest discover -s test -p 'test_*.py'`
- [ ] `npm run lint:publication`
- [ ] `npm run claims`
- [ ] `packages/capsule-ui-kit/` is untouched (the owner's export replaces it)
- [ ] No private paths, identities or credentials
