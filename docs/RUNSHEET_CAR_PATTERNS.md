# Runsheet: Patterns to Adopt from CAR (codex-autorunner)

Reference codebase: `reference/codex-autorunner/`

All changes keep our existing React + Tailwind + shadcn visual style. We are taking **architectural patterns**, not CAR's vanilla-TS UI code.

---

## 1. Event Bus for Cross-Panel Communication

**Problem**: Each view polls independently via `usePolling`. No coordination between panels -- when a task finishes, the merge queue doesn't know until its next poll cycle.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/bus.ts` -- a 22-line pub/sub that all panels use instead of importing each other.

**Implementation**:

- Create `review-ui/src/lib/eventBus.ts` and `deploy/dashboard/src/lib/eventBus.ts`
- Events: `task:updated`, `agent:status`, `chat:message`, `pr:merged`, `session:changed`
- SSE connection in `api.ts` publishes events to the bus on receipt
- Views subscribe to relevant events and trigger refetch only when notified
- Remove redundant independent polling from views that share the same data

**Files to change**:
| File | Change |
|------|--------|
| `review-ui/src/api.ts` | Add SSE listener that publishes to bus |
| `review-ui/src/App.tsx` | Subscribe to bus events for cross-panel refresh |
| `review-ui/src/TasksView.tsx` | Replace polling with bus subscription |
| `review-ui/src/Sidebar.tsx` | Subscribe to `task:updated` for badge counts |
| `deploy/dashboard/src/hooks/usePolling.ts` | Add bus-triggered refresh mode |
| `deploy/dashboard/src/views/TasksView.tsx` | Subscribe to `task:updated` |
| `deploy/dashboard/src/views/MergeQueueView.tsx` | Subscribe to `task:updated`, `pr:merged` |
| `deploy/dashboard/src/views/ActivityView.tsx` | Subscribe to `task:updated` |

**Estimated effort**: 2-3 hours

---

## 2. Smart Refresh (Signature-Based Render Skipping)

**Problem**: Polling re-renders the entire list even when data hasn't changed. Causes UI flicker and scroll position loss.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/smartRefresh.ts` -- computes a string signature of the payload, skips render if signature matches previous.

**Implementation**:

- Create `useSmartPolling` hook that wraps `usePolling`
- Accepts a `getSignature(data)` function
- Stores last signature in `useRef`
- Only updates state (triggering re-render) when signature changes
- Combine with `React.memo` on list item components

**Files to change**:
| File | Change |
|------|--------|
| `deploy/dashboard/src/hooks/usePolling.ts` | Add signature comparison before setState |
| `deploy/dashboard/src/views/TasksView.tsx` | Add signature function (hash of task ids + statuses) |
| `deploy/dashboard/src/views/MergeQueueView.tsx` | Add signature function |
| `deploy/dashboard/src/views/ActivityView.tsx` | Add signature function |
| `review-ui/src/TasksView.tsx` | Same pattern |
| `review-ui/src/Sidebar.tsx` | Same pattern for conversation list |

**Estimated effort**: 1-2 hours

---

## 3. Scroll Preservation Across Re-renders

**Problem**: When polling refreshes a list, scroll position resets to top.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/preserve.ts` -- `preserveScroll(container, renderFn)` saves scrollTop before render, restores after via `requestAnimationFrame`.

**Implementation**:

- Create `usePreserveScroll` hook
- Wraps a `ScrollArea` ref
- Before any data-driven re-render, captures `scrollTop`
- After React commit phase, restores it via `useLayoutEffect`
- Apply to all scrollable list views

**Files to change**:
| File | Change |
|------|--------|
| New: `deploy/dashboard/src/hooks/usePreserveScroll.ts` | Hook implementation |
| `deploy/dashboard/src/views/TasksView.tsx` | Wrap task list |
| `deploy/dashboard/src/views/MergeQueueView.tsx` | Wrap merge queue |
| `deploy/dashboard/src/views/ActivityView.tsx` | Wrap activity feed |
| `review-ui/src/TasksView.tsx` | Wrap task list |
| `review-ui/src/Sidebar.tsx` | Wrap conversation list |
| `review-ui/src/ChatView.tsx` | Wrap message list (preserve on re-render, auto-scroll on new message) |

**Estimated effort**: 1 hour

---

## 4. Page Visibility Pause for Polling

**Problem**: Polling continues when the browser tab is hidden, wasting bandwidth and server resources.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/autoRefresh.ts` -- uses `document.visibilitychange` to pause/resume timers. Immediate refresh on tab reactivation with debounce.

