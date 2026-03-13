import { resolve } from "node:path";

export const MEMORY_DIR = process.env.MEMORY_DIR || resolve(import.meta.dirname, "../../memory");

export const KIMI_API_KEY = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || "";
export const ZAI_API_KEY = process.env.ZAI_API_KEY || process.env.ZHIPU_API_KEY || "";
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

export const MAX_CONCURRENT_SUBAGENTS = parseInt(process.env.MAX_CONCURRENT_SUBAGENTS || "3", 10);
export const SUBAGENT_IMAGE = process.env.SUBAGENT_IMAGE || "phoung/subagent:latest";
export const SUBAGENT_MODEL = process.env.SUBAGENT_MODEL || "";
export const SUBAGENT_MEMORY_LIMIT = process.env.SUBAGENT_MEMORY_LIMIT || "4g";
export const SUBAGENT_CPUS = process.env.SUBAGENT_CPUS || "2";

export const REPOS_DIR = process.env.REPOS_DIR || resolve(import.meta.dirname, "../../repos");
export const WORKSPACES_DIR = process.env.WORKSPACES_DIR || "/tmp/clawdeploy-workspaces";
export const SUBAGENT_RUNTIME = process.env.SUBAGENT_RUNTIME || "runc";

export const API_HOST = process.env.API_HOST || "0.0.0.0";
export const API_PORT = parseInt(process.env.API_PORT || "8000", 10);
