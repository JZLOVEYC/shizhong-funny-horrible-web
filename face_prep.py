#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Matte head photo (baked checkerboard), decontaminate edges, upscale, emit data URI."""
import base64
import io
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = r"C:\Users\li\.dsh\attachments\v1\objects\64\64d73b8ae011c4a8c4ba291812e82ddddbe305cb9a6636f7f53b02cc5082cd4e"
OUT_DIR = os.path.join(BASE, "parts")

im = Image.open(SRC).convert("RGB")
w, h = im.size
arr = np.asarray(im).astype(int)
mx = arr.max(2)
mn = arr.min(2)
chroma = mx - mn

# --- 1. 棋盘格 = 低饱和中灰，从边界泛洪吃掉 ---
bgish = (chroma < 14) & (mx > 60) & (mx < 235)
outside = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bgish[y, x] and not outside[y, x]:
            outside[y, x] = True
            q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bgish[y, x] and not outside[y, x]:
            outside[y, x] = True
            q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and bgish[ny, nx] and not outside[ny, nx]:
            outside[ny, nx] = True
            q.append((ny, nx))

subject = ~outside

# 主体：明显的红色或暗部，避免把棋盘格当主体
subject = subject & ((chroma > 18) | (mx < 62))

# --- 2. 保留最大连通块 ---
seen = np.zeros((h, w), bool)
best = []
for y in range(h):
    for x in range(w):
        if subject[y, x] and not seen[y, x]:
            qq = deque([(y, x)])
            seen[y, x] = True
            comp = []
            while qq:
                cy, cx = qq.popleft()
                comp.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and subject[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        qq.append((ny, nx))
            if len(comp) > len(best):
                best = comp
subject = np.zeros((h, w), bool)
for y, x in best:
    subject[y, x] = True

# --- 3. 闭运算 + 补内部洞 ---
m = Image.fromarray((subject * 255).astype(np.uint8), "L")
m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
subject = np.asarray(m) > 127
bg = ~subject
out2 = np.zeros_like(bg)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bg[y, x] and not out2[y, x]:
            out2[y, x] = True
            q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bg[y, x] and not out2[y, x]:
            out2[y, x] = True
            q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not out2[ny, nx]:
            out2[ny, nx] = True
            q.append((ny, nx))
subject = subject | (bg & ~out2)

# --- 4. 到轮廓的距离 ---
dist = np.full((h, w), 999, dtype=int)
q = deque()
for y in range(h):
    for x in range(w):
        if not subject[y, x]:
            dist[y, x] = 0
            q.append((y, x))
while q:
    y, x = q.popleft()
    d = dist[y, x] + 1
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and dist[ny, nx] > d:
            dist[ny, nx] = d
            q.append((ny, nx))

# --- 5. 去污：低饱和中灰（棋盘格残块、镜片反光）一律压黑，面部是强色不受影响 ---
rgb = arr.copy()
lowc = (chroma < 36) & (mx > 38) & (mx < 232)
rgb[lowc] = (rgb[lowc] * 0.14).astype(int)
edge = lowc

# --- 6. 合成 ---
alpha = (subject * 255).astype(np.uint8)
mask = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.2))
rgba = Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")
rgba.putalpha(mask)

bbox = mask.point(lambda v: 255 if v > 24 else 0).getbbox()
if bbox:
    x0, y0, x1, y1 = bbox
    y1 = max(y0 + 20, y1 - 26)
    pad = 4
    rgba = rgba.crop((max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1)))

scale = 3
rgba = rgba.resize((rgba.width * scale, rgba.height * scale), Image.LANCZOS)
sh = rgba.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.1, percent=70, threshold=2))
rgba = Image.merge("RGBA", (*sh.split(), rgba.getchannel("A")))

wbuf = io.BytesIO()
rgba.save(wbuf, "WEBP", quality=88, method=6)
webp_bytes = wbuf.getvalue()
uri = "data:image/webp;base64," + base64.b64encode(webp_bytes).decode("ascii")
with io.open(os.path.join(OUT_DIR, "face.b64"), "w", encoding="ascii") as f:
    f.write(uri)

rgba.save(os.path.join(BASE, "shots", "face_cut.png"))
black = Image.new("RGBA", rgba.size, (5, 0, 0, 255))
black.alpha_composite(rgba)
black.convert("RGB").save(os.path.join(BASE, "shots", "face_on_black.png"))
print("size:", rgba.size, "| webp:", len(webp_bytes), "| uri:", len(uri),
      "| edge px cleaned:", int(edge.sum()))
