# Features To Implement

This is the active implementation backlog and prioritized roadmap for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

The current product framing is agent-first: this repo provides durable market tools, CLI workflows, and state for a NanoClaw market strategy agent. Do not build internal LLM extraction until the agent-driven workflow becomes too repetitive or painful.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

Website/docs crawling v1 and market search context/memory are already implemented. The active roadmap below prioritizes agent-facing workflows and source acquisition, with broader crawler hardening kept in `Not Prioritized Yet` until the current crawler becomes limiting.

# Active Prioritized Roadmap

## P1 - Continuous Market Improvement Agent Workflow

Goal:

- Give the external market strategy agent a repeatable operating loop for improving a market over time without making the CLI choose next actions.

Context:

- The CLI already exposes factual context through market search context/history, crawl context, candidate summaries, audits, changes, maps, and reports.
- The product should keep judgment in the agent. The CLI should provide compact context, not smart recommendations.
- The next gap is agent operating guidance: how to combine existing tools into an improvement cycle.

Implementation notes:

- Add an `AGENTS.md` workflow section for continuous market improvement.
- Instruct the agent to gather context from existing commands, identify one improvement objective, act through existing search/collection/extraction/review workflows, record searches, and repeat.
- Keep the workflow context-first and non-prescriptive: diagnostics are inputs, not recommendations.
- Do not add a new `market-improvement suggest` command or other smart planner CLI for this item.
- Update durable specs if needed to clarify that feedback loops currently mean agent operating guidance plus factual context, not automated self-improvement.

Acceptance:

- A tester agent can follow `AGENTS.md` to run a full improvement loop using existing CLI tools.
- The workflow helps the agent improve source coverage, evidence freshness, weak/uncertain candidates, and review backlog without new CLI intelligence.
- The backlog distinguishes future feedback-loop ideas from this v1 agent operating workflow.

## P2 - Slack Connector

Goal:

- Collect private/internal evidence from Slack when configured.

Context:

- Slack can contain high-signal company or market context, but it has privacy and access implications.
- It is less urgent than the continuous improvement workflow and public-source acquisition.

Implementation notes:

- Treat Slack as a connector skill/source type, not as generic URL fetching.
- Store one message or thread per `market_document`.
- Preserve channel, permalink or connector item id, author where allowed, timestamp, access label, and metadata.
- Keep private-source trust/privacy labels visible.

Acceptance:

- A configured Slack source can produce document-level evidence artifacts.
- Stored Slack documents have clear provenance and privacy/access metadata.
- Missing credentials or permissions produce clear unsupported/failed responses.

## P3 - RSS Connector

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

# Not Prioritized Yet

## Crawler Improvements

Goal:

- Make website/docs collection more complete and configurable once the current bounded crawler plus crawl-context tooling becomes limiting.

Context:

- Current crawler support is intentionally conservative: same-origin, HTML-only, default `--max-pages 10`, default `--max-depth 1`, simple link extraction, persisted skipped/frontier rows, and no browser rendering.
- Implemented already: low-value path filtering, high-value prioritization, minimum text filtering, crawl URL normalization, persisted frontier/skipped rows, compact bounded crawl output, open frontier dedupe, `market-runs get`, `market-sources crawl-context`, `market-sources collect --continue-frontier`, `--refresh-stale`, and `--refresh-all`.
- This is enough for early evidence collection but will miss common source shapes such as sitemaps, PDFs, JS-rendered docs, and cross-subdomain docs links.

Implementation notes:

- Add source-specific collection filters, such as `--source-id`, for continuation and refresh flows.
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
