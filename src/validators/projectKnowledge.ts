import { ValidatorResult } from "./types.js";

export function validateProjectKnowledge(reference: string): ValidatorResult {
  const words = reference.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) {
    return {
      ok: false,
      reason: "project_knowledge reference must contain a search query (>=3 words)",
    };
  }
  return { ok: true };
}
