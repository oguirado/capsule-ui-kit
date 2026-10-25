# W0-JS: JS + JSDoc public-inventory extractor

`tools/extract_js.py` extracts the routable public surface of one allowlisted
set of Holdings shell modules: named and default exports, re-export edges,
file-level public JSDoc typedefs, and process-boundary metadata. Offline,
deterministic, Python 3 stdlib only. Exit codes follow kit convention:
0 admit, 4 refuse, 2 usage.

Reading map: `contract` (inputs, outputs, all-or-nothing) ->
`syntax` (admitted export forms) -> `refusals` (refusal taxonomy) ->
`records` (language-record and symbol-row schemas) -> `boundary`
(process-boundary metadata) -> `cli` (commands) -> `negatives`
(documented gaps and H2-M deviations).

<a id="contract"></a>
## Contract

Explicit allowlisted committed paths only: `--root` plus an `--allow` file
listing one canonical relative path per line. No glob, no walk, no recursive
scan at runtime; the tool fails closed on blank, absolute, escaping,
backslash, duplicate, or out-of-scope entries. Scope is exactly
`app/shell/src/(main|preload|renderer|renderer-v2|worker|shared)/**/*.js`,
the same rooted scope as the in-repo H2-M inventory.

Per file the tool reads bytes, enforces the byte cap, hashes before decoding
(strict UTF-8), and refuses symlink escapes: the real path must stay under
the real root. All detection runs on comment/string-masked code, so prose can
never trigger or hide a rule; masked offsets map 1:1 to the source for exact
line and byte spans.

All-or-nothing: outputs are written only when every allowlisted file admits.
One refusal poisons the run and nothing is written. Outputs are canonical
JSON (`sort_keys`, compact separators, one record per line, files sorted):
a language-record JSONL plus a `{path,symbol,name,line}` symbol JSONL that
feeds `catalogue/symbols.jsonl` via W0-NODES. A JSON summary always goes to
stdout with sorted errors and counts only (no timestamps or host paths).

Size note: the tool is a single ~1,190-line file because the W0 row mandates
one tool file; that is the explicit exception above 600 lines. It is
organized as small single-purpose functions (lexer, one parser per export
form, typedef scanner, boundary scanner, runner); the largest is ~60 lines.

<a id="syntax"></a>
## Admitted syntax

ESM only, no TypeScript sources. The admitted set mirrors the in-repo H2-M
raw-span grammar:

| Form | Row |
|---|---|
| `export function Name`, `export async function Name` | kind `function` |
| `export class Name` | kind `class` |
| `export const\|let\|var` with plain identifier declarators | kind `const`/`let`/`var`, one row per declarator sharing the span |
| `export { A, B as C }` (brace lists may span lines) | kind `local`, `local` set only when aliased |
| `export { ... } from './m.js'`, incl. `default` entries | kind `reexport` (`default` when the exported name is `default`), `from` set |
| `export * as NS from './m.js'` | kind `namespace`, `from` set |
| `export default function\|class Name` (async admitted) | kind `default`, `name` is `default`, `local` is the name |
| `export default Identifier` | kind `default`, `local` is the identifier |
| `export {}` | valid, declares nothing, zero rows |

Statement spans extend through function/class bodies. Doc absorption mirrors
H2-M line for line: contiguous `@decorator` lines directly above, then one
adjacent block comment ending on the line above; the upward scan stops at the
first line containing `/*` and reports JSDoc only when that line contains
`/**`. A bare `import.meta` line is not an edge, and `export ... from`
sources live on the export rows, never in an import list.

<a id="refusals"></a>
## Refusals

Every refusal is `E_JS_<CODE> <path>:<line> <detail>` with the trigger line
(`:0` for file-level errors). Comment-only or ambiguous evidence refuses;
clean entry files with no exports admit with an empty export list so their
boundary metadata is still recorded.

