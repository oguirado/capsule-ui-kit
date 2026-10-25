#!/usr/bin/env python3
"""W0-VUE SFC extractor for the UI router kit.

Parses explicit allowlisted Vue SFC files (no runtime scan) and emits one
deterministic ctx.vue-inventory.v1 record per file: default component
identity, public options bindings, named script exports with JSDoc, owned
template/script/style regions, and {path,symbol,name,line} symbol rows for
W0-NODES. Plain JS options API only; no authored TS. Offline, deterministic,
stdlib only. Exit 0 pass, 4 refuse, 2 usage.
"""
import argparse
import hashlib
import json
import os
import re
import sys

SCHEMA = "ctx.vue-inventory.v1"
RECEIPT = "ctx.vue-extract.v1"
VERSION = "extract_vue.py/1.0"
CODES = ("E_CHECK", "E_DECODE", "E_PATH", "E_SFC_STRUCTURE", "E_SCRIPT_SYNTAX", "E_TS")
MAX_LINES = 600
STEM_RE = re.compile(r"^[A-Z][A-Za-z0-9]*$")
ATTR_RE = re.compile(r"""([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?""")
OPEN_RE = re.compile(r"<(template|script|style)\b")
STARTERS = frozenset(("import", "export", "const", "let", "var", "function", "class", "async"))
VALUE_IDS = frozenset(("this", "true", "false", "null", "super"))
PUNCT3 = ("...", ">>>", "===", "!==", "**=")
PUNCT2 = ("=>", "==", "!=", "<=", ">=", "<<", ">>", "**", "&&", "||", "??", "+=", "-=",
          "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", "++", "--", "?.")
PUNCT1 = "{}()[];,.:?=!+-*/%<>|&^~@#"
_MISSING = object()
_BAD = object()


class VueError(Exception):
    def __init__(self, code, path, detail=""):
        super().__init__("%s %s %s" % (code, path, detail))
        self.code, self.path = code, path


def sha(b):
    return hashlib.sha256(b).hexdigest()


def readb(p):
    with open(p, "rb") as f:
        return f.read()


