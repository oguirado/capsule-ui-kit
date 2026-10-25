#!/usr/bin/env python3
"""W0-CSS token-set extractor for the UI router kit.

Reads an allowlisted committed CSS token set plus its source authority
(tokens.json), reconciles every exported custom-property name and override
mode against the independent token inventory, and emits a deterministic
``css.tokens.v1`` record: token-set identity, tokens, permitted modes,
region anchors, {path,symbol,name,line} symbols and a proposed <=16-anchor
node sharding for W0-NODES. Offline, deterministic, Python 3 stdlib only.
Exit 0 ok, 4 refuse, 2 usage, 5 check mismatch.
"""
import argparse
import bisect
import hashlib
import json
import os
import re
import sys

SCHEMA = "css.tokens.v1"
TOKENS_SCHEMA = "capsule-ui-kit.design-tokens/v1"
VERSION = "extract_css.py/1.0"
CORPUS = "ui"
GROUP_CAP = 16
ANCHOR_CAP = 64

# Committed token locations. Explicit --allow entries replace this default.
DEFAULT_ALLOW = (
    "packages/capsule-ui-kit/src/design/tokens.json",
    "app/shell/src/design/tokens.css",
)

VENDOR_PREFIXES = ("--dv-", "--p-", "--px-", "--vscode-")
VENDOR_SUBSTRINGS = VENDOR_PREFIXES + ("dt(", "colorScheme.highContrast")

TIERS = ("primitive", "semantic", "component")
TIER_RANK = {"primitive": 0, "semantic": 1, "component": 2}
OVERRIDE_KEYS = ("modes", "density", "scale", "forcedColors", "reducedMotion")
LEAF_KEYS = frozenset({"$type", "$value"} | set(OVERRIDE_KEYS))

NAME_RE = re.compile(r"--[A-Za-z0-9-]+")
DECL_RE = re.compile(r"(--[A-Za-z0-9-]+)\s*:\s*([\s\S]+)$")
REF_RE = re.compile(r"\{([^{}]+)\}")
VAR_RE = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)")
SEG_RE = re.compile(r"[A-Za-z0-9_]+$")
ATTR_ONE = re.compile(r'\[data-theme-([a-z-]+)="([A-Za-z0-9_.]+)"\]')
ID_RE = re.compile(r"[A-Za-z][A-Za-z0-9._:-]{0,31}$")
STEM_RE = re.compile(r"[A-Za-z][A-Za-z0-9._-]*$")
PREFIX_RE = re.compile(r"--[a-z0-9-]+$")


class CssError(Exception):
    def __init__(self, code, detail=""):
        super().__init__("%s %s" % (code, detail) if detail else code)
        self.code = code


def sha(b):
    return hashlib.sha256(b).hexdigest()


def readb(p):
    with open(p, "rb") as f:
        return f.read()


