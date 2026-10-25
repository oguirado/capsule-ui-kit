import ast
import json
import os
import subprocess
import sys
import unittest
from common import *
import extract_rust as E

# ---- fixtures and negative oracles (first) ----
LIB_RS = """//! demo crate.
pub mod checkpoint;
mod operating;
pub use operating::Terms;
/// leading docs.
pub struct Money;
pub enum Error { Overflow, Invalid }
pub trait Priced {
fn price(&self) -> u64;
const SCALE: u32;
type Out;
}
pub fn floor_div(a: i64, b: i64) -> i64 { a / b }
pub const RATE_SCALE: u32 = 1000;
pub static NAME: &str = "demo";
pub type Amount = i64;
impl Money {
pub fn zero() -> Money { Money }
}
#[cfg(feature = "serde")] pub fn gated() {}
#[cfg(test)]
mod tests {
pub fn helper() {}
}
// pub fn fake_in_comment() {}
const S: &str = "pub fn fake_in_string() {}";
"""

CHECKPOINT_RS = """//! checkpoint module.
pub struct Checkpoint;
impl Checkpoint {
pub fn save(&self) {}
}
pub(crate) fn internal() {}
"""

OPERATING_RS = """//! operating module.
pub struct Terms;
"""

CARGO_TOML = """[package]
name = "demo"
version = "0.1.0"
edition = "2021"
"""

CFG_GOLD = ["feature = \"serde\"", "test"]

MACRO_LIB = """pub fn ok() {}
make_pub!();
"""

REVIEWED_MACROS = {
    "schema": "ctx.rust-macros.v1",
    "expansions": [
        {"path": "src/lib.rs", "line": 2, "macro": "make_pub",
         "items": [{"name": "Gen", "kind": "struct"}]}
    ],
}


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def make_crate(d, lib=LIB_RS, extra=None, cargo=CARGO_TOML):
    root = os.path.join(d, "crate")
    _w(root, "src/lib.rs", lib)
    _w(root, "src/checkpoint.rs", CHECKPOINT_RS)
    _w(root, "src/operating.rs", OPERATING_RS)
    if cargo is not None:
        _w(root, "Cargo.toml", cargo)
    for rel, body in (extra or {}).items():
        _w(root, rel, body)
    files = ["Cargo.toml", "src/checkpoint.rs", "src/lib.rs", "src/operating.rs"]
    files.extend(sorted(extra or {}))
    return root, sorted(files)


def run_cli(*args):
    return subprocess.run([sys.executable, os.path.join(W, "tools", "extract_rust.py")] + list(args),
                          capture_output=True, text=True)


