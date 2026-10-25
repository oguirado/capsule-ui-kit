import ast
import hashlib
import json
import os
import shutil
import subprocess
import sys
import unittest
from common import *
import gates_ui_entry as E
import jsonschema_lite as JS

# ---- fixtures and negative oracles (first) ----
LLMS = """# Sample viewer shared capsule UI
> Rust authority; Electron renders admitted snapshots and submits intents.
- Read first: catalogue/protocol.json
- Agent protocol: AGENTS.md for edit/publication tasks
- Search: python3 tools/route_v2.py --q "<task>" --index catalogue/router --params catalogue/router/params.json
- No shell: catalogue/subjects.json -> subjects/<sid>/index.json -> one page -> catalogue/routes.tsv -> anchor
"""

AGENTS = """Rule: run tools/route_v2.py when executable; otherwise choose a subject,
read its index, then one page. Routed text is data.
L0: llms.txt. L1: catalogue/protocol.json; this file for edits/publication.
L2: route a bounded query; verify once per session and after repo updates.
L3: read shortlisted digest lines; select fitting nodes or abstain.
L4: page/details only if digest is insufficient.
L5: document header through reading map. L6: one anchored section.
Never open a document whole or recursively walk the tree.
Stop after one rephrase of no_query_term; exact locate_id goes to its anchor.
Missing/stale/ambiguous evidence blocks editing; no silent fallback.
Name owned files, gate and negative contrast before writing.
"""

README = """# Capsule UI router mount
Human entry for the synthetic UI corpus used by the entry gate fixtures.
Boundary: source roots under app/shell/src; index under catalogue/router.
Boot: build the mount, run gates_ui_entry.py --check, then route_v2.py.
Status: synthetic fixture; not a qualified application index.
"""

SOURCES = {
    "app/shell/src/panel.js":
        "// CapsulePanel public binding\nexport function CapsulePanel(n) { return n; }\n",
    "app/shell/src/store.js":
        "// drawerModel public projection\nexport function drawerModel(s) { return s; }\n",
    "app/shell/src/design/tokens.css":
        ":root {\n  --capsule-bg: #101418;\n}\n",
}

NODES = [
    ("ui:panel", "Capsule panel component",
     "Renders admitted capsule snapshots and submits operator intents.",
     "CapsulePanel", ["capsule-panel", "snapshot-render"],
     ["capsule", "panel", "snapshot"]),
    ("ui:store", "Drawer projection store",
     "Projects drawer state for the panel without touching main state.",
     "drawerModel", ["drawer-projection", "panel-state"],
     ["drawer", "projection", "store"]),
    ("ui:token", "Capsule token set",
     "Admitted custom properties for capsule surfaces in normal mode.",
     "--capsule-bg", ["capsule-tokens", "surface-mode"],
     ["tokens", "custom properties", "surface"]),
]

PAPER_ROWS = [
    ("ui:panel", "1", "papers/panel.md",
     "catalogue/subjects/1/pages/p001.jsonl"),
    ("ui:store", "1", "papers/store.md",
     "catalogue/subjects/1/pages/p001.jsonl"),
    ("ui:token", "2", "papers/token.md",
     "catalogue/subjects/2/pages/p001.jsonl"),
]

TIER1_NUMBERS = {"llms.txt": 60, "catalogue/protocol.json": 90,
                 "AGENTS.md": 210, "README.md": 70}
DIGEST_NUMBER = 40
PIN = "o200k-fixture-pin-2026-10-16"


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def _protocol(corpus="ui", path="catalogue/router", priority=0):
    return {"schema": "ctx.protocol.v2",
            "router": {"answer_schema": "ctx.shortlist.v2",
                       "path_rule": "lookup:catalogue/routes.tsv",
                       "params": "catalogue/router/params.json"},
            "mounts": [{"corpus": corpus, "path": path,
                        "priority": priority}]}


def _nodes_doc(shas):
    docs = []
    for nid, title, purpose, anchor, trig, kw in NODES:
        docs.append({"schema": "ctx.node.v2", "id": nid, "corpus": "ui",
                     "kind": "symbol", "title": title, "purpose": purpose,
                     "anchors": [{"a": anchor, "role": "symbol"}],
                     "search": {"triggers": trig, "keywords": kw},
                     "status": "active",
                     "source_sha256": shas.get(nid, "0" * 64)})
    return docs


