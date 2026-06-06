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

## Proposing Agent-Discovered Sources

If the user asks to discover sources or companies, use your own search tools first. Do not expect this repo to execute web search. Convert useful search findings into source proposals so they can be reviewed before becoming active market sources.

Use `trust_tier: "official"` for official vendor websites, docs, blogs, pricing pages, and RSS feeds. Use `trusted` for user-provided or known-good non-official sources, `third_party` for external commentary/directories, `search` for raw search-result surfaces, and `private` for internal sources.

Search quality guidance: prefer official vendor homepages, product pages, and docs over blogs, press pages, analyst pages, marketplaces, or old launch posts.

Docs vs website rule: use `docs` when product docs are the best crawl root; use `website` for vendor or product marketing surfaces; use `exact_url` for one stable product page.

Create a JSON payload:

```json
{
  "proposals": [
    {
      "url": "https://vendor.example.com",
      "source_type": "website",
      "trust_tier": "official",
      "title": "Vendor Example",
      "snippet": "Search result or page snippet.",
      "rationale": "Official company website found while searching AI security vendors.",
      "discovered_from": "agent_web_search",
      "search_query": "AI security companies",
      "proposed_entity_name": "Vendor Example",
      "proposed_entity_type": "company",
      "metadata": {}
    }
  ]
}
```

For temporary payloads, prefer a file under `/private/tmp`, for example `/private/tmp/<market-slug>-source-proposals.json`.

Import proposals:

```bash
pnpm ncl market-source-proposals import --market-id <MARKET_ID> --payload-file <JSON_FILE> --json
```

Review proposals:

```bash
pnpm ncl market-source-proposals list --market-id <MARKET_ID> --status proposed --json
pnpm ncl market-source-proposals get <PROPOSAL_ID> --json
pnpm ncl market-source-proposals review <PROPOSAL_ID> --status accepted --review-note "Official source; accept for crawl." --json
pnpm ncl market-source-proposals review-batch --ids <ID_1>,<ID_2> --status rejected --review-note "Out of scope or low confidence." --json
```

If the user asks to accept all recommended proposals, use batch review:

```bash
pnpm ncl market-source-proposals review-batch --ids <ID_1>,<ID_2>,<ID_3> --status accepted --review-note "Accepted by user review as relevant source proposals." --json
```

Accepted proposals become ordinary `market_sources` and can be collected with `market-sources collect`. Rejected proposals remain as durable memory of discarded search findings. Use explicit source types such as `website`, `docs`, or `exact_url`; do not use generic `url`.

Final verification:

```bash
pnpm ncl market-source-proposals list --market-id <MARKET_ID> --status accepted --json
pnpm ncl market-sources list --market-id <MARKET_ID> --json
```

Confirm each accepted proposal has a `source_id`, and confirm each accepted source appears in `market-sources list`. Leave the host running if the user is continuing the workflow; stop it only if the user asks or the task is clearly complete.

## Extracting And Reviewing Market Candidates

If the user says "extract findings", "analyze fetched evidence", or "find companies/problems/capabilities", interpret it as product operation, not code implementation.

First inspect stored documents:

```bash
pnpm ncl market-documents list --market-id <MARKET_ID> --compact --json
pnpm ncl market-documents get <DOCUMENT_ID> --json
```

When many documents exist, search stored evidence before opening full documents:

```bash
pnpm ncl market-documents search --market-id <MARKET_ID> --query "prompt injection" --json
pnpm ncl market-documents search --market-id <MARKET_ID> --query "runtime monitoring" --limit 5 --json
```

Search only covers stored fetched documents. Use returned document ids and excerpts to decide which full documents to inspect and cite.

Search concept variants instead of relying on one analyst phrase. Product pages may use verbs, product wording, domain objects, or risk terms:

- noun/verb variants: `monitoring`, `monitor`, `monitors`, `detect`, `detects`
- product wording: `visibility`, `real-time`, `block`, `policy enforcement`
- domain objects: `tool calls`, `agent behavior`, `guardrails`
- risk terms: `prompt injection`, `PII`, `secrets`, `data leakage`

