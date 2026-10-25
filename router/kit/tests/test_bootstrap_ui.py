import ast
import hashlib
import json
import os
import re
import subprocess
import sys
import unittest
from common import *
import bootstrap_ui as U

# ---- fixtures and negative oracles (first) ----
# Neutral stand-in for a site-specific deny-list term; it only exists in the external policy.
SITE_TERM = "site-private-term"
POLICY_OK = dict(U.POLICY_TEMPLATE, patterns=list(U.POLICY_TEMPLATE["patterns"]) + [SITE_TERM])


def _w(root, rel, data):
    p = os.path.join(root, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "wb") as f:
        f.write(data if isinstance(data, bytes) else data.encode("utf-8"))
    return p


def make_mini(d, embedded=False):
    """Minimal kit: clean sources unless embedded is set."""
    root = os.path.join(d, "kit")
    helper = "print('ok')\n"
    gates = "PRIV = None  # deny list loads from the external policy\n"
    if embedded:
        gates += "if %r in text:  # embedded policy term\n" % SITE_TERM
    files = {
        "tools/blocks.py": helper,
        "tools/gates_v2.py": gates,
        "tests/common.py": "pass\n",
        "tests/test_T0_freeze.py": "pass\n",
        "tests/test_T1_blocks.py": "pass\n",
        "v1_frozen/frozen.py": "print('frozen')\n",
        "gate.sh": "#!/bin/bash\n# test_bootstrap_ui.py\n",
    }
    for rel, body in files.items():
        _w(root, rel, body)
    frozen_sha = hashlib.sha256(open(os.path.join(root, "v1_frozen", "frozen.py"), "rb").read()).hexdigest()
    _w(root, "v1_frozen/SHA256SUMS", "%s  v1_frozen/frozen.py\n" % frozen_sha)
    files["v1_frozen/SHA256SUMS"] = None
    man = {}
    for rel in sorted(files):
        with open(os.path.join(root, rel), "rb") as f:
            man[rel] = hashlib.sha256(f.read()).hexdigest()
    _w(root, "vendor_manifest.json", json.dumps(man, sort_keys=True) + "\n")
    rec = {"gates": [{"rc": 0}, {"rc": 0}], "vendor_mutant_rejected": True, "vendor_files": len(man)}
    _w(root, "bootstrap_receipt.json", json.dumps(rec, sort_keys=True) + "\n")
    pol = os.path.join(d, "policy.json")
    with open(pol, "wb") as f:
        f.write(U.canon(POLICY_OK))
    return root, pol


def run_cli(*args):
    return subprocess.run([sys.executable, os.path.join(W, "tools", "bootstrap_ui.py")] + list(args),
                          capture_output=True, text=True)


class TBootstrapClean(unittest.TestCase):
    def test_clean_kit_passes(self):
        root, pol = make_mini(tmp())
        rec = U.check(root, pol)
        self.assertEqual(rec["errors"], [])
        self.assertTrue(rec["pass"])
        self.assertEqual(rec["checked"]["vendor_files"], 8)
        self.assertEqual(rec["checked"]["policy_patterns"], len(POLICY_OK["patterns"]))
        self.assertEqual(U.check(root, pol), rec)  # deterministic

    def test_clean_cli_check_passes(self):
        root, pol = make_mini(tmp())
        r = run_cli("--root", root, "--policy", pol, "--check")
        self.assertEqual(r.returncode, 0, r.stderr)
        rec = json.loads(r.stdout)
        self.assertTrue(rec["pass"])
        self.assertEqual(rec, U.check(root, pol))

    def test_receipt_shape_stable(self):
        root, pol = make_mini(tmp())
        rec = U.check(root, pol)
        self.assertEqual(sorted(rec), ["checked", "errors", "pass", "schema", "tool"])
        self.assertEqual(sorted(rec["checked"]), ["policy_patterns", "scanned", "vendor_files"])
        blob = U.canon(rec)
        self.assertEqual(blob, U.canon(json.loads(blob.decode("utf-8"))))


class TBootstrapVendorNotices(unittest.TestCase):
    def test_altered_helper_refuses(self):
        root, pol = make_mini(tmp())
        with open(os.path.join(root, "tools", "blocks.py"), "ab") as f:
            f.write(b" ")
        errs = U.validate_vendor(root)
        self.assertEqual(len(errs), 1)
        self.assertTrue(errs[0].startswith("E_VENDOR_HASH tools/blocks.py"), errs)
        self.assertFalse(U.check(root, pol)["pass"])

    def test_altered_helper_cli_refuses(self):
        root, pol = make_mini(tmp())
        with open(os.path.join(root, "tools", "blocks.py"), "ab") as f:
            f.write(b" ")
        r = run_cli("--root", root, "--policy", pol, "--check")
        self.assertEqual(r.returncode, 4)
        self.assertTrue(any(e.startswith("E_VENDOR_HASH") for e in json.loads(r.stdout)["errors"]))

    def test_missing_helper_refuses(self):
        root, pol = make_mini(tmp())
        os.remove(os.path.join(root, "tools", "blocks.py"))
        errs = U.validate_vendor(root)
        self.assertEqual(errs, ["E_VENDOR_MISSING tools/blocks.py"])

    def test_receipt_gate_refuses(self):
        root, pol = make_mini(tmp())
        rp = os.path.join(root, "bootstrap_receipt.json")
        rec = json.load(open(rp))
        rec["gates"][0]["rc"] = 1
        json.dump(rec, open(rp, "w"), sort_keys=True)
        errs = U.validate_notices(root)
        self.assertEqual(errs, ["E_NOTICE_RECEIPT gate 0 rc != 0"])

    def test_receipt_mutant_flag_refuses(self):
        root, pol = make_mini(tmp())
        rp = os.path.join(root, "bootstrap_receipt.json")
        rec = json.load(open(rp))
        rec["vendor_mutant_rejected"] = False
        json.dump(rec, open(rp, "w"), sort_keys=True)
        self.assertIn("E_NOTICE_RECEIPT vendor_mutant_rejected != true", U.validate_notices(root))

    def test_frozen_hash_refuses(self):
        root, pol = make_mini(tmp())
        with open(os.path.join(root, "v1_frozen", "frozen.py"), "ab") as f:
            f.write(b" ")
        errs = U.validate_notices(root)
        self.assertEqual(errs, ["E_NOTICE_FROZEN hash v1_frozen/frozen.py"])

    def test_gate_listing_refuses(self):
        root, pol = make_mini(tmp())
        _w(root, "gate.sh", "#!/bin/bash\n")
        errs = U.validate_notices(root)
        self.assertEqual(errs, ["E_NOTICE_GATE gate.sh does not list test_bootstrap_ui.py"])


