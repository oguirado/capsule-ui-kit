import ast
import hashlib
import json
import os
import subprocess
import sys
import unittest
from common import *
import extract_js as J

# ---- fixtures and negative oracles (first) ----
# Every expected row below is hand-authored from the fixture text: the gold
# projection is (name, kind, local, from, jsdoc, line). Spans and digests are
# pinned separately by self-consistency checks, never copied from tool output.

FIX_MAIN = """\
/**
 * Alpha fixture: main-context module.
 * @module fix-alpha
 */

import { createHash } from 'node:crypto';

/**
 * Closed widget state.
 * @typedef {object} AlphaState
 * @property {number} revision Monotonic revision.
 * @property {string} [label] Optional label.
 */
/** @typedef {{id: number}} AlphaRow */

/**
 * Double a bounded integer.
 * @param {number} n Input.
 * @returns {number} Doubled.
 */
export function alphaDouble(n) {
  return n + n;
}

export async function alphaFetch(path) {
  return path;
}

/**
 * Alpha widget.
 */
export class AlphaWidget {
  /** @param {AlphaState} s State. */
  constructor(s) {
    this.s = s;
  }
}

export const ALPHA_ID = 'fix.alpha/v1', ALPHA_MAX = 8;

export let alphaMutable = 0;

const hidden = 1;

export { hidden as alphaHidden };

// export function ghostInComment() {}
const s = "export const phantom = 1;";
"""

GOLD_MAIN = [
    ("alphaDouble", "function", None, None, True, 21, (16, 23)),
    ("alphaFetch", "function", None, None, False, 25, (25, 27)),
    ("AlphaWidget", "class", None, None, True, 32, (29, 37)),
    ("ALPHA_ID", "const", None, None, False, 39, (39, 39)),
    ("ALPHA_MAX", "const", None, None, False, 39, (39, 39)),
    ("alphaMutable", "let", None, None, False, 41, (41, 41)),
    ("alphaHidden", "local", "hidden", None, False, 45, (45, 45)),
]
GOLD_MAIN_TYPEDEFS = [
    ("AlphaState", 10, ["revision", "label"]),
    ("AlphaRow", 14, []),
]

FIX_BARREL = """\
/**
 * Barrel fixture.
 * @module fix-barrel
 */
import { alphaDouble } from '../main/fix-alpha.js';

export {
  ALPHA_ID,
  ALPHA_MAX as MAX,
  default as ALPHA_DEFAULT,
} from './fix-target.js';

export { alphaDouble };

export * as ALPHA_NS from './fix-target.js';
"""

GOLD_BARREL = [
    ("ALPHA_ID", "reexport", None, "./fix-target.js", False, 8, (7, 11)),
    ("MAX", "reexport", "ALPHA_MAX", "./fix-target.js", False, 9, (7, 11)),
    ("ALPHA_DEFAULT", "reexport", "default", "./fix-target.js", False, 10, (7, 11)),
    ("alphaDouble", "local", None, None, False, 13, (13, 13)),
    ("ALPHA_NS", "namespace", None, "./fix-target.js", False, 15, (15, 15)),
]

FIX_DEFAULT = """\
/** @module fix-entry */
import { contextBridge } from 'electron';

/**
 * Entry widget.
 */
export default function FixEntry() {
  return 1;
}

export const ENTRY_ID = 'fix.entry/v1';

contextBridge.exposeInMainWorld('fix', {});
"""

GOLD_DEFAULT = [
    ("default", "default", "FixEntry", None, True, 7, (4, 9)),
    ("ENTRY_ID", "const", None, None, False, 11, (11, 11)),
]

FIX_WORKER = """\
/** @module fix-task */
import { parentPort } from 'node:worker_threads';

function runTask(q) {
  return q;
}

export default runTask;

/**
 * @typedef {object} TaskMsg
 * @property {string} id Task id.
 */
const KS = 1;

parentPort.postMessage({ id: '1' });
"""

GOLD_WORKER = [
    ("default", "default", "runTask", None, False, 8, (8, 8)),
]
GOLD_WORKER_TYPEDEFS = [("TaskMsg", 11, ["id"])]