def dumps(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canon(o):
    return (dumps(o) + "\n").encode("utf-8")


def _unquote(tok):
    if len(tok) >= 2 and tok[0] == tok[-1] and tok[0] in "\"'" and "\\" not in tok:
        return tok[1:-1]
    return None


def _line(text, off):
    return text.count("\n", 0, off) + 1


def _scan_open(text, pos):
    m = OPEN_RE.match(text, pos)
    if not m:
        return None
    n, j, quote = len(text), m.end(), None
    while j < n:
        ch = text[j]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch == ">":
            return m.group(1), text[m.end():j], j + 1
        j += 1
    return None


def _attrs(attr_s, path, block):
    attrs = {}
    for m in ATTR_RE.finditer(attr_s):
        key, val = m.group(1).lower(), m.group(2)
        if val is None:
            attrs[key] = True
        elif len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            attrs[key] = val[1:-1]
        else:
            attrs[key] = val
    if ATTR_RE.sub("", attr_s).strip() not in ("", "/"):
        raise VueError("E_SFC_STRUCTURE", path, "bad <%s> attributes" % block)
    return attrs


def _check_attrs(name, attrs, path):
    if "src" in attrs:
        raise VueError("E_SFC_STRUCTURE", path, "<%s> src lives outside the one file" % name)
    if name == "script":
        lang = attrs.get("lang")
        if lang in ("ts", "typescript", "tsx"):
            raise VueError("E_TS", path, "authored TypeScript is not supported")
        if lang is not None and lang != "js":
            raise VueError("E_SFC_STRUCTURE", path, "unsupported script lang")
        if "setup" in attrs or "generic" in attrs:
            raise VueError("E_SCRIPT_SYNTAX", path, "script setup/generics are not supported")
        for key in attrs:
            if key != "lang":
                raise VueError("E_SFC_STRUCTURE", path, "unsupported script attribute " + key)
    elif name == "template":
        if attrs.get("lang", "html") != "html":
            raise VueError("E_SFC_STRUCTURE", path, "unsupported template lang")
        for key in attrs:
            if key != "lang":
                raise VueError("E_SFC_STRUCTURE", path, "unsupported template attribute " + key)
    else:
        if attrs.get("lang", "css") != "css":
            raise VueError("E_SFC_STRUCTURE", path, "unsupported style lang")
        for key in attrs:
            if key not in ("lang", "scoped", "module"):
                raise VueError("E_SFC_STRUCTURE", path, "unsupported style attribute " + key)


def split_sfc(text, path):
    blocks, order, pos, n = {}, [], 0, len(text)
    while True:
        while True:
            if text.startswith("<!--", pos):
                end = text.find("-->", pos + 4)
                if end < 0:
                    raise VueError("E_SFC_STRUCTURE", path, "unterminated comment")
                pos = end + 3
                continue
            if pos < n and text[pos] in " \t\r\n\f\v":
                pos += 1
                continue
            break
        if pos >= n:
            break
        opened = _scan_open(text, pos)
        if opened is None:
            raise VueError("E_SFC_STRUCTURE", path, "unexpected text outside blocks")
        name, attr_s, end = opened
        if name in blocks:
            raise VueError("E_SFC_STRUCTURE", path, "duplicate <%s> block" % name)
        close = "</" + name
        ce = text.find(close, end)
        ce_end = text.find(">", ce) if ce >= 0 else -1
        if ce < 0 or ce_end < 0:
            raise VueError("E_SFC_STRUCTURE", path, "unclosed <%s> block" % name)
        if text[ce + len(close):ce_end].strip() != "":
            raise VueError("E_SFC_STRUCTURE", path, "malformed </%s>" % name)
        blocks[name] = (attr_s, text[end:ce], pos, end, ce)
        order.append(name)
        pos = ce_end + 1
    if "script" not in blocks:
        raise VueError("E_SFC_STRUCTURE", path, "script block required")
    return blocks, order


def tokenize(src, path, line0):
    toks, mode, depth = [], ["code"], [0]
    prev = (None, None)
    i, n, line = 0, len(src), line0
    while i < n:
        if mode[-1] == "tpl":
            d = src[i]
            if d == "\\":
                if i + 1 < n and src[i + 1] == "\n":
                    line += 1
                i += 2
                continue
            if d == "\n":
                line += 1
                i += 1
                continue
            if d == "`":
                mode.pop()
                depth.pop()
                prev = ("str", "")
                i += 1
                continue
            if d == "$" and src.startswith("${", i):
                mode.append("code")
                depth.append(0)
                prev = ("punct", "${")
                i += 2
                continue
            i += 1
            continue
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c in " \t\r\f\v":
            i += 1
            continue
        if src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
            continue
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            if j < 0:
                raise VueError("E_SCRIPT_SYNTAX", path, "unterminated block comment")
            raw = src[i:j + 2]
            if raw.startswith("/**") and len(raw) > 4:
                toks.append(("jsdoc", raw, line))
            line += raw.count("\n")
            i = j + 2
            continue
        if c in "\"'":
            j, closed = i + 1, False
            while j < n:
                d = src[j]
                if d == "\\":
                    if j + 1 < n and src[j + 1] == "\n":
                        line += 1
                    j += 2
                    continue
                if d == c:
                    closed = True
                    break
                if d == "\n":
                    break
                j += 1
            if not closed:
                raise VueError("E_SCRIPT_SYNTAX", path, "unterminated string")
            toks.append(("str", src[i:j + 1], line))
            prev = ("str", "")
            i = j + 1
            continue
        if c == "`":
            toks.append(("str", "`", line))
            prev = ("str", "")
            mode.append("tpl")
            depth.append(0)
            i += 1
            continue
        if c == "/" and not src.startswith("/=", i):
            pk, pv = prev
            regex = pk is None or (pk == "id" and pv not in VALUE_IDS) or \
                (pk == "punct" and pv not in (")", "]", "++", "--"))
            if regex:
                j, in_class, closed = i + 1, False, False
                while j < n:
                    d = src[j]
                    if d == "\\":
                        j += 2
                        continue
                    if d == "\n":
                        break
                    if d == "[":
                        in_class = True
                    elif d == "]":
                        in_class = False
                    elif d == "/" and not in_class:
                        closed = True
                        break
                    j += 1
                if not closed:
                    raise VueError("E_SCRIPT_SYNTAX", path, "unterminated regex")
                j += 1
                while j < n and src[j].isalpha():
                    j += 1
                toks.append(("re", src[i:j], line))
                prev = ("str", "")
                i = j
                continue
        if c.isdigit() or (c == "." and i + 1 < n and src[i + 1].isdigit()):
            j = i
            while j < n and (src[j].isalnum() or src[j] in "._$"):
                j += 1
            toks.append(("num", src[i:j], line))
            prev = ("num", "")
            i = j
            continue
        if c.isalpha() or c in "_$":
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] in "_$"):
                j += 1
            toks.append(("id", src[i:j], line))
            prev = ("id", src[i:j])
            i = j
            continue
        three, two = src[i:i + 3], src[i:i + 2]
        if three in PUNCT3:
            v, i = three, i + 3
        elif two in PUNCT2 and not (two == "?." and i + 2 < n and src[i + 2].isdigit()):
            v, i = two, i + 2
        elif c in PUNCT1:
            v, i = c, i + 1
        else:
            raise VueError("E_SCRIPT_SYNTAX", path, "bad character %r" % c)
        if v == "{":
            depth[-1] += 1
            toks.append(("punct", v, line))
        elif v == "}":
            if len(mode) > 1 and depth[-1] == 0:
                mode.pop()
                depth.pop()
                prev = ("punct", "}")
                continue
            if depth[-1] > 0:
                depth[-1] -= 1
            toks.append(("punct", v, line))
        else:
            toks.append(("punct", v, line))
        prev = ("punct", v)
    if len(mode) > 1:
        raise VueError("E_SCRIPT_SYNTAX", path, "unterminated template literal")
    return toks


