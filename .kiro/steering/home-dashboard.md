---
inclusion: always
---

# Home Dashboard project rules

Home Dashboard is a FastAPI and React screen for an iPad. Ryuk posts section summaries, the server stores them in SQLite and pushes them over WebSocket.

## Production facts

- Runs in Docker on a Raspberry Pi Zero 2 W (512 MB RAM, 64-bit OS). The Pi builds the image itself.
- `scripts/auto-update.sh` deploys each new commit on `origin/main` within 10 minutes, so `main` must stay green.
- Access is over Tailscale only.

## Hard constraints

- Runtime dependencies live in both `pyproject.toml` and `requirements.txt`. `tests/test_packaging.py` keeps them identical. New dependencies need aarch64 wheels for Python 3.12 (`just check-pi-deps`).
- The Pi runs `npm ci` for the frontend build. Keep frontend dev dependencies small.
- Never load whole tables into memory. SQLite computes latest, history and retention.
- Keep one `updates` table. New fields go into items or `extra`.
- Keep the `websockets` dependency. Uvicorn needs it for `/ws`.
- Do not change the container user or the `/data` volume path.

## Language

- UI strings are Polish. Code, comments, tests and documentation are English.

## Workflow

- Every behaviour change gets a pytest test in `tests/` or a vitest test in `frontend/src/**/*.test.ts`.
- Finish with `just check` from the repository root. The Stop hook in `.kiro/hooks/` enforces this.
- Use `just fix` for ruff findings.

## When to use the skill

- Use the `home-dashboard-extend` skill when adding or changing a section, renderer, endpoint, WebSocket frame, config option, sample data, or Docker and deploy files.
- Questions and small fixes do not need the skill.
