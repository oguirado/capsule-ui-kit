# W0-WEB: governance adapter and conservative stale/overflow wrapper

`tools/router_web.py` resolves every `ctx.shortlist.v2` row through
committed collision-checked metadata and publishes a separate richer
resolution record under the versioned web contract
`ctx.web-resolution.v1`. The engine shortlist is never edited in place
and never gains unknown fields. The `wrap` subcommand publishes a
router process outcome (including the `E_STALE` exit) as a typed
failure record that retains the original exit and never fabricates
rows. Only a fully `ok` record authorizes editing, and only through
`authorizes_edit` / the `authorize` subcommand. Offline,
deterministic, Python 3 stdlib only.

Reading map: `contract` (binding rows) -> `inputs` (files) ->
`governance` (governor file) -> `record` (web schema) -> `resolve`
(binding rules) -> `tieorder` (comparator check) -> `wrap` (process
outcomes) -> `authorize` (editing gate) -> `cli` (commands) ->
`negatives` (refusal oracles) -> `handoff` (honest boundaries).

<a id="contract"></a>
## Contract

Step E owns this surface to W0-WEB: `tools/router_web.py`, its test
and this companion; pass is "retained ix/pr and metadata agree",
negatives are "stale/overflow/ambiguous record cannot authorize
editing". Bootstrap section 8 closes each web/management conflict
conservatively: missing governors or digests never become actionable
context, `overflow:true` is a non-actionable refusal with preserved
evidence, a stale exit is a typed failure rather than "no results"
success, and unverifiable tie order or clipped merged ids never merge
silently.

Per-file rules follow the extractor contract: explicit allowlisted
committed paths only (every file read is named on the command line;
the lookup itself is the path allowlist), sorted canonical relative
UTF-8 paths, no recursive runtime scan, bytes hashed before decoding,
no symlink escape. Only cited rows are read; uncited files cannot
affect a cited binding. The resolver reads committed files only and
fails closed when an input is missing.

<a id="inputs"></a>
## Inputs

* `--root ROOT`: repository root the relative paths resolve under.
* `--shortlist S.json`: one `ctx.shortlist.v2` envelope, validated
  strictly (required keys, 16-hex `ix`/`pr`/`q`, known intent,
  well-shaped abstention, at most 20 rows, `overflow` exactly true
  when present). Unknown top-level fields refuse: the engine output
  shape is closed.
* `--nodes UI.jsonl`: `ctx.node.v2` JSONL, sorted by id, validated
  directly against the kit schema plus kind/role, width, anchor-count
  and nonempty-search checks. Kinds are `symbol` and `section` only.
* `--lookup ROUTES.tsv`: generic lookup, `id<TAB>path`, no header,
  sorted by id. Exactly two columns; IDs match the node charset.
* `--symbols SYMBOLS.jsonl`: merged inventory, exactly
  `{line,name,path,symbol}` per row, sorted by `(path, symbol)`.
  Duplicates refuse at load: ambiguity in the metadata refuses the
  whole record, not one row.
* `--governance GOV.json`: the `ctx.web-governance.v1` file (see
  below); every cited id needs a governor.
* `--index DIR`: the routed index directory; its `ID` file must agree
  with the retained `ix`.
* `--params PARAMS.json`: the router params file; `sha16` of its exact
  bytes must agree with the retained `pr`. Missing params refuse:
  there is no sentinel-`pr` success path here.
* `--corpus` (default `ui`): the single mount corpus; nodes,
  governance and every binding must carry it.

<a id="governance"></a>
## Governance file

`ctx.web-governance.v1` is the reviewed versioned half of the web
contract this unit proposes (the cross-product schema/API was AUSENTE,
so cross-product interop stays blocked until ratification):

```json
{"schema": "ctx.web-governance.v1", "version": 1, "corpus": "ui",
 "entries": [{"governor": "team/ui", "id": "js:drawer"}]}
```

Keys are closed, `version` is exactly 1, entries are sorted by id
with no duplicates, and governors match `[A-Za-z0-9._:/-]{1,64}`.
The profile half comes from the params file (`P0`/`P1`/`P2`,
default `P0`) and is recorded on every resolved record, so a
foreign-corpus params file either mismatches `pr` or is visibly
labelled, never silently adopted.

<a id="record"></a>
## Resolution record

`ctx.web-resolution.v1`, canonical JSON, one object:

* Identity retained verbatim from the shortlist: `ix`, `pr`, `q`,
  `intent`, `router`, `abstain`, `overflow`. Retention is evidence,
  not agreement: agreement is checked separately (see below).
* `outcome`: `resolved` (the shortlist was honestly resolved to
  evidence) or `refused` (the adapter could not bind it).
* `reason`: the closed outcome code (`ok`, `abstained`, `overflow`,
  `uncalibrated`, `empty`, `tie_order`, `ambiguous`, `collision`,
  `stale`, `unresolved`, `clipped`, `width`, `role`,
  `missing_governance`, `ix_mismatch`, `pr_mismatch`, `bad_input`,
  `stale_exit`, `budget_exit`, `engine_input`, `engine_usage`,
  `engine_exit_N`).
* `actionable`: true only when the reason is `ok`.
* `profile`, `router_exit` (set by `wrap` only), `rows`, `errors`.
* Each bound row carries full identity (`id`, `key` = `corpus:id`,
  `anchor`, `score`, retained `why`), governor, source coordinates
  (`path`, `line` for symbols, null for sections) and digest
  (`sha256` of the bytes read now), plus its `evidence` status and a
  `detail` string when not `ok`.

