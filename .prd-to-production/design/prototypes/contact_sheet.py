#!/usr/bin/env python3
"""Build design/contact-sheet.png from design/screens.json (navigation aid only)."""
import json, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
data = json.load(open(os.path.join(HERE, "..", "screens.json")))
items = [(s["id"], p) for s in data["screens"] for p in [s["desktop"], s["mobile"]] + s["states"]]
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 15)
    small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
except OSError:
    font = small = ImageFont.load_default()
CW, CH, PAD, LAB, cols = 320, 300, 16, 40, 8
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (CW + PAD) + PAD, rows * (CH + LAB + PAD) + PAD), "#05060F")
d = ImageDraw.Draw(sheet)
for i, (sid, rel) in enumerate(items):
    im = Image.open(os.path.join(ROOT, rel)).convert("RGB")
    scale = CH / 844 if im.width <= 400 else CW / im.width
    t = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    t = t.crop((0, 0, min(CW, t.width), min(CH, t.height)))
    x = PAD + (i % cols) * (CW + PAD); y = PAD + (i // cols) * (CH + LAB + PAD)
    d.rectangle([x, y, x + CW, y + CH], fill="#0B0C1F")
    sheet.paste(t, (x + (CW - t.width) // 2, y))
    d.text((x, y + CH + 6), sid, fill="#C8F53C", font=font)
    d.text((x, y + CH + 23), os.path.basename(rel), fill="#A3A6D1", font=small)
sheet.save(os.path.join(HERE, "..", "contact-sheet.png"))
print(len(items), "tiles")
