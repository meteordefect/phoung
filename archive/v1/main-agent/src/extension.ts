import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import * as spawner from "./spawner.js";
import * as memory from "./memory.js";
import * as github from "./github.js";
import * as repos from "./repos.js";

export const spawnSubagentTool: ToolDefinition = {
  name: "spawn_subagent",
  label: "Spawn Sub-Agent",
  description:
    "Spawn a pi coding agent in a Docker container to execute a coding task. " +
    "The sub-agent will clone the repo, create a branch, make changes, and open a PR. " +
    "Use this when Marten asks you to build, fix, or modify code in a project.",
  parameters: Type.Object({
    task_id: Type.String({ description: "Unique task identifier, e.g. task-abc123" }),
    project: Type.String({ description: "Project name matching a directory in memory/projects/" }),
    prompt: Type.String({ description: "Detailed coding instructions for the sub-agent" }),
    agent_type: Type.Optional(Type.String({ description: "Agent type: pi (default)" })),
    model: Type.Optional(Type.String({ description: "LLM model override for the sub-agent, e.g. zai/glm-4, kimi-coding/kimi-k2.5, anthropic/claude-sonnet-4-20250514. Defaults to SUBAGENT_MODEL env var." })),
    reasoning_level: Type.Optional(Type.String({ description: "Reasoning/thinking level for the sub-agent: off, low, medium, high" })),
    context_files: Type.Optional(Type.Array(Type.String(), { description: "Additional memory file paths to inject into the workspace for this task" })),
  }),
  execute: async (_toolCallId, params) => {
    const { task_id, project, prompt, agent_type, model, reasoning_level, context_files } = params as {
      task_id: string; project: string; prompt: string; agent_type?: string; model?: string; reasoning_level?: string; context_files?: string[];
    };
    const config: Record<string, unknown> = {};
    if (model) config.model = model;
    if (reasoning_level) config.reasoning_level = reasoning_level;
    if (context_files?.length) config.context_files = context_files;
    if (agent_type) config.agent_type = agent_type;

    memory.createTask(task_id, project, prompt, config);
    memory.appendTaskActivity(task_id, {
      type: "phoung_note",
      message: `Spawning sub-agent for: ${prompt.slice(0, 120)}`,
    });
    await spawner.spawn(task_id, project, prompt, agent_type || "pi", model, context_files);
    return {
      content: [{ type: "text", text: `Sub-agent spawned for task ${task_id} in project ${project}.` }],
      details: {},
    };
  },
};

export const listTasksTool: ToolDefinition = {
  name: "list_tasks",
  label: "List Tasks",
  description: "List all active tasks across projects, showing their status.",
  parameters: Type.Object({}),
  execute: async () => {
    const tasks = memory.listAllTasks();
    if (tasks.length === 0) {
      return { content: [{ type: "text", text: "No active tasks." }], details: {} };
    }
    const lines = tasks.map(t =>
      `- ${t.meta.id} [${t.meta.status}] (${t.meta.project}): ${t.body.slice(0, 100)}`
    );
    return { content: [{ type: "text", text: lines.join("\n") }], details: {} };
  },
};

export const updateTaskTool: ToolDefinition = {
  name: "update_task",
  label: "Update Task",
  description: "Update the status or metadata of an existing task.",
  parameters: Type.Object({
    task_id: Type.String({ description: "Task identifier" }),
    status: Type.Optional(Type.String({ description: "New status: pending, queued, coding, pr_open, ready_to_merge, needs_human, completed, failed, rejected" })),
    note: Type.Optional(Type.String({ description: "Optional note about the update" })),
    pr: Type.Optional(Type.String({ description: "PR number if a PR was opened" })),
  }),
  execute: async (_toolCallId, params) => {
    const { task_id, ...updates } = params as { task_id: string; status?: string; note?: string; pr?: string };
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const task = memory.loadTask(task_id);
    if (!task) {
      return { content: [{ type: "text", text: `Task ${task_id} not found.` }], details: {} };
    }
    const oldStatus = task.meta.status as string;
    memory.updateTask(task_id, clean);
    if (clean.status && clean.status !== oldStatus) {
      memory.appendTaskActivity(task_id, { type: "status_change", from: oldStatus, to: clean.status });
    }
    return { content: [{ type: "text", text: `Task ${task_id} updated.` }], details: {} };
  },
};

