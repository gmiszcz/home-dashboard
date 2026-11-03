---
inclusion: always
---

# Home Dashboard project rules

Home Dashboard is a FastAPI and React screen for an iPad. Ryuk posts section summaries, the server stores them in SQLite and pushes them over WebSocket.

## Production facts

- Runs in Docker on a Raspberry Pi Zero 2 W (426 MB RAM, 32-bit Raspberry Pi OS, armv7). The Pi pulls `ghcr.io/gmiszcz/home-dashboard` and does not build it.
- `scripts/auto-update.sh` deploys each new commit on `origin/main` once CI has published that commit's image, so `main` must stay green.
- Access is over Tailscale only.

## Hard constraints

- Runtime dependencies live in both `pyproject.toml` and `requirements.txt`. `tests/test_packaging.py` keeps them identical. New dependencies need wheels for Python 3.12 on linux/arm/v7 (the CI image build) and aarch64 (`just check-pi-deps`).
- The Pi does not run `npm ci` or Vite. GitHub Actions builds the image. Keep frontend dev dependencies small anyway.
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

## Delivery workflow for new ideas

- Each new idea is its own workflow. Do not wait for earlier work to finish before starting the next one; run them in parallel.
- Each workflow works in its own git worktree on its own branch, with its own commits. Merge each branch separately when ready.
- Open a single pull request only once the whole batch of related work is done, not one PR per idea.

## Work without supervision

The user wants hands-off work. Every question and every approval prompt costs them time.

- Do not ask for decisions that have a sensible default. Pick it, do it, and state the assumption in one line. Ask only before deleting user data or when the visible behaviour is truly unclear.
- Do not offer menus of options (A/B/C). Choose the best one and do it.
- Answer in Polish, briefly. No recaps of earlier messages.
- Use the file tools for reading and editing files. Keep shell commands simple: one plain command or a short `;` chain, no `python -c` one-liners and no WMI or process queries. Complex commands trigger approval prompts.
- Workflow briefs must say: do not pause to ask questions, decide and record the assumption. When a review loop runs out of iterations, the orchestrator fixes the remaining findings directly instead of asking the user.
- A finished task ends with these steps, done automatically: PR with squash auto-merge, wait for CI, then clean up. Cleanup means removing the worktree, deleting the local and remote branch, deleting `.agents/tasks/<task>/`, and fast-forwarding local `main` and `dev` to `origin/main` and pushing `dev`. Nothing may stay staged or untracked.

## Model assignment for workflow steps

- Planning steps: Opus 5.5.
- Coding steps: Sonnet 5.5.
- Everything else (review, housekeeping, ship): Haiku.
