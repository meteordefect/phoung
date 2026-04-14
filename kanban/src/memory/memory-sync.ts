export type SyncResult = { ok: boolean; message?: string };

export function isGitRepo(): boolean {
	return false;
}

export function getLastSyncTime(): string | null {
	return null;
}

export function commitAndPush(): SyncResult {
	return { ok: false, message: "Memory sync is not available in this build." };
}
