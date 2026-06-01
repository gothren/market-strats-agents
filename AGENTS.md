# Agent Operating Notes

This repo is a market strategy agent fork based on NanoClaw. Treat this file as the working guide for any coding assistant or automation agent working in this repository. Keep it short and update it as workflows become real.

## Default Stance

- If the user asks to use the product, operate the existing CLI instead of editing source code.
- If the user asks to change behavior, add tests first, then implementation.
- Prefer `rg` for searching and inspect existing patterns before changing code.
- Do not commit or push unless the user explicitly asks.
- Do not modify upstream remotes. Push only to this fork's `origin` when asked.

## Running Checks

- Focused tests: `pnpm exec vitest run <test files>`
- Typecheck: `pnpm run typecheck`
- Full test suite: `pnpm test`
- The full suite may need to run outside sandbox because subprocess-based tests can fail under restricted IPC.

## Market CLI Workflow

The market workflow is exposed through `ncl`, backed by the host process over `data/ncl.sock`.

Start the host if it is not already running:

```bash
pnpm run dev
```

Use a second shell for CLI calls:

```bash
pnpm ncl <resource> <verb> [target] [--key value ...] --json
```

Use `--json` for agent-driven operation so responses are parseable.

## Adding A New Market

If the user says "add a new market", interpret it as product operation, not code implementation.

If missing, ask for:

- market name
- short description
- inclusions
- exclusions
- adjacent markets
- seed source URLs

Then run:

```bash
pnpm ncl markets create --name "<NAME>" --description "<DESCRIPTION>" --json
```

Use the returned `market.id` for follow-up calls.

If boundary details were provided:

```bash
pnpm ncl market-boundaries update \
  --market-id <MARKET_ID> \
  --inclusions "<INCLUSIONS>" \
  --exclusions "<EXCLUSIONS>" \
  --adjacent-markets "<ADJACENT_MARKETS>" \
  --json
```

For each seed source URL:

```bash
pnpm ncl market-sources add \
  --market-id <MARKET_ID> \
  --url "<URL>" \
  --source-type exact_url \
  --trust-tier trusted \
  --json
```

Verify the final state:

```bash
pnpm ncl markets get <MARKET_ID> --json
```

Report the market id, boundary status, and number of sources added.

## Fetching And Reviewing Market Evidence

If the user says "fetch this market", "collect evidence", or "review market sources", interpret it as product operation, not code implementation.

If missing, ask for:

- market id or enough information to identify the market
- whether to add any new exact URLs, website roots, or docs roots before collection

If the market id is unknown, list markets first:

```bash
pnpm ncl markets list --json
```

If the user provided new URLs, add each one explicitly as an exact URL source:

```bash
pnpm ncl market-sources add \
  --market-id <MARKET_ID> \
  --url "<URL>" \
  --source-type exact_url \
  --trust-tier trusted \
  --json
```

For website or docs roots, use the explicit research-surface source type:

```bash
pnpm ncl market-sources add \
  --market-id <MARKET_ID> \
  --url "<URL>" \
  --source-type website \
  --trust-tier official \
  --json
```

```bash
pnpm ncl market-sources add \
  --market-id <MARKET_ID> \
  --url "<URL>" \
  --source-type docs \
  --trust-tier official \
  --json
```

Run collection:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --json
```

For bounded website/docs crawling, optionally set page and depth limits:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --max-pages 10 --max-depth 1 --json
```