export const askHumanTool: ToolDefinition = {
  name: "ask_human",
  label: "Ask Human",
  description:
    "Flag a task as needing human input. Use when you need Marten to make a decision. " +
    "Mode 'handoff' (default) pauses the task and waits for a reply. " +
    "Mode 'notify' records the message but does not pause the task.",
  parameters: Type.Object({
    task_id: Type.String({ description: "Task identifier" }),
    question: Type.String({ description: "The question for Marten" }),
    mode: Type.Optional(Type.String({ description: "Dispatch mode: 'handoff' (default, pauses task) or 'notify' (continues without waiting)" })),
  }),
  execute: async (_toolCallId, params) => {
    const { task_id, question, mode } = params as { task_id: string; question: string; mode?: string };
    const dispatchMode = mode === "notify" ? "notify" : "handoff";

    memory.storeDispatch(task_id, { mode: dispatchMode, question, ts: new Date().toISOString() });

    if (dispatchMode === "handoff") {
      memory.updateTask(task_id, { status: "needs_human", question });
    }

    memory.appendTaskActivity(task_id, {
      type: "phoung_note",
      message: `[${dispatchMode}] ${question}`,
    });

    return {
      content: [{ type: "text", text: `Task ${task_id} flagged for human input (${dispatchMode}).` }],
      details: {},
    };
  },
};

export const checkPrsTool: ToolDefinition = {
  name: "check_prs",
  label: "Check PRs",
  description: "Check open pull requests for a project's repository.",
  parameters: Type.Object({
    project: Type.String({ description: "Project name" }),
  }),
  execute: async (_toolCallId, params) => {
    const { project } = params as { project: string };
    const ctx = memory.loadProjectContext(project);
    const repoUrl = memory.extractRepoUrl(ctx);
    if (!repoUrl) {
      return { content: [{ type: "text", text: `No repo URL found for project ${project}.` }], details: {} };
    }
    const prs = await github.checkPrs(repoUrl);
    if (prs.length === 0) {
      return { content: [{ type: "text", text: "No open PRs." }], details: {} };
    }
    const lines = prs.map(pr =>
      `- #${pr.number}: ${pr.title} (${pr.branch}) — ${pr.checks.length} checks`
    );
    return { content: [{ type: "text", text: lines.join("\n") }], details: {} };
  },
};

export const createMemoryTool: ToolDefinition = {
  name: "create_memory",
  label: "Create Memory",
  description:
    "Create a persistent memory file. Use this to store important decisions, context, or knowledge " +
    "that should be remembered across conversations.",
  parameters: Type.Object({
    id: Type.String({ description: "Unique memory identifier" }),
    summary: Type.String({ description: "Brief summary (used as filename)" }),
    content: Type.String({ description: "Full memory content in markdown" }),
    tags: Type.Array(Type.String(), { description: "Tags for categorization" }),
    project: Type.Optional(Type.String({ description: "Project name, defaults to 'general'" })),
  }),
  execute: async (_toolCallId, params) => {
    const { id, summary, content, tags, project } = params as {
      id: string; summary: string; content: string; tags: string[]; project?: string;
    };
    memory.createMemory(id, content, tags, summary, project || "general");
    return { content: [{ type: "text", text: `Memory "${summary}" created.` }], details: {} };
  },
};

export const registerProjectTool: ToolDefinition = {
  name: "register_project",
  label: "Register Project",
  description:
    "Register a new project by cloning its repo locally and setting up the memory structure. " +
    "Use this when Marten mentions a new project or repo that isn't tracked yet.",
  parameters: Type.Object({
    name: Type.String({ description: "Project name (used as folder name)" }),
    repo_url: Type.String({ description: "GitHub repo URL, e.g. https://github.com/owner/repo" }),
    description: Type.Optional(Type.String({ description: "Brief project description" })),
    stack: Type.Optional(Type.String({ description: "Tech stack summary" })),
  }),
  execute: async (_toolCallId, params) => {
    const { name, repo_url, description, stack } = params as {
      name: string; repo_url: string; description?: string; stack?: string;
    };
    try {
      repos.cloneRepo(name, repo_url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Failed to clone repo: ${msg}` }], details: {} };
    }

    const contextMd = [
      `# ${name} — Project Context\n`,
      `## Repo\n${repo_url}\n`,
      description ? `## What is this\n${description}\n` : "",
      stack ? `## Tech stack\n${stack}\n` : "",
      `## Recent memories\nNone yet.\n`,
    ].filter(Boolean).join("\n");

    memory.createMemory(`${name}-registered`, `Registered project ${name}`, ["project", "registration"], `Registered project ${name} from ${repo_url}`, "general");

    const memDir = memory.getMemoryDir();
    const projectDir = `${memDir}/projects/${name}`;
    const { mkdirSync, existsSync, writeFileSync } = await import("node:fs");
    for (const sub of ["memories", "conversations", "tasks/active", "tasks/completed"]) {
      const dir = `${projectDir}/${sub}`;
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    writeFileSync(`${projectDir}/context.md`, contextMd);

    return {
      content: [{ type: "text", text: `Project "${name}" registered. Repo cloned and memory structure created.` }],
      details: {},
    };
  },
};

export const allTools: ToolDefinition[] = [
  spawnSubagentTool,
  listTasksTool,
  updateTaskTool,
  askHumanTool,
  checkPrsTool,
  createMemoryTool,
  registerProjectTool,
];
