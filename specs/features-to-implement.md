# Features To Implement

This is the active implementation backlog and prioritized roadmap for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

The current product framing is agent-first: this repo provides durable market tools, CLI workflows, and state for a NanoClaw market strategy agent. Do not build internal LLM extraction until the agent-driven workflow becomes too repetitive or painful.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

Website/docs crawling v1 is already implemented. The active roadmap below prioritizes agent-facing workflows and source acquisition, with broader crawler hardening kept in `Not Prioritized Yet` until the current crawler becomes limiting.

# Active Prioritized Roadmap

## P1 - Web Search Source Discovery

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

## P2 - Evidence-To-Candidate Agent Workflow Support

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

## P3 - Agent-Readable Market Report

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

## P4 - Change Detection For Agent Review

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

## P5 - Guided Market Setup Workflow

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

## P6 - RSS Connector

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

## P7 - Slack Connector

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

## P8 - Review States For Unknowns, Conflicts, And Staleness

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

# Not Prioritized Yet

## Crawler Improvements

Goal:

- Make website/docs collection more complete, configurable, and robust once the simple bounded crawler becomes limiting.

Context:

- Current crawler support is intentionally conservative: same-origin, HTML-only, default `--max-pages 10`, default `--max-depth 1`, simple link extraction, and no browser rendering.
- This is enough for early evidence collection but will miss common source shapes such as sitemaps, PDFs, JS-rendered docs, and cross-subdomain docs links.

Implementation notes:

- Add include/exclude URL patterns for source-specific crawl control.
- Add allowed-domain or allowed-origin expansion so a website source can intentionally include docs/blog subdomains.
- Add robots.txt and sitemap support where useful.
- Add runtime timeout and per-page timeout bounds in addition to page/depth limits.
- Improve content-type handling for PDFs and other high-value documents.
- Parse canonical URLs from HTML metadata when available.
- Consider a browser-backed fetch/render path only if static fetch misses important evidence.
- Add smarter URL prioritization so pricing, docs, security, customers, changelog, blog, and product pages can be fetched before low-value pages.

Acceptance:

- Agent can configure crawl scope precisely without code changes.
- Collection remains bounded and auditable.
- High-value non-HTML or JS-rendered evidence can be captured when explicitly enabled.
- Reports continue to cite page-level or artifact-level documents with clear provenance.

# Ideas

## Feedback Loops

Idea:

- Give the market strategy agent a way to improve from user corrections, rejected candidates, review notes, crawl outcomes, and report feedback.

Possible directions:

- Track recurring reasons for rejected or edited candidates.
- Let the agent summarize lessons from review sessions without silently changing durable market facts.
- Surface source-quality signals such as low-yield crawls, duplicate-heavy sources, stale sources, and high-value evidence sources.
- Use feedback to suggest prompt/workflow updates, source prioritization changes, or extraction heuristics for future runs.
- Keep self-improvement auditable and user-approved rather than automatic.
