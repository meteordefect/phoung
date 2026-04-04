import { randomUUID } from "node:crypto";
import type { BoardOperations } from "../manager/phoung-tools.js";
import { getAvailableModels, getSessionStats, getActiveTurn } from "../manager/phoung-session.js";
import {
	loadWorkspaceState,
	saveWorkspaceState,
	mutateWorkspaceState,
} from "../state/workspace-state.js";
import type { RuntimeBoardCard, RuntimeBoardData } from "../core/api-contract.js";

export function createBoardOperations(
	workspacePath: string,
	onBoardMutated?: () => void,
): BoardOperations {
	return {
		createCard: async (prompt: string, baseRef?: string) => {
			const cardId = randomUUID().slice(0, 8);
			const now = Date.now();
			const newCard: RuntimeBoardCard = {
				id: cardId,
				prompt,
				startInPlanMode: false,
				baseRef: baseRef || "HEAD",
				createdAt: now,
				updatedAt: now,
			};

			await mutateWorkspaceState(workspacePath, (state) => {
				const board: RuntimeBoardData = JSON.parse(JSON.stringify(state.board));
				const backlog = board.columns.find((c) => c.id === "backlog");
				if (backlog) {
					backlog.cards.push(newCard);
				}
				return { board, save: true, value: cardId };
			});

			onBoardMutated?.();
			return { cardId };
		},

		listCards: async () => {
			const state = await loadWorkspaceState(workspacePath);
			const cards: { id: string; prompt: string; column: string }[] = [];
			for (const col of state.board.columns) {
				for (const card of col.cards) {
					cards.push({ id: card.id, prompt: card.prompt, column: col.id });
				}
			}
			return cards;
		},

		startTask: async (taskId: string) => {
			return { ok: false, error: "Start task via the board UI for now" };
		},
	};
}

export function createPhoungApi() {
	return {
		getModels: async () => {
			try {
				return await getAvailableModels();
			} catch {
				return [];
			}
		},

		getSessionStats: async (input: { conversationId: string }) => {
			return getSessionStats(input.conversationId);
		},

		getActiveTurn: async (input: { conversationId: string }) => {
			return getActiveTurn(input.conversationId);
		},
	};
}

export type PhoungApi = ReturnType<typeof createPhoungApi>;
