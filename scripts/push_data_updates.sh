#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE=${LOCK_FILE:-/tmp/based-data-update.lock}
LOG_FILE=${LOG_FILE:-}
REPO_DIR=${REPO_DIR:-$(pwd)}

log(){
  local msg="[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
  echo "$msg"
  if [[ -n "$LOG_FILE" ]]; then
    echo "$msg" >> "$LOG_FILE"
  fi
}

log "Starting data branch update run."

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another data update is running; exiting."
  exit 0
fi

sleep $((RANDOM % 4))

cd "$REPO_DIR"

log "Fetching origin/data."
git fetch origin data

log "Switching to data branch."
git switch data 2>/dev/null || git switch -c data origin/data

log "Resetting working tree to origin/data."
git reset --hard origin/data

git clean -fd

log "Staging JSON payloads."
git add -A -- war.json war_detail.json members.json clan_stats.json cwl_current.json cwl_index.json

git add -A -- cwl_history/*.json cwl_rollups/*.json 2>/dev/null || true

if git diff --cached --quiet; then
  log "No JSON changes to commit."
  exit 0
fi

log "Committing JSON updates."
git commit -m "Update data JSON $(date -u +'%Y-%m-%dT%H:%M:%SZ')"

log "Pushing data branch."
git push origin data

log "Data branch update complete."