class _JS:
    def __init__(self, toks, path):
        self.t, self.p, self.i = toks, path, 0
        self.jsdoc, self.exports, self.names = None, [], set()
        self.consts, self.default = {}, None

    def err(self, detail):
        raise VueError("E_SCRIPT_SYNTAX", self.p, detail)

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else (None, None, -1)

    def _end_stmt(self):
        if self.peek()[1] == ";":
            self.i += 1

    def _skip_balanced(self, op, cl):
        if self.peek()[1] != op:
            self.err("expected " + op)
        depth = 0
        while self.i < len(self.t):
            k, v, _ = self.t[self.i]
            self.i += 1
            if k == "jsdoc":
                continue
            if v == op:
                depth += 1
            elif v == cl:
                depth -= 1
                if depth == 0:
                    return
        self.err("unterminated " + op)

    def _skip(self, last, comma_stop=False):
        depth, seen = 0, False
        while self.i < len(self.t):
            k, v, ln = self.t[self.i]
            if k == "jsdoc":
                self.i += 1
                continue
            if v in ("{", "(", "["):
                depth += 1
            elif v in ("}", ")", "]"):
                if depth == 0:
                    self.err("unexpected " + v)
                depth -= 1
            elif depth == 0 and comma_stop and v == ",":
                if not seen:
                    self.err("missing value")
                return False
            elif depth == 0 and v == ";":
                if not seen:
                    self.err("empty statement")
                self.i += 1
                return True
            elif depth == 0 and k == "id" and v in STARTERS and ln > last:
                if not seen:
                    self.err("missing value")
                return True
            seen, last = True, ln
            self.i += 1
        return True

    def _skip_value(self):
        depth, seen = 0, False
        while self.i < len(self.t):
            k, v, _ = self.t[self.i]
            if k == "jsdoc":
                self.i += 1
                continue
            if v in ("{", "(", "["):
                depth += 1
            elif v in ("}", ")", "]"):
                if depth == 0:
                    if not seen:
                        self.err("missing value")
                    return
                depth -= 1
            elif depth == 0 and v == ",":
                if not seen:
                    self.err("missing value")
                return
            elif depth == 0 and v == ";":
                self.err("unexpected ; in object")
            seen = True
            self.i += 1
        self.err("unterminated value")

    def _add_key(self, keys, seen, name, ln):
        if name in seen:
            self.err("duplicate options key " + name)
        seen.add(name)
        keys.append((name, ln))

    def _method(self, keys, seen, name, ln):
        if name is None:
            self.err("unsupported key")
        self.i += 1
        self._skip_balanced("(", ")")
        self._skip_balanced("{", "}")
        self._add_key(keys, seen, name, ln)

    def _parse_object(self):
        self.i += 1
        keys, seen = [], set()
        name_val, name_line = _MISSING, -1
        if self.peek()[1] == "}":
            self.i += 1
            return keys, name_val, name_line
        while True:
            k, v, ln = self.peek()
            if k == "jsdoc":
                self.i += 1
                continue
            if v == "...":
                self.err("spread in options object")
            if v == "[":
                self.err("computed key in options object")
            if v == "*":
                self.i += 1
                k2, v2, ln2 = self.peek()
                if k2 not in ("id", "str") or self.peek(1)[1] != "(":
                    self.err("bad generator method")
                self._method(keys, seen, v2 if k2 == "id" else _unquote(v2), ln2)
            elif k in ("id", "str", "num"):
                name = v if k != "str" else _unquote(v)
                if name is None:
                    self.err("unsupported key")
                self.i += 1
                p0, p1 = self.peek(), self.peek(1)
                if k == "id" and v == "async" and p0[0] in ("id", "str") and p1[1] == "(":
                    inner = p0[1] if p0[0] == "id" else _unquote(p0[1])
                    self._method(keys, seen, inner, p0[2])
                elif k == "id" and v in ("get", "set") and p0[0] in ("id", "str", "num") \
                        and p1[1] == "(":
                    inner = p0[1] if p0[0] != "str" else _unquote(p0[1])
                    self._method(keys, seen, inner, p0[2])
                elif p0[1] == "(":
                    self._skip_balanced("(", ")")
                    self._skip_balanced("{", "}")
                    self._add_key(keys, seen, name, ln)
                elif p0[1] == ":":
                    self.i += 1
                    if name == "name":
                        q0, q1 = self.peek(), self.peek(1)
                        if q0[0] == "str" and q1[1] in (",", "}"):
                            inner = _unquote(q0[1])
                            name_val = inner if inner is not None else _BAD
                            name_line = q0[2]
                            self.i += 1
                        else:
                            name_val = _BAD
                            self._skip_value()
                    else:
                        self._skip_value()
                    self._add_key(keys, seen, name, ln)
                elif p0[1] in (",", "}"):
                    if k != "id":
                        self.err("bad shorthand")
                    self._add_key(keys, seen, name, ln)
                else:
                    self.err("bad object member")
            else:
                self.err("bad object member")
            while self.peek()[0] == "jsdoc":
                self.i += 1
            if self.peek()[1] == ",":
                self.i += 1
                while self.peek()[0] == "jsdoc":
                    self.i += 1
                if self.peek()[1] == "}":
                    self.i += 1
                    return keys, name_val, name_line
                continue
            if self.peek()[1] == "}":
                self.i += 1
                return keys, name_val, name_line
            self.err("expected , or } in object")

    def _add_export(self, name, kind, ln):
        if name in self.names:
            self.err("duplicate export " + name)
        self.names.add(name)
        self.exports.append({"name": name, "kind": kind, "line": ln, "jsdoc": self.jsdoc})

    def _skip_var(self, exported):
        kind, mark = self.peek()[1], self.peek()[2]
        self.i += 1
        while True:
            k, v, ln = self.peek()
            if k == "jsdoc":
                self.i += 1
                continue
            if k != "id":
                if exported:
                    self.err("destructuring in exported declaration")
                self._skip(mark)
                return
            self.i += 1
            if exported:
                self._add_export(v, kind, ln)
            if self.peek()[1] != "=":
                if kind == "const":
                    self.err("const without initializer")
                if self.peek()[1] == ",":
                    self.i += 1
                    continue
                self._end_stmt()
                return
            eq = self.peek()[2]
            self.i += 1
            if kind == "const" and self.peek()[1] == "{":
                keys, name_val, name_line = self._parse_object()
                if v in self.consts:
                    self.err("duplicate const " + v)
                self.consts[v] = (keys, name_val, name_line)
                if self.peek()[1] == ",":
                    self.i += 1
                    continue
                self._end_stmt()
                return
            if self._skip(eq, True):
                return
            self.i += 1

    def _skip_function(self):
        self.i += 1
        if self.peek()[1] == "*":
            self.i += 1
        if self.peek()[0] == "id":
            self.i += 1
        self._skip_balanced("(", ")")
        self._skip_balanced("{", "}")
        self._end_stmt()

    def _skip_class(self):
        self.i += 1
        if self.peek()[0] == "id":
            self.i += 1
        depth = 0
        while True:
            k, v, _ = self.peek()
            if v is None:
                self.err("unterminated class")
            if k == "jsdoc":
                self.i += 1
                continue
            if v in ("(", "["):
                depth += 1
            elif v in (")", "]"):
                depth -= 1
                if depth < 0:
                    self.err("bad class header")
            elif depth == 0 and v == "{":
                break
            elif depth == 0 and v == ";":
                self.err("class without body")
            self.i += 1
        self._skip_balanced("{", "}")
        self._end_stmt()

    def _finish_default(self, keys, name_val, name_line):
        if name_val is _MISSING or name_val is _BAD or not STEM_RE.match(name_val):
            self.err("default export has no PascalCase string-literal name")
        return {"keys": keys, "name": name_val, "line": name_line}

    def _parse_export(self):
        self.i += 1
        v = self.peek()[1]
        if v == "default":
            if self.default is not None:
                self.err("duplicate default export")
            self.i += 1
            k2, v2, _ = self.peek()
            if v2 == "{":
                keys, name_val, name_line = self._parse_object()
                self._end_stmt()
                self.default = self._finish_default(keys, name_val, name_line)
            elif k2 == "id":
                self.i += 1
                self._end_stmt()
                if v2 not in self.consts:
                    self.err("default identifier is not a const object")
                keys, name_val, name_line = self.consts[v2]
                self.default = self._finish_default(keys, name_val, name_line)
            else:
                self.err("unsupported default export form")
        elif v == "function" or (v == "async" and self.peek(1)[1] == "function"
                                 and self.peek(1)[0] == "id"):
            if v == "async":
                self.i += 1
            self.i += 1
            k2, v2, ln2 = self.peek()
            if k2 != "id":
                self.err("exported function needs a name")
            self.i += 1
            self._add_export(v2, "function", ln2)
            self._skip_balanced("(", ")")
            self._skip_balanced("{", "}")
            self._end_stmt()
        elif v in ("const", "let", "var"):
            self._skip_var(True)
        elif v == "{":
            self.i += 1
            while True:
                while self.peek()[0] == "jsdoc":
                    self.i += 1
                if self.peek()[1] == "}":
                    self.i += 1
                    break
                k2, v2, ln2 = self.peek()
                if k2 != "id":
                    self.err("bad export list")
                self.i += 1
                name, nln = v2, ln2
                if self.peek()[1] == "as":
                    self.i += 1
                    k3, v3, ln3 = self.peek()
                    if k3 != "id":
                        self.err("bad export alias")
                    self.i += 1
                    name, nln = v3, ln3
                self._add_export(name, "local", nln)
                q = self.peek()[1]
                if q == ",":
                    self.i += 1
                    continue
                if q == "}":
                    self.i += 1
                    break
                self.err("bad export list")
            if self.peek()[0] == "id" and self.peek()[1] == "from":
                self.err("re-export from another file")
            self._end_stmt()
        elif v == "*":
            self.err("export * hides the owner")
        else:
            self.err("unsupported export form")
        self.jsdoc = None

    def run(self):
        while self.i < len(self.t):
            k, v, ln = self.t[self.i]
            if k == "jsdoc":
                self.jsdoc = v
                self.i += 1
            elif v == ";":
                self.i += 1
                self.jsdoc = None
            elif k == "str":
                self.i += 1
                if self.peek()[1] != ";":
                    self.err("bare string statement")
                self.i += 1
                self.jsdoc = None
            elif k == "id" and v == "import":
                if self.peek(1)[1] == "(":
                    self.err("dynamic import() at top level")
                self.i += 1
                self._skip(ln)
                self.jsdoc = None
            elif k == "id" and v == "export":
                self._parse_export()
            elif k == "id" and v in ("const", "let", "var"):
                self._skip_var(False)
                self.jsdoc = None
            elif k == "id" and v == "function":
                self._skip_function()
                self.jsdoc = None
            elif k == "id" and v == "async" and self.peek(1)[0] == "id" \
                    and self.peek(1)[1] == "function":
                self.i += 1
                self._skip_function()
                self.jsdoc = None
            elif k == "id" and v == "class":
                self._skip_class()
                self.jsdoc = None
            else:
                self.err("unsupported top-level statement")
        if self.default is None:
            self.err("no default export")
        self.exports.sort(key=lambda e: e["name"])
        return self.exports, self.default


