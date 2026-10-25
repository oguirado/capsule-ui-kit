import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import unittest
from common import *
import extract_ui as U
import jsonschema_lite as JSL

# ---- fixtures and negative oracles (first) ----
# Synthetic inline sources (no external corpus read). Line numbers below are
# part of the oracle: every symbol coordinate pins a resolvable location.

VUE_SFC = """<template><span>x</span></template>
<script>
export function helper() { return 1; }
export default {
  name: 'Comp',
};
</script>
"""

JS_SRC = """// store module
export function load() { return 1; }
export const save = 1;
"""

CSS_SRC = """:root {
  --pkg-bg: #fff;
}
"""

TOKENS_JSON = ('{"schema": "capsule-ui-kit.design-tokens/v1",'
               ' "tokens": {"pkg": {"bg": {"$value": "#fff"}}}}\n')

RUST_SRC = """//! demo crate
pub fn run() {}
pub const LIMIT: u32 = 1;
"""

BOOK_MD = """# Guide
<a id="intro"></a>
Intro text.
<a id="setup"></a>
<!-- PM:BEGIN pm.search.v1 -->
```json
{"retrieval_triggers": ["guide-intro"], "keywords": ["guide"], "engineering_tasks": [{"task": "read guide", "contract_anchor": "intro"}], "questions_answered": [{"question": "how to route?", "answer_anchor": "setup"}], "exclusions": [], "synonyms": [{"term": "manual", "aliases": ["handbook"]}]}
```
<!-- PM:END pm.search.v1 -->
"""

BOOK_PLAIN = """# Plain
<a id="only"></a>
No machine blocks here.
"""

CLEAN_SOURCES = {
    "pkg/Comp.vue": VUE_SFC,
    "pkg/store.js": JS_SRC,
    "pkg/tokens.css": CSS_SRC,
    "pkg/tokens.json": TOKENS_JSON,
    "pkg/lib.rs": RUST_SRC,
    "pkg/guide.md": BOOK_MD,
}

CLEAN_SCOPE = ["pkg/Comp.vue", "pkg/guide.md", "pkg/lib.rs",
               "pkg/store.js", "pkg/tokens.css"]

NODE_IDS = {"css:tokens", "doc:guide", "js:store", "rs:demo.lib", "vue:Comp"}


def sha(t):
    if isinstance(t, str):
        t = t.encode("utf-8")
    return hashlib.sha256(t).hexdigest()


def vue_rec(path, text, symbols):
    return {"schema": "ctx.vue-inventory.v1", "tool": "extract_vue.py/1.0",
            "path": path, "source_sha256": sha(text),
            "component": {"identity": "options-name", "line": 5,
                          "name": "Comp"},
            "bindings": [], "exports": [], "regions": [],
            "symbols": symbols}


def js_rec(path, text, exports):
    return {"schema": "holdings.w0.js-file/v1", "file": path,
            "file_sha256": sha(text), "exports": exports, "typedefs": [],
            "boundary": {"context": "renderer", "markers": [],
                         "node_imports": []}}


def css_rec(css_path, css_text, tok_path, tok_text, names, groups=None):
    lines = css_text.split("\n")
    syms = []
    for i, name in enumerate(names):
        syms.append({"path": css_path, "symbol": name, "name": name,
                     "line": i + 2})
        assert name in lines[i + 1], name
    rec = {"schema": "css.tokens.v1", "tool": "extract_css.py/1.0",
           "token_set": "tokens", "node_id": "css:tokens",
           "family": "css:tokens", "prefix": "--pkg",
           "css": {"path": css_path, "sha256": sha(css_text),
                   "bytes": len(css_text.encode("utf-8"))},
           "tokens_source": {"path": tok_path, "sha256": sha(tok_text),
                             "bytes": len(tok_text.encode("utf-8")),
                             "schema": "capsule-ui-kit.design-tokens/v1"},
           "tokens": [], "modes": [], "regions": [],
           "anchors": [{"a": a, "role": "symbol"} for a in sorted(names)],
           "symbols": syms}
    if groups is not None:
        rec["proposed_groups"] = groups
    return rec


def rust_rec(files, symbols, crate="demo"):
    return {"schema": "ctx.rust-extract.v1", "tool": "extract_rust.py/1.0",
            "pass": True, "crate": crate, "authority": "rust",
            "files": files, "items": [], "symbols": symbols,
            "cfg_profile": [], "ownership": {}}


