#!/usr/bin/env bash
# cleanup-agents.sh
# Daily cron. Removes worktrees and tmux sessions for tasks merged/failed > 7 days ago.
set -euo pipefail

CONTROL_API_URL="${CONTROL_API_URL:-http://localhost:3001}"

# Fetch all projects
PROJECTS=$(curl -s "${CONTROL_API_URL}/api/projects" | \
  python3 -c "import json,sys; [print(p['id']) for p in json.load(sys.stdin)]" 2>/dev/null || echo "")

for PROJECT_ID in $PROJECTS; do
  # Get tasks completed > 7 days ago that are merged or failed
  OLD_TASKS=$(curl -s "${CONTROL_API_URL}/api/projects/${PROJECT_ID}/tasks" | \
    python3 -c "
import json,sys
from datetime import datetime, timezone, timedelta
cutoff = datetime.now(timezone.utc) - timedelta(days=7)
tasks = json.load(sys.stdin)
for t in tasks:
    if t['status'] not in ('merged','failed'): continue
    completed = t.get('completed_at')
    if not completed: continue
    dt = datetime.fromisoformat(completed.replace('Z','+00:00'))
    if dt < cutoff:
        print(t['id'], t.get('worktree_path',''), t.get('tmux_session',''))
" 2>/dev/null || echo "")

  while IFS=' ' read -r TASK_ID WORKTREE_PATH TMUX_SESSION; do
    [ -z "$TASK_ID" ] && continue

    # Remove worktree
    if [ -n "$WORKTREE_PATH" ] && [ "$WORKTREE_PATH" != "null" ] && [ -d "$WORKTREE_PATH" ]; then
      REPO_PATH=$(dirname "$(dirname "$WORKTREE_PATH")")
      cd "$REPO_PATH" 2>/dev/null || true
      git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"
      echo "Removed worktree: $WORKTREE_PATH"
    fi

    # Kill tmux session if still present
    if [ -n "$TMUX_SESSION" ] && [ "$TMUX_SESSION" != "null" ]; then
      tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
    fi

    # Log cleanup event
    curl -s -X POST "${CONTROL_API_URL}/api/projects/${PROJECT_ID}/activity" \
      -H "Content-Type: application/json" \
      -d "{\"type\": \"cleanup\", \"task_id\": \"${TASK_ID}\"}" > /dev/null || true

  done <<< "$OLD_TASKS"
done

echo "cleanup-agents complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
