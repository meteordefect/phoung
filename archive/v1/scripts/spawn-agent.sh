#!/usr/bin/env bash
# spawn-agent.sh <project-id> <task-id> <description> <agent-type> <model> <repo-path> <repo-url> [task-type] [attach-dir]
# Called by task-runner.ts. Clones repo if missing, creates git worktree, tmux session, and launches the sub-agent.
set -euo pipefail

PROJECT_ID="$1"
TASK_ID="$2"
DESCRIPTION="$3"
AGENT_TYPE="$4"
MODEL="$5"
REPO_PATH="$6"
REPO_URL="$7"
TASK_TYPE="${8:-feature}"
ATTACH_DIR="${9:-}"

SHORT_ID="${TASK_ID:0:8}"
BRANCH="feat/task-${SHORT_ID}"
WORKTREE_PATH="$(dirname "$REPO_PATH")/worktrees/${PROJECT_ID:0:8}-${SHORT_ID}"
TMUX_SESSION="claw-${SHORT_ID}"

CONTROL_API_URL="${CONTROL_API_URL:-http://localhost:3001}"

update_status() {
  curl -s -X PATCH "${CONTROL_API_URL}/api/tasks/${TASK_ID}" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"$1\"}" > /dev/null || true
}

# --- 1. Clone repo if it doesn't exist yet ---
if [ ! -d "$REPO_PATH/.git" ]; then
  mkdir -p "$(dirname "$REPO_PATH")"
  git clone "$REPO_URL" "$REPO_PATH"
fi

# --- 2. Create git worktree ---
cd "$REPO_PATH"
DEFAULT_BRANCH="$(git remote show origin | awk '/HEAD branch/ {print $NF}')"
git fetch origin "$DEFAULT_BRANCH" --quiet
git worktree add "$WORKTREE_PATH" -b "$BRANCH" "origin/${DEFAULT_BRANCH}" --quiet 2>/dev/null || \
  git worktree add "$WORKTREE_PATH" "$BRANCH" --quiet

cd "$WORKTREE_PATH"

# --- Copy attachments into worktree ---
ATTACHMENT_LIST=""
if [ -n "$ATTACH_DIR" ] && [ -d "$ATTACH_DIR" ]; then
  ATTACH_DEST="${WORKTREE_PATH}/.task-attachments"
  mkdir -p "$ATTACH_DEST"
  cp "$ATTACH_DIR"/* "$ATTACH_DEST"/ 2>/dev/null || true
  for f in "$ATTACH_DEST"/*; do
    [ -f "$f" ] && ATTACHMENT_LIST="${ATTACHMENT_LIST}\n- .task-attachments/$(basename "$f")"
  done
fi

# Install deps if package.json present and node_modules absent
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
  npm install --silent 2>/dev/null || true
fi

update_status "coding"

# --- 2. Build prompt ---
CONTEXT_FILE="$(dirname "$REPO_PATH")/context/${PROJECT_ID:0:8}/README.md"
PROJECT_CONTEXT=""
if [ -f "$CONTEXT_FILE" ]; then
  PROJECT_CONTEXT="$(cat "$CONTEXT_FILE")"
fi

# --- Task-type-specific instructions ---
case "$TASK_TYPE" in
  bugfix)
    TASK_INSTRUCTIONS="- Identify the root cause before writing any fix.
- Make the minimal change required to fix the bug.
- Do NOT refactor surrounding code while fixing.
- If a test exists for this area, run it to confirm the fix.
- Commit message format: fix: <what was broken>"
    ;;
  refactor)
    TASK_INSTRUCTIONS="- Do NOT change observable behavior — inputs and outputs must stay the same.
- Run all existing tests before and after to confirm nothing breaks.
- Focus on readability, naming, and structure — not features.
- Commit message format: refactor: <what was improved>"
    ;;
  test)
    TASK_INSTRUCTIONS="- Add or improve test coverage as described.
- Do NOT modify production/source code — tests only.
- Cover edge cases and failure modes, not just happy paths.
- Commit message format: test: <what is now covered>"
    ;;
  docs)
    TASK_INSTRUCTIONS="- Update documentation files only (README, docs/, inline JSDoc/docstrings).
- Do NOT modify any application code.
- Commit message format: docs: <what was documented>"
    ;;
  *)
    TASK_INSTRUCTIONS="- Make all necessary code changes to complete the task.
- Add tests if the change introduces new behavior.
- Commit message format: feat: <what was added>"
    ;;
esac

ATTACH_SECTION=""
if [ -n "$ATTACHMENT_LIST" ]; then
  ATTACH_SECTION="
Attached context files (read these before starting):
$(echo -e "$ATTACHMENT_LIST")
"
fi

PROMPT="You are a coding agent working in the git repository at: $(pwd)

Your task:
${DESCRIPTION}
${ATTACH_SECTION}
Project context:
${PROJECT_CONTEXT}

Instructions:
- Work in the current directory only.
${TASK_INSTRUCTIONS}
- Run tests if a test command is available (e.g. npm test, pytest).
- Commit your changes with a clear commit message.
- After committing, run: gh pr create --title \"${DESCRIPTION:0:72}\" --body \"Automated PR by Phoung task ${TASK_ID}\" --base ${DEFAULT_BRANCH}
- When done, exit.

Constraints — do NOT violate these:
- Do NOT modify Dockerfile, docker-compose.yml, or any file under deploy/, nginx/, terraform/, or ansible/.
- Do NOT add, remove, or upgrade dependencies unless the task explicitly requires it.
- Do NOT rewrite or refactor files unrelated to the task description.
- Do NOT change CI/CD configuration, environment variables, or secrets.
- Do NOT modify git configuration or branch settings.
- Do NOT run gh pr merge under any circumstances. Your job ends at gh pr create."

# --- 3. Launch in tmux ---
tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 50 2>/dev/null || true

case "$AGENT_TYPE" in
  claude)
    CLAUDE_MODEL="${MODEL:-claude-sonnet-4-5}"
    tmux send-keys -t "$TMUX_SESSION" \
      "claude --model ${CLAUDE_MODEL} --dangerously-skip-permissions -p $(printf '%q' "$PROMPT") && tmux kill-session -t ${TMUX_SESSION}" Enter
    ;;
  codex)
    CODEX_MODEL="${MODEL:-gpt-4o}"
    tmux send-keys -t "$TMUX_SESSION" \
      "codex --model ${CODEX_MODEL} --dangerously-bypass-approvals-and-sandbox $(printf '%q' "$PROMPT") && tmux kill-session -t ${TMUX_SESSION}" Enter
    ;;
  kimi)
    # Kimi K2.5 via OpenClaw thin wrapper
    tmux send-keys -t "$TMUX_SESSION" \
      "OPENCLAW_MODEL=${MODEL:-kimi-k2.5} openclaw-run $(printf '%q' "$PROMPT") && tmux kill-session -t ${TMUX_SESSION}" Enter
    ;;
  glm)
    # GLM 4.7 (ZhipuAI) via OpenClaw thin wrapper
    tmux send-keys -t "$TMUX_SESSION" \
      "OPENCLAW_MODEL=${MODEL:-glm-4-flash} openclaw-run $(printf '%q' "$PROMPT") && tmux kill-session -t ${TMUX_SESSION}" Enter
    ;;
  *)
    echo "Unknown agent type: $AGENT_TYPE" >&2
    update_status "failed"
    exit 1
    ;;
esac

echo "Spawned ${AGENT_TYPE} agent in tmux session ${TMUX_SESSION} on branch ${BRANCH}"
