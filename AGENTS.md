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
- seed source URLs and whether they are `website`, `docs`, or `exact_url`

Write a setup payload to `/private/tmp/<market-slug>-setup.json`:

```json
{
  "market": {
    "name": "<NAME>",
    "description": "<DESCRIPTION>"
  },
  "boundary": {
    "inclusions": "<INCLUSIONS>",
    "exclusions": "<EXCLUSIONS>",
    "adjacent_markets": "<ADJACENT_MARKETS>",
    "notes": "Default lens: product strategist."
  },
  "sources": [
    {
      "url": "https://vendor.example.com",
      "source_type": "website",
      "trust_tier": "official",
      "notes": "Official vendor website."
    }
  ]
}
```

Use `website` for vendor/product marketing surfaces, `docs` for documentation roots, and `exact_url` only for one stable page. Prefer `trust_tier: "official"` for official vendor-owned sources.

Dry-run the setup before writing durable state:

```bash
pnpm ncl markets setup --payload-file /private/tmp/<market-slug>-setup.json --dry-run --json
```

If the dry run is valid and the user has confirmed any inferred values, apply it:

```bash
pnpm ncl markets setup --payload-file /private/tmp/<market-slug>-setup.json --json
```

Verify the final state using the returned `market.id`:

```bash
pnpm ncl markets get <MARKET_ID> --json
```

Report the market id, boundary status, sources added, duplicate/skipped sources, and next suggested action.

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

After collection, inspect crawl context before deciding the next step. Default output is compact and includes counts/diagnostics without dumping every frontier or skipped URL:

```bash
pnpm ncl market-sources crawl-context --market-id <MARKET_ID> --json
```

Use bounded drill-down only when the counts show you need examples:

```bash
pnpm ncl market-sources crawl-context --market-id <MARKET_ID> --include-frontier --frontier-limit 25 --json
```

If crawl context shows open `max_pages` or `max_depth` frontier URLs and the user wants more evidence from already accepted sources, continue from the persisted frontier:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --continue-frontier --json
```

If crawl context shows stale sources and the user wants to refresh old evidence, refresh only stale sources:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --refresh-stale --stale-days 60 --json
```

