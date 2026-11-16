"""Draws one promo frame: brand background, shaped Arabic title and subtitle, and the company logo.

Arabic is shaped here rather than in ffmpeg's drawtext, because drawtext writes code points in order
and gives disconnected, reversed letters. arabic_reshaper and python-bidi do the joins and the
right-to-left ordering, which is why this is Python and not a filter.
"""
import glob
import json
import sys

from PIL import Image, ImageDraw, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAVE_SHAPING = True
except Exception:  # pragma: no cover - only on a host without the two packages
    HAVE_SHAPING = False


def shaped(text: str) -> str:
    if not text:
        return ""
    if not HAVE_SHAPING:
        return text
    return get_display(arabic_reshaper.reshape(text))


def find_font(bold: bool) -> str:
    patterns = [
        "/usr/share/fonts/**/Cairo*Bold*.ttf" if bold else "/usr/share/fonts/**/Cairo*Regular*.ttf",
        "/usr/share/fonts/**/NotoNaskhArabic*.ttf",
        "/usr/share/fonts/**/Noto*Arabic*.ttf",
        "/usr/share/fonts/**/Amiri*.ttf",
        "/usr/share/fonts/**/DejaVuSans*.ttf",
    ]
    for pattern in patterns:
        found = sorted(glob.glob(pattern, recursive=True))
        if found:
            return found[0]
    raise SystemExit("no font found")


def wrap(draw, text, font, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = (current + " " + word).strip()
        if draw.textlength(trial, font=font) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def cover(image: Image.Image, size):
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((max(1, int(image.width * scale)), max(1, int(image.height * scale))), Image.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h)).convert("RGB")


def background(size, brand):
    width, height = size
    top = tuple(brand["from"])
    bottom = tuple(brand["to"])
    canvas = Image.new("RGB", size)
    draw = ImageDraw.Draw(canvas)
    for y in range(height):
        ratio = y / max(1, height - 1)
        draw.line(
            [(0, y), (width, y)],
            fill=tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3)),
        )
    # A soft accent glow, drawn once at low alpha: the brand look without a gradient library.
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    accent = tuple(brand["accent"]) + (70,)
    gdraw = ImageDraw.Draw(glow)
    radius = int(min(width, height) * 0.55)
    gdraw.ellipse([width - radius, -radius // 2, width + radius, radius], fill=accent)
    return Image.alpha_composite(canvas.convert("RGBA"), glow).convert("RGB")


def main():
    spec = json.load(sys.stdin)
    width, height = int(spec["width"]), int(spec["height"])
    size = (width, height)
    brand = spec.get("brand") or {}
    brand.setdefault("from", [46, 134, 171])
    brand.setdefault("to", [8, 18, 32])
    brand.setdefault("accent", [162, 59, 114])
    brand.setdefault("text", [248, 249, 250])

    if spec.get("base"):
        canvas = cover(Image.open(spec["base"]), size)
        veil = Image.new("RGBA", size, (6, 12, 22, 150))
        canvas = Image.alpha_composite(canvas.convert("RGBA"), veil).convert("RGB")
    else:
        canvas = background(size, brand)

    draw = ImageDraw.Draw(canvas)
    margin = int(width * 0.08)
    title_font = ImageFont.truetype(find_font(True), int(height * 0.062))
    subtitle_font = ImageFont.truetype(find_font(False), int(height * 0.034))

    title_lines = wrap(draw, shaped(spec.get("title", "")), title_font, width - margin * 2)
    subtitle_lines = wrap(draw, shaped(spec.get("subtitle", "")), subtitle_font, width - margin * 2)
    line_height = int(height * 0.085)
    subtitle_height = int(height * 0.048)
    block = len(title_lines) * line_height + (len(subtitle_lines) * subtitle_height if subtitle_lines else 0)
    y = (height - block) // 2

    text_color = tuple(brand["text"])
    for line in title_lines:
        draw.text((width - margin, y), line, font=title_font, fill=text_color, anchor="ra")
        y += line_height
    for line in subtitle_lines:
        draw.text((width - margin, y), line, font=subtitle_font, fill=(200, 214, 224), anchor="ra")
        y += subtitle_height

    # An accent rule under the text block, right-aligned like the text.
    rule_y = y + int(height * 0.012)
    draw.rectangle([width - margin - int(width * 0.22), rule_y, width - margin, rule_y + max(3, int(height * 0.004))], fill=tuple(brand["accent"]))

    if spec.get("logo"):
        logo = Image.open(spec["logo"]).convert("RGBA")
        target_w = int(width * 0.16)
        ratio = target_w / logo.width
        logo = logo.resize((target_w, max(1, int(logo.height * ratio))), Image.LANCZOS)
        pad = int(width * 0.045)
        canvas.paste(logo, (width - pad - logo.width, pad), logo)

    canvas.save(spec["out"], "PNG")
    print(json.dumps({"ok": True, "out": spec["out"], "shaped": HAVE_SHAPING}))


main()
