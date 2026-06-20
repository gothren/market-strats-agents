# Features To Implement

This is the active implementation backlog and prioritized roadmap for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

The current product framing is agent-first: this repo provides durable market tools, CLI workflows, and state for a market strategy agent. The primary product experience is a user talking to an agent; the CLI provides context and mutations, and the agent decides what to do.

Do not build internal LLM extraction or smart CLI planning until the agent-driven workflow becomes too repetitive or painful.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

# Epic 1 / Deliverable 1 - Manual Market Research Workflow UX

Goal:

- Make the manual chat-driven workflow feel like market research for a product strategist, not like operating an internal evidence pipeline.

Context:

- The main primitives already exist: guided setup, source proposals, search context/history, collection, crawl context, document search, candidate import/audit/review/change detection, maps, reports, and uncertainty.
- User testing on the Automated Pen Testing market showed three priority problems:
  - agent output is too spammy and exposes implementation language such as sources, candidates, extraction, accepted/proposed, run ids, and audit internals.
  - default crawling feels like a smoke test; users had to ask repeatedly for a serious crawl.
  - generated reports are too mechanical, duplicate companies/products, and include empty sections such as "No accepted claims yet."
- The CLI should remain a context/tool layer. The agent should do the reasoning.

## P1.0 - Manual Workflow Tester Scenario

Goal:

- Provide a repeatable scenario for another agent to validate the manual workflow as a market research experience.

Context:

- The product is agent-operated, so validation should test whether an agent can produce a useful product-strategy experience, not just whether commands pass.

Implementation notes:

- Add a short tester prompt or scenario to `AGENTS.md` or a spec note.
- Cover setup, company/source discovery, serious crawling via `crawl-session`, extraction into companies/problems/capabilities, boundary-case review, report generation, and ad-hoc Q&A.
- Include success criteria for chat output quality: user sees market concepts first and internal workflow terms only when requested.

Acceptance:

- A separate Codex/Claude agent can run the scenario and report whether the manual workflow is understandable and useful.
- Feedback from the tester can be turned into concrete backlog items.

# Epic 2 / Deliverable 2 - Autonomous NanoClaw Workflow

Goal:

- Support mostly autonomous market monitoring and improvement across markets through NanoClaw, with minimal user prompting.

Context:

- This needs proper planning before implementation.
- The likely scope includes scheduling, cross-market prioritization, token/budget limits, channel delivery, non-blocking review questions, autonomous source discovery, crawling, extraction, review, and periodic reports.
- The autonomous workflow should reuse the same market core and CLI primitives as manual mode.

Implementation notes:

- Do not implement Epic 2 yet without a dedicated planning pass.
- Keep current specs high-level until decisions are made about scheduling, budget control, channel configuration, autonomous run state, and user-question queues.
- Reuse NanoClaw's existing integrations and scheduling/channel model where possible.

Acceptance:

- Epic 2 is considered ready to implement only after a separate autonomous workflow plan is written and reviewed.

# Cross-Cutting / Connector Backlog

These items apply to both manual and autonomous modes. Prioritize them after the manual workflow is reliable unless a connector becomes urgently needed.

## C1 - Manual Evidence Import

Goal:

- Allow the agent/user to add a manually provided evidence artifact as a `market_document`.

Context:

- Manual import is useful for pasted notes, PDFs handled outside the crawler, internal docs, or user-provided evidence.
- It is likely simpler and more immediately useful than Slack/RSS.

Implementation notes:

- Support `manual` source/document creation or a small import command.
- Store one provided artifact as one document with provenance and optional metadata.
- Keep extraction operating on stored documents.

Acceptance:

- A user or agent can store a manual evidence artifact and use it for candidate extraction.
- Manual documents have clear provenance.

## C2 - Slack Connector

Goal:

- Collect private/internal evidence from Slack when configured.

Context:

- Slack can contain high-signal company or market context, but it has privacy and access implications.

Implementation notes:

- Treat Slack as a connector/source type, not as generic URL fetching.
- Store one message or thread per `market_document`.
- Preserve channel, permalink or connector item id, author where allowed, timestamp, access label, and metadata.
- Keep private-source trust/privacy labels visible.

Acceptance:

- A configured Slack source can produce document-level evidence artifacts.
- Stored Slack documents have clear provenance and privacy/access metadata.
- Missing credentials or permissions produce clear unsupported/failed responses.

## C3 - RSS Connector

Goal:

- Collect article-level evidence from RSS feeds.

Context:

- RSS is useful for recurring market monitoring, vendor blogs, release notes, and industry publications.

Implementation notes:

- Support `rss` source collection.
- Store one `market_document` per feed entry/article.
- Preserve feed URL, entry URL, title, published timestamp where available, fetched timestamp, content hash, and metadata.
- Use unchanged detection to avoid duplicate documents across runs.

Acceptance:

- An `rss` source can collect multiple entry-level documents.
- Repeated collection does not duplicate unchanged entries.
- Failed or malformed feed entries are auditable.

## C4 - Crawler Improvements

Goal:

- Make website/docs collection more complete and configurable once the current bounded crawler plus crawl-context tooling becomes limiting.

Context:

- Current crawler support is intentionally conservative: same-origin, HTML-only, default `--max-pages 25`, default `--max-depth 2`, simple link extraction, persisted skipped/frontier rows, and no browser rendering.
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
