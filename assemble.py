#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Assemble the DeskMate single-file page and run static sanity checks."""
import io
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(BASE, "parts")


def read(name):
    with io.open(os.path.join(PARTS, name), encoding="utf-8") as f:
        return f.read()


head = read("a_head.html")
body = read("b_body.html")
dic = read("c_dict.js")
app = read("d_app.js")

html = head + "\n" + body + "\n<script>\n" + dic + "\n" + app + "\n</script>\n</body>\n</html>\n"

face_path = os.path.join(PARTS, "face.b64")
face_note = "face.b64 missing - placeholder left as-is"
if os.path.exists(face_path):
    with io.open(face_path, encoding="ascii") as f:
        face_uri = f.read().strip()
    n = html.count("__FACE_URI__")
    html = html.replace("__FACE_URI__", face_uri)
    face_note = "face data URI injected: %d place(s), %d bytes" % (n, len(face_uri))

out = os.path.join(BASE, "index.html")
with io.open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(html)

problems = []
warns = []
print(face_note)

# ---- dict key parity ----
marker = "\n  en: {"
if marker not in dic:
    problems.append("cannot find en block in dict")
zh_part, en_part = dic.split(marker, 1)
key_re = re.compile(r"'([a-zA-Z][\w.\-]*)':\s*`")
zh_keys = key_re.findall(zh_part)
en_keys = key_re.findall(en_part)
zh_set, en_set = set(zh_keys), set(en_keys)
if len(zh_keys) != len(zh_set):
    problems.append("duplicate zh keys: %s" % [k for k in zh_set if zh_keys.count(k) > 1])
if len(en_keys) != len(en_set):
    problems.append("duplicate en keys: %s" % [k for k in en_set if en_keys.count(k) > 1])
for k in sorted(zh_set - en_set):
    problems.append("missing en key: " + k)
for k in sorted(en_set - zh_set):
    problems.append("missing zh key: " + k)

# ---- html references ----
html_keys = set(re.findall(r'data-i18n="([^"]+)"', body))
html_keys |= set(re.findall(r'data-i18n-ph="([^"]+)"', body))
html_keys |= set(re.findall(r'data-i18n-value="([^"]+)"', body))
for k in sorted(html_keys - zh_set):
    problems.append("data-i18n key not in dict: " + k)

swap_keys = set(re.findall(r'data-swap="[^:]+:([^"]+)"', body))
for k in sorted(swap_keys - zh_set):
    problems.append("data-swap key not in dict: " + k)

# ---- js references ----
js_keys = set(re.findall(r"(?<![\w.$])t\('([\w.\-]+)'\)", app))
for k in sorted(js_keys - zh_set):
    problems.append("t() key not in dict: " + k)
for m in re.findall(r"'([a-z][a-z0-9]*\.[a-zA-Z0-9.]+)'", app):
    if m not in zh_set:
        warns.append("unresolved-looking string: " + m)

# ---- ids referenced from js must exist in body ----
ids = set(re.findall(r'id="([^"]+)"', body))
refs = set(re.findall(r"\$\('#([\w\-]+)'\)", app))
refs |= set(re.findall(r"getElementById\('([\w\-]+)'\)", app))
for r in sorted(refs - ids):
    problems.append("JS references missing id: #" + r)

# ---- crude tag balance ----
for tag in ("section", "div", "svg", "details", "form", "nav", "footer"):
    opens = len(re.findall(r"<%s[\s>]" % tag, body))
    closes = len(re.findall(r"</%s>" % tag, body))
    if opens != closes:
        problems.append("tag imbalance <%s>: %d open / %d close" % (tag, opens, closes))

# ---- duplicate ids ----
dup = sorted({i for i in ids if len(re.findall(r'id="%s"' % re.escape(i), body)) > 1})
if dup:
    problems.append("duplicate ids: %s" % dup)

# ---- dump JS for an external `node --check` ----
tmp = os.path.join(BASE, "_check.js")
with io.open(tmp, "w", encoding="utf-8") as f:
    f.write(dic + "\n" + app)

print("assembled:", out)
print("size:", len(html.encode("utf-8")), "bytes;", html.count("\n") + 1, "lines")
print("dict keys:", len(zh_set), "zh /", len(en_set), "en")
print("html i18n refs:", len(html_keys), "| js t() refs:", len(js_keys), "| swap refs:", len(swap_keys))
if warns:
    print("\nWARNINGS (%d):" % len(warns))
    for w in warns:
        print("  -", w)
if problems:
    print("\nPROBLEMS (%d):" % len(problems))
    for p in problems:
        print("  !", p)
    sys.exit(1)
print("\nALL CHECKS PASSED")
