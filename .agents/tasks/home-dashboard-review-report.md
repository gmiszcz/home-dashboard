# Home Dashboard: raport z przeglądu

Gałąź `dev`, baza `8a0ff63`. **Nic nie zostało zacommitowane ani wypchnięte.** Wszystkie zmiany leżą w drzewie roboczym.

## Werdykt

**OK, aplikacja jest w dobrym stanie.** Architektura jest prosta i pasuje do Raspberry Pi Zero 2 W (512 MB RAM). Auth, walidacja, realtime, PWA i wygląd były poprawne już wcześniej i zostały bez zmian. Poprawiono jeden błąd (pętla nocnego przeładowania), jedno ryzyko pamięci na Pi (pełne skany tabeli), zmyśloną prognozę pogody, niebezpieczne linki i braki w narzędziach. `just check` przechodzi.

| Obszar | Werdykt |
| --- | --- |
| Auth (tokeny, porównanie w stałym czasie, brak tokenów w logach) | **OK** |
| Walidacja payloadów (strefa Warszawy, enumy, limity) | **OK** |
| WebSocket, heartbeat, fallback na polling | **OK** |
| Wygląd, kontrast, tryb prosty, `prefers-reduced-motion`, safe-area | **OK** |
| PWA bez service workera, wake lock | **OK** |
| Pamięć SQLite na Pi (`latest`, `history`, `prune`) | **poprawione** |
| Nocne przeładowanie o 04:00 | **poprawione** (był błąd) |
| Pogoda przy braku sieci | **poprawione** |
| Linki z danych (`javascript:`) | **poprawione** |
| Narzędzia (mypy, bandit, format, typecheck, testy frontendu) | **poprawione** |
| Logi Dockera i auto-update na Pi | **poprawione** |
| Drobny UX (odmiana, cele dotyku, aria-label, re-render co sekundę) | **poprawione** |

## Dostępne opcje i funkcje

| Zmienna | Domyślnie | Znaczenie |
| --- | --- | --- |
| `DASHBOARD_TOKEN` | wymagany, min. 8 znaków | token Bearer do zapisu |
| `READ_TOKEN` | pusty (odczyt otwarty) | chroni `/api/latest`, `/api/section/*`, `/ws` |
| `DB_PATH` | `data/dashboard.sqlite` | compose wymusza `/data/dashboard.sqlite` |
| `HOST`, `PORT` | `0.0.0.0`, `8000` | adres i port serwera |
| `RETENTION_DAYS` | pusty (wszystko zostaje) | usuwa stare wiersze, najnowszy wiersz sekcji zostaje |
| `MAX_BODY_BYTES` | `262144` | limit body, odpowiedź 413 |
| `STALE_AFTER_MINUTES` | `360` | po tym czasie kafelek jest „nieaktualny” |
| `LOG_LEVEL` | `INFO` | poziom logów |
| `STATIC_DIR` | `frontend/dist` | zbudowany frontend (wcześniej nieudokumentowany) |
| `DASHBOARD_URL` | `http://127.0.0.1:8000` | tylko `scripts/send_sample.py` |

| Endpoint | Auth | Działanie |
| --- | --- | --- |
| `POST /api/update`, `POST /api/updates` | zapis | idempotentny zapis pojedynczy lub paczka 1–50 |
| `GET /api/latest`, `GET /api/section/{name}` | odczyt | najnowszy wiersz każdej sekcji, historia sekcji |
| `GET /api/weather` | brak | Open-Meteo dla Gliwic, cache 15 min |
| `GET /api/health` | brak | status, liczba wierszy, `server_id`, wersja |
| `WS /ws` | odczyt | snapshot, potem ramki `update` |

Funkcje UI: zegar Warszawy, pogoda w 5 slotach, dioda połączenia, widok prosty i pełny, drag and drop (mysz i dotyk), kafelek na pełną szerokość, znacznik „nowe” i przycisk „Ogarnięte”, znacznik nieaktualności, zwijanie, animacje FLIP. Sekcje mają własne renderery (kalendarz, paczki, AI, e-mail, ceny, promocje, finanse, GitHub, inbox) i renderer ogólny dla nieznanych sekcji. Strona sama się przeładowuje po deployu (zmiana `server_id`) i raz w nocy.

