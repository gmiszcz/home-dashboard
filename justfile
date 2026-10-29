set dotenv-load
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

port := env("PORT", "8000")
host := env("HOST", "0.0.0.0")

# Domyslna akcja: lista dostepnych komend
default:
    @just --list

# Pelna instalacja zaleznosci backendu (uv) i frontendu (npm) oraz utworzenie .env
install:
    uv run python -c "import pathlib, shutil; p = pathlib.Path('.env'); p.exists() or shutil.copy('.env.example', p)"
    uv sync --extra dev
    npm --prefix frontend install

# Uruchomienie obu serwisow naraz w trybie dev (FastAPI + Vite)
[parallel]
dev: dev-backend dev-frontend

# Dev serwer FastAPI (backend)
dev-backend:
    uv run python -m uvicorn app.main:app --reload --host {{host}} --port {{port}}

# Dev serwer Vite (frontend)
dev-frontend:
    npm --prefix frontend run dev

# Uruchomienie testow pytest
test:
    uv run python -m pytest

# Zbudowanie frontendu produkcyjnego
build:
    npm --prefix frontend run build

# Uruchomienie serwera w trybie produkcyjnym (FastAPI serwuje dist)
run:
    uv run python -m app

# Wylanie przykladowych danych do bazy
sample:
    uv run python scripts/send_sample.py --fresh