def clean_records(src=None):
    src = src or CLEAN_SOURCES
    vue = vue_rec("pkg/Comp.vue", src["pkg/Comp.vue"],
                  [{"line": 5, "name": "Comp", "path": "pkg/Comp.vue",
                    "symbol": "Comp"},
                   {"line": 3, "name": "helper", "path": "pkg/Comp.vue",
                    "symbol": "helper"}])
    js = js_rec("pkg/store.js", src["pkg/store.js"],
                [{"name": "load", "kind": "function", "local": "load",
                  "line": 2},
                 {"name": "save", "kind": "const", "local": "save",
                  "line": 3}])
    css = css_rec("pkg/tokens.css", src["pkg/tokens.css"],
                  "pkg/tokens.json", src["pkg/tokens.json"], ["--pkg-bg"],
                  [{"node": "css:tokens", "family": "css:tokens",
                    "anchors": ["--pkg-bg"]}])
    rust = rust_rec([{"path": "pkg/lib.rs", "sha256": sha(src["pkg/lib.rs"])}],
                    [{"path": "pkg/lib.rs", "symbol": "demo::run",
                      "name": "run", "line": 2},
                     {"path": "pkg/lib.rs", "symbol": "demo::LIMIT",
                      "name": "LIMIT", "line": 3}])
    return [vue, js, css, rust]


def _w(root, rel, text):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    mode = "wb" if isinstance(text, bytes) else "w"
    with open(p, mode) as f:
        f.write(text)
    return p


def build_tree(d, sources=None, scope=None, records=None, md=None,
               roots=("pkg/",)):
    """Write a synthetic repo: sources, scope allowlist, records JSONL."""
    root = os.path.join(d, "root")
    src = dict(CLEAN_SOURCES if sources is None else sources)
    for rel, blob in sorted(src.items()):
        _w(root, rel, blob)
    scope = list(CLEAN_SCOPE if scope is None else scope)
    scope_p = os.path.join(d, "scope.txt")
    _w(d, "scope.txt", "".join(s + "\n" for s in scope))
    recs = clean_records(src) if records is None else records
    rec_p = os.path.join(d, "records.jsonl")
    with open(rec_p, "w") as f:
        for r in recs:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    md = ["pkg/guide.md"] if md is None else md
    return {"root": root, "scope": scope_p, "records": [rec_p], "md": md,
            "out": os.path.join(d, "out"), "roots": roots, "dir": d}


def run_api(t, **kw):
    a = dict(t)
    a.update(kw)
    return U.run(a["root"], a["scope"], a["roots"], a["records"], a["md"],
                 a["out"], history_path=a.get("history"),
                 corpus=a.get("corpus", "ui"), check=a.get("check", False))


def run_cli(*args):
    return subprocess.run(
        [sys.executable, os.path.join(W, "tools", "extract_ui.py")]
        + list(args), capture_output=True, text=True)


def read_out(out):
    blobs = {}
    for n in U.OUT_NAMES:
        with open(os.path.join(out, n), "rb") as f:
            blobs[n] = f.read()
    return blobs


def _rb(p):
    with open(p, "rb") as f:
        return f.read()


