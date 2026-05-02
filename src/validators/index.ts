import { Claim } from "../schema.js";
import { validateLinear } from "./linear.js";
import { validateWebFetch } from "./webFetch.js";
import { validateFilePath } from "./filePath.js";
import { validateInferred } from "./inferred.js";
import { validateNeonQuery } from "./neonQuery.js";
import { validateToolCall } from "./toolCall.js";
import { validateProjectKnowledge } from "./projectKnowledge.js";
import { ValidatorResult } from "./types.js";

export type ValidationFailure = { claim_index: number; reason: string };

async function validateOne(claim: Claim): Promise<ValidatorResult> {
  switch (claim.source_type) {
    case "linear_id":
      return validateLinear(claim.source_reference);
    case "web_fetch":
      return validateWebFetch(claim.source_reference);
    case "file_path":
      return validateFilePath(claim.source_reference);
    case "inferred":
      return validateInferred(claim.premises);
    case "neon_query":
      return validateNeonQuery(claim.source_reference);
    case "tool_call":
      return validateToolCall(claim.source_reference);
    case "project_knowledge":
      return validateProjectKnowledge(claim.source_reference);
    default: {
      const _exhaustive: never = claim.source_type;
      return { ok: false, reason: `unknown source_type: ${_exhaustive}` };
    }
  }
}

export async function validateClaims(claims: Claim[]): Promise<ValidationFailure[]> {
  const results = await Promise.all(claims.map((c) => validateOne(c)));
  const failures: ValidationFailure[] = [];
  results.forEach((res, i) => {
    if (!res.ok) {
      failures.push({ claim_index: i, reason: res.reason });
    }
  });
  return failures;
}
