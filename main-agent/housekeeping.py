import re
from pathlib import Path

import docker
import yaml

from config import MEMORY_DIR
import memory as mem
from memory import _parse_frontmatter, _write_frontmatter


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80]


def is_timestamp_name(filename: str) -> bool:
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}", filename))


def detect_project(conv_path: Path) -> str:
    meta, body = _parse_frontmatter(conv_path.read_text())
    if meta.get("project"):
        return meta["project"]

    projects_dir = MEMORY_DIR / "projects"
    if projects_dir.exists():
        text_lower = body.lower()
        for proj_dir in projects_dir.iterdir():
            if proj_dir.is_dir() and proj_dir.name in text_lower:
                return proj_dir.name
    return "general"


def sort_inbox():
    inbox = MEMORY_DIR / "conversations" / "inbox"
    if not inbox.exists():
        return

    for conv in inbox.glob("*.md"):
        meta, body = _parse_frontmatter(conv.read_text())
        project = detect_project(conv)

        summary = meta.get("summary")
        if not summary:
            first_line = body.strip().split("\n")[0] if body.strip() else "untitled"
            summary = first_line[:60].replace("**Marten", "").strip(":* ")
            meta["summary"] = summary

        meta["project"] = project
        new_name = slugify(summary) + ".md" if summary else conv.name

        if project == "general":
            dest_dir = MEMORY_DIR / "general" / "conversations"
        else:
            dest_dir = MEMORY_DIR / "projects" / project / "conversations"

        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / new_name
        dest.write_text(_write_frontmatter(meta, body))
        conv.unlink()


def rename_timestamp_memories():
    projects_dir = MEMORY_DIR / "projects"
    if not projects_dir.exists():
        return

    for proj_dir in projects_dir.iterdir():
        if not proj_dir.is_dir():
            continue
        mem_dir = proj_dir / "memories"
        if not mem_dir.exists():
            continue
        for mem in mem_dir.glob("*.md"):
            if is_timestamp_name(mem.name):
                meta, body = _parse_frontmatter(mem.read_text())
                summary = meta.get("summary", "")
                if summary:
                    new_name = slugify(summary) + ".md"
                    mem.rename(mem_dir / new_name)


def collect_subagent_logs():
    try:
        client = docker.from_env()
    except Exception:
        return

    stopped = client.containers.list(
        all=True,
        filters={"label": "phoung.type=subagent", "status": "exited"},
    )
    for container in stopped:
        task_id = container.labels.get("phoung.task", "")
        run_str = container.labels.get("phoung.run", "")
        if not task_id or not run_str:
            container.remove(force=True)
            continue

        run = int(run_str)
        exit_code = container.attrs.get("State", {}).get("ExitCode", -1)
        try:
            log_text = container.logs(timestamps=True).decode("utf-8", errors="replace")
        except Exception:
            log_text = "(failed to capture logs)"

        mem.save_agent_log(task_id, run, log_text)
        mem.append_task_activity(task_id, {
            "type": "agent_completed",
            "run": run,
            "exit_code": exit_code,
            "log_file": f"{task_id}-run-{run}.log",
        })

        if exit_code == 0:
            mem.update_task(task_id, status="pr_open")
        else:
            mem.update_task(task_id, status="failed", note=f"Agent exited with code {exit_code}")

        mem.log(f"Captured logs for {task_id} run {run} (exit {exit_code})")
        container.remove(force=True)


def daily_housekeeping():
    sort_inbox()
    rename_timestamp_memories()
    collect_subagent_logs()


if __name__ == "__main__":
    daily_housekeeping()
