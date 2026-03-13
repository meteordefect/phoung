from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import docker as docker_sdk

import memory
import github_client as github
from agent import handle_message
from config import API_HOST, API_PORT

_docker_client = None

def _get_docker():
    global _docker_client
    if _docker_client is None:
        _docker_client = docker_sdk.from_env()
    return _docker_client

app = FastAPI(title="DevOpsTasks API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    model: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: str


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.get("/tasks")
def list_tasks():
    return memory.list_all_tasks()


@app.get("/tasks/{task_id}")
def get_task(task_id: str):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/tasks/{task_id}/merge")
def merge_task(task_id: str):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    pr = task["meta"].get("pr")
    if not pr:
        raise HTTPException(status_code=400, detail="No PR associated with this task")

    project_context = memory.load_project_context(task["meta"].get("project", ""))
    import re
    match = re.search(r"github\.com/[\w\-]+/[\w\-]+", project_context)
    if not match:
        raise HTTPException(status_code=400, detail="No repo URL found")

    repo_url = f"https://{match.group(0)}"
    github.merge_pr(repo_url, int(pr))
    memory.move_to_completed(task_id)
    return {"status": "merged"}


@app.get("/tasks/{task_id}/activity")
def get_task_activity(task_id: str):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return memory.load_task_activity(task_id)


@app.get("/tasks/{task_id}/runs/{run}/log")
def get_agent_run_log(task_id: str, run: int):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    log_text = memory.load_agent_log(task_id, run)
    if log_text is None:
        raise HTTPException(status_code=404, detail=f"No log found for run {run}")
    return {"task_id": task_id, "run": run, "log": log_text}


@app.get("/tasks/{task_id}/pr-info")
def get_task_pr_info(task_id: str):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    pr = task["meta"].get("pr")
    if not pr:
        raise HTTPException(status_code=400, detail="No PR associated with this task")
    project_context = memory.load_project_context(task["meta"].get("project", ""))
    import re
    match = re.search(r"github\.com/[\w\-]+/[\w\-]+", project_context)
    if not match:
        raise HTTPException(status_code=400, detail="No repo URL found")
    repo_url = f"https://{match.group(0)}"
    return github.get_pr_details(repo_url, int(pr))


@app.post("/tasks/{task_id}/reject")
def reject_task(task_id: str):
    task = memory.load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    pr = task["meta"].get("pr")
    if pr:
        project_context = memory.load_project_context(task["meta"].get("project", ""))
        import re
        match = re.search(r"github\.com/[\w\-]+/[\w\-]+", project_context)
        if match:
            repo_url = f"https://{match.group(0)}"
            github.close_pr(repo_url, int(pr))
    memory.update_task(task_id, status="rejected")
    return {"status": "rejected"}


@app.post("/chat")
def chat(req: ChatRequest):
    conv_id = req.conversation_id
    if not conv_id:
        conv_id = memory.create_conversation()
    response_text = handle_message(req.message, conv_id, model=req.model or "")
    return ChatResponse(response=response_text, conversation_id=conv_id)


@app.get("/conversations")
def list_conversations():
    return memory.list_all_conversations()


@app.get("/conversations/{conv_id}")
def get_conversation(conv_id: str):
    conv = memory.load_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"id": conv_id, "content": conv}


@app.post("/conversations/new")
def new_conversation():
    conv_id = memory.create_conversation()
    return {"conversation_id": conv_id}


@app.get("/models")
def list_models():
    from config import ANTHROPIC_API_KEY, DEFAULT_MODEL, GLM_MODEL, KIMI_MODEL, MOONSHOT_API_KEY, PI_API_KEY, ZHIPU_API_KEY
    candidates = []
    if MOONSHOT_API_KEY:
        candidates.append({"id": KIMI_MODEL, "label": "Kimi K2.5"})
    if ZHIPU_API_KEY:
        candidates.append({"id": GLM_MODEL, "label": "GLM 4.7"})
    if ANTHROPIC_API_KEY:
        from config import ANTHROPIC_MODEL
        candidates.append({"id": ANTHROPIC_MODEL, "label": "Claude"})
    if PI_API_KEY:
        candidates.append({"id": "inflection_3_pi", "label": "Pi"})
    # Mark the configured default; sort it to the front
    for m in candidates:
        m["default"] = m["id"] == DEFAULT_MODEL
    candidates.sort(key=lambda m: (not m["default"],))
    return candidates


@app.get("/projects")
def list_projects():
    projects = memory.list_projects()
    result = []
    for p in projects:
        ctx = memory.load_project_context(p)
        result.append({"name": p, "context_preview": ctx[:200] if ctx else ""})
    return result


KNOWN_CONTAINERS = {
    "api": "phoung-api",
    "ui": "phoung-ui",
    "nginx": "phoung-nginx",
}


@app.get("/logs")
def list_log_services():
    return list(KNOWN_CONTAINERS.keys())


@app.get("/logs/{service}")
def get_logs(service: str, lines: int = Query(default=200, le=2000)):
    container_name = KNOWN_CONTAINERS.get(service)
    if not container_name:
        raise HTTPException(status_code=404, detail=f"Unknown service: {service}")
    try:
        client = _get_docker()
        container = client.containers.get(container_name)
        raw = container.logs(tail=lines, timestamps=True).decode("utf-8", errors="replace")
        return {"service": service, "container": container_name, "logs": raw}
    except docker_sdk.errors.NotFound:
        raise HTTPException(status_code=404, detail=f"Container {container_name} not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
