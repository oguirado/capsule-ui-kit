# Upgrading

Make kit changes in this repository first. Run tests, Vue checking, the starter build and the copy-ready proof. Update package version and dependency pins deliberately, retain lockfile integrity and third-party evidence, then refresh KIT_SOURCE.json and regenerate the router.

The consumer's `tools/sync_ui_kit.mjs --import <kit-repo>` validates the source package metadata before replacing its vendored copy. Hashes include sorted relative paths and length-framed bytes; KIT_SOURCE.json, node_modules and .git are excluded. Silent edits fail verification. This is a drift check, not an authentication signature.

The one-time `--export <kit-repo>` copies the consumer's kit into this repository after parallel writers finish. It replaces the package tree and records the exported version/hash. Review the resulting manifest, tests, licence notices and router afterward: export is an exact snapshot transfer and does not merge package-local documentation or portability corrections. The conductor owns that later export and initialization of Git history.

This initial snapshot keeps the source implementation from the supplied worktree. Standalone manifest/test portability and licence notices are repository-local packaging changes; the consumer source files are untouched. Its separate KIT_SOURCE records its current vendored bytes. To adopt the standalone package's packaging changes there, the conductor must authorize and run import in its integration workspace.

After any intentional kit edit, use `node tools/seal_kit.mjs` in the standalone repository; this records the current package version and digest and refreshes the router. Then import and run the consumer's strict suite. Layout profiles are presentation-only; future/corrupt schemas enter read-only quarantine and cannot silently overwrite the saved layout.
