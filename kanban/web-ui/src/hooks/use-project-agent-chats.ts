import { useEffect, useMemo, useState } from "react";

import type { BoardCard, BoardData } from "@/types";

const STORAGE_KEY = "phuong-project-agent-chats-v1";

export interface ProjectAgentChatItem {
	id: string;
	title: string;
}

function readStoredChats(): Record<string, ProjectAgentChatItem[]> {
	if (typeof localStorage === "undefined") {
		return {};
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}
		const out: Record<string, ProjectAgentChatItem[]> = {};
		for (const [projectId, list] of Object.entries(parsed as Record<string, unknown>)) {
			if (!Array.isArray(list)) {
				continue;
			}
			const items: ProjectAgentChatItem[] = [];
			for (const entry of list) {
				if (!entry || typeof entry !== "object") {
					continue;
				}
				const id = (entry as { id?: unknown }).id;
				const title = (entry as { title?: unknown }).title;
				if (typeof id === "string" && id.length > 0 && typeof title === "string") {
					items.push({ id, title });
				}
			}
			out[projectId] = items;
		}
		return out;
	} catch {
		return {};
	}
}

function writeStoredChats(map: Record<string, ProjectAgentChatItem[]>): void {
	if (typeof localStorage === "undefined") {
		return;
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// Ignore quota / private mode.
	}
}

function findCardOnBoard(board: BoardData, taskId: string): BoardCard | null {
	for (const column of board.columns) {
		const card = column.cards.find((c) => c.id === taskId);
		if (card) {
			return card;
		}
	}
	return null;
}

function titleFromCard(card: BoardCard | null): string {
	if (!card) {
		return "Agent";
	}
	const line = card.prompt.split("\n")[0]?.trim() ?? "";
	if (!line) {
		return "Agent";
	}
	return line.length > 56 ? `${line.slice(0, 53)}…` : line;
}

/** Task ids in column order (backlog → in progress → review → trash). */
function orderedTaskIdsFromBoard(board: BoardData): string[] {
	const ids: string[] = [];
	for (const column of board.columns) {
		for (const card of column.cards) {
			ids.push(card.id);
		}
	}
	return ids;
}

function mergeChatsWithBoard(board: BoardData, existing: ProjectAgentChatItem[]): ProjectAgentChatItem[] {
	const orderedIds = orderedTaskIdsFromBoard(board);
	const byId = new Map(existing.map((c) => [c.id, c]));
	const next: ProjectAgentChatItem[] = [];
	const seen = new Set<string>();
	for (const id of orderedIds) {
		const card = findCardOnBoard(board, id);
		const derivedTitle = titleFromCard(card);
		next.push({
			id,
			title: card ? derivedTitle : (byId.get(id)?.title ?? "Agent"),
		});
		seen.add(id);
	}
	for (const chat of existing) {
		if (!seen.has(chat.id)) {
			next.push(chat);
		}
	}
	return next;
}

export type HomeMainView = "chats";

interface UseProjectAgentChatsInput {
	currentProjectId: string | null;
	board: BoardData;
}

interface UseProjectAgentChatsResult {
	chatsByProject: Record<string, ProjectAgentChatItem[]>;
	chatsForCurrentProject: ProjectAgentChatItem[];
	homeMainView: HomeMainView;
	setHomeMainView: (view: HomeMainView) => void;
}

export function useProjectAgentChats({
	currentProjectId,
	board,
}: UseProjectAgentChatsInput): UseProjectAgentChatsResult {
	const [chatsByProject, setChatsByProject] = useState<Record<string, ProjectAgentChatItem[]>>(() =>
		readStoredChats(),
	);
	const [homeMainView, setHomeMainView] = useState<HomeMainView>("chats");

	useEffect(() => {
		writeStoredChats(chatsByProject);
	}, [chatsByProject]);

	useEffect(() => {
		if (!currentProjectId) {
			return;
		}
		setChatsByProject((prev) => {
			const merged = mergeChatsWithBoard(board, prev[currentProjectId] ?? []);
			const prior = prev[currentProjectId];
			if (prior && prior.length === merged.length && prior.every((c, i) => c.id === merged[i]?.id && c.title === merged[i]?.title)) {
				return prev;
			}
			return { ...prev, [currentProjectId]: merged };
		});
	}, [board, currentProjectId]);

	const chatsForCurrentProject = useMemo(() => {
		if (!currentProjectId) {
			return [];
		}
		return chatsByProject[currentProjectId] ?? [];
	}, [chatsByProject, currentProjectId]);

	useEffect(() => {
		setHomeMainView("chats");
	}, [currentProjectId]);

	return {
		chatsByProject,
		chatsForCurrentProject,
		homeMainView,
		setHomeMainView,
	};
}
