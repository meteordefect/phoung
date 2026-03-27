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

## Previous Version

The v1 Phoung stack (Express API, React review UI, Docker subagents) is archived in `archive/v1/` for reference.
