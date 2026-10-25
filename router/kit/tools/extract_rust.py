#!/usr/bin/env python3
"""W0-RUST: public items, qualified paths, cfg profile, Rust ownership.

Allowlisted crate files only, no scan. Deterministic stdlib-only.
Exit 0 pass, 4 refuse, 2 usage."""
import argparse, hashlib, json, os, re, sys

SCHEMA = "ctx.rust-extract.v1"
MACROS_SCHEMA = "ctx.rust-macros.v1"
VERSION = "extract_rust.py/1.0"
AUTHORITY = "rust"
CRATE_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
PUB_RE = re.compile(r"^\s*pub\s*(\([^)]*\))?\s*(?:unsafe\s+)?(?:async\s+)?"
    r"(?:const\s+)?(?:extern\s+(?:\"[^\"]*\"\s*)?)?"
    r"(fn|struct|enum|trait|type|const|static|mod|use|union|extern\s+crate)\b\s*"
    r"([A-Za-z_][A-Za-z0-9_]*)?")
MOD_RE = re.compile(r"^\s*(pub\s*(?:\([^)]*\))?\s*)?mod\s+([A-Za-z_]\w*)")
TRAIT_RE = re.compile(r"^\s*(pub\s*(?:\([^)]*\))?\s*)?(?:unsafe\s+)?trait\s+([A-Za-z_]\w*)")
IMPL_RE = re.compile(r"^\s*impl\b(.*)")
TRAIT_ITEM_RE = re.compile(r"^\s*(?:unsafe\s+)?(?:async\s+)?(?:const\s+)?"
    r"(fn|const|type)\s+([A-Za-z_]\w*)")
MACRO_DEF_RE = re.compile(r"^\s*macro_rules\s*!\s*([A-Za-z_]\w*)")
MACRO_CALL_RE = re.compile(r"^\s*([A-Za-z_]\w*)\s*!\s*[\(\[\{]")
CFG_RE = re.compile(r"#\s*\[\s*cfg\s*\((.*)\)\s*\]")
CFG_ATTR_RE = re.compile(r"#\s*\[\s*cfg_attr\s*\((.*)\)\s*\]")
TOK_RE = re.compile(r"\bmod\b|\bimpl\b|\btrait\b|\bfn\b|\{|\}")

def sha(b): return hashlib.sha256(b).hexdigest()
def readb(p):
    with open(p, "rb") as f: return f.read()
def dumps(o): return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
def canon(o): return (dumps(o) + "\n").encode("utf-8")

def canon_rel(root, rel):
    if not rel or os.path.isabs(rel) or ".." in rel.split("/"): return None
    try: rel.encode("utf-8")
    except UnicodeError: return None
    ap = os.path.join(root, rel)
    if os.path.islink(ap): return None
    real = os.path.realpath(ap); rroot = os.path.realpath(root)
    if real != rroot and not real.startswith(rroot + os.sep): return None
    return rel

def strip_rust(t):
    o = []; i = 0; n = len(t); st = "c"; rh = 0
    while i < n:
        c = t[i]; nx = t[i+1] if i+1 < n else ""
        if st == "c":
            if c == "/" and nx == "/": st = "l"; o.append("  "); i += 2; continue
            if c == "/" and nx == "*": st = "b"; o.append("  "); i += 2; continue
            if c == '"': st = "s"; o.append('"'); i += 1; continue
            if c == "r" and nx in ('"', "#"):
                j = i+1; h = 0
                while j < n and t[j] == "#": h += 1; j += 1
                if j < n and t[j] == '"':
                    st = "r"; rh = h; o.append("r"+"#"*h+'"'); i = j+1; continue
            o.append(c); i += 1
        elif st == "l":
            if c == "\n": st = "c"; o.append("\n")
            else: o.append(" ")
            i += 1
        elif st == "b":
            if c == "*" and nx == "/": st = "c"; o.append("  "); i += 2
            elif c == "\n": o.append("\n"); i += 1
            else: o.append(" "); i += 1
        elif st == "s":
            if c == "\\" and i+1 < n: o.append("  "); i += 2
            elif c == '"': st = "c"; o.append('"'); i += 1
            elif c == "\n": o.append("\n"); i += 1
            else: o.append(" "); i += 1
        else:
            if c == '"':
                k = i+1; h = 0
                while h < rh and k < n and t[k] == "#": h += 1; k += 1
                if h == rh: st = "c"; o.append('"'+"#"*h); i = k
                else: o.append(" "); i += 1
            elif c == "\n": o.append("\n"); i += 1
            else: o.append(" "); i += 1
    return "".join(o)

