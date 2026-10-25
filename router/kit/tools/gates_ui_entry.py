#!/usr/bin/env python3
"""W0-ENTRY publication qualification for the UI router entry plane.

Implements the four normative-but-unwritten gates of paper section 2.8
(g_tier1, g_protocol, g_digest, g_offline) for one complete single-corpus
local mount: Tier-1 token caps proved by an external out-of-band o200k_base
count file, semantic protocol plus lookup coverage, index digest shape plus
density proof, and a static offline audit of the entry-path core. Offline,
deterministic, Python 3 stdlib only. Exit 0 pass, 4 refuse, 2 usage.

Token counts are never computed here and never approximated: every cap is
checked against a content-bound count (path, sha256, tokens) measured by the
external pinned tokenizer. A missing tokenizer, a missing count, or a stale
hash is FAIL, never SKIP.
"""
import argparse
import ast
import hashlib
import json
import os
import re
import sys

SCHEMA = "ctx.gates-ui-entry.v1"
VERSION = "gates_ui_entry.py/1.0"
TOKENIZER_SCHEMA = "ctx.tokenizer-counts.v1"
TOKENIZER_NAME = "o200k_base"

CAPS = {"llms.txt": 150, "catalogue/protocol.json": 600,
        "AGENTS.md": 1500, "README.md": 1000}
TIER1 = tuple(CAPS)
DIGEST_CAP = 80
DIGEST_KEYS = ("g", "i", "id", "o", "p", "t")

ANSWER_SCHEMA = "ctx.shortlist.v2"
PATH_RULE = "lookup:catalogue/routes.tsv"
PARAMS = "catalogue/router/params.json"
PROTOCOL_SCHEMA = "ctx.protocol.v2"

CORE_FILES = ("route_v2.py", "build_index_v2.py", "blocks.py",
              "jsonschema_lite.py", "gates_ui_entry.py")

FORBIDDEN_TOP = {
    "socket", "ssl", "http", "urllib", "urllib3", "ftplib", "smtplib",
    "poplib", "imaplib", "telnetlib", "xmlrpc", "socketserver", "webbrowser",
    "subprocess", "multiprocessing", "openai", "anthropic", "transformers",
    "torch", "tensorflow", "keras", "jax", "onnxruntime", "tiktoken",
    "tokenizers", "sentencepiece", "requests", "httpx", "aiohttp",
}
CALL_ROOTS = FORBIDDEN_TOP | {"os"}
CALL_ATTRS = {
    "system", "popen", "execv", "execve", "execl", "execle", "execlp",
    "execvp", "execvpe", "posix_spawn", "posix_spawnp", "spawnl", "spawnle",
    "spawnlp", "spawnlpe", "spawnv", "spawnve", "spawnvp", "spawnvpe",
    "urlopen", "urlretrieve", "getaddrinfo", "create_connection",
}

ISO = re.compile(r"\b20\d\d-\d\d-\d\dT\d\d:\d\d|\bpid[ =:]\d+|"
                 r"\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,? \d{1,2} "
                 r"[A-Z][a-z]{2} 20\d\d", re.I)
SECRET = re.compile(r"/home/[a-z0-9_]+|/Users/[A-Za-z0-9_]+|C:\\Users|"
                    r"\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b|"
                    r"(?:api[_-]?key|secret|passwd|password|token)"
                    r"\s*[=:]\s*\S{8,}|-----BEGIN [A-Z ]*PRIVATE KEY|"
                    r"\bsk-[A-Za-z0-9]{20,}", re.I)
PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")
PLACEHOLDER_OK = {"id", "subject_id", "page"}
CORPUS = re.compile(r"^[a-z][a-z0-9_]{0,15}$")
SHA = re.compile(r"^[0-9a-f]{64}$")


class TokenizerError(Exception):
    def __init__(self, code, detail=""):
        super().__init__("%s %s" % (code, detail))
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


