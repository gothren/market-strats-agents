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

## Primary Product Workflow

The primary product experience is manual, prompt-driven market strategy work. The user talks to an agent; the agent operates the CLI. Do not make the user think in command names unless they explicitly ask.

When the user asks to work on a market, follow this loop:

1. Understand the user's intent and current market state.
2. Run the smallest useful CLI/context command with `--json`.
3. Take the product action or prepare the reviewable artifact.
4. Summarize what changed in plain language.
5. Offer 2-5 sensible next actions.

After each meaningful step, propose next actions such as:

- search for more sources
- review source proposals
- crawl accepted sources
- inspect collected documents
- extract companies/problems/capabilities/categories/claims
- review doubtful candidates
- generate a market map or report
- answer an ad-hoc question from stored evidence
- improve an existing market by finding gaps, stale evidence, weak candidates, or open crawl frontier

Ask the user only for product judgment, missing inputs, or ambiguous decisions. Do not ask the user to choose between CLI commands when the correct command can be inferred from the workflow.

## Manual Market Workflow

Use this as the default operating path for product usage.

### 1. Set Up Or Find The Market

If the user says "add a market", "set up a market", or names a new market, guide setup with the market name, description, inclusions, exclusions, adjacent markets, notes, and seed sources. If a market may already exist, list markets first and confirm whether to reuse it.

After setup, report:

- market id
- boundary status
- seed sources added or skipped
- any assumptions that should be verified

Offer next actions:

- search for official sources
- crawl seed sources
- refine market boundaries
- ask an ad-hoc question

### 2. Search For Sources

If the user asks to find sources, companies, vendors, docs, or improve coverage, use external/web search tools. This repo does not perform web search internally.

Before searching, read market search context and history. Use that context to avoid repeating recent searches and to target gaps. Record each search after it is performed. Convert useful findings into source proposals.

After source discovery, report:

- what you searched
- useful sources found
- sources auto-accepted, auto-rejected, or left for review
- why any user review is needed

Offer next actions:

- accept/reject doubtful proposals
- crawl accepted sources
- search another gap
- inspect current market context

### 3. Crawl Accepted Sources

If the user asks to fetch, crawl, collect evidence, refresh evidence, or improve crawl results, collect from accepted sources. Use crawl context first when prior collection exists.

After collection, report:

- run id
- stored, unchanged, failed, skipped, and unsupported counts
- notable crawl diagnostics or frontier/staleness context
- document ids/titles worth inspecting

Offer next actions:

- inspect documents
- continue open crawl frontier
- refresh stale sources
- search for better sources
- extract candidates from documents

### 4. Extract And Review Candidates

If the user asks to analyze evidence or extract market data, inspect/search stored documents and create evidence-backed candidate JSON. Validate and import candidates, then audit them.

Auto-accept only low-ambiguity candidates according to the candidate policy below. Ask the user only about doubtful candidates.

After extraction/review, report:

- companies, products, problems, capabilities, categories, and claims found
- clear items added to the market map
- doubtful companies/products that need boundary decisions
- evidence gaps or uncertainty that should change the next research step

Offer next actions:

- decide boundary cases
- inspect supporting evidence
- improve weak candidates
- generate a market map/report
- search or crawl more evidence

### 5. Generate Market Output

If the user asks for a market overview, map, or report, generate it from accepted candidates. Do not invent facts or relationships not present in accepted candidates.

After reporting, tell the user where the file was written if applicable, summarize key gaps/uncertainties, and offer next actions:

- refine the report
- improve weak areas
- answer questions from the report
- search/crawl more evidence

### 6. Answer Ad-Hoc Questions

If the user asks a question about a market, company, product, capability, problem, category, claim, source, or document, answer from accepted candidates and stored documents first.

Use document search/get, candidate list/get/map, and reports as needed. Cite or reference candidate ids, document ids, titles, or report files where useful. If stored evidence is insufficient, say so and offer to search, crawl, inspect documents, or create candidates.

Keep ad-hoc Q&A read-only unless the user asks to change market state.

## Review And Auto-Approval Policies

### Source Proposals

Auto-accept source proposals when all are true:

- official or clearly trusted source
- clearly in scope for the market boundary
- non-duplicate
- explicit source type such as `website`, `docs`, or `exact_url`
- no privacy/access ambiguity

