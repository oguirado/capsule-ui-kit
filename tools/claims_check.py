#!/usr/bin/env python3
"""Check that what the docs claim exists. Standard library only, no network.

Usage: python3 -I tools/claims_check.py [--root DIR]
Exit 0: every claim resolves. Exit 1: at least one dead claim (listed on stdout). Checks:
  1. every repository path named in backticks or code fences exists;
  2. every `npm run X` / `npm X` script named in the docs is defined in the root package.json;
  3. every `node --test FILE` and `python3 tools/X.py` command names a file that exists;
  4. every command listed in CONTRIBUTING.md appears as a package.json script or CI step.
"""
import argparse
import glob
import json
import os
import re
import sys

DOCS = ["README.md", "AGENTS.md", "llms.txt", "CONTRIBUTING.md", "SECURITY.md", "router/AGENTS.md", "router/llms.txt",
        ".github/pull_request_template.md"] + sorted(
    os.path.join("docs", n) for n in os.listdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs"))
    if n.endswith(".md"))
ROOTS = ("tools", "test", "docs", "router", "packages", "starter", ".github")
EXT = (".py", ".sh", ".md", ".json", ".yml", ".yaml", ".txt", ".toml", ".mjs")
SPAN = re.compile(r"`([^`\n]+)`")
FENCE = re.compile(r"```[^\n]*\n(.*?)```", re.S)
NPM = re.compile(r"\bnpm (?:run )?([a-z][\w:-]*)")
NPM_BUILTIN = {"ci", "install", "i", "test", "t", "start", "pack", "publish", "run", "init", "version", "audit", "exec", "view"}
NODE_TEST = re.compile(r"\bnode (?:--[\w=-]+ )*--test ((?:[\w./*-]+ ?)+)")
PYTOOL = re.compile(r"\bpython3 (?:-I )?((?:tools|router)/[\w./-]+\.py)\b")


def exists(root, p):
    p = p.rstrip("/,.;:)")
    if not p or p.startswith(("/", "~", "http", "$", "-")) or "://" in p:
        return True
    if any(c in p for c in "<>{}$"):
        p = re.split(r"[<>{}$]", p)[0].rstrip("/")
        return not p or os.path.exists(os.path.join(root, p))
    if "*" in p:
        return bool(glob.glob(os.path.join(root, p)))
    return os.path.exists(os.path.join(root, p))


def pathlike(tok):
    tok = tok.strip().rstrip("/,.;:)")
    if " " in tok or tok.startswith(("-", "/", "~", "http")) or "..." in tok:
        return False
    if tok.startswith(ROOTS) and "/" in tok:
        return True
    return "/" not in tok and tok.endswith(EXT) and re.match(r"^[A-Z][A-Za-z0-9_.-]+$", tok) is not None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    root = os.path.abspath(ap.parse_args(argv).root)
    with open(os.path.join(root, "package.json"), encoding="utf-8") as f:
        scripts = set(json.load(f).get("scripts", {}))
    with open(os.path.join(root, ".github/workflows/ci.yml"), encoding="utf-8") as f:
        ci = f.read()
    dead = []
    for doc in DOCS:
        path = os.path.join(root, doc)
        if not os.path.exists(path):
            dead.append((doc, "document missing"))
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        chunks = SPAN.findall(text) + [l for blk in FENCE.findall(text) for l in blk.splitlines()]
        for chunk in chunks:
            for tok in re.split(r"\s+", chunk.strip()):
                if pathlike(tok) and not exists(root, tok):
                    dead.append((doc, "path " + tok))
            for m in NPM.finditer(chunk):
                name = m.group(1)
                if name not in scripts and not (name in NPM_BUILTIN and "npm run " not in m.group(0)):
                    dead.append((doc, "npm script " + name))
            for m in NODE_TEST.finditer(chunk):
                for f_ in m.group(1).split():
                    if not exists(root, f_):
                        dead.append((doc, "node --test file " + f_))
            for m in PYTOOL.finditer(chunk):
                if not exists(root, m.group(1)):
                    dead.append((doc, "tool " + m.group(1)))
    contrib = os.path.join(root, "CONTRIBUTING.md")
    if os.path.exists(contrib):
        with open(contrib, encoding="utf-8") as f:
            fences = FENCE.findall(f.read())
        for blk in fences:
            for line in blk.splitlines():
                line = line.strip()
                m = NPM.match(line)
                if line.startswith("npm ") and m and (m.group(1) in scripts) and ("npm run " + m.group(1)) not in ci \
                        and m.group(1) not in ("proof",):
                    dead.append(("CONTRIBUTING.md", "command not in CI: " + line))
                if line.startswith(("python3 -I tools/", "node --test")) and line not in ci:
                    dead.append(("CONTRIBUTING.md", "command not in CI: " + line))
    for doc, what in sorted(set(dead)):
        print("dead claim %s: %s" % (doc, what))
    print("claims_check: %d dead claims" % len(set(dead)))
    return 1 if dead else 0


if __name__ == "__main__":
    sys.exit(main())
