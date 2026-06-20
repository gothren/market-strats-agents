# Technical Implementation

## Summary

This repo is a NanoClaw fork with a market intelligence subsystem. The product is agent-first: users talk to an agent, and the agent uses durable CLI tools and database state to operate the market workflow.

The product must support two operating modes:

- manual / user prompt-driven workflows through Codex, Claude Code, or similar agent sessions.
- autonomous NanoClaw workflows through Slack, WhatsApp, email, terminal, or other configured channels.

Core implementation principles:

- CLI provides context; agent decides.
- Persist all important market state in SQLite so work survives agent restarts.
- Reuse NanoClaw for autonomous agent execution, scheduling, channels, and integrations.
- Store fetched evidence before extraction.
- Store reviewable `market_candidates` as the source of truth for accepted intelligence.
- Compute market overview and reports from accepted candidates; do not add durable facts or market-map tables yet.
- Keep source collection bounded, auditable, and explicit about unsupported source types.
- Keep user-facing summaries market-research oriented. CLI/data-model terms such as source proposals, candidates, accepted/proposed states, run ids, and audit findings are implementation details unless the user asks for traceability.

## Architecture Roles

### Market Core

The market core is the domain layer that normalizes market state and keeps evidence, extraction, review, and reporting consistent.

Core responsibilities:

- Define market workspaces and boundaries.
- Store source proposals, sources, runs, documents, searches, candidates, and reviews.
- Normalize source material into stored evidence documents.
- Preserve provenance and run history.
- Keep proposed, accepted, and rejected intelligence separate.
- Support deterministic candidate identity with optional `metadata.stable_key`.
- Surface read-only context for agents to decide next actions.
- Generate read-only overviews and reports from accepted candidates.

### Agent

The agent is responsible for judgment and workflow orchestration.

The agent should:

- guide user conversations.
- choose when to search, crawl, extract, review, or report.
- use external/web search tools when needed.
- write source proposal and candidate payloads.
- decide low-ambiguity auto-approval according to documented policy.
- ask the user only when it has doubts.
- record searches and summarize actions in terms of companies, products/solutions, buyer problems, capabilities, market boundaries, confidence, and gaps.

The CLI should not decide the next market-improvement action. It should provide compact factual context and durable mutation commands.

### NanoClaw

NanoClaw should provide the autonomous substrate:

- scheduled or periodic agent execution.
- communication channels such as Slack, WhatsApp, and email where available.
- inbound user prompts and outbound agent messages.
- future integration configuration.
- future budget/token limits if supported or implemented in this fork.

## Current Main Records

- `markets`: user-defined market workspaces.
- `market_boundaries`: inclusions, exclusions, adjacent markets, and notes.
- `market_source_proposals`: reviewable source findings before they become active sources.
- `market_sources`: research surfaces the agent is allowed to inspect.
- `market_runs`: auditable collection or extraction attempts.
- `market_search_runs`: durable memory of external searches performed by an agent.
- `market_documents`: retrieved evidence artifacts.
- `market_candidates`: reviewable companies, products, problems, capabilities, categories, and claims.
- `market_crawl_urls`: persisted skipped/frontier crawl URL facts for audit and continuation.

No separate setup profile, durable fact table, or durable market-map table should be added yet.

## Manual Mode Implementation

Manual mode is chat-driven. The user works with Codex, Claude Code, or another agent that can run `pnpm ncl ... --json`.

The implementation should support this loop:

1. Guided setup.
   - Agent asks for missing market details.
   - Agent writes setup JSON and runs `markets setup`.
   - CLI creates market, boundaries, and seed sources.

2. Source discovery.
   - Agent reads `market-search context` and `market-search history`.
   - Agent searches externally.
   - Agent records search attempts with `market-search record`.
   - Agent imports findings through `market-source-proposals import`.
   - Agent auto-approves or asks for review based on doubt policy.

