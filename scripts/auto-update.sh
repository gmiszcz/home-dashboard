#!/usr/bin/env bash
set -euo pipefail

# Go to the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Fetch main without touching the working tree
git fetch origin main --quiet

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/main)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[$(date -Iseconds)] New commits on origin/main ($LOCAL_COMMIT -> $REMOTE_COMMIT)."
    echo "[$(date -Iseconds)] Pulling changes..."
    git pull origin main

    echo "[$(date -Iseconds)] Rebuilding and restarting the Docker container..."
    docker compose up -d --build

    echo "[$(date -Iseconds)] Pruning unused images..."
    docker image prune -f

    echo "[$(date -Iseconds)] Update finished."
else
    # No changes, nothing to do
    exit 0
fi