def dumps(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canon(o):
    return (dumps(o) + "\n").encode("utf-8")


def kebab(seg):
    return re.sub(r"(?<!^)(?=[A-Z])", "-", seg).lower().replace("_", "-")


def css_name(prefix, path):
    return prefix + "-" + "-".join(kebab(s) for s in path.split("."))


def valid_value(v):
    return isinstance(v, (str, int, float)) and not isinstance(v, bool)


def norm_ws(s):
    return " ".join(s.split())


# ---- inputs: allowlist, no scan, no symlink escape ----

def resolve_input(p, root, allow):
    base = os.path.abspath(root)
    ap = os.path.abspath(p)
    parts = os.path.relpath(ap, base).split(os.sep)
    cur = base
    for part in parts:
        if part in ("..", "."):
            raise CssError("E_CSS_NOT_ALLOWLISTED", "escaping: %s" % p)
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            raise CssError("E_CSS_SYMLINK", cur)
    if not os.path.isfile(cur):
        raise CssError("E_CSS_INPUT_ABSENT", p)
    rel = "/".join(parts)
    if rel not in allow:
        raise CssError("E_CSS_NOT_ALLOWLISTED", rel)
    return rel, readb(cur)


# ---- tokens.json: independent inventory ----

def load_axes(ad):
    if not isinstance(ad, dict):
        raise CssError("E_TOKENS_AXES", "axes not an object")

    def need_dict(k):
        d = ad.get(k)
        if not isinstance(d, dict):
            raise CssError("E_TOKENS_AXES", k)
        return d

    def need_vals(d, k):
        v = d.get("values")
        if not isinstance(v, list) or not v or any(
                not isinstance(x, str) or not x for x in v):
            raise CssError("E_TOKENS_AXES", k)
        return v

    def need_attr(d, k):
        v = d.get("rootAttribute")
        if not isinstance(v, str) or not v:
            raise CssError("E_TOKENS_AXES", k)
        return v

    scheme, contrast = need_dict("scheme"), need_dict("contrast")
    density, scale = need_dict("density"), need_dict("textScale")
    forced, motion = need_dict("forcedColors"), need_dict("reducedMotion")
    modes = scheme.get("resolvedModes")
    if not isinstance(modes, list) or not modes or any(
            not isinstance(x, str) or not x for x in modes):
        raise CssError("E_TOKENS_AXES", "scheme.resolvedModes")
    for k, d, want_default in (("forcedColors", forced, True),
                               ("reducedMotion", motion, True)):
        v = need_vals(d, k + ".values")
        df = d.get("default")
        if df not in v:
            raise CssError("E_TOKENS_AXES", k + ".default")
        mq = d.get("mediaQuery")
        if not isinstance(mq, str) or not mq:
            raise CssError("E_TOKENS_AXES", k + ".mediaQuery")
    axes = {
        "modes": ["%s.%s" % (s, c) for s in modes
                  for c in need_vals(contrast, "contrast.values")],
        "density": need_vals(density, "density.values"),
        "scale": need_vals(scale, "textScale.values"),
        "forcedColors": [v for v in need_vals(forced, "forcedColors.values")
                         if v != forced["default"]],
        "reducedMotion": [v for v in need_vals(motion, "reducedMotion.values")
                          if v != motion["default"]],
        "attrs": {"scheme": need_attr(scheme, "scheme"),
                  "contrast": need_attr(contrast, "contrast"),
                  "density": need_attr(density, "density"),
                  "textScale": need_attr(scale, "textScale")},
        "media": {"forced": norm_ws(forced["mediaQuery"]),
                  "motion": norm_ws(motion["mediaQuery"])},
    }
    if len(set(axes["attrs"].values())) != 4:
        raise CssError("E_TOKENS_AXES", "duplicate rootAttribute")
    return axes


def load_tokens(raw):
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise CssError("E_TOKENS_DECODE", str(e))
    for s in VENDOR_SUBSTRINGS:
        if s in text:
            raise CssError("E_TOKENS_VENDOR_LEAK", s)
    try:
        d = json.loads(text)
    except ValueError as e:
        raise CssError("E_TOKENS_JSON", str(e))
    if not isinstance(d, dict):
        raise CssError("E_TOKENS_SCHEMA", "root not an object")
    want = {"schema", "authority", "axes", "primitive", "semantic", "component"}
    unknown = sorted(set(d) - want - {"viewports"})
    if unknown:
        raise CssError("E_TOKENS_SCHEMA", "unknown key: %s" % unknown[0])
    if any(k not in d for k in want):
        raise CssError("E_TOKENS_SCHEMA", "missing required key")
    if d["schema"] != TOKENS_SCHEMA:
        raise CssError("E_TOKENS_SCHEMA", d["schema"])
    auth = d["authority"]
    prefix = auth.get("cssVariablePrefix") if isinstance(auth, dict) else None
    if not isinstance(prefix, str) or not PREFIX_RE.match(prefix):
        raise CssError("E_TOKENS_SCHEMA", "cssVariablePrefix")
    axes = load_axes(d["axes"])
    leaves = {}
    for tier in TIERS:
        if not isinstance(d[tier], dict):
            raise CssError("E_TOKENS_SCHEMA", tier)
        _walk(d[tier], tier, tier, leaves, axes)
    if not leaves:
        raise CssError("E_TOKENS_EMPTY", "no $type leaves")
    names = {}
    for path in leaves:
        n = css_name(prefix, path)
        if n in names:
            raise CssError("E_TOKENS_COLLISION", n)
        names[n] = path
    refs = _check_refs(leaves)
    return {"prefix": prefix, "axes": axes, "leaves": leaves,
            "names": names, "refs": refs}


def _walk(o, path, tier, leaves, axes):
    if "$type" in o:
        extra = sorted(set(o) - LEAF_KEYS)
        if extra:
            raise CssError("E_TOKENS_LEAF", "%s: %s" % (path, extra[0]))
        if not isinstance(o["$type"], str) or not o["$type"]:
            raise CssError("E_TOKENS_LEAF", "%s: $type" % path)
        overrides = []
        for kind in OVERRIDE_KEYS:
            if kind not in o:
                continue
            m = o[kind]
            if not isinstance(m, dict) or not m:
                raise CssError("E_TOKENS_MODE_KEY", "%s: %s" % (path, kind))
            for k in m:
                if k not in axes[kind]:
                    raise CssError("E_TOKENS_MODE_KEY",
                                   "%s: %s.%s" % (path, kind, k))
                if not valid_value(m[k]):
                    raise CssError("E_TOKENS_VALUE",
                                   "%s: %s.%s" % (path, kind, k))
                overrides.append((kind, k))
        if "$value" in o and not valid_value(o["$value"]):
            raise CssError("E_TOKENS_VALUE", "%s: $value" % path)
        leaves[path] = {"type": o["$type"], "base": "$value" in o,
                        "overrides": sorted(overrides),
                        "value": o.get("$value"),
                        "ovals": [o[k][kk] for k, kk in sorted(overrides)]}
        return
    for k, v in o.items():
        if not SEG_RE.match(k):
            raise CssError("E_TOKENS_SCHEMA", "%s: %s" % (path, k))
        if not isinstance(v, dict):
            raise CssError("E_TOKENS_SCHEMA", "%s.%s" % (path, k))
        _walk(v, "%s.%s" % (path, k), tier, leaves, axes)


def _check_refs(leaves):
    adj = {}
    pairs = []
    for path in sorted(leaves):
        lf = leaves[path]
        vals = ([lf["value"]] if lf["base"] else []) + lf["ovals"]
        found = []
        for v in vals:
            if isinstance(v, str):
                found.extend(REF_RE.findall(v))
        adj[path] = sorted(set(r for r in found if r in leaves))
        for r in found:
            pairs.append((path, r))
    pairs.sort(key=lambda pr: (pr[1], pr[0]))
    for src, ref in pairs:
        if ref not in leaves:
            raise CssError("E_TOKENS_DANGLING_REF", "%s -> %s" % (src, ref))
    for src, ref in pairs:
        if TIER_RANK[ref.split(".")[0]] > TIER_RANK[src.split(".")[0]]:
            raise CssError("E_TOKENS_TIER_INVERSION", "%s -> %s" % (src, ref))
    cyc = _find_cycle(adj)
    if cyc:
        raise CssError("E_TOKENS_CYCLIC_REF", " -> ".join(cyc))
    return adj


def _find_cycle(adj):
    color = dict.fromkeys(adj, 0)
    stack = []

    def visit(u):
        color[u] = 1
        stack.append(u)
        for v in adj[u]:
            if color[v] == 1:
                return stack[stack.index(v):] + [v]
            if color[v] == 0:
                hit = visit(v)
                if hit:
                    return hit
        stack.pop()
        color[u] = 2
        return None

    for p in sorted(adj):
        if color[p] == 0:
            hit = visit(p)
            if hit:
                return hit
    return None


# ---- tokens.css: admitted grammar only ----

def strip_comments(text, rel):
    code = list(text)
    bodies = []
    i, n = 0, len(text)
    while i < n:
        if text[i] == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2)
            if j < 0:
                ln = text.count("\n", 0, i) + 1
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s: unterminated comment at line %d" % (rel, ln))
            bodies.append(text[i + 2:j])
            for k in range(i, j + 2):
                if code[k] != "\n":
                    code[k] = " "
            i = j + 2
        else:
            i += 1
    return "".join(code), "\n".join(bodies)


