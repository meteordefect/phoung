// Full-width home surface: one board task = one Pi/Cline agent chat thread.
import type { ReactElement } from "react";
import { useCallback, useMemo } from "react";

import { ClineAgentChatPanel } from "@/components/detail-panels/cline-agent-chat-panel";
import { Spinner } from "@/components/ui/spinner";
import { createIdleTaskSession } from "@/hooks/app-utils";
import { useClineChatRuntimeActions } from "@/hooks/use-cline-chat-runtime-actions";
import { isNativeClineAgentSelected, selectLatestTaskChatMessageForTask } from "@/runtime/native-agent";
import type {
	RuntimeConfigResponse,
	RuntimeStateStreamTaskChatMessage,
	RuntimeTaskChatMessage,
	RuntimeTaskSessionSummary,
} from "@/runtime/types";
import { findCardSelection } from "@/state/board-state";
import type { BoardData } from "@/types";

interface UseHomeProjectAgentChatPanelInput {
	currentProjectId: string | null;
	hasNoProjects: boolean;
	runtimeProjectConfig: RuntimeConfigResponse | null;
	board: BoardData;
	selectedTaskId: string | null;
	taskSessions: Record<string, RuntimeTaskSessionSummary>;
	clineSessionContextVersion: number;
	latestTaskChatMessage: RuntimeStateStreamTaskChatMessage | null;
	taskChatMessagesByTaskId: Record<string, RuntimeTaskChatMessage[]>;
	onSessionSummary: (summary: RuntimeTaskSessionSummary) => void;
}

export function useHomeProjectAgentChatPanel({
	currentProjectId,
	hasNoProjects,
	runtimeProjectConfig,
	board,
	selectedTaskId,
	taskSessions,
	clineSessionContextVersion,
	latestTaskChatMessage,
	taskChatMessagesByTaskId,
	onSessionSummary,
}: UseHomeProjectAgentChatPanelInput): ReactElement | null {
	const { sendTaskChatMessage, loadTaskChatMessages, cancelTaskChatTurn } = useClineChatRuntimeActions({
		currentProjectId,
		onSessionSummary,
	});

	const selectedAgentLabel = useMemo(() => {
		if (!runtimeProjectConfig) {
			return "selected agent";
		}
		return (
			runtimeProjectConfig.agents.find((agent) => agent.id === runtimeProjectConfig.selectedAgentId)?.label ??
			"selected agent"
		);
	}, [runtimeProjectConfig]);

	const handleSend = useCallback(
		async (taskId: string, text: string, options?: { mode?: "act" | "plan" }) =>
			await sendTaskChatMessage(taskId, text, options),
		[sendTaskChatMessage],
	);

	const handleLoad = useCallback(
		async (taskId: string) => await loadTaskChatMessages(taskId),
		[loadTaskChatMessages],
	);

	const handleCancel = useCallback(
		async (taskId: string) => await cancelTaskChatTurn(taskId),
		[cancelTaskChatTurn],
	);

	const selection = useMemo(() => {
		if (!selectedTaskId) {
			return null;
		}
		return findCardSelection(board, selectedTaskId);
	}, [board, selectedTaskId]);

	const panel = useMemo(() => {
		if (hasNoProjects || !currentProjectId) {
			return null;
		}

		if (!runtimeProjectConfig) {
			return (
				<div className="flex flex-1 min-h-0 items-center justify-center bg-surface-0">
					<Spinner size={28} />
				</div>
			);
		}

		if (!isNativeClineAgentSelected(runtimeProjectConfig.selectedAgentId)) {
			return (
				<div className="flex flex-1 min-h-0 items-center justify-center bg-surface-0 px-6 text-center text-sm text-text-secondary">
					No runnable {selectedAgentLabel} command is configured. Open Settings, install the CLI, and select it.
				</div>
			);
		}

		if (!selectedTaskId) {
			return (
				<div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-2 bg-surface-0 px-6 text-center">
					<p className="text-sm text-text-secondary">No agent chats yet for this project.</p>
					<p className="text-xs text-text-tertiary">Create a task on the board, then open it here from the sidebar.</p>
				</div>
			);
		}

		const summary = taskSessions[selectedTaskId] ?? createIdleTaskSession(selectedTaskId);
		const taskMessages = taskChatMessagesByTaskId[selectedTaskId] ?? [];
		const latestForTask = selectLatestTaskChatMessageForTask(selectedTaskId, latestTaskChatMessage);

		return (
			<ClineAgentChatPanel
				key={`${selectedTaskId}-${clineSessionContextVersion}`}
				taskId={selectedTaskId}
				summary={summary}
				taskColumnId={selection?.column.id}
				defaultMode="act"
				showComposerModeToggle
				workspaceId={currentProjectId}
				runtimeConfig={runtimeProjectConfig}
				onSendMessage={handleSend}
				onCancelTurn={handleCancel}
				onLoadMessages={handleLoad}
				incomingMessage={latestForTask}
				incomingMessages={taskMessages}
				showRightBorder={false}
				composerPlaceholder="Message this Pi agent…"
			/>
		);
	}, [
		cancelTaskChatTurn,
		clineSessionContextVersion,
		currentProjectId,
		handleCancel,
		handleLoad,
		handleSend,
		hasNoProjects,
		latestTaskChatMessage,
		runtimeProjectConfig,
		selectedAgentLabel,
		selectedTaskId,
		selection?.column.id,
		taskChatMessagesByTaskId,
		taskSessions,
	]);

	return panel;
}
