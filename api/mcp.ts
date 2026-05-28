import type { IncomingMessage, ServerResponse } from "node:http";
import { handler } from "../src/mcpServer.js";

export const config = {
  maxDuration: 60,
};

type WithBody = IncomingMessage & { body?: unknown };

function bodyToString(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return JSON.stringify(body);
}

export default async function vercelNodeHandler(
  req: WithBody,
  res: ServerResponse
) {
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
  const host =
    (req.headers["x-forwarded-host"] as string) ??
    (req.headers.host as string) ??
    "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => headers.append(key, v));
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? "GET";

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = bodyToString(req.body);
    if (body === undefined) {
      const chunks: Buffer[] = [];
      for await (const chunk of req as AsyncIterable<Buffer>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length > 0) body = Buffer.concat(chunks).toString("utf8");
    }
  }

  // [TEMP DIAGNOSTIC — remove after fix confirmed] shape-only log of inbound tools/call args
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed?.method === "tools/call") {
        const args = parsed?.params?.arguments;
        const argKeys = args && typeof args === "object" ? Object.keys(args) : null;
        const claimsIsArray = Array.isArray(args?.claims);
        const claimsLength = claimsIsArray ? args.claims.length : null;
        console.log(
          `[claim-check-mcp] tools/call name=${parsed?.params?.name} argKeys=${JSON.stringify(argKeys)} claimsIsArray=${claimsIsArray} claimsLength=${claimsLength}`
        );
      }
    } catch {
      // swallow — diagnostic only, never break the request path
    }
  }

  const request = new Request(url, {
    method,
    headers,
    body,
  });

  let response: Response;
  try {
    response = await handler(request);
  } catch (err) {
    console.error("[claim-check-mcp] handler threw:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Internal handler error",
        },
        id: null,
      })
    );
    return;
  }

  res.statusCode = response.status;
  response.headers.forEach((v, k) => {
    res.setHeader(k, v);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}
