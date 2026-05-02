import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SubmitInputSchema, type Claim } from "../src/schema.js";
import { validateClaims } from "../src/validators/index.js";
import { renderManifest } from "../src/render.js";
import { clearWebFetchCache } from "../src/validators/webFetch.js";

const baseAnalysis =
  "This is a non-trivial analytical artefact long enough to satisfy the analysis_content schema.";
const baseConfidence =
  "The weakest link is claim 1, which rests on a single source. Cross-referencing against a second source would strengthen it.";

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    statement: "Default placeholder statement for testing",
    source_type: "tool_call",
    source_reference: "web_search",
    evidence_excerpt: "Excerpt long enough to satisfy the schema minimum.",
    ...overrides,
  } as Claim;
}

beforeEach(() => {
  clearWebFetchCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Schema-level rejections", () => {
  it("Case 1: rejects empty claims array", () => {
    const parsed = SubmitInputSchema.safeParse({
      analysis_content: baseAnalysis,
      claims: [],
      confidence_statement: baseConfidence,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.includes("claims"))).toBe(true);
    }
  });

  it("Case 2: rejects claim missing source_reference", () => {
    const parsed = SubmitInputSchema.safeParse({
      analysis_content: baseAnalysis,
      claims: [
        {
          statement: "Some statement here",
          source_type: "tool_call",
          evidence_excerpt: "Some excerpt long enough.",
        },
      ],
      confidence_statement: baseConfidence,
    });
    expect(parsed.success).toBe(false);
  });

  it("Case 7: rejects inferred claim missing premises (schema layer)", () => {
    const parsed = SubmitInputSchema.safeParse({
      analysis_content: baseAnalysis,
      claims: [
        makeClaim({
          source_type: "inferred",
          source_reference: "based on premises listed below",
        }),
      ],
      confidence_statement: baseConfidence,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((i) => i.path.includes("premises"))
      ).toBe(true);
    }
  });
});

describe("Linear validator", () => {
  it("Case 3: accepts a real-shape COG issue when Linear API confirms it", async () => {
    process.env.LINEAR_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { issue: { id: "id-123", team: { key: "COG" } } },
        }),
        { status: 200 }
      )
    );
    const failures = await validateClaims([
      makeClaim({
        source_type: "linear_id",
        source_reference: "COG-367",
      }),
    ]);
    expect(failures).toHaveLength(0);
  });

  it("Case 4: rejects when Linear says issue does not exist", async () => {
    process.env.LINEAR_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { issue: null } }), { status: 200 })
    );
    const failures = await validateClaims([
      makeClaim({
        source_type: "linear_id",
        source_reference: "COG-99999",
      }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/does not exist/);
  });
});

describe("Web fetch validator", () => {
  it("Case 5: accepts a 200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    const failures = await validateClaims([
      makeClaim({
        source_type: "web_fetch",
        source_reference: "https://www.anthropic.com/",
      }),
    ]);
    expect(failures).toHaveLength(0);
  });

  it("Case 6: rejects a 404 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const failures = await validateClaims([
      makeClaim({
        source_type: "web_fetch",
        source_reference: "https://example.com/definitely-not-here",
      }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toMatch(/404/);
  });
});

describe("Successful render (Case 8)", () => {
  it("renders accepted analysis with three mixed-type claims", async () => {
    process.env.LINEAR_API_KEY = "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("linear.app")) {
        return new Response(
          JSON.stringify({ data: { issue: { id: "id-1", team: { key: "COG" } } } }),
          { status: 200 }
        );
      }
      return new Response(null, { status: 200 });
    });

    const input = {
      analysis_content: baseAnalysis,
      claims: [
        makeClaim({
          statement: "First claim about Linear issue",
          source_type: "linear_id",
          source_reference: "COG-300",
        }),
        makeClaim({
          statement: "Second claim about a website",
          source_type: "web_fetch",
          source_reference: "https://www.anthropic.com/",
        }),
        makeClaim({
          statement: "Third claim from inference",
          source_type: "inferred",
          source_reference: "synthesised from the two premises listed",
          premises: [
            "Premise one is at least ten chars long",
            "Premise two is also at least ten chars long",
          ],
        }),
      ],
      confidence_statement: baseConfidence,
    };

    const failures = await validateClaims(input.claims as Claim[]);
    expect(failures).toHaveLength(0);

    const md = renderManifest(input as any);
    expect(md).toContain("## CLAIM CHECK");
    expect(md).toContain("## Confidence");
    expect(md).toContain("First claim about Linear issue");
    expect(md).toContain("Second claim about a website");
    expect(md).toContain("Third claim from inference");
    expect(md).toContain("Premise one is at least ten chars long");
  });
});

describe("Case 9: mixed-type dispatch coverage", () => {
  it("rejects exactly four malformed claims out of seven, with correct indices", async () => {
    process.env.LINEAR_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("linear.app")) {
        return new Response(
          JSON.stringify({ data: { issue: { id: "id-1", team: { key: "COG" } } } }),
          { status: 200 }
        );
      }
      if (url.includes("known-404")) {
        return new Response(null, { status: 404 });
      }
      return new Response(null, { status: 200 });
    });

    const claims: Claim[] = [
      // 0: linear_id, valid (mocked)
      {
        statement: "Linear claim valid",
        source_type: "linear_id",
        source_reference: "COG-367",
        evidence_excerpt: "Issue confirmed via Linear API.",
      },
      // 1: inferred, valid premises
      {
        statement: "Inferred claim valid",
        source_type: "inferred",
        source_reference: "drawn from the two premises below",
        evidence_excerpt: "Synthesised conclusion from premises.",
        premises: ["Premise alpha at least ten chars", "Premise beta at least ten chars"],
      },
      // 2: tool_call, allow-listed
      {
        statement: "Tool call claim valid",
        source_type: "tool_call",
        source_reference: "web_search",
        evidence_excerpt: "Returned by web_search tool.",
      },
      // 3: web_fetch, known-404 (reject)
      {
        statement: "Web fetch claim invalid",
        source_type: "web_fetch",
        source_reference: "https://example.com/known-404",
        evidence_excerpt: "Page returned 404 error.",
      },
      // 4: inferred, no premises (reject)
      {
        statement: "Inferred missing premises",
        source_type: "inferred",
        source_reference: "an inference that lacks documented premises",
        evidence_excerpt: "No premises supplied for this inference.",
      },
      // 5: file_path, relative (reject)
      {
        statement: "File path claim invalid",
        source_type: "file_path",
        source_reference: "./somewhere",
        evidence_excerpt: "Quoted from a relative file path.",
      },
      // 6: tool_call, non-allow-listed name (reject)
      {
        statement: "Tool call claim invalid",
        source_type: "tool_call",
        source_reference: "made_up_tool",
        evidence_excerpt: "Called a fictitious tool.",
      },
    ];

    const failures = await validateClaims(claims);
    expect(failures).toHaveLength(4);
    expect(failures.map((f) => f.claim_index)).toEqual([3, 4, 5, 6]);
  });
});
