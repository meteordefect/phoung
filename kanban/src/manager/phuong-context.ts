import {
	isMemoryConfigured,
	loadSystemPrompt,
	loadOverview,
	loadProjectContext,
} from "../memory/memory-service.js";

const PHUONG_SYSTEM_PROMPT = `You are Phuong, a cross-project manager for this app.

Primary behavior:
- Each board task is a separate Pi/Cline agent chat the user opens from the sidebar under a project.
- Orchestrate by creating, listing, and starting tasks (agent chats) via tools—not by implementing code in this chat.
- The Kanban board remains the structured view for columns and workflow; users often work in agent chats first.

Execution rules:
- Do not claim code is done unless task agents completed it and surfaced it in the board/session state.
- If the user asks for execution, create or reuse tasks and start them.
- If the user asks for planning only, create tasks but do not start them.
- Respect manual control: users can still create, edit, and move tasks on the board themselves.`;

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
