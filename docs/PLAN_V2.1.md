# Phoung v2.1 — Review UI Layout Overhaul

**Date:** 2026-03-08  
**Status:** Planned  
**Based on:** v2 architecture (running), Conductor layout analysis  
**Scope:** Review UI only — no backend or agent changes

---

## Problem

The current Review UI is a centered single-column layout with 3 top-level tabs (Chat, Tasks, Logs). This works, but it doesn't match how you actually use the tool:

- You switch between Chat and Tasks constantly — tabs hide one to show the other
- Logs are isolated in their own tab, so you lose context when checking them
- Task status isn't visible while chatting — you have to switch tabs to see what's happening
- The layout doesn't use horizontal space well on a wide monitor

Conductor (a Mac app for code review) solves these problems with a 3-panel IDE-like layout: persistent sidebar for navigation, main content area, and contextual side panels. Their approach is well-suited to a dev ops tool like this.

---

## Target Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Phoung                                     [model] [new chat] [⚙]  │
├────────────┬─────────────────────────────────┬───────────────────────┤
│            │                                 │                       │
│  SIDEBAR   │         MAIN CONTENT            │    CONTEXT PANEL      │
│            │                                 │    (conditional)      │
│  Tasks     │  Chat / Task detail             │                       │
│  --------  │                                 │  File changes         │
│  task-005  │                                 │  PR info              │
│    Coding  │                                 │  CI status            │
│  task-006  │                                 │                       │
│    PR Open │                                 │                       │
│  task-007  │                                 │                       │
│    Ready   │                                 │                       │
│            │                                 │                       │
│  History   │                                 │                       │
│  --------  │                                 │                       │
│  conv-1    │                                 │                       │
│  conv-2    │                                 │                       │
│            │                                 │                       │
│            ├─────────────────────────────────┴───────────────────────┤
│            │  BOTTOM DRAWER (collapsible)                            │
│            │  Logs: [API] [UI] [Nginx]                               │
│            │  > 2026-03-08 14:30:02 INFO  Agent spawned for task-005 │
│            │  > 2026-03-08 14:30:05 INFO  Container abc123 running   │
├────────────┴────────────────────────────────────────────────────────┤
│  [input bar]                                         [Send] [model] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Changes — Ordered by Execution

### Step 1: Left Sidebar — Task & Conversation Rail

**What:** Replace the Tasks tab with a persistent left sidebar (~240px) that shows tasks and conversation history at all times.

**Why:** The biggest friction in the current UI. You can't see task status while chatting. Conductor keeps all projects/workspaces visible in a sidebar — same principle here.

**Details:**
- Top section: active tasks, each showing task ID, status badge, project name
- Bottom section: conversation history (replaces the toggle-able history panel in ChatView)
- Clicking a task loads its detail in the main content area
- Clicking a conversation loads it in the chat view
- Collapsible on mobile / narrow screens
- Active item highlighted

**Files touched:**
- `App.tsx` — new layout shell with sidebar + main content
- `ChatView.tsx` — remove inline history panel, sidebar handles it
- New: `Sidebar.tsx` — sidebar component with task list + conversation list

**Estimated size:** ~150 lines new (`Sidebar.tsx`), ~50 lines changed across App/Chat

---

### Step 2: Unified Main Content Area

**What:** The center pane switches between Chat view and Task detail view based on what's selected in the sidebar. No more top-level tabs.

**Why:** Top-level tabs force a full context switch. With the sidebar, the main area just shows whatever you clicked — chat by default, task detail when you click a task.

**Details:**
- Default view: Chat (same as current ChatView, minus the history panel)
- Task detail view: expanded version of current TaskCard — shows prompt, activity timeline, PR info, actions (merge/reject)
- Transition between views is instant (no page navigation)
- Back to chat via sidebar click or a breadcrumb

**Files touched:**
- `App.tsx` — route between ChatView and TaskDetailView based on sidebar selection
- New: `TaskDetailView.tsx` — extracted from TaskCard, full-width layout
- `TasksView.tsx` — becomes unnecessary as a standalone view (task list moves to sidebar, task detail becomes its own view)

**Estimated size:** ~200 lines new (`TaskDetailView.tsx`), ~80 lines changed in App

---

### Step 3: Bottom Drawer for Logs

**What:** Replace the Logs tab with a collapsible bottom drawer that persists across all views.

**Why:** Logs are a monitoring concern — you want them visible while doing other things, not hidden behind a tab. Conductor puts the terminal at the bottom for the same reason.

