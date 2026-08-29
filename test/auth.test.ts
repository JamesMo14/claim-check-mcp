import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkAuth, withAuth, bearerToken, queryToken, redactToken } from "../src/auth.js";

const TOKEN = "a".repeat(64);
const WRONG_TOKEN = "b".repeat(64);
const ENDPOINT = "https://claim-check-mcp.vercel.app/api/mcp";

/** Stands in for the MCP transport, so these tests exercise the auth gate alone. */
const downstream = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
const guarded = withAuth(downstream);

function request(init: { headers?: Record<string, string>; url?: string } = {}): Request {
  return new Request(init.url ?? ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

beforeEach(() => {
  downstream.mockClear();
  vi.stubEnv("CLAIM_CHECK_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Shared-token auth (COG-1155)", () => {
  it("Case A: no token at all -> 401 and the request never reaches the MCP handler", async () => {
    const res = await guarded(request());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorised" });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("Case B: wrong token in the Authorization header -> 401", async () => {
    const res = await guarded(request({ headers: { authorization: `Bearer ${WRONG_TOKEN}` } }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorised" });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("Case B2: wrong token in the key query parameter -> 401", async () => {
    const res = await guarded(request({ url: `${ENDPOINT}?key=${WRONG_TOKEN}` }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorised" });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("Case C: valid token in the Authorization header -> 200", async () => {
    const res = await guarded(request({ headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(200);
    expect(downstream).toHaveBeenCalledTimes(1);
  });

  it("Case C2: the Bearer scheme is matched case-insensitively", async () => {
    const res = await guarded(request({ headers: { authorization: `bearer ${TOKEN}` } }));
    expect(res.status).toBe(200);
  });

  it("Case D: valid token in the key query parameter -> 200", async () => {
    const res = await guarded(request({ url: `${ENDPOINT}?key=${TOKEN}` }));
    expect(res.status).toBe(200);
    expect(downstream).toHaveBeenCalledTimes(1);
  });

  it("Case D2: a valid query token still passes when an invalid header is also present", async () => {
    const res = await guarded(
      request({ url: `${ENDPOINT}?key=${TOKEN}`, headers: { authorization: "Bearer nonsense" } })
    );
    expect(res.status).toBe(200);
  });

  it("Case E: CLAIM_CHECK_TOKEN unset -> 500, fail closed", async () => {
    vi.stubEnv("CLAIM_CHECK_TOKEN", undefined as unknown as string);
    const res = await guarded(request({ headers: { authorization: `Bearer ${TOKEN}` } }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "auth not configured" });
    expect(downstream).not.toHaveBeenCalled();
  });

  it("Case E2: CLAIM_CHECK_TOKEN set to whitespace is treated as unset", async () => {
    vi.stubEnv("CLAIM_CHECK_TOKEN", "   ");
    const res = await guarded(request({ headers: { authorization: "Bearer    " } }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "auth not configured" });
  });

  it("rejection bodies name neither carrier nor any token material", async () => {
    const res = await guarded(request({ url: `${ENDPOINT}?key=${WRONG_TOKEN}` }));
    const body = await res.text();
    expect(body).toBe('{"error":"unauthorised"}');
    expect(body).not.toContain(WRONG_TOKEN);
  });

  it("checkAuth reads the environment it is handed", () => {
    const req = request({ headers: { authorization: `Bearer ${TOKEN}` } });
    expect(checkAuth(req, { CLAIM_CHECK_TOKEN: TOKEN })).toBeUndefined();
    expect(checkAuth(req, { CLAIM_CHECK_TOKEN: WRONG_TOKEN })?.status).toBe(401);
    expect(checkAuth(req, {})?.status).toBe(500);
  });
});

describe("Carrier parsing", () => {
  it("bearerToken pulls the credential out of the header", () => {
    expect(bearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
    expect(bearerToken(`  Bearer   ${TOKEN}  `)).toBe(TOKEN);
    expect(bearerToken(null)).toBeUndefined();
    expect(bearerToken("")).toBeUndefined();
    expect(bearerToken("Bearer")).toBeUndefined();
    expect(bearerToken("Bearer   ")).toBeUndefined();
    expect(bearerToken(`Basic ${TOKEN}`)).toBeUndefined();
  });

  it("queryToken pulls the credential out of the key parameter", () => {
    expect(queryToken(`${ENDPOINT}?key=${TOKEN}`)).toBe(TOKEN);
    expect(queryToken(`${ENDPOINT}?other=1&key=${TOKEN}`)).toBe(TOKEN);
    expect(queryToken(ENDPOINT)).toBeUndefined();
    expect(queryToken(`${ENDPOINT}?key=`)).toBeUndefined();
    expect(queryToken("not-a-url")).toBeUndefined();
  });
});

describe("Log redaction", () => {
  it("strips token values from anything destined for a log line", () => {
    expect(redactToken(`GET ${ENDPOINT}?key=${TOKEN} failed`)).toBe(
      `GET ${ENDPOINT}?key=[redacted] failed`
    );
    expect(redactToken(`authorization: Bearer ${TOKEN}`)).toBe("authorization: Bearer [redacted]");
    expect(redactToken(`${ENDPOINT}?a=1&key=${TOKEN}&b=2`)).toBe(`${ENDPOINT}?a=1&key=[redacted]&b=2`);
    expect(redactToken(`${ENDPOINT}?key=${TOKEN}`)).not.toContain(TOKEN);
  });
});
