import ast
import hashlib
import json
import os
import subprocess
import sys
import unittest
from common import *
import extract_vue as V

# ---- fixtures and negative oracles (first) ----
# Synthetic inline SFCs (no external corpus read). Line numbers below are
# part of the oracle: every expected line pins a symbol coordinate.

SFC_OK = """<template>
  <div class="panel">{{ label }}</div>
</template>
<script>
/** Zebra store. */
export const zebra = 1;
/** Apple helper. */
export function apple() {
  return zebra;
}
export default {
  name: 'CapsulePanel',
  props: {
    label: String,
  },
  emits: ['fold'],
  methods: {
    fold() { this.$emit('fold'); },
  },
};
</script>
<style scoped>
.panel { color: red; }
</style>
"""

SFC_EXPORT_LIST = """<template>
  <span>x</span>
</template>
<script>
const inner = 1;
/** Re-exported local. */
export { inner, inner as alias };
export default {
  name: 'ListPanel',
};
</script>
"""

SFC_DEFAULT_IDENT = """<template>
  <span>x</span>
</template>
<script>
/** Panel options. */
const Panel = {
  name: 'IdentPanel',
  props: { tip: String },
};
export default Panel;
</script>
"""

SFC_LOOKALIKES = """<template>
  <p>export default { name: 'Evil' }</p>
  <p>export const evil = 1;</p>
</template>
<script>
// export const fakeComment = 1;
/* export function fakeBlock() {} */
const s1 = "export default X;";
const s2 = 'export const fakeStr = 2;';
const t = `export function fakeTpl() {}`;
const re = /export const fakeRe = 3;/;
/** Real helper. */
export function real() {
  return s1 + s2;
}
export default {
  name: 'CleanPanel',
};
</script>
<style>
/* export const fakeCss = 4; */
.x { content: "export default Y"; }
</style>
"""

SFC_MINIMAL = """<template><span>ok</span></template>
<script>
export default {
  name: 'MiniPanel',
};
</script>
"""

SFC_JS_LANG = """<template><span>ok</span></template>
<script lang="js">
export default {
  name: 'JsPanel',
};
</script>
"""

SFC_MULTI_DECL = """<template><span>ok</span></template>
<script>
/**
 * Shared pair.
 * @type {number}
 */
export const alpha = 1, beta = 2;
export default {
  name: 'MultiPanel',
};
</script>
"""


def sfc(script, attrs="", template="<template><span>x</span></template>", style=""):
    return "%s\n<script%s>\n%s\n</script>%s\n" % (template, attrs, script, style)


def good_default(name="GoodPanel"):
    return "export default {\n  name: '%s',\n};" % name


