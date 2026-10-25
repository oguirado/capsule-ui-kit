# W0-CSS: token-set extractor for the UI router kit

`tools/extract_css.py` reconciles an allowlisted committed CSS token set
(`tokens.css`) against its source authority (`tokens.json`) and emits a
deterministic `css.tokens.v1` record: exported custom-property names,
token-set identity, permitted overrides, region anchors, and
`{path,symbol,name,line}` symbols. Offline, deterministic, stdlib only.

Reading map: `contract` (binding rows) -> `grammar` (admitted CSS) ->
`names` (derivation and alias gap) -> `modes` (override vocabulary) ->
`record` (output shape) -> `cli` (commands) -> `negatives` (refusal
oracles) -> `integration` (W0-NODES handoff).

<a id="contract"></a>
## Contract

Step E owns this surface to W0-CSS: `tools/extract_css.py`, its test and
this companion; pass is "all admitted token names/modes match", negative
is "missing or comment-only token fails". Per-file rules come from the
extractor contract (explicit allowlisted committed paths, sorted canonical
relative UTF-8 paths, no runtime scan, bytes hashed before decoding, no
symlink escape) and the CSS rows: one token-set node per file, each public
custom property routable, vendor variables never the source authority.
Anchors follow the paper's `symbol` role: exactly one
`{path,symbol,name,line}` row whose line contains the name, fail closed on
absent/duplicate/drifted evidence.

<a id="grammar"></a>
## Admitted CSS grammar

Anything outside this grammar is an explicit refusal, never a silent skip:

| Block | Form | Region |
|---|---|---|
| Base, exactly one | `:root { --name: value; ... }` | `region:base` |
| Scheme/contrast | `[data-theme-scheme="<s>"][data-theme-contrast="<c>"]` (either order) | `region:<s>.<c>` |
| Density | `[data-theme-density="<v>"]` | `region:density.<v>` |
| Text scale | `[data-theme-text-scale="<v>"]` | `region:scale.<v>` |
| Forced colors | `@media (forced-colors: active) { :root { ... } }` | `region:forced-colors` |
| Reduced motion | `@media (prefers-reduced-motion: reduce) { :root { ... } }` | `region:reduced-motion` |

Selectors are single-line; values admit literals and `var(--cuk-...)`
references to admitted names. Comments are stripped before parsing, so a
property defined only inside a comment is missing, reported
`(comment-only)`.

<a id="names"></a>
## Canonical names and the alias gap

Expected name for token path `tier.a.bC` is the authority prefix plus the
kebab-cased path: `semantic.surface.canvas` becomes
`--cuk-semantic-surface-canvas`. Derivation is total and collision-checked
on the real authority (340 leaves become 340 distinct names, longest 58
bytes). Short aliases consumed by Vue SFCs (`--cuk-border-default`,
`--cuk-selection-bg`) are not derivable from any token path and are
rejected as `E_CSS_UNKNOWN_TOKEN` until the token authority declares
them: known integration gap, no silent alias invention.

<a id="modes"></a>
## Override vocabulary

A leaf's `$value` requires exactly one `:root` declaration; each override
entry requires exactly one declaration in its region:

| Leaf key | Example | Region key |
|---|---|---|
| `modes` | `dark.high` (resolved scheme x admitted contrast) | `mode:dark.high` |
| `density` | `compact`, `regular`, `comfortable` | `density:<v>` |
| `scale` | `0.875`, `1`, `1.125`, `1.25` | `scale:<v>` |
| `forcedColors` | `active` (axis default excluded) | `forced:active` |
| `reducedMotion` | `reduce` (axis default excluded) | `motion:reduce` |

Mode keys are validated against the `axes` of the supplied `tokens.json`,
not a hardcoded list. Bare `[data-theme-scheme="dark"]`, mixed-axis
combos, and attribute selectors on the media-driven axes refuse.

<a id="record"></a>
## Record shape

