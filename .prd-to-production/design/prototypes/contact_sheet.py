#!/usr/bin/env python3
"""Build design/contact-sheet.png from design/screens.json (navigation aid only)."""
import json, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
data = json.load(open(os.path.join(HERE, "..", "screens.json")))
items = []
for s in data["screens"]:
    for k in ["desktop", "mobile"] + [None] * 0:
        items.append((s["id"], s[k]))
    for st in s["states"]:
        items.append((s["id"], st))
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 15)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
except OSError:
    font = small = ImageFont.load_default()
CW, CH, PAD, LAB = 300, 300, 16, 40
cols = 8
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (CW + PAD) + PAD, rows * (CH + LAB + PAD) + PAD), "#E6E8E4")
d = ImageDraw.Draw(sheet)
for i, (sid, rel) in enumerate(items):
    im = Image.open(os.path.join(ROOT, rel)).convert("RGB")
    scale = CW / im.width if im.width <= 400 else CW / im.width
    if im.width <= 400:  # mobile: show at a larger scale, crop height
        scale = (CH) / 844
    t = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS).crop((0, 0, min(CW, int(im.width * scale)), min(CH, int(im.height * scale))))
    x = PAD + (i % cols) * (CW + PAD); y = PAD + (i // cols) * (CH + LAB + PAD)
    d.rectangle([x, y, x + CW, y + CH], fill="#F3F4F1")
    sheet.paste(t, (x + (CW - t.width) // 2, y))
    d.text((x, y + CH + 6), sid, fill="#1D2125", font=font)
    d.text((x, y + CH + 23), os.path.basename(rel), fill="#545B63", font=small)
sheet.save(os.path.join(HERE, "..", "contact-sheet.png"))
print(len(items), "tiles")