def parse_script(src, path, line0):
    return _JS(tokenize(src, path, line0), path).run()


def extract_text(text, path, allow_long=False):
    base = path.replace("\\", "/").rsplit("/", 1)[-1]
    if "\\" in path or not base.endswith(".vue") or not STEM_RE.match(base[:-4]):
        raise VueError("E_PATH", path, "not an allowlisted PascalCase .vue path")
    if text.count("\n") + 1 > MAX_LINES and not allow_long:
        raise VueError("E_SFC_STRUCTURE", path, "exceeds %d-line cap" % MAX_LINES)
    blocks, order = split_sfc(text, path)
    for name in order:
        _check_attrs(name, _attrs(blocks[name][0], path, name), path)
    exports, default = parse_script(blocks["script"][1], path, _line(text, blocks["script"][3]))
    comp = default["name"]
    keyline = dict(default["keys"])
    bindings = sorted(keyline)
    symbols = [{"line": default["line"], "name": comp, "path": path, "symbol": comp}]
    for b in bindings:
        symbols.append({"line": keyline[b], "name": b, "path": path, "symbol": comp + "#" + b})
    for e in exports:
        if e["name"] == comp:
            raise VueError("E_SCRIPT_SYNTAX", path, "export collides with component name")
        symbols.append({"line": e["line"], "name": e["name"], "path": path, "symbol": e["name"]})
    symbols.sort(key=lambda r: r["symbol"])
    regions = [{"block": name, "end_line": _line(text, blocks[name][4]),
                "start_line": _line(text, blocks[name][2])} for name in order]
    return {"bindings": [{"line": keyline[b], "name": b} for b in bindings],
            "component": {"identity": "options-name", "line": default["line"], "name": comp},
            "exports": exports, "path": path, "regions": regions, "schema": SCHEMA,
            "source_sha256": sha(text.encode("utf-8")), "symbols": symbols, "tool": VERSION}


