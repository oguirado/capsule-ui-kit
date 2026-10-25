#!/usr/bin/env python3
"""W0-RESOLVE UI symbol resolver and generic-mount gate for the router kit.

Resolves every node anchor through the mount's generic lookup
(`id<TAB>path`) and symbol inventory (`{path,symbol,name,line}`): a
`symbol` anchor needs exactly one inventory row for `(path, symbol)`
whose line currently contains the name; a `section`/`statement` anchor
needs exactly one `id="<anchor>"` in the lookup file. Binds every lookup
file to its nodes' `source_sha256` (freshness), enforces the
single-corpus identity contract (no duplicate IDs, no width overflow, no
silent 32-byte collisions, no clipped keys), and enforces 100% scope
coverage (every allowlisted file maps to at least one node). Optionally
emits the nodes, lookup and symbols for one scope root alone so the kit
routes on its own.

Explicit allowlisted paths only, never a repo scan; bytes hashed before
decoding; no symlink escape. Offline, deterministic, Python 3 stdlib
only. Exit 0 pass, 4 refuse, 2 usage.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jsonschema_lite as JS  # noqa: E402

SCHEMA_RECEIPT = "ctx.ui-resolve.v1"
VERSION = "resolve_ui.py/1.0"
CORPUS_DEFAULT = "ui"
ANCHOR_BYTES = 64
ID_SPAN = 32  # len(corpus) + 1 + len(id) <= 32 bytes, never clipped
NODE_KINDS = ("symbol", "section")
SECTION_ROLES = ("section", "statement")

# Allowlisted UI roots (operator ruling U-DEC-0060). Trailing-slash
# entries are directory prefixes; "books/ui-" is a file prefix.
DEFAULT_SCOPE_ROOTS = (
    "packages/capsule-ui-kit/",
    "app/shell/src/renderer-v2/",
    "app/shell/src/design/",
    "books/ui-",
)

OUT_NODES = "ui.nodes.jsonl"
OUT_LOOKUP = "routes.tsv"
OUT_SYMBOLS = "symbols.jsonl"
OUT_NAMES = (OUT_NODES, OUT_LOOKUP, OUT_SYMBOLS)

SYMBOL_KEYS = ("line", "name", "path", "symbol")

CODES = ("E_ANCHOR", "E_CHECK", "E_CLIPPED", "E_COLLISION", "E_COVERAGE",
         "E_DECODE", "E_DUPLICATE", "E_DUPLICATE_ID", "E_ID",
         "E_LINE_DRIFT", "E_LOOKUP", "E_ORDER", "E_PATH", "E_RECORD",
         "E_ROLE", "E_SCHEMA", "E_SCOPE", "E_STALE", "E_WIDTH")


class ResolveError(Exception):
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
            raise ResolveError("E_PATH", "node schema unreadable")
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


def cutkey(corpus, nid):
    """First 32 UTF-8 bytes of `corpus:id` at a code-point boundary.

    Mirrors the pilot's merged-row cut (`route_v2.clip` direction): two
    distinct IDs sharing a cutkey would merge silently downstream.
    """
    b = ("%s:%s" % (corpus, nid)).encode("utf-8")
    if len(b) <= ID_SPAN:
        return b
    return b[:ID_SPAN].decode("utf-8", "ignore").encode("utf-8")


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
        raise ResolveError("E_PATH", "%s: %s" % (rel, why))
    base = os.path.abspath(root)
    cur = base
    for part in rel.split("/"):
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            raise ResolveError("E_PATH", "%s: symlink refused" % rel)
    if os.path.realpath(cur) != base and \
            not os.path.realpath(cur).startswith(base + os.sep):
        raise ResolveError("E_PATH", "%s: escapes root" % rel)
    if not os.path.isfile(cur):
        raise ResolveError("E_PATH", "%s: missing file" % rel)
    return cur


def read_text(root, rel):
    raw = readb(resolve(root, rel))
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ResolveError("E_DECODE", "%s: not UTF-8" % rel)
    if "\0" in text:
        raise ResolveError("E_DECODE", "%s: NUL byte" % rel)
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
        raise ResolveError("E_PATH", "allowlist unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ResolveError("E_DECODE", "allowlist not UTF-8")
    rels = []
    for entry in text.splitlines():
        if bad_rel(entry) is not None or entry != entry.strip():
            raise ResolveError("E_SCOPE", "entry %r" % entry)
        if entry in rels:
            raise ResolveError("E_SCOPE", "duplicate %s" % entry)
        rels.append(entry)
    if not rels:
        raise ResolveError("E_SCOPE", "empty scope")
    outside = sorted(r for r in rels if not under_roots(r, roots))
    if outside:
        raise ResolveError("E_SCOPE",
                           "outside scope roots: %s" % ", ".join(outside))
    return sorted(rels)


def load_jsonl(path, what, allow_empty=False):
    try:
        raw = readb(path)
    except OSError:
        raise ResolveError("E_PATH", "%s unreadable" % what)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ResolveError("E_DECODE", "%s not UTF-8" % what)
    if "\0" in text:
        raise ResolveError("E_DECODE", "%s: NUL byte" % what)
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        if line == "":
            raise ResolveError("E_RECORD", "%s:%d: blank line" % (what, n))
        try:
            o = json.loads(line)
        except ValueError:
            raise ResolveError("E_RECORD", "%s:%d: bad JSON" % (what, n))
        if not isinstance(o, dict):
            raise ResolveError("E_RECORD", "%s:%d: not an object" % (what, n))
        rows.append(o)
    if not rows and not allow_empty:
        raise ResolveError("E_RECORD", "%s: empty" % what)
    return rows


def load_nodes(path, corpus):
    rows = load_jsonl(path, "nodes")
    for n in rows:
        if not isinstance(n.get("id"), str):
            raise ResolveError("E_SCHEMA", "node without id")
    ids = [n["id"] for n in rows]
    if ids != sorted(ids):
        raise ResolveError("E_ORDER", "nodes not sorted by id")
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)[0]
        raise ResolveError("E_DUPLICATE_ID", dup)
    schema = node_schema()
    for n in rows:
        nid = n["id"]
        errs = JS.validate(n, schema)
        if errs:
            raise ResolveError("E_SCHEMA", "%s: %s" % (nid, errs[0]))
        if n["corpus"] != corpus:
            raise ResolveError("E_SCHEMA",
                               "%s: corpus %s != %s" % (nid, n["corpus"],
                                                       corpus))
        if n["kind"] not in NODE_KINDS:
            raise ResolveError("E_ROLE", "%s: kind %s not routable in UI "
                               "mount" % (nid, n["kind"]))
        # Merged-ID width is checked in check_identity, after the
        # collision scan, so a colliding pair reports E_COLLISION (the
        # more specific diagnosis) instead of E_WIDTH.
        seen = set()
        for a in n["anchors"]:
            if len(a["a"].encode("utf-8")) > ANCHOR_BYTES:
                raise ResolveError("E_WIDTH", "%s: %s" % (nid, a["a"]))
            if a["a"] in seen:
                raise ResolveError("E_DUPLICATE", "%s: %s" % (nid, a["a"]))
            seen.add(a["a"])
            want = "symbol" if n["kind"] == "symbol" else SECTION_ROLES
            if n["kind"] == "symbol" and a["role"] != "symbol":
                raise ResolveError("E_ROLE", "%s: %s role %s in symbol "
                                   "node" % (nid, a["a"], a["role"]))
            if n["kind"] == "section" and a["role"] not in want:
                raise ResolveError("E_ROLE", "%s: %s role %s in section "
                                   "node" % (nid, a["a"], a["role"]))
        if not n["search"]["triggers"] or not n["search"]["keywords"]:
            raise ResolveError("E_SCHEMA", "%s: empty search" % nid)
        if not is_hex(n["source_sha256"]):
            raise ResolveError("E_SCHEMA", "%s: bad source_sha256" % nid)
    return rows


def load_lookup(path):
    try:
        raw = readb(path)
    except OSError:
        raise ResolveError("E_PATH", "lookup unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ResolveError("E_DECODE", "lookup not UTF-8")
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        if line == "":
            raise ResolveError("E_RECORD", "lookup:%d: blank line" % n)
        cols = line.split("\t")
        if len(cols) != 2 or not cols[0] or not cols[1]:
            raise ResolveError("E_RECORD", "lookup:%d: want id<TAB>path" % n)
        nid, rel = cols
        if not is_id(nid):
            raise ResolveError("E_ID", "lookup:%d: %r" % (n, nid))
        why = bad_rel(rel)
        if why:
            raise ResolveError("E_PATH", "lookup:%d: %s: %s" % (n, rel, why))
        rows.append((nid, rel))
    if not rows:
        raise ResolveError("E_RECORD", "lookup: empty")
    ids = [r[0] for r in rows]
    if ids != sorted(ids):
        raise ResolveError("E_ORDER", "lookup not sorted by id")
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)[0]
        raise ResolveError("E_DUPLICATE_ID", dup)
    return rows


def load_symbols(path):
    # An all-section mount (books only) has zero symbol rows; the empty
    # file is its honest inventory, not a malformed input.
    rows = load_jsonl(path, "symbols", allow_empty=True)
    for s in rows:
        if set(s) != set(SYMBOL_KEYS):
            raise ResolveError("E_RECORD", "symbol keys want %s" %
                               ",".join(SYMBOL_KEYS))
        if bad_rel(s["path"]) is not None:
            raise ResolveError("E_PATH", "bad symbol path %r" % s["path"])
        if not isinstance(s["symbol"], str) or not s["symbol"]:
            raise ResolveError("E_RECORD", "bad symbol name")
        if not isinstance(s["name"], str) or not s["name"]:
            raise ResolveError("E_RECORD", "bad symbol local")
        if not is_int(s["line"]) or s["line"] < 1:
            raise ResolveError("E_RECORD", "bad symbol line")
    keys = [(s["path"], s["symbol"]) for s in rows]
    if keys != sorted(keys):
        raise ResolveError("E_ORDER", "symbols not sorted by (path,symbol)")
    if len(set(keys)) != len(keys):
        dup = sorted(k for k in set(keys) if keys.count(k) > 1)[0]
        raise ResolveError("E_DUPLICATE", "%s: %s" % dup)
    return rows


def check_collision(corpus, ids):
    """Refuse distinct IDs that would merge under the pilot 32-byte cut."""
    buckets = {}
    for nid in ids:
        buckets.setdefault(cutkey(corpus, nid), []).append(nid)
    for key in sorted(buckets):
        group = sorted(buckets[key])
        if len(group) > 1:
            raise ResolveError("E_COLLISION",
                               "%s: %s" % (key.decode("utf-8", "replace"),
                                           ",".join(group)))


def check_identity(corpus, nodes, lookup):
    """Bind the lookup to the nodes: exact inverse mapping, no clipped keys.

    Every node ID appears in the lookup exactly once and every lookup ID
    names exactly one node. A dangling lookup ID that is a strict prefix
    of a node ID is diagnosed as a clipped key; any other dangle is a
    lookup mismatch.
    """
    node_ids = sorted(n["id"] for n in nodes)
    check_collision(corpus, node_ids)
    for nid in node_ids:
        if len((corpus + ":" + nid).encode("utf-8")) > ID_SPAN:
            raise ResolveError("E_WIDTH", nid)
    by_id = {n["id"]: n for n in nodes}
    for lid, _ in lookup:
        if lid not in by_id:
            longer = sorted(n for n in node_ids if n.startswith(lid))
            if longer:
                raise ResolveError("E_CLIPPED",
                                   "lookup %s is a strict prefix of node %s"
                                   % (lid, longer[0]))
            raise ResolveError("E_LOOKUP", "lookup id without node: %s" % lid)
    for nid in node_ids:
        if nid not in {r[0] for r in lookup}:
            raise ResolveError("E_LOOKUP", "node without lookup row: %s" % nid)
    return by_id


def index_symbols(rows):
    """{(path, symbol): row} over loaded symbol rows."""
    return {(s["path"], s["symbol"]): s for s in rows}


def resolve_symbol(rows, root, path, symbol):
    """Look up one symbol: the unique current coordinate, name and hash.

    Returns {"path","symbol","name","line","sha256"} where sha256 is the
    digest of the file bytes read now. Fails closed on zero or several
    matches, on drift (the line no longer contains the name), and on any
    unreadable, escaping or undecodable path.
    """
    matches = [s for s in rows
               if s["path"] == path and s["symbol"] == symbol]
    if not matches:
        raise ResolveError("E_ANCHOR", "%s: %s unresolved" % (path, symbol))
    if len(matches) > 1:
        raise ResolveError("E_DUPLICATE", "%s: %s" % (path, symbol))
    s = matches[0]
    raw, text = read_text(root, path)
    lines = text.split("\n")
    if s["line"] > len(lines) or s["name"] not in lines[s["line"] - 1]:
        raise ResolveError("E_LINE_DRIFT", "%s:%d %s"
                           % (path, s["line"], symbol))
    return {"path": path, "symbol": symbol, "name": s["name"],
            "line": s["line"], "sha256": sha(raw)}


def check_symbol_rows(rows, cache):
    """Every inventory row pins a live line containing its name."""
    for s in rows:
        entry = cache.get(s["path"])
        if entry is None:
            raise ResolveError("E_LOOKUP", "symbol outside lookup: %s: %s"
                               % (s["path"], s["symbol"]))
        if s["line"] > len(entry["lines"]) or \
                s["name"] not in entry["lines"][s["line"] - 1]:
            raise ResolveError("E_LINE_DRIFT", "%s:%d %s"
                               % (s["path"], s["line"], s["symbol"]))


def count_section(text, anchor):
    if '"' in anchor:
        raise ResolveError("E_ANCHOR", "%r: unquotable section anchor"
                           % anchor)
    return text.count('id="%s"' % anchor)


def check_anchors(nodes, lookup_path, index, cache):
    """Resolve every anchor exactly once against current file bytes."""
    total = 0
    for n in nodes:
        path = lookup_path[n["id"]]
        entry = cache[path]
        if entry["sha"] != n["source_sha256"]:
            raise ResolveError("E_STALE", "%s: file sha differs from node %s"
                               % (path, n["id"]))
        for a in n["anchors"]:
            if a["role"] == "symbol":
                key = (path, a["a"])
                if key not in index:
                    raise ResolveError("E_ANCHOR", "%s: %s unresolved"
                                       % (path, a["a"]))
            else:
                found = count_section(entry["text"], a["a"])
                if found != 1:
                    raise ResolveError("E_ANCHOR", "%s: %s found %d times"
                                       % (path, a["a"], found))
            total += 1
    return total


def emit_subset(nodes, lookup, symbols, emit_root):
    """Nodes, lookup rows and symbols whose file sits under emit_root."""
    keep = {p for _, p in lookup if under_roots(p, (emit_root,))}
    sub_nodes = [n for n in nodes if
                 dict((r[0], r[1]) for r in lookup)[n["id"]] in keep]
    sub_lookup = [(i, p) for i, p in lookup if p in keep]
    sub_symbols = [s for s in symbols if s["path"] in keep]
    blobs = {
        OUT_NODES: b"".join(canon(n) for n in sub_nodes),
        OUT_LOOKUP: "".join("%s\t%s\n" % r
                            for r in sub_lookup).encode("utf-8"),
        OUT_SYMBOLS: b"".join(canon(s) for s in sub_symbols),
    }
    info = {"root": emit_root, "files": list(OUT_NAMES),
            "nodes": len(sub_nodes), "symbols": len(sub_symbols),
            "sha256": {k: sha(blobs[k]) for k in OUT_NAMES}}
    return blobs, info


def run(root, nodes_path, lookup_path, symbols_path, scope_path,
        scope_roots, corpus=CORPUS_DEFAULT, out_dir=None, emit_root=None,
        check=False):
    blobs = None
    emit_info = None
    try:
        scope = load_scope(scope_path, scope_roots)
        for rel in scope:
            resolve(root, rel)
        nodes = load_nodes(nodes_path, corpus)
        lookup = load_lookup(lookup_path)
        symbols = load_symbols(symbols_path)
        check_identity(corpus, nodes, lookup)
        lookup_path_of = {i: p for i, p in lookup}
        scope_set = set(scope)
        for lid, rel in lookup:
            if not under_roots(rel, scope_roots):
                raise ResolveError("E_SCOPE",
                                   "lookup path outside scope roots: %s" % rel)
            if rel not in scope_set:
                raise ResolveError("E_SCOPE",
                                   "lookup path outside allowlist: %s" % rel)
        cache = {}
        for rel in sorted({p for _, p in lookup}):
            raw, text = read_text(root, rel)
            cache[rel] = {"sha": sha(raw), "text": text,
                          "lines": text.split("\n")}
        unrouted = sorted(scope_set - set(cache))
        if unrouted:
            raise ResolveError("E_COVERAGE", "; ".join(unrouted))
        check_symbol_rows(symbols, cache)
        total = check_anchors(nodes, lookup_path_of, index_symbols(symbols),
                              cache)
        if emit_root is not None:
            if emit_root not in scope_roots:
                raise ResolveError("E_SCOPE",
                                   "emit root outside scope roots: %s"
                                   % emit_root)
            blobs, emit_info = emit_subset(nodes, lookup, symbols, emit_root)
        receipt = {"schema": SCHEMA_RECEIPT, "tool": VERSION, "pass": True,
                   "errors": [],
                   "checked": {"files": len(cache), "nodes": len(nodes),
                               "symbols": len(symbols), "anchors": total,
                               "scope": len(scope), "unrouted": []},
                   "emit": emit_info}
    except ResolveError as e:
        unrouted = []
        if e.code == "E_COVERAGE":
            unrouted = str(e).split(" ", 1)[1].split("; ") \
                if " " in str(e) else []
        receipt = {"schema": SCHEMA_RECEIPT, "tool": VERSION, "pass": False,
                   "errors": [str(e)],
                   "checked": {"files": 0, "nodes": 0, "symbols": 0,
                               "anchors": 0, "scope": 0,
                               "unrouted": unrouted},
                   "emit": None}
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
                       "checked": receipt["checked"], "emit": emit_info}
    return receipt, blobs


def valid_root_arg(root):
    if not os.path.isdir(root):
        print("E_USAGE: root is not a directory", file=sys.stderr)
        return False
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(prog="resolve_ui.py")
    ap.add_argument("--root", required=True)
    ap.add_argument("--nodes", required=True)
    ap.add_argument("--lookup", required=True)
    ap.add_argument("--symbols", required=True)
    ap.add_argument("--allowlist", required=True)
    ap.add_argument("--scope-root", action="append", default=None)
    ap.add_argument("--corpus", default=CORPUS_DEFAULT)
    ap.add_argument("--out", default=None)
    ap.add_argument("--emit-scope-root", default=None)
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
    if a.emit_scope_root is None and a.check:
        print("E_USAGE: --check needs --emit-scope-root and --out",
              file=sys.stderr)
        return 2
    if a.emit_scope_root is not None and not a.out:
        print("E_USAGE: --emit-scope-root needs --out", file=sys.stderr)
        return 2
    if a.check and not a.out:
        print("E_USAGE: --check needs --out", file=sys.stderr)
        return 2
    receipt, blobs = run(a.root, a.nodes, a.lookup, a.symbols, a.allowlist,
                         roots, corpus=a.corpus, out_dir=a.out,
                         emit_root=a.emit_scope_root, check=a.check)
    if receipt["pass"] and not a.check and blobs is not None:
        os.makedirs(a.out, exist_ok=True)
        for name in OUT_NAMES:
            with open(os.path.join(a.out, name), "wb") as f:
                f.write(blobs[name])
    sys.stdout.write(canon(receipt).decode("utf-8"))
    return 0 if receipt["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
