#!/usr/bin/env python3
"""W0-WEB governance adapter: separate richer resolution record plus conservative stale/overflow wrapper.

Resolves every ``ctx.shortlist.v2`` row through committed
collision-checked metadata (nodes, generic lookup, symbol inventory,
web governance file) and publishes a separate checked resolution
record under the versioned web contract ``ctx.web-resolution.v1``.
The engine shortlist is never edited in place and never gains unknown
fields: richer governance metadata lives only in the separate record,
which retains the original ``ix``/``pr``/``q``/``intent``/``abstain``
evidence verbatim.

Conservative closure (bootstrap section 8): ``overflow:true``,
abstention, uncalibrated rows, stale/ambiguous/unresolved rows,
missing governors, tie-order ambiguity, ``ix``/``pr`` disagreement
and every refusal below resolve to a non-actionable record. Only a
fully ``ok`` record authorizes editing, and only through
``authorizes_edit`` / the ``authorize`` subcommand. The ``wrap``
subcommand publishes a router process outcome (including the
``E_STALE`` exit) as a typed failure record that retains the original
exit and never fabricates rows.

Explicit allowlisted committed paths only, never a repo scan; bytes
hashed before decoding; no symlink escape. Offline, deterministic,
Python 3 stdlib only. Exit 0 actionable/authorized, 4 honest
non-actionable/refused, 2 usage.
"""
import argparse
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jsonschema_lite as JS  # noqa: E402

SCHEMA = "ctx.web-resolution.v1"
VERSION = "router_web.py/1.0"
GOV_SCHEMA = "ctx.web-governance.v1"
GOV_VERSION = 1
SHORTLIST_SCHEMA = "ctx.shortlist.v2"
CORPUS_DEFAULT = "ui"
ANCHOR_BYTES = 64
ID_SPAN = 32  # len(corpus) + 1 + len(id) <= 32 bytes, never clipped
NODE_KINDS = ("symbol", "section")
SECTION_ROLES = ("section", "statement")
PROFILES = ("P0", "P1", "P2")
INTENTS = ("find_method", "find_structure", "find_bound", "find_prerequisite",
           "check_claim", "find_limit", "locate_id", "none")
ABSTAIN_REASONS = ("exact_id", "no_query_term", "no_candidate", "uncalibrated",
                   "low_term_match", "below_tau", "none")
ROUTER_RE = re.compile(r"^route_v2\.py/2\.[0-9]+(\.[0-9]+)?$")
HEX16 = re.compile(r"^[0-9a-f]{16}$")
GOVERNOR_RE = re.compile(r"[A-Za-z0-9._:/-]{1,64}")
EXIT_REASON = {5: "stale_exit", 6: "budget_exit",
               3: "engine_input", 2: "engine_usage"}
SYMBOL_KEYS = ("line", "name", "path", "symbol")


class WebError(Exception):
    def __init__(self, code, detail=""):
        super().__init__("%s %s" % (code, detail) if detail else code)
        self.code = code


def sha(b):
    return hashlib.sha256(b).hexdigest()


def sha16(b):
    return hashlib.sha256(b).hexdigest()[:16]


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
            raise WebError("E_INPUT", "node schema unreadable")
    return _SCHEMA_CACHE["s"]


def is_hex(s):
    return isinstance(s, str) and re.fullmatch(r"[0-9a-f]{64}", s) is not None


def is_hex16(s):
    return isinstance(s, str) and HEX16.match(s) is not None


def is_id(s):
    return isinstance(s, str) and \
        re.fullmatch(r"[A-Za-z][A-Za-z0-9._:-]{0,31}", s) is not None


def is_corpus(s):
    return isinstance(s, str) and \
        re.fullmatch(r"[a-z][a-z0-9_]{0,15}", s) is not None


def is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def cutkey(corpus, nid):
    """First 32 UTF-8 bytes of ``corpus:id`` at a code-point boundary."""
    b = ("%s:%s" % (corpus, nid)).encode("utf-8")
    if len(b) <= ID_SPAN:
        return b
    return b[:ID_SPAN].decode("utf-8", "ignore").encode("utf-8")


