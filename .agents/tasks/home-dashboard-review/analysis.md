# Home Dashboard: deep analysis and implementation plan

Branch `dev` at `8a0ff63`. Production is a Raspberry Pi Zero 2 W (512 MB RAM, 64-bit OS). The Pi builds the image with `docker compose up -d --build`, triggered by `scripts/auto-update.sh` every 10 minutes when `origin/main` moves. Remote access goes over Tailscale. The app works reliably today. Every item below is chosen so that the Pi keeps working.

**README language: English.** The README states "The dashboard UI is in Polish. Code, comments and documentation are in English." README edits stay in English and UI strings stay in Polish. The final user report is Polish (separate step).

Baseline measured on the dev machine (Windows, Node 24.21, just 1.46, uv 0.8.20, WSL bash available):

| Check | Result today |
| --- | --- |
| `just check` (ruff check app tests + pytest) | passes, 19 tests, 1 Starlette deprecation warning about httpx |
| `uv run ruff check app tests scripts` | passes |
| `uv run ruff format --check app tests scripts` | **4 files would be reformatted**: `app/schemas/sections.py`, `app/services/weather.py`, `scripts/send_sample.py`, `tests/test_updates.py` |
| mypy 2.4.1 on `app scripts tests` (check_untyped_defs, pydantic plugin) | **2 errors**: `scripts/send_sample.py:82` return-value, `app/services/weather.py:91` var-annotated. Without the pydantic plugin a 3rd error appears at `app/config.py:78` (`Settings()` missing `dashboard_token`). The plugin fixes it (verified) |
| bandit 1.9.4 `-r app scripts` | **6 findings**: B104 `app/config.py:31`, B101 `app/repositories/updates.py:112`, B310 `app/services/weather.py:63`, B112 `app/services/weather.py:96`, B311 `scripts/send_sample.py:208`, B310 `scripts/send_sample.py:228` |
| `npx tsc -b` in frontend | **30 errors**: every renderer imports a missing `RendererProps` from `src/types.ts` (+ implicit-any follow-ups), `vite.config.ts` lacks Node types |
| `npm --prefix frontend run build` | passes (vite build only, no type check) |
| `uv pip compile requirements.txt --python-version 3.12 --python-platform aarch64-unknown-linux-gnu --only-binary :all:` | resolves, every runtime dep has an aarch64 wheel |
| SQLite | 3.43 locally, 3.40 in bookworm. `julianday('…+01:00')` applies the offset and window functions work (verified) |
| `bash -n scripts/auto-update.sh` (WSL) | fails only because the Windows worktree has CRLF (`git ls-files --eol`: `i/lf w/crlf`). The Pi checkout is LF |

There is **no `.kiro/` folder** in the repository.

---

## (a) Inventory of functionality and options

### Environment / config options (`app/config.py`, `.env.example`)

| Variable | Default | Validation | Notes |
| --- | --- | --- | --- |
| `DASHBOARD_TOKEN` | required | min 8 chars | ingest token, Bearer |
| `DB_PATH` | `data/dashboard.sqlite` | relative = from repo root | compose forces `/data/dashboard.sqlite` (volume `dashboard-data`) |
| `HOST` | `0.0.0.0` | | compose forces `0.0.0.0`, port published on all host interfaces |
| `PORT` | `8000` | 1–65535 | also used by compose port mapping and the Docker healthcheck |
| `READ_TOKEN` | empty = open reads | empty string → None | guards `/api/latest`, `/api/section/*`, `/ws` |
| `RETENTION_DAYS` | empty = keep everything | ≥1 | newest row per section always kept, runs at startup and after each insert |
| `MAX_BODY_BYTES` | `262144` | 1024–5 000 000 | POST/PUT/PATCH, 413 |
| `STALE_AFTER_MINUTES` | `360` | 1–43 200 | delivered to the UI via `/api/health` |
| `LOG_LEVEL` | `INFO` | DEBUG/INFO/WARNING/ERROR/CRITICAL | |
| `STATIC_DIR` | `frontend/dist` | | **not documented** in README or `.env.example` |
| `DASHBOARD_URL` | `http://127.0.0.1:8000` | | `scripts/send_sample.py` only |

Hard-coded constants: Open-Meteo for Gliwice (50.2976, 18.6766), cache TTL 900 s, HTTP timeout 8 s. WebSocket heartbeat 25 s. Frontend: polling `/api/latest` every 20 s while the socket is down, `/api/health` every 30 s, weather every 10 min, WS reconnect backoff 1 s → 30 s, clock tick 1 s, nightly reload 04:00–04:10.

`localStorage` keys: `dashboard.readToken`, `dashboard_view_mode`, `dashboard_custom_order`, `dashboard_custom_widths`, `dashboard_seen_content`.

### Endpoints (`app/api/routes/*`)

| Route | Auth | Behaviour |
| --- | --- | --- |
| `POST /api/update` | ingest | validate envelope, idempotent insert on (section, generated_at), broadcast only when new |
| `POST /api/updates` | ingest | batch 1–50, all validated first, broadcast new rows in order |
| `GET /api/latest` | read | newest row of every section, sorted by section name |
| `GET /api/section/{name}?limit=1..200` | read | history newest first |
| `GET /api/weather` | none | Open-Meteo, cached, **fabricated placeholder forecast when the fetch fails and nothing is cached** |
| `GET /api/health` | none | status, db, row count, `stale_after_minutes`, `server_id`, version |
| `WS /ws` | read (`?token=` or Bearer) | snapshot, then `update` frames, `ping` after 25 s of client silence, 1008 on bad token |
| `GET /` + static | none | built SPA, `index.html` no-cache, `.webmanifest` content type |
| `/docs`, `/openapi.json` | none | FastAPI defaults, enabled |

### Data, validation, storage

- Envelope `schema_version` 1 or 2, `section` ≤80 chars without slashes/control chars, Warsaw-offset timestamps only, unknown fields kept (`extra="allow"`), ≤100 items, per-section enum/number/timestamp rules in `app/schemas/sections.py`.
- SQLite WAL, `synchronous=NORMAL`, one connection + `threading.Lock`, unique index on (section, generated_at).
- `latest()` and `history()` load **every row including the JSON payload** and sort in Python by parsed instant. `prune()` scans all rows after every insert.

### Sections and renderers (`frontend/src/sections.ts`, `frontend/src/renderers/index.tsx`)

