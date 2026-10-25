import hashlib
import json
import os
import subprocess
import sys
import unittest
from common import *
import extract_css as C

# ---- fixtures and negative oracles (first) ----
# Synthetic committed-shape fixtures, built at runtime in tmp dirs (no real
# corpus paths). Default allowlist relpaths from extract_css.DEFAULT_ALLOW.
CSS_REL = "app/shell/src/design/tokens.css"
TOK_REL = "packages/capsule-ui-kit/src/design/tokens.json"

AXES = {
    "scheme": {"preferences": ["system", "light", "dark"], "resolvedModes": ["light", "dark"],
               "defaultPreference": "dark", "rootAttribute": "data-theme-scheme"},
    "contrast": {"values": ["normal", "high"], "default": "normal",
                 "rootAttribute": "data-theme-contrast"},
    "density": {"values": ["compact", "regular", "comfortable"], "default": "regular",
                "rootAttribute": "data-theme-density"},
    "textScale": {"values": ["0.875", "1", "1.125", "1.25"], "default": "1",
                  "independentOfDensity": True, "rootAttribute": "data-theme-text-scale"},
    "forcedColors": {"values": ["none", "active"], "default": "none",
                     "mediaQuery": "(forced-colors: active)",
                     "rootAttribute": "data-theme-forced-colors"},
    "reducedMotion": {"values": ["no-preference", "reduce"], "default": "no-preference",
                      "mediaQuery": "(prefers-reduced-motion: reduce)",
                      "rootAttribute": "data-theme-motion"},
}

# 11 synthetic leaves: str/int/float $value, modes+forcedColors, density,
# scale, reducedMotion, and {ref} values (one semantic, one component).
LEAVES = {
    "primitive": {
        "color": {
            "ink": {"$type": "color", "$value": "#101418"},
            "paper": {"$type": "color", "$value": "#f8fafc"},
        },
        "space": {"md": {"$type": "dimension", "$value": "16px"}},
        "zIndex": {"base": {"$type": "zIndex", "$value": 1}},
        "opacity": {"faint": {"$type": "opacity", "$value": 0.04}},
    },
    "semantic": {
        "surface": {"canvas": {"$type": "color",
                               "modes": {"light.normal": "{primitive.color.paper}",
                                         "dark.normal": "{primitive.color.ink}"},
                               "forcedColors": {"active": "Canvas"}}},
        "spacing": {"md": {"$type": "dimension", "$value": "{primitive.space.md}"}},
        "size": {"control": {"heightMd": {"$type": "dimension",
                                          "density": {"compact": "26px", "regular": "32px",
                                                      "comfortable": "36px"}}}},
        "typography": {"fontSize": {"md": {"$type": "dimension",
                                           "scale": {"0.875": "12px", "1": "13px",
                                                     "1.125": "15px", "1.25": "16px"}}}},
        "motion": {"duration": {"normal": {"$type": "duration", "$value": "150ms",
                                           "reducedMotion": {"reduce": "0ms"}}}},
    },
    "component": {
        "capsulePanel": {"background": {"$type": "color",
                                        "$value": "{semantic.surface.canvas}"}},
    },
}

