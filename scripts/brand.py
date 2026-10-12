#!/usr/bin/env python3
"""
STRIDE brand asset generator v3 — "Route-S" identity.

Mark: balanced double-bowl S drawn as a running route + bold white start-dot.
Ember gradient: amber -> strava orange -> hot red-pink.
Wordmark: real glyph outlines from Archivo Black (athletic grotesque),
gradient-filled, route-adjacent wide tracking.

Outputs (under /home/z/my-project/public):
  brand/stride-mark.svg / stride-mark-ink.svg / stride-wordmark.svg / stride-lockup.svg
  brand/splash/*.png (iOS startup set) + splash-media.json
  icons/icon-512/192/48, maskable-512/192, apple-touch-icon
  og-image.png, logo-mark.svg / logo.svg / logo-wordmark.svg (legacy paths)
Also writes src/components/app/brand-data.ts (React source of truth).
"""
import os
import json
import cairosvg
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = "/home/z/my-project/public"
SRC = "/home/z/my-project/src/components/app"
BRAND = os.path.join(ROOT, "brand")
ICONS = os.path.join(ROOT, "icons")
SPLASH = os.path.join(BRAND, "splash")
FONT = "/home/z/my-project/scripts/assets/ArchivoBlack.ttf"
for d in (BRAND, ICONS, SPLASH):
    os.makedirs(d, exist_ok=True)

# ── Palette ──────────────────────────────────────────────────────────────────
EMBER_LIGHT = "#FF9A44"   # amber
EMBER_CORE  = "#FC4C02"   # strava-line orange
EMBER_HOT   = "#FF2F5E"   # hot red-pink
INK_A       = "#1D1C26"   # icon tile gradient top
INK_B       = "#0A0A0F"   # icon tile gradient bottom
INK         = "#17161D"   # ink for light surfaces
WHITE       = "#FFFFFF"

# ── The Route-S mark (viewBox 512) v3: lower tail extended, top lightened ────
MARK_PATH = ("M 352,152 C 312,106 194,106 156,148 "
             "C 124,184 176,224 256,258 "
             "C 336,292 388,328 356,370 "
             "C 324,412 204,418 150,372")
MARK_STROKE = 64
DOT_CX, DOT_CY, DOT_R = 352, 152, 54

def ember_gradient(gid, vertical=True):
    if vertical:
        return (f'<linearGradient id="{gid}" x1="0" y1="94" x2="0" y2="424" '
                f'gradientUnits="userSpaceOnUse">'
                f'<stop offset="0" stop-color="{EMBER_LIGHT}"/>'
                f'<stop offset="0.45" stop-color="{EMBER_CORE}"/>'
                f'<stop offset="1" stop-color="{EMBER_HOT}"/></linearGradient>')
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="0">'
            f'<stop offset="0" stop-color="{EMBER_LIGHT}"/>'
            f'<stop offset="0.45" stop-color="{EMBER_CORE}"/>'
            f'<stop offset="1" stop-color="{EMBER_HOT}"/></linearGradient>')

def wordmark_gradient(gid, span):
    """Continuous gradient across the whole wordmark (userSpaceOnUse)."""
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="{span:.2f}" y2="0" '
            f'gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{EMBER_LIGHT}"/>'
            f'<stop offset="0.45" stop-color="{EMBER_CORE}"/>'
            f'<stop offset="1" stop-color="{EMBER_HOT}"/></linearGradient>')

def mark_group(stroke_color=None, dot_color=WHITE, dot=True, dot_ring="#0A0A0F"):
    """dot_ring: bg-colored halo separating the dot from the trace (prevents
    bleeding into one fuzzy shape at 16px). Use white ring on light surfaces."""
    sc = "url(#ember)" if stroke_color is None else stroke_color
    dot_el = (f'<circle cx="{DOT_CX}" cy="{DOT_CY}" r="{DOT_R}" fill="{dot_color}" '
              f'stroke="{dot_ring}" stroke-width="10"/>' if dot else "")
    return (f'<path d="{MARK_PATH}" fill="none" stroke="{sc}" stroke-width="{MARK_STROKE}" '
            f'stroke-linecap="round"/>' + dot_el)

# ── Wordmark: Archivo Black glyph outlines ───────────────────────────────────
_font = TTFont(FONT)
_gs = _font.getGlyphSet()
_cmap = _font.getBestCmap()
_capH = getattr(_font["OS/2"], "sCapHeight", 700) or 700
ADV_TRACK = 0  # font units of extra tracking (Archivo Black spacing is already wide)

WM_SCALE = 100.0 / _capH  # font units -> cap-height-100 space
WM_LETTERS = []  # (d baked into final cap-100 coords, x in font units)
_x = 0
for ch in "STRIDE":
    gname = _cmap[ord(ch)]
    pen = SVGPathPen(_gs)
    # bake glyph -> final space: flip y, scale to cap 100, translate to letter x
    tpen = TransformPen(pen, Transform(WM_SCALE, 0, 0, -WM_SCALE, _x * WM_SCALE, 100))
    _gs[gname].draw(tpen)
    WM_LETTERS.append((pen.getCommands(), _x))
    _x += _font["hmtx"][gname][0] + ADV_TRACK