def _is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def _inside(root, rel):
    """True when rel is a portable relative path staying inside root."""
    if not rel or os.path.isabs(rel) or "\\" in rel:
        return False
    parts = rel.split("/")
    if not all(parts) or ".." in parts:
        return False
    base = os.path.abspath(root)
    return os.path.abspath(os.path.join(base, rel)).startswith(base + os.sep)


def load_counts(path):
    """Load the external pinned tokenizer count file (strict schema)."""
    if not path or not os.path.isfile(path):
        raise TokenizerError("E_TOKENIZER_ABSENT", str(path or "no file"))
    try:
        doc = json.loads(readb(path).decode("utf-8"))
    except ValueError as e:
        raise TokenizerError("E_TOKENIZER_INVALID", "not JSON: %s" % e)
    if not isinstance(doc, dict):
        raise TokenizerError("E_TOKENIZER_INVALID", "top must be an object")
    for k in sorted(doc):
        if k not in ("schema", "tokenizer", "pin", "counts"):
            raise TokenizerError("E_TOKENIZER_INVALID", "additional %s" % k)
    for k in ("schema", "tokenizer", "pin", "counts"):
        if k not in doc:
            raise TokenizerError("E_TOKENIZER_INVALID", "required %s" % k)
    if doc["schema"] != TOKENIZER_SCHEMA:
        raise TokenizerError("E_TOKENIZER_INVALID", "schema const")
    if doc["tokenizer"] != TOKENIZER_NAME:
        raise TokenizerError("E_TOKENIZER_INVALID", "tokenizer const")
    if not isinstance(doc["pin"], str) or not doc["pin"]:
        raise TokenizerError("E_TOKENIZER_INVALID", "pin must be nonempty")
    if not isinstance(doc["counts"], list):
        raise TokenizerError("E_TOKENIZER_INVALID", "counts must be a list")
    out = {}
    for n, e in enumerate(doc["counts"]):
        where = "counts[%d]" % n
        if not isinstance(e, dict):
            raise TokenizerError("E_TOKENIZER_INVALID", where + " object")
        for k in sorted(e):
            if k not in ("path", "sha256", "tokens"):
                raise TokenizerError("E_TOKENIZER_INVALID",
                                     where + " additional %s" % k)
        for k in ("path", "sha256", "tokens"):
            if k not in e:
                raise TokenizerError("E_TOKENIZER_INVALID",
                                     where + " required %s" % k)
        if not isinstance(e["path"], str) or not e["path"]:
            raise TokenizerError("E_TOKENIZER_INVALID", where + " path")
        if not isinstance(e["sha256"], str) or not SHA.match(e["sha256"]):
            raise TokenizerError("E_TOKENIZER_INVALID", where + " sha256")
        if not _is_int(e["tokens"]) or e["tokens"] < 0:
            raise TokenizerError("E_TOKENIZER_INVALID", where + " tokens")
        if e["path"] in out:
            raise TokenizerError("E_TOKENIZER_INVALID",
                                 "duplicate %s" % e["path"])
        out[e["path"]] = e
    return out


def verified_tokens(counts, key, blob):
    """Bound (path, sha256, tokens) triple or a coverage/staleness error."""
    e = (counts or {}).get(key)
    if e is None:
        return None, "E_TOKENIZER_COVERAGE %s" % key
    if e["sha256"] != sha(blob):
        return None, "E_TOKENIZER_STALE %s" % key
    return e["tokens"], None


def check_tier1(root, counts):
    errs, toks = [], {}
    for rel in TIER1:
        p = os.path.join(root, rel)
        if not os.path.isfile(p):
            errs.append("E_TIER1_MISSING %s" % rel)
            continue
        blob = readb(p)
        txt = blob.decode("utf-8", errors="replace")
        m = ISO.search(txt)
        if m:
            errs.append("E_TIER1_VOLATILE %s" % rel)
        if SECRET.search(txt):
            errs.append("E_TIER1_SECRET %s" % rel)
        n, err = verified_tokens(counts, rel, blob)
        if err:
            errs.append(err)
            continue
        toks[rel] = n
        if n > CAPS[rel]:
            errs.append("E_TIER1_TOKENS %s %d > %d" % (rel, n, CAPS[rel]))
    return errs, {"files": len(TIER1), "tokens": toks}


