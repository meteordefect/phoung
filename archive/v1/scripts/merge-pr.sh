#!/usr/bin/env bash
# merge-pr.sh <pr-number> <repo-url> <task-id> <project-id>
# Squash-merges a PR, updates task status, logs event.
set -euo pipefail

PR_NUMBER="$1"
REPO_URL="$2"
TASK_ID="$3"
PROJECT_ID="$4"

CONTROL_API_URL="${CONTROL_API_URL:-http://localhost:3001}"

# Resolve repo owner/name from URL (supports both SSH and HTTPS)
REPO_SLUG=$(echo "$REPO_URL" | sed 's|.*github.com[:/]||' | sed 's|\.git$||')

echo "Merging PR #${PR_NUMBER} in ${REPO_SLUG}..."

gh pr merge "$PR_NUMBER" --repo "$REPO_SLUG" --squash --delete-branch

echo "PR #${PR_NUMBER} merged."

# Fetch task details to find worktree
TASK=$(curl -s "${CONTROL_API_URL}/api/tasks/${TASK_ID}")
WORKTREE_PATH=$(echo "$TASK" | python3 -c "import json,sys; print(json.load(sys.stdin).get('worktree_path') or '')" 2>/dev/null || echo "")
TMUX_SESSION=$(echo "$TASK"  | python3 -c "import json,sys; print(json.load(sys.stdin).get('tmux_session') or '')" 2>/dev/null || echo "")

# Update task status
curl -s -X PATCH "${CONTROL_API_URL}/api/tasks/${TASK_ID}" \
  -H "Content-Type: application/json" \
  -d '{"status":"merged","ci_status":"passing"}' > /dev/null || true

# Log merge event
curl -s -X POST "${CONTROL_API_URL}/api/projects/${PROJECT_ID}/activity" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"merged\",\"task_id\":\"${TASK_ID}\",\"data\":{\"pr_number\":${PR_NUMBER}}}" > /dev/null || true

# Clean up tmux session
if [ -n "$TMUX_SESSION" ]; then
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true
fi

# Clean up worktree
if [ -n "$WORKTREE_PATH" ] && [ -d "$WORKTREE_PATH" ]; then
  REPO_DIR=$(git -C "$WORKTREE_PATH" rev-parse --git-common-dir 2>/dev/null | xargs dirname 2>/dev/null || echo "")
  if [ -n "$REPO_DIR" ]; then
    git -C "$REPO_DIR" worktree remove "$WORKTREE_PATH" --force 2>/dev/null || rm -rf "$WORKTREE_PATH"
  fi
fi

echo "merge-pr.sh complete for PR #${PR_NUMBER}"
