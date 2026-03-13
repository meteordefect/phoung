#!/bin/bash
set -e

cd /workspace

echo "$PROMPT_B64" | base64 -d > /tmp/prompt.txt
PROMPT="$(cat /tmp/prompt.txt)"

git config user.name "Phoung Agent"
git config user.email "agent@phoung.local"

PI_FLAGS="--no-session"
if [ -n "$SUBAGENT_MODEL" ]; then
    PI_FLAGS="$PI_FLAGS --model $SUBAGENT_MODEL"
fi

pi -p $PI_FLAGS "$PROMPT"

git add -A
if git diff --cached --quiet; then
    echo "No changes made by agent"
    exit 0
fi

git commit -m "task($TASK_ID): automated changes"
