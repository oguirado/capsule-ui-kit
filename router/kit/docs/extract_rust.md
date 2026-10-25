# W0-RUST: Rust public-surface extractor

`tools/extract_rust.py` extracts a crate's public items with qualified
module paths, the declared cfg profile, and a Rust-authority ownership
receipt. Allowlisted files only, offline, deterministic, stdlib only.

Reading map: `contract` (inputs/outputs) -> `grammar` (supported Rust)
-> `cfg` (declared profile) -> `macros` (reviewed expansions)
-> `ownership` (Rust authority) -> `cli` (commands)
-> `negatives` (refusal oracles).

<a id="contract"></a>
## Contract

Inputs are explicit crate-relative or repo-relative paths; the tool never
walks, globs, or scans. Every file is hashed before UTF-8 decoding;
symlinks, escapes, duplicates, and non-UTF-8 refuse. Outputs are sorted:
canonical receipt (`ctx.rust-extract.v1`), `symbols.jsonl` rows
`{path,symbol,name,line}` for the §2.10 symbol resolver, a sorted cfg
profile, and a separate ownership receipt. Exit codes follow kit
convention: 0 pass, 4 refuse, 2 usage.

Module paths derive from the `src/` suffix: `src/lib.rs` is `crate`,
`src/foo.rs` and `src/foo/mod.rs` are `crate::foo`,
`src/foo/bar.rs` is `crate::foo::bar`. Repo-relative inputs such as
`k/rust/demo/src/foo.rs` resolve through their `/src/` suffix. Only
`*.rs` and `Cargo.toml` are admitted.

<a id="grammar"></a>
## Supported grammar

One rustfmt-style item per line, starting the line after optional
`#[...]` attributes. Comments and string contents are stripped with line
numbers preserved, so comment and string lookalikes never become items.

| Item | Qualified symbol | Notes |
|---|---|---|
| `pub fn/struct/enum/type/const/static/union` | `module::Name` | `unsafe/async/const/extern` qualifiers allowed |
| `pub trait` + `fn/const/type` members | `module::Trait`, `module::Trait::member` | members need no `pub`; inherit trait visibility |
| `impl Type` + `pub fn/const/type` | `module::Type::member` | `impl Trait for Type` resolves to `Type` |
| `pub mod` / `mod` | `module::name` | `mod foo;` requires its sibling file in the allowlist |
| `pub use` | `module::Name` + `target` | brace lists and `as` expand; `*` refuses |
| `macro_rules!` + `#[macro_export]` | `crate::name` | unexported macros record as private |
| `pub extern crate` | `module::name` | |

Restricted `pub(crate/super/self/in ...)` records with `public:false`
and never enters `symbols.jsonl`. Private `mod` poisons reachability:
`pub` inside a private module records but is not a symbol. `#[cfg(test)]`
items record with cfg but are excluded from normal-build symbols.

Refusals: `pub` after `{` or `;` on one line, trait members after `{`,
multiple `pub` on one line, `#[path]`, `extern` blocks. These are
explicit `E_UNSUPPORTED`, never silent misses.

<a id="cfg"></a>
## Declared cfg profile

Every `#[cfg(pred)]` and `#[cfg_attr(pred,...)]` predicate is collected
from item attributes and enclosing `mod/impl/trait` blocks. The receipt
carries per-item `cfg` plus the sorted unique `cfg_profile`. The test
pins `["feature = \"serde\"", "test"]` as gold; any drift fails.

<a id="macros"></a>
## Reviewed macro expansions

Item-position `name!(...)` outside `fn`/other blocks fails closed with
`E_MACRO_UNREVIEWED` unless a `--reviewed-macros` file
(`ctx.rust-macros.v1`) lists the exact `(path,line,macro)` triple with
its expanded public `items`, which are then inventoried as
`reviewed:true`. Invocations inside function bodies are ignored. There
is no macro expansion engine; unreviewed generation never passes.

<a id="ownership"></a>
## Rust authority ownership

Every receipt asserts `authority:"rust"`: Rust owns admitted state and
Electron/Vue renders snapshots. The ownership file
(`ctx.rust-ownership.v1`) lists the crate plus each input path with its
`sha256`. A `Cargo.toml` package name that does not match `--crate`
(after `-`/`_` normalisation) refuses with `E_OWNER`.

<a id="cli"></a>
## CLI

```sh
python3 tools/extract_rust.py --root CRATE --crate demo --files src/lib.rs src/foo.rs --check
python3 tools/extract_rust.py --root CRATE --crate demo --allowlist files.txt --reviewed-macros macros.json --check --out rec.json --symbols symbols.jsonl --cfg cfg.json --ownership own.json
```

`--allowlist` is a newline file of relative paths (`#` comments
allowed). All outputs are canonical JSON (`sort_keys`, LF).

<a id="negatives"></a>
## Negatives

`tests/test_extract_rust.py` (24 tests) builds synthetic crates in
temporary directories: a clean crate passes with gold cfg, exact symbol
resolution, determinism, CLI outputs, allowlist input, and
repo-relative layout; unreviewed macro generation refuses via API and
CLI while reviewed generation passes; macros inside functions pass; bad
reviewed files refuse; glob re-exports, extern blocks, `#[path]`,
missing mod files, duplicate symbols, crate mismatches, escapes,
absent files, non-UTF-8, bad crate names, and non-Rust paths each
refuse. Static tests assert no scan calls and stdlib-only imports.
Fixtures are inline synthetic; no real corpus is read.
