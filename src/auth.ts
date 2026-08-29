import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared-token auth for the claim-check MCP endpoint (COG-1155).
 *
 * The token is accepted from either carrier, because the three clients that
 * call this server differ in what they can send:
 *   - `Authorization: Bearer <token>` — Cursor Cloud Agents, Codex, and
 *     claude.ai where the "Request headers" connector beta is available.
 *   - `?key=<token>` — fallback for clients that cannot set custom headers.
 *
 * Token values and the query string are never logged.
 */

const TOKEN_ENV_VAR = "CLAIM_CHECK_TOKEN";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time comparison. Both operands are hashed first so the comparison
 * runs over fixed-width (32 byte) buffers and cannot leak the token length.
 */
function tokensMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(sha256(presented), sha256(expected));
}

/** Extracts the credential from an `Authorization: Bearer <token>` header. */
export function bearerToken(headerValue: string | null | undefined): string | undefined {
  if (!headerValue) return undefined;
  const match = /^Bearer[ \t]+(\S.*)$/i.exec(headerValue.trim());
  if (!match) return undefined;
  const token = match[1].trim();
  return token.length > 0 ? token : undefined;
}

/** Extracts the credential from the `key` query parameter. */
export function queryToken(requestUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return undefined;
  }
  const token = parsed.searchParams.get("key");
  return token && token.length > 0 ? token : undefined;
}

/**
 * Returns a rejection Response when the request must not proceed, or
 * `undefined` when it is authorised.
 *
 * Fails closed: if the token is not configured in the environment, every
 * request is rejected with 500 rather than silently running open.
 */
export function checkAuth(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): Response | undefined {
  const expected = env[TOKEN_ENV_VAR]?.trim();
  if (!expected) {
    return jsonResponse(500, { error: "auth not configured" });
  }

  const presented = [bearerToken(request.headers.get("authorization")), queryToken(request.url)];

  for (const candidate of presented) {
    if (candidate && tokensMatch(candidate, expected)) return undefined;
  }

  return jsonResponse(401, { error: "unauthorised" });
}

/** Wraps a fetch-style handler so auth is enforced before anything else runs. */
export function withAuth(
  next: (request: Request) => Response | Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const rejection = checkAuth(request);
    if (rejection) return rejection;
    return next(request);
  };
}

/** Strips any `key=` query-parameter value from text destined for a log or an error body. */
export function redactToken(value: string): string {
  return value
    .replace(/([?&]key=)[^&\s"']*/gi, "$1[redacted]")
    .replace(/(bearer[ \t]+)\S+/gi, "$1[redacted]");
}
