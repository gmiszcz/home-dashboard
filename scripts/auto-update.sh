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

echo "[$(date -Iseconds)] New commits on origin/main ($DEPLOYED_COMMIT -> $REMOTE_COMMIT)."
echo "[$(date -Iseconds)] Pulling changes..."
git pull --ff-only origin main

echo "[$(date -Iseconds)] Rebuilding and restarting the Docker container..."
# A failed build exits here (set -e). The state file is not updated, so the next run retries.
docker compose up -d --build
echo "$REMOTE_COMMIT" > "$STATE_FILE"

echo "[$(date -Iseconds)] Pruning unused images..."
docker image prune -f

echo "[$(date -Iseconds)] Update finished."