| Section | Renderer | Default display | Simple view rule |
| --- | --- | --- | --- |
| `calendar` (wide) | CalendarRenderer (Dziś/Jutro/Później) | 3 rows, sort time | items starting today, max 2 |
| `parcels` | ParcelsRenderer (ready_for_pickup first) | 3, priority | parcels not picked_up/returned, max 3 |
| `ai_daily` | AiRenderer | 1 | when it has items, 1 |
| `ai_weekly` | AiRenderer | collapsed | only via `simple` flags |
| `email_digest` | EmailDigestRenderer | 1 | flags |
| `prices`, `promotions` | PricesRenderer, PromotionsRenderer | 3 | flags |
| `subscriptions`, `expenses_weekly`, `finance` | MoneyRenderer | collapsed | flags |
| `github_weekly` | GithubRenderer | collapsed | flags |
| `inbox_cleanup` | InboxRenderer | collapsed | flags |
| anything else | GenericRenderer (title/status/date, max 6) | 3 | flags |

UI features: header (Polish date, Warsaw clock with seconds, 5-slot weather timeline, connection LED, view toggle), simple/full view, drag and drop (mouse + touch handle), full-width toggle, "nowe" + "Ogarnięte" acknowledge flow with content fingerprints, stale badge, collapse/expand, "Pokaż jeszcze", FLIP reorder animation, enter/update animations, `prefers-reduced-motion` support, layout reset.

### Realtime, refresh, PWA, wake lock

- WS first, polling fallback, health-based reload on `server_id` change (each deploy), nightly reload around 04:00.
- PWA: `manifest.webmanifest` (standalone, dark theme, one 180 px icon), apple meta tags, no service worker (correct for an always-online wall screen, no stale-build risk).
- `useWakeLock` requests a screen wake lock and re-requests on `visibilitychange`.

### Deploy, ops, CI

- `Dockerfile`: node:22 build stage (`npm ci`, `vite build`), python:3.12-slim-bookworm runtime, `pip install -r requirements.txt` (lower bounds only), root user, `VOLUME /data`, healthcheck spawns Python every 30 s.
- `docker-compose.yml`: build, port `${PORT}:${PORT}`, `env_file .env`, volume, `restart: unless-stopped`, **no log rotation**.
- `scripts/auto-update.sh` + `deploy/home-dashboard-autoupdate.{service,timer}`: every 10 min compare `HEAD` with `origin/main`, `git pull`, `docker compose up -d --build`, `docker image prune -f`.
- `deploy/home-dashboard.service`: venv alternative.
- CI `.github/workflows/ci.yml`: ruff check + pytest, `npm run build` (step named "TypeScript & Vite Build" but no type check), amd64 Docker build.
- Tooling: `justfile` (install, dev, lint, test, build, check = lint + test, run, sample, sample-static), `Makefile` (subset), `requirements-dev.txt` (unused, lists mypy which the `dev` extra lacks), `uv.lock`.

---

## (b) Findings per area

| Area | Verdict | Finding |
| --- | --- | --- |
| Auth | OK | Constant-time digest compare, same 401 for wrong/empty, read token optional, token hidden from logs and the address bar. `authorize_websocket` in `app/auth.py` is dead code (ws.py has its own copy). |
| Validation | OK | Strict Warsaw offsets, enums, size limits, unknown fields preserved. Well tested. |
| Body limit / access log | OK, small improve | Correct streaming limit. Access log writes one INFO line per `/api/health` call (iPad every 30 s + Docker healthcheck every 30 s ≈ 5 800 lines/day) into an unrotated Docker log on the SD card. |
| Storage memory | **improve (P1)** | `latest()` runs `SELECT * FROM updates` on every WS connect, every 20 s poll and every reload, so RAM use grows with total history (payloads up to 256 KB each, retention off by default). On 512 MB this is the main long-term OOM risk. `history()` loads a whole section, `prune()` scans the whole table after every insert. |
| Realtime | OK | Snapshot + broadcast, heartbeat, dead-socket cleanup, reconnect with backoff, polling fallback. |
| Nightly reload | **bug (P1)** | `useDashboard.ts` keeps `lastDailyReload` in a ref. After the 04:00 reload the ref is empty again and the first health check (on mount) reloads again. The page reloads in a loop from 04:00 to 04:10 every night, each time hitting `/api/health`, `/api/latest` (full table scan), `/api/weather` and a new WS on the Pi. |
| Weather | **improve (P2)** | On a fetch failure with an empty cache (e.g. right after each deploy restart, or boot before network) the API returns an invented forecast (12 °C, partly cloudy) that looks real on the wall. Tests call the real Open-Meteo API (network-dependent, global cache shared between tests). Slot-picking logic is convoluted but its output is fine. |
| Links from data | **improve (P2)** | `MaybeLink` renders any `url` string as `href`. Ryuk summarises e-mails (untrusted content), so a `javascript:` URL could reach the page. React 18 only warns. |
| Types / build | **improve (P1)** | `tsc -b` has 30 errors: missing `RendererProps` type and missing Node types. CI never type-checks. |
| Tooling | **improve (P1)** | No mypy, bandit, ruff format check or frontend tests in `just check` or CI. `requirements-dev.txt` out of sync with the `dev` extra. |
| Frontend tests | improve (P1, with tooling) | None exist. Pure logic (`format.ts`, `sections.ts`, the reload decision, link sanitising) is easy to test with vitest in the node environment (no jsdom). |
| Dependency drift | improve (P2) | Runtime deps are listed twice (pyproject for dev/tests, requirements.txt for Docker). Nothing checks they match, or that uvicorn has WebSocket support (TestClient hides a missing `websockets`). |
| Auto-update | **improve (P2)** | If `docker compose up -d --build` fails after `git pull` (OOM in `npm ci`, network glitch), the next run sees `HEAD == origin/main` and never retries. The Pi silently stays on the old image until the next commit. `git pull` without `--ff-only`. No `.gitattributes`, so a script copied from a Windows checkout has CRLF and fails in bash. |
| Docker logs | **improve (P2)** | Default json-file driver without `max-size` grows forever on the SD card. |
| Docker image | OK (see g) | Slim base, multi-stage, healthcheck. Root user and unpinned deps are deliberate non-changes. |
| CI | improve (P2) | Should run the same `just check-backend` / `just check-frontend` as local. amd64 Docker build is enough (see g). |
| Re-render cost | improve (P3) | `now` ticks every second in `App`, so the whole grid re-renders and the FLIP `useLayoutEffect` measures every card (forced layout) every second, 24/7 on the iPad. Only the header needs seconds. |
| Polish copy | improve (P3) | Collapsed teaser says "(2 pozycji)". Correct Polish is "2 pozycje", "5 pozycji". `format.ts` already has a correct private `plural()`. |
| Touch / a11y | improve (P3) | Width toggle and drag handle are 1.55 rem ≈ 22 px, half the 44 pt iPad touch-target guideline. The icon-only width button has `title` but no `aria-label`. |
| Visual design | OK | Dark theme with good contrast (muted text ≈ 7.9:1 on cards), clear hierarchy, simple view with larger type, stale/new states, reduced-motion support, safe-area insets, `100dvh`. |
| PWA / wake lock | OK | Correct for iPad + Guided Access. No service worker on purpose. |
| Security overall | OK | Tailnet-only design, secrets in env, no secrets in logs. |
| Docs | improve | README is thorough. Missing: `STATIC_DIR`, defaults column, new check tooling, Pi operations (retention advice, logs, auto-update status/retry), Tailscale admin access, `.kiro`. |