| Code | Trigger |
|---|---|
| `E_JS_ALLOWLIST` | unreadable/non-UTF-8 allowlist; blank, untrimmed, absolute, escaping, backslash, or duplicate entry |
| `E_JS_SCOPE` | well-formed path outside `app/shell/src/<context>/**/*.js` |
| `E_JS_SYMLINK` | real path escapes the real root |
| `E_JS_MISSING` | allowlisted path is not a file |
| `E_JS_BYTES` | file exceeds 262,144 bytes (H2-M parity) |
| `E_JS_UTF8` | file is not strict UTF-8 |
| `E_JS_COMMENT_ONLY` | zero export rows but export-like text in comments/strings |
| `E_JS_AMBIGUOUS_STAR` | bare `export * from` (owners not enumerable; see deviations) |
| `E_JS_COMMONJS` | `module.exports`, `exports.`/`exports[` in code |
| `E_JS_EXPORT_EQUALS` | `export =` |
| `E_JS_DEFAULT` | anonymous or complex default export (`export default function (`, `export default 42`) |
| `E_JS_DESTRUCTURE` | destructured declarators (`export const {a} = o`) |
| `E_JS_DUPLICATE` | two rows with the same exported name (real ESM rejects these too) |
| `E_JS_TYPESCRIPT` | enforced TS subset: `import type`, `export type/interface`, `interface/enum/namespace` declarations, `type X =`, `declare <decl>`, `abstract class`, `implements/satisfies <Name>`, `as const`, declarator-head `:`, exported-function param/return annotations |
| `E_JS_DYNAMIC` | `eval(`, `new Function(` in code |
| `E_JS_SYNTAX` | anything else unrecognized: generators, missing names/bodies, unbalanced literals, broken ASI lines, `const` without initializer, exports off the top level |
| `E_JS_TOO_MANY` | more than 500 export rows in one file (H2-M parity) |

<a id="records"></a>
## Record schemas

Language record (`holdings.w0.js-file/v1`), one per file per line:

```json
{"boundary": {"context": "main", "markers": [], "node_imports": ["node:crypto"]},
 "exports": [{"from": null, "jsdoc": true, "kind": "function", "line": 21,
              "local": null, "name": "alphaDouble",
              "span": {"end_byte": 566, "end_line": 23, "sha256": "…",
                       "start_byte": 388, "start_line": 16}}],
 "file": "app/shell/src/main/fix-alpha.js", "file_sha256": "…",
 "schema": "holdings.w0.js-file/v1",
 "typedefs": [{"line": 10, "name": "AlphaState", "props": ["revision", "label"]}] }
```

Span bytes are sliced from the raw file bytes (`raw[start:end]`, digest
checked); `line` is the 1-based line of the exported name (each brace entry
and declarator keeps its own occurrence line). Only `@typedef` blocks at
brace depth 0 are public; each records its name, tag line, and `@property`
root names in source order. Nested-brace typedef type expressions
(`{{id: bigint}}`) and optional `[name]` properties are handled.

Symbol row (paper keys only, for `symbols.jsonl`): exactly
`{line, name, path, symbol}` per export row, where `symbol` is the exported
name and `name` is the local binding (identity when unaliased). Typedefs
stay in the language record; W0-NODES joins them by file and line when it
needs type anchors.

<a id="boundary"></a>
## Process-boundary metadata

`boundary.context` is the path segment (`main`, `preload`, `renderer`,
`renderer-v2`, `worker`, `shared`; `renderer-v2` kept distinct).
`markers` is the sorted unique subset of `{contextBridge, ipcMain,
ipcRenderer, postMessage, MessagePort, parentPort, workerData, require,
electron}` found as words in masked code (`electron` from module
specifiers, `require` from calls). `node_imports` lists sorted unique
`node:*` specifiers from masked `from`/`import`/`require` positions; the
specifier string is read from the source at the masked offset, so prose
and identifier uses of `from` can never qualify.

<a id="cli"></a>
## CLI

```sh
python3 tools/extract_js.py --root <repo> --allow <paths.txt> \
  --out <records.jsonl> --symbols <symbols.jsonl>
python3 -B -m unittest discover -s tests -p test_extract_js.py
```

`--max-bytes` and `--max-exports` override the caps (positive integers).
A missing root or bad caps exit 2; any refusal exits 4 with no outputs.

<a id="negatives"></a>
## Documented negative knowledge

Deviations from the H2-M sibling, all deliberate: bare `export * from`
refuses here because `symbols.jsonl` needs enumerable names while H2-M
keeps a raw `*` row (no in-scope file uses it); `declare` refuses only
before declaration keywords so a plain identifier named `declare` still
admits. Known gaps, same class as H2-M's documented partial TypeScript
recognition: `extends` expressions are not validated (so `extends Array<T>`
is missed); continued `=`/`:` lines after a complete line are admitted
without full expression validation; non-export code is unchecked except
for the global refusal markers; `@callback`, `@template`, and inline
object-shape tags are not profiled; markers inside template holes are not
recorded. The regex-vs-division decision is the standard
previous-token heuristic (`)` favors division); `?.` and `??` never read
as annotations. A property or method literally named `export` inside a
block is correctly ignored; a real export statement off the top level
refuses.
