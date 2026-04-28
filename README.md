# Phuong

**Phuong** is a hosted AI project manager built on a fork of [Cline Kanban](https://github.com/cline/kanban). You use a secure web dashboard to chat with **Phuong** (orchestration and planning), run **per-project agent chats** (worker CLIs in isolated git worktrees), and manage multiple repositories from one runtime. The live service is at [beta.friendlabs.ai](https://beta.friendlabs.ai).

This repository contains the **Kanban application** (`kanban/`), **deployment** assets (`deploy/`), **product documentation** (`docs/`), and an **archived v1 stack** (`archive/v1/`).

## Overview

- **Projects** — Add one or more git repositories; the UI is organized around projects and agent chat sessions, not a classic kanban board view.
- **Agent chats** — Each chat maps to an internal board “task” (backlog / in progress / review / trash). Starting a chat creates an ephemeral **worktree** and runs your chosen CLI agent (for example **Cline**, **Claude Code**, **Codex**, or **Pi**) in a **terminal session** streamed to the browser over **WebSockets**.
- **Phuong** — A manager-style chat panel (SSE at `/api/phuong/chat`, plus tRPC under `/api/trpc/`) for cross-project planning, task tools, and (when configured) memory-aware context.
- **Git workflow** — Commit / open-PR flows, diff review, optional **MCP** integration for Cline, **script shortcuts**, and a **git history** surface are inherited from the Kanban base.

Internal board columns and task cards still power persistence and hooks, but the primary experience is **projects + chats + Phuong**, similar in spirit to an IDE with a side orchestration agent.

## Features

| Area | What you get |
|------|----------------|
| **Multi-project** | Switch between registered git repos; counts and navigation in the sidebar. |
| **Concurrent agent sessions** | Multiple chats per project; each session has its own worktree and terminal process where supported. |
| **Agent choice** | Configurable per runtime; launch support in code for **cline**, **claude**, **codex**, and **pi** (see `kanban/src/core/agent-catalog.ts`). |
| **Phuong manager** | Planning chat, tool use against the board, model selection, session list/resume (tRPC + streaming API). |
| **Auth (hosted)** | **Clerk** — JWT verification on HTTP and WebSocket when `CLERK_SECRET_KEY` is set; local dev can run without it. |
| **Observability** | **Sentry** (server and client), optional **PostHog** in the web UI. |
| **Operator deploy** | **Ansible** playbooks, **nginx**, **TLS**, **systemd** for VPS-style hosting (see `deploy/`). |

## Tech stack

| Layer | Technologies |
|--------|----------------|
| **Runtime** | Node.js **≥ 20**, TypeScript, **tRPC** (`@trpc/server` / client), **WebSocket** (`ws`), **node-pty** |
| **Agents** | **@clinebot/core**, **@clinebot/agents**, **@clinebot/llms** + local `kanban/src/cline-sdk/`; **@mariozechner/pi-coding-agent** for Pi; CLI detection for other agents |
| **Web UI** | React 18, **Vite** 6, **Tailwind CSS** 4, **Radix UI**, **xterm.js**, **@trpc/client** |
| **Auth** | **@clerk/backend** (server), **@clerk/react** (browser) |
| **Validation / API** | **Zod**, **Sinclair TypeBox** |
| **Tooling** | **Biome**, **Vitest**, **Playwright** (e2e in `web-ui`) |

## Installation (development)

From the repository root:

```bash
cd kanban
npm install
npm run install:all
npm run build
```

Requirements:

- **Node.js ≥ 20**
- For a full UI + server build, the `build` step compiles the server and copies `web-ui/dist` into `dist/web-ui`.

### Run the app locally

**Development (recommended): two processes**

1. **Runtime (API + WebSocket)** — default `http://127.0.0.1:3484`:

```bash
cd kanban
npm run dev
```

2. **Vite dev server** for the UI (hot reload) — `http://127.0.0.1:4173` with `/api` **proxied** to the runtime on 3484:

```bash
cd kanban
npm run web:dev
```

Open **http://127.0.0.1:4173** in the browser so API and WebSocket calls hit the proxy.

**Single process (embedded UI):** after `npm run build`, the CLI can serve the built assets from `dist/web-ui`:

```bash
cd kanban
npx tsx src/cli.ts
```

Open **http://127.0.0.1:3484** (or the URL printed by the CLI). If the server reports missing web UI assets, run `npm run build` in `kanban/` first.

### Tests and quality

```bash
cd kanban
npm run check    # lint + typecheck + unit tests (server)
npm run web:test # web-ui unit tests
```

E2E (from `kanban/web-ui`): `npm run e2e`.

## Usage examples

- **Add a project** — Use the UI to add a folder that contains a **git** repository (Kanban expects git for worktrees). If the folder is not a repo, the app can offer to run `git init`.
- **New chat** — Create a new agent chat for the active project; pick or configure the agent in **Settings** (Cline setup, autonomous mode, shortcuts).
- **Phuong** — Select a project, open the **Phuong** section in the sidebar, and ask for plans, task breakdowns, or board updates; Phuong uses server-side tools and streaming responses.
- **Commit / PR** — Use the task flow and prompts (templates are configurable under runtime config) to land changes from a task worktree onto your base branch or open a PR, consistent with upstream Kanban behavior.

## Configuration

### Environment

| Variable | Purpose |
|----------|---------|
| `CLERK_SECRET_KEY` | If set, `/api/*` requests require a valid Clerk JWT (Bearer or query `token` for WebSocket). If unset, the runtime uses a local user id. |
| `KANBAN_RUNTIME_HOST` | Bind host (default `127.0.0.1`). |
| `KANBAN_RUNTIME_PORT` | Port (default **3484**). |
| `SENTRY_*` | Server SDK (see `kanban` telemetry). |
| Agent-specific | e.g. API keys for Pi/Cline/Codex as required by your chosen CLI; Pi adapter also documents **ZAI** / **KIMI**-related env wiring in `agent-session-adapters.ts`. |

### On-disk preferences

Kanban stores runtime preferences under `~/.cline/kanban/config.json` and per-repo under `<project>/.cline/kanban/config.json` (selected agent, shortcuts, prompt templates, notification toggles). See `kanban/src/config/runtime-config.ts`.

### Hosted deployment

For production-style setup (env file, systemd, nginx, TLS), see `deploy/ansible/` and `docs/BUILD-RUNSHEET.md`.

## Architecture (high level)

```
Browser (React + tRPC + WS)
    ↓
Node HTTP server (kanban/src/server/runtime-server.ts)
    ├── Static web UI (Vite build)
    ├── tRPC /api/trpc/*  — workspace, projects, runtime, hooks, memory, phuong
    ├── POST /api/phuong/chat  — SSE stream for Phuong
    └── WebSocket  — terminal bridge for agent sessions
    ↓
Runtime state + workspace registry + terminal session manager
    ↓
Agent adapters (cline-sdk, pi, …) → PTY + git worktrees
```

- **Phuong** — Implementation under `kanban/src/manager/`; API wiring in `kanban/src/trpc/` and `runtime-server.ts`.
- **Memory** — APIs exist; the design targets an **external git-backed memory repo** (see `docs/MEMORY-SEPARATION.md`). In this workspace snapshot, `kanban/src/memory/memory-service.ts` is a **stub** (not configured; safe no-ops) so builds stay green until the full sync is present.
- **v1** — An older Express + React stack lives in `archive/v1/` for reference only.

## Documentation

| Document | Purpose |
|----------|---------|
| `docs/BUILD-RUNSHEET.md` | Phased build plan, deployment steps, file map |
| `docs/KANBAN-FULL-BUILD-PLAN.md` | Architecture and product decisions |
| `docs/CLINE-KANBAN-ADOPTION-REPORT.md` | Why Kanban was chosen as the base |
| `docs/MEMORY-SEPARATION.md` | External memory repository design |
| `docs/ARCHITECTURE.md` | v1 architecture (historical) |
| `kanban/docs/architecture.md` | Upstream Kanban runtime and UI notes |
| `kanban/AGENTS.md` | Contributor / agent behavior notes for the fork |

## Updating upstream Kanban

This repo is intended to stay mergeable with **cline/kanban** and published agent packages.

1. Fetch upstream and diff against this fork before large merges.
2. Pay special attention to integration seams, for example:
   - `kanban/src/core/agent-catalog.ts`
   - `kanban/src/terminal/agent-session-adapters.ts`
   - `kanban/src/server/runtime-state-hub.ts`
   - `kanban/web-ui/src/terminal/persistent-terminal-manager.ts`
3. Prefer taking upstream behavior first, then re-apply Phuong- or Pi-specific logic only where needed.
4. Re-run `npm run check` in `kanban/` and smoke-test task start, terminal streaming, and Phuong.

**pi / Cline packages** — Update `@mariozechner/pi-coding-agent` and `@clinebot/*` from npm when possible; adjust `agent-session-adapters.ts` and `kanban/src/cline-sdk/` only if CLI flags, extension APIs, or auth contracts change.

Keep custom behavior in **seams** (few files with clear responsibility) to keep future upstream diffs small.

## Repository layout

| Path | Role |
|------|------|
| `kanban/` | Main application: CLI, server, web UI, tests |
| `deploy/` | Ansible and deployment helpers |
| `docs/` | Product and build documentation |
| `archive/v1/` | Legacy Phuong stack (reference) |

## License

The imported Kanban tree follows its **Apache-2.0** license; see `kanban/LICENSE` where present.
