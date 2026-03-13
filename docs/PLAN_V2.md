# Phoung v2 — Architecture Reference

**Date:** 2026-03-06  
**Status:** Built and deployed  
**Codename:** Claw Lite

> This document is the original design spec. The system is now running. The main agent is named **Phoung** (not Pi — references to "Pi" below are from the original draft). See `README.md` for current setup instructions.

---

## Problem Statement

Phoung v1 is overengineered for what we actually need. It has 5 Docker services, ~35 API endpoints, 6 database tables, an Agent Bridge, an OpenClaw Gateway, Ansible playbooks, and multiple auth flows. Several endpoints are broken (PATCH tasks, POST activity). The Agent Bridge bypasses the gateway entirely. Most of this infrastructure exists to manage state that GitHub already tracks natively (branches, PRs, CI status, reviews).

**What we actually want:** Talk to an AI that knows our business. It makes code changes in the background. We review and merge them.

---

## New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        YOU (Human)                          │
│                                                             │
│   Talk to Pi ◄──────────► Review UI (tabs per task)         │
│   (business context,      (see diffs, merge/reject,         │
│    task assignment)         inspect code changes)            │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          │
┌─────────────────────┐               │
│   MAIN AGENT (Pi)   │               │
│                     │               │
│ - Knows all projects│               │
│ - Learns business   │               │
│   context over time │               │
│ - Reads/writes .md  │               │
│   memory files      │               │
│ - Decides actions   │               │
│ - Spawns sub-agents │               │
└──────────┬──────────┘               │
           │                          │
     ┌─────┴──────┐                   │
     ▼            ▼                   │
┌─────────┐ ┌─────────┐              │
│Sub-Agent│ │Sub-Agent│  ◄────────────┘
│(Docker) │ │(Docker) │    (GitHub PRs are
│         │ │         │     the interface)
│ claude  │ │ codex   │
│ code    │ │         │
└────┬────┘ └────┬────┘
     │           │
     ▼           ▼
   GitHub PR   GitHub PR
     │           │
     ▼           ▼
   CI/Tests    CI/Tests
```

---

## Components

### 1. Main Agent — Pi

**What it is:** A single conversational AI (Pi from Inflection) that serves as the "brain." You talk to it about your business, projects, priorities. It maintains context by reading and writing markdown files.

**Three interaction modes (same code path):**

| Mode | Trigger | Who's talking | Behavior |
|---|---|---|---|
| **Live chat** | You type a message | You → Pi | Pi responds conversationally. Queues tasks or executes immediately based on urgency. |
| **Immediate** | You say "now" / "right away" | You → Pi | Pi spawns sub-agent during the conversation. Reports back live. |
| **Cron wake-up** | Cron sends `[CRON]` message | Nobody → Pi | Pi reads task list, processes queue, writes results to files. No human present. |

All three modes call the same `handle_message()` function. The system prompt teaches Pi how to behave in each.

**Queuing vs immediate execution:**
- Default: Pi adds tasks to `memory/tasks/active/` with status `pending`. Cron picks them up.
- If you signal urgency ("now", "immediately", "right away", "urgent"): Pi spawns the sub-agent during your conversation.
- If ambiguous: Pi asks — "Should I queue this or kick it off now?"

**Implementation:**

```
main-agent/
├── agent.py              # Core agent loop (~200 lines)
├── pi_client.py          # Pi API client (Inflection API)
├── spawner.py            # Docker sub-agent spawner
├── memory.py             # Read/write .md memory files
├── github_client.py      # GitHub API (PRs, status, diffs)
├── cron_handler.py       # 3 lines: calls handle_message("[CRON]...")
├── config.py             # Settings, API keys, project paths
└── requirements.txt
```

**`agent.py` core loop:**
```python
ALLOWED_ACTIONS = {
    "spawn_subagent",
    "check_status",
    "update_task",
    "update_memory",
    "create_memory",
    "ask_human",
    "read_repo_tree",
    "read_repo_file",
    "report",
}

FORBIDDEN_ACTIONS = {
    "merge_pr",
    "push_to_main",
    "create_task",   # only human creates tasks via chat
    "delete_repo",
    "delete_branch_main",
}

def handle_message(user_message: str, conversation_id: str = None) -> str:
    # Stage 1: Load lightweight context (system prompt + overview only)
    system_prompt = memory.load_system_prompt()
    overview = memory.load_overview()
    is_cron = user_message.startswith("[CRON]")

    # Stage 2: Ask Pi which project(s) are relevant
    project = pi.pick_project(user_message, overview)

    # Stage 3: Load that project's context + scan its memories
    project_context = memory.load_project_context(project)
    memory_filenames = memory.list_project_memories(project)
    relevant_memories = pi.pick_memories(user_message, memory_filenames)
    memories = memory.load_specific(project, relevant_memories)

    # Stage 4: Load conversation history if continuing a chat
    conv_history = memory.load_conversation(conversation_id) if conversation_id else None

    # Stage 5: Load active tasks for this project
    task_list = memory.list_active_tasks(project)

    response = pi.chat(user_message, system_prompt, overview, project_context, memories, task_list, conv_history)
    actions = parse_actions(response)

    # Save this exchange to conversation file
    memory.append_conversation(conversation_id or new_conversation_id(), user_message, response.text)

    for action in actions:
        if action.type in FORBIDDEN_ACTIONS:
            memory.log(f"BLOCKED forbidden action: {action}")
            continue
        if action.type not in ALLOWED_ACTIONS:
            memory.log(f"SKIPPED unknown action: {action}")
            continue

        if action.type == "spawn_subagent":
            spawner.spawn(action.task, action.project)
        elif action.type == "check_status":
            status = github.check_prs(action.project)
            memory.update_task(action.task_id, pr_status=status)
        elif action.type == "update_task":
            memory.update_task(action.task_id, **action.updates)
        elif action.type == "create_memory":
            memory.create_memory(action.id, action.content, action.tags, action.summary)
            memory.update_index(action.id, action.tags, action.summary)
        elif action.type == "update_memory":
            memory.write(action.file, action.content)
        elif action.type == "ask_human":
            memory.update_task(action.task_id, status="needs_human", question=action.question)

    return response.text
