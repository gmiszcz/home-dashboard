# Check tooling, Pi hardening, UI fixes and Kiro setup for Home Dashboard

The working tree implements plan items 1-12. `just check` now runs ruff lint and format check, mypy, bandit, pytest, `tsc -b`, vitest and the vite build, and CI runs the same recipes. `latest`, `history` and `prune` moved into SQL, so the Pi no longer loads every payload per request. The nightly reload loop, the invented weather forecast and unsafe link schemes are fixed. Compose rotates logs, health polls drop to DEBUG, and `auto-update.sh` retries a failed build. A Kiro Stop hook, one steering file, one skill and a README update complete the change. The recorded verification shows `just check` exiting 0 (pytest 28, vitest 37).

Watch for: the calendar `days_plus_week` redesign sits in the same working tree with new 422 validation paths and new frontend logic, but has no dedicated tests (confirmed). The auto-update retry has two edge cases: no retry before the first state file exists, and an unbounded rebuild every 10 minutes for a commit that never builds (confirmed). None of these breaks the Pi today.

**Verdict**: APPROVED

## High-level view

Python dev tools are pinned in the `dev` extra and in `requirements-dev.txt` and never reach the image. The frontend gains only `vitest` and `@types/node`, which add about 30 pure-JS packages to the Pi's `npm ci` with no install scripts or native binaries.

A `ROW_NUMBER()` window ordered by `julianday(generated_at)` picks the newest row per section by instant, and the new DST test pins this down. `history` applies `LIMIT` in SQLite and `prune` is one `DELETE`. Window functions need SQLite 3.25, and bookworm ships 3.40.

The auto-update script now treats `.git/home-dashboard-deployed` as the source of truth. A failed `docker compose up --build` leaves the old container running and gets retried on the next timer run. Two gaps remain. The first deploy run by the new script cannot be retried if it fails, and a commit that never builds triggers a full rebuild attempt every 10 minutes.

The nightly reload compares against a module-level page-load time, so the 04:00 loop cannot recur, and it fires only after a successful health response. The grid ticks every 15 s while the header keeps its seconds clock. With an empty weather cache and a failed fetch, the API returns `503` and the header says "Prognoza pogody chwilowo niedostępna", which can stay on screen for up to 10 minutes after a deploy restart because `useWeather` refreshes every 10 minutes. The old fake forecast filled the same window, so this is not a regression. Fingerprints of non-calendar sections are unchanged, so tiles do not flash "nowe" after the deploy.

