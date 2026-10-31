#!/usr/bin/env bash
set -euo pipefail

# Image published by .github/workflows/ci.yml. Keep in sync with docker-compose.yml.
IMAGE_REPO="ghcr.io/gmiszcz/home-dashboard"

log() {
    echo "[$(date -Iseconds)] $*"
}

# Print the value of KEY from .env. Prints nothing when the file or key is absent.
# Does not execute the file.
dotenv_get() {
    local key="$1"
    local file="${2:-.env}"
    local line
    [ -f "$file" ] || return 0
    line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}=" "$file" | tail -n 1 || true)
    [ -n "$line" ] || return 0
    line=${line#*=}
    line=${line%$'\r'}
    if [ "${line#\"}" != "$line" ] && [ "${line%\"}" != "$line" ]; then
        line=${line#\"}
        line=${line%\"}
    elif [ "${line#\'}" != "$line" ] && [ "${line%\'}" != "$line" ]; then
        line=${line#\'}
        line=${line%\'}
    fi
    printf '%s' "$line"
}

# A local chmod (644 in git, 755 on disk, staged or not) is a modification,
# so pull refuses to update that path. When the blob still matches HEAD, the
# edit is only the mode bit: put the tracked mode back on paths this update
# will overwrite. Any other local edit is left in place, and pull still stops
# for those.
discard_mode_only_changes() {
    local remote_commit="$1"
    local path head_blob index_blob work_blob
    while IFS= read -r -d '' path; do
        if git diff --quiet HEAD "$remote_commit" -- "$path"; then
            continue
        fi
        if [ -L "$path" ] || [ ! -f "$path" ]; then
            continue
        fi
        head_blob=$(git rev-parse "HEAD:${path}")
        index_blob=$(git rev-parse ":${path}")
        work_blob=$(git hash-object -- "$path")
        if [ "$head_blob" = "$index_blob" ] && [ "$head_blob" = "$work_blob" ]; then
            log "Discarding file-mode-only local change: $path"
            git restore --source=HEAD --staged --worktree -- "$path"
        fi
    done < <(
        {
            git diff -z --name-only --diff-filter=M HEAD
            git diff -z --name-only --cached --diff-filter=M
        } | sort -zu
    )
}

manifest_file_has_armv7() {
    local manifest="$1"
    if command -v python3 >/dev/null 2>&1; then
        if python3 - "$manifest" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        data = json.load(handle)
except (OSError, json.JSONDecodeError):
    sys.exit(1)

manifests = data.get("manifests")
if isinstance(manifests, list):
    for item in manifests:
        platform = item.get("platform") or {}
        if (
            platform.get("os", "linux") == "linux"
            and platform.get("architecture") == "arm"
            and platform.get("variant") == "v7"
        ):
            sys.exit(0)
sys.exit(1)
PY
        then
            return 0
        fi
        return 1
    fi
    grep -q '"architecture": *"arm"' "$manifest" && grep -q '"variant": *"v7"' "$manifest"
}

# One word on stdout: ready, waiting, incomplete.
# waiting = CI has not published it yet, the package is private, or the registry
# could not be reached. incomplete = a manifest exists but has no linux/arm/v7.
ghcr_image_state() {
    local tag="$1"
    local image="${IMAGE_REPO}:${tag}"
    local repo="gmiszcz/home-dashboard"
    local body token code
    body=$(mktemp)
    # shellcheck disable=SC2064
    trap 'rm -f "$body"' RETURN

    if command -v curl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
        if token=$(
            curl -fsSL --retry 2 --max-time 30 \
                "https://ghcr.io/token?service=ghcr.io&scope=repository:${repo}:pull" \
                | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))'
        ) && [ -n "$token" ]; then
            code=$(curl -sS --max-time 30 -o "$body" -w "%{http_code}" \
                -H "Authorization: Bearer ${token}" \
                -H "Accept: application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json" \
                "https://ghcr.io/v2/${repo}/manifests/${tag}" || true)
            code=${code//$'\r'/}
            if [ "$code" = "200" ]; then
                if manifest_file_has_armv7 "$body"; then
                    echo ready
                else
                    echo incomplete
                fi
                return 0
            fi
        fi
    fi

    # Anonymous GHCR reads fail for a missing tag and for a private package.
    # A Pi that has run `docker login ghcr.io` can still see a private image.
    if DOCKER_CLI_EXPERIMENTAL=enabled docker manifest inspect "$image" >"$body" 2>/dev/null; then
        if manifest_file_has_armv7 "$body"; then
            echo ready
        else
            echo incomplete
        fi
        return 0
    fi

    echo waiting
}

prune_images() {
    local keep_tag="$1"
    local ref tag legacy
    docker image prune -f
    legacy="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}-dashboard:latest"
    docker rmi "$legacy" >/dev/null 2>&1 || true
    while IFS= read -r ref; do
        [ -n "$ref" ] || continue
        tag="${ref##*:}"
        if [ "$tag" = "$keep_tag" ] || [ "$tag" = "latest" ] || [ "$tag" = "<none>" ]; then
            continue
        fi
        docker rmi "$ref" >/dev/null 2>&1 || true
    done < <(docker image ls "$IMAGE_REPO" --format '{{.Repository}}:{{.Tag}}')
}

main() {
    local script_dir repo_dir state_file remote_commit deployed_commit
    local build_locally node_options state

    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    repo_dir="$(dirname "$script_dir")"
    cd "$repo_dir"

    # Last commit that was started successfully. Lives inside .git, so it is never tracked.
    state_file="$(git rev-parse --git-dir)/home-dashboard-deployed"

    if [ -z "${AUTO_UPDATE_BUILD_LOCALLY+x}" ]; then
        AUTO_UPDATE_BUILD_LOCALLY=$(dotenv_get AUTO_UPDATE_BUILD_LOCALLY || true)
    fi
    case "${AUTO_UPDATE_BUILD_LOCALLY:-}" in
        1 | true | TRUE | yes | YES | on | ON) build_locally=1 ;;
        *) build_locally=0 ;;
    esac

    # Fetch main without touching the working tree.
    git fetch origin main --quiet

    remote_commit=$(git rev-parse origin/main)
    if [ -f "$state_file" ]; then
        deployed_commit=$(cat "$state_file")
    else
        deployed_commit=$(git rev-parse HEAD)
    fi

    if [ "$deployed_commit" = "$remote_commit" ]; then
        # Nothing new since the last successful deploy.
        exit 0
    fi

    log "New commits on origin/main ($deployed_commit -> $remote_commit)."
    discard_mode_only_changes "$remote_commit"

    # Record the commit we are leaving before pull moves HEAD. A later exit
    # (image not published yet) must still retry, and without this file the
    # next run would treat the pulled HEAD as already deployed.
    if [ ! -f "$state_file" ]; then
        printf '%s\n' "$deployed_commit" >"$state_file"
    fi

    log "Pulling changes..."
    git pull --ff-only origin main

    if [ "$build_locally" -eq 1 ]; then
        if [ -z "${NODE_OPTIONS:-}" ]; then
            node_options=$(dotenv_get NODE_OPTIONS || true)
            if [ -n "$node_options" ]; then
                NODE_OPTIONS=$node_options
            else
                # Pi Zero 2 W has about 426 MB RAM. 900 (the image default) does not fit.
                NODE_OPTIONS="--max-old-space-size=256"
            fi
        fi
        export NODE_OPTIONS
        log "AUTO_UPDATE_BUILD_LOCALLY is set. Building here with NODE_OPTIONS=${NODE_OPTIONS}."
        # A failed build exits here (set -e). The state file stays on the previous commit.
        env -u COMPOSE_FILE -u COMPOSE_PATH_SEPARATOR \
            DOCKER_BUILDKIT=1 \
            COMPOSE_DOCKER_CLI_BUILD=1 \
            NODE_OPTIONS="$NODE_OPTIONS" \
            DASHBOARD_TAG=latest \
            docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    else
        state=$(ghcr_image_state "$remote_commit" || true)
        case "$state" in
            ready) ;;
            incomplete)
                log "Image ${IMAGE_REPO}:${remote_commit} has no linux/arm/v7. Not deploying."
                exit 1
                ;;
            *)
                log "Image ${IMAGE_REPO}:${remote_commit} is not pullable yet. CI may still be publishing it, or the GHCR package is private."
                log "The running container is unchanged. The next timer run retries."
                log "If CI is already green: make the package public (package settings → Change visibility → Public), or on this Pi run: docker login ghcr.io -u gmiszcz"
                exit 0
                ;;
        esac

        log "Pulling ${IMAGE_REPO}:${remote_commit} and restarting (no build)..."
        env -u COMPOSE_FILE -u COMPOSE_PATH_SEPARATOR \
            DASHBOARD_TAG="$remote_commit" \
            docker compose -f docker-compose.yml pull dashboard
        env -u COMPOSE_FILE -u COMPOSE_PATH_SEPARATOR \
            DASHBOARD_TAG="$remote_commit" \
            docker compose -f docker-compose.yml up -d --no-build dashboard
    fi

    printf '%s\n' "$remote_commit" >"$state_file"

    log "Pruning unused images..."
    prune_images "$remote_commit"

    log "Update finished."
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
