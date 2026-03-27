import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { MEMORY_DIR, KIMI_API_KEY, ZAI_API_KEY, ANTHROPIC_API_KEY } from "./config.js";
import { allTools } from "./extension.js";
import * as memory from "./memory.js";
import { join, dirname } from "node:path";

export interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

export type StreamEventCallback = (event: StreamEvent) => void;

const SESSION_DIR = join(MEMORY_DIR, "sessions");

const activeSessions = new Map<string, AgentSession>();

function setupAuth(): AuthStorage {
  const auth = AuthStorage.create();
  if (KIMI_API_KEY) auth.setRuntimeApiKey("kimi-coding", KIMI_API_KEY);
  if (ZAI_API_KEY) auth.setRuntimeApiKey("zai", ZAI_API_KEY);
  if (ANTHROPIC_API_KEY) auth.setRuntimeApiKey("anthropic", ANTHROPIC_API_KEY);
  return auth;
}

async function createSession(conversationId: string, skillId?: string): Promise<AgentSession> {
  const systemPrompt = memory.loadSystemPrompt();
  const overview = memory.loadOverview();

  const authStorage = setupAuth();
  const modelRegistry = new ModelRegistry(authStorage);

  const contextParts: string[] = [];
  if (overview) contextParts.push(`## Projects Overview\n${overview}`);

  if (skillId) {
    const skillContent = memory.loadSkill(skillId);
    if (skillContent) {
      contextParts.push(`## Active Mode\nThe user has invoked /${skillId} mode. Follow the workflow defined below.\n\n${skillContent}`);
    }
  }

  const loader = new DefaultResourceLoader({
    cwd: MEMORY_DIR,
    systemPromptOverride: () => systemPrompt,
    agentsFilesOverride: (current) => ({
      agentsFiles: [
        ...current.agentsFiles,
        ...(contextParts.length > 0
          ? [{ path: "/virtual/context.md", content: contextParts.join("\n\n") }]
          : []),
      ],
    }),
  });
  await loader.reload();

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  });

  const appDir = dirname(MEMORY_DIR);

  const { session } = await createAgentSession({
    cwd: appDir,
    sessionManager: SessionManager.create(MEMORY_DIR, SESSION_DIR),
    authStorage,
    modelRegistry,
    resourceLoader: loader,
    settingsManager,
    customTools: allTools,
  });

  activeSessions.set(conversationId, session);
  return session;
}

function formatToolResult(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && result !== null && "content" in result) {
    const r = result as { content: { text?: string }[] };
    return r.content.map(c => c.text || "").join("\n");
  }
  return JSON.stringify(result, null, 2);
}

function mapSessionEvent(event: AgentSessionEvent, onEvent: StreamEventCallback, responseRef: { text: string }) {
  switch (event.type) {
    case "turn_start":
      onEvent({ type: "turn_start" });
      break;
    case "turn_end":
      onEvent({ type: "turn_end" });
      break;
    case "message_update": {
      const ame = event.assistantMessageEvent;
      switch (ame.type) {
        case "text_delta":
          responseRef.text += ame.delta;
          onEvent({ type: "text_delta", content: ame.delta });
          break;
        case "thinking_start":
          onEvent({ type: "thinking_start" });
          break;
        case "thinking_delta":
          onEvent({ type: "thinking_delta", content: ame.delta });
          break;
        case "thinking_end":
          onEvent({ type: "thinking_end" });
          break;
        case "done":
          break;
        case "error":
          onEvent({
            type: "error",
            message: ame.error?.errorMessage || `LLM error: ${ame.reason}`,
          });
          break;
      }
      break;
    }
    case "agent_end": {
      try {
        const state = event.messages;
        if (Array.isArray(state) && state.length > 0) {
          const lastMsg = state[state.length - 1] as any;
          if (lastMsg?.stopReason === "error") {
            onEvent({ type: "error", message: lastMsg.errorMessage || "Unknown LLM error" });
          }
        }
      } catch {}
      break;
    }
    case "tool_execution_start":
      onEvent({
        type: "tool_start",
        toolCallId: event.toolCallId,
        name: event.toolName,
        args: event.args,
      });
      break;
    case "tool_execution_update":
      onEvent({
        type: "tool_update",
        toolCallId: event.toolCallId,
        name: event.toolName,
        partialResult: formatToolResult(event.partialResult),
      });
      break;
    case "tool_execution_end":
      onEvent({
        type: "tool_end",
        toolCallId: event.toolCallId,
        name: event.toolName,
        result: formatToolResult(event.result),
        isError: event.isError,
      });
      break;
    case "auto_compaction_start":
      onEvent({ type: "status", message: `Compacting context (${event.reason})...` });
      break;
    case "auto_compaction_end":
      onEvent({ type: "status", message: event.aborted ? "Compaction aborted" : "Context compacted" });
      break;
    case "auto_retry_start":
      onEvent({ type: "status", message: `Retrying (${event.attempt}/${event.maxAttempts})...` });
      break;
    case "auto_retry_end":
      if (!event.success) {
        onEvent({ type: "error", message: event.finalError || "Retry failed" });
      }
      break;
  }
}

