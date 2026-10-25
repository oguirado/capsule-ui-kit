# W0-ENTRY: entry-plane gates for the UI router kit

`tools/gates_ui_entry.py` implements the four normative-but-unwritten gates
of paper section 2.8 (`g_tier1`, `g_protocol`, `g_digest`, `g_offline`) for
one complete single-corpus local mount. Step C publication qualification:
Tier-1 token caps, semantic protocol plus lookup coverage, index digest
shape plus density proof, and a static offline audit of the entry-path
core. Offline, deterministic, Python 3 stdlib only.

Reading map: `checks` (what passes) -> `tokenizer` (out-of-band counts) ->
`protocol` (semantic rules) -> `digest` (density proof) -> `offline`
(static audit) -> `cli` (commands) -> `negatives` (refusal oracles) ->
`boundaries` (honest non-claims).

<a id="checks"></a>
## Checks

| Check | Function | Clean pass | Refusal prefix |
|---|---|---|---|
| Tier-1 caps | `check_tier1` | the four entry files exist, carry no volatile or secret text, and their bound counts fit `llms.txt <=150`, `protocol.json <=600`, `AGENTS.md <=1500`, `README.md <=1000` | `E_TIER1_MISSING`, `E_TIER1_VOLATILE`, `E_TIER1_SECRET`, `E_TIER1_TOKENS` |
| Tokenizer binding | `load_counts`, `verified_tokens` | external `ctx.tokenizer-counts.v1` file loads, pins `o200k_base`, and binds every checked key by exact sha256 | `E_TOKENIZER_ABSENT`, `E_TOKENIZER_INVALID`, `E_TOKENIZER_COVERAGE`, `E_TOKENIZER_STALE` |
| Semantic protocol | `check_protocol`, `check_lookup` | `ctx.protocol.v2` validates, exactly one mount binds the index corpus and path, the lookup covers every indexed id exactly once, the ladder names its L2 mechanism | `E_PROTOCOL_SCHEMA`, `E_PROTOCOL_SEMANTIC`, `E_PROTOCOL_MOUNT_COUNT`, `E_PROTOCOL_PRIORITY`, `E_PROTOCOL_LOOKUP`, `E_PROTOCOL_LADDER`, `E_PROTOCOL_PLACEHOLDER` |
| Digest proof | `check_digest` | every `digest/<s>.jsonl` line has exactly `{g,i,id,o,p,t}`, respects the truncation rules, matches `cols.json` order, and proves `<=80` tokens | `E_DIGEST_INDEX`, `E_DIGEST_SHAPE`, `E_DIGEST_COVERAGE`, `E_DIGEST_TOKENS` |
| Offline core | `check_offline` | the five entry-path files import no network, subprocess, or model module and call no spawn or socket helper | `E_OFFLINE_MISSING`, `E_OFFLINE_INVALID`, `E_OFFLINE_IMPORT`, `E_OFFLINE_CALL` |

`check(root, index, tokenizer, tools_dir)` runs all five and returns a
`ctx.gates-ui-entry.v1` receipt with sorted errors and counts only: no
timestamps, PIDs, host paths, or secret text. A gate that cannot run is
FAIL, never SKIP. Exit codes follow kit convention: 0 pass, 4 refuse,
2 usage.

No scan walks the tree: Tier-1 paths, the protocol/lookup paths, the
digest shards derived from `cols.json`, and `CORE_FILES` are explicit
allowlisted relatives. The tool is 549 lines (review band: four gates in
the single owned file the row allows, instead of an invented split).

<a id="tokenizer"></a>
## Out-of-band tokenizer

The paper states the caps in `o200k_base` and requires that no v2 JSON
artefact names a tokenizer. Accordingly the counts live outside every
runtime artefact, in an external file passed only via `--tokenizer`:

```json
{"schema": "ctx.tokenizer-counts.v1", "tokenizer": "o200k_base",
 "pin": "<registry pin>", "counts": [
  {"path": "llms.txt", "sha256": "<hex of exact file bytes>", "tokens": 60},
  {"path": "digest:ui:panel", "sha256": "<hex of exact line bytes>",
   "tokens": 40}]}
```

Tier-1 keys are repo-relative paths; digest keys are `digest:<id>` bound
to the JSONL line bytes with the trailing newline removed. The gate
never counts tokens itself and never approximates: a missing file, a
missing key, or a hash mismatch fails closed. The `pin` records which
external registry produced the counts; the offline gate cannot verify a
registry, so the pin is provenance, not a cryptographic proof. The gate
receipt names the tokenizer because it is the proof's provenance record,
not a v2 router artefact.

<a id="protocol"></a>
## Semantic protocol

