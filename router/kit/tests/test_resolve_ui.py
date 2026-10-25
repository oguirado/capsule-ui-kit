import hashlib
import json
import os
import subprocess
import sys
import unittest
from common import *
import resolve_ui as V

# ---- fixtures and negative oracles (first) ----
# Synthetic inline sources (no external corpus read). Line numbers below
# are part of the oracle: every symbol coordinate pins a live line, every
# section anchor occurs exactly once, and every node binds its file sha.

P_JS = "packages/capsule-ui-kit/src/button.js"
P_VUE = "app/shell/src/renderer-v2/Panel.vue"
P_CSS = "app/shell/src/design/tokens.css"
P_BOOK = "books/ui-guide.md"
P_EXTRA = "app/shell/src/design/extra.css"
P_EXTRA2 = "app/shell/src/renderer-v2/orphan.js"

JS_SRC = ("export function Button() { return 1; }\n"
          "export const KIND = \"button\";\n")

VUE_SRC = ("<template><span>panel</span></template>\n"
           "<script>\n"
           "export default {\n"
           "  name: 'Panel',\n"
           "};\n"
           "</script>\n")

CSS_SRC = (":root {\n"
           "  --kit-bg: #fff;\n"
           "}\n")

BOOK_MD = ("# Guide\n"
           "<a id=\"intro\"></a>\n"
           "Intro text.\n")

EXTRA_CSS = (":root {\n"
             "  --extra-fg: #000;\n"
             "}\n")

ORPHAN_JS = "export function Orphan() { return 0; }\n"

CLEAN_SOURCES = {P_JS: JS_SRC, P_VUE: VUE_SRC, P_CSS: CSS_SRC, P_BOOK: BOOK_MD}
CLEAN_SCOPE = sorted(CLEAN_SOURCES)

JS_SYMS = [("Button", "Button", 1), ("KIND", "KIND", 2)]
VUE_SYMS = [("Panel", "Panel", 4)]
CSS_SYMS = [("--kit-bg", "--kit-bg", 2)]

# (id, kind, title, purpose, path, anchors, triggers, keywords)
NODES_SPEC = [
    ("css:tokens", "symbol", "Kit token set",
     "Routable CSS token set with 1 public anchor.", P_CSS,
     ["--kit-bg"], ["kit-tokens"], ["tokens", "css"]),
    ("doc:guide", "section", "UI guide",
     "Routable companion book with 1 section anchor.", P_BOOK,
     ["intro"], ["guide-intro"], ["guide"]),
    ("js:button", "symbol", "Button control",
     "Routable JS module with 2 public anchors.", P_JS,
     ["Button", "KIND"], ["button-control"], ["button", "control"]),
    ("vue:Panel", "symbol", "Panel component",
     "Routable Vue component with 1 public anchor.", P_VUE,
     ["Panel"], ["panel-view"], ["panel", "vue"]),
]

TOOL = os.path.join(W, "tools", "resolve_ui.py")


def sha(t):
    if isinstance(t, str):
        t = t.encode("utf-8")
    return hashlib.sha256(t).hexdigest()


def canon(o):
    return (json.dumps(o, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False) + "\n").encode("utf-8")


def make_node(nid, kind, title, purpose, anchors, triggers, keywords,
              file_sha, corpus="ui"):
    role = "symbol" if kind == "symbol" else "section"
    return {"schema": "ctx.node.v2", "id": nid, "corpus": corpus,
            "kind": kind, "title": title, "purpose": purpose,
            "family": "ui:fixture",
            "anchors": [{"a": a, "role": role} for a in anchors],
            "search": {"triggers": triggers, "keywords": keywords},
            "status": "active", "source_sha256": file_sha}


