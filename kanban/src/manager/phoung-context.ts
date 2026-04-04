import {
	isMemoryConfigured,
	loadSystemPrompt,
	loadOverview,
	loadProjectContext,
	listProjects,
} from "../memory/memory-service.js";

export function assemblePhoungSystemPrompt(): string {
	if (!isMemoryConfigured()) {
		return "You are Phoung, a project manager agent. You help plan work, create tasks, and manage the board.";
	}

	const systemPrompt = loadSystemPrompt();
	if (systemPrompt) return systemPrompt;

	return "You are Phoung, a project manager agent. You help plan work, create tasks, and manage the board.";
}

export function assemblePhoungContext(): string {
	if (!isMemoryConfigured()) return "";

	const parts: string[] = [];
	const overview = loadOverview();
	if (overview) parts.push(`## Projects Overview\n${overview}`);

	const projects = listProjects();
	if (projects.length > 0) {
		const summaries = projects.map((p) => {
			const ctx = loadProjectContext(p);
			const preview = ctx.slice(0, 200).replace(/\n/g, " ");
			return `- **${p}**: ${preview}`;
		});
		parts.push(`## Registered Projects\n${summaries.join("\n")}`);
	}

	return parts.join("\n\n");
}

export function assembleProjectSpecificContext(project: string): string {
	if (!isMemoryConfigured()) return "";
	return loadProjectContext(project);
}