# Line numbers are part of the oracle: every declaration line is asserted in
# the symbols gold below. Line 15 pins attribute-order independence.
CSS_LINES = [
    "/* Synthetic token set for W0-CSS tests. */",
    ":root {",
    "  --cuk-primitive-color-ink: #101418;",
    "  --cuk-primitive-color-paper: #f8fafc;",
    "  --cuk-primitive-space-md: 16px;",
    "  --cuk-primitive-z-index-base: 1;",
    "  --cuk-primitive-opacity-faint: 0.04;",
    "  --cuk-semantic-spacing-md: var(--cuk-primitive-space-md);",
    "  --cuk-semantic-motion-duration-normal: 150ms;",
    "  --cuk-component-capsule-panel-background: var(--cuk-semantic-surface-canvas);",
    "}",
    '[data-theme-scheme="light"][data-theme-contrast="normal"] {',
    "  --cuk-semantic-surface-canvas: #f8fafc;",
    "}",
    '[data-theme-contrast="normal"][data-theme-scheme="dark"] {',
    "  --cuk-semantic-surface-canvas: #101418;",
    "}",
    '[data-theme-density="compact"] {',
    "  --cuk-semantic-size-control-height-md: 26px;",
    "}",
    '[data-theme-density="regular"] {',
    "  --cuk-semantic-size-control-height-md: 32px;",
    "}",
    '[data-theme-density="comfortable"] {',
    "  --cuk-semantic-size-control-height-md: 36px;",
    "}",
    '[data-theme-text-scale="0.875"] {',
    "  --cuk-semantic-typography-font-size-md: 12px;",
    "}",
    '[data-theme-text-scale="1"] {',
    "  --cuk-semantic-typography-font-size-md: 13px;",
    "}",
    '[data-theme-text-scale="1.125"] {',
    "  --cuk-semantic-typography-font-size-md: 15px;",
    "}",
    '[data-theme-text-scale="1.25"] {',
    "  --cuk-semantic-typography-font-size-md: 16px;",
    "}",
    "@media (forced-colors: active) {",
    "  :root {",
    "    --cuk-semantic-surface-canvas: Canvas;",
    "  }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  :root {",
    "    --cuk-semantic-motion-duration-normal: 0ms;",
    "  }",
    "}",
]

TOKEN_NAMES = [
    "--cuk-component-capsule-panel-background",
    "--cuk-primitive-color-ink",
    "--cuk-primitive-color-paper",
    "--cuk-primitive-opacity-faint",
    "--cuk-primitive-space-md",
    "--cuk-primitive-z-index-base",
    "--cuk-semantic-motion-duration-normal",
    "--cuk-semantic-size-control-height-md",
    "--cuk-semantic-spacing-md",
    "--cuk-semantic-surface-canvas",
    "--cuk-semantic-typography-font-size-md",
]

ANCHORS = TOKEN_NAMES + [
    "region:base",
    "region:dark.normal",
    "region:density.comfortable",
    "region:density.compact",
    "region:density.regular",
    "region:forced-colors",
    "region:light.normal",
    "region:reduced-motion",
    "region:scale.0.875",
    "region:scale.1",
    "region:scale.1.125",
    "region:scale.1.25",
]

SYMBOLS = (
    [{"path": CSS_REL, "symbol": n, "name": n, "line": ln} for n, ln in [
        ("--cuk-component-capsule-panel-background", 10),
        ("--cuk-primitive-color-ink", 3),
        ("--cuk-primitive-color-paper", 4),
        ("--cuk-primitive-opacity-faint", 7),
        ("--cuk-primitive-space-md", 5),
        ("--cuk-primitive-z-index-base", 6),
        ("--cuk-semantic-motion-duration-normal", 9),
        ("--cuk-semantic-size-control-height-md", 19),
        ("--cuk-semantic-spacing-md", 8),
        ("--cuk-semantic-surface-canvas", 13),
        ("--cuk-semantic-typography-font-size-md", 28),
    ]] + [
        {"path": CSS_REL, "symbol": "region:base", "name": ":root", "line": 2},
        {"path": CSS_REL, "symbol": "region:dark.normal",
         "name": '[data-theme-contrast="normal"][data-theme-scheme="dark"]', "line": 15},
        {"path": CSS_REL, "symbol": "region:density.comfortable",
         "name": '[data-theme-density="comfortable"]', "line": 24},
        {"path": CSS_REL, "symbol": "region:density.compact",
         "name": '[data-theme-density="compact"]', "line": 18},
        {"path": CSS_REL, "symbol": "region:density.regular",
         "name": '[data-theme-density="regular"]', "line": 21},
        {"path": CSS_REL, "symbol": "region:forced-colors",
         "name": "@media (forced-colors: active)", "line": 39},
        {"path": CSS_REL, "symbol": "region:light.normal",
         "name": '[data-theme-scheme="light"][data-theme-contrast="normal"]', "line": 12},
        {"path": CSS_REL, "symbol": "region:reduced-motion",
         "name": "@media (prefers-reduced-motion: reduce)", "line": 44},
        {"path": CSS_REL, "symbol": "region:scale.0.875",
         "name": '[data-theme-text-scale="0.875"]', "line": 27},
        {"path": CSS_REL, "symbol": "region:scale.1",
         "name": '[data-theme-text-scale="1"]', "line": 30},
        {"path": CSS_REL, "symbol": "region:scale.1.125",
         "name": '[data-theme-text-scale="1.125"]', "line": 33},
        {"path": CSS_REL, "symbol": "region:scale.1.25",
         "name": '[data-theme-text-scale="1.25"]', "line": 36},
    ]
)

