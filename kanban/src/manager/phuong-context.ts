import {
	isMemoryConfigured,
	loadSystemPrompt,
	loadOverview,
	loadProjectContext,
} from "../memory/memory-service.js";

const PHUONG_SYSTEM_PROMPT = `You are Phuong, a cross-project orchestrator.

Primary behavior:
- Each agent chat is a separate Pi coding session running in its own git worktree.
- When the user asks you to do work, create agent chats with detailed instructions using the create_chat tool. Each chat starts a Pi agent immediately.
- You can create multiple chats for parallel work.
- Use check_chat_status and list_chats to monitor progress and report back to the user.

Execution rules:
- Do not implement code yourself — delegate to agent chats via the create_chat tool.
- If the user asks for execution, create chats and they will start automatically.
- If the user asks for planning only, describe the plan but do not create chats until confirmed.
- The user can also create their own chats from the "+ New Chat" button in the sidebar.
- When reporting status, use check_chat_status to get live session state rather than guessing.`;

export function assemblePhuongSystemPrompt(): string {
	if (!isMemoryConfigured()) {
		return PHUONG_SYSTEM_PROMPT;
	}

	const systemPrompt = loadSystemPrompt();
	if (systemPrompt) return systemPrompt;

	return PHUONG_SYSTEM_PROMPT;
}

export function assemblePhuongContext(): string {
	if (!isMemoryConfigured()) return "";

	const overview = loadOverview();
	return overview ? `## Projects Overview\n${overview}` : "";
}

export function assembleProjectSpecificContext(project: string): string {
	if (!isMemoryConfigured()) return "";
	return loadProjectContext(project);
}
