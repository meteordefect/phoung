import express from "express";
import cors from "cors";
import Dockerode from "dockerode";
import { API_HOST, API_PORT } from "./config.js";
import * as memory from "./memory.js";
import * as github from "./github.js";
import * as phoung from "./phoung.js";

const app = express();
app.use(cors());
app.use(express.json());

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });

// --- Health ---

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "3.0.0" });
});

// --- Tasks ---

app.get("/tasks", (_req, res) => {
  res.json(memory.listAllTasks());
});

app.get("/tasks/:taskId", (req, res) => {
  const task = memory.loadTask(req.params.taskId);
  if (!task) return res.status(404).json({ detail: "Task not found" });
  res.json(task);
});

app.post("/tasks/:taskId/merge", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });
    const pr = task.meta.pr as string | undefined;
    if (!pr) return res.status(400).json({ detail: "No PR associated with this task" });

    const ctx = memory.loadProjectContext((task.meta.project as string) || "");
    const repoUrl = memory.extractRepoUrl(ctx);
    if (!repoUrl) return res.status(400).json({ detail: "No repo URL found" });

    await github.mergePr(repoUrl, parseInt(pr, 10));
    memory.moveToCompleted(req.params.taskId);
    res.json({ status: "merged" });
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/tasks/:taskId/reject", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });
    const pr = task.meta.pr as string | undefined;
    if (pr) {
      const ctx = memory.loadProjectContext((task.meta.project as string) || "");
      const repoUrl = memory.extractRepoUrl(ctx);
      if (repoUrl) await github.closePr(repoUrl, parseInt(pr, 10));
    }
    memory.updateTask(req.params.taskId, { status: "rejected" });
    res.json({ status: "rejected" });
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/tasks/:taskId/stop", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });
    const containers = await docker.listContainers({
      filters: { label: ["clawdeploy.type=subagent", `clawdeploy.task=${req.params.taskId}`] },
    });
    if (containers.length === 0) return res.status(404).json({ detail: "No running agent found for this task" });
    for (const info of containers) {
      await docker.getContainer(info.Id).stop();
    }
    memory.updateTask(req.params.taskId, { status: "failed", note: "Manually stopped" });
    memory.appendTaskActivity(req.params.taskId, { type: "phoung_note", message: "Agent manually stopped by user" });
    res.json({ status: "stopped" });
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/tasks/:taskId/retry", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });
    memory.updateTask(req.params.taskId, { status: "pending", note: undefined, container_id: undefined, current_run: undefined });
    memory.appendTaskActivity(req.params.taskId, { type: "phoung_note", message: "Task retried by user" });
    res.json({ status: "retried" });
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/tasks/:taskId/activity", (req, res) => {
  const task = memory.loadTask(req.params.taskId);
  if (!task) return res.status(404).json({ detail: "Task not found" });
  res.json(memory.loadTaskActivity(req.params.taskId));
});

app.get("/tasks/:taskId/runs/:run/log", (req, res) => {
  const task = memory.loadTask(req.params.taskId);
  if (!task) return res.status(404).json({ detail: "Task not found" });
  const logText = memory.loadAgentLog(req.params.taskId, parseInt(req.params.run, 10));
  if (logText === null) return res.status(404).json({ detail: `No log found for run ${req.params.run}` });
  res.json({ task_id: req.params.taskId, run: parseInt(req.params.run, 10), log: logText });
});

app.get("/tasks/:taskId/pr-info", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });
    const pr = task.meta.pr as string | undefined;
    if (!pr) return res.status(400).json({ detail: "No PR associated with this task" });
    const ctx = memory.loadProjectContext((task.meta.project as string) || "");
    const repoUrl = memory.extractRepoUrl(ctx);
    if (!repoUrl) return res.status(400).json({ detail: "No repo URL found" });
    const details = await github.getPrDetails(repoUrl, parseInt(pr, 10));
    memory.updateTask(req.params.taskId, { additions: details.additions, deletions: details.deletions });
    res.json(details);
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

// --- Agents ---

