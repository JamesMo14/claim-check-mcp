import { ValidatorResult } from "./types.js";

const SELECT_PATTERN = /^\s*SELECT\b/i;
const QUERY_ID_PATTERN = /\b(query|migration|sql)[:#-]?[a-zA-Z0-9_-]+/i;

export function validateNeonQuery(reference: string): ValidatorResult {
  if (SELECT_PATTERN.test(reference) || QUERY_ID_PATTERN.test(reference)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      "neon_query reference must start with SELECT or contain a query identifier (query:..., migration:..., sql:...)",
  };
}