MODES = [
    {"key": "dark.normal", "kind": "modes", "region": "region:dark.normal",
     "selector": '[data-theme-contrast="normal"][data-theme-scheme="dark"]', "line": 15},
    {"key": "density.comfortable", "kind": "density", "region": "region:density.comfortable",
     "selector": '[data-theme-density="comfortable"]', "line": 24},
    {"key": "density.compact", "kind": "density", "region": "region:density.compact",
     "selector": '[data-theme-density="compact"]', "line": 18},
    {"key": "density.regular", "kind": "density", "region": "region:density.regular",
     "selector": '[data-theme-density="regular"]', "line": 21},
    {"key": "forcedColors.active", "kind": "forcedColors", "region": "region:forced-colors",
     "selector": "@media (forced-colors: active)", "line": 39},
    {"key": "light.normal", "kind": "modes", "region": "region:light.normal",
     "selector": '[data-theme-scheme="light"][data-theme-contrast="normal"]', "line": 12},
    {"key": "reducedMotion.reduce", "kind": "reducedMotion", "region": "region:reduced-motion",
     "selector": "@media (prefers-reduced-motion: reduce)", "line": 44},
    {"key": "scale.0.875", "kind": "scale", "region": "region:scale.0.875",
     "selector": '[data-theme-text-scale="0.875"]', "line": 27},
    {"key": "scale.1", "kind": "scale", "region": "region:scale.1",
     "selector": '[data-theme-text-scale="1"]', "line": 30},
    {"key": "scale.1.125", "kind": "scale", "region": "region:scale.1.125",
     "selector": '[data-theme-text-scale="1.125"]', "line": 33},
    {"key": "scale.1.25", "kind": "scale", "region": "region:scale.1.25",
     "selector": '[data-theme-text-scale="1.25"]', "line": 36},
]


def make_tokens(mutate=None):
    d = {"schema": "capsule-ui-kit.design-tokens/v1",
         "authority": {"owner": TOK_REL,
                       "direction": "primitive -> semantic -> component",
                       "vendorVariableReferenceAllowed": False,
                       "deterministicOfflineGeneration": True,
                       "cssVariablePrefix": "--cuk"},
         "axes": json.loads(json.dumps(AXES)),
         "primitive": json.loads(json.dumps(LEAVES["primitive"])),
         "semantic": json.loads(json.dumps(LEAVES["semantic"])),
         "component": json.loads(json.dumps(LEAVES["component"]))}
    if mutate:
        mutate(d)
    return json.dumps(d, sort_keys=True, indent=2) + "\n"


def make_css(drop=(), sub=None, extra=None):
    lines = [ln for i, ln in enumerate(CSS_LINES, 1) if i not in set(drop)]
    if sub:
        lines = [sub.get(ln, ln) for ln in lines]
    if extra:
        lines = lines + extra
    return "\n".join(lines) + "\n"


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def _rb(p):
    with open(p, "rb") as f:
        return f.read()


def _read_jsonl(p):
    with open(p, encoding="utf-8") as f:
        return [json.loads(ln) for ln in f if ln.strip()]


def make_case(d, css_text=None, tok_text=None, css_rel=CSS_REL, tok_rel=TOK_REL):
    root = os.path.join(d, "repo")
    css = _w(root, css_rel, make_css() if css_text is None else css_text)
    tok = _w(root, tok_rel, make_tokens() if tok_text is None else tok_text)
    return root, css, tok


