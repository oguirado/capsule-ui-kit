import hashlib
import json
import os
import subprocess
import sys
import unittest
from common import *
import router_web as WEB

# ---- fixtures and negative oracles (first) ----
# Synthetic inline sources (no external corpus read). Line numbers below
# are part of the oracle: every symbol coordinate pins a live line, every
# section anchor occurs exactly once, every node binds its file sha, every
# shortlist retains the index id and params digest it was routed with.

P_JS = "app/shell/src/drawer.js"
P_CSS = "app/shell/src/design/tokens.css"
P_MD = "books/ui-guide.md"
P_TIE = "app/shell/src/tiewords.js"

JS_SRC = ("export function Drawer() { return 1; }\n"
          "export const KIND = \"drawer\";\n")

CSS_SRC = (":root {\n"
           "  --kit-bg: #fff;\n"
           "}\n")

MD_SRC = ("# Guide\n"
          "<a id=\"intro\"></a>\n"
          "Intro text.\n")

TIE_SRC = ("export const a2 = 2;\n"
           "export const a10 = 10;\n")

MD_AMBIG = ("# Guide\n"
            "<a id=\"intro\"></a>\n"
            "Intro text.\n"
            "<a id=\"intro\"></a>\n")

JS_STALE = ("export function Drawer() { return 2; }\n"
            "export const KIND = \"drawer\";\n")

CLEAN_SOURCES = {P_JS: JS_SRC, P_CSS: CSS_SRC, P_MD: MD_SRC}

# (id, kind, title, purpose, path, anchors, triggers, keywords)
NODES_SPEC = [
    ("css:tokens", "symbol", "Kit token set",
     "Routable CSS token set with 1 public anchor.", P_CSS,
     ["--kit-bg"], ["kit-tokens"], ["tokens", "css"]),
    ("doc:guide", "section", "UI guide",
     "Routable companion book with 1 section anchor.", P_MD,
     ["intro"], ["guide-intro"], ["guide"]),
    ("js:drawer", "symbol", "Drawer control",
     "Routable JS module with 2 public anchors.", P_JS,
     ["Drawer", "KIND"], ["drawer-control"], ["drawer", "control"]),
]

TIE_SPEC = [
    ("w:a10", "symbol", "Tie word a10",
     "Routable tie fixture a10.", P_TIE,
     ["a10"], ["tie-a10"], ["tie"]),
    ("w:a2", "symbol", "Tie word a2",
     "Routable tie fixture a2.", P_TIE,
     ["a2"], ["tie-a2"], ["tie"]),
]

JS_SYMS = [("Drawer", "Drawer", 1), ("KIND", "KIND", 2)]
CSS_SYMS = [("--kit-bg", "--kit-bg", 2)]
TIE_SYMS = [("a2", "a2", 1), ("a10", "a10", 2)]

GOV_CLEAN = {"css:tokens": "team/ui", "doc:guide": "team/docs",
             "js:drawer": "team/ui"}
GOV_TIE = {"w:a2": "team/ui", "w:a10": "team/ui"}

PARAMS_OBJ = {"m_min": 1, "profile": "P0"}
PARAMS_OTHER = {"m_min": 1, "profile": "P1"}
INDEX_ID = "0123456789abcdef0123456789abcdef"
Q_HEX = "aaaaaaaaaaaaaaaa"

CLEAN_ROWS = [["css:tokens", "--kit-bg", 900, ["kit"]],
              ["doc:guide", "intro", 800],
              ["js:drawer", "Drawer", 700],
              ["js:drawer", "KIND", 700]]

TOOL = os.path.join(W, "tools", "router_web.py")


def sha(t):
    if isinstance(t, str):
        t = t.encode("utf-8")
    return hashlib.sha256(t).hexdigest()


def sha16(b):
    return hashlib.sha256(b).hexdigest()[:16]


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