def _nat_parts(s):
    return [(0, int(p)) if p.isdigit() else (1, p)
            for p in re.findall(r"\d+|\D+", s)]


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
        raise WebError("E_PATH", "%s: %s" % (rel, why))
    base = os.path.abspath(root)
    cur = base
    for part in rel.split("/"):
        cur = os.path.join(cur, part)
        if os.path.islink(cur):
            raise WebError("E_PATH", "%s: symlink refused" % rel)
    if os.path.realpath(cur) != base and \
            not os.path.realpath(cur).startswith(base + os.sep):
        raise WebError("E_PATH", "%s: escapes root" % rel)
    if not os.path.isfile(cur):
        raise WebError("E_PATH", "%s: missing file" % rel)
    return cur


def read_text(root, rel):
    raw = readb(resolve(root, rel))
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "%s: not UTF-8" % rel)
    if "\0" in text:
        raise WebError("E_DECODE", "%s: NUL byte" % rel)
    return raw, text


# ---- shortlist, index id, params: retained evidence must agree ----

SHORTLIST_TOP = ("schema", "router", "ix", "pr", "q", "intent", "abstain",
                 "r", "overflow", "warn")


def load_shortlist(path):
    try:
        raw = readb(path)
    except OSError:
        raise WebError("E_INPUT", "shortlist unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "shortlist not UTF-8")
    if "\0" in text:
        raise WebError("E_DECODE", "shortlist: NUL byte")
    try:
        o = json.loads(text)
    except ValueError:
        raise WebError("E_SHORTLIST", "bad JSON")
    if not isinstance(o, dict):
        raise WebError("E_SHORTLIST", "not an object")
    unknown = sorted(set(o) - set(SHORTLIST_TOP))
    if unknown:
        raise WebError("E_SHORTLIST", "unknown field %s" % unknown[0])
    for k in ("schema", "router", "ix", "pr", "q", "intent", "abstain", "r"):
        if k not in o:
            raise WebError("E_SHORTLIST", "missing %s" % k)
    if o["schema"] != SHORTLIST_SCHEMA:
        raise WebError("E_SHORTLIST", "schema %r" % (o["schema"],))
    if not isinstance(o["router"], str) or not ROUTER_RE.match(o["router"]):
        raise WebError("E_SHORTLIST", "router %r" % (o["router"],))
    for k in ("ix", "pr", "q"):
        if not is_hex16(o[k]):
            raise WebError("E_SHORTLIST", "bad %s" % k)
    if o["intent"] not in INTENTS:
        raise WebError("E_SHORTLIST", "intent %r" % (o["intent"],))
    ab = o["abstain"]
    if not isinstance(ab, dict) or \
            set(ab) != {"flag", "reason", "m", "cov", "peak"}:
        raise WebError("E_SHORTLIST", "abstain shape")
    if ab["flag"] is not True and ab["flag"] is not False:
        raise WebError("E_SHORTLIST", "abstain flag")
    if ab["reason"] not in ABSTAIN_REASONS:
        raise WebError("E_SHORTLIST", "abstain reason %r" % (ab["reason"],))
    for k, lo, hi in (("m", 0, 64), ("cov", 0, 1000000),
                      ("peak", 0, 1000000000)):
        if not is_int(ab[k]) or not lo <= ab[k] <= hi:
            raise WebError("E_SHORTLIST", "abstain %s" % k)
    rows = o["r"]
    if not isinstance(rows, list) or len(rows) > 20:
        raise WebError("E_SHORTLIST", "rows want a list of at most 20")
    for n, row in enumerate(rows):
        if not isinstance(row, list) or not 3 <= len(row) <= 4:
            raise WebError("E_SHORTLIST", "row %d shape" % n)
        rid, anchor, score = row[0], row[1], row[2]
        if not isinstance(rid, str) or not 1 <= len(rid) <= 32:
            raise WebError("E_SHORTLIST", "row %d id" % n)
        if not isinstance(anchor, str) or not 1 <= len(anchor) <= 64:
            raise WebError("E_SHORTLIST", "row %d anchor" % n)
        if not is_int(score) or not 0 <= score <= 9999999:
            raise WebError("E_SHORTLIST", "row %d score" % n)
        if len(row) == 4:
            why = row[3]
            if not isinstance(why, list) or len(why) > 3 or \
                    any(not isinstance(t, str) or len(t) > 24 for t in why):
                raise WebError("E_SHORTLIST", "row %d why" % n)
    if "overflow" in o and o["overflow"] is not True:
        raise WebError("E_SHORTLIST", "overflow must be exactly true")
    if "warn" in o:
        warn = o["warn"]
        if not isinstance(warn, list) or len(warn) > 3 or \
                any(not isinstance(w, str) or len(w) > 32 for w in warn):
            raise WebError("E_SHORTLIST", "warn shape")
    return o


def load_index_id(index_dir):
    try:
        raw = readb(os.path.join(index_dir, "ID"))
    except OSError:
        raise WebError("E_INPUT", "index ID unreadable")
    try:
        text = raw.decode("utf-8").strip()
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "index ID not UTF-8")
    if not is_hex16(text[:16]) or len(text) < 16:
        raise WebError("E_INPUT", "index ID not 16 hex")
    return text[:16]


