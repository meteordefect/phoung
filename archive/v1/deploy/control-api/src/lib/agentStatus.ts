import { query } from '../db/client';

const STALE_THRESHOLD_MS = 90 * 1000; // 90 seconds
const OFFLINE_THRESHOLD_MS = 300 * 1000; // 5 minutes

export async function updateAgentStatuses(): Promise<void> {
  const now = new Date();
  const staleTime = new Date(now.getTime() - STALE_THRESHOLD_MS);
  const offlineTime = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);
  
  try {
    await query(
      `UPDATE agents 
       SET status = 'offline', updated_at = $1
       WHERE last_heartbeat < $2 AND status != 'offline'`,
      [now, offlineTime]
    );
    
    await query(
      `UPDATE agents 
       SET status = 'stale', updated_at = $1
       WHERE last_heartbeat < $2 
         AND last_heartbeat >= $3 
         AND status != 'stale'`,
      [now, staleTime, offlineTime]
    );
    
    console.log('Agent statuses updated');
  } catch (err) {
    console.error('Error updating agent statuses:', err);
  }
}

export function startAgentStatusMonitor(intervalMs: number = 30000): NodeJS.Timeout {
  console.log(`Starting agent status monitor (interval: ${intervalMs}ms)`);
  return setInterval(updateAgentStatuses, intervalMs);
}