Retry only sources whose latest stored document failed:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --failed-only --json
```

Use compact document listing by default to avoid dumping full `content_text`:

```bash
pnpm ncl market-documents list --market-id <MARKET_ID> --compact --json
```

Inspect individual documents when needed:

```bash
pnpm ncl market-documents get <DOCUMENT_ID> --json
```

Report:

- collection run id
- number of stored documents
- number of unchanged documents
- number of failed documents
- skipped URLs and skip reasons, if any
- unsupported source types, if any
- document ids and titles for review

Repeated collection of unchanged `exact_url`, `website`, or `docs` content should return `unchanged_documents` and should not create duplicate fetched evidence rows. Treat `stored_documents: 0` with `unchanged_documents > 0` as a successful no-op, not a failed collection.

Current collection support is intentionally narrow. `exact_url` sources fetch one page. `website` and `docs` sources run a same-origin, HTML-only bounded crawl and store one document per page. The crawler normalizes discovered URLs by removing fragments and non-root trailing slashes before queueing/storing, skips common low-value paths such as careers, privacy, legal, contact, login/signup, demo/request-demo/book-a-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom pages; it does not skip pricing pages. It prioritizes high-value paths such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API pages when crawl bounds cut off the run. Crawled HTML with less than 300 characters of extracted text is skipped as `low_quality_content`. Other valid source types such as `blog`, `rss`, `search_query`, `slack`, and `manual` should be reported as unsupported for collection v1, not treated as exact URLs.

## Extracting And Reviewing Market Candidates

If the user says "extract findings", "analyze fetched evidence", or "find companies/problems/capabilities", interpret it as product operation, not code implementation.

First inspect stored documents:

```bash
pnpm ncl market-documents list --market-id <MARKET_ID> --compact --json
pnpm ncl market-documents get <DOCUMENT_ID> --json
```

Create a local JSON payload with typed candidates. Each candidate must include evidence linked to stored document ids:

```json
{
  "candidates": [
    {
      "candidate_type": "company",
      "name": "Example Vendor",
      "summary": "Provides runtime protection for AI applications.",
      "confidence": "medium",
      "evidence": [
        {
          "document_id": "mdoc_...",
          "quote": "short supporting excerpt",
          "note": "Vendor positioning statement"
        }
      ],
      "metadata": {}
    }
  ]
}
```

Valid candidate types are `company`, `product`, `problem`, `capability`, `category`, and `claim`. Valid confidence values are `low`, `medium`, and `high`.

Import candidates in batch. Use `--dedupe` by default for agent-generated extraction payloads so repeated extraction runs do not create duplicate candidates:

```bash
pnpm ncl market-candidates import \
  --market-id <MARKET_ID> \
  --payload-file <JSON_FILE> \
  --dedupe \
  --json
```

Review candidates:

```bash
pnpm ncl market-candidates summary --market-id <MARKET_ID> --json
pnpm ncl market-candidates list --market-id <MARKET_ID> --status proposed --type capability --compact --json
pnpm ncl market-candidates get <CANDIDATE_ID> --json
pnpm ncl market-candidates review-batch --ids <ID_1>,<ID_2> --status accepted --review-note "Evidence supports this." --json
pnpm ncl market-candidates review-batch --ids <ID_3> --status rejected --review-note "Unsupported by evidence." --json
```

Use single-candidate review when a batch is not appropriate:

```bash
pnpm ncl market-candidates review <CANDIDATE_ID> --status accepted --review-note "Evidence supports this." --json
```

If the user wants to review candidates with the assistant:

1. Start with candidate counts:

```bash
pnpm ncl market-candidates summary --market-id <MARKET_ID> --json
```

2. Review candidates in small batches by type:

```bash
pnpm ncl market-candidates list --market-id <MARKET_ID> --status proposed --type capability --compact --json
```

3. Present names, summaries, confidence, and a recommendation. Wait for the user's decision.
4. Apply decisions with `market-candidates review-batch`.
5. Repeat for categories/problems, companies, products, and claims.
6. Verify final counts with `market-candidates summary`.

Build a read-only market overview from accepted candidates:

```bash
pnpm ncl market-candidates map --market-id <MARKET_ID> --json
```

The computed map groups accepted candidates into companies, products, problems, capabilities, categories, and claims. Treat accepted candidates as the source of truth; do not create separate facts or market-map rows.

Suggested review notes:

- Capabilities: `Accepted by user review: capability matches market boundary.`
- Companies/products: `Accepted by user review: <type> is in scope for the market.`
- Vendor claims: `Accepted by user review as vendor-reported claim; not independently verified.`
- Broad platforms: `Accepted by user review: product includes in-scope capability; <adjacent feature> is adjacent to the market boundary.`

Report:

- extraction run id
- candidate counts by type
- confidence distribution
- candidates that need user review

Do not create accepted facts directly from documents. Imported extraction output starts as reviewable candidates.

## Current Market Capability

Implemented:

- market creation/list/get
- market boundary upsert
- market source add/list
- exact URL source collection
- bounded website/docs source collection
- market document storage/list/get
- evidence-backed market candidate import/list/get/review
- compact document and candidate listing
- candidate summary and batch review
- read-only candidate market map
- market run audit rows for collection and extraction

Not implemented yet:

- crawling for blogs
- RSS/search/Slack/manual connectors
- internal LLM extraction
- companies/products/categories
- market reports
