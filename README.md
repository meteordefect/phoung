# Phoung

Phoung is your project manager for coding work. You chat with Phoung in a review dashboard. Phoung creates coding tasks, spawns sub-agents in gVisor-sandboxed containers, and opens merge requests for your approval.

## How It Works

1. You send a request in the review UI.
2. Phoung breaks it down and spawns a coding sub-agent in an isolated Docker container with the repo mounted in.
3. The sub-agent makes changes, commits, and the host pushes a branch and opens a PR.
4. You review, approve, and merge from the UI.

All state is file-based (markdown with YAML frontmatter). No database.

## Architecture

```
┌──────────────────────┐
│  Review UI (React)   │  ◄── You interact here
├──────────────────────┤
│  Nginx reverse proxy │  ◄── Single entrypoint on :8080
├──────────────────────┤
│  Phoung API (Express)│  ◄── Chat, tasks, PRs, SSE stream
├──────────┬───────────┤
│ memory/  │  repos/   │  ◄── File-based state + local repo clones
├──────────┴───────────┤
│  Sub-agents (gVisor) │  ◄── Sandboxed coding workers with mounted workspaces
└──────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details on context engineering, modules, API surface, UI layout, security model, and deployment infrastructure.

## Setup

### Prerequisites

- Linux VPS (Ubuntu 22.04+ for gVisor support)
- Ansible 2.15+ on your local machine
- SSH access to the server (key-based)
- At least one LLM API key (Kimi, ZAI/GLM, or Anthropic)
- GitHub personal access token

### Configure

```bash
cp .env.example .env
```

Set at least one LLM API key and `GITHUB_TOKEN`. See `.env.example` for all options.

### Deploy

```bash
cd deploy
cp ansible/inventory.ini.example ansible/inventory.ini
# Edit inventory.ini — set your server IP

./deploy.sh deploy-v2
```

### Access

```bash
cd deploy
./deploy.sh tunnel
```

Open `http://localhost:8080`.

### Local Dev

```bash
docker compose up -d
```

Set `SUBAGENT_RUNTIME=runc` in `.env` to skip gVisor locally.

## Secret Safety

- Keep credentials only in `.env`, never in tracked files.
- `.gitignore` excludes `.env` and `.env.*` except explicit examples.
- Before pushing:

```bash
git diff --cached | rg -n "sk-|github_pat_|AKIA|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|API_KEY=|TOKEN="
```

## Stack

TypeScript, Express, React, Vite, Tailwind, Docker, gVisor, pi-mono SDK, Ansible.