def _sym(path, symbol, name, line):
    return {"path": path, "symbol": symbol, "name": name, "line": line}


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def _write_inputs(d, sources, nodes, lookup, symbols, scope, ordered=True):
    """Write a synthetic repo plus gate inputs; return dict of paths."""
    root = os.path.join(d, "root")
    for rel, text in sources.items():
        _w(root, rel, text)
    inp = os.path.join(d, "inputs")
    os.makedirs(inp, exist_ok=True)
    nodes_p = os.path.join(inp, "ui.nodes.jsonl")
    lookup_p = os.path.join(inp, "routes.tsv")
    symbols_p = os.path.join(inp, "symbols.jsonl")
    scope_p = os.path.join(inp, "scope.txt")
    ns = sorted(nodes, key=lambda n: n["id"]) if ordered else nodes
    with open(nodes_p, "wb") as f:
        for n in ns:
            f.write(canon(n))
    ls = sorted(lookup) if ordered else lookup
    with open(lookup_p, "wb") as f:
        for i, p in ls:
            f.write(("%s\t%s\n" % (i, p)).encode("utf-8"))
    rs = sorted(symbols, key=lambda s: (s["path"], s["symbol"])) \
        if ordered else symbols
    with open(symbols_p, "wb") as f:
        for s in rs:
            f.write(canon(s))
    with open(scope_p, "wb") as f:
        f.write(("\n".join(scope) + "\n").encode("utf-8"))
    return {"root": root, "nodes": nodes_p, "lookup": lookup_p,
            "symbols": symbols_p, "scope": scope_p}


def clean_parts(sources=None):
    """Node, lookup and symbol lists for the clean four-file mount."""
    src = sources if sources is not None else CLEAN_SOURCES
    shas = {p: sha(t) for p, t in src.items()}
    nodes, lookup, symbols = [], [], []
    for nid, kind, title, purpose, path, anchors, trig, kw in NODES_SPEC:
        nodes.append(make_node(nid, kind, title, purpose, anchors, trig, kw,
                               shas[path]))
        lookup.append((nid, path))
    for sym, name, line in JS_SYMS:
        symbols.append(_sym(P_JS, sym, name, line))
    for sym, name, line in VUE_SYMS:
        symbols.append(_sym(P_VUE, sym, name, line))
    for sym, name, line in CSS_SYMS:
        symbols.append(_sym(P_CSS, sym, name, line))
    return nodes, lookup, symbols


def _single(d, nid, anchor="Button", sym_rows=None, lookup_id=None,
            node_kwargs=None, scope=None):
    """Minimal one-file mount around P_JS; return input paths."""
    kw = dict(node_kwargs or {})
    node = make_node(nid, kw.pop("kind", "symbol"),
                     kw.pop("title", "Single"),
                     kw.pop("purpose", "Routable single with 1 anchor."),
                     kw.pop("anchors", [anchor]),
                     kw.pop("triggers", ["single"]),
                     kw.pop("keywords", ["single"]), sha(JS_SRC))
    node.update(kw)
    rows = list(sym_rows) if sym_rows is not None else [
        _sym(P_JS, anchor, anchor, 1)]
    return _write_inputs(d, {P_JS: JS_SRC}, [node], [(lookup_id or nid, P_JS)],
                         rows, scope if scope is not None else [P_JS])


def _run(paths, roots=V.DEFAULT_SCOPE_ROOTS, corpus="ui", out_dir=None,
         emit_root=None, check=False):
    return V.run(paths["root"], paths["nodes"], paths["lookup"],
                 paths["symbols"], paths["scope"], roots, corpus=corpus,
                 out_dir=out_dir, emit_root=emit_root, check=check)


def _cli(*args):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run([sys.executable, "-B", TOOL] + list(args),
                          capture_output=True, text=True, env=env, timeout=120)


def _cli_gate(paths, extra=None):
    args = ["--root", paths["root"], "--nodes", paths["nodes"],
            "--lookup", paths["lookup"], "--symbols", paths["symbols"],
            "--allowlist", paths["scope"]] + list(extra or [])
    return _cli(*args)


