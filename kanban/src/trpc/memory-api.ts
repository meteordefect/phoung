import {
	isMemoryConfigured,
	loadOverview,
	loadSystemPrompt,
	loadProjectContext,
	listProjects,
	listProjectMemories,
	loadMemory,
	type MemorySummary,
	type MemoryFile,
} from "../memory/memory-service.js";
import { commitAndPush, getLastSyncTime, isGitRepo, type SyncResult } from "../memory/memory-sync.js";

export interface MemoryApiLoadOverviewResponse {
	configured: boolean;
	systemPrompt: string;
	overview: string;
}

export interface MemoryApiLoadProjectContextResponse {
	project: string;
	context: string;
}

export interface MemoryApiListProjectsResponse {
	projects: string[];
}

export interface MemoryApiListMemoriesResponse {
	project: string;
	memories: MemorySummary[];
}

export interface MemoryApiLoadMemoryResponse {
	found: boolean;
	memory: MemoryFile | null;
}

export interface MemoryApiStatusResponse {
	configured: boolean;
	gitRepo: boolean;
	lastSync: string | null;
}

export interface MemoryApiSyncResponse {
	result: SyncResult;
}

export function createMemoryApi() {
	return {
		loadOverview: async (): Promise<MemoryApiLoadOverviewResponse> => {
			if (!isMemoryConfigured()) {
				return { configured: false, systemPrompt: "", overview: "" };
			}
			return {
				configured: true,
				systemPrompt: loadSystemPrompt(),
				overview: loadOverview(),
			};
		},

		loadProjectContext: async (input: { project: string }): Promise<MemoryApiLoadProjectContextResponse> => {
			return {
				project: input.project,
				context: isMemoryConfigured() ? loadProjectContext(input.project) : "",
			};
		},

		listProjects: async (): Promise<MemoryApiListProjectsResponse> => {
			return {
				projects: isMemoryConfigured() ? listProjects() : [],
			};
		},

		listMemories: async (input: { project: string }): Promise<MemoryApiListMemoriesResponse> => {
			return {
				project: input.project,
				memories: isMemoryConfigured() ? listProjectMemories(input.project) : [],
			};
		},

		loadMemory: async (input: { project: string; filename: string }): Promise<MemoryApiLoadMemoryResponse> => {
			if (!isMemoryConfigured()) {
				return { found: false, memory: null };
			}
			const memory = loadMemory(input.project, input.filename);
			return { found: memory !== null, memory };
		},

		getStatus: async (): Promise<MemoryApiStatusResponse> => {
			return {
				configured: isMemoryConfigured(),
				gitRepo: isGitRepo(),
				lastSync: getLastSyncTime(),
			};
		},

		sync: async (): Promise<MemoryApiSyncResponse> => {
			return { result: commitAndPush() };
		},
	};
}

export type MemoryApi = ReturnType<typeof createMemoryApi>;
