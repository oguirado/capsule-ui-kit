# W0-NODES: UI node composer for the router kit

`tools/extract_ui.py` composes per-language inventory records (vue/js/css/rust)
plus kit Markdown blocks into validated `ctx.node.v2` JSONL, a sorted generic
lookup (`id<TAB>path`), a sorted `{path,symbol,name,line}` symbol inventory,
and a separate closed provenance/ownership receipt. It enforces full scope
coverage (every allowlisted file maps to at least one node) and refuses
removed public anchors against a committed history, even after an honest
rehash. Offline, deterministic, Python 3 stdlib only.

Reading map: `contract` (binding rows) -> `inputs` (records, books, scope)
-> `compose` (node IDs, sharding, search) -> `outputs` (four artifacts)
-> `history` (removed-anchor rule) -> `coverage` (100% gate, kit-alone)
-> `cli` (commands) -> `negatives` (refusal oracles) -> `handoff`.

<a id="contract"></a>
## Contract

Step E owns this surface to W0-NODES: `tools/extract_ui.py`, its test and
this companion; pass is "full inventory coverage and stable bytes", negative
is "removed public export after honest rehash still fails". Operator ruling
U-DEC-0060 adds the coverage gate: every file under the allowlisted UI roots
(`packages/capsule-ui-kit/**`, `app/shell/src/renderer-v2/**`,
`app/shell/src/design/**`, `books/ui-*`) maps to at least one node, below
100 percent fails with the unrouted list, and the kit routes on its own.

Per-file rules come from the extractor contract: explicit allowlisted
committed paths only, sorted canonical relative UTF-8 paths, no recursive
runtime scan, bytes hashed before decoding, no symlink escape. Nodes follow
the paper through the bootstrap: one lookup path per node, anchors live in
that one file, `len(corpus)+1+len(id)` <= 32 bytes, anchors <= 64 UTF-8
bytes, at most 16 anchors per node, never clipped.

<a id="inputs"></a>
## Inputs

* `--allowlist SCOPE.txt`: the coverage scope, one canonical relative path
  per line (strict: no blanks, no duplicates, no escapes). Every entry must
  sit under a `--scope-root` prefix (default: the four ruling roots) and
  must exist as a committed file.
* `--record REC.json|jsonl` (repeatable): language records, one JSON object
  or JSONL (a top-level list is also accepted), dispatched by `schema`:
  `ctx.vue-inventory.v1`, `holdings.w0.js-file/v1` (symbols derived from
  `exports` exactly as the JS unit derives them), `css.tokens.v1`
  (`proposed_groups` honored after validation, `tokens_source` sha-bound as
  an auxiliary), `ctx.rust-extract.v1` (one node per `.rs` file with public
  symbols, `Cargo.toml` sha-bound as an auxiliary, failed receipts refused).
* `--md BOOK.md` (repeatable): companion books parsed with the kit parser
  (`blocks.blocks_from_text` for `pm.search.v1`, `ANCHOR_RE` for section
  anchors). Books contribute section nodes and lookup rows, never symbol
  rows.
* `--history PROV.json` (optional): the previous committed
  `ctx.ui-provenance.v1` for the removed-anchor check.

Auxiliary inputs (`tokens.json`, `Cargo.toml`, history, scope file) are
sha-bound in provenance and need no node. Listing an auxiliary in scope
fails coverage explicitly. Every record sha is rehashed against current
bytes (`E_STALE` on drift) and every symbol line is re-verified to contain
its name (`E_LINE_DRIFT`).

<a id="compose"></a>
## Composition

One evidence set per primary file (duplicate paths refuse). Node IDs are
deterministic, semantic and collision-checked:

| Kind | Base node ID | Node kind | Anchors |
|---|---|---|---|
| Vue SFC | `vue:<Stem>` | symbol | record symbols, role `symbol` |
| JS module | `js:<stem>` | symbol | derived exports, role `symbol` |
| CSS token set | record `node_id` | symbol | token/region names, role `symbol` |
| Rust module | `rs:<crate>.<stem>` | symbol | record symbols, role `symbol` |
| Book | `doc:<stem>` | section | HTML ids, role `section` |

Files with more than 16 anchors shard into `<base>.p0`, `<base>.p1`, ...
sharing one family and one lookup path (CSS `proposed_groups` are used
verbatim once validated); nothing is truncated. Titles and purposes derive
from stems and labels under the schema caps. Symbol nodes take triggers
from sorted anchor names and keywords from stem and kind; books take
triggers/keywords/tasks/questions/exclusions/problem-names from their
`pm.search.v1` block, or stem/anchor fallbacks when the block is absent.
Every node is validated directly against `ctx.node.v2` with the kit
`jsonschema_lite` validator plus width, count and nonempty-search checks.

<a id="outputs"></a>
## Outputs

`--out DIR` receives four deterministic artifacts (canonical JSON,
sort-keys, LF; lookup sorted by id, symbols by `(path, symbol)`):

* `ui.nodes.jsonl`: the composed nodes, one per line, sorted by id. Feed it
  to `build_index_v2.py --nodes` (promote to `catalogue/ui.nodes.jsonl`).
* `routes.tsv`: generic lookup, `id<TAB>path`, no header, trailing newline
  (promote to `catalogue/routes.tsv`; the entry gate accepts arity 2).
