import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
MEMORY_DIR = Path(os.getenv("MEMORY_DIR", APP_DIR / "memory"))

PI_API_KEY = os.getenv("PI_API_KEY", "")
PI_API_URL = os.getenv("PI_API_URL", "https://api.inflection.ai/v1/chat/completions")
PI_MODEL = os.getenv("PI_MODEL", "inflection_3_pi")

FALLBACK_LLM = os.getenv("FALLBACK_LLM", "claude")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

ZHIPU_API_KEY = os.getenv("ZHIPU_API_KEY", "")
GLM_MODEL = os.getenv("GLM_MODEL", "glm-4.7-flash")

MOONSHOT_API_KEY = os.getenv("MOONSHOT_API_KEY", "")
KIMI_MODEL = os.getenv("KIMI_MODEL", "moonshot-v1-8k")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", GLM_MODEL if os.getenv("ZHIPU_API_KEY") else KIMI_MODEL)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")

MAX_CONCURRENT_SUBAGENTS = int(os.getenv("MAX_CONCURRENT_SUBAGENTS", "3"))

SUBAGENT_IMAGE = os.getenv("SUBAGENT_IMAGE", "phoung/subagent:latest")
SUBAGENT_MODEL = os.getenv("SUBAGENT_MODEL", "")
SUBAGENT_MEMORY_LIMIT = os.getenv("SUBAGENT_MEMORY_LIMIT", "4g")
SUBAGENT_CPUS = os.getenv("SUBAGENT_CPUS", "2")

API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
