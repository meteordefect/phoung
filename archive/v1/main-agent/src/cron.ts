import * as memory from "./memory.js";
import * as spawner from "./spawner.js";
import * as phoung from "./phoung.js";

export async function runCronCycle() {
  const results = await spawner.checkContainers();
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

  await phoung.cronWakeUp();
}
