import { SubmitInput, Claim } from "./schema.js";

function renderClaim(claim: Claim, index: number): string {
  const lines: string[] = [];
  lines.push(`${index + 1}. **${claim.statement}**`);
  lines.push(`   - Source type: \`${claim.source_type}\``);
  lines.push(`   - Reference: \`${claim.source_reference}\``);
  lines.push(`   - Evidence: ${claim.evidence_excerpt}`);
  if (claim.source_type === "inferred" && claim.premises) {
    lines.push(`   - Premises:`);
    claim.premises.forEach((p) => lines.push(`     - ${p}`));
  }
  return lines.join("\n");
}

export function renderManifest(input: SubmitInput): string {
  const claimsBlock = input.claims.map(renderClaim).join("\n\n");
  return [
    input.analysis_content,
    "",
    "---",
    "",
    "## CLAIM CHECK",
    "",
    claimsBlock,
    "",
    "## Confidence",
    "",
    input.confidence_statement,
  ].join("\n");
}
