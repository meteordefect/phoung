import {
	isMemoryConfigured,
	loadSystemPrompt,
	loadOverview,
	loadProjectContext,
	listProjectMemories,
	loadSpecificMemories,
	type MemoryFile,
} from "./memory-service.js";

export interface AssembledContext {
	systemPrompt: string;
	overview: string;
	projectContext: string;
	memories: MemoryFile[];
}

/**
 * Assembles the full context for a project by loading system prompt,
 * overview, project-specific context, and optionally specific memory files.
 * This is the selective loading pipeline Phoung uses — load broad context first,
 * then narrow to the relevant project and memories.
 */
export function assembleProjectContext(
	project: string,
	memoryFilenames?: string[],
): AssembledContext {
	if (!isMemoryConfigured()) {
		return { systemPrompt: "", overview: "", projectContext: "", memories: [] };
	}

	const systemPrompt = loadSystemPrompt();
	const overview = loadOverview();
	const projectContext = loadProjectContext(project);

	let memories: MemoryFile[] = [];
	if (memoryFilenames && memoryFilenames.length > 0) {
		memories = loadSpecificMemories(project, memoryFilenames);
	}

	return { systemPrompt, overview, projectContext, memories };
}

/**
 * Returns a list of available memory files for a project so the caller
 * can decide which ones to load. Supports the "inspect filenames first,
 * then load selectively" pattern.
 */
export function inspectProjectMemories(project: string) {
	if (!isMemoryConfigured()) return [];
	return listProjectMemories(project);
}