---

## (c) Prioritised implementation plan

Items 1–10 belong to the **`implement`** step. Items 11–12 belong to the **`kiro-docs`** step. Order is by dependency. Every item leaves the repo buildable. Do not commit or push.

Commands used for verification (all from the repo root, PowerShell):
`just check`, `just check-backend`, `just check-frontend`, `uv run python -m pytest`, `npm --prefix frontend run typecheck`, `npm --prefix frontend run test`, `npm --prefix frontend run build`.

- [ ] 1. **Tooling: add mypy, bandit, vitest, Node types and the new `just` recipes (P1).**
      Pin dev tools in `pyproject.toml` `[project.optional-dependencies].dev`: keep `pytest>=8.3.0`, `httpx>=0.27.0`, change ruff to `ruff==0.17.3` (the installed version, so format output stays stable), add `mypy==2.4.1` and `bandit==1.9.4`. Add `[tool.mypy]` (see Digest). Mirror the same pins in `requirements-dev.txt` (it stays for pip users). Run `uv lock` and `uv sync --extra dev` (updates `uv.lock`).
      Frontend: `npm --prefix frontend install --save-dev vitest@^2.1.9 @types/node@^22.20.5` (vitest 2.x supports the installed vite 5.4.21, @types/node 22 matches the node:22 Docker/CI image). Add scripts `"typecheck": "tsc -b"` and `"test": "vitest run"` to `frontend/package.json`. Add `"types": ["node"]` to `frontend/tsconfig.node.json`. Export `RendererProps` from `frontend/src/types.ts`. No vitest config is needed (defaults: node environment, `**/*.test.ts`).
      Replace the check recipes in `justfile` as designed in section (d).
      Files: `pyproject.toml`, `requirements-dev.txt`, `uv.lock`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tsconfig.node.json`, `frontend/src/types.ts`, `justfile`.
      Rationale: the user asked for `just check` with linter, mypy, ruff, bandit and tests. The Pi only gets vitest/@types/node through `npm ci` in the build stage (a few MB, rebuilt only when the lockfile changes). Python dev tools never reach the image.
      If more type errors surface once `RendererProps` resolves (the implicit-any errors should disappear with it), fix them in this item.
      Verify: `npm --prefix frontend run typecheck` exits 0. `npm --prefix frontend run build` passes. `uv run python -m pytest` passes. `uv run mypy` reports only the 2 known errors (fixed in item 2).

- [ ] 2. **Make `just check` green on the existing code and add the first frontend tests (P1).**
      Run `just fix` (formats the 4 files). Fix mypy: annotate `upcoming_items: list[dict[str, Any]] = []` in `app/services/weather.py`, make `freshen()` in `scripts/send_sample.py` return `cast(dict, shift_value(payload, now - parsed))`. Fix bandit: `host: str = "0.0.0.0"  # nosec B104 - container default, README tells production to bind the Tailscale address`, replace `assert row is not None` in `UpdateRepository.save` with `if row is None: raise RuntimeError("inserted row not found")`, add `# nosec B310 - fixed https URL` to the weather `urlopen`, narrow the weather `except Exception: continue` to `except (TypeError, ValueError): continue`, add `# nosec B311 - sample data, not security` to `random.Random(seed)` and `# nosec B310 - developer-supplied --url` to the sample `urlopen`. Delete the unused `authorize_websocket` from `app/auth.py` (and its now-unused `WebSocket` import).
      Add `frontend/src/format.test.ts` (formatRelative: "przed chwilą", "1 minutę temu", "2 minuty temu", "5 minut temu", "za 2 godziny", "1 dzień temu"; `addDaysKey` across a month end) and `frontend/src/sections.test.ts` (`contentFingerprint` ignores `generated_at`, `isSimpleSection` true for a calendar item starting today and false for tomorrow, `sortItems` puts pinned then high priority first).
      Files: `app/services/weather.py`, `app/schemas/sections.py` (format only), `app/config.py`, `app/repositories/updates.py`, `app/auth.py`, `scripts/send_sample.py`, `tests/test_updates.py` (format only), `frontend/src/format.test.ts`, `frontend/src/sections.test.ts`.
      Verify: `just check` exits 0.

- [ ] 3. **Storage: compute latest/history/prune in SQL instead of loading every payload (P1, RAM on the Pi).**
      In `app/repositories/updates.py` add a module constant `LATEST_IDS_SQL` (window function, `ORDER BY julianday(generated_at) DESC, id DESC`) and rewrite `latest()`, `history()` and `prune()` as in the Digest. `julianday()` applies the stored `+01:00`/`+02:00` offset, so ordering stays by instant across DST, exactly like today's Python `_sort_key`. Delete `_sort_key` and the imports that become unused (`datetime`, `WARSAW`, `parse_instant`). Public behaviour and response shapes do not change.
      Tests: add `test_latest_and_history_order_by_instant_across_dst` to `tests/test_updates.py`: post `calendar` at `2026-10-25T02:15:00+01:00` (later instant, inserted first, summary "po zmianie czasu") then `2026-10-25T02:30:00+02:00` (earlier instant, larger string, higher id, summary "przed zmianą czasu"). Assert `/api/latest` returns "po zmianie czasu" and `/api/section/calendar` returns ["po zmianie czasu", "przed zmianą czasu"]. Add `test_retention_keeps_newest_row_per_section` to the same file using `retention_client`: two sections, each with one old (30 days) and one fresh row, plus a third section with only an old row. Assert the old rows of the first two are gone and the lone old row stays. Existing `test_append_latest_and_history` and `test_retention_keeps_newest_row` must keep passing.
      Files: `app/repositories/updates.py`, `tests/test_updates.py`.
      Verify: `just check-backend` exits 0.