def make_shortlist(ix, pr, rows, intent="find_method", flag=False,
                   reason="none", m=1, cov=500000, peak=1000000000,
                   overflow=False, q=Q_HEX, router="route_v2.py/2.0.1"):
    o = {"schema": "ctx.shortlist.v2", "router": router, "ix": ix, "pr": pr,
         "q": q, "intent": intent,
         "abstain": {"flag": flag, "reason": reason, "m": m, "cov": cov,
                     "peak": peak},
         "r": [list(r) for r in rows]}
    if overflow:
        o["overflow"] = True
    return o


def _sym(path, symbol, name, line):
    return {"path": path, "symbol": symbol, "name": name, "line": line}


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def clean_parts(sources=None, specs=None, syms=None, gov=None):
    """Node, lookup, symbol and governance lists for a synthetic mount."""
    src = sources if sources is not None else CLEAN_SOURCES
    shas = {p: sha(t) for p, t in src.items()}
    specs = specs if specs is not None else NODES_SPEC
    nodes, lookup = [], []
    for nid, kind, title, purpose, path, anchors, trig, kw in specs:
        nodes.append(make_node(nid, kind, title, purpose, anchors, trig,
                               kw, shas[path]))
        lookup.append((nid, path))
    symbols = []
    for path, rows in (syms if syms is not None else
                       [(P_JS, JS_SYMS), (P_CSS, CSS_SYMS)]):
        for sym, name, line in rows:
            symbols.append(_sym(path, sym, name, line))
    return nodes, lookup, symbols, dict(gov if gov is not None
                                        else GOV_CLEAN)


def _write_inputs(d, sources, nodes, lookup, symbols, gov, shorts, params,
                  index_id, ordered=True):
    """Write a synthetic root plus adapter inputs; return path dict."""
    root = os.path.join(d, "root")
    for rel, text in sources.items():
        _w(root, rel, text)
    inp = os.path.join(d, "inputs")
    os.makedirs(inp, exist_ok=True)
    nodes_p = os.path.join(inp, "ui.nodes.jsonl")
    lookup_p = os.path.join(inp, "routes.tsv")
    symbols_p = os.path.join(inp, "symbols.jsonl")
    gov_p = os.path.join(inp, "governance.json")
    params_p = os.path.join(inp, "params.json")
    ix_d = os.path.join(inp, "index")
    os.makedirs(ix_d, exist_ok=True)
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
    gov_doc = {"schema": "ctx.web-governance.v1", "version": 1,
               "corpus": "ui",
               "entries": [{"governor": gov[i], "id": i}
                           for i in sorted(gov)]}
    with open(gov_p, "wb") as f:
        f.write(canon(gov_doc))
    with open(params_p, "wb") as f:
        f.write(params)
    with open(os.path.join(ix_d, "ID"), "wb") as f:
        f.write((index_id + "\n").encode("utf-8"))
    short_ps = {}
    for name, obj in shorts.items():
        p = os.path.join(inp, name)
        with open(p, "wb") as f:
            f.write(obj if isinstance(obj, bytes) else canon(obj))
        short_ps[name] = p
    return {"root": root, "nodes": nodes_p, "lookup": lookup_p,
            "symbols": symbols_p, "governance": gov_p, "params": params_p,
            "index": ix_d, "shorts": short_ps}


def _params(pr_obj=None):
    return canon(pr_obj if pr_obj is not None else PARAMS_OBJ)


def _ix():
    return INDEX_ID[:16]


def _pr(params=None):
    return sha16(_params(params))


def _clean(d, shorts, sources=None, ordered=True, params=None,
           index_id=INDEX_ID, specs=None, syms=None, gov=None):
    nodes, lookup, symbols, g = clean_parts(sources, specs, syms, gov)
    return _write_inputs(d, sources if sources is not None
                         else dict(CLEAN_SOURCES), nodes, lookup, symbols,
                         g, shorts, _params(params), index_id,
                         ordered=ordered)


def _rb(path):
    with open(path, "rb") as f:
        return f.read()