## Co zmieniono i dlaczego

| Zmiana | Pliki | Powód |
| --- | --- | --- |
| `latest`, `history`, `prune` liczone w SQL (`ROW_NUMBER()` po `julianday`) | `app/repositories/updates.py` | wcześniej każde połączenie WS i każdy polling ładował do RAM całą tabelę z payloadami. Na 512 MB to główne długoterminowe ryzyko OOM |
| Nocne przeładowanie porównuje czas załadowania strony z ostatnią 04:00 | `frontend/src/hooks/useDashboard.ts` | stara wersja przeładowywała stronę w pętli od 04:00 do 04:10 i obciążała Pi |
| Pogoda zwraca `503` zamiast zmyślonej prognozy, UI pokazuje „Prognoza pogody chwilowo niedostępna” | `app/services/weather.py`, `app/api/routes/weather.py`, `useWeather.ts`, `Header.tsx`, `WeatherTimeline.tsx` | po restarcie bez sieci ekran pokazywał fałszywe 12 °C. Ostatnia dobra prognoza z cache dalej jest serwowana |
| `safeHref` przepuszcza tylko `http:` i `https:` | `frontend/src/renderers/fields.tsx` | Ryuk streszcza obce e-maile, więc link `javascript:` mógł trafić na ekran |
| Rotacja logów 3 × 5 MB | `docker-compose.yml` | log Dockera rósł bez końca na karcie SD |
| Udane `GET /api/health` logowane na DEBUG | `app/middleware.py` | około 5800 linii dziennie bez wartości |
| Auto-update zapisuje ostatni udany deploy w `.git/home-dashboard-deployed`, używa `git pull --ff-only` | `scripts/auto-update.sh` | nieudany build nie był ponawiany, Pi zostawał na starym obrazie do następnego commita |
| `.gitattributes` z LF dla `*.sh` i `deploy/*` | `.gitattributes` | skrypt z checkoutu Windows (CRLF) nie działa w bash |
| Siatka odświeża się co 15 s, tylko nagłówek co sekundę | `useClock.ts`, `App.tsx`, `Header.tsx` | cała siatka i pomiary FLIP liczyły się co sekundę 24/7 na iPadzie |
| Poprawna odmiana „2 pozycje”, `aria-label` na przycisku szerokości, większy obszar dotyku na `pointer: coarse` | `format.ts`, `SectionCard.tsx`, `index.css` | było „(2 pozycji)”, przyciski miały około 22 px |
| Typ `RendererProps`, typy Node dla `vite.config.ts` | `frontend/src/types.ts`, `tsconfig.node.json` | `tsc -b` miał 30 błędów, CI nigdy nie sprawdzał typów |
| Poprawki mypy i bandit, usunięta martwa funkcja `authorize_websocket`, `ruff format` na 4 plikach | `app/`, `scripts/send_sample.py`, `tests/` | żeby `just check` przechodził na istniejącym kodzie |
| CI uruchamia `just check-backend` i `just check-frontend` | `.github/workflows/ci.yml` | lokalnie i w CI działa ten sam zestaw sprawdzeń |

Widoczne zmiany dla użytkownika to tylko komunikat o niedostępnej pogodzie, odmiana „pozycje” i brak nocnej pętli przeładowań. Reszta działa jak wcześniej.

## Co dodano