def cfg_split(inner):
    d = 0
    for k, ch in enumerate(inner):
        if ch in "([" : d += 1
        elif ch in ")]": d -= 1
        elif ch == "," and d == 0: return inner[:k].strip()
    return inner.strip()

def attrs_of(cl, ol, idx):
    f = re.findall(r"#\s*\[.*?\]", ol[idx]) if "#[" in cl[idx] else []
    j = idx-1
    while j >= 0:
        t = cl[j].strip()
        if not t: j -= 1; continue
        if t.startswith("#["):
            f.extend(re.findall(r"#\s*\[.*?\]", ol[j])); j -= 1; continue
        break
    return f

def cfgs_of(attrs):
    c = []
    for a in attrs:
        m = CFG_RE.search(a)
        if m: c.append(m.group(1).strip()); continue
        m2 = CFG_ATTR_RE.search(a)
        if m2: c.append(cfg_split(m2.group(1)))
    return c

def mod_base(crate, rel):
    if rel.startswith("src/"): tail = rel[4:]
    elif "/src/" in rel: tail = rel.split("/src/", 1)[1]
    else: return None
    if not tail.endswith(".rs"): return None
    p = tail[:-3].split("/")
    if p in (["lib"], ["main"], ["mod"]): return crate
    if p[-1] == "mod": p = p[:-1]
    return crate + "".join("::"+x for x in p)

def use_names(stmt):
    s = stmt.strip().rstrip(";").strip()
    s = re.sub(r"^pub\s*(\([^)]*\))?\s*use\s+", "", s)
    if "{" in s and "::" in s:
        head, rest = s.split("{", 1); head = head.rstrip(":")
        rest = rest.split("}", 1)[0]; o = []
        for pc in rest.split(","):
            pc = pc.strip()
            if not pc: continue
            if " as " in pc:
                a, b = [x.strip() for x in pc.split(" as ", 1)]
                o.append((b, head+"::"+a))
            else: o.append((pc.split("::")[-1], head+"::"+pc))
        return o
    if " as " in s:
        a, b = [x.strip() for x in s.rsplit(" as ", 1)]; return [(b, a)]
    return [(s.split("::")[-1].strip(), s)]