class TBootstrapPolicy(unittest.TestCase):
    def test_embedded_policy_refuses(self):
        root, pol = make_mini(tmp(), embedded=True)
        errs = U.validate_policy(root, pol)[0]
        self.assertEqual(len(errs), 1)
        self.assertNotIn(SITE_TERM, errs[0])
        self.assertTrue(errs[0].startswith("E_POLICY_EMBEDDED tools/gates_v2.py:2 "), errs)
        r = run_cli("--root", root, "--policy", pol, "--check")
        self.assertEqual(r.returncode, 4)

    def test_policy_absent_refuses(self):
        root, _ = make_mini(tmp())
        errs, n = U.validate_policy(root, None)
        self.assertEqual(n, 0)
        self.assertTrue(any(e.startswith("E_POLICY_ABSENT") for e in errs), errs)
        with self.assertRaises(U.PolicyError) as c:
            U.load_policy(os.path.join(root, "no_such_policy.json"))
        self.assertEqual(c.exception.code, "E_POLICY_ABSENT")

    def test_policy_invalid_refuses(self):
        d = tmp()
        bad_schema = os.path.join(d, "bad_schema.json")
        json.dump({"schema": "other", "patterns": ["x"]}, open(bad_schema, "w"))
        with self.assertRaises(U.PolicyError) as c:
            U.load_policy(bad_schema)
        self.assertEqual(c.exception.code, "E_POLICY_INVALID")
        bad_re = os.path.join(d, "bad_re.json")
        json.dump({"schema": U.POLICY_SCHEMA, "patterns": ["(["]}, open(bad_re, "w"))
        with self.assertRaises(U.PolicyError) as c2:
            U.load_policy(bad_re)
        self.assertEqual(c2.exception.code, "E_POLICY_INVALID")
        empty = os.path.join(d, "empty.json")
        json.dump({"schema": U.POLICY_SCHEMA, "patterns": []}, open(empty, "w"))
        with self.assertRaises(U.PolicyError) as c3:
            U.load_policy(empty)
        self.assertEqual(c3.exception.code, "E_POLICY_INVALID")

    def test_init_policy(self):
        d = tmp()
        p = os.path.join(d, "ext_policy.json")
        r = run_cli("--init-policy", p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(open(p, "rb").read(), U.canon(U.POLICY_TEMPLATE))
        self.assertEqual(len(U.load_policy(p)), len(U.POLICY_TEMPLATE["patterns"]))
        r2 = run_cli("--init-policy", p)
        self.assertEqual(r2.returncode, 4)  # refuses to overwrite

    def test_policy_template_committable(self):
        blob = U.canon(U.POLICY_TEMPLATE).decode("utf-8")
        self.assertNotRegex(blob, r"/home/\w")
        self.assertNotIn(SITE_TERM, blob)


class TBootstrapRealKit(unittest.TestCase):
    def test_real_kit_vendor_hashes(self):
        self.assertEqual(U.validate_vendor(W), [])

    def test_real_kit_notices(self):
        self.assertEqual(U.validate_notices(W), [])

    def test_real_kit_embeds_no_template_matches(self):
        pats = [re.compile(x, re.I) for x in U.POLICY_TEMPLATE["patterns"]]
        self.assertEqual(U.find_embedded(W, pats, ["tools/gates_v2.py"]), [])

    def test_embedded_detector_positive_control(self):
        pats = [re.compile(SITE_TERM)]
        root, _ = make_mini(tmp(), embedded=True)
        self.assertEqual(len(U.find_embedded(root, pats)), 1)

    def test_allowlists_only(self):
        for rel in U.RUNTIME_TOOLS + U.RELOCATED_TESTS + U.POLICY_SCAN_FILES:
            self.assertFalse(os.path.isabs(rel), rel)
            self.assertNotIn("..", rel)
            self.assertNotIn("*", rel)
        tree = ast.parse(open(os.path.join(W, "tools", "bootstrap_ui.py"), encoding="utf-8").read())
        calls = set()
        for n in ast.walk(tree):
            if isinstance(n, ast.Attribute):
                calls.add(n.attr)
            elif isinstance(n, ast.Name):
                calls.add(n.id)
        self.assertTrue(calls.isdisjoint({"walk", "glob", "iglob", "rglob", "scandir"}))

    def test_stdlib_only(self):
        tree = ast.parse(open(os.path.join(W, "tools", "bootstrap_ui.py"), encoding="utf-8").read())
        std = set(sys.stdlib_module_names)
        for n in ast.walk(tree):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else []
            for m in mods:
                self.assertIn(m.split(".")[0], std, m)


if __name__ == "__main__":
    unittest.main()
