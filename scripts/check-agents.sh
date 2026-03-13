#!/usr/bin/env bash
# check-agents.sh
# Polls active tasks, checks tmux sessions + GitHub PRs, updates statuses.
# Run every 5 minutes via cron or task-runner.ts setInterval.
set -euo pipefail

CONTROL_API_URL="${CONTROL_API_URL:-http://localhost:3001}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

notify() {
  local msg="$1"
  if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}&text=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$msg")" > /dev/null || true
  fi
}

api_patch() {
  local path="$1"
  local body="$2"
  curl -s -X PATCH "${CONTROL_API_URL}${path}" \
    -H "Content-Type: application/json" \
    -d "$body" > /dev/null || true
}

# Fetch all active tasks (not merged/failed)
TASKS=$(curl -s "${CONTROL_API_URL}/api/projects" | \
  python3 -c "
import json,sys
projects = json.load(sys.stdin)
print(' '.join(p['id'] for p in projects))
" 2>/dev/null || echo "")

for PROJECT_ID in $TASKS; do
  ACTIVE=$(curl -s "${CONTROL_API_URL}/api/projects/${PROJECT_ID}/tasks" | \
    python3 -c "
import json,sys
tasks = json.load(sys.stdin)
active = [t for t in tasks if t['status'] not in ('merged','failed','pending')]
for t in active:
    print(t['id'], t['status'], t.get('tmux_session',''), t.get('pr_number',''), t.get('repo_url',''), t['title'][:50])
" 2>/dev/null || echo "")

  while IFS=' ' read -r TASK_ID STATUS TMUX_SESSION PR_NUMBER REPO_URL TITLE; do
    [ -z "$TASK_ID" ] && continue

    # --- Check if tmux session is alive ---
    SESSION_ALIVE=false
    if [ -n "$TMUX_SESSION" ] && tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
      SESSION_ALIVE=true
    fi

    # --- Check for PR if not yet recorded ---
    if [ "$STATUS" = "spawned" ] || [ "$STATUS" = "coding" ]; then
      SHORT_ID="${TASK_ID:0:8}"
      BRANCH="feat/task-${SHORT_ID}"

      PR_JSON=$(gh pr list --head "$BRANCH" --json number,url,title,statusCheckRollup 2>/dev/null || echo "[]")
      PR_COUNT=$(echo "$PR_JSON" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

      if [ "$PR_COUNT" -gt "0" ]; then
        PR_NUM=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(d['number'])" 2>/dev/null || echo "")
        PR_URL=$(echo "$PR_JSON" | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(d['url'])" 2>/dev/null || echo "")

        if [ -n "$PR_NUM" ]; then
          curl -s -X PATCH "${CONTROL_API_URL}/api/tasks/${TASK_ID}" \
            -H "Content-Type: application/json" \
            -d "{\"pr_number\": ${PR_NUM}, \"pr_url\": \"${PR_URL}\", \"status\": \"pr_open\"}" > /dev/null || true
          notify "Phoung: PR #${PR_NUM} opened for task: ${TITLE}"
          STATUS="pr_open"
          PR_NUMBER="$PR_NUM"
        fi
      elif [ "$SESSION_ALIVE" = "false" ]; then
        # Session dead, no PR → failed
        RETRIES=$(curl -s "${CONTROL_API_URL}/api/tasks/${TASK_ID}" | \
          python3 -c "import json,sys; print(json.load(sys.stdin).get('spawn_retries',0))" 2>/dev/null || echo "0")

        if [ "$RETRIES" -lt "3" ]; then
          curl -s -X POST "${CONTROL_API_URL}/api/tasks/${TASK_ID}/retry" > /dev/null || true
        else
          api_patch "/api/tasks/${TASK_ID}" '{"status":"failed"}'
        fi
        continue
      fi
    fi

    # --- Check CI status for open PRs ---
    if [ "$STATUS" = "pr_open" ] && [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
      CI_STATUS=$(gh pr checks "$PR_NUMBER" --json state 2>/dev/null | \
        python3 -c "
import json,sys
checks = json.load(sys.stdin)
if not checks: print('pending'); sys.exit()
states = [c['state'] for c in checks]
if all(s == 'SUCCESS' for s in states): print('passing')
elif any(s == 'FAILURE' for s in states): print('failing')
else: print('pending')
" 2>/dev/null || echo "pending")

      NEW_STATUS="ci_pending"
      if [ "$CI_STATUS" = "passing" ]; then NEW_STATUS="review"; fi
      if [ "$CI_STATUS" = "failing" ]; then NEW_STATUS="pr_open"; fi

      curl -s -X PATCH "${CONTROL_API_URL}/api/tasks/${TASK_ID}" \
        -H "Content-Type: application/json" \
        -d "{\"ci_status\": \"${CI_STATUS}\", \"status\": \"${NEW_STATUS}\"}" > /dev/null || true

      if [ "$CI_STATUS" = "passing" ]; then
        notify "Phoung: PR #${PR_NUMBER} is ready for review — ${TITLE}"
      fi
    fi

  done <<< "$ACTIVE"
done

echo "check-agents complete: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
