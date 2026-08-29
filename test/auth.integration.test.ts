import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handler } from "../src/mcpServer.js";

const ENDPOINT = "https://claim-check-mcp.vercel.app/api/mcp";
const TOKEN = "a".repeat(64);

function mcpRequest(url = ENDPOINT, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

beforeEach(() => {
  vi.stubEnv("CLAIM_CHECK_TOKEN", TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * These run against the real exported handler, proving the MCP transport is
 * actually behind the auth gate rather than the gate merely existing.
 *
 * Only the rejection paths are exercised in-process: an authorised request
 * opens a streamable-HTTP response that does not settle without a live server,
 * so the 200 paths are covered by the unit suite and by the live curl checks.
 */
describe("Exported MCP handler is behind the auth gate", () => {
  it("rejects an unauthenticated MCP request with 401", async () => {
    const res = await handler(mcpRequest());
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "unauthorised" });
  });

  it("rejects an MCP request bearing the wrong token with 401", async () => {
    const res = await handler(mcpRequest(ENDPOINT, { authorization: "Bearer wrong-token" }));
    expect(res.status).toBe(401);
  });

  it("rejects an MCP request whose key query parameter is wrong with 401", async () => {
    const res = await handler(mcpRequest(`${ENDPOINT}?key=wrong-token`));
    expect(res.status).toBe(401);
  });

  it("fails closed with 500 when CLAIM_CHECK_TOKEN is unset", async () => {
    vi.stubEnv("CLAIM_CHECK_TOKEN", undefined as unknown as string);
    const res = await handler(mcpRequest(ENDPOINT, { authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "auth not configured" });
  });
});