N_EMPTY = """\
/** @module fix-side */
import { x } from './fix-target.js';
globalThis.fixSide = x;
"""

N_COMMENT_ONLY = """\
/** @module fix-ghost */
// export const ghost = 1;
/*
export function phantom() {
  return 1;
}
*/
const note = "export default 5;";
console.log(note);
"""

N_STAR = """\
/** @module fix-star */
export const a = 1;
export * from './fix-target.js';
"""

N_CJS = """\
/** @module fix-cjs */
export const a = 1;
module.exports = { a };
"""

N_CJS2 = """\
/** @module fix-cjs2 */
export const a = 1;
exports.a = 1;
"""

N_EXPEQ = """\
/** @module fix-eq */
export = 5;
"""

N_ANON_DEFAULT = """\
/** @module fix-anon */
export default function () {
  return 1;
}
"""

N_EXPR_DEFAULT = """\
/** @module fix-exprd */
export default 42;
"""

N_DESTRUCT_OBJ = """\
/** @module fix-destr */
export const { a } = obj;
"""

N_DESTRUCT_ARR = """\
/** @module fix-destr2 */
export const [a] = arr;
"""

N_TS_IFACE = """\
/** @module fix-ts */
export interface Box {
  v = 1;
}
"""

N_TS_ALIAS = """\
/** @module fix-ts2 */
export type Name = string;
"""

N_TS_RAIL = """\
/** @module fix-ts3 */
export const x = 1;
export const y: number = 2;
"""

N_TS_PARAM = """\
/** @module fix-ts4 */
export function f(a: number) {
  return a;
}
"""

N_TS_IMPORT = """\
/** @module fix-ts5 */
import type { T } from './t.js';
export const a = 1;
"""

N_TERNARY_OK = """\
/** @module fix-tern */
export function g(a = b ? c : d) {
  return a;
}
"""

N_DYNAMIC_EVAL = """\
/** @module fix-dyn */
export const a = 1;
const f = eval('2');
"""

N_DYNAMIC_FN = """\
/** @module fix-dyn2 */
export const a = 1;
const G = new Function('return 1');
"""

N_DUP = """\
/** @module fix-dup */
export const d = 1;
export function d() {
  return 1;
}
"""

N_DECORATOR = """\
/** @module fix-deco */
export function plain() {
  return 1;
}

@sealed
export class Widget {
  constructor() {
    this.x = 1;
  }
}
"""

N_PROSE_STAR = """\
/** @module fix-glob */
/**
 * Matches /*.js files.
 */
export const GLOB = '*.js';
"""

N_NESTED_TD = """\
/** @module fix-nest */
export function outer() {
  /**
   * @typedef {object} Inner
   * @property {number} x X.
   */
  return 1;
}

/**
 * @typedef {object} Outer
 */
export const K = 1;
"""

N_TPL_RE = """\
/** @module fix-lex */
export const TPL = `a${ { x: 1 } }b`;
export const FAKE = `export const nope = 1;`;
export const RE = /a\\/\\*b/;
export const RB = /}/;
export const DIV = 10 / 2 / 5;
export function after() {
  return TPL.length + RE.source.length + RB.source.length + DIV;
}
"""

N_ASI = """\
/** @module fix-asi */
export const A = 1
export const B = 2;
export default B
"""

N_DEFBRACE = """\
/** @module fix-defb */
export const impl = 1;
export { impl as default };
export { default as impl2 } from './fix-target.js';
"""

N_GENERATOR = """\
/** @module fix-gen */
export function* gen() {
  yield 1;
}
"""

N_CONST_NOINIT = """\
/** @module fix-noinit */
export const a;
"""

N_EMPTY_BRACES = """\
/** @module fix-empty */
export {};
export const a = 1;
"""

N_ARRAY = """\
/** @module fix-arr */
export const CSP = [
  "a",
  "b",
].join('; ');
export const PAIR = [1, 2], SINGLE = 3;
"""


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def make_root(d, files):
    root = os.path.join(d, "repo")
    for rel, body in files.items():
        _w(root, rel, body)
    allow = os.path.join(d, "allow.txt")
    with open(allow, "w", encoding="utf-8") as f:
        for rel in sorted(files):
            f.write(rel + "\n")
    return root, allow


