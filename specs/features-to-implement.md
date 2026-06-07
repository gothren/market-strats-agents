# Features To Implement

This is the active implementation backlog and prioritized roadmap for the market strategy agent. Remove items once implemented and move durable behavior notes to `technical-implementation.md` or `product-spec.md`.

The current product framing is agent-first: this repo provides durable market tools, CLI workflows, and state for a market strategy agent. The primary product experience is a user talking to an agent; the CLI provides context and mutations, and the agent decides what to do.

Do not build internal LLM extraction or smart CLI planning until the agent-driven workflow becomes too repetitive or painful.

Use this format so coding agents can pick up work without a long planning thread:

- `Goal`: the user-visible capability.
- `Context`: why it matters or what was observed.
- `Implementation notes`: constraints, preferred direction, and known decisions.
- `Acceptance`: what must be true before the item can be removed.

# Epic 1 / Deliverable 1 - Manual Prompt-Driven Workflow

Goal:

- Make the manual chat-driven workflow work well end to end for a product strategist using Codex, Claude Code, or a similar agent with the CLI loaded.

Context:

- The main primitives already exist: guided setup, source proposals, search context/history, collection, crawl context, document search, candidate import/audit/review/change detection, maps, reports, and uncertainty.
- The next gap is product workflow quality: the agent needs clear instructions for step-by-step operation, next-action options, auto-approval, asking only on doubt, and ad-hoc Q&A.
- The CLI should remain a context/tool layer. The agent should do the reasoning.

## P1.1 - Manual Workflow Operating Guide In AGENTS.md

Goal:

- Give agents a clear manual-mode operating loop from market setup through report generation.

Context:

- Current `AGENTS.md` documents individual commands, but the product needs a cohesive user workflow.
- After each meaningful action, the agent should summarize and propose next actions.

Implementation notes:

- Add a concise `Manual Market Workflow` section to `AGENTS.md`.
- Cover the main sequence: setup market, search/propose sources, review/auto-approve proposals, crawl sources, inspect evidence, extract/import candidates, audit/review candidates, generate map/report, answer ad-hoc questions.
- After each step, instruct the agent to report what changed and offer 2-5 sensible next options.
- Keep instructions chat-first and non-technical for the user, while preserving exact CLI commands for the agent.

Acceptance:

- A tester agent can start from "let's add a market" and know the next step after each workflow stage.
- The workflow does not require the user to know CLI command names.
- The agent clearly distinguishes product operation from code implementation.

## P1.2 - Source Proposal Auto-Approval And Doubt Policy

Goal:

- Let the agent approve/reject obvious source proposals and ask the user only when source judgment is ambiguous.

Context:

- Source proposals already support proposed/accepted/rejected states.
- The missing piece is a documented policy for when the agent can act without user review.

Implementation notes:

- Add source proposal policy to `AGENTS.md`.
- Auto-accept official, clearly in-scope, non-duplicate vendor websites/docs/product pages with explicit source type.
- Auto-reject clearly out-of-scope, duplicate, low-quality, old/irrelevant, or generic third-party sources.
- Ask the user when source trust, market fit, privacy/access, source type, or duplication is ambiguous.
- Require the agent to present a recommendation when asking the user.
- Use existing source proposal review commands; do not add new CLI commands for this item unless testing shows current commands are insufficient.

Acceptance:

- A tester agent can search for sources, import proposals, auto-review low-ambiguity proposals, and ask the user only for doubtful ones.
- Accepted proposals become active sources and rejected proposals remain durable memory.
- The agent explains why it auto-accepted, auto-rejected, or asked for review.

## P1.3 - Candidate Auto-Approval And Doubt Policy

Goal:

- Let the agent accept obvious extracted candidates and ask the user only about doubtful candidates.

Context:

- Candidate validation, audit, review, uncertainty, and change detection already exist.
- The missing piece is operational policy for when accepted state can change without user review.

Implementation notes:

- Add candidate review policy to `AGENTS.md`.
- Auto-accept candidates when validation passes, evidence quotes match, confidence is medium/high, audit has no medium/high findings, uncertainty is absent, identity is clear, and market fit is obvious.
- Auto-reject candidates when evidence is missing/invalid, market fit is clearly wrong, or duplicates are already accepted.
- Ask the user when confidence is low, evidence is weak/stale/conflicting/unknown, audit has medium/high findings, identity is ambiguous, or category/boundary judgment is needed.
- Require review notes that state whether the decision was auto-approved by policy or user-reviewed.

Acceptance:

- A tester agent can extract candidates from stored documents, validate/import/audit them, auto-review low-ambiguity candidates, and present only doubtful candidates to the user.
- Accepted candidates remain evidence-backed.
- Doubtful candidates are not silently accepted.

## P1.4 - Continuous Market Improvement Workflow

Goal:

- Give the agent a repeatable manual-mode loop for improving an existing market over time.

Context:

- Users should be able to say "improve this market" after prior searches/crawls/extractions.
- The CLI already exposes search history, market search context, crawl context, candidate audits, changes, maps, and reports.

Implementation notes:

- Add `Continuous Market Improvement` guidance to `AGENTS.md`.
- Instruct the agent to gather context from existing commands, choose one improvement objective, act through existing workflows, summarize the result, and offer next options.
- Improvement objectives may include finding more companies, finding deeper public resources for known companies, refreshing stale sources, continuing open crawl frontier, improving weak/uncertain candidates, resolving review backlog, or generating an updated report.
- Keep the workflow context-first and non-prescriptive: diagnostics are inputs, not CLI recommendations.
- Do not add a `market-improvement suggest` command.

Acceptance:

- A tester agent can follow `AGENTS.md` to improve an existing market without needing new CLI features.
- The agent uses search/crawl/candidate context rather than repeating recent work blindly.
- The workflow helps improve source coverage, evidence freshness, weak/uncertain candidates, and review backlog.

## P1.5 - Ad-Hoc Market Q&A Guidance

Goal:

- Let users ask questions about a market, company, capability, problem, category, source, or evidence item.

Context:

- The CLI already supports document search/get, candidates, maps, and reports.
- The agent needs clearer behavior for answering from stored evidence without guessing.

Implementation notes:

- Add ad-hoc Q&A instructions to `AGENTS.md`.
- Instruct the agent to answer from accepted candidates and stored documents first.
- Require the agent to cite or reference candidate ids, document ids, titles, or report sections where useful.
- If stored evidence is insufficient, the agent should say so and offer next options such as search web, crawl more sources, inspect documents, or create a candidate.
- Keep Q&A read-only unless the user asks to mutate market state.

Acceptance:

- A tester agent can answer a market question using stored state.
- The agent does not invent unsupported answers.
- The agent offers a useful next action when evidence is missing.

## P1.6 - Manual Workflow Tester Script / Scenario

Goal:

- Provide a repeatable manual test scenario for another agent to validate Deliverable 1.

Context:

- The product is agent-operated, so manual validation should test whether an agent can follow the docs, not just whether commands pass.

Implementation notes:

- Add a short tester prompt or scenario to `AGENTS.md` or a spec note.
- Cover setup, source search/proposal review, collection, extraction, candidate review, report generation, and ad-hoc Q&A.
- The scenario should tell the tester agent what to try and what success looks like without requiring code changes.

Acceptance:

- A separate Codex/Claude agent can run the scenario and report whether the manual workflow is understandable.
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