3. Evidence collection.
   - Agent runs `market-sources crawl-session` for normal market research crawls.
   - Agent uses `market-sources collect` only for targeted, debug, test, or explicitly bounded collection.
   - Agent uses `market-sources crawl-context` and `market-runs get` for factual crawl state.
   - Agent chooses serious crawl session, targeted collection, stale refresh, or source improvement.

4. Evidence inspection and extraction.
   - Agent uses `market-documents list/get/search`.
   - Agent writes evidence-backed candidate JSON.
   - Agent runs `market-candidates validate` and `market-candidates import`.

5. Review and auto-approval.
   - Agent runs `market-candidates audit`, `changes`, `summary`, and `keys`.
   - Agent auto-accepts low-ambiguity candidates.
   - Agent asks the user to review doubtful candidates.

6. Reporting and Q&A.
   - Agent runs `market-candidates map` or `market-candidates report`.
   - Agent writes reports to disk when requested.
   - Agent answers ad-hoc questions from accepted candidates and stored evidence.

After each manual step, `AGENTS.md` should instruct the agent to summarize the result in market-research language and present sensible next options. Internal ids, raw counts by implementation status, and audit internals should be omitted unless useful for debugging or requested by the user.

## Autonomous Mode Implementation

Autonomous mode uses NanoClaw as the basis. The user configures an agent instance and talks to it through configured channels.

The autonomous implementation should eventually add or configure:

- active market selection and prioritization across markets.
- periodic source discovery for all active markets.
- periodic source collection and stale refresh.
- periodic evidence extraction and candidate review.
- periodic report generation and delivery.
- non-blocking user question queues for doubtful sources/candidates.
- token/budget limits, ideally daily.
- channel delivery for questions, status updates, and reports.

Autonomous work should use the same market CLI/core commands as manual mode. The difference is orchestration and cadence, not a separate data model.

Autonomous work must not block all progress while waiting for user review. Doubtful items should remain proposed or pending review while the agent continues other safe work.

## Source And Document Semantics

`market_sources` are research surfaces or collections the agent is allowed to inspect. They are not always exact URLs to fetch.

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

Avoid generic `url` as a source type. Use `exact_url` only when the user really means one deterministic artifact, such as a pricing page, PDF, launch post, or test URL.

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

Accepted proposals become ordinary `market_sources`; rejected proposals do not create sources. Rejected proposals remain useful memory so the agent does not repeatedly surface low-quality findings.

## Search Context And Memory

The repo does not perform web search internally. It gives external agents context for deciding what to search and durable memory of what they searched.

`market-search context` is read-only. It summarizes market boundary, source/proposal/document/candidate counts, accepted candidate themes, gaps, recent searches, stale searches, and suggested search directions. These are context fields, not a plan that the CLI is choosing.

`market-search record` stores one external search attempt in `market_search_runs`: query, intent, rationale, result summaries, notes, and searched timestamp. Results are flexible JSON so the agent can record proposed, ignored, rejected, or no-useful-result outcomes.

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
- skipped count and skip reasons
- persisted crawl frontier/skipped URL rows for audit and later continuation
- run status and summary

Current v1 support:

