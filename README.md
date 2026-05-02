# claim-check-mcp

Remote MCP server enforcing structural verification of analytical outputs.

Exposes one tool — `submit_verified_analysis` — whose input schema makes claims and a confidence statement physically required. Each claim's source reference is validated (Linear IDs resolve, URLs return 200, file paths are absolute, inferred claims have premises). On failure the analysis is rejected; on success it is returned rendered as markdown with a `## CLAIM CHECK` manifest.

## Tool

`submit_verified_analysis(analysis_content, claims[], confidence_statement)` where each claim has:
- `statement` (5–300 chars)
- `source_type` ∈ `tool_call | linear_id | file_path | web_fetch | neon_query | project_knowledge | inferred`
- `source_reference` (≥3 chars)
- `evidence_excerpt` (10–1000 chars)
- `premises` (required when `source_type === "inferred"`, ≥1 string ≥10 chars each)

`claims` must be non-empty (`.min(1)`). This is the structural gate.

## Validators

Each `source_type` has a validator. Linear and web_fetch make outbound calls wrapped in `AbortController` with a 5 s timeout — they fail closed.

| source_type | Check |
|---|---|
| `linear_id` | Linear GraphQL: issue exists and is in the COG team |
| `web_fetch` | HEAD/GET probe, must return 2xx (1 h in-memory cache) |
| `file_path` | Absolute path, no `..` traversal |
| `inferred` | `premises` array, ≥1 entry, ≥10 chars each |
| `neon_query` | Starts with `SELECT` or contains a query identifier |
| `tool_call` | Allow-listed name or `Connector:` prefix |
| `project_knowledge` | ≥3-word search query |

## Local development

```bash
npm install
cp .env.example .env   # fill in LINEAR_API_KEY
npm test
npm run dev            # vercel dev
```

## Deploy

```bash
vercel link
vercel env add LINEAR_API_KEY production
vercel deploy --prod
```

Endpoint will be `https://<deployment>/api/mcp`.

## Client config

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "claim-check": {
      "type": "http",
      "url": "https://<deployment>/api/mcp"
    }
  }
}
```

Reload the Claude client after editing.

## Out of scope (v1)

Auth, persistence, web UI, rate limits, semantic claim correctness, file existence checks, Neon query execution, multi-tenant. There is no override path.
