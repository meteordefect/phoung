import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

import yaml

from config import MEMORY_DIR


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\n(.*?)\n---\n?(.*)", text, re.DOTALL)
    if not match:
        return {}, text
    return yaml.safe_load(match.group(1)) or {}, match.group(2)


def _write_frontmatter(meta: dict, body: str) -> str:
    fm = yaml.dump(meta, default_flow_style=False).strip()
    return f"---\n{fm}\n---\n{body}"


def load_system_prompt() -> str:
    path = MEMORY_DIR / "system-prompt.md"
    if path.exists():
        return path.read_text()
    return ""


def load_subagent_prompt() -> str:
    path = MEMORY_DIR / "subagent-prompt.md"
    if path.exists():
        return path.read_text()
    return "{TASK_PROMPT}"


def load_overview() -> str:
    path = MEMORY_DIR / "overview.md"
    if path.exists():
        return path.read_text()
    return ""


def load_project_context(project: str) -> str:
    path = MEMORY_DIR / "projects" / project / "context.md"
    if path.exists():
        return path.read_text()
    return ""


def list_project_memories(project: str) -> list[dict]:
    mem_dir = MEMORY_DIR / "projects" / project / "memories"
    if not mem_dir.exists():
        return []
    results = []
    for f in sorted(mem_dir.glob("*.md")):
        meta, _ = _parse_frontmatter(f.read_text())
        results.append({
            "filename": f.name,
            "summary": meta.get("summary", ""),
            "tags": meta.get("tags", []),
        })
    return results


def load_specific(project: str, filenames: list[str]) -> list[dict]:
    results = []
    for name in filenames:
        path = MEMORY_DIR / "projects" / project / "memories" / name
        if path.exists():
            meta, body = _parse_frontmatter(path.read_text())
            results.append({"filename": name, "meta": meta, "content": body})
    return results


def list_active_tasks(project: str) -> list[dict]:
    task_dir = MEMORY_DIR / "projects" / project / "tasks" / "active"
    if not task_dir.exists():
        return []
    tasks = []
    for f in sorted(task_dir.glob("*.md")):
        meta, body = _parse_frontmatter(f.read_text())
        tasks.append({"filename": f.name, "meta": meta, "body": body})
    return tasks


def list_all_tasks() -> list[dict]:
    tasks = []
    projects_dir = MEMORY_DIR / "projects"
    if not projects_dir.exists():
        return tasks
    for proj_dir in sorted(projects_dir.iterdir()):
        if not proj_dir.is_dir():
            continue
        active_dir = proj_dir / "tasks" / "active"
        if active_dir.exists():
            for f in sorted(active_dir.glob("*.md")):
                meta, body = _parse_frontmatter(f.read_text())
                meta["project"] = proj_dir.name
                tasks.append({"filename": f.name, "meta": meta, "body": body})
    return tasks


def load_task(task_id: str) -> Optional[dict]:
    projects_dir = MEMORY_DIR / "projects"
    if not projects_dir.exists():
        return None
    for proj_dir in projects_dir.iterdir():
        if not proj_dir.is_dir():
            continue
        for subdir in ["active", "completed"]:
            task_dir = proj_dir / "tasks" / subdir
            if not task_dir.exists():
                continue
            for f in task_dir.glob("*.md"):
                meta, body = _parse_frontmatter(f.read_text())
                if meta.get("id") == task_id:
                    meta["project"] = proj_dir.name
                    return {"filename": f.name, "path": str(f), "meta": meta, "body": body}
    return None


def create_task(task_id: str, project: str, prompt: str):
    task_dir = MEMORY_DIR / "projects" / project / "tasks" / "active"
    task_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", task_id.lower()).strip("-")
    filename = f"{slug}.md"
    path = task_dir / filename
    if path.exists():
        return
    meta = {
        "id": task_id,
        "project": project,
        "status": "pending",
        "created": datetime.utcnow().isoformat() + "Z",
    }
    body = f"# {task_id}\n\n## Prompt\n{prompt}\n"
    path.write_text(_write_frontmatter(meta, body))


def update_task(task_id: str, **updates):
    task = load_task(task_id)
    if not task:
        return
    path = Path(task["path"])
    meta, body = _parse_frontmatter(path.read_text())
    meta.update(updates)
    path.write_text(_write_frontmatter(meta, body))


def move_to_completed(task_id: str):
    task = load_task(task_id)
    if not task:
        return
    src = Path(task["path"])
    dest = src.parent.parent / "completed" / src.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    meta, body = _parse_frontmatter(src.read_text())
    meta["status"] = "completed"
    meta["completed"] = datetime.utcnow().isoformat() + "Z"
    dest.write_text(_write_frontmatter(meta, body))
    src.unlink()


def _task_dir_for(task_id: str) -> Optional[Path]:
    task = load_task(task_id)
    if not task:
        return None
    return Path(task["path"]).parent