- `exact_url` collection.
- same-origin, HTML-only bounded collection for `website` and `docs` sources.
- page-level evidence storage for crawled pages.
- crawl bounds via `--max-pages` and `--max-depth`.
- `market-sources crawl-session` for serious manual research crawls. A crawl session runs collection and persisted-frontier continuation within a time/page budget and should be the preferred user-facing crawl command.
- skipped URL reporting for duplicate, out-of-scope, unsupported content type, max-pages, max-depth, invalid URL, excluded low-value path, and low-quality content cases.
- persisted `market_crawl_urls` rows for skipped/frontier crawl URLs with reason, depth, discovered-from URL, priority score, and status.
- compact collection/run/context outputs by default, with bounded drill-down via `--include-frontier --frontier-limit <N>` and `--include-skipped --skipped-limit <N>`.
- `market-runs get <RUN_ID>` for run inspection, parsed summary, failed URLs, skip counts, and optional bounded skipped/frontier rows.
- `market-sources crawl-context --market-id <MARKET_ID>` for agent-readable crawl freshness/completeness context without choosing the crawl plan.
- crawl-context diagnostics are computed on read from stored run/document/crawl URL facts, include evidence, and avoid severity, scores, suggested actions, or recommendations.
- crawl URL normalization removes fragments and non-root trailing slashes before queueing/storing.
- open crawl frontier rows are deduplicated by `market_id`, `source_id`, and normalized URL for `status = 'open'`.
- default low-value path filtering for pages such as careers, jobs, privacy, terms, legal, cookies, contact, login/signup, demo/request-demo/book-a-demo, sales/talk-to-sales, get-started, events, webinars, press, and newsroom.
- default high-value path prioritization for pages such as docs, security, product, platform, solutions, customers, case studies, blog, changelog, integrations, pricing, developers, and API.
- minimum extracted text filtering for crawled HTML pages; pages under 300 characters are skipped as `low_quality_content`.
- unchanged-content detection by `source_id`, canonical URL, and `content_hash`.
- unsupported responses for valid source types that are not implemented yet.

Known v1 tradeoff: `--failed-only` still relies on document rows. If a failed source later fetches unchanged content matching an older fetched document, no new fetched row is created. Revisit this only if it becomes real workflow pain.

Known v1 crawl-context tradeoff: frontier/skipped rows are persisted and `--continue-frontier` can continue open `max_pages`/`max_depth` URLs. `crawl-session` packages that continuation into the normal manual workflow. `--refresh-stale` can recollect stale sources and `--refresh-all` can recollect all active sources, but source-specific continuation/refresh filters such as `--source-id` are not implemented yet.

For real market research, agents should prefer `crawl-session` defaults such as `--max-minutes 10 --max-pages 200` over the lower-level `collect` defaults. Smaller `collect --max-pages/--max-depth` runs are appropriate for tests, debugging, or narrow follow-up collection, not the main user-facing crawl.

## Candidate Identity, Review, And Uncertainty

Accepted `market_candidates` remain the source of truth. The system does not promote candidates into durable facts or market-map tables yet.

Agents should attach deterministic `metadata.stable_key` values when they generate candidates. Recommended convention:

```text
<candidate_type>:<lower_snake_case_concept>
```

Change detection is read-only and compares proposed candidates against accepted candidates. Matching order is:

1. `metadata.stable_key`
2. normalized `candidate_type + name`

The command classifies proposed candidates as `new`, `duplicate`, or `changed`, reports changed fields, supports filters, and includes deterministic `recommended_action` context. This output is a work queue input for the agent; it does not mutate accepted review state.

Candidate uncertainty is represented in `market_candidates.metadata_json.uncertainty`, not as a separate table or review status. Candidate lifecycle remains `proposed`, `accepted`, or `rejected`.

Supported uncertainty statuses:

- `unknown`: important details are not resolved by stored evidence.
- `weak_evidence`: evidence exists but is thin, vendor-only, low-confidence, or otherwise not strong.
- `conflicting`: stored evidence disagrees.
- `stale`: evidence may no longer reflect the current market.

Candidate validation, import, and update reject unsupported uncertainty statuses or malformed uncertainty fields. Candidate list/get, read-only market maps, and Markdown reports surface parsed uncertainty. Candidate audit can suggest `weak_evidence` or `stale` uncertainty from deterministic checks, but suggestions are read-only and do not mutate metadata.

## Auto-Approval And Doubt Policy

The first implementation of auto-approval should live in agent instructions, not in a smart CLI planner.

The agent may auto-approve a source proposal when:

- source appears official or otherwise clearly trusted.
- source is clearly in-scope for the market boundary.
- source type is explicit and supported or intentionally accepted for future unsupported collection.
- proposal is not a duplicate of an accepted source or prior proposal.