```

**Pi API considerations:**
- Pi (Inflection AI) API at `api.inflection.ai`
- If Pi API is unavailable or limited, fallback options: Claude API, GPT-4 API
- The agent wrapper is LLM-agnostic — swap `pi_client.py` for any provider
- System prompt loaded from `memory/system-prompt.md`

**Why Pi specifically:**
- Conversational tone — feels like talking to a colleague, not a tool
- Good at maintaining long-running context
- Business-oriented reasoning
- You prefer it

---

### 1b. System Prompt — `memory/system-prompt.md`

This is the most important file in the entire system. It defines Pi's identity, rules, and behavior across all three modes.

```markdown
# System Prompt

You are Pi, the engineering manager for Marten's projects.

## Your role
- You are Marten's engineering manager across all his projects
- You remember what you've worked on together — decisions, context, history
- You break down tasks into concrete work for sub-agents
- You manage the task queue and monitor progress
- You ask Marten when you're unsure — never guess

## How you use memory

You have a memory system in the `memory/` folder. Here's how to use it:

1. ALWAYS read `memory/INDEX.md` first. It lists every memory, project, and task with tags and summaries.
2. Based on what Marten is asking about, pick ONLY the relevant memories to load. Use tags and summaries to decide.
3. Do NOT load all memories. Only load what's needed for this conversation.
4. When you learn something new (a decision, a technical detail, a preference), create a new memory file in `memory/memories/` and update `INDEX.md`.
5. Every memory file must have frontmatter: id, date, project, tags, summary.
6. Write memories from Marten's perspective — what WE did, not what I told you.
7. Tags should be specific and reusable: technology names, concepts, project names.

### What to remember
- Technical decisions and why they were made
- Architecture choices and trade-offs
- Project-specific knowledge (tech stack, deployment, key files)
- Marten's preferences and patterns
- What worked, what didn't, lessons learned