The hook uses the JSON format of the installed Kiro build (`version: "v1"`, `trigger: "Stop"`, `action.type: "agent"` with `prompt`, as accepted by Kiro's `createHook` schema). The README covers the options with defaults, `just check`, the dev workflow, Pi deploy and status commands, Tailscale administration and `.kiro`.

The calendar `days_plus_week` redesign was already in the working tree before this workflow. It adds server-side validation that can reject calendar payloads with `422`, plus `hasCalendarLayout`, `calendarEvents` and `contentCount`, which drive badges, "nowe" detection and the simple view. Only the sample payload test exercises it.

<details>
<summary>Issues (6)</summary>

1. **Calendar layout without tests**: `validate_calendar_layout` and the new `sections.ts` helpers have no dedicated pytest or vitest cases. Add rejection tests (date outside the day or week, `week` without `days`, bad color, more than 7 days) and vitest cases for `contentCount` and `isSimpleSection` on the layout before this reaches `main`, or commit it separately.
2. **Auto-update first-run retry gap**: with no state file, the baseline is `HEAD`, and `git pull` has already advanced it. If the first build after this deploy fails, it is never retried. Seed the file before pulling: `[ -f "$STATE_FILE" ] || git rev-parse HEAD > "$STATE_FILE"`.
3. **Unbounded rebuild loop**: a commit that never builds is rebuilt every 10 minutes on the Pi, with `vite build` in 512 MB next to the live container. Consider recording the failed commit and skipping it after a few attempts, or document how to stop the loop.
4. **Crashed health request logged at DEBUG**: `status` stays `0` when the app raises before sending a response, and `0 < 400` routes it to DEBUG. Use `0 < status < 400`.
5. **Suppression comments without inline reasons**: `# nosec B608`, `B104`, `B310` and `B311` carry no reason on the same line (B608 has none at all). The hook and the skill forbid exactly this. Move the reasons onto the same line as the plan specified.
6. **README overstates calendar coverage**: the Testing section says pytest covers the calendar `days`/`week` layout, but only the sample payload is posted. Fix the sentence or add the tests from item 1.

</details>

<details>
<summary>Details</summary>

### Retry semantics of `auto-update.sh`

The new flow is:

```
fetch origin/main
baseline = state file, or HEAD if missing
baseline == origin/main ? exit 0
git pull --ff-only
docker compose up -d --build   (fails -> exit 1, state untouched)
write origin/main to state file
image prune
```

The state file is written only by the new script after a successful build. The commit that introduces the script is deployed by the old script, so the next commit is the first one deployed by the new script, and that run starts without a state file. Its baseline is `HEAD`. If that build fails, `git pull` has already moved `HEAD` to `origin/main`, so the next run sees baseline equal to remote and stops, the same as the old behaviour (confirmed). Seeding the file with `HEAD` before the pull closes the gap with one line.

The opposite case is a commit that fails deterministically, for example a frontend error that CI did not catch or a dependency without an aarch64 wheel. Every timer run then rebuilds from the first changed layer. When the `npm ci` layer is cached, that means `vite build` every 10 minutes on a 512 MB board with the live container running beside it. The unbounded loop is confirmed. The OOM impact on the running container is possible, not observed. CI on `main` makes this unlikely, so it does not block. The failure shows up in `journalctl`, as the README now documents.

### Calendar `days_plus_week` redesign bundled in the same tree

`UpdateIn.check_known_sections` now calls `validate_calendar_layout(model_extra)` for `calendar`. Any payload with `layout`, `days` or `week` must have a `days` list of at most 7 entries. Each event must have a `start` whose Warsaw date falls within its day or within `week.from`..`week.to`, and `color` and `provider` are checked when present. Any violation gives `422`. A Ryuk payload that sends `week` without `days`, or lists an event under a day other than its start date, is rejected (confirmed by reading `validate_calendar_layout`). Rejection is the intended contract per the README, but none of these paths has a test, and `main` deploys itself.

On the frontend, `contentCount` replaces `items.length` for the badge, the collapsed teaser and "nowe" detection. `isSimpleSection` shows a layout calendar in the simple view whenever any event exists in `days` or `week`, while the legacy calendar appears only for items starting today. That is a visible behaviour difference between the two payload shapes. It may be intended, but no test pins it. `contentFingerprint` adds `days`/`week` only for the layout, so existing fingerprints stay stable.

### Access log level for `/api/health`

`AccessLogMiddleware` initialises `status = 0` and only sets it on `http.response.start`. When the health route raises, Starlette's outer error middleware sends the 500, so this middleware still sees `0`. The `status < 400` check then logs the failed request at DEBUG (confirmed). The traceback still reaches the error log, so the impact is small. `0 < status < 400` keeps crashed health requests at INFO.

### Test coverage

Backend tests cover the DST ordering, retention per section with a lone old row kept, weather success, `503`, the cached fallback and the TTL, the health log level, the requirements/pyproject guard and uvicorn WebSocket support. Frontend tests cover `formatRelative`, `plural`, `addDaysKey`, `contentFingerprint`, `isSimpleSection` for the legacy calendar, `sortItems`, `shouldNightlyReload` at the 04:00 boundary, and `safeHref`.

Not tested: the calendar layout validation and helpers (Issue 1), `useWeather`'s `unavailable` transitions, and `auto-update.sh`, which has only the recorded `bash -n` and LF checks. The last two need jsdom or a shell harness, which the plan deliberately avoided.

</details>

<details>
<summary>File map</summary>

- `justfile`: `lint` adds format check, new `fix`, `check-backend`, `check-frontend`, `check`, `check-pi-deps`
- `pyproject.toml`, `requirements-dev.txt`, `uv.lock`: pinned ruff, mypy, bandit, `[tool.mypy]`
- `frontend/package.json`, `package-lock.json`, `tsconfig.node.json`: vitest, `@types/node`, `typecheck` and `test` scripts
- `.github/workflows/ci.yml`: jobs run `just check-backend` and `just check-frontend`
- `app/repositories/updates.py`: SQL window function for latest, SQL-ordered history, single-statement prune
- `app/services/weather.py`, `app/api/routes/weather.py`: `WeatherUnavailableError`, `503`, placeholder removed
- `app/middleware.py`: successful health polls at DEBUG
- `app/auth.py`: dead `authorize_websocket` removed
- `app/config.py`, `scripts/send_sample.py`: nosec comments, `cast`, formatting
- `app/schemas/sections.py`, `app/schemas/update.py`: calendar `days_plus_week` validation (out of plan), formatting
- `docker-compose.yml`: json-file log rotation 3 × 5 MB
- `scripts/auto-update.sh`, `.gitattributes`: deployed-commit state file, `--ff-only`, LF endings
- `frontend/src/hooks/useDashboard.ts`: `shouldNightlyReload` with page-load time
- `frontend/src/hooks/useClock.ts`, `App.tsx`, `components/Header.tsx`: 15 s grid tick, header owns its clock
- `frontend/src/hooks/useWeather.ts`, `components/WeatherTimeline.tsx`: `unavailable` state and message
- `frontend/src/renderers/fields.tsx`: `safeHref`
- `frontend/src/format.ts`, `components/SectionCard.tsx`, `index.css`: exported `plural`, aria-label, coarse-pointer hit area, calendar board styles
- `frontend/src/renderers/CalendarRenderer.tsx`, `sections.ts`, `types.ts`, `components/SectionGrid.tsx`, `samples/calendar.json`: calendar board (out of plan), `RendererProps`
- `tests/test_updates.py`, `test_weather.py`, `test_ws.py`, `test_middleware.py`, `test_packaging.py`: new and rewritten backend tests
- `frontend/src/**/*.test.ts`: four vitest files
- `.kiro/hooks/just-check-on-stop.json`, `.kiro/steering/home-dashboard.md`, `.kiro/skills/home-dashboard-extend/SKILL.md`: Kiro setup
- `README.md`: config defaults, recipes, testing, Kiro, Docker logs, auto-update status, Pi deps, Tailscale admin, calendar layout

Full diff: `git -C d:\Coding\priv\home-dashboard diff HEAD` plus the untracked files from `git status`.

</details>