def parse_file(rel, raw, crate, reviewed):
    try: text = raw.decode("utf-8")
    except UnicodeError: return [], set(), ["E_NOT_UTF8 %s" % rel], []
    if "\x00" in text: return [], set(), ["E_NOT_UTF8 %s" % rel], []
    base = mod_base(crate, rel)
    if base is None: return [], set(), ["E_PATH %s: expected */src/**/*.rs" % rel], []
    cl = strip_rust(text).split("\n")
    ol = text.split("\n")
    items = []; cfgs = set(); errs = []; fmods = []
    stk = [{"k": "mod", "n": base, "v": "pub", "c": []}]
    def cur():
        for s in reversed(stk):
            if s["k"] == "mod": return s["n"]
        return base
    def ecfgs():
        o = []
        for s in stk: o.extend(s.get("c", []))
        return o
    def mpub():
        return all(s.get("v") == "pub" for s in stk if s["k"] == "mod")
    def blocked():
        for s in reversed(stk):
            if s["k"] in ("fn", "other"): return True
            if s["k"] in ("mod", "impl", "trait"): return False
        return False
    for idx, ln in enumerate(cl):
        n = idx+1
        if ln.count("pub") > 1:
            errs.append("E_UNSUPPORTED %s:%d multiple pub" % (rel, n)); continue
        s = re.sub(r"^\s*(?:#\s*\[.*?\]\s*)+", "", ln)
        if "{" in s and re.search(r"\bpub\b", s.split("{", 1)[1]):
            errs.append("E_UNSUPPORTED %s:%d pub after {" % (rel, n)); continue
        if ";" in s and re.search(r"\bpub\b", s.split(";", 1)[1]):
            errs.append("E_UNSUPPORTED %s:%d pub after ;" % (rel, n)); continue
        at = attrs_of(cl, ol, idx)
        if any(re.search(r"#\s*\[\s*path\b", a) for a in at):
            errs.append("E_UNSUPPORTED %s:%d #[path]" % (rel, n))
        if re.search(r"^\s*(pub\s+)?extern\s+(\"[^\"]*\"\s*)?\{", ln) and "fn" not in ln:
            errs.append("E_UNSUPPORTED %s:%d extern block" % (rel, n))
        imm = cfgs_of(at); cfgs.update(imm)
        tot = ecfgs()+imm
        mm = MOD_RE.match(s)
        if mm:
            rv = (mm.group(1) or "").strip()
            v = "pub" if rv == "pub" else (rv or "private")
            name = mm.group(2); sym = cur()+"::"+name
            pub = v == "pub" and mpub()
            items.append({"path": rel, "symbol": sym, "name": name, "line": n,
                "kind": "mod", "module": cur(), "visibility": v,
                "cfg": sorted(set(tot)), "public": pub})
            if "{" not in ln and ";" in ln: fmods.append((name, n))
        mt = TRAIT_RE.match(s)
        if mt and "{" in s:
            tail = s.split("{", 1)[1]
            if re.search(r"\b(fn|const|type)\b", tail):
                errs.append("E_UNSUPPORTED %s:%d trait items after {" % (rel, n)); continue
        if mt and not mm:
            rv = (mt.group(1) or "").strip()
            v = "pub" if rv == "pub" else (rv or "private")
            name = mt.group(2); sym = cur()+"::"+name
            items.append({"path": rel, "symbol": sym, "name": name, "line": n,
                "kind": "trait", "module": cur(), "visibility": v,
                "cfg": sorted(set(tot)), "public": v == "pub" and mpub()})
        if stk[-1]["k"] == "trait" and not blocked():
            ti = TRAIT_ITEM_RE.match(s)
            if ti and "pub" not in s.split(ti.group(1), 1)[0]:
                k, name = ti.group(1), ti.group(2)
                tn = stk[-1]["n"]; sym = cur()+"::"+tn+"::"+name
                pub = stk[-1].get("v") == "pub" and mpub()
                items.append({"path": rel, "symbol": sym, "name": name, "line": n,
                    "kind": k, "module": cur(), "visibility": "trait",
                    "cfg": sorted(set(tot)), "public": pub})
        md = MACRO_DEF_RE.match(s)
        if md:
            name = md.group(1); exp = any("macro_export" in a for a in at)
            v = "pub" if exp else "private"
            sym = (crate+"::"+name) if exp else (cur()+"::"+name)
            items.append({"path": rel, "symbol": sym, "name": name, "line": n,
                "kind": "macro", "module": cur(), "visibility": v,
                "cfg": sorted(set(tot)), "public": exp})
        mc = MACRO_CALL_RE.match(s)
        if mc and not md and not blocked() and stk[-1]["k"] in ("mod", "impl", "trait"):
            macro = mc.group(1)
            if macro != "macro_rules":
                key = (rel, n, macro)
                if key in reviewed:
                    for e in reviewed[key]:
                        en = e.get("name", ""); ek = e.get("kind", "fn")
                        es = cur()+"::"+en if en else cur()
                        items.append({"path": rel, "symbol": es, "name": en, "line": n,
                            "kind": ek, "module": cur(), "visibility": "pub",
                            "cfg": sorted(set(tot)), "public": mpub(), "reviewed": True})
                else: errs.append("E_MACRO_UNREVIEWED %s:%d %s!" % (rel, n, macro))
        mp = PUB_RE.match(s)
        if mp and not mm:
            vr = (mp.group(1) or "").strip()
            v = "pub" if not vr else "pub"+vr
            kind = re.sub(r"\s+", " ", mp.group(2)).strip()
            name = mp.group(3) or ""
            if kind == "use":
                if re.search(r"pub\s*(\([^)]*\))?\s*use\b[^;]*\*", s):
                    errs.append("E_GLOB_REEXPORT %s:%d" % (rel, n))
                else:
                    try:
                        for un, tg in use_names(s):
                            items.append({"path": rel, "symbol": cur()+"::"+un,
                                "name": un, "line": n, "kind": "use",
                                "module": cur(), "visibility": v,
                                "cfg": sorted(set(tot)),
                                "public": v == "pub" and mpub(), "target": tg})
                    except ValueError: errs.append("E_UNSUPPORTED %s:%d use" % (rel, n))
            elif kind in ("mod", "trait"): pass
            elif kind == "extern crate":
                if name: items.append({"path": rel, "symbol": cur()+"::"+name,
                    "name": name, "line": n, "kind": "extern_crate",
                    "module": cur(), "visibility": v, "cfg": sorted(set(tot)),
                    "public": v == "pub" and mpub()})
            elif not name:
                errs.append("E_UNSUPPORTED %s:%d %s without name" % (rel, n, kind))
            else:
                it = ""
                for s in reversed(stk):
                    if s["k"] == "impl": it = s["n"]; break
                    if s["k"] in ("mod", "trait"): break
                sym = cur()+"::"+it+"::"+name if it and stk[-1]["k"] == "impl" else cur()+"::"+name
                items.append({"path": rel, "symbol": sym, "name": name, "line": n,
                    "kind": kind, "module": cur(), "visibility": v,
                    "cfg": sorted(set(tot)), "public": v == "pub" and mpub()})
        # ordered brace tracking: pending keyword -> { pushes typed frame
        pend = None; pinfo = None
        for m in TOK_RE.finditer(ln):
            t = m.group(0)
            if t in ("mod", "impl", "trait", "fn"):
                pend = t
                if t == "mod" and mm:
                    rv = (mm.group(1) or "").strip()
                    v = "pub" if rv == "pub" else (rv or "private")
                    pinfo = ("mod", cur()+"::"+mm.group(2), v, list(tot))
                elif t == "trait" and mt:
                    rv = (mt.group(1) or "").strip()
                    v = "pub" if rv == "pub" else (rv or "private")
                    pinfo = ("trait", mt.group(2), v, list(tot))
                elif t == "impl":
                    mi = IMPL_RE.match(ln)
                    typ = ""
                    if mi:
                        r = mi.group(1).split("{", 1)[0].split(";", 1)[0].split("where", 1)[0]
                        if " for " in " "+r+" ":
                            typ = r.split(" for ", 1)[1].strip().split("<", 1)[0].split()[0]
                        else:
                            typ = r.strip().split("<", 1)[0].strip().split()[-1] if r.strip() else ""
                            typ = typ.split("::")[-1].strip("()")
                    pinfo = ("impl", typ, "", list(tot))
                else: pinfo = (t, "", "", [])
            elif t == "{":
                if pend in ("mod", "trait", "impl") and pinfo:
                    k, nm, vv, cc = pinfo
                    stk.append({"k": k, "n": nm, "v": vv, "c": cc})
                elif pend == "fn":
                    stk.append({"k": "fn", "n": "", "v": "", "c": []})
                else:
                    stk.append({"k": "other", "n": "", "v": "", "c": []})
                pend = None; pinfo = None
            else:
                if len(stk) > 1: stk.pop()
                pend = None; pinfo = None
    return items, cfgs, errs, fmods