Use `--refresh-all` when the user explicitly wants to revisit all active accepted sources regardless of freshness:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --refresh-all --json
```

Inspect a specific collection run when you need skipped/frontier details. Keep limits small unless the user explicitly asks for a large audit dump:

```bash
pnpm ncl market-runs get <RUN_ID> --include-frontier --frontier-limit 25 --include-skipped --skipped-limit 25 --json
```

Collection output is compact by default. To see skipped URL examples from the collection response itself:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --include-skipped --skipped-limit 25 --json
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
- frontier continuation counters, if running `--continue-frontier`: `frontier_urls_loaded`, `frontier_urls_attempted`, and `frontier_urls_updated`
- skipped fresh sources, if running stale refresh
- skipped URLs and skip reasons, if any
- unsupported source types, if any
- document ids and titles for review
- crawl-context diagnostics such as `zero_documents`, `docs_source_zero_yield`, `all_documents_failed`, `high_failure_rate`, `frontier_available`, `stale_source`, or `source_never_collected`

Repeated collection of unchanged `exact_url`, `website`, or `docs` content should return `unchanged_documents` and should not create duplicate fetched evidence rows. Treat `stored_documents: 0` with `unchanged_documents > 0` as a successful no-op, not a failed collection.

Current collection support is intentionally narrow. `exact_url` sources fetch one page. `website` and `docs` sources run a same-origin, HTML-only bounded crawl and store one document per page. The crawler normalizes discovered URLs by removing fragments and non-root trailing slashes before queueing/storing, skips common low-value paths such as careers, privacy, legal, contact, login/signup, demo/request-demo/book-a-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom pages; it does not skip pricing pages. It prioritizes high-value paths such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API pages when crawl bounds cut off the run. Crawled HTML with less than 300 characters of extracted text is skipped as `low_quality_content`. Skipped/frontier URLs are persisted for later audit, but large arrays are omitted unless `--include-skipped` or `--include-frontier` is supplied with bounded limits. Open frontier rows are deduplicated by market, source, and normalized URL, so repeated bounded crawls keep one open work item per URL while preserving historical audit rows. `max_pages` and `max_depth` rows are treated as open frontier context, and `--continue-frontier` fetches those persisted frontier URLs before returning to roots. In continuation summaries, `frontier_urls_loaded` means open frontier rows loaded into the queue, `frontier_urls_attempted` means loaded frontier rows actually processed before crawl limits stopped the run, and `frontier_urls_updated` means old frontier rows whose status changed, including `superseded` rows left queued after the new run hit `max_pages`. `--refresh-stale` recollects only active sources whose latest fetched document is older than `--stale-days`, and reports fresh sources in `skipped_sources`; `--refresh-all` recollects all active sources. Crawl-context diagnostics are computed on read from stored facts; they are not recommendations and should not replace agent judgment. Other valid source types such as `blog`, `rss`, `search_query`, `slack`, and `manual` should be reported as unsupported for collection v1, not treated as exact URLs.

## Proposing Agent-Discovered Sources

If the user asks to discover sources or companies, use your own search tools first. Do not expect this repo to execute web search. Convert useful search findings into source proposals so they can be reviewed before becoming active market sources.

Before searching, ask the repo for market search context and history:

```bash
pnpm ncl market-search context --market-id <MARKET_ID> --json
pnpm ncl market-search history --market-id <MARKET_ID> --json
```

Use this output as a search agenda. Prefer stale or never-tried themes. Deprioritize searches marked `deprioritize_recent` unless the user explicitly asks for a refresh. Search broadly for more companies, deeper public evidence for known companies, and keyword-driven gaps from accepted problems, capabilities, and categories.

After each external/web search, record what you searched and what you found:

```json
{
  "query": "AI agent security runtime monitoring vendors",
  "intent": "find_more_companies",
  "rationale": "Market search context showed thin company discovery for runtime monitoring.",
  "results": [
    {
      "url": "https://vendor.example.com",
      "title": "Vendor Example",
      "snippet": "Runtime security for AI agents.",
      "decision": "proposed",
      "reason": "Official vendor page with in-scope positioning."
    },
    {
      "url": "https://directory.example.com",
      "title": "Old AI Security Directory",
      "snippet": "Directory page.",
      "decision": "ignored",
      "reason": "Old third-party directory; not useful as direct evidence."
    }
  ],
  "notes": "Useful query for vendor discovery; weak for technical docs."
}
```

```bash
pnpm ncl market-search record --market-id <MARKET_ID> --payload-file /private/tmp/<market>-search-record.json --json
```

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
      "metadata": {
        "search_intent": "find_more_companies",
        "gap": "thin_company_discovery"
      }
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

Before generating candidates for a follow-up extraction run, list accepted candidate keys so new output can reuse stable identities:

```bash
pnpm ncl market-candidates keys --market-id <MARKET_ID> --json
```

Use returned `stable_key` values when the new candidate represents the same company, product, problem, capability, category, or claim as an accepted candidate. If there is no existing key, create a deterministic `metadata.stable_key` using this convention:

```text
<candidate_type>:<lower_snake_case_concept>
```

Examples: `company:example_vendor`, `capability:runtime_ai_monitoring`, `problem:prompt_injection_in_code_agents`. Do not use random ids or run-specific wording as stable keys.

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
      "metadata": {
        "stable_key": "company:example_vendor"
      }
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

After importing candidates from a follow-up extraction run, compare proposed candidates against accepted candidates:

```bash
pnpm ncl market-candidates changes --market-id <MARKET_ID> --json
```

The change summary is read-only. It classifies proposed candidates as `new`, `duplicate`, or `changed` against accepted candidates. Matching is deterministic: `metadata.stable_key` first, then normalized candidate type and name. It does not use semantic fuzzy matching and does not modify accepted candidates. Each item includes `recommended_action`; use the command output as an action-focused work queue.

Useful filters:

```bash
pnpm ncl market-candidates changes --market-id <MARKET_ID> --classification changed --json
pnpm ncl market-candidates changes --market-id <MARKET_ID> --classification duplicate --json
pnpm ncl market-candidates changes --market-id <MARKET_ID> --missing-stable-key true --json
```

Recommended action meanings:

- `duplicate`: reject the proposed duplicate unless the user explicitly wants a separate candidate.
- `new`: audit the proposed candidate, then review it for acceptance if evidence supports it.
- `changed`: inspect changed fields and evidence, then decide whether to update the accepted candidate or reject the proposed candidate.
- `missing_stable_key`: update proposed candidate metadata before review if the identity is known.

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
- guided market setup with dry-run validation
- market boundary upsert
- market source add/list
- source proposal import/list/get/review
- market search context/history/record
- exact URL source collection
- bounded website/docs source collection
- crawl frontier/skipped URL persistence
- crawl context and market run inspection
- market document storage/list/get
- evidence-backed market candidate import/list/get/review
- compact document and candidate listing
- candidate summary and batch review
- accepted candidate key registry
- read-only candidate change detection
- read-only candidate market map
- read-only Markdown market report
- market run audit rows for collection and extraction

Not implemented yet:

- crawling for blogs
- source-specific continuation/refresh flags such as `--source-id`
- internal web search execution
- RSS/Slack/manual connectors
- internal LLM extraction
- durable companies/products/categories tables
