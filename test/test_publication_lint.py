"""Must-FAIL tests for tools/publication_lint.py: every planted input is built in memory at test time."""
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "tools"))
import publication_lint as L  # noqa: E402


# A made-up private policy: the shipped lint holds no private terms, they come from a file outside the repository.
TERMS = ("Project_Zeta", "northwind")
HOME_USERS = ("zedhost",)


def lint_text(text, name="sample.py", terms=TERMS, home_users=HOME_USERS):
    with tempfile.TemporaryDirectory(prefix="plint") as d:
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            f.write(text)
        errors, _ = L.lint(d, terms, home_users)
    return errors


def split_literals(s):
    return '"%s" "%s"' % (s[:len(s) // 2], s[len(s) // 2:])


def plus_literals(s):
    return "'%s' + '%s'" % (s[:3], s[3:])


def u_escaped(s):
    return '"%s"' % "".join("\\u%04x" % ord(c) for c in s)


def x_escaped(s):
    return '"%s"' % "".join("\\x%02x" % ord(c) for c in s)


def multiline(s):
    return '(\n  "%s"\n  "%s"\n)' % (s[:2], s[2:])


FORMS = (split_literals, plus_literals, u_escaped, x_escaped, multiline)


class TPublicationLint(unittest.TestCase):
    def test_clean_text_passes(self):
        self.assertEqual(lint_text('x = "alpha" "beta"\ny = "\\u0041"\n'), [])

    def test_plain_private_terms_fail(self):
        for term in TERMS:
            self.assertTrue([e for e in lint_text("name = %r\n" % term) if e[0] == "private-term"], term)

    def test_planted_forms_fail(self):
        for term in TERMS:
            for form in FORMS:
                errs = lint_text("value = %s\n" % form(term))
                self.assertTrue([e for e in errs if e[0] == "private-term"], (term, form.__name__))

    def test_term_match_is_case_insensitive(self):
        self.assertTrue(lint_text("v = %s\n" % split_literals(TERMS[0].upper())))

    def test_planted_home_path_forms_fail(self):
        root = L._ROOTS.split("|")[0]
        path = "/%s/zed/x" % root
        for form in FORMS:
            errs = lint_text("p = %s\n" % form(path))
            self.assertTrue([e for e in errs if e[0] == "home-path"], form.__name__)

    def test_host_user_in_home_path_fails(self):
        root = L._ROOTS.split("|")[0]
        for form in FORMS:
            errs = lint_text("p = %s\n" % form("/%s/%s/x" % (root, HOME_USERS[0])))
            self.assertTrue([e for e in errs if e[0] == "private-term"], form.__name__)

    def test_private_key_header_split_fails(self):
        header = "".join(("-----BEGIN RSA PRIV", "ATE KEY-----"))
        self.assertTrue([e for e in lint_text("k = %s\n" % split_literals(header)) if e[0] == "private-key"])

    def test_line_numbers_survive_joins(self):
        term = TERMS[0]
        errs = lint_text("a = 1\nb = %s\nc = 3\n" % multiline(term))
        self.assertEqual({e[2] for e in errs if e[0] == "private-term"}, {3})

    def test_email_identifier_join_is_not_an_email(self):
        self.assertEqual(lint_text("id = 'cap/fold' + '@' + 'e3.g1'\n"), [])

    def test_without_policy_no_private_rule_runs(self):
        self.assertEqual(lint_text("T = %r\n" % TERMS[0], terms=(), home_users=()), [])

    def test_shipped_lint_holds_no_term_list(self):
        self.assertFalse(hasattr(L, "PRIVATE_TERMS"))

    def test_policy_file_is_read(self):
        with tempfile.TemporaryDirectory(prefix="ppol") as d:
            path = os.path.join(d, "policy.txt")
            with open(path, "w", encoding="utf-8") as f:
                f.write("# comment\n%s\n\nhome-user %s\n" % (TERMS[0], HOME_USERS[0]))
            self.assertEqual(L.read_policy(path), ([TERMS[0]], [HOME_USERS[0]]))


if __name__ == "__main__":
    unittest.main()