def load_reviewed(path):
    if not path: return {}, []
    try: doc = json.loads(readb(path).decode("utf-8"))
    except (OSError, ValueError) as e: return {}, ["E_MACROS_INVALID %s" % e]
    if not isinstance(doc, dict) or doc.get("schema") != MACROS_SCHEMA:
        return {}, ["E_MACROS_INVALID schema"]
    ex = doc.get("expansions")
    if not isinstance(ex, list): return {}, ["E_MACROS_INVALID expansions"]
    o = {}
    for e in ex:
        if not isinstance(e, dict): return {}, ["E_MACROS_INVALID expansion"]
        p, ln, m, its = e.get("path"), e.get("line"), e.get("macro"), e.get("items", [])
        if not isinstance(p, str) or not isinstance(ln, int) or not isinstance(m, str):
            return {}, ["E_MACROS_INVALID bad triple"]
        if not isinstance(its, list): return {}, ["E_MACROS_INVALID items"]
        o[(p, ln, m)] = its
    return o, []

def cargo_name(root, rel):
    try: txt = readb(os.path.join(root, rel)).decode("utf-8")
    except (OSError, UnicodeError): return None
    m = re.search(r"^\s*name\s*=\s*\"([^\"]+)\"", txt, re.M)
    return m.group(1) if m else None

