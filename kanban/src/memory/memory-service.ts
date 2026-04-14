/**
 * Optional Phuong memory integration. This workspace snapshot omits the full
 * memory git sync implementation; APIs return empty/disabled results so the
 * runtime and web-ui still typecheck and build.
 */

export interface MemorySummary {
	filename: string;
	summary: string;
	tags: string[];
}

export interface MemoryFile {
	filename: string;
	content: string;
	summary?: string;
	tags?: string[];
}

export function isMemoryConfigured(): boolean {
	return false;
}

export function getMemoryDir(): string {
	return "";
}

export function loadSystemPrompt(): string {
	return "";
}

export function loadOverview(): string {
	return "";
}

export function loadProjectContext(_project: string): string {
	return "";
}

export function listProjects(): string[] {
	return [];
}

export function listProjectMemories(_project: string): MemorySummary[] {
	return [];
}

export function loadSpecificMemories(
	_project: string,
	_filenames: string[],
): Array<{ filename: string; content: string }> {
	return [];
}

export function loadMemory(_project: string, _filename: string): MemoryFile | null {
	return null;
}
