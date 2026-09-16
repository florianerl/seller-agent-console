#!/usr/bin/env python3
"""Generate the PWA icon set.

Run once, locally, and commit the output:

    python3 scripts/generate-icons.py

Deliberately not run in CI. Rasterising during the build makes the artefact
non-deterministic and adds a rendering dependency to the pipeline for an asset
that changes about twice a year.

The mark is pure geometry — no text and no font. The existing draft icons used
an SVG system-font stack, which renders in a different typeface on every OS and
falls back to missing glyphs in a container where no font is installed. Shapes
avoid that class of problem entirely.

This is a placeholder mark. Whether the real IAB logo should be used instead is
a maintainer decision, and replacing it means re-running this script only.
"""

from PIL import Image, ImageDraw

BRAND_BLACK = (34, 31, 31, 255)   # #221F1F
BRAND_RED = (238, 49, 38, 255)    # #EE3126
WHITE = (255, 255, 255, 255)

# Supersample then downscale: Pillow does not antialias primitives.
SS = 8


def draw_mark(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    """Three ascending bars, the tallest in brand red, inside `box`."""
    x0, y0, x1, y1 = box
    width = x1 - x0
    height = y1 - y0

    bar_w = width * 0.26
    gap = (width - 3 * bar_w) / 2
    heights = (0.45, 0.72, 1.0)
    colours = (WHITE, WHITE, BRAND_RED)
    radius = bar_w * 0.35

    for index, (factor, colour) in enumerate(zip(heights, colours)):
        left = x0 + index * (bar_w + gap)
        top = y1 - height * factor
        draw.rounded_rectangle(
            [left, top, left + bar_w, y1], radius=radius, fill=colour
        )


def draw_simple_mark(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    """A single red bar for sizes where three bars become mush (favicons)."""
    x0, y0, x1, y1 = box
    width = x1 - x0
    bar_w = width * 0.34
    left = x0 + (width - bar_w) / 2
    draw.rounded_rectangle([left, y0, left + bar_w, y1], radius=bar_w * 0.3, fill=BRAND_RED)


def render(size: int, *, maskable: bool = False, rounded: bool = True, simple: bool = False) -> Image.Image:
    canvas = size * SS
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    if rounded and not maskable:
        draw.rounded_rectangle([0, 0, canvas, canvas], radius=canvas * 0.22, fill=BRAND_BLACK)
    else:
        # Maskable and apple-touch icons must be full-bleed and opaque: the OS
        # applies its own mask, and a transparent or pre-rounded icon looks
        # wrong once it does.
        draw.rectangle([0, 0, canvas, canvas], fill=BRAND_BLACK)

    # An adaptive mask can crop 10% from every edge, so a maskable mark has to
    # sit well inside the safe circle. `any` icons can use more of the canvas.
    inset = 0.30 if maskable else 0.24
    box = (canvas * inset, canvas * inset, canvas * (1 - inset), canvas * (1 - inset))

    if simple:
        draw_simple_mark(draw, box)
    else:
        draw_mark(draw, box)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    out = "public/icons"

    render(192).save(f"{out}/icon-192.png")
    render(512).save(f"{out}/icon-512.png")
    render(192, maskable=True).save(f"{out}/icon-maskable-192.png")
    render(512, maskable=True).save(f"{out}/icon-maskable-512.png")
    # iOS ignores manifest icons for the home screen and applies its own
    # rounding, so this one is square and opaque.
    render(180, rounded=False).save(f"{out}/apple-touch-icon.png")

    # Three thin bars turn to mush below ~48px, so favicons use the simpler mark.
    ico = [render(s, simple=(s <= 32)) for s in (16, 32, 48)]
    ico[0].save("public/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[1:])

    print("wrote icons to", out)


if __name__ == "__main__":
    main()
