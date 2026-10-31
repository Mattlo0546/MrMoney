#!/usr/bin/env python3
"""Onboarding pencil-sketch generator for StudentPlan.

Usage (run with `python3 -I`):
  gen_sketches.py gen <slug> [--ref <png>] [--note "<extra direction>"]
      -> writes sketches/raw/<slug>-a<N>.png (+ .prompt.txt)
  gen_sketches.py process <slug> <raw-png>
      -> writes sketches/<slug>.png (1280x960, transparent) and <slug>.webp
  gen_sketches.py contact
      -> writes sketches/contact-sheet.png

The API key is read from $GEMINI_API_KEY or ../../../.env.local and is only
ever sent in the x-goog-api-key request header. It is never printed or saved.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

from PIL import Image, ImageDraw, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
DESIGN = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(DESIGN))
OUT = os.path.join(DESIGN, "sketches")
RAW = os.path.join(OUT, "raw")
MODEL = "gemini-nano-banana-2.1"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
ACCENT = (0xE9, 0xB8, 0x72)  # design.md pale ochre wash

STYLE = (
    "A single hand-drawn illustration in HB and 2B graphite pencil on plain white paper. "
    "Loose but confident sketch lines with visible pencil texture and slightly varied line weight, "
    "light diagonal cross-hatching for shading, a few construction lines left in. "
    "Cozy, warm, hopeful still-life feeling, like a page from a student's sketchbook in a small UK flat. "
    "Exactly ONE warm accent: a pale ochre watercolour wash (hex #E9B872) applied only to the single focal "
    "object named below; everything else is pure grey graphite with no other colour. "
    "Composition: the subject group is centred and occupies roughly the middle 60% of the frame, with "
    "generous empty white margins on all sides. Pure white background: no table edge, no floor, no wall, "
    "no scenery, no border, no frame, no vignette, no paper texture or shadow outside the subject, "
    "only a faint soft contact shadow directly under the objects. "
    "Absolutely no text, letters, words, numbers, digits, currency symbols, logos, labels or brand names "
    "anywhere in the image; any paper, card or label must be blank or carry only abstract scribble lines. "
    "No people's faces. 4:3 landscape."
)

# slug -> (subject, focal object for the ochre accent)
STEPS = {
    "welcome": (
        "A cozy student desk-corner still life: a steaming mug of tea, a small potted plant, "
        "and a folded paper map of a city with a tiny paper plane resting on it.",
        "the mug of tea",
    ),
    "funds": (
        "A glass jar half full of coins next to an envelope; a small blank tear-off calendar page "
        "is clipped to the front of the envelope.",
        "the coins inside the jar",
    ),
    "last-until": (
        "A wall calendar page with a blank grid of empty squares (no numbers) where one square is "
        "circled by hand, and a small vintage suitcase standing on the ground below it.",
        "the suitcase",
    ),
    "job": (
        "A café apron hanging on the corner of a small café counter, with a clipboard holding a blank "
        "timesheet (only abstract ruled lines) lying on the counter beside a coffee cup.",
        "the apron",
    ),
    "other-income": (
        "A small opened parcel with tissue paper peeking out and a handwritten-looking blank greeting card "
        "propped against it, like a care package from home.",
        "the tissue paper in the parcel",
    ),
    "rent": (
        "A front door of a UK terraced house, seen straight on, with a single key hanging on a small hook "
        "beside it and a doormat below.",
        "the key on the hook",
    ),
    "reserve": (
        "A closed folded umbrella leaning against a small locked metal tin with a little padlock.",
        "the umbrella",
    ),
    "savings": (
        "A small seedling with two leaves growing out of a mug of soil, sitting on a windowsill with a "
        "suggestion of a window frame behind it.",
        "the seedling's leaves",
    ),
    "food-transport": (
        "A canvas tote bag full of groceries (a baguette, leafy greens, apples) beside a blank travel pass card "
        "and a small bicycle bell.",
        "the tote bag",
    ),
    "priorities": (
        "Three notebooks stacked neatly, slightly offset, with a ribbon bookmark poking out of the top one "
        "and a pencil resting across the stack.",
        "the ribbon bookmark",
    ),
}
ORDER = list(STEPS)


def api_key():
    k = os.environ.get("GEMINI_API_KEY")
    if k:
        return k.strip()
    path = os.path.join(ROOT, ".env.local")
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("GEMINI_API_KEY not found")


def build_prompt(slug, note=None, with_ref=False):
    subject, focal = STEPS[slug]
    p = f"{STYLE}\n\nSubject: {subject}\nOchre accent only on: {focal}."
    if with_ref:
        p = (
            "Match the drawing style of the attached reference sketch exactly: same pencil, same line weight, "
            "same hatching, same white background, same ochre wash treatment and same framing. "
            "Do NOT copy its subject; draw the new subject below.\n\n" + p
        )
    if note:
        p += "\n" + note
    return p


def generate(slug, ref=None, note=None):
    prompt = build_prompt(slug, note, with_ref=bool(ref))
    parts = [{"text": prompt}]
    if ref:
        with open(ref, "rb") as f:
            parts.append({"inline_data": {"mime_type": "image/png", "data": base64.b64encode(f.read()).decode()}})
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "4:3"}},
    }
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key()},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode(errors='replace')[:2000]}")
    img = None
    for c in data.get("candidates", []):
        for p in c.get("content", {}).get("parts", []):
            d = p.get("inlineData") or p.get("inline_data")
            if d and d.get("data"):
                img = base64.b64decode(d["data"])
    if img is None:
        sys.exit("No image returned: " + json.dumps(data)[:2000])
    os.makedirs(RAW, exist_ok=True)
    n = 1
    while os.path.exists(os.path.join(RAW, f"{slug}-a{n}.png")):
        n += 1
    out = os.path.join(RAW, f"{slug}-a{n}.png")
    from io import BytesIO
    Image.open(BytesIO(img)).convert("RGB").save(out)
    with open(out[:-4] + ".prompt.txt", "w") as f:
        f.write(prompt + ("\n[style reference: %s]\n" % os.path.basename(ref) if ref else "\n"))
    print(out)


def process(slug, raw):
    im = Image.open(raw).convert("RGB")
    # Fit into 4:3 at 1280x960 on white, keeping the whole drawing.
    im = ImageOps.pad(im, (1280, 960), color=(255, 255, 255))
    # Estimate paper white from the corners and normalise it to pure white.
    w, h = im.size
    px = im.load()
    samples = [px[x, y] for x in (4, w - 5) for y in (4, h - 5)]
    paper = tuple(max(200, sum(s[i] for s in samples) // len(samples)) for i in range(3))
    out = Image.new("RGBA", im.size)
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            c = (min(255, r * 255 // paper[0]), min(255, g * 255 // paper[1]), min(255, b * 255 // paper[2]))
            # Colour-to-alpha against white: alpha from the darkest channel, so graphite stays soft.
            a = (255 - min(c)) / 255.0
            a = max(0.0, (a - 0.035) / 0.965)  # drop faint paper speckle
            if a <= 0:
                op[x, y] = (0, 0, 0, 0)
                continue
            fg = [max(0, min(255, round((ch - 255 * (1 - a)) / a))) for ch in c]
            # Saturated (ochre) pixels are made opaque in their on-paper colour.
            sat = (max(c) - min(c)) / 255.0
            k = max(0.0, min(1.0, (sat - 0.06) / 0.10)) if c[0] > c[2] else 0.0
            if k:
                fg = [round(f * (1 - k) + o * k) for f, o in zip(fg, c)]
                a = a + (1 - a) * k
            op[x, y] = (fg[0], fg[1], fg[2], round(a * 255))
    dst = os.path.join(OUT, slug + ".png")
    out.save(dst, optimize=True)
    print(dst, os.path.getsize(dst))
    encode_webp(slug, out)


def encode_webp(slug, rgba):
    """Pencil grain in the alpha plane is what costs bytes. Soften it by 0.5px and
    quantise to N levels, then encode the alpha losslessly (lossy alpha blotches the
    light hatching). Step down levels/quality until the file is <= 40KB."""
    import tempfile
    from PIL import ImageFilter
    webp = os.path.join(OUT, slug + ".webp")
    alpha = rgba.getchannel("A").filter(ImageFilter.GaussianBlur(0.5))
    tries = [(12, 60), (12, 45), (10, 50), (10, 40), (8, 45), (8, 35), (6, 35)]
    with tempfile.TemporaryDirectory() as td:
        for levels, q in tries:
            step = 255 / (levels - 1)
            im = rgba.copy()
            im.putalpha(alpha.point(lambda v: 0 if v < 10 else min(255, round(round(v / step) * step))))
            tmp = os.path.join(td, "in.png")
            im.save(tmp)
            subprocess.run(["cwebp", "-quiet", "-q", str(q), "-alpha_q", "100", "-alpha_filter", "best",
                            "-m", "6", tmp, "-o", webp], check=True)
            if os.path.getsize(webp) <= 40 * 1024:
                break
    print(webp, os.path.getsize(webp), f"levels={levels} q={q}")


def contact():
    cols, tw, th, pad, lab = 4, 480, 360, 24, 36
    slugs = [s for s in ORDER if os.path.exists(os.path.join(OUT, s + ".png"))]
    rows = (len(slugs) + cols - 1) // cols
    W = cols * (tw + pad) + pad
    H = rows * (th + lab + pad) + pad
    sheet = Image.new("RGB", (W, H), (0xEC, 0xEE, 0xEA))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
    except OSError:
        font = ImageFont.load_default()
    for i, s in enumerate(slugs):
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + lab + pad)
        im = Image.open(os.path.join(OUT, s + ".png")).resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (x, y), im)
        d.text((x, y + th + 6), f"{i + 1}. {s}", fill=(0x1D, 0x21, 0x25), font=font)
    dst = os.path.join(OUT, "contact-sheet.png")
    sheet.save(dst)
    print(dst)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "gen":
        ref = a[a.index("--ref") + 1] if "--ref" in a else None
        note = a[a.index("--note") + 1] if "--note" in a else None
        generate(a[1], ref, note)
    elif a[0] == "process":
        process(a[1], a[2])
    elif a[0] == "contact":
        contact()