| Element | Zawartość |
| --- | --- |
| Narzędzia Python (tylko `dev`, nie trafiają na Pi) | `ruff==0.17.3`, `mypy==2.4.1`, `bandit==1.9.4`, sekcja `[tool.mypy]` z pluginem pydantic |
| Narzędzia frontendu | `vitest`, `@types/node`, skrypty `typecheck` i `test`. Około 30 lekkich pakietów JS bez natywnych binariów w `npm ci` na Pi |
| Recepty `just` | `lint` (lint i format check), `fix`, `test`, `check-backend`, `check-frontend`, `check`, `check-pi-deps` |
| Testy pytest | kolejność po zmianie czasu (DST), retencja per sekcja, pogoda bez sieci (mock Open-Meteo, `503`, cache, TTL), poziom logu health, zgodność `requirements.txt` z `pyproject.toml`, obsługa WebSocket w uvicorn |
| Testy vitest (4 pliki) | `formatRelative`, `plural`, `addDaysKey`, `contentFingerprint`, `isSimpleSection`, `sortItems`, `shouldNightlyReload`, `safeHref` |
| `.kiro/hooks/just-check-on-stop.json` | hook `Stop` przy końcu każdej aktywności agenta. Wymaga testów dla zmian w `app/`, `scripts/`, `tests/`, `frontend/src/`, uruchamia `just check`, naprawia błędy i powtarza do skutku. Zabrania omijania testów i `noqa`/`nosec` bez powodu. Nie uruchamia `just check` drugi raz, jeśli już przeszedł po ostatniej zmianie. Pyta użytkownika, gdy naprawa zmienia zachowanie aplikacji |
| `.kiro/steering/home-dashboard.md` | zawsze włączony. Fakty produkcyjne (Pi, auto-deploy `main`, Tailscale), twarde ograniczenia, język, workflow i kiedy użyć skilla |
| `.kiro/skills/home-dashboard-extend/SKILL.md` | mapa architektury i kroki: nowa sekcja, renderer, endpoint, opcja konfiguracji, ramka WebSocket, dane przykładowe, ograniczenia Pi, `just check` |

Jeden skill i jeden steering wystarczą. Podział na więcej plików powielałby tę samą mapę i ograniczenia.

## Co dodano do README

README zostało po angielsku, zgodnie z zasadą projektu. UI zostało po polsku.

- Tabela konfiguracji z kolumną domyślnych wartości, wiersz `STATIC_DIR` i rekomendacja `RETENTION_DAYS=90` na Pi.
- Tabela recept `just` z nowymi komendami.
- Sekcja Testing z faktyczną zawartością `just check`, opis vitest i testów zależności, CI na tych samych receptach.
- Zasada nocnego przeładowania i opis `503` dla pogody (usunięte zdanie o zastępczej prognozie).
- Limity logów Dockera i health na DEBUG.
- Auto-update: plik stanu, ponawianie po nieudanym buildzie, `--ff-only`, komendy statusu (`systemctl list-timers`, `journalctl`, `docker compose ps`, `docker compose logs`).
- Notatka o Pi: nowe zależności muszą mieć koła aarch64 (`just check-pi-deps`).
- Tailscale: `curl .../api/health`, `ssh pi@100.x.y.z` lub `tailscale ssh`.
- Nowa sekcja „Development with Kiro” i krok „vitest i `just check`” w instrukcji dodawania sekcji.

## Rekomendacje niezastosowane

| Rekomendacja | Werdykt | Powód |
| --- | --- | --- |
| Kontener jako użytkownik nie-root | **niezastosowane** | wolumen `dashboard-data` na Pi należy do roota. Po auto-deployu baza przestałaby się zapisywać i dashboard padłby zdalnie |
| Dokładne piny w `requirements.txt` | **niezastosowane** | cache warstw Dockera trzyma stały zestaw. `just check-pi-deps` łapie realne ryzyko (brak koła aarch64) |
| ESLint i Prettier | **niezastosowane** | dziesiątki pakietów w `npm ci` na Pi, najcięższym kroku na 512 MB. Ścisły `tsc` pokrywa najważniejsze |
| Build arm64 w CI przez QEMU | **niezastosowane** | ponad 15 minut na przebieg |
| CSP, nagłówki bezpieczeństwa, rate limiting, wyłączenie `/docs` | **niezastosowane** | usługa tylko w tailnecie z autoryzowanym zapisem. Style inline PrimeReact wymusiłyby `unsafe-inline` |
| Watchdog WebSocket po stronie klienta | **niezastosowane** | ping co 25 s i health co 30 s już wystarczają |
| Większy tekst pogody, zmiany tekstów („Kliknij” → „Dotknij”) | **niezastosowane** | zmiana wizualna do decyzji użytkownika. Miasto i szansa opadów mają około 9,5 px, co jest małe z odległości pokoju |
| Zmiana domyślnego `RETENTION_DAYS` | **niezastosowane** | po cichu skasowałaby historię. Jest rekomendacja w README |
| Health zwracający `503` przy błędzie bazy | **niezastosowane** | `restart: unless-stopped` nie reaguje na „unhealthy” |
| Przepisanie logiki slotów pogody | **niezastosowane** | zawiła, ale poprawna. Testy przypinają wynik |
| Usunięcie `Makefile` i `requirements-dev.txt` | **niezastosowane** | nieszkodliwe dla osób bez `just` i uv. `requirements-dev.txt` jest zsynchronizowany |
| Dłuższy interwał healthchecka Dockera | **niezastosowane** | proces Pythona co 30 s jest tani |
| Wymiana httpx w testach (ostrzeżenie Starlette) | **niezastosowane** | TestClient dalej działa |