function detectSkill(message: string): { skillId: string; rest: string } | null {
  const match = message.match(/^\/(review|plan|qa|ship)\b\s*(.*)/s);
  if (!match) return null;
  return { skillId: match[1], rest: match[2].trim() };
}

const activeTurns = new Map<string, { conversationId: string; message: string; startedAt: number }>();

export async function chatStream(
  userMessage: string,
  conversationId: string,
  onEvent: StreamEventCallback,
  model?: string,
): Promise<void> {
  const skill = detectSkill(userMessage);

  let session = activeSessions.get(conversationId);
  if (!session || skill) {
    if (session && skill) {
      session.dispose();
      activeSessions.delete(conversationId);
    }
    session = await createSession(conversationId, skill?.skillId);
  }

  if (model) {
    const available = await new ModelRegistry(setupAuth()).getAvailable();
    const match = available.find(m =>
      m.id === model || m.id.includes(model) || `${m.provider}/${m.id}` === model
    );
    if (match) {
      await session.setModel(match);
    }
  }

  const promptMessage = skill
    ? `[MODE: /${skill.skillId}] ${skill.rest || `Run the /${skill.skillId} workflow.`}`
    : userMessage;

  activeTurns.set(conversationId, { conversationId, message: userMessage, startedAt: Date.now() });

  const responseRef = { text: "" };
  const unsubscribe = session.subscribe((event) => {
    mapSessionEvent(event, onEvent, responseRef);
  });

  try {
    await session.prompt(promptMessage);
  } finally {
    unsubscribe();
    activeTurns.delete(conversationId);
  }

  if (!responseRef.text.trim()) {
    onEvent({ type: "error", message: "Model returned no response. Check API key validity and model availability." });
  }

  memory.appendConversation(conversationId, userMessage, responseRef.text);
}

export function getActiveTurn(conversationId: string) {
  return activeTurns.get(conversationId) || null;
}

export async function cronWakeUp() {
  const session = await createSession("cron-session");
  let responseText = "";
  const unsubscribe = session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      responseText += event.assistantMessageEvent.delta;
    }
  });
  try {
    await session.prompt("[CRON] Wake up and process your task list.");
  } finally {
    unsubscribe();
    session.dispose();
    activeSessions.delete("cron-session");
  }
  return responseText;
}

export async function getAvailableModels(): Promise<{ id: string; label: string; default: boolean }[]> {
  const authStorage = setupAuth();
  const modelRegistry = new ModelRegistry(authStorage);
  const available = await modelRegistry.getAvailable();
  const defaultModel = process.env.DEFAULT_MODEL || "";

  return available.map(m => ({
    id: `${m.provider}/${m.id}`,
    label: `${m.provider}/${m.id}`,
    default: m.id === defaultModel || `${m.provider}/${m.id}` === defaultModel,
  }));
}

export function disposeSession(conversationId: string) {
  const session = activeSessions.get(conversationId);
  if (session) {
    session.dispose();
    activeSessions.delete(conversationId);
  }
}

export function getThinkingInfo(conversationId: string) {
  const session = activeSessions.get(conversationId);
  if (!session) return { current: "off" as const, available: [] as string[], supported: false };
  return {
    current: session.thinkingLevel,
    available: session.getAvailableThinkingLevels(),
    supported: session.supportsThinking(),
  };
}

export function setThinkingLevel(conversationId: string, level: string) {
  const session = activeSessions.get(conversationId);
  if (!session) return { current: "off", supported: false };
  session.setThinkingLevel(level as any);
  return { current: session.thinkingLevel, supported: session.supportsThinking() };
}

export async function compactSession(conversationId: string) {
  const session = activeSessions.get(conversationId);
  if (!session) return { error: "No active session" };
  const result = await session.compact();
  return {
    tokensBefore: result.tokensBefore,
    summary: result.summary.slice(0, 200),
  };
}

export function getSessionStats(conversationId: string) {
  const session = activeSessions.get(conversationId);
  if (!session) return null;
  const stats = session.getSessionStats();
  const context = session.getContextUsage();
  return {
    userMessages: stats.userMessages,
    assistantMessages: stats.assistantMessages,
    toolCalls: stats.toolCalls,
    totalMessages: stats.totalMessages,
    tokens: stats.tokens,
    cost: stats.cost,
    context: context ? {
      tokens: context.tokens,
      contextWindow: context.contextWindow,
      percent: context.percent,
    } : null,
  };
}