**Implementation**:

- Add `visibilitychange` listener to `usePolling` hook
- When hidden: clear interval
- When visible: immediate refetch + restart interval
- Debounce the reactivation refetch (500ms)

**Files to change**:
| File | Change |
|------|--------|
| `deploy/dashboard/src/hooks/usePolling.ts` | Add visibility API integration |
| `review-ui/src/api.ts` | Same for any polling in review-ui |

**Estimated effort**: 30 minutes

---

## 5. Chat-to-Edit with Draft/Patch Flow

**Problem**: Phoung edits files directly via sub-agents. No in-app review of proposed changes before they're committed.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/docChatCore.ts`, `docEditor.ts`, `fileChat.ts`, `diffRenderer.ts` -- chat produces a unified diff as a "draft", user reviews and applies/discards.

**Implementation**:

- Add a "context editor" panel in review-ui for editing project context files (`patterns.md`, `decisions.md`, `debugging.md`)
- Phoung can propose changes as diffs instead of direct writes
- UI shows a diff view with Apply / Discard buttons
- Track `base_hash` for conflict detection (file changed since draft was created)
- Reuse our existing `ContextPanel.tsx` component pattern

**Files to change**:
| File | Change |
|------|--------|
| `review-ui/src/ContextPanel.tsx` | Add edit mode with diff preview |
| New: `review-ui/src/components/DiffView.tsx` | Unified diff renderer |
| `review-ui/src/api.ts` | Add draft endpoints (create, apply, discard) |
| `main-agent/src/extension.ts` | Add `propose_edit` tool that creates drafts |
| `main-agent/src/server.ts` | Add draft API routes |
| `main-agent/src/memory.ts` | Draft storage and hash tracking |

**Reference files in CAR**:
- `reference/codex-autorunner/src/codex_autorunner/static_src/diffRenderer.ts` (36-line diff renderer)
- `reference/codex-autorunner/src/codex_autorunner/static_src/docChatCore.ts` (chat factory)
- `reference/codex-autorunner/src/codex_autorunner/static_src/contextspace.ts` (draft apply/discard flow, lines 553-588)

**Estimated effort**: 1-2 days

---

## 6. Structured Dispatch/Reply for ask_human

**Problem**: `ask_human` tool pauses but the reply flow is basic -- no structured message types, no file attachments, no auto-resume.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/messages.ts` -- dispatch modes (`notify` vs `pause/handoff`), threaded timeline with collapse, reply with attachments auto-resumes the flow.

**Implementation**:

- Add dispatch modes to `ask_human`: `notify` (agent continues) vs `handoff` (agent waits)
- Show dispatches as a threaded timeline in the chat view
- Reply form supports file attachments via `FormData`
- Submitting a reply auto-resumes the paused session
- Collapse old dispatches, expand only the latest

**Files to change**:
| File | Change |
|------|--------|
| `main-agent/src/extension.ts` | Add `mode` param to `ask_human` tool |
| `main-agent/src/phoung.ts` | Handle notify vs handoff modes |
| `main-agent/src/memory.ts` | Store dispatch/reply sequences |
| `main-agent/src/server.ts` | Add reply endpoint with file upload |
| `review-ui/src/ChatView.tsx` | Render dispatch/reply timeline |
| `review-ui/src/MessageCard.tsx` | Add dispatch card variant with reply form |
| `review-ui/src/api.ts` | Add reply API call |

**Reference files in CAR**:
- `reference/codex-autorunner/src/codex_autorunner/static_src/messages.ts` (dispatch/reply rendering, thread list)
- `reference/codex-autorunner/src/codex_autorunner/tickets/replies.py` (reply handling)
- `reference/codex-autorunner/src/codex_autorunner/core/flows/pause_dispatch.py` (pause/resume on dispatch)

**Estimated effort**: 1 day

---

## 7. Lazy Tab Initialization

**Problem**: All dashboard views fetch data on mount, even tabs the user hasn't visited.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/app.ts` lines 177-205 -- panels don't init until first activated. Uses a `Set<string>` to track which tabs have been initialized.

