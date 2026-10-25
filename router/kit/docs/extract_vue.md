# W0-VUE: SFC extractor for the UI router kit

`tools/extract_vue.py` parses explicit allowlisted Vue SFC files (never a
repo scan) and emits one deterministic `ctx.vue-inventory.v1` record per
file: default component identity, public options bindings, named script
exports with JSDoc, owned template/script/style regions, and
`{path,symbol,name,line}` symbol rows for W0-NODES. Plain JS options API
only; no authored TS. Offline, deterministic, Python 3 stdlib only.

Reading map: `record` (output shape) -> `subset` (supported SFC/JS grammar)
-> `refusals` (error codes) -> `cli` (commands) -> `negatives` (test
oracles) -> `handoff` (what W0-NODES owns).

<a id="record"></a>
## Record

One canonical JSON file per input plus a merged `symbols.jsonl`:

```json
{"schema": "ctx.vue-inventory.v1", "tool": "extract_vue.py/1.0",
 "path": "ui/CapsulePanel.vue", "source_sha256": "<hex of raw bytes>",
 "component": {"identity": "options-name", "line": 12, "name": "CapsulePanel"},
 "bindings": [{"line": 16, "name": "emits"}],
 "exports": [{"jsdoc": "/** ... */", "kind": "function", "line": 8, "name": "apple"}],
 "regions": [{"block": "template", "end_line": 3, "start_line": 1}],
 "symbols": [{"line": 12, "name": "CapsulePanel", "path": "ui/CapsulePanel.vue",
              "symbol": "CapsulePanel"}]}
```

Symbols: the component under its own name, each options key as
`Component#key`, each named export under its name. Every row satisfies the
paper's resolver check: line `line` of `path` contains `name`, exactly one
row per `(path, symbol)` (P:1899). Bindings are sorted by name, exports by
name, regions in document order, symbol rows by `(path, symbol)`; inputs
are sorted before extraction, so bytes are stable regardless of argument
order. The component line is the `name:` value line, which always contains
the name.

<a id="subset"></a>
## Supported subset

Structure (lowercase tags, at most one block each, whitespace and HTML
comments allowed between blocks): optional `<template>` (no attrs or
`lang="html"`), exactly one `<script>` (no attrs or `lang="js"`), optional
`<style>` (no attrs, `scoped`, `module`, `lang="css"`). Any `src`
attribute refuses: anchors must live in the one file (P:317).

Script (tokenizer-based, comments/strings/templates/regex honored, so
template text and string/comment lookalikes never become exports):
`import` statements; `export default { ... }` options object or
`export default Ident` where `Ident` is a module-level `const` object
(exported or not); `export [async] function name`; `export const|let|var`
with plain identifiers (multi-declarator shares the statement JSDoc);
`export { a, b as c }` locals. Options keys: identifiers, plain string or
numeric keys, methods (incl. `async`, `get`/`set`, generators);
identifiers resolve only to values present in this file. The default
options object must carry a single- or double-quoted PascalCase `name:`
literal; filename-stem guessing is refused. Private top-level
`const|let|var|function|class|async function` declarations and directive
strings are skipped, not inventoried. Component basenames are PascalCase
`*.vue`; generic-name review stays a human gate. Files over 600 lines
refuse unless `--allow-long` records the explicit exception (§3).

<a id="refusals"></a>
## Refusals

| Code | Meaning |
|---|---|
| `E_PATH` | not an explicit allowlisted relative PascalCase `.vue` path; missing file, symlink, root escape, or duplicate input |
| `E_DECODE` | bytes are not strict UTF-8, or contain NUL |
| `E_SFC_STRUCTURE` | block/attribute violation, missing or duplicate script, over-long file, unparseable structure |
| `E_TS` | `lang="ts|typescript|tsx"` on the script block |
| `E_SCRIPT_SYNTAX` | anything outside the script subset: `setup`, call/default-function/unresolved defaults, `export *`, re-exports, computed/spread/duplicate keys, duplicate or destructured exports, executable top-level statements, non-literal names |
| `E_CHECK` | `--check` drift: a recorded output is missing or differs |

Bytes are hashed before decoding; extraction is all-or-nothing (a refusal
writes nothing). Exit codes follow kit convention: 0 pass, 4 refuse,
2 usage.

<a id="cli"></a>
## CLI

```sh
python3 tools/extract_vue.py --root <app-root> --out out/vue ui/CapsulePanel.vue
python3 tools/extract_vue.py --root <app-root> --out out/vue --check ui/CapsulePanel.vue
```

`--root` defaults to the working directory; outputs mirror the input
relative paths with `.json` appended, plus `symbols.jsonl`. `--check`
recomputes every byte and reports drift without writing.

<a id="negatives"></a>
## Negatives

`tests/test_extract_vue.py` (36 tests) uses small synthetic inline SFCs
(inline because the unit owns at most 3 files, so no separate fixture
directory): exact component/binding/export/region/symbol coordinates on a
reference SFC; export-list, identifier-default, multi-declarator, and
minimal shapes; a lookalike SFC proving template text, comments, strings,
template literals, regexes, and CSS never become exports; a 43-row refusal
table covering every code; the paper oracle that each symbol line contains
its name; all-or-nothing, sorted-input stability, `--check` pass/drift,
path escapes, symlinks, non-UTF-8, and the long-file gate via API and CLI;
plus hygiene (gate listing, no runtime scan, stdlib-only, size cap,
closed code set).

<a id="handoff"></a>
## Handoff

W0-NODES merges per-language records into `ctx.node.v2` JSONL, the
`id<TAB>path` lookup, the committed `symbols.jsonl`, and the
provenance/ownership receipt; W0-RESOLVE proves each anchor resolves
exactly once against current source. Nested option members (per-prop or
per-method rows), `<script setup>`, and non-CSS blocks stay refused until
a separately versioned extension exists.
