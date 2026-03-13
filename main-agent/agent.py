import re
import uuid
from dataclasses import dataclass

import memory
import pi_client as pi
import spawner
import github_client as github


ALLOWED_ACTIONS = {
    "spawn_subagent",
    "check_status",
    "update_task",
    "update_memory",
    "create_memory",
    "ask_human",
    "read_repo_tree",
    "read_repo_file",
    "report",
}

FORBIDDEN_ACTIONS = {
    "merge_pr",
    "push_to_main",
    "create_task",
    "delete_repo",
    "delete_branch_main",
}


@dataclass
class Action:
    type: str
    attrs: dict
    body: str


def parse_actions(response_text: str) -> list[Action]:
    pattern = r'<action\s+([^>]+)>(.*?)</action>'
    actions = []
    for match in re.finditer(pattern, response_text, re.DOTALL):
        attr_str, body = match.group(1), match.group(2).strip()
        attrs = dict(re.findall(r'(\w+)="([^"]*)"', attr_str))
        action_type = attrs.pop("type", "unknown")
        actions.append(Action(type=action_type, attrs=attrs, body=body))
    return actions


def handle_message(user_message: str, conversation_id: str = None, model: str = "") -> str:
    system_prompt = memory.load_system_prompt()
    overview = memory.load_overview()

    project = pi.pick_project(user_message, overview)

    project_context = memory.load_project_context(project) if project else ""
    memory_filenames = memory.list_project_memories(project) if project else []
    relevant_memories = pi.pick_memories(user_message, memory_filenames)
    memories = memory.load_specific(project, relevant_memories) if project else []

    conv_history = memory.load_conversation(conversation_id) if conversation_id else None
    task_list = memory.list_active_tasks(project) if project else []

    response = pi.chat(
        user_message, system_prompt, overview,
        project_context, memories, task_list, conv_history,
        model=model,
    )

    if not conversation_id:
        conversation_id = f"conv-{uuid.uuid4().hex[:8]}"
    memory.append_conversation(conversation_id, user_message, response.text)

    actions = parse_actions(response.text)
    for action in actions:
        if action.type in FORBIDDEN_ACTIONS:
            memory.log(f"BLOCKED forbidden action: {action.type} {action.attrs}")
            continue
        if action.type not in ALLOWED_ACTIONS:
            memory.log(f"SKIPPED unknown action: {action.type}")
            continue

        if action.type == "spawn_subagent":
            project_name = action.attrs.get("project", project)
            task_id = action.attrs.get("task_id", "")
            if not task_id:
                task_id = f"task-{uuid.uuid4().hex[:6]}"
            memory.create_task(task_id, project_name or "general", action.body)
            memory.append_task_activity(task_id, {
                "type": "phoung_note",
                "message": f"Spawning sub-agent for: {action.body[:120]}",
            })
            agent_type = action.attrs.get("agent_type", "pi")
            spawner.spawn(task_id, project_name, action.body, agent_type=agent_type)
        elif action.type == "check_status":
            project_ctx = memory.load_project_context(action.attrs.get("project", project))
            repo_url = _extract_repo_url(project_ctx)
            if repo_url:
                prs = github.check_prs(repo_url)
                task_id = action.attrs.get("task_id", "")
                if task_id:
                    memory.update_task(task_id, pr_status=str(prs))
        elif action.type == "update_task":
            task_id = action.attrs.get("task_id", "")
            updates = {k: v for k, v in action.attrs.items() if k != "task_id"}
            if task_id:
                old_task = memory.load_task(task_id)
                old_status = old_task["meta"].get("status") if old_task else None
                memory.update_task(task_id, **updates)
                new_status = updates.get("status")
                if new_status and new_status != old_status:
                    memory.append_task_activity(task_id, {
                        "type": "status_change",
                        "from": old_status or "unknown",
                        "to": new_status,
                    })
        elif action.type == "create_memory":
            memory.create_memory(
                action.attrs.get("id", ""),
                action.body,
                action.attrs.get("tags", "").split(","),
                action.attrs.get("summary", ""),
                project=action.attrs.get("project", project or "general"),
            )
        elif action.type == "update_memory":
            memory.write(action.attrs.get("file", ""), action.body)
        elif action.type == "ask_human":
            task_id = action.attrs.get("task_id", "")
            if task_id:
                memory.update_task(task_id, status="needs_human", question=action.body)
                memory.append_task_activity(task_id, {
                    "type": "phoung_note",
                    "message": f"Needs human input: {action.body}",
                })

    clean = re.sub(r'<action\s+[^>]+>.*?</action>', '', response.text, flags=re.DOTALL).strip()
    return clean


def _extract_repo_url(context: str) -> str | None:
    match = re.search(r"github\.com/[\w\-]+/[\w\-]+", context)
    if match:
        return f"https://{match.group(0)}"
    return None
