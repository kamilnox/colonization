"""Draws the app icons (a caravel at sea) with Pillow. Run: python3 tools/make_icons.py"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
S = 1024


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(scale=1.0):
    img = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(img)
    sky_top, sky_low = (22, 38, 64), (232, 160, 84)
    horizon = int(S * 0.62)
    for y in range(horizon):
        d.line([(0, y), (S, y)], fill=lerp(sky_top, sky_low, (y / horizon) ** 1.6))
    sea_top, sea_low = (38, 92, 140), (16, 44, 74)
    for y in range(horizon, S):
        d.line([(0, y), (S, y)], fill=lerp(sea_top, sea_low, (y - horizon) / (S - horizon)))
    # Sun on the horizon.
    r = 120
    d.ellipse([S * 0.70 - r, horizon - r, S * 0.70 + r, horizon + r], fill=(255, 214, 120))
    for y in range(horizon, S):
        d.line([(0, y), (S, y)], fill=lerp(sea_top, sea_low, (y - horizon) / (S - horizon)))
    d.rectangle([S * 0.58, horizon + 18, S * 0.82, horizon + 26], fill=(250, 200, 110))
    d.rectangle([S * 0.62, horizon + 44, S * 0.78, horizon + 50], fill=(240, 190, 100))

    def p(x, y):
        cx, cy = S / 2, S * 0.55
        return (cx + (x - 0.5) * S * scale, cy + (y - 0.55) * S * scale)

    # Hull.
    hull = [p(0.22, 0.60), p(0.80, 0.60), p(0.72, 0.72), p(0.30, 0.72)]
    d.polygon(hull, fill=(92, 52, 28))
    d.polygon([p(0.24, 0.60), p(0.78, 0.60), p(0.77, 0.63), p(0.25, 0.63)], fill=(128, 78, 40))
    d.polygon([p(0.70, 0.52), p(0.82, 0.52), p(0.80, 0.60), p(0.70, 0.60)], fill=(92, 52, 28))
    # Masts.
    for x, top in [(0.40, 0.18), (0.58, 0.24)]:
        d.rectangle([p(x - 0.008, top), p(x + 0.008, 0.60)], fill=(60, 36, 20))
    # Sails.
    sail = (246, 238, 220)
    d.polygon([p(0.29, 0.24), p(0.50, 0.24), p(0.52, 0.42), p(0.28, 0.42)], fill=sail)
    d.polygon([p(0.29, 0.44), p(0.51, 0.44), p(0.53, 0.56), p(0.27, 0.56)], fill=sail)
    d.polygon([p(0.49, 0.30), p(0.66, 0.30), p(0.68, 0.46), p(0.48, 0.46)], fill=sail)
    d.polygon([p(0.60, 0.48), p(0.78, 0.50), p(0.60, 0.56)], fill=sail)
    # Red cross on the main sail.
    d.rectangle([p(0.385, 0.25), p(0.405, 0.41)], fill=(196, 40, 40))
    d.rectangle([p(0.30, 0.32), p(0.49, 0.34)], fill=(196, 40, 40))
    # Flag.
    d.polygon([p(0.40, 0.18), p(0.47, 0.20), p(0.40, 0.22)], fill=(196, 40, 40))
    # Waves.
    for i, y in enumerate([0.75, 0.80]):
        d.line([p(0.18 + i * 0.05, y), p(0.84 - i * 0.05, y)], fill=(170, 210, 235), width=int(10 * scale))
    return img


def main():
    OUT.mkdir(exist_ok=True)
    full = draw_icon(1.0)
    for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
        full.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    # Maskable icons get cropped to a circle or squircle, so keep the ship inside the safe zone.
    draw_icon(0.78).resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)


if __name__ == "__main__":
    main()
