# Cline Kanban Adoption Report

## Scope

This report evaluates whether `cline/kanban` can become the execution and review layer for `clawdeploy`, while preserving the core `Phoung` idea:

- a separate manager brain
- memory stored outside the app repo and synced with git
- sub-agents assigned concrete implementation tasks

Sources reviewed:

- `clawdeploy/docs/ARCHITECTURE.md`
- `clawdeploy/docs/MEMORY-SEPARATION.md`
- `clawdeploy/main-agent/src/memory.ts`
- `cline/kanban` source and docs: [GitHub repo](https://github.com/cline/kanban), [feature docs](https://docs.cline.bot/kanban/features)

## Executive Take

Yes, this is likely the strongest open-source base available right now for the part of your system that manages:

- parallel task execution
- per-task git worktrees
- agent launch/runtime wiring
- board review flow
- git shipping and task chaining

But it is not a drop-in replacement for `Phoung`.

The right mental model is:

- `Kanban` can replace most of your current task-board, worktree, task-runtime, and review mechanics.
- `Phoung` should remain the manager and planner.
- your separate git-backed memory repo should remain outside Kanban entirely.
- `PI` should be implemented as a manager/control-plane layer above Kanban, not by trying to force Kanban's built-in per-task `plan mode` to become full program management.

My conclusion: adopt Kanban as the execution substrate, not as the brain.

## What Kanban Already Gives You

Kanban is more substantial than the marketing copy suggests. The repo has a real local runtime, not just a React board.

### Core strengths

- Local runtime as source of truth for projects, board state, worktrees, sessions, and streaming updates.
- Per-task isolated git worktrees under `~/.cline/worktrees/`.
- Native support for multiple agent runtimes.
- Two runtime paths:
  - PTY-based CLI agents like Codex, Claude Code, Gemini, OpenCode
  - native SDK-backed Cline sessions
- Live websocket state streaming to the UI.
- Built-in review flow, task diffs, inline feedback, commit/PR actions, and task linking.

### Important architecture facts

- Task cards are persisted as board state, not just UI state.
- Sessions are persisted separately from board data.
- Worktrees are outside the repo and are recreated/restored as needed.
- Ignored paths like `node_modules` are symlinked into task worktrees for speed.
- There is already a first-class task session mode of `act` vs `plan`, but it is task-local planning, not portfolio-level planning.

## How This Maps To `clawdeploy`

Your current system has four major responsibilities:

1. `Phoung` as manager/planner/chat surface
2. file-backed long-term memory
3. sub-agent execution in isolated workspaces
4. review and ship flow

Kanban overlaps heavily with `3` and `4`, but only lightly with `1`, and almost not at all with `2`.

### What Kanban could replace

- the current task execution board concept
- much of the current worktree lifecycle management
- agent terminal/session orchestration
- the review UI around diffs and task state
- linked task automation and git-facing operator workflow

### What Kanban should not replace

- your manager-agent identity and reasoning loop
- your memory repo and memory file structure
- your project-level context hierarchy
- your human-facing strategic control model

## Best-Fit Target Architecture

The best-fit architecture is a layered model:

### Layer 1: Manager brain

Keep `Phoung` as the manager process.

Responsibilities:

- interpret human goals
- read and write the separate memory repo
- decide project priority, sequencing, and task decomposition
- create or update `PI` records
- decide what context each sub-agent should receive

### Layer 2: Manager memory

Keep memory in the separate git repo described in `docs/MEMORY-SEPARATION.md`.

Responsibilities:

- org decisions
- project memory
- conversation logs
- active/completed task records
- research and strategic notes
- `PI` objects, planning snapshots, and manager-only control metadata

This should remain outside both:

- the `clawdeploy` code repo
- Kanban's workspace state and task worktrees

### Layer 3: Kanban execution substrate

Use Kanban for:

- presenting executable tasks
- spinning up isolated task worktrees
- running the chosen coding agent
- surfacing live activity
- collecting review feedback
- handling commit/PR workflows

### Layer 4: Repo-local task context

Continue your per-repo context model, but inject or sync it into the task workspace as needed.

That means Kanban task sessions should consume:

- repo-local `.clawdeploy/context/*`
- optionally manager-selected memory excerpts
- task prompt derived by `Phoung`

## What `PI` Should Mean Here

Kanban already has `startInPlanMode`, but that is not the same as your `PI` concept.

In this architecture, `PI` should be a manager-level object such as:

- objective
- scope window
- success criteria
- participating repos/projects
- ordered task graph
- dependencies
- memory references
- rollout status

That object belongs in manager memory, not in Kanban's board schema.

Kanban tasks should be generated from `PI`, not define `PI`.

## Why The Separate Memory Repo Still Matters

This is the clearest part of the recommendation: your separate memory repo is still the right idea.

Kanban persists its own operational state under `~/.cline/kanban/`:

- workspace index
- board JSON
- sessions JSON
- revision metadata

That state is runtime operational state. It is not durable organizational memory.

You do not want long-term memory tied to:

- a local machine path
- a specific Kanban install
- task worktree cleanup behavior
- a four-column board schema

The memory repo should remain the durable source of truth, and Kanban should consume derived slices of it.

## Exact Kanban Extension Points

If you fork or integrate with Kanban, these are the main seams that matter.

### Backend/runtime seams

- `src/trpc/runtime-api.ts`
  - best place to intercept task start and inject manager-produced prompt/context payloads
- `src/trpc/workspace-api.ts`
  - best place to add manager-aware workspace metadata APIs or state sync hooks
- `src/core/api-contract.ts`
  - shared schema layer if you add any new persisted Kanban-visible state
- `src/state/workspace-state.ts`
  - current persistence model for board/session state
- `src/workspace/task-worktree.ts`
  - worktree creation, restore, ignored-path mirroring, cleanup
- `src/terminal/agent-session-adapters.ts`
  - where non-Cline CLI launches are adapted; likely where a `pi` runtime would plug in
- `src/commands/hooks.ts`
  - hook ingestion path; useful if you want richer task telemetry flowing back into manager memory

### Frontend seams

- `web-ui/src/App.tsx`
  - top-level composition root for adding a manager/PI surface
- `web-ui/src/components/top-bar.tsx`
  - good place for global `PI` controls or manager actions
- `web-ui/src/hooks/use-board-interactions.ts`
  - main board behavior orchestration
- `web-ui/src/hooks/use-task-start-actions.ts`
  - backlog start rules and dependency-based start behavior
- `web-ui/src/hooks/use-workspace-sync.ts`
  - client-side workspace state hydration and revision handling

## What You Would Need To Add

To make Kanban fit your idea, you would still need three substantial additions.

### 1. A manager-control plane

Kanban assumes the board is the primary operator surface.

You want:

- one main manager agent
- memory-aware planning
- delegated tasks pushed to sub-agents

So you need a control layer that can:

- read manager memory
- synthesize task prompts
- create/update Kanban tasks
- map task results back into manager memory

This can live either:

- inside `clawdeploy`, with Kanban treated as an execution backend
- or in a Kanban fork as a new manager runtime

### 2. Durable memory sync

You need a service that writes outcomes back to your git-backed memory repo, for example:

- task created
- task started
- agent asked for help
- review requested
- PR opened
- task completed
- learned memory extracted

This should not rely on Kanban's workspace state as the primary store.

### 3. A `pi` agent/runtime adapter

Kanban currently supports a set of CLI agents plus native Cline.

If your sub-agent runtime remains `pi`, you need:

- a new agent entry in Kanban's runtime catalog
- launch argument/env handling
- hook parsing if `pi` emits structured events
- plan/act mode mapping

This is feasible because Kanban already has an adapter architecture for CLI-backed agents.

## Main Risks

### 1. Kanban is local-first, not manager-first

Its assumptions are:

- a local long-lived runtime
- an operator sitting in the board UI
- task execution originating from the board

Your system is manager-centric. That mismatch is real.

### 2. Current board model is fixed and opinionated

Kanban persists fixed columns:

- `backlog`
- `in_progress`
- `review`
- `trash`

That is fine for execution flow, but not for `PI` lifecycle or broader project portfolio state.

### 3. Dependency model is lighter than a true program graph

Kanban has task dependencies and chaining, but it is still tuned for board workflow rather than deep planning DAGs.

For example, backlog start behavior is explicitly tied to board-local dependency rules, not a broader planning engine.

### 4. Review comments are agent feedback, not durable manager discussion

Kanban's inline comments are useful, but they are mainly routed back to the agent session. They are not a substitute for manager memory, durable decisions, or richer review records.

### 5. Security/runtime model differs from your current design

Your current architecture uses gVisor-sandboxed Docker workers. Kanban is built around local CLI processes and worktrees.

If strong isolation remains a hard requirement, you would need one of:

- a `pi` CLI that is safe to run directly in the worktree
- a new Kanban runtime adapter that launches containerized workers instead of local PTYs

That is one of the biggest adoption decisions.

## Recommended Adoption Strategy

I would not replace `clawdeploy` wholesale in one move.

### Phase 1: Treat Kanban as a research execution shell

- keep `Phoung` as-is
- keep the separate memory repo
- prototype a one-way bridge that creates Kanban cards from manager-generated tasks
- test whether a `pi` task can be launched cleanly through Kanban's agent adapter model

Goal: prove task execution and review ergonomics.

### Phase 2: Mirror task lifecycle back into memory

- on task create/start/review/complete, write structured records to manager memory
- keep `PI` in memory repo, not in Kanban persistence
- let Kanban remain disposable operational state

Goal: preserve your real moat, which is memory and orchestration logic.

### Phase 3: Decide runtime strategy

Choose one:

1. run `pi` directly inside Kanban worktrees
2. add a container-backed runtime path to Kanban
3. use Kanban for non-isolated local work only and keep container spawning for production-grade tasks

Goal: resolve the biggest architectural fork early.

### Phase 4: Add a manager surface

Only after the substrate works should you add:

- `PI` dashboard
- manager memory panels
- task-to-memory traceability
- cross-task planning views

## Recommended End State

The strongest end-state is:

- `Phoung` remains the strategic manager
- `base-control` remains the long-term memory repo
- Kanban becomes the tactical execution and review engine
- sub-agent tasks are derived artifacts, not the primary memory objects

In plain English:

`Kanban` should become your hands.

`Phoung + memory` should remain your brain.

## Final Recommendation

Adopt Kanban, but only as a substrate.

Do not collapse your manager memory model into Kanban.
Do not try to make Kanban's board state become your durable planning state.
Do not replace `PI` with Kanban's built-in task `plan mode`.

The highest-leverage path is:

1. keep manager memory separate and git-backed
2. keep `Phoung` as the planner/delegator
3. use Kanban for worktrees, task execution, review, and shipping
4. add a thin bridge or fork that lets manager-created tasks flow into Kanban and task outcomes flow back into memory

That would let you inherit most of the hard execution UX from Kanban while preserving the part of the system that is actually differentiated.