class TestResolvePass(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_clean_pass(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        receipt, blobs = _run(p)
        self.assertTrue(receipt["pass"], receipt)
        self.assertEqual(receipt["errors"], [])
        self.assertEqual(receipt["checked"],
                         {"files": 4, "nodes": 4, "symbols": 4, "anchors": 5,
                          "scope": 4, "unrouted": []})
        self.assertIsNone(blobs)
        self.assertIsNone(receipt["emit"])

    def test_receipt_shape_has_no_volatile_fields(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        receipt, _ = _run(p)
        self.assertEqual(receipt["schema"], "ctx.ui-resolve.v1")
        self.assertEqual(receipt["tool"], "resolve_ui.py/1.0")
        blob = json.dumps(receipt)
        for bad in ("tmp", "pid", "stamp", "/home/", "/root/", "192.168."):
            self.assertNotIn(bad, blob)
        self.assertEqual(set(receipt),
                         {"schema", "tool", "pass", "errors", "checked",
                          "emit"})

    def test_every_anchor_resolves_exactly_once(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        rows = V.load_symbols(p["symbols"])
        by_path = {i: path for i, path in V.load_lookup(p["lookup"])}
        expect = {P_JS: {"Button": 1, "KIND": 2},
                  P_VUE: {"Panel": 4}, P_CSS: {"--kit-bg": 2}}
        for path, syms in expect.items():
            for sym, line in syms.items():
                got = V.resolve_symbol(rows, p["root"], path, sym)
                self.assertEqual(got, {"path": path, "symbol": sym,
                                       "name": sym, "line": line,
                                       "sha256": sha(CLEAN_SOURCES[path])})
        with open(os.path.join(p["root"], P_BOOK),
                  encoding="utf-8") as f:
            self.assertEqual(V.count_section(f.read(), "intro"), 1)
        index = V.index_symbols(rows)
        self.assertEqual(len(index), 4)
        for nid, kind, _, _, path, anchors, _, _ in NODES_SPEC:
            self.assertEqual(by_path[nid], path)
            for a in anchors:
                if kind == "symbol":
                    self.assertIn((path, a), index)

    def test_query_api_missing_symbol_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        rows = V.load_symbols(p["symbols"])
        with self.assertRaises(V.ResolveError) as cm:
            V.resolve_symbol(rows, p["root"], P_JS, "Ghost")
        self.assertTrue(str(cm.exception).startswith("E_ANCHOR"))

    def test_query_api_duplicate_rows_refuse(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        rows = V.load_symbols(p["symbols"])
        dup = rows + [dict(rows[0])]
        with self.assertRaises(V.ResolveError) as cm:
            V.resolve_symbol(dup, p["root"], rows[0]["path"],
                             rows[0]["symbol"])
        self.assertTrue(str(cm.exception).startswith("E_DUPLICATE"))

    def test_query_api_drift_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        rows = V.load_symbols(p["symbols"])
        _w(p["root"], P_JS, "export function Renamed() { return 1; }\n"
                            "export const KIND = \"button\";\n")
        with self.assertRaises(V.ResolveError) as cm:
            V.resolve_symbol(rows, p["root"], P_JS, "Button")
        self.assertTrue(str(cm.exception).startswith("E_LINE_DRIFT"))

    def test_gate_is_deterministic(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        r1, _ = _run(p)
        r2, _ = _run(p)
        self.assertEqual(canon(r1), canon(r2))

    def test_section_only_mount_with_empty_symbols_passes(self):
        book = {"books/ui-note.md": BOOK_MD}
        node = make_node("doc:note", "section", "Note",
                         "Routable book with 1 section anchor.", ["intro"],
                         ["note-intro"], ["note"], sha(BOOK_MD))
        p = _write_inputs(self.d, book, [node],
                          [("doc:note", "books/ui-note.md")], [],
                          ["books/ui-note.md"])
        with open(p["symbols"], "rb") as f:
            self.assertEqual(f.read(), b"")
        receipt, _ = _run(p)
        self.assertTrue(receipt["pass"], receipt)
        self.assertEqual(receipt["checked"]["symbols"], 0)
        self.assertEqual(receipt["checked"]["anchors"], 1)


class NegBase(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def refuses(self, paths, code, **kw):
        receipt, blobs = _run(paths, **kw)
        self.assertFalse(receipt["pass"], receipt)
        self.assertTrue(receipt["errors"][0].startswith(code),
                        receipt["errors"])
        self.assertIsNone(blobs)
        return receipt


class TestIdentityNegatives(NegBase):
    def test_duplicate_node_id_refuses(self):
        node = make_node("js:dup", "symbol", "Dup",
                         "Routable dup with 1 anchor.", ["Button"],
                         ["dup"], ["dup"], sha(JS_SRC))
        p = _write_inputs(self.d, {P_JS: JS_SRC}, [node, dict(node)],
                          [("js:dup", P_JS)], [_sym(P_JS, "Button",
                                                    "Button", 1)], [P_JS])
        self.refuses(p, "E_DUPLICATE_ID")

    def test_duplicate_lookup_id_refuses(self):
        p = _single(self.d, "js:dup")
        with open(p["lookup"], "wb") as f:
            f.write(("js:dup\t%s\njs:dup\t%s\n" % (P_JS, P_JS)).encode())
        self.refuses(p, "E_DUPLICATE_ID")

    def test_duplicate_symbol_rows_refuse(self):
        row = _sym(P_JS, "Button", "Button", 1)
        p = _single(self.d, "js:dup", sym_rows=[row, dict(row)])
        self.refuses(p, "E_DUPLICATE")

    def test_duplicate_scope_entry_refuses(self):
        p = _single(self.d, "js:dup", scope=[P_JS, P_JS])
        self.refuses(p, "E_SCOPE")

    def test_duplicate_anchor_within_node_refuses(self):
        p = _single(self.d, "js:dup", node_kwargs={"anchors": ["Button",
                                                               "Button"]})
        self.refuses(p, "E_DUPLICATE")

    def test_width_single_long_id_refuses(self):
        p = _single(self.d, "w" + "z" * 29)
        self.refuses(p, "E_WIDTH")

    def test_collision_pair_refuses_before_width(self):
        n1, n2 = "c" * 29, "c" * 29 + "d"
        nodes = [make_node(n1, "symbol", "C1", "Routable c1 with 1 anchor.",
                           ["Button"], ["c1"], ["c1"], sha(JS_SRC)),
                 make_node(n2, "symbol", "C2", "Routable c2 with 1 anchor.",
                           ["Button"], ["c2"], ["c2"], sha(JS_SRC))]
        p = _write_inputs(self.d, {P_JS: JS_SRC}, nodes,
                          [(n1, P_JS), (n2, P_JS)],
                          [_sym(P_JS, "Button", "Button", 1)], [P_JS])
        self.assertEqual(V.cutkey("ui", n1), V.cutkey("ui", n2))
        receipt = self.refuses(p, "E_COLLISION")
        self.assertIn(n1, receipt["errors"][0])

    def test_clipped_lookup_key_refuses(self):
        p = _single(self.d, "mod:storage.index", lookup_id="mod:storage")
        receipt = self.refuses(p, "E_CLIPPED")
        self.assertIn("mod:storage.index", receipt["errors"][0])

    def test_lookup_id_without_node_refuses(self):
        p = _single(self.d, "js:button", lookup_id="zz:nowhere")
        self.refuses(p, "E_LOOKUP")

    def test_node_without_lookup_row_refuses(self):
        nodes, lookup, symbols = clean_parts()
        lookup = [r for r in lookup if r[0] != "vue:Panel"]
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        self.refuses(p, "E_LOOKUP")

    def test_malformed_lookup_id_refuses(self):
        p = _single(self.d, "js:button", lookup_id="9bad")
        self.refuses(p, "E_ID")

    def test_unsorted_lookup_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes,
                          list(reversed(lookup)), symbols,
                          list(CLEAN_SCOPE), ordered=False)
        self.refuses(p, "E_ORDER")

    def test_unsorted_nodes_refuse(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES),
                          list(reversed(nodes)), lookup, symbols,
                          list(CLEAN_SCOPE), ordered=False)
        self.refuses(p, "E_ORDER")

    def test_unsorted_symbols_refuse(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          list(reversed(symbols)), list(CLEAN_SCOPE),
                          ordered=False)
        self.refuses(p, "E_ORDER")

    def test_blank_lookup_line_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "ab") as f:
            f.write(b"\n")
        self.refuses(p, "E_RECORD")

    def test_lookup_without_tab_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(b"js:button\n")
        self.refuses(p, "E_RECORD")

    def test_bad_nodes_json_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["nodes"], "wb") as f:
            f.write(b"{bad\n")
        self.refuses(p, "E_RECORD")

    def test_empty_nodes_refuse(self):
        p = _single(self.d, "js:button")
        with open(p["nodes"], "wb") as f:
            f.write(b"")
        self.refuses(p, "E_RECORD")

    def test_empty_lookup_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(b"")
        self.refuses(p, "E_RECORD")

    def test_symbol_extra_key_refuses(self):
        row = _sym(P_JS, "Button", "Button", 1)
        row["x"] = 1
        p = _single(self.d, "js:button", sym_rows=[row])
        self.refuses(p, "E_RECORD")

    def test_symbol_bad_line_refuses(self):
        p = _single(self.d, "js:button",
                    sym_rows=[_sym(P_JS, "Button", "Button", 0)])
        self.refuses(p, "E_RECORD")

    def test_overlong_multibyte_anchor_refuses(self):
        anchor = "\u00e9" * 40
        self.assertEqual(len(anchor), 40)
        self.assertGreater(len(anchor.encode("utf-8")), 64)
        p = _single(self.d, "js:wide", node_kwargs={"anchors": [anchor]})
        self.refuses(p, "E_WIDTH")

    def test_too_many_anchors_refuse(self):
        anchors = ["a%d" % i for i in range(17)]
        p = _single(self.d, "js:many", node_kwargs={"anchors": anchors})
        self.refuses(p, "E_SCHEMA")

    def test_node_missing_key_refuses(self):
        nodes, lookup, symbols = clean_parts()
        del nodes[0]["purpose"]
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        self.refuses(p, "E_SCHEMA")

    def test_node_corpus_mismatch_refuses(self):
        p = _single(self.d, "js:button", node_kwargs={"corpus": "other"})
        self.refuses(p, "E_SCHEMA")

    def test_node_kind_asset_refuses(self):
        p = _single(self.d, "sys:res", node_kwargs={"kind": "asset"})
        self.refuses(p, "E_ROLE")

    def test_symbol_role_in_section_node_refuses(self):
        node = make_node("doc:guide", "section", "Guide",
                         "Routable book with 1 anchor.", ["intro"],
                         ["guide"], ["guide"], sha(BOOK_MD))
        node["anchors"] = [{"a": "intro", "role": "symbol"}]
        p = _write_inputs(self.d, {P_BOOK: BOOK_MD}, [node],
                          [("doc:guide", P_BOOK)], [], [P_BOOK])
        self.refuses(p, "E_ROLE")

    def test_section_role_in_symbol_node_refuses(self):
        node = make_node("js:button", "symbol", "Button",
                         "Routable module with 1 anchor.", ["Button"],
                         ["button"], ["button"], sha(JS_SRC))
        node["anchors"] = [{"a": "Button", "role": "section"}]
        p = _write_inputs(self.d, {P_JS: JS_SRC}, [node],
                          [("js:button", P_JS)],
                          [_sym(P_JS, "Button", "Button", 1)], [P_JS])
        self.refuses(p, "E_ROLE")

    def test_empty_search_refuses(self):
        p = _single(self.d, "js:button", node_kwargs={"triggers": []})
        self.refuses(p, "E_SCHEMA")


class TestFreshnessNegatives(NegBase):
    def test_stale_sha_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        _w(p["root"], P_JS, JS_SRC + "// touch\n")
        receipt = self.refuses(p, "E_STALE")
        self.assertIn(P_JS, receipt["errors"][0])

    def test_stale_line_moved_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        _w(p["root"], P_JS, "// pad\n" + JS_SRC)
        receipt = self.refuses(p, "E_LINE_DRIFT")
        self.assertIn("Button", receipt["errors"][0])

    def test_stale_line_removed_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        _w(p["root"], P_JS, "export function Button() { return 1; }\n")
        self.refuses(p, "E_LINE_DRIFT")

    def test_line_out_of_range_refuses(self):
        p = _single(self.d, "js:button",
                    sym_rows=[_sym(P_JS, "Button", "Button", 99)])
        self.refuses(p, "E_LINE_DRIFT")

    def test_unresolved_symbol_anchor_refuses(self):
        rows = [_sym(P_JS, "Button", "Button", 1)]
        p = _single(self.d, "js:ghost", anchor="Ghost", sym_rows=rows)
        receipt = self.refuses(p, "E_ANCHOR")
        self.assertIn("Ghost", receipt["errors"][0])

    def test_section_anchor_missing_refuses(self):
        src = "# Guide\nNo anchors here.\n"
        node = make_node("doc:guide", "section", "Guide",
                         "Routable book with 1 anchor.", ["intro"],
                         ["guide"], ["guide"], sha(src))
        p = _write_inputs(self.d, {P_BOOK: src}, [node],
                          [("doc:guide", P_BOOK)], [], [P_BOOK])
        self.refuses(p, "E_ANCHOR")

    def test_section_anchor_duplicate_refuses(self):
        src = ("# Guide\n<a id=\"intro\"></a>\nIntro.\n"
               "<a id=\"intro\"></a>\nAgain.\n")
        node = make_node("doc:guide", "section", "Guide",
                         "Routable book with 1 anchor.", ["intro"],
                         ["guide"], ["guide"], sha(src))
        p = _write_inputs(self.d, {P_BOOK: src}, [node],
                          [("doc:guide", P_BOOK)], [], [P_BOOK])
        receipt = self.refuses(p, "E_ANCHOR")
        self.assertIn("2 times", receipt["errors"][0])

    def test_non_utf8_source_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        _w(p["root"], P_JS, b"\xff\xfe\x00bad")
        self.refuses(p, "E_DECODE")

    def test_missing_scope_file_refuses(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE) + [P_EXTRA])
        self.refuses(p, "E_PATH")

    def test_escaping_lookup_path_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(("js:button\t../escape.js\n").encode("utf-8"))
        self.refuses(p, "E_PATH")

    def test_absolute_lookup_path_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(b"js:button\t/etc/hostname\n")
        self.refuses(p, "E_PATH")

    def test_symlink_escape_refuses(self):
        link = "packages/capsule-ui-kit/src/link.js"
        root = os.path.join(self.d, "root")
        _w(self.d, "outside.js", JS_SRC)
        target = os.path.join(root, link)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        os.symlink(os.path.join(self.d, "outside.js"), target)
        node = make_node("js:link", "symbol", "Link",
                         "Routable link with 1 anchor.", ["Button"],
                         ["link"], ["link"], sha(JS_SRC))
        p = _write_inputs(self.d, {}, [node], [("js:link", link)],
                          [_sym(link, "Button", "Button", 1)], [link])
        self.refuses(p, "E_PATH")

    def test_lookup_path_outside_roots_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(("js:button\tdocs/other.md\n").encode("utf-8"))
        receipt = self.refuses(p, "E_SCOPE")
        self.assertIn("docs/other.md", receipt["errors"][0])

    def test_lookup_path_outside_allowlist_refuses(self):
        p = _single(self.d, "js:button")
        with open(p["lookup"], "wb") as f:
            f.write(("js:button\t%s\n" % P_CSS).encode("utf-8"))
        receipt = self.refuses(p, "E_SCOPE")
        self.assertIn(P_CSS, receipt["errors"][0])

    def test_symbol_path_outside_lookup_refuses(self):
        rows = [_sym(P_CSS, "X", "X", 1),
                _sym(P_JS, "Button", "Button", 1)]
        p = _single(self.d, "js:button", sym_rows=rows)
        receipt = self.refuses(p, "E_LOOKUP")
        self.assertIn(P_CSS, receipt["errors"][0])


class TestCoverage(NegBase):
    def test_full_coverage_passes(self):
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, list(CLEAN_SCOPE))
        receipt, _ = _run(p)
        self.assertTrue(receipt["pass"], receipt)
        self.assertEqual(receipt["checked"]["scope"], 4)
        self.assertEqual(receipt["checked"]["unrouted"], [])
        for root in V.DEFAULT_SCOPE_ROOTS:
            hit = [s for s in CLEAN_SCOPE if V.under_roots(s, (root,))]
            self.assertTrue(hit, root)

    def test_unrouted_file_refuses_with_list(self):
        sources = dict(CLEAN_SOURCES)
        sources[P_EXTRA] = EXTRA_CSS
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, sources, nodes, lookup, symbols,
                          sorted(sources))
        receipt = self.refuses(p, "E_COVERAGE")
        self.assertIn(P_EXTRA, receipt["errors"][0])
        self.assertEqual(receipt["checked"]["unrouted"], [P_EXTRA])

    def test_unrouted_lists_every_gap_sorted(self):
        sources = dict(CLEAN_SOURCES)
        sources[P_EXTRA] = EXTRA_CSS
        sources[P_EXTRA2] = ORPHAN_JS
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, sources, nodes, lookup, symbols,
                          sorted(sources))
        receipt = self.refuses(p, "E_COVERAGE")
        self.assertEqual(receipt["checked"]["unrouted"],
                         sorted([P_EXTRA, P_EXTRA2]))


