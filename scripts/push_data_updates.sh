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

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Another data update is running; exiting."
  exit 0
fi

cd "$REPO_DIR"

git fetch origin data

git switch data

git reset --hard origin/data

git clean -fd

# JSON files should be generated before running this script.

git add -- '*.json' 'cwl_history/*.json' 'cwl_rollups/*.json'

if git diff --cached --quiet; then
  log "No JSON changes to commit."
  exit 0
fi

git commit -m "Update data JSON $(date -u +'%Y-%m-%dT%H:%M:%SZ')"

git push origin data