def _resolve(p, name="s.json", corpus="ui"):
    return WEB.resolve_run(p["root"], p["shorts"][name], p["nodes"],
                           p["lookup"], p["symbols"], p["governance"],
                           p["index"], p["params"], corpus=corpus)


def _cli(*args):
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    return subprocess.run([sys.executable, "-B", TOOL] + list(args),
                          capture_output=True, text=True, env=env,
                          timeout=120)


def _cli_resolve(p, name="s.json", extra=None):
    args = ["resolve", "--root", p["root"], "--shortlist",
            p["shorts"][name], "--nodes", p["nodes"], "--lookup",
            p["lookup"], "--symbols", p["symbols"], "--governance",
            p["governance"], "--index", p["index"], "--params",
            p["params"]] + list(extra or [])
    return _cli(*args)


class TestCleanResolve(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_clean_actionable_and_retained(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["schema"], "ctx.web-resolution.v1")
        self.assertEqual(rec["outcome"], "resolved")
        self.assertEqual(rec["reason"], "ok")
        self.assertTrue(rec["actionable"])
        # Retained engine evidence agrees with the metadata it binds.
        self.assertEqual((rec["ix"], rec["pr"]), (_ix(), _pr()))
        self.assertEqual(rec["q"], Q_HEX)
        self.assertEqual(rec["intent"], "find_method")
        self.assertEqual(rec["router"], "route_v2.py/2.0.1")
        self.assertEqual(rec["profile"], "P0")
        self.assertEqual(rec["abstain"], short["abstain"])
        self.assertIs(rec["overflow"], False)
        rows = rec["rows"]
        self.assertEqual(len(rows), 4)
        by_id = {}
        for b in rows:
            self.assertEqual(b["evidence"], "ok")
            self.assertEqual(b["key"], "ui:" + b["id"])
            self.assertEqual(b["governor"], GOV_CLEAN[b["id"]])
            self.assertEqual(b["sha256"], sha(CLEAN_SOURCES[b["path"]]))
            by_id.setdefault(b["id"], []).append(b)
        self.assertEqual(by_id["js:drawer"][0]["line"], 1)
        self.assertEqual(by_id["js:drawer"][1]["line"], 2)
        self.assertEqual(by_id["css:tokens"][0]["line"], 2)
        self.assertIsNone(by_id["doc:guide"][0]["line"])
        self.assertEqual(by_id["css:tokens"][0]["why"], ["kit"])
        self.assertTrue(WEB.authorizes_edit(rec))

    def test_shortlist_file_untouched(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        before = _rb(p["shorts"]["s.json"])
        rec = _resolve(p)
        self.assertTrue(rec["actionable"])
        self.assertEqual(_rb(p["shorts"]["s.json"]), before)
        self.assertEqual(json.loads(before.decode("utf-8")), short)

    def test_cli_clean_exit_zero_and_out(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        out = os.path.join(self.d, "rec.json")
        r = _cli_resolve(p, extra=["--out", out])
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["actionable"])
        self.assertEqual(_rb(out), (r.stdout).encode("utf-8"))

    def test_agreeing_tie_stays_actionable(self):
        rows = [["css:tokens", "--kit-bg", 500],
                ["js:drawer", "Drawer", 500]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "ok")
        self.assertTrue(rec["actionable"])

    def test_distinct_scores_ignore_order(self):
        rows = [["js:drawer", "Drawer", 100],
                ["css:tokens", "--kit-bg", 900]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "ok")
        self.assertTrue(rec["actionable"])


class TestShortlistRefusals(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_overflow_keeps_every_row_and_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS, overflow=True)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "resolved")
        self.assertEqual(rec["reason"], "overflow")
        self.assertIs(rec["overflow"], True)
        self.assertFalse(rec["actionable"])
        # No silent trimming: every cited row is preserved as evidence.
        self.assertEqual([(b["id"], b["anchor"]) for b in rec["rows"]],
                         [(r[0], r[1]) for r in CLEAN_ROWS])
        self.assertFalse(WEB.authorizes_edit(rec))
        r = _cli_resolve(p)
        self.assertEqual(r.returncode, 4)

    def test_abstained_with_rows_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS[:2], flag=True,
                               reason="below_tau")
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "abstained")
        self.assertFalse(rec["actionable"])
        self.assertEqual(len(rec["rows"]), 2)
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_uncalibrated_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS[:1],
                               reason="uncalibrated")
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "uncalibrated")
        self.assertFalse(rec["actionable"])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_empty_outside_abstention_refuses(self):
        short = make_shortlist(_ix(), _pr(), [])
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "empty")
        self.assertFalse(rec["actionable"])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_no_query_term_abstention_refuses(self):
        short = make_shortlist(_ix(), _pr(), [], flag=True,
                               reason="no_query_term", m=0, cov=0, peak=0)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "abstained")
        self.assertFalse(rec["actionable"])

    def test_duplicate_shortlist_row_ambiguous(self):
        rows = [["js:drawer", "Drawer", 700],
                ["js:drawer", "Drawer", 600]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "ambiguous")
        self.assertFalse(rec["actionable"])


