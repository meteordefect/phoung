import memory
import spawner

results = spawner.check_containers()
for r in results:
    if r["status"] == "exited" and r["task_id"]:
        if r["exit_code"] == 0:
            memory.update_task(r["task_id"], status="pr_open", note="Sub-agent exited successfully")
        else:
            memory.update_task(r["task_id"], status="failed", note=f"Sub-agent exited with code {r['exit_code']}")
        memory.log(f"Container {r['container_id']} for {r['task_id']} exited (code {r['exit_code']})")

from agent import handle_message

handle_message("[CRON] Wake up and process your task list.")
