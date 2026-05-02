import { ValidatorResult, withTimeout } from "./types.js";

const CACHE = new Map<string, { ts: number; ok: boolean; reason?: string }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function validateWebFetch(reference: string): Promise<ValidatorResult> {
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    return { ok: false, reason: "reference is not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "URL must use http or https" };
  }

  const cacheKey = url.toString();
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.ok ? { ok: true } : { ok: false, reason: cached.reason ?? "cached failure" };
  }

  const result = await withTimeout(async (signal) => {
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal });
    }
    if (res.ok) {
      return { ok: true as const };
    }
    return { ok: false as const, reason: `URL returned HTTP ${res.status}` };
  }, "web_fetch");

  if ("__timeout" in result) {
    const failure = { ok: false as const, reason: result.reason };
    CACHE.set(cacheKey, { ts: Date.now(), ok: false, reason: failure.reason });
    return failure;
  }

  CACHE.set(cacheKey, {
    ts: Date.now(),
    ok: result.ok,
    reason: result.ok ? undefined : result.reason,
  });
  return result;
}

export function clearWebFetchCache() {
  CACHE.clear();
}
