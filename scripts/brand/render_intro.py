#!/usr/bin/env python3
"""ZOOKA-AI brand intro template renderer (approved identity v2).

Uses ONLY the approved palette and the approved logo lockups from public/brand/.
No invented imagery. Output: 1080x1920 H.264 MP4, 30fps, 5s.

Palette (design/brand-v2/tokens/tokens.ts):
  blue #2E86AB · purple #A23B72 · ice #F8F9FA · navy #0B1220 · cyan #10D4FF
Slogan (approved): تقنية بإيمان، تقدّم بأخلاق  ·  Innovate • Automate • Grow
"""
import os, sys, math
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

W, H, FPS, SECS = 1080, 1920, 30, 5
NAVY   = (0x0B, 0x12, 0x20)
NAVY2  = (0x12, 0x1C, 0x2E)
ICE    = (0xF8, 0xF9, 0xFA)
CYAN   = (0x10, 0xD4, 0xFF)
BLUE   = (0x2E, 0x86, 0xAB)
PURPLE = (0xA2, 0x3B, 0x72)
MUTED  = (0x93, 0xA4, 0xBD)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_AR = os.environ.get("BRAND_FONT_AR") or os.path.join(ROOT, "fonts", "Cairo.ttf")  # Cairo (OFL) from google/fonts; not vendored
LOGO_AR = os.path.join(ROOT, "public", "brand", "logo-horizontal-ar-640.png")
MARK    = os.path.join(ROOT, "public", "brand", "zooka-mark-256.png")
FONT_EN = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

def base_canvas():
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    for y in range(H):                      # vertical gradient navy -> navy2
        t = y / H
        d.line([(0, y), (W, y)], fill=(
            int(NAVY[0] + (NAVY2[0] - NAVY[0]) * t),
            int(NAVY[1] + (NAVY2[1] - NAVY[1]) * t),
            int(NAVY[2] + (NAVY2[2] - NAVY[2]) * t)))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-320, -520, W + 320, 620], fill=(6, 44, 60))     # cyan-ish top glow
    gd.ellipse([-420, H - 520, W + 420, H + 420], fill=(46, 10, 32))  # purple bottom glow
    img = Image.blend(img, glow, 0.55)
    return img

def shaped(txt):
    return get_display(arabic_reshaper.reshape(txt))

def frame(i, canvas):
    t = i / FPS
    fade_in = min(1.0, t / 0.8)
    fade_out = min(1.0, max(0.0, (SECS - t) / 0.7))
    alpha = min(fade_in, fade_out)
    img = canvas.copy()
    d = ImageDraw.Draw(img)
    # accent bar
    d.rectangle([0, 0, W, 6], fill=BLUE)
    d.rectangle([W // 2 - 90, 0, W // 2 + 90, 6], fill=CYAN)
    # logo lockup, gentle scale
    if os.path.exists(LOGO_AR):
        logo = Image.open(LOGO_AR).convert("RGBA")
        tw = int(720 * (0.96 + 0.04 * min(1.0, t / 1.2)))
        logo = logo.resize((tw, int(logo.height * tw / logo.width)), Image.LANCZOS)
        img.paste(logo, ((W - logo.width) // 2, 700), logo)
    # arabic slogan
    fa = ImageFont.truetype(FONT_AR, 66)
    ar = shaped("تقنية بإيمان، تقدّم بأخلاق")
    w = d.textlength(ar, font=fa)
    d.text(((W - w) / 2, 960), ar, font=fa, fill=ICE)
    # cyan rule
    d.rectangle([W // 2 - 120, 1075, W // 2 + 120, 1079], fill=CYAN)
    # english tagline
    fe = ImageFont.truetype(FONT_EN, 34)
    en = "Innovate • Automate • Grow"
    we = d.textlength(en, font=fe)
    d.text(((W - we) / 2, 1110), en, font=fe, fill=MUTED)
    # mark watermark
    if os.path.exists(MARK):
        m = Image.open(MARK).convert("RGBA")
        mw = 96
        m = m.resize((mw, int(m.height * mw / m.width)), Image.LANCZOS)
        m.putalpha(m.getchannel("A").point(lambda a: int(a * 0.35)))
        img.paste(m, ((W - m.width) // 2, 1620), m)
    # fade
    black = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.blend(black, img, alpha)

def main():
    outdir = os.path.join(ROOT, "build", "frames")
    os.makedirs(outdir, exist_ok=True)
    canvas = base_canvas()
    n = FPS * SECS
    for i in range(n):
        frame(i, canvas).save(os.path.join(outdir, f"f{i:04d}.png"))
    print(f"rendered {n} frames -> {outdir}")

if __name__ == "__main__":
    main()