Beyond the `ctx.protocol.v2` shape (unknown fields fail at top, router,
and mount level), the gate enforces the paper rule: the shortlist schema
implies a present `path_rule` and `params`; the lookup exists and holds
one row per indexed id; mount priorities are distinct. Holdings
single-corpus reading: exactly one mount, whose corpus equals the index
manifest corpus and whose path is the checked index directory. A second
mount fails even with a distinct priority, and a mount `lookup` property
fails as the invented field it is.

Lookup rows accept both committed shapes, never mixed: generic
`id<TAB>path` or paper `id<TAB>subject_id<TAB>paper<TAB>page` with an
`id` header. Every row id must be indexed, every indexed id must have
exactly one row, and every row path must be a portable relative path to
an existing file under the root. The schema fixes `path_rule` to the
constant, so the paper's `{id}`-template alternative cannot validate and
is documented dead code, not implemented. Two v1-unchanged rules are
checked where the ladder now lives: `llms.txt` must name the router CLI
or the browse path, and `{...}` placeholders in the ladder files must be
`{id}`, `{subject_id}`, or `{page}`.

<a id="digest"></a>
## Digest proof

Each digest line must carry exactly the v2 keys `{g,i,id,o,p,t}` with
`p <=300` characters, `o <=2` outputs of `<=200` characters, `g <=6`
triggers, dense index `i` in position, and id equal to `cols.json`
order. One line per indexed id: missing, dangling, and duplicate lines
fail, as does a missing shard. Every line then proves `<=80` tokens
through its bound count, so any 20-row shortlist satisfies the `<=1600`
answer bound. Manifest freshness stays with `g_fresh`; this gate proves
density, not publication state.

<a id="offline"></a>
## Offline audit

`CORE_FILES` is the deterministic path the ladder can invoke:
`route_v2.py`, `build_index_v2.py`, `blocks.py`, `jsonschema_lite.py`,
and this gate. The audit rejects direct imports of network modules,
`subprocess`/`multiprocessing`, model and tokenizer libraries, and HTTP
clients, plus calls to spawn, shell, and socket helpers. `gates_v2.py`
is excluded on purpose: the gates legitimately use `subprocess`, and the
router reaches it only through the lazy `--verify` hash path. Bench
tools are out of scope. The check is direct-import AST only; transitive
analysis is an explicit non-claim.

<a id="cli"></a>
## CLI

```sh
python3 tools/gates_ui_entry.py --root <repo> --tokenizer <counts.json> --check
python3 tools/gates_ui_entry.py --root <repo> --index <dir> --tokenizer <counts.json> --tools <dir> --check --out <receipt.json>
```

`--index` defaults to `<root>/catalogue/router`; `--tools` defaults to
the gate's own directory. `--check` prints the canonical receipt to
stdout and exits 0/4. Omitting `--tokenizer` fails closed with
`E_TOKENIZER_ABSENT`, never with a fallback estimate.

<a id="negatives"></a>
## Negatives

`tests/test_gates_ui_entry.py` (53 tests) builds complete synthetic
mounts in temporary directories with a real `build_index_v2` index: a
generic and a paper-shape mount pass via API and CLI with a stable
receipt; a missing entry file, an over-cap count, a volatile timestamp,
and a secret each refuse (the secret never printed); a missing, stale,
gapped, or unknown-fielded tokenizer refuses; unknown protocol fields at
all three levels, the invented mount `lookup`, duplicate priorities, a
second mount, empty mounts, a wrong const, and every lookup mutation
(missing/duplicate/dangling row, escaping or absolute path, missing
file, mixed arity) refuse; mount-path and corpus mismatches, a
ladder-neutral entry, and a foreign placeholder refuse; digest over-cap,
unknown-field, truncation, missing-line, missing-shard, stale-proof, and
proof-gap mutations refuse; socket, subprocess, model, and
urllib-request imports plus an `os.system` call refuse while local
imports pass. Real-kit tests assert stdlib-only imports, allowlisted
relatives with no filesystem scan, the `gate.sh` listing, and a receipt
free of host paths. Fixtures are synthetic and tiny; no paper corpus or
network is touched.

<a id="boundaries"></a>
## Boundaries

Content-bound counts assume an honest external counter; the gate proves
binding and caps, not the counter's algorithm. The tokenizer pin is
advisory provenance. Site-private name screening stays with the W0-KIT
external policy; this gate scans only generic secret shapes. The
`{id}`-template lookup form, multi-mount merge identity, per-mount
params, and transitive offline analysis are documented non-claims. The
v2 ladder graph rules are vacuous (no ladder object exists in the
schema); any ladder key is an unknown field and fails.