**Implementation**:

- Wrap each route's view component in a lazy wrapper
- First render of a tab triggers its data fetch
- Subsequent tab switches reuse cached data (refresh only via bus events or manual)
- Show skeleton loader on first visit

**Files to change**:
| File | Change |
|------|--------|
| `deploy/dashboard/src/App.tsx` | Wrap view components in lazy init |
| `deploy/dashboard/src/views/ActivityView.tsx` | Defer initial fetch |
| `deploy/dashboard/src/views/Files.tsx` | Defer initial fetch |
| `deploy/dashboard/src/views/Settings.tsx` | Defer initial fetch |

**Estimated effort**: 1 hour

---

## 8. Task Frontmatter for Agent/Model/Context Config

**Problem**: Task definitions are plain text descriptions. No structured way to specify which agent, model, reasoning level, or context files a task should use.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/tickets/frontmatter.py` and `reference/codex-autorunner/src/codex_autorunner/tickets/models.py` -- YAML frontmatter with `agent`, `model`, `reasoning`, `context` fields.

**Implementation**:

- When creating a task, allow optional structured config: model override, reasoning level, context file includes
- Store as JSON fields on the task record (we use PostgreSQL, not files)
- Sub-agent spawner reads these overrides when launching containers
- UI shows config in task detail view with edit capability

**Files to change**:
| File | Change |
|------|--------|
| `deploy/control-api/src/routes/tasks.ts` | Accept config fields on task create/update |
| New migration: `deploy/control-api/src/migrations/004_task_config.sql` | Add config columns |
| `deploy/dashboard/src/views/TasksView.tsx` | Config fields in create dialog |
| `deploy/dashboard/src/views/TasksView.tsx` | Show config in task detail |
| `main-agent/src/spawner.ts` | Read config overrides when spawning |

**Reference files in CAR**:
- `reference/codex-autorunner/src/codex_autorunner/tickets/frontmatter.py` (parsing)
- `reference/codex-autorunner/src/codex_autorunner/tickets/runner_prompt.py` (context injection)

**Estimated effort**: 3-4 hours

---

## 9. Inbox Badge Counts and Notification Bell

**Problem**: No visual indicator when tasks need attention. User must manually check each tab.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/notificationBell.ts` -- badge count on the inbox tab, updated via polling. Also `reference/codex-autorunner/src/codex_autorunner/static_src/tabs.ts` for per-tab badge rendering.

**Implementation**:

- Add badge counts to sidebar nav items: Tasks (pending review), Merge Queue (ready to merge), Chat (unread messages)
- Poll a lightweight `/api/counts` endpoint that returns `{ tasks_pending: N, merge_ready: N, unread: N }`
- Update badges via event bus when SSE events arrive

**Files to change**:
| File | Change |
|------|--------|
| `deploy/control-api/src/routes/tasks.ts` | Add `/counts` endpoint |
| `deploy/dashboard/src/components/Layout.tsx` | Add badge counts to nav items |
| `deploy/dashboard/src/api/client.ts` | Add counts fetch |
| `review-ui/src/Sidebar.tsx` | Add badge counts |

**Estimated effort**: 1-2 hours

---

## 10. SSE Live Updates (Replace Pure Polling)

**Problem**: Dashboard relies entirely on polling. No real-time push when agents complete work, tasks change status, or PRs are created.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/liveUpdates.ts` + `reference/codex-autorunner/src/codex_autorunner/core/sse.py` -- SSE connection diffs state snapshots and publishes bus events. Polling is a fallback, not the primary mechanism.

**Implementation**:

- Add SSE endpoint to control-api: `GET /api/events/stream`
- Emit events on: task status change, agent heartbeat, PR update, merge complete
- Dashboard opens SSE connection on mount
- SSE handler publishes to event bus (item 1)
- Keep polling as fallback with longer interval (30s instead of 5s)

**Files to change**:
| File | Change |
|------|--------|
| `deploy/control-api/src/index.ts` | Add SSE event emitter |
| New: `deploy/control-api/src/routes/stream.ts` | SSE endpoint |
| `deploy/dashboard/src/api/client.ts` | Add SSE connection manager |
| `deploy/dashboard/src/hooks/usePolling.ts` | Reduce frequency when SSE is active |

**Reference files in CAR**:
- `reference/codex-autorunner/src/codex_autorunner/core/sse.py` (format_sse utility)
- `reference/codex-autorunner/src/codex_autorunner/surfaces/web/routes/shared.py` (SSE generators with heartbeat)
- `reference/codex-autorunner/src/codex_autorunner/static_src/liveUpdates.ts` (client-side state diffing)

**Estimated effort**: 3-4 hours

---

## 11. Turn Recovery for Chat Sessions

**Problem**: If the page reloads during a streaming chat response, the message is lost.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/ticketChatActions.ts` lines 361-366 and `reference/codex-autorunner/src/codex_autorunner/static_src/turnResume.ts` -- saves `clientTurnId` to localStorage before sending. On reload, polls server to reconnect to the running turn's event stream.

