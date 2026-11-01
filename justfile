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

# Ruff lint and format check
lint:
    uv run --no-sync ruff check app tests scripts
    uv run --no-sync ruff format --check app tests scripts

# Auto-fix ruff lint findings and reformat
fix:
    uv run --no-sync ruff check --fix app tests scripts
    uv run --no-sync ruff format app tests scripts

# Run the pytest suite
test:
    uv run --no-sync python -m pytest

# Build the production frontend
build:
    npm --prefix frontend run build

# Build the image on this machine and start it. The Pi pulls GHCR instead.
docker:
    DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Backend: ruff, mypy, bandit, pytest
check-backend: lint
    uv run --no-sync python -m mypy app tests scripts
    uv run --no-sync python -m bandit -q -r app scripts
    uv run --no-sync python -m pytest

# Frontend: TypeScript, vitest, production build
check-frontend:
    npm --prefix frontend run typecheck
    npm --prefix frontend run test
    npm --prefix frontend run build

# Everything CI runs. Run it at the end of every change
check: check-backend check-frontend

# Confirm runtime dependencies have aarch64 wheels (needs network).
# uv has no armv7 target; the CI image build checks linux/arm/v7 for the Pi.
check-pi-deps:
    uv pip compile requirements.txt --python-version 3.12 --python-platform aarch64-unknown-linux-gnu --only-binary :all: --quiet --no-header

# Run the server in production mode (FastAPI serves dist)
run:
    uv run python -m app

# Send a random set of sample data from samples/pool (different on every run)
sample:
    uv run python scripts/send_sample.py --random

# Fixed samples from samples/*.json, with timestamps shifted to now
sample-static:
    uv run python scripts/send_sample.py --fresh