Document search does light token normalization, so `monitoring` can match `monitors`, but agents should still try nearby product wording when a query returns no matches.

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

Validate the payload before importing. Use `--dedupe` by default for agent-generated extraction payloads so repeated extraction runs flag duplicates instead of creating duplicate candidates:

```bash
pnpm ncl market-candidates validate \
  --market-id <MARKET_ID> \
  --payload-file <JSON_FILE> \
  --dedupe \
  --json
```

If validation returns `valid: false`, fix the JSON or evidence references before importing. If validation returns duplicate candidates, treat them as already represented unless the user explicitly wants another candidate.

Import candidates in batch:

```bash
pnpm ncl market-candidates import \
  --market-id <MARKET_ID> \
  --payload-file <JSON_FILE> \
  --dedupe \
  --json
```

Audit proposed candidates before asking the user to accept them:

```bash
pnpm ncl market-candidates audit --market-id <MARKET_ID> --json
```

The audit is deterministic guardrails, not semantic judgment. Treat findings as a work queue: inspect evidence, improve quotes/summaries, update candidates whose identity is right, reject weak candidates, or ask the user. Common findings include low confidence, generic names, short/missing summaries, missing/short quotes, quotes not found in stored document text, single-evidence candidates, and duplicate normalized names.

Low-severity findings are advisory and do not block `ready_for_review`. Medium/high findings require attention before asking the user to accept the candidate.

Useful audit filters:

```bash
pnpm ncl market-candidates audit --market-id <MARKET_ID> --ready false --json
pnpm ncl market-candidates audit --market-id <MARKET_ID> --severity medium --json
pnpm ncl market-candidates audit --market-id <MARKET_ID> --reason evidence_quote_not_found --json
```

Quote matching is case-insensitive and whitespace-normalized. Punctuation and wording still need to match the stored `content_text`; use `market-documents get` or `market-documents search` to copy a supporting quote.

To fix a candidate whose identity is right but fields/evidence are weak, write a replacement candidate object to a temporary JSON file such as `/private/tmp/<market>-candidate-update.json`:

```json
{
  "candidate": {
    "candidate_type": "capability",
    "name": "Runtime prompt injection detection",
    "summary": "Detects prompt injection attempts in deployed AI application workflows.",
    "confidence": "medium",
    "evidence": [
      {
        "document_id": "<DOCUMENT_ID>",
        "quote": "<QUOTE COPIED FROM STORED DOCUMENT>",
        "note": "Why this quote supports the candidate."
      }
    ],
    "metadata": {
      "source": "agent-correction"
    }
  }
}
```

Then run:

```bash
pnpm ncl market-candidates update --id <CANDIDATE_ID> --payload-file /private/tmp/<market>-candidate-update.json --json
pnpm ncl market-candidates audit --market-id <MARKET_ID> --json
```

If the candidate itself is bad, reject it instead of updating:

```bash
pnpm ncl market-candidates review <CANDIDATE_ID> --status rejected --review-note "Unsupported by evidence." --json
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

Generate a Markdown market report from accepted candidates:

```bash
pnpm ncl market-candidates report --market-id <MARKET_ID> --json
pnpm ncl market-candidates report --market-id <MARKET_ID> --output-file /private/tmp/<market>-report.md --json
```

The report is read-only and uses accepted candidates only. It includes market definition, category map, company/product table, problems, capabilities, claims, known gaps, and an evidence appendix. The v1 problem-to-solution section does not infer relationships that were not reviewed.

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
- source proposal import/list/get/review
- exact URL source collection
- bounded website/docs source collection
- market document storage/list/get
- evidence-backed market candidate import/list/get/review
- compact document and candidate listing
- candidate summary and batch review
- read-only candidate market map
- read-only Markdown market report
- market run audit rows for collection and extraction

Not implemented yet:

- crawling for blogs
- internal web search execution
- RSS/Slack/manual connectors
- internal LLM extraction
- companies/products/categories
- market reports
