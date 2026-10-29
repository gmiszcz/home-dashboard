#!/usr/bin/env bash
set -euo pipefail

# Przejdz do glownego katalogu repozytorium
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Pobierz zmiany z brancha main bez pobierania zawartosci do drzewa roboczego
git fetch origin main --quiet

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[$(date -Iseconds)] Wykryto nowe commity na origin/main ($LOCAL_COMMIT -> $REMOTE_COMMIT)."
    echo "[$(date -Iseconds)] Pobieranie zmian..."
    git pull origin main
    
    echo "[$(date -Iseconds)] Przebudowywanie i restartowanie kontenera Docker..."
    docker compose up -d --build
    
    echo "[$(date -Iseconds)] Czyszczenie starych nieuzywanych obrazow..."
    docker image prune -f
    
    echo "[$(date -Iseconds)] Aktualizacja ukonczona sukcesem!"
else
    # Brak zmian, nic nie rob
    exit 0
fi
