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

## P1 - Review States For Unknowns, Conflicts, And Staleness

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

## P2 - Slack Connector

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