def extract(root, files, crate, reviewed_path=None):
    bad = {"schema": SCHEMA, "tool": VERSION, "pass": False, "crate": crate,
        "authority": AUTHORITY, "files": [], "items": [], "symbols": [],
        "cfg_profile": [], "ownership": {}}
    if not CRATE_RE.match(crate or ""):
        bad["errors"] = ["E_USAGE bad --crate %r" % (crate,)]; return bad
    reviewed, rerrs = load_reviewed(reviewed_path)
    errs = list(rerrs); seen = set(); rels = []
    for f in files:
        c = canon_rel(root, f)
        if c is None: errs.append("E_ESCAPE %s" % f); continue
        if c in seen: errs.append("E_DUPLICATE path %s" % c); continue
        seen.add(c); rels.append(c)
    rels.sort()
    for r in rels:
        if not (r.endswith(".rs") or r.endswith("Cargo.toml")):
            errs.append("E_PATH %s: only *.rs or Cargo.toml" % r)
    recs = []; items = []; cfgs = set(); fms = []
    for r in rels:
        ap = os.path.join(root, r)
        if not os.path.isfile(ap): errs.append("E_ABSENT %s" % r); continue
        try: raw = readb(ap)
        except OSError: errs.append("E_ABSENT %s" % r); continue
        recs.append({"path": r, "sha256": sha(raw)})
        if r.endswith(".rs"):
            its, cg, pe, fm = parse_file(r, raw, crate, reviewed)
            items.extend(its); cfgs.update(cg); errs.extend(pe)
            fms.extend([(r, n, ln) for (n, ln) in fm])
    for r in rels:
        if r.endswith("Cargo.toml"):
            nm = cargo_name(root, r)
            if nm is not None and nm.replace("-", "_") != crate:
                errs.append("E_OWNER %s package %r != %r" % (r, nm, crate))
    have = set(rels)
    for host, name, ln in fms:
        if host.endswith("/mod.rs"): b = host[:-7]
        elif "/src/" in host: b = host.split("/src/", 1)[0]+"/src"
        elif host.startswith("src/"): b = "src"
        else: b = os.path.dirname(host)
        hd = os.path.dirname(host)
        cands = [b+"/"+name+".rs", b+"/"+name+"/mod.rs", hd+"/"+name+".rs", hd+"/"+name+"/mod.rs"]
        # file-module neighbours: stem dir for src/x.rs -> src/x/
        if host.endswith(".rs") and not host.endswith("/mod.rs"):
            stem = host[:-3]
            cands.extend([stem+"/"+name+".rs", stem+"/"+name+"/mod.rs"])
        if not any(c in have for c in cands):
            errs.append("E_ABSENT %s:%d mod %s" % (host, ln, name))
    seen_s = {}
    for it in sorted(items, key=lambda x: (x["path"], x["line"], x["symbol"])):
        if it.get("public"):
            if it["symbol"] in seen_s:
                errs.append("E_DUPLICATE symbol %s" % it["symbol"])
            else: seen_s[it["symbol"]] = True
    cache = {}
    for it in items:
        if not it.get("public"): continue
        if it.get("reviewed"): continue
        if it["path"] not in cache:
            try: cache[it["path"]] = readb(os.path.join(root, it["path"])).decode("utf-8").split("\n")
            except (OSError, UnicodeError): cache[it["path"]] = []
        ls = cache[it["path"]]
        if it["line"] < 1 or it["line"] > len(ls) or it["name"] not in ls[it["line"]-1]:
            errs.append("E_LINE_DRIFT %s:%d %s" % (it["path"], it["line"], it["symbol"]))
    items.sort(key=lambda x: (x["path"], x["line"], x["symbol"]))
    syms = [{"path": i["path"], "symbol": i["symbol"], "name": i["name"], "line": i["line"]}
        for i in items if i.get("public") and "test" not in set(i.get("cfg", []))]
    syms.sort(key=lambda x: (x["path"], x["symbol"]))
    recs.sort(key=lambda x: x["path"])
    errs = sorted(set(errs))
    return {"schema": SCHEMA, "tool": VERSION, "pass": not errs, "errors": errs,
        "crate": crate, "authority": AUTHORITY, "files": recs, "items": items,
        "symbols": syms, "cfg_profile": sorted(cfgs),
        "ownership": {"authority": AUTHORITY, "crate": crate, "files": recs}}