The agent should ask the user about a source when relevance, trust, source type, duplication, privacy, or boundary fit is ambiguous.

The agent may auto-accept a candidate when:

- validation passes.
- audit has no medium/high findings.
- evidence quotes match stored documents.
- confidence is medium or high.
- there is no `unknown`, `weak_evidence`, `conflicting`, or `stale` uncertainty.
- market fit is clear.

The agent should ask the user about a candidate when confidence is low, evidence is weak/stale/conflicting/unknown, audit finds medium/high issues, identity is duplicate or ambiguous, or market/category judgment is needed.

This policy should be documented in `AGENTS.md` and can be revised from tester feedback before becoming hard-coded behavior.

User-facing review of doubtful items should be framed as market judgment, not lifecycle mechanics. For example, an agent should present a company/product as `core`, `adjacent`, `exclude`, or `needs more evidence`, with a short rationale and strongest evidence. Underlying source proposal and candidate states remain the durable implementation mechanism.

## Reporting Semantics

Reports are generated from accepted candidates and stored evidence, but the Markdown output should be shaped as a strategy artifact rather than a raw candidate dump.

Report generation should:

- include an executive summary, market definition, core companies, products/solutions, buyer problems, capabilities, company-by-capability matrix, boundary cases, evidence confidence/gaps, and evidence appendix where data exists.
- omit empty placeholder sections such as "No accepted claims yet."
- separate companies from products instead of mixing both in one table.
- handle same-name company/product pairs by labeling them clearly or avoiding duplicate-looking rows.
- keep candidate ids and document ids mainly in the appendix or traceability sections, not in the main narrative.
- include adjacent or boundary cases when available, clearly separated from core market participants.

## Current CLI Workflows

Implemented workflows:

- create/list/get markets
- guided `markets setup`
- upsert market boundaries
- add/list market sources
- import/list/get/review source proposals and accept them into market sources
- market search context/history/record
- collect `exact_url`, `website`, and `docs` evidence into documents
- serious crawl sessions for manual research crawls
- crawl context, run inspection, frontier continuation, stale refresh, and refresh-all
- list/get/search documents
- validate/import/update/audit/review market candidates
- list accepted candidate identity keys
- compare proposed candidates against accepted candidates for read-only change review
- compute a read-only market candidate map from accepted candidates
- generate and optionally save a read-only Markdown market report from accepted candidates

Near-term missing capabilities:

- market-research language layer in `AGENTS.md` so normal chat output avoids implementation spam.
- strategy-grade Markdown report output with company/product separation, no empty placeholders, and a capability matrix.
- boundary-case review presentation as core/adjacent/exclude/needs-more-evidence.
- validation that agents use `crawl-session` for serious manual crawls rather than low-limit collection defaults.
- autonomous scheduling/prioritization across markets.
- token/budget controls.
- report delivery through configured channels.
- RSS, Slack, and manual evidence connectors.

## Testing

Follow test-driven development for behavior changes.

Expected checks:

- Focused tests with `pnpm exec vitest run <test files>`.
- Typecheck with `pnpm run typecheck`.
- Full suite with `pnpm test`.

For market behavior, prefer tests around:

- CLI response shape for agent-driven `--json` use.
- DB helper behavior and migrations.
- evidence requirements and no-guessing constraints.
- review state transitions.
- source collection audit output.
- crawl session behavior and summaries for serious manual research crawls.
- read-only overview/report generation from accepted candidates, including company/product separation and omitted empty sections.
- validation for metadata, uncertainty, and evidence references.

## Assumptions

- First version is local-first and single-user unless NanoClaw autonomous/channel behavior requires otherwise.
- Product strategist is the default analysis lens for now.
- The CLI is a tool layer, not the primary user experience.
- The agent is responsible for reasoning, prioritization, and user conversation.
- Market outputs must be evidence-backed.
- Important or doubtful changes are proposed for review unless they meet explicit auto-approval policy.