def parse_css(raw, rel, toks):
    if b"\r" in raw:
        raise CssError("E_CSS_UNSUPPORTED", "%s: CR byte" % rel)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise CssError("E_CSS_DECODE", str(e))
    code, comments = strip_comments(text, rel)
    offsets = [0] + [m.end() for m in re.finditer("\n", code)]

    def line_at(off):
        return bisect.bisect_right(offsets, off, 0, len(offsets) - 1)

    decls = []    # (name, region, line, value)
    regions = {}  # region id -> (selector, line)

    def add_region(rid, sel, ln):
        if rid in regions:
            raise CssError("E_CSS_DUPLICATE_REGION", rid)
        regions[rid] = (sel, ln)

    def add_decls(body, body_off, region):
        pos = 0
        for chunk in body.split(";"):
            stripped = chunk.strip()
            start = body_off + pos + chunk.find(stripped) if stripped else 0
            pos += len(chunk) + 1
            if not stripped:
                continue
            m = DECL_RE.match(stripped)
            if not m or not m.group(2).strip():
                raise CssError("E_CSS_UNEXPECTED_DECLARATION",
                               "%s line %d" % (rel, line_at(start)))
            name, value = m.group(1), m.group(2).strip()
            ln = line_at(start + chunk.find(name, chunk.find(stripped)))
            for vp in VENDOR_PREFIXES:
                if name.startswith(vp) or vp in value:
                    raise CssError("E_CSS_VENDOR_AUTHORITY",
                                   "%s line %d: %s" % (rel, ln, name))
            if "dt(" in value:
                raise CssError("E_CSS_VENDOR_AUTHORITY",
                               "%s line %d: %s" % (rel, ln, name))
            if "!important" in value:
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: !important" % (rel, ln))
            if value.count("var(") != len(VAR_RE.findall(value)):
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: var()" % (rel, ln))
            for ref in VAR_RE.findall(value):
                if ref not in toks["names"]:
                    raise CssError("E_CSS_DANGLING_REF",
                                   "%s line %d: %s" % (rel, ln, ref))
            decls.append((name, region, ln, value))

    def rules(body, base_off, in_media):
        i, n = 0, len(body)
        while True:
            while i < n and body[i] in " \t\n\f\v":
                i += 1
            if i >= n:
                return
            if body[i] in "};":
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: stray %r" % (rel, line_at(base_off + i), body[i]))
            j = i
            while j < n and body[j] not in "{;}":
                j += 1
            if j >= n or body[j] != "{":
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: text without block" % (rel, line_at(base_off + i)))
            sel = body[i:j].strip()
            if "\n" in sel or not sel:
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: selector" % (rel, line_at(base_off + i)))
            depth, k = 1, j + 1
            while k < n and depth:
                if body[k] == "{":
                    depth += 1
                elif body[k] == "}":
                    depth -= 1
                k += 1
            if depth:
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: unclosed block" % (rel, line_at(base_off + i)))
            inner, inner_off = body[j + 1:k - 1], base_off + j + 1
            if sel.startswith("@media"):
                if in_media:
                    raise CssError("E_CSS_UNSUPPORTED",
                                   "%s line %d: nested @media" % (rel, line_at(base_off + i)))
                query = norm_ws(sel[len("@media"):])
                media = toks["axes"]["media"]
                if query == media["forced"]:
                    rid, rkey = "region:forced-colors", "forced:active"
                elif query == media["motion"]:
                    rid, rkey = "region:reduced-motion", "motion:reduce"
                else:
                    raise CssError("E_CSS_UNADMITTED_MODE",
                                   "%s line %d: %s" % (rel, line_at(base_off + i), sel))
                add_region(rid, sel, line_at(base_off + i))
                rules(inner, inner_off, rkey)
            elif sel.startswith("@"):
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: %s" % (rel, line_at(base_off + i), sel))
            elif in_media:
                if norm_ws(sel) != ":root":
                    raise CssError("E_CSS_UNSUPPORTED",
                                   "%s line %d: %s" % (rel, line_at(base_off + i), sel))
                if "{" in inner or "}" in inner:
                    raise CssError("E_CSS_UNSUPPORTED",
                                   "%s line %d: nested rule" % (rel, line_at(base_off + i)))
                add_decls(inner, inner_off, in_media)
            elif norm_ws(sel) == ":root":
                if "{" in inner or "}" in inner:
                    raise CssError("E_CSS_UNSUPPORTED",
                                   "%s line %d: nested rule" % (rel, line_at(base_off + i)))
                add_region("region:base", sel, line_at(base_off + i))
                add_decls(inner, inner_off, "base")
            elif sel.startswith("["):
                rkey, rid = _classify_selector(sel, rel, line_at(base_off + i), toks)
                if "{" in inner or "}" in inner:
                    raise CssError("E_CSS_UNSUPPORTED",
                                   "%s line %d: nested rule" % (rel, line_at(base_off + i)))
                add_region(rid, sel, line_at(base_off + i))
                add_decls(inner, inner_off, rkey)
            else:
                raise CssError("E_CSS_UNSUPPORTED",
                               "%s line %d: %s" % (rel, line_at(base_off + i), sel))
            i = k

    rules(code, 0, None)
    seen = {}
    for name, region, ln, _ in sorted(decls):
        if (name, region) in seen:
            raise CssError("E_CSS_DUPLICATE_TOKEN",
                           "%s %s first line %d" % (name, region, seen[(name, region)]))
        seen[(name, region)] = ln
    return decls, regions, set(NAME_RE.findall(comments))