### What NOT to remember
- Casual chat, greetings, small talk
- Information already in the project .md files (don't duplicate)
- Temporary states (use task files for those)

## How you receive instructions

### When Marten talks to you directly
- Understand intent: is this a task, a question, or a status check?
- For tasks: default to queuing (write a task file, status: pending)
- If Marten says "now", "immediately", "urgent", "right away": execute immediately (spawn sub-agent)
- If unclear whether to queue or execute: ask him
- Always confirm: "Queued as task-XXX" or "Spinning up now"
- For questions: answer from memory files
- For status: read active tasks and report

### When woken by cron (message starts with "[CRON]")
- No human is listening. Write all results to task files.
- Read memory/tasks/active/*.md
- For each task:
  - pending → spawn sub-agent, update status to "coding"
  - coding → check if container is still running
    - container exited + PR exists → update status to "pr_open"
    - container exited + no PR → update status to "failed", note the error
  - pr_open → check CI status via GitHub
    - CI passed → update status to "ready_to_merge"
    - CI failed → read error, decide:
      - Obvious fix → spawn new sub-agent with fix prompt
      - Unclear → status to "needs_human", write your question
  - needs_human → check if Marten wrote an answer in the task file
    - Yes → read answer, act on it
    - No → skip, wait for next cycle
  - ready_to_merge → do nothing (only Marten merges)

## Rules — never break these
1. Never merge a PR. Only Marten merges.
2. Never invent tasks. Only Marten creates tasks through conversation.
3. Never access repos not listed in memory/projects/.
4. When unsure, mark the task "needs_human" and write your question.
5. Log every decision to memory/decisions/YYYY-MM-DD.md.
6. Max 3 concurrent sub-agents. If at limit, queue the rest.

## How you output actions
Wrap each action in a tag so the system can parse it:

<action type="spawn_subagent" project="phoung" task_id="task-003">
Prompt for the sub-agent here
</action>

<action type="update_task" task_id="task-003" status="coding" container_id="abc123">
</action>

<action type="ask_human" task_id="task-003">
CI failed with error X. Should I retry or skip?
</action>

<action type="update_memory" file="decisions/2026-03-06.md">
Content to append
</action>

<action type="check_status" project="phoung" task_id="task-003">
</action>

<action type="create_memory" id="005" project="streaming-site" tags="gstreamer,latency,tuning" summary="Tuned GStreamer pipeline latency from 12s to 3s">
# GStreamer Latency Tuning

## What we did
- Reduced HLS segment duration from 6s to 2s
- Added `tune=zerolatency` to x264enc
- Switched to low-latency HLS mode

## Why
Marten wanted sub-5s latency for live events.

## Result
End-to-end latency dropped from ~12s to ~3s.
</action>

Only use these action types. Any other action type will be rejected.
```

---

### 2. Memory — Per-Project Folders with Overview

**What it is:** A folder hierarchy where each project has its own memory folder. Pi reads a lightweight overview file to know what projects exist, then drills into only the project folder it needs.

**The loading hierarchy — Pi goes deeper only as needed:**

```
Level 0: system-prompt.md          ← always loaded (~1KB)
Level 1: overview.md               ← always loaded (~2KB) — list of all projects, basic context
Level 2: projects/<name>/context.md ← loaded when Pi identifies the relevant project
Level 3: projects/<name>/memories/  ← Pi scans filenames/summaries, loads only what's relevant
```

Pi never loads everything. It reads level 0 + 1, figures out which project matters, loads level 2 for that project, and only dips into level 3 for specific memories if needed.

**`memory/overview.md` — the top-level map:**

```markdown
# Projects Overview

## Phoung
- **What:** AI agent orchestration platform
- **Stack:** Python, React, Docker
- **Repo:** github.com/marten/phoung
- **Status:** Active — rebuilding as v2 (simplified)
- **Folder:** projects/phoung/

## StreamingSite
- **What:** Live video streaming platform
- **Stack:** GStreamer, HLS, Nginx RTMP, Node.js
- **Repo:** github.com/marten/streaming-site
- **Status:** Active — adding adaptive bitrate
- **Folder:** projects/streaming-site/

## SEO Site
- **What:** Marketing website for client X
- **Stack:** Next.js, Vercel
- **Repo:** github.com/marten/seo-site
- **Status:** Maintenance — SEO overhaul completed
- **Folder:** projects/seo-site/
```

**Per-project folder structure:**

Each project gets its own self-contained folder with context, memories, conversations, and tasks:

```
memory/
├── system-prompt.md
├── overview.md                          # Level 1: project list + basic context
├── conversations/
│   └── inbox/                           # New chats land here before daily cron sorts them
│       └── 2026-03-06-14h30.md
├── projects/
│   ├── phoung/
│   │   ├── context.md                   # Level 2: full project context (architecture, tech, priorities)
│   │   ├── memories/
│   │   │   ├── v2-architecture-plan.md
│   │   │   └── killed-postgres-for-md-files.md
│   │   ├── conversations/
│   │   │   ├── plan-simplification-2026-03-06.md
│   │   │   └── cron-security-discussion-2026-03-06.md
│   │   └── tasks/
│   │       ├── active/
│   │       │   └── task-005-build-main-agent.md
│   │       └── completed/
│   │           └── task-003-remove-agent-bridge.md
│   ├── streaming-site/
│   │   ├── context.md
│   │   ├── memories/
│   │   │   ├── gstreamer-hls-pipeline-setup.md
│   │   │   ├── chose-hls-over-dash-for-apple.md
│   │   │   ├── cloudflare-cdn-cache-rules.md
│   │   │   └── latency-tuning-12s-to-3s.md
│   │   ├── conversations/
│   │   │   └── adaptive-bitrate-discussion-2026-03-01.md
│   │   └── tasks/
│   │       ├── active/
│   │       │   └── task-006-adaptive-bitrate.md
│   │       └── completed/
│   └── seo-site/
│       ├── context.md
│       ├── memories/
│       │   ├── meta-tags-and-structured-data.md
│       │   └── lighthouse-score-62-to-94.md
│       ├── conversations/
│       └── tasks/
│           └── completed/
│               └── task-004-open-graph-tags.md
└── general/                              # Non-project-specific stuff
    ├── memories/
    │   └── prefer-hls-over-dash.md       # Cross-project preferences
    └── conversations/
        └── weekly-review-2026-03-03.md
```

**How Pi navigates this:**

1. You say: "What did we do with GStreamer last month?"
2. Pi reads `overview.md` → sees StreamingSite uses GStreamer
3. Pi reads `projects/streaming-site/context.md` → full project context
4. Pi scans filenames in `projects/streaming-site/memories/` → sees `gstreamer-hls-pipeline-setup.md`, `latency-tuning-12s-to-3s.md`
5. Pi loads those 2 files. Answers with full context.
6. Total loaded: system-prompt + overview + 1 context file + 2 memories. Not the entire memory folder.

**Project context file (`projects/streaming-site/context.md`):**

```markdown
# StreamingSite — Project Context

## What is this
Live video streaming platform for [use case].

## Tech stack
- GStreamer 1.22 for video pipeline
- Nginx RTMP for ingest
- HLS for delivery (chose over DASH — see memories/chose-hls-over-dash-for-apple.md)
- Cloudflare CDN in front of HLS segments
- Node.js backend
- PostgreSQL for user data

## Repo
github.com/marten/streaming-site

## Key files
- /pipeline/gstreamer.py — main GStreamer pipeline
- /config/nginx-rtmp.conf — RTMP ingest config
- /deploy/docker-compose.yml — services

## Current priorities
1. Adaptive bitrate (in progress — task-006)
2. Recording/VOD support (planned)

## Recent memories
- gstreamer-hls-pipeline-setup.md — initial pipeline build
- cloudflare-cdn-cache-rules.md — CDN setup
- latency-tuning-12s-to-3s.md — latency optimization
```

**Git access for Pi:**

Pi has read access to project repos so it can write better sub-agent prompts. When Pi needs to understand the codebase before assigning a task, it can:

```python
ALLOWED_ACTIONS = {
    ...
    "read_repo_tree",     # list files/folders in a repo
    "read_repo_file",     # read a specific file from a repo
}
```

This lets Pi check the actual file structure, read a README, or look at a specific file before writing the sub-agent prompt. Pi does NOT have write access to repos — only sub-agents push code.

**Conversations — saved and organized:**

Every chat session is saved as a `.md` file. New conversations land in `conversations/inbox/`. You can start a new chat or continue a historical one.

**New conversation flow:**
1. You start a new chat → saved to `conversations/inbox/2026-03-06-14h30.md`
2. Daily cron reads the conversation, determines which project it relates to
3. Moves it to `projects/<name>/conversations/` with a descriptive filename
4. Example rename: `2026-03-06-14h30.md` → `plan-simplification-2026-03-06.md`

**Continue historical conversation:**
1. You open a previous conversation file (from the Review UI or directly)
2. New messages are appended to that file
3. Pi reads the conversation history from the file to restore context

**Conversation file format:**
```markdown
---
id: conv-2026-03-06-1430
project: phoung
started: 2026-03-06T14:30:00Z
summary: null
---

**Marten (14:30):** Take a look at what we have built. It's overcomplicated...

**Pi (14:31):** I've reviewed the codebase. You're right — it's overcomplicated for what you actually want...

**Marten (14:35):** What if I just had a main Pi agent...

**Pi (14:36):** That's a much simpler architecture. Here's what I'd suggest...
```

After the daily cron processes it:
```markdown
---
id: conv-2026-03-06-1430
project: phoung
started: 2026-03-06T14:30:00Z
summary: Decided to rebuild Phoung as v2. Kill Postgres, OpenClaw, Agent Bridge. Replace with Pi + Docker sub-agents + .md memory. Cron as dumb alarm clock.
---
(... conversation content ...)
```

**Task file format (`tasks/active/task-005-build-main-agent.md`):**

```markdown
---
id: task-005
project: phoung
status: coding
agent_type: claude
container_id: abc123
branch: task/task-005-build-main-agent
pr: null
created: 2026-03-06T10:00:00Z
retries: 0
max_retries: 2
---

# Build the main-agent Python package

## Prompt given to sub-agent
Create the main-agent Python package with: agent.py (core loop with handle_message),
pi_client.py (Pi API wrapper), memory.py (read/write .md files with frontmatter parsing),
spawner.py (Docker container launcher). See the architecture in the repo's docs/PLAN_V2.md.

## Progress
- Container spawned at 10:00

## Notes
Part of Phase 1 of the v2 build.
```

**Why this works:**
- Pi's context window stays small: system prompt + overview + 1 project context + a few relevant memories
- Each project is self-contained — easy to understand, browse, back up
- Sub-agents get zero business context — just the task prompt
- Conversations are preserved and searchable — you can always go back
- Daily cron keeps things organized so you don't have to
- File names are human-readable descriptions, not numbered IDs
- Obsidian-ready: each project folder is essentially a vault section

**Why plain .md:**
- Zero infrastructure (no database, no vector DB)
- Git-trackable (version history for free)
- Human-readable (you can browse/edit directly)
- Obsidian-ready (add later, just point vault at this folder)
- Any text editor works
- Easy for the AI to parse (frontmatter + markdown)

---

### 3. Sub-Agents — Docker Containers

**What they are:** Short-lived Docker containers that execute a single coding task. Each container gets a repo clone, a prompt, and a code-writing AI (Claude CLI, Codex, etc). When done, they push a branch and open a PR.

**What they do:**
1. Clone the target repo
2. Create a task branch
3. Run the coding AI (e.g. `claude` CLI) with the task prompt
4. Commit changes
5. Push branch + open PR via `gh`
6. Exit (container dies)

**Implementation — reuse existing `spawn-agent.sh` with simplification:**

```bash
#!/bin/bash
# spawn-subagent.sh <project> <task-id> <agent-type> <prompt>

PROJECT=$1
TASK_ID=$2
AGENT_TYPE=$3  # claude | codex
PROMPT=$4
REPO_URL=$(cat memory/projects/$PROJECT.md | grep "repo:" | cut -d' ' -f2)
BRANCH="task/${TASK_ID}"

docker run --rm \
  -e GITHUB_TOKEN=$GITHUB_TOKEN \
  -e TASK_ID=$TASK_ID \
  -e BRANCH=$BRANCH \
  -e PROMPT="$PROMPT" \
  -e REPO_URL=$REPO_URL \
  -e AGENT_TYPE=$AGENT_TYPE \
  -v /tmp/agent-workspaces:/workspace \
  phoung/subagent:latest
```

**Container image (`Dockerfile.subagent`):**
```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y git curl gh nodejs npm
# Install Claude CLI / Codex
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
```

**`entrypoint.sh` inside container:**
```bash
#!/bin/bash
cd /workspace
git clone $REPO_URL repo && cd repo
git checkout -b $BRANCH

# Run the coding agent
if [ "$AGENT_TYPE" = "claude" ]; then
    echo "$PROMPT" | claude --dangerously-skip-permissions
elif [ "$AGENT_TYPE" = "codex" ]; then
    echo "$PROMPT" | codex --full-auto
fi

git add -A && git commit -m "task($TASK_ID): automated changes"
git push origin $BRANCH
gh pr create --title "[$TASK_ID] Automated: $(echo $PROMPT | head -c 60)" \
             --body "Automated PR from sub-agent.\n\nTask: $TASK_ID\nAgent: $AGENT_TYPE\n\nPrompt:\n$PROMPT"
```

**Sandboxing:**
- Each task runs in an isolated Docker container
- No access to host filesystem (except mounted workspace)
- No access to other containers
- Container is destroyed after task completion
- Network limited to GitHub only (Docker network policy)
- Resource limits: `--memory=4g --cpus=2`

**Branch protection — sub-agents never touch main:**
- Sub-agents can ONLY push to feature branches: `task/<task-id>-<slug>`
- The `entrypoint.sh` enforces this — it creates and checks out a task branch before the coding agent runs
- PRs always target `main` (or a `test` branch if you want a staging step) but the sub-agent never merges
- GitHub branch protection rules enforce this server-side:
  - `main` requires PR review (your approval)
  - `main` blocks direct pushes
  - Only you can merge to `main`, via the Review UI or GitHub directly
- Even if a sub-agent tried to `git push origin main`, GitHub would reject it

---

### 4. Cron — Dumb Alarm Clock

**What it is:** A cron job that does exactly one thing: wake Pi up. The cron has zero logic, zero access to Docker, zero access to GitHub. It is an alarm clock and nothing else. Pi is always the brain.

**Implementation (`cron_handler.py`):**

```python
from agent import handle_message

handle_message("[CRON] Wake up and process your task list.")
```

That's the entire file. The cron calls the same `handle_message()` function that your interactive chat uses. The `[CRON]` prefix tells Pi that no human is listening — so it should write results to task files rather than wait for conversation.

**What happens when Pi wakes up:**

Pi receives the cron message, reads `memory/tasks/active/*.md`, and decides what to do:

```
Pi wakes up, reads task list
  │
  ├─ Task pending?
  │    → Spawn Docker sub-agent
  │    → Update task file: status → "coding"
  │
  ├─ Task coding, container still running?
  │    → Do nothing, let it work
  │
  ├─ Task coding, container exited, PR opened?
  │    → Update task file: status → "pr_open"
  │
  ├─ Task pr_open, CI passed?
  │    → Update task file: status → "ready_to_merge"
  │    → (Only YOU merge. Pi never merges.)
  │
  ├─ Task pr_open, CI failed?
  │    → Read the error log
  │    → Can Pi fix it? (clear error, obvious fix)
  │       → Yes: spawn new sub-agent with fix prompt
  │       → No:  status → "needs_human"
  │              Write the question to the task file
  │
  ├─ Task needs_human, you've replied in the task file?
  │    → Read your input, act on it
  │
  └─ Task ready_to_merge?
       → Do nothing. Only you merge. Always.
```

**Two cron jobs:**

```cron
# Hourly: wake Pi to process task queue
0 * * * * cd /path/to/main-agent && python cron_handler.py >> logs/cron.log 2>&1

# Daily at 2am: housekeeping — organize memories, file conversations, rename files
0 2 * * * cd /path/to/main-agent && python housekeeping.py >> logs/housekeeping.log 2>&1
```

**Daily housekeeping cron (`housekeeping.py`):**

A separate script (NOT routed through Pi) that tidies up the memory folder:

```python
def daily_housekeeping():
    """Runs once a day at 2am. Organizes the memory folder."""

    # 1. Sort inbox conversations into project folders
    #    Read each conversation, determine project, move to projects/<name>/conversations/
    for conv in glob("memory/conversations/inbox/*.md"):
        project = detect_project(conv)      # read frontmatter or ask Pi
        summary = summarize_if_missing(conv) # generate a 1-line summary
        new_name = slugify(summary) + ".md"  # e.g. "plan-simplification-2026-03-06.md"
        move(conv, f"memory/projects/{project}/conversations/{new_name}")

    # 2. Rename poorly-named memory files to descriptive names
    #    Pi sometimes creates files with timestamps — rename to describe content
    for mem in all_memory_files():
        if is_timestamp_name(mem):
            summary = read_frontmatter(mem).summary
            new_name = slugify(summary) + ".md"
            rename(mem, new_name)

    # 3. Update project context.md files with recent memory links
    for project in list_projects():
        recent = get_recent_memories(project, days=7)
        update_recent_memories_section(project, recent)

    # 4. Update overview.md with current project statuses
    update_overview()
```

This cron uses Pi for one thing only: summarizing conversations that don't have a summary yet. Everything else is deterministic file operations — no LLM needed.

**Why a separate housekeeping script:**
- Organizing files doesn't need the full agent loop
- Deterministic operations (move, rename) shouldn't depend on LLM output
- Runs at 2am — no one is using the system
- Keeps the memory folder clean without you having to think about it

**Security model — separation of concerns:**

| Layer | Access | Can do |
|---|---|---|
| **Cron** | Nothing. Just calls `handle_message()`. | Wake Pi. That's it. |
| **Pi (the brain)** | Memory files, Docker, GitHub API | Spawn sub-agents, check status, update tasks, ask human |
| **Pi guardrails** | Enforced in `execute_allowed_actions()` | Only actions from allowlist. Never merge. Never invent tasks. |
| **You (human)** | Review UI, direct chat | Merge PRs, create tasks, answer Pi's questions |

**What Pi can never do (enforced in code, not just prompt):**
- Merge a PR
- Create a task (only you create tasks, via conversation)
- Access repos not listed in `memory/projects/`
- Spawn more than N concurrent sub-agents (configurable, default 3)

**Human-in-the-loop:**

When Pi encounters something it can't resolve, it marks the task `needs_human` and writes its question directly in the task `.md` file:

```markdown
## Needs Human Input
**Question:** CI failed with "missing env var DATABASE_URL". Should I:
1. Add a .env.example with the var?
2. Mock it in the test config?
3. Something else?

**Your answer:** (write here, Pi will read it next cron cycle)
```

You answer by editing the file (or via the Review UI). Next cron cycle, Pi reads your answer and continues.

---

### 5. Review UI — Tabs Per Task

**What it is:** A minimal web app where each tab is a sub-agent task. Shows the prompt, the diff, and merge/reject buttons.

**Tech stack:** React + Vite (reuse from existing dashboard, but strip it down massively).

**Pages:**

```
/                     → Task list (all active tasks as tabs)
/task/:id             → Single task view
```

**Task view contents:**
1. **Header:** Task ID, project name, status badge, timestamps
2. **Prompt:** What the sub-agent was asked to do
3. **Diff viewer:** Embedded GitHub PR diff (or inline diff component)
4. **Actions:** Merge, Reject, Request Changes, Re-run
5. **Log:** Container output / agent conversation log

**Data source:** No database. The UI reads from:
- `memory/tasks/active/*.md` — task metadata (via a tiny API or direct file read)
- GitHub API — PR diff, CI status, merge action
- Docker API — container status (running/exited)

**API (~80 lines):**
```python
# api.py — FastAPI, serves tasks + chat to the UI

# --- Tasks ---
@app.get("/tasks")
def list_tasks():
    return memory.list_all_tasks()

@app.get("/tasks/{task_id}")
def get_task(task_id: str):
    return memory.load_task(task_id)

@app.post("/tasks/{task_id}/merge")
def merge_task(task_id: str):
    task = memory.load_task(task_id)
    github.merge_pr(task.pr)
    memory.move_to_completed(task_id)

@app.post("/tasks/{task_id}/reject")
def reject_task(task_id: str):
    task = memory.load_task(task_id)
    github.close_pr(task.pr)
    memory.update_task(task_id, status="rejected")

# --- Chat ---
@app.post("/chat")
def chat(message: str, conversation_id: str = None):
    response = handle_message(message, conversation_id)
    return {"response": response, "conversation_id": conversation_id}

@app.get("/conversations")
def list_conversations():
    return memory.list_all_conversations()

@app.get("/conversations/{conv_id}")
def get_conversation(conv_id: str):
    return memory.load_conversation(conv_id)

@app.post("/conversations/new")
def new_conversation():
    conv_id = memory.create_conversation()
    return {"conversation_id": conv_id}
```

**Review UI components:**

The frontend has two main views — chat and tasks — as top-level tabs.

```
┌──────────────────────────────────────────────────────────┐
│  [Chat]  [Tasks]                              phoung │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  (content area — switches based on active tab)           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Chat tab (`ChatView.tsx`):**
- Sidebar: list of conversations (from `/conversations` API). New Chat button at top.
- Main area: message thread for the selected conversation.
- Input bar at bottom: type message → `POST /chat` with `conversation_id`.
- Pi's response streams in. Actions Pi takes (spawned agent, created memory, etc.) shown as inline status cards in the chat.
- Clicking a conversation loads its history from the API.

**Tasks tab (`App.tsx` + `TaskTab.tsx`):**
- Sub-tabs across the top: one per active task, labeled by task name.
- Each task tab shows:
  1. **Status bar:** Task ID, project, status badge (pending/coding/pr_open/ready_to_merge/needs_human/failed), timestamps
  2. **Prompt section:** What Pi told the sub-agent to do (collapsible)
  3. **Diff viewer:** If PR exists — embedded GitHub diff (use `react-diff-viewer` or iframe to GitHub PR)
  4. **CI status:** Pass/fail badges pulled from GitHub checks API
  5. **Human input:** If status is `needs_human` — shows Pi's question + text input for your answer
  6. **Actions bar:** Merge button (calls `POST /tasks/:id/merge`), Reject button, Re-run button
  7. **Log:** Container stdout/stderr if available

**Data flow:**
```
Review UI ←→ Python API (api.py, port 8000)
                ├── /chat              → handle_message() → Pi
                ├── /tasks             → reads memory/projects/*/tasks/
                ├── /tasks/:id/merge   → github.merge_pr()
                ├── /conversations     → reads memory/conversations/
                └── /conversations/new → creates new conversation file
```

All state comes from `.md` files and GitHub API. No database. The UI polls `/tasks` every 30 seconds to update status badges.

---

## Deployment

**Where it runs:** Hetzner VPS (reuse existing infra from v1) or local Mac for dev.

**What gets deployed:**

| Component | How | Port |
|---|---|---|
| Python API (`api.py`) | Docker container | 8000 |
| Review UI (React) | Docker container (Vite build → Nginx static) | 3000 |
| Cron (hourly + daily) | Host crontab pointing into the API container | N/A |
| Sub-agent containers | Spawned on-demand by API container via Docker socket | N/A |

**`docker-compose.yml`:**

```yaml
services:
  api:
    build: ./main-agent
    ports:
      - "8000:8000"
    volumes:
      - ./memory:/app/memory
      - /var/run/docker.sock:/var/run/docker.sock  # to spawn sub-agents
    env_file: .env

  review-ui:
    build: ./review-ui
    ports:
      - "3000:80"
    depends_on:
      - api

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - api
      - review-ui
```

**Nginx config (simple):**

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://review-ui:80;
    }

    location /api/ {
        proxy_pass http://api:8000/;
    }
}
```

**Ansible — one simple playbook (`deploy.yml`):**

```yaml
- hosts: phoung
  tasks:
    - name: Install Docker
      apt:
        name: [docker.io, docker-compose-plugin]
        state: present

    - name: Copy project files
      synchronize:
        src: ../
        dest: /opt/phoung/
        rsync_opts: ["--exclude=.git", "--exclude=node_modules"]

    - name: Copy env file
      copy:
        src: ../.env
        dest: /opt/phoung/.env
        mode: "0600"

    - name: Build and start services
      command: docker compose up -d --build
      args:
        chdir: /opt/phoung

    - name: Set up SSL
      command: certbot --nginx -d your-domain.com --non-interactive --agree-tos -m you@email.com
      args:
        creates: /etc/letsencrypt/live/your-domain.com/fullchain.pem

    - name: Install cron jobs
      cron:
        name: "{{ item.name }}"
        minute: "{{ item.minute }}"
        hour: "{{ item.hour }}"
        job: "{{ item.job }}"
      loop:
        - name: "Hourly: wake Pi"
          minute: "0"
          hour: "*"
          job: "docker exec phoung-api-1 python cron_handler.py >> /var/log/phoung-cron.log 2>&1"
        - name: "Daily: housekeeping"
          minute: "0"
          hour: "2"
          job: "docker exec phoung-api-1 python housekeeping.py >> /var/log/phoung-housekeeping.log 2>&1"

    - name: Build sub-agent image
      command: docker build -t phoung/subagent:latest ./subagent
      args:
        chdir: /opt/phoung
```

**Deploy command:**
```bash
ansible-playbook -i inventory.ini deploy.yml
```

**That's it.** One playbook, one `docker-compose.yml`, one Nginx config. Compared to v1's 5 playbooks and complex Nginx routing.

**Local dev (no Ansible needed):**
```bash
docker compose up -d
# Cron runs manually or via local crontab
```

---

## What Gets Killed From v1

| v1 Component | Lines / Endpoints | Verdict |
|---|---|---|
| Control API (Express) | ~35 endpoints, 6 DB tables | **Kill.** Replace with ~50-line Python API reading .md files |
| PostgreSQL | 6 tables | **Kill.** Memory is .md files. State is GitHub PRs. |
| Agent Bridge | Heartbeat, command polling, skills | **Kill.** Sub-agents are fire-and-forget Docker containers. |
| OpenClaw Gateway | WebSocket RPC, sessions | **Kill.** Pi API direct. No gateway needed. |
| Nginx config | Tunnel vs public, auth routing | **Kill.** Local-only or simple reverse proxy. |
| Ansible playbooks (5) | Server provisioning | **Simplify.** One script or docker-compose for local. |
| Dashboard (full React app) | 15 components, 6 views | **Gut.** Keep React/Vite, strip to 1 view: task tabs. |
| `check-agents.sh` | Tmux + gh status checks | **Replace.** Cron handler in Python. |
| `merge-pr.sh` | gh merge + cleanup | **Keep logic.** Move into API merge endpoint. |
| `spawn-agent.sh` | Worktree + tmux + agent | **Simplify.** Docker container instead of tmux. |

**Before:** 5 services, ~35 endpoints, 6 DB tables, 4 shell scripts, 5 Ansible playbooks
**After:** 3 containers (Python API + React UI + Nginx), ~10 API endpoints, 0 DB tables, 2 cron jobs, 1 Ansible playbook

---

## File Structure — Final

```
phoung-v2/
├── main-agent/
│   ├── agent.py              # Core agent loop (~200 lines)
│   ├── pi_client.py          # Pi API wrapper (swappable)
│   ├── spawner.py            # Docker sub-agent spawner
│   ├── memory.py             # .md file read/write, project navigation
│   ├── github_client.py      # GitHub API (PRs, status, repo read)
│   ├── cron_handler.py       # 3 lines: wake Pi
│   ├── housekeeping.py       # Daily cron: organize files, rename, sort conversations
│   ├── api.py                # Tiny API for Review UI
│   ├── config.py             # Settings
│   └── requirements.txt
├── subagent/
│   ├── Dockerfile            # Sub-agent container image
│   └── entrypoint.sh         # Clone, branch, run agent, PR
├── memory/
│   ├── system-prompt.md      # Pi's identity and rules
│   ├── overview.md           # All projects, basic context, folder pointers
│   ├── conversations/
│   │   └── inbox/            # New chats land here, daily cron sorts them
│   ├── projects/
│   │   ├── phoung/
│   │   │   ├── context.md    # Full project context
│   │   │   ├── memories/     # Project-specific memories
│   │   │   ├── conversations/ # Sorted conversation history
│   │   │   └── tasks/
│   │   │       ├── active/
│   │   │       └── completed/
│   │   ├── streaming-site/
│   │   │   ├── context.md
│   │   │   ├── memories/
│   │   │   ├── conversations/
│   │   │   └── tasks/
│   │   └── (more projects...)
│   ├── general/              # Cross-project memories, general chats
│   │   ├── memories/
│   │   └── conversations/
│   └── logs/
│       └── cron-2026-03-06.md
├── review-ui/
│   ├── src/
│   │   ├── App.tsx           # Tab-based task viewer + chat interface
│   │   ├── TaskTab.tsx       # Single task: prompt, diff, actions
│   │   ├── ChatView.tsx      # New chat / continue historical chat
│   │   └── api.ts            # Fetch from Python API
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env                      # Pi API key, GitHub token
└── README.md
```

---

## Implementation Order

### Phase 1 — Core Agent (Day 1-2)
1. Set up `main-agent/` with `agent.py`, `pi_client.py`, `memory.py`
2. Create `memory/` folder structure with initial project `.md` files
3. Write `system-prompt.md` with business context and rules
4. Test: talk to Pi via CLI, confirm it reads/writes memory files

### Phase 2 — Sub-Agent Spawning (Day 2-3)
5. Build `subagent/Dockerfile` and `entrypoint.sh`
6. Write `spawner.py` to launch Docker containers
7. Test: spawn a sub-agent, verify it clones repo, runs claude, opens PR

### Phase 3 — Cron (Day 3)
8. Write `cron_handler.py` with status checking logic
9. Set up cron schedule
10. Test: create a task, let cron detect PR status changes

### Phase 4 — Review UI (Day 4-5)
11. Write `api.py` (4 endpoints)
12. Strip existing dashboard to single task-tabs view
13. Integrate GitHub diff viewer
14. Test: view task, see diff, merge from UI

### Phase 5 — Deployment (Day 5-6)
15. Write `docker-compose.yml` with api + review-ui + nginx
16. Write `nginx.conf` (SSL + reverse proxy)
17. Write `deploy.yml` Ansible playbook (one playbook, one command)
18. Set up cron jobs on server (hourly wake Pi + daily housekeeping)
19. Deploy to Hetzner VPS, verify end-to-end

### Phase 6 — End-to-End Test (Day 6)
20. Talk to Pi via chat → task created → sub-agent spawns → PR opened → review in UI → merge
21. Test cron: leave a pending task, verify Pi picks it up next cycle
22. Test housekeeping: leave conversations in inbox, verify daily cron sorts them
23. Move old v1 code to `archive/` branch

---

## Decisions Made

1. **Cron is a dumb alarm clock.** It has no logic, no Docker access, no GitHub access. It calls `handle_message("[CRON]...")` and that's it. Pi is always the decision-maker.
2. **Three interaction modes, one code path.** Live chat, immediate execution, and cron wake-up all go through the same `handle_message()`. The `[CRON]` prefix tells Pi nobody is listening.
3. **Human-in-the-loop.** Pi never merges. Pi never invents tasks. When stuck, Pi writes a question in the task file and waits for you.
4. **Queue by default, immediate on request.** Tasks are queued unless you say "now" / "urgent" / "immediately."
5. **Action allowlist enforced in code.** Pi's actions are parsed and validated against `ALLOWED_ACTIONS`. Forbidden actions are blocked and logged regardless of what the LLM says.

## Open Questions

1. **Pi API access** — Confirm Inflection API availability and rate limits. If restricted, Claude API is the drop-in fallback.
2. **Where does this run?** — Local Mac for now? Or Hetzner VPS? The cron needs to run somewhere persistent.
3. **GitHub auth for sub-agents** — Use a GitHub App token or personal access token? App token is safer (scoped permissions, no personal account risk).
4. **Multiple repos** — Should sub-agents be able to work across repos, or one repo per task?
5. **Concurrency** — Max number of simultaneous sub-agent containers? Default 3.

---

## Comparison

| Dimension | v1 (Current) | v2 (This Plan) |
|---|---|---|
| Services | 5 Docker containers | 2 (agent API + review UI) |
| Database | PostgreSQL, 6 tables | None (.md files) |
| API endpoints | ~35 | 4 |
| Shell scripts | 4 | 0 (Python replaces all) |
| Infra config | 5 Ansible playbooks + Terraform + complex Nginx | 1 Ansible playbook + docker-compose + simple Nginx |
| Agent orchestration | Agent Bridge + OpenClaw Gateway + WebSocket RPC | Direct Pi API call |
| State management | Postgres + polling + heartbeats | .md files + GitHub PRs |
| Code execution | Tmux sessions + worktrees | Docker containers |
| Memory | None (stateless) | .md files (persistent, human-readable) |
| Lines of code (est.) | ~5,000+ | ~500 |
| Setup time | Hours (Ansible, SSL, tunnel) | Minutes (pip install, docker build) |
