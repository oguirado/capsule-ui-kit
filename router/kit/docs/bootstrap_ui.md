# W0-KIT: bootstrap integrity for the UI router kit

`tools/bootstrap_ui.py` validates a kit root before any UI integration leg
runs. Three checks, allowlisted paths only, offline, deterministic, Python 3
stdlib only.

Reading map: `checks` (what passes) -> `policy` (external deny list) ->
`cli` (commands) -> `negatives` (refusal oracles).

<a id="checks"></a>
## Checks

| Check | Function | Clean pass | Refusal prefix |
|---|---|---|---|
| Vendored hashes | `validate_vendor` | every `vendor_manifest.json` entry exists and hashes exactly; extra W0 files allowed | `E_MANIFEST`, `E_VENDOR_MISSING`, `E_VENDOR_HASH` |
| Bootstrap notices | `validate_notices` | receipt gates all rc 0, `vendor_mutant_rejected` true, `vendor_files` matches the manifest, `v1_frozen/SHA256SUMS` verifies, `gate.sh` lists `test_bootstrap_ui.py` | `E_NOTICE_RECEIPT`, `E_NOTICE_FROZEN`, `E_NOTICE_GATE` |
| External policy | `validate_policy` | the external JSON policy loads and none of its patterns match a line of `POLICY_SCAN_FILES` | `E_POLICY_EMBEDDED`, `E_POLICY_ABSENT`, `E_POLICY_INVALID` |

`check(root, policy)` runs all three and returns a `ctx.bootstrap-ui.v1`
receipt with sorted errors and counts only (no timestamps, PIDs, or host
paths). Exit codes follow kit convention: 0 pass, 4 refuse, 2 usage.

No scan walks the tree: `RUNTIME_TOOLS`, `RELOCATED_TESTS`
and `POLICY_SCAN_FILES` are explicit tuples of relative
paths. `tools/bootstrap_ui.py` carries the policy template patterns, so the
content scan excludes it; the vendor hash still pins every helper
byte once the file is reviewed into the manifest.

<a id="policy"></a>
## External privacy policy

The vendored helper `PRIV` in `tools/gates_v2.py` holds generic PII and
secret shapes only. Site-specific names belong in an unpublished external
JSON file, which this tool applies to the allowlisted committed sources:

```json
{"schema": "ctx.privacy-policy.v1", "version": 1, "patterns": ["..."]}
```

`load_policy` refuses a missing file, non-JSON, wrong schema, empty
pattern list, or bad regex. `find_embedded` refuses any line of an
allowlisted source that matches a policy pattern; the finding names the file,
line and pattern index, never the matched text. `--init-policy PATH` writes
the generic template (standard PII/secret shapes, no site-private names); it
refuses to overwrite.

<a id="cli"></a>
## CLI

```sh
python3 tools/bootstrap_ui.py --init-policy out/privacy_policy.json
python3 tools/bootstrap_ui.py --root . --policy out/privacy_policy.json --check
python3 tools/bootstrap_ui.py --root . --policy out/privacy_policy.json --check --out out/bootstrap_ui.json
```

`--root` defaults to the kit root. `--check` prints the canonical receipt
to stdout and exits 0/4.

<a id="negatives"></a>
## Negatives

`tests/test_bootstrap_ui.py` builds minimal kits in temporary directories: a
clean kit passes via API and CLI; an altered or missing helper, a non-zero
receipt gate, a cleared mutant flag, a corrupt frozen file, and an unlisted
gate each refuse; a source line matching an external policy pattern, a
missing policy, and three invalid policy shapes refuse; `--init-policy`
writes once and refuses to overwrite. Real-kit tests assert the vendored
hashes, the notices, and that the vendored sources match no template
pattern. Fixtures are synthetic and tiny.
