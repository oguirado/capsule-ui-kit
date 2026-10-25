#!/usr/bin/env python3
"""W0-JS per-language extractor: JS + JSDoc public inventory.

Reads explicit allowlisted committed paths only (never a tree scan), masks
comments/strings before any rule runs, and emits one deterministic language
record per file plus {path,symbol,name,line} symbol rows for symbols.jsonl.
Unsupported or ambiguous syntax is an explicit refusal, never a guess.

Admitted export syntax mirrors the in-repo H2-M raw-span grammar (documented
in app/shell/src/main/h2m-book-router.js): named function/class/const/let/var
exports, brace lists with or without `from`, `export * as NS from`, and
`export default` function/class/identifier. Bare `export * from` refuses here
(symbols.jsonl needs enumerable names); H2-M keeps a raw `*` row instead.

Exit codes follow kit convention: 0 admit, 4 refuse, 2 usage.
"""
import argparse
import bisect
import hashlib
import json
import os
import re
import sys

SCHEMA_FILE = "holdings.w0.js-file/v1"
SCHEMA_SUMMARY = "holdings.w0.js-summary/v1"
VERSION = "extract_js.py/1.0"
SCOPE = "app/shell/src"
FILE_RE = re.compile(
    r"^app/shell/src/(main|preload|renderer|renderer-v2|worker|shared)/"
    r"[A-Za-z0-9_./-]+\.js$")
MAX_FILE_BYTES = 262144
MAX_EXPORTS_PER_FILE = 500
DOC_SCAN_CAP = 80

IDENT = r"[A-Za-z_$][A-Za-z0-9_$]*"
EXPORT_RE = re.compile(r"(?:^|[;{}])\s*export\b", re.M)
FROM_RE = re.compile(r"\bfrom\b")
IMPORT_RE = re.compile(r"\bimport\b")
REQUIRE_RE = re.compile(r"(?<![\w$.])require(?=[ \t]*\()")
MARKER_RE = re.compile(
    r"(?<![\w$])(contextBridge|ipcMain|ipcRenderer|postMessage|"
    r"MessagePort|parentPort|workerData)(?![\w$])")
CJS_RE = re.compile(r"(?<![\w$.])(?:module\.exports\b|exports(?=[ \t]*[.\[]))")
DYNAMIC_RES = (
    re.compile(r"(?<![\w$.])eval(?=[ \t]*\()"),
    re.compile(r"(?<![\w$.])new[ \t]+Function(?=[ \t]*\()"),
)
TS_RES = (
    re.compile(r"(?<![\w$.])import[ \t]+type\b"),
    re.compile(r"(?<![\w$.])export[ \t]+(?:type|interface)\b"),
    re.compile(r"(?<![\w$.])interface[ \t]+[A-Za-z_$][\w$]*"),
    re.compile(r"(?<![\w$.])type[ \t]+[A-Za-z_$][\w$]*[ \t]*="),
    re.compile(r"(?<![\w$.])enum[ \t]+[A-Za-z_$][\w$]*"),
    re.compile(r"(?<![\w$.])namespace[ \t]+[A-Za-z_$][\w$]*"),
    re.compile(r"(?<![\w$.])declare[ \t]+(?:const|let|var|function|class|"
               r"module|global|type|interface|enum|namespace)\b"),
    re.compile(r"(?<![\w$.])abstract[ \t]+class\b"),
    re.compile(r"(?<![\w$.])implements\s+[A-Za-z_$]"),
    re.compile(r"(?<![\w$.])satisfies\s+[A-Za-z_$]"),
    re.compile(r"(?<![\w$.])as[ \t]+const\b"),
)
COMMENT_EXPORT_RE = re.compile(r"(?<![\w$.])export\b|module\.exports\b|exports\s*\.|export\s*=")
DECORATOR_RE = re.compile(r"^\s*@[A-Za-z_$][\w$.]*\s*(\([^)]*\))?\s*$")
TYPEDEF_RE = re.compile(r"@typedef\b")
PROP_RE = re.compile(r"@propert(?:y|ies)\b")
ENTRY_RE = re.compile(
    r"^(default|%s)(?:\s+as\s+(default|%s))?$" % (IDENT, IDENT), re.S)
CONTINUE_STARTS = set("([{`+-*/.:?=")
VALUE_STARTERS = set("([{-+/!~")
REGEX_KEYWORDS = frozenset((
    "return", "typeof", "instanceof", "in", "of", "new", "delete",
    "void", "throw", "case", "do", "else", "yield", "await"))
REGEX_PREV_CHARS = set("=(:,[!&|?{};+-*<>~^%")


def sha(b):
    return hashlib.sha256(b).hexdigest()


