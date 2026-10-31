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

# A local chmod (644 in git, 755 on disk, staged or not) is a modification,
# so pull refuses to update that path. When the blob still matches HEAD, the
# edit is only the mode bit: put the tracked mode back on paths this update
# will overwrite. Any other local edit is left in place, and pull still stops
# for those.
while IFS= read -r -d '' path; do
    if git diff --quiet HEAD "$REMOTE_COMMIT" -- "$path"; then
        continue
    fi
    if [ -L "$path" ] || [ ! -f "$path" ]; then
        continue
    fi
    head_blob=$(git rev-parse "HEAD:${path}")
    index_blob=$(git rev-parse ":${path}")
    work_blob=$(git hash-object -- "$path")
    if [ "$head_blob" = "$index_blob" ] && [ "$head_blob" = "$work_blob" ]; then
        echo "[$(date -Iseconds)] Discarding file-mode-only local change: $path"
        git restore --source=HEAD --staged --worktree -- "$path"
    fi
done < <(
    {
        git diff -z --name-only --diff-filter=M HEAD
        git diff -z --name-only --cached --diff-filter=M
    } | sort -zu
)

echo "[$(date -Iseconds)] Pulling changes..."
git pull --ff-only origin main

echo "[$(date -Iseconds)] Rebuilding and restarting the Docker container..."
# A failed build exits here (set -e). The state file is not updated, so the next run retries.
docker compose up -d --build
echo "$REMOTE_COMMIT" > "$STATE_FILE"

echo "[$(date -Iseconds)] Pruning unused images..."
docker image prune -f

echo "[$(date -Iseconds)] Update finished."