**Implementation**:

- Before sending a chat message, save `{ clientTurnId, message, timestamp }` to localStorage
- On mount, check for pending turns
- If found, poll `/chat/active?client_turn_id=X` to check if turn is still running
- If running, reconnect to SSE stream from where it left off
- Clear pending turn on completion

**Files to change**:
| File | Change |
|------|--------|
| `review-ui/src/ChatView.tsx` | Save pending turn before send, resume on mount |
| `review-ui/src/api.ts` | Add active turn check and resume endpoints |
| `main-agent/src/server.ts` | Add `/chat/active` endpoint |
| `main-agent/src/phoung.ts` | Track active turns by client ID |

**Estimated effort**: 3-4 hours

---

## 12. Custom Markdown Renderer (Security-First)

**Problem**: If we're rendering user/agent markdown in chat or context panels, we need safe rendering.

**Pattern from CAR**: `reference/codex-autorunner/src/codex_autorunner/static_src/messages.ts` lines 516-621 -- escapes HTML first, extracts code blocks, then applies formatting. Blocks `javascript:`, `data:`, `vbscript:` URLs.

**Implementation**:

- Audit our current markdown rendering in `MessageCard.tsx`
- Ensure HTML is escaped before processing
- Block unsafe URL protocols in rendered links
- Extract code blocks before inline formatting to prevent injection

**Files to check/change**:
| File | Change |
|------|--------|
| `review-ui/src/MessageCard.tsx` | Audit markdown rendering for XSS |
| `deploy/dashboard/src/views/ActivityView.tsx` | Audit any rendered markdown |

**Estimated effort**: 1 hour

---

## Priority Order

| # | Item | Impact | Effort | Status |
|---|------|--------|--------|--------|
| 4 | Page visibility pause | High | 30 min | DONE |
| 3 | Scroll preservation | High | 1 hr | DONE |
| 2 | Smart refresh | High | 1-2 hr | DONE |
| 7 | Lazy tab init | Medium | 1 hr | DONE |
| 1 | Event bus | High | 2-3 hr | DONE |
| 9 | Inbox badge counts | Medium | 1-2 hr | DONE |
| 10 | SSE live updates | High | 3-4 hr | DONE |
| 6 | Dispatch/reply for ask_human | Medium | 1 day | DONE |
| 8 | Task frontmatter config | Medium | 3-4 hr | DONE |
| 11 | Turn recovery | Medium | 3-4 hr | DONE |
| 5 | Chat-to-edit with draft/patch | High | 1-2 days | Next sprint |
| 12 | Markdown security audit | Low | 1 hr | N/A (React escapes by default) |

---

## Not Taking From CAR

These CAR features are interesting but not aligned with our architecture:

- **Vanilla TS UI**: We keep React + shadcn. Copy patterns, not code.
- **File-based state**: We already use file-based state with YAML frontmatter, similar to CAR. No further adoption needed.
- **PTY web terminal**: Interesting but not in scope -- our sub-agents run headless in containers.
- **Multi-project hub mounting**: CAR mounts FastAPI sub-apps dynamically. Our control-api already handles multi-project via project_id scoping.
- **Template repos**: CAR fetches ticket templates from GitHub repos. We define tasks via chat or UI, not template repos.
- **Voice/Whisper integration**: Out of scope for now.
- **Telegram/Discord bots**: Out of scope for now.