class TestRowEvidence(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_stale_source_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        nodes, lookup, symbols, gov = clean_parts()
        src = dict(CLEAN_SOURCES)
        src[P_JS] = JS_STALE
        p = _write_inputs(self.d, src, nodes, lookup, symbols, gov,
                          {"s.json": short}, _params(), INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "resolved")
        self.assertEqual(rec["reason"], "stale")
        self.assertFalse(rec["actionable"])
        by_anchor = {(b["id"], b["anchor"]): b for b in rec["rows"]}
        self.assertEqual(by_anchor[("js:drawer", "Drawer")]["evidence"],
                         "stale")
        self.assertEqual(by_anchor[("css:tokens", "--kit-bg")]["evidence"],
                         "ok")
        self.assertFalse(WEB.authorizes_edit(rec))
        r = _cli_resolve(p)
        self.assertEqual(r.returncode, 4)

    def test_stale_inventory_line_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        nodes, lookup, _, gov = clean_parts()
        syms = [(P_JS, [("Drawer", "Drawer", 2), ("KIND", "KIND", 2)]),
                (P_CSS, CSS_SYMS)]
        _, _, symbols, _ = clean_parts(syms=syms)
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, gov, {"s.json": short}, _params(),
                          INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "stale")
        self.assertFalse(rec["actionable"])
        drawer = [b for b in rec["rows"] if b["anchor"] == "Drawer"][0]
        self.assertEqual(drawer["evidence"], "stale")

    def test_ambiguous_section_anchor_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        src = dict(CLEAN_SOURCES)
        src[P_MD] = MD_AMBIG
        nodes, lookup, symbols, gov = clean_parts(sources=src)
        p = _write_inputs(self.d, src, nodes, lookup, symbols, gov,
                          {"s.json": short}, _params(), INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "ambiguous")
        self.assertFalse(rec["actionable"])
        guide = [b for b in rec["rows"] if b["id"] == "doc:guide"][0]
        self.assertEqual(guide["evidence"], "ambiguous")
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_unknown_id_unresolved(self):
        rows = [["js:missing", "Drawer", 700]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "unresolved")
        self.assertFalse(rec["actionable"])
        self.assertEqual(rec["rows"][0]["evidence"], "unresolved")

    def test_undeclared_anchor_unresolved(self):
        rows = [["js:drawer", "Nope", 700]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "unresolved")
        self.assertFalse(rec["actionable"])

    def test_clipped_id_refuses(self):
        rows = [["js:draw", "Drawer", 700]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "clipped")
        self.assertFalse(rec["actionable"])
        self.assertEqual(rec["rows"][0]["evidence"], "clipped")

    def test_overwide_cited_id_refuses(self):
        rows = [["b" * 30, "x", 700]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "width")
        self.assertFalse(rec["actionable"])
        self.assertEqual(rec["rows"][0]["evidence"], "width")

    def test_missing_governor_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        gov = dict(GOV_CLEAN)
        del gov["js:drawer"]
        p = _clean(self.d, {"s.json": short}, gov=gov)
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "missing_governance")
        self.assertFalse(rec["actionable"])
        drawer = [b for b in rec["rows"] if b["id"] == "js:drawer"][0]
        self.assertEqual(drawer["evidence"], "missing_governance")
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_missing_backing_file_is_stale(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        nodes, lookup, symbols, gov = clean_parts()
        src = dict(CLEAN_SOURCES)
        del src[P_CSS]
        p = _write_inputs(self.d, src, nodes, lookup, symbols, gov,
                          {"s.json": short}, _params(), INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "stale")
        self.assertFalse(rec["actionable"])

    def test_first_failing_row_wins_in_order(self):
        rows = [["js:missing", "Drawer", 900],
                ["js:draw", "Drawer", 100]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "unresolved")
        self.assertEqual(rec["rows"][0]["evidence"], "unresolved")
        self.assertEqual(rec["rows"][1]["evidence"], "clipped")


class TestTieOrderAndIdentity(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def _tie(self, rows, **kw):
        src = dict(CLEAN_SOURCES)
        src.update({P_TIE: TIE_SRC})
        specs = list(NODES_SPEC) + list(TIE_SPEC)
        syms = [(P_JS, JS_SYMS), (P_CSS, CSS_SYMS), (P_TIE, TIE_SYMS)]
        gov = dict(GOV_CLEAN)
        gov.update(GOV_TIE)
        short = make_shortlist(_ix(), _pr(), rows, **kw)
        return _clean(self.d, {"s.json": short}, sources=src, specs=specs,
                      syms=syms, gov=gov)

    def test_discriminating_tie_refuses(self):
        # Byte order says a10 < a2; natural order says a2 < a10: the
        # tie cannot prove which comparator produced it.
        rows = [["w:a10", "a10", 500], ["w:a2", "a2", 500]]
        rec = _resolve(self._tie(rows))
        self.assertEqual(rec["reason"], "tie_order")
        self.assertFalse(rec["actionable"])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_reversed_discriminating_tie_refuses(self):
        rows = [["w:a2", "a2", 500], ["w:a10", "a10", 500]]
        rec = _resolve(self._tie(rows))
        self.assertEqual(rec["reason"], "tie_order")
        self.assertFalse(rec["actionable"])

    def test_discriminating_ids_without_tie_pass(self):
        rows = [["w:a10", "a10", 500], ["w:a2", "a2", 400]]
        rec = _resolve(self._tie(rows))
        self.assertEqual(rec["reason"], "ok")
        self.assertTrue(rec["actionable"])

    def test_cited_collision_refuses(self):
        a, b = "a" * 29 + "1", "a" * 29 + "2"
        rows = [[a, "x", 500], [b, "x", 400]]
        short = make_shortlist(_ix(), _pr(), rows)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["reason"], "collision")
        self.assertFalse(rec["actionable"])

    def test_metadata_collision_refused_without_rows(self):
        nodes, lookup, symbols, gov = clean_parts()
        a, b = "a" * 29 + "1", "a" * 29 + "2"
        for nid in (a, b):
            nodes.append(make_node(nid, "symbol", "Long %s" % nid,
                                   "Routable long id fixture.", ["Drawer"],
                                   ["long"], ["long"], sha(JS_SRC)))
            lookup.append((nid, P_JS))
            gov[nid] = "team/ui"
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, gov, {"s.json": short}, _params(),
                          INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertEqual(rec["reason"], "bad_input")
        self.assertEqual(rec["rows"], [])
        self.assertIn("E_COLLISION", rec["errors"][0])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_metadata_width_refused(self):
        nodes, lookup, symbols, gov = clean_parts()
        nid = "c" * 30
        nodes.append(make_node(nid, "symbol", "Wide", "Routable wide id.",
                               ["Drawer"], ["wide"], ["wide"], sha(JS_SRC)))
        lookup.append((nid, P_JS))
        gov[nid] = "team/ui"
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, gov, {"s.json": short}, _params(),
                          INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_WIDTH", rec["errors"][0])

    def test_unsorted_nodes_refused(self):
        nodes, lookup, symbols, gov = clean_parts()
        nodes = list(reversed(nodes))
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, gov, {"s.json": short}, _params(),
                          INDEX_ID, ordered=False)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_ORDER", rec["errors"][0])

    def test_absolute_lookup_path_refused(self):
        nodes, lookup, symbols, gov = clean_parts()
        lookup = [(i, "/etc/x" if i == "js:drawer" else pth)
                  for i, pth in lookup]
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _write_inputs(self.d, dict(CLEAN_SOURCES), nodes, lookup,
                          symbols, gov, {"s.json": short}, _params(),
                          INDEX_ID)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_PATH", rec["errors"][0])