def run_cli(*args):
    return subprocess.run([sys.executable, os.path.join(W, "tools", "extract_css.py")] + list(args),
                          capture_output=True, text=True)


def base_args(root, css_rel=CSS_REL, tok_rel=TOK_REL):
    return ["--root", root, "--css", os.path.join(root, css_rel),
            "--tokens", os.path.join(root, tok_rel)]


class TCssGold(unittest.TestCase):
    def test_names_modes_symbols_match(self):
        root, css, tok = make_case(tmp())
        r = run_cli(*base_args(root))
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertEqual(rec["schema"], "css.tokens.v1")
        self.assertEqual(rec["token_set"], "tokens")
        self.assertEqual(rec["node_id"], "css:tokens")
        self.assertEqual(rec["family"], "css:tokens")
        self.assertEqual(rec["prefix"], "--cuk")
        self.assertEqual([t["name"] for t in rec["tokens"]], TOKEN_NAMES)
        self.assertEqual(rec["modes"], MODES)
        self.assertEqual([a["a"] for a in rec["anchors"]], ANCHORS)
        self.assertTrue(all(a["role"] == "symbol" for a in rec["anchors"]))
        self.assertTrue(all(1 <= len(a["a"]) <= 64 for a in rec["anchors"]))
        self.assertEqual(rec["symbols"], SYMBOLS)
        canvas = [t for t in rec["tokens"]
                  if t["name"] == "--cuk-semantic-surface-canvas"][0]
        self.assertEqual(canvas["token"], "semantic.surface.canvas")
        self.assertEqual(canvas["type"], "color")
        self.assertEqual(canvas["line"], 13)
        self.assertEqual(canvas["defs"], [
            {"region": "forced:active", "line": 41},
            {"region": "mode:dark.normal", "line": 16},
            {"region": "mode:light.normal", "line": 13}])
        motion = [t for t in rec["tokens"]
                  if t["name"] == "--cuk-semantic-motion-duration-normal"][0]
        self.assertEqual(motion["defs"], [
            {"region": "base", "line": 9}, {"region": "motion:reduce", "line": 46}])
        self.assertEqual(rec["css"]["path"], CSS_REL)
        self.assertEqual(rec["css"]["sha256"], hashlib.sha256(_rb(css)).hexdigest())
        self.assertEqual(rec["tokens_source"]["sha256"],
                         hashlib.sha256(_rb(tok)).hexdigest())
        self.assertEqual([g["node"] for g in rec["proposed_groups"]],
                         ["css:tokens.p0", "css:tokens.p1"])
        self.assertEqual([len(g["anchors"]) for g in rec["proposed_groups"]], [16, 7])
        flat = [a for g in rec["proposed_groups"] for a in g["anchors"]]
        self.assertEqual(flat, ANCHORS)

    def test_deterministic_bytes(self):
        root, _, _ = make_case(tmp())
        a = run_cli(*base_args(root))
        b = run_cli(*base_args(root))
        self.assertEqual(a.returncode, 0, a.stderr)
        self.assertEqual(a.stdout, b.stdout)
        self.assertEqual(a.stdout, C.canon(json.loads(a.stdout)).decode("utf-8"))

    def test_symbols_file(self):
        root, _, _ = make_case(tmp())
        sp = os.path.join(root, "symbols.jsonl")
        r = run_cli(*base_args(root), "--symbols", sp)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(_read_jsonl(sp), SYMBOLS)

    def test_check_identical_and_mismatch(self):
        root, css, _ = make_case(tmp())
        op = os.path.join(root, "rec.json")
        r = run_cli(*base_args(root), "--out", op)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(_rb(op).decode("utf-8"), r.stdout)
        r = run_cli(*base_args(root), "--out", op, "--check")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(r.stdout, "identical\n")
        with open(css, "ab") as f:
            f.write(b"/* touch */\n")
        r = run_cli(*base_args(root), "--out", op, "--check")
        self.assertEqual(r.returncode, 5)
        self.assertEqual(r.stdout, "MISMATCH\n")

    def test_kebab_and_names(self):
        self.assertEqual(C.kebab("heightMd"), "height-md")
        self.assertEqual(C.kebab("zIndex"), "z-index")
        self.assertEqual(C.kebab("md"), "md")
        self.assertEqual(C.css_name("--cuk", "semantic.size.control.heightMd"),
                         "--cuk-semantic-size-control-height-md")


