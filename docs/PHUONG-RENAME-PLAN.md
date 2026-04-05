# Phoung → Phuong: Internal Code Rename Plan

User-facing strings, docs, and deploy configs have already been fixed. This plan covers the remaining internal code identifiers — file names, function names, type names, variable names, tRPC route keys, API paths, and session directory names.

## Risk

- **tRPC route key `phoung`** — The web UI calls `trpcClient.phoung.*`. Renaming the router key and the client calls must happen atomically.
- **API path `/api/phoung/chat`** — The chat panel fetches this URL directly. Server route and client fetch must match.
- **Session directory `.phoung-sessions`** — Existing sessions on disk use this name. Renaming breaks access to old sessions unless migrated.
- **Nginx site name `phoung`** on deployed VPS — The symlink at `/etc/nginx/sites-enabled/phoung` must be updated on the server, not just in the template. Requires an Ansible run or manual cleanup.

## Phase 1: Rename files (5 files)

Rename these source files. Every import referencing them updates in Phase 2.

| Current path | New path |
|---|---|
| `kanban/src/manager/phoung-context.ts` | `kanban/src/manager/phuong-context.ts` |
| `kanban/src/manager/phoung-session.ts` | `kanban/src/manager/phuong-session.ts` |
| `kanban/src/manager/phoung-tools.ts` | `kanban/src/manager/phuong-tools.ts` |
| `kanban/src/trpc/phoung-api.ts` | `kanban/src/trpc/phuong-api.ts` |
| `kanban/web-ui/src/components/phoung/phoung-chat-panel.tsx` | `kanban/web-ui/src/components/phuong/phuong-chat-panel.tsx` |

The `phoung/` directory under `components/` should be renamed to `phuong/` as well.

## Phase 2: Update imports (6 files)

These files import from the renamed files above and need their import paths updated.

| File | What changes |
|---|---|
| `kanban/src/manager/phoung-session.ts` (now `phuong-session.ts`) | `./phoung-context.js` → `./phuong-context.js`, `./phoung-tools.js` → `./phuong-tools.js` |
| `kanban/src/trpc/phoung-api.ts` (now `phuong-api.ts`) | `../manager/phoung-tools.js` → `../manager/phuong-tools.js`, `../manager/phoung-session.js` → `../manager/phuong-session.js` |
| `kanban/src/trpc/app-router.ts` | `./phoung-api.js` → `./phuong-api.js` |
| `kanban/src/server/runtime-server.ts` | `../trpc/phoung-api.js` → `../trpc/phuong-api.js`, `../manager/phoung-session.js` → `../manager/phuong-session.js` |
| `kanban/web-ui/src/App.tsx` | `@/components/phoung/phoung-chat-panel` → `@/components/phuong/phuong-chat-panel` |

## Phase 3: Rename exported symbols (across 7 files)

All renames are find-and-replace within each file, plus updating call sites in consumers.

### Functions

| Old name | New name | Defined in | Used in |
|---|---|---|---|
| `assemblePhoungSystemPrompt` | `assemblePhuongSystemPrompt` | `phuong-context.ts` | `phuong-session.ts` |
| `assemblePhoungContext` | `assemblePhuongContext` | `phuong-context.ts` | `phuong-session.ts` |
| `createPhoungSession` | `createPhuongSession` | `phuong-session.ts` | `phuong-session.ts` (internal) |
| `phoungChatStream` | `phuongChatStream` | `phuong-session.ts` | `runtime-server.ts` |
| `createPhoungTools` | `createPhuongTools` | `phuong-tools.ts` | `phuong-session.ts`, `phuong-api.ts` |
| `createPhoungApi` | `createPhuongApi` | `phuong-api.ts` | `runtime-server.ts` |

### Types / Interfaces

| Old name | New name | Defined in | Used in |
|---|---|---|---|
| `PhoungStreamEvent` | `PhuongStreamEvent` | `phuong-session.ts` | `phuong-session.ts` |
| `PhoungStreamCallback` | `PhuongStreamCallback` | `phuong-session.ts` | `phuong-session.ts`, `runtime-server.ts` (if re-exported) |
| `PhoungApi` | `PhuongApi` | `phuong-api.ts` | `app-router.ts` |
| `PhoungMessage` | `PhuongMessage` | `phuong-chat-panel.tsx` | `phuong-chat-panel.tsx` (local) |
| `PhoungModel` | `PhuongModel` | `phuong-chat-panel.tsx` | `phuong-chat-panel.tsx` (local) |
| `PhoungChatPanelProps` | `PhuongChatPanelProps` | `phuong-chat-panel.tsx` | `phuong-chat-panel.tsx` (local) |
| `PhoungChatPanel` | `PhuongChatPanel` | `phuong-chat-panel.tsx` | `App.tsx` |

### Variables

| Old name | New name | File |
|---|---|---|
| `isPhoungExpanded` | `isPhuongExpanded` | `project-navigation-panel.tsx` |
| `setIsPhoungExpanded` | `setIsPhuongExpanded` | `project-navigation-panel.tsx` |
| `EXPANDED_PHOUNG_WIDTH` | `EXPANDED_PHUONG_WIDTH` | `project-navigation-panel.tsx` |
| `isAgentExpanded` (references `isPhoungExpanded`) | no rename needed, just update the reference | `project-navigation-panel.tsx` |
| `phoungApi` (local variable) | `phuongApi` | `runtime-server.ts`, `app-router.ts` (context field) |

## Phase 4: Rename tRPC router key + API path

### tRPC router key

In `app-router.ts`, the router is keyed as `phoung: t.router({...})`. This must become `phuong: t.router({...})`.

**Both sides must update together:**
- Server: `app-router.ts` line 668
- Client: `phoung-chat-panel.tsx` — all `trpcClient.phoung.*` calls (lines 63, 84, 99)

### HTTP API path

The chat streaming endpoint lives at `/api/phoung/chat`.

- Server: `runtime-server.ts` line 257
- Client: `phoung-chat-panel.tsx` line 161

Both must change to `/api/phuong/chat`.

### Console log prefixes

In `phuong-session.ts`, update log prefixes from `[phoung]` to `[phuong]` (4 occurrences).

## Phase 5: Session directory name

`phuong-session.ts` and `session-history.ts` both reference `".phoung-sessions"` as the fallback session storage directory.

- Rename to `".phuong-sessions"`.
- **Migration note:** Any existing VPS with sessions stored under `~/.phoung-sessions` will lose access to old session history. Either accept that or add a one-time rename in the deploy playbook.

## Phase 6: Nginx site name (deploy)

`deploy/ansible/playbooks/site.yml` references `/etc/nginx/sites-available/phoung` and `/etc/nginx/sites-enabled/phoung`.

- Update template destination and symlink to use `phuong`.
- Add an Ansible task to remove the old symlink/file before creating the new one, to avoid a stale config.

## Execution order

1. **Phase 1** — Rename files (use `git mv` to preserve history)
2. **Phase 2** — Update all import paths
3. **Phase 3** — Rename all symbols (functions, types, variables)
4. **Phase 4** — Rename tRPC key + API path (server and client together)
5. **Phase 5** — Rename session directory string
6. **Phase 6** — Update nginx site name in Ansible
7. **Build + test** — `npm run build` in both `kanban/` and `kanban/web-ui/`, run `npm test`
8. **Deploy** — Run Ansible to clean up old nginx config on VPS

## Out of scope

- `archive/v1/` files — archived, not running, no value in renaming.
- Internal filenames that don't affect the product (e.g. the `phoung` directory on the component side is cosmetic in the built output).