def _classify_selector(sel, rel, ln, toks):
    axes = toks["axes"]
    if not re.fullmatch(r"(\[[^\[\]]+\])+", sel):
        raise CssError("E_CSS_UNSUPPORTED", "%s line %d: %s" % (rel, ln, sel))
    by_attr = dict((v, k) for k, v in axes["attrs"].items())
    pairs = []
    for chunk in re.findall(r"\[[^\[\]]+\]", sel):
        m = ATTR_ONE.fullmatch(chunk)
        if not m:
            raise CssError("E_CSS_UNSUPPORTED", "%s line %d: %s" % (rel, ln, sel))
        attr, val = "data-theme-" + m.group(1), m.group(2)
        axis = by_attr.get(attr)
        if axis in ("scheme", "contrast"):
            vals = None  # validated as a pair below, never bare
        elif axis == "density":
            vals = axes["density"]
        elif axis == "textScale":
            vals = axes["scale"]
        else:
            raise CssError("E_CSS_UNADMITTED_MODE",
                           "%s line %d: %s" % (rel, ln, sel))
        if vals is not None and val not in vals:
            raise CssError("E_CSS_UNADMITTED_MODE",
                           "%s line %d: %s" % (rel, ln, sel))
        pairs.append((axis, val))
    kinds = sorted(a for a, _ in pairs)
    if kinds == ["contrast", "scheme"]:
        got = dict(pairs)
        key = "%s.%s" % (got["scheme"], got["contrast"])
        if key not in axes["modes"]:
            raise CssError("E_CSS_UNADMITTED_MODE", "%s line %d: %s" % (rel, ln, sel))
        return "mode:" + key, "region:" + key
    if kinds == ["density"]:
        return "density:" + pairs[0][1], "region:density." + pairs[0][1]
    if kinds == ["textScale"]:
        return "scale:" + pairs[0][1], "region:scale." + pairs[0][1]
    raise CssError("E_CSS_UNADMITTED_MODE", "%s line %d: %s" % (rel, ln, sel))


