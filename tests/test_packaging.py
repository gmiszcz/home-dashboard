"""Guards for the Pi image: Docker installs requirements.txt, dev and CI use pyproject.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def normalise(spec: str) -> str:
    return "".join(spec.split())


def pinned_requirements(filename: str) -> set[str]:
    """Return the normalised requirement specs of a pip file, without comments or -r includes."""
    lines = (ROOT / filename).read_text(encoding="utf-8").splitlines()
    specs = (line.strip() for line in lines)
    return {normalise(spec) for spec in specs if spec and not spec.startswith(("#", "-r"))}


def test_requirements_match_pyproject_dependencies() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    declared = {normalise(item) for item in pyproject["project"]["dependencies"]}
    assert declared == pinned_requirements("requirements.txt")


def test_requirements_dev_match_pyproject_dev_extra() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    declared = {normalise(item) for item in pyproject["project"]["optional-dependencies"]["dev"]}
    assert declared == pinned_requirements("requirements-dev.txt")
