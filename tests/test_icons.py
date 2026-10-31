"""The home-screen icon must be an opaque PNG, otherwise iOS paints it black."""

from __future__ import annotations

import json
import re
import struct
from pathlib import Path
from urllib.parse import urlparse

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
PUBLIC = FRONTEND / "public"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# PNG colour types with an alpha channel: grey+alpha and RGBA.
ALPHA_COLOR_TYPES = {4, 6}


def _public_file(url: str) -> Path:
    """Resolve a site-absolute URL (query string ignored) to a file in frontend/public."""
    return PUBLIC / urlparse(url).path.lstrip("/")


def _read_ihdr(path: Path) -> tuple[int, int, int]:
    """Return (width, height, colour type) from the PNG header. Fails on a tRNS chunk."""
    data = path.read_bytes()
    assert data[:8] == PNG_SIGNATURE, f"{path.name} is not a PNG"
    width, height, _depth, color_type = struct.unpack(">IIBB", data[16:26])
    # A palette PNG can carry transparency in a tRNS chunk instead of an alpha channel.
    assert b"tRNS" not in data, f"{path.name} has a tRNS transparency chunk"
    return width, height, color_type


def _index_links() -> list[dict[str, str]]:
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    links = []
    for tag in re.findall(r"<link\b[^>]*>", html):
        links.append(dict(re.findall(r'([\w-]+)="([^"]*)"', tag)))
    return links


def test_apple_touch_icon_is_linked_exists_and_opaque() -> None:
    touch = [link for link in _index_links() if link.get("rel") == "apple-touch-icon"]
    assert len(touch) == 1
    assert touch[0].get("sizes") == "180x180"
    icon = _public_file(touch[0]["href"])
    assert icon.is_file()
    width, height, color_type = _read_ihdr(icon)
    assert (width, height) == (180, 180)
    assert color_type not in ALPHA_COLOR_TYPES


def test_index_html_links_existing_favicons() -> None:
    favicons = [link for link in _index_links() if link.get("rel") == "icon"]
    assert favicons
    for link in favicons:
        assert _public_file(link["href"]).is_file()


def test_manifest_is_linked_and_exists() -> None:
    manifest_links = [link for link in _index_links() if link.get("rel") == "manifest"]
    assert len(manifest_links) == 1
    assert _public_file(manifest_links[0]["href"]).is_file()


def _manifest_icons() -> list[dict[str, str]]:
    manifest = json.loads((PUBLIC / "manifest.webmanifest").read_text(encoding="utf-8"))
    return manifest["icons"]


@pytest.mark.parametrize("purpose", ["any", "maskable"])
def test_manifest_declares_each_purpose(purpose: str) -> None:
    assert any(icon["purpose"] == purpose for icon in _manifest_icons())


def test_manifest_icons_exist_with_declared_size_and_are_opaque() -> None:
    icons = _manifest_icons()
    assert {"192x192", "512x512"} <= {icon["sizes"] for icon in icons}
    for icon in icons:
        path = _public_file(icon["src"])
        assert path.is_file()
        width, height, color_type = _read_ihdr(path)
        assert f"{width}x{height}" == icon["sizes"]
        assert color_type not in ALPHA_COLOR_TYPES


def test_svg_sources_are_committed() -> None:
    for name in ("icon.svg", "icon-maskable.svg", "favicon.svg"):
        assert (PUBLIC / "icons" / name).is_file()