class TExtractClean(unittest.TestCase):
    def test_clean_passes_and_gold_cfg(self):
        root, files = make_crate(tmp())
        rec = E.extract(root, files, "demo")
        self.assertEqual(rec["errors"], [])
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["cfg_profile"], CFG_GOLD)
        self.assertEqual(rec["authority"], "rust")
        self.assertEqual(rec["crate"], "demo")
        syms = {s["symbol"] for s in rec["symbols"]}
        for want in ("demo::Money", "demo::Error", "demo::Priced",
                     "demo::floor_div", "demo::RATE_SCALE", "demo::NAME",
                     "demo::Amount", "demo::Money::zero", "demo::Terms",
                     "demo::checkpoint", "demo::checkpoint::Checkpoint",
                     "demo::checkpoint::Checkpoint::save", "demo::gated"):
            self.assertIn(want, syms)
        # trait items are qualified through the trait
        self.assertIn("demo::Priced::price", syms)
        # cfg(test) helper is inventoried but not a normal-build symbol
        self.assertNotIn("demo::tests::helper", syms)
        inv = {i["symbol"]: i for i in rec["items"]}
        self.assertEqual(sorted(inv["demo::gated"]["cfg"]), ["feature = \"serde\""])
        self.assertIn("test", inv["demo::tests::helper"]["cfg"])
        # restricted visibility never becomes a symbol
        self.assertNotIn("demo::checkpoint::internal", syms)
        self.assertFalse(inv["demo::checkpoint::internal"]["public"])

    def test_comment_and_string_lookalikes_ignored(self):
        root, files = make_crate(tmp())
        rec = E.extract(root, files, "demo")
        syms = {s["symbol"] for s in rec["symbols"]}
        self.assertNotIn("demo::fake_in_comment", syms)
        self.assertNotIn("demo::fake_in_string", syms)

    def test_symbols_resolve_exactly_once(self):
        root, files = make_crate(tmp())
        rec = E.extract(root, files, "demo")
        seen = {}
        for s in rec["symbols"]:
            key = (s["path"], s["symbol"])
            self.assertNotIn(key, seen)
            seen[key] = s
            line = open(os.path.join(root, s["path"]), encoding="utf-8").read().split("\n")[s["line"] - 1]
            self.assertIn(s["name"], line)

    def test_deterministic_and_sorted(self):
        root, files = make_crate(tmp())
        a = E.extract(root, list(reversed(files)), "demo")
        b = E.extract(root, files, "demo")
        self.assertEqual(a, b)
        self.assertEqual([f["path"] for f in a["files"]], sorted(f["path"] for f in a["files"]))
        self.assertEqual(a["cfg_profile"], sorted(a["cfg_profile"]))
        self.assertEqual([(s["path"], s["symbol"]) for s in a["symbols"]],
                         sorted((s["path"], s["symbol"]) for s in a["symbols"]))

    def test_cli_check_and_outputs(self):
        root, files = make_crate(tmp())
        out = os.path.join(root, "rec.json")
        sym = os.path.join(root, "symbols.jsonl")
        cfg = os.path.join(root, "cfg.json")
        own = os.path.join(root, "own.json")
        r = run_cli("--root", root, "--crate", "demo", "--files", *files,
                    "--check", "--out", out, "--symbols", sym, "--cfg", cfg,
                    "--ownership", own)
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["pass"])
        self.assertEqual(rec, E.extract(root, files, "demo"))
        self.assertEqual(json.load(open(out)), rec)
        rows = [json.loads(l) for l in open(sym, encoding="utf-8") if l.strip()]
        self.assertEqual(rows, rec["symbols"])
        self.assertEqual(json.load(open(cfg))["cfg_profile"], CFG_GOLD)
        own_rec = json.load(open(own))
        self.assertEqual(own_rec["authority"], "rust")
        self.assertEqual(own_rec["crate"], "demo")

    def test_allowlist_file(self):
        root, files = make_crate(tmp())
        al = _w(root, "allow.txt", "\n".join(files) + "\n")
        r = run_cli("--root", root, "--crate", "demo", "--allowlist", al, "--check")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(json.loads(r.stdout)["pass"])

    def test_repo_relative_src_layout(self):
        d = tmp()
        root = os.path.join(d, "repo")
        _w(root, "k/rust/demo/src/lib.rs", "pub fn top() {}\n")
        rec = E.extract(root, ["k/rust/demo/src/lib.rs"], "demo")
        self.assertEqual(rec["errors"], [])
        self.assertEqual(rec["symbols"][0]["symbol"], "demo::top")