- [ ] 4. **Fix the nightly reload loop (P1).**
      In `frontend/src/hooks/useDashboard.ts` export a pure `shouldNightlyReload(loadedAt: Date, now: Date): boolean` that returns true when the page was loaded before the most recent local 04:00 (see Digest). Add module-level `const PAGE_LOADED_AT = new Date();`, remove the `lastDailyReload` ref and the 04:00–04:10 window check, and call `if (shouldNightlyReload(PAGE_LOADED_AT, new Date())) window.location.reload()` inside `checkServerHealth`. After a reload `PAGE_LOADED_AT` is after 04:00, so the loop cannot happen. An iPad that was asleep at 04:00 reloads at the first health check afterwards.
      Tests: `frontend/src/hooks/useDashboard.test.ts`: loaded yesterday 15:00, now 04:00:30 → true. Loaded 04:00:31, now 04:05 → false. Loaded yesterday 05:00, now 03:59 → false. Loaded 03:59, now 04:00 → true. Loaded two days ago, now 12:00 → true. Build dates with the local-time constructor `new Date(2026, 9, 30, 4, 0, 30)`.
      Files: `frontend/src/hooks/useDashboard.ts`, `frontend/src/hooks/useDashboard.test.ts`.
      Verify: `just check-frontend` exits 0.

- [ ] 5. **Weather: no invented forecast, deterministic tests (P2).**
      In `app/services/weather.py` add `class WeatherUnavailableError(RuntimeError)`. In `get_weather()` keep "return the last cached forecast when the fetch fails", but when nothing is cached raise `WeatherUnavailableError("weather unavailable")` from the original exception instead of returning the hard-coded placeholder (delete the placeholder dict). In `app/api/routes/weather.py` catch it and raise `HTTPException(status_code=503, detail="Weather unavailable")`. Frontend: `useWeather()` returns `{ weather, unavailable }` where `unavailable` is true after a failed load while `weather` is still null. `Header` passes it to `WeatherTimeline`, which shows "Prognoza pogody chwilowo niedostępna" instead of "Pobieranie prognozy pogody dla Gliwic…" in that case. A previously loaded forecast stays on screen during later failures (unchanged).
      Tests: rewrite `tests/test_weather.py` with an autouse fixture that resets `weather._cache` to `{}` and `weather._cache_time` to `0` via `monkeypatch.setattr`, and monkeypatches `weather.fetch_weather_from_open_meteo`. Cases: canned Open-Meteo payload (current block + 48 hourly entries starting at the current Warsaw hour, built in the test) → 200, `city == "Gliwice"`, `current.condition == "Pochmurno"` for code 3, 1–5 hourly slots each with `time/temp/code/icon/pop`. Fetch raises `OSError` with empty cache → 503. Successful fetch, then cache expiry (`_cache_time = 0`) and a failing fetch → 200 with the cached data. Second call within TTL does not call the fetcher again (counter).
      Files: `app/services/weather.py`, `app/api/routes/weather.py`, `tests/test_weather.py`, `frontend/src/hooks/useWeather.ts`, `frontend/src/components/Header.tsx`, `frontend/src/components/WeatherTimeline.tsx`.
      Verify: `just check` exits 0. Tests no longer touch the network.

- [ ] 6. **Only http(s) links from data (P2).**
      In `frontend/src/renderers/fields.tsx` add exported `safeHref(href: string | null): string | null` that returns the href only when `new URL(href).protocol` is `http:` or `https:` (null on parse error or any other scheme), and use it in `MaybeLink` (`const safe = safeHref(href); if (!safe) return <>{children}</>;`). Rendering stays the same for normal URLs.
      Tests: `frontend/src/renderers/fields.test.ts`: https and http pass through, `javascript:alert(1)`, `JAVASCRIPT:alert(1)`, `data:text/html,x`, `ftp://x`, `not a url` and null give null.
      Files: `frontend/src/renderers/fields.tsx`, `frontend/src/renderers/fields.test.ts`.
      Verify: `just check-frontend` exits 0.

- [ ] 7. **Pi operations hardening: log rotation, quieter health log, auto-update retry, LF endings (P2).**
      `docker-compose.yml`: add to the `dashboard` service `logging: {driver: json-file, options: {max-size: "5m", max-file: "3"}}` (block YAML). `app/middleware.py` `AccessLogMiddleware`: log successful `GET /api/health` (status < 400) at DEBUG, everything else at INFO as today. `scripts/auto-update.sh`: compare `origin/main` with the last successfully deployed commit stored in `"$(git rev-parse --git-dir)/home-dashboard-deployed"` (inside `.git`, never tracked), defaulting to `git rev-parse HEAD` when the file does not exist (first run behaves exactly like today), use `git pull --ff-only origin main`, write the commit to the state file only after `docker compose up -d --build` succeeds, and keep `set -euo pipefail` so a failed build exits non-zero and the next timer run retries. Full script in the Digest. Add `.gitattributes` with `*.sh text eol=lf` and `deploy/* text eol=lf`. Write the script with LF line endings.
      Tests: new `tests/test_middleware.py`: with `caplog.set_level(logging.INFO, logger="dashboard.http")`, `GET /api/health` produces no INFO record from `dashboard.http`, while `GET /api/latest` produces one whose message contains `/api/latest`.
      Files: `docker-compose.yml`, `app/middleware.py`, `scripts/auto-update.sh`, `.gitattributes`, `tests/test_middleware.py`.
      Verify: `just check-backend` exits 0. `bash -n scripts/auto-update.sh` (WSL bash) exits 0. `git ls-files --eol scripts/auto-update.sh` shows `i/lf`. Read the final script once more against the Digest because it is the one file that cannot be fixed remotely if broken.

- [ ] 8. **Dependency guards for the Pi image (P2).**
      New `tests/test_packaging.py`: parse `pyproject.toml` with `tomllib` and assert the set of `[project].dependencies` equals the non-comment, non-blank lines of `requirements.txt` (whitespace-normalised). In `tests/test_ws.py` add `test_uvicorn_has_websocket_support`: `from uvicorn.protocols.websockets.auto import AutoWebSocketsProtocol` and assert it is not None (uvicorn sets it to None when neither `websockets` nor `wsproto` is installed). The `check-pi-deps` recipe from item 1 covers aarch64 wheels (network, so it is not part of `check`).
      Files: `tests/test_packaging.py`, `tests/test_ws.py`.
      Verify: `just check-backend` exits 0. `just check-pi-deps` resolves.

- [ ] 9. **UI polish: lighter re-render, Polish plural, touch targets, aria-label (P3).**
      `frontend/src/hooks/useClock.ts`: `useClock(intervalMs = 1000)`. `App.tsx`: `const now = useClock(15_000)` for the grid, and stop passing `now` to `Header`. `Header.tsx`: call `useClock()` itself for the seconds clock. 15 s keeps the "przed chwilą" label correct for fresh updates (a 60 s tick would show "za 1 minutę" for an update newer than the last tick) while cutting grid renders and FLIP measurements 15×. `format.ts`: export `plural`. `SectionCard.tsx` teaser: `plural(n, 'pozycja', 'pozycje', 'pozycji')`, and `aria-label` equal to the existing `title` on the width toggle button. `index.css`: inside `@media (pointer: coarse)` give `.card-action-btn` and `.drag-handle` `position: relative` and an `::after { content: ''; position: absolute; inset: -0.45rem; }` hit area (≈36 px, no visual change).
      Tests: extend `frontend/src/format.test.ts` with `plural` cases 1 → pozycja, 2/3/4/22 → pozycje, 5/12/13/14/25 → pozycji.
      Files: `frontend/src/hooks/useClock.ts`, `frontend/src/App.tsx`, `frontend/src/components/Header.tsx`, `frontend/src/format.ts`, `frontend/src/components/SectionCard.tsx`, `frontend/src/index.css`, `frontend/src/format.test.ts`.
      Verify: `just check-frontend` exits 0.

