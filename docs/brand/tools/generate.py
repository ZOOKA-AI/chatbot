#!/usr/bin/env python3
"""Generates every ZOOKA AI brand asset from one geometry.

Run from the repository root:  python3 docs/brand/tools/generate.py
Output: docs/brand/assets/**.svg  (deterministic, no external dependency)

The point of generating rather than hand-drawing: the symbol, the lockups, the app
icon and the seven agent marks stay the same shape. A change to SYMBOL or PALETTE
here updates all of them at once, so they cannot drift apart.
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)
(OUT / "agents").mkdir(exist_ok=True)
(OUT / "social").mkdir(exist_ok=True)

# ---------------------------------------------------------------- palette
P = {
    "blue": "#2E86AB",       # electric blue, primary
    "purple": "#A23B72",     # purple, accent
    "ice": "#F8F9FA",        # ice white
    "navy": "#0B1220",       # dark navy background
    "navy2": "#111A2B",      # raised surface
    "cyan": "#4FD1E8",       # controlled neon glow
    "ink": "#0A1019",        # near-black for light surfaces
    "muted_dark": "#8FA3B8",
    "muted_light": "#5B6B7C",
}
AGENT_TINT = {
    "general": (P["blue"], P["purple"]),
    "research": ("#4FD1E8", "#2E86AB"),
    "writing": ("#E2A03F", "#A23B72"),
    "design": ("#A23B72", "#6C7BE0"),
    "automation": ("#2E86AB", "#4FD1E8"),
    "analytics": ("#2FBF71", "#2E86AB"),
    "support": ("#6C7BE0", "#A23B72"),
}

# ---------------------------------------------------------------- geometry
# The Z: one outline, so the bevels and joins cannot disagree between variants.
# Outline: top bar (full width), diagonal band down-left, bottom bar (full width).
Z_PATH = "M16,18 H84 V36 L44,66 H84 V82 H16 V64 L56,34 H16 Z"
Z_TOP_BAR = "M16,18 H84 V36 H16 Z"

def z_symbol(fill_a, fill_b, idp="g"):
    """Body in the primary gradient, top bar in the accent, joined with a round stroke."""
    return f"""<path d="{Z_PATH}" fill="url(#{idp}a)" stroke="url(#{idp}a)" stroke-width="4" stroke-linejoin="round"/>
  <path d="{Z_TOP_BAR}" fill="url(#{idp}b)" opacity="0.92"/>"""

def grad(idp, a, b, x1="0", y1="0", x2="1", y2="1"):
    return (f'<linearGradient id="{idp}a" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'
            f'<linearGradient id="{idp}b" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{b}"/><stop offset="1" stop-color="{a}"/></linearGradient>')

def glow(idp, a):
    return (f'<filter id="{idp}f" x="-40%" y="-40%" width="180%" height="180%">'
            f'<feGaussianBlur stdDeviation="3" result="b"/>'
            f'<feFlood flood-color="{a}" flood-opacity="0.55" result="c"/>'
            f'<feComposite in="c" in2="b" operator="in" result="g"/>'
            f'<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')

WORD_FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"

def wordmark(x, y, size, ink, accent):
    return (f'<text x="{x}" y="{y}" font-family="{WORD_FONT}" font-size="{size}" font-weight="700" '
            f'letter-spacing="{size*0.06:.1f}" fill="{ink}">ZOOKA</text>'
            f'<text x="{x + size*2.62:.1f}" y="{y}" font-family="{WORD_FONT}" font-size="{size}" '
            f'font-weight="700" letter-spacing="{size*0.06:.1f}" fill="{accent}">AI</text>')

def tagline(x, y, size, fill, arabic=True):
    if arabic:
        return (f'<text x="{x}" y="{y}" font-family="Cairo, Tahoma, sans-serif" font-size="{size}" '
                f'fill="{fill}" text-anchor="middle" direction="rtl">تقنية بإيمان، تقدّم بأخلاق</text>')
    return (f'<text x="{x}" y="{y}" font-family="{WORD_FONT}" font-size="{size}" fill="{fill}" '
            f'letter-spacing="{size*0.18:.1f}" text-anchor="middle">INNOVATE &#183; AUTOMATE &#183; GROW</text>')

def write(name, body, w, h, vb=None):
    vb = vb or f"0 0 {w} {h}"
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" '
           f'role="img" aria-label="ZOOKA AI">\n{body}\n</svg>\n')
    (OUT / name).write_text(svg, encoding="utf-8")
    return name

# ---------------------------------------------------------------- 1. symbol
def symbol_only(name, bg=None, a=None, b=None, pad=8):
    a = a or P["blue"]; b = b or P["purple"]
    body = f'<defs>{grad("s", a, b)}{glow("s", a)}</defs>'
    if bg:
        body += f'<rect width="100" height="100" rx="22" fill="{bg}"/>'
    body += f'<g transform="translate({pad},{pad}) scale({(100-2*pad)/100})" filter="url(#sf)">{z_symbol(a,b,"s")}</g>'
    return write(name, body, 512, 512, "0 0 100 100")

files = []
files.append(symbol_only("symbol-dark.svg"))
files.append(symbol_only("symbol-light.svg", bg=P["ice"], a=P["blue"], b=P["purple"]))
files.append(symbol_only("symbol-mono-ice.svg", a=P["ice"], b=P["ice"]))
files.append(symbol_only("symbol-mono-ink.svg", a=P["ink"], b=P["ink"]))

# ---------------------------------------------------------------- 2. lockups
def lockup(name, w, h, ink, accent, mark_bg=None, with_tagline=False, tag_fill=None):
    body = f'<defs>{grad("l", P["blue"], P["purple"])}{glow("l", P["blue"])}</defs>'
    if mark_bg:
        body += f'<rect x="0" y="{h*0.10:.0f}" width="{h*0.80:.0f}" height="{h*0.80:.0f}" rx="{h*0.18:.0f}" fill="{mark_bg}"/>'
    s = h * 0.62 / 100
    body += (f'<g transform="translate({(h*0.80-100*s)/2:.1f},{h*0.5-50*s:.1f}) scale({s})">'
             f'{z_symbol(P["blue"],P["purple"],"l")}</g>')
    size = h * 0.42
    body += wordmark(h * 0.98, h * 0.60, size, ink, accent)
    if with_tagline:
        body += tagline(h * 0.98 + size * 2.62 + h * 0.10, h * 0.60, size * 0.30, tag_fill or P["muted_dark"])
    return write(name, body, w, h)

files.append(lockup("logo-horizontal-dark.svg", 520, 140, P["ice"], P["cyan"]))
files.append(lockup("logo-horizontal-light.svg", 520, 140, P["ink"], P["purple"]))
files.append(lockup("logo-horizontal-dark-tagline.svg", 760, 140, P["ice"], P["cyan"], with_tagline=True))
files.append(lockup("logo-horizontal-light-tagline.svg", 760, 140, P["ink"], P["purple"], with_tagline=True, tag_fill=P["muted_light"]))

def vertical(name, ink, accent, tag_fill):
    body = f'<defs>{grad("v", P["blue"], P["purple"])}{glow("v", P["blue"])}</defs>'
    body += f'<g transform="translate(60,10) scale(1.0)">{z_symbol(P["blue"],P["purple"],"v")}</g>'
    body += wordmark(60 + 100/2 - 100, 168, 34, ink, accent)  # centred by eye on the 100-wide mark
    body += tagline(110, 196, 12, tag_fill)
    return write(name, body, 220, 220)

files.append(vertical("logo-vertical-dark.svg", P["ice"], P["cyan"], P["muted_dark"]))
files.append(vertical("logo-vertical-light.svg", P["ink"], P["purple"], P["muted_light"]))

# ---------------------------------------------------------------- 3. app icon + favicon
def app_icon(name, size, radius, bg, inset):
    body = (f'<defs>{grad("a", P["blue"], P["purple"])}{glow("a", P["cyan"])}'
            f'<radialGradient id="ag" cx="0.5" cy="0.1" r="0.9">'
            f'<stop offset="0" stop-color="{P["navy2"]}"/><stop offset="1" stop-color="{bg}"/></radialGradient></defs>'
            f'<rect width="{size}" height="{size}" rx="{radius}" fill="url(#ag)"/>'
            f'<circle cx="{size*0.5}" cy="{size*0.08}" r="{size*0.55}" fill="{P["blue"]}" opacity="0.10"/>')
    s = (size - 2 * inset) / 100
    body += f'<g transform="translate({inset},{inset}) scale({s})">{z_symbol(P["blue"],P["purple"],"a")}</g>'
    return write(name, body, size, size)

files.append(app_icon("app-icon-1024.svg", 1024, 224, P["navy"], 190))
files.append(app_icon("app-icon-512.svg", 512, 112, P["navy"], 95))
files.append(app_icon("favicon-32.svg", 32, 7, P["navy"], 4))
files.append(app_icon("favicon-16.svg", 16, 4, P["navy"], 2.5))

# avatar: circular, safe inside a 512 crop
body = (f'<defs>{grad("av", P["blue"], P["purple"])}{glow("av", P["cyan"])}'
        f'<clipPath id="avc"><circle cx="256" cy="256" r="256"/></clipPath></defs>'
        f'<g clip-path="url(#avc)"><rect width="512" height="512" fill="{P["navy"]}"/>'
        f'<circle cx="256" cy="60" r="300" fill="{P["blue"]}" opacity="0.12"/>'
        f'<g transform="translate(126,126) scale(2.6)">{z_symbol(P["blue"],P["purple"],"av")}</g></g>')
files.append(write("avatar-512.svg", body, 512, 512))

# ---------------------------------------------------------------- 4. agent mascots
HEAD = "M30,34 h60 a16,16 0 0 1 16,16 v34 a16,16 0 0 1 -16,16 h-60 a16,16 0 0 1 -16,-16 v-34 a16,16 0 0 1 16,-16 z"

def robot(name, tint_a, tint_b, accessory=""):
    body = (f'<defs>{grad("r", tint_a, tint_b)}{glow("r", tint_a)}'
            f'<linearGradient id="rv" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{P["navy2"]}"/><stop offset="1" stop-color="{P["navy"]}"/></linearGradient></defs>'
            f'<circle cx="60" cy="60" r="56" fill="{P["navy"]}" opacity="0.9"/>'
            # antenna
            f'<line x1="60" y1="34" x2="60" y2="20" stroke="{tint_a}" stroke-width="2.5" stroke-linecap="round"/>'
            f'<circle cx="60" cy="17" r="4.5" fill="{tint_a}" filter="url(#rf)"/>'
            # head
            f'<rect x="30" y="34" width="60" height="46" rx="14" fill="url(#rv)" stroke="{tint_a}" stroke-width="2"/>'
            # visor + eyes
            f'<rect x="40" y="46" width="40" height="18" rx="9" fill="{tint_a}" opacity="0.16"/>'
            f'<circle cx="50" cy="55" r="3.4" fill="{P["ice"]}"/><circle cx="70" cy="55" r="3.4" fill="{P["ice"]}"/>'
            f'<path d="M52,66 q8,5 16,0" stroke="{tint_a}" stroke-width="2" fill="none" stroke-linecap="round"/>'
            # chest Z
            f'<rect x="48" y="86" width="24" height="24" rx="7" fill="{tint_b}" opacity="0.18"/>'
            f'<g transform="translate(52,90) scale(0.16)">{z_symbol(tint_a,tint_b,"r")}</g>'
            + accessory)
    return write(name, body, 120, 120, "0 0 120 120")

ACC = {
 "general": "",
 "research": '<circle cx="88" cy="78" r="9" fill="none" stroke="#4FD1E8" stroke-width="2.5"/><line x1="94" y1="84" x2="101" y2="91" stroke="#4FD1E8" stroke-width="3" stroke-linecap="round"/>',
 "writing": '<path d="M86,60 l14,-8 l-4,15 z" fill="#E2A03F"/><line x1="84" y1="68" x2="92" y2="62" stroke="#E2A03F" stroke-width="2"/>',
 "design": '<circle cx="92" cy="66" r="6" fill="#A23B72"/><circle cx="100" cy="76" r="4.5" fill="#6C7BE0"/><circle cx="84" cy="76" r="4" fill="#4FD1E8"/>',
 "automation": '<g transform="translate(86,60)"><circle r="7" fill="none" stroke="#4FD1E8" stroke-width="2.4" stroke-dasharray="4 4"/><circle r="2" fill="#4FD1E8"/></g>',
 "analytics": '<rect x="84" y="70" width="4" height="10" fill="#2FBF71"/><rect x="90" y="62" width="4" height="18" fill="#2FBF71"/><rect x="96" y="66" width="4" height="14" fill="#2FBF71"/>',
 "support": '<path d="M78,46 a22,22 0 0 1 24,0" stroke="#6C7BE0" stroke-width="3" fill="none"/><rect x="76" y="44" width="6" height="12" rx="3" fill="#6C7BE0"/><rect x="98" y="44" width="6" height="12" rx="3" fill="#6C7BE0"/>',
}
for name, (a, b) in AGENT_TINT.items():
    files.append(f"agents/{robot(f'agent-{name}.svg', a, b, ACC[name])}")

# ---------------------------------------------------------------- 5. social templates
def social(name, w, h, headline, sub, demo_label=None, layout="post"):
    body = (f'<defs>{grad("so", P["blue"], P["purple"])}'
            f'<radialGradient id="sog" cx="0.75" cy="0.1" r="1">'
            f'<stop offset="0" stop-color="{P["purple"]}" stop-opacity="0.30"/>'
            f'<stop offset="0.6" stop-color="{P["navy"]}"/><stop offset="1" stop-color="{P["navy"]}"/></radialGradient>'
            f'<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">'
            f'<path d="M40,0 L0,0 L0,40" fill="none" stroke="{P["blue"]}" stroke-opacity="0.07" stroke-width="1"/></pattern></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#sog)"/><rect width="{w}" height="{h}" fill="url(#grid)"/>')
    # mark + wordmark, top-left, inside a 6% safe margin
    m = min(w, h) * 0.06
    s = min(w, h) * 0.085 / 100
    body += f'<g transform="translate({m},{m}) scale({s*100/100})"><g transform="scale({s})">{z_symbol(P["blue"],P["purple"],"so")}</g></g>'
    body += (f'<text x="{m + min(w,h)*0.085 + m*0.4:.0f}" y="{m + min(w,h)*0.062:.0f}" font-family="{WORD_FONT}" '
             f'font-size="{min(w,h)*0.048:.0f}" font-weight="700" fill="{P["ice"]}" letter-spacing="2">ZOOKA <tspan fill="{P["cyan"]}">AI</tspan></text>')
    hy = h * (0.62 if layout == "post" else 0.70)
    body += (f'<text x="{m}" y="{hy}" font-family="{WORD_FONT}" font-size="{w*0.072:.0f}" font-weight="700" '
             f'fill="{P["ice"]}">{headline}</text>')
    body += (f'<text x="{m}" y="{hy + w*0.062:.0f}" font-family="{WORD_FONT}" font-size="{w*0.030:.0f}" '
             f'fill="{P["muted_dark"]}">{sub}</text>')
    body += tagline(w/2, h - m*0.5, w*0.026, P["muted_dark"])
    body += f'<rect x="0" y="{h-6}" width="{w}" height="6" fill="url(#so)"/>'
    if demo_label:
        body += (f'<rect x="{w-m*4.2:.0f}" y="{h-m*1.5:.0f}" width="{m*4.0:.0f}" height="{m*0.9:.0f}" rx="{m*0.2:.0f}" '
                 f'fill="{P["ice"]}" opacity="0.10"/>'
                 f'<text x="{w-m*2.2:.0f}" y="{h-m*0.87:.0f}" font-family="{WORD_FONT}" font-size="{m*0.42:.0f}" '
                 f'fill="{P["muted_dark"]}" text-anchor="middle">{demo_label}</text>')
    return write(name, body, w, h)

files.append(social("social/instagram-post.svg", 1080, 1080, "Automate the work.", "Agents that run your operations", "DEMO", "post"))
files.append(social("social/instagram-story.svg", 1080, 1920, "Innovate.", "Automate. Grow.", None, "story"))
files.append(social("social/linkedin-banner.svg", 1584, 396, "ZOOKA AI", "AI agents for real operations", None, "wide"))
files.append(social("social/x-header.svg", 1500, 500, "Innovate \u00b7 Automate \u00b7 Grow", "zooka-ai.com", None, "wide"))
files.append(social("social/youtube-thumbnail.svg", 1280, 720, "Meet the agents", "Zooka AI, in Arabic and English", "DEMO", "post"))

print(f"generated {len(files)} assets")
for f in sorted(files):
    print("  ", f)
