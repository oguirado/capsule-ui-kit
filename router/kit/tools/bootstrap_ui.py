#!/usr/bin/env python3
"""W0-KIT bootstrap integrity for the UI router kit.

Validates a kit root against allowlisted paths only (never a repo scan):
vendored hashes, bootstrap notices, and an externalized privacy policy that is
also applied to the allowlisted sources. Offline, deterministic, stdlib
only. Exit 0 pass, 4 refuse, 2 usage.
"""
import argparse
import hashlib
import json
import os
import re
import sys

SCHEMA = "ctx.bootstrap-ui.v1"
POLICY_SCHEMA = "ctx.privacy-policy.v1"
MANIFEST = "vendor_manifest.json"
VERSION = "bootstrap_ui.py/1.0"

# Explicit allowlists. No glob, no walk, no recursive scan at runtime.
# tools/bootstrap_ui.py carries the policy template patterns, so the content
# scan excludes it; the vendor hash still pins every helper byte.
SELF = "tools/bootstrap_ui.py"
RUNTIME_TOOLS = (
    "tools/blocks.py",
    "tools/build_index_v2.py",
    "tools/census.py",
    "tools/dev_overlap_check.py",
    "tools/eval_v2.py",
    "tools/gates_v2.py",
    "tools/jsonschema_lite.py",
    "tools/make_pool_v2.py",
    "tools/merge_logs.py",
    "tools/null_edges.py",
    "tools/route_v2.py",
    "tools/thes_check.py",
    "tools/tune_v2.py",
    "tools/bootstrap_ui.py",
)
RELOCATED_TESTS = (
    "tests/common.py",
    "tests/test_T0_freeze.py",
    "tests/test_T1_blocks.py",
    "tests/test_T5_pool.py",
    "tests/test_T6_eval.py",
    "tests/test_T7_null.py",
    "tests/test_T8_tune.py",
)

# Site-specific deny-list terms live only in the external unpublished policy
# file; the loaded patterns are matched against these committed sources.
POLICY_SCAN_FILES = tuple(
    [t for t in RUNTIME_TOOLS if t != SELF] + list(RELOCATED_TESTS)
)

POLICY_TEMPLATE = {
    "schema": POLICY_SCHEMA,
    "version": 1,
    "patterns": [
        "/home/[a-z0-9_]+",
        "/Users/[A-Za-z0-9_]+",
        "C:\\\\Users",
        "[\\w.+-]+@[\\w-]+\\.[a-z]{2,}",
        "(?:api[_-]?key|secret|passwd|password|token)\\s*[=:]\\s*\\S{8,}",
        "-----BEGIN [A-Z ]*PRIVATE KEY",
        "\\bsk-[A-Za-z0-9]{20,}",
    ],
    "note": "Unpublished local overlay may append site-specific names; never commit them.",
}


class PolicyError(Exception):
    def __init__(self, code, detail=""):
        super().__init__("%s %s" % (code, detail))
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


def find_embedded(root, patterns, files=None):
    """Policy patterns matched in allowlisted committed sources (matched text is never printed)."""
    errs = []
    for rel in sorted(files or POLICY_SCAN_FILES):
        p = os.path.join(root, rel)
        if not os.path.isfile(p):
            continue
        text = readb(p).decode("utf-8", errors="replace")
        for n, line in enumerate(text.split("\n"), 1):
            for i, rx in enumerate(patterns):
                if rx.search(line):
                    errs.append("E_POLICY_EMBEDDED %s:%d pattern %d" % (rel, n, i))
                    break
    return errs


def load_policy(path):
    """Load and compile the external unpublished deny-list policy."""
    if not path or not os.path.isfile(path):
        raise PolicyError("E_POLICY_ABSENT", str(path or "no policy supplied"))
    try:
        doc = json.loads(readb(path).decode("utf-8"))
    except ValueError as e:
        raise PolicyError("E_POLICY_INVALID", "not JSON: %s" % e)
    if not isinstance(doc, dict) or doc.get("schema") != POLICY_SCHEMA:
        raise PolicyError("E_POLICY_INVALID", "schema != %s" % POLICY_SCHEMA)
    pats = doc.get("patterns")
    if not isinstance(pats, list) or not pats or any(not isinstance(x, str) or not x for x in pats):
        raise PolicyError("E_POLICY_INVALID", "patterns must be a non-empty string list")
    try:
        return [re.compile(x, re.I) for x in pats]
    except re.error as e:
        raise PolicyError("E_POLICY_INVALID", "bad regex: %s" % e)