WM_TOTAL_ADV = _x - ADV_TRACK
WM_W = WM_TOTAL_ADV * WM_SCALE  # wordmark width at cap 100

def wordmark_body(fill="url(#emberW)"):
    """Glyphs at cap-height 100, baseline y=100, in a W x 100 box (baked coords)."""
    return "".join(f'<path d="{d}" fill="{fill}"/>' for d, _x in WM_LETTERS)

# ── SVG documents ────────────────────────────────────────────────────────────
def svg_doc(view_w, view_h, w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_w} {view_h}" '
            f'width="{w}" height="{h}">{body}</svg>')

def icon_svg():
    defs = (ember_gradient("ember")
            + f'<linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{INK_A}"/>'
            f'<stop offset="1" stop-color="{INK_B}"/></linearGradient>'
            + f'<radialGradient id="glow" cx="256" cy="256" r="210" '
            f'gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{EMBER_CORE}" stop-opacity="0.20"/>'
            f'<stop offset="1" stop-color="{EMBER_CORE}" stop-opacity="0"/></radialGradient>')
    body = (f'<defs>{defs}</defs>'
            f'<rect width="512" height="512" fill="url(#tile)"/>'
            f'<rect width="512" height="512" fill="url(#glow)"/>'
            f'<g>{mark_group()}</g>')
    return svg_doc(512, 512, 512, 512, body)

def mark_only_svg(ink=False):
    if ink:
        body = f'<g transform="translate(0,26)">{mark_group(stroke_color=INK, dot_color=EMBER_CORE, dot_ring="#FFFFFF")}</g>'
        return svg_doc(512, 552, 512, 552, body)
    return svg_doc(512, 512, 512, 512, f'<defs>{ember_gradient("ember")}</defs><g>{mark_group()}</g>')

def wordmark_doc():
    return svg_doc(WM_W, 100, WM_W, 100,
                   f'<defs>{wordmark_gradient("emberW", WM_W)}</defs>{wordmark_body()}')

def lockup_svg():
    """Vertical lockup: mark 232, gap 52, wordmark at 1.18x mark width."""
    mark_px = 232
    mark_s = mark_px / 512
    wm_w = mark_px * 1.18
    wm_s = wm_w / WM_W  # overall scale for cap-100 box
    wm_h = 100 * wm_s
    canvas_w = 320
    mx = (canvas_w - mark_px) / 2
    gap = 52
    wx = (canvas_w - wm_w) / 2 + 3  # optical nudge
    defs = ember_gradient("ember") + wordmark_gradient("emberW", WM_W)
    body = (f'<defs>{defs}</defs>'
            f'<g transform="translate({mx:.0f},0) scale({mark_s:.4f})">{mark_group()}</g>'
            f'<g transform="translate({wx:.0f},{mark_px + gap:.0f}) scale({wm_s:.4f})">'
            f'{wordmark_body()}</g>')
    h = mark_px + gap + wm_h
    return svg_doc(canvas_w, h, canvas_w, h, body)

def tagline_elements(cx, y, size):
    """Two-tone caps tagline: dim lead-in, bright payoff."""
    return (f'<text x="{cx}" y="{y}" text-anchor="middle" '
            f'font-family="Liberation Sans, Arial, sans-serif" font-weight="bold" '
            f'font-size="{size}" letter-spacing="3">'
            f'<tspan fill="#9C9CA8">BUILT FOR </tspan>'
            f'<tspan fill="#E6E6EE">THE LONG RUN</tspan></text>')

def splash_svg(w, h):
    """iOS static splash: near-black bg, lockup at optical center, caps tagline."""
    mark_px = w * 0.32
    mark_s = mark_px / 512
    wm_w = mark_px * 1.18
    wm_s = wm_w / WM_W
    wm_h = 100 * wm_s
    gap = w * 0.077
    group_h = mark_px + gap + wm_h
    top = h * 0.42 - group_h / 2
    cx = w / 2
    defs = (ember_gradient("ember") + wordmark_gradient("emberW", WM_W)
            + f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="#0B0A0F"/>'
            f'<stop offset="1" stop-color="#050508"/></linearGradient>')
    body = (f'<defs>{defs}</defs>'
            f'<rect width="{w}" height="{h}" fill="url(#bg)"/>'
            f'<g transform="translate({cx - mark_px / 2:.0f},{top:.0f}) scale({mark_s:.4f})">{mark_group()}</g>'
            f'<g transform="translate({cx - wm_w / 2 + w * 0.004:.0f},{top + mark_px + gap:.0f}) scale({wm_s:.4f})">'
            f'{wordmark_body()}</g>'
            + tagline_elements(cx, top + mark_px + gap + wm_h + h * 0.038, max(15, w * 0.027)))
    return svg_doc(w, h, w, h, body)