def load_params(path):
    try:
        raw = readb(path)
    except OSError:
        raise WebError("E_INPUT", "params unreadable")
    try:
        o = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise WebError("E_PARAMS", "params not JSON")
    if not isinstance(o, dict):
        raise WebError("E_PARAMS", "params not an object")
    profile = o.get("profile", "P0")
    if profile not in PROFILES:
        raise WebError("E_PARAMS", "profile %r" % (profile,))
    return profile, sha16(raw)


# ---- committed metadata loaders (strict, whole-file) ----

def load_jsonl(path, what, allow_empty=False):
    try:
        raw = readb(path)
    except OSError:
        raise WebError("E_INPUT", "%s unreadable" % what)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "%s not UTF-8" % what)
    if "\0" in text:
        raise WebError("E_DECODE", "%s: NUL byte" % what)
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        if line == "":
            raise WebError("E_RECORD", "%s:%d: blank line" % (what, n))
        try:
            o = json.loads(line)
        except ValueError:
            raise WebError("E_RECORD", "%s:%d: bad JSON" % (what, n))
        if not isinstance(o, dict):
            raise WebError("E_RECORD", "%s:%d: not an object" % (what, n))
        rows.append(o)
    if not rows and not allow_empty:
        raise WebError("E_RECORD", "%s: empty" % what)
    return rows


def load_nodes(path, corpus):
    rows = load_jsonl(path, "nodes")
    for n in rows:
        if not isinstance(n.get("id"), str):
            raise WebError("E_SCHEMA", "node without id")
    ids = [n["id"] for n in rows]
    if ids != sorted(ids):
        raise WebError("E_ORDER", "nodes not sorted by id")
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)[0]
        raise WebError("E_DUPLICATE_ID", dup)
    schema = node_schema()
    for n in rows:
        nid = n["id"]
        errs = JS.validate(n, schema)
        if errs:
            raise WebError("E_SCHEMA", "%s: %s" % (nid, errs[0]))
        if n["corpus"] != corpus:
            raise WebError("E_SCHEMA", "%s: corpus %s != %s"
                           % (nid, n["corpus"], corpus))
        if n["kind"] not in NODE_KINDS:
            raise WebError("E_ROLE", "%s: kind %s not routable in UI mount"
                           % (nid, n["kind"]))
        seen = set()
        for a in n["anchors"]:
            if len(a["a"].encode("utf-8")) > ANCHOR_BYTES:
                raise WebError("E_WIDTH", "%s: %s" % (nid, a["a"]))
            if a["a"] in seen:
                raise WebError("E_DUPLICATE", "%s: %s" % (nid, a["a"]))
            seen.add(a["a"])
            if n["kind"] == "symbol" and a["role"] != "symbol":
                raise WebError("E_ROLE", "%s: %s role %s in symbol node"
                               % (nid, a["a"], a["role"]))
            if n["kind"] == "section" and a["role"] not in SECTION_ROLES:
                raise WebError("E_ROLE", "%s: %s role %s in section node"
                               % (nid, a["a"], a["role"]))
        if not n["search"]["triggers"] or not n["search"]["keywords"]:
            raise WebError("E_SCHEMA", "%s: empty search" % nid)
        if not is_hex(n["source_sha256"]):
            raise WebError("E_SCHEMA", "%s: bad source_sha256" % nid)
    return rows