def append_task_activity(task_id: str, event: dict):
    d = _task_dir_for(task_id)
    if not d:
        return
    event.setdefault("ts", datetime.utcnow().isoformat() + "Z")
    path = d / f"{task_id}-activity.jsonl"
    with open(path, "a") as f:
        f.write(json.dumps(event) + "\n")


def load_task_activity(task_id: str) -> list[dict]:
    d = _task_dir_for(task_id)
    if not d:
        return []
    path = d / f"{task_id}-activity.jsonl"
    if not path.exists():
        return []
    events = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def save_agent_log(task_id: str, run: int, log_text: str):
    d = _task_dir_for(task_id)
    if not d:
        return
    path = d / f"{task_id}-run-{run}.log"
    path.write_text(log_text)


def load_agent_log(task_id: str, run: int) -> Optional[str]:
    d = _task_dir_for(task_id)
    if not d:
        return None
    path = d / f"{task_id}-run-{run}.log"
    if path.exists():
        return path.read_text()
    return None


def create_memory(memory_id: str, content: str, tags: list[str], summary: str, project: str = "general"):
    mem_dir = MEMORY_DIR / "projects" / project / "memories"
    if project == "general":
        mem_dir = MEMORY_DIR / "general" / "memories"
    mem_dir.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", summary.lower()).strip("-")
    filename = f"{slug}.md"
    meta = {
        "id": memory_id,
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "project": project,
        "tags": tags,
        "summary": summary,
    }
    (mem_dir / filename).write_text(_write_frontmatter(meta, content))


def write(filepath: str, content: str):
    path = MEMORY_DIR / filepath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def log(message: str):
    log_dir = MEMORY_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    log_file = log_dir / f"cron-{today}.md"
    ts = datetime.utcnow().strftime("%H:%M:%S")
    with open(log_file, "a") as f:
        f.write(f"- [{ts}] {message}\n")


def load_conversation(conversation_id: str) -> Optional[str]:
    for search_dir in [
        MEMORY_DIR / "conversations" / "inbox",
        *((MEMORY_DIR / "projects").glob("*/conversations") if (MEMORY_DIR / "projects").exists() else []),
        MEMORY_DIR / "general" / "conversations",
    ]:
        if not search_dir.exists():
            continue
        for f in search_dir.glob("*.md"):
            meta, body = _parse_frontmatter(f.read_text())
            if meta.get("id") == conversation_id:
                return f.read_text()
    return None


def create_conversation() -> str:
    conv_id = f"conv-{datetime.utcnow().strftime('%Y-%m-%d-%H%M')}"
    inbox = MEMORY_DIR / "conversations" / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    meta = {"id": conv_id, "project": None, "started": ts, "summary": None}
    (inbox / f"{datetime.utcnow().strftime('%Y-%m-%d-%Hh%M')}.md").write_text(
        _write_frontmatter(meta, "\n")
    )
    return conv_id


def append_conversation(conversation_id: str, user_msg: str, agent_msg: str):
    for search_dir in [
        MEMORY_DIR / "conversations" / "inbox",
        *((MEMORY_DIR / "projects").glob("*/conversations") if (MEMORY_DIR / "projects").exists() else []),
    ]:
        if not search_dir.exists():
            continue
        for f in search_dir.glob("*.md"):
            meta, body = _parse_frontmatter(f.read_text())
            if meta.get("id") == conversation_id:
                ts = datetime.utcnow().strftime("%H:%M")
                body += f"\n**Marten ({ts}):** {user_msg}\n\n**Pi ({ts}):** {agent_msg}\n"
                f.write_text(_write_frontmatter(meta, body))
                return

    inbox = MEMORY_DIR / "conversations" / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    ts_full = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    ts = datetime.utcnow().strftime("%H:%M")
    meta = {"id": conversation_id, "project": None, "started": ts_full, "summary": None}
    body = f"\n**Marten ({ts}):** {user_msg}\n\n**Pi ({ts}):** {agent_msg}\n"
    fname = datetime.utcnow().strftime("%Y-%m-%d-%Hh%M") + ".md"
    (inbox / fname).write_text(_write_frontmatter(meta, body))


def list_all_conversations() -> list[dict]:
    results = []
    search_dirs = [MEMORY_DIR / "conversations" / "inbox"]
    if (MEMORY_DIR / "projects").exists():
        search_dirs.extend(MEMORY_DIR / "projects" / p / "conversations"
                           for p in sorted(d.name for d in (MEMORY_DIR / "projects").iterdir() if d.is_dir()))
    search_dirs.append(MEMORY_DIR / "general" / "conversations")

    for d in search_dirs:
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md"), reverse=True):
            meta, _ = _parse_frontmatter(f.read_text())
            results.append({
                "id": meta.get("id", f.stem),
                "project": meta.get("project"),
                "started": meta.get("started"),
                "summary": meta.get("summary"),
                "filename": f.name,
            })
    return results


def list_projects() -> list[str]:
    projects_dir = MEMORY_DIR / "projects"
    if not projects_dir.exists():
        return []
    return sorted(d.name for d in projects_dir.iterdir() if d.is_dir())