def _need_dict(doc, key, errs, tag):
    v = doc.get(key)
    if not isinstance(v, dict):
        errs.append("%s %s object" % (tag, key))
        return None
    return v


def check_protocol(root, index):
    errs = []
    info = {"mounts": 0, "lookup_rows": 0, "lookup_shape": "none"}
    pp = os.path.join(root, "catalogue", "protocol.json")
    try:
        blob = readb(pp)
        doc = json.loads(blob.decode("utf-8"))
    except (OSError, ValueError):
        return ["E_PROTOCOL_SCHEMA catalogue/protocol.json unreadable"], info
    if not isinstance(doc, dict):
        return ["E_PROTOCOL_SCHEMA $ object"], info
    for k in sorted(doc):
        if k not in ("schema", "router", "mounts"):
            errs.append("E_PROTOCOL_SCHEMA $: additional %s" % k)
    for k in ("schema", "router"):
        if k not in doc:
            errs.append("E_PROTOCOL_SCHEMA $: required %s" % k)
    if doc.get("schema") != PROTOCOL_SCHEMA:
        errs.append("E_PROTOCOL_SCHEMA $.schema const")
    router = _need_dict(doc, "router", errs, "E_PROTOCOL_SCHEMA $.router")
    if router is not None:
        for k in sorted(router):
            if k not in ("answer_schema", "path_rule", "params"):
                errs.append("E_PROTOCOL_SCHEMA $.router: additional %s" % k)
        for k in ("answer_schema", "path_rule", "params"):
            if k not in router:
                errs.append("E_PROTOCOL_SCHEMA $.router: required %s" % k)
        if router.get("answer_schema") != ANSWER_SCHEMA:
            errs.append("E_PROTOCOL_SCHEMA $.router.answer_schema const")
        if router.get("path_rule") != PATH_RULE:
            errs.append("E_PROTOCOL_SCHEMA $.router.path_rule const")
        if router.get("params") != PARAMS:
            errs.append("E_PROTOCOL_SCHEMA $.router.params const")
    mounts = doc.get("mounts")
    if not isinstance(mounts, list) or not mounts:
        errs.append("E_PROTOCOL_SEMANTIC mounts non-empty")
        mounts = []
    info["mounts"] = len(mounts)
    if len(mounts) != 1:
        errs.append("E_PROTOCOL_MOUNT_COUNT %d != 1 single-corpus" % len(mounts))
    pris = [m.get("priority") for m in mounts if isinstance(m, dict)]
    if len(set(pris)) != len(pris):
        errs.append("E_PROTOCOL_PRIORITY duplicate")
    first = mounts[0] if mounts and isinstance(mounts[0], dict) else None
    if mounts and first is None:
        errs.append("E_PROTOCOL_SCHEMA $.mounts[0] object")
    if first is not None:
        for k in sorted(first):
            if k not in ("corpus", "path", "priority"):
                errs.append("E_PROTOCOL_SCHEMA $.mounts[0]: additional %s" % k)
        for k in ("corpus", "path", "priority"):
            if k not in first:
                errs.append("E_PROTOCOL_SCHEMA $.mounts[0]: required %s" % k)
        if not isinstance(first.get("corpus"), str) or \
                not CORPUS.match(first.get("corpus") or ""):
            errs.append("E_PROTOCOL_SCHEMA $.mounts[0].corpus pattern")
        mp = first.get("path")
        if not isinstance(mp, str) or not _inside(root, mp):
            errs.append("E_PROTOCOL_SCHEMA $.mounts[0].path relative")
        elif os.path.abspath(os.path.join(root, mp)) != os.path.abspath(index):
            errs.append("E_PROTOCOL_SEMANTIC mount path != index")
        if not _is_int(first.get("priority")) or first["priority"] < 0:
            errs.append("E_PROTOCOL_SCHEMA $.mounts[0].priority minimum")
    man_corpus = None
    try:
        man = json.loads(readb(os.path.join(index, "manifest.json"))
                         .decode("utf-8"))
        man_corpus = man.get("corpus") if isinstance(man, dict) else None
    except (OSError, ValueError):
        errs.append("E_PROTOCOL_SEMANTIC index manifest unreadable")
    if first is not None and man_corpus is not None and \
            first.get("corpus") != man_corpus:
        errs.append("E_PROTOCOL_SEMANTIC corpus != manifest")
    try:
        cols = json.loads(readb(os.path.join(index, "cols.json"))
                          .decode("utf-8"))
        ids = cols.get("id") if isinstance(cols, dict) else None
    except (OSError, ValueError):
        cols, ids = None, None
    if not isinstance(ids, list) or not ids or \
            any(not isinstance(x, str) for x in ids):
        errs.append("E_PROTOCOL_LOOKUP cols id list unreadable")
        ids = None
    lpath = os.path.join(root, "catalogue", "routes.tsv")
    if not os.path.isfile(lpath):
        errs.append("E_PROTOCOL_LOOKUP catalogue/routes.tsv missing")
    elif ids is not None:
        errs += check_lookup(root, lpath, ids, info)
    for rel in ("llms.txt", "AGENTS.md"):
        p = os.path.join(root, rel)
        if not os.path.isfile(p):
            continue
        for tok in sorted(set(PLACEHOLDER.findall(
                readb(p).decode("utf-8", errors="replace")))):
            if tok not in PLACEHOLDER_OK:
                errs.append("E_PROTOCOL_PLACEHOLDER %s {%s}" % (rel, tok))
    lp = os.path.join(root, "llms.txt")
    if os.path.isfile(lp):
        ladder = readb(lp).decode("utf-8", errors="replace")
        if "route_v2.py" not in ladder and "subjects.json" not in ladder:
            errs.append("E_PROTOCOL_LADDER llms.txt names no L2 mechanism")
    return errs, info


