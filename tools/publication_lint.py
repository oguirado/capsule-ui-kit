#!/usr/bin/env python3
"""Generic publication lint for a checkout: standard library only, no network, no private policy file.

Usage: python3 -I tools/publication_lint.py [ROOT] [--report-only PREFIX ...] [--private-terms FILE]
Errors (exit 1): absolute home-directory paths, user or host names of the machine running the lint,
e-mail addresses other than the no-reply form, private-key headers, well-known credential token shapes,
and the terms of an optional private policy file.
Private policy: --private-terms FILE, or the file named by the PUBLICATION_PRIVATE_TERMS environment variable.
Keep that file outside the repository. One term per line, "#" starts a comment; a line "home-user NAME" also
flags NAME as the user directory inside a home path. Without a policy file only the generic rules run.
Every file is matched twice (e-mail shapes: as written only): as written, and after normalisation (\\uXXXX, \\UXXXXXXXX, \\xXX and \\/ escapes decoded,
adjacent or "+"-joined string literals merged, newlines preserved), so splitting or escaping a literal does not hide it.
Other encodings (percent, base64, HTML entities, runtime-built strings) are not decoded.
Warnings (exit 0): file names that are not plain ASCII English words.
--report-only PREFIX: findings under that repository-relative prefix are listed as "owner" and never fail the run.
Skipped: node_modules, .git, .proof, starter/dist, router/kit/tmp (gate scratch, git-ignored), .kit-sync-* and __pycache__.
Findings print the rule, the repository-relative file and the line number, never the matched text.
"""
import array
import getpass
import hashlib
import os
import re
import socket
import subprocess
import sys

SKIP_DIRS = {".git", "__pycache__", "node_modules", ".proof", ".venv", "venv"}
SKIP_PREFIXES = ("starter/dist", "router/kit/tmp")
MAX_BYTES = 16_000_000
EMAIL_OK = re.compile(r"(@users\.noreply\.github\.com|@example\.(com|org|net)|^noreply@)", re.I)
GENERIC_NAMES = {"admin", "root", "user", "runner", "localhost", "ubuntu", "debian", "docker", "build", "test"}

# Patterns are assembled from pieces so that this file does not trip the rules it implements.
_ROOTS = "|".join(("ho" + "me", "Us" + "ers", "ro" + "ot"))
RULES = [
    ("home-path", re.compile(r"(?<![\w.\\])/(?:%s)/[\w.-]+" % _ROOTS)),
    ("home-path", re.compile(r"\b[A-Za-z]:\\+Us" + r"ers\\+[\w.-]+", re.I)),
    ("private-key", re.compile("-----BEGIN (?:[A-Z]+ )?PRIV" + "ATE KEY")),
    ("token", re.compile(r"\b(?:AK" + r"IA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,})")),
]
POLICY_ENV = "PUBLICATION_PRIVATE_TERMS"
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
NON_ENGLISH = {"catalogo", "guia", "leeme", "contacto", "licencia", "informe", "resumen", "borrador", "prueba",
               "pruebas", "ejemplo", "entrada", "salida", "ayuda"}

# The one intentional must-FAIL privacy input of the router gate tests: (file, sha256 of the whole stripped line).
ALLOW_LINES = {
    ("router/kit/tests/fixtures/gates/privacy_path.txt",
     "7f01e50d63e7bbc8fcee6888b2517415a78152fccce35f9a21496bcfd3cb99c5"),
}


def read_policy(path):
    """Returns (terms, home_users) from a private policy file kept outside the repository."""
    terms, home_users = [], []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.split("#", 1)[0].strip()
            if not line:
                continue
            if line.startswith("home-user "):
                home_users.append(line[len("home-user "):].strip())
            else:
                terms.append(line)
    return terms, home_users


def private_rules(terms=(), home_users=()):
    rules = []
    if terms:
        rules.append(("private-term", re.compile("|".join(re.escape(t) for t in terms), re.I)))
    if home_users:
        rules.append(("private-term", re.compile(r"(?:/(?:%s)|\\Users)[/\\]+(?:%s)(?![\w.-])"
                                                 % (_ROOTS, "|".join(re.escape(u) for u in home_users)), re.I)))
    return rules


def local_names():
    names = set()
    for get in (getpass.getuser, lambda: socket.gethostname().split(".")[0],
                lambda: subprocess.run(["git", "config", "user.name"], capture_output=True, text=True).stdout.strip()):
        try:
            n = get().strip().lower()
        except Exception:
            continue
        if len(n) >= 5 and n not in GENERIC_NAMES:
            names.add(n)
    return sorted(names)


def name_rx(names):
    if not names:
        return None
    return re.compile(r"(?<![\w])(%s)(?![\w])" % "|".join(re.escape(n) for n in names), re.I)


_ESC = re.compile(r"\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})|\\x([0-9a-fA-F]{2})|\\(/)")
_JOIN = re.compile(r"""(["'])[ \t\r\n]*(?:\+[ \t\r\n]*)?[rRbBuUfF]{0,2}\1""")


