"""Generates the app icons (a curvy "M" and a rupee sign on the app's purple gradient) into public/icons/.

Run once with:   python3 scripts/make-icons.py
The PNGs are committed, so this is NOT part of the build. Needs only Pillow: both letters are drawn from
strokes (no fonts), so it gives the same result on any machine.

  M  : one smooth, rounded line (rounded peaks, deep rounded valley, round ends), stroke weight "bold"
  ₹  : laid out like the real rupee sign (two full-width bars, a bowl, a base starting at the left edge and a
       diagonal leg), drawn with one even round stroke, weight "light"
"""
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons")
WHITE = (255, 255, 255)
SS = 4                                   # supersampling for smooth edges
GRADIENT = ((124, 111, 232), (76, 63, 184))   # top-left -> bottom-right (the app purple, #6558D3 family)

M_STROKE = 0.15      # "bold" M  (stroke as a fraction of the path height)
RUPEE_STROKE = 0.114  # "light" rupee (stroke as a fraction of the glyph height)


# ───────────── drawing helpers ─────────────

def stamp(draw, pts, t):
    """Draw a thick, round-ended line by stamping circles along a densely sampled path."""
    dense = []
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0)))
        for k in range(n):
            dense.append((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n))
    dense.append(pts[-1])
    for x, y in dense:
        draw.ellipse([x - t / 2, y - t / 2, x + t / 2, y + t / 2], fill=255)


def rounded_poly(pts, radii, n=24):
    """Replace every inner corner of a polyline by a smooth quadratic curve."""
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]

        def toward(a, b, dist):
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            k = min(dist, length * 0.48) / length
            return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)

        s, e = toward(p1, p0, radii[i - 1]), toward(p1, p2, radii[i - 1])
        out.append(s)
        for j in range(1, n):
            t = j / n
            out.append(((1 - t) ** 2 * s[0] + 2 * (1 - t) * t * p1[0] + t * t * e[0],
                        (1 - t) ** 2 * s[1] + 2 * (1 - t) * t * p1[1] + t * t * e[1]))
        out.append(e)
    out.append(pts[-1])
    return out


def crop_and_scale(im, scale_down):
    box = im.getbbox()
    im = im.crop(box)
    return im.resize((max(1, im.width // scale_down), max(1, im.height // scale_down)), Image.LANCZOS)


# ───────────── the two letters (greyscale masks) ─────────────

def curvy_m_mask(path_h=500, stroke=M_STROKE):
    """A softly curved M: rounded peaks, a deep rounded valley, round stroke ends."""
    H = path_h * SS
    t = int(H * stroke)
    pad = t
    im = Image.new("L", (H + 2 * pad, H + 2 * pad), 0)
    d = ImageDraw.Draw(im)
    P = lambda x, y: (pad + x * H, pad + y * H)
    corners = [P(0, 1), P(0, 0.06), P(0.5, 0.80), P(1, 0.06), P(1, 1)]
    stamp(d, rounded_poly(corners, [H * 0.26, H * 0.40, H * 0.26]), t)
    return crop_and_scale(im, SS)


def rupee_mask(stroke=RUPEE_STROKE, out_h=600):
    """The rupee sign laid out like the real glyph (proportions measured from Helvetica Neue Bold), drawn with one
    even round stroke.  Units: glyph height = 1, glyph width = 0.68; `stroke` is a fraction of the height."""
    H = out_h * SS
    wn = 0.68
    r = stroke / 2
    pad = int(H * 0.05)
    im = Image.new("L", (int(H * wn) + 2 * pad, H + 2 * pad), 0)
    d = ImageDraw.Draw(im)
    P = lambda x, y: (pad + x * H, pad + y * H)
    t = stroke * H
    xl, xr = r, wn - r                                    # both bars run the full glyph width
    base_y = 0.485                                        # base of the bowl
    stamp(d, [P(xl, r), P(xr, r)], t)                     # top bar
    stamp(d, [P(xl, 0.285), P(xr, 0.285)], t)             # second bar
    xc = 0.25                                             # the bowl: right-hand half ellipse hanging from the top bar
    rx = 0.80 * wn - r - xc
    ry = (base_y - r) / 2
    cy = (base_y + r) / 2
    arc = [P(xc + rx * math.cos(a), cy + ry * math.sin(a)) for a in [(-math.pi / 2) + i * math.pi / 90 for i in range(91)]]
    stamp(d, arc, t)
    stamp(d, [P(xc, base_y), P(xl + 0.01, base_y)], t)    # base of the bowl, to the left edge
    stamp(d, [P(0.19, base_y + 0.015), P(xr - 0.005, 1 - r)], t)   # the diagonal leg
    return crop_and_scale(im, SS)


# ───────────── tiles ─────────────

def gradient_tile(size, rounded):
    """The app-purple gradient square (with rounded corners for the normal icons, full-bleed for maskable / Apple)."""
    big = size * SS
    small = 64                                            # build the gradient small, then stretch (it is smooth)
    grad = Image.new("RGB", (small, small))
    px = grad.load()
    (r1, g1, b1), (r2, g2, b2) = GRADIENT
    for y in range(small):
        for x in range(small):
            k = (x + y) / (2 * (small - 1))
            px[x, y] = (int(r1 + (r2 - r1) * k), int(g1 + (g2 - g1) * k), int(b1 + (b2 - b1) * k))
    grad = grad.resize((big, big), Image.BICUBIC).convert("RGBA")
    if not rounded:
        return grad
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=255)
    tile = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    tile.paste(grad, (0, 0), mask)
    return tile


def fit_height(mask, h):
    return mask.resize((max(1, round(mask.width * h / mask.height)), int(h)), Image.LANCZOS)


def render(size, m_mask, r_mask, *, rounded, width_ratio, gap=0.22):
    """M + rupee side by side, centred, both the same height; `width_ratio` = share of the tile they occupy."""
    big = size * SS
    am, ar = m_mask.width / m_mask.height, r_mask.width / r_mask.height
    h = big * width_ratio / (am + gap + ar)
    m, r = fit_height(m_mask, h), fit_height(r_mask, h)
    g = h * gap
    x = (big - (m.width + g + r.width)) / 2
    im = gradient_tile(size, rounded)
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    layer.paste(Image.new("RGBA", m.size, WHITE + (255,)), (int(x), int((big - m.height) / 2)), m)
    layer.paste(Image.new("RGBA", r.size, WHITE + (255,)), (int(x + m.width + g), int((big - r.height) / 2)), r)
    im.alpha_composite(layer)
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    m_mask, r_mask = curvy_m_mask(), rupee_mask()
    render(192, m_mask, r_mask, rounded=True, width_ratio=0.82).save(os.path.join(OUT, "icon-192.png"))
    render(512, m_mask, r_mask, rounded=True, width_ratio=0.82).save(os.path.join(OUT, "icon-512.png"))
    # Maskable: full-bleed square; the letters stay inside Android's central "safe zone" so a circle mask never clips them
    render(512, m_mask, r_mask, rounded=False, width_ratio=0.68).save(os.path.join(OUT, "icon-maskable-512.png"))
    # Apple touch icon: iOS rounds the corners itself, so it is a plain full-bleed square without transparency
    render(180, m_mask, r_mask, rounded=False, width_ratio=0.80).convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"))
    # Browser-tab icon: bigger letters so they stay readable at 64px
    render(64, m_mask, r_mask, rounded=True, width_ratio=0.88).save(os.path.join(OUT, "favicon-64.png"))
    print("icons written to", os.path.abspath(OUT))


if __name__ == "__main__":
    main()