**Details:**
- Drawer is collapsed by default (just a thin bar showing "Logs" with a toggle)
- Expand to ~200px height, resizable
- Shows the same service tabs (API, UI, Nginx) as current LogsView
- Auto-scrolls, colorized output
- Stays open when switching between chat and task detail
- Keyboard shortcut to toggle (Ctrl+`)

**Files touched:**
- `App.tsx` — add drawer below main content area
- New: `LogsDrawer.tsx` — refactored from LogsView, adapted for drawer layout
- `LogsView.tsx` — gutted or deleted, logic moves to LogsDrawer
- Remove "Logs" from top-level tabs

**Estimated size:** ~120 lines new (`LogsDrawer.tsx`), ~30 lines changed in App

---

### Step 4: Context Panel for Task Details (Right Sidebar)

**What:** When viewing a task that has a PR, show a right panel (~280px) with file changes, diff counts, CI status, and quick links.

**Why:** Conductor's right panel showing "Changes 10" with per-file diff counts gives immediate scope understanding. Currently this info requires clicking through to GitHub.

**Details:**
- Only appears when viewing a task with a PR (not during chat)
- Shows: changed files list with +/- counts, CI check status, PR link, branch name
- Clicking a file could link to the GitHub diff for that file
- Collapsible
- Data source: GitHub API (already have `github_client.py`)

**Files touched:**
- `TaskDetailView.tsx` — conditionally render right panel
- New: `ContextPanel.tsx` — file changes list, CI badges, PR metadata
- `api.ts` — new endpoint call for PR file changes (may need backend addition)
- `types.ts` — types for file changes, CI status

**Estimated size:** ~130 lines new (`ContextPanel.tsx`), ~20 lines changed in TaskDetailView

**Backend dependency:** Needs a new API endpoint `GET /tasks/{id}/pr-files` that calls GitHub's PR files API. ~15 lines in `api.py`.

---

### Step 5: Richer Chat Messages

**What:** Render structured inline cards for agent actions within chat messages, instead of plain text.

**Why:** Conductor shows "13 tool calls, 7 messages" as collapsible blocks within the conversation. When Phoung spawns an agent or updates a task, that should be visually distinct from regular text.

**Details:**
- Parse Phoung's responses for action markers (spawn_subagent, update_task, etc.)
- Render as small inline cards: icon + action description + collapsible details
- Task references in chat become clickable links that navigate to the task in the sidebar
- Status changes shown as timeline dots inline

**Files touched:**
- `ChatView.tsx` — message rendering logic, parse action blocks
- New: `MessageCard.tsx` — renders a single message with optional inline action cards

**Estimated size:** ~100 lines new (`MessageCard.tsx`), ~40 lines changed in ChatView

---

### Step 6: Top Bar with Contextual Info

**What:** Replace the simple header with a context-aware top bar that shows relevant info based on what you're viewing.

**Why:** Conductor shows branch name, PR number, and merge button right in the top bar. Currently that info is buried in expanded task cards.

**Details:**
- Chat view: shows "Chat with Phoung", model selector, new chat button (similar to current)
- Task detail view: shows task ID, branch name, PR number, status badge, and merge/reject buttons
- Merge/reject actions accessible without scrolling

**Files touched:**
- `App.tsx` — top bar renders different content based on active view
- Remove action buttons from TaskDetailView (moved to top bar)

**Estimated size:** ~50 lines changed in App

---

## Execution Order Summary

| Step | What | New Files | Priority |
|------|------|-----------|----------|
| 1 | Left sidebar (tasks + history) | `Sidebar.tsx` | Must have |
| 2 | Unified main content (chat/task detail) | `TaskDetailView.tsx` | Must have |
| 3 | Bottom logs drawer | `LogsDrawer.tsx` | Must have |
| 4 | Right context panel (PR files, CI) | `ContextPanel.tsx` | Nice to have |
| 5 | Rich chat messages | `MessageCard.tsx` | Nice to have |
| 6 | Contextual top bar | — | Nice to have |

Steps 1-3 are the core layout transformation. Steps 4-6 are polish that can ship later.

---

## What Stays the Same

- Backend API (`api.py`) — no changes except one optional endpoint for step 4
- Agent logic (`agent.py`, `spawner.py`, `memory.py`) — untouched
- Styling system (Tailwind + CSS variables) — same dark/light theme
- Data flow (polling `/tasks` every 30s) — unchanged
- Component library (`badge.tsx`, `button.tsx`, `tabs.tsx`) — reused

## What Gets Deleted

- Top-level tab navigation (Chat / Tasks / Logs) — replaced by sidebar + drawer
- `TasksView.tsx` as a standalone page — task list moves to sidebar, detail becomes `TaskDetailView.tsx`
- Inline history toggle in `ChatView.tsx` — history moves to sidebar
- `LogsView.tsx` as a standalone page — becomes `LogsDrawer.tsx`

---

## Risks

1. **Mobile responsiveness** — The 3-panel layout needs a responsive fallback. On narrow screens, sidebar should collapse to an icon rail or hamburger menu. Plan for this during step 1, don't bolt it on later.
2. **PR file changes API** — Step 4 requires GitHub API calls for PR files. Rate limiting could be an issue if polling frequently. Cache the response for 60s.
3. **Message parsing** — Step 5 depends on Phoung's response format being parseable. If the format isn't consistent, the inline cards won't render reliably. May need to standardize the action output format in the API response.