class TCssCssRefusals(unittest.TestCase):
    def run_case(self, css_text):
        root, _, _ = make_case(tmp(), css_text=css_text)
        return run_cli(*base_args(root))

    def test_missing_token_fails(self):
        r = self.run_case(make_css(drop=(3,)))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_MISSING_TOKEN"), r.stderr)
        self.assertIn("--cuk-primitive-color-ink", r.stderr)

    def test_comment_only_token_fails(self):
        css = make_css(sub={"  --cuk-primitive-color-ink: #101418;":
                            "  /* --cuk-primitive-color-ink: #101418; */"})
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_MISSING_TOKEN"), r.stderr)
        self.assertIn("(comment-only)", r.stderr)

    def test_unknown_token_fails(self):
        css = make_css().replace("}\n", "  --cuk-nope: 1px;\n}\n", 1)
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNKNOWN_TOKEN"), r.stderr)

    def test_unadmitted_mode_fails(self):
        css = make_css().replace(
            '[data-theme-density="compact"] {\n',
            '[data-theme-density="compact"] {\n  --cuk-semantic-surface-canvas: red;\n', 1)
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNADMITTED_MODE"), r.stderr)

    def test_duplicate_token_fails(self):
        css = make_css().replace("  --cuk-primitive-color-ink: #101418;\n",
                                 "  --cuk-primitive-color-ink: #101418;\n"
                                 "  --cuk-primitive-color-ink: #000000;\n", 1)
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_DUPLICATE_TOKEN"), r.stderr)

    def test_vendor_definition_fails(self):
        css = make_css().replace("}\n", "  --dv-foo: 1;\n}\n", 1)
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_VENDOR_AUTHORITY"), r.stderr)

    def test_vendor_var_fails(self):
        css = make_css(sub={"  --cuk-primitive-space-md: 16px;":
                            "  --cuk-primitive-space-md: var(--p-x);"})
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_VENDOR_AUTHORITY"), r.stderr)

    def test_dangling_var_fails(self):
        css = make_css(sub={"  --cuk-primitive-space-md: 16px;":
                            "  --cuk-primitive-space-md: var(--cuk-ghost);"})
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_DANGLING_REF"), r.stderr)

    def test_unsupported_at_rule_fails(self):
        r = self.run_case('@import "x.css";\n' + make_css())
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNSUPPORTED"), r.stderr)

    def test_unsupported_selector_fails(self):
        r = self.run_case(make_css(extra=[".cls {", "  --cuk-primitive-color-ink: red;", "}"]))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNSUPPORTED"), r.stderr)

    def test_unbalanced_brace_fails(self):
        r = self.run_case(make_css() + ":root {\n")
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNSUPPORTED"), r.stderr)

    def test_lone_scheme_region_fails(self):
        css = make_css(extra=['[data-theme-scheme="dark"] {',
                              "  --cuk-semantic-surface-canvas: red;", "}"])
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNADMITTED_MODE"), r.stderr)

    def test_duplicate_region_fails(self):
        css = make_css(extra=[":root {", "  --cuk-primitive-color-ink: red;", "}"])
        r = self.run_case(css)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_DUPLICATE_REGION"), r.stderr)

    def test_crlf_fails(self):
        root, _, _ = make_case(tmp())
        p = os.path.join(root, CSS_REL)
        with open(p, "wb") as f:
            f.write(make_css().replace("\n", "\r\n").encode("utf-8"))
        r = run_cli(*base_args(root))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_UNSUPPORTED"), r.stderr)


