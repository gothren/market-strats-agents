# Market Review CLI Improvements

Context: during a real Code Security market workflow, the current market CLI was usable but review required several ad hoc SQLite queries and many repeated `market-candidates review` calls. These improvements should make the fetch -> extract -> review loop easier for agents and humans while keeping `AGENTS.md` focused on real commands.

Do not update `AGENTS.md` for these workflows until the commands below exist and tests cover them.

## Workflow Pain Points Observed

- `market-documents list --json` returns full `content_text`, producing very large output when the user only needs document ids, titles, status, errors, and URLs.
- `market-candidates list --json` returns full evidence JSON for every candidate, which is too noisy for interactive review.
- Reviewing candidates in batches required many individual CLI calls.
- Final verification required direct SQLite queries for counts by status/type/confidence.
- Review sessions naturally happen by candidate type: capabilities, categories/problems, companies, products, claims.
- Vendor claims need explicit review notes that they are vendor-reported and not independently verified.
- Broad product/platform candidates may include adjacent features; review notes should preserve boundary nuance.
- After collection failures and fetcher fixes, there is no ergonomic way to retry only failed sources/documents.

## Requested CLI Changes

### 1. Compact Candidate Listing - DONE

Add filters and compact output to `market-candidates list`.

Example:

```bash
pnpm ncl market-candidates list \
  --market-id <MARKET_ID> \
  --status proposed \
  --type capability \
  --compact \
  --json
```

Expected compact candidate shape:

```json
{
  "candidates": [
    {
      "id": "mcand_...",
      "candidate_type": "capability",
      "name": "Secrets scanning and push protection",
      "summary": "Detecting and preventing secret leakage...",
      "confidence": "high",
      "status": "proposed"
    }
  ],
  "next_actions": []
}
```

Requirements:

- `--status` filter supports at least `proposed`, `accepted`, `rejected`.
- `--type` filter supports all candidate types: `company`, `product`, `problem`, `capability`, `category`, `claim`.
- `--compact` omits `evidence_json`, parsed `evidence`, `metadata_json`, parsed `metadata`, and timestamp fields.
- Existing full list behavior remains the default for backward compatibility.

### 2. Candidate Summary Command - DONE

Add:

```bash
pnpm ncl market-candidates summary --market-id <MARKET_ID> --json
```

Expected response:

```json
{
  "market_id": "mkt_...",
  "total": 32,
  "by_status": {
    "accepted": 32
  },
  "by_type": {
    "capability": 8,
    "category": 2,
    "claim": 3,
    "company": 9,
    "problem": 2,
    "product": 8
  },
  "by_confidence": {
    "high": 27,
    "medium": 5
  },
  "latest_extraction_run": {
    "id": "mrun_...",
    "status": "completed",
    "started_at": "...",
    "completed_at": "..."
  }
}
```

This should replace direct SQLite count queries in agent workflows.

### 3. Batch Candidate Review - DONE

Add:

```bash
pnpm ncl market-candidates review-batch \
  --ids mcand_1,mcand_2,mcand_3 \
  --status accepted \
  --review-note "Accepted by user review." \
  --json
```

Expected response:

```json
{
  "reviewed": [
    { "id": "mcand_1", "status": "accepted" }
  ],
  "failed": [],
  "summary": {
    "requested": 3,
    "reviewed": 3,
    "failed": 0
  }
}
```

Requirements:

- Must support `accepted` and `rejected`.
- Should apply the same review note to every candidate in the batch.
- If any id fails, return structured failures without hiding successful reviews.
- Should reject empty `--ids`.
- Should preserve existing single-candidate `review` command.

### 4. Compact Document Listing - DONE

Add compact output to `market-documents list`.

Example:

```bash
pnpm ncl market-documents list --market-id <MARKET_ID> --compact --json
```

Expected compact document shape:

```json
{
  "documents": [
    {
      "id": "mdoc_...",
      "title": "Security and code quality documentation - GitHub Docs",
      "status": "fetched",
      "error": null,
      "url": "https://docs.github.com/en/code-security/",
      "canonical_url": "https://docs.github.com/en/code-security"
    }
  ],
  "next_actions": []
}
```

Requirements:

- `--compact` omits `content_text`, `content_hash`, `metadata_json`, and timestamp fields.
- Existing full document list remains the default.

### 5. Failed-Only Collection Retry - DONE

Add one of these forms, whichever best matches existing command style:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --failed-only --json
```

or:

```bash
pnpm ncl market-sources retry-failed --market-id <MARKET_ID> --json
```

Desired behavior:

- Only retry sources whose latest stored document for that source has `status = failed`.
- Keep normal collection behavior unchanged.
- Report visited/stored/failed/unsupported counts like regular collection.
- This would have been useful after adding browser-compatible headers for Mend.

### 6. Optional Import Dedupe - DONE

Add:

```bash
pnpm ncl market-candidates import \
  --market-id <MARKET_ID> \
  --payload-file <JSON_FILE> \
  --dedupe \
  --json
```

Desired behavior:

- Avoid importing duplicate candidates with the same `market_id`, `candidate_type`, and normalized `name`.
- Report imported vs skipped duplicates.
- Existing import behavior remains unchanged unless `--dedupe` is passed.

## Review Workflow To Support - DONE

The target interactive review flow should be:

1. `market-candidates summary` to see proposed counts.
2. `market-candidates list --status proposed --type capability --compact`.
3. Assistant presents a small batch with recommendations.
4. User says `accept all`, `reject 2`, or similar.
5. Assistant runs `market-candidates review-batch`.
6. Repeat by type.
7. `market-candidates summary` verifies final status counts.

Recommended review notes:

- General accepted candidates: `Accepted by user review: <type> is in scope for Code Security.`
- Capabilities: `Accepted by user review: capability matches Code Security market boundary.`
- Vendor claims: `Accepted by user review as vendor-reported claim; not independently verified.`
- Broad platforms with adjacent features: `Accepted by user review: product includes code security; <adjacent feature> is adjacent to the market boundary.`

## Tests To Add - DONE

- Compact candidate list omits evidence/metadata and supports `--status` and `--type`.
- Candidate summary returns counts by status/type/confidence and latest extraction run.
- Batch review updates multiple candidates, reports partial failures, and rejects empty ids.
- Compact document list omits `content_text`.
- Failed-only collection retries only sources with latest failed documents.
- Dedupe import skips duplicate candidate names/types when enabled.