- [ ] 10. **CI runs the same checks as `just check` (P2).**
      `.github/workflows/ci.yml`: backend job keeps checkout, setup-uv, `uv python install 3.12`, `uv sync --extra dev`, adds `extractions/setup-just@v2`, then one step `just check-backend` with `DASHBOARD_TOKEN: "ci-testing-token-secret"` (replaces the separate ruff and pytest steps). Frontend job keeps checkout, setup-node 22 with npm cache, `npm ci` in `frontend`, adds `extractions/setup-just@v2`, then `just check-frontend` (replaces the misnamed "TypeScript & Vite Build" step). Docker job unchanged.
      Files: `.github/workflows/ci.yml`.
      Verify: `just check` exits 0 locally (CI itself runs after a push, which this workflow does not do). YAML is valid (indentation reviewed).

- [ ] 11. **`.kiro`: Stop hook, one steering file, one skill (`kiro-docs` step).** Content in section (e). Needs items 1–2 (the hook calls `just check`, which must exist and pass).
      Files: `.kiro/hooks/just-check-on-stop.json`, `.kiro/steering/home-dashboard.md`, `.kiro/skills/home-dashboard-extend/SKILL.md`.
      Verify: `just check` exits 0. The hook file parses as JSON (`uv run python -m json.tool .kiro/hooks/just-check-on-stop.json`).

- [ ] 12. **README updates (`kiro-docs` step).** Exact list in section (f). English, existing style, no semicolons.
      Files: `README.md`.
      Verify: `just check` exits 0. Every recipe, env var and endpoint mentioned exists in `justfile`, `app/config.py`, `app/api/routes/`.

---

## (d) `just check` design

Dev tools and versions:

| Tool | Version | Where | Reaches the Pi image? |
| --- | --- | --- | --- |
| ruff | `==0.17.3` (pin, currently `>=0.7.0`) | pyproject `dev` extra + requirements-dev.txt | no |
| mypy | `==2.4.1` (new) | same | no |
| bandit | `==1.9.4` (new) | same | no |
| pytest, httpx | unchanged `>=` | same | no |
| vitest | `^2.1.9`, locked by package-lock | frontend devDependencies | only in the build stage `npm ci` |
| @types/node | `^22.20.5` | frontend devDependencies | only in the build stage |

ESLint is not configured and is not added (see g).

`pyproject.toml` additions:

```toml
[tool.mypy]
python_version = "3.11"
files = ["app", "scripts", "tests"]
plugins = ["pydantic.mypy"]
check_untyped_defs = true
warn_unused_ignores = true
```

`justfile` (keep `set dotenv-load` and the existing `set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]`, keep all other recipes). Replace `lint`, keep `test`, replace `check`, add the rest:

```just
# Ruff lint and format check
lint:
    uv run ruff check app tests scripts
    uv run ruff format --check app tests scripts

# Auto-fix ruff lint findings and reformat
fix:
    uv run ruff check --fix app tests scripts
    uv run ruff format app tests scripts

# Run the pytest suite
test:
    uv run python -m pytest

# Backend: ruff, mypy, bandit, pytest
check-backend: lint
    uv run mypy
    uv run bandit -q -r app scripts
    uv run python -m pytest

# Frontend: TypeScript, vitest, production build
check-frontend:
    npm --prefix frontend run typecheck
    npm --prefix frontend run test
    npm --prefix frontend run build

# Everything CI runs. Run it at the end of every change
check: check-backend check-frontend

# Confirm runtime dependencies have aarch64 wheels for the Pi (needs network)
check-pi-deps:
    uv pip compile requirements.txt --python-version 3.12 --python-platform aarch64-unknown-linux-gnu --only-binary :all: --quiet --no-header
```

Windows/PowerShell: every recipe line is one plain command, so it runs unchanged under `powershell.exe -Command` (Windows) and `sh -cu` (CI Linux). There is no chaining, no `&&` and no env-var syntax inside recipes. `just` stops at the first line that exits non-zero, so `check` fails fast in this order: ruff lint → format → mypy → bandit → pytest → tsc → vitest → vite build. Measured local runtime is well under a minute.

---

## (e) `.kiro` plan

All three files are useful and small. The steering file is justified because the Pi constraints apply to every change, not only to extension work. One skill is enough. Splitting it would duplicate the shared map and constraints.