def run_cli(*args):
    return subprocess.run([sys.executable, os.path.join(W, "tools", "extract_js.py")] + list(args),
                          capture_output=True, text=True)


def proj(record):
    return [(e["name"], e["kind"], e["local"], e["from"], e["jsdoc"], e["line"],
             (e["span"]["start_line"], e["span"]["end_line"])) for e in record["exports"]]


def tproj(record):
    return [(t["name"], t["line"], t["props"]) for t in record["typedefs"]]


def admit_one(body, rel="app/shell/src/main/fix.js"):
    d = tmp()
    root, allow = make_root(d, {rel: body})
    out = os.path.join(d, "records.jsonl")
    sym = os.path.join(d, "symbols.jsonl")
    summary = J.run(root, allow, out, sym)
    assert summary["pass"], summary["errors"]
    rec = [json.loads(l) for l in open(out, encoding="utf-8").read().splitlines()]
    rows = [json.loads(l) for l in open(sym, encoding="utf-8").read().splitlines()]
    return summary, rec[0], rows


def refuse_one(body, rel="app/shell/src/main/fix.js"):
    d = tmp()
    root, allow = make_root(d, {rel: body})
    out = os.path.join(d, "records.jsonl")
    sym = os.path.join(d, "symbols.jsonl")
    summary = J.run(root, allow, out, sym)
    assert not summary["pass"], summary
    assert not os.path.exists(out) and not os.path.exists(sym)
    return summary


