#!/usr/bin/env python3
"""Renders the app icon PNGs from the SVG sources in frontend/public/icons/.

Pillow and resvg-py are not project dependencies. Run it as a one-off:

    uv run --with pillow --with resvg-py python scripts/render_icons.py

Every PNG except the favicon is flattened onto the dark background colour and saved
without an alpha channel. iOS fills transparent pixels of apple-touch-icon with black.
"""

from __future__ import annotations

import importlib
import io
from pathlib import Path

ICON_DIR = Path(__file__).resolve().parents[1] / "frontend" / "public" / "icons"
BACKGROUND = (12, 17, 23)  # --ink in frontend/src/index.css

# (source svg, output png, size, keep_alpha)
TARGETS = [
    ("icon.svg", "apple-touch-icon-180.png", 180, False),
    ("icon.svg", "icon-192.png", 192, False),
    ("icon.svg", "icon-512.png", 512, False),
    ("icon-maskable.svg", "icon-maskable-512.png", 512, False),
    ("favicon.svg", "favicon-32.png", 32, True),
]


def main() -> None:
    """Render every target PNG next to its SVG source."""
    resvg = importlib.import_module("resvg_py")
    image_module = importlib.import_module("PIL.Image")
    for source, output, size, keep_alpha in TARGETS:
        png_bytes = bytes(
            resvg.svg_to_bytes(svg_path=str(ICON_DIR / source), width=size, height=size)
        )
        image = image_module.open(io.BytesIO(png_bytes)).convert("RGBA")
        if not keep_alpha:
            flat = image_module.new("RGB", image.size, BACKGROUND)
            flat.paste(image, mask=image.getchannel("A"))
            image = flat
        image.save(ICON_DIR / output, optimize=True)
        print(f"{output}: {image.mode} {image.size[0]}x{image.size[1]}")


if __name__ == "__main__":
    main()
