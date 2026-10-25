# W0-RESOLVE: UI symbol resolver and generic-mount gate

`tools/resolve_ui.py` resolves every node anchor through the mount's
generic lookup (`id<TAB>path`) and symbol inventory
(`{path,symbol,name,line}`): the unique current coordinate, name and
hash for each symbol. It binds every lookup file to its nodes'
`source_sha256` (freshness), enforces the single-corpus identity
contract (no duplicate IDs, no width overflow, no silent 32-byte
collisions, no clipped keys), enforces 100% scope coverage, and emits
one scope root's nodes, lookup and symbols alone so the kit routes on
its own. Offline, deterministic, Python 3 stdlib only.

Reading map: `contract` (binding rows) -> `inputs` (files and scope)
-> `resolve` (anchor rules) -> `identity` (width/collision/clipped)
-> `freshness` (hash and line binding) -> `coverage` (100% gate) ->
`kitalone` (per-root emission) -> `cli` (commands) -> `negatives`
(refusal oracles) -> `handoff` (honest boundaries).

<a id="contract"></a>
## Contract

Step E owns this surface to W0-RESOLVE: `tools/resolve_ui.py`, its
test and this companion; pass is "every anchor resolves exactly once",
negatives are "duplicate ID, stale line, escaping path, clipped key
refuses". Operator ruling U-DEC-0060 adds the coverage gate: every
file under the allowlisted UI roots
(`packages/capsule-ui-kit/**`, `app/shell/src/renderer-v2/**`,
`app/shell/src/design/**`, `books/ui-*`) maps to at least one node,
below 100 percent fails with the unrouted list, and the kit routes on
its own.

Per-file rules follow the extractor contract: explicit allowlisted
committed paths only, sorted canonical relative UTF-8 paths, no
recursive runtime scan, bytes hashed before decoding, no symlink
escape. Nodes follow the paper through the bootstrap: one lookup path
per node, anchors live in that one file, `len(corpus)+1+len(id)` <= 32
bytes, anchors <= 64 UTF-8 bytes, at most 16 anchors per node, never
clipped. The resolver reads committed files only and fails closed
when an input is missing.

<a id="inputs"></a>
## Inputs

* `--root ROOT`: repository root the relative paths resolve under.
* `--nodes UI.jsonl`: `ctx.node.v2` JSONL, sorted by id, one object
  per line, no blanks. Each node validates directly against the kit
  schema plus kind/role, width, anchor-count and nonempty-search
  checks. Kinds are `symbol` and `section` only.
* `--lookup ROUTES.tsv`: generic lookup, `id<TAB>path`, no header,
  sorted by id. Exactly two columns; IDs match the node charset.
* `--symbols SYMBOLS.jsonl`: merged inventory, exactly
  `{line,name,path,symbol}` per row, sorted by `(path, symbol)`. An
  all-section mount honestly carries zero rows (empty file).
* `--allowlist SCOPE.txt`: the coverage scope, one canonical relative
  path per line (strict: no blanks, no duplicates, no escapes). Every
  entry sits under a `--scope-root` prefix and exists as a file.
* `--scope-root R` (repeatable): scope roots; default is the four
  ruling roots. `--corpus` (default `ui`): the single mount corpus;
  every node must carry it.

<a id="resolve"></a>
## Resolution

The lookup yields one path per node id; the resolver signature is
`(path, anchor)` with `path` from the node's single lookup row:

* `symbol` anchor: passes when exactly one inventory row matches
  `(path, symbol)` and that row's line currently contains `name`.
  Duplicate rows refuse at load; a missing row is `E_ANCHOR`.
* `section`/`statement` anchor: passes when the lookup file contains
  exactly one `id="<anchor>"`. Zero or several is `E_ANCHOR`.
* Any other role (`asset`, `scene`, ...) refuses with `E_ROLE`: engine
  resolvers are out of scope for the UI mount, and a DOM layout path
  is not an engine scene.

`resolve_symbol(rows, root, path, symbol)` exposes the same lookup to
importers: it returns the unique current
`{path,symbol,name,line,sha256}` or raises the same refusal the gate
would report.

<a id="identity"></a>
## Identity: width, collision, clipped keys

* Duplicate node or lookup IDs refuse with `E_DUPLICATE_ID`;
  duplicate `(path, symbol)` rows or duplicate anchors within one
  node refuse with `E_DUPLICATE`.
* Every node id appears in the lookup exactly once and every lookup
  id names exactly one node; either direction dangling is `E_LOOKUP`.
