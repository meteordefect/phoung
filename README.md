# Phoung

A hosted AI project manager built on a [Kanban](https://github.com/cline/kanban) fork. You chat with Phoung through a secure web dashboard. Phoung plans work, creates tasks on a visual board, and launches `pi` coding agents in isolated worktrees on your VPS. Project memory lives in a separate git-backed repository.

## Status

Rebuilding. See `docs/BUILD-RUNSHEET.md` for the step-by-step execution plan.

## Architecture

- **Kanban fork** — task board, worktree lifecycle, agent runtime, review/diff UI
- **Phoung** — manager agent (chat, planning, task decomposition, memory retrieval)
- **pi** — worker agent (executes coding tasks in worktrees using GLM-5 via ZAI)
- **Memory** — external git repo (`base-control`), never in this repo
- **Auth** — Clerk with server-side JWT verification
- **Deploy** — VPS with nginx, TLS, systemd, Ansible

## Docs

| Document | Purpose |
|----------|---------|
| `docs/BUILD-RUNSHEET.md` | Step-by-step build execution plan |
| `docs/KANBAN-FULL-BUILD-PLAN.md` | Full architectural plan and decisions |
| `docs/CLINE-KANBAN-ADOPTION-REPORT.md` | Evaluation of cline/kanban as the base |
| `docs/MEMORY-SEPARATION.md` | External memory repo design |
| `docs/ARCHITECTURE.md` | Previous architecture (reference) |

## Updating Upstream

This repo is meant to stay updateable with upstream Kanban, `pi`, and Cline package fixes.

### Kanban upstream

When upstream `cline/kanban` ships useful fixes:

1. Fetch the upstream changes into this fork.
2. Diff upstream against the current fork before merging broadly.
3. Pay special attention to the integration seam files:
   - `kanban/src/core/agent-catalog.ts`
   - `kanban/src/terminal/agent-session-adapters.ts`
   - `kanban/src/server/runtime-state-hub.ts`
   - `kanban/web-ui/src/terminal/persistent-terminal-manager.ts`
4. Prefer taking upstream behavior first, then re-applying Phoung- and `pi`-specific logic only where still needed.
5. Re-run the Kanban tests and manually verify task start, review-ready transitions, terminal behavior, and sidebar chat behavior.

### pi and Cline updates

- `pi` is integrated through Kanban's agent adapter layer plus the published `@mariozechner/pi-coding-agent` package. Prefer updating the package first, then adjust `kanban/src/terminal/agent-session-adapters.ts` only if the CLI flags, extension API, or auth behavior changed.
- Cline behavior mostly comes from the published `@clinebot/*` packages and the local `kanban/src/cline-sdk/` integration layer. Prefer updating the packages first, then diff `kanban/src/cline-sdk/` and nearby runtime wiring only if the SDK contract changed.

### Fork maintenance rule

Keep custom behavior isolated to clear seams instead of scattering fork logic through the codebase. That keeps upstream diffs smaller and makes it practical to adopt future Kanban, `pi`, and Cline fixes without a rewrite.

## Previous Version

The v1 Phoung stack (Express API, React review UI, Docker subagents) is archived in `archive/v1/` for reference.
