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
- Provide read-only market overview commands from accepted candidates.
- Expose stable CLI and internal APIs so future skills/connectors do not invent their own schema.

Current main records:

- `markets`: user-defined market workspaces.
- `market_boundaries`: inclusions, exclusions, adjacent markets, and notes.
- `market_source_proposals`: reviewable source URLs found by agents before they become active sources.
- `market_sources`: research surfaces the agent is allowed to inspect.
- `market_runs`: auditable collection or extraction attempts.
- `market_documents`: retrieved evidence artifacts.
- `market_candidates`: reviewable companies, products, problems, capabilities, categories, and claims.

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
- run status and summary

Current v1 support:

- `exact_url` collection.
- same-origin, HTML-only bounded collection for `website` and `docs` sources.
- page-level evidence storage for crawled pages.
- crawl bounds via `--max-pages` and `--max-depth`.
- skipped URL reporting for duplicate, out-of-scope, unsupported content type, max-pages, max-depth, invalid URL, excluded low-value path, and low-quality content cases.
- crawl URL normalization removes fragments and non-root trailing slashes before queueing/storing to avoid duplicate page variants.
- default low-value path filtering for pages such as careers, jobs, privacy, terms, legal, cookies, contact/contact-us, login/signin/signup/sign-up/register, demo/book-a-demo/request-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom.
- default high-value path prioritization for pages such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API.
- minimum extracted text filtering for crawled HTML pages; pages under 300 characters are skipped as `low_quality_content`.
- browser-like fetch headers for ordinary pages.
- unchanged-content detection by `source_id`, canonical URL, and `content_hash`.
- unsupported responses for valid source types that are not implemented yet.

Known v1 tradeoff: `--failed-only` still relies on document rows. If a failed source later fetches unchanged content matching an older fetched document, no new fetched row is created. Revisit this only if it becomes real workflow pain.

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
- import market candidates from JSON
- dedupe candidate imports when requested
- list/filter candidates, including compact output
- summarize candidate status/type/confidence counts
- review candidates singly or in batches
- compute a read-only market candidate map from accepted candidates

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
