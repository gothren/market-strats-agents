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

## P1.0 - Market Research Language Layer

Goal:

- Make all default user-facing summaries use market-research language.

Context:

- Product strategists care about companies, products/solutions, buyer problems, capabilities, market boundaries, confidence, and gaps.
- Internal concepts such as sources, candidates, extraction runs, proposal states, audit findings, ids, and JSON payloads are useful for agents and debugging, but they should not dominate normal chat output.

Implementation notes:

- Update `AGENTS.md` manual workflow guidance so after each step the agent reports market concepts first.
- CLI ids, run ids, counts by internal status, and audit internals should be omitted unless the user asks for traceability, debugging, or exact command output.
- Preferred summaries should look like: "I found 5 core companies, 6 products, 3 recurring capabilities, 2 buyer problems, and 4 boundary cases."
- Replace "candidate/source/proposal/extraction" wording in default next actions with "companies to research", "evidence gathered", "problems/capabilities found", "boundary cases to decide", and "market report".

Acceptance:

- A tester agent can run setup, crawling, extraction, review, and reporting while keeping normal chat output readable to a product strategist.
- The user does not need to understand source proposals, market candidates, review states, extraction runs, or audit internals to follow progress.
- Internal terminology appears only when useful for traceability or when explicitly requested.

## P1.1 - Serious Default Crawl Workflow

Goal:

- Make the default manual crawl workflow serious enough for real market research.

Context:

- The current low-level `collect` defaults are intentionally bounded, but they feel like testing parameters in the main product workflow.
- `market-sources crawl-session` is already implemented and described in `AGENTS.md`; it should be the preferred user-facing crawl action.

Implementation notes:

- Update specs and `AGENTS.md` so when a user says "crawl", "fetch evidence", or "research these companies", the agent defaults to:
  - `pnpm ncl market-sources crawl-session --market-id <MARKET_ID> --max-minutes 10 --max-pages 200 --json`
- Keep `market-sources collect` documented as a lower-level targeted/debug/test command.
- The crawl session should run an initial collection pass and continue persisted frontier within the budget. If it stops because of time/page budget or low progress, the agent should say whether the evidence is sufficient for analysis or whether another serious crawl session is worthwhile.
- The user should not need to repeatedly prompt "do more crawling" before analysis is credible.

Acceptance:

- A fresh agent following docs uses `crawl-session` for normal market research crawls.
- The crawl summary tells the user which companies now have useful evidence, which still look thin, and whether the agent recommends extracting intelligence or crawling further.
- Low-level crawl counters remain available for debugging, but the default user summary is concise.

## P1.2 - Strategy-Grade Market Report

Goal:

- Make generated market reports useful strategy artifacts rather than database-shaped Markdown.

Context:

- The current report blends companies and products in one table, duplicates same-name company/product rows without explanation, and includes empty placeholder sections.
- Users expect synthesis: who is in the market, what problems they target, what capabilities recur, where the boundaries are, and what is uncertain.

Implementation notes:

- Update the report backlog/spec so the Markdown report contains:
  - executive summary.
  - market definition.
  - core companies researched.
  - products/solutions.
  - buyer problems.
  - solution capability map.
  - company-by-capability matrix.
  - adjacent/boundary cases.
  - evidence confidence and gaps.
  - evidence appendix.
- Omit empty sections such as "No accepted claims yet."
- Separate companies from products. If a company and product have the same name, label them clearly or avoid duplicate row presentation.
- Keep candidate ids and document ids in the evidence appendix or optional debug output, not as the main report texture.
- Include adjacent/boundary cases when useful, but distinguish them from core market participants.

Acceptance:

- The Automated Pen Testing report separates companies from products and does not confusingly duplicate Tenzai or XBOW.
- Empty placeholder sections are omitted.
- A reader can understand the market's companies, solutions, problems, and recurring capabilities without knowing the candidate data model.
- Evidence-backedness remains visible through an appendix.

## P1.3 - Boundary Case Review UX

Goal:

- Present doubtful market-fit decisions as product strategy review, not lifecycle-state review.

Context:

- Boundary cases such as Cobalt, Picus, and AttackIQ were technically represented as proposed candidates with uncertainty, but that language is not natural for the user.
- The user needs to decide whether a company/product is core, adjacent, excluded, or needs more evidence.

Implementation notes:

- Refactor source/candidate auto-approval guidance so user-facing review packets show:
  - company/product.
  - recommended classification: core, adjacent, exclude, or needs more evidence.
  - short rationale.
  - strongest evidence.
  - what accepting or excluding changes in the market map/report.
- Keep existing candidate/source review commands; this item is about presentation and workflow unless testing proves command support is insufficient.
- Boundary decisions should not be silently accepted unless clearly in scope and evidence-backed.

Acceptance:

- A tester agent presents Cobalt, Picus, and AttackIQ-style cases as strategic boundary decisions.
- The user can decide without understanding proposed/accepted/rejected candidate mechanics.
- Review outcomes still mutate the underlying source/candidate state correctly.

## P1.4 - Auto-Approval Policy Refinement

Goal:

- Refine source and candidate auto-approval policy after the UX language/report/crawl changes land.

Context:

- Source proposals, candidate validation, audit, review, uncertainty, and change detection already exist.
- Policy refinement is still useful, but lower priority than making the workflow understandable to users.

Implementation notes:

- Test with another agent on real source-search and extraction/review workflows.
- Add examples for auto-accept, auto-reject, and ask-user cases where testers find ambiguity.
- Refine guidance around official docs/websites, third-party sources, private/internal sources, duplicates, vendor-only evidence, single-evidence candidates, uncertainty, and category judgment.

Acceptance:

- A tester agent can search, crawl, extract, and review while asking the user only for doubtful market judgment.
- Accepted intelligence remains evidence-backed.
- Doubtful companies/products/problems/capabilities are not silently accepted.

## P1.5 - Manual Workflow Tester Scenario

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
