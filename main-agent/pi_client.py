from dataclasses import dataclass

import httpx

from config import (
    ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL,
    DEFAULT_MODEL,
    FALLBACK_LLM,
    GLM_MODEL,
    KIMI_MODEL,
    MOONSHOT_API_KEY,
    PI_API_KEY,
    PI_API_URL,
    PI_MODEL,
    ZHIPU_API_KEY,
)


@dataclass
class AgentResponse:
    text: str
    raw: dict


def _call_pi(messages: list[dict], system: str = "") -> AgentResponse:
    headers = {"Authorization": f"Bearer {PI_API_KEY}", "Content-Type": "application/json"}
    payload = {"model": PI_MODEL, "messages": messages}
    if system:
        payload["messages"] = [{"role": "system", "content": system}] + payload["messages"]

    resp = httpx.post(PI_API_URL, json=payload, headers=headers, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    text = data["choices"][0]["message"]["content"]
    return AgentResponse(text=text, raw=data)


def _call_zhipu(messages: list[dict], system: str = "", model: str = "") -> AgentResponse:
    m = model or GLM_MODEL
    hdrs = {"Authorization": f"Bearer {ZHIPU_API_KEY}", "Content-Type": "application/json"}
    payload: dict = {"model": m, "messages": messages}
    if system:
        payload["messages"] = [{"role": "system", "content": system}] + payload["messages"]
    resp = httpx.post(
        "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        json=payload, headers=hdrs, timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["choices"][0]["message"]["content"]
    return AgentResponse(text=text, raw=data)


def _call_moonshot(messages: list[dict], system: str = "", model: str = "") -> AgentResponse:
    m = model or KIMI_MODEL
    hdrs = {"Authorization": f"Bearer {MOONSHOT_API_KEY}", "Content-Type": "application/json"}
    payload: dict = {"model": m, "messages": messages}
    if system:
        payload["messages"] = [{"role": "system", "content": system}] + payload["messages"]
    resp = httpx.post(
        "https://api.moonshot.ai/v1/chat/completions",
        json=payload, headers=hdrs, timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["choices"][0]["message"]["content"]
    return AgentResponse(text=text, raw=data)


def _call_claude(messages: list[dict], system: str = "") -> AgentResponse:
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {"model": ANTHROPIC_MODEL, "max_tokens": 4096, "messages": messages}
    if system:
        payload["system"] = system

    resp = httpx.post(
        "https://api.anthropic.com/v1/messages",
        json=payload, headers=headers, timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = data["content"][0]["text"]
    return AgentResponse(text=text, raw=data)


def _build_messages(
    user_message: str,
    overview: str,
    project_context: str,
    memories: list[dict],
    task_list: list[dict],
    conv_history: str | None,
    system_prompt: str = "",
) -> list[dict]:
    context_parts = []
    if overview:
        context_parts.append(f"## Projects Overview\n{overview}")
    if project_context:
        context_parts.append(f"## Current Project Context\n{project_context}")
    if memories:
        mem_text = "\n\n".join(
            f"### Memory: {m['filename']}\n{m['content']}" for m in memories
        )
        context_parts.append(f"## Relevant Memories\n{mem_text}")
    if task_list:
        tasks_text = "\n".join(
            f"- {t['meta'].get('id', '?')}: {t['meta'].get('status', '?')} — {t['body'][:100]}"
            for t in task_list
        )
        context_parts.append(f"## Active Tasks\n{tasks_text}")

    messages = []

    if conv_history:
        messages.append({"role": "user", "content": f"[Previous conversation context]\n{conv_history}"})
        messages.append({"role": "assistant", "content": "Understood, continuing from where we left off."})

    if context_parts:
        messages.append({"role": "user", "content": "\n\n".join(context_parts)})
        messages.append({"role": "assistant", "content": "Context loaded."})

    messages.append({"role": "user", "content": user_message})
    return messages


def _dispatch(messages: list[dict], system: str, model: str) -> AgentResponse:
    m = model or DEFAULT_MODEL
    if m.startswith("glm-") or m.startswith("chatglm"):
        if not ZHIPU_API_KEY:
            raise RuntimeError("ZHIPU_API_KEY not set")
        return _call_zhipu(messages, system=system, model=m)
    if m.startswith("moonshot-") or m.startswith("kimi-"):
        if not MOONSHOT_API_KEY:
            raise RuntimeError("MOONSHOT_API_KEY not set")
        return _call_moonshot(messages, system=system, model=m)
    if m.startswith("claude-"):
        if not ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY not set")
        return _call_claude(messages, system=system)
    if m.startswith("inflection_") and PI_API_KEY:
        return _call_pi(messages, system=system)
    # fallback priority
    if ZHIPU_API_KEY:
        return _call_zhipu(messages, system=system)
    if MOONSHOT_API_KEY:
        return _call_moonshot(messages, system=system)
    if ANTHROPIC_API_KEY:
        return _call_claude(messages, system=system)
    if PI_API_KEY:
        return _call_pi(messages, system=system)
    raise RuntimeError("No LLM API key configured. Set ZHIPU_API_KEY, MOONSHOT_API_KEY, ANTHROPIC_API_KEY, or PI_API_KEY.")


def chat(
    user_message: str,
    system_prompt: str,
    overview: str,
    project_context: str,
    memories: list[dict],
    task_list: list[dict],
    conv_history: str | None,
    model: str = "",
) -> AgentResponse:
    messages = _build_messages(user_message, overview, project_context, memories, task_list, conv_history)
    return _dispatch(messages, system_prompt, model)


def pick_project(user_message: str, overview: str) -> str | None:
    msg_lower = user_message.lower()
    best = None
    best_len = 0
    for line in overview.splitlines():
        line = line.strip().lstrip("#- ").strip()
        if not line:
            continue
        candidate = line.split()[0].lower().rstrip(":,")
        if len(candidate) >= 3 and candidate in msg_lower and len(candidate) > best_len:
            best = candidate
            best_len = len(candidate)
    return best or "general"


def pick_memories(user_message: str, memory_list: list[dict]) -> list[str]:
    return [m["filename"] for m in memory_list]