* Merged IDs wider than 32 bytes refuse with `E_WIDTH`, never clip.
  Distinct IDs sharing a 32-byte cutkey refuse with `E_COLLISION`
  first, since they would merge silently under the pilot's cut.
* A dangling lookup id that is a strict prefix of a node id is
  diagnosed as a clipped key (`E_CLIPPED`); any other dangle is
  `E_LOOKUP`.
* Nodes, lookup and symbols must arrive in canonical sorted order
  (`E_ORDER`), matching what the composer emits.

<a id="freshness"></a>
## Freshness

Each lookup file is read once: bytes are hashed before decoding, and
the digest must equal every node's `source_sha256` on that path
(`E_STALE` on drift). Every inventory row's line must contain its
name (`E_LINE_DRIFT`, including out-of-range lines). Non-UTF-8 or
NUL-bearing files refuse with `E_DECODE`; absolute, escaping,
missing or symlink-crossing paths refuse with `E_PATH`.

<a id="coverage"></a>
## Coverage

Every allowlisted scope file must appear in the lookup (at least one
node); the gate fails with `E_COVERAGE` and the sorted unrouted list
otherwise, in both the error string and the receipt's
`checked.unrouted`. Lookup paths must sit under the scope roots and
inside the allowlist (`E_SCOPE`); nothing is routed that the
allowlist does not govern.

<a id="kitalone"></a>
## Kit alone

`--emit-scope-root R --out DIR` (with `R` one of the scope roots)
writes the nodes, lookup and symbols for that root alone as
`ui.nodes.jsonl`, `routes.tsv` and `symbols.jsonl`: the same names
and byte shapes the composer emits, so a consumer repo can copy the
kit directory with its routing and build or gate it directly. The
receipt's `emit` block records the root, counts and per-file digests.
`--check` verifies the three files byte-identical instead of writing
(`E_CHECK` on drift). Emission runs only on a passing gate.

<a id="cli"></a>
## CLI

```sh
python3 tools/resolve_ui.py --root . --nodes catalogue/ui.nodes.jsonl \
  --lookup catalogue/routes.tsv --symbols catalogue/symbols.jsonl \
  --allowlist scope/ui.txt
python3 tools/resolve_ui.py --root . --nodes catalogue/ui.nodes.jsonl \
  --lookup catalogue/routes.tsv --symbols catalogue/symbols.jsonl \
  --allowlist scope/ui.txt --emit-scope-root packages/capsule-ui-kit/ \
  --out out/kit-routes
python3 tools/resolve_ui.py --root . --nodes catalogue/ui.nodes.jsonl \
  --lookup catalogue/routes.tsv --symbols catalogue/symbols.jsonl \
  --allowlist scope/ui.txt --emit-scope-root packages/capsule-ui-kit/ \
  --out out/kit-routes --check
```

Exit 0 pass, 4 refuse, 2 usage. Stdout carries one canonical
`ctx.ui-resolve.v1` receipt: schema, tool, pass flag, errors,
`checked` counts and the optional `emit` block. No timestamps, PIDs,
host paths or secret text. `run()` never writes; only the CLI writes
emission outputs, and only on pass without `--check`.

<a id="negatives"></a>
## Negatives

The test pins one refusal per gate: duplicate node/lookup IDs,
duplicate symbol rows and duplicate in-node anchors; over-wide IDs
and anchors; colliding ID pairs; clipped and dangling lookup IDs;
malformed, blank, empty and unsorted inputs; bad node shape, corpus,
kind, role mix and empty search; stale sha and drifted, moved,
removed or out-of-range lines; unresolved and miscounted anchors;
non-UTF-8, missing, escaping, absolute and symlink-crossing paths;
out-of-roots and out-of-allowlist lookup paths; orphan symbol rows;
unrouted scope files (one and several); foreign emit roots; tampered
`--check` bytes; and every usage error. The positive fixture routes
one file under each of the four ruling roots.

<a id="handoff"></a>
## Handoff and honest boundaries

* Single-corpus only: mixed node corpora refuse, and no multi-mount
  merge or per-mount params exist here.
* Symbol and section roles only; `asset`/`scene` refuse. No engine,
  DOM-handle or live-service coordinate is accepted.
* The receipt reports the first refusal, deterministically ordered
  (loads, collision, width, identity, scope, coverage, freshness,
  anchors), not an exhaustive list.
* Unreferenced inventory rows validate (live line, covered path) but
  do not fail: minimality belongs to the composer, resolvability to
  this gate.
* Fixtures are inline and synthetic: the four-file mount plus
  single-file and book-only mounts in `tests/test_resolve_ui.py`. A
  future `tests/fixtures/resolve_ui/` directory can host them on
  disk without changing the contract.
