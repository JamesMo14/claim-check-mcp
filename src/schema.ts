import { z } from "zod";

export const SOURCE_TYPES = [
  "tool_call",
  "linear_id",
  "file_path",
  "web_fetch",
  "neon_query",
  "project_knowledge",
  "inferred",
] as const;

export const ClaimSchema = z
  .object({
    statement: z
      .string()
      .min(5)
      .max(300)
      .describe("The factual claim, paraphrased in 10-30 words"),
    source_type: z.enum(SOURCE_TYPES),
    source_reference: z
      .string()
      .min(3)
      .describe(
        "Specific reference: tool name + key params, Linear ID like COG-123, absolute file path, URL, or list of premises for inferred"
      ),
    evidence_excerpt: z
      .string()
      .min(10)
      .max(1000)
      .describe("Excerpt or summary of what the source said, 1-3 sentences"),
    premises: z
      .array(z.string())
      .optional()
      .describe(
        "Required when source_type is 'inferred' — the verified premises the inference rests on"
      ),
  })
  .superRefine((claim, ctx) => {
    if (claim.source_type !== "inferred") return;
    if (!claim.premises || claim.premises.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["premises"],
        message: "premises array required (>=1 entry) when source_type is 'inferred'",
      });
      return;
    }
    claim.premises.forEach((p, i) => {
      if (p.length < 10) {
        ctx.addIssue({
          code: "custom",
          path: ["premises", i],
          message: "each premise must be >=10 characters",
        });
      }
    });
  });

export type Claim = z.infer<typeof ClaimSchema>;

export const SubmitInputShape = {
  analysis_content: z
    .string()
    .min(50)
    .describe("The analytical prose"),
  claims: z
    .array(ClaimSchema)
    .min(1)
    .describe(
      "Every factual claim in the analysis. Min 1, no upper bound."
    ),
  confidence_statement: z
    .string()
    .min(30)
    .describe(
      "Where the analysis is least confident. Names the weakest-sourced claim and what would strengthen it."
    ),
} as const;

export const SubmitInputSchema = z.object(SubmitInputShape);

export type SubmitInput = z.infer<typeof SubmitInputSchema>;
