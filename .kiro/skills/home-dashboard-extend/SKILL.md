---
name: home-dashboard-extend
description: How to extend the Home Dashboard (FastAPI backend, React frontend, runs on a Raspberry Pi Zero 2 W). USE FOR adding or changing a section, renderer, API endpoint, WebSocket frame, config option, sample data or deploy files. DO NOT USE FOR general questions or unrelated repositories.
---

# Extending the Home Dashboard

## Architecture map

| Path | Responsibility |
| --- | --- |
| `app/main.py` | app factory, lifespan (migration, retention), static frontend mount |
| `app/config.py` | `Settings` from environment and `.env`, `get_settings()` |
| `app/auth.py`, `app/api/deps.py` | token checks; `IngestAuth`, `ReadAuth`, `ServiceDep`, `HubDep` |
| `app/middleware.py` | body size limit, access log |
| `app/api/router.py`, `app/api/routes/*.py` | HTTP and WebSocket routes |
| `app/schemas/update.py`, `app/schemas/sections.py` | envelope model, per-section rules and enums |
| `app/repositories/updates.py` | SQLite access |
| `app/services/updates.py`, `hub.py`, `weather.py` | update logic, `ConnectionHub`, Open-Meteo |
| `frontend/src/sections.ts` | section order, titles, default display, simple view rules |
| `frontend/src/renderers/` | one component per section, `index.tsx` maps section to component |
| `frontend/src/hooks/useDashboard.ts` | WebSocket, polling, reload logic |
| `frontend/src/types.ts` | API types, `RendererProps`, `SocketMessage` |
| `samples/`, `samples/pool/` | demo data for tests and `just sample` |
| `tests/` | pytest, fixtures in `conftest.py`, helpers in `helpers.py` |

## Add a section

1. No migration is needed. Unknown sections are accepted and shown with the generic tile.
2. For typed fields, add enums or field lists in `app/schemas/sections.py` (`TIMESTAMP_FIELDS`, `STRING_FIELDS`, enum sets).
3. For a dedicated view, add `frontend/src/renderers/<Name>Renderer.tsx` that takes `RendererProps`, and register it in `SPECIAL` in `renderers/index.tsx`.
4. Set the title and icon in `SECTION_META`, the position in `SECTION_ORDER`, defaults in `DEFAULT_SECTION_DISPLAY`, and simple view rules in `sections.ts`.
5. Render links with `MaybeLink` from `renderers/fields.tsx`. It allows only http and https.
6. Add `samples/<section>.json`, `samples/pool/<section>.json`, and the name in `EXPECTED` in `tests/test_samples.py`.
7. Add pytest tests for validation and vitest tests for new pure logic.

## Add an endpoint

- Create a module in `app/api/routes/` and include it in `app/api/router.py`.
- Protect writes with `IngestAuth` and reads with `ReadAuth`. Get services with `ServiceDep` and the hub with `HubDep`.
- Put request and response models in `app/schemas/`.
- Use a sync `def` for blocking work.
- Test with the `client` and `read_client` fixtures. Update the API table in the README.

## Add a config option

- Add a field to `Settings` in `app/config.py`. An optional value that may be empty needs a `mode="before"` validator that returns `None`.
- Add it to `.env.example` and the README configuration table.
- In tests, set the variable with `monkeypatch.setenv` and call `get_settings.cache_clear()`, as `tests/conftest.py` does.

## Change WebSocket frames

- Broadcast through `ConnectionHub`.
- Add the frame to `SocketMessage` in `frontend/src/types.ts` and handle it in `useDashboard.ts`.
- Test with `client.websocket_connect("/ws")`.

## Raspberry Pi constraints

- 426 MB RAM, 32-bit armv7. Avoid full-table scans, heavy dependencies and extra workers.
- New runtime dependencies go into `pyproject.toml` and `requirements.txt`. Run `just check-pi-deps`. The image also has to install on `linux/arm/v7` (the CI Docker job).
- Log events at INFO and health polls at DEBUG. Compose rotates the container logs.
- The Docker image is built in GitHub Actions and pulled on the Pi. Do not add a deploy step that compiles the frontend on the Pi.

## Check workflow

- `just fix` applies ruff fixes. `just check-backend` runs ruff, mypy, bandit and pytest. `just check-frontend` runs `tsc -b`, vitest and the vite build. `just check` runs both.
- Tool settings live in `pyproject.toml` (`[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`).
- Add `noqa`, `type: ignore` or `nosec` only with a reason on the same line.