The `css.tokens.v1` record carries `token_set` (CSS stem), `node_id`
(`css:<stem>`, pattern- and width-checked for corpus `ui`), `family`,
`prefix`, hashed `css` / `tokens_source` inputs, sorted `tokens` (each
with anchor `line` and per-region `defs`), sorted `modes`, sorted
`regions`, `anchors` (token names plus region ids, every anchor at most 64
bytes, all role `symbol`), sorted `symbols`, and `proposed_groups`: the
full anchor list chunked into at most 16 anchors per group
(`css:<stem>.p<N>`, shared family, never truncated) as the sharding
proposal W0-NODES finalizes. `--symbols` writes the same symbols as JSONL.

<a id="cli"></a>
## CLI

```sh
python3 tools/extract_css.py --css <tokens.css> --tokens <tokens.json> \
  --root <repo> [--allow <rel> ...] [--out record.json] [--symbols s.jsonl]
python3 tools/extract_css.py --css ... --tokens ... --out record.json --check
```

Inputs must be files under `--root` with canonical relative paths in the
allowlist (default: the two committed design paths; explicit `--allow`
replaces it). Any symlink on either input path refuses. `--check` prints
`identical` or `MISMATCH`. Exits: 0 ok, 4 refuse, 2 usage, 5 mismatch.

<a id="negatives"></a>
## Refusal oracles

| Code | Trigger |
|---|---|
| `E_CSS_INPUT_ABSENT`, `E_CSS_NOT_ALLOWLISTED`, `E_CSS_SYMLINK` | missing input, non-allowlisted or escaping path, symlink |
| `E_CSS_MISSING_TOKEN` | required name/region absent (`(comment-only)` when comment-held) |
| `E_CSS_UNKNOWN_TOKEN` | CSS defines a name outside the inventory (incl. aliases) |
| `E_CSS_UNADMITTED_MODE` | known name in a region its leaf does not declare |
| `E_CSS_DUPLICATE_TOKEN`, `E_CSS_DUPLICATE_REGION` | repeated definition or block |
| `E_CSS_VENDOR_AUTHORITY` | vendor-prefixed definition/reference or `dt(` value |
| `E_CSS_DANGLING_REF` | `var(--cuk-...)` outside the inventory |
| `E_CSS_UNSUPPORTED`, `E_CSS_UNEXPECTED_DECLARATION`, `E_CSS_DECODE` | foreign syntax, non-custom-property declaration, bad bytes/CR |
| `E_CSS_BAD_SET_ID`, `E_CSS_ANCHOR_WIDTH` | unusable stem/node id, anchor over 64 bytes |
| `E_TOKENS_SCHEMA`, `E_TOKENS_AXES`, `E_TOKENS_LEAF`, `E_TOKENS_MODE_KEY` | authority shape violations |
| `E_TOKENS_VALUE`, `E_TOKENS_JSON`, `E_TOKENS_DECODE` | bad literal, bad JSON/bytes |
| `E_TOKENS_DANGLING_REF`, `E_TOKENS_TIER_INVERSION`, `E_TOKENS_CYCLIC_REF` | broken `{ref}` graph |
| `E_TOKENS_VENDOR_LEAK`, `E_TOKENS_EMPTY`, `E_TOKENS_COLLISION` | vendor text in authority, zero leaves, name collision |

Precedence is inputs, then authority errors, then CSS structural errors in
file order, then duplicates, unknown names, unadmitted modes, and finally
missing pairs, each deterministic.

<a id="integration"></a>
## Integration

W0-NODES consumes the record plus `--symbols` output: `symbols` rows drop
directly into `catalogue/symbols.jsonl`, `proposed_groups` become the
`css:<stem>` family nodes with role-`symbol` anchors, and the hashed input
entries feed the provenance receipt. Test fixtures are small synthetic
cases built at runtime in tmp dirs (the `test_bootstrap_ui.py`
precedent): no committed fixture files, no real corpus paths.