### `.kiro/hooks/just-check-on-stop.json` (copy verbatim)

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Run just check at the end of every activity",
      "trigger": "Stop",
      "action": {
        "type": "agent",
        "prompt": "End-of-activity quality gate for the home-dashboard repository. Do these steps before you finish. 1. Tests: if this activity changed code in app/, scripts/, tests/ or frontend/src/, make sure tests cover the change. Add or update pytest tests in tests/ for backend changes and vitest tests (frontend/src/**/*.test.ts) for frontend logic. A behaviour change without a test is not finished. 2. Run `just check` from the repository root. It runs ruff lint and format check, mypy, bandit, pytest, tsc, vitest and the vite build. 3. If it fails, fix the root cause, use `just fix` for ruff lint and formatting findings, then run `just check` again. Repeat until it passes. Never make it pass by deleting or skipping tests, loosening tool configuration, or adding noqa, type: ignore or nosec without a short reason on the same line. 4. If `just check` already passed in this activity after your last file change, do not run it again. 5. If a failure can only be fixed by changing what the user sees or how the dashboard behaves, stop and ask the user first. Remember that production is a Raspberry Pi Zero 2 W with 512 MB RAM: do not add heavy dependencies to fix a check. Finish with one line: `just check: passed` or `just check: failed - <reason>`."
      }
    }
  ]
}
```

Point 4 prevents a loop if the hook re-fires after its own follow-up turn. Point 5 matches the user's "naprawi jeśli będą problemy" without silent behaviour changes.

### `.kiro/steering/home-dashboard.md` (front matter `inclusion: always`, about 30 lines)

1. One-line project summary and production facts: Raspberry Pi Zero 2 W, 512 MB RAM, 64-bit OS, Docker image built on the Pi, auto-deploy of `origin/main` every 10 minutes, access over Tailscale only.
2. Hard constraints: runtime deps must be pure Python or ship aarch64 wheels for Python 3.12 (`just check-pi-deps`), keep `requirements.txt` and `pyproject.toml` dependencies identical (a test enforces it), no full-table loads (let SQLite do the work), keep frontend devDependencies small (the Pi runs `npm ci`), keep the `websockets` dependency, do not change the container user or volume path.
3. Language: UI strings Polish, code, comments and README English.
4. Workflow: write or update tests with every behaviour change, finish with `just check` (enforced by the Stop hook), `just fix` for ruff. `main` deploys itself, so it must stay green.
5. Skill routing: use `home-dashboard-extend` when adding or changing a section, renderer, API endpoint, WebSocket frame, config option, sample data, Docker/compose or deploy files. Other work (questions, small fixes) needs no skill.

### `.kiro/skills/home-dashboard-extend/SKILL.md`

Front matter: `name: home-dashboard-extend`, `description: How to extend the Home Dashboard (FastAPI + React, runs on a Raspberry Pi Zero 2 W). USE FOR: adding or changing a section, renderer, API endpoint, WebSocket message, config option, sample data or deployment files. DO NOT USE FOR: answering general questions or editing unrelated repositories.`

Outline (short sections, point to README sections instead of copying them):

1. Architecture map: one table, path → responsibility (`app/main.py`, `app/config.py`, `app/auth.py` + `app/api/deps.py`, `app/middleware.py`, `app/schemas/`, `app/repositories/updates.py`, `app/services/{hub,updates,weather}.py`, `app/api/routes/*`, `frontend/src/{hooks,components,renderers,sections.ts,format.ts,types.ts,index.css}`, `samples/`, `tests/`).
2. Add a section: backend rules in `app/schemas/sections.py` (`STRING_FIELDS`, `TIMESTAMP_FIELDS`, enums) only when the section has typed fields. Renderer in `frontend/src/renderers/<Name>Renderer.tsx` typed with `RendererProps`, registered in `renderers/index.tsx`. Title, icon, `SECTION_ORDER`, `DEFAULT_SECTION_DISPLAY`, simple-view rules and rank in `sections.ts`. Links through `MaybeLink` (http/https only). `samples/<section>.json`, `samples/pool/<section>.json`, `EXPECTED` in `tests/test_samples.py`. Vitest for any new pure logic. Never a new table, keep new fields in items or `extra`.
3. Add an endpoint: new module in `app/api/routes/`, include it in `app/api/router.py`, use `IngestAuth` / `ReadAuth` / `ServiceDep` from `app/api/deps.py`, pydantic models in `app/schemas/`. Sync `def` for blocking work. Tests with the `client` / `read_client` fixtures. Update the README API table.
4. Add a config option: field on `Settings` (validator turning empty strings into None when optional), `.env.example`, README configuration table, compose only for container-specific overrides. Test by `monkeypatch.setenv` plus `get_settings.cache_clear()` as in `tests/conftest.py`.
5. WebSocket frames: broadcast through `ConnectionHub`, add the frame type to `SocketMessage` in `types.ts`, handle it in `useDashboard.ts`, test with `client.websocket_connect`.
6. Raspberry Pi constraints: 512 MB RAM, dependency rules, `just check-pi-deps`, SD-card friendly logging, the image is built on the Pi.
7. Check workflow: `just check`, `just fix`, `just check-backend`, `just check-frontend`, test locations and naming.

---

## (f) README changes (all English, existing style)

1. **Configuration**: add a "Default" column to the table, add the `STATIC_DIR` row (`frontend/dist`, path of the built frontend), note that compose overrides `DB_PATH` and `HOST`, and recommend `RETENTION_DAYS` (for example `90`) on the Pi to bound disk use.
2. **Quick start recipe table**: rows for `just lint` (ruff lint + format check), `just fix`, `just test`, `just check-backend`, `just check-frontend`, `just check` (everything CI runs), `just check-pi-deps`.
3. **Testing**: replace "`just check  # ruff + pytest`" and the paragraph about `npm run build` without a type check and the `tsc -b` errors with the real content of `just check`. Mention the vitest files, that weather tests mock Open-Meteo, and the dependency guard tests (requirements.txt vs pyproject, uvicorn WebSocket support). Update the CI paragraph: jobs run `just check-backend` and `just check-frontend`.
4. **Dashboard features / Self-refresh**: "once a night, at the first health check after 04:00 (only when the page was loaded before 04:00)".
5. **API table + weather sentence**: `GET /api/weather` returns `503` when Open-Meteo is unreachable and nothing is cached. The last good forecast is served while cached. The header then shows "Prognoza pogody chwilowo niedostępna". Remove the "built-in placeholder forecast" sentence.
6. **Deployment / Docker**: compose caps container logs at 3 × 5 MB. Access log writes `/api/health` at DEBUG.
7. **Auto-update**: the last deployed commit is stored in `.git/home-dashboard-deployed`, a failed build is retried on the next timer run, `git pull --ff-only`. Status commands: `systemctl list-timers home-dashboard-autoupdate.timer`, `journalctl -u home-dashboard-autoupdate.service -n 50`, `docker compose ps`, `docker compose logs --tail 100 dashboard`. Keep `main` green because it deploys itself.
8. **Raspberry Pi notes**: new runtime deps must have aarch64 wheels for Python 3.12 (`just check-pi-deps`), and `requirements.txt` must match `pyproject.toml` (a test enforces it).
9. **Tailscale**: remote administration over the tailnet (`ssh pi@100.x.y.z`, or `tailscale ssh` when Tailscale SSH is enabled), health check `curl http://100.x.y.z:8000/api/health`.
10. **New section "Development with Kiro"**: `.kiro/hooks/just-check-on-stop.json` runs `just check` at the end of every agent activity and requires tests for changes, `.kiro/steering/home-dashboard.md` holds the always-on project rules, `.kiro/skills/home-dashboard-extend/` explains how to extend the app.
11. **Adding a new section**: add a step "add vitest tests for new pure logic and run `just check`".

---

## (g) Deliberately not applied

| Recommendation | Why not |
| --- | --- |
| Run the container as a non-root user | The existing `dashboard-data` volume on the Pi is owned by root. A non-root user could not write the database after the next auto-deploy and the dashboard would break remotely. The box is tailnet-only. |
| Exact pins / lockfile for the Docker `pip install` | The Docker layer cache keeps the installed set stable until `requirements.txt` changes, and `docker image prune -f` does not clear the build cache. Pins add a sync chore. `just check-pi-deps` covers the real Pi risk (missing aarch64 wheels). Worth revisiting if an upstream release ever breaks a build. |
| ESLint / Prettier | Adds dozens of devDependencies to `npm ci` on the Pi (the heaviest build step on 512 MB). Strict `tsc` with `noUnusedLocals/Parameters` covers most of what matters. |
| arm64 Docker build in CI (QEMU) | 15+ minutes per run. `just check-pi-deps` catches the realistic failure (no wheel). |
| CSP, security headers, rate limiting, disabling `/docs` | Tailnet-only service with authenticated writes. PrimeReact inline styles would force `'unsafe-inline'`. `/docs` is handy for development. |
| Client-side WebSocket watchdog | Server pings every 25 s, health check every 30 s, the stale badge shows old data. No reported problem. |
| Larger header weather text, copy tweaks ("Kliknij" → "Dotknij", "Tryb poranny" footer) | Subjective visual change. The user says the screen works well. Mentioned as a suggestion only. The timeline uses 0.65–0.68 rem (≈9.5 px) for city and rain chance, small for reading across a room. |
| Changing the `RETENTION_DAYS` default | Would silently delete existing history. README recommendation instead. |
| Health endpoint returning 503 when the DB fails | `restart: unless-stopped` does not act on "unhealthy", so it changes nothing on the Pi. |
| Rewriting the weather slot-picking logic | Convoluted but correct. New tests pin its output shape. |
| Removing `Makefile` / `requirements-dev.txt` | Harmless helpers for people without `just`/uv. `requirements-dev.txt` is synced instead. |
| Disabling the FLIP move under reduced motion | CSS animations are already disabled. The FLIP move is 0.25 s. |
| Longer Docker healthcheck interval | A Python spawn every 30 s is cheap on the Pi Zero 2 W. |
| Replacing httpx in tests (Starlette deprecation warning) | TestClient still works. Change it when FastAPI's own TestClient guidance settles. |
| Restructuring the workflow into FEATs | The existing tail (implement → kiro-docs → review loop → report) already matches the natural split. |

---

## Digest

Build and test commands verified today: `just check` passes (ruff check app tests, pytest 19 passed). `uv run ruff check app tests scripts` passes. `npm --prefix frontend run build` passes. `npx tsc -b` fails with the 30 known errors. mypy and bandit baselines as in the table at the top.

### `pyproject.toml`
`[project.optional-dependencies].dev = ["pytest>=8.3.0", "httpx>=0.27.0", "ruff>=0.7.0"]` → `["pytest>=8.3.0", "httpx>=0.27.0", "ruff==0.17.3", "mypy==2.4.1", "bandit==1.9.4"]`. Append the `[tool.mypy]` block from (d). Existing `[tool.ruff]` (line-length 100, py311, select E F W I) unchanged. Covered by `just check-backend`.

### `requirements-dev.txt`
Currently `-r requirements.txt`, `pytest>=8.3.0`, `httpx>=0.27.0`, `ruff>=0.7.0`, `mypy>=1.13.0` → same pins as the dev extra plus `bandit==1.9.4`.

### `justfile`
Current `lint:` runs `uv run ruff check app tests`, `check: lint test`. Replace per (d). Keep `default`, `install`, `dev`, `dev-backend`, `dev-frontend`, `build`, `run`, `sample`, `sample-static`.

### `frontend/package.json`
`scripts` today: `dev`, `build: "vite build"`, `preview`. Add `"typecheck": "tsc -b"`, `"test": "vitest run"`. `devDependencies` gains `vitest`, `@types/node` via `npm install` (updates `package-lock.json`).

### `frontend/tsconfig.node.json`
`compilerOptions` add `"types": ["node"]`. `include: ["vite.config.ts"]` unchanged. `vite.config.ts` itself needs no change (`path`, `__dirname`, `process` resolve with Node types).

### `frontend/src/types.ts`
Add `export interface RendererProps { update: SectionUpdate; now: Date; }`. Consumers: all files in `src/renderers/` (Calendar uses `now`, others only `update`). Optionally add `| { type: 'ping' }` to `SocketMessage` (no behaviour change).

### `app/repositories/updates.py`
Today: `latest()` = `SELECT * FROM updates` + Python max by `_sort_key`, `history()` = `SELECT * … WHERE section = ?` + Python sort + slice, `prune()` = full scan of `id, section, generated_at` + Python selection + `executemany DELETE`. `save()` ends with `assert row is not None`. Target:

```python
# Newest row per section, by instant. julianday() applies the stored +01:00/+02:00 offset.
LATEST_IDS_SQL = """
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY section ORDER BY julianday(generated_at) DESC, id DESC
        ) AS position
        FROM updates
    )
    WHERE position = 1
"""
LATEST_ROWS_SQL = f"SELECT * FROM updates WHERE id IN ({LATEST_IDS_SQL}) ORDER BY section"  # nosec B608 - constant SQL
PRUNE_SQL = f"DELETE FROM updates WHERE julianday(generated_at) < julianday(?) AND id NOT IN ({LATEST_IDS_SQL})"  # nosec B608 - constant SQL

def latest(self) -> list[dict[str, Any]]:
    with self._lock:
        rows = self._conn.execute(LATEST_ROWS_SQL).fetchall()
    return [_public_row(row) for row in rows]

def history(self, section: str, limit: int) -> list[dict[str, Any]]:
    with self._lock:
        rows = self._conn.execute(
            "SELECT * FROM updates WHERE section = ? "
            "ORDER BY julianday(generated_at) DESC, id DESC LIMIT ?",
            (section, limit),
        ).fetchall()
    return [_public_row(row) for row in rows]

def prune(self, retention_days: int | None) -> int:
    if not retention_days:
        return 0
    cutoff = (now_warsaw() - timedelta(days=retention_days)).isoformat(timespec="seconds")
    with self._lock:
        cursor = self._conn.execute(PRUNE_SQL, (cutoff,))
        self._conn.commit()
    removed = cursor.rowcount
    if removed:
        logger.info("retention removed %s rows older than %s days", removed, retention_days)
    return removed
```

Bandit B608 flags SQL built with f-strings, so each composed statement is one line with its `nosec` reason on that line (ruff ignores E501 and `ruff format` does not split strings). Remove `_sort_key` and unused imports (`datetime`, `WARSAW`, `parse_instant`). Keep `timedelta`, `now_warsaw`, `utc_now_iso`. Covered by `test_append_latest_and_history`, `test_retention_keeps_newest_row`, `test_sample_payloads_are_accepted`, the WS tests and the two new tests from item 3.

### `app/services/weather.py` / `app/api/routes/weather.py`
`get_weather()` today: cache hit → return. Try fetch and build `_cache`. `except Exception` → return `_cache` if set, else a hard-coded placeholder dict. The inner loop has `except Exception: continue` (line 96). `upcoming_items = []` (line 91) lacks a type. Route: `def weather() -> dict: return get_weather()`. Target: typed list, `except (TypeError, ValueError): continue`, `# nosec B310` on `urlopen`, `WeatherUnavailableError` raised `from exc` instead of the placeholder, route maps it to `HTTPException(503, "Weather unavailable")`. Covered by the rewritten `tests/test_weather.py`.

### `app/middleware.py`
`AccessLogMiddleware.__call__` `finally:` block logs `logger.info("%s %s -> %s %.1fms", …)`. Target: `level = logging.DEBUG if scope.get("path") == "/api/health" and status < 400 else logging.INFO` then `logger.log(level, …)`. Needs `import logging`. Covered by `tests/test_middleware.py`.

### `app/auth.py`
Delete `authorize_websocket` (lines 58–65) and drop `WebSocket` from the fastapi import. `app/api/routes/ws.py` already imports only `bearer_token`, `tokens_match`.

### `app/config.py`
Line 31 `host: str = "0.0.0.0"` gets the `# nosec B104` reason comment. `get_settings()` stays `return Settings()` (the pydantic mypy plugin removes the call-arg error).

### `scripts/send_sample.py`
Line 82 `return shift_value(payload, now - parsed)` → `return cast(dict, shift_value(payload, now - parsed))` (add `cast` to the `typing` import). Line 208 and 228 get the `nosec` comments from item 2.

### `scripts/auto-update.sh` (target, LF endings)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Go to the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Last commit that was built and started successfully. Lives inside .git, so it is never tracked.
STATE_FILE="$(git rev-parse --git-dir)/home-dashboard-deployed"

# Fetch main without touching the working tree
git fetch origin main --quiet

REMOTE_COMMIT=$(git rev-parse origin/main)
if [ -f "$STATE_FILE" ]; then
    DEPLOYED_COMMIT=$(cat "$STATE_FILE")
else
    DEPLOYED_COMMIT=$(git rev-parse HEAD)
fi

if [ "$DEPLOYED_COMMIT" = "$REMOTE_COMMIT" ]; then
    # Nothing new since the last successful deploy
    exit 0
fi

echo "[$(date -Iseconds)] Deploying origin/main ($DEPLOYED_COMMIT -> $REMOTE_COMMIT)."
git pull --ff-only origin main

echo "[$(date -Iseconds)] Rebuilding and restarting the Docker container..."
# A failed build exits here (set -e). The state file is not updated, so the next run retries.
docker compose up -d --build
echo "$REMOTE_COMMIT" > "$STATE_FILE"

echo "[$(date -Iseconds)] Pruning unused images..."
docker image prune -f

echo "[$(date -Iseconds)] Update finished."
```

### `docker-compose.yml`
Add under `services.dashboard` (after `restart: unless-stopped`):

```yaml
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

### `frontend/src/hooks/useDashboard.ts`
Today: `const lastDailyReload = useRef<string>('')` and inside `checkServerHealth` the block `const now = new Date(); const dateKey = …; if (now.getHours() === 4 && now.getMinutes() < 10 && lastDailyReload.current !== dateKey) { … reload }`. Target:

```ts
const NIGHTLY_RELOAD_HOUR = 4;
const PAGE_LOADED_AT = new Date();

/** True when the page was loaded before the most recent local 04:00. */
export function shouldNightlyReload(loadedAt: Date, now: Date): boolean {
  const boundary = new Date(now);
  boundary.setHours(NIGHTLY_RELOAD_HOUR, 0, 0, 0);
  if (now < boundary) boundary.setDate(boundary.getDate() - 1);
  return loadedAt < boundary;
}
```

and in `checkServerHealth`: `if (shouldNightlyReload(PAGE_LOADED_AT, new Date())) { console.info(…); window.location.reload(); }`. Remove the `lastDailyReload` ref. Covered by `src/hooks/useDashboard.test.ts`.

### `frontend/src/hooks/useWeather.ts`, `components/Header.tsx`, `components/WeatherTimeline.tsx`
`useWeather(): WeatherData | null` → `useWeather(): { weather: WeatherData | null; unavailable: boolean }` (set `unavailable` true in `catch`, false on success). Header today takes `now` as a prop and calls `useWeather()`. Target: Header calls `useClock()` and `useWeather()` itself, props `mode`, `viewMode`, `onToggleViewMode`. `WeatherTimeline({ weather, unavailable })`: when `!weather`, show "Prognoza pogody chwilowo niedostępna" if `unavailable`, else the existing loading text.

### `frontend/src/hooks/useClock.ts`, `App.tsx`
`useClock()` uses a fixed 1000 ms interval → add `intervalMs = 1000` parameter. `App` calls `useClock()` and passes `now` to `Header` and `SectionGrid` → `useClock(15_000)` for `SectionGrid` only.

### `frontend/src/renderers/fields.tsx`
`MaybeLink({ href, children })` returns children when `!href`, else `<a className="quiet-link" href={href} target="_blank" rel="noreferrer">`. Target: `safeHref()` helper as in item 6, used by `MaybeLink`.

### `frontend/src/format.ts`, `components/SectionCard.tsx`, `index.css`
`function plural(count, one, few, many)` is private → `export`. SectionCard teaser: `({update.items.length} {update.items.length === 1 ? 'pozycja' : 'pozycji'})` → `plural(update.items.length, 'pozycja', 'pozycje', 'pozycji')`. Width button (`className="card-action-btn…"`, `title={…}`) gets `aria-label` with the same text. CSS: `.card-action-btn` and `.drag-handle` are 1.55 rem squares (index.css ≈ lines 699–741). Add the `@media (pointer: coarse)` hit-area block next to the existing media queries.

### `.github/workflows/ci.yml`
Backend job steps: checkout, setup-uv@v3, `uv python install 3.12`, `uv sync --extra dev`, "Run Ruff Lint", "Run Pytest" (env `DASHBOARD_TOKEN`). Frontend job: checkout, setup-node@v4 (22, npm cache), `npm ci`, "TypeScript & Vite Build" = `npm run build`. Replace per item 10.

### Tests
- Existing: `tests/test_auth.py` (4), `tests/test_samples.py` (1), `tests/test_updates.py` (9), `tests/test_weather.py` (1, network), `tests/test_ws.py` (3). All 19 pass today. Fixtures: `client`, `read_client`, `retention_client`, `tiny_client`, `auth_header` in `tests/conftest.py`. Helpers `envelope()`, `warsaw()`, `days_ago()` in `tests/helpers.py`.
- New: `tests/test_middleware.py`, `tests/test_packaging.py`, extended `tests/test_updates.py`, `tests/test_ws.py`, rewritten `tests/test_weather.py`, and frontend `src/format.test.ts`, `src/sections.test.ts`, `src/hooks/useDashboard.test.ts`, `src/renderers/fields.test.ts`.