* `symbols.jsonl`: merged language symbols only, paper keys
  `{line,name,path,symbol}` (promote to `catalogue/symbols.jsonl`).
* `provenance.json`: closed `ctx.ui-provenance.v1` receipt: corpus, scope
  roots, per-file sha/kind/node list, auxiliaries, node/symbol counts,
  output digests, sorted `anchor_index`, history binding, and the coverage
  tally. No timestamps, PIDs or host paths.

Stdout always carries a canonical `ctx.ui-extract.v1` receipt with sorted
errors and counts. Refusals write nothing (all-or-nothing); `--check`
recomputes every byte and reports drift without writing.

<a id="history"></a>
## Removed-anchor history

`anchor_index` (sorted `path<TAB>symbol` rows) is the committed baseline.
With `--history`, any baseline entry missing from the current composition
fails with `E_REMOVED_ANCHOR` and the sorted removed list, even when every
record sha honestly matches current bytes. Additions pass. On refusal
nothing is overwritten, so the old committed history is preserved; a
deliberate removal re-baselines by running without `--history` and
committing the new outputs as the new history.

<a id="coverage"></a>
## Coverage and kit-alone routing

Coverage is `scope` versus lookup paths: any scope member without a node
fails with `E_COVERAGE` and the sorted unrouted list. Scope members must
fall under the configured `--scope-root` prefixes; evidence outside scope
fails with `E_SCOPE`. The kit routes on its own by scoping to it alone:

```sh
python3 tools/extract_ui.py --root <repo> --allowlist scope_kit.txt \
  --scope-root packages/capsule-ui-kit/ --record kit.jsonl --out out/kit
```

The emitted nodes and lookup cover only kit paths, so a consumer repo can
copy the kit directory with its routing.

<a id="cli"></a>
## CLI

```sh
python3 tools/extract_ui.py --root <repo> --allowlist scope.txt \
  [--scope-root <prefix> ...] [--record rec.jsonl ...] [--md book.md ...] \
  [--history provenance.json] [--corpus ui] --out out/ui
python3 tools/extract_ui.py ... --out out/ui --check
python3 -B -m unittest discover -s tests -p test_extract_ui.py
```

Exit codes follow kit convention: 0 pass, 4 refuse, 2 usage. `--root` and
`--allowlist`/`--out` are required; `--corpus` defaults to `ui`.

<a id="negatives"></a>
## Refusal oracles

| Code | Trigger |
|---|---|
| `E_SCOPE` | bad/duplicate/empty scope entry, entry outside scope roots, evidence outside scope |
| `E_RECORD` | unreadable record shape, unknown schema, missing keys, failed rust receipt, non-JSON tokens authority |
| `E_PATH` | missing file, symlink, root escape, non-`.md` book, unreadable input |
| `E_DECODE` | bytes are not strict UTF-8, or contain NUL |
| `E_STALE` | record sha does not match current bytes (re-extract first) |
| `E_LINE_DRIFT` | symbol line does not contain its name |
| `E_DUPLICATE` | duplicate input/record path, duplicate `(path, symbol)`, duplicate book anchor |
| `E_DUPLICATE_ID` | two files derive the same node ID |
| `E_ID` | derived ID outside the node pattern (bad stem characters) |
| `E_WIDTH` | ID span over 32 bytes, anchor over 64 bytes, title/purpose/keyword overflow |
| `E_NO_ANCHORS` | file with no public anchors (zero exports, anchorless book) |
| `E_GROUPS` | CSS sharding proposal empty, over cap, overlapping or not covering anchors |
| `E_BLOCK_JSON` | malformed PM block JSON or out-of-contract `pm.search.v1` content |
| `E_SCHEMA` | composed node rejected by `ctx.node.v2` |
| `E_COVERAGE` | scope file without a node, with the unrouted list |
| `E_REMOVED_ANCHOR` | baseline anchor missing from the current composition |
| `E_HISTORY` | history file unreadable, not JSON, or wrong schema |
| `E_CHECK` | `--check` drift: recorded output missing or differing |

`tests/test_extract_ui.py` (44 tests) builds small synthetic repos in tmp
dirs (the `test_bootstrap_ui.py` precedent): clean five-kind composition
with independent schema/width/sha re-verification, sorted lookup/symbols
oracles, closed provenance with digests, stable bytes under reordered
inputs, `--check` pass/drift, real `build_index_v2` consumption with
byte-identical manifests, 16-anchor sharding plus honored CSS groups,
every width/duplicate/empty refusal, stale/drift/history negatives
including removed-after-honest-rehash with preserved outputs, block
composition plus malformed/duplicate/foreign negatives, full and gapped
coverage, kit-alone routing, strict scope entries, CLI pass/refusal/usage,
a real `extract_vue` interop case, and hygiene (gate listing, no runtime
scan, stdlib-only, closed code set).

Size note: the tool is a single ~900-line file because the W0 row mandates
one tool file; that is the explicit exception above 600 lines. It is
organized as small single-purpose functions (one adapter per schema, one
composer, one history check, one runner); the largest is ~90 lines.

<a id="handoff"></a>
## Handoff

W0-RESOLVE proves each anchor resolves exactly once against current source
and owns the generic anchor/lookup/width/collision/freshness gate;
W0-ENTRY qualifies the promoted mount (generic lookup arity 2 is already
accepted). New languages add one adapter plus records; new books are
`--md` inputs. Retired anchors re-baseline history; never edit provenance
by hand.
