set dotenv-load
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

port := env("PORT", "8000")
host := env("HOST", "0.0.0.0")

# Default: list the available recipes
default:
    @just --list

# Install backend (uv) and frontend (npm) dependencies and create .env
install:
    uv run python -c "import pathlib, shutil; p = pathlib.Path('.env'); p.exists() or shutil.copy('.env.example', p)"
    uv sync --extra dev
    npm --prefix frontend install

# Run both services in dev mode (FastAPI + Vite)
[parallel]
dev: dev-backend dev-frontend

# FastAPI dev server (backend)
dev-backend:
    uv run python -m uvicorn app.main:app --reload --http h11 --host {{host}} --port {{port}}

# Vite dev server (frontend)
dev-frontend:
    npm --prefix frontend run dev

# Run the ruff linter
lint:
    uv run ruff check app tests

# Run the pytest suite
test:
    uv run python -m pytest

# Build the production frontend
build:
    npm --prefix frontend run build

# Full check as in CI: lint + tests
check: lint test

# Run the server in production mode (FastAPI serves dist)
run:
    uv run python -m app

# Send a random set of sample data from samples/pool (different on every run)
sample:
    uv run python scripts/send_sample.py --random

# Fixed samples from samples/*.json, with timestamps shifted to now
sample-static:
    uv run python scripts/send_sample.py --fresh
