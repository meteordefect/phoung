import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { MEMORY_DIR } from "./config.js";

interface Frontmatter {
  [key: string]: unknown;
}

function parseFrontmatter(text: string): { meta: Frontmatter; body: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)/);
  if (!match) return { meta: {}, body: text };
  return { meta: (yaml.load(match[1]) as Frontmatter) || {}, body: match[2] };
}

function writeFrontmatter(meta: Frontmatter, body: string): string {
  const fm = yaml.dump(meta, { flowLevel: -1 }).trim();
  return `---\n${fm}\n---\n${body}`;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

function safeRead(path: string): string {
  try { return readFileSync(path, "utf-8"); } catch { return ""; }
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function globMd(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith(".md")).sort().map(f => join(dir, f));
}

export function getMemoryDir(): string {
  return MEMORY_DIR;
}

// --- Skills ---

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export function listSkills(): SkillDef[] {
  const dir = join(MEMORY_DIR, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(d => {
      const skillPath = join(dir, d, "SKILL.md");
      return statSync(join(dir, d)).isDirectory() && existsSync(skillPath);
    })
    .map(d => {
      const { meta } = parseFrontmatter(readFileSync(join(dir, d, "SKILL.md"), "utf-8"));
      return {
        id: (meta.id as string) || d,
        name: (meta.name as string) || d,
        description: (meta.description as string) || "",
        icon: (meta.icon as string) || "zap",
      };
    });
}

export function loadSkill(skillId: string): string | null {
  const p = join(MEMORY_DIR, "skills", skillId, "SKILL.md");
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf-8");
}

// --- Prompt / context loaders ---

export function loadSystemPrompt(): string {
  return safeRead(join(MEMORY_DIR, "system-prompt.md"));
}

export function loadSubagentPrompt(): string {
  return safeRead(join(MEMORY_DIR, "subagent-prompt.md")) || "{TASK_PROMPT}";
}

export function loadOverview(): string {
  return safeRead(join(MEMORY_DIR, "overview.md"));
}

export function loadProjectContext(project: string): string {
  return safeRead(join(MEMORY_DIR, "projects", project, "context.md"));
}

// --- Memory (knowledge) files ---

export function listProjectMemories(project: string): { filename: string; summary: string; tags: string[] }[] {
  const dir = join(MEMORY_DIR, "projects", project, "memories");
  return globMd(dir).map(f => {
    const { meta } = parseFrontmatter(readFileSync(f, "utf-8"));
    const name = f.split("/").pop()!;
    return { filename: name, summary: (meta.summary as string) || "", tags: (meta.tags as string[]) || [] };
  });
}

export function loadSpecificMemories(project: string, filenames: string[]): { filename: string; meta: Frontmatter; content: string }[] {
  return filenames.map(name => {
    const p = join(MEMORY_DIR, "projects", project, "memories", name);
    if (!existsSync(p)) return null;
    const { meta, body } = parseFrontmatter(readFileSync(p, "utf-8"));
    return { filename: name, meta, content: body };
  }).filter(Boolean) as { filename: string; meta: Frontmatter; content: string }[];
}

// --- Task management ---

export interface TaskData {
  filename: string;
  path?: string;
  meta: Frontmatter;
  body: string;
}

export function listAllTasks(): TaskData[] {
  const projectsDir = join(MEMORY_DIR, "projects");
  if (!existsSync(projectsDir)) return [];
  const tasks: TaskData[] = [];
  for (const proj of readdirSync(projectsDir).sort()) {
    const pd = join(projectsDir, proj);
    if (!statSync(pd).isDirectory()) continue;
    const activeDir = join(pd, "tasks", "active");
    for (const f of globMd(activeDir)) {
      const { meta, body } = parseFrontmatter(readFileSync(f, "utf-8"));
      meta.project = proj;
      tasks.push({ filename: f.split("/").pop()!, meta, body });
    }
  }
  return tasks;
}

export function listActiveTasks(project: string): TaskData[] {
  const dir = join(MEMORY_DIR, "projects", project, "tasks", "active");
  return globMd(dir).map(f => {
    const { meta, body } = parseFrontmatter(readFileSync(f, "utf-8"));
    return { filename: f.split("/").pop()!, meta, body };
  });
}

export function loadTask(taskId: string): TaskData | null {
  const projectsDir = join(MEMORY_DIR, "projects");
  if (!existsSync(projectsDir)) return null;
  for (const proj of readdirSync(projectsDir)) {
    const pd = join(projectsDir, proj);
    if (!statSync(pd).isDirectory()) continue;
    for (const sub of ["active", "completed"]) {
      const taskDir = join(pd, "tasks", sub);
      for (const f of globMd(taskDir)) {
        const text = readFileSync(f, "utf-8");
        const { meta, body } = parseFrontmatter(text);
        if (meta.id === taskId) {
          meta.project = proj;
          return { filename: f.split("/").pop()!, path: f, meta, body };
        }
      }
    }
  }
  return null;
}

export function createTask(taskId: string, project: string, prompt: string, config?: Record<string, unknown>) {
  const dir = join(MEMORY_DIR, "projects", project, "tasks", "active");
  ensureDir(dir);
  const filename = `${slugify(taskId)}.md`;
  const p = join(dir, filename);
  if (existsSync(p)) return;
  const meta: Frontmatter = {
    id: taskId,
    project,
    status: "pending",
    created: new Date().toISOString(),
    ...(config && Object.keys(config).length > 0 ? { config } : {}),
  };
  writeFileSync(p, writeFrontmatter(meta, `# ${taskId}\n\n## Prompt\n${prompt}\n`));
}

export function updateTask(taskId: string, updates: Record<string, unknown>) {
  const task = loadTask(taskId);
  if (!task?.path) return;
  const text = readFileSync(task.path, "utf-8");
  const { meta, body } = parseFrontmatter(text);
  Object.assign(meta, updates);
  writeFileSync(task.path, writeFrontmatter(meta, body));
}

export function moveToCompleted(taskId: string) {
  const task = loadTask(taskId);
  if (!task?.path) return;
  const src = task.path;
  const dest = resolve(src, "../../completed", task.filename);
  ensureDir(resolve(dest, ".."));
  const { meta, body } = parseFrontmatter(readFileSync(src, "utf-8"));
  meta.status = "completed";
  meta.completed = new Date().toISOString();
  writeFileSync(dest, writeFrontmatter(meta, body));
  unlinkSync(src);
}

// --- Activity tracking ---

function taskDirFor(taskId: string): string | null {
  const task = loadTask(taskId);
  if (!task?.path) return null;
  return resolve(task.path, "..");
}

export function appendTaskActivity(taskId: string, event: Record<string, unknown>) {
  const d = taskDirFor(taskId);
  if (!d) return;
  if (!event.ts) event.ts = new Date().toISOString();
  appendFileSync(join(d, `${taskId}-activity.jsonl`), JSON.stringify(event) + "\n");
}

export function loadTaskActivity(taskId: string): Record<string, unknown>[] {
  const d = taskDirFor(taskId);
  if (!d) return [];
  const p = join(d, `${taskId}-activity.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

export function saveAgentLog(taskId: string, run: number, logText: string) {
  const d = taskDirFor(taskId);
  if (!d) return;
  writeFileSync(join(d, `${taskId}-run-${run}.log`), logText);
}

export function loadAgentLog(taskId: string, run: number): string | null {
  const d = taskDirFor(taskId);
  if (!d) return null;
  const p = join(d, `${taskId}-run-${run}.log`);
  if (existsSync(p)) return readFileSync(p, "utf-8");
  return null;
}

// --- Dispatch / Reply ---

export interface Dispatch {
  mode: "handoff" | "notify";
  question: string;
  ts: string;
  reply?: string;
  replyTs?: string;
}

export function storeDispatch(taskId: string, dispatch: Dispatch) {
  const d = taskDirFor(taskId);
  if (!d) return;
  appendFileSync(join(d, `${taskId}-dispatches.jsonl`), JSON.stringify(dispatch) + "\n");
}

export function loadDispatches(taskId: string): Dispatch[] {
  const d = taskDirFor(taskId);
  if (!d) return [];
  const p = join(d, `${taskId}-dispatches.jsonl`);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8")
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l));
}

export function replyToDispatch(taskId: string, reply: string) {
  const dispatches = loadDispatches(taskId);
  let pending: Dispatch | undefined;
  for (let i = dispatches.length - 1; i >= 0; i--) {
    if (dispatches[i].mode === "handoff" && !dispatches[i].reply) {
      pending = dispatches[i];
      break;
    }
  }
  if (!pending) return false;
  pending.reply = reply;
  pending.replyTs = new Date().toISOString();
  const dir = taskDirFor(taskId);
  if (!dir) return false;
  writeFileSync(
    join(dir, `${taskId}-dispatches.jsonl`),
    dispatches.map(entry => JSON.stringify(entry)).join("\n") + "\n",
  );
  return true;
}

// --- Memory creation ---

export function createMemory(memoryId: string, content: string, tags: string[], summary: string, project = "general") {
  const dir = project === "general"
    ? join(MEMORY_DIR, "general", "memories")
    : join(MEMORY_DIR, "projects", project, "memories");
  ensureDir(dir);
  const filename = `${slugify(summary)}.md`;
  const meta: Frontmatter = {
    id: memoryId,
    date: new Date().toISOString().slice(0, 10),
    project,
    tags,
    summary,
  };
  writeFileSync(join(dir, filename), writeFrontmatter(meta, content));
}

// --- Logging ---

export function log(message: string) {
  const dir = join(MEMORY_DIR, "logs");
  ensureDir(dir);
  const today = new Date().toISOString().slice(0, 10);
  const ts = new Date().toISOString().slice(11, 19);
  appendFileSync(join(dir, `cron-${today}.md`), `- [${ts}] ${message}\n`);
}

// --- Conversations (pi-mono sessions supplement) ---

export function listAllConversations(): { id: string; project: string | null; started: string | null; summary: string | null; filename: string }[] {
  const results: { id: string; project: string | null; started: string | null; summary: string | null; filename: string }[] = [];
  const searchDirs = [join(MEMORY_DIR, "conversations", "inbox")];
  const projectsDir = join(MEMORY_DIR, "projects");
  if (existsSync(projectsDir)) {
    for (const p of readdirSync(projectsDir).sort()) {
      const d = join(projectsDir, p, "conversations");
      if (existsSync(d)) searchDirs.push(d);
    }
  }
  searchDirs.push(join(MEMORY_DIR, "general", "conversations"));

  for (const d of searchDirs) {
    for (const f of globMd(d).reverse()) {
      const { meta } = parseFrontmatter(readFileSync(f, "utf-8"));
      const name = f.split("/").pop()!;
      results.push({
        id: (meta.id as string) || name.replace(".md", ""),
        project: (meta.project as string) || null,
        started: (meta.started as string) || null,
        summary: (meta.summary as string) || null,
        filename: name,
      });
    }
  }
  return results;
}

export function loadConversation(conversationId: string): string | null {
  const searchDirs = [join(MEMORY_DIR, "conversations", "inbox")];
  const projectsDir = join(MEMORY_DIR, "projects");
  if (existsSync(projectsDir)) {
    for (const p of readdirSync(projectsDir)) {
      searchDirs.push(join(projectsDir, p, "conversations"));
    }
  }
  searchDirs.push(join(MEMORY_DIR, "general", "conversations"));

  for (const d of searchDirs) {
    for (const f of globMd(d)) {
      const text = readFileSync(f, "utf-8");
      const { meta } = parseFrontmatter(text);
      if (meta.id === conversationId) return text;
    }
  }
  return null;
}

export function createConversation(): string {
  const now = new Date();
  const convId = `conv-${now.toISOString().slice(0, 16).replace(/[T:]/g, "-")}`;
  const inbox = join(MEMORY_DIR, "conversations", "inbox");
  ensureDir(inbox);
  const meta: Frontmatter = { id: convId, project: null, started: now.toISOString(), summary: null };
  const filename = `${now.toISOString().slice(0, 13).replace("T", "-")}h${now.toISOString().slice(14, 16)}.md`;
  writeFileSync(join(inbox, filename), writeFrontmatter(meta, "\n"));
  return convId;
}

export function appendConversation(conversationId: string, userMsg: string, agentMsg: string) {
  const searchDirs = [join(MEMORY_DIR, "conversations", "inbox")];
  const projectsDir = join(MEMORY_DIR, "projects");
  if (existsSync(projectsDir)) {
    for (const p of readdirSync(projectsDir)) {
      searchDirs.push(join(projectsDir, p, "conversations"));
    }
  }

  for (const d of searchDirs) {
    for (const f of globMd(d)) {
      const text = readFileSync(f, "utf-8");
      const { meta, body } = parseFrontmatter(text);
      if (meta.id === conversationId) {
        const ts = new Date().toISOString().slice(11, 16);
        const newBody = body + `\n**Marten (${ts}):** ${userMsg}\n\n**Phoung (${ts}):** ${agentMsg}\n`;
        writeFileSync(f, writeFrontmatter(meta, newBody));
        return;
      }
    }
  }

  const inbox = join(MEMORY_DIR, "conversations", "inbox");
  ensureDir(inbox);
  const now = new Date();
  const ts = now.toISOString().slice(11, 16);
  const meta: Frontmatter = { id: conversationId, project: null, started: now.toISOString(), summary: null };
  const body = `\n**Marten (${ts}):** ${userMsg}\n\n**Phoung (${ts}):** ${agentMsg}\n`;
  const filename = `${now.toISOString().slice(0, 13).replace("T", "-")}h${now.toISOString().slice(14, 16)}.md`;
  writeFileSync(join(inbox, filename), writeFrontmatter(meta, body));
}

// --- Projects ---

export function listProjects(): string[] {
  const dir = join(MEMORY_DIR, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(d => statSync(join(dir, d)).isDirectory()).sort();
}

export function extractRepoUrl(projectContext: string): string | null {
  const match = projectContext.match(/github\.com\/[\w-]+\/[\w-]+/);
  return match ? `https://${match[0]}` : null;
}