def _unescape(m):
    if m.group(4):
        return "/"
    try:
        return chr(int(m.group(1) or m.group(2) or m.group(3), 16))
    except (ValueError, OverflowError):
        return m.group(0)


def _sub(rx, repl, text, lines):
    """re.sub that also carries the source line number of every output character."""
    out, out_lines, pos = [], array.array("I"), 0
    for m in rx.finditer(text):
        out.append(text[pos:m.start()])
        out_lines.extend(lines[pos:m.start()])
        r = repl(m)
        out.append(r)
        out_lines.extend([lines[m.start()]] * len(r))
        pos = m.end()
    out.append(text[pos:])
    out_lines.extend(lines[pos:])
    return "".join(out), out_lines


def normalise(text):
    """Decode numeric escapes and merge adjacent string literals; returns (text, source line number per character)."""
    lines, n = array.array("I"), 1
    for part in text.split("\n"):
        lines.extend([n] * (len(part) + 1))
        n += 1
    del lines[len(text):]
    text, lines = _sub(_ESC, _unescape, text, lines)
    return _sub(_JOIN, lambda m: "", text, lines)


def skipped(rel):
    return rel.startswith(SKIP_PREFIXES) or any(p.startswith(".kit-sync-") for p in rel.split("/"))


def files_under(root):
    for base, dirs, names in os.walk(root):
        rel_base = os.path.relpath(base, root).replace(os.sep, "/")
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith(".kit-sync-")
                         and not skipped(("" if rel_base == "." else rel_base + "/") + d))
        for n in sorted(names):
            yield os.path.join(base, n)


def read_text(path):
    try:
        if os.path.islink(path) or os.path.getsize(path) > MAX_BYTES:
            return None
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return None
    if b"\0" in data:
        return None
    return data.decode("utf-8", errors="replace")


def lint(root, terms=(), home_users=()):
    errors, warnings = [], []
    rules = RULES + private_rules(terms, home_users)
    nrx = name_rx(local_names())
    for path in files_under(root):
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        parts = set(re.split(r"[^a-z]+", os.path.basename(rel).lower()))
        if not rel.isascii() or parts & NON_ENGLISH:
            warnings.append(("file-name", rel, 0))
        text = read_text(path)
        if text is None:
            continue
        allowed = {no for no, raw in enumerate(text.split("\n"), 1)
                   if (rel, hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()) in ALLOW_LINES}
        norm, norm_lines = normalise(text)
        # Views: as written (per line), and normalised (whole text, so joins across lines are seen).
        views = [(raw, [no]) for no, raw in enumerate(text.split("\n"), 1)]
        if norm != text:
            views.append((norm, norm_lines))
        for view, where in views:
            whole = len(where) > 1 or view is norm
            line_of = (lambda i: where[i] if i < len(where) else where[-1]) if whole else (lambda i: where[0])
            raw_view = view is not norm
            for rule, rx in rules:
                for m in rx.finditer(view):
                    errors.append((rule, rel, line_of(m.start()) if whole else where[0]))
            if raw_view:
                # E-mail shapes are matched as written only: joined literals such as 'id' + '@' + 'rev' are identifiers.
                for m in EMAIL.finditer(view):
                    if not EMAIL_OK.search(m.group(0)):
                        errors.append(("email", rel, where[0]))
            if nrx:
                # The handle inside "@handle" (CODEOWNERS) or the no-reply address is the declared public identity.
                for m in nrx.finditer(re.sub(r"@[\w-]+|\+[\w-]+@users\.noreply\.github\.com", lambda k: " " * len(k.group(0)), view)):
                    errors.append(("local-name", rel, line_of(m.start()) if whole else where[0]))
        errors = [e for e in errors if not (e[1] == rel and e[2] in allowed)]
    return sorted(set(errors)), sorted(set(warnings))


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    report_only, rest = [], []
    policy = os.environ.get(POLICY_ENV) or None
    it = iter(argv)
    for a in it:
        if a == "--report-only":
            report_only.append(next(it, "").strip("/"))
        elif a == "--private-terms":
            policy = next(it, "")
        else:
            rest.append(a)
    root = os.path.abspath(rest[0] if rest else os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    terms, home_users = read_policy(policy) if policy else ((), ())
    errors, warnings = lint(root, terms, home_users)
    own = lambda rel: any(rel == p or rel.startswith(p + "/") for p in report_only if p)
    for rule, rel, no in warnings:
        print("warning %s %s" % (rule, rel))
    for rule, rel, no in errors:
        print("%s %s %s:%d" % ("owner" if own(rel) else "error", rule, rel, no))
    fail = [e for e in errors if not own(e[1])]
    print("publication_lint: %d errors, %d owner-reported, %d warnings%s" % (len(fail), len(errors) - len(fail), len(warnings),
                                                                       ", private policy loaded" if policy else ""))
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