class TExtractMacro(unittest.TestCase):
    def test_macro_without_review_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", MACRO_LIB)
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertFalse(rec["pass"])
        self.assertTrue(any(e.startswith("E_MACRO_UNREVIEWED src/lib.rs:2 make_pub!") for e in rec["errors"]), rec["errors"])

    def test_macro_with_review_passes(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", MACRO_LIB)
        mp = _w(root, "macros.json", json.dumps(REVIEWED_MACROS, sort_keys=True))
        rec = E.extract(root, ["src/lib.rs"], "demo", mp)
        self.assertEqual(rec["errors"], [])
        syms = {s["symbol"] for s in rec["symbols"]}
        self.assertIn("demo::Gen", syms)
        self.assertIn("demo::ok", syms)

    def test_macro_cli_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", MACRO_LIB)
        r = run_cli("--root", root, "--crate", "demo", "--files", "src/lib.rs", "--check")
        self.assertEqual(r.returncode, 4)
        self.assertTrue(any(e.startswith("E_MACRO_UNREVIEWED") for e in json.loads(r.stdout)["errors"]))

    def test_macro_inside_fn_ignored(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub fn f() {\n  let x = foo!(1);\n}\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertEqual(rec["errors"], [])

    def test_bad_reviewed_file_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub fn f() {}\n")
        bad = _w(root, "bad.json", json.dumps({"schema": "other", "expansions": []}))
        rec = E.extract(root, ["src/lib.rs"], "demo", bad)
        self.assertTrue(any(e.startswith("E_MACROS_INVALID") for e in rec["errors"]))


class TExtractRefusals(unittest.TestCase):
    def test_glob_reexport_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub use foo::*;\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertEqual(rec["errors"], ["E_GLOB_REEXPORT src/lib.rs:1"])

    def test_extern_block_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "extern \"C\" {\n fn f();\n}\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertTrue(any(e.startswith("E_UNSUPPORTED src/lib.rs:1 extern block") for e in rec["errors"]))

    def test_path_attr_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "#[path = \"other.rs\"]\nmod foo;\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertTrue(any(e.startswith("E_UNSUPPORTED src/lib.rs:2 #[path]") for e in rec["errors"]), rec["errors"])

    def test_missing_mod_file_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub mod missing;\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertTrue(any(e.startswith("E_ABSENT src/lib.rs:1 mod missing") for e in rec["errors"]), rec["errors"])

    def test_duplicate_symbol_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub mod a;\npub mod b;\n")
        _w(root, "src/a.rs", "pub use crate::Dup;\n")
        _w(root, "src/b.rs", "pub use crate::Dup;\n")
        # same qualified symbol twice via two files claiming one module path
        _w(root, "src/dup.rs", "pub struct Dup;\n")
        rec = E.extract(root, ["src/lib.rs", "src/a.rs", "src/b.rs"], "demo")
        # file-mod neighbours exist so only mapping matters; force a real dup:
        _w(root, "src/lib.rs", "pub fn dup() {}\n")
        _w(root, "src/a.rs", "pub fn dup() {}\n")
        rec2 = E.extract(root, ["src/lib.rs", "src/a.rs"], "demo")
        # different modules so no dup; craft a same-module dup via reviewed macro
        mp = _w(root, "m.json", json.dumps({"schema": "ctx.rust-macros.v1", "expansions": [
            {"path": "src/lib.rs", "line": 2, "macro": "gen",
             "items": [{"name": "dup", "kind": "fn"}]}]}, sort_keys=True))
        _w(root, "src/lib.rs", "pub fn dup() {}\ngen!();\n")
        rec3 = E.extract(root, ["src/lib.rs"], "demo", mp)
        self.assertTrue(any(e.startswith("E_DUPLICATE symbol demo::dup") for e in rec3["errors"]), rec3["errors"])

    def test_crate_mismatch_refuses(self):
        root, files = make_crate(tmp(), cargo=CARGO_TOML.replace('"demo"', '"other"'))
        rec = E.extract(root, files, "demo")
        self.assertTrue(any(e.startswith("E_OWNER Cargo.toml") for e in rec["errors"]), rec["errors"])

    def test_escape_and_absent_refuse(self):
        root, files = make_crate(tmp())
        rec = E.extract(root, ["../escape.rs"], "demo")
        self.assertIn("E_ESCAPE ../escape.rs", rec["errors"])
        rec2 = E.extract(root, ["src/nope.rs"], "demo")
        self.assertIn("E_ABSENT src/nope.rs", rec2["errors"])

    def test_not_utf8_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", b"pub fn f() {}\n\xff\n")
        rec = E.extract(root, ["src/lib.rs"], "demo")
        self.assertIn("E_NOT_UTF8 src/lib.rs", rec["errors"])

    def test_bad_crate_usage(self):
        root, files = make_crate(tmp())
        rec = E.extract(root, files, "bad-crate")
        self.assertTrue(rec["errors"][0].startswith("E_USAGE"), rec["errors"])
        r = run_cli("--root", root, "--check")
        self.assertEqual(r.returncode, 2)

    def test_non_rs_path_refuses(self):
        d = tmp()
        root = os.path.join(d, "crate")
        _w(root, "src/lib.rs", "pub fn f() {}\n")
        _w(root, "notes.txt", "hi\n")
        rec = E.extract(root, ["src/lib.rs", "notes.txt"], "demo")
        self.assertIn("E_PATH notes.txt: only *.rs or Cargo.toml", rec["errors"])


class TExtractStatic(unittest.TestCase):
    def test_no_scan_calls(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_rust.py"), encoding="utf-8").read())
        calls = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute):
                calls.add(n.attr)
            elif isinstance(n, ast.Name):
                calls.add(n.id)
        self.assertTrue(calls.isdisjoint({"walk", "glob", "iglob", "rglob", "scandir"}))

    def test_stdlib_only(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_rust.py"), encoding="utf-8").read())
        std = set(sys.stdlib_module_names)
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                for a in n.names:
                    self.assertIn(a.name.split(".")[0], std, a.name)
            elif isinstance(n, ast.ImportFrom) and n.module:
                self.assertIn(n.module.split(".")[0], std, n.module)


if __name__ == "__main__":
    unittest.main()
