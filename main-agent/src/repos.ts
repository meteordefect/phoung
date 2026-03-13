import { execSync } from "node:child_process";
import { existsSync, mkdirSync, cpSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPOS_DIR, WORKSPACES_DIR, GITHUB_TOKEN } from "./config.js";
import * as memory from "./memory.js";

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: "utf-8", timeout: 120_000 }).trim();
}

function authedUrl(repoUrl: string): string {
  return repoUrl.replace("https://", `https://x-access-token:${GITHUB_TOKEN}@`);
}

export function repoDir(project: string): string {
  return join(REPOS_DIR, project);
}

export function workspaceDir(taskId: string): string {
  return join(WORKSPACES_DIR, taskId);
}

export function isCloned(project: string): boolean {
  return existsSync(join(repoDir(project), ".git"));
}

export function cloneRepo(project: string, repoUrl: string): void {
  ensureDir(REPOS_DIR);
  const dest = repoDir(project);
  if (isCloned(project)) {
    memory.log(`Repo ${project} already cloned at ${dest}`);
    return;
  }
  run(`git clone ${authedUrl(repoUrl)} ${dest}`);
  run("git config user.name \"Phoung Agent\"", dest);
  run("git config user.email \"agent@phoung.local\"", dest);
  memory.log(`Cloned ${repoUrl} to ${dest}`);
}

export function pullLatest(project: string): void {
  const dir = repoDir(project);
  if (!isCloned(project)) throw new Error(`Repo ${project} not cloned`);
  const branch = run("git rev-parse --abbrev-ref HEAD", dir);
  run(`git pull origin ${branch}`, dir);
}

export function createWorktree(project: string, taskId: string, branch: string): string {
  const dir = repoDir(project);
  if (!isCloned(project)) throw new Error(`Repo ${project} not cloned`);
  const wsDir = workspaceDir(taskId);
  ensureDir(WORKSPACES_DIR);
  run(`git worktree add ${wsDir} -b ${branch}`, dir);
  run("git config user.name \"Phoung Agent\"", wsDir);
  run("git config user.email \"agent@phoung.local\"", wsDir);
  memory.log(`Created worktree for ${taskId} at ${wsDir}`);
  return wsDir;
}

export function removeWorktree(project: string, taskId: string): void {
  const dir = repoDir(project);
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) return;
  try {
    run(`git worktree remove ${wsDir} --force`, dir);
  } catch {
    memory.log(`Warning: failed to remove worktree ${wsDir}, cleaning up manually`);
    try { run(`rm -rf ${wsDir}`); } catch {}
    try { run("git worktree prune", dir); } catch {}
  }
  memory.log(`Removed worktree for ${taskId}`);
}

export function injectContext(taskId: string, memoryFiles: string[]): void {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) throw new Error(`Workspace ${taskId} does not exist`);
  const injectedDir = join(wsDir, ".clawdeploy", "injected");
  ensureDir(injectedDir);
  for (const filePath of memoryFiles) {
    if (!existsSync(filePath)) continue;
    const filename = filePath.split("/").pop()!;
    cpSync(filePath, join(injectedDir, filename));
  }
}

export function injectProjectMemories(project: string, taskId: string): void {
  const memories = memory.listProjectMemories(project);
  const memDir = join(memory.getMemoryDir(), "projects", project, "memories");
  const files = memories.map(m => join(memDir, m.filename));
  if (files.length > 0) injectContext(taskId, files);
}

export function pushFromWorktree(taskId: string, branch: string): void {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) throw new Error(`Workspace ${taskId} does not exist`);
  run(`git push origin ${branch}`, wsDir);
  memory.log(`Pushed branch ${branch} from worktree ${taskId}`);
}

export function createPrFromWorktree(taskId: string, branch: string, title: string, body: string): string | null {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) return null;
  try {
    const url = run(
      `gh pr create --title "${title}" --body "${body.replace(/"/g, '\\"')}" --head ${branch}`,
      wsDir,
    );
    memory.log(`Created PR for ${taskId}: ${url}`);
    return url;
  } catch (e) {
    memory.log(`Failed to create PR for ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function hasUncommittedChanges(taskId: string): boolean {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) return false;
  const status = run("git status --porcelain", wsDir);
  return status.length > 0;
}

export function commitAndPush(taskId: string, branch: string, message: string): boolean {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) return false;
  try {
    run("git add -A", wsDir);
    const diff = run("git diff --cached --quiet", wsDir);
    return false;
  } catch {
    run(`git commit -m "${message.replace(/"/g, '\\"')}"`, wsDir);
    run(`git push origin ${branch}`, wsDir);
    return true;
  }
}

export function listClonedRepos(): string[] {
  ensureDir(REPOS_DIR);
  return readdirSync(REPOS_DIR).filter(d => existsSync(join(REPOS_DIR, d, ".git")));
}

export function bootstrapProjectContext(taskId: string): void {
  const wsDir = workspaceDir(taskId);
  if (!existsSync(wsDir)) return;
  const contextDir = join(wsDir, ".clawdeploy", "context");
  if (existsSync(contextDir)) return;
  ensureDir(contextDir);

  const routing = `# Project Context Routing

This directory contains context for AI agents working on this codebase.

## Files

- **patterns.md** — confirmed code conventions and patterns
- **decisions.md** — architectural choices with reasoning
- **debugging.md** — solutions to recurring problems

## How to use

Read the file relevant to your current task. Update files if you discover something important.
`;

  const patterns = `# Patterns & Conventions

No patterns documented yet. Update this file as conventions are confirmed.
`;

  const decisions = `# Architectural Decisions

No decisions documented yet. When making an architectural choice, record it here with reasoning.
`;

  const debugging = `# Debugging Notes

No debugging notes yet. When solving a recurring problem, document the solution here.
`;

  writeFileSync(join(contextDir, "ROUTING.md"), routing);
  writeFileSync(join(contextDir, "patterns.md"), patterns);
  writeFileSync(join(contextDir, "decisions.md"), decisions);
  writeFileSync(join(contextDir, "debugging.md"), debugging);
}
