# Context Engineering + gVisor Architecture

**Date:** 2026-03-11
**Status:** Planned

## Problem

Subagents clone repos from GitHub every spawn. They have zero access to project context beyond what Phoung stuffs into the prompt string. Phoung can't read project code directly — only `memory/` files. The company knowledge graph is flat and incomplete.

## Solution

1. Phoung maintains local clones of all registered project repos on the VPS
2. Subagents run in gVisor-sandboxed Docker containers with the repo mounted in, not cloned
3. Context from `memory/` gets injected as files into the workspace before spawn
4. Each project repo gets a `.clawdeploy/context/` directory with per-project knowledge
5. `memory/` gets upgraded to a company knowledge graph structure

## Architecture

```
VPS filesystem
├── memory/                          # Company graph (Phoung only)
│   ├── system-prompt.md
│   ├── subagent-prompt.md
│   ├── overview.md
│   ├── org/
│   │   ├── decisions/               # Cross-project decisions with reasoning
│   │   └── strategy/                # Vision, positioning, open dilemmas
│   ├── projects/<name>/
│   │   ├── context.md
│   │   ├── memories/
│   │   ├── conversations/
│   │   └── tasks/
│   ├── general/
│   ├── research/                    # Deep domain knowledge
│   └── logs/
│
├── repos/                           # Local clones (Phoung can read, subagents get mounted slices)
│   ├── project-alpha/
│   │   ├── .clawdeploy/context/     # Per-project context (lives in repo)
│   │   │   ├── ROUTING.md
│   │   │   ├── patterns.md
│   │   │   ├── decisions.md
│   │   │   └── debugging.md
│   │   └── src/
│   └── project-beta/
│
└── /tmp/clawdeploy-workspaces/      # Ephemeral git worktrees per subagent
    └── <task-id>/                   # Mounted into gVisor container at /workspace
        ├── .clawdeploy/
        │   ├── context/             # From repo
        │   └── injected/            # From memory/ — Phoung adds relevant company context
        └── src/
```

## Spawn flow (new)

```
1. repos.pullLatest(project)
2. repos.createWorktree(project, taskId, branch)
3. repos.injectContext(project, taskId, relevantMemoryFiles)
4. spawner.spawn() → Docker container with:
   - Runtime: "runsc" (gVisor)
   - Bind mount: /tmp/clawdeploy-workspaces/<task-id> → /workspace
   - No REPO_URL env var
5. Subagent works in /workspace (repo + context already there)
6. On exit: host-side push from worktree, then cleanup
```

## Implementation steps

### Step 1: config.ts — new config vars
- `REPOS_DIR`: path to local repo clones (default `../../repos`)
- `WORKSPACES_DIR`: path to ephemeral worktrees (default `/tmp/clawdeploy-workspaces`)
- `SUBAGENT_RUNTIME`: Docker runtime (default `runc`, set to `runsc` for gVisor)

### Step 2: repos.ts — new module for repo management
- `cloneRepo(project, repoUrl)`: git clone to `repos/<project>/`
- `pullLatest(project)`: git pull origin main
- `createWorktree(project, taskId, branch)`: git worktree add
- `removeWorktree(project, taskId)`: git worktree remove
- `injectContext(project, taskId, memoryFiles)`: copy selected memory/ files into workspace `.clawdeploy/injected/`
- `pushFromWorktree(taskId, branch)`: git push from the worktree
- `createPrFromWorktree(taskId, branch, title, body)`: gh pr create

### Step 3: spawner.ts — rewrite for mounted workspaces
- Remove `REPO_URL` from container env
- Add bind mount: workspaces/<task-id> → /workspace
- Add `Runtime: "runsc"` to HostConfig (configurable)
- Call repos.createWorktree before spawn
- Call repos.pushFromWorktree + repos.removeWorktree after container exits (in checkContainers)

### Step 4: entrypoint.sh — remove git clone, work with mounted workspace
- Remove `git clone` step
- Workspace is already at /workspace with repo + context
- Still: create branch, run agent, commit
- Remove: push and PR creation (host handles this now)

### Step 5: extension.ts — add register_project tool
- New tool: `register_project` — clones repo, creates memory/projects/<name>/ structure
- Update `spawn_subagent` to accept optional `context_files` parameter for injection

### Step 6: memory/ restructure — company knowledge graph
- Create `memory/org/decisions/`
- Create `memory/org/strategy/`
- Create `memory/research/`

### Step 7: subagent-prompt.md — update for context-aware subagents
- Tell subagent about `.clawdeploy/context/` (read for project knowledge)
- Tell subagent about `.clawdeploy/injected/` (read for company context relevant to this task)
- Tell subagent it can update `.clawdeploy/context/` files if it discovers something important

### Step 8: docker-compose.yml — mount repos/ and workspaces/
- Add `./repos:/app/repos` volume to api service
- Add `/tmp/clawdeploy-workspaces:/tmp/clawdeploy-workspaces` volume

### Step 9: deploy/ — gVisor install
- Add gVisor install step to deployment (install runsc, configure Docker daemon)

### Step 10: README.md — update documentation
- Document new architecture, repo management, context flow, gVisor setup
