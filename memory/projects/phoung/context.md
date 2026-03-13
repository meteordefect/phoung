# DevOpsTasks — Project Context

## What is this
DevOpsTasks — AI agent orchestration platform. A main Pi agent manages tasks, spawns Docker sub-agents to write code, and presents results in a Review UI for human approval.

## Tech stack
- Python 3.12 (FastAPI) for the API backend
- React + Vite + Tailwind for the Review UI
- Docker for sub-agent containers
- Nginx as reverse proxy
- .md files for all state (no database)
- GitHub PRs as the code review interface

## Repo
github.com/marten/phoung

## Key files
- /main-agent/agent.py — core agent loop
- /main-agent/api.py — FastAPI backend for Review UI
- /main-agent/memory.py — .md file read/write
- /main-agent/spawner.py — Docker sub-agent launcher
- /review-ui/src/App.tsx — React frontend
- /docker-compose.yml — service definitions
- /memory/ — all state files

## Architecture
- Main agent (Phoung) receives messages via chat or cron
- Phoung reads .md memory files for context
- Phoung spawns Docker sub-agents for coding tasks
- Sub-agents clone repos, run AI coding tools, push branches, open PRs
- Review UI shows tasks, diffs, merge/reject buttons
- Human (Marten) reviews and merges — Phoung never merges

## Current priorities
1. Complete v2 build and deploy
2. Test end-to-end flow: chat → task → sub-agent → PR → review → merge
