import { ValidatorResult } from "./types.js";

const WIN_ABS = /^[A-Za-z]:[\\/]/;

export function validateFilePath(reference: string): ValidatorResult {
  if (reference.includes("..")) {
    return { ok: false, reason: "file path may not contain '..' (traversal)" };
  }
  const isAbsolute = reference.startsWith("/") || WIN_ABS.test(reference);
  if (!isAbsolute) {
    return {
      ok: false,
      reason: "file path must be absolute (POSIX '/...' or Windows 'X:\\...')",
    };
  }
  return { ok: true };
}
