# Technical Implementation

## Summary

This repo is a thin NanoClaw fork with a market intelligence subsystem added inside the existing TypeScript/SQLite/CLI architecture.

The first product surface is the local `ncl` CLI. Messaging integrations can come later through NanoClaw's existing channel model, but v1 should make the CLI reliable for humans and coding agents.

Current implementation direction:

- Keep the fork close to NanoClaw where practical.
- Use the existing SQLite database and migration system for local-first market state.
- Store fetched evidence before extraction.
- Store reviewable `market_candidates` as the source of truth for accepted intelligence.
- Compute market overview output from accepted candidates instead of introducing durable facts or market-map tables too early.
- Keep source collection bounded, auditable, and explicit about unsupported source types.

## Core Model

The market subsystem has a normalized core. The core is more than a database shim: it is the domain layer that keeps evidence, extraction, review, and reporting consistent across source types.

The core responsibilities are:

- Define market workspaces and boundaries.
- Normalize source material into stored evidence documents.
- Preserve provenance and run history.
- Extract proposed market candidates from stored documents.
- Keep accepted, proposed, and rejected intelligence separate.
- Support deterministic candidate identity and change review through optional candidate `metadata.stable_key` values.
- Provide read-only market overview commands from accepted candidates.
- Expose stable CLI and internal APIs so future skills/connectors do not invent their own schema.

Current main records:

- `markets`: user-defined market workspaces.
- `market_boundaries`: inclusions, exclusions, adjacent markets, and notes.
- `market_source_proposals`: reviewable source URLs found by agents before they become active sources.
- `market_sources`: research surfaces the agent is allowed to inspect.
- `market_runs`: auditable collection or extraction attempts.
- `market_search_runs`: durable memory of external searches performed by an agent.
- `market_documents`: retrieved evidence artifacts.
- `market_candidates`: reviewable companies, products, problems, capabilities, categories, and claims.

## Guided Setup

First-run market setup is an agent-facing CLI orchestration workflow, not a separate data model. The agent conducts the conversation, writes a setup JSON payload, dry-runs it, asks the user to confirm inferred values, and then applies it.

`markets setup` applies existing primitives in one validated operation:

- create a `market`
- optionally upsert `market_boundaries`
- add explicit `market_sources`
- report duplicate/skipped source URLs and next actions

The setup payload currently stores no independent setup profile. Seed companies should become evidence-backed `market_candidates` later. The default analysis lens is product strategist and can be captured in boundary notes when useful. Market maps remain continuously improvable and do not track completion.

## Source And Document Semantics

`market_sources` are research surfaces or collections the agent is allowed to investigate. They are not always exact URLs to fetch.

`market_documents` are individual evidence artifacts captured from a source.

```text
market_source = where the agent is allowed to look
market_run = one auditable collection attempt
market_document = one retrieved evidence artifact
```

Source types should stay explicit:

- `website`
- `docs`
- `blog`
- `rss`
- `search_query`
- `slack`
- `exact_url`
- `manual`

Avoid generic `url` as a long-term source type. Use `exact_url` only when the user really means one deterministic artifact, such as a pricing page, PDF, launch post, or test URL.

A `market_document` should represent one retrieved content unit:

- docs crawl: one page per document
- website crawl: one page per document
- blog: one post or article per document
- RSS: one feed entry or article per document
- Slack: one message or thread per document
- search: one fetched result page per document
- PDF or report: one PDF as a document, with chunking handled later if needed
- manual upload or note: one provided artifact as a document

Extraction and categorization should operate on stored `market_documents`, not directly on live URLs.

## Candidate Identity And Change Detection

Accepted `market_candidates` remain the source of truth. The system does not promote candidates into durable facts or market-map tables yet.

Agents should attach a deterministic `metadata.stable_key` when they generate candidates. Recommended convention:

```text
<candidate_type>:<lower_snake_case_concept>
```

Examples:

- `company:example_vendor`
- `capability:runtime_ai_monitoring`
- `problem:prompt_injection_in_code_agents`