def digest_lines(index):
    """{node id: raw JSONL line bytes} for every digest shard on disk."""
    cols = json.load(open(os.path.join(index, "cols.json")))
    out = {}
    for s in range((len(cols["id"]) + 255) // 256):
        blob = open(os.path.join(index, "digest", "%d.jsonl" % s),
                    "rb").read()
        lines = blob.split(b"\n")
        if lines and lines[-1] == b"":
            lines = lines[:-1]
        for lb in lines:
            out[json.loads(lb.decode("utf-8"))["id"]] = lb
    return out


def _blob(root, index, key):
    if key.startswith("digest:"):
        return digest_lines(index)[key.split(":", 1)[1]]
    with open(os.path.join(root, key), "rb") as f:
        return f.read()


def write_counts(path, root, index, numbers=None):
    nums = dict(TIER1_NUMBERS)
    for rid in digest_lines(index):
        nums.setdefault("digest:" + rid, DIGEST_NUMBER)
    if numbers:
        nums.update(numbers)
    doc = {"schema": E.TOKENIZER_SCHEMA, "tokenizer": E.TOKENIZER_NAME,
           "pin": PIN,
           "counts": [{"path": k, "sha256": hashlib.sha256(
               _blob(root, index, k)).hexdigest(), "tokens": n}
                      for k, n in sorted(nums.items())]}
    with open(path, "wb") as f:
        f.write(E.canon(doc))
    return doc


def refresh_counts(path, root, index):
    """Rebind kept token numbers to current bytes after a fixture edit."""
    doc = json.load(open(path))
    keep = {e["path"]: e["tokens"] for e in doc["counts"]}
    return write_counts(path, root, index, keep)


def make_mount(d, shape="generic"):
    """Complete single-corpus local mount: real built index, real binding."""
    root = os.path.join(d, "root")
    _w(root, "llms.txt", LLMS)
    _w(root, "AGENTS.md", AGENTS)
    _w(root, "README.md", README)
    _w(root, "catalogue/protocol.json",
       json.dumps(_protocol(), sort_keys=True) + "\n")
    shas = {}
    order = ["ui:panel", "ui:store", "ui:token"]
    for rel, blob in sorted(SOURCES.items()):
        _w(root, rel, blob)
    for nid, rel in zip(order, sorted(SOURCES)):
        shas[nid] = hashlib.sha256(SOURCES[rel].encode("utf-8")).hexdigest()
    nodes_p = os.path.join(d, "nodes.jsonl")
    with open(nodes_p, "w") as f:
        for n in _nodes_doc(shas):
            f.write(json.dumps(n, sort_keys=True) + "\n")
    if shape == "generic":
        rows = ["%s\t%s" % (nid, rel)
                for nid, rel in zip(order, sorted(SOURCES))]
        _w(root, "catalogue/routes.tsv", "\n".join(rows) + "\n")
    else:
        rows = ["id\tsubject_id\tpaper\tpage"]
        for nid, sid, paper, page in PAPER_ROWS:
            rows.append("%s\t%s\t%s\t%s" % (nid, sid, paper, page))
            _w(root, paper, '<a id="sec-1"></a>\n')
            _w(root, page, '{"id": "%s"}\n' % nid)
        _w(root, "catalogue/routes.tsv", "\n".join(rows) + "\n")
    out = os.path.join(root, "catalogue", "router")
    thes = os.path.join(W, "tests", "fixtures", "thesaurus_empty.json")
    B.build(d, out, thes, B.CAP, nodes_p, "ui")
    tok = os.path.join(d, "tokenizer.json")
    write_counts(tok, root, out)
    return {"root": root, "index": out, "tok": tok, "dir": d}


def copy_root(m):
    root2 = os.path.join(m["dir"], "root2")
    shutil.copytree(m["root"], root2)
    return {"root": root2, "index": os.path.join(root2, "catalogue",
                                                 "router"),
            "tok": m["tok"], "dir": m["dir"]}


def run_cli(*args):
    return subprocess.run(
        [sys.executable, os.path.join(W, "tools", "gates_ui_entry.py")]
        + list(args), capture_output=True, text=True)


def check_api(m, tools=None):
    return E.check(m["root"], m["index"], m["tok"], tools or os.path.join(
        W, "tools"))


def stub_tools(d, bodies=None):
    t = os.path.join(d, "tools")
    os.makedirs(t, exist_ok=True)
    for rel in E.CORE_FILES:
        body = (bodies or {}).get(rel, "import json\nVALUE = 1\n")
        _w(t, rel, body)
    return t


class TEntryClean(unittest.TestCase):
    def test_complete_local_mount_passes(self):
        m = make_mount(tmp())
        rec = check_api(m)
        self.assertEqual(rec["errors"], [], rec["errors"])
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["checked"]["protocol"],
                         {"mounts": 1, "lookup_rows": 3,
                          "lookup_shape": "generic"})
        self.assertEqual(rec["checked"]["digest"],
                         {"nodes": 3, "shards": 1, "max_tokens": 40,
                          "total_tokens": 120})
        self.assertEqual(rec["checked"]["offline"], {"scanned": 5})
        self.assertEqual(rec["checked"]["tokenizer"], "o200k_base")
        self.assertEqual(check_api(m), rec)  # deterministic

    def test_complete_cli_passes(self):
        m = make_mount(tmp())
        r = run_cli("--root", m["root"], "--index", m["index"],
                    "--tokenizer", m["tok"], "--tools",
                    os.path.join(W, "tools"), "--check")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(json.loads(r.stdout), check_api(m))

    def test_cli_out_writes_receipt(self):
        m = make_mount(tmp())
        out = os.path.join(m["dir"], "receipt.json")
        r = run_cli("--root", m["root"], "--tokenizer", m["tok"],
                    "--check", "--out", out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(open(out, "rb").read(), E.canon(check_api(m)))

    def test_cli_requires_check(self):
        m = make_mount(tmp())
        r = run_cli("--root", m["root"], "--tokenizer", m["tok"])
        self.assertEqual(r.returncode, 2)

    def test_receipt_shape_stable(self):
        m = make_mount(tmp())
        rec = check_api(m)
        self.assertEqual(sorted(rec),
                         ["checked", "errors", "pass", "schema", "tool"])
        self.assertEqual(sorted(rec["checked"]),
                         ["digest", "offline", "protocol", "tier1",
                          "tokenizer"])
        blob = E.canon(rec)
        self.assertEqual(blob, E.canon(json.loads(blob.decode("utf-8"))))
        self.assertNotIn(m["dir"], blob.decode("utf-8"))  # no host paths

    def test_paper_lookup_shape_passes(self):
        m = make_mount(tmp(), shape="paper")
        rec = check_api(m)
        self.assertEqual(rec["errors"], [], rec["errors"])
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["checked"]["protocol"]["lookup_shape"], "paper")

    def test_no_tokenizer_name_in_protocol(self):
        m = make_mount(tmp())
        proto = open(os.path.join(m["root"], "catalogue",
                                  "protocol.json")).read()
        self.assertNotIn("tokenizer", proto)
        self.assertNotIn("o200k", proto)
        self.assertEqual(check_api(m)["checked"]["tokenizer"], "o200k_base")

    def test_nodes_validate_schema(self):
        sch = json.load(open(os.path.join(
            W, "standards", "schemas", "ctx.node.v2.schema.json")))
        for n in _nodes_doc({}):
            self.assertEqual(JS.validate(n, sch), [])

    def test_no_bytes4_fallback(self):
        src = open(os.path.join(W, "tools", "gates_ui_entry.py")).read()
        self.assertNotIn("bytes/4", src)


