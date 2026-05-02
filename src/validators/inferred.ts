import { ValidatorResult } from "./types.js";

export function validateInferred(premises: string[] | undefined): ValidatorResult {
  if (!premises || premises.length < 1) {
    return { ok: false, reason: "inferred claim missing premises array" };
  }
  for (let i = 0; i < premises.length; i++) {
    if (premises[i].length < 10) {
      return { ok: false, reason: `premise[${i}] must be >=10 characters` };
    }
  }
  return { ok: true };
}