def check_lookup(root, lpath, ids, info):
    errs = []
    raw = readb(lpath).decode("utf-8", errors="strict") \
        if _decodable(lpath) else None
    if raw is None:
        return ["E_PROTOCOL_LOOKUP catalogue/routes.tsv not UTF-8"]
    text = raw[:-1] if raw.endswith("\n") else raw
    rows = text.split("\n") if text else []
    if any(r == "" for r in rows):
        return ["E_PROTOCOL_LOOKUP blank line"]
    if rows and rows[0].split("\t")[0] == "id":
        rows = rows[1:]
    parsed = [r.split("\t") for r in rows]
    if parsed and any(len(r) != len(parsed[0]) for r in parsed):
        return ["E_PROTOCOL_LOOKUP mixed arity"]
    arity = len(parsed[0]) if parsed else 0
    if arity not in (2, 4):
        return ["E_PROTOCOL_LOOKUP arity %d != 2|4" % arity]
    info["lookup_shape"] = "generic" if arity == 2 else "paper"
    seen, have = set(), []
    for r in parsed:
        rid = r[0]
        if not rid:
            errs.append("E_PROTOCOL_LOOKUP empty id")
            continue
        if rid in seen:
            errs.append("E_PROTOCOL_LOOKUP duplicate row %s" % rid)
            continue
        seen.add(rid)
        have.append(rid)
        paths = [r[1]] if arity == 2 else [r[2], r[3]]
        if arity == 4 and not r[1]:
            errs.append("E_PROTOCOL_LOOKUP %s empty subject" % rid)
        for q in paths:
            if not _inside(root, q):
                errs.append("E_PROTOCOL_LOOKUP %s bad path" % rid)
            elif not os.path.isfile(os.path.join(root, q)):
                errs.append("E_PROTOCOL_LOOKUP %s no file" % rid)
    info["lookup_rows"] = len(have)
    want = set(ids)
    for rid in sorted(want - seen):
        errs.append("E_PROTOCOL_LOOKUP missing row %s" % rid)
    for rid in sorted(seen - want):
        errs.append("E_PROTOCOL_LOOKUP dangling row %s" % rid)
    return errs