<a id="resolve"></a>
## Resolve: binding rules

1. `ix`/`pr` agreement first: if the retained `ix` disagrees with the
   index `ID`, or the retained `pr` disagrees with `sha16` of the
   params bytes, the record is `refused` with no bound rows. Rows are
   never bound across index or params generations.
2. Metadata integrity next: any duplicate, order, schema, width,
   collision or clipped-key failure in nodes/lookup/symbols/
   governance refuses the whole record (`bad_input`, no rows). The
   metadata is untrustworthy as a whole, not per row.
3. Shortlist level, in check order: abstention -> overflow ->
   uncalibrated -> empty -> tie order -> duplicate cited row -> cited
   collision. Overflow and abstention still resolve every row as
   evidence; nothing is trimmed and no reason is overwritten by a
   later check.
4. Row level, in shortlist order: width, node/lookup presence (a cited
   id that strictly prefixes a node id is `clipped`, otherwise
   `unresolved`), anchor declared by the node, supported role,
   freshness (live file sha equals the node `source_sha256`,
   otherwise `stale`, including missing/unreadable files), symbol
   inventory pin (missing row `unresolved`, drifted line `stale`) or
   section occurrence count (zero `unresolved`, several `ambiguous`),
   then governor presence. The first failing row in shortlist order
   sets the record reason when no earlier check fired.

<a id="tieorder"></a>
## Tie order

An equal-score run is verifiable only when the observed order equals
both the canonical byte sort and the natural sort of its ids.
Numeric-looking mixed ids (`w:a2` vs `w:a10`) discriminate the two
comparators, so a tie over them cannot prove which comparator
produced it and the record is `tie_order`, non-actionable. Distinct
scores ignore order entirely; agreeing ties stay actionable.

<a id="wrap"></a>
## Wrap: process outcomes

`wrap --exit N` publishes the router process outcome. A nonzero exit
becomes a row-less typed failure (`5` -> `stale_exit`, `6` ->
`budget_exit`, else the engine code retained verbatim in
`router_exit` and the reason), with the optional one-line `--error`
detail preserved. A stale or missing file is therefore never "no
results" success. Exit `0` delegates to full resolution and records
`router_exit: 0`. Passing `--shortlist` with a failed exit is a
usage error: a failed run and a shortlist are contradictory evidence
and are never mixed.

<a id="authorize"></a>
## Authorize: the only editing gate

`authorizes_edit(record)` returns true only for a consistent fully
`ok` record: resolved outcome, `actionable` true, reason `ok`, no
overflow, well-formed retained identity (`ix`/`pr`/`q`,
intent, router, profile), unflagged calibrated abstention (`none` or
`exact_id`), and a nonempty row list with `ok` evidence on every row.
Flipping the flag alone, or an `ok` reason over a bad row, never
authorizes. The `authorize` subcommand prints a verdict (`authorizes`,
`reason`) and exits 0 only when editing is authorized, 4 for a valid
but non-authorizing record, 2 for a malformed record file.
Re-running `resolve` at decision time proves freshness; `authorize`
re-validates record consistency, not live files.

<a id="cli"></a>
## CLI

```sh
python3 tools/router_web.py resolve --root . --shortlist out/s.json \
  --nodes catalogue/ui.nodes.jsonl --lookup catalogue/routes.tsv \
  --symbols catalogue/symbols.jsonl --governance catalogue/governance.json \
  --index catalogue/router --params catalogue/router/params.json \
  [--corpus ui] [--out out/web.json]
python3 tools/router_web.py wrap --exit 5 --error E_STALE [--out out/web.json]
python3 tools/router_web.py wrap --exit 0 <same resolve inputs>
python3 tools/router_web.py authorize --record out/web.json
```

Every command prints canonical JSON to stdout; `--out` writes the
same bytes. Exit 0 means actionable/authorized, 4 means an honest
non-actionable record or refusal, 2 means usage error.

<a id="negatives"></a>
## Negatives

Each refusal below has a committed oracle in `test_router_web.py`
(fixtures and oracles first, synthetic inline sources, pinned line
numbers): overflow keeps every row but cannot authorize; abstained,
uncalibrated and empty shortlists refuse; stale source, drifted
inventory line and missing backing file are `stale`; doubled section
anchors and duplicate cited rows are `ambiguous`; unknown ids and
undeclared anchors are `unresolved`; strict-prefix cited ids are
`clipped`; over-wide cited ids are `width`; missing governors refuse;
discriminating ties refuse in either order while agreeing ties and
untied rows pass; cited and metadata collisions refuse; `ix`/`pr`
mismatch binds no rows; missing params/index/shortlist refuse; the
stale wrapper fabricates no rows and contradicts no shortlist;
forged flags, bad rows, empty rows and foreign schemas never
authorize. The input shortlist bytes are asserted untouched.

<a id="handoff"></a>
## Handoff

Single-corpus mounts only; symbol/section roles only; one reason per
record (first failure in deterministic check order, every row still
carries its evidence). The `ctx.web-resolution.v1` /
`ctx.web-governance.v1` contracts are this unit's versioned proposal
for the AUSENTE web schema: honest inside this kit, not a ratified
cross-product grant. No routing quality is claimed; freshness holds
at resolve time and must be re-proven after any repository update.
