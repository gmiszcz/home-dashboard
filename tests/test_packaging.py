"""Guards for the Pi image: Docker installs requirements.txt, dev and CI use pyproject.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def normalise(spec: str) -> str:
    return "".join(spec.split())


def test_requirements_match_pyproject_dependencies() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    declared = {normalise(item) for item in pyproject["project"]["dependencies"]}
    lines = (ROOT / "requirements.txt").read_text(encoding="utf-8").splitlines()
    pinned = {
        normalise(line) for line in lines if line.strip() and not line.lstrip().startswith("#")
    }
    assert declared == pinned