KIT_ROOT = "packages/capsule-ui-kit/"


class TestKitAlone(NegBase):
    def _clean(self):
        nodes, lookup, symbols = clean_parts()
        return _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                             symbols, list(CLEAN_SCOPE))

    def test_emit_kit_subset_bytes(self):
        p = self._clean()
        out = os.path.join(self.d, "kit")
        receipt, blobs = _run(p, out_dir=out, emit_root=KIT_ROOT)
        self.assertTrue(receipt["pass"], receipt)
        self.assertEqual(receipt["emit"]["root"], KIT_ROOT)
        self.assertEqual(receipt["emit"]["files"],
                         ["ui.nodes.jsonl", "routes.tsv", "symbols.jsonl"])
        self.assertEqual(receipt["emit"]["nodes"], 1)
        self.assertEqual(receipt["emit"]["symbols"], 2)
        self.assertEqual(blobs["routes.tsv"],
                         ("js:button\t%s\n" % P_JS).encode("utf-8"))
        syms = [json.loads(l)
                for l in blobs["symbols.jsonl"].decode().splitlines()]
        self.assertEqual(syms, [_sym(P_JS, "Button", "Button", 1),
                                _sym(P_JS, "KIND", "KIND", 2)])
        nodes = [json.loads(l)
                 for l in blobs["ui.nodes.jsonl"].decode().splitlines()]
        self.assertEqual([n["id"] for n in nodes], ["js:button"])
        for name, blob in blobs.items():
            self.assertEqual(receipt["emit"]["sha256"][name], sha(blob))
        self.assertFalse(os.path.exists(out))

    def test_emit_regate_passes(self):
        p = self._clean()
        out = os.path.join(self.d, "kit")
        r = _cli_gate(p, ["--emit-scope-root", KIT_ROOT, "--out", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        for name in ("ui.nodes.jsonl", "routes.tsv", "symbols.jsonl"):
            self.assertTrue(os.path.isfile(os.path.join(out, name)))
        kit_scope = os.path.join(self.d, "kit-scope.txt")
        with open(kit_scope, "w", encoding="utf-8") as f:
            f.write(P_JS + "\n")
        kit = {"root": p["root"],
               "nodes": os.path.join(out, "ui.nodes.jsonl"),
               "lookup": os.path.join(out, "routes.tsv"),
               "symbols": os.path.join(out, "symbols.jsonl"),
               "scope": kit_scope}
        receipt, _ = _run(kit)
        self.assertTrue(receipt["pass"], receipt)
        self.assertEqual(receipt["checked"],
                         {"files": 1, "nodes": 1, "symbols": 2, "anchors": 2,
                          "scope": 1, "unrouted": []})

    def test_emit_is_byte_deterministic(self):
        p = self._clean()
        _, b1 = _run(p, out_dir=os.path.join(self.d, "o1"),
                     emit_root=KIT_ROOT)
        _, b2 = _run(p, out_dir=os.path.join(self.d, "o2"),
                     emit_root=KIT_ROOT)
        self.assertEqual(b1, b2)

    def test_emit_check_roundtrip(self):
        p = self._clean()
        out = os.path.join(self.d, "kit")
        r = _cli_gate(p, ["--emit-scope-root", KIT_ROOT, "--out", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        r = _cli_gate(p, ["--emit-scope-root", KIT_ROOT, "--out", out,
                          "--check"])
        self.assertEqual(r.returncode, 0, r.stdout)
        with open(os.path.join(out, "routes.tsv"), "ab") as f:
            f.write(b"# tamper\n")
        r = _cli_gate(p, ["--emit-scope-root", KIT_ROOT, "--out", out,
                          "--check"])
        self.assertEqual(r.returncode, 4)
        self.assertIn("E_CHECK", r.stdout)

    def test_emit_root_outside_roots_refuses(self):
        p = self._clean()
        self.refuses(p, "E_SCOPE", out_dir=os.path.join(self.d, "kit"),
                     emit_root="docs/")
        r = _cli_gate(p, ["--emit-scope-root", "docs/",
                          "--out", os.path.join(self.d, "kit")])
        self.assertEqual(r.returncode, 4)
        self.assertIn("E_SCOPE", r.stdout)


class TestCLI(NegBase):
    def _clean(self):
        nodes, lookup, symbols = clean_parts()
        return _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                             symbols, list(CLEAN_SCOPE))

    def test_cli_pass_rc0(self):
        r = _cli_gate(self._clean())
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stderr, "")
        receipt = json.loads(r.stdout)
        self.assertTrue(receipt["pass"])
        self.assertEqual(receipt["checked"]["anchors"], 5)

    def test_cli_refuse_rc4(self):
        sources = dict(CLEAN_SOURCES)
        sources[P_EXTRA] = EXTRA_CSS
        nodes, lookup, symbols = clean_parts()
        p = _write_inputs(self.d, sources, nodes, lookup, symbols,
                          sorted(sources))
        r = _cli_gate(p)
        self.assertEqual(r.returncode, 4)
        self.assertIn("E_COVERAGE", r.stdout)
        receipt = json.loads(r.stdout)
        self.assertEqual(receipt["checked"]["unrouted"], [P_EXTRA])

    def test_cli_missing_arg_rc2(self):
        r = _cli("--root", self.d)
        self.assertEqual(r.returncode, 2)

    def test_cli_bad_root_rc2(self):
        p = self._clean()
        r = _cli("--root", os.path.join(self.d, "nope"), "--nodes",
                 p["nodes"], "--lookup", p["lookup"], "--symbols",
                 p["symbols"], "--allowlist", p["scope"])
        self.assertEqual(r.returncode, 2)
        self.assertIn("E_USAGE", r.stderr)

    def test_cli_bad_corpus_rc2(self):
        r = _cli_gate(self._clean(), ["--corpus", "UI"])
        self.assertEqual(r.returncode, 2)

    def test_cli_emit_without_out_rc2(self):
        r = _cli_gate(self._clean(), ["--emit-scope-root", KIT_ROOT])
        self.assertEqual(r.returncode, 2)

    def test_cli_check_without_emit_rc2(self):
        r = _cli_gate(self._clean(), ["--check", "--out", self.d])
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