def _decodable(p):
    try:
        readb(p).decode("utf-8")
        return True
    except ValueError:
        return False


def check_digest(index, counts):
    errs = []
    info = {"nodes": 0, "shards": 0, "max_tokens": 0, "total_tokens": 0}
    try:
        cols = json.loads(readb(os.path.join(index, "cols.json"))
                          .decode("utf-8"))
        ids = cols.get("id") if isinstance(cols, dict) else None
    except (OSError, ValueError):
        return ["E_DIGEST_INDEX cols unreadable"], info
    if not isinstance(ids, list) or not ids or \
            any(not isinstance(x, str) for x in ids):
        return ["E_DIGEST_INDEX cols id list invalid"], info
    info["nodes"] = len(ids)
    nshard = (len(ids) + 255) // 256
    info["shards"] = nshard
    seen = set()
    maxt, total = 0, 0
    for s in range(nshard):
        dp = os.path.join(index, "digest", "%d.jsonl" % s)
        if not os.path.isfile(dp):
            errs.append("E_DIGEST_COVERAGE shard %d missing" % s)
            continue
        blob = readb(dp)
        lines = blob.split(b"\n")
        if lines and lines[-1] == b"":
            lines = lines[:-1]
        for k, lb in enumerate(lines):
            i = s * 256 + k
            try:
                rec = json.loads(lb.decode("utf-8"))
            except ValueError:
                errs.append("E_DIGEST_SHAPE %d:%d not JSON" % (s, k))
                continue
            if not isinstance(rec, dict):
                errs.append("E_DIGEST_SHAPE %d:%d object" % (s, k))
                continue
            for kk in sorted(rec):
                if kk not in DIGEST_KEYS:
                    errs.append("E_DIGEST_SHAPE %d:%d additional %s"
                                % (s, k, kk))
            for kk in DIGEST_KEYS:
                if kk not in rec:
                    errs.append("E_DIGEST_SHAPE %d:%d required %s" % (s, k, kk))
            rid = rec.get("id")
            if rid in seen:
                errs.append("E_DIGEST_COVERAGE duplicate %s" % rid)
                continue
            if isinstance(rid, str):
                seen.add(rid)
            if rec.get("i") != i:
                errs.append("E_DIGEST_SHAPE %s dense %s != %d"
                            % (rid, rec.get("i"), i))
            if i < len(ids) and rid != ids[i]:
                errs.append("E_DIGEST_COVERAGE %s != cols[%d]" % (rid, i))
            if not isinstance(rec.get("t"), str):
                errs.append("E_DIGEST_SHAPE %s t str" % rid)
            p = rec.get("p")
            if not isinstance(p, str) or len(p) > 300:
                errs.append("E_DIGEST_SHAPE %s p <=300 chars" % rid)
            o = rec.get("o")
            if not isinstance(o, list) or len(o) > 2 or \
                    any(not isinstance(x, str) or len(x) > 200 for x in o):
                errs.append("E_DIGEST_SHAPE %s o <=2x200 chars" % rid)
            g = rec.get("g")
            if not isinstance(g, list) or len(g) > 6 or \
                    any(not isinstance(x, str) for x in g):
                errs.append("E_DIGEST_SHAPE %s g <=6" % rid)
            if not isinstance(rid, str) or not rid:
                continue
            n, err = verified_tokens(counts, "digest:" + rid, lb)
            if err:
                errs.append(err)
                continue
            maxt = max(maxt, n)
            total += n
            if n > DIGEST_CAP:
                errs.append("E_DIGEST_TOKENS %s %d > %d" % (rid, n, DIGEST_CAP))
    for rid in sorted(set(ids) - seen):
        errs.append("E_DIGEST_COVERAGE missing line %s" % rid)
    for rid in sorted(seen - set(ids)):
        errs.append("E_DIGEST_COVERAGE dangling line %s" % rid)
    info["max_tokens"] = maxt
    info["total_tokens"] = total
    return errs, info