# ---- reconcile + record ----

def region_of(kind, key):
    if kind == "modes":
        return "mode:" + key
    if kind == "density":
        return "density:" + key
    if kind == "scale":
        return "scale:" + key
    if kind == "forcedColors":
        return "forced:" + key
    return "motion:" + key


def mode_region_id(kind, key):
    if kind == "modes":
        return "region:" + key
    if kind == "density":
        return "region:density." + key
    if kind == "scale":
        return "region:scale." + key
    if kind == "forcedColors":
        return "region:forced-colors"
    return "region:reduced-motion"


def mode_key(kind, key):
    if kind == "modes":
        return key
    return "%s.%s" % (kind, key)


def extract(css_raw, css_rel, tok_raw, tok_rel):
    toks = load_tokens(tok_raw)
    leaves, names = toks["leaves"], toks["names"]
    decls, regions, comment_names = parse_css(css_raw, css_rel, toks)
    required = {}
    for path in sorted(leaves):
        name = css_name(toks["prefix"], path)
        if leaves[path]["base"]:
            required[(name, "base")] = path
        for kind, key in leaves[path]["overrides"]:
            required[(name, region_of(kind, key))] = path
    found = {}
    for name, region, ln, _ in decls:
        found[(name, region)] = ln
    for name, region in sorted(found):
        if name not in names:
            raise CssError("E_CSS_UNKNOWN_TOKEN", "%s in %s" % (name, region))
    for name, region in sorted(found):
        if (name, region) not in required:
            raise CssError("E_CSS_UNADMITTED_MODE",
                           "%s in %s" % (name, region))
    for name, region in sorted(required):
        if (name, region) not in found:
            detail = "%s in %s" % (name, region)
            if name in comment_names:
                detail += " (comment-only)"
            raise CssError("E_CSS_MISSING_TOKEN", detail)
    if not css_rel.endswith(".css"):
        raise CssError("E_CSS_BAD_SET_ID", css_rel)
    stem = os.path.basename(css_rel)[:-len(".css")]
    if not STEM_RE.match(stem):
        raise CssError("E_CSS_BAD_SET_ID", css_rel)
    node_id = "css:" + stem
    if not ID_RE.match(node_id) or len(CORPUS) + 1 + len(node_id) > 32:
        raise CssError("E_CSS_BAD_SET_ID", node_id)
    by_token = {}
    for name, region, ln, _ in decls:
        by_token.setdefault(name, []).append((region, ln))
    tokens = []
    for name in sorted(names):
        path = names[name]
        defs = [{"region": r, "line": ln}
                for r, ln in sorted(by_token[name])]
        base = [ln for r, ln in by_token[name] if r == "base"]
        anchor_line = base[0] if base else min(ln for _, ln in by_token[name])
        tokens.append({"name": name, "token": path,
                       "type": leaves[path]["type"], "line": anchor_line,
                       "defs": defs})
    block_by_region = {}
    for rid, (sel, ln) in regions.items():
        block_by_region[rid] = (sel, ln)
    modes = []
    seen_modes = set()
    for path in sorted(leaves):
        for kind, key in leaves[path]["overrides"]:
            mk = mode_key(kind, key)
            if mk in seen_modes:
                continue
            seen_modes.add(mk)
            rid = mode_region_id(kind, key)
            sel, ln = block_by_region[rid]
            modes.append({"key": mk, "kind": kind, "region": rid,
                          "selector": sel, "line": ln})
    modes.sort(key=lambda m: m["key"])
    region_rows = [{"id": rid, "selector": sel, "line": ln}
                   for rid, (sel, ln) in sorted(regions.items())]
    anchor_names = sorted([t["name"] for t in tokens] + list(regions))
    for a in anchor_names:
        if len(a.encode("utf-8")) > ANCHOR_CAP:
            raise CssError("E_CSS_ANCHOR_WIDTH", a)
    symbols = ([{"path": css_rel, "symbol": t["name"], "name": t["name"],
                 "line": t["line"]} for t in tokens]
               + [{"path": css_rel, "symbol": rid, "name": sel, "line": ln}
                  for rid, (sel, ln) in sorted(regions.items())])
    symbols.sort(key=lambda s: s["symbol"])
    groups = []
    for n in range(0, len(anchor_names), GROUP_CAP):
        chunk = anchor_names[n:n + GROUP_CAP]
        gid = node_id if len(anchor_names) <= GROUP_CAP else "%s.p%d" % (
            node_id, n // GROUP_CAP)
        if not ID_RE.match(gid) or len(CORPUS) + 1 + len(gid) > 32:
            raise CssError("E_CSS_BAD_SET_ID", gid)
        groups.append({"node": gid, "family": node_id, "anchors": chunk})
    return {
        "schema": SCHEMA,
        "tool": VERSION,
        "token_set": stem,
        "node_id": node_id,
        "family": node_id,
        "prefix": toks["prefix"],
        "css": {"path": css_rel, "sha256": sha(css_raw),
                "bytes": len(css_raw)},
        "tokens_source": {"path": tok_rel, "sha256": sha(tok_raw),
                          "bytes": len(tok_raw), "schema": TOKENS_SCHEMA},
        "tokens": tokens,
        "modes": modes,
        "regions": region_rows,
        "anchors": [{"a": a, "role": "symbol"} for a in anchor_names],
        "symbols": symbols,
        "proposed_groups": groups,
    }


# ---- CLI ----

def repo_root():
    return os.path.dirname(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))))


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract_css.py")
    ap.add_argument("--css", required=True)
    ap.add_argument("--tokens", required=True)
    ap.add_argument("--root", default=repo_root())
    ap.add_argument("--allow", action="append", default=None)
    ap.add_argument("--out", default=None)
    ap.add_argument("--symbols", default=None)
    ap.add_argument("--check", action="store_true")
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if a.check and not a.out:
        print("E_USAGE --check requires --out", file=sys.stderr)
        return 2
    try:
        allow = tuple(a.allow) if a.allow else DEFAULT_ALLOW
        css_rel, css_raw = resolve_input(a.css, a.root, allow)
        tok_rel, tok_raw = resolve_input(a.tokens, a.root, allow)
        rec = extract(css_raw, css_rel, tok_raw, tok_rel)
        blob = canon(rec)
        if a.check:
            try:
                old = readb(a.out)
            except OSError:
                raise CssError("E_CSS_INPUT_ABSENT", a.out)
            same = old == blob
            print("identical" if same else "MISMATCH")
            return 0 if same else 5
        if a.out:
            with open(a.out, "wb") as f:
                f.write(blob)
        if a.symbols:
            with open(a.symbols, "wb") as f:
                for s in rec["symbols"]:
                    f.write((dumps(s) + "\n").encode("utf-8"))
        sys.stdout.write(blob.decode("utf-8"))
        return 0
    except CssError as e:
        print(e, file=sys.stderr)
        return 4


if __name__ == "__main__":
    sys.exit(main())
