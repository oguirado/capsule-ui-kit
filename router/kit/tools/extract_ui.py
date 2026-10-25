#!/usr/bin/env python3
"""W0-NODES UI node composer for the router kit.

Composes per-language inventory records (vue/js/css/rust) plus kit Markdown
blocks into validated ctx.node.v2 JSONL, a sorted generic lookup
(id<TAB>path), a sorted {path,symbol,name,line} symbol inventory, and a
separate closed provenance/ownership receipt. Enforces full scope coverage
(every allowlisted file maps to at least one node) and refuses removed
public anchors against a committed history, even after an honest rehash.

Explicit allowlisted paths only, never a repo scan; bytes hashed before
decoding; no symlink escape. Offline, deterministic, Python 3 stdlib only.
Exit 0 pass, 4 refuse, 2 usage.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blocks as BL  # noqa: E402
import jsonschema_lite as JS  # noqa: E402

SCHEMA_RECEIPT = "ctx.ui-extract.v1"
SCHEMA_PROV = "ctx.ui-provenance.v1"
VERSION = "extract_ui.py/1.0"
CORPUS_DEFAULT = "ui"
ANCHOR_CAP = 16
ANCHOR_BYTES = 64
ID_SPAN = 32  # len(corpus) + 1 + len(id) <= 32, never clipped
TRIG_CAP = 12
KW_CAP = 24
TASK_CAP = 8
Q_CAP = 12
EXCL_CAP = 12
PN_CAP = 5
STR_CAP = 64
LONG_CAP = 200
TITLE_CAP = 240
PURPOSE_CAP = 600

# Allowlisted UI roots (operator ruling U-DEC-0060). Trailing-slash entries
# are directory prefixes; "books/ui-" is a file prefix (no nested "/").
DEFAULT_SCOPE_ROOTS = (
    "packages/capsule-ui-kit/",
    "app/shell/src/renderer-v2/",
    "app/shell/src/design/",
    "books/ui-",
)

VUE_SCHEMA = "ctx.vue-inventory.v1"
JS_SCHEMA = "holdings.w0.js-file/v1"
CSS_SCHEMA = "css.tokens.v1"
RUST_SCHEMA = "ctx.rust-extract.v1"

OUT_NODES = "ui.nodes.jsonl"
OUT_LOOKUP = "routes.tsv"
OUT_SYMBOLS = "symbols.jsonl"
OUT_PROV = "provenance.json"
OUT_NAMES = (OUT_NODES, OUT_LOOKUP, OUT_SYMBOLS, OUT_PROV)

CODES = ("E_BLOCK_JSON", "E_CHECK", "E_COVERAGE", "E_DECODE", "E_DUPLICATE",
         "E_DUPLICATE_ID", "E_GROUPS", "E_HISTORY", "E_ID", "E_LINE_DRIFT",
         "E_NO_ANCHORS", "E_PATH", "E_RECORD", "E_REMOVED_ANCHOR", "E_SCHEMA",
         "E_SCOPE", "E_STALE", "E_WIDTH")


class UiError(Exception):
    def __init__(self, code, detail=""):
        super().__init__("%s %s" % (code, detail) if detail else code)
        self.code = code


def sha(b):
    return hashlib.sha256(b).hexdigest()


def readb(p):
    with open(p, "rb") as f:
        return f.read()


def dumps(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def canon(o):
    return (dumps(o) + "\n").encode("utf-8")


_SCHEMA_CACHE = {}


def node_schema():
    if "s" not in _SCHEMA_CACHE:
        p = os.path.join(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__))), "standards", "schemas",
            "ctx.node.v2.schema.json")
        try:
            _SCHEMA_CACHE["s"] = json.loads(readb(p).decode("utf-8"))
        except (OSError, ValueError):
            raise UiError("E_PATH", "node schema unreadable")
    return _SCHEMA_CACHE["s"]


def is_hex(s):
    return isinstance(s, str) and re.fullmatch(r"[0-9a-f]{64}", s) is not None


def is_id(s):
    return isinstance(s, str) and \
        re.fullmatch(r"[A-Za-z][A-Za-z0-9._:-]{0,31}", s) is not None


def is_corpus(s):
    return isinstance(s, str) and \
        re.fullmatch(r"[a-z][a-z0-9_]{0,15}", s) is not None


def is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def check_id(nid, corpus):
    if not is_id(nid):
        raise UiError("E_ID", nid)
    if len(corpus) + 1 + len(nid) > ID_SPAN:
        raise UiError("E_WIDTH", nid)


def bad_rel(rel):
    """Reason a relative path is not canonical, else None."""
    if not isinstance(rel, str) or not rel:
        return "empty"
    if "\\" in rel or rel.startswith("/"):
        return "not relative"
    if "\t" in rel or "\n" in rel or "\r" in rel or "\0" in rel:
        return "control character"
    if any(s in ("", ".", "..") for s in rel.split("/")):
        return "dot segment"
    return None


def resolve(root, rel):
    """Absolute path of rel under root, refusing symlink escape."""
    why = bad_rel(rel)
    if why:
        raise UiError("E_PATH", "%s: %s" % (rel, why))
    base = os.path.abspath(root)
    cur = base
    for part in rel.split("/"):
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            raise UiError("E_PATH", "%s: symlink refused" % rel)
    if os.path.realpath(cur) != base and \
            not os.path.realpath(cur).startswith(base + os.sep):
        raise UiError("E_PATH", "%s: escapes root" % rel)
    if not os.path.isfile(cur):
        raise UiError("E_PATH", "%s: missing file" % rel)
    return cur


def read_text(root, rel):
    raw = readb(resolve(root, rel))
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise UiError("E_DECODE", "%s: not UTF-8" % rel)
    if "\0" in text:
        raise UiError("E_DECODE", "%s: NUL byte" % rel)
    return raw, text


def under_roots(rel, roots):
    for r in roots:
        if r.endswith("/"):
            if rel.startswith(r) and len(rel) > len(r):
                return True
        elif rel.startswith(r) and len(rel) > len(r) and \
                "/" not in rel[len(r):]:
            return True
    return False


def load_scope(scope_path, roots):
    try:
        raw = readb(scope_path)
    except OSError:
        raise UiError("E_PATH", "allowlist unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise UiError("E_DECODE", "allowlist not UTF-8")
    rels = []
    for entry in text.splitlines():
        if bad_rel(entry) is not None or entry != entry.strip():
            raise UiError("E_SCOPE", "entry %r" % entry)
        if entry in rels:
            raise UiError("E_SCOPE", "duplicate %s" % entry)
        rels.append(entry)
    if not rels:
        raise UiError("E_SCOPE", "empty scope")
    outside = sorted(r for r in rels if not under_roots(r, roots))
    if outside:
        raise UiError("E_SCOPE", "outside scope roots: %s" % ", ".join(outside))
    return sorted(rels)


def load_inputs(record_paths):
    if len(set(record_paths)) != len(record_paths):
        raise UiError("E_DUPLICATE", "duplicate --record input")
    objs = []
    for rp in sorted(record_paths):
        try:
            raw = readb(rp)
        except OSError:
            raise UiError("E_PATH", "record unreadable: %s" % rp)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            raise UiError("E_DECODE", "record not UTF-8: %s" % rp)
        if not text.strip():
            raise UiError("E_RECORD", "%s: empty" % rp)
        try:
            top = json.loads(text)
        except ValueError:
            top = None
        if isinstance(top, dict):
            objs.append(top)
            continue
        if isinstance(top, list):
            for i, o in enumerate(top):
                if not isinstance(o, dict):
                    raise UiError("E_RECORD", "%s[%d]: not an object" % (rp, i))
                objs.append(o)
            continue
        for n, line in enumerate(text.splitlines(), 1):
            if line == "":
                raise UiError("E_RECORD", "%s:%d: blank line" % (rp, n))
            try:
                o = json.loads(line)
            except ValueError:
                raise UiError("E_RECORD", "%s:%d: bad JSON" % (rp, n))
            if not isinstance(o, dict):
                raise UiError("E_RECORD", "%s:%d: not an object" % (rp, n))
            objs.append(o)
    for o in objs:
        if not isinstance(o.get("schema"), str):
            raise UiError("E_RECORD", "missing schema")
    return objs


def need(rec, keys, what):
    for k in keys:
        if k not in rec:
            raise UiError("E_RECORD", "%s: missing %s" % (what, k))


def check_symbol_row(s, what):
    if not isinstance(s, dict):
        raise UiError("E_RECORD", "%s: symbol not an object" % what)
    for k in ("path", "symbol", "name", "line"):
        if k not in s:
            raise UiError("E_RECORD", "%s: symbol missing %s" % (what, k))
    if bad_rel(s["path"]) is not None:
        raise UiError("E_PATH", "%s: bad symbol path" % what)
    if not isinstance(s["symbol"], str) or not s["symbol"]:
        raise UiError("E_RECORD", "%s: bad symbol name" % what)
    if not isinstance(s["name"], str) or not s["name"]:
        raise UiError("E_RECORD", "%s: bad symbol local" % what)
    if not is_int(s["line"]) or s["line"] < 1:
        raise UiError("E_RECORD", "%s: bad symbol line" % what)


def stem_of(path, suffix):
    base = path.rsplit("/", 1)[-1]
    if not base.endswith(suffix) or len(base) == len(suffix):
        return None
    return base[:-len(suffix)]


def purpose_of(label, path, n):
    p = "Routable %s for %s with %d public anchors." % (label, path, n)
    if len(p) > PURPOSE_CAP:
        raise UiError("E_WIDTH", path)
    return p


def kw_check(words, what):
    out = []
    for w in words:
        if not isinstance(w, str) or not w:
            raise UiError("E_RECORD", "%s: bad keyword" % what)
        if len(w) > STR_CAP:
            raise UiError("E_WIDTH", "%s: keyword too long" % what)
        if w not in out:
            out.append(w)
    return out


def adapt_vue(rec, corpus):
    what = "vue record"
    need(rec, ["path", "source_sha256", "symbols"], what)
    path = rec["path"]
    if bad_rel(path) is not None:
        raise UiError("E_PATH", "%s: bad path" % what)
    if not is_hex(rec["source_sha256"]):
        raise UiError("E_RECORD", "%s: bad sha256" % what)
    if not isinstance(rec["symbols"], list):
        raise UiError("E_RECORD", "%s: symbols not a list" % what)
    for s in rec["symbols"]:
        check_symbol_row(s, what)
        if s["path"] != path:
            raise UiError("E_RECORD", "%s: symbol outside file" % what)
    stem = stem_of(path, ".vue")
    if stem is None:
        raise UiError("E_RECORD", "%s: not a .vue path" % what)
    base = "vue:" + stem
    check_id(base, corpus)
    syms = sorted(rec["symbols"], key=lambda s: s["symbol"])
    if not syms:
        raise UiError("E_NO_ANCHORS", path)
    anchors = []
    for s in syms:
        if len(s["symbol"].encode("utf-8")) > ANCHOR_BYTES:
            raise UiError("E_WIDTH", "%s: %s" % (path, s["symbol"]))
        anchors.append({"a": s["symbol"], "role": "symbol"})
    names = sorted({s["symbol"] for s in syms})
    return [{"path": path, "sha": rec["source_sha256"], "kind": "vue",
             "label": "Vue component", "base": base, "family": base,
             "title": "%s Vue component" % stem,
             "purpose": purpose_of("Vue component", path, len(syms)),
             "nodekind": "symbol", "anchors": anchors, "symbols": syms,
             "groups": None, "triggers": names[:TRIG_CAP],
             "keywords": kw_check(sorted({stem, "component", "vue"}), what),
             "tasks": [], "questions": [], "excl": [], "pn": []}], []


def adapt_js(rec, corpus):
    what = "js record"
    need(rec, ["file", "file_sha256", "exports"], what)
    path = rec["file"]
    if bad_rel(path) is not None:
        raise UiError("E_PATH", "%s: bad path" % what)
    if not is_hex(rec["file_sha256"]):
        raise UiError("E_RECORD", "%s: bad sha256" % what)
    if not isinstance(rec["exports"], list):
        raise UiError("E_RECORD", "%s: exports not a list" % what)
    syms = []
    for e in rec["exports"]:
        if not isinstance(e, dict):
            raise UiError("E_RECORD", "%s: export not an object" % what)
        for k in ("name", "line"):
            if k not in e:
                raise UiError("E_RECORD", "%s: export missing %s" % (what, k))
        if not isinstance(e["name"], str) or not e["name"]:
            raise UiError("E_RECORD", "%s: bad export name" % what)
        if not is_int(e["line"]) or e["line"] < 1:
            raise UiError("E_RECORD", "%s: bad export line" % what)
        local = e.get("local")
        if local is not None and (not isinstance(local, str) or not local):
            raise UiError("E_RECORD", "%s: bad export local" % what)
        syms.append({"path": path, "symbol": e["name"],
                     "name": local or e["name"], "line": e["line"]})
    stem = stem_of(path, ".js")
    if stem is None:
        raise UiError("E_RECORD", "%s: not a .js path" % what)
    base = "js:" + stem
    check_id(base, corpus)
    syms.sort(key=lambda s: s["symbol"])
    if not syms:
        raise UiError("E_NO_ANCHORS", path)
    anchors = []
    for s in syms:
        if len(s["symbol"].encode("utf-8")) > ANCHOR_BYTES:
            raise UiError("E_WIDTH", "%s: %s" % (path, s["symbol"]))
        anchors.append({"a": s["symbol"], "role": "symbol"})
    names = sorted({s["symbol"] for s in syms})
    return [{"path": path, "sha": rec["file_sha256"], "kind": "js",
             "label": "JS module", "base": base, "family": base,
             "title": "%s JS module" % stem,
             "purpose": purpose_of("JS module", path, len(syms)),
             "nodekind": "symbol", "anchors": anchors, "symbols": syms,
             "groups": None, "triggers": names[:TRIG_CAP],
             "keywords": kw_check(sorted({stem, "js", "module"}), what),
             "tasks": [], "questions": [], "excl": [], "pn": []}], []


def adapt_css(rec, corpus):
    what = "css record"
    need(rec, ["node_id", "family", "css", "tokens_source", "tokens",
               "symbols"], what)
    base, family = rec["node_id"], rec["family"]
    check_id(base, corpus)
    check_id(family, corpus)
    for k in ("css", "tokens_source"):
        if not isinstance(rec[k], dict):
            raise UiError("E_RECORD", "%s: %s not an object" % (what, k))
        need(rec[k], ["path", "sha256"], "%s %s" % (what, k))
        if bad_rel(rec[k]["path"]) is not None:
            raise UiError("E_PATH", "%s: bad %s path" % (what, k))
        if not is_hex(rec[k]["sha256"]):
            raise UiError("E_RECORD", "%s: bad %s sha256" % (what, k))
    path = rec["css"]["path"]
    if not isinstance(rec["symbols"], list):
        raise UiError("E_RECORD", "%s: symbols not a list" % what)
    for s in rec["symbols"]:
        check_symbol_row(s, what)
        if s["path"] != path:
            raise UiError("E_RECORD", "%s: symbol outside file" % what)
    syms = sorted(rec["symbols"], key=lambda s: s["symbol"])
    if not syms:
        raise UiError("E_NO_ANCHORS", path)
    full = None
    if isinstance(rec.get("anchors"), list):
        full = []
        for a in rec["anchors"]:
            if not isinstance(a, dict) or not isinstance(a.get("a"), str) \
                    or not a["a"]:
                raise UiError("E_RECORD", "%s: bad anchor" % what)
            full.append(a["a"])
    groups = rec.get("proposed_groups")
    if groups is not None:
        if full is None:
            raise UiError("E_RECORD", "%s: groups without anchors" % what)
        if not isinstance(groups, list) or not groups:
            raise UiError("E_GROUPS", "empty sharding proposal")
        seen = []
        for g in groups:
            if not isinstance(g, dict):
                raise UiError("E_GROUPS", "group not an object")
            for k in ("node", "family", "anchors"):
                if k not in g:
                    raise UiError("E_GROUPS", "group missing %s" % k)
            check_id(g["node"], corpus)
            check_id(g["family"], corpus)
            if not isinstance(g["anchors"], list) or not g["anchors"]:
                raise UiError("E_GROUPS", "group without anchors")
            if len(g["anchors"]) > ANCHOR_CAP:
                raise UiError("E_GROUPS", "group over cap")
            for a in sorted(g["anchors"]):
                if not isinstance(a, str) or not a:
                    raise UiError("E_GROUPS", "bad group anchor")
                if len(a.encode("utf-8")) > ANCHOR_BYTES:
                    raise UiError("E_WIDTH", "%s: %s" % (path, a))
                seen.append(a)
        if sorted(seen) != sorted(full):
            raise UiError("E_GROUPS", "proposal does not cover anchors")
        if len(set(seen)) != len(seen):
            raise UiError("E_GROUPS", "proposal overlaps")
        groups = [{"node": g["node"], "family": g["family"],
                   "anchors": sorted(g["anchors"])} for g in groups]
    else:
        if full is None:
            raise UiError("E_RECORD", "%s: missing anchors" % what)
        for a in full:
            if len(a.encode("utf-8")) > ANCHOR_BYTES:
                raise UiError("E_WIDTH", "%s: %s" % (path, a))
    token_set = rec.get("token_set")
    if not isinstance(token_set, str) or not token_set:
        raise UiError("E_RECORD", "%s: bad token set" % what)
    anchors = [{"a": a, "role": "symbol"} for a in sorted(set(
        full if full is not None else [s["symbol"] for s in syms]))]
    if not anchors:
        raise UiError("E_NO_ANCHORS", path)
    names = sorted({a["a"] for a in anchors})
    aux = [{"path": rec["tokens_source"]["path"],
            "sha": rec["tokens_source"]["sha256"], "role": "tokens-source"}]
    return [{"path": path, "sha": rec["css"]["sha256"], "kind": "css",
             "label": "CSS token set", "base": base, "family": family,
             "title": "%s CSS token set" % token_set,
             "purpose": purpose_of("CSS token set", path, len(anchors)),
             "nodekind": "symbol", "anchors": anchors, "symbols": syms,
             "groups": groups, "triggers": names[:TRIG_CAP],
             "keywords": kw_check(sorted({token_set, "css", "tokens"}), what),
             "tasks": [], "questions": [], "excl": [], "pn": []}], aux


def adapt_rust(rec, corpus):
    what = "rust record"
    if "pass" in rec and rec["pass"] is not True:
        raise UiError("E_RECORD", "%s: failed receipt" % what)
    need(rec, ["crate", "files", "symbols"], what)
    crate = rec["crate"]
    if not isinstance(crate, str) or \
            re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", crate) is None:
        raise UiError("E_RECORD", "%s: bad crate" % what)
    if not isinstance(rec["files"], list) or not rec["files"]:
        raise UiError("E_RECORD", "%s: files not a nonempty list" % what)
    fmap = {}
    for f in rec["files"]:
        if not isinstance(f, dict):
            raise UiError("E_RECORD", "%s: file not an object" % what)
        need(f, ["path", "sha256"], what)
        if bad_rel(f["path"]) is not None:
            raise UiError("E_PATH", "%s: bad file path" % what)
        if not is_hex(f["sha256"]):
            raise UiError("E_RECORD", "%s: bad file sha256" % what)
        if f["path"] in fmap:
            raise UiError("E_DUPLICATE", f["path"])
        fmap[f["path"]] = f["sha256"]
    if not isinstance(rec["symbols"], list):
        raise UiError("E_RECORD", "%s: symbols not a list" % what)
    for s in rec["symbols"]:
        check_symbol_row(s, what)
        if s["path"] not in fmap:
            raise UiError("E_RECORD", "%s: symbol outside files" % what)
    evidences, aux, used = [], [], set()
    for path in sorted(fmap):
        if path.rsplit("/", 1)[-1] == "Cargo.toml":
            aux.append({"path": path, "sha": fmap[path],
                        "role": "cargo-manifest"})
            continue
        if not path.endswith(".rs"):
            raise UiError("E_RECORD", "%s: only *.rs or Cargo.toml" % what)
        syms = sorted((s for s in rec["symbols"] if s["path"] == path),
                      key=lambda s: s["symbol"])
        if not syms:
            raise UiError("E_NO_ANCHORS", path)
        stem = stem_of(path, ".rs")
        base = "rs:" + crate + "." + stem
        check_id(base, corpus)
        anchors = []
        for s in syms:
            if len(s["symbol"].encode("utf-8")) > ANCHOR_BYTES:
                raise UiError("E_WIDTH", "%s: %s" % (path, s["symbol"]))
            anchors.append({"a": s["symbol"], "role": "symbol"})
        names = sorted({s["symbol"] for s in syms})
        used.add(path)
        evidences.append(
            {"path": path, "sha": fmap[path], "kind": "rust",
             "label": "Rust module", "base": base, "family": base,
             "title": "%s Rust module (%s)" % (stem, crate),
             "purpose": purpose_of("Rust module", path, len(syms)),
             "nodekind": "symbol", "anchors": anchors, "symbols": syms,
             "groups": None, "triggers": names[:TRIG_CAP],
             "keywords": kw_check(sorted({stem, crate, "rust"}), what),
             "tasks": [], "questions": [], "excl": [], "pn": []})
    for s in rec["symbols"]:
        if s["path"] not in used:
            raise UiError("E_RECORD", "%s: symbol on auxiliary file" % what)
    return evidences, aux


def block_strs(block, key, cap, maxlen, what):
    vals = block.get(key, [])
    if not isinstance(vals, list):
        raise UiError("E_BLOCK_JSON", "%s: %s not a list" % (what, key))
    if len(vals) > cap:
        raise UiError("E_BLOCK_JSON", "%s: too many %s" % (what, key))
    for v in vals:
        if not isinstance(v, str) or not v:
            raise UiError("E_BLOCK_JSON", "%s: bad %s entry" % (what, key))
        if len(v) > maxlen:
            raise UiError("E_BLOCK_JSON", "%s: %s entry too long" % (what, key))
    return list(vals)


def block_objs(block, key, field, cap, what):
    rows = block.get(key, [])
    if not isinstance(rows, list):
        raise UiError("E_BLOCK_JSON", "%s: %s not a list" % (what, key))
    if len(rows) > cap:
        raise UiError("E_BLOCK_JSON", "%s: too many %s" % (what, key))
    out = []
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get(field), str) \
                or not r[field]:
            raise UiError("E_BLOCK_JSON", "%s: bad %s row" % (what, key))
        if len(r[field]) > LONG_CAP:
            raise UiError("E_BLOCK_JSON", "%s: %s row too long" % (what, key))
        out.append(r[field])
    return out


def adapt_md(root, rel, corpus):
    what = "book %s" % rel
    if bad_rel(rel) is not None or not rel.endswith(".md"):
        raise UiError("E_PATH", "%s: not a relative .md path" % rel)
    raw, text = read_text(root, rel)
    try:
        parsed = BL.blocks_from_text(text, rel)
    except BL.BlockError as e:
        raise UiError("E_BLOCK_JSON", "%s %s" % (rel, e))
    ids = BL.ANCHOR_RE.findall(text)
    if len(ids) != len(set(ids)):
        dup = sorted({i for i in ids if ids.count(i) > 1})[0]
        raise UiError("E_DUPLICATE", "anchor %s in %s" % (dup, rel))
    names = sorted(set(ids))
    if not names:
        raise UiError("E_NO_ANCHORS", rel)
    for a in names:
        if len(a.encode("utf-8")) > ANCHOR_BYTES:
            raise UiError("E_WIDTH", "%s: %s" % (rel, a))
    stem = stem_of(rel, ".md")
    base = "doc:" + stem
    check_id(base, corpus)
    title = stem
    for line in text.split("\n"):
        if line.startswith("# ") and line[2:].strip():
            title = line[2:].strip()
            break
    if len(title) > TITLE_CAP:
        raise UiError("E_WIDTH", rel)
    triggers, keywords, tasks, questions, excl, pns = [], [], [], [], [], []
    blk = parsed.get("pm.search.v1")
    if blk is not None:
        if not isinstance(blk, dict):
            raise UiError("E_BLOCK_JSON", "%s: pm.search.v1 not an object"
                          % what)
        triggers = block_strs(blk, "retrieval_triggers", TRIG_CAP, STR_CAP,
                              what)
        keywords = block_strs(blk, "keywords", KW_CAP, STR_CAP, what)
        tasks = block_objs(blk, "engineering_tasks", "task", TASK_CAP, what)
        questions = block_objs(blk, "questions_answered", "question", Q_CAP,
                               what)
        excl = block_objs(blk, "exclusions", "query", EXCL_CAP, what)
        syns = blk.get("synonyms", [])
        if not isinstance(syns, list):
            raise UiError("E_BLOCK_JSON", "%s: synonyms not a list" % what)
        for s in syns:
            if not isinstance(s, dict) or not isinstance(s.get("term"), str) \
                    or not s["term"]:
                raise UiError("E_BLOCK_JSON", "%s: bad synonym" % what)
            cands = [s["term"]] + list(s.get("aliases") or [])
            for c in cands:
                if not isinstance(c, str) or not c:
                    raise UiError("E_BLOCK_JSON", "%s: bad alias" % what)
                if len(c) > STR_CAP:
                    raise UiError("E_BLOCK_JSON", "%s: alias too long" % what)
                if c not in pns and len(pns) < PN_CAP:
                    pns.append(c)
    if not triggers:
        triggers = ([stem] + [a for a in names if a != stem])[:TRIG_CAP]
    if not keywords:
        keywords = kw_check(sorted({"book", stem}), what)
    return {"path": rel, "sha": sha(raw), "kind": "md", "label": "book",
            "base": base, "family": base, "title": title,
            "purpose": purpose_of("book", rel, len(names)),
            "nodekind": "section",
            "anchors": [{"a": a, "role": "section"} for a in names],
            "symbols": [], "groups": None, "triggers": triggers,
            "keywords": keywords, "tasks": tasks, "questions": questions,
            "excl": excl, "pn": pns}


def chunk(names, cap):
    return [names[i:i + cap] for i in range(0, len(names), cap)]


ADAPT = {VUE_SCHEMA: adapt_vue, JS_SCHEMA: adapt_js, CSS_SCHEMA: adapt_css,
         RUST_SCHEMA: adapt_rust}


def compose(root, scope_set, records, md_rels, corpus):
    evidences, aux = [], []
    for rec in records:
        fn = ADAPT.get(rec["schema"])
        if fn is None:
            raise UiError("E_RECORD", "unknown schema %s" % rec["schema"])
        evs, ax = fn(rec, corpus)
        evidences.extend(evs)
        aux.extend(ax)
    if len(set(md_rels)) != len(md_rels):
        raise UiError("E_DUPLICATE", "duplicate --md input")
    for rel in sorted(md_rels):
        evidences.append(adapt_md(root, rel, corpus))
    seen = set()
    for ev in evidences:
        if ev["path"] in seen:
            raise UiError("E_DUPLICATE", ev["path"])
        seen.add(ev["path"])
        if ev["path"] not in scope_set:
            raise UiError("E_SCOPE", "evidence outside scope: %s" % ev["path"])
    cache = {}
    for ev in evidences:
        raw, text = read_text(root, ev["path"])
        if sha(raw) != ev["sha"]:
            raise UiError("E_STALE", "%s: bytes changed, re-extract"
                          % ev["path"])
        cache[ev["path"]] = text.split("\n")
    for ax in aux:
        raw, _ = read_text(root, ax["path"])
        if sha(raw) != ax["sha"]:
            raise UiError("E_STALE", "%s: bytes changed, re-extract"
                          % ax["path"])
        if ax["role"] == "tokens-source":
            try:
                json.loads(raw.decode("utf-8"))
            except ValueError:
                raise UiError("E_RECORD", "%s: tokens not JSON" % ax["path"])
    merged = []
    for ev in evidences:
        merged.extend(ev["symbols"])
    merged.sort(key=lambda s: (s["path"], s["symbol"]))
    prev = None
    for s in merged:
        key = (s["path"], s["symbol"])
        if key == prev:
            raise UiError("E_DUPLICATE", "%s: %s" % (s["path"], s["symbol"]))
        prev = key
        lines = cache[s["path"]]
        if s["line"] > len(lines) or s["name"] not in lines[s["line"] - 1]:
            raise UiError("E_LINE_DRIFT", "%s:%d %s"
                          % (s["path"], s["line"], s["symbol"]))
    schema = node_schema()
    nodes, lookup = [], []
    for ev in sorted(evidences, key=lambda e: e["path"]):
        if ev["groups"] is not None:
            shards = [(g["node"], g["family"], g["anchors"])
                      for g in ev["groups"]]
        elif len(ev["anchors"]) <= ANCHOR_CAP:
            shards = [(ev["base"], ev["family"],
                       [a["a"] for a in ev["anchors"]])]
        else:
            shards = [("%s.p%d" % (ev["base"], i), ev["family"], c)
                      for i, c in enumerate(chunk(
                          [a["a"] for a in ev["anchors"]], ANCHOR_CAP))]
        total = len(shards)
        for i, (nid, fam, names) in enumerate(shards):
            check_id(nid, corpus)
            search = {"triggers": ev["triggers"], "keywords": ev["keywords"]}
            if ev["tasks"]:
                search["tasks"] = ev["tasks"]
            if ev["questions"]:
                search["questions"] = ev["questions"]
            if ev["excl"]:
                search["exclusions"] = ev["excl"]
            if ev["pn"]:
                search["problem_names"] = ev["pn"]
            node = {"schema": "ctx.node.v2", "id": nid, "corpus": corpus,
                    "kind": ev["nodekind"], "title": ev["title"]
                    if total == 1 else "%s (part %d/%d)"
                    % (ev["title"], i + 1, total),
                    "purpose": ev["purpose"], "family": fam,
                    "anchors": [{"a": a, "role": "section"
                                 if ev["nodekind"] == "section"
                                 else "symbol"} for a in names],
                    "search": search, "status": "active",
                    "source_sha256": ev["sha"]}
            errs = JS.validate(node, schema)
            if errs:
                raise UiError("E_SCHEMA", "%s: %s" % (nid, errs[0]))
            nodes.append(node)
            lookup.append((nid, ev["path"]))
    nodes.sort(key=lambda n: n["id"])
    lookup.sort(key=lambda r: r[0])
    ids = [n["id"] for n in nodes]
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)[0]
        raise UiError("E_DUPLICATE_ID", dup)
    bypath = {}
    for nid, path in lookup:
        bypath.setdefault(path, []).append(nid)
    files = [{"path": ev["path"], "sha256": ev["sha"], "kind": ev["kind"],
              "nodes": sorted(bypath[ev["path"]])} for ev in evidences]
    files.sort(key=lambda f: f["path"])
    auxrows = [{"path": a["path"], "sha256": a["sha"], "role": a["role"]}
               for a in aux]
    auxrows.sort(key=lambda a: a["path"])
    index = sorted("%s\t%s" % (s["path"], s["symbol"]) for s in merged)
    return {"nodes": nodes, "lookup": lookup, "symbols": merged,
            "files": files, "aux": auxrows, "index": index}


def apply_history(history_path, index):
    if history_path is None:
        return None
    try:
        raw = readb(history_path)
    except OSError:
        raise UiError("E_HISTORY", "unreadable")
    try:
        doc = json.loads(raw.decode("utf-8"))
    except ValueError:
        raise UiError("E_HISTORY", "not JSON")
    if not isinstance(doc, dict) or doc.get("schema") != SCHEMA_PROV:
        raise UiError("E_HISTORY", "schema != %s" % SCHEMA_PROV)
    prev = doc.get("anchor_index")
    if not isinstance(prev, list) or any(not isinstance(x, str) for x in prev):
        raise UiError("E_HISTORY", "bad anchor_index")
    removed = sorted(set(prev) - set(index))
    if removed:
        raise UiError("E_REMOVED_ANCHOR", "; ".join(removed))
    return sha(raw)


def run(root, scope_path, scope_roots, record_paths, md_rels, out_dir,
        history_path=None, corpus=CORPUS_DEFAULT, check=False):
    blobs = None
    try:
        scope = load_scope(scope_path, scope_roots)
        missing = []
        for rel in scope:
            try:
                resolve(root, rel)
            except UiError:
                missing.append(rel)
        if missing:
            raise UiError("E_PATH", "missing file: %s" % ", ".join(missing))
        records = load_inputs(record_paths)
        comp = compose(root, set(scope), records, md_rels or [], corpus)
        unrouted = sorted(set(scope) - {p for _, p in comp["lookup"]})
        if unrouted:
            raise UiError("E_COVERAGE", "; ".join(unrouted))
        hsha = apply_history(history_path, comp["index"])
        nodes_blob = b"".join(canon(n) for n in comp["nodes"])
        lookup_blob = "".join("%s\t%s\n" % r
                              for r in comp["lookup"]).encode("utf-8")
        syms_blob = b"".join(canon(s) for s in comp["symbols"])
        prov = {"schema": SCHEMA_PROV, "tool": VERSION, "corpus": corpus,
                "scope_roots": sorted(scope_roots),
                "files": comp["files"], "aux": comp["aux"],
                "nodes": len(comp["nodes"]), "symbols": len(comp["symbols"]),
                "nodes_sha256": sha(nodes_blob),
                "lookup_sha256": sha(lookup_blob),
                "symbols_sha256": sha(syms_blob),
                "anchor_index": comp["index"], "history_sha256": hsha,
                "removed": [],
                "coverage": {"scope": len(scope), "routed": len(scope),
                             "unrouted": []}}
        prov_blob = canon(prov)
        blobs = {OUT_NODES: nodes_blob, OUT_LOOKUP: lookup_blob,
                 OUT_SYMBOLS: syms_blob, OUT_PROV: prov_blob}
        receipt = {"schema": SCHEMA_RECEIPT, "tool": VERSION, "pass": True,
                   "errors": [],
                   "checked": {"files": len(comp["files"]),
                               "nodes": len(comp["nodes"]),
                               "symbols": len(comp["symbols"]),
                               "scope": len(scope), "unrouted": []}}
    except UiError as e:
        receipt = {"schema": SCHEMA_RECEIPT, "tool": VERSION, "pass": False,
                   "errors": [str(e)],
                   "checked": {"files": 0, "nodes": 0, "symbols": 0,
                               "scope": 0, "unrouted": []}}
        return receipt, None
    if check:
        errs = []
        for name in OUT_NAMES:
            p = os.path.join(out_dir, name)
            if not os.path.isfile(p):
                errs.append("E_CHECK %s missing" % name)
            elif readb(p) != blobs[name]:
                errs.append("E_CHECK %s differs" % name)
        if errs:
            receipt = {"schema": SCHEMA_RECEIPT, "tool": VERSION,
                       "pass": False, "errors": sorted(errs),
                       "checked": receipt["checked"]}
    return receipt, blobs


def valid_root_arg(root):
    if not os.path.isdir(root):
        print("E_USAGE: root is not a directory", file=sys.stderr)
        return False
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract_ui.py")
    ap.add_argument("--root", required=True)
    ap.add_argument("--allowlist", required=True)
    ap.add_argument("--scope-root", action="append", default=None)
    ap.add_argument("--record", action="append", default=[])
    ap.add_argument("--md", action="append", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--history", default=None)
    ap.add_argument("--corpus", default=CORPUS_DEFAULT)
    ap.add_argument("--check", action="store_true")
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if not valid_root_arg(a.root):
        return 2
    if not is_corpus(a.corpus):
        print("E_USAGE: bad --corpus", file=sys.stderr)
        return 2
    roots = tuple(a.scope_root) if a.scope_root else DEFAULT_SCOPE_ROOTS
    for r in roots:
        probe = r[:-1] if r.endswith("/") else r
        if not r or r.startswith("/") or "\\" in r or \
                any(s in ("", ".", "..") for s in probe.split("/")):
            print("E_USAGE: bad --scope-root %r" % r, file=sys.stderr)
            return 2
    receipt, blobs = run(a.root, a.allowlist, roots, a.record, a.md, a.out,
                         history_path=a.history, corpus=a.corpus,
                         check=a.check)
    if receipt["pass"] and not a.check:
        os.makedirs(a.out, exist_ok=True)
        for name in OUT_NAMES:
            with open(os.path.join(a.out, name), "wb") as f:
                f.write(blobs[name])
    sys.stdout.write(canon(receipt).decode("utf-8"))
    return 0 if receipt["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
