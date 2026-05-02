import { ValidatorResult } from "./types.js";

const ALLOW_LIST = new Set([
  "Linear",
  "project_knowledge_search",
  "view",
  "bash_tool",
  "web_search",
  "web_fetch",
  "conversation_search",
  "places_search",
  "weather_fetch",
  "fetch_sports_data",
  "image_search",
]);

const CONNECTOR_PREFIX = /^[A-Z][A-Za-z0-9_]+:/;

export function validateToolCall(reference: string): ValidatorResult {
  const firstToken = reference.trim().split(/[\s(]/)[0] ?? "";

  if (CONNECTOR_PREFIX.test(firstToken)) {
    return { ok: true };
  }

  for (const allowed of ALLOW_LIST) {
    if (firstToken === allowed || reference.startsWith(allowed + " ") || reference.startsWith(allowed + "(")) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    reason: `tool_call reference must name a recognised tool. Got: "${firstToken}"`,
  };
}