def _call_root(func):
    v = func.value
    while isinstance(v, ast.Attribute):
        v = v.value
    return v.id if isinstance(v, ast.Name) else ""


def check_offline(tools_dir):
    errs, scanned = [], 0
    for rel in CORE_FILES:
        p = os.path.join(tools_dir, rel)
        if not os.path.isfile(p):
            errs.append("E_OFFLINE_MISSING %s" % rel)
            continue
        try:
            tree = ast.parse(readb(p).decode("utf-8"), filename=rel)
        except (ValueError, SyntaxError):
            errs.append("E_OFFLINE_INVALID %s syntax" % rel)
            continue
        scanned += 1
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                for a in n.names:
                    top = (a.name or "").split(".")[0]
                    if top in FORBIDDEN_TOP:
                        errs.append("E_OFFLINE_IMPORT %s:%d %s"
                                    % (rel, n.lineno, a.name))
            elif isinstance(n, ast.ImportFrom):
                if n.level == 0 and (n.module or "").split(".")[0] \
                        in FORBIDDEN_TOP:
                    errs.append("E_OFFLINE_IMPORT %s:%d %s"
                                % (rel, n.lineno, n.module))
            elif isinstance(n, ast.Call) and \
                    isinstance(n.func, ast.Attribute):
                if _call_root(n.func) in CALL_ROOTS and \
                        n.func.attr in CALL_ATTRS:
                    errs.append("E_OFFLINE_CALL %s:%d %s.%s"
                                % (rel, n.lineno, _call_root(n.func),
                                   n.func.attr))
    return errs, {"scanned": scanned}


def check(root, index, tokenizer, tools_dir):
    try:
        counts = load_counts(tokenizer)
        terrs = []
    except TokenizerError as e:
        counts, terrs = None, [str(e).strip()]
    e1, c1 = check_tier1(root, counts)
    e2, c2 = check_protocol(root, index)
    e3, c3 = check_digest(index, counts)
    e4, c4 = check_offline(tools_dir)
    errs = sorted(terrs + e1 + e2 + e3 + e4)
    return {
        "schema": SCHEMA,
        "tool": VERSION,
        "pass": not errs,
        "errors": errs,
        "checked": {
            "tokenizer": TOKENIZER_NAME,
            "tier1": c1,
            "protocol": c2,
            "digest": c3,
            "offline": c4,
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(prog="gates_ui_entry.py")
    ap.add_argument("--root", required=True)
    ap.add_argument("--index", default=None)
    ap.add_argument("--tokenizer", default=None)
    ap.add_argument("--tools", default=None)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", default=None)
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if not a.check:
        print("gates_ui_entry.py: --check required", file=sys.stderr)
        return 2
    root = a.root
    index = a.index or os.path.join(root, "catalogue", "router")
    tools_dir = a.tools or os.path.dirname(os.path.abspath(__file__))
    rec = check(root, index, a.tokenizer, tools_dir)
    blob = canon(rec)
    sys.stdout.write(blob.decode("utf-8"))
    if a.out:
        try:
            with open(a.out, "wb") as f:
                f.write(blob)
        except OSError as e:
            print("gates_ui_entry.py: cannot write --out: %s" % e,
                  file=sys.stderr)
            return 2
    return 0 if rec["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
