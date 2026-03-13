import docker

from config import (
    ANTHROPIC_API_KEY,
    GITHUB_TOKEN,
    MAX_CONCURRENT_SUBAGENTS,
    MOONSHOT_API_KEY,
    SUBAGENT_CPUS,
    SUBAGENT_IMAGE,
    SUBAGENT_MEMORY_LIMIT,
    SUBAGENT_MODEL,
    ZHIPU_API_KEY,
)
import memory


def _get_client() -> docker.DockerClient:
    return docker.from_env()


def _count_running() -> int:
    client = _get_client()
    containers = client.containers.list(filters={"label": "phoung.type=subagent"})
    return len(containers)


def check_containers() -> list[dict]:
    """Check status of all sub-agent containers (running and exited)."""
    client = _get_client()
    results = []
    for container in client.containers.list(all=True, filters={"label": "phoung.type=subagent"}):
        task_id = container.labels.get("phoung.task", "")
        run = int(container.labels.get("phoung.run", "0"))
        status = container.status  # running, exited, dead, etc.
        exit_code = None
        if status == "exited":
            exit_code = container.attrs.get("State", {}).get("ExitCode")
            try:
                log_tail = container.logs(tail=500).decode("utf-8", errors="replace")
            except Exception:
                log_tail = ""
            if task_id and run:
                memory.save_agent_log(task_id, run, log_tail)
            memory.append_task_activity(task_id, {
                "type": "agent_completed",
                "run": run,
                "exit_code": exit_code,
            })
            try:
                container.remove()
            except Exception:
                pass
        results.append({
            "task_id": task_id,
            "run": run,
            "container_id": container.id[:12],
            "status": status,
            "exit_code": exit_code,
        })
    return results


def _build_full_prompt(task_id: str, task_prompt: str) -> str:
    template = memory.load_subagent_prompt()
    return (
        template
        .replace("{AGENT_ID}", task_id)
        .replace("{TASK_PROMPT}", task_prompt)
    )


def _next_run(task_id: str) -> int:
    activity = memory.load_task_activity(task_id)
    runs = [e.get("run", 0) for e in activity if e.get("type") == "agent_spawned"]
    return max(runs, default=0) + 1


def spawn(task_id: str, project: str, prompt: str, agent_type: str = "pi"):
    if _count_running() >= MAX_CONCURRENT_SUBAGENTS:
        memory.log(f"Cannot spawn subagent for {task_id}: at max capacity ({MAX_CONCURRENT_SUBAGENTS})")
        memory.update_task(task_id, status="queued", note="Waiting for subagent slot")
        return

    project_context = memory.load_project_context(project)
    repo_url = ""
    for line in project_context.split("\n"):
        if "github.com/" in line:
            import re
            match = re.search(r"github\.com/[\w\-]+/[\w\-]+", line)
            if match:
                repo_url = f"https://{match.group(0)}"
                break

    if not repo_url:
        memory.log(f"Cannot spawn subagent for {task_id}: no repo URL found in project context")
        memory.update_task(task_id, status="failed", note="No repo URL in project context")
        return

    full_prompt = _build_full_prompt(task_id, prompt)
    run = _next_run(task_id)
    branch = f"task/{task_id}"
    client = _get_client()

    try:
        container = client.containers.run(
            SUBAGENT_IMAGE,
            detach=True,
            environment={
                "GITHUB_TOKEN": GITHUB_TOKEN,
                "KIMI_API_KEY": MOONSHOT_API_KEY,
                "ZAI_API_KEY": ZHIPU_API_KEY,
                "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
                "SUBAGENT_MODEL": SUBAGENT_MODEL,
                "TASK_ID": task_id,
                "BRANCH": branch,
                "PROMPT": full_prompt,
                "REPO_URL": repo_url,
                "AGENT_TYPE": agent_type,
            },
            labels={
                "phoung.type": "subagent",
                "phoung.task": task_id,
                "phoung.run": str(run),
            },
            mem_limit=SUBAGENT_MEMORY_LIMIT,
            nano_cpus=int(float(SUBAGENT_CPUS) * 1e9),
            remove=False,
        )
        memory.update_task(task_id, status="coding", container_id=container.id[:12], current_run=run)
        memory.append_task_activity(task_id, {
            "type": "agent_spawned",
            "run": run,
            "container_id": container.id[:12],
            "agent_type": agent_type,
            "prompt": full_prompt,
        })
        memory.log(f"Spawned subagent {container.id[:12]} for task {task_id} (run {run})")
    except Exception as e:
        memory.log(f"Failed to spawn subagent for {task_id}: {e}")
        memory.update_task(task_id, status="failed", note=str(e))