app.get("/agents/running", async (_req, res) => {
  try {
    const containers = await docker.listContainers({
      filters: { label: ["clawdeploy.type=subagent"] },
    });
    const agents = [];
    for (const info of containers) {
      const inspect = await docker.getContainer(info.Id).inspect();
      agents.push({
        taskId: info.Labels["clawdeploy.task"] || "",
        containerId: info.Id.slice(0, 12),
        run: parseInt(info.Labels["clawdeploy.run"] || "0", 10),
        project: info.Labels["clawdeploy.project"] || "",
        agentType: info.Labels["clawdeploy.agent_type"] || "pi",
        startedAt: inspect.State.StartedAt,
      });
    }
    res.json(agents);
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/tasks/:taskId/dispatches", (req, res) => {
  const task = memory.loadTask(req.params.taskId);
  if (!task) return res.status(404).json({ detail: "Task not found" });
  res.json(memory.loadDispatches(req.params.taskId));
});

app.post("/tasks/:taskId/reply", async (req, res) => {
  try {
    const task = memory.loadTask(req.params.taskId);
    if (!task) return res.status(404).json({ detail: "Task not found" });

    const { message } = req.body;
    if (!message) return res.status(400).json({ detail: "message is required" });

    const replied = memory.replyToDispatch(req.params.taskId, message);
    if (!replied) return res.status(400).json({ detail: "No pending handoff dispatch to reply to" });

    memory.appendTaskActivity(req.params.taskId, {
      type: "phoung_note",
      message: `Human replied: ${message}`,
    });

    if (task.meta.status === "needs_human") {
      memory.updateTask(req.params.taskId, { status: "pending", question: undefined });
    }

    const project = task.meta.project as string || "";
    const convId = `task-reply-${req.params.taskId}`;
    const replyMsg = `[REPLY to task ${req.params.taskId}] ${message}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const send = (event: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await phoung.chatStream(replyMsg, convId, send);
      send({ type: "done", conversation_id: convId });
    } catch (e: unknown) {
      send({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
    res.end();
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

// --- Chat (SSE streaming) ---

app.post("/chat", async (req, res) => {
  const { message, conversation_id, model } = req.body;
  const convId = conversation_id || memory.createConversation();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await phoung.chatStream(message, convId, send, model || undefined);
    send({ type: "done", conversation_id: convId });
  } catch (e: unknown) {
    send({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }

  res.end();
});

app.get("/chat/active", (req, res) => {
  const convId = req.query.conversation_id as string;
  if (!convId) return res.status(400).json({ detail: "conversation_id required" });
  const turn = phoung.getActiveTurn(convId);
  res.json({ active: !!turn, turn });
});

// --- Conversations ---

app.get("/conversations", (_req, res) => {
  res.json(memory.listAllConversations());
});

app.get("/conversations/:convId", (req, res) => {
  const conv = memory.loadConversation(req.params.convId);
  if (!conv) return res.status(404).json({ detail: "Conversation not found" });
  res.json({ id: req.params.convId, content: conv });
});

app.post("/conversations/new", (_req, res) => {
  const convId = memory.createConversation();
  res.json({ conversation_id: convId });
});

// --- Models ---

app.get("/models", async (_req, res) => {
  try {
    const models = await phoung.getAvailableModels();
    res.json(models);
  } catch {
    res.json([]);
  }
});

// --- Projects ---

app.get("/projects", (_req, res) => {
  const projects = memory.listProjects();
  res.json(projects.map(name => ({
    name,
    context_preview: memory.loadProjectContext(name).slice(0, 200),
  })));
});

// --- Logs ---

const KNOWN_CONTAINERS: Record<string, string> = {
  api: "phoung-api",
  ui: "phoung-ui",
  nginx: "phoung-nginx",
};

app.get("/logs", (_req, res) => {
  res.json(Object.keys(KNOWN_CONTAINERS));
});

app.get("/logs/:service", async (req, res) => {
  const containerName = KNOWN_CONTAINERS[req.params.service];
  if (!containerName) return res.status(404).json({ detail: `Unknown service: ${req.params.service}` });

  const lines = Math.min(parseInt((req.query.lines as string) || "200", 10), 2000);
  try {
    const container = docker.getContainer(containerName);
    const logBuf = await container.logs({ tail: lines, timestamps: true, stdout: true, stderr: true });
    res.json({ service: req.params.service, container: containerName, logs: logBuf.toString("utf-8") });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("no such container") || msg.includes("404")) {
      return res.status(404).json({ detail: `Container ${containerName} not found` });
    }
    res.status(500).json({ detail: msg });
  }
});

// --- Session controls ---

app.get("/session/thinking", (req, res) => {
  const convId = req.query.conversation_id as string;
  if (!convId) return res.status(400).json({ detail: "conversation_id required" });
  res.json(phoung.getThinkingInfo(convId));
});

app.post("/session/thinking", (req, res) => {
  const { conversation_id, level } = req.body;
  if (!conversation_id) return res.status(400).json({ detail: "conversation_id required" });
  res.json(phoung.setThinkingLevel(conversation_id, level));
});

app.post("/session/compact", async (req, res) => {
  const { conversation_id } = req.body;
  if (!conversation_id) return res.status(400).json({ detail: "conversation_id required" });
  try {
    const result = await phoung.compactSession(conversation_id);
    res.json(result);
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/session/stats", (req, res) => {
  const convId = req.query.conversation_id as string;
  if (!convId) return res.status(400).json({ detail: "conversation_id required" });
  const stats = phoung.getSessionStats(convId);
  if (!stats) return res.json(null);
  res.json(stats);
});

// --- Cron ---

app.post("/cron/wake", async (_req, res) => {
  try {
    const { runCronCycle } = await import("./cron.js");
    await runCronCycle();
    res.json({ status: "ok" });
  } catch (e: unknown) {
    res.status(500).json({ detail: e instanceof Error ? e.message : String(e) });
  }
});

// --- Start ---

export function startServer() {
  app.listen(API_PORT, API_HOST, () => {
    console.log(`Phoung API v3.0.0 listening on ${API_HOST}:${API_PORT}`);
  });
}
