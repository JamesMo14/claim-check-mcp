import { createMcpHandler } from "mcp-handler";
import { withAuth } from "./auth.js";
import { SubmitInputSchema } from "./schema.js";
import { validateClaims } from "./validators/index.js";
import { renderManifest } from "./render.js";

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "submit_verified_analysis",
      {
        title: "Submit verified analysis",
        description:
          "Submit an analytical output with sourced claims. Validates each claim's source reference (Linear IDs resolve, URLs return 200, file paths are absolute, inferred claims have premises). On success, returns the analysis rendered with a CLAIM CHECK manifest. On failure, returns a structured rejection with per-claim reasons and an instruction to resubmit.",
        inputSchema: SubmitInputSchema,
      },
      async (rawInput) => {
        const parsed = SubmitInputSchema.safeParse(rawInput);
        if (!parsed.success) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    validation_failures: parsed.error.issues.map((iss) => ({
                      path: iss.path.join("."),
                      reason: iss.message,
                    })),
                    message:
                      "Analysis rejected at schema layer. Fix the validation failures and resubmit.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const input = parsed.data;
        const failures = await validateClaims(input.claims);

        if (failures.length > 0) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    validation_failures: failures,
                    message: "Analysis rejected. Fix the validation failures and resubmit.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text:
                `Analysis accepted. ${input.claims.length} claim${
                  input.claims.length === 1 ? "" : "s"
                } validated.\n\n` + renderManifest(input),
            },
          ],
        };
      }
    );
  },
  {
    serverInfo: {
      name: "claim-check-mcp",
      version: "0.1.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  }
);

/**
 * Every request passes shared-token auth (COG-1155) before it reaches the MCP
 * transport. Fails closed when CLAIM_CHECK_TOKEN is unset.
 */
export const handler = withAuth(mcpHandler);