Auto-reject source proposals when they are clearly out of scope, duplicate, low-quality, stale/irrelevant third-party commentary, generic directories, marketplaces, or unsupported search-result noise.

Ask the user when source trust, market fit, source type, duplication, privacy/access, or boundary fit is ambiguous. Present your recommendation and reason.

### Candidates

Auto-accept candidates when all are true:

- validation passes
- evidence quotes match stored documents
- confidence is `medium` or `high`
- audit has no medium/high findings
- uncertainty is absent
- identity is clear and not a duplicate
- market fit is obvious

Auto-reject candidates when evidence is missing/invalid, market fit is clearly wrong, or a duplicate is already accepted.

Ask the user when confidence is low, evidence is weak/stale/conflicting/unknown, audit has medium/high findings, identity is ambiguous, or category/boundary judgment is needed. Present your recommendation and reason.

Review notes should say whether the decision was auto-approved by policy or user-reviewed.

### Boundary Case Review

When a company or product has unclear market fit, present it as a product-strategy boundary decision, not as a candidate lifecycle task. The user should not need to understand `proposed`, `accepted`, `rejected`, candidate ids, or audit internals unless they ask for traceability.

Use this review packet for each doubtful company/product:

- company/product: name and one-line evidence-backed description
- recommended classification: `core`, `adjacent`, `exclude`, or `needs more evidence`
- rationale: why it does or does not fit the market boundary
- strongest evidence: title or short quote from stored evidence
- confidence: plain-language confidence and uncertainty, if any
- impact: what the decision changes in the market map/report

Apply decisions through existing candidate commands:

- `core`: accept the candidate with a review note explaining why it is in-scope.
- `adjacent`: keep it proposed, or accept only when the review note explicitly says it is an adjacent/boundary case rather than a core participant.
- `exclude`: reject it with a review note explaining the boundary mismatch.
- `needs more evidence`: leave it proposed, keep or add uncertainty metadata when useful, and search/crawl for stronger evidence before review.

Boundary decisions should not be silently accepted unless market fit is obvious and evidence-backed. For cases like Cobalt, Picus, AttackIQ, or similar adjacent security vendors, show the user's actual strategic choice: include as core market participant, treat as adjacent, exclude from the map, or gather more evidence.

## Market CLI Reference

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

When the user asks to crawl a market, run a bounded crawl session rather than asking them to repeatedly prompt for more crawling:

```bash
pnpm ncl market-sources crawl-session --market-id <MARKET_ID> --max-minutes 10 --max-pages 200 --json
```

The session runs an initial collection pass and then automatically continues persisted frontier until it hits the time/page/run budget, exhausts frontier, or stops making progress. Report `stop_reason`, stored/unchanged/failed/skipped counts, frontier remaining, and whether you recommend extraction, more source discovery, or another crawl session.

Use single-pass collection only for targeted debugging, retries, or explicitly small collection tasks:

```bash
pnpm ncl market-sources collect --market-id <MARKET_ID> --json
```

Default website/docs collection collects up to 25 pages per source at depth 2 per pass. Optionally set tighter page and depth limits for quick tests or targeted retries:

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

Current collection support is intentionally narrow. `exact_url` sources fetch one page. `website` and `docs` sources run a same-origin, HTML-only bounded crawl with default bounds of 25 pages per source and depth 2, and store one document per page. The crawler normalizes discovered URLs by removing fragments and non-root trailing slashes before queueing/storing, skips common low-value paths such as careers, privacy, legal, contact, login/signup, demo/request-demo/book-a-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom pages; it does not skip pricing pages. It prioritizes high-value paths such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API pages when crawl bounds cut off the run. Crawled HTML with less than 300 characters of extracted text is skipped as `low_quality_content`. Skipped/frontier URLs are persisted for later audit, but large arrays are omitted unless `--include-skipped` or `--include-frontier` is supplied with bounded limits. Open frontier rows are deduplicated by market, source, and normalized URL, so repeated bounded crawls keep one open work item per URL while preserving historical audit rows. `max_pages` and `max_depth` rows are treated as open frontier context, and `--continue-frontier` fetches those persisted frontier URLs before returning to roots. In continuation summaries, `frontier_urls_loaded` means open frontier rows loaded into the queue, `frontier_urls_attempted` means loaded frontier rows actually processed before crawl limits stopped the run, and `frontier_urls_updated` means loaded frontier rows whose status changed after an attempted fetch. Loaded frontier rows that are not attempted because the run hits `max_pages` stay open for later continuation. `--refresh-stale` recollects only active sources whose latest fetched document is older than `--stale-days`, and reports fresh sources in `skipped_sources`; `--refresh-all` recollects all active sources. Crawl-context diagnostics are computed on read from stored facts; they are not recommendations and should not replace agent judgment. Other valid source types such as `blog`, `rss`, `search_query`, `slack`, and `manual` should be reported as unsupported for collection v1, not treated as exact URLs.

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