class TExtractAdmit(unittest.TestCase):
    def test_main_gold(self):
        _, rec, rows = admit_one(FIX_MAIN, "app/shell/src/main/fix-alpha.js")
        self.assertEqual(proj(rec), GOLD_MAIN)
        self.assertEqual(tproj(rec), GOLD_MAIN_TYPEDEFS)
        self.assertEqual(rec["boundary"],
                         {"context": "main", "markers": [], "node_imports": ["node:crypto"]})
        self.assertEqual(rec["file"], "app/shell/src/main/fix-alpha.js")
        self.assertEqual(rec["schema"], J.SCHEMA_FILE)
        self.assertEqual(rec["file_sha256"], hashlib.sha256(FIX_MAIN.encode()).hexdigest())
        self.assertEqual([(r["symbol"], r["name"], r["line"]) for r in rows],
                         [("alphaDouble", "alphaDouble", 21), ("alphaFetch", "alphaFetch", 25),
                          ("AlphaWidget", "AlphaWidget", 32), ("ALPHA_ID", "ALPHA_ID", 39),
                          ("ALPHA_MAX", "ALPHA_MAX", 39), ("alphaMutable", "alphaMutable", 41),
                          ("alphaHidden", "hidden", 45)])
        for r in rows:
            self.assertEqual(sorted(r), ["line", "name", "path", "symbol"])
            self.assertEqual(r["path"], "app/shell/src/main/fix-alpha.js")

    def test_barrel_gold(self):
        _, rec, rows = admit_one(FIX_BARREL, "app/shell/src/shared/fix-barrel.js")
        self.assertEqual(proj(rec), GOLD_BARREL)
        self.assertEqual(tproj(rec), [])
        self.assertEqual(rec["boundary"],
                         {"context": "shared", "markers": [], "node_imports": []})
        self.assertEqual([(r["symbol"], r["name"], r["line"]) for r in rows],
                         [("ALPHA_ID", "ALPHA_ID", 8), ("MAX", "ALPHA_MAX", 9),
                          ("ALPHA_DEFAULT", "default", 10), ("alphaDouble", "alphaDouble", 13),
                          ("ALPHA_NS", "ALPHA_NS", 15)])

    def test_default_gold(self):
        _, rec, rows = admit_one(FIX_DEFAULT, "app/shell/src/preload/fix-entry.js")
        self.assertEqual(proj(rec), GOLD_DEFAULT)
        self.assertEqual(rec["boundary"],
                         {"context": "preload", "markers": ["contextBridge", "electron"],
                          "node_imports": []})
        self.assertEqual([(r["symbol"], r["name"], r["line"]) for r in rows],
                         [("default", "FixEntry", 7), ("ENTRY_ID", "ENTRY_ID", 11)])

    def test_worker_gold(self):
        _, rec, rows = admit_one(FIX_WORKER, "app/shell/src/worker/fix-task.js")
        self.assertEqual(proj(rec), GOLD_WORKER)
        self.assertEqual(tproj(rec), GOLD_WORKER_TYPEDEFS)
        self.assertEqual(rec["boundary"],
                         {"context": "worker", "markers": ["parentPort", "postMessage"],
                          "node_imports": ["node:worker_threads"]})
        self.assertEqual([(r["symbol"], r["name"]) for r in rows], [("default", "runTask")])

    def test_empty_entry_admits(self):
        _, rec, rows = admit_one(N_EMPTY, "app/shell/src/shared/fix-side.js")
        self.assertEqual(rec["exports"], [])
        self.assertEqual(rows, [])
        self.assertEqual(rec["boundary"]["context"], "shared")

    def test_renderer_v2_context(self):
        body = "/** @module v */\nexport const V = 1;\n"
        _, rec, _ = admit_one(body, "app/shell/src/renderer-v2/fix-view.js")
        self.assertEqual(rec["boundary"]["context"], "renderer-v2")

    def test_template_regex_division_decoys(self):
        _, rec, rows = admit_one(N_TPL_RE, "app/shell/src/main/fix-lex.js")
        self.assertEqual([e[0] for e in proj(rec)],
                         ["TPL", "FAKE", "RE", "RB", "DIV", "after"])
        self.assertEqual([e[5] for e in proj(rec)], [2, 3, 4, 5, 6, 7])
        self.assertNotIn("nope", [r["symbol"] for r in rows])

    def test_decorator_absorbed(self):
        _, rec, _ = admit_one(N_DECORATOR, "app/shell/src/main/fix-deco.js")
        self.assertEqual(proj(rec), [
            ("plain", "function", None, None, True, 2, (1, 4)),
            ("Widget", "class", None, None, False, 7, (6, 11)),
        ])

    def test_jsdoc_prose_star_truncates(self):
        _, rec, _ = admit_one(N_PROSE_STAR, "app/shell/src/main/fix-glob.js")
        self.assertEqual(proj(rec), [("GLOB", "const", None, None, False, 5, (3, 5))])

    def test_nested_typedef_ignored(self):
        _, rec, _ = admit_one(N_NESTED_TD, "app/shell/src/main/fix-nest.js")
        self.assertEqual(tproj(rec), [("Outer", 11, [])])
        self.assertEqual([e[0] for e in proj(rec)], ["outer", "K"])

    def test_asi_statements(self):
        _, rec, _ = admit_one(N_ASI, "app/shell/src/main/fix-asi.js")
        self.assertEqual(proj(rec), [
            ("A", "const", None, None, True, 2, (1, 2)),
            ("B", "const", None, None, False, 3, (3, 3)),
            ("default", "default", "B", None, False, 4, (4, 4)),
        ])

    def test_default_via_brace(self):
        _, rec, rows = admit_one(N_DEFBRACE, "app/shell/src/shared/fix-defb.js")
        self.assertEqual(proj(rec), [
            ("impl", "const", None, None, True, 2, (1, 2)),
            ("default", "default", "impl", None, False, 3, (3, 3)),
            ("impl2", "reexport", "default", "./fix-target.js", False, 4, (4, 4)),
        ])
        self.assertEqual(rows[1]["symbol"], "default")

    def test_ternary_param_admits(self):
        _, rec, _ = admit_one(N_TERNARY_OK, "app/shell/src/main/fix-tern.js")
        self.assertEqual([e[0] for e in proj(rec)], ["g"])

    def test_span_digest_self_consistent(self):
        for body, rel in ((FIX_MAIN, "app/shell/src/main/a.js"),
                          (FIX_BARREL, "app/shell/src/shared/b.js"),
                          (FIX_DEFAULT, "app/shell/src/preload/c.js"),
                          (FIX_WORKER, "app/shell/src/worker/d.js")):
            _, rec, _ = admit_one(body, rel)
            raw = body.encode("utf-8")
            for e in rec["exports"]:
                s = e["span"]
                blob = raw[s["start_byte"]:s["end_byte"]]
                self.assertEqual(hashlib.sha256(blob).hexdigest(), s["sha256"])
                self.assertIn(e["name"] if e["name"] != "default" else e["local"],
                              blob.decode("utf-8"))
                start_ln = len(raw[:s["start_byte"]].decode("utf-8").split("\n"))
                self.assertEqual(start_ln, s["start_line"])

    def test_multi_file_sorted_deterministic(self):
        d = tmp()
        files = {"app/shell/src/worker/fix-task.js": FIX_WORKER,
                 "app/shell/src/main/fix-alpha.js": FIX_MAIN}
        root, allow = make_root(d, files)
        o1, s1 = os.path.join(d, "r1.jsonl"), os.path.join(d, "s1.jsonl")
        o2, s2 = os.path.join(d, "r2.jsonl"), os.path.join(d, "s2.jsonl")
        self.assertTrue(J.run(root, allow, o1, s1)["pass"])
        self.assertTrue(J.run(root, allow, o2, s2)["pass"])
        self.assertEqual(open(o1, "rb").read(), open(o2, "rb").read())
        self.assertEqual(open(s1, "rb").read(), open(s2, "rb").read())
        recs = [json.loads(l) for l in open(o1, encoding="utf-8")]
        self.assertEqual([r["file"] for r in recs], sorted(files))
        blob = open(o1, "rb").read().decode("utf-8")
        for line in blob.splitlines():
            self.assertEqual(line + "\n", J.canon(json.loads(line)).decode("utf-8"))