## Otwarte uwagi z review (nieblokujące)

Review zakończyło się werdyktem **APPROVED**. Te punkty warto domknąć przed merge do `main`:

| Uwaga | Sugestia |
| --- | --- |
| Przebudowa kalendarza `days_plus_week` była już w drzewie roboczym przed tym przeglądem. Dodaje walidację z odpowiedzią `422`, ale nie ma własnych testów | dodać testy odrzucenia w pytest i testy vitest dla `contentCount` i `isSimpleSection`, albo zacommitować ją osobno |
| README twierdzi, że pytest pokrywa układ `days`/`week` kalendarza, a testowany jest tylko payload przykładowy | poprawić zdanie albo dodać testy z punktu wyżej |
| Pierwszy deploy nowym `auto-update.sh` nie zostanie ponowiony, jeśli build się nie uda (brak pliku stanu) | przed `git pull` dodać `[ -f "$STATE_FILE" ] \|\| git rev-parse HEAD > "$STATE_FILE"` |
| Commit, który nigdy się nie buduje, jest przebudowywany co 10 minut bez limitu | pomijać commit po kilku nieudanych próbach albo opisać w README, jak zatrzymać pętlę |
| Wyjątek w `/api/health` (status 0) trafia do logu na DEBUG | warunek `0 < status < 400` |
| Komentarze `nosec` (B104, B310, B311, B608) nie mają powodu w tej samej linii. B608 jest już zbędny według bandit | przenieść powody do tej samej linii, usunąć zbędne B608 |

## Lepsze praktyki do rozważenia

- `main` deployuje się sam, więc warto włączyć branch protection z wymaganym zielonym CI.
- Przy następnej zmianie zależności warto rozważyć `uv export` do `requirements.txt` z pinami, żeby build na Pi był w pełni powtarzalny.
- `RETENTION_DAYS=90` w `.env` na Pi ogranicza rozmiar bazy na karcie SD.
- Okresowa kopia `dashboard.sqlite` z wolumenu (np. `docker compose cp`) chroni historię przed awarią karty SD.

## Wyniki sprawdzeń

| Sprawdzenie | Wynik |
| --- | --- |
| `just check` | **OK**: ruff check i format (36 plików), mypy bez błędów (36 plików), bandit (2 ostrzeżenia o zbędnym `nosec` B608), pytest 28 passed, `tsc -b` bez błędów, vitest 37 passed (4 pliki), vite build |
| `just check-pi-deps` (Python 3.12, aarch64, tylko koła) | **OK**: fastapi 0.162.0, pydantic 2.14.2, uvicorn 0.54.0, websockets 17.4. `requirements.txt` bez zmian |
| `npx tsc -b` (frontend) | **OK**: 0 błędów (wcześniej 30) |
| `json.tool .kiro/hooks/just-check-on-stop.json` | **OK**: poprawny JSON, jeden hook `Stop` |
| `bash -n scripts/auto-update.sh` (WSL) | **OK**: skrypt ma końcówki LF |

Zmienione pliki: 38 śledzonych (+1765, −251) i nowe: `.gitattributes`, `.kiro/`, 4 pliki vitest, `tests/test_middleware.py`, `tests/test_packaging.py`. **Nic nie zostało zacommitowane.** Do commita warto rozdzielić przebudowę kalendarza od reszty zmian.
