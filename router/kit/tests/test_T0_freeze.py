import hashlib, json, os, subprocess, unittest
from common import *



class T0(unittest.TestCase):
    def test_sha256sums(self):
        r = subprocess.run(["sha256sum", "-c", "v1_frozen/SHA256SUMS"], cwd=W, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(len(r.stdout.strip().split("\n")), 5)

    def test_v1_index_rebuild_identical(self):
        d, root, _ = build_fixture(n_synth=4)
        p = os.path.join(d, "v1ix")
        vocab = os.path.join(W, "v1_frozen", "vocabulary.json")
        script = os.path.join(W, "v1_frozen", "build_index.py")
        r = subprocess.run(["python3", script, "--root", root, "--out", p, "--vocab", vocab], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        r = subprocess.run(["python3", script, "--root", root, "--out", p, "--vocab", vocab, "--check"], capture_output=True, text=True)
        self.assertEqual((r.returncode, r.stdout.strip()), (0, "byte-identical"))


if __name__ == "__main__":
    unittest.main()