The CLI exposes accepted candidate keys so agents can reuse stable identities before generating follow-up candidate payloads.

Change detection is read-only and compares proposed candidates against accepted candidates. Matching order is:

1. `metadata.stable_key`
2. normalized `candidate_type + name`

The command classifies proposed candidates as `new`, `duplicate`, or `changed`, and reports changed fields such as name, summary, confidence, evidence, and metadata. It supports action-focused filters such as `--classification changed`, `--classification duplicate`, and `--missing-stable-key true`. Each item includes a deterministic `recommended_action` so agents can turn the output into a review work queue. It does not perform fuzzy semantic matching, does not use an internal LLM, and does not mutate accepted review state.

## Source Proposal Rules

External agents may use their own search tools. This repo stores their URL findings as source proposals so discovery remains auditable and reviewable.

A source proposal records:

- URL.
- explicit source type.
- trust tier suggestion.
- title, snippet, rationale, discovery method, and search query when available.
- optional proposed entity name/type.
- status: `proposed`, `accepted`, or `rejected`.
- optional link to the `market_source` created when accepted.

Proposal import validates URL, source type, and rationale. Generic `url` is rejected. Imports dedupe against already imported proposals and active market sources by normalized URL.

Accepted proposals become ordinary `market_sources`; rejected proposals do not create sources. Once accepted, proposal-discovered sources have the same collection behavior and operational weight as user-provided sources, with provenance preserved through the proposal row and source notes.

## Search Context And Memory

The repo does not perform web search internally. Instead, it gives external agents context for deciding what to search and durable memory of what they searched.

`market-search context` is read-only. It summarizes the market boundary, source/proposal/document/candidate counts, accepted candidate themes, gaps, recent searches, stale searches, and suggested search directions. It should not impose a rigid coverage schema such as one docs page or one product page per company.

`market-search record` stores one external search attempt in `market_search_runs`: query, intent, rationale, result summaries, notes, and searched timestamp. Results are flexible JSON so the agent can record proposed, ignored, rejected, or no-useful-result outcomes without forcing them into source proposals.

`market-search history` groups prior searches by normalized query and classifies them with deterministic recency guidance:

- searched within 14 days: `deprioritize_recent`
- searched 15-59 days ago: `neutral`
- searched 60+ days ago: `consider_refresh`

Agents should use this guidance to avoid repeating recent searches and to refresh stale themes, but it is advisory rather than a hard block.

## Collection Rules

Collection must be bounded and auditable.

A collection run should record:

- source and source type
- visited count
- stored document count
- unchanged document count
- failed count
- unsupported count
- skipped count and skip reasons when implemented
- persisted crawl frontier/skipped URL rows for audit and later continuation work
- run status and summary

Current v1 support:

- `exact_url` collection.
- same-origin, HTML-only bounded collection for `website` and `docs` sources.
- page-level evidence storage for crawled pages.
- crawl bounds via `--max-pages` and `--max-depth`.
- skipped URL reporting for duplicate, out-of-scope, unsupported content type, max-pages, max-depth, invalid URL, excluded low-value path, and low-quality content cases.
- persisted `market_crawl_urls` rows for skipped/frontier crawl URLs with reason, depth, discovered-from URL, priority score, and status.
- compact collection/run/context outputs by default, with bounded drill-down via `--include-frontier --frontier-limit <N>` and `--include-skipped --skipped-limit <N>`.
- `market-runs get <RUN_ID>` for run inspection, parsed summary, failed URLs, skip counts, and optional bounded skipped/frontier rows.
- `market-sources crawl-context --market-id <MARKET_ID>` for agent-readable crawl freshness/completeness context without choosing the crawl plan.
- crawl-context `diagnostics` are computed on read from stored run/document/crawl URL facts, include evidence, and avoid severity, scores, suggested actions, or recommendations.
- crawl URL normalization removes fragments and non-root trailing slashes before queueing/storing to avoid duplicate page variants.
- open crawl frontier rows are deduplicated by `market_id`, `source_id`, and normalized URL, with a partial unique index for `status = 'open'`; historical skipped/fetched/failed/superseded rows remain available for audit.
- default low-value path filtering for pages such as careers, jobs, privacy, terms, legal, cookies, contact/contact-us, login/signin/signup/sign-up/register, demo/book-a-demo/request-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom.
- default high-value path prioritization for pages such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API.
- minimum extracted text filtering for crawled HTML pages; pages under 300 characters are skipped as `low_quality_content`.
- browser-like fetch headers for ordinary pages.
- unchanged-content detection by `source_id`, canonical URL, and `content_hash`.
- unsupported responses for valid source types that are not implemented yet.