class TestRetainedAgreement(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_ix_mismatch_binds_no_rows(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short},
                   index_id="ffffffffffffffffffffffffffffffff")
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertEqual(rec["reason"], "ix_mismatch")
        self.assertEqual(rec["rows"], [])
        self.assertEqual(rec["ix"], _ix())
        self.assertFalse(WEB.authorizes_edit(rec))
        r = _cli_resolve(p)
        self.assertEqual(r.returncode, 4)

    def test_pr_mismatch_binds_no_rows(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short}, params=PARAMS_OTHER)
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertEqual(rec["reason"], "pr_mismatch")
        self.assertEqual(rec["rows"], [])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_foreign_profile_params_are_not_silent_success(self):
        params = _params(PARAMS_OTHER)
        short = make_shortlist(_ix(), sha16(params), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short}, params=PARAMS_OTHER)
        rec = _resolve(p)
        self.assertTrue(rec["actionable"])
        self.assertEqual(rec["profile"], "P1")
        self.assertEqual(rec["pr"], sha16(params))

    def test_missing_params_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        os.remove(p["params"])
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertEqual(rec["reason"], "bad_input")
        self.assertIn("E_INPUT", rec["errors"][0])

    def test_missing_index_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        os.remove(os.path.join(p["index"], "ID"))
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_INPUT", rec["errors"][0])

    def test_unknown_shortlist_field_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        short["governor"] = "team/ui"
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_SHORTLIST", rec["errors"][0])

    def test_bad_ix_syntax_refuses(self):
        short = make_shortlist("xyz", _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIn("E_SHORTLIST", rec["errors"][0])

    def test_missing_shortlist_refuses(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        os.remove(p["shorts"]["s.json"])
        rec = _resolve(p)
        self.assertEqual(rec["outcome"], "refused")
        self.assertIsNone(rec["ix"])


class TestWrap(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def test_stale_exit_never_fabricates_rows(self):
        rec = WEB.wrap_run(5, "E_STALE")
        self.assertEqual(rec["schema"], "ctx.web-resolution.v1")
        self.assertEqual(rec["outcome"], "refused")
        self.assertEqual(rec["reason"], "stale_exit")
        self.assertEqual(rec["router_exit"], 5)
        self.assertEqual(rec["rows"], [])
        self.assertEqual(rec["errors"], ["E_STALE"])
        self.assertFalse(rec["actionable"])
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_budget_exit_maps(self):
        rec = WEB.wrap_run(6, "E_BUDGET")
        self.assertEqual(rec["reason"], "budget_exit")
        self.assertEqual(rec["router_exit"], 6)
        self.assertEqual(rec["rows"], [])

    def test_unknown_exit_retained_verbatim(self):
        rec = WEB.wrap_run(9, None)
        self.assertEqual(rec["reason"], "engine_exit_9")
        self.assertEqual(rec["router_exit"], 9)
        self.assertEqual(rec["errors"], [])

    def test_cli_wrap_stale(self):
        r = _cli("wrap", "--exit", "5", "--error", "E_STALE")
        self.assertEqual(r.returncode, 4)
        rec = json.loads(r.stdout)
        self.assertEqual(rec["reason"], "stale_exit")
        self.assertEqual(rec["rows"], [])

    def test_cli_wrap_contradictory_shortlist_rejected(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        r = _cli("wrap", "--exit", "5", "--shortlist",
                 p["shorts"]["s.json"])
        self.assertEqual(r.returncode, 2)

    def test_cli_wrap_zero_delegates_to_resolve(self):
        short = make_shortlist(_ix(), _pr(), CLEAN_ROWS)
        p = _clean(self.d, {"s.json": short})
        args = ["wrap", "--exit", "0", "--root", p["root"], "--shortlist",
                p["shorts"]["s.json"], "--nodes", p["nodes"], "--lookup",
                p["lookup"], "--symbols", p["symbols"], "--governance",
                p["governance"], "--index", p["index"], "--params",
                p["params"]]
        r = _cli(*args)
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["actionable"])
        self.assertEqual(rec["router_exit"], 0)

    def test_cli_wrap_zero_missing_args_rejected(self):
        r = _cli("wrap", "--exit", "0")
        self.assertEqual(r.returncode, 2)


class TestAuthorize(unittest.TestCase):
    def setUp(self):
        self.d = tmp()
        self.addCleanup(shutil.rmtree, self.d, True)

    def _record_file(self, rec, name="rec.json"):
        p = os.path.join(self.d, name)
        with open(p, "wb") as f:
            f.write(canon(rec))
        return p

    def _rec(self, rows=CLEAN_ROWS, **kw):
        short = make_shortlist(_ix(), _pr(), rows, **kw)
        p = _clean(self.d, {"s.json": short})
        return _resolve(p)

    def test_authorize_clean_accepts(self):
        rec = self._rec()
        self.assertTrue(WEB.authorizes_edit(rec))
        r = _cli("authorize", "--record", self._record_file(rec))
        self.assertEqual(r.returncode, 0, r.stderr)
        verdict = json.loads(r.stdout)
        self.assertTrue(verdict["authorizes"])

    def test_authorize_refuses_stale_overflow_ambiguous(self):
        stale = self._rec()
        stale["reason"] = "stale"
        stale["actionable"] = False
        over = self._rec(overflow=True)
        self.assertEqual(over["reason"], "overflow")
        amb = self._rec(rows=[["js:drawer", "Drawer", 700],
                              ["js:drawer", "Drawer", 600]])
        self.assertEqual(amb["reason"], "ambiguous")
        for rec in (stale, over, amb):
            self.assertFalse(WEB.authorizes_edit(rec))
            r = _cli("authorize", "--record", self._record_file(rec))
            self.assertEqual(r.returncode, 4)

    def test_forged_actionable_flag_rejected(self):
        rec = self._rec(overflow=True)
        rec["actionable"] = True
        rec["reason"] = "ok"
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_ok_reason_with_bad_row_rejected(self):
        rec = self._rec()
        rec["rows"][0]["evidence"] = "stale"
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_empty_rows_rejected(self):
        rec = self._rec()
        rec["rows"] = []
        self.assertFalse(WEB.authorizes_edit(rec))

    def test_wrong_schema_rejected(self):
        self.assertFalse(WEB.authorizes_edit({"schema": "ctx.shortlist.v2"}))
        self.assertFalse(WEB.authorizes_edit(None))
        self.assertFalse(WEB.authorizes_edit([]))

    def test_cli_malformed_record_is_usage(self):
        p = os.path.join(self.d, "bad.json")
        with open(p, "wb") as f:
            f.write(b"not json\n")
        r = _cli("authorize", "--record", p)
        self.assertEqual(r.returncode, 2)
        verdict = json.loads(r.stdout)
        self.assertFalse(verdict["authorizes"])


if __name__ == "__main__":
    unittest.main()