class TCssTokensRefusals(unittest.TestCase):
    def run_case(self, tok_text):
        root, _, _ = make_case(tmp(), tok_text=tok_text)
        return run_cli(*base_args(root))

    def test_bad_schema_fails(self):
        r = self.run_case(make_tokens(lambda d: d.update(schema="nope")))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_SCHEMA"), r.stderr)

    def test_missing_type_fails(self):
        def mut(d):
            del d["semantic"]["surface"]["canvas"]["$type"]
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_SCHEMA"), r.stderr)

    def test_extra_leaf_key_fails(self):
        def mut(d):
            d["primitive"]["color"]["ink"]["css"] = "--short"
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_LEAF"), r.stderr)

    def test_bad_mode_key_fails(self):
        def mut(d):
            d["semantic"]["surface"]["canvas"]["modes"]["dark.low"] = "red"
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_MODE_KEY"), r.stderr)

    def test_dangling_ref_fails(self):
        def mut(d):
            d["semantic"]["spacing"]["md"]["$value"] = "{nope.path}"
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_DANGLING_REF"), r.stderr)

    def test_tier_inversion_fails(self):
        def mut(d):
            d["primitive"]["color"]["ink"]["$value"] = "{semantic.spacing.md}"
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_TIER_INVERSION"), r.stderr)

    def test_cycle_fails(self):
        def mut(d):
            d["semantic"]["spacing"]["md"]["$value"] = "{semantic.surface.canvas}"
            d["semantic"]["surface"]["canvas"]["modes"] = {"light.normal": "{semantic.spacing.md}"}
            del d["semantic"]["surface"]["canvas"]["forcedColors"]
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_CYCLIC_REF"), r.stderr)

    def test_vendor_leak_fails(self):
        def mut(d):
            d["primitive"]["color"]["ink"]["$value"] = "var(--dv-foo)"
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_VENDOR_LEAK"), r.stderr)

    def test_empty_inventory_fails(self):
        def mut(d):
            d["primitive"] = {}
            d["semantic"] = {}
            d["component"] = {}
        r = self.run_case(make_tokens(mut))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_TOKENS_EMPTY"), r.stderr)


class TCssInputs(unittest.TestCase):
    def test_allowlist_refuses_and_admits(self):
        d = tmp()
        root, _, _ = make_case(d, css_rel="other/tokens.css", tok_rel="other/tokens.json")
        r = run_cli(*base_args(root, css_rel="other/tokens.css", tok_rel="other/tokens.json"))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_NOT_ALLOWLISTED"), r.stderr)
        r = run_cli(*base_args(root, css_rel="other/tokens.css", tok_rel="other/tokens.json"),
                    "--allow", "other/tokens.css", "--allow", "other/tokens.json")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_missing_input_fails_closed(self):
        root, _, _ = make_case(tmp())
        os.remove(os.path.join(root, CSS_REL))
        r = run_cli(*base_args(root))
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_INPUT_ABSENT"), r.stderr)

    def test_symlink_refused(self):
        root, css, _ = make_case(tmp())
        link = os.path.join(root, "link.css")
        os.remove(css)
        os.symlink(os.path.join(root, TOK_REL), link)
        r = run_cli("--root", root, "--css", link, "--tokens", os.path.join(root, TOK_REL),
                    "--allow", "link.css", "--allow", TOK_REL)
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_SYMLINK"), r.stderr)

    def test_bad_set_id_fails(self):
        d = tmp()
        root, _, _ = make_case(d, css_rel="x/9bad.css", tok_rel="x/t.json")
        r = run_cli(*base_args(root, css_rel="x/9bad.css", tok_rel="x/t.json"),
                    "--allow", "x/9bad.css", "--allow", "x/t.json")
        self.assertEqual(r.returncode, 4)
        self.assertTrue(r.stderr.startswith("E_CSS_BAD_SET_ID"), r.stderr)

    def test_usage_error(self):
        r = run_cli("--root", tmp())
        self.assertEqual(r.returncode, 2)
        root, _, _ = make_case(tmp())
        r = run_cli(*base_args(root), "--check")
        self.assertEqual(r.returncode, 2)


if __name__ == "__main__":
    unittest.main()