def dumps(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canon(o):
    return (dumps(o) + "\n").encode("utf-8")


def _line_starts(text):
    starts = [0]
    for m in re.finditer("\n", text):
        starts.append(m.end())
    return starts


def _byte_table(text):
    offs = [0] * (len(text) + 1)
    b = 0
    for i, ch in enumerate(text):
        offs[i] = b
        b += len(ch.encode("utf-8"))
    offs[len(text)] = b
    return offs


class _Refuse(Exception):
    def __init__(self, code, off, detail=""):
        super().__init__(code)
        self.code, self.off, self.detail = code, off, detail


def _is_regex_start(text, i):
    """Heuristic: is text[i] == '/' opening a regex, not division?"""
    k = i - 1
    while k >= 0 and text[k] in " \t\r\n":
        k -= 1
    if k < 0:
        return True
    c = text[k]
    if c in REGEX_PREV_CHARS:
        if c in "+-" and k - 1 >= 0 and text[k - 1] == c:
            return False  # post ++/--, then division
        return True
    if c == ">" and k - 1 >= 0 and text[k - 1] == "=":
        return True  # arrow function body
    if c.isalnum() or c in "_$":
        e = k + 1
        while k >= 0 and (text[k].isalnum() or text[k] in "_$"):
            k -= 1
        return text[k + 1:e] in REGEX_KEYWORDS
    return False


def _lex(text):
    """Mask comments/strings/templates; offsets and newlines preserved.

    Returns (masked, comments, line_starts, lex_errors, tpl_spans).
    comments holds (start, end, start_line0) for every block comment;
    tpl_spans holds (start, end) for every template literal. Template
    holes ${...} stay code; nested templates handled via the frame stack.
    lex_errors holds offsets of unterminated literals (refusals).
    """
    n = len(text)
    masked = list(text)
    comments = []
    lex_errors = []
    tpl_spans = []
    line_starts = _line_starts(text)

    def line0(off):
        return bisect.bisect_right(line_starts, off) - 1

    stack = [["code", 0]]
    mode = "code"  # code | line | block | sq | dq
    block_start = 0
    str_start = 0
    i = 0
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if mode == "line":
            masked[i] = "\n" if c == "\n" else " "
            if c == "\n":
                mode = "code"
            i += 1
            continue
        if mode == "block":
            if c == "*" and nxt == "/":
                masked[i] = " "
                masked[i + 1] = " "
                comments.append((block_start, i + 2, line0(block_start)))
                mode = "code"
                i += 2
            else:
                if c != "\n":
                    masked[i] = " "
                i += 1
            continue
        if mode in ("sq", "dq"):
            q = "'" if mode == "sq" else '"'
            if c == "\\" and i + 1 < n:
                masked[i] = " "
                if text[i + 1] != "\n":
                    masked[i + 1] = " "
                i += 2
                continue
            if c != "\n":
                masked[i] = " "
            i += 1
            if c == q:
                mode = "code"
            elif c == "\n":
                lex_errors.append(str_start)
                mode = "code"
            continue
        if stack[-1][0] == "tpl":
            if c == "`":
                masked[i] = " "
                tpl_spans.append((stack.pop()[1], i + 1))
                i += 1
                continue
            if c == "\\" and i + 1 < n:
                masked[i] = " "
                if text[i + 1] != "\n":
                    masked[i + 1] = " "
                i += 2
                continue
            if c == "$" and nxt == "{":
                masked[i] = " "
                masked[i + 1] = " "
                stack.append(["code", 0])
                i += 2
                continue
            if c != "\n":
                masked[i] = " "
            i += 1
            continue
        if c == "/" and nxt == "/":
            masked[i] = " "
            masked[i + 1] = " "
            mode = "line"
            i += 2
            continue
        if c == "/" and nxt == "*":
            masked[i] = " "
            masked[i + 1] = " "
            mode = "block"
            block_start = i
            i += 2
            continue
        if c in "'\"":
            masked[i] = " "
            str_start = i
            mode = "sq" if c == "'" else "dq"
            i += 1
            continue
        if c == "`":
            masked[i] = " "
            stack.append(["tpl", i])
            i += 1
            continue
        if c == "/" and nxt not in ("", "/", "*") and _is_regex_start(text, i):
            masked[i] = " "
            rx_start = i
            i += 1
            in_class = False
            while i < n:
                d = text[i]
                if d == "\n":
                    lex_errors.append(rx_start)
                    break
                if d == "\\" and i + 1 < n:
                    masked[i] = " "
                    if text[i + 1] != "\n":
                        masked[i + 1] = " "
                    i += 2
                    continue
                if d == "[":
                    in_class = True
                elif d == "]":
                    in_class = False
                elif d == "/" and not in_class:
                    masked[i] = " "
                    i += 1
                    while i < n and "a" <= text[i] <= "z":
                        masked[i] = " "
                        i += 1
                    break
                elif d != "\n":
                    masked[i] = " "
                i += 1
            continue
        if c == "{":
            stack[-1][1] += 1
        elif c == "}":
            if stack[-1][1] > 0:
                stack[-1][1] -= 1
            elif len(stack) > 1:
                masked[i] = " "
                stack.pop()
        i += 1
    if mode == "block":
        comments.append((block_start, n, line0(block_start)))
        lex_errors.append(block_start)
    if mode in ("sq", "dq"):
        lex_errors.append(str_start)
    for frame in reversed(stack):
        if frame[0] == "tpl":
            lex_errors.append(frame[1])
            break
    return "".join(masked), comments, line_starts, lex_errors, tpl_spans


def _depths(masked):
    """Brace depth before each offset (masked text has no strings)."""
    out = [0] * (len(masked) + 1)
    d = 0
    for i, c in enumerate(masked):
        out[i] = d
        if c == "{":
            d += 1
        elif c == "}":
            d = max(0, d - 1)
    out[len(masked)] = d
    return out


def _skip_ws(masked, i):
    while i < len(masked) and masked[i] in " \t\r\n":
        i += 1
    return i


def _read_ident(masked, i):
    m = re.compile(IDENT).match(masked, i)
    return (m.group(0), m.end()) if m else (None, i)


def _read_word(masked, i):
    m = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*").match(masked, i)
    return (m.group(0), m.end()) if m else (None, i)


def _match_close(masked, i):
    """Match the bracket at i; returns offset past its closer or None."""
    pairs = {"(": ")", "[": "]", "{": "}"}
    want = pairs.get(masked[i] if i < len(masked) else "")
    if not want:
        return None
    depth = 0
    for j in range(i, len(masked)):
        if masked[j] == masked[i]:
            depth += 1
        elif masked[j] == want:
            depth -= 1
            if depth == 0:
                return j + 1
    return None


def _peek_next(masked, text, j):
    """Next significant item at/after j: (kind, char, offset).

    kinds: code, str (quoted/regex content), tpl (template), eof.
    Comments are whitespace and skipped transparently.
    """
    k = j
    n = len(masked)
    while k < n:
        mc, tc = masked[k], text[k]
        if mc not in " \t\r\n":
            return ("code", mc, k)
        if tc in " \t\r\n":
            k += 1
            continue
        if tc in "'\"":
            return ("str", tc, k)
        if tc == "`":
            return ("tpl", tc, k)
        if tc == "/" and k + 1 < n and text[k + 1] == "/":
            while k < n and text[k] != "\n":
                k += 1
            continue
        if tc == "/" and k + 1 < n and text[k + 1] == "*":
            e = text.find("*/", k + 2)
            k = n if e < 0 else e + 2
            continue
        return ("str", tc, k)  # regex or template text: value content
    return ("eof", "", k)


def _in_spans(starts, spans, j):
    i = bisect.bisect_right(starts, j) - 1
    return i >= 0 and spans[i][0] <= j < spans[i][1]


def _scan_end(masked, text, i, kw, spans, starts):
    """End a ;-terminated statement tail with ASI fallback.

    The caller starts right after an identifier, so the line is complete
    until an operator says otherwise. Returns the offset just past the
    last statement char. A newline inside a comment/template span never
    ends the statement; a broken line (operator then a token that cannot
    be its operand) is E_JS_SYNTAX, never silent swallowing.
    """
    n = len(masked)
    pd = bd = sd = 0
    last_off = None
    complete = True
    j = i
    while j < n:
        c = masked[j]
        if c == "(":
            pd += 1
        elif c == ")":
            pd = max(0, pd - 1)
        elif c == "{":
            bd += 1
        elif c == "}":
            bd = max(0, bd - 1)
        elif c == "[":
            sd += 1
        elif c == "]":
            sd = max(0, sd - 1)
        if pd == 0 and bd == 0 and sd == 0:
            if c == ";":
                return j + 1
            if c == "\n" and not _in_spans(starts, spans, j):
                kind, ch, k = _peek_next(masked, text, j)
                if complete:
                    if kind == "eof":
                        return last_off + 1 if last_off is not None else i
                    if kind in ("tpl", "str") and ch in "`/":
                        pass  # tagged template / division continues
                    elif kind == "str":
                        return last_off + 1 if last_off is not None else i
                    elif kind == "code" and ch in CONTINUE_STARTS:
                        pass
                    else:
                        return last_off + 1 if last_off is not None else i
                else:
                    if kind == "eof":
                        return last_off + 1 if last_off is not None else i
                    if kind in ("str", "tpl"):
                        pass  # the missing operand is a literal
                    elif kind == "code":
                        if ch.isalnum() or ch in "_$":
                            wk, _ = _read_word(masked, k)
                            if wk in ("export", "import"):
                                raise _Refuse("E_JS_SYNTAX", j, "broken line")
                        elif ch not in VALUE_STARTERS:
                            raise _Refuse("E_JS_SYNTAX", j, "broken line")
        if c not in " \t\r\n":
            last_off = j
            complete = c.isalnum() or c in "_$)]}"
        j += 1
    return last_off + 1 if last_off is not None else i


def _params_have_rail(params):
    """Bare ':' type annotation in exported-function params (ternary-aware)."""
    depth = 0
    questions = []
    i = 0
    while i < len(params):
        c = params[i]
        if c in "([{":
            depth += 1
        elif c in ")]}":
            depth = max(0, depth - 1)
        elif depth == 0:
            if c == "?":
                rest = params[i + 1:].lstrip(" \t")
                if rest[:1] in (",", ")"):
                    return True  # TS optional marker
                questions.append(i)
            elif c == ",":
                questions = []
            elif c == ":":
                if not questions:
                    return True
                q = questions.pop()
                if params[q + 1:i].strip(" \t") == "":
                    return True  # '?:' optional annotation, not a ternary
        i += 1
    return False


class _Cx:
    def __init__(self, rel, raw, text, masked, comments, line_starts, boffs,
                 depths, ski_spans):
        self.rel = rel
        self.raw = raw
        self.text = text
        self.masked = masked
        self.comments = comments
        self.line_starts = line_starts
        self.boffs = boffs
        self.depths = depths
        self.ski_spans = tuple(sorted(ski_spans))
        self.ski_starts = [s for s, _ in self.ski_spans]
        self.c_spans = tuple(sorted((s, e) for s, e, _ in comments))
        self.c_starts = [s for s, _ in self.c_spans]
        self.lines = text.split("\n")
        self.rows = []
        self.errors = []

    def scan_end(self, i, kw):
        return _scan_end(self.masked, self.text, i, kw,
                         self.ski_spans, self.ski_starts)

    def line1(self, off):
        return bisect.bisect_right(self.line_starts, off)

    def err(self, code, off, detail=""):
        where = "%s:%d" % (self.rel, self.line1(off))
        self.errors.append(code + " " + where + ((" " + detail) if detail else ""))

    def absorb(self, at0):
        """Doc/decorator span start (0-based) plus JSDoc flag; H2-M parity."""
        start = at0
        while start - 1 >= 0 and DECORATOR_RE.match(self.lines[start - 1] if start - 1 < len(self.lines) else ""):
            start -= 1
        jsdoc = False
        if start - 1 >= 0 and re.search(r"\*/\s*$", self.lines[start - 1]):
            for k in range(start - 1, max(-1, start - 1 - DOC_SCAN_CAP), -1):
                if "/**" in self.lines[k]:
                    jsdoc = True
                    start = k
                    break
                if "/*" in self.lines[k]:
                    start = k
                    break
        return start, jsdoc

    def span(self, start0, end_off):
        end_line0 = self.line1(max(0, end_off - 1)) - 1
        s = self.boffs[self.line_starts[start0]]
        e = self.boffs[end_off]
        return {"start_line": start0 + 1, "end_line": end_line0 + 1,
                "start_byte": s, "end_byte": e,
                "sha256": sha(self.raw[s:e])}

    def add(self, name, kind, local, frm, jsdoc, line_off, start0, end_off):
        self.rows.append({"name": name, "kind": kind, "local": local,
                          "from": frm, "jsdoc": jsdoc,
                          "line": self.line1(line_off), "span": self.span(start0, end_off)})

    def read_string(self, j):
        """Read a '...' specifier from original text at masked offset j."""
        if j >= len(self.text) or self.text[j] not in "'\"":
            return None, j
        q = self.text[j]
        k = j + 1
        while k < len(self.text) and self.text[k] != q:
            if self.text[k] == "\\":
                k += 1
            k += 1
        if k >= len(self.text):
            return None, j
        return self.text[j + 1:k], k + 1

    def tail_complete(self, a, b):
        m, t = self.masked, self.text
        e = min(b, len(m))
        while True:
            while e > a and m[e - 1] in " \t\r\n" and t[e - 1] in " \t\r\n":
                e -= 1
            if e > a and m[e - 1] == ";":
                e -= 1
                continue
            if e > a and m[e - 1] in " \t\r\n" and t[e - 1] not in " \t\r\n":
                if _in_spans(self.c_starts, self.c_spans, e - 1):
                    e -= 1  # comments are transparent: look past them
                    continue
                return True  # ends inside a string value
            break
        if e <= a:
            return True
        last = m[e - 1]
        return last.isalnum() or last in "_$)]}"

    def skip_trivia(self, i):
        """Skip whitespace/comments in masked text without crossing strings."""
        m, t = self.masked, self.text
        n = len(m)
        while i < n:
            if m[i] not in " \t\r\n":
                return i
            if t[i] in " \t\r\n":
                i += 1
                continue
            if t[i] == "/" and i + 1 < n and t[i + 1] == "/":
                while i < n and t[i] != "\n":
                    i += 1
                continue
            if _in_spans(self.c_starts, self.c_spans, i):
                idx = bisect.bisect_right(self.c_starts, i) - 1
                i = self.c_spans[idx][1]
                continue
            return i  # masked string content: do not cross
        return i

    def has_init(self, i):
        """A plain '=' initializer follows the declarator name."""
        m = self.masked
        for r in (self._skip_same_line(i), _skip_ws(m, i)):
            if r < len(m) and m[r] == "=" and (r + 1 >= len(m) or m[r + 1] not in "=>"):
                return True
        return False

    def _skip_same_line(self, i):
        m = self.masked
        while i < len(m) and m[i] in " \t":
            i += 1
        return i

    def split_top(self, a, b):
        """Split masked[a:b] on depth-0 commas; yields (start, end) pairs."""
        out = []
        pd = bd = sd = 0
        s = a
        for j in range(a, min(b, len(self.masked))):
            c = self.masked[j]
            if c == "(":
                pd += 1
            elif c == ")":
                pd = max(0, pd - 1)
            elif c == "{":
                bd += 1
            elif c == "}":
                bd = max(0, bd - 1)
            elif c == "[":
                sd += 1
            elif c == "]":
                sd = max(0, sd - 1)
            elif c == "," and pd == 0 and bd == 0 and sd == 0:
                out.append((s, j))
                s = j + 1
        out.append((s, min(b, len(self.masked))))
        return out

    def body_end(self, j, kw_off):
        """Offset past a function/class body starting the search at j."""
        m = self.masked
        pd = bd = sd = 0
        k = j
        while k < len(m):
            c = m[k]
            if c == "(":
                pd += 1
            elif c == ")":
                pd = max(0, pd - 1)
            elif c == "[":
                sd += 1
            elif c == "]":
                sd = max(0, sd - 1)
            elif c == "{" and pd == 0 and bd == 0 and sd == 0:
                end = _match_close(m, k)
                if end is None:
                    raise _Refuse("E_JS_SYNTAX", kw_off, "unbalanced body")
                return end
            elif c == "{":
                bd += 1
            elif c == "}":
                bd = max(0, bd - 1)
                if pd == 0 and bd == 0 and sd == 0:
                    break
            elif c == ";" and pd == 0 and bd == 0 and sd == 0:
                break
            k += 1
        raise _Refuse("E_JS_SYNTAX", kw_off, "missing body")

    def check_ts_after_name(self, j, kw_off, what):
        j = _skip_ws(self.masked, j)
        if j < len(self.masked) and self.masked[j] == "<":
            raise _Refuse("E_JS_TYPESCRIPT", kw_off, what + " type parameters")
        return j

    def parse_named(self, kw, kw_end, kind, async_ok):
        m = self.masked
        j = _skip_ws(m, kw_end)
        if async_ok:
            w, j2 = _read_word(m, j)
            if w == "async":
                j = _skip_ws(m, j2)
        if m.startswith("function", j) and (j + 8 >= len(m) or not m[j + 8].isalnum() and m[j + 8] not in "_$"):
            is_fn = True
            j += 8
        elif m.startswith("class", j) and (j + 5 >= len(m) or not m[j + 5].isalnum() and m[j + 5] not in "_$"):
            is_fn = False
            j += 5
        else:
            raise _Refuse("E_JS_SYNTAX", kw, "expected function or class")
        j = _skip_ws(m, j)
        if j < len(m) and m[j] == "*":
            raise _Refuse("E_JS_SYNTAX", kw, "generators unsupported")
        name, j = _read_ident(m, j)
        if not name:
            raise _Refuse("E_JS_SYNTAX", kw, "missing name")
        j = self.check_ts_after_name(j, kw, kind)
        if is_fn:
            if j >= len(m) or m[j] != "(":
                raise _Refuse("E_JS_SYNTAX", kw, "missing params")
            close = _match_close(m, j)
            if close is None:
                raise _Refuse("E_JS_SYNTAX", kw, "unbalanced params")
            if _params_have_rail(m[j + 1:close - 1]):
                raise _Refuse("E_JS_TYPESCRIPT", kw, "param annotation")
            j = _skip_ws(m, close)
            if j < len(m) and m[j] == ":":
                raise _Refuse("E_JS_TYPESCRIPT", kw, "return annotation")
        end = self.body_end(j, kw)
        start0, jsdoc = self.absorb(self.line1(kw) - 1)
        self.add(name, kind, None, None, jsdoc, kw, start0, end)

    def parse_declarators(self, kw, kw_end, kind):
        m = self.masked
        j = _skip_ws(m, kw_end)
        if j < len(m) and m[j] in "{[":
            raise _Refuse("E_JS_DESTRUCTURE", kw, "destructured declarator")
        names = []
        pos = j
        end = None
        while True:
            p = _skip_ws(m, pos)
            if p < len(m) and m[p] in "{[":
                raise _Refuse("E_JS_DESTRUCTURE", kw, "destructured declarator")
            name, q = _read_ident(m, p)
            if not name:
                raise _Refuse("E_JS_SYNTAX", kw, "expected declarator")
            q = _skip_ws(m, q)
            if q < len(m) and m[q] == ":":
                raise _Refuse("E_JS_TYPESCRIPT", kw, "declarator annotation")
            if kind == "const" and not self.has_init(p + len(name)):
                raise _Refuse("E_JS_SYNTAX", kw, "const needs initializer")
            names.append((name, p))
            tail = self.scan_end(q, kw)
            seg = m[q:tail]
            comma = None
            pd = bd = sd = 0
            for t, c in enumerate(seg):
                if c == "(":
                    pd += 1
                elif c == ")":
                    pd = max(0, pd - 1)
                elif c == "{":
                    bd += 1
                elif c == "}":
                    bd = max(0, bd - 1)
                elif c == "[":
                    sd += 1
                elif c == "]":
                    sd = max(0, sd - 1)
                elif c == "," and pd == 0 and bd == 0 and sd == 0:
                    comma = q + t
                    break
            if comma is None:
                if not self.tail_complete(q, tail):
                    raise _Refuse("E_JS_SYNTAX", kw, "incomplete declarator")
                end = tail
                break
            if not self.tail_complete(q, comma):
                raise _Refuse("E_JS_SYNTAX", kw, "incomplete declarator")
            pos = comma + 1
        start0, jsdoc = self.absorb(self.line1(kw) - 1)
        for name, off in names:
            self.add(name, kind, None, None, jsdoc, off, start0, end)

    def parse_braces(self, kw, kw_end):
        m = self.masked
        j = _skip_ws(m, kw_end)
        close = _match_close(m, j)
        if close is None:
            raise _Refuse("E_JS_SYNTAX", kw, "unbalanced brace list")
        entries = []
        for a, b in self.split_top(j + 1, close - 1):
            piece = m[a:b].strip(" \t\r\n")
            if not piece:
                continue
            em = ENTRY_RE.match(piece)
            if not em:
                raise _Refuse("E_JS_SYNTAX", kw, "bad brace entry")
            imported, exported = em.group(1), em.group(2) or em.group(1)
            lead = len(m[a:b]) - len(m[a:b].lstrip(" \t\r\n"))
            if em.group(2):
                am = re.search(r"\bas\b", piece)
                nm = re.search(r"\b%s\b" % re.escape(exported), piece[am.end():])
                off = a + lead + am.end() + nm.start()
            else:
                nm = re.search(r"\b%s\b" % re.escape(exported), piece)
                off = a + lead + nm.start()
            entries.append((imported, exported, off))
        k = _skip_ws(m, close)
        frm = None
        w, w_end = _read_word(m, k)
        if w == "from":
            k2 = self.skip_trivia(w_end)
            spec, k3 = self.read_string(k2)
            if spec is None:
                raise _Refuse("E_JS_SYNTAX", kw, "bad from specifier")
            frm = spec
            k4 = _skip_ws(m, k3)
            end = k4 + 1 if (k4 < len(m) and m[k4] == ";") else k3
        else:
            end = k + 1 if (k < len(m) and m[k] == ";") else close
        if not entries:
            return  # `export {}` declares nothing: valid, zero rows
        start0, jsdoc = self.absorb(self.line1(kw) - 1)
        for imported, exported, off in entries:
            kind = "default" if exported == "default" else ("reexport" if frm else "local")
            self.add(exported, kind, None if imported == exported else imported,
                     frm, jsdoc, off, start0, end)

    def parse_star(self, kw, kw_end):
        m = self.masked
        j = _skip_ws(m, kw_end + 1)
        w, w_end = _read_word(m, j)
        if w == "as":
            k = _skip_ws(m, w_end)
            ns, k2 = _read_ident(m, k)
            if not ns:
                raise _Refuse("E_JS_SYNTAX", kw, "missing namespace name")
            k3 = _skip_ws(m, k2)
            w2, w2_end = _read_word(m, k3)
            if w2 != "from":
                raise _Refuse("E_JS_SYNTAX", kw, "namespace needs from")
            k4 = self.skip_trivia(w2_end)
            spec, k5 = self.read_string(k4)
            if spec is None:
                raise _Refuse("E_JS_SYNTAX", kw, "bad from specifier")
            k6 = _skip_ws(m, k5)
            end = k6 + 1 if (k6 < len(m) and m[k6] == ";") else k5
            start0, jsdoc = self.absorb(self.line1(kw) - 1)
            self.add(ns, "namespace", None, spec, jsdoc, k, start0, end)
        elif w == "from":
            raise _Refuse("E_JS_AMBIGUOUS_STAR", kw, "star hides owners")
        else:
            raise _Refuse("E_JS_SYNTAX", kw, "bad star export")

    def parse_default(self, kw, kw_end):
        m = self.masked
        j = _skip_ws(m, kw_end)
        w, w_end = _read_word(m, j)
        if w == "async":
            j = _skip_ws(m, w_end)
            w, w_end = _read_word(m, j)
            if w != "function":
                raise _Refuse("E_JS_DEFAULT", kw, "bad async default")
        if w in ("function", "class"):
            k = _skip_ws(m, w_end)
            if k < len(m) and m[k] == "*":
                raise _Refuse("E_JS_DEFAULT", kw, "complex default")
            name, k2 = _read_ident(m, k)
            if not name:
                raise _Refuse("E_JS_DEFAULT", kw, "anonymous default")
            k3 = self.check_ts_after_name(k2, kw, "default")
            if w == "function":
                if k3 >= len(m) or m[k3] != "(":
                    raise _Refuse("E_JS_DEFAULT", kw, "complex default")
                close = _match_close(m, k3)
                if close is None:
                    raise _Refuse("E_JS_SYNTAX", kw, "unbalanced params")
                if _params_have_rail(m[k3 + 1:close - 1]):
                    raise _Refuse("E_JS_TYPESCRIPT", kw, "param annotation")
                k4 = _skip_ws(m, close)
                if k4 < len(m) and m[k4] == ":":
                    raise _Refuse("E_JS_TYPESCRIPT", kw, "return annotation")
                end = self.body_end(k4, kw)
            else:
                end = self.body_end(k3, kw)
            start0, jsdoc = self.absorb(self.line1(kw) - 1)
            self.add("default", "default", name, None, jsdoc, kw, start0, end)
            return
        if w and w not in ("true", "false", "null", "this", "new", "typeof", "void", "delete"):
            end = self.scan_end(w_end, kw)
            tail = m[w_end:end].strip(" \t\r\n").rstrip(";").strip(" \t\r\n")
            if tail:
                raise _Refuse("E_JS_DEFAULT", kw, "complex default")
            if not self.tail_complete(w_end, end):
                raise _Refuse("E_JS_SYNTAX", kw, "incomplete default")
            start0, jsdoc = self.absorb(self.line1(kw) - 1)
            self.add("default", "default", w, None, jsdoc, kw, start0, end)
            return
        raise _Refuse("E_JS_DEFAULT", kw, "complex default")

    def parse_one(self, kw):
        m = self.masked
        kw_end = kw + 6
        depth = self.depths[kw] if kw < len(self.depths) else 0
        j = _skip_ws(m, kw_end)
        c = m[j] if j < len(m) else ""
        if c == "=":
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            raise _Refuse("E_JS_EXPORT_EQUALS", kw, "export equals")
        w, _ = _read_word(m, j)
        if w == "default":
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_default(kw, j + 7)
            return
        if w in ("async", "function"):
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_named(kw, kw_end, "function", True)
            return
        if w == "class":
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_named(kw, kw_end, "class", False)
            return
        if w in ("const", "let", "var"):
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_declarators(kw, j + len(w), w)
            return
        if c == "{":
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_braces(kw, kw_end)
            return
        if c == "*":
            if depth > 0:
                raise _Refuse("E_JS_SYNTAX", kw, "export off top level")
            self.parse_star(kw, j)
            return
        if w in ("type", "interface"):
            raise _Refuse("E_JS_TYPESCRIPT", kw, "type export")
        if depth > 0 and c in "(:":
            return  # method or property named 'export', not a statement
        raise _Refuse("E_JS_SYNTAX", kw, "unrecognized export")

    def parse_exports(self):
        for em in EXPORT_RE.finditer(self.masked):
            kw = em.start() + em.group(0).rfind("export")
            try:
                self.parse_one(kw)
            except _Refuse as r:
                self.err(r.code, r.off, r.detail)

    def scan_globals(self):
        for rx in TS_RES:
            for gm in rx.finditer(self.masked):
                self.err("E_JS_TYPESCRIPT", gm.start(), "marker " + gm.group(0).strip())
        for gm in CJS_RE.finditer(self.masked):
            self.err("E_JS_COMMONJS", gm.start(), gm.group(0).strip())
        for rx in DYNAMIC_RES:
            for gm in rx.finditer(self.masked):
                self.err("E_JS_DYNAMIC", gm.start(), gm.group(0).strip() + "(...)")

    def balanced_end(self, text, i):
        """Offset past the balanced {...} opened at i, quote-aware."""
        if i >= len(text) or text[i] != "{":
            return None
        depth = 0
        j = i
        while j < len(text):
            c = text[j]
            if c in "'\"":
                q = c
                j += 1
                while j < len(text) and text[j] != q:
                    if text[j] == "\\":
                        j += 1
                    j += 1
                j += 1
                continue
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return j + 1
            j += 1
        return None

    def scan_typedefs(self):
        out = []
        for start, end, _ in self.comments:
            if self.text[start:start + 3] != "/**":
                continue
            if start < len(self.depths) and self.depths[start] != 0:
                continue  # nested typedefs are not file-public
            body = self.text[start:end]
            for tm in TYPEDEF_RE.finditer(body):
                p = tm.end()
                while p < len(body) and body[p] in " \t\r\n*":
                    # same-tag gap only: stop at the next line's tag
                    if body[p] == "\n":
                        q = p + 1
                        while q < len(body) and body[q] in " \t*":
                            q += 1
                        if body[q:q + 1] == "@":
                            break
                    p += 1
                if p < len(body) and body[p] == "{":
                    be = self.balanced_end(body, p)
                    if be is None:
                        continue
                    p = be
                    while p < len(body) and body[p] in " \t":
                        p += 1
                im = re.compile(IDENT).match(body, p)
                if not im:
                    continue
                props = []
                for pm in PROP_RE.finditer(body):
                    q = pm.end()
                    while q < len(body) and body[q] in " \t":
                        q += 1
                    if q < len(body) and body[q] == "{":
                        be = self.balanced_end(body, q)
                        if be is None:
                            continue
                        q = be
                        while q < len(body) and body[q] in " \t":
                            q += 1
                    if q < len(body) and body[q] == "[":
                        q += 1
                    nm = re.compile(IDENT).match(body, q)
                    if nm:
                        props.append(nm.group(0))
                out.append({"name": im.group(0),
                            "line": self.line1(start + tm.start()),
                            "props": props})
        return out

    def spec_at(self, j):
        """Module specifier after from/import/require at masked offset j."""
        j = self.skip_trivia(j)
        if self.masked[j:j + 1] != " " or self.text[j:j + 1] not in "'\"":
            return None  # not a masked string: identifier use, not a module
        return self.read_string(j)[0]

    def scan_boundary(self, context):
        markers = set()
        for mm in MARKER_RE.finditer(self.masked):
            markers.add(mm.group(1))
        for mm in REQUIRE_RE.finditer(self.masked):
            markers.add("require")
        node_imports = set()
        for mm in FROM_RE.finditer(self.masked):
            spec = self.spec_at(mm.end())
            if spec is None:
                continue
            if spec.startswith("node:"):
                node_imports.add(spec)
            elif spec == "electron" or spec.startswith("electron/"):
                markers.add("electron")
        for mm in IMPORT_RE.finditer(self.masked):
            j = self.skip_trivia(mm.end())
            if self.text[j:j + 1] in "'\"" and self.masked[j:j + 1] == " ":
                spec = self.read_string(j)[0]
                if spec is not None:
                    if spec.startswith("node:"):
                        node_imports.add(spec)
                    elif spec == "electron" or spec.startswith("electron/"):
                        markers.add("electron")
        for mm in REQUIRE_RE.finditer(self.masked):
            j = self.skip_trivia(mm.end())
            if j < len(self.masked) and self.masked[j] == "(":
                spec = self.spec_at(j + 1)
                if spec == "electron" or (spec or "").startswith("electron/"):
                    markers.add("electron")
                elif (spec or "").startswith("node:"):
                    node_imports.add(spec)
        return {"context": context, "markers": sorted(markers),
                "node_imports": sorted(node_imports)}


def extract_file(root, rel, max_bytes=MAX_FILE_BYTES, max_exports=MAX_EXPORTS_PER_FILE):
    """Extract one allowlisted file. Returns (record, symbols, errors)."""
    m = FILE_RE.match(rel)
    if not m:
        return None, [], ["E_JS_SCOPE %s out of scope" % rel]
    path = os.path.join(root, rel)
    base = os.path.realpath(root)
    if os.path.realpath(path) != base and not os.path.realpath(path).startswith(base + os.sep):
        return None, [], ["E_JS_SYMLINK %s escapes root" % rel]
    if not os.path.isfile(path):
        return None, [], ["E_JS_MISSING %s not a file" % rel]
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) > max_bytes:
        return None, [], ["E_JS_BYTES %s:0 %d bytes" % (rel, len(raw))]
    digest = sha(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        return None, [], ["E_JS_UTF8 %s:0 %s" % (rel, e)]
    masked, comments, line_starts, lex_errors, tpl_spans = _lex(text)
    ski = [(s, e) for s, e, _ in comments] + tpl_spans
    cx = _Cx(rel, raw, text, masked, comments, line_starts,
             _byte_table(text), _depths(masked), ski)
    for off in lex_errors:
        cx.err("E_JS_SYNTAX", off, "unterminated literal")
    cx.scan_globals()
    cx.parse_exports()
    if len(cx.rows) > max_exports:
        cx.err("E_JS_TOO_MANY", kw_off(cx, max_exports),
               "%d exports" % len(cx.rows))
    if not cx.rows and not cx.errors:
        if COMMENT_EXPORT_RE.search(text):
            cx.err("E_JS_COMMENT_ONLY", 0, "export evidence only in prose")
    if cx.errors:
        return None, [], sorted(set(cx.errors))
    seen = {}
    for r in cx.rows:
        if r["name"] in seen:
            cx.errors.append("E_JS_DUPLICATE %s:%d %s also at line %d"
                             % (rel, r["line"], r["name"], seen[r["name"]]))
        else:
            seen[r["name"]] = r["line"]
    if cx.errors:
        return None, [], sorted(set(cx.errors))
    typedefs = cx.scan_typedefs()
    record = {"schema": SCHEMA_FILE, "file": rel, "file_sha256": digest,
              "exports": cx.rows, "typedefs": typedefs,
              "boundary": cx.scan_boundary(m.group(1))}
    symbols = [{"path": rel, "symbol": r["name"],
                "name": r["local"] or r["name"], "line": r["line"]} for r in cx.rows]
    return record, symbols, []


def kw_off(cx, index):
    for em in EXPORT_RE.finditer(cx.masked):
        if index == 0:
            return em.start() + em.group(0).rfind("export")
        index -= 1
    return 0


def run(root, allow_path, out_path, sym_path,
        max_bytes=MAX_FILE_BYTES, max_exports=MAX_EXPORTS_PER_FILE):
    try:
        with open(allow_path, "rb") as f:
            allow_raw = f.read()
    except OSError:
        return {"schema": SCHEMA_SUMMARY, "tool": VERSION, "pass": False,
                "errors": ["E_JS_ALLOWLIST %s unreadable" % allow_path],
                "checked": {"files": 0, "exports": 0, "typedefs": 0}}
    try:
        allow_text = allow_raw.decode("utf-8")
    except UnicodeDecodeError:
        return {"schema": SCHEMA_SUMMARY, "tool": VERSION, "pass": False,
                "errors": ["E_JS_ALLOWLIST %s not UTF-8" % allow_path],
                "checked": {"files": 0, "exports": 0, "typedefs": 0}}
    rels = []
    errors = []
    seen = set()
    for entry in allow_text.splitlines():
        if (not entry or entry != entry.strip() or "\\" in entry
                or entry.startswith("/") or ".." in entry.split("/")):
            errors.append("E_JS_ALLOWLIST entry %r" % entry)
        elif entry in seen:
            errors.append("E_JS_ALLOWLIST duplicate %s" % entry)
        else:
            seen.add(entry)
            rels.append(entry)
    records = []
    symbols = []
    for rel in sorted(rels):
        record, rows, errs = extract_file(root, rel, max_bytes, max_exports)
        if errs:
            errors.extend(errs)
        else:
            records.append(record)
            symbols.extend(rows)
    checked = {"files": len(records),
               "exports": sum(len(r["exports"]) for r in records),
               "typedefs": sum(len(r["typedefs"]) for r in records)}
    if errors:
        return {"schema": SCHEMA_SUMMARY, "tool": VERSION, "pass": False,
                "errors": sorted(set(errors)), "checked": checked}
    with open(out_path, "wb") as f:
        for r in records:
            f.write(canon(r))
    with open(sym_path, "wb") as f:
        for s in symbols:
            f.write(canon(s))
    return {"schema": SCHEMA_SUMMARY, "tool": VERSION, "pass": True,
            "errors": [], "checked": checked}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract_js.py")
    ap.add_argument("--root", required=True)
    ap.add_argument("--allow", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--symbols", required=True)
    ap.add_argument("--max-bytes", type=int, default=MAX_FILE_BYTES)
    ap.add_argument("--max-exports", type=int, default=MAX_EXPORTS_PER_FILE)
    try:
        a = ap.parse_args(argv)
    except SystemExit:
        return 2
    if not os.path.isdir(a.root):
        print("E_JS_USAGE: root is not a directory", file=sys.stderr)
        return 2
    if a.max_bytes <= 0 or a.max_exports <= 0:
        print("E_JS_USAGE: caps must be positive", file=sys.stderr)
        return 2
    rec = run(a.root, a.allow, a.out, a.symbols, a.max_bytes, a.max_exports)
    sys.stdout.write(canon(rec).decode("utf-8"))
    return 0 if rec["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