Known v1 tradeoff: `--failed-only` still relies on document rows. If a failed source later fetches unchanged content matching an older fetched document, no new fetched row is created. Revisit this only if it becomes real workflow pain.

Known v1 crawl-context tradeoff: frontier/skipped rows are persisted and `--continue-frontier` can continue open `max_pages`/`max_depth` URLs. `--refresh-stale` can recollect stale sources and `--refresh-all` can recollect all active sources, but source-specific continuation/refresh filters such as `--source-id` are not implemented yet. Agents should use crawl context to decide whether to collect normally, continue frontier, refresh stale evidence, inspect documents, or propose better source URLs.

Near-term source expansion:

- RSS.
- manual evidence import.
- Slack connector.

## Skills And Connectors

Skills should plug into the core through narrow interfaces.

Connector skills add input or output capabilities. Examples:

- web search connector
- curated URL connector
- Slack connector
- RSS connector
- Google Drive connector
- SEC filings connector

Connector skills should produce normalized evidence and should not directly create companies, capabilities, claims, or market-map relationships.

Behavior skills customize extraction, scoring, ranking, and reporting. Examples:

- product strategist lens
- buyer evaluation lens
- investor landscape lens
- competitor monitoring lens
- enterprise-readiness scoring lens

Behavior skills may understand market concepts, but they should use defined extension points rather than editing arbitrary database tables.

Design rule:

- Source and connector skills produce normalized evidence.
- The core turns evidence into market intelligence.
- Behavior skills tune extraction, scoring, ranking, and reporting.

## Current CLI Workflows

Implemented workflows:

- create/list/get markets
- upsert market boundaries
- add/list market sources
- import/list/get/review source proposals and accept them into market sources
- collect `exact_url` evidence into documents
- list/get documents, including compact list output
- search stored fetched documents with compact excerpts, exact phrase matching, and light normalized-token fallback
- validate market candidate JSON without mutating state
- import market candidates from JSON
- dedupe candidate imports when requested
- audit candidates with deterministic quality guardrails
- update candidate extracted content without changing review status
- list/filter candidates, including compact output
- summarize candidate status/type/confidence counts
- list accepted candidate identity keys for reuse across extraction runs
- compare proposed candidates against accepted candidates for read-only change review
- review candidates singly or in batches
- compute a read-only market candidate map from accepted candidates
- generate and optionally save a read-only Markdown market report from accepted candidates

Important current design choice:

- Accepted `market_candidates` are the source of truth.
- Do not add separate durable `market_facts` or `market_map` tables until duplication, canonical naming, relationship editing, recategorization history, or stable report generation creates real pain.

## Testing

Follow test-driven development for behavior changes.

Expected checks:

- Focused tests with `pnpm exec vitest run <test files>`.
- Typecheck with `pnpm run typecheck`.
- Full suite with `pnpm test`.

The full suite may need to run outside the sandbox because subprocess-based tests can fail under restricted IPC.

For market behavior, prefer tests around:

- CLI response shape for agent-driven `--json` use.
- DB helper behavior and migrations.
- no-guessing constraints, especially evidence requirements.
- review state transitions.
- source collection audit output.
- read-only overview generation from accepted candidates.

## Assumptions

- First version is single-user and local-first.
- First version is generic across user-defined markets.
- No web dashboard in v1.
- No messaging interface in v1, but keep room for Slack, WhatsApp, and similar channels later.
- Market outputs must be evidence-backed.
- Important changes are proposed for review before becoming accepted state.
