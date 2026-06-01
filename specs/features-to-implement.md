# Features To Implement

This is the active implementation backlog for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

The current product framing is agent-first: this repo provides durable market tools, CLI workflows, and state for a NanoClaw market strategy agent. Do not build internal LLM extraction until the agent-driven workflow becomes too repetitive or painful.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

## Bounded Website And Docs Crawling

Goal:

- Let the agent collect evidence from website/docs research surfaces, not only exact URLs.

Context:

- This is central to the product: market research usually starts from company websites, docs, blogs, and landing pages.
- `market_sources` already model research surfaces, but collection currently supports only `exact_url`.

Implementation notes:

- Support `website` and/or `docs` source types with bounded same-domain crawling.
- Store one `market_document` per retrieved page/content unit.
- Enforce crawl bounds: max pages, max depth, same-domain or allowed domains, max runtime, content type restrictions, include/exclude patterns if feasible.
- Record skipped URLs and skip reasons where practical.
- Reuse unchanged detection by canonical URL and content hash.

Acceptance:

- A `website` or `docs` source can collect multiple page-level documents.
- Collection run summary reports visited, stored, unchanged, skipped, failed, and unsupported counts where applicable.
- Out-of-scope, duplicate, unsupported, and failed pages are auditable.
- Existing `exact_url` behavior remains unchanged.

## Web Search Source Discovery

Goal:

- Let the agent discover candidate sources and companies through web search.

Context:

- The product must help identify companies in a user-defined market, not only process URLs supplied by the user.
- Search results should be proposed and reviewed, not silently trusted.

Implementation notes:

- Add an agent-friendly workflow for search query sources or source proposals.
- Search output should include URL, title/snippet if available, source type guess, trust tier suggestion, and rationale.
- Do not automatically activate discovered sources unless explicitly accepted.
- Keep provider details abstract enough that the search backend can change later.

Acceptance:

- Agent can run or record a market search query and receive structured source proposals.
- Duplicate source proposals are detected or easy to identify.
- Accepted proposals can become `market_sources` with source type and trust tier metadata.
- Rejected or ignored proposals do not pollute active sources.

## Evidence-To-Candidate Agent Workflow Support

Goal:

- Make it easy for a NanoClaw or external agent to turn stored evidence into reviewable market candidates.

Context:

- The product should not build internal LLM extraction yet.
- The agent should inspect stored documents, reason externally, generate candidate JSON, import/dedupe candidates, and verify/review them.

Implementation notes:

- Do not add internal LLM extraction or provider abstractions.
- Improve tool support around document inspection, candidate JSON validation, import previews, dedupe feedback, and post-import verification.
- Keep extraction based on stored `market_documents`, not live URLs.
- Candidates remain proposed by default and must link to document evidence.

Acceptance:

- Agent can list compact documents, inspect full evidence, produce candidate JSON, validate/import it, and verify imported counts without direct DB queries.
- Invalid candidate payloads fail with actionable errors.
- Imported candidates include evidence references to document ids.
- Existing review commands can handle the resulting candidates.

## Agent-Readable Market Report

Goal:

- Generate a useful Markdown market report from accepted candidates.

Context:

- A read-only candidate map exists, but the product spec calls for a primary Markdown report.
- The report should be computed from accepted `market_candidates`; no durable facts or market-map tables yet.

Implementation notes:

- Add a read-only report command or workflow.
- Include market definition, category map, company/product table, problem-to-solution map, capability map, unknowns/weak evidence, and evidence appendix where possible.
- Do not invent relationships that are not present in accepted candidates/evidence.

Acceptance:

- A command can output and optionally save a Markdown report.
- Report content is based on accepted candidates only by default.
- Evidence references are included for claims and market structure.
- Empty or partial markets produce a useful report with explicit gaps.

## Change Detection For Agent Review

Goal:

- Help the agent identify what changed between evidence/candidate runs.

Context:

- The product spec requires periodic recategorization and market change tracking.
- Since accepted candidates are source of truth, change detection should compare new proposed candidates against accepted candidates before adding durable facts.

Implementation notes:

- Start with candidate-level change summaries, not durable market-map versions.
- Detect likely new companies/products/capabilities/categories/claims and likely duplicates.
- Surface changed positioning or category suggestions as reviewable candidate context.
- Keep uncertainty visible; do not silently rewrite accepted state.

Acceptance:

- Agent can run a command/workflow that summarizes new, duplicate, changed, and possibly stale candidates.
- Output is JSON-friendly and suitable for user review.
- No accepted candidate is modified without explicit review.

## Guided Market Setup Workflow

Goal:

- Make first market setup easy for non-technical users and agent-driven sessions.

Context:

- Market creation and boundary update exist, but the full guided setup flow from the product spec does not.
- The agent needs enough structured context to avoid market drift and unsupported guesses.

Implementation notes:

- Support collecting market name, description, inclusions, exclusions, adjacent markets, seed companies, seed URLs, preferred source types, and analysis lens.
- The tool layer should support saving structured setup data; the agent can handle the conversation.
- Any inferred setup values must be confirmed by the user before durable write.

Acceptance:

- Agent can create a market, set boundary, add seed sources, and report final setup state without ad hoc steps.
- Missing required fields produce clear next actions.
- Existing market get/list output is sufficient to verify setup completion.

## RSS Connector

Goal:

- Collect article-level evidence from RSS feeds.

Context:

- RSS is useful for recurring market monitoring, vendor blogs, release notes, and industry publications.
- It is less urgent than website crawling/search but important for periodic updates.

Implementation notes:

- Support `rss` source collection.
- Store one `market_document` per feed entry/article.
- Preserve feed URL, entry URL, title, published timestamp where available, fetched timestamp, content hash, and metadata.
- Use unchanged detection to avoid duplicate documents across runs.

Acceptance:

- An `rss` source can collect multiple entry-level documents.
- Repeated collection does not duplicate unchanged entries.
- Failed or malformed feed entries are auditable.

## Slack Connector

Goal:

- Collect private/internal evidence from Slack when configured.

Context:

- Slack can contain high-signal company or market context, but it has privacy and access implications.
- It is less urgent than public-source acquisition.

Implementation notes:

- Treat Slack as a connector skill/source type, not as generic URL fetching.
- Store one message or thread per `market_document`.
- Preserve channel, permalink or connector item id, author where allowed, timestamp, access label, and metadata.
- Keep private-source trust/privacy labels visible.

Acceptance:

- A configured Slack source can produce document-level evidence artifacts.
- Stored Slack documents have clear provenance and privacy/access metadata.
- Missing credentials or permissions produce clear unsupported/failed responses.

## Review States For Unknowns, Conflicts, And Staleness

Goal:

- Represent uncertainty explicitly in review workflows.

Context:

- The product spec treats unknowns, conflicts, and stale evidence as first-class output.
- Current candidate statuses are enough for basic review, but not enough for richer market intelligence workflows.

Implementation notes:

- Do not add this until basic candidate/report/change workflows start needing it.
- Prefer extending candidate metadata/review summaries before adding new tables.
- Keep accepted/proposed/rejected behavior backward compatible.

Acceptance:

- Agent can mark or surface weak, conflicting, stale, or unknown intelligence in a structured way.
- Reports can include uncertainty sections without unsupported guesses.