If evidence is weak, stale, conflicting, or unknown, keep the candidate review state unchanged and mark uncertainty in metadata instead of overstating certainty:

```json
{
  "metadata": {
    "stable_key": "capability:runtime_ai_monitoring",
    "uncertainty": {
      "status": "weak_evidence",
      "reasons": ["single_source", "vendor_claim_only"],
      "note": "Only one official product page supports this candidate.",
      "marked_by": "agent"
    }
  }
}
```

Valid uncertainty statuses are `unknown`, `weak_evidence`, `conflicting`, and `stale`. Use `unknown` when the agent cannot resolve an important point from stored evidence, `weak_evidence` when support exists but is thin or vendor-only, `conflicting` when stored evidence disagrees, and `stale` when evidence may no longer reflect the current market.
`market-candidates validate`, `import`, and `update` reject unsupported uncertainty statuses or malformed uncertainty fields, so fix metadata errors before importing.

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

Audit output may include `suggested_uncertainty` for stale or weak evidence. This is read-only and does not mutate candidate metadata. If the uncertainty should be durable, update the candidate payload with `metadata.uncertainty` before review.

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
Accepted candidate uncertainty is included in map output when present.

Generate a Markdown market report from accepted candidates:

```bash
pnpm ncl market-candidates report --market-id <MARKET_ID> --json
pnpm ncl market-candidates report --market-id <MARKET_ID> --output-file /private/tmp/<market>-report.md --json
```

The report command is read-only and uses accepted candidates only. It creates a strategy-grade scaffold with market definition, companies, products/solutions, buyer problems, capabilities, relationship matrix when available, evidence confidence/gaps, and an evidence appendix. It omits empty sections instead of printing placeholder text.

The agent authors the final strategy narrative in the same Markdown file. Do not create a separate narrative report. Use the generated report as the evidence-backed scaffold, then edit/expand that file with concise product-strategy prose grounded in accepted candidates and stored evidence.

Before writing relationship-heavy report sections, persist durable company/product-to-capability judgments as accepted `claim` candidates. Use relationship metadata like:

```json
{
  "candidate_type": "claim",
  "name": "Example Vendor provides runtime monitoring",
  "summary": "Example Vendor is associated with runtime monitoring capability.",
  "confidence": "medium",
  "evidence": [{ "document_id": "mdoc_...", "quote": "...", "note": "Relationship evidence" }],
  "metadata": {
    "relationship": {
      "type": "company_capability",
      "subject_candidate_id": "mcand_company_or_product",
      "object_candidate_id": "mcand_capability",
      "label": "Provides runtime monitoring"
    }
  }
}
```

Then validate/import/review those claims before regenerating the report. The company-capability matrix is built only from accepted relationship claims; do not imply relationships in the matrix that were not persisted and accepted. Accepted candidate uncertainty appears in the report so weak, stale, conflicting, or unknown intelligence stays visible.

Suggested review notes:

- Capabilities: `Accepted by user review: capability matches market boundary.`
- Companies/products: `Accepted by user review: <type> is in scope for the market.`
- Vendor claims: `Accepted by user review as vendor-reported claim; not independently verified.`
- Broad platforms: `Accepted by user review: product includes in-scope capability; <adjacent feature> is adjacent to the market boundary.`

Report to the user in market-research terms:

- core companies and products covered
- main buyer problems and capabilities identified
- important company-capability relationships persisted
- boundary cases, weak evidence, or gaps
- report file path when written

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