def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract_rust.py")
    ap.add_argument("--root", default="."); ap.add_argument("--crate", default=None)
    ap.add_argument("--files", nargs="*", default=[]); ap.add_argument("--allowlist", default=None)
    ap.add_argument("--reviewed-macros", default=None); ap.add_argument("--check", action="store_true")
    ap.add_argument("--out", default=None); ap.add_argument("--symbols", default=None)
    ap.add_argument("--cfg", default=None); ap.add_argument("--ownership", default=None)
    try: a = ap.parse_args(argv)
    except SystemExit: return 2
    files = list(a.files or [])
    if a.allowlist:
        try: txt = readb(a.allowlist).decode("utf-8")
        except (OSError, UnicodeError):
            print("E_ALLOWLIST cannot read", file=sys.stderr); return 2
        files.extend([l.strip() for l in txt.split("\n") if l.strip() and not l.startswith("#")])
    if not a.crate or not files:
        print("E_USAGE --crate and --files/--allowlist required", file=sys.stderr); return 2
    rec = extract(a.root, files, a.crate, a.reviewed_macros)
    if a.out:
        with open(a.out, "wb") as f: f.write(canon(rec))
    if a.symbols:
        with open(a.symbols, "wb") as f:
            for s in rec["symbols"]: f.write((dumps(s)+"\n").encode("utf-8"))
    if a.cfg:
        with open(a.cfg, "wb") as f:
            f.write(canon({"schema": "ctx.rust-cfg.v1", "crate": a.crate, "cfg_profile": rec["cfg_profile"]}))
    if a.ownership:
        with open(a.ownership, "wb") as f:
            f.write(canon({"schema": "ctx.rust-ownership.v1", "tool": VERSION,
                "authority": AUTHORITY, "crate": a.crate, "files": rec["files"]}))
    sys.stdout.write(canon(rec).decode("utf-8"))
    return 0 if rec["pass"] else 4

if __name__ == "__main__": sys.exit(main())