def load_lookup(path):
    try:
        raw = readb(path)
    except OSError:
        raise WebError("E_INPUT", "lookup unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "lookup not UTF-8")
    rows = []
    for n, line in enumerate(text.splitlines(), 1):
        if line == "":
            raise WebError("E_RECORD", "lookup:%d: blank line" % n)
        cols = line.split("\t")
        if len(cols) != 2 or not cols[0] or not cols[1]:
            raise WebError("E_RECORD", "lookup:%d: want id<TAB>path" % n)
        nid, rel = cols
        if not is_id(nid):
            raise WebError("E_ID", "lookup:%d: %r" % (n, nid))
        why = bad_rel(rel)
        if why:
            raise WebError("E_PATH", "lookup:%d: %s: %s" % (n, rel, why))
        rows.append((nid, rel))
    if not rows:
        raise WebError("E_RECORD", "lookup: empty")
    ids = [r[0] for r in rows]
    if ids != sorted(ids):
        raise WebError("E_ORDER", "lookup not sorted by id")
    if len(set(ids)) != len(ids):
        dup = sorted(i for i in set(ids) if ids.count(i) > 1)[0]
        raise WebError("E_DUPLICATE_ID", dup)
    return rows


def load_symbols(path):
    rows = load_jsonl(path, "symbols", allow_empty=True)
    for s in rows:
        if set(s) != set(SYMBOL_KEYS):
            raise WebError("E_RECORD", "symbol keys want %s"
                           % ",".join(SYMBOL_KEYS))
        if bad_rel(s["path"]) is not None:
            raise WebError("E_PATH", "bad symbol path %r" % s["path"])
        if not isinstance(s["symbol"], str) or not s["symbol"]:
            raise WebError("E_RECORD", "bad symbol name")
        if not isinstance(s["name"], str) or not s["name"]:
            raise WebError("E_RECORD", "bad symbol local")
        if not is_int(s["line"]) or s["line"] < 1:
            raise WebError("E_RECORD", "bad symbol line")
    keys = [(s["path"], s["symbol"]) for s in rows]
    if keys != sorted(keys):
        raise WebError("E_ORDER", "symbols not sorted by (path,symbol)")
    if len(set(keys)) != len(keys):
        dup = sorted(k for k in set(keys) if keys.count(k) > 1)[0]
        raise WebError("E_DUPLICATE", "%s: %s" % dup)
    return rows


def load_governance(path, corpus):
    try:
        raw = readb(path)
    except OSError:
        raise WebError("E_INPUT", "governance unreadable")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise WebError("E_DECODE", "governance not UTF-8")
    if "\0" in text:
        raise WebError("E_DECODE", "governance: NUL byte")
    try:
        o = json.loads(text)
    except ValueError:
        raise WebError("E_RECORD", "governance: bad JSON")
    if not isinstance(o, dict):
        raise WebError("E_RECORD", "governance: not an object")
    if set(o) != {"schema", "version", "corpus", "entries"}:
        raise WebError("E_SCHEMA", "governance keys")
    if o["schema"] != GOV_SCHEMA or o["version"] != GOV_VERSION:
        raise WebError("E_SCHEMA", "governance contract %r v%r"
                       % (o.get("schema"), o.get("version")))
    if o["corpus"] != corpus:
        raise WebError("E_SCHEMA", "governance corpus %s != %s"
                       % (o["corpus"], corpus))
    entries = o["entries"]
    if not isinstance(entries, list) or not entries:
        raise WebError("E_RECORD", "governance: empty entries")
    gov = {}
    for e in entries:
        if not isinstance(e, dict) or set(e) != {"governor", "id"}:
            raise WebError("E_RECORD", "governance entry keys")
        if not is_id(e["id"]):
            raise WebError("E_ID", "governance id %r" % (e["id"],))
        if not isinstance(e["governor"], str) or \
                not GOVERNOR_RE.fullmatch(e["governor"]):
            raise WebError("E_GOVERNANCE",
                           "governance governor %r" % (e["governor"],))
        if e["id"] in gov:
            raise WebError("E_DUPLICATE_ID", e["id"])
        gov[e["id"]] = e["governor"]
    if [e["id"] for e in entries] != sorted(gov):
        raise WebError("E_ORDER", "governance not sorted by id")
    return gov


def check_identity(corpus, nodes, lookup):
    """Exact inverse mapping between nodes and lookup, no clipped keys."""
    node_ids = sorted(n["id"] for n in nodes)
    buckets = {}
    for nid in node_ids:
        buckets.setdefault(cutkey(corpus, nid), []).append(nid)
    for key in sorted(buckets):
        group = sorted(buckets[key])
        if len(group) > 1:
            raise WebError("E_COLLISION", "%s: %s"
                           % (key.decode("utf-8", "replace"),
                              ",".join(group)))
    for nid in node_ids:
        if len((corpus + ":" + nid).encode("utf-8")) > ID_SPAN:
            raise WebError("E_WIDTH", nid)
    by_id = {n["id"]: n for n in nodes}
    for lid, _ in lookup:
        if lid not in by_id:
            longer = sorted(n for n in node_ids if n.startswith(lid))
            if longer:
                raise WebError("E_CLIPPED", "lookup %s is a strict prefix "
                               "of node %s" % (lid, longer[0]))
            raise WebError("E_LOOKUP", "lookup id without node: %s" % lid)
    have = {r[0] for r in lookup}
    for nid in node_ids:
        if nid not in have:
            raise WebError("E_LOOKUP", "node without lookup row: %s" % nid)
    return by_id


# ---- per-row resolution: every row binds or carries its evidence ----

def _file_entry(root, rel, cache):
    if rel not in cache:
        raw, text = read_text(root, rel)
        cache[rel] = {"sha": sha(raw), "text": text,
                      "lines": text.split("\n")}
    return cache[rel]


def resolve_row(corpus, rid, anchor, by_id, lookup_path, index, gov, root,
                cache):
    """Bind one cited (id, anchor) or return its (evidence, detail).

    Evidence is one of ok, stale, ambiguous, unresolved, clipped,
    width, role, missing_governance. Only ok rows can appear in an
    actionable record.
    """
    if len((corpus + ":" + rid).encode("utf-8")) > ID_SPAN:
        return {"evidence": "width", "detail": "merged id over 32 bytes",
                "path": None, "role": None, "line": None, "sha256": None}
    node = by_id.get(rid)
    if node is None:
        longer = sorted(n for n in by_id if n.startswith(rid))
        if longer and rid != "":
            return {"evidence": "clipped",
                    "detail": "strict prefix of node %s" % longer[0],
                    "path": None, "role": None, "line": None, "sha256": None}
        return {"evidence": "unresolved", "detail": "id without node",
                "path": None, "role": None, "line": None, "sha256": None}
    path = lookup_path.get(rid)
    if path is None:
        return {"evidence": "unresolved", "detail": "id without lookup row",
                "path": None, "role": None, "line": None, "sha256": None}
    role = None
    for a in node["anchors"]:
        if a["a"] == anchor:
            role = a["role"]
    if role is None:
        return {"evidence": "unresolved",
                "detail": "anchor not declared by node",
                "path": path, "role": None, "line": None, "sha256": None}
    if role not in ("symbol",) + SECTION_ROLES:
        return {"evidence": "role",
                "detail": "role %s has no UI resolver" % role,
                "path": path, "role": role, "line": None, "sha256": None}
    try:
        entry = _file_entry(root, path, cache)
    except WebError as e:
        return {"evidence": "stale", "detail": str(e),
                "path": path, "role": role, "line": None, "sha256": None}
    if entry["sha"] != node["source_sha256"]:
        return {"evidence": "stale", "detail": "file sha differs from node",
                "path": path, "role": role, "line": None,
                "sha256": entry["sha"]}
    if role == "symbol":
        key = (path, anchor)
        if key not in index:
            return {"evidence": "unresolved",
                    "detail": "symbol without inventory row",
                    "path": path, "role": role, "line": None,
                    "sha256": entry["sha"]}
        s = index[key]
        if s["line"] > len(entry["lines"]) or \
                s["name"] not in entry["lines"][s["line"] - 1]:
            return {"evidence": "stale", "detail": "line no longer names %s"
                    % s["name"], "path": path, "role": role, "line": None,
                    "sha256": entry["sha"]}
        line = s["line"]
    else:
        if '"' in anchor:
            return {"evidence": "unresolved",
                    "detail": "unquotable section anchor",
                    "path": path, "role": role, "line": None,
                    "sha256": entry["sha"]}
        found = entry["text"].count('id="%s"' % anchor)
        if found == 0:
            return {"evidence": "unresolved",
                    "detail": "anchor occurs zero times",
                    "path": path, "role": role, "line": None,
                    "sha256": entry["sha"]}
        if found > 1:
            return {"evidence": "ambiguous",
                    "detail": "anchor occurs %d times" % found,
                    "path": path, "role": role, "line": None,
                    "sha256": entry["sha"]}
        line = None
    if rid not in gov:
        return {"evidence": "missing_governance",
                "detail": "id without governor",
                "path": path, "role": role, "line": line,
                "sha256": entry["sha"]}
    return {"evidence": "ok", "detail": "", "path": path, "role": role,
            "line": line, "sha256": entry["sha"]}


def check_tie_order(rows):
    """Every equal-score run must agree under byte and natural order.

    Returns the first unverifiable run's ids, else None. A run is
    verifiable only when the observed order equals both the canonical
    byte sort and the natural sort: numeric-looking mixed ids (a2 vs
    a10) discriminate the two comparators, so such a tie cannot prove
    which comparator produced it and the record must not authorize.
    """
    i = 0
    while i < len(rows):
        j = i
        while j < len(rows) and rows[j][2] == rows[i][2]:
            j += 1
        run = [r[0] for r in rows[i:j]]
        if len(run) > 1:
            by_byte = sorted(run, key=lambda s: s.encode("utf-8"))
            by_nat = sorted(run, key=_nat_parts)
            if not (run == by_byte == by_nat):
                return run
        i = j
    return None


def check_cited_collision(corpus, rows):
    """Distinct cited ids sharing a 32-byte cutkey would merge silently."""
    buckets = {}
    for r in rows:
        buckets.setdefault(cutkey(corpus, r[0]), []).append(r[0])
    for key in sorted(buckets):
        group = sorted(set(buckets[key]))
        if len(group) > 1:
            return group
    return None


def blank_record():
    return {"schema": SCHEMA, "version": 1, "tool": VERSION,
            "corpus": CORPUS_DEFAULT, "outcome": "refused",
            "actionable": False, "reason": "bad_input", "ix": None,
            "pr": None, "q": None, "intent": None, "profile": None,
            "router": None, "router_exit": None, "abstain": None,
            "overflow": None, "rows": [], "errors": []}


def resolve_run(root, shortlist_path, nodes_path, lookup_path, symbols_path,
                gov_path, index_dir, params_path, corpus=CORPUS_DEFAULT,
                router_exit=None):
    """Resolve a shortlist to a web resolution record (never raises)."""
    rec = blank_record()
    rec["corpus"] = corpus
    rec["router_exit"] = router_exit
    try:
        short = load_shortlist(shortlist_path)
    except WebError as e:
        rec["errors"] = [str(e)]
        return rec
    rec["ix"] = short["ix"]
    rec["pr"] = short["pr"]
    rec["q"] = short["q"]
    rec["intent"] = short["intent"]
    rec["router"] = short["router"]
    rec["abstain"] = short["abstain"]
    rec["overflow"] = short.get("overflow") is True
    try:
        ix16 = load_index_id(index_dir)
    except WebError as e:
        rec["reason"] = "bad_input"
        rec["errors"] = [str(e)]
        return rec
    if ix16 != short["ix"]:
        rec["reason"] = "ix_mismatch"
        rec["errors"] = ["E_IX shortlist ix %s != index %s"
                         % (short["ix"], ix16)]
        return rec
    try:
        profile, pr = load_params(params_path)
    except WebError as e:
        rec["reason"] = "bad_input"
        rec["errors"] = [str(e)]
        return rec
    if pr != short["pr"]:
        rec["reason"] = "pr_mismatch"
        rec["errors"] = ["E_PR shortlist pr %s != params %s"
                         % (short["pr"], pr)]
        return rec
    rec["profile"] = profile
    try:
        nodes = load_nodes(nodes_path, corpus)
        lookup = load_lookup(lookup_path)
        symbols = load_symbols(symbols_path)
        gov = load_governance(gov_path, corpus)
        by_id = check_identity(corpus, nodes, lookup)
    except WebError as e:
        rec["reason"] = "bad_input"
        rec["errors"] = [str(e)]
        return rec
    lookup_path_of = {i: p for i, p in lookup}
    index = {(s["path"], s["symbol"]): s for s in symbols}
    srows = short["r"]
    rec["outcome"] = "resolved"
    if short["abstain"]["flag"]:
        rec["reason"] = "abstained"
    elif short.get("overflow") is True:
        rec["reason"] = "overflow"
    elif short["abstain"]["reason"] == "uncalibrated":
        rec["reason"] = "uncalibrated"
    elif not srows:
        rec["reason"] = "empty"
        rec["errors"] = ["E_EMPTY no rows outside abstention"]
        return rec
    else:
        bad_run = check_tie_order(srows)
        if bad_run is not None:
            rec["reason"] = "tie_order"
            rec["errors"] = ["E_TIE_ORDER %s" % ",".join(bad_run)]
        elif len({(r[0], r[1]) for r in srows}) != len(srows):
            rec["reason"] = "ambiguous"
            rec["errors"] = ["E_AMBIGUOUS duplicate shortlist row"]
        else:
            group = check_cited_collision(corpus, srows)
            if group is not None:
                rec["reason"] = "collision"
                rec["errors"] = ["E_COLLISION %s" % ",".join(group)]
            else:
                rec["reason"] = "ok"
    out_rows = []
    cache = {}
    first_bad = None
    for rid, anchor, score, *rest in srows:
        hit = resolve_row(corpus, rid, anchor, by_id, lookup_path_of,
                          index, gov, root, cache)
        bound = {"id": rid, "anchor": anchor, "score": score,
                 "key": "%s:%s" % (corpus, rid), "path": hit["path"],
                 "role": hit["role"],
                 "governor": gov.get(rid),
                 "line": hit["line"], "sha256": hit["sha256"],
                 "evidence": hit["evidence"]}
        if rest:
            bound["why"] = rest[0]
        if hit["detail"]:
            bound["detail"] = hit["detail"]
        out_rows.append(bound)
        if first_bad is None and hit["evidence"] != "ok":
            first_bad = hit["evidence"]
    rec["rows"] = out_rows
    if rec["reason"] == "ok" and first_bad is not None:
        rec["reason"] = first_bad
        rec["errors"] = ["E_%s first failing row: %s"
                         % (first_bad.upper(),
                            out_rows[[b["evidence"] for b in out_rows]
                                     .index(first_bad)]["id"])]
    rec["actionable"] = rec["reason"] == "ok"
    return rec


# ---- wrap: typed process outcome, original exit retained, no fake rows ----

def wrap_run(exit_code, error, root=None, shortlist_path=None,
             nodes_path=None, lookup_path=None, symbols_path=None,
             gov_path=None, index_dir=None, params_path=None,
             corpus=CORPUS_DEFAULT):
    """Publish a router process outcome as a web record (never raises)."""
    if exit_code != 0:
        rec = blank_record()
        rec["corpus"] = corpus
        rec["router_exit"] = exit_code
        rec["reason"] = EXIT_REASON.get(exit_code,
                                        "engine_exit_%d" % exit_code)
        rec["errors"] = [error] if error else []
        return rec
    return resolve_run(root, shortlist_path, nodes_path, lookup_path,
                       symbols_path, gov_path, index_dir, params_path,
                       corpus=corpus, router_exit=0)


# ---- authorize: the only editing gate ----

def authorizes_edit(rec):
    """True only for a consistent fully ok record with ok rows.

    Re-validates the retained engine evidence (no abstention, no
    overflow, calibrated reason, well-formed identity) so flipping the
    actionable flag alone can never authorize. Freshness is proven by
    re-running resolve at decision time, not by this check.
    """
    if not isinstance(rec, dict):
        return False
    if rec.get("schema") != SCHEMA or rec.get("version") != 1:
        return False
    if rec.get("outcome") != "resolved":
        return False
    if rec.get("actionable") is not True:
        return False
    if rec.get("reason") != "ok":
        return False
    if rec.get("overflow") is not False:
        return False
    for k in ("ix", "pr", "q"):
        if not is_hex16(rec.get(k)):
            return False
    if rec.get("intent") not in INTENTS:
        return False
    if not isinstance(rec.get("router"), str) or \
            not ROUTER_RE.match(rec["router"]):
        return False
    if rec.get("profile") not in PROFILES:
        return False
    ab = rec.get("abstain")
    if not isinstance(ab, dict) or ab.get("flag") is not False or \
            ab.get("reason") not in ("none", "exact_id"):
        return False
    rows = rec.get("rows")
    if not isinstance(rows, list) or not rows:
        return False
    return all(isinstance(r, dict) and r.get("evidence") == "ok"
               for r in rows)


def authorize_run(record_path):
    try:
        raw = readb(record_path)
    except OSError:
        return None, "E_INPUT record unreadable"
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return None, "E_DECODE record not UTF-8"
    if "\0" in text:
        return None, "E_DECODE record: NUL byte"
    try:
        rec = json.loads(text)
    except ValueError:
        return None, "E_RECORD record: bad JSON"
    if not isinstance(rec, dict) or rec.get("schema") != SCHEMA:
        return None, "E_SCHEMA not a %s record" % SCHEMA
    return rec, None


def _write_out(path, blob):
    try:
        with open(path, "wb") as f:
            f.write(blob)
    except OSError as e:
        print("router_web.py: cannot write --out: %s" % e, file=sys.stderr)
        return False
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(prog="router_web.py")
    sub = ap.add_subparsers(dest="cmd")
    r = sub.add_parser("resolve", help="shortlist to resolution record")
    r.add_argument("--root", required=True)
    r.add_argument("--shortlist", required=True)
    r.add_argument("--nodes", required=True)
    r.add_argument("--lookup", required=True)
    r.add_argument("--symbols", required=True)
    r.add_argument("--governance", required=True)
    r.add_argument("--index", required=True)
    r.add_argument("--params", required=True)
    r.add_argument("--corpus", default=CORPUS_DEFAULT)
    r.add_argument("--out", default=None)
    w = sub.add_parser("wrap", help="router process outcome to record")
    w.add_argument("--exit", required=True, type=int)
    w.add_argument("--error", default=None)
    w.add_argument("--root", default=None)
    w.add_argument("--shortlist", default=None)
    w.add_argument("--nodes", default=None)
    w.add_argument("--lookup", default=None)
    w.add_argument("--symbols", default=None)
    w.add_argument("--governance", default=None)
    w.add_argument("--index", default=None)
    w.add_argument("--params", default=None)
    w.add_argument("--corpus", default=CORPUS_DEFAULT)
    w.add_argument("--out", default=None)
    z = sub.add_parser("authorize", help="check a record authorizes editing")
    z.add_argument("--record", required=True)
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if a.cmd == "authorize":
        rec, err = authorize_run(a.record)
        if err is not None:
            verdict = {"schema": SCHEMA, "tool": VERSION,
                       "authorizes": False, "reason": "bad_record",
                       "errors": [err]}
            sys.stdout.write(canon(verdict).decode("utf-8"))
            return 2
        ok = authorizes_edit(rec)
        verdict = {"schema": SCHEMA, "tool": VERSION, "authorizes": ok,
                   "reason": rec.get("reason"), "errors": []}
        sys.stdout.write(canon(verdict).decode("utf-8"))
        return 0 if ok else 4
    if a.cmd == "wrap":
        if a.error is not None and (len(a.error) > 200 or "\n" in a.error
                                    or "\0" in a.error):
            print("router_web.py: --error at most 200 chars, one line",
                  file=sys.stderr)
            return 2
        if a.exit != 0 and a.shortlist is not None:
            print("router_web.py: --shortlist contradicts a failed exit",
                  file=sys.stderr)
            return 2
        if a.exit == 0:
            need = ("root", "shortlist", "nodes", "lookup", "symbols",
                    "governance", "index", "params")
            missing = [k for k in need if getattr(a, k) is None]
            if missing:
                print("router_web.py: exit 0 needs %s"
                      % " ".join("--" + k for k in missing),
                      file=sys.stderr)
                return 2
        if not is_corpus(a.corpus):
            print("router_web.py: bad --corpus", file=sys.stderr)
            return 2
        if a.exit == 0 and not os.path.isdir(a.root):
            print("router_web.py: root is not a directory", file=sys.stderr)
            return 2
        rec = wrap_run(a.exit, a.error, a.root, a.shortlist, a.nodes,
                       a.lookup, a.symbols, a.governance, a.index,
                       a.params, corpus=a.corpus)
        blob = canon(rec)
        sys.stdout.write(blob.decode("utf-8"))
        if a.out and not _write_out(a.out, blob):
            return 2
        return 0 if rec["actionable"] else 4
    if a.cmd != "resolve":
        print("router_web.py: need resolve, wrap or authorize",
              file=sys.stderr)
        return 2
    if not is_corpus(a.corpus):
        print("router_web.py: bad --corpus", file=sys.stderr)
        return 2
    if not os.path.isdir(a.root):
        print("router_web.py: root is not a directory", file=sys.stderr)
        return 2
    rec = resolve_run(a.root, a.shortlist, a.nodes, a.lookup, a.symbols,
                      a.governance, a.index, a.params, corpus=a.corpus)
    blob = canon(rec)
    sys.stdout.write(blob.decode("utf-8"))
    if a.out and not _write_out(a.out, blob):
        return 2
    return 0 if rec["actionable"] else 4


if __name__ == "__main__":
    sys.exit(main())

