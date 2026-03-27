# Build Runsheet

Step-by-step execution plan for the Phoung/Kanban rebuild. Each phase produces a working checkpoint. Do not skip phases — each depends on the previous.

## Phase 1: Import Kanban and boot locally ✅

### 1.1 Clone upstream Kanban

```
git clone https://github.com/cline/kanban.git kanban/
rm -rf kanban/.git
```

Remove the upstream `.git` so it becomes part of this repo, not a submodule.

### 1.2 Install and build

```
cd kanban
npm install
npm run install:all
npm run build
```

Verify the build completes without errors.

### 1.3 Boot locally

```
cd kanban
npx tsx src/cli.ts
```

Open the local URL in a browser. Verify:

- board loads
- you can create a task card
- you can start a task (with any installed agent, e.g. claude or codex)
- worktree is created
- task runs and produces output

### 1.4 Checkpoint

Kanban runs locally as an unmodified fork. Commit this as the baseline.

> **Done** — committed `ff73a90`, Kanban v0.1.47 imported, builds and boots at `localhost:3484`.

---

## Phase 2: Add `pi` as a Kanban agent ✅

### 2.1 Extend the agent ID enum

File: `kanban/src/core/api-contract.ts`

Add `"pi"` to the `runtimeAgentIdSchema` enum.

### 2.2 Add catalog entry

File: `kanban/src/core/agent-catalog.ts`

Add a `pi` entry to `RUNTIME_AGENT_CATALOG`:

- id: `"pi"`
- label: `"Pi"`
- binary: `"pi"`
- baseArgs: `["-p", "--no-session"]`
- autonomousArgs: `[]`
- installUrl: link to pi docs

Add `"pi"` to `RUNTIME_LAUNCH_SUPPORTED_AGENT_IDS`.

### 2.3 Create the pi adapter

File: `kanban/src/terminal/agent-session-adapters.ts`

Create `piAdapter: AgentSessionAdapter` following the codex adapter pattern:

- set model via env: `ZAI_API_KEY`, `SUBAGENT_MODEL` or `PI_MODEL`
- pass prompt as the last argument
- wire up hook context for activity tracking
- add to the `ADAPTERS` map

### 2.4 Verify pi integration

- boot Kanban
- select `pi` as the active agent in settings
- create a task, start it
- verify pi launches in the worktree
- verify activity appears on the card

### 2.5 Checkpoint

pi runs tasks through Kanban locally. Commit.

> **Done** — committed `ff73a90`. Pi appears in onboarding + settings, detected on PATH, launches with `-p --no-session`. API key for ZAI provider needed on VPS.

---

## Phase 3: Deploy to VPS (private access)

### 3.1 Build for server

On the VPS or via Ansible, clone this repo and build the Kanban fork:

```
cd /srv/clawdeploy/app
git pull
cd kanban
npm install && npm run install:all && npm run build
```

### 3.2 Run as a service

Create a systemd unit or use pm2/screen to run:

```
node kanban/dist/cli.js --host 0.0.0.0 --port 4800
```

Bind to localhost only — nginx will front it.

### 3.3 Configure nginx reverse proxy

Update `deploy/nginx/` config to proxy to the Kanban runtime:

```
location / {
    proxy_pass http://127.0.0.1:4800;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

WebSocket upgrade headers are required for terminal streaming and state sync.

### 3.4 Access via Tailscale

Restrict nginx to Tailscale subnet initially (no public access, no auth needed yet).

### 3.5 Verify on VPS

- open `http://<tailscale-ip>:8080` from laptop
- board loads
- can create and run a task with pi
- worktrees created on VPS filesystem

### 3.6 Checkpoint

Kanban + pi running on VPS, accessible via Tailscale. Commit deploy config.

---

## Phase 4: Add Clerk auth

### 4.1 Install Clerk dependencies

```
cd kanban
npm install @clerk/backend
cd web-ui
npm install @clerk/react
```

### 4.2 Server-side auth middleware

File: `kanban/src/server/runtime-server.ts`

In `createTrpcContext`, before building the context:

- extract `Authorization: Bearer <token>` from request headers
- use `@clerk/backend` `verifyToken()` to validate the JWT
- reject with 401 if invalid
- attach userId to context