class TExtractRefuse(unittest.TestCase):
    def err(self, body, rel="app/shell/src/main/fix.js"):
        errs = refuse_one(body, rel)["errors"]
        self.assertTrue(errs)
        return errs[0]

    def test_comment_only_refuses(self):
        e = self.err(N_COMMENT_ONLY)
        self.assertTrue(e.startswith("E_JS_COMMENT_ONLY "), e)

    def test_ambiguous_star_refuses(self):
        e = self.err(N_STAR)
        self.assertTrue(e.startswith("E_JS_AMBIGUOUS_STAR app/shell/src/main/fix.js:3"), e)

    def test_star_without_from_refuses(self):
        e = self.err("/** @module x */\nexport *;\n")
        self.assertTrue(e.startswith("E_JS_SYNTAX "), e)

    def test_commonjs_refuses(self):
        e = self.err(N_CJS)
        self.assertTrue(e.startswith("E_JS_COMMONJS app/shell/src/main/fix.js:3"), e)
        e2 = self.err(N_CJS2)
        self.assertTrue(e2.startswith("E_JS_COMMONJS "), e2)

    def test_export_equals_refuses(self):
        e = self.err(N_EXPEQ)
        self.assertTrue(e.startswith("E_JS_EXPORT_EQUALS app/shell/src/main/fix.js:2"), e)

    def test_anonymous_default_refuses(self):
        e = self.err(N_ANON_DEFAULT)
        self.assertTrue(e.startswith("E_JS_DEFAULT app/shell/src/main/fix.js:2"), e)
        e2 = self.err(N_EXPR_DEFAULT)
        self.assertTrue(e2.startswith("E_JS_DEFAULT "), e2)

    def test_destructured_declarator_refuses(self):
        e = self.err(N_DESTRUCT_OBJ)
        self.assertTrue(e.startswith("E_JS_DESTRUCTURE app/shell/src/main/fix.js:2"), e)
        e2 = self.err(N_DESTRUCT_ARR)
        self.assertTrue(e2.startswith("E_JS_DESTRUCTURE "), e2)

    def test_typescript_refuses(self):
        for body, line in ((N_TS_IFACE, 2), (N_TS_ALIAS, 2), (N_TS_RAIL, 3),
                           (N_TS_PARAM, 2), (N_TS_IMPORT, 2)):
            e = self.err(body)
            self.assertTrue(e.startswith("E_JS_TYPESCRIPT "), (body, e))
            self.assertIn(":%d" % line, e.split(" ")[1], (body, e))

    def test_dynamic_api_refuses(self):
        e = self.err(N_DYNAMIC_EVAL)
        self.assertTrue(e.startswith("E_JS_DYNAMIC app/shell/src/main/fix.js:3"), e)
        e2 = self.err(N_DYNAMIC_FN)
        self.assertTrue(e2.startswith("E_JS_DYNAMIC "), e2)

    def test_duplicate_export_refuses(self):
        e = self.err(N_DUP)
        self.assertTrue(e.startswith("E_JS_DUPLICATE "), e)
        self.assertIn("d", e)

    def test_generator_refuses(self):
        e = self.err(N_GENERATOR)
        self.assertTrue(e.startswith("E_JS_SYNTAX "), e)

    def test_const_without_initializer_refuses(self):
        e = self.err(N_CONST_NOINIT)
        self.assertTrue(e.startswith("E_JS_SYNTAX app/shell/src/main/fix.js:2"), e)

    def test_empty_brace_list_declares_nothing(self):
        _, rec, rows = admit_one(N_EMPTY_BRACES, "app/shell/src/main/fix-empty.js")
        self.assertEqual([r["symbol"] for r in rows], ["a"])

    def test_multiline_array_and_bracket_commas(self):
        _, rec, _ = admit_one(N_ARRAY, "app/shell/src/main/fix-arr.js")
        self.assertEqual(proj(rec), [
            ("CSP", "const", None, None, True, 2, (1, 5)),
            ("PAIR", "const", None, None, False, 6, (6, 6)),
            ("SINGLE", "const", None, None, False, 6, (6, 6)),
        ])

    def test_missing_file_refuses(self):
        d = tmp()
        root = os.path.join(d, "repo")
        os.makedirs(os.path.join(root, "app", "shell", "src", "main"))
        allow = os.path.join(d, "allow.txt")
        open(allow, "w").write("app/shell/src/main/absent.js\n")
        s = J.run(root, allow, os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl"))
        self.assertFalse(s["pass"])
        self.assertTrue(s["errors"][0].startswith("E_JS_MISSING "), s["errors"])

    def test_out_of_scope_refuses(self):
        d = tmp()
        root, _ = make_root(d, {"app/other/x.js": "export const a = 1;\n"})
        allow = os.path.join(d, "allow.txt")
        open(allow, "w").write("app/other/x.js\n")
        s = J.run(root, allow, os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl"))
        self.assertFalse(s["pass"])
        self.assertTrue(s["errors"][0].startswith("E_JS_SCOPE "), s["errors"])

    def test_bad_allow_entries_refuse(self):
        for entry in ("", "/abs/path.js", "../escape.js", "app/shell/src/main/a.js ",
                      "app\\shell\\x.js"):
            d = tmp()
            root = os.path.join(d, "repo")
            os.makedirs(root)
            allow = os.path.join(d, "allow.txt")
            open(allow, "w").write(entry + "\n")
            s = J.run(root, allow, os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl"))
            self.assertFalse(s["pass"], entry)
            self.assertTrue(s["errors"][0].startswith("E_JS_ALLOWLIST"), (entry, s["errors"]))

    def test_duplicate_allow_entry_refuses(self):
        d = tmp()
        root, _ = make_root(d, {"app/shell/src/main/a.js": "export const a = 1;\n"})
        allow = os.path.join(d, "allow.txt")
        open(allow, "w").write("app/shell/src/main/a.js\napp/shell/src/main/a.js\n")
        s = J.run(root, allow, os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl"))
        self.assertFalse(s["pass"])
        self.assertTrue(s["errors"][0].startswith("E_JS_ALLOWLIST"), s["errors"])

    def test_symlink_escape_refuses(self):
        d = tmp()
        outside = os.path.join(d, "outside.js")
        open(outside, "w").write("export const a = 1;\n")
        root = os.path.join(d, "repo")
        linkdir = os.path.join(root, "app", "shell", "src", "main")
        os.makedirs(linkdir)
        os.symlink(outside, os.path.join(linkdir, "evil.js"))
        allow = os.path.join(d, "allow.txt")
        open(allow, "w").write("app/shell/src/main/evil.js\n")
        s = J.run(root, allow, os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl"))
        self.assertFalse(s["pass"])
        self.assertTrue(s["errors"][0].startswith("E_JS_SYMLINK"), s["errors"])

    def test_non_utf8_refuses(self):
        s = refuse_one(b"export const a = \xff;\n")
        self.assertTrue(s["errors"][0].startswith("E_JS_UTF8"), s["errors"])

    def test_oversize_refuses(self):
        body = b"/** @module big */\nexport const a = 1;\n" + b"// pad\n" * 40000
        self.assertGreater(len(body), J.MAX_FILE_BYTES)
        s = refuse_one(body)
        self.assertTrue(s["errors"][0].startswith("E_JS_BYTES"), s["errors"])

    def test_too_many_exports_refuses(self):
        body = "".join("export const v%d = %d;\n" % (i, i) for i in range(501))
        s = refuse_one(body)
        self.assertTrue(s["errors"][0].startswith("E_JS_TOO_MANY"), s["errors"])

    def test_one_bad_file_poison_all(self):
        d = tmp()
        root, allow = make_root(d, {"app/shell/src/main/good.js": "export const a = 1;\n",
                                    "app/shell/src/main/bad.js": N_STAR})
        o, s = os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl")
        summary = J.run(root, allow, o, s)
        self.assertFalse(summary["pass"])
        self.assertFalse(os.path.exists(o))
        self.assertFalse(os.path.exists(s))


class TExtractCli(unittest.TestCase):
    def test_cli_admit(self):
        d = tmp()
        root, allow = make_root(d, {"app/shell/src/main/fix-alpha.js": FIX_MAIN})
        o, s = os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl")
        r = run_cli("--root", root, "--allow", allow, "--out", o, "--symbols", s)
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["checked"], {"exports": 7, "files": 1, "typedefs": 2})
        self.assertEqual(sorted(rec), ["checked", "errors", "pass", "schema", "tool"])
        self.assertTrue(os.path.isfile(o) and os.path.isfile(s))

    def test_cli_refuse(self):
        d = tmp()
        root, allow = make_root(d, {"app/shell/src/main/fix.js": N_COMMENT_ONLY})
        o, s = os.path.join(d, "r.jsonl"), os.path.join(d, "s.jsonl")
        r = run_cli("--root", root, "--allow", allow, "--out", o, "--symbols", s)
        self.assertEqual(r.returncode, 4, r.stderr)
        self.assertIn("E_JS_COMMENT_ONLY", r.stdout)
        self.assertFalse(os.path.exists(o))

    def test_cli_usage(self):
        r = run_cli("--root", tmp())
        self.assertEqual(r.returncode, 2)
        r2 = run_cli("--root", "/nonexistent-root-xyz", "--allow", "a",
                     "--out", "o", "--symbols", "s")
        self.assertEqual(r2.returncode, 2)


class TExtractRealKit(unittest.TestCase):
    def test_gate_lists_test(self):
        gate = open(os.path.join(W, "gate.sh"), encoding="utf-8").read()
        self.assertIn("test_extract_js.py", gate)

    def test_stdlib_only(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_js.py"), encoding="utf-8").read())
        std = set(sys.stdlib_module_names)
        for n in ast.walk(tree):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else []
            mods += [n.module] if isinstance(n, ast.ImportFrom) and n.module else []
            for m in mods:
                self.assertIn(m.split(".")[0], std, m)

    def test_no_tree_walk(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_js.py"), encoding="utf-8").read())
        calls = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute):
                calls.add(n.attr)
            elif isinstance(n, ast.Name):
                calls.add(n.id)
        self.assertTrue(calls.isdisjoint({"walk", "glob", "iglob", "rglob", "scandir", "listdir"}))

    def test_caps_documented(self):
        self.assertEqual(J.MAX_FILE_BYTES, 262144)
        self.assertEqual(J.MAX_EXPORTS_PER_FILE, 500)


if __name__ == "__main__":
    unittest.main()
