import { ValidatorResult, withTimeout } from "./types.js";

const LINEAR_GRAPHQL = "https://api.linear.app/graphql";
const COG_ID_PATTERN = /\bCOG-(\d+)\b/;

export async function validateLinear(reference: string): Promise<ValidatorResult> {
  const match = reference.match(COG_ID_PATTERN);
  if (!match) {
    return { ok: false, reason: "reference must contain a COG-NNN issue ID" };
  }
  const issueId = match[0];

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      reason: "LINEAR_API_KEY not configured on the server; cannot validate linear_id claims",
    };
  }

  const query = `query($id: String!) { issue(id: $id) { id team { key } } }`;

  const result = await withTimeout(async (signal) => {
    const res = await fetch(LINEAR_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables: { id: issueId } }),
      signal,
    });
    if (!res.ok) {
      return { ok: false as const, reason: `Linear API returned HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      data?: { issue?: { id?: string; team?: { key?: string } } | null };
      errors?: Array<{ message: string }>;
    };
    if (json.errors && json.errors.length > 0) {
      return { ok: false as const, reason: `Linear API error: ${json.errors[0].message}` };
    }
    if (!json.data?.issue) {
      return { ok: false as const, reason: `Linear issue ${issueId} does not exist` };
    }
    if (json.data.issue.team?.key !== "COG") {
      return {
        ok: false as const,
        reason: `Linear issue ${issueId} is not in the COG team (got ${json.data.issue.team?.key})`,
      };
    }
    return { ok: true as const };
  }, "linear");

  if ("__timeout" in result) {
    return { ok: false, reason: result.reason };
  }
  return result;
}