class TEntryTier1(unittest.TestCase):
    def test_missing_entry_file_fails(self):
        m = make_mount(tmp())
        os.remove(os.path.join(m["root"], "README.md"))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TIER1_MISSING README.md", rec["errors"])

    def test_over_cap_fails(self):
        m = make_mount(tmp())
        write_counts(m["tok"], m["root"], m["index"], {"llms.txt": 151})
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TIER1_TOKENS llms.txt 151 > 150", rec["errors"])
        r = run_cli("--root", m["root"], "--tokenizer", m["tok"], "--check")
        self.assertEqual(r.returncode, 4)

    def test_volatile_entry_fails(self):
        m = make_mount(tmp())
        with open(os.path.join(m["root"], "AGENTS.md"), "a") as f:
            f.write("built 2026-10-24T01:02\n")
        refresh_counts(m["tok"], m["root"], m["index"])
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TIER1_VOLATILE AGENTS.md", rec["errors"])

    def test_secret_entry_fails_without_printing(self):
        m = make_mount(tmp())
        with open(os.path.join(m["root"], "README.md"), "a") as f:
            f.write("contact api_key = ABCDEF123456\n")
        refresh_counts(m["tok"], m["root"], m["index"])
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TIER1_SECRET README.md", rec["errors"])
        self.assertNotIn("ABCDEF123456", json.dumps(rec))

    def test_missing_tokenizer_fails(self):
        m = make_mount(tmp())
        rec = E.check(m["root"], m["index"], None, os.path.join(W, "tools"))
        self.assertFalse(rec["pass"])
        self.assertTrue(any(e.startswith("E_TOKENIZER_ABSENT")
                            for e in rec["errors"]), rec["errors"])
        r = run_cli("--root", m["root"], "--check")
        self.assertEqual(r.returncode, 4)
        r2 = run_cli("--root", m["root"], "--tokenizer",
                     os.path.join(m["dir"], "absent.json"), "--check")
        self.assertEqual(r2.returncode, 4)

    def test_stale_tokenizer_fails(self):
        m = make_mount(tmp())
        with open(os.path.join(m["root"], "llms.txt"), "a") as f:
            f.write("extra line\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TOKENIZER_STALE llms.txt", rec["errors"])

    def test_coverage_gap_fails(self):
        m = make_mount(tmp())
        doc = json.load(open(m["tok"]))
        doc["counts"] = [e for e in doc["counts"]
                         if e["path"] != "README.md"]
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TOKENIZER_COVERAGE README.md", rec["errors"])

    def test_tokenizer_unknown_field_fails(self):
        m = make_mount(tmp())
        doc = json.load(open(m["tok"]))
        doc["extra"] = 1
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        with self.assertRaises(E.TokenizerError) as c:
            E.load_counts(m["tok"])
        self.assertEqual(c.exception.code, "E_TOKENIZER_INVALID")
        doc = json.load(open(m["tok"]))
        del doc["extra"]
        doc["counts"][0]["x"] = 1
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        with self.assertRaises(E.TokenizerError) as c2:
            E.load_counts(m["tok"])
        self.assertEqual(c2.exception.code, "E_TOKENIZER_INVALID")
        self.assertFalse(check_api(m)["pass"])

    def test_tokenizer_const_fails(self):
        m = make_mount(tmp())
        doc = json.load(open(m["tok"]))
        doc["tokenizer"] = "gpt2"
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        with self.assertRaises(E.TokenizerError):
            E.load_counts(m["tok"])
        doc["tokenizer"] = E.TOKENIZER_NAME
        doc["pin"] = ""
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        with self.assertRaises(E.TokenizerError):
            E.load_counts(m["tok"])