def _rt(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


class TClean(unittest.TestCase):
    def test_clean_composition_passes(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertEqual(rec["errors"], [], rec["errors"])
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["schema"], "ctx.ui-extract.v1")
        self.assertEqual(rec["checked"],
                         {"files": 5, "nodes": 5, "symbols": 7, "scope": 5,
                          "unrouted": []})
        self.assertEqual(sorted(blobs), sorted(U.OUT_NAMES))
        for name in U.OUT_NAMES:
            self.assertTrue(blobs[name].endswith(b"\n"), name)
            self.assertTrue(len(blobs[name]) > 0, name)

    def test_nodes_validate_against_schema(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        schema = json.loads(_rt(os.path.join(
            W, "standards", "schemas", "ctx.node.v2.schema.json")))
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        self.assertEqual({n["id"] for n in nodes}, NODE_IDS)
        self.assertEqual([n["id"] for n in nodes], sorted(NODE_IDS))
        for n in nodes:
            self.assertEqual(JSL.validate(n, schema), [], n["id"])
            self.assertEqual(n["corpus"], "ui")
            self.assertEqual(n["status"], "active")
            self.assertTrue(n["title"] and n["purpose"])
            self.assertTrue(n["search"]["triggers"], n["id"])
            self.assertTrue(n["search"]["keywords"], n["id"])
            self.assertLessEqual(len("ui") + 1 + len(n["id"]), 32, n["id"])
            self.assertLessEqual(len(n["anchors"]), 16, n["id"])
            for a in n["anchors"]:
                self.assertLessEqual(len(a["a"].encode("utf-8")), 64, n["id"])
            raw = _rb(os.path.join(t["root"], _lookup(blobs, n["id"])))
            self.assertEqual(n["source_sha256"], sha(raw), n["id"])

    def test_lookup_sorted_two_column(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        rows = blobs["routes.tsv"].decode("utf-8").split("\n")[:-1]
        self.assertEqual(len(rows), 5)
        pairs = [r.split("\t") for r in rows]
        for p in pairs:
            self.assertEqual(len(p), 2, p)
        self.assertEqual([p[0] for p in pairs], sorted(NODE_IDS))
        self.assertEqual({p[0] for p in pairs}, NODE_IDS)
        for nid, rel in pairs:
            self.assertTrue(os.path.isfile(os.path.join(t["root"], rel)),
                            (nid, rel))

    def test_symbols_paper_keys_sorted(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        rows = [json.loads(l) for l in
                blobs["symbols.jsonl"].decode("utf-8").split("\n")
                if l.strip()]
        self.assertEqual(len(rows), 7)
        for r in rows:
            self.assertEqual(sorted(r), ["line", "name", "path", "symbol"], r)
        keys = [(r["path"], r["symbol"]) for r in rows]
        self.assertEqual(keys, sorted(keys))
        self.assertEqual(len(set(keys)), len(keys))
        for r in rows:
            lines = _rt(os.path.join(t["root"], r["path"])).split("\n")
            self.assertIn(r["name"], lines[r["line"] - 1], r)

    def test_provenance_closed(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        prov = json.loads(blobs["provenance.json"])
        self.assertEqual(
            sorted(prov),
            ["anchor_index", "aux", "corpus", "coverage", "files",
             "history_sha256", "lookup_sha256", "nodes", "nodes_sha256",
             "removed", "schema", "scope_roots", "symbols", "symbols_sha256",
             "tool"])
        self.assertEqual(prov["schema"], "ctx.ui-provenance.v1")
        self.assertEqual(prov["tool"], "extract_ui.py/1.0")
        self.assertEqual(prov["corpus"], "ui")
        self.assertEqual(prov["scope_roots"], ["pkg/"])
        self.assertEqual([f["path"] for f in prov["files"]],
                         sorted(CLEAN_SCOPE))
        for f in prov["files"]:
            self.assertTrue(f["nodes"], f["path"])
            raw = _rb(os.path.join(t["root"], f["path"]))
            self.assertEqual(f["sha256"], sha(raw), f["path"])
        self.assertEqual(prov["aux"],
                         [{"path": "pkg/tokens.json",
                           "sha256": sha(TOKENS_JSON),
                           "role": "tokens-source"}])
        self.assertEqual(prov["nodes"], 5)
        self.assertEqual(prov["symbols"], 7)
        self.assertEqual(prov["nodes_sha256"], sha(blobs["ui.nodes.jsonl"]))
        self.assertEqual(prov["lookup_sha256"], sha(blobs["routes.tsv"]))
        self.assertEqual(prov["symbols_sha256"], sha(blobs["symbols.jsonl"]))
        self.assertEqual(prov["anchor_index"], sorted(prov["anchor_index"]))
        self.assertEqual(len(prov["anchor_index"]), 7)
        self.assertIsNone(prov["history_sha256"])
        self.assertEqual(prov["removed"], [])
        self.assertEqual(prov["coverage"],
                         {"scope": 5, "routed": 5, "unrouted": []})
        blob = blobs["provenance.json"].decode("utf-8")
        self.assertIsNone(re.search(r"20\d\d-\d\d-\d\d", blob))
        self.assertNotIn("/home/", blob)
        self.assertNotIn("/tmp/", blob)

    def test_stable_bytes(self):
        t = build_tree(tmp())
        rec1, blobs1 = run_api(t)
        self.assertTrue(rec1["pass"], rec1["errors"])
        rec2, blobs2 = run_api(t)
        self.assertEqual(blobs1, blobs2)
        self.assertEqual(rec1, rec2)
        t3 = build_tree(tmp())
        recs = clean_records()
        recs.reverse()
        with open(t3["records"][0], "w") as f:
            for r in recs:
                f.write(json.dumps(r, sort_keys=True) + "\n")
        rec3, blobs3 = run_api(t3)
        self.assertTrue(rec3["pass"], rec3["errors"])
        self.assertEqual(blobs1, blobs3)

    def test_check_passes_and_drift(self):
        t = build_tree(tmp())
        r = run_cli("--root", t["root"], "--allowlist", t["scope"],
                    "--scope-root", "pkg/", "--record", t["records"][0],
                    "--md", "pkg/guide.md", "--out", t["out"])
        self.assertEqual(r.returncode, 0, r.stderr)
        before = read_out(t["out"])
        rec, _ = run_api(t, check=True)
        self.assertTrue(rec["pass"], rec["errors"])
        with open(os.path.join(t["out"], "symbols.jsonl"), "r+b") as f:
            f.seek(10)
            b = f.read(1)
            f.seek(10)
            f.write(b"Z" if b != b"Z" else b"Q")
        rec2, _ = run_api(t, check=True)
        self.assertFalse(rec2["pass"])
        self.assertEqual(rec2["errors"], ["E_CHECK symbols.jsonl differs"])
        os.remove(os.path.join(t["out"], "routes.tsv"))
        rec3, _ = run_api(t, check=True)
        self.assertFalse(rec3["pass"])
        self.assertIn("E_CHECK routes.tsv missing", rec3["errors"])
        self.assertIn("E_CHECK symbols.jsonl differs", rec3["errors"])
        with open(os.path.join(t["out"], "ui.nodes.jsonl"), "rb") as f:
            self.assertEqual(f.read(), before["ui.nodes.jsonl"])

    def test_build_index_consumes_nodes(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes_p = os.path.join(t["dir"], "nodes.jsonl")
        with open(nodes_p, "wb") as f:
            f.write(blobs["ui.nodes.jsonl"])
        thes = os.path.join(W, "tests", "fixtures", "thesaurus_empty.json")
        outs = []
        for name in ("ix1", "ix2"):
            out = os.path.join(t["dir"], name)
            B.build(t["dir"], out, thes, B.CAP, nodes_p, "ui")
            outs.append(out)
        for out in outs:
            man = json.loads(_rt(os.path.join(out, "manifest.json")))
            self.assertEqual(man["nodes"], 5)
        self.assertEqual(
            _rb(os.path.join(outs[0], "manifest.json")),
            _rb(os.path.join(outs[1], "manifest.json")))


def _lookup(blobs, nid):
    for row in blobs["routes.tsv"].decode("utf-8").split("\n"):
        if row.startswith(nid + "\t"):
            return row.split("\t")[1]
    raise AssertionError("no lookup row for " + nid)


class TShardWidth(unittest.TestCase):
    def _big_css(self, d, n, groups=None):
        names = ["--t%02d" % i for i in range(n)]
        css = ":root {\n" + "".join("  %s: #fff;\n" % a for a in names) + "}\n"
        src = {"pkg/big.css": css, "pkg/tokens.json": TOKENS_JSON}
        rec = css_rec("pkg/big.css", css, "pkg/tokens.json", TOKENS_JSON,
                      names, groups)
        rec["node_id"] = "css:big"
        rec["family"] = "css:big"
        rec["token_set"] = "big"
        if groups is not None:
            for g in rec["proposed_groups"]:
                g["family"] = "css:big"
        return build_tree(d, sources=src, scope=["pkg/big.css"],
                          records=[rec], md=[])

    def test_sharding_splits_at_sixteen(self):
        t = self._big_css(tmp(), 17)
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        self.assertEqual([n["id"] for n in nodes],
                         ["css:big.p0", "css:big.p1"])
        self.assertEqual([len(n["anchors"]) for n in nodes], [16, 1])
        self.assertEqual({n["family"] for n in nodes}, {"css:big"})
        rows = blobs["routes.tsv"].decode("utf-8").split("\n")[:-1]
        self.assertEqual(rows, ["css:big.p0\tpkg/big.css",
                                "css:big.p1\tpkg/big.css"])
        syms = [l for l in blobs["symbols.jsonl"].decode("utf-8")
                .split("\n") if l.strip()]
        self.assertEqual(len(syms), 17)
        self.assertIn("(part 1/2)", nodes[0]["title"])

    def test_proposed_groups_honored(self):
        names = ["--t%02d" % i for i in range(17)]
        groups = [{"node": "css:big.p0", "family": "css:big",
                   "anchors": sorted(names)[:16]},
                  {"node": "css:big.p1", "family": "css:big",
                   "anchors": sorted(names)[16:]}]
        t = self._big_css(tmp(), 17, groups)
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        self.assertEqual([n["id"] for n in nodes],
                         ["css:big.p0", "css:big.p1"])

    def test_css_groups_mismatch_refuses(self):
        names = ["--t%02d" % i for i in range(3)]
        groups = [{"node": "css:big", "family": "css:big",
                   "anchors": sorted(names)[:2]}]
        t = self._big_css(tmp(), 3, groups)
        rec, blobs = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_GROUPS"),
                        rec["errors"])
        self.assertIsNone(blobs)

    def test_anchor_width_refuses(self):
        long_sym = "x" * 65
        src = dict(CLEAN_SOURCES)
        src["pkg/store.js"] = "export function %s() { return 1; }\n" % long_sym
        recs = [r for r in clean_records(src)
                if r["schema"] != "holdings.w0.js-file/v1"]
        recs.append(js_rec("pkg/store.js", src["pkg/store.js"],
                           [{"name": long_sym, "kind": "function",
                             "local": long_sym, "line": 1}]))
        t = build_tree(tmp(), sources=src, records=recs)
        rec, blobs = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_WIDTH"), rec["errors"])
        self.assertIsNone(blobs)
        self.assertFalse(os.path.exists(t["out"]))

    def test_id_width_refuses(self):
        stem = "a" * 27
        src = dict(CLEAN_SOURCES)
        src["pkg/%s.js" % stem] = "export const v = 1;\n"
        scope = list(CLEAN_SCOPE) + ["pkg/%s.js" % stem]
        recs = clean_records(src) + [
            js_rec("pkg/%s.js" % stem, src["pkg/%s.js" % stem],
                   [{"name": "v", "kind": "const", "local": "v", "line": 1}])]
        t = build_tree(tmp(), sources=src, scope=scope, records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_WIDTH"), rec["errors"])

    def test_bad_id_chars_refuse(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/we$ird.js"] = "export const v = 1;\n"
        scope = list(CLEAN_SCOPE) + ["pkg/we$ird.js"]
        recs = clean_records(src) + [
            js_rec("pkg/we$ird.js", src["pkg/we$ird.js"],
                   [{"name": "v", "kind": "const", "local": "v", "line": 1}])]
        t = build_tree(tmp(), sources=src, scope=scope, records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_ID"), rec["errors"])

    def test_duplicate_symbol_refuses(self):
        recs = clean_records()
        recs.append(recs[1])
        t = build_tree(tmp(), records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_DUPLICATE"),
                        rec["errors"])

    def test_duplicate_node_id_refuses(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/a/Comp.vue"] = VUE_SFC
        src["pkg/b/Comp.vue"] = VUE_SFC
        scope = list(CLEAN_SCOPE) + ["pkg/a/Comp.vue", "pkg/b/Comp.vue"]
        recs = [r for r in clean_records(src)
                if r.get("path") != "pkg/Comp.vue"]
        syms = [{"line": 5, "name": "Comp", "path": p, "symbol": "Comp"}
                for p in ("pkg/a/Comp.vue", "pkg/b/Comp.vue")]
        recs.append(vue_rec("pkg/a/Comp.vue", VUE_SFC, [syms[0]]))
        recs.append(vue_rec("pkg/b/Comp.vue", VUE_SFC, [syms[1]]))
        scope.remove("pkg/Comp.vue")
        del src["pkg/Comp.vue"]
        t = build_tree(tmp(), sources=src, scope=scope, records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_DUPLICATE_ID"),
                        rec["errors"])

    def test_no_anchors_refuses(self):
        recs = [r for r in clean_records()
                if r["schema"] != "holdings.w0.js-file/v1"]
        recs.append(js_rec("pkg/store.js", JS_SRC, []))
        t = build_tree(tmp(), records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_NO_ANCHORS"),
                        rec["errors"])

    def test_book_without_anchors_refuses(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/guide.md"] = "# Guide\nNo anchors here.\n"
        t = build_tree(tmp(), sources=src)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_NO_ANCHORS"),
                        rec["errors"])


class TFreshHistory(unittest.TestCase):
    def test_stale_record_refuses(self):
        recs = clean_records()
        recs[1] = dict(recs[1])
        digest = recs[1]["file_sha256"]
        recs[1]["file_sha256"] = ("0" if digest[0] != "0" else "1") + \
            digest[1:]
        t = build_tree(tmp(), records=recs)
        rec, blobs = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_STALE"), rec["errors"])
        self.assertIsNone(blobs)

    def test_line_drift_refuses(self):
        recs = clean_records()
        recs[0] = json.loads(json.dumps(recs[0]))
        recs[0]["symbols"][1]["line"] = 2
        t = build_tree(tmp(), records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_LINE_DRIFT"),
                        rec["errors"])

    def _v1_out(self, d):
        t = build_tree(d)
        r = run_cli("--root", t["root"], "--allowlist", t["scope"],
                    "--scope-root", "pkg/", "--record", t["records"][0],
                    "--md", "pkg/guide.md", "--out", t["out"])
        self.assertEqual(r.returncode, 0, r.stderr)
        return t

    def test_removed_export_fails_after_honest_rehash(self):
        t = self._v1_out(tmp())
        before = read_out(t["out"])
        src = dict(CLEAN_SOURCES)
        src["pkg/store.js"] = "// store module\nexport function load() { return 1; }\n"
        _w(t["root"], "pkg/store.js", src["pkg/store.js"])
        recs = [r for r in clean_records(src)
                if r["schema"] != "holdings.w0.js-file/v1"]
        recs.append(js_rec("pkg/store.js", src["pkg/store.js"],
                           [{"name": "load", "kind": "function",
                             "local": "load", "line": 2}]))
        rec_p = os.path.join(t["dir"], "records2.jsonl")
        with open(rec_p, "w") as f:
            for r in recs:
                f.write(json.dumps(r, sort_keys=True) + "\n")
        hist = os.path.join(t["out"], "provenance.json")
        rec, blobs = U.run(t["root"], t["scope"], ("pkg/",), [rec_p],
                           ["pkg/guide.md"], os.path.join(t["dir"], "out2"),
                           history_path=hist)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_REMOVED_ANCHOR"),
                        rec["errors"])
        self.assertIn("pkg/store.js", rec["errors"][0])
        self.assertIn("save", rec["errors"][0])
        self.assertIsNone(blobs)
        self.assertEqual(read_out(t["out"]), before)

    def test_added_export_passes(self):
        t = self._v1_out(tmp())
        src = dict(CLEAN_SOURCES)
        src["pkg/store.js"] = JS_SRC + "export const extra = 2;\n"
        _w(t["root"], "pkg/store.js", src["pkg/store.js"])
        recs = [r for r in clean_records(src)
                if r["schema"] != "holdings.w0.js-file/v1"]
        recs.append(js_rec("pkg/store.js", src["pkg/store.js"],
                           [{"name": "load", "kind": "function",
                             "local": "load", "line": 2},
                            {"name": "save", "kind": "const", "local": "save",
                             "line": 3},
                            {"name": "extra", "kind": "const",
                             "local": "extra", "line": 4}]))
        rec_p = os.path.join(t["dir"], "records2.jsonl")
        with open(rec_p, "w") as f:
            for r in recs:
                f.write(json.dumps(r, sort_keys=True) + "\n")
        hist = os.path.join(t["out"], "provenance.json")
        rec, blobs = U.run(t["root"], t["scope"], ("pkg/",), [rec_p],
                           ["pkg/guide.md"], os.path.join(t["dir"], "out2"),
                           history_path=hist)
        self.assertTrue(rec["pass"], rec["errors"])
        prov = json.loads(blobs["provenance.json"])
        with open(hist, "rb") as f:
            self.assertEqual(prov["history_sha256"], sha(f.read()))
        self.assertEqual(prov["symbols"], 8)

    def test_record_schema_refuses(self):
        cases = [
            ({"schema": "nope.v1"}, "E_RECORD"),
            ({"schema": "ctx.vue-inventory.v1", "path": "pkg/Comp.vue"},
             "E_RECORD"),
            ({"schema": "holdings.w0.js-file/v1"}, "E_RECORD"),
            ({"schema": "css.tokens.v1", "node_id": "css:tokens"}, "E_RECORD"),
            ({"schema": "ctx.rust-extract.v1", "pass": False, "crate": "d",
              "files": [], "symbols": []}, "E_RECORD"),
        ]
        for bad, code in cases:
            with self.subTest(bad=bad):
                t = build_tree(tmp(), records=[bad], md=[])
                rec, _ = run_api(t)
                self.assertFalse(rec["pass"])
                self.assertTrue(rec["errors"][0].startswith(code),
                                rec["errors"])

    def test_history_invalid_refuses(self):
        t = build_tree(tmp())
        bad_p = os.path.join(t["dir"], "bad.json")
        _w(t["dir"], "bad.json", "not json\n")
        rec, _ = run_api(t, history=bad_p)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_HISTORY"),
                        rec["errors"])
        _w(t["dir"], "bad.json", '{"schema": "other"}\n')
        rec2, _ = run_api(t, history=bad_p)
        self.assertFalse(rec2["pass"])
        self.assertTrue(rec2["errors"][0].startswith("E_HISTORY"),
                        rec2["errors"])


class TBooks(unittest.TestCase):
    def test_book_search_from_blocks(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes = {json.loads(l)["id"]: json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()}
        book = nodes["doc:guide"]
        self.assertEqual(book["kind"], "section")
        self.assertEqual(book["title"], "Guide")
        self.assertEqual(book["search"]["triggers"], ["guide-intro"])
        self.assertEqual(book["search"]["keywords"], ["guide"])
        self.assertEqual(book["search"]["tasks"], ["read guide"])
        self.assertEqual(book["search"]["questions"], ["how to route?"])
        self.assertEqual(book["search"]["problem_names"],
                         ["manual", "handbook"])
        self.assertEqual([a["a"] for a in book["anchors"]],
                         ["intro", "setup"])
        self.assertTrue(all(a["role"] == "section"
                            for a in book["anchors"]))

    def test_book_plain_derives_search(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/guide.md"] = BOOK_PLAIN
        t = build_tree(tmp(), sources=src)
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        book = [n for n in nodes if n["id"] == "doc:guide"][0]
        self.assertTrue(book["search"]["triggers"], book)
        self.assertTrue(book["search"]["keywords"], book)

    def test_book_malformed_block_refuses(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/guide.md"] = ('# Guide\n<a id="intro"></a>\n'
                               '<!-- PM:BEGIN pm.search.v1 -->\n```json\n'
                               '{bad json\n```\n'
                               '<!-- PM:END pm.search.v1 -->\n')
        t = build_tree(tmp(), sources=src)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_BLOCK_JSON"),
                        rec["errors"])

    def test_book_duplicate_anchor_refuses(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/guide.md"] = ('# Guide\n<a id="dup"></a>\ntext\n'
                               '<a id="dup"></a>\n')
        t = build_tree(tmp(), sources=src)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_DUPLICATE"),
                        rec["errors"])

    def test_decode_refuses(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/guide.md"] = b"# Guide\n\xff\xfe binary\n"
        t = build_tree(tmp(), sources=src)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_DECODE"), rec["errors"])

    def test_kit_blocks_parser_used(self):
        import blocks
        self.assertIs(U.BL, blocks)
        self.assertTrue(callable(U.BL.blocks_from_text))


class TCoverage(unittest.TestCase):
    def test_coverage_full_passes(self):
        t = build_tree(tmp())
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        prov = json.loads(blobs["provenance.json"])
        self.assertEqual(prov["coverage"],
                         {"scope": 5, "routed": 5, "unrouted": []})

    def test_coverage_gap_fails(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/orphan.js"] = "export const lone = 1;\n"
        scope = list(CLEAN_SCOPE) + ["pkg/orphan.js"]
        t = build_tree(tmp(), sources=src, scope=scope)
        rec, blobs = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_COVERAGE"),
                        rec["errors"])
        self.assertIn("pkg/orphan.js", rec["errors"][0])
        self.assertIsNone(blobs)
        self.assertFalse(os.path.exists(t["out"]))

    def test_kit_alone(self):
        vue = ("<template><b>x</b></template>\n<script>\nexport default {\n"
               "  name: 'Widget',\n};\n</script>\n")
        js = "export function cart() { return 1; }\n"
        src = {"kit/Widget.vue": vue, "kit/shop.js": js}
        recs = [vue_rec("kit/Widget.vue", vue,
                        [{"line": 4, "name": "Widget", "path": "kit/Widget.vue",
                          "symbol": "Widget"}]),
                js_rec("kit/shop.js", js,
                       [{"name": "cart", "kind": "function", "local": "cart",
                         "line": 1}])]
        t = build_tree(tmp(), sources=src, scope=["kit/Widget.vue",
                                                  "kit/shop.js"],
                       records=recs, md=[], roots=("kit/",))
        rec, blobs = run_api(t)
        self.assertTrue(rec["pass"], rec["errors"])
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        self.assertEqual({n["id"] for n in nodes}, {"js:shop", "vue:Widget"})
        rows = blobs["routes.tsv"].decode("utf-8").split("\n")[:-1]
        self.assertEqual(rows, ["js:shop\tkit/shop.js",
                                "vue:Widget\tkit/Widget.vue"])
        prov = json.loads(blobs["provenance.json"])
        self.assertEqual(prov["scope_roots"], ["kit/"])
        self.assertEqual(prov["coverage"],
                         {"scope": 2, "routed": 2, "unrouted": []})

    def test_scope_root_violation(self):
        t = build_tree(tmp(), scope=list(CLEAN_SCOPE) + ["other/x.js"])
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_SCOPE"), rec["errors"])
        self.assertIn("other/x.js", rec["errors"][0])

    def test_evidence_outside_scope(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/extra.js"] = "export const v = 1;\n"
        recs = clean_records(src) + [
            js_rec("pkg/extra.js", src["pkg/extra.js"],
                   [{"name": "v", "kind": "const", "local": "v", "line": 1}])]
        t = build_tree(tmp(), sources=src, records=recs)
        rec, _ = run_api(t)
        self.assertFalse(rec["pass"])
        self.assertTrue(rec["errors"][0].startswith("E_SCOPE"), rec["errors"])
        self.assertIn("pkg/extra.js", rec["errors"][0])

    def test_scope_entries_strict(self):
        bad_lists = [["../x.js"], ["/abs.js"], ["a//b.js"], ["a/./b.js"],
                     ["pkg/Comp.vue", "pkg/Comp.vue"], ["  pkg/Comp.vue"],
                     ["pkg/Comp.vue", ""], [""]]
        for bad in bad_lists:
            with self.subTest(bad=bad):
                t = build_tree(tmp(), scope=bad, records=[], md=[])
                rec, _ = run_api(t)
                self.assertFalse(rec["pass"])
                self.assertTrue(rec["errors"][0].startswith("E_SCOPE"),
                                (bad, rec["errors"]))


class TCliHygiene(unittest.TestCase):
    def test_cli_pass_check_usage(self):
        t = build_tree(tmp())
        r = run_cli("--root", t["root"], "--allowlist", t["scope"],
                    "--scope-root", "pkg/", "--record", t["records"][0],
                    "--md", "pkg/guide.md", "--out", t["out"])
        self.assertEqual(r.returncode, 0, r.stderr)
        got = json.loads(r.stdout)
        self.assertTrue(got["pass"], got)
        self.assertEqual(got["checked"]["nodes"], 5)
        for n in U.OUT_NAMES:
            self.assertTrue(os.path.isfile(os.path.join(t["out"], n)), n)
        r2 = run_cli("--root", t["root"], "--allowlist", t["scope"],
                     "--scope-root", "pkg/", "--record", t["records"][0],
                     "--md", "pkg/guide.md", "--out", t["out"], "--check")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        r3 = run_cli()
        self.assertEqual(r3.returncode, 2)
        r4 = run_cli("--root", t["root"], "--allowlist", t["scope"],
                     "--scope-root", "pkg/", "--record", t["records"][0],
                     "--md", "pkg/guide.md", "--out", t["out"],
                     "--corpus", "UI!")
        self.assertEqual(r4.returncode, 2)

    def test_cli_refusal_exit_4(self):
        src = dict(CLEAN_SOURCES)
        src["pkg/orphan.js"] = "export const lone = 1;\n"
        scope = list(CLEAN_SCOPE) + ["pkg/orphan.js"]
        t = build_tree(tmp(), sources=src, scope=scope)
        r = run_cli("--root", t["root"], "--allowlist", t["scope"],
                    "--scope-root", "pkg/", "--record", t["records"][0],
                    "--md", "pkg/guide.md", "--out", t["out"])
        self.assertEqual(r.returncode, 4, r.stdout)
        got = json.loads(r.stdout)
        self.assertFalse(got["pass"])
        self.assertTrue(got["errors"][0].startswith("E_COVERAGE"), got)
        self.assertFalse(os.path.exists(t["out"]))

    def test_vue_interop(self):
        import extract_vue as V
        d = tmp()
        root = os.path.join(d, "root")
        _w(root, "pkg/Comp.vue", VUE_SFC)
        scope_p = os.path.join(d, "scope.txt")
        _w(d, "scope.txt", "pkg/Comp.vue\n")
        rec = V.extract_text(VUE_SFC, "pkg/Comp.vue")
        self.assertEqual(rec["schema"], "ctx.vue-inventory.v1")
        rec_p = os.path.join(d, "vue.json")
        with open(rec_p, "w") as f:
            f.write(json.dumps(rec, sort_keys=True) + "\n")
        got, blobs = U.run(root, scope_p, ("pkg/",), [rec_p], [],
                           os.path.join(d, "out"))
        self.assertTrue(got["pass"], got["errors"])
        nodes = [json.loads(l) for l in
                 blobs["ui.nodes.jsonl"].decode("utf-8").split("\n")
                 if l.strip()]
        self.assertEqual([n["id"] for n in nodes], ["vue:Comp"])

    def test_no_runtime_scan(self):
        src = _rt(os.path.join(W, "tools", "extract_ui.py"))
        for token in ("os.walk", "glob", "rglob", "scandir", "listdir"):
            self.assertNotIn(token, src)

    def test_stdlib_only(self):
        src = _rt(os.path.join(W, "tools", "extract_ui.py"))
        tree = ast.parse(src)
        allowed = {"argparse", "hashlib", "json", "os", "re", "sys",
                   "blocks", "jsonschema_lite"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    self.assertIn(a.name.split(".")[0], allowed, a.name)
            elif isinstance(node, ast.ImportFrom):
                self.assertIn((node.module or "").split(".")[0], allowed,
                              node.module)

    def test_codes_closed(self):
        self.assertEqual(tuple(sorted(U.CODES)), U.CODES)
        src = _rt(os.path.join(W, "tools", "extract_ui.py"))
        used = set(re.findall(r'UiError\("([A-Z_]+)"', src))
        self.assertTrue(used)
        self.assertLessEqual(used, set(U.CODES), used - set(U.CODES))
        for err in ("E_CHECK x missing",):
            self.assertTrue(err.split()[0] in U.CODES)

    def test_gate_lists_test(self):
        gate = _rt(os.path.join(W, "gate.sh"))
        self.assertIn("test_extract_ui.py", gate)

    def test_companion_exists(self):
        comp = os.path.join(W, "docs", "extract_ui.md")
        self.assertTrue(os.path.isfile(comp))
        text = _rt(comp)
        self.assertIn("W0-NODES", text)
        self.assertIn('<a id="cli"></a>', text)


if __name__ == "__main__":
    unittest.main()