# (name, sfc_text, expected_code): unsupported surface must refuse, never
# silently degrade. Script-only rows append a valid default export.
NEGATIVES = [
    ("ts_lang", sfc(good_default(), ' lang="ts"'), "E_TS"),
    ("ts_lang_typescript", sfc(good_default(), " lang='typescript'"), "E_TS"),
    ("ts_lang_tsx", sfc(good_default(), ' lang="tsx"'), "E_TS"),
    ("script_setup", sfc(good_default(), " setup"), "E_SCRIPT_SYNTAX"),
    ("script_setup_js", sfc(good_default(), ' setup lang="js"'), "E_SCRIPT_SYNTAX"),
    ("script_generic", sfc(good_default(), ' generic="T"'), "E_SCRIPT_SYNTAX"),
    ("script_src", sfc("", ' src="./x.js"'), "E_SFC_STRUCTURE"),
    ("script_lang_scss", sfc(good_default(), ' lang="scss"'), "E_SFC_STRUCTURE"),
    ("two_scripts", "<template><span>x</span></template>\n<script>\n%s\n</script>\n<script>\n%s\n</script>\n" % (good_default("AaaPanel"), good_default("BbbPanel")), "E_SFC_STRUCTURE"),
    ("no_script", "<template><span>x</span></template>\n", "E_SFC_STRUCTURE"),
    ("junk_outside", "hello\n" + sfc(good_default()), "E_SFC_STRUCTURE"),
    ("unclosed", "<template><span>x</span></template>\n<script>\n%s\n" % good_default(), "E_SFC_STRUCTURE"),
    ("uppercase_tag", "<SCRIPT>\n%s\n</SCRIPT>\n" % good_default(), "E_SFC_STRUCTURE"),
    ("template_src", sfc(good_default(), "", '<template src="./x.html"></template>'), "E_SFC_STRUCTURE"),
    ("template_pug", sfc(good_default(), "", '<template lang="pug"></template>'), "E_SFC_STRUCTURE"),
    ("style_scss", sfc(good_default(), "", "<template><span>x</span></template>", '\n<style lang="scss">\n.x { color: red; }\n</style>'), "E_SFC_STRUCTURE"),
    ("style_src", sfc(good_default(), "", "<template><span>x</span></template>", '\n<style src="./x.css"></style>'), "E_SFC_STRUCTURE"),
    ("export_star", sfc("export * from './x.js';\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("reexport", sfc("export { x } from './x.js';\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("default_call", sfc("export default defineComponent({\n  name: 'CallPanel',\n});"), "E_SCRIPT_SYNTAX"),
    ("default_unresolved", sfc("export default Missing;"), "E_SCRIPT_SYNTAX"),
    ("default_func", sfc("export default function () {};"), "E_SCRIPT_SYNTAX"),
    ("default_let", sfc("let P = {\n  name: 'LetPanel',\n};\nexport default P;"), "E_SCRIPT_SYNTAX"),
    ("computed_key", sfc("export default {\n  ['a']: 1,\n  name: 'CompPanel',\n};"), "E_SCRIPT_SYNTAX"),
    ("spread", sfc("const b = {};\nexport default {\n  ...b,\n  name: 'SpreadPanel',\n};"), "E_SCRIPT_SYNTAX"),
    ("dup_export", sfc("export const a = 1;\nexport const a = 2;\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("dup_export_list", sfc("const a = 1;\nexport { a, a };\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("dup_key", sfc("export default {\n  name: 'DupPanel',\n  name: 'DupPanel',\n};"), "E_SCRIPT_SYNTAX"),
    ("dup_component_export", sfc("export const DupPanel = 1;\n" + good_default("DupPanel")), "E_SCRIPT_SYNTAX"),
    ("top_if", sfc("if (x) {\n  y();\n}\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("bare_expr", sfc("console.log('hi');\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("no_name", sfc("export default {\n  props: {},\n};"), "E_SCRIPT_SYNTAX"),
    ("name_ident", sfc("const N = 'XPanel';\nexport default {\n  name: N,\n};"), "E_SCRIPT_SYNTAX"),
    ("name_number", sfc("export default {\n  name: 42,\n};"), "E_SCRIPT_SYNTAX"),
    ("destruct_export", sfc("export const { a } = obj;\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("export_class", sfc("export class Helper {}\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("interface", sfc("interface Foo {}\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("enum_decl", sfc("enum E {}\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("decorator", sfc("@observable\nclass X {}\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("lowercase_name", sfc("export default {\n  name: 'panel',\n};"), "E_SCRIPT_SYNTAX"),
    ("unterminated_string", sfc('const s = "abc;\n' + good_default()), "E_SCRIPT_SYNTAX"),
    ("unterminated_comment", sfc("/* open\n" + good_default()), "E_SCRIPT_SYNTAX"),
    ("default_twice", sfc(good_default("OnePanel") + "\n" + good_default("TwoPanel")), "E_SCRIPT_SYNTAX"),
]


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
    return root


def run_cli(*args):
    return subprocess.run([sys.executable, os.path.join(W, "tools", "extract_vue.py")] + list(args),
                          capture_output=True, text=True)


class TExtractPositive(unittest.TestCase):
    def test_ok_record_shape(self):
        rec = V.extract_text(SFC_OK, "CapsulePanel.vue")
        self.assertEqual(sorted(rec), ["bindings", "component", "exports", "path", "regions",
                                       "schema", "source_sha256", "symbols", "tool"])
        self.assertEqual(rec["schema"], "ctx.vue-inventory.v1")
        self.assertEqual(rec["tool"], V.VERSION)
        self.assertEqual(rec["path"], "CapsulePanel.vue")
        self.assertEqual(rec["source_sha256"], hashlib.sha256(SFC_OK.encode("utf-8")).hexdigest())

    def test_ok_component_bindings(self):
        rec = V.extract_text(SFC_OK, "CapsulePanel.vue")
        self.assertEqual(rec["component"], {"identity": "options-name", "line": 12, "name": "CapsulePanel"})
        self.assertEqual(rec["bindings"], [
            {"line": 16, "name": "emits"},
            {"line": 17, "name": "methods"},
            {"line": 12, "name": "name"},
            {"line": 13, "name": "props"},
        ])

    def test_ok_exports_sorted_with_jsdoc(self):
        rec = V.extract_text(SFC_OK, "CapsulePanel.vue")
        self.assertEqual(rec["exports"], [
            {"jsdoc": "/** Apple helper. */", "kind": "function", "line": 8, "name": "apple"},
            {"jsdoc": "/** Zebra store. */", "kind": "const", "line": 6, "name": "zebra"},
        ])

    def test_ok_regions_document_order(self):
        rec = V.extract_text(SFC_OK, "CapsulePanel.vue")
        self.assertEqual(rec["regions"], [
            {"block": "template", "end_line": 3, "start_line": 1},
            {"block": "script", "end_line": 21, "start_line": 4},
            {"block": "style", "end_line": 24, "start_line": 22},
        ])

    def test_ok_symbols_sorted(self):
        rec = V.extract_text(SFC_OK, "CapsulePanel.vue")
        self.assertEqual(rec["symbols"], [
            {"line": 12, "name": "CapsulePanel", "path": "CapsulePanel.vue", "symbol": "CapsulePanel"},
            {"line": 16, "name": "emits", "path": "CapsulePanel.vue", "symbol": "CapsulePanel#emits"},
            {"line": 17, "name": "methods", "path": "CapsulePanel.vue", "symbol": "CapsulePanel#methods"},
            {"line": 12, "name": "name", "path": "CapsulePanel.vue", "symbol": "CapsulePanel#name"},
            {"line": 13, "name": "props", "path": "CapsulePanel.vue", "symbol": "CapsulePanel#props"},
            {"line": 8, "name": "apple", "path": "CapsulePanel.vue", "symbol": "apple"},
            {"line": 6, "name": "zebra", "path": "CapsulePanel.vue", "symbol": "zebra"},
        ])

    def test_export_list(self):
        rec = V.extract_text(SFC_EXPORT_LIST, "ListPanel.vue")
        self.assertEqual(rec["component"]["name"], "ListPanel")
        self.assertEqual(rec["exports"], [
            {"jsdoc": "/** Re-exported local. */", "kind": "local", "line": 7, "name": "alias"},
            {"jsdoc": "/** Re-exported local. */", "kind": "local", "line": 7, "name": "inner"},
        ])
        self.assertEqual(rec["regions"], [
            {"block": "template", "end_line": 3, "start_line": 1},
            {"block": "script", "end_line": 11, "start_line": 4},
        ])

    def test_default_identifier_resolves(self):
        rec = V.extract_text(SFC_DEFAULT_IDENT, "IdentPanel.vue")
        self.assertEqual(rec["component"], {"identity": "options-name", "line": 7, "name": "IdentPanel"})
        self.assertEqual(rec["bindings"], [
            {"line": 7, "name": "name"},
            {"line": 8, "name": "props"},
        ])
        self.assertEqual(rec["exports"], [])
        self.assertEqual([s["symbol"] for s in rec["symbols"]],
                         ["IdentPanel", "IdentPanel#name", "IdentPanel#props"])

    def test_exported_const_default(self):
        text = sfc("export const Panel = {\n  name: 'ExpPanel',\n};\nexport default Panel;")
        rec = V.extract_text(text, "ExpPanel.vue")
        self.assertEqual(rec["component"], {"identity": "options-name", "line": 4, "name": "ExpPanel"})
        self.assertEqual(rec["exports"], [
            {"jsdoc": None, "kind": "const", "line": 3, "name": "Panel"},
        ])

    def test_minimal_and_js_lang(self):
        rec = V.extract_text(SFC_MINIMAL, "MiniPanel.vue")
        self.assertEqual(rec["component"]["name"], "MiniPanel")
        self.assertEqual(rec["bindings"], [{"line": 4, "name": "name"}])
        self.assertEqual(rec["exports"], [])
        rec2 = V.extract_text(SFC_JS_LANG, "JsPanel.vue")
        self.assertEqual(rec2["component"]["name"], "JsPanel")

    def test_multi_declarator_shares_jsdoc(self):
        rec = V.extract_text(SFC_MULTI_DECL, "MultiPanel.vue")
        self.assertEqual([e["name"] for e in rec["exports"]], ["alpha", "beta"])
        self.assertEqual(rec["exports"][0]["line"], 7)
        self.assertEqual(rec["exports"][1]["line"], 7)
        self.assertTrue(rec["exports"][0]["jsdoc"].startswith("/**"))
        self.assertIn("@type {number}", rec["exports"][0]["jsdoc"])
        self.assertEqual(rec["exports"][0]["jsdoc"], rec["exports"][1]["jsdoc"])

    def test_lookalikes_never_become_exports(self):
        rec = V.extract_text(SFC_LOOKALIKES, "CleanPanel.vue")
        self.assertEqual(rec["component"]["name"], "CleanPanel")
        self.assertEqual([(e["name"], e["line"]) for e in rec["exports"]], [("real", 13)])
        names = [s["name"] for s in rec["symbols"]] + [s["symbol"] for s in rec["symbols"]]
        blob = "\n".join(names)
        for bad in ("evil", "Evil", "fakeComment", "fakeBlock", "fakeStr", "fakeTpl", "fakeRe", "fakeCss", "X", "Y"):
            self.assertNotIn(bad, names, bad)
        self.assertNotIn("evil", blob)

    def test_symbol_lines_contain_names(self):
        # Paper oracle (P:1899): line `line` of the file contains `name`,
        # exactly one row per (path, symbol).
        for text, path in ((SFC_OK, "CapsulePanel.vue"), (SFC_EXPORT_LIST, "ListPanel.vue"),
                            (SFC_DEFAULT_IDENT, "IdentPanel.vue"), (SFC_LOOKALIKES, "CleanPanel.vue"),
                            (SFC_MINIMAL, "MiniPanel.vue")):
            rec = V.extract_text(text, path)
            lines = text.split("\n")
            seen = set()
            for row in rec["symbols"]:
                self.assertNotIn((row["path"], row["symbol"]), seen, row)
                seen.add((row["path"], row["symbol"]))
                self.assertIn(row["name"], lines[row["line"] - 1], row)

    def test_deterministic_bytes(self):
        a = V.canon(V.extract_text(SFC_OK, "CapsulePanel.vue"))
        b = V.canon(V.extract_text(SFC_OK, "CapsulePanel.vue"))
        self.assertEqual(a, b)
        self.assertEqual(a, V.canon(json.loads(a.decode("utf-8"))))

    def test_filename_mismatch_allowed(self):
        rec = V.extract_text(SFC_MINIMAL, "OtherName.vue")
        self.assertEqual(rec["component"]["name"], "MiniPanel")
        self.assertEqual(rec["path"], "OtherName.vue")


class TExtractRefusals(unittest.TestCase):
    def test_refusal_table(self):
        self.assertTrue(len(NEGATIVES) >= 40, len(NEGATIVES))
        for name, text, code in NEGATIVES:
            with self.subTest(name=name):
                with self.assertRaises(V.VueError) as c:
                    V.extract_text(text, "CasePanel.vue")
                self.assertEqual(c.exception.code, code, name)
                self.assertEqual(c.exception.path, "CasePanel.vue", name)

    def test_ts_refuses_before_parsing(self):
        with self.assertRaises(V.VueError) as c:
            V.extract_text(sfc("interface Foo {}", ' lang="ts"'), "TsPanel.vue")
        self.assertEqual(c.exception.code, "E_TS")

    def test_lowercase_basename_refuses(self):
        with self.assertRaises(V.VueError) as c:
            V.extract_text(SFC_MINIMAL, "panel.vue")
        self.assertEqual(c.exception.code, "E_PATH")


class TExtractFiles(unittest.TestCase):
    def test_run_writes_record_and_symbols(self):
        d = tmp()
        root = make_root(d, {"ui/CapsulePanel.vue": SFC_OK, "ui/MiniPanel.vue": SFC_MINIMAL})
        out = os.path.join(d, "out")
        rec = V.run(root, ["ui/MiniPanel.vue", "ui/CapsulePanel.vue"], out)
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["files"], ["ui/CapsulePanel.vue", "ui/MiniPanel.vue"])
        self.assertEqual(rec["symbols"], 9)
        self.assertEqual(sorted(rec), ["files", "pass", "schema", "symbols", "tool"])
        cap = json.load(open(os.path.join(out, "ui/CapsulePanel.vue.json")))
        self.assertEqual(cap["path"], "ui/CapsulePanel.vue")
        self.assertEqual(cap["component"]["name"], "CapsulePanel")
        rows = open(os.path.join(out, "symbols.jsonl"), encoding="utf-8").read().split("\n")
        rows = [json.loads(r) for r in rows if r.strip()]
        self.assertEqual(len(rows), 9)
        keys = [(r["path"], r["symbol"]) for r in rows]
        self.assertEqual(keys, sorted(keys))
        self.assertIn({"line": 4, "name": "MiniPanel", "path": "ui/MiniPanel.vue",
                       "symbol": "MiniPanel"}, rows)

    def test_run_is_all_or_nothing(self):
        d = tmp()
        root = make_root(d, {"ui/GoodPanel.vue": SFC_MINIMAL, "ui/BadPanel.vue": sfc("export * from './x';")})
        out = os.path.join(d, "out")
        with self.assertRaises(V.VueError) as c:
            V.run(root, ["ui/GoodPanel.vue", "ui/BadPanel.vue"], out)
        self.assertEqual(c.exception.code, "E_SCRIPT_SYNTAX")
        self.assertFalse(os.path.exists(out))

    def test_run_sorted_inputs_stable_bytes(self):
        d = tmp()
        root = make_root(d, {"ui/CapsulePanel.vue": SFC_OK, "ui/MiniPanel.vue": SFC_MINIMAL})
        o1, o2 = os.path.join(d, "o1"), os.path.join(d, "o2")
        V.run(root, ["ui/MiniPanel.vue", "ui/CapsulePanel.vue"], o1)
        V.run(root, ["ui/CapsulePanel.vue", "ui/MiniPanel.vue"], o2)
        for rel in ("ui/CapsulePanel.vue.json", "ui/MiniPanel.vue.json", "symbols.jsonl"):
            self.assertEqual(open(os.path.join(o1, rel), "rb").read(),
                            open(os.path.join(o2, rel), "rb").read(), rel)

    def test_check_pass_and_drift(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        out = os.path.join(d, "out")
        V.run(root, ["ui/MiniPanel.vue"], out)
        ok = V.run(root, ["ui/MiniPanel.vue"], out, check=True)
        self.assertTrue(ok["pass"])
        with open(os.path.join(out, "symbols.jsonl"), "ab") as f:
            f.write(b" ")
        bad = V.run(root, ["ui/MiniPanel.vue"], out, check=True)
        self.assertFalse(bad["pass"])
        self.assertTrue(any(e.startswith("E_CHECK") for e in bad["errors"]), bad["errors"])

    def test_duplicate_inputs_refuse(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        with self.assertRaises(V.VueError) as c:
            V.run(root, ["ui/MiniPanel.vue", "ui/MiniPanel.vue"], os.path.join(d, "out"))
        self.assertEqual(c.exception.code, "E_PATH")

    def test_path_escapes_refuse(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        for bad in ("/etc/hostname.vue", "../MiniPanel.vue", "ui/../Other.vue",
                    "ui\\MiniPanel.vue", "", "ui/MiniPanel.js", "ui/Missing.vue"):
            with self.subTest(path=bad):
                with self.assertRaises(V.VueError) as c:
                    V.extract_file(root, bad)
                self.assertEqual(c.exception.code, "E_PATH", bad)

    def test_symlink_refuses(self):
        d = tmp()
        root = make_root(d, {"ui/RealPanel.vue": SFC_MINIMAL})
        os.symlink(os.path.join(root, "ui/RealPanel.vue"), os.path.join(root, "ui/LinkPanel.vue"))
        with self.assertRaises(V.VueError) as c:
            V.extract_file(root, "ui/LinkPanel.vue")
        self.assertEqual(c.exception.code, "E_PATH")

    def test_non_utf8_refuses(self):
        d = tmp()
        root = make_root(d, {"ui/BinPanel.vue": b"<template>\xff</template>\n"})
        with self.assertRaises(V.VueError) as c:
            V.extract_file(root, "ui/BinPanel.vue")
        self.assertEqual(c.exception.code, "E_DECODE")

    def test_long_file_refuses_unless_allowed(self):
        lines = ["<template><span>x</span></template>", "<script>"]
        lines += ["const pad%d = %d;" % (i, i) for i in range(601)]
        lines += [good_default("LongPanel"), "</script>", ""]
        text = "\n".join(lines)
        self.assertTrue(len(text.split("\n")) > 600)
        with self.assertRaises(V.VueError) as c:
            V.extract_text(text, "LongPanel.vue")
        self.assertEqual(c.exception.code, "E_SFC_STRUCTURE")
        rec = V.extract_text(text, "LongPanel.vue", allow_long=True)
        self.assertEqual(rec["component"]["name"], "LongPanel")

    def test_sha_binds_bytes(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        rec = V.extract_file(root, "ui/MiniPanel.vue")
        raw = open(os.path.join(root, "ui/MiniPanel.vue"), "rb").read()
        self.assertEqual(rec["source_sha256"], hashlib.sha256(raw).hexdigest())


class TExtractCli(unittest.TestCase):
    def test_cli_pass(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        out = os.path.join(d, "out")
        r = run_cli("--root", root, "--out", out, "ui/MiniPanel.vue")
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["files"], ["ui/MiniPanel.vue"])
        self.assertTrue(os.path.isfile(os.path.join(out, "symbols.jsonl")))

    def test_cli_check(self):
        d = tmp()
        root = make_root(d, {"ui/MiniPanel.vue": SFC_MINIMAL})
        out = os.path.join(d, "out")
        self.assertEqual(run_cli("--root", root, "--out", out, "ui/MiniPanel.vue").returncode, 0)
        r = run_cli("--root", root, "--out", out, "--check", "ui/MiniPanel.vue")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(json.loads(r.stdout)["pass"])

    def test_cli_refuses(self):
        d = tmp()
        root = make_root(d, {"ui/BadPanel.vue": sfc(good_default(), ' lang="ts"')})
        r = run_cli("--root", root, "--out", os.path.join(d, "out"), "ui/BadPanel.vue")
        self.assertEqual(r.returncode, 4)
        self.assertIn("E_TS", r.stderr)

    def test_cli_usage(self):
        r = run_cli("--root", tmp(), "--out", os.path.join(tmp(), "out"))
        self.assertEqual(r.returncode, 2)


class TExtractHygiene(unittest.TestCase):
    def test_gate_lists_test(self):
        gate = open(os.path.join(W, "gate.sh"), encoding="utf-8").read()
        self.assertIn("test_extract_vue.py", gate)

    def test_no_runtime_scan(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_vue.py"), encoding="utf-8").read())
        calls = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute):
                calls.add(n.attr)
            elif isinstance(n, ast.Name):
                calls.add(n.id)
        self.assertTrue(calls.isdisjoint({"walk", "glob", "iglob", "rglob", "scandir", "listdir"}))

    def test_stdlib_only(self):
        tree = ast.parse(open(os.path.join(W, "tools", "extract_vue.py"), encoding="utf-8").read())
        std = set(sys.stdlib_module_names)
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                for a in n.names:
                    self.assertIn(a.name.split(".")[0], std, a.name)

    def test_tool_size_cap(self):
        # Tokenizer-based parser: the P:683 script caps are guidance, and the
        # lookalike/unsupported-syntax negatives require a real tokenizer, so
        # the reviewed cap for this tool is 900, not the 400 medium default.
        n = len(open(os.path.join(W, "tools", "extract_vue.py"), encoding="utf-8").read().split("\n"))
        self.assertLessEqual(n, 900, n)

    def test_error_codes_closed(self):
        self.assertEqual(sorted(V.CODES), ["E_CHECK", "E_DECODE", "E_PATH", "E_SCRIPT_SYNTAX", "E_SFC_STRUCTURE", "E_TS"])


if __name__ == "__main__":
    unittest.main()