On WebSocket upgrade (`/api/runtime/ws`, `/api/terminal/io`):

- extract token from query string `?token=<jwt>`
- verify before allowing upgrade
- destroy socket if invalid

### 4.3 Client-side Clerk integration

File: `kanban/web-ui/src/main.tsx` (or equivalent entry point)

- wrap app in `ClerkProvider`
- show `<SignIn />` when unauthenticated
- inject Bearer token into all tRPC requests via headers function
- pass token as query param for WebSocket connections

### 4.4 Clerk project setup

- create a Clerk application at dashboard.clerk.com
- set allowed redirect URLs to your VPS domain
- get publishable key and secret key
- add to `.env`:
  - `CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`

### 4.5 Switch nginx to public access

- enable port 443 with TLS (Let's Encrypt via certbot)
- remove Tailscale-only restriction
- all auth now handled by Clerk at the application layer

### 4.6 Verify

- open `https://yourdomain.com`
- Clerk login page appears
- sign in
- board loads
- unauthenticated requests to `/api/trpc/*` return 401
- WebSocket connections without token are rejected

### 4.7 Checkpoint

Kanban is publicly accessible with Clerk auth. Commit.

---

## Phase 5: Add external memory service

### 5.1 Create memory service module

File: `kanban/src/memory/` (new directory)

Port from `archive/v1/main-agent/src/memory.ts`:

- `memory-service.ts` — core read/write operations
- `memory-loader.ts` — selective loading (system prompt → overview → project context → specific memories)
- `memory-sync.ts` — git commit and push automation

Key adaptation: the service reads from `MEMORY_DIR` env var pointing to the external `base-control` repo clone on the VPS.

### 5.2 Set up external memory repo on VPS

```
git clone git@github.com:meteordefect/base-control.git /data/phoung-memory
```

Set `MEMORY_DIR=/data/phoung-memory` in the runtime env.

### 5.3 Add memory cron

Hourly auto-commit and push:

```
0 * * * * cd /data/phoung-memory && git add -A && git diff --cached --quiet || git commit -m "auto: $(date -u +\%Y-\%m-\%dT\%H:\%M)" && git push
```

### 5.4 Add memory tRPC procedures

File: `kanban/src/trpc/app-router.ts`

Add a `memory` sub-router:

- `memory.loadOverview` — returns system prompt + overview
- `memory.loadProjectContext` — returns context for a specific project
- `memory.listProjects` — returns project names
- `memory.listMemories` — returns memory filenames + summaries for a project
- `memory.loadMemory` — returns a specific memory file

### 5.5 Verify

- memory loads from `/data/phoung-memory` on VPS
- changes to memory files are committed hourly
- tRPC procedures return correct data

### 5.6 Checkpoint

External memory repo is live, readable by the app, auto-backed-up. Commit.

---

## Phase 6: Add Phoung manager service

### 6.1 Create Phoung service module

File: `kanban/src/manager/` (new directory)

Port from `archive/v1/main-agent/src/phoung.ts`:

- `phoung-session.ts` — pi-coding-agent SDK session, streaming, model selection
- `phoung-tools.ts` — custom tools (create task on board, update task, load memory, create memory)
- `phoung-context.ts` — selective context assembly (system prompt + overview + relevant project context + relevant memories)

Key adaptation: Phoung's tools now operate on the Kanban board (via workspace state save API) instead of the old file-based task system.

### 6.2 Add Phoung tRPC procedures

File: `kanban/src/trpc/app-router.ts`

Add a `phoung` sub-router:

- `phoung.chat` — mutation, accepts message + conversationId, returns SSE stream
- `phoung.listConversations` — query
- `phoung.loadConversation` — query
- `phoung.newConversation` — mutation
- `phoung.getModels` — query
- `phoung.getSessionStats` — query

### 6.3 Add Phoung chat panel to the UI

File: `kanban/web-ui/src/` (new component)

Add a slide-out or split panel for chatting with Phoung:

- text input with send button
- SSE streaming response display
- thinking/tool call rendering (reuse patterns from `archive/v1/review-ui/`)
- conversation history selector

Mount this alongside the board, not replacing it. The board remains the primary surface. The Phoung panel is for planning and delegation.

### 6.4 Wire Phoung tools to Kanban board

Phoung's `create_task` tool should:

1. read current workspace state via `workspace.getState`
2. add a new card to the backlog column
3. save via `workspace.saveState`

Phoung's `start_task` tool should:

1. trigger `runtime.startTaskSession` for the card

This makes Phoung a first-class board operator.

### 6.5 Verify

- open the Phoung panel
- send "create a task to add a README to project X"
- Phoung creates a card on the board
- start the task — pi runs it
- Phoung can see task status

### 6.6 Checkpoint

Phoung is integrated as the manager. You can chat with Phoung and it manages the board. Commit.

---

## Phase 7: Connect memory to task lifecycle

### 7.1 Define task lifecycle events

Events that write to memory:

| Event | Memory action |
|-------|---------------|
| Task created | Append to project task log |
| Task started | Record execution start |
| Task asked question (review) | Log decision point |
| Task completed | Write summary + outcome |
| PR opened | Record implementation result |
| PR merged | Mark task complete in memory |

### 7.2 Add event hooks

File: `kanban/src/memory/task-lifecycle.ts`

Subscribe to Kanban workspace state changes. When a task transitions state, write the appropriate record to the project memory.

### 7.3 Wire to Phoung

Phoung should read recent task outcomes when planning new work. Add task history to the context assembly in `phoung-context.ts`.

### 7.4 Verify

- complete a task through the full cycle
- check `/data/phoung-memory/projects/<project>/tasks/` for the written record
- verify Phoung can reference past task outcomes in conversation

### 7.5 Checkpoint

Task lifecycle enriches memory automatically. Commit.

---

## Phase 8: Production hardening

### 8.1 Process supervision

Set up systemd service for Kanban runtime:

- auto-restart on crash
- log to journald
- environment file for secrets

### 8.2 Ansible deployment playbook

Update `deploy/ansible/playbooks/site.yml` for the new stack:

- sync repo to VPS
- build Kanban fork
- install pi globally (`npm i -g @mariozechner/pi-coding-agent`)
- configure systemd service
- configure nginx with TLS
- set up memory repo and cron
- configure firewall (UFW)

### 8.3 Backup strategy

- memory repo: hourly git push (already in Phase 5)
- Kanban workspace state: daily rsync or git backup
- Clerk: managed by Clerk (SaaS)

### 8.4 Health monitoring

- nginx health endpoint
- Kanban runtime health check
- systemd watchdog

### 8.5 Checkpoint

Production-ready deployment. Commit.

---

## Summary: file locations after build

```
clawdeploy/
├── kanban/                    # imported cline/kanban fork
│   ├── src/
│   │   ├── core/              # agent catalog (with pi), api contract
│   │   ├── server/            # runtime server (with Clerk auth)
│   │   ├── terminal/          # agent adapters (with pi adapter)
│   │   ├── trpc/              # app router (with phoung + memory sub-routers)
│   │   ├── manager/           # NEW: Phoung session, tools, context
│   │   ├── memory/            # NEW: memory service, loader, sync
│   │   └── ...                # upstream Kanban modules
│   ├── web-ui/
│   │   ├── src/               # Kanban UI + Clerk + Phoung panel
│   │   └── ...
│   ├── package.json
│   └── ...
├── deploy/
│   ├── ansible/               # VPS provisioning and deployment
│   ├── nginx/                 # reverse proxy configs
│   ├── terraform/             # cloud infra (optional)
│   ├── deploy.sh
│   └── setup-ssl.sh
├── docs/
│   ├── BUILD-RUNSHEET.md      # this file
│   ├── KANBAN-FULL-BUILD-PLAN.md
│   ├── CLINE-KANBAN-ADOPTION-REPORT.md
│   ├── MEMORY-SEPARATION.md
│   ├── ARCHITECTURE.md        # old arch (reference)
│   └── research/              # upstream research snapshots
├── archive/
│   └── v1/                    # old Phoung stack (reference only)
├── .gitignore
└── README.md
```

## External (on VPS, not in this repo)

```
/data/phoung-memory/           # base-control git repo clone
├── system-prompt.md
├── overview.md
├── projects/
│   └── <project>/
│       ├── context.md
│       ├── memories/
│       ├── conversations/
│       └── tasks/
├── org/
├── general/
└── skills/
```
