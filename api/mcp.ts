import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { handler } from "../src/mcpServer.js";

export const config = {
  maxDuration: 60,
};

export default async function vercelNodeHandler(
  req: IncomingMessage,
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

  let body: ReadableStream<Uint8Array> | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>;
  }

  const request = new Request(url, {
    method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  } as RequestInit & { duplex?: "half" });

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
          message:
            err instanceof Error ? err.message : "Internal handler error",
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