def validate_vendor(root):
    """Every manifest-listed file exists and hashes exactly (extras allowed)."""
    errs = []
    mp = os.path.join(root, MANIFEST)
    if not os.path.isfile(mp):
        return ["E_MANIFEST %s absent" % MANIFEST]
    try:
        man = json.loads(readb(mp).decode("utf-8"))
    except ValueError as e:
        return ["E_MANIFEST %s not JSON: %s" % (MANIFEST, e)]
    if not isinstance(man, dict) or not man or any(not isinstance(k, str) for k in man):
        return ["E_MANIFEST %s must be a non-empty {path: sha256} object" % MANIFEST]
    for rel in sorted(man):
        want = man[rel]
        if not isinstance(want, str) or not re.fullmatch(r"[0-9a-f]{64}", want):
            errs.append("E_MANIFEST %s: bad sha256 for %s" % (MANIFEST, rel))
            continue
        p = os.path.join(root, rel)
        if not os.path.isfile(p):
            errs.append("E_VENDOR_MISSING %s" % rel)
        elif sha(readb(p)) != want:
            errs.append("E_VENDOR_HASH %s" % rel)
    return errs


def validate_notices(root):
    """Bootstrap receipt, frozen hashes, and gate listing are intact."""
    errs = []
    rp = os.path.join(root, "bootstrap_receipt.json")
    if not os.path.isfile(rp):
        errs.append("E_NOTICE_RECEIPT bootstrap_receipt.json absent")
    else:
        try:
            rec = json.loads(readb(rp).decode("utf-8"))
        except ValueError as e:
            errs.append("E_NOTICE_RECEIPT not JSON: %s" % e)
            rec = None
        if isinstance(rec, dict):
            for i, g in enumerate(rec.get("gates", [])):
                if not isinstance(g, dict) or g.get("rc") != 0:
                    errs.append("E_NOTICE_RECEIPT gate %d rc != 0" % i)
            if rec.get("vendor_mutant_rejected") is not True:
                errs.append("E_NOTICE_RECEIPT vendor_mutant_rejected != true")
            try:
                man = json.loads(readb(os.path.join(root, MANIFEST)).decode("utf-8"))
                if rec.get("vendor_files") != len(man):
                    errs.append("E_NOTICE_RECEIPT vendor_files != manifest entries")
            except (ValueError, OSError):
                errs.append("E_NOTICE_RECEIPT manifest unreadable")
        elif rec is not None:
            errs.append("E_NOTICE_RECEIPT must be an object")
    sp = os.path.join(root, "v1_frozen", "SHA256SUMS")
    if not os.path.isfile(sp):
        errs.append("E_NOTICE_FROZEN v1_frozen/SHA256SUMS absent")
    else:
        rows = [l for l in readb(sp).decode("utf-8").split("\n") if l.strip()]
        if not rows:
            errs.append("E_NOTICE_FROZEN v1_frozen/SHA256SUMS empty")
        for row in rows:
            m = re.match(r"^([0-9a-f]{64}) [ *](\S+)$", row.strip())
            if not m:
                errs.append("E_NOTICE_FROZEN bad row: %s" % row[:40])
                continue
            fp = os.path.join(root, m.group(2))
            if not os.path.isfile(fp):
                errs.append("E_NOTICE_FROZEN missing %s" % m.group(2))
            elif sha(readb(fp)) != m.group(1):
                errs.append("E_NOTICE_FROZEN hash %s" % m.group(2))
    gp = os.path.join(root, "gate.sh")
    if not os.path.isfile(gp):
        errs.append("E_NOTICE_GATE gate.sh absent")
    elif "test_bootstrap_ui.py" not in readb(gp).decode("utf-8", errors="replace"):
        errs.append("E_NOTICE_GATE gate.sh does not list test_bootstrap_ui.py")
    return errs


def validate_policy(root, policy_path):
    try:
        pats = load_policy(policy_path)
    except PolicyError as e:
        return ["%s %s" % (e.code, str(e).split(" ", 1)[1] if " " in str(e) else "")], 0
    return find_embedded(root, pats), len(pats)


def check(root, policy=None):
    verrs = validate_vendor(root)
    nerrs = validate_notices(root)
    perrs, npats = validate_policy(root, policy)
    try:
        man = json.loads(readb(os.path.join(root, MANIFEST)).decode("utf-8"))
        nvendor = len(man) if isinstance(man, dict) else 0
    except (ValueError, OSError):
        nvendor = 0
    errs = verrs + nerrs + perrs
    return {
        "schema": SCHEMA,
        "tool": VERSION,
        "pass": not errs,
        "errors": errs,
        "checked": {
            "policy_patterns": npats,
            "scanned": len(POLICY_SCAN_FILES),
            "vendor_files": nvendor,
        },
    }


def main(argv=None):
    ap = argparse.ArgumentParser(prog="bootstrap_ui.py")
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--policy", default=None)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--init-policy", default=None, metavar="PATH")
    ap.add_argument("--out", default=None)
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if a.init_policy:
        if os.path.exists(a.init_policy):
            print("E_POLICY_EXISTS: refusing to overwrite %s" % a.init_policy, file=sys.stderr)
            return 4
        with open(a.init_policy, "wb") as f:
            f.write(canon(POLICY_TEMPLATE))
        print("wrote %s" % a.init_policy)
        return 0
    rec = check(a.root, a.policy)
    blob = canon(rec)
    if a.out:
        with open(a.out, "wb") as f:
            f.write(blob)
    sys.stdout.write(blob.decode("utf-8"))
    return 0 if rec["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