def extract_file(root, rel, allow_long=False):
    if not isinstance(rel, str) or not rel or "\\" in rel or rel.startswith("/") or \
            any(s in ("", ".", "..") for s in rel.split("/")) or not rel.endswith(".vue"):
        raise VueError("E_PATH", str(rel), "not an allowlisted relative .vue path")
    p = os.path.join(root, rel)
    if os.path.islink(p):
        raise VueError("E_PATH", rel, "symlink refused")
    real = os.path.realpath(p)
    rroot = os.path.realpath(root)
    if real != rroot and not real.startswith(rroot + os.sep):
        raise VueError("E_PATH", rel, "escapes root")
    if not os.path.isfile(real):
        raise VueError("E_PATH", rel, "missing file")
    raw = readb(real)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise VueError("E_DECODE", rel, "not UTF-8")
    if "\0" in text:
        raise VueError("E_DECODE", rel, "NUL byte")
    return extract_text(text, rel, allow_long)


def run(root, rels, out, check=False, allow_long=False):
    if len(set(rels)) != len(rels):
        raise VueError("E_PATH", "<inputs>", "duplicate input")
    records = {}
    for rel in sorted(rels):
        records[rel] = extract_file(root, rel, allow_long)
    blobs = {}
    for rel in sorted(records):
        blobs[rel + ".json"] = canon(records[rel])
    syms = []
    for rel in sorted(records):
        syms.extend(records[rel]["symbols"])
    syms.sort(key=lambda r: (r["path"], r["symbol"]))
    blobs["symbols.jsonl"] = b"".join(canon(r) for r in syms)
    if check:
        errs = []
        for name in sorted(blobs):
            p = os.path.join(out, name)
            if not os.path.isfile(p):
                errs.append("E_CHECK %s missing" % name)
            elif readb(p) != blobs[name]:
                errs.append("E_CHECK %s differs" % name)
        rec = {"files": sorted(records), "pass": not errs, "schema": RECEIPT,
               "symbols": len(syms), "tool": VERSION}
        if errs:
            rec["errors"] = sorted(errs)
        return rec
    os.makedirs(out, exist_ok=True)
    for name in sorted(blobs):
        p = os.path.join(out, name)
        parent = os.path.dirname(p)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(p, "wb") as f:
            f.write(blobs[name])
    return {"files": sorted(records), "pass": True, "schema": RECEIPT,
            "symbols": len(syms), "tool": VERSION}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="extract_vue.py")
    ap.add_argument("--root", default=os.getcwd())
    ap.add_argument("--out", required=True)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--allow-long", action="store_true")
    ap.add_argument("sfc", nargs="*")
    try:
        a = ap.parse_args(argv)
        if not a.sfc:
            ap.error("at least one .vue path is required")
    except SystemExit:
        return 2
    try:
        rec = run(a.root, a.sfc, a.out, check=a.check, allow_long=a.allow_long)
    except VueError as e:
        sys.stderr.write("%s\n" % e)
        return 4
    sys.stdout.write(canon(rec).decode("utf-8"))
    return 0 if rec["pass"] else 4


if __name__ == "__main__":
    sys.exit(main())