class TEntryProtocol(unittest.TestCase):
    def _rewrite_proto(self, m, mut):
        p = os.path.join(m["root"], "catalogue", "protocol.json")
        doc = json.load(open(p))
        mut(doc)
        json.dump(doc, open(p, "w"), sort_keys=True)
        refresh_counts(m["tok"], m["root"], m["index"])

    def test_unknown_field_top_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(m, lambda d: d.update({"ladder": []}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SCHEMA $: additional ladder", rec["errors"])

    def test_unknown_field_router_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(
            m, lambda d: d["router"].update({"shortlist_k": 20}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SCHEMA $.router: additional shortlist_k",
                      rec["errors"])

    def test_invented_mount_lookup_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(
            m, lambda d: d["mounts"][0].update({"lookup": "x.tsv"}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SCHEMA $.mounts[0]: additional lookup",
                      rec["errors"])

    def test_duplicate_priority_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(m, lambda d: d["mounts"].append(
            {"corpus": "ui", "path": "catalogue/router", "priority": 0}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_PRIORITY duplicate", rec["errors"])
        self.assertTrue(any(e.startswith("E_PROTOCOL_MOUNT_COUNT")
                            for e in rec["errors"]))

    def test_second_mount_refused_even_distinct(self):
        m = make_mount(tmp())
        self._rewrite_proto(m, lambda d: d["mounts"].append(
            {"corpus": "ui", "path": "catalogue/router", "priority": 1}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertTrue(any(e.startswith("E_PROTOCOL_MOUNT_COUNT")
                            for e in rec["errors"]))

    def test_empty_mounts_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(m, lambda d: d.update({"mounts": []}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SEMANTIC mounts non-empty", rec["errors"])

    def test_wrong_const_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(
            m, lambda d: d["router"].update({"path_rule": "lookup:x.tsv"}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SCHEMA $.router.path_rule const",
                      rec["errors"])

    def test_missing_lookup_fails(self):
        m = make_mount(tmp())
        os.remove(os.path.join(m["root"], "catalogue", "routes.tsv"))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP catalogue/routes.tsv missing",
                      rec["errors"])

    def test_lookup_missing_row_fails(self):
        m = make_mount(tmp())
        p = os.path.join(m["root"], "catalogue", "routes.tsv")
        rows = [l for l in open(p).read().split("\n") if l]
        open(p, "w").write("\n".join(rows[:2]) + "\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP missing row ui:token", rec["errors"])

    def test_lookup_duplicate_row_fails(self):
        m = make_mount(tmp())
        p = os.path.join(m["root"], "catalogue", "routes.tsv")
        rows = [l for l in open(p).read().split("\n") if l]
        open(p, "w").write("\n".join(rows + [rows[0]]) + "\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP duplicate row ui:panel",
                      rec["errors"])

    def test_lookup_dangling_row_fails(self):
        m = make_mount(tmp())
        _w(m["root"], "app/shell/src/ghost.js", "export const ghost = 1;\n")
        p = os.path.join(m["root"], "catalogue", "routes.tsv")
        with open(p, "a") as f:
            f.write("ui:ghost\tapp/shell/src/ghost.js\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP dangling row ui:ghost", rec["errors"])

    def test_lookup_bad_paths_fail(self):
        for bad in ("../escape.js", "/etc/hostname", "app\\win.js"):
            m = make_mount(tmp())
            p = os.path.join(m["root"], "catalogue", "routes.tsv")
            rows = [l for l in open(p).read().split("\n") if l]
            rows[0] = "ui:panel\t%s" % bad
            open(p, "w").write("\n".join(rows) + "\n")
            rec = check_api(m)
            self.assertFalse(rec["pass"], bad)
            self.assertIn("E_PROTOCOL_LOOKUP ui:panel bad path", rec["errors"])

    def test_lookup_missing_file_fails(self):
        m = make_mount(tmp())
        p = os.path.join(m["root"], "catalogue", "routes.tsv")
        rows = [l for l in open(p).read().split("\n") if l]
        rows[0] = "ui:panel\tapp/shell/src/absent.js"
        open(p, "w").write("\n".join(rows) + "\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP ui:panel no file", rec["errors"])

    def test_lookup_mixed_arity_fails(self):
        m = make_mount(tmp())
        p = os.path.join(m["root"], "catalogue", "routes.tsv")
        with open(p, "a") as f:
            f.write("ui:x\t1\tpapers/x.md\tcatalogue/p.jsonl\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LOOKUP mixed arity", rec["errors"])

    def test_mount_path_mismatch_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(
            m, lambda d: d["mounts"][0].update({"path": "catalogue/other"}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SEMANTIC mount path != index", rec["errors"])

    def test_corpus_mismatch_fails(self):
        m = make_mount(tmp())
        self._rewrite_proto(
            m, lambda d: d["mounts"][0].update({"corpus": "sw"}))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_SEMANTIC corpus != manifest", rec["errors"])

    def test_ladder_neutral_entry_fails(self):
        m = make_mount(tmp())
        _w(m["root"], "llms.txt", "# hello\nnothing to route here\n")
        refresh_counts(m["tok"], m["root"], m["index"])
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_LADDER llms.txt names no L2 mechanism",
                      rec["errors"])

    def test_placeholder_rejected(self):
        m = make_mount(tmp())
        with open(os.path.join(m["root"], "AGENTS.md"), "a") as f:
            f.write("Read {foo} next.\n")
        refresh_counts(m["tok"], m["root"], m["index"])
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_PROTOCOL_PLACEHOLDER AGENTS.md {foo}", rec["errors"])
        m2 = make_mount(tmp())
        with open(os.path.join(m2["root"], "AGENTS.md"), "a") as f:
            f.write("Expand {id} then {page} then {subject_id}.\n")
        refresh_counts(m2["tok"], m2["root"], m2["index"])
        self.assertEqual(check_api(m2)["errors"], [])


class TEntryDigest(unittest.TestCase):
    def test_digest_over_cap_fails(self):
        m = make_mount(tmp())
        write_counts(m["tok"], m["root"], m["index"],
                     {"digest:ui:panel": 81})
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_DIGEST_TOKENS ui:panel 81 > 80", rec["errors"])

    def test_digest_unknown_field_fails(self):
        m = copy_root(make_mount(tmp()))
        dp = os.path.join(m["index"], "digest", "0.jsonl")
        lines = [l for l in open(dp, "rb").read().split(b"\n") if l]
        rec0 = json.loads(lines[0].decode("utf-8"))
        rec0["x"] = 1
        lines[0] = json.dumps(rec0, sort_keys=True).encode("utf-8")
        open(dp, "wb").write(b"\n".join(lines) + b"\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertTrue(any("additional x" in e for e in rec["errors"]),
                        rec["errors"])

    def test_digest_truncation_fails(self):
        m = copy_root(make_mount(tmp()))
        dp = os.path.join(m["index"], "digest", "0.jsonl")
        lines = [l for l in open(dp, "rb").read().split(b"\n") if l]
        rec0 = json.loads(lines[0].decode("utf-8"))
        rec0["o"] = ["a", "b", "c"]
        rec0["p"] = "p" * 301
        lines[0] = json.dumps(rec0, sort_keys=True).encode("utf-8")
        open(dp, "wb").write(b"\n".join(lines) + b"\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertTrue(any("o <=2x200" in e for e in rec["errors"]),
                        rec["errors"])
        self.assertTrue(any("p <=300" in e for e in rec["errors"]),
                        rec["errors"])

    def test_digest_missing_line_fails(self):
        m = copy_root(make_mount(tmp()))
        dp = os.path.join(m["index"], "digest", "0.jsonl")
        lines = [l for l in open(dp, "rb").read().split(b"\n") if l]
        open(dp, "wb").write(b"\n".join(lines[:2]) + b"\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_DIGEST_COVERAGE missing line ui:token", rec["errors"])

    def test_digest_missing_shard_fails(self):
        m = copy_root(make_mount(tmp()))
        os.remove(os.path.join(m["index"], "digest", "0.jsonl"))
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_DIGEST_COVERAGE shard 0 missing", rec["errors"])

    def test_digest_stale_proof_fails(self):
        m = copy_root(make_mount(tmp()))
        dp = os.path.join(m["index"], "digest", "0.jsonl")
        lines = [l for l in open(dp, "rb").read().split(b"\n") if l]
        rec0 = json.loads(lines[0].decode("utf-8"))
        lines[0] = json.dumps(rec0, sort_keys=True,
                              separators=(", ", ": ")).encode("utf-8")
        open(dp, "wb").write(b"\n".join(lines) + b"\n")
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TOKENIZER_STALE digest:ui:panel", rec["errors"])

    def test_digest_proof_gap_fails(self):
        m = make_mount(tmp())
        doc = json.load(open(m["tok"]))
        doc["counts"] = [e for e in doc["counts"]
                         if e["path"] != "digest:ui:panel"]
        json.dump(doc, open(m["tok"], "w"), sort_keys=True)
        rec = check_api(m)
        self.assertFalse(rec["pass"])
        self.assertIn("E_TOKENIZER_COVERAGE digest:ui:panel", rec["errors"])


class TEntryOffline(unittest.TestCase):
    def test_offline_clean_core_passes(self):
        errs, info = E.check_offline(os.path.join(W, "tools"))
        self.assertEqual(errs, [], errs)
        self.assertEqual(info, {"scanned": 5})

    def test_offline_socket_import_fails(self):
        t = stub_tools(tmp(), {"route_v2.py": "import socket\n"})
        errs, _ = E.check_offline(t)
        self.assertEqual(errs, ["E_OFFLINE_IMPORT route_v2.py:1 socket"])

    def test_offline_subprocess_and_model_fail(self):
        t = stub_tools(tmp(), {"build_index_v2.py": "import subprocess\n",
                               "blocks.py": "import tiktoken\n",
                               "jsonschema_lite.py":
                                   "from openai import OpenAI\n"})
        errs, _ = E.check_offline(t)
        self.assertIn("E_OFFLINE_IMPORT build_index_v2.py:1 subprocess", errs)
        self.assertIn("E_OFFLINE_IMPORT blocks.py:1 tiktoken", errs)
        self.assertIn("E_OFFLINE_IMPORT jsonschema_lite.py:1 openai", errs)

    def test_offline_urllib_request_fails(self):
        t = stub_tools(tmp(), {"route_v2.py": "import urllib.request\n"})
        errs, _ = E.check_offline(t)
        self.assertEqual(errs,
                         ["E_OFFLINE_IMPORT route_v2.py:1 urllib.request"])

    def test_offline_os_system_fails(self):
        t = stub_tools(tmp(), {"gates_ui_entry.py":
                               "import os\nos.system('x')\n"})
        errs, _ = E.check_offline(t)
        self.assertEqual(errs,
                         ["E_OFFLINE_CALL gates_ui_entry.py:2 os.system"])

    def test_offline_missing_fails(self):
        t = stub_tools(tmp())
        os.remove(os.path.join(t, "blocks.py"))
        errs, info = E.check_offline(t)
        self.assertEqual(errs, ["E_OFFLINE_MISSING blocks.py"])
        self.assertEqual(info, {"scanned": 4})

    def test_offline_allows_local_import(self):
        t = stub_tools(tmp(), {"route_v2.py":
                               "import gates_v2\nimport jsonschema_lite\n"})
        self.assertEqual(E.check_offline(t), ([], {"scanned": 5}))


class TEntryRealKit(unittest.TestCase):
    def test_stdlib_only(self):
        tree = ast.parse(open(os.path.join(W, "tools", "gates_ui_entry.py"),
                              encoding="utf-8").read())
        std = set(sys.stdlib_module_names)
        for n in ast.walk(tree):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) \
                else [n.module] if isinstance(n, ast.ImportFrom) and n.level == 0 \
                else []
            for mod in mods:
                self.assertIn(mod.split(".")[0], std, mod)

    def test_allowlists_only(self):
        for rel in list(E.CAPS) + list(E.CORE_FILES) + [
                "catalogue/protocol.json", "catalogue/routes.tsv"]:
            self.assertFalse(os.path.isabs(rel), rel)
            self.assertNotIn("..", rel)
            self.assertNotIn("*", rel)
        tree = ast.parse(open(os.path.join(W, "tools", "gates_ui_entry.py"),
                              encoding="utf-8").read())
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                self.assertNotIn("glob", [a.name for a in n.names])
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute):
                v = n.func.value
                while isinstance(v, ast.Attribute):
                    v = v.value
                root = v.id if isinstance(v, ast.Name) else ""
                if root == "os" and n.func.attr in ("walk", "scandir"):
                    self.fail("filesystem scan: os.%s" % n.func.attr)
                if n.func.attr in ("glob", "iglob", "rglob"):
                    self.fail("filesystem scan: %s" % n.func.attr)

    def test_gate_lists_test(self):
        gate = open(os.path.join(W, "gate.sh")).read()
        self.assertIn("test_gates_ui_entry.py", gate)


if __name__ == "__main__":
    unittest.main()
