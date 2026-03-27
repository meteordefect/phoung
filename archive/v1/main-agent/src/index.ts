import { startServer } from "./server.js";
import { checkContainers } from "./spawner.js";
import * as memory from "./memory.js";

startServer();

setInterval(async () => {
  try {
    const results = await checkContainers();
    for (const r of results) {
      if (r.status === "exited" && r.taskId) {
        if (r.exitCode === 0) {
          memory.updateTask(r.taskId, { status: "pr_open", note: "Sub-agent exited successfully" });
        } else {
          memory.updateTask(r.taskId, { status: "failed", note: `Sub-agent exited with code ${r.exitCode}` });
        }
        memory.log(`Container ${r.containerId} for ${r.taskId} exited (code ${r.exitCode})`);
      }
    }
  } catch {}
}, 60_000);
