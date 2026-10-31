"""Checks for scripts/auto-update.sh that do not need Docker or GHCR.

On Windows the tests need WSL or Git Bash. Paths are translated for bash.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "auto-update.sh"


def _bash(code: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    if os.name == "nt":
        # bash.exe (WSL) re-parses its command line through an outer shell that expands
        # $variables and $(...) early. Feeding the code on stdin avoids that.
        return subprocess.run(
            ["bash"], input=code, cwd=cwd or ROOT, check=False, capture_output=True, text=True
        )
    return subprocess.run(
        ["bash", "-c", code], cwd=cwd or ROOT, check=False, capture_output=True, text=True
    )


def _bash_path(path: Path) -> str:
    """Return ``path`` in the form the available ``bash`` understands."""
    if os.name != "nt":
        return str(path)
    quoted = shlex.quote(path.as_posix())
    proc = _bash(f"command -v wslpath >/dev/null && wslpath -u {quoted} || cygpath -u {quoted}")
    if proc.returncode != 0:
        raise RuntimeError(f"cannot translate path for bash: {path}")
    return proc.stdout.strip()


@pytest.fixture(scope="session")
def bash_script() -> str:
    """Return the script path as bash sees it, or skip when bash cannot read it."""
    try:
        script = _bash_path(SCRIPT)
        proc = _bash(f"test -f {shlex.quote(script)}")
    except (OSError, RuntimeError) as exc:
        pytest.skip(f"bash not available on this host: {exc}")
    if proc.returncode != 0:
        pytest.skip("bash cannot read scripts/auto-update.sh on this host")
    return script


@pytest.fixture(autouse=True)
def _require_bash(bash_script: str) -> None:
    """Skip every test in this module when bash is unusable."""


def _source(script: str, call: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return _bash(f'source "{script}" || exit 97; {call}', cwd=cwd)


def test_script_is_tracked_executable() -> None:
    line = subprocess.check_output(
        ["git", "ls-files", "-s", "scripts/auto-update.sh"],
        cwd=ROOT,
        text=True,
    )
    assert line.startswith("100755 ")


def test_manifest_accepts_linux_arm_v7(tmp_path: Path, bash_script: str) -> None:
    manifest = tmp_path / "index.json"
    manifest.write_text(
        json.dumps(
            {
                "manifests": [
                    {"platform": {"os": "linux", "architecture": "amd64"}},
                    {"platform": {"os": "linux", "architecture": "arm64"}},
                    {"platform": {"os": "linux", "architecture": "arm", "variant": "v7"}},
                ]
            }
        ),
        encoding="utf-8",
    )
    result = _source(bash_script, f'manifest_file_has_armv7 "{_bash_path(manifest)}"')
    assert result.returncode == 0, result.stderr


def test_manifest_rejects_index_without_arm_v7(tmp_path: Path, bash_script: str) -> None:
    manifest = tmp_path / "index.json"
    manifest.write_text(
        json.dumps(
            {
                "manifests": [
                    {"platform": {"os": "linux", "architecture": "amd64"}},
                    {"platform": {"os": "linux", "architecture": "arm64", "variant": "v8"}},
                ]
            }
        ),
        encoding="utf-8",
    )
    result = _source(bash_script, f'manifest_file_has_armv7 "{_bash_path(manifest)}"')
    assert result.returncode == 1


def test_dotenv_get_reads_flag_without_sourcing_env(tmp_path: Path, bash_script: str) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "DASHBOARD_TOKEN=not-used\nAUTO_UPDATE_BUILD_LOCALLY=1\n"
        'NODE_OPTIONS="--max-old-space-size=256"\n',
        encoding="utf-8",
    )
    env_path = _bash_path(env_file)
    result = _source(
        bash_script,
        f'printf "%s\\n" "$(dotenv_get AUTO_UPDATE_BUILD_LOCALLY "{env_path}")" '
        f'"$(dotenv_get NODE_OPTIONS "{env_path}")"',
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.splitlines() == ["1", "--max-old-space-size=256"]


@pytest.mark.skipif(
    os.name == "nt",
    reason="needs POSIX file modes, NTFS chmod does not set exec bits",
)
def test_mode_only_guard_restores_mode_and_keeps_content_edits(
    tmp_path: Path, bash_script: str
) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    env = {**os.environ, "GIT_AUTHOR_NAME": "Test", "GIT_AUTHOR_EMAIL": "test@example.com"}
    env["GIT_COMMITTER_NAME"] = "Test"
    env["GIT_COMMITTER_EMAIL"] = "test@example.com"

    def git(*args: str) -> None:
        subprocess.run(
            ["git", *args], cwd=repo, check=True, capture_output=True, text=True, env=env
        )

    git("init", "-b", "main")
    git("config", "core.fileMode", "true")
    script = repo / "scripts" / "auto-update.sh"
    script.parent.mkdir()
    script.write_text("echo old\n", encoding="utf-8")
    untouched = repo / "note.txt"
    untouched.write_text("leave me\n", encoding="utf-8")
    git("add", "scripts/auto-update.sh", "note.txt")
    git("commit", "-m", "base")
    base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

    script.write_text("echo new\n", encoding="utf-8")
    git("add", "scripts/auto-update.sh")
    git("commit", "-m", "update script")
    remote = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

    git("reset", "--hard", base)
    script.chmod(0o755)
    untouched.chmod(0o755)
    edited = repo / "note.txt"
    edited.write_text("leave me\nlocal edit\n", encoding="utf-8")

    result = _source(bash_script, f'discard_mode_only_changes "{remote}"', cwd=repo)
    assert result.returncode == 0, result.stderr
    assert "Discarding file-mode-only local change: scripts/auto-update.sh" in result.stdout
    assert oct(script.stat().st_mode & 0o777) == "0o644"
    assert edited.read_text(encoding="utf-8") == "leave me\nlocal edit\n"
    assert oct(untouched.stat().st_mode & 0o777) == "0o755"
