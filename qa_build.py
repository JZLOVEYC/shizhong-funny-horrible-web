#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""QA copies: hide sections before the target so it renders on the first screen."""
import html as htmlmod
import io
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(BASE, "shots")
os.makedirs(SHOTS, exist_ok=True)
html = io.open(os.path.join(BASE, "index.html"), encoding="utf-8").read()

END_EXTRA = (
    "setTimeout(function(){try{var f=document.getElementById('face');"
    "f.classList.add('on');f.style.opacity=1;f.style.filter='none';"
    "var et=document.getElementById('endtext');et.style.opacity=1;"
    "var r=f.getBoundingClientRect();"
    "et.textContent='face @'+Math.round(r.left)+','+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height);"
    "}catch(e){var et=document.getElementById('endtext');et.textContent='ERR '+e.message;}},2400)"
)
SCARE_EXTRA = (
    "try{document.getElementById('scare').classList.add('on');"
    "var f=document.getElementById('scareFace');if(f)f.style.animation='none';}catch(e){}"
)

TARGETS = [("end", "#end", END_EXTRA), ("scare", "#end", SCARE_EXTRA)]

INJECT = """
<script>
(function () {
  function prep() {
    var target = document.querySelector(%r);
    if (!target) return;
    var all = [].slice.call(document.querySelectorAll('[data-bg]'));
    var idx = all.indexOf(target);
    all.forEach(function (s, i) { if (i < idx) s.style.display = 'none'; });
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    if (window.frame) window.frame();
    %s
  }
  window.addEventListener('load', function () { setTimeout(prep, 150); });
})();
</script>
"""

for name, sel, extra in TARGETS:
    out = html.replace("</body>", INJECT % (sel, extra) + "</body>")
    path = os.path.join(SHOTS, "qa_%s.html" % name)
    io.open(path, "w", encoding="utf-8").write(out)
    print("built", path)

esc = htmlmod.escape(html, quote=True)
page = ('<!DOCTYPE html><html><head><meta charset="utf-8"><style>'
        'html,body{margin:0;background:#2a2a2a}iframe{display:block;width:390px;height:844px;border:0}'
        '</style></head><body><iframe srcdoc="' + esc + '"></iframe></body></html>')
io.open(os.path.join(SHOTS, "mobile_srcdoc.html"), "w", encoding="utf-8").write(page)
print("built mobile_srcdoc")
