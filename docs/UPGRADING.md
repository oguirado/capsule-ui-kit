# Upgrading

`packages/capsule-ui-kit/` is a snapshot exported by the kit's owner; it is never edited in this repository. Each export replaces the package tree and records its version and digest in `packages/capsule-ui-kit/KIT_SOURCE.json`.

`npm run digest` (`tools/kit_digest.mjs`) recomputes the digest and fails on any difference. The algorithm is `sha256-length-framed-tree`: one SHA-256 over the package tree, entries sorted by UTF-8 byte order, each regular file framed as `<name length>:<relative path><byte length>:<bytes>`; entries named KIT_SOURCE.json, node_modules or .git are skipped and symlinks are refused. This is a drift check, not an authentication signature.

After a new export: regenerate the router with `python3 tools/router_index.py`, run every check in CONTRIBUTING.md, and review the package's own changelog. Layout profiles are presentation-only; future or corrupt schemas enter read-only quarantine and cannot silently overwrite the saved layout.