def og_svg():
    """1200x630 social card: mark left, wordmark right, caps subtitle."""
    mark_px = 250
    mark_s = mark_px / 512
    wm_w = 560
    wm_s = wm_w / WM_W
    wm_h = 100 * wm_s
    defs = (ember_gradient("ember") + wordmark_gradient("emberW", WM_W)
            + f'<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="#121118"/>'
            f'<stop offset="1" stop-color="#06060A"/></linearGradient>')
    body = (f'<defs>{defs}</defs>'
            f'<rect width="1200" height="630" fill="url(#bg)"/>'
            f'<g transform="translate(140,190) scale({mark_s:.4f})">{mark_group()}</g>'
            f'<g transform="translate(500,{315 - wm_h / 2:.0f}) scale({wm_s:.4f})">'
            f'{wordmark_body()}</g>'
            + tagline_elements(600, 560, 24))
    return svg_doc(1200, 630, 1200, 630, body)

# ── Write + rasterize ────────────────────────────────────────────────────────
def write_text(path, content):
    with open(path, "w") as f:
        f.write(content)
    print(f"  svg  {path}  ({os.path.getsize(path)} B)")

def png(path, svg, width, height):
    cairosvg.svg2png(bytestring=svg.encode(), write_to=path,
                     output_width=width, output_height=height)
    print(f"  png  {path}  {width}x{height}  ({os.path.getsize(path)//1024} KB)")

print("Generating STRIDE brand assets (v3)…")

write_text(f"{BRAND}/stride-mark.svg", mark_only_svg())
write_text(f"{BRAND}/stride-mark-ink.svg", mark_only_svg(ink=True))
write_text(f"{BRAND}/stride-wordmark.svg", wordmark_doc())
write_text(f"{BRAND}/stride-lockup.svg", lockup_svg())
write_text(f"{ROOT}/logo-mark.svg", mark_only_svg())
write_text(f"{ROOT}/logo-wordmark.svg", wordmark_doc())
write_text(f"{ROOT}/logo.svg", lockup_svg())

icon = icon_svg()
png(f"{ICONS}/icon-512.png", icon, 512, 512)
png(f"{ICONS}/icon-192.png", icon, 192, 192)
png(f"{ICONS}/icon-48.png", icon, 48, 48)
png(f"{ICONS}/maskable-512.png", icon, 512, 512)
png(f"{ICONS}/maskable-192.png", icon, 192, 192)
png(f"{ICONS}/apple-touch-icon.png", icon, 180, 180)

SPLASHES = [
    ("750x1334", 750, 1334, "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"),
    ("1170x2532", 1170, 2532, "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"),
    ("1179x2556", 1179, 2556, "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"),
    ("1284x2774", 1284, 2774, "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"),
    ("1290x2796", 1290, 2796, "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"),
    ("1668x2388", 1668, 2388, "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"),
    ("2048x2732", 2048, 2732, "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"),
]
for name, w, h, _m in SPLASHES:
    png(f"{SPLASH}/splash-{name}.png", splash_svg(w, h), w, h)

png(f"{ROOT}/og-image.png", og_svg(), 1200, 630)

with open(f"{BRAND}/splash-media.json", "w") as f:
    json.dump([{"file": f"/brand/splash/splash-{n}.png", "media": m} for n, _, _, m in SPLASHES], f, indent=2)
print("  json splash-media.json written")

# ── React source of truth ────────────────────────────────────────────────────
letters_ts = ",\n  ".join(f'{{ d: "{d}" }}' for d, _x in WM_LETTERS)
ts = f'''// AUTO-GENERATED by scripts/brand.py — STRIDE brand geometry (do not edit by hand).
// Mark: 512 viewBox, Route-S running trace + start dot.
// Wordmark: Archivo Black outlines; x in font units, WM_SCALE maps to cap-height-100.
export const MARK_PATH = "{MARK_PATH}";
export const MARK_STROKE = {MARK_STROKE};
export const MARK_DOT = {{ cx: {DOT_CX}, cy: {DOT_CY}, r: {DOT_R} }} as const;
export const EMBER_LIGHT = "{EMBER_LIGHT}";
export const EMBER_CORE = "{EMBER_CORE}";
export const EMBER_HOT = "{EMBER_HOT}";
export const WM_SCALE = {WM_SCALE:.6f};
export const WM_TOTAL_ADV = {WM_TOTAL_ADV};
export const WM_W = {WM_W:.2f}; // wordmark width at cap height 100
// letter paths baked into final coordinates (cap 100, baseline y=100)
export const WM_LETTERS: {{ d: string }}[] = [
  {letters_ts},
];
'''
write_text(f"{SRC}/brand-data.ts", ts)
print("Done.")
